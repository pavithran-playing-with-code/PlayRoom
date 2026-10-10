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
const playing = new Map();       // "userId:CODE" -> the socket (device) playing that match
const playKey = (userId, code) => `${Number(userId)}:${code}`;

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

    // One account on two devices, one match: only one of them plays it, or
    // both would post scores for the same seat and overwrite each other. The
    // first to open the game holds it; the other is told "elsewhere", and
    // hears room:play-free when the one playing lets go (or goes offline).
    socket.on("room:play", (code, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return reply({ ok: true });
      const held = playing.get(playKey(uid, code));
      if (held && held !== socket.id && io.sockets.sockets.has(held)) return reply({ ok: false });
      playing.set(playKey(uid, code), socket.id);
      reply({ ok: true });
    });
    socket.on("room:unplay", (code) => {
      if (typeof code !== "string" || playing.get(playKey(uid, code)) !== socket.id) return;
      playing.delete(playKey(uid, code));
      io.to(userChannel(uid)).emit("room:play-free", { code });
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

    // Speedway: where my car is, ~10 times a second, so everyone in the room
    // sees everyone else's car on the same track — where, which way, how fast,
    // and whether it's drifting (lv: the charge, 0-3) or boosting, so it's
    // drawn sliding and flaming like the real thing. Ephemeral like
    // room:live — the score sync is still what the result is built from —
    // and the sender is their verified token, never the payload.
    socket.on("race:pos", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const n = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
      socket.to(roomChannel(code)).emit("race:pos", {
        user_id: uid,
        px: n(msg.px, -1e5, 1e5), py: n(msg.py, -1e5, 1e5), a: n(msg.a, -1e4, 1e4),
        vx: n(msg.vx, -2000, 2000), vy: n(msg.vy, -2000, 2000), p: Math.floor(n(msg.p, -1e4, 1e5)),
        dr: msg.dr ? 1 : 0, sl: msg.sl ? 1 : 0, lv: Math.floor(n(msg.lv, 0, 3)), b: n(msg.b, 0, 5), bm: n(msg.bm, 0, 5),
        st: n(msg.st, -1, 1), br: msg.br ? 1 : 0,
        f: msg.f === null || msg.f === undefined ? null : n(msg.f, 0, 1e4),
      });
    });

    // Maze Runner together: where my ball is in the shared maze, and what I
    // know — which maze we're on, whether the key's been taken, whether this
    // maze is done. Every phone keeps the latest it has heard, so one that
    // missed something catches up from the next message.
    socket.on("maze:pos", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const n = (v, lo, hi) => { const x = Math.floor(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
      socket.to(roomChannel(code)).emit("maze:pos", {
        user_id: uid, lv: n(msg.lv, 1, 999), r: n(msg.r, 0, 63), c: n(msg.c, 0, 63), k: msg.k ? 1 : 0, done: msg.done ? 1 : 0,
      });
    });

    // Running together (Rail Runner, Dino Dash, Flappy Dash in a co-op room):
    // where my runner is, how fast, whether I'm down, and how many hearts
    // I've grabbed — a friend's count going up brings back whoever is down
    // (src/components/games/runTogether.js). Relayed only, like race:pos.
    socket.on("run:pos", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const n = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
      socket.to(roomChannel(code)).emit("run:pos", {
        user_id: uid,
        d: n(msg.d, -1e3, 1e8), v: n(msg.v, 0, 1e4), y: n(msg.y, -1e3, 1e4), l: n(msg.l, -5, 5),
        dn: msg.dn ? 1 : 0, h: Math.floor(n(msg.h, 0, 1e5)),
      });
    });

    // Sunshard Islands: where my explorer is and what they're doing — so
    // everyone draws everyone on the same islands — plus my shards (a bit
    // each: together, any of us taking one counts for all), gems, how far
    // along I am and whether I'm home, and (together) which of my ropes are
    // tied. Relayed only; the score sync decides.
    socket.on("isl:pos", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const n = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
      socket.to(roomChannel(code)).emit("isl:pos", {
        user_id: uid,
        x: n(msg.x, -1e4, 1e4), y: n(msg.y, -1e3, 1e4), z: n(msg.z, -1e4, 1e4), f: n(msg.f, -100, 100),
        vx: n(msg.vx, -60, 60), vy: n(msg.vy, -60, 60), vz: n(msg.vz, -60, 60),
        g: msg.g ? 1 : 0, gl: msg.gl ? 1 : 0, a: msg.a ? 1 : 0, iv: msg.iv ? 1 : 0, hp: Math.floor(n(msg.hp, 0, 3)),
        sh: Math.floor(n(msg.sh, 0, 31)), gm: Math.floor(n(msg.gm, 0, 999)), p: Math.floor(n(msg.p, 0, 999)),
        rp: Math.floor(n(msg.rp, 0, 3)),             // together: my ropes tied, to the one before me (1) / after (2)
        fin: msg.fin === null || msg.fin === undefined ? null : n(msg.fin, 0, 1e4),
      });
    });

    socket.on("disconnect", () => {
      for (const [k, sid] of playing) {
        if (sid !== socket.id) continue;
        playing.delete(k);
        io.to(userChannel(uid)).emit("room:play-free", { code: k.slice(k.indexOf(":") + 1) });
      }
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

// Is another device of this user (not `sid`) the one playing this match, or
// — before it starts — still in the room? Then this device leaving the room
// (its tab closed, Back to lobby) is only this device going, not the player.
function heldElsewhere(io, userId, code, sid) {
  if (!io || !sid) return false;
  const held = playing.get(playKey(userId, code));
  if (held) return held !== sid && io.sockets.sockets.has(held);
  const mine = io.sockets.adapter.rooms.get(userChannel(userId));
  const here = io.sockets.adapter.rooms.get(roomChannel(code));
  if (!mine || !here) return false;
  for (const id of mine) if (id !== sid && here.has(id)) return true;
  return false;
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
  initSocket, emitRoom, emitUser, tellFriends, roomChannel, userChannel, heldElsewhere,
  isOnline: presence.isOnline, onlineUserIds: presence.onlineUserIds,
};
