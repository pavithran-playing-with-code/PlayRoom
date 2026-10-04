// config/togetherWorld.js — the games you can play TOGETHER, run by the server.
//
// Kitchen Rush, Tower Guard, Bomb Blast and Carrom are played in worlds the
// server keeps: a kitchen two friends cook in, a castle everyone defends, an
// arena or a board everyone is in at once. A world shared by several phones
// can't live on any one of them, so — like Hollow Manor
// (config/manorWorld.js) — the server keeps it in memory and runs it.
//
// Sides (rooms.mode):
//   free   everyone for themselves: a world each, all from the same seed
//   teams  a world per team, shared by its members
//   coop   one world, the whole room in it
// Each side's world runs on its game's rules (src/components/together/
// <game>Core.mjs, shared with the phones), ticking a few times a second.
// The server alone scores: every member of a side carries the side's score
// in room_players, and pairs_matched is 1 once the side has reached its goal
// (the stars, the bombs, the castle still standing) — which is what decides a
// match with only one side in it (config/matchResult.js).
//
// A match ends when the clock runs out, when every side's world is over (a
// castle fallen), or once everybody has left.
//
// A rules module that says SHARED (Carrom) is one world for the whole room,
// the sides playing against each other in it: every side gets the same
// world, it steps once, and it's asked for each side's score by key.
const path = require("path");
const { pathToFileURL } = require("url");
const db = require("./db");
const { recordResults } = require("./recordResults");
const { tellFriends, roomChannel, userChannel } = require("./socket");

// slug -> the rules module
const GAMES = { kitchen: "kitchenCore.mjs", bomb: "bombCore.mjs", tower: "towerCore.mjs", carrom: "carromCore.mjs" };
// …and the ones a co-op room can be made for (Carrom is sides against each other only)
const COOP = ["kitchen", "bomb", "tower"];
const KEEP_AFTER_MS = 120000;          // a finished world lingers for late hellos
const SAVE_MS = 1500;                  // scores reach the database at most this often

const PLAYER_COLOURS = ["#4cc9f0", "#ff8fc7", "#8fdb5c", "#ffa36c", "#9b5de5", "#3dd6c0", "#ffc53d", "#ff6b6b"];
const TEAM_COLOURS = ["#ff6b6b", "#ffc53d", "#4cc9f0", "#3dd6c0"];
const TEAM_NAMES = ["Red", "Yellow", "Blue", "Green"];

const cores = {};
const ready = Promise.all(Object.entries(GAMES).map(async ([slug, file]) => {
  const full = path.join(__dirname, "..", "src", "components", "together", file);
  try { cores[slug] = await import(pathToFileURL(full).href); }
  catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") console.error(`together: ${slug} rules:`, e.message); }
}));

const worlds = new Map();              // room code -> world
let io = null;

const isTogether = (slug) => Object.prototype.hasOwnProperty.call(GAMES, slug);
const sideChannel = (code, key) => `tg:${code}:${key}`;

// ── building ─────────────────────────────────────────────────────────────────

function sidesFor(mode, seats) {
  if (mode === "coop") {
    return [{ key: "all", name: "Together", color: "#ffc53d", members: seats.map((p) => Number(p.user_id)) }];
  }
  if (mode === "teams") {
    const by = new Map();
    for (const p of seats) {
      const t = p.team == null ? `solo${p.user_id}` : `t${p.team}`;
      if (!by.has(t)) by.set(t, { key: t, team: p.team, members: [] });
      by.get(t).members.push(Number(p.user_id));
    }
    return [...by.values()].sort((a, b) => (a.team || 99) - (b.team || 99)).map((s) => ({
      key: s.key, members: s.members,
      name: s.team ? TEAM_NAMES[(s.team - 1) % 4] : "Solo",
      color: s.team ? TEAM_COLOURS[(s.team - 1) % 4] : PLAYER_COLOURS[7],
    }));
  }
  return seats.map((p, i) => ({ key: `p${p.user_id}`, name: p.username, color: PLAYER_COLOURS[i % 8], members: [Number(p.user_id)] }));
}

function parseSaved(raw) {
  if (!raw) return null;
  try { const s = JSON.parse(raw); return s && s.tg ? s.tg : null; } catch { return null; }
}

