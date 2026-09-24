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

// ── Print every failed API call in this terminal ─────────────────────────────
// Crashes (500s) are printed with a full stack by middleware/errorHandler.js.
// Everything else that fails, like a 404 "Game type not found", a 409 "match
// is over" or a 429 rate limit, used to vanish silently. Now each one prints
// who asked, what they sent (passwords and tokens masked) and what went wrong.
function whoIs(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return "guest";
  try {
    const p = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    return `${p.username} (#${p.id})`;
  } catch {
    return "expired/invalid token";
  }
}

const SECRET_KEY = /pass|token|secret/i;
function safeBody(body) {
  if (!body || typeof body !== "object") return "";
  const out = {};
  for (const [k, v] of Object.entries(body)) out[k] = SECRET_KEY.test(k) ? "***" : v;
  const s = JSON.stringify(out);
  return s === "{}" ? "" : s.slice(0, 300);
}

// Strip control characters so nothing sent from a browser can mess with the terminal.
const clean = (v, max) => (typeof v === "string" ? v.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").slice(0, max) : "");

app.use("/api", (req, res, next) => {
  const started = Date.now();
  const json = res.json.bind(res);
  res.json = (body) => { res.locals.reply = body; return json(body); };
  res.on("finish", () => {
    if (res.statusCode < 400 || res.locals.errorLogged || req.path === "/client-log") return;
    const msg = res.locals.reply && res.locals.reply.message;
    const body = req.method === "GET" ? "" : safeBody(req.body);
    console.warn(`⚠️  ${res.statusCode} ${req.method} ${req.originalUrl}  · ${whoIs(req)} · ${Date.now() - started}ms`);
    if (msg) console.warn(`    → ${msg}`);
    if (body) console.warn(`    sent: ${body}`);
  });
  next();
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Three tiers, because one global budget can't serve both "stop brute-forcing
// my login" and "let a game loop poll twice a second".
//
// A single 500/15min bucket used to cover everything, and an in-game client
// burns ~40 req/min (score sync + opponent poll + inbox badge) — so a player
// got 429'd roughly 12 minutes in, mid-match. Worse, the limiter keys on IP, so
// two people on one home connection shared that budget and hit it twice as fast.
const limiter = (max, windowMinutes, message, skip) => rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  ...(skip ? { skip } : {}),
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
//
// app.use("/api/") also runs for /api/rooms and /api/auth/*, so without this
// skip those requests were spending from two budgets at once and the generous
// room allowance above counted for nothing: a lobby poll every 5s plus a match
// poll every 2.5s plus score sync clears 600 in well under fifteen minutes, and
// the next "create room" came back 429 even though the room limiter was barely
// touched. Anything with a limiter of its own is not counted again here.
const HAS_OWN_LIMIT = ["/api/rooms", "/api/auth/login", "/api/auth/register", "/api/auth/change-password"];
app.use("/api/",              limiter(600,  15, "Too many requests — please try again later.",
  (req) => HAS_OWN_LIMIT.some((p) => req.originalUrl === p || req.originalUrl.startsWith(p + "/") || req.originalUrl.startsWith(p + "?"))));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ success: true, status: "OK", version: "1.0.0", timestamp: new Date().toISOString() })
);

// ── API routes ────────────────────────────────────────────────────────────────
// Problems only the browser can see (page crashes, requests that never
// arrived, replies that weren't JSON), sent by src/utils/reportError.js.
app.post("/api/client-log", (req, res) => {
  const b = req.body || {};
  console.error("─────────────────────────────────────────");
  console.error(`🖥️  BROWSER ${clean(b.kind, 20) || "error"}  · ${whoIs(req)} · page ${clean(b.page, 200) || "?"}`);
  console.error("Message :", clean(b.message, 500) || "—");
  if (b.stack) console.error("Stack   :", clean(b.stack, 2000));
  console.error("─────────────────────────────────────────");
  res.status(204).end();
});

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
// Every game the app offers needs its row in game_types, or creating a room for
// it fails with "Game type not found". Say so loudly at startup.
const APP_GAMES = ["mahjong", "memory", "speedmath", "reaction", "wordrush", "arrows", "jigsaw", "dino", "numbers", "colors", "pipes", "flappy", "slide", "blocks"];
async function checkGameTypes() {
  try {
    const [rows] = await db.execute("SELECT slug FROM game_types WHERE is_active = 1");
    const have = new Set(rows.map((r) => r.slug));
    const missing = APP_GAMES.filter((s) => !have.has(s));
    if (missing.length) {
      console.warn(`\n⚠️  Missing from the game_types table: ${missing.join(", ")}`);
      console.warn("   Rooms for these games can't be created until their rows are added.\n");
    }
  } catch (err) {
    console.warn("⚠️  Could not check game_types:", err.message);
  }
}

server.listen(PORT, () => {
  checkGameTypes();
  console.log(`\n🚀 PlayRoom backend   →  http://localhost:${PORT}`);
  console.log(`   Health check        →  http://localhost:${PORT}/api/health`);
  console.log(`   WebSocket (Socket.io) ready on the same port`);
  console.log(`   React dev server    →  http://localhost:3333  (npm start)\n`);
});

module.exports = app;