// config/manorWorld.js — NANA'S LULLABY (slug "manor") online: the house, run by the server.
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
//   - Doors and hiding spots are the server's: a phone asks (manor:use) to
//     open or shut a door or to hide, and the server checks it is standing
//     there. A door one player shuts is shut for everyone, and for the
//     ghosts, which stop to open it. Someone hiding is safe from the ghosts;
//     one that watched them hide searches the spot a while, then gives up.
//
// A match ends the moment a side gets out (every key of theirs, then the far
// gate) — they've won — or when the clock runs out, or once everyone has
// left. Until then, being caught isn't the end: a scare, then back in at the
// entrance RESPAWN_MS later, keeping the keys you'd found.
// Score = escapes × ESCAPE_POINTS + every key taken × 100.
//
// Modes (rooms.mode):
//   free   every player for themselves, own-colour relics
//   teams  a colour per team; the team's relics and escapes are shared — any
//          member walking out once the gate is open scores for the team
//   coop   all together, gold relics, one score
// The side that got out has the only score at or over ESCAPE_POINTS, so it
// wins; if the clock ran out first, nobody did (config/matchResult.js
// decides, from stored scores).
const path = require("path");
const { pathToFileURL } = require("url");
const db = require("./db");
const { recordResults } = require("./recordResults");
const { tellFriends, roomChannel } = require("./socket");
const { ESCAPE_POINTS } = require("./matchResult");

const GAME = "manor";
const TICK_MS = 100;
const DT = TICK_MS / 1000;
const INTRO_MS = 8000;                 // ghosts asleep while everyone memorises the map
const KEEP_AFTER_MS = 120000;          // a finished house lingers for late hellos
const RESPAWN_MS = 2400;               // caught: the scare, then back in at the entrance
const RELIC_POINTS = 100;
const SNAP_AFTER = 4;                  // reports out of step before the phone is put back
const USE_REACH = 2.2;                 // a door or locker this near (tile centre) is in reach: a step, plus lag

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
  mode === "coop" ? 2 * players + 1 : mode === "teams" ? members + 2 : 3;

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
    ...s, need: needFor(mode, s.members.length, seats.length), got: 0, open: false, escapes: 0, total: 0,
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
      id, name: p.username, avatar: p.avatar, side: side.key, color: side.color,
      x: house.spawn.x, y: house.spawn.y, fa: 0, jz: 0, cr: 0, lit: true, noiseR: 0, hiding: null,
      at: 0, alive: !(saved && saved.left), left: !!(saved && saved.left), respawnAt: 0,
      caught: (saved && saved.caught) || 0,
    });
    // a house rebuilt after a restart keeps each side's escapes and relics
    if (saved) {
      side.escapes = Math.max(side.escapes, saved.escapes || 0);
      side.total = Math.max(side.total, saved.total || 0);
    }
  });
  const w = {
    code: room.room_code, roomId: room.id, mode, seed: room.seed,
    startMs: Date.now() - elapsedMs, durMs: room.duration_seconds * 1000,
    house, env: { g: house.g, N: house.N, obst: house.obst, doors: new Set(house.doors), switches: core.lampSwitches(house.g, house.N, new Set(house.doors), house.exitT) },
    sides, players, pulses: [], over: false, reason: null,
    events: [], timer: null, lastScores: new Map(),
  };
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
// running game of Nana's Lullaby. Calls at once (the room starting, phones
// saying hello) share one build, or two houses would tick into one room.
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
// ESCAPE_POINTS a time out, RELIC_POINTS a relic, summed over the match. One
// round's relics never reach ESCAPE_POINTS, so "got out at least once" is
// score >= ESCAPE_POINTS — which is what matchResult checks.
function scoreOf(side) {
  return side.escapes * ESCAPE_POINTS + side.total * RELIC_POINTS;
}

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
const toSpawn = (w, p) => { p.x = w.house.spawn.x; p.y = w.house.spawn.y; p.fa = 0; p.at = 0; p.hiding = null; };