function buildWorld(room, seats, elapsedMs) {
  const core = cores[room.game_slug];
  const mode = room.mode === "teams" || room.mode === "coop" ? room.mode : "free";
  const durMs = room.duration_seconds * 1000;
  const players = new Map();
  seats.forEach((p) => players.set(Number(p.user_id), {
    id: Number(p.user_id), name: p.username, avatar: p.avatar, left: !!(parseSaved(p.game_state) || {}).left,
  }));
  const plan = sidesFor(mode, seats);
  const shared = core.SHARED
    ? core.createSide(room.seed, { players: seats.map((p) => Number(p.user_id)), sides: plan.map((x) => ({ key: x.key, members: x.members })), durMs, mode })
    : null;
  const sides = plan.map((s) => {
    const inst = shared || core.createSide(room.seed, { players: s.members, durMs, mode });
    for (const id of s.members) { if (players.get(id).left) core.removePlayer(inst, id); }
    return { ...s, inst, best: 0 };
  });
  // a world rebuilt after a restart starts again, but keeps what each side had scored
  for (const p of seats) {
    const saved = parseSaved(p.game_state);
    const side = sides.find((s) => s.members.includes(Number(p.user_id)));
    if (saved && side) side.best = Math.max(side.best, Number(saved.score) || 0);
  }
  const sideOf = new Map();
  sides.forEach((s) => s.members.forEach((id) => sideOf.set(id, s)));
  for (const s of sides) s.members.forEach((id) => { players.get(id).side = s.key; players.get(id).color = s.color; });
  return {
    code: room.room_code, roomId: room.id, game: room.game_slug, core, mode, seed: room.seed,
    startMs: Date.now() - elapsedMs, durMs, sides, sideOf, players,
    over: false, reason: null, timer: null, lastTick: Date.now(), lastSave: 0, saved: new Map(),
  };
}

async function loadRoom(code) {
  const [rows] = await db.execute(
    `SELECT r.id, r.room_code, r.status, r.seed, r.mode, r.duration_seconds,
            TIMESTAMPDIFF(MICROSECOND, r.started_at, NOW(3)) / 1000 AS elapsed_ms,
            gt.slug AS game_slug
       FROM rooms r JOIN game_types gt ON gt.id = r.game_type_id
      WHERE r.room_code = ?`, [code]);
  return rows[0] || null;
}

async function loadSeats(roomId) {
  const [rows] = await db.execute(
    `SELECT rp.user_id, rp.team, rp.game_state, u.username, u.avatar
       FROM room_players rp JOIN users u ON u.id = rp.user_id
      WHERE rp.room_id = ? AND rp.is_spectator = 0
      ORDER BY rp.joined_at, rp.id`, [roomId]);
  return rows;
}

// The world for a room, building it on first use. Null unless the room is a
// running game of one of these.
async function worldFor(code) {
  code = String(code).toUpperCase();
  if (worlds.has(code)) return worlds.get(code);
  await ready;
  const room = await loadRoom(code);
  if (!room || !isTogether(room.game_slug) || !cores[room.game_slug] || room.status !== "in_progress") return null;
  if (worlds.has(code)) return worlds.get(code);
  const seats = await loadSeats(room.id);
  if (!seats.length) return null;
  const w = buildWorld(room, seats, Math.max(0, Number(room.elapsed_ms) || 0));
  start(w);
  return w;
}

function start(w) {
  worlds.set(w.code, w);
  w.lastTick = Date.now();
  w.timer = setInterval(() => { try { tick(w); } catch (e) { console.error(`${w.game} tick:`, e); } }, w.core.TICK_MS || 100);
  if (w.timer.unref) w.timer.unref();
}

// ── scores ───────────────────────────────────────────────────────────────────
const sideScore = (w, s) => Math.max(s.best, Math.round(w.core.score(s.inst, s.key)));
const sideGoal = (w, s) => !!w.core.goal(s.inst, s.key);
const worldsOf = (w) => [...new Set(w.sides.map((s) => s.inst))];

async function saveScores(w, force = false) {
  const jobs = [];
  for (const s of w.sides) {
    const score = sideScore(w, s);
    const goal = sideGoal(w, s) ? 1 : 0;
    for (const id of s.members) {
      const p = w.players.get(id);
      const state = JSON.stringify({ tg: { left: p.left, score } });
      const key = `${score}|${goal}|${state}`;
      if (!force && w.saved.get(id) === key) continue;
      w.saved.set(id, key);
      jobs.push(db.execute(
        `UPDATE room_players SET score = ?, pairs_matched = ?, game_state = ?
          WHERE room_id = ? AND user_id = ? AND is_spectator = 0`,
        [score, goal, state, w.roomId, id]
      ).catch((e) => console.error(`${w.game} score write:`, e.message)));
    }
  }
  await Promise.all(jobs);
}

