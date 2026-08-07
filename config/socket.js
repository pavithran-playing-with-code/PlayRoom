// ─────────────────────────────────────────────────────────────────────────────
//  config/socket.js — Socket.io real-time hub
//
//  Design: REST endpoints remain the source of truth (they write to MySQL).
//  This layer adds (a) presence tracking and (b) per-room channels so the
//  server can push "something changed" events instead of clients polling on a
//  timer. Routes emit via emitRoom(req.app.get("io"), code, event, payload).
//
//  Auth: the client passes its JWT in the handshake (auth.token); we verify it
//  the same way middleware/auth.js does for REST.
// ─────────────────────────────────────────────────────────────────────────────

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { corsOrigin } = require("./cors");

// userId -> Set<socketId>. A user is "online" while they have ≥1 live socket.
const online = new Map();

function roomChannel(code) {
  return `room:${String(code).toUpperCase()}`;
}

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    // Same origin policy as the REST API — see config/cors.js.
    cors: {
      origin: corsOrigin,
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  // ── Handshake auth ──────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error("No token provided."));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error("Invalid or expired token."));
    }
  });

  io.on("connection", (socket) => {
    const uid = Number(socket.user.id);

    // ── Presence: mark online (first socket only broadcasts) ──
    if (!online.has(uid)) {
      online.set(uid, new Set());
      io.emit("presence:update", { userId: uid, online: true });
    }
    online.get(uid).add(socket.id);

    // Subscribe to a room's real-time channel.
    socket.on("room:join", (code) => {
      if (typeof code === "string" && /^[A-Za-z0-9]{4,8}$/.test(code)) {
        socket.join(roomChannel(code));
      }
    });

    socket.on("room:leave", (code) => {
      if (typeof code === "string") socket.leave(roomChannel(code));
    });

    // Lightweight ephemeral signal (not persisted) — e.g. "X is typing".
    socket.on("room:typing", (code) => {
      if (typeof code === "string") {
        socket.to(roomChannel(code)).emit("room:typing", {
          userId: uid, username: socket.user.username,
        });
      }
    });

    socket.on("disconnect", () => {
      const set = online.get(uid);
      if (!set) return;
      set.delete(socket.id);
      if (set.size === 0) {
        online.delete(uid);
        io.emit("presence:update", { userId: uid, online: false });
      }
    });
  });

  return io;
}

// Called from REST routes after a successful DB write to push the change.
function emitRoom(io, code, event, payload) {
  if (!io) return;
  io.to(roomChannel(code)).emit(event, payload);
}

function isOnline(userId) {
  return online.has(Number(userId));
}

function onlineUserIds() {
  return [...online.keys()];
}

module.exports = { initSocket, emitRoom, isOnline, onlineUserIds, roomChannel };
