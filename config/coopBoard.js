// config/coopBoard.js — one board for everybody: Memory Match, Mahjong,
// Number Rush and Pipes played together (a co-op room).
//
// The server doesn't know these games' rules. It does one thing: puts every
// move from every phone in one order, numbers it, and tells the whole room
// (cb:act). Each phone plays the numbered moves through the same rules
// (src/components/games/coopBoards.js), so every phone shows the same board.
// When two people tap at once, this order is what decides who was first.
//
// It also keeps each room's moves, so a phone that reloads, drops out for a
// moment or misses one catches up (cb:hello / cb:sync answered with cb:log).
// A phone's moves carry their own name (`c`), so one sent twice — after a
// reconnect, say — only counts once.
//
// If the server itself restarted mid-match, the moves it kept are gone; the
// first phone back that still has them hands them over (cb:restore, when a
// cb:log says the server holds fewer moves than the phone). A phone that
// finds its moves don't line up with the server's starts again from the
// server's (coopLog.js: differs).
//
//   cb:hello   { code, from }       → cb:log { code, from, acts, total }
//   cb:sync    { code, from }       → cb:log
//   cb:act     { code, a, c }       → everyone: cb:act { code, s, u, a, c }
//                                     or, refused, to the sender: cb:nack { code, c }
//   cb:restore { code, acts }
const db = require("./db");
const { roomChannel } = require("./socket");

const GAMES = new Set(["memory", "mahjong", "numbers", "pipes", "wordrush"]);
const CODE_RE = /^[A-Z0-9]{4,8}$/;
const MAX_MOVE = 200;            // characters of JSON: a move is a tap
const MAX_ACTS = 20000;          // a long match on a busy board is ~2,000
const KEEP_MS = 3 * 60 * 60 * 1000;
const PER_SEC = 20;              // moves a second, per phone — far past any thumb
const BURST = 30;

const logs = new Map();          // code → { acts: [], names: Set, at }

function logFor(code) {
  let L = logs.get(code);
  if (!L) { L = { acts: [], names: new Set(), at: Date.now() }; logs.set(code, L); }
  return L;
}

// Old rooms' moves go after a while; nobody plays a match for three hours.
const sweep = setInterval(() => {
  const old = Date.now() - KEEP_MS;
  for (const [code, L] of logs) if (L.at < old) logs.delete(code);
}, 10 * 60 * 1000);
if (sweep.unref) sweep.unref();

// Who this is in the room: "player" (may move), "watcher" (may only look),
// or null. Only a together room of one of these games, and only moves while
// the match is on.
async function roleOf(code, uid) {
  const [rows] = await db.execute(
    `SELECT rp.is_spectator, r.mode, r.status, gt.slug
       FROM room_players rp
       JOIN rooms r ON r.id = rp.room_id
       JOIN game_types gt ON gt.id = r.game_type_id
      WHERE r.room_code = ? AND rp.user_id = ?`, [code, uid]);
  if (!rows.length) return null;
  const r = rows[0];
  if (r.mode !== "coop" || !GAMES.has(r.slug)) return null;
  return !r.is_spectator && r.status === "in_progress" ? "player" : "watcher";
}

const cleanMove = (a) => {
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  let json;
  try { json = JSON.stringify(a); } catch { return null; }
  return json.length <= MAX_MOVE ? JSON.parse(json) : null;
};
const cleanName = (c) => (typeof c === "string" && c.length <= 40 ? c : null);
const codeOf = (m) => (m && typeof m.code === "string" && CODE_RE.test(m.code.toUpperCase()) ? m.code.toUpperCase() : null);
const fromOf = (m) => Math.max(0, Math.floor(Number(m && m.from)) || 0);

function attach(io) {
  io.on("connection", (socket) => {
    const uid = Number(socket.user.id);
    const roles = new Map();       // code → role, asked once per socket
    let tokens = BURST, filled = Date.now();

    const sendLog = (code, from) => {
      const L = logs.get(code);
      const total = L ? L.acts.length : 0;
      const at = Math.min(from, total);
      socket.emit("cb:log", { code, from: at, acts: L ? L.acts.slice(at) : [], total });
    };

    socket.on("cb:hello", async (m) => {
      const code = codeOf(m);
      if (!code) return;
      try {
        const role = await roleOf(code, uid);
        if (!role) return;
        roles.set(code, role);
        socket.join(roomChannel(code));
        sendLog(code, fromOf(m));
      } catch (e) { console.error("coop hello:", e.message); }
    });

    socket.on("cb:sync", (m) => {
      const code = codeOf(m);
      if (code && roles.has(code)) sendLog(code, fromOf(m));
    });

    socket.on("cb:act", (m) => {
      const code = codeOf(m);
      const c = cleanName(m && m.c);
      if (!code) return;
      const refuse = () => { if (c) socket.emit("cb:nack", { code, c }); };
      if (roles.get(code) !== "player") return refuse();
      const now = Date.now();
      tokens = Math.min(BURST, tokens + ((now - filled) / 1000) * PER_SEC);
      filled = now;
      if (tokens < 1) return refuse();
      tokens -= 1;
      const a = cleanMove(m.a);
      if (!a || !c) return refuse();
      const L = logFor(code);
      if (L.names.has(c)) return;            // sent twice: it's already in
      if (L.acts.length >= MAX_ACTS) return refuse();
      const act = { s: L.acts.length, u: uid, a, c };
      L.acts.push(act);
      L.names.add(c);
      L.at = now;
      io.to(roomChannel(code)).emit("cb:act", { code, ...act });
    });

    // After a restart: the moves this phone kept. Only taken into an empty
    // log, and only from somebody who plays in the room.
    socket.on("cb:restore", (m) => {
      const code = codeOf(m);
      if (!code || roles.get(code) !== "player" || !Array.isArray(m.acts)) return;
      const L = logFor(code);
      if (L.acts.length || m.acts.length > MAX_ACTS) return;
      const acts = [], names = new Set();
      for (const x of m.acts) {
        const a = cleanMove(x && x.a), c = cleanName(x && x.c);
        const u = Math.floor(Number(x && x.u));
        if (!a || !c || !(u > 0) || names.has(c)) return;     // not a log we can trust
        acts.push({ s: acts.length, u, a, c });
        names.add(c);
      }
      L.acts = acts;
      L.names = names;
      L.at = Date.now();
      io.to(roomChannel(code)).emit("cb:log", { code, from: 0, acts, total: acts.length });
    });
  });
}

module.exports = { attach, GAMES, _logs: logs };
