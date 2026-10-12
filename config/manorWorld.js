// config/manorWorld.js — STATION 13 (slug "manor") online: the hospital, run by the server.
//
// Every other PlayRoom game is a race on identical boards, so each phone can
// play its own copy and only scores travel. This one is a shared building
// with shared monsters, and a monster cannot live on a phone: lock that phone
// and it would freeze for everyone. So the server keeps the building for each
// room in memory and runs it ten times a second.
//
// Who decides what:
//   - Each phone moves its own player (so walking feels instant) and reports
//     where it is ~15 times a second — and whether its torch is on, whether
//     it's moving or running. The server refuses reports through a wall or
//     faster than anyone can run.
//   - The server runs the monsters (s13Core.stepMonster: sleep, patrol,
//     investigate, notice, chase, rear and lunge) and alone decides pickups,
//     the power coming back, catches, who got out and when the match is over.
//     It writes scores to room_players itself; phones never post a score.
//   - Lockers are the server's: a phone asks (manor:use) to hide or come out,
//     and the server checks it is standing there and the locker is free.
//
// The building is the same for everyone: every phone builds it from the
// room's seed (genStation), as the server does. The fuses: each side hunts
// its own NEED, in its own colour (together, one side: the whole team's);
// every fuse anyone takes brings two more zones' lights back, for everyone.
// A side with all its fuses can take the elevator: the first side out wins,
// and that ends it — or the clock does, or everyone leaving. Caught isn't
// the end: a scare, then back in the Main Hall RESPAWN_MS later, keeping
// your fuses, with a moment's grace and the monsters sent away.
// Score = escapes × ESCAPE_POINTS + every fuse taken × 100.
//
// Modes (rooms.mode):
//   free   every player for themselves, own-colour fuses
//   teams  a colour per team; the team's fuses and escape are shared
//   coop   all together, one set of fuses, one score
const path = require("path");
const { pathToFileURL } = require("url");
const db = require("./db");
const { recordResults } = require("./recordResults");
const { tellFriends, roomChannel } = require("./socket");
const { ESCAPE_POINTS } = require("./matchResult");

const GAME = "manor";
const TICK_MS = 100;
const DT = TICK_MS / 1000;
const KEEP_AFTER_MS = 120000;          // a finished building lingers for late hellos
const RESPAWN_MS = 2400;               // caught: the scare, then back in the Main Hall
const FUSE_POINTS = 100;
const SNAP_AFTER = 4;                  // reports out of step before the phone is put back
const USE_REACH = 2.2;                 // a locker this near (its tile centre) is in reach: a step, plus lag

// Colours for players in a free-for-all, and the four team colours the
// waiting room already names (Red, Yellow, Blue, Green).
const PLAYER_COLOURS = ["#4cc9f0", "#8fe36b", "#ffc53d", "#c77dff", "#ff9f43", "#2de2c8", "#ff7bd5", "#a0a8ff"];
const TEAM_COLOURS = ["#ff5a5f", "#ffc53d", "#4cc9f0", "#3dd6c0"];
const TEAM_NAMES = ["Red", "Yellow", "Blue", "Green"];
const GOLD = "#ffdca0";

// The rules in s13Core.mjs are an ES module shared with the browser. The
// server is CommonJS, so it loads them once, asynchronously, at start-up.
let core = null;
const coreReady = import(pathToFileURL(path.join(__dirname, "..", "src", "components", "horror", "s13Core.mjs")).href)
  .then((m) => { core = m; return m; });

const worlds = new Map();              // room code -> building
let io = null;

// ── building a world ─────────────────────────────────────────────────────────

function sidesFor(mode, seats) {
  if (mode === "coop") return [{ key: "all", name: "Together", color: GOLD, members: seats.map((p) => p.user_id) }];
  if (mode === "teams") {
    const by = new Map();
    for (const p of seats) {
      const t = p.team == null ? `solo${p.user_id}` : `t${p.team}`;
      if (!by.has(t)) by.set(t, { key: t, team: p.team, members: [] });
      by.get(t).members.push(p.user_id);
    }
    return [...by.values()].sort((a, b) => (a.team || 99) - (b.team || 99)).map((s) => ({
      ...s, name: s.team ? TEAM_NAMES[(s.team - 1) % 4] : "Solo", color: s.team ? TEAM_COLOURS[(s.team - 1) % 4] : PLAYER_COLOURS[7],
    }));
  }
  return seats.map((p, i) => ({ key: `p${p.user_id}`, name: p.username, color: PLAYER_COLOURS[i % 8], members: [p.user_id] }));
}

