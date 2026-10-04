// src/components/together/bombCore.mjs
// BOMB BLAST — an arena seen from above: pillars that never break, bricks
// that do, and bombers who drop bombs that go off in a + of flame. The
// rules, the arena and the computer bombers, shared by the server
// (config/togetherWorld.js runs one arena per room) and the phones (which
// move their own bomber at once and draw). No React, no network:
// scripts/check-bomb.mjs plays whole rounds with it.
//
// A bomb goes off after FUSE seconds: the flames run RANGE tiles each way,
// stop at a pillar, break the first brick they reach (sometimes there's a
// power-up under it), set off any bomb they touch, and knock out anyone
// standing in them — you too. Last side standing wins the round; then a new
// arena, until the clock runs out. After SHRINK_AT seconds the arena closes
// in from the edges, so a round can't drag on.
//
// Sides:
//   solo   you against three computer bombers (Easy / Medium / Hard)
//   free   everyone for themselves — only the people in the room, no computer
//   teams  two sides; a partner's flames don't hurt you
//   coop   all of you on one side against two computer bombers
// Points: 100 for a round won, 25 for knocking out someone on another side.
import { seededRand } from "./rand.mjs";

export const GAME = "bomb";
export const SHARED = true;
export const TICK_MS = 100;
export const W = 11, H = 13;
export const FLOOR = 0, SOLID = 1, BRICK = 2;
export const FUSE = 2.4;
export const FIRE_S = 0.55;
export const SPEED = 3.2, SPEED_UP = 0.5, SPEED_MAX = 5.2;
// a blast of one to start: from any start there's a safe tile two steps away
export const START_BOMBS = 1, START_RANGE = 1, MAX_BOMBS = 6, MAX_RANGE = 7;
export const PAUSE_S = 3.2;
export const SHRINK_AT = 60, SHRINK_EVERY = 0.4;
export const WIN_PTS = 100, KO_PTS = 25;
export const LEVELS = ["easy", "medium", "hard"];
export const POWERS = { bomb: "💣", fire: "🔥", speed: "👟" };
export const SPAWNS = [[1, 1], [W - 2, H - 2], [W - 2, 1], [1, H - 2], [5, 1], [5, H - 2]];
export const COLOURS = ["#FFFFFF", "#FF6B6B", "#4CC9F0", "#8FDB5C", "#FFC53D", "#C77DFF"];
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const idx = (x, y) => y * W + x;
export const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

// ── an arena ─────────────────────────────────────────────────────────────────
export function buildArena(seed, round, spawns) {
  const r = seededRand((Number(seed) || 1) * 37 + round * 1009 + 3);
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || (x % 2 === 0 && y % 2 === 0)) g[idx(x, y)] = SOLID;
  }
  // room to move round every bomber's start
  const clear = new Set();
  for (const [sx, sy] of spawns) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) clear.add(idx(sx + dx, sy + dy));
  const pow = new Map();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const k = idx(x, y);
    if (g[k] !== FLOOR || clear.has(k)) continue;
    if (r() < 0.68) {
      g[k] = BRICK;
      if (r() < 0.3) { const q = r(); pow.set(k, q < 0.4 ? "bomb" : q < 0.8 ? "fire" : "speed"); }
    }
  }
  return { g, hidden: pow };
}

// The order the arena closes in: round the outside, then the next ring in.
const SPIRAL = (() => {
  const out = [];
  let x0 = 1, y0 = 1, x1 = W - 2, y1 = H - 2;
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) out.push(idx(x, y0));
    for (let y = y0 + 1; y <= y1; y++) out.push(idx(x1, y));
    if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) out.push(idx(x, y1));
    if (x1 > x0) for (let y = y1 - 1; y > y0; y--) out.push(idx(x0, y));
    x0++; y0++; x1--; y1--;
  }
  return out;
})();

