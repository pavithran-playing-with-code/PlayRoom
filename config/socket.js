// ─────────────────────────────────────────────────────────────────────────────
//  config/socket.js — Socket.io real-time hub
//
//  Design: REST endpoints remain the source of truth (they write to MySQL).
//  This layer adds:
//    (a) presence: who's online, told only to their friends
//    (b) per-room channels, so the server can push "something changed"
//        instead of clients polling on a timer
//    (c) a private channel per user, for friend requests, invites and the
//        like, so they arrive live wherever the user is, mid-game included
//  Routes emit via emitRoom(io, code, …) and emitUser(io, userId, …).
//
//  Auth: the client passes its JWT in the handshake (auth.token); we verify it
//  the same way middleware/auth.js does for REST.
// ─────────────────────────────────────────────────────────────────────────────

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { corsOrigin } = require("./cors");
const presence = require("./presence");

const { online } = presence;

// A page refresh or a patchy phone connection drops the socket for a second or
// two. Wait this long before telling friends someone left. Otherwise every
// reload would flash them offline and back, and fire an "is online" pop-up.
const OFFLINE_GRACE_MS = 6000;
const offlineTimers = new Map(); // userId -> Timeout

function roomChannel(code) {
  return `room:${String(code).toUpperCase()}`;
}

function userChannel(userId) {
  return `user:${Number(userId)}`;
}

// Presence only goes to the people allowed to see it: accepted friends.
async function tellFriends(io, userId, payload) {
  try {
    const ids = await presence.friendIdsOf(userId);
    if (ids.length) io.to(ids.map(userChannel)).emit("presence:update", payload);
  } catch { /* best-effort */ }
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
    socket.join(userChannel(uid));

    // ── Presence: back within the grace window means they never left ──
    const pending = offlineTimers.get(uid);
    if (pending) {
      clearTimeout(pending);
      offlineTimers.delete(uid);
    }
    const wasOnline = online.has(uid);
    if (!wasOnline) online.set(uid, new Set());
    online.get(uid).add(socket.id);
    if (!wasOnline) {
      tellFriends(io, uid, { userId: uid, online: true });
      presence.stampLastSeen(uid);
    }

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

    // A player's board, as it happens. Ephemeral and never stored: the 2s score
    // sync is still what the database and the result are built from. This only
    // exists so a spectator sees a tile clear when it clears, rather than up to
    // four seconds later when their poll next comes round.
    //
    // The sender's id comes from their verified token, never from the payload,
    // so nobody can broadcast a board as somebody else.
    socket.on("room:live", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const state = typeof msg.game_state === "string" ? msg.game_state : null;
      if (state && state.length > 8000) return;          // a board, not a payload
      socket.to(roomChannel(code)).emit("room:live", {
        user_id: uid,
        score: Number(msg.score) || 0,
        pairs_matched: Number(msg.pairs_matched) || 0,
        moves: Number(msg.moves) || 0,
        game_state: state,
      });
    });

    socket.on("disconnect", () => {
      const set = online.get(uid);
      if (!set) return;
      set.delete(socket.id);
      if (set.size > 0 || offlineTimers.has(uid)) return;
      offlineTimers.set(uid, setTimeout(() => {
        offlineTimers.delete(uid);
        const still = online.get(uid);
        if (still && still.size > 0) return;
        online.delete(uid);
        const at = new Date().toISOString();
        presence.stampLastSeen(uid);
        tellFriends(io, uid, { userId: uid, online: false, last_seen: at });
      }, OFFLINE_GRACE_MS));
    });

    // Who of my friends is on right now, plus when the rest were last seen.
    // Sent after the handlers above are registered, so nothing is missed
    // while the query runs.
    (async () => {
      try {
        const ids = await presence.friendIdsOf(uid);
        socket.emit("presence:snapshot", await presence.presenceOf(ids));
      } catch { /* the client also gets presence from /api/friends */ }
    })();
  });

  return io;
}

// Called from REST routes after a successful DB write to push the change.
function emitRoom(io, code, event, payload) {
  if (!io) return;
  io.to(roomChannel(code)).emit(event, payload);
}

// Push something to one user, on every tab and device they have open.
function emitUser(io, userId, event, payload) {
  if (!io) return;
  io.to(userChannel(userId)).emit(event, payload);
}

module.exports = {
  initSocket, emitRoom, emitUser, tellFriends, roomChannel, userChannel,
  isOnline: presence.isOnline, onlineUserIds: presence.onlineUserIds,
};