function buildWorld(room, seats, elapsedMs) {
  const mode = room.mode === "teams" || room.mode === "coop" ? room.mode : "free";
  const sides = sidesFor(mode, seats).map((s) => ({ ...s, need: core.NEED, got: 0, open: false, escapes: 0, total: 0 }));
  const st = core.genStation(room.seed);
  const { items, lockers } = core.placeItems(st, room.seed, sides.map((s) => ({ key: s.key, need: s.need })), seats.length);
  const monsters = core.placeMonsters(st, room.seed, core.monstersFor(seats.length));
  const sideOf = new Map();
  for (const s of sides) for (const id of s.members) sideOf.set(Number(id), s);
  const players = new Map();
  seats.forEach((p, i) => {
    const id = Number(p.user_id), side = sideOf.get(id), saved = parseSaved(p.game_state);
    const at = startSpot(st, i);                      // side by side in the Main Hall
    players.set(id, {
      id, name: p.username, avatar: p.avatar, side: side.key, color: side.color,
      x: at.x, y: at.y, yaw: core.START.yaw, fl: true, moving: false, run: false, hid: null,
      at: 0, alive: !(saved && saved.left), left: !!(saved && saved.left), respawnAt: 0, graceUntil: 0,
      caught: (saved && saved.caught) || 0,
    });
    // a building rebuilt after a restart keeps each side's escapes and fuses
    if (saved) { side.escapes = Math.max(side.escapes, saved.escapes || 0); side.total = Math.max(side.total, saved.total || 0); }
  });
  return {
    code: room.room_code, roomId: room.id, mode, seed: room.seed,
    startMs: Date.now() - elapsedMs, durMs: room.duration_seconds * 1000,
    st, items, lockers, monsters, rand: core.rng((Number(room.seed) || 1) + 5150), fuses: 0, lit: core.litZones(0),
    sides, players, over: false, reason: null, events: [], timer: null, lastScores: new Map(),
  };
}
// the start, a little apart for each player
function startSpot(st, i) {
  const offs = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, 1], [-2, 0]];
  const [a, b] = offs[i % offs.length], x = core.START.x + a, y = core.START.y + b;
  return core.canAt(st.g, x, y) ? { x, y } : { x: core.START.x, y: core.START.y };
}

