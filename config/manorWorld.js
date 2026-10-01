// config/manorWorld.js — HOLLOW MANOR online: the house, run by the server.
//
// Every other PlayRoom game is a race on identical boards, so each phone can
// play its own copy and only scores travel. This one is a shared house with
// shared ghosts, and a ghost cannot live on a phone: lock that phone and the
// ghost would freeze for everyone. So the server keeps the house for each
// room in memory and runs it ten times a second.
//
// Who decides what:
//   - Each phone moves its own player (so walking feels instant) and reports
//     where it is ~15 times a second. The server refuses reports through a
//     wall or faster than anyone can run.
//   - The server moves the ghosts, and alone decides pickups, catches, who
//     got out, in what order, and when the match is over. It writes scores
//     to room_players itself; phones never post a score for this game.
//
// Modes (rooms.mode):
//   free   every player for themselves, own-colour relics; first out wins
//   teams  a colour per team; the team's door opens when its relics are all
//          taken; a team is placed when every surviving member is out
//   coop   all together, gold relics; everyone out wins, anyone caught and
//          it is lost for all
//
// A player is placed when they (or their side) get out. Places, relics and
// escape become a score — see scoreOf — and config/matchResult.js turns the
// scores into wins and losses without trusting anything a client sent.
const path = require("path");
const { pathToFileURL } = require("url");
const db = require("./db");
const { recordResults } = require("./recordResults");
const { tellFriends, roomChannel } = require("./socket");
const { ESCAPE_BONUS, PLACE_STEP } = require("./matchResult");

const GAME = "manor";
const TICK_MS = 100;
const DT = TICK_MS / 1000;
const INTRO_MS = 8000;                 // ghosts asleep while everyone memorises the map
const DECOYS = 2;
const KEEP_AFTER_MS = 120000;          // a finished house lingers for late hellos

// Colours for players in a free-for-all — no reds, which belong to the demon
// on the map — and the four team colours the waiting room already names
// (Red, Yellow, Blue, Green; the demon's map dot has a white ring to tell it
// from the Red team).
const PLAYER_COLOURS = ["#4cc9f0", "#8fe36b", "#ffc53d", "#c77dff", "#ff9f43", "#2de2c8", "#ff7bd5", "#a0a8ff"];
const TEAM_COLOURS = ["#ff5a5f", "#ffc53d", "#4cc9f0", "#3dd6c0"];
const TEAM_NAMES = ["Red", "Yellow", "Blue", "Green"];
const GOLD = "#ffdca0";

// How many relics each side hunts for. A team's share grows with its size,
// so the work per person stays about the same whatever the split.
const needFor = (mode, members, players) =>
  mode === "coop" ? 3 * players + 1 : mode === "teams" ? 2 * members + 1 : 3;

// The rules in manorCore.mjs are an ES module shared with the browser. The
// server is CommonJS, so it loads them once, asynchronously, at start-up.
let core = null;
const coreReady = import(pathToFileURL(path.join(__dirname, "..", "src", "components", "horror", "manorCore.mjs")).href)
  .then((m) => { core = m; return m; });

const worlds = new Map();              // room code -> house
let io = null;

// ── building a house ─────────────────────────────────────────────────────────

function sidesFor(mode, seats) {
  if (mode === "coop") {
    return [{ key: "all", name: "Together", color: GOLD, members: seats.map((p) => p.user_id) }];
  }
  if (mode === "teams") {
    const by = new Map();
    for (const p of seats) {
      const t = p.team == null ? `solo${p.user_id}` : `t${p.team}`;
      if (!by.has(t)) by.set(t, { key: t, team: p.team, members: [] });
      by.get(t).members.push(p.user_id);
    }
    return [...by.values()].sort((a, b) => (a.team || 99) - (b.team || 99)).map((s) => ({
      ...s,
      name: s.team ? TEAM_NAMES[(s.team - 1) % 4] : "Solo",
      color: s.team ? TEAM_COLOURS[(s.team - 1) % 4] : PLAYER_COLOURS[7],
    }));
  }
  return seats.map((p, i) => ({ key: `p${p.user_id}`, name: p.username, color: PLAYER_COLOURS[i % 8], members: [p.user_id] }));
}