// ── moving ───────────────────────────────────────────────────────────────────
// A bomber walks the lanes: along a row it keeps to the row's middle, and it
// turns a corner by sliding to the nearest open lane. `open(tx, ty)` says
// whether this bomber may step into a tile. (dx, dy): one of the four ways.
export function moveBody(open, b, dx, dy, dist) {
  if (!dx && !dy) return;
  const horiz = dx !== 0;
  const along = horiz ? "x" : "y", across = horiz ? "y" : "x";
  const d = horiz ? dx : dy;
  const cell = (a, c) => (horiz ? open(a, c) : open(c, a));       // a: along, c: across
  const ta = Math.floor(b[along]);
  const pos = b[across], here = Math.floor(pos);
  // which lane: this one if it leads on, else the neighbour we lean toward
  let lane = null;
  if (cell(ta + d, here)) lane = here;
  else {
    const other = pos >= here + 0.5 ? here + 1 : here - 1;
    if (Math.abs(pos - (here + 0.5)) > 0.05 && cell(ta, other) && cell(ta + d, other)) lane = other;
  }
  if (lane === null) {
    // nowhere to go: walk up to the middle of this tile and stop
    const mid = ta + 0.5;
    b[along] = d > 0 ? Math.min(b[along] + dist, Math.max(b[along], mid)) : Math.max(b[along] - dist, Math.min(b[along], mid));
    return;
  }
  const target = lane + 0.5;
  const off = target - b[across];
  if (Math.abs(off) > 0.001) {
    const s = Math.min(Math.abs(off), dist);
    b[across] += Math.sign(off) * s;
    dist -= s;
  }
  if (dist <= 0) return;
  let na = b[along] + d * dist;
  // never past the middle of a tile whose next tile is shut
  const nowTile = Math.floor(b[along]);
  if (!cell(nowTile + d, Math.floor(b[across]))) na = d > 0 ? Math.min(na, nowTile + 0.5) : Math.max(na, nowTile + 0.5);
  else if (Math.floor(na) !== nowTile && Math.floor(na) !== nowTile + d) na = nowTile + d + 0.5;
  b[along] = na;
}

// ── a match ──────────────────────────────────────────────────────────────────
export function createSide(seed, { players, sides, durMs, mode }) {
  const list = sides && sides.length ? sides : [{ key: "all", members: players.map(Number) }];
  const humans = list.flatMap((x) => x.members.map(Number));
  const s = {
    seed, rand: seededRand((Number(seed) || 1) * 19 + 7), dur: durMs / 1000, t: 0, mode,
    keys: list.map((x) => x.key), bodies: [], gone: new Set(),
    round: 0, phase: "play", pause: 0, rt: 0, shrinkI: 0, shrinkT: 0, level: null, friendly: mode === "teams" || mode === "coop",
    g: null, hidden: null, pow: new Map(), bombs: [], fire: new Map(),
    scores: [], wins: [], kos: [], lastWin: null, ev: [],
  };
  let bots = 0;
  const solo = list.length === 1 && humans.length === 1 && mode !== "coop";
  if (solo) { bots = 3; s.phase = "level"; }
  else if (mode === "coop") { bots = 2; s.level = "medium"; }
  if (bots) s.keys.push("cpu");
  const sideOf = (id) => list.findIndex((x) => x.members.map(Number).includes(id));
  humans.forEach((id, i) => s.bodies.push({ id, cpu: false, side: sideOf(id), colour: COLOURS[i % COLOURS.length], n: i }));
  for (let k = 0; k < bots; k++) s.bodies.push({ id: -(k + 1), cpu: true, side: s.keys.length - 1, colour: COLOURS[(humans.length + k) % COLOURS.length], n: humans.length + k, think: 0, path: null });
  s.scores = s.keys.map(() => 0); s.wins = s.keys.map(() => 0); s.kos = s.keys.map(() => 0);
  newRound(s);
  if (solo) s.phase = "level";
  return s;
}

function newRound(s) {
  s.round++;
  const spawns = SPAWNS.slice(0, Math.max(2, s.bodies.length));
  const a = buildArena(s.seed, s.round, spawns);
  s.g = a.g; s.hidden = a.hidden; s.pow = new Map(); s.bombs = []; s.fire = new Map();
  s.rt = 0; s.shrinkI = 0; s.shrinkT = 0;
  // spread the bombers: opposite corners first
  s.bodies.forEach((b, i) => {
    const [x, y] = spawns[i % spawns.length];
    Object.assign(b, { x: x + 0.5, y: y + 0.5, alive: !s.gone.has(b.id), max: START_BOMBS, range: START_RANGE, speed: SPEED, at: 0, off: 0, path: null, think: 0.6 });
  });
  s.phase = "play";
  s.ev.push({ type: "round", round: s.round });
}