// Out of it for now. Caught by a ghost: back in at the entrance shortly.
// Left (the Leave button, or the room's leave): out for good — and once
// everyone has left, the match is over.
function kill(w, id, cause) {
  const p = w.players.get(Number(id));
  if (!p || p.left || (!p.alive && cause !== "left")) return;
  p.alive = false;
  p.hiding = null;
  if (cause === "left") {
    p.left = true;
    p.respawnAt = 0;
    ev(w, { type: "dead", id: p.id, cause });
    if ([...w.players.values()].every((q) => q.left)) finish(w, "done");
    return;
  }
  p.caught++;
  p.respawnAt = Date.now() + RESPAWN_MS;
  ev(w, { type: "dead", id: p.id, cause });
}

// Through the far gate with the gate open: that side has won, and the match
// is over for everyone — the results, then Play again or leave.
function escape(w, p) {
  const side = sideOf(w, p);
  side.escapes++;
  ev(w, { type: "escaped", id: p.id, side: side.key, escapes: side.escapes });
  finish(w, "escaped");
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
  // her lullaby: humming, then the silence where she listens
  if (awake) {
    const hum = core.stepHum(w.house.hum, DT, w.house.rand);
    if (hum) ev(w, { type: hum });
  }

  // the just-back-in are left alone a moment; a lit room shows you like your own light
  const targets = living(w).filter((p) => !(p.graceUntil > now)).map((p) => ({
    id: p.id, x: p.x, y: p.y, lit: p.lit || core.lampOn(w.house.lamps, w.house.N, p.x, p.y), cr: p.cr, noiseR: p.noiseR, hid: p.hiding,
  }));
  if (awake) {
    w.house.ghosts.forEach((G, gi) => {
      const caught = core.stepGhost(G, w.env, targets, DT, w.house.rand, hustle(w), (name, extra) => {
        if (name === "heard") ev(w, { type: "heard", g: gi, id: extra.id });
        if (name === "spotted") ev(w, { type: "spotted", g: gi, id: extra.id });
        if (name === "door") ev(w, { type: "door", x: extra.x, y: extra.y, open: 1, id: 0 });
        if (name === "gaveup") ev(w, { type: "gaveup", id: extra.id });
      }, w.house.hum);
      if (caught != null && !w.over) {
        kill(w, caught, "ghost");
        // it has had its prey: off it goes, and the entrance isn't camped
        G.st = "patrol"; G.prey = null; G.stun = 2;
        core.ghostPatrol(G, w.env, w.house.rand);
      }
    });
    if (w.over) return;
    // walking into a lit room, she puts its light out
    core.stepLamps(w.house.lamps, w.house.N, w.house.ghosts, (room) => ev(w, { type: "lampOut", room }));
  }
  // the caught come back in — with her sent off to the far side of the house
  // if she's anywhere near the entrance, and a moment's grace
  for (const p of w.players.values()) {
    if (p.alive || p.left || !p.respawnAt || now < p.respawnAt) continue;
    p.alive = true;
    p.respawnAt = 0;
    toSpawn(w, p);
    p.graceUntil = now + core.GRACE_S * 1000;
    for (const G of w.house.ghosts) if (Math.hypot(G.x - p.x, G.y - p.y) < 14) core.sendAway(G, w.env, w.house.spawn, w.house.rand);
    ev(w, { type: "respawn", id: p.id, x: p.x, y: p.y, why: "caught" });
  }

  let scored = false;
  for (const p of living(w)) {
    const side = sideOf(w, p);
    for (let i = 0; i < w.house.relics.length; i++) {
      const r = w.house.relics[i];
      if (r.got || r.side !== side.key || Math.hypot(r.x - p.x, r.y - p.y) >= core.PICK_R) continue;
      r.got = true;
      side.got++;
      side.total++;
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
    if (side.open && Math.hypot(ex - p.x, ey - p.y) < core.EXIT_R) { escape(w, p); return; }
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
    // state: 1 in the house, 0 caught (back shortly), 3 left for good
    p: [...w.players.values()].map((p) => [p.id, r2(p.x), r2(p.y), r2(p.fa), r2(p.jz), r2(p.cr), p.lit ? 1 : 0,
      p.left ? 3 : p.alive ? 1 : 0, p.caught, p.hiding ? 1 : 0]),
    d: w.house.doors.map((k) => (w.house.g[(k / w.house.N) | 0][k % w.house.N] === core.DOOR ? 1 : 0)).join(""),
    r: w.house.relics.map((r) => (r.got ? 1 : 0)).join(""),
    b: w.house.batts.map((b) => (b.got ? 1 : 0)).join(""),
    s: w.sides.map((s) => [s.key, s.got, s.open ? 1 : 0, s.escapes, s.total, scoreOf(s)]),
    m: w.pulses.map((q) => [r2(q.x), r2(q.y), r2(q.t)]),
    // the lullaby: [humming?, seconds till it changes, seconds since it did]
    h: [w.house.hum.on ? 1 : 0, r2(w.house.hum.t), r2(w.house.hum.since)],
    l: w.house.lamps.join(""),                 // the rooms' lights
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

function initFor(w, uid, role) {
  return {
    code: w.code, mode: w.mode, you: uid, role,
    elapsed: Date.now() - w.startMs, duration: w.durMs, intro: INTRO_MS,
    house: {
      N: w.house.N, walls: core.packWalls(w.house.g), doors: w.house.doors, exitT: w.house.exitT, obst: w.house.obst,
      rooms: w.house.rooms,
      relics: w.house.relics.map((r) => [r.x, r.y, r.side, r.got ? 1 : 0]),
      batts: w.house.batts.map((b) => [b.x, b.y, b.got ? 1 : 0]),
      spawn: w.house.spawn, lamps: w.house.lamps,
    },
    sides: w.sides.map((s) => ({ key: s.key, name: s.name, color: s.color, need: s.need, got: s.got, open: s.open,
      escapes: s.escapes, total: s.total, score: scoreOf(s), members: s.members.map(Number) })),
    players: [...w.players.values()].map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, side: p.side, color: p.color,
      x: p.x, y: p.y, fa: p.fa, alive: p.alive, left: p.left, caught: p.caught,
    })),
    respawnMs: RESPAWN_MS,
    hum: [w.house.hum.on ? 1 : 0, w.house.hum.t, w.house.hum.since],
    over: w.over ? standings(w) : null,
  };
}