function buildWorld(room, seats, elapsedMs) {
  const mode = room.mode === "teams" || room.mode === "coop" ? room.mode : "free";
  const sides = sidesFor(mode, seats).map((s) => ({
    ...s, need: needFor(mode, s.members.length, seats.length), got: 0, open: false, place: null, done: false,
  }));
  const house = core.buildHouse(room.seed, { players: seats.length, sides: sides.map((s) => ({ key: s.key, need: s.need })) });
  const sideOf = new Map();
  for (const s of sides) for (const id of s.members) sideOf.set(Number(id), s);
  const players = new Map();
  seats.forEach((p) => {
    const id = Number(p.user_id);
    const side = sideOf.get(id);
    const saved = parseSaved(p.game_state);
    players.set(id, {
      id, name: p.username, avatar: p.avatar, side: side.key,
      color: mode === "free" ? side.color : side.color,
      x: house.spawn.x, y: house.spawn.y, fa: 0, jz: 0, cr: 0, lit: true, noiseR: 0,
      at: 0, alive: saved ? saved.alive : true, escaped: saved ? saved.escaped : false,
      place: saved ? saved.place : null, cause: saved ? saved.cause : null, decoys: DECOYS,
    });
  });
  const w = {
    code: room.room_code, roomId: room.id, mode, seed: room.seed,
    startMs: Date.now() - elapsedMs, durMs: room.duration_seconds * 1000,
    house, env: { g: house.g, N: house.N, obst: house.obst },
    sides, players, pulses: [], places: 0, over: false, reason: null,
    events: [], timer: null, lastScores: new Map(),
  };
  // A house rebuilt after a restart keeps who was caught and who got out.
  for (const p of players.values()) if (p.place) w.places = Math.max(w.places, p.place);
  return w;
}

function parseSaved(raw) {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s && s.manor ? s.manor : null;
  } catch { return null; }
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

// The house for a room, building it on first use. Null if the room is not a
// running game of Hollow Manor.
async function worldFor(code) {
  if (worlds.has(code)) return worlds.get(code);
  await coreReady;
  const room = await loadRoom(code);
  if (!room || room.game_slug !== GAME || room.status !== "in_progress") return null;
  if (worlds.has(code)) return worlds.get(code);        // built while we waited
  const seats = await loadSeats(room.id);
  if (!seats.length) return null;
  const w = buildWorld(room, seats, Math.max(0, Number(room.elapsed_ms) || 0));
  worlds.set(code, w);
  w.timer = setInterval(() => { try { tick(w); } catch (e) { console.error("manor tick:", e); } }, TICK_MS);
  if (w.timer.unref) w.timer.unref();
  return w;
}

// ── scoring ──────────────────────────────────────────────────────────────────
// 100 a relic, and getting out is worth more than any number of relics:
// ESCAPE_BONUS, plus PLACE_STEP for every place you beat. So the order you got
// out in is the order the scores come in, which is all matchResult needs.
function scoreOf(side) {
  return side.got * 100 + (side.place ? ESCAPE_BONUS + (9 - side.place) * PLACE_STEP : 0);
}

async function saveScores(w, force = false) {
  const jobs = [];
  for (const p of w.players.values()) {
    const side = w.sides.find((s) => s.key === p.side);
    const score = scoreOf(side);
    const state = JSON.stringify({ manor: { alive: p.alive, escaped: p.escaped, place: p.place, cause: p.cause } });
    const key = `${score}|${state}|${side.got}`;
    if (!force && w.lastScores.get(p.id) === key) continue;
    w.lastScores.set(p.id, key);
    jobs.push(db.execute(
      `UPDATE room_players SET score = ?, pairs_matched = ?, game_state = ?
        WHERE room_id = ? AND user_id = ? AND is_spectator = 0`,
      [score, side.got, state, w.roomId, p.id]
    ).catch((e) => console.error("manor score write:", e.message)));
  }
  await Promise.all(jobs);
}