const bombAt = (s, k) => s.bombs.find((b) => b.k === k);
export const tileOf = (b) => idx(Math.floor(b.x), Math.floor(b.y));
// May this bomber step into tile (tx,ty)? Not walls, not bricks, not a bomb
// it isn't already standing on.
function openFor(s, body) {
  return (tx, ty) => {
    if (!inside(tx, ty)) return false;
    const k = idx(tx, ty);
    if (s.g[k] !== FLOOR) return false;
    const bomb = bombAt(s, k);
    return !bomb || bomb.pass.has(body.id);
  };
}

function placeBomb(s, b) {
  if (!b.alive || s.phase !== "play") return false;
  const k = tileOf(b);
  if (s.bombs.filter((x) => x.owner === b.id).length >= b.max || bombAt(s, k) || s.g[k] !== FLOOR) return false;
  const pass = new Set(s.bodies.filter((o) => o.alive && tileOf(o) === k).map((o) => o.id));
  s.bombs.push({ k, owner: b.id, side: b.side, t: FUSE, range: b.range, pass });
  s.ev.push({ type: "bomb", k, id: b.id });
  return true;
}

// The tiles a bomb at k with this range would burn (and the bricks it would break).
export function blastTiles(g, k, range, bombsAt = () => null) {
  const out = [k], bricks = [], chained = [];
  const x0 = k % W, y0 = Math.floor(k / W);
  for (const [dx, dy] of N4) {
    for (let n = 1; n <= range; n++) {
      const x = x0 + dx * n, y = y0 + dy * n;
      if (!inside(x, y)) break;
      const t = idx(x, y);
      if (g[t] === SOLID) break;
      out.push(t);
      if (g[t] === BRICK) { bricks.push(t); break; }
      const other = bombsAt(t);
      if (other) { chained.push(other); break; }
    }
  }
  return { tiles: out, bricks, chained };
}

function explode(s, bomb) {
  if (bomb.gone) return;
  bomb.gone = true;
  const { tiles, bricks, chained } = blastTiles(s.g, bomb.k, bomb.range, (t) => s.bombs.find((b) => !b.gone && b.k === t));
  for (const t of tiles) {
    s.fire.set(t, { ttl: FIRE_S, owner: bomb.owner, side: bomb.side });
    // a power-up lying in the open burns
    if (s.pow.has(t) && !bricks.includes(t)) s.pow.delete(t);
  }
  for (const t of bricks) {
    s.g[t] = FLOOR;
    if (s.hidden.has(t)) { s.pow.set(t, s.hidden.get(t)); s.hidden.delete(t); }
  }
  s.ev.push({ type: "boom", k: bomb.k, tiles, bricks });
  for (const c of chained) explode(s, c);
}

function knockOut(s, b, by) {
  if (!b.alive) return;
  b.alive = false;
  const killer = s.bodies.find((o) => o.id === by);
  if (killer && killer.side !== b.side) { s.scores[killer.side] += KO_PTS; s.kos[killer.side]++; }
  s.ev.push({ type: "ko", id: b.id, by: by ?? null });
}

const sidesAlive = (s) => new Set(s.bodies.filter((b) => b.alive).map((b) => b.side));