// ── running ──────────────────────────────────────────────────────────────────
function tick(w) {
  if (w.over) return;
  const now = Date.now();
  const dt = Math.min(0.5, (now - w.lastTick) / 1000);
  w.lastTick = now;
  if (now - w.startMs >= w.durMs) { finish(w, "time"); return; }
  for (const inst of worldsOf(w)) if (!w.core.done(inst)) w.core.step(inst, dt, now - w.startMs);
  if (w.sides.every((s) => w.core.done(s.inst))) { finish(w, "done"); return; }
  broadcast(w, now);
  if (now - w.lastSave >= SAVE_MS) { w.lastSave = now; saveScores(w); }
}

function scoreboard(w) {
  return w.sides.map((s) => [s.key, sideScore(w, s), w.core.done(s.inst) ? 1 : 0]);
}

function broadcast(w, now) {
  const sc = scoreboard(w);
  const t = now - w.startMs;
  const views = new Map();               // a shared world is looked at once, for everyone
  for (const s of w.sides) {
    if (!views.has(s.inst)) views.set(s.inst, w.core.view(s.inst));
    io.to(sideChannel(w.code, s.key)).emit("tg:tick", { c: w.code, side: s.key, t, v: views.get(s.inst), sc });
    // what only one player may see (the bomb, to its defuser), when it changes
    if (w.core.secret) {
      const sec = w.core.secret(s.inst);
      const key = sec ? `${sec.to}|${JSON.stringify(sec.data)}` : "";
      if (key !== s.lastSecret) {
        s.lastSecret = key;
        if (sec) io.to(userChannel(sec.to)).emit("tg:secret", { c: w.code, side: s.key, data: sec.data });
      }
    }
  }
}

async function finish(w, reason) {
  if (w.over) return;
  w.over = true;
  w.reason = reason;
  clearInterval(w.timer);
  broadcast(w, Date.now());
  try {
    await saveScores(w, true);
    const [r] = await db.execute(
      "UPDATE rooms SET status = 'finished', finished_at = NOW() WHERE id = ? AND status = 'in_progress'", [w.roomId]);
    if (r.affectedRows) {
      io.to(roomChannel(w.code)).emit("room:ended", { code: w.code });
      for (const p of w.players.values()) tellFriends(io, p.id, { userId: p.id, playing: null });
    }
    await recordResults(w.roomId);
  } catch (e) {
    console.error(`${w.game} finish:`, e.message);
  }
  io.to(roomChannel(w.code)).emit("tg:over", standings(w));
  setTimeout(() => { if (worlds.get(w.code) === w) worlds.delete(w.code); }, KEEP_AFTER_MS).unref?.();
}

function standings(w) {
  const sides = w.sides.map((s) => ({
    key: s.key, name: s.name, color: s.color, score: sideScore(w, s), goal: sideGoal(w, s),
    out: !w.core.SHARED && !!w.core.done(s.inst), sum: w.core.summary ? w.core.summary(s.inst, s.key) : null,
    members: s.members.map((id) => { const p = w.players.get(id); return { id, name: p.name, avatar: p.avatar, left: p.left }; }),
  }));
  sides.sort((a, b) => b.score - a.score);
  return { code: w.code, game: w.game, mode: w.mode, reason: w.reason, sides };
}

// ── what a phone is told when it arrives ─────────────────────────────────────
function initFor(w, uid, role, sideKey) {
  const s = w.sides.find((x) => x.key === sideKey) || w.sides[0];
  return {
    code: w.code, game: w.game, mode: w.mode, you: uid, role, side: s.key,
    elapsed: Date.now() - w.startMs, duration: w.durMs,
    sides: w.sides.map((x) => ({ key: x.key, name: x.name, color: x.color, members: x.members })),
    players: [...w.players.values()].map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, side: p.side, color: p.color, left: p.left })),
    world: w.core.init(s.inst, uid),
    secret: (() => { const sec = w.core.secret && w.core.secret(s.inst); return sec && sec.to === uid ? sec.data : null; })(),
    view: w.core.view(s.inst, true),
    sc: scoreboard(w),
    over: w.over ? standings(w) : null,
  };
}