// ── the rules of a room ──────────────────────────────────────────────────────

const ev = (w, e) => w.events.push(e);
const sideOf = (w, p) => w.sides.find((s) => s.key === p.side);
const living = (w) => [...w.players.values()].filter((p) => p.alive && !p.escaped);

function kill(w, id, cause) {
  const p = w.players.get(Number(id));
  if (!p || !p.alive || p.escaped) return;
  p.alive = false;
  p.cause = cause;
  ev(w, { type: "dead", id: p.id, cause });
  if (w.mode === "coop") return finish(w, "lost");
  settleSides(w);
}

function escape(w, p) {
  p.escaped = true;
  const side = sideOf(w, p);
  if (w.mode === "free") { side.place = p.place = ++w.places; side.done = true; }
  ev(w, { type: "escaped", id: p.id, place: w.mode === "free" ? p.place : null });
  settleSides(w);
}

// A side is settled once none of its members is still inside. It is placed if
// any of them got out (a free-for-all side is placed the moment its one
// member escapes, in escape()).
function settleSides(w) {
  for (const s of w.sides) {
    if (s.done) continue;
    const members = s.members.map((id) => w.players.get(Number(id))).filter(Boolean);
    if (members.some((p) => p.alive && !p.escaped)) continue;
    s.done = true;
    if (members.some((p) => p.escaped)) {
      s.place = ++w.places;
      for (const p of members) if (p.escaped) p.place = s.place;
      ev(w, { type: "placed", side: s.key, place: s.place });
    }
  }
  if (w.sides.every((s) => s.done)) finish(w, w.mode === "coop" ? (w.sides[0].place ? "won" : "lost") : "done");
}

function hustle(w) {
  const total = w.sides.reduce((a, s) => a + s.need, 0);
  const got = w.sides.reduce((a, s) => a + s.got, 0);
  return total ? 0.6 * (got / total) : 0;
}

function tick(w) {
  if (w.over) return;
  const now = Date.now();
  if (now - w.startMs >= w.durMs) { finish(w, "time"); return; }
  const awake = now - w.startMs >= INTRO_MS;

  const targets = living(w).map((p) => ({ id: p.id, x: p.x, y: p.y, lit: p.lit, cr: p.cr, noiseR: p.noiseR }));
  if (awake) {
    w.house.ghosts.forEach((G, gi) => {
      const caught = core.stepGhost(G, w.env, targets, DT, w.house.rand, hustle(w), (name, extra) => {
        if (name === "spotted") ev(w, { type: "spotted", g: gi, id: extra.id });
      });
      if (caught != null && !w.over) kill(w, caught, "ghost");
    });
    if (w.over) return;
  }

  let scored = false;
  for (const p of living(w)) {
    const side = sideOf(w, p);
    for (let i = 0; i < w.house.relics.length; i++) {
      const r = w.house.relics[i];
      if (r.got || r.side !== side.key || Math.hypot(r.x - p.x, r.y - p.y) >= core.PICK_R) continue;
      r.got = true;
      side.got++;
      scored = true;
      ev(w, { type: "relic", i, id: p.id, side: side.key, got: side.got, need: side.need });
      // taking one is heard: every ghost not already hunting comes to look
      for (const G of w.house.ghosts) {
        if (G.st !== "hunt" && Math.hypot(G.x - p.x, G.y - p.y) < 14) { G.st = "search"; G.wait = 0; core.ghostTarget(G, w.env, p.x | 0, p.y | 0); }
      }
      if (side.got >= side.need && !side.open) { side.open = true; ev(w, { type: "open", side: side.key }); }
    }
    for (let i = 0; i < w.house.batts.length; i++) {
      const b = w.house.batts[i];
      if (b.got || Math.hypot(b.x - p.x, b.y - p.y) >= core.PICK_R) continue;
      b.got = true;
      ev(w, { type: "battery", i, id: p.id });
    }
    const ex = w.house.exitT.x + 0.5, ey = w.house.exitT.y + 0.5;
    if (side.open && Math.hypot(ex - p.x, ey - p.y) < core.EXIT_R) { escape(w, p); scored = true; if (w.over) return; }
  }
  w.pulses.forEach((q) => { q.t -= DT; });
  w.pulses = w.pulses.filter((q) => q.t > 0);

  if (scored || w.events.some((e) => e.type === "dead")) saveScores(w);
  broadcast(w, now);
}