export function step(s, dt) {
  s.t += dt;
  if (s.phase === "level" || s.phase === "over") return;
  if (s.phase === "pause") {
    s.pause -= dt;
    if (s.pause <= 0) newRound(s);
    return;
  }
  s.rt += dt;
  // the computer bombers
  for (const b of s.bodies) if (b.cpu && b.alive) botStep(s, b, dt);
  // bombs
  for (const bomb of s.bombs) {
    // whoever was standing on it can step off, but not back on
    for (const id of [...bomb.pass]) { const o = s.bodies.find((x) => x.id === id); if (!o || tileOf(o) !== bomb.k) bomb.pass.delete(id); }
    bomb.t -= dt;
  }
  for (const bomb of s.bombs) if (bomb.t <= 0 && !bomb.gone) explode(s, bomb);
  s.bombs = s.bombs.filter((b) => !b.gone);
  // the arena closes in
  if (s.rt >= SHRINK_AT) {
    s.shrinkT -= dt;
    while (s.shrinkT <= 0 && s.shrinkI < SPIRAL.length) {
      const k = SPIRAL[s.shrinkI++];
      if (s.g[k] === SOLID) continue;
      s.g[k] = SOLID;
      s.pow.delete(k); s.hidden.delete(k);
      s.bombs = s.bombs.filter((b) => b.k !== k);
      for (const b of s.bodies) if (b.alive && tileOf(b) === k) knockOut(s, b, null);
      s.ev.push({ type: "wall", k });
      s.shrinkT += SHRINK_EVERY;
    }
  }
  // fire, pickups
  for (const b of s.bodies) {
    if (!b.alive) continue;
    const k = tileOf(b);
    const f = s.fire.get(k);
    if (f && !(s.friendly && f.side === b.side && f.owner !== b.id)) knockOut(s, b, f.owner);
    const p = s.pow.get(k);
    if (b.alive && p) {
      s.pow.delete(k);
      if (p === "bomb") b.max = Math.min(MAX_BOMBS, b.max + 1);
      else if (p === "fire") b.range = Math.min(MAX_RANGE, b.range + 1);
      else b.speed = Math.min(SPEED_MAX, b.speed + SPEED_UP);
      s.ev.push({ type: "power", id: b.id, p, k });
    }
  }
  for (const [k, f] of s.fire) { f.ttl -= dt; if (f.ttl <= 0) s.fire.delete(k); }
  // a winner?
  const alive = sidesAlive(s);
  if (alive.size <= 1) {
    const w = alive.size ? [...alive][0] : null;
    if (w !== null) { s.wins[w]++; s.scores[w] += WIN_PTS; }
    s.lastWin = w;
    s.phase = "pause";
    s.pause = PAUSE_S;
    s.ev.push({ type: "won", side: w, round: s.round });
  }
  // a match against friends with only one side left in the room is over
  if (!s.keys.includes("cpu")) {
    const present = new Set(s.bodies.filter((b) => !s.gone.has(b.id)).map((b) => b.side));
    if (present.size < 2) s.phase = "over";
  }
}

// ── what a player does ───────────────────────────────────────────────────────
// Where my bomber is (a phone moves its own), accepted if it could have got
// there; otherwise followed at full pace, and the phone told if it's off.
export function report(s, pid, m, nowMs) {
  const b = s.bodies.find((x) => x.id === Number(pid));
  if (!b || !b.alive || s.phase !== "play") return null;
  const x = Number(m.x), y = Number(m.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const since = b.at ? Math.min(1, (nowMs - b.at) / 1000) : 1;
  b.at = nowMs;
  const allowed = b.speed * since + 0.45;
  const d = Math.hypot(x - b.x, y - b.y);
  const open = openFor(s, b);
  const tx = Math.floor(x), ty = Math.floor(y);
  const okThere = open(tx, ty) || tileOf(b) === idx(tx, ty);
  if (d <= allowed && okThere) { b.x = x; b.y = y; b.off = 0; return null; }
  b.off++;
  if (!okThere || b.off >= 4) { b.off = 0; return { x: b.x, y: b.y }; }
  return null;
}

export function act(s, pid, m) {
  pid = Number(pid);
  if (m.a === "level") {
    if (s.phase !== "level" || !LEVELS.includes(m.lvl) || !s.bodies.some((b) => b.id === pid && !b.cpu)) return { ok: false };
    s.level = m.lvl;
    s.phase = "play";
    s.ev.push({ type: "level", lvl: m.lvl });
    return { ok: true };
  }
  const b = s.bodies.find((x) => x.id === pid);
  if (!b) return { ok: false };
  if (m.a === "bomb") {
    // the phone says where it is as it drops it; trust that if it's close
    const x = Number(m.x), y = Number(m.y);
    if (Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x - b.x, y - b.y) < 0.8 && openFor(s, b)(Math.floor(x), Math.floor(y))) { b.x = x; b.y = y; }
    return { ok: placeBomb(s, b) };
  }
  return { ok: false };
}