// ── sockets ──────────────────────────────────────────────────────────────────
const CODE_RE = /^[A-Z0-9]{4,8}$/;

async function roleOf(code, uid) {
  const [rows] = await db.execute(
    `SELECT rp.is_spectator FROM room_players rp JOIN rooms r ON r.id = rp.room_id
      WHERE r.room_code = ? AND rp.user_id = ?`, [code, uid]);
  if (!rows.length) return null;
  return rows[0].is_spectator ? "spectator" : "player";
}

function attach(server) {
  io = server;
  io.on("connection", (socket) => {
    const uid = Number(socket.user.id);
    let watching = null;               // the side channel this socket listens on

    const listen = (w, key) => {
      if (watching) socket.leave(watching);
      watching = sideChannel(w.code, key);
      socket.join(watching);
    };

    // { code, watch? } — watch: the side a spectator wants to see
    socket.on("tg:hello", async (raw) => {
      try {
        const code = String((raw && raw.code) || raw || "").toUpperCase();
        if (!CODE_RE.test(code)) return;
        const role = await roleOf(code, uid);
        if (!role) return;
        const w = worlds.get(code) || await worldFor(code);
        if (!w) return socket.emit("tg:gone", { code });
        socket.join(roomChannel(code));
        const seat = role === "player" && w.players.has(uid) ? w.players.get(uid) : null;
        const want = raw && raw.watch != null ? w.sideOf.get(Number(raw.watch))?.key || String(raw.watch) : null;
        const key = seat ? seat.side : (w.sides.find((s) => s.key === want) || w.sides[0]).key;
        listen(w, key);
        socket.emit("tg:init", initFor(w, uid, seat ? "player" : "spectator", key));
      } catch (e) { console.error("together hello:", e.message); }
    });

    // A spectator switching sides.
    socket.on("tg:watch", (m) => {
      const w = m && typeof m.code === "string" ? worlds.get(m.code.toUpperCase()) : null;
      if (!w || w.players.has(uid) && !w.players.get(uid).left) return;
      const s = w.sides.find((x) => x.key === m.side);
      if (!s) return;
      listen(w, s.key);
      socket.emit("tg:init", initFor(w, uid, "spectator", s.key));
    });

    const mine = (m) => {
      if (!m || typeof m.code !== "string") return null;
      const w = worlds.get(m.code.toUpperCase());
      if (!w || w.over) return null;
      const p = w.players.get(uid);
      if (!p || p.left) return null;
      const s = w.sideOf.get(uid);
      if (!s || w.core.done(s.inst)) return null;
      return { w, s };
    };

    // Where my chef is (games where you walk about).
    socket.on("tg:me", (m) => {
      const got = mine(m);
      if (!got || !got.w.core.report) return;
      const snap = got.w.core.report(got.s.inst, uid, m, Date.now());
      if (snap) socket.emit("tg:snap", { code: got.w.code, ...snap });
    });

    // Something I did: { code, n, a, ... } — the answer comes back as tg:reply
    // with the same n, and everyone on the side sees the result next tick.
    socket.on("tg:act", (m) => {
      const got = mine(m);
      if (!got) return;
      let out = { ok: false };
      try { out = got.w.core.act(got.s.inst, uid, m, Date.now() - got.w.startMs) || { ok: false }; }
      catch (e) { console.error(`${got.w.game} act:`, e.message); }
      socket.emit("tg:reply", { code: got.w.code, n: m.n, a: m.a, ...out });
    });
  });
}

// Leaving mid-match: the seat stays so the result still counts, the side
// plays on without you, and when the last player has gone the match is over.
function forfeit(code, userId) {
  const w = worlds.get(String(code).toUpperCase());
  if (!w || w.over) return false;
  const p = w.players.get(Number(userId));
  if (!p || p.left) return false;
  p.left = true;
  const s = w.sideOf.get(p.id);
  if (s) w.core.removePlayer(s.inst, p.id);
  saveScores(w);
  if ([...w.players.values()].every((q) => q.left)) finish(w, "left");
  return true;
}

module.exports = {
  attach, forfeit, worldFor, isTogether, ready, GAMES: Object.keys(GAMES), COOP,
  _worlds: worlds, _buildWorld: buildWorld, _start: start, _tick: tick, _finish: finish, _setIo: (x) => { io = x; },
};
