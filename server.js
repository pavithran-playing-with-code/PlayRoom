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
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const errorHandler = require("./middleware/errorHandler");
const db           = require("./config/db");

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");
const gameRoutes = require("./routes/games");
const leaderboardRoutes = require("./routes/leaderboard");
const friendsRoutes     = require("./routes/friends");

const app = express();
const PORT = process.env.PORT || 4321;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowed = [
  process.env.FRONTEND_URL || "http://localhost:3333",
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const clean = origin.replace(/\/+$/, ""); // strip trailing slash
    if (allowed.includes(clean)) return cb(null, true);
    if (process.env.NODE_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(clean)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Trust proxy (fixes express-rate-limit X-Forwarded-For warning)
app.set("trust proxy", 1);

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use("/api/", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests — please try again later." },
}));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ success: true, status: "OK", version: "1.0.0", timestamp: new Date().toISOString() })
);

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/friends",     friendsRoutes);

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
// Without WebSockets there is no disconnect event, so rooms can sit forever
// after the host walks away. Sweep every 5 min:
//   • waiting   > 30 min  → abandoned
//   • in_progress > 2 hr → abandoned (game probably crashed)
async function sweepStaleRooms() {
  try {
    const [w] = await db.execute(
      "UPDATE rooms SET status = 'abandoned' WHERE status = 'waiting' AND created_at < NOW() - INTERVAL 30 MINUTE"
    );
    const [p] = await db.execute(
      "UPDATE rooms SET status = 'abandoned', finished_at = NOW() WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL 2 HOUR"
    );
    if (w.affectedRows || p.affectedRows)
      console.log(`🧹 Stale rooms swept: ${w.affectedRows} waiting, ${p.affectedRows} in-progress`);
  } catch (err) {
    console.error("Stale-room sweep failed:", err.message);
  }
}
if (process.env.NODE_ENV !== "test") {
  setInterval(sweepStaleRooms, 5 * 60 * 1000).unref();
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 PlayRoom backend   →  http://localhost:${PORT}`);
  console.log(`   Health check        →  http://localhost:${PORT}/api/health`);
  console.log(`   React dev server    →  http://localhost:3333  (npm start)\n`);
});

module.exports = app;