export function removePlayer(s, pid) {
  s.gone.add(Number(pid));
  const b = s.bodies.find((x) => x.id === Number(pid));
  if (b) b.alive = false;
}

const keyIdx = (s, key) => s.keys.indexOf(key);
export const score = (s, key) => { const i = keyIdx(s, key); return i < 0 ? 0 : s.scores[i]; };
// One side in the room (solo, or everyone together): beat the computer on rounds.
export const goal = (s, key) => {
  const i = keyIdx(s, key), cpu = keyIdx(s, "cpu");
  if (i < 0) return false;
  if (cpu >= 0) return s.wins[i] > s.wins[cpu];
  return s.wins[i] > 0 && s.wins[i] === Math.max(...s.wins);
};
export const done = (s) => s.phase === "over";

// ── the computer ─────────────────────────────────────────────────────────────
const THINK = { easy: 0.7, medium: 0.32, hard: 0.15 };
const HUNT = { easy: 0, medium: 0.45, hard: 1 };          // how much it blasts its way toward you
const PACE = { easy: 0.82, medium: 0.95, hard: 1 };       // its walking speed, of a bomber's
// When will each tile burn? Every bomb's blast, the soonest fuse wins.
function dangerMap(s, extra = null) {
  const m = new Map();
  const bombs = extra ? [...s.bombs, extra] : s.bombs;
  for (const bomb of bombs) {
    const { tiles } = blastTiles(s.g, bomb.k, bomb.range);
    for (const t of tiles) m.set(t, Math.min(m.get(t) ?? Infinity, bomb.t));
  }
  for (const k of s.fire.keys()) m.set(k, 0);
  return m;
}
// Walkable distances from a tile, not walking through fire or bombs.
function reach(s, from, body, danger, extraBomb = null) {
  const dist = new Map([[from, 0]]), prev = new Map();
  const q = [from];
  while (q.length) {
    const k = q.shift();
    const x = k % W, y = Math.floor(k / W);
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy, nk = idx(nx, ny);
      if (!inside(nx, ny) || dist.has(nk) || s.g[nk] !== FLOOR) continue;
      if (bombAt(s, nk) || (extraBomb && extraBomb.k === nk)) continue;
      const tAt = (dist.get(k) + 1) / body.speed;
      const burn = danger.get(nk);
      if (burn !== undefined && burn <= tAt + FIRE_S && burn >= tAt - 0.35) continue;   // it'd be burning as we pass
      if (s.fire.has(nk)) continue;
      dist.set(nk, dist.get(k) + 1); prev.set(nk, k); q.push(nk);
    }
  }
  return { dist, prev };
}
function firstStep(prev, from, to) {
  let k = to;
  while (prev.has(k) && prev.get(k) !== from) k = prev.get(k);
  return k;
}
function botStep(s, b, dt) {
  const lvl = s.level || "medium";
  b.think -= dt;
  if (b.think <= 0) {
    b.think = THINK[lvl] * (0.7 + s.rand() * 0.6);
    const here = tileOf(b);
    const danger = dangerMap(s);
    const { dist, prev } = reach(s, here, b, danger);
    const safe = (k) => !danger.has(k);
    const careless = lvl === "easy" && s.rand() < 0.2;
    let goal = null;
    if (danger.has(here) && !careless) {
      // run: the nearest tile no blast will reach
      let best = Infinity;
      for (const [k, d] of dist) if (safe(k) && d < best) { best = d; goal = k; }
    } else {
      const enemies = s.bodies.filter((o) => o.alive && o.side !== b.side);
      const myBombs = s.bombs.filter((x) => x.owner === b.id).length;
      // would a bomb here do some good, and could we get away from it?
      if (myBombs < b.max) {
        const { tiles, bricks } = blastTiles(s.g, here, b.range);
        const hits = enemies.filter((o) => tiles.includes(tileOf(o))).length;
        const want = hits > 0 ? (lvl === "easy" ? 0.5 : 1) : bricks.length > 0 ? (lvl === "hard" ? 0.9 : 0.7) : 0;
        if (want && s.rand() < want) {
          const ghost = { k: here, t: FUSE, range: b.range };
          const d2 = dangerMap(s, ghost);
          const r2 = reach(s, here, b, d2, null);
          let escape = false;
          for (const [k, d] of r2.dist) if (!d2.has(k) && d / b.speed < FUSE - 0.4) { escape = true; break; }
          if (escape && placeBomb(s, b)) { b.think = 0.05; return; }
        }
      }
      // otherwise: a power-up, an enemy, or a brick to blow
      let best = Infinity;
      for (const [k, d] of dist) {
        if (!safe(k)) continue;
        let v = Infinity;
        const toEnemy = enemies.length ? Math.min(...enemies.map((o) => { const ek = tileOf(o); return Math.abs((k % W) - (ek % W)) + Math.abs(Math.floor(k / W) - Math.floor(ek / W)); })) : 0;
        if (s.pow.has(k)) v = d - 4;
        else if (enemies.some((o) => blastTiles(s.g, k, b.range).tiles.includes(tileOf(o)))) v = d - 1 - 3 * HUNT[lvl];
        else if (N4.some(([dx, dy]) => s.g[k + dx + dy * W] === BRICK)) v = d + 2 + toEnemy * HUNT[lvl];
        if (lvl === "easy") v += s.rand() * 5;
        if (v < best && (k !== here || v < 0)) { best = v; goal = k; }
      }
      if (goal === null && enemies.length) {
        // walled off: wander toward the nearest enemy
        const e = enemies[0], ek = tileOf(e);
        let near = Infinity;
        for (const [k] of dist) { const dd = Math.abs((k % W) - (ek % W)) + Math.abs(Math.floor(k / W) - Math.floor(ek / W)); if (dd < near && safe(k)) { near = dd; goal = k; } }
      }
    }
    b.path = goal !== null && goal !== here ? firstStep(prev, here, goal) : null;
  }
  // walk toward the next tile
  if (b.path === null) return;
  const tx = (b.path % W) + 0.5, ty = Math.floor(b.path / W) + 0.5;
  const dx = tx - b.x, dy = ty - b.y;
  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) { b.x = tx; b.y = ty; b.path = null; b.think = Math.min(b.think, 0.05); return; }
  const open = openFor(s, b);
  const step = b.speed * PACE[lvl] * dt;
  if (Math.abs(dx) > Math.abs(dy)) moveBody(open, b, Math.sign(dx), 0, Math.min(Math.abs(dx), step));
  else moveBody(open, b, 0, Math.sign(dy), Math.min(Math.abs(dy), step));
}