function broadcast(w, now) {
  const r2 = (n) => Math.round(n * 100) / 100;
  io.to(roomChannel(w.code)).emit("manor:tick", {
    c: w.code,
    t: now - w.startMs,
    g: w.house.ghosts.map((G) => [r2(G.x), r2(G.y), G.st === "hunt" ? 1 : 0, G.stun > 0 ? 1 : 0]),
    p: [...w.players.values()].map((p) => [p.id, r2(p.x), r2(p.y), r2(p.fa), r2(p.jz), r2(p.cr), p.lit ? 1 : 0,
      p.escaped ? 2 : p.alive ? 1 : 0, p.place || 0]),
    r: w.house.relics.map((r) => (r.got ? 1 : 0)).join(""),
    b: w.house.batts.map((b) => (b.got ? 1 : 0)).join(""),
    s: w.sides.map((s) => [s.key, s.got, s.open ? 1 : 0, s.place || 0]),
    m: w.pulses.map((q) => [r2(q.x), r2(q.y), r2(q.t)]),
    e: w.events,
  });
  w.events = [];
}

// ── the end ──────────────────────────────────────────────────────────────────

async function finish(w, reason) {
  if (w.over) return;
  w.over = true;
  w.reason = reason;
  clearInterval(w.timer);
  broadcast(w, Date.now());                 // last events: who was caught, who got out
  try {
    await saveScores(w, true);
    const [r] = await db.execute(
      "UPDATE rooms SET status = 'finished', finished_at = NOW() WHERE id = ? AND status = 'in_progress'", [w.roomId]);
    if (r.affectedRows) {
      io.to(roomChannel(w.code)).emit("room:ended", { code: w.code });
      await announceStopped(w);
    }
    await recordResults(w.roomId);
  } catch (e) {
    console.error("manor finish:", e.message);
  }
  io.to(roomChannel(w.code)).emit("manor:over", standings(w));
  setTimeout(() => { if (worlds.get(w.code) === w) worlds.delete(w.code); }, KEEP_AFTER_MS).unref?.();
}

// Friends' "watch" buttons disappear once nobody is playing.
async function announceStopped(w) {
  for (const p of w.players.values()) tellFriends(io, p.id, { userId: p.id, playing: null });
}

function standings(w) {
  const sides = w.sides.map((s) => ({
    key: s.key, name: s.name, color: s.color, place: s.place, got: s.got, need: s.need, score: scoreOf(s),
    members: s.members.map((id) => {
      const p = w.players.get(Number(id));
      return p && { id: p.id, name: p.name, avatar: p.avatar, alive: p.alive, escaped: p.escaped, place: p.place, cause: p.cause };
    }).filter(Boolean),
  }));
  sides.sort((a, b) => (a.place || 99) - (b.place || 99) || b.got - a.got);
  return { code: w.code, mode: w.mode, reason: w.reason, sides };
}

// ── what a phone is told when it arrives ─────────────────────────────────────

function initFor(w, uid, role) {
  return {
    code: w.code, mode: w.mode, you: uid, role,
    elapsed: Date.now() - w.startMs, duration: w.durMs, intro: INTRO_MS,
    house: {
      N: w.house.N, walls: core.packWalls(w.house.g), exitT: w.house.exitT, obst: w.house.obst,
      relics: w.house.relics.map((r) => [r.x, r.y, r.side, r.got ? 1 : 0]),
      batts: w.house.batts.map((b) => [b.x, b.y, b.got ? 1 : 0]),
      spawn: w.house.spawn,
    },
    sides: w.sides.map((s) => ({ key: s.key, name: s.name, color: s.color, need: s.need, got: s.got, open: s.open, place: s.place, members: s.members.map(Number) })),
    players: [...w.players.values()].map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, side: p.side, color: p.color,
      x: p.x, y: p.y, fa: p.fa, alive: p.alive, escaped: p.escaped, place: p.place, decoys: p.decoys,
    })),
    over: w.over ? standings(w) : null,
  };
}

