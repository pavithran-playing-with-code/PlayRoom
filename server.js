// ─────────────────────────────────────────────────────────────────────────────
//  PlayRoom — Express API Server  v1.0
//  Start:  node server.js   (or press F5 in VS Code)
//  Port:   4321  (React dev server runs on 3333 and proxies /api → here)
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error("❌ JWT_SECRET is missing or too short (need at least 16 chars). Set it in .env before starting.");
  process.exit(1);
}

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const path = require("path");

const errorHandler = require("./middleware/errorHandler");
const db = require("./config/db");
const { initSocket } = require("./config/socket");
const { corsOptions, assertProductionOrigins } = require("./config/cors");

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");
const gameRoutes = require("./routes/games");
const leaderboardRoutes = require("./routes/leaderboard");
const friendsRoutes = require("./routes/friends");

const app = express();
const PORT = process.env.PORT || 4321;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ──────────────────────────────────────────────────────────────────────
// Policy lives in config/cors.js and is shared with the Socket.io hub.
assertProductionOrigins();
app.use(cors(corsOptions));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Trust proxy (fixes express-rate-limit X-Forwarded-For warning)
app.set("trust proxy", 1);

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Three tiers, because one global budget can't serve both "stop brute-forcing
// my login" and "let a game loop poll twice a second".
//
// A single 500/15min bucket used to cover everything, and an in-game client
// burns ~40 req/min (score sync + opponent poll + inbox badge) — so a player
// got 429'd roughly 12 minutes in, mid-match. Worse, the limiter keys on IP, so
// two people on one home connection shared that budget and hit it twice as fast.
const limiter = (max, windowMinutes, message) => rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  // Authenticated users get their own bucket; fall back to IP for anonymous
  // traffic. Without this, everyone behind one NAT shares a budget.
  keyGenerator: (req) => {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) {
      try {
        const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
        if (payload && payload.id) return `u:${payload.id}`;
      } catch { /* fall through to IP */ }
    }
    return `ip:${req.ip}`;
  },
  message: { success: false, message },
});

// Credential endpoints: tight, and IP-keyed by nature (nobody's authenticated yet).
app.use("/api/auth/login",    limiter(20,  15, "Too many login attempts — try again in a few minutes."));
app.use("/api/auth/register", limiter(10,  60, "Too many accounts created — try again later."));
app.use("/api/auth/change-password", limiter(10, 15, "Too many password attempts - try again in a few minutes."));

// The game loop lives here (poll + score sync every few seconds). Generous.
app.use("/api/rooms",         limiter(2000, 15, "Too many requests — please slow down."));

// Everything else.
app.use("/api/",              limiter(600,  15, "Too many requests — please try again later."));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ success: true, status: "OK", version: "1.0.0", timestamp: new Date().toISOString() })
);

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/friends", friendsRoutes);

// ── Serve React production build ──────────────────────────────────────────────
// Dev  → React runs on :3333, proxies /api/* here automatically (package.json proxy)
// Prod → npm run build, then Express serves /build
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "build")));
  app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "build", "index.html")));
}

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: `Not found: ${req.method} ${req.originalUrl}` })
);

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Stale-room sweep ──────────────────────────────────────────────────────────
// Rooms can sit forever after everyone walks away. Sweep every 5 min:
//   • waiting, idle > 60 min          → abandoned
//   • in_progress past its own clock  → finished (the match genuinely ended)
//
// "Idle" means last_activity_at, not created_at. Keying off creation killed
// rooms whose players were actively chatting and picking seats, just because
// the room happened to be opened half an hour ago.
async function sweepStaleRooms() {
  try {
    const [w] = await db.execute(
      `UPDATE rooms SET status = 'abandoned', finished_at = NOW()
        WHERE status = 'waiting'
          AND COALESCE(last_activity_at, created_at) < NOW() - INTERVAL 60 MINUTE`
    );
    // A match is over when its own duration has elapsed. The grace period only
    // covers clock skew — the authoritative end is enforced per-request too.
    const [p] = await db.execute(
      `UPDATE rooms SET status = 'finished', finished_at = NOW()
        WHERE status = 'in_progress'
          AND started_at IS NOT NULL
          AND started_at + INTERVAL (duration_seconds + 60) SECOND < NOW()`
    );
    // Belt and braces: an in_progress room that somehow never got started_at.
    const [o] = await db.execute(
      `UPDATE rooms SET status = 'abandoned', finished_at = NOW()
        WHERE status = 'in_progress' AND started_at IS NULL
          AND COALESCE(last_activity_at, created_at) < NOW() - INTERVAL 2 HOUR`
    );
    if (w.affectedRows || p.affectedRows || o.affectedRows)
      console.log(`🧹 Rooms swept: ${w.affectedRows} idle, ${p.affectedRows} finished, ${o.affectedRows} orphaned`);
  } catch (err) {
    console.error("Stale-room sweep failed:", err.message);
  }
}
if (process.env.NODE_ENV !== "test") {
  setInterval(sweepStaleRooms, 5 * 60 * 1000).unref();
}

// ── Real-time (Socket.io) ───────────────────────────────────────────────────
// Wrap the Express app in an HTTP server so Socket.io can share the port.
// Routes reach the hub via req.app.get("io") to push room/presence events.
const server = http.createServer(app);
const io = initSocket(server);
app.set("io", io);

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀 PlayRoom backend   →  http://localhost:${PORT}`);
  console.log(`   Health check        →  http://localhost:${PORT}/api/health`);
  console.log(`   WebSocket (Socket.io) ready on the same port`);
  console.log(`   React dev server    →  http://localhost:3333  (npm start)\n`);
});

module.exports = app;