// ── what travels ─────────────────────────────────────────────────────────────
const r2 = (n) => Math.round(n * 100) / 100;
export function view(s, peek = false) {
  const ev = peek ? [] : s.ev;
  if (!peek) s.ev = [];
  return {
    g: Array.from(s.g).join(""),
    pw: [...s.pow.entries()],
    b: s.bombs.map((b) => [b.k, r2(b.t), b.range, b.owner, [...b.pass]]),
    f: [...s.fire.entries()].map(([k, f]) => [k, r2(f.ttl)]),
    p: s.bodies.map((b) => [b.id, r2(b.x), r2(b.y), b.alive ? 1 : 0, b.max, b.range, r2(b.speed)]),
    ph: s.phase, rd: s.round, pz: r2(Math.max(0, s.pause)), rt: r2(s.rt),
    sc: s.scores, wn: s.wins, lw: s.lastWin, lvl: s.level,
    e: ev,
  };
}
export function init(s) {
  return { keys: s.keys, bodies: s.bodies.map((b) => ({ id: b.id, cpu: b.cpu, side: b.side, colour: b.colour })) };
}
export function summary(s, key) {
  const i = keyIdx(s, key), cpu = keyIdx(s, "cpu");
  return { wins: i < 0 ? 0 : s.wins[i], kos: i < 0 ? 0 : s.kos[i], cpuWins: cpu >= 0 ? s.wins[cpu] : null, rounds: s.round, level: s.level };
}
