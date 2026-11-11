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
const playing = new Map();       // "userId:CODE" -> { sid, device }: the socket and the device playing that match
// which device a socket is (src/utils/deviceId.js); an old app without one: the socket itself
const deviceOf = (socket) => { const d = socket.handshake && socket.handshake.auth && socket.handshake.auth.device; return typeof d === "string" && d ? d.slice(0, 64) : socket.id; };
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
      const held = playing.get(playKey(uid, code)), device = deviceOf(socket);
      // held by another device that's still connected: that one plays. The
      // same device on a new socket (its connection blipped, the old one not
      // yet noticed gone) just takes it back.
      if (held && held.sid !== socket.id && held.device !== device && io.sockets.sockets.has(held.sid)) return reply({ ok: false });
      playing.set(playKey(uid, code), { sid: socket.id, device });
      reply({ ok: true });
    });
    socket.on("room:unplay", (code) => {
      const held = typeof code === "string" && playing.get(playKey(uid, code));
      if (!held || held.sid !== socket.id) return;
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

    // Spectating a real-time game (useSpecStream): a watcher asks for a
    // player's frames every 2s (room:frame-want), and that player's phone
    // sends a small picture of its game ~15 times a second while anyone is
    // asking (room:frame). Relayed only, never stored; volatile, so a slow
    // watcher drops frames instead of queueing them and falling behind. The
    // sender is their verified token, never the payload.
    let lastFrameAt = 0;
    socket.on("room:frame-want", (msg) => {
      const code = msg && msg.code, target = Number(msg && msg.target);
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code) || !Number.isInteger(target)) return;
      socket.to(roomChannel(code)).emit("room:frame-want", { user_id: uid, target });
    });
    socket.on("room:frame", (msg) => {
      const code = msg && msg.code, f = msg && msg.f;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      if (typeof f !== "string" || f.length > 6000) return;
      const now = Date.now();
      if (now - lastFrameAt < 30) return;                   // ~30 a second at most per phone
      lastFrameAt = now;
      socket.to(roomChannel(code)).volatile.emit("room:frame", { user_id: uid, f });
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

    // Road Hopper: where my chick is on the course (everyone hops the same one),
    // so everyone draws everyone. r: the row I'm on or hopping to, x: across,
    // d: dazed for, l: what got me last (a number), p: my best row.
    socket.on("hop:pos", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const n = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
      socket.to(roomChannel(code)).volatile.emit("hop:pos", {
        user_id: uid,
        r: Math.floor(n(msg.r, -5, 1e5)), x: n(msg.x, -5, 20), d: n(msg.d, 0, 5), l: Math.floor(n(msg.l, 0, 9)),
        k: Math.floor(n(msg.k, 0, 1e5)), p: Math.floor(n(msg.p, 0, 1e5)),
      });
    });

    // Flappy Dash: my bird (everyone flies the same course), so everyone draws
    // everyone. The phones carry it on under gravity between messages.
    socket.on("fly:pos", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const n = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
      socket.to(roomChannel(code)).volatile.emit("fly:pos", {
        user_id: uid,
        x: n(msg.x, 0, 1e7), y: n(msg.y, -500, 1500), vy: n(msg.vy, -3000, 3000), st: msg.st ? 1 : 0, sn: n(msg.sn, 0, 5),
        fa: Math.floor(n(msg.fa, 0, 9999)), k: Math.floor(n(msg.k, 0, 1e5)), pi: Math.floor(n(msg.pi, 0, 1e5)),
      });
    });

    // Dodge Storm: where my runner is in the arena (each of us dodges our own
    // storm; the others are drawn as ghosts).
    socket.on("storm:pos", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const n = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
      socket.to(roomChannel(code)).volatile.emit("storm:pos", {
        user_id: uid,
        x: n(msg.x, -50, 400), y: n(msg.y, -50, 500), h: msg.h ? 1 : 0, n: Math.floor(n(msg.n, 0, 1e5)), g: Math.floor(n(msg.g, 0, 1e5)),
      });
    });

    // Dino Dash: my dino on the course (everyone runs the same one), carried
    // on at its speed between messages.
    socket.on("dino:pos", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const n = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
      socket.to(roomChannel(code)).volatile.emit("dino:pos", {
        user_id: uid,
        x: n(msg.x, 0, 1e8), y: n(msg.y, 0, 1000), vy: n(msg.vy, -5000, 5000), du: msg.du ? 1 : 0, st: msg.st ? 1 : 0,
        sn: n(msg.sn, 0, 5), v: n(msg.v, 0, 2000), k: Math.floor(n(msg.k, 0, 1e5)),
      });
    });

    // Rail Runner: where my runner is on the course (everyone runs the same
    // one), so friends run beside you as ghosts. Carried on at its speed.
    socket.on("rr:pos", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const n = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
      socket.to(roomChannel(code)).volatile.emit("rr:pos", {
        user_id: uid,
        z: n(msg.z, 0, 1e7), x: n(msg.x, -2, 2), y: n(msg.y, 0, 10), v: n(msg.v, 0, 100), sl: msg.sl ? 1 : 0, st: msg.st ? 1 : 0,
      });
    });

    // Sunshard Jump: where my explorer is and what they're doing — so
    // everyone draws everyone on the same Sky Tree — plus my Sunshards, my
    // balloons (hp), my best height (p), when I reached the Crown (fin) and
    // (together) which of my ropes are tied. Relayed only; the score sync decides.
    socket.on("isl:pos", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const n = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
      socket.to(roomChannel(code)).emit("isl:pos", {
        user_id: uid,
        x: n(msg.x, -1e4, 1e4), y: n(msg.y, -1e3, 1e4), z: n(msg.z, -1e4, 1e4), f: n(msg.f, -100, 100),
        vx: n(msg.vx, -60, 60), vy: n(msg.vy, -60, 60), vz: n(msg.vz, -60, 60),
        g: msg.g ? 1 : 0, gl: msg.gl ? 1 : 0, iv: msg.iv ? 1 : 0, hp: Math.floor(n(msg.hp, 0, 6)),
        sh: Math.floor(n(msg.sh, 0, 31)), p: Math.floor(n(msg.p, 0, 999)),
        rp: Math.floor(n(msg.rp, 0, 3)),             // together: my ropes tied, to the one before me (1) / after (2)
        rd: Math.floor(n(msg.rd, 0, 999)),           // which tree I'm on (0 = the room's seed, then the next…)
        fin: msg.fin === null || msg.fin === undefined ? null : n(msg.fin, 0, 1e4),
      });
    });

    // Sunshard Jump: a moment on my tree everyone shares, by its index in the
    // level — a slime I stomped, a crumbling stone I stepped on, a Sunshard
    // I took (together: it's gone for the whole team).
    const ISL_EV = new Set(["stomp", "crumble", "shard"]);
    socket.on("isl:ev", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const k = typeof msg.k === "string" && ISL_EV.has(msg.k) ? msg.k : null;
      const i = msg.i === undefined ? 0 : Number(msg.i), rd = Number(msg.rd) || 0;
      if (!k || !Number.isInteger(i) || i < 0 || i > 999 || !Number.isInteger(rd) || rd < 0 || rd > 999) return;
      socket.to(roomChannel(code)).emit("isl:ev", { user_id: uid, k, i, rd });
    });

    // Emberfall: everything the two phones say to each other — where each
    // hero is, the host's enemies, world changes (public/emberfall/game.js,
    // the NET section). Relayed whole; the server only caps the size.
    socket.on("ef:msg", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const d = msg.d;
      if (!d || typeof d !== "object" || Array.isArray(d)) return;
      let size = 0;
      try { size = JSON.stringify(d).length; } catch { return; }
      if (size > 24000) return;
      socket.to(roomChannel(code)).emit("ef:msg", { user_id: uid, d });
    });

    // Hollow Hours together: each phone's kid ~15 times a second — where it
    // is, what it's doing, hidden or not, through the exit or not, the noises
    // it made (for the Keeper), a crank or lever it used, and once, if it was
    // caught (src/components/hollow/hollowNet.mjs, kidMsg). Relayed whole; the
    // server only checks the shape, caps the size and the rate — never
    // dropping a message that says someone was caught or used something.
    let lastKidAt = 0;
    socket.on("hh:kid", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const d = msg.d;
      if (!d || typeof d !== "object" || Array.isArray(d)) return;
      if (!Number.isInteger(d.r) || d.r < -1 || d.r > 99) return;
      if (!["x", "y", "z"].every((k) => Number.isFinite(d[k]) && Math.abs(d[k]) < 1e4)) return;
      if ((d.ev && (!Array.isArray(d.ev) || d.ev.length > 40)) || (d.use && (!Array.isArray(d.use) || d.use.length > 4))) return;
      let size = 0;
      try { size = JSON.stringify(d).length; } catch { return; }
      if (size > 4000) return;
      const now = Date.now(), urgent = !!d.caught || (d.use && d.use.length > 0) || !!d.out;
      if (!urgent && now - lastKidAt < 35) return;
      lastKidAt = now;
      socket.to(roomChannel(code)).emit("hh:kid", { user_id: uid, d });
    });

    // Hollow Hours together: the host (the lowest seat still playing) sends
    // the room ~8 times a second — its clock, its machinery, the boxes that
    // move, the Keeper and its sounds (hollowNet.mjs, roomMsg).
    let lastRoomAt = 0;
    socket.on("hh:room", (msg) => {
      const code = msg && msg.code;
      if (typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return;
      const d = msg.d;
      if (!d || typeof d !== "object" || Array.isArray(d)) return;
      if (!Number.isInteger(d.r) || d.r < -1 || d.r > 99 || !Number.isFinite(d.rt)) return;
      let size = 0;
      try { size = JSON.stringify(d).length; } catch { return; }
      if (size > 8000) return;
      const now = Date.now(), urgent = Array.isArray(d.rev) && d.rev.length > 0;
      if (!urgent && now - lastRoomAt < 55) return;
      lastRoomAt = now;
      socket.to(roomChannel(code)).emit("hh:room", { user_id: uid, d });
    });

    socket.on("disconnect", () => {
      for (const [k, held] of playing) {
        if (held.sid !== socket.id) continue;
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
  // the device that's leaving (an old socket of it may linger: still this device)
  const leaving = io.sockets.sockets.get(sid), myDevice = leaving ? deviceOf(leaving) : sid;
  if (held) return held.sid !== sid && held.device !== myDevice && io.sockets.sockets.has(held.sid);
  const mine = io.sockets.adapter.rooms.get(userChannel(userId));
  const here = io.sockets.adapter.rooms.get(roomChannel(code));
  if (!mine || !here) return false;
  for (const id of mine) {
    if (id === sid || !here.has(id)) continue;
    const other = io.sockets.sockets.get(id);
    if (!other || deviceOf(other) !== myDevice) return true;
  }
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