function parseSaved(raw) {
  if (!raw) return null;
  try { const s = JSON.parse(raw); return s && s.manor ? s.manor : null; } catch { return null; }
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

// The building for a room, made on first use. Null if the room is not a
// running game of Station 13. Calls at once share one build.
const building = new Map();
function worldFor(code) {
  if (worlds.has(code)) return Promise.resolve(worlds.get(code));
  if (!building.has(code)) building.set(code, buildFor(code).finally(() => building.delete(code)));
  return building.get(code);
}
async function buildFor(code) {
  await coreReady;
  const room = await loadRoom(code);
  if (!room || room.game_slug !== GAME || room.status !== "in_progress") return null;
  if (worlds.has(code)) return worlds.get(code);
  const seats = await loadSeats(room.id);
  if (!seats.length) return null;
  const w = buildWorld(room, seats, Math.max(0, Number(room.elapsed_ms) || 0));
  worlds.set(code, w);
  w.timer = setInterval(() => { try { tick(w); } catch (e) { console.error("manor tick:", e); } }, TICK_MS);
  if (w.timer.unref) w.timer.unref();
  return w;
}

// ── scoring ──────────────────────────────────────────────────────────────────
// One round's fuses (NEED × 100) never reach ESCAPE_POINTS, so "got out at
// least once" is score >= ESCAPE_POINTS — which is what matchResult checks.
function scoreOf(side) { return side.escapes * ESCAPE_POINTS + side.total * FUSE_POINTS; }

async function saveScores(w, force = false) {
  const jobs = [];
  for (const p of w.players.values()) {
    const side = w.sides.find((s) => s.key === p.side);
    const score = scoreOf(side);
    const state = JSON.stringify({ manor: { left: p.left, caught: p.caught, escapes: side.escapes, total: side.total } });
    const key = `${score}|${state}`;
    if (!force && w.lastScores.get(p.id) === key) continue;
    w.lastScores.set(p.id, key);
    jobs.push(db.execute(
      `UPDATE room_players SET score = ?, pairs_matched = ?, game_state = ?
        WHERE room_id = ? AND user_id = ? AND is_spectator = 0`,
      [score, side.total, state, w.roomId, p.id]
    ).catch((e) => console.error("manor score write:", e.message)));
  }
  await Promise.all(jobs);
}

// ── the rules of a room ──────────────────────────────────────────────────────

const ev = (w, e) => w.events.push(e);
const sideOf = (w, p) => w.sides.find((s) => s.key === p.side);
const living = (w) => [...w.players.values()].filter((p) => p.alive && !p.left);
const mostFuses = (w) => Math.max(0, ...w.sides.map((s) => s.got));

// Out of it for now (caught), or for good (left — and once everyone has, it's over).
function kill(w, id, cause, by = null) {
  const p = w.players.get(Number(id));
  if (!p || p.left || (!p.alive && cause !== "left")) return;
  p.alive = false;
  p.hid = null;
  if (cause === "left") {
    p.left = true; p.respawnAt = 0;
    ev(w, { type: "dead", id: p.id, cause });
    if ([...w.players.values()].every((q) => q.left)) finish(w, "done");
    return;
  }
  p.caught++;
  p.respawnAt = Date.now() + RESPAWN_MS;
  ev(w, { type: "dead", id: p.id, cause, m: by });
}

// Into the elevator with all your fuses: that side has won, and it's over.
function escape(w, p) {
  const side = sideOf(w, p);
  side.escapes++;
  ev(w, { type: "escaped", id: p.id, side: side.key, escapes: side.escapes });
  finish(w, "escaped");
}

function tick(w) {
  if (w.over) return;
  const now = Date.now();
  if (w.durMs > 0 && now - w.startMs >= w.durMs) { finish(w, "time"); return; }      // 0: unlimited
  const targets = living(w).filter((p) => !(p.graceUntil > now)).map((p) => ({
    id: p.id, x: p.x, y: p.y, fl: p.fl, hid: p.hid != null, moving: p.moving, run: p.run,
  }));
  const ctx = { lit: w.lit, fuses: mostFuses(w) };
  w.monsters.forEach((M, mi) => {
    const got = core.stepMonster(M, w.st, targets, DT, w.rand, ctx, (name, o) => {
      if (name === "notice" || name === "chase" || name === "rear" || name === "heard") ev(w, { type: name, m: mi, id: o.id });
      else if (name === "lostsight" || name === "gaveup") ev(w, { type: name, m: mi, id: o.id || null });
      else if (name === "zone") ev(w, { type: "zone", m: mi, x: Math.round(o.x * 10) / 10, y: Math.round(o.y * 10) / 10 });
      else if (name === "door") ev(w, { type: "door", m: mi, i: o.i });
      else if (name === "wake") ev(w, { type: "wake", m: mi });
    });
    if (got && !w.over) {
      kill(w, got.id, "monster", mi);
      // it has had its prey: off it goes on its rounds
      M.st = "patrol"; M.prey = null; M.wd = 0; M.lg = 0; M.nt = 0;
      core.pickPatrol(M, w.st, w.rand);
      const i = targets.findIndex((t) => t.id === got.id); if (i >= 0) targets.splice(i, 1);
    }
  });
  if (w.over) return;
  // the caught come back in — in the Main Hall, with a moment's grace and the monsters sent away
  for (const p of w.players.values()) {
    if (p.alive || p.left || !p.respawnAt || now < p.respawnAt) continue;
    p.alive = true; p.respawnAt = 0; p.hid = null;
    const at = startSpot(w.st, 0);
    p.x = at.x; p.y = at.y; p.yaw = core.START.yaw; p.at = 0;
    p.graceUntil = now + core.GRACE_S * 1000;
    for (const M of w.monsters) if (M.st !== "sleep" && Math.hypot(M.x - p.x, M.y - p.y) < 14) core.sendAway(M, w.st, p, w.rand);
    ev(w, { type: "respawn", id: p.id, x: p.x, y: p.y, yaw: p.yaw });
  }

  let scored = false;
  for (const p of living(w)) {
    const side = sideOf(w, p);
    for (let i = 0; i < w.items.length; i++) {
      const it = w.items[i];
      if (it.got || Math.hypot(it.x - p.x, it.y - p.y) >= core.PICK_R) continue;
      if (it.t === "f") {
        if (it.side !== side.key) continue;            // someone else's fuse
        it.got = true; side.got++; side.total++; w.fuses++; scored = true;
        w.lit = core.litZones(w.fuses);
        ev(w, { type: "fuse", i, id: p.id, side: side.key, got: side.got, need: side.need });
        // picking one up is noisy: the nearest monster not already chasing comes to look
        const free = w.monsters.filter((M) => M.st !== "chase" && M.st !== "sleep").sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (free) { free.st = "invest"; free.wait = 0; core.setTarget(free, w.st, p.x | 0, p.y | 0); }
        if (side.got >= side.need && !side.open) { side.open = true; ev(w, { type: "open", side: side.key }); }
      } else { it.got = true; ev(w, { type: "battery", i, id: p.id }); }
    }
    if (side.open && core.atExit(p.x, p.y)) { escape(w, p); return; }
  }
  if (scored || w.events.some((e) => e.type === "dead")) saveScores(w);
  broadcast(w, now);
}

const MST = ["sleep", "patrol", "invest", "notice", "chase"];
function broadcast(w, now) {
  const r2 = (n) => Math.round(n * 100) / 100;
  io.to(roomChannel(w.code)).emit("manor:tick", {
    c: w.code,
    t: now - w.startMs,
    // the monsters: [x, y, state, facing x, facing y, moving, rearing, lunging, warning]
    g: w.monsters.map((M) => [r2(M.x), r2(M.y), MST.indexOf(M.st), r2(M.vx), r2(M.vy), M.moving ? 1 : 0, M.wd > 0 ? 1 : 0, M.lg > 0 ? 1 : 0, M.nt > 0 ? 1 : 0]),
    // state: 1 in the building, 0 caught (back shortly), 3 left for good
    p: [...w.players.values()].map((p) => [p.id, r2(p.x), r2(p.y), r2(p.yaw), p.left ? 3 : p.alive ? 1 : 0, p.caught, p.hid != null ? 1 : 0, p.fl ? 1 : 0]),
    r: w.items.map((it) => (it.got ? 1 : 0)).join(""),
    s: w.sides.map((s) => [s.key, s.got, s.open ? 1 : 0, s.escapes, s.total, scoreOf(s)]),
    f: w.fuses,
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
  broadcast(w, Date.now());
  try {
    await saveScores(w, true);
    const [r] = await db.execute("UPDATE rooms SET status = 'finished', finished_at = NOW() WHERE id = ? AND status = 'in_progress'", [w.roomId]);
    if (r.affectedRows) {
      io.to(roomChannel(w.code)).emit("room:ended", { code: w.code });
      await announceStopped(w);
    }
    await recordResults(w.roomId);
  } catch (e) { console.error("manor finish:", e.message); }
  io.to(roomChannel(w.code)).emit("manor:over", standings(w));
  setTimeout(() => { if (worlds.get(w.code) === w) worlds.delete(w.code); }, KEEP_AFTER_MS).unref?.();
}

// Friends' "watch" buttons disappear once nobody is playing.
async function announceStopped(w) {
  for (const p of w.players.values()) tellFriends(io, p.id, { userId: p.id, playing: null });
}

function standings(w) {
  const sides = w.sides.map((s) => ({
    key: s.key, name: s.name, color: s.color, escapes: s.escapes, total: s.total, need: s.need, score: scoreOf(s),
    members: s.members.map((id) => {
      const p = w.players.get(Number(id));
      return p && { id: p.id, name: p.name, avatar: p.avatar, caught: p.caught, left: p.left };
    }).filter(Boolean),
  }));
  sides.sort((a, b) => b.score - a.score);
  return { code: w.code, mode: w.mode, reason: w.reason, sides };
}

// ── what a phone is told when it arrives ─────────────────────────────────────
// The seed (each phone builds the same building from it), the fuses and
// batteries, the lockers, the sides and the players.
function initFor(w, uid, role) {
  return {
    code: w.code, mode: w.mode, you: uid, role, seed: w.seed,
    elapsed: Date.now() - w.startMs, duration: w.durMs,
    items: w.items.map((it) => [it.x, it.y, it.t, it.side || "", it.got ? 1 : 0]),
    lockers: w.lockers.map((l) => [l.x, l.y, l.nx, l.ny]),
    fuses: w.fuses,
    sides: w.sides.map((s) => ({ key: s.key, name: s.name, color: s.color, need: s.need, got: s.got, open: s.open,
      escapes: s.escapes, total: s.total, score: scoreOf(s), members: s.members.map(Number) })),
    players: [...w.players.values()].map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, side: p.side, color: p.color,
      x: p.x, y: p.y, yaw: p.yaw, alive: p.alive, left: p.left, caught: p.caught,
    })),
    monsters: w.monsters.length,
    respawnMs: RESPAWN_MS,
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
        // a seat in the room but not in the building (joined after it was made): watch it
        const r = role === "player" && w.players.has(uid) ? "player" : "spectator";
        socket.emit("manor:init", initFor(w, uid, r));
      } catch (e) { console.error("manor hello:", e.message); }
    });

    // Where I am, which way I face, my torch, whether I'm moving or running.
    // Refused if it walks through a wall or outruns a sprint.
    socket.on("manor:me", (m) => {
      if (!m || typeof m.code !== "string") return;
      const w = worlds.get(m.code.toUpperCase());
      if (!w || w.over) return;
      const p = w.players.get(uid);
      if (!p || !p.alive) return;
      const now = Date.now();
      p.yaw = num(m.yaw, -1e4, 1e4) ?? p.yaw;
      p.fl = !!m.fl;
      if (p.hid != null) { p.at = now; p.moving = false; p.run = false; return; }      // in a locker: going nowhere
      p.moving = !!m.mv; p.run = !!m.run && p.moving;
      const x = num(m.x, 0, core.N), y = num(m.y, 0, core.N);
      if (x == null || y == null) return;
      // Accept it if you could have got there; if not, follow at running
      // pace, and if the phone and the building still disagree a moment
      // later — or the phone has you inside a wall — put the phone back.
      const since = p.at ? Math.min(1, (now - p.at) / 1000) : 1;
      const allowed = core.MAX_SPEED * since + 0.35;
      const d = Math.hypot(x - p.x, y - p.y), okThere = core.canAt(w.st.g, x, y);
      if (d <= allowed && okThere) { p.x = x; p.y = y; p.off = 0; }
      else {
        if (d > allowed) { const k = allowed / d, nx = p.x + (x - p.x) * k, ny = p.y + (y - p.y) * k; if (core.canAt(w.st.g, nx, ny)) { p.x = nx; p.y = ny; } }
        p.off = (p.off || 0) + 1;
        if (!okThere || p.off >= SNAP_AFTER) { p.off = 0; socket.emit("manor:snap", { code: w.code, x: p.x, y: p.y }); }
      }
      p.at = now;
    });

    // Use: { code, act: hide | out, px, py } — a locker in reach and free, or out of yours.
    socket.on("manor:use", (m) => {
      if (!m || typeof m.code !== "string") return;
      const w = worlds.get(m.code.toUpperCase());
      if (!w || w.over) return;
      const p = w.players.get(uid);
      if (!p || !p.alive) return;
      const reply = (ok, extra) => socket.emit("manor:used", { code: w.code, act: m.act, ok, ...extra });
      if (m.act === "out") {
        if (p.hid != null) { p.hid = null; p.at = Date.now(); ev(w, { type: "locker", id: uid, in: 0 }); }
        return reply(true);
      }
      if (m.act !== "hide" || p.hid != null) return reply(false);
      let fx = p.x, fy = p.y;
      const px = num(m.px, 0, core.N), py = num(m.py, 0, core.N);
      if (px != null && py != null) { const since = p.at ? Math.min(1, (Date.now() - p.at) / 1000) : 1; if (Math.hypot(px - p.x, py - p.y) <= core.MAX_SPEED * since + 0.6) { fx = px; fy = py; } }
      // the nearest within reach, and a free one: two lockers can stand side by side
      let li = -1, bd = USE_REACH;
      w.lockers.forEach((l, i) => { const d = Math.hypot(l.x - fx, l.y - fy); if (d < bd && ![...w.players.values()].some((q) => q.hid === i)) { bd = d; li = i; } });
      if (li < 0) return reply(false, { why: w.lockers.some((l) => Math.hypot(l.x - fx, l.y - fy) < USE_REACH) ? "taken" : "far" });
      const l = w.lockers[li];
      p.hid = li; p.x = l.x; p.y = l.y; p.moving = false; p.run = false; p.at = Date.now();
      ev(w, { type: "locker", id: uid, in: 1 });
      return reply(true, { i: li });
    });
  });
}

// Leaving mid-match. The seat is kept so the result still counts — your
// side's score so far — and everyone else plays on to the end of the clock.
function forfeit(code, userId) {
  const w = worlds.get(code);
  if (!w || w.over) return false;
  const p = w.players.get(Number(userId));
  if (!p) return false;
  kill(w, p.id, "left");
  return true;
}

module.exports = { attach, forfeit, worldFor, coreReady, GAME, _worlds: worlds, _tick: tick, _buildWorld: buildWorld, _setIo: (x) => { io = x; } };