// ── sockets ──────────────────────────────────────────────────────────────────

const CODE_RE = /^[A-Z0-9]{4,8}$/;
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };

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

    socket.on("manor:hello", async (raw) => {
      try {
        const code = typeof raw === "string" ? raw.toUpperCase() : "";
        if (!CODE_RE.test(code)) return;
        const role = await roleOf(code, uid);
        if (!role) return;
        let w = worlds.get(code);
        if (!w) w = await worldFor(code);
        if (!w) return socket.emit("manor:gone", { code });
        socket.join(roomChannel(code));
        // A seat in the room but not in the house (joined after it was
        // built): watch it rather than play it.
        const r = role === "player" && w.players.has(uid) ? "player" : "spectator";
        socket.emit("manor:init", initFor(w, uid, r));
      } catch (e) { console.error("manor hello:", e.message); }
    });

    // Where I am. Refused if it walks through a wall or outruns a sprint.
    socket.on("manor:me", (m) => {
      if (!m || typeof m.code !== "string") return;
      const w = worlds.get(m.code.toUpperCase());
      if (!w || w.over) return;
      const p = w.players.get(uid);
      if (!p || !p.alive || p.escaped) return;
      const x = num(m.x, 0, w.house.N), y = num(m.y, 0, w.house.N);
      const now = Date.now();
      if (x != null && y != null) {
        const since = p.at ? Math.min(1, (now - p.at) / 1000) : 1;
        const far = Math.hypot(x - p.x, y - p.y) > core.MAX_SPEED * since + 0.35;
        if (!far && core.canAt(w.house.g, x, y)) { p.x = x; p.y = y; }
      }
      p.at = now;
      p.fa = num(m.fa, -1e4, 1e4) ?? p.fa;
      p.jz = num(m.jz, 0, 1) ?? 0;
      p.cr = num(m.cr, 0, 1) ?? 0;
      p.lit = !!m.lit;
      p.noiseR = num(m.n, 0, 8) ?? 0;
    });

    socket.on("manor:decoy", (raw) => {
      const code = typeof raw === "string" ? raw.toUpperCase() : "";
      const w = worlds.get(code);
      if (!w || w.over) return;
      const p = w.players.get(uid);
      if (!p || !p.alive || p.escaped) return;
      const reply = (ok, why) => socket.emit("manor:decoyed", { ok, why, left: p.decoys });
      if (!p.decoys) return reply(false, "empty");
      let G = null, gd = Infinity;
      for (const g of w.house.ghosts) { const d = Math.hypot(g.x - p.x, g.y - p.y); if (d < gd) { G = g; gd = d; } }
      if (w.house.ghosts.some((g) => g.st === "hunt" && g.prey === uid && g.lose < 1)) return reply(false, "watched");
      p.decoys--;
      w.pulses.push({ x: p.x, y: p.y, t: 8 });
      if (G) { G.st = "search"; G.wait = -4; G.stun = 0; G.prey = null; core.ghostTarget(G, w.env, p.x | 0, p.y | 0); }
      ev(w, { type: "decoy", id: uid });
      reply(true);
    });
  });
}

// Leaving mid-match. The seat is kept so the result still counts: you are
// out, as if caught. In co-op that ends it for everyone.
function forfeit(code, userId) {
  const w = worlds.get(code);
  if (!w || w.over) return false;
  const p = w.players.get(Number(userId));
  if (!p) return false;
  if (p.alive && !p.escaped) kill(w, p.id, "left");
  return true;
}

module.exports = { attach, forfeit, worldFor, coreReady, GAME, _worlds: worlds, _tick: tick, _buildWorld: buildWorld, _setIo: (x) => { io = x; } };