// ── sockets ──────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(n * 100) / 100;
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
      if (!p || !p.alive) return;
      const now = Date.now();
      if (p.hiding) { p.at = now; return; }            // in a locker: going nowhere
      const x = num(m.x, 0, w.house.N), y = num(m.y, 0, w.house.N);
      if (x != null && y != null) {
        // Accept it if you could have got there. If not, don't just keep the
        // old spot — one refusal used to freeze you there for good (every
        // later report looked like a teleport from it), and a ghost could
        // catch that frozen "you" while you walked about somewhere else.
        // Instead follow at running pace, and if the phone and the house
        // still disagree a moment later, or the phone has you inside a wall
        // or a shut door, put the phone back where the house has you.
        const since = p.at ? Math.min(1, (now - p.at) / 1000) : 1;
        const allowed = core.MAX_SPEED * since + 0.35;
        const d = Math.hypot(x - p.x, y - p.y);
        const okThere = core.canAt(w.house.g, x, y);
        if (d <= allowed && okThere) { p.x = x; p.y = y; p.off = 0; }
        else {
          if (d > allowed) {
            const k = allowed / d, nx = p.x + (x - p.x) * k, ny = p.y + (y - p.y) * k;
            if (core.canAt(w.house.g, nx, ny)) { p.x = nx; p.y = ny; }
          }
          p.off = (p.off || 0) + 1;
          if (!okThere || p.off >= SNAP_AFTER) {
            p.off = 0;
            socket.emit("manor:snap", { code: w.code, x: p.x, y: p.y });
          }
        }
      }
      p.at = now;
      p.fa = num(m.fa, -1e4, 1e4) ?? p.fa;
      p.jz = num(m.jz, 0, 1) ?? 0;
      p.cr = num(m.cr, 0, 1) ?? 0;
      p.lit = !!m.lit;
      p.noiseR = num(m.n, 0, 8) ?? 0;
    });

    // A room's light switch: { code, room, px, py }. Only from in that room,
    // within reach of its switch (judged from where the phone says it is,
    // if it could have got there — the last report can lag a step).
    socket.on("manor:lamp", (m) => {
      if (!m || typeof m.code !== "string") return;
      const w = worlds.get(m.code.toUpperCase());
      if (!w || w.over) return;
      const p = w.players.get(uid);
      if (!p || !p.alive || p.hiding) return;
      let fx = p.x, fy = p.y;
      const px = num(m.px, 0, w.house.N), py = num(m.py, 0, w.house.N);
      if (px != null && py != null && Math.hypot(px - p.x, py - p.y) <= core.MAX_SPEED + 0.6) { fx = px; fy = py; }
      const room = Number(m.room);
      const sw = [...w.env.switches.entries()].find(([, v]) => v.room === room);
      if (!sw || core.roomAt(w.house.N, fx, fy) !== room) return;
      const N = w.house.N, wx = sw[0] % N + 0.5, wy = Math.floor(sw[0] / N) + 0.5;
      if (Math.hypot(wx - fx, wy - fy) > USE_REACH + 0.6) return;
      w.house.lamps[room] = w.house.lamps[room] ? 0 : 1;
      ev(w, { type: "lamp", room, on: w.house.lamps[room], id: uid });
    });

    // Use: { code, act: open | close | hide | out, x, y }. Only the tile in
    // reach, and only what the tile allows; the answer goes back to the asker
    // (manor:used) and everyone sees the result in the next tick.
    socket.on("manor:use", (m) => {
      if (!m || typeof m.code !== "string") return;
      const w = worlds.get(m.code.toUpperCase());
      if (!w || w.over) return;
      const p = w.players.get(uid);
      if (!p || !p.alive) return;
      const reply = (ok, extra) => socket.emit("manor:used", { code: w.code, act: m.act, x: m.x, y: m.y, ok, ...extra });
      if (m.act === "out") {
        if (p.hiding) { core.leaveLocker(p); p.at = Date.now(); ev(w, { type: "locker", id: uid, in: 0 }); }
        return reply(true);
      }
      const x = num(m.x, 0, w.house.N - 1), y = num(m.y, 0, w.house.N - 1);
      if (x == null || y == null || p.hiding) return reply(false);
      const tx = Math.floor(x), ty = Math.floor(y), g = w.house.g;
      // Reach is judged from where the phone says it is — the last report can
      // lag a step behind — as long as that's somewhere it could have got to.
      let fx = p.x, fy = p.y;
      const px = num(m.px, 0, w.house.N), py = num(m.py, 0, w.house.N);
      if (px != null && py != null) {
        const since = p.at ? Math.min(1, (Date.now() - p.at) / 1000) : 1;
        if (Math.hypot(px - p.x, py - p.y) <= core.MAX_SPEED * since + 0.6) { fx = px; fy = py; }
      }
      if (Math.hypot(tx + 0.5 - fx, ty + 0.5 - fy) > USE_REACH) return reply(false, { why: "far" });
      if (m.act === "open") {
        if (g[ty][tx] !== core.DOOR) return reply(false);
        g[ty][tx] = core.FLOOR;
        ev(w, { type: "door", x: tx, y: ty, open: 1, id: uid });
        return reply(true);
      }
      if (m.act === "close") {
        const bodies = [...living(w).filter((q) => !q.hiding), ...w.house.ghosts];
        if (!core.canClose(w.env, tx, ty, bodies)) return reply(false);
        g[ty][tx] = core.DOOR;
        ev(w, { type: "door", x: tx, y: ty, open: 0, id: uid });
        return reply(true);
      }
      if (m.act === "hide") {
        if (g[ty][tx] !== core.SPOT) return reply(false);
        if ([...w.players.values()].some((q) => q.hiding && q.hiding.x === tx && q.hiding.y === ty)) return reply(false, { why: "taken" });
        const seenBy = core.watcher(w.house.ghosts, w.env, p, uid);
        core.hideIn(p, { x: tx, y: ty }, seenBy);
        ev(w, { type: "locker", id: uid, in: 1 });
        return reply(true, { seen: !!seenBy });
      }
      return reply(false);
    });

  });
}

// Leaving mid-match. The seat is kept so the result still counts — your
// side's score so far — and everyone else plays on to the end of the clock.
// When the last player has left, the match is over.
function forfeit(code, userId) {
  const w = worlds.get(code);
  if (!w || w.over) return false;
  const p = w.players.get(Number(userId));
  if (!p) return false;
  kill(w, p.id, "left");
  return true;
}

module.exports = { attach, forfeit, worldFor, coreReady, GAME, _worlds: worlds, _tick: tick, _buildWorld: buildWorld, _setIo: (x) => { io = x; } };
