// src/components/together/towerCore.mjs
// TOWER GUARD — the rules, shared by the server (config/togetherWorld.js runs
// one map per side) and the phones (which draw it). No React, no network:
// scripts/check-tower.mjs plays it.
//
// A path winds down the map to your castle; monsters come down it in waves.
// Put towers on the grass beside it: archers (quick, one at a time), cannons
// (slow, hit everything near) and frost (slows them down). Every monster
// stopped pays you; tap a tower to make it stronger or sell it. A monster
// that reaches the castle takes lives off it; when they're gone, it falls.
//
// Together, everybody shares the map and the castle, and each has their own
// purse — every kill pays everyone — while the monsters get tougher with
// every player. Map, waves and monsters all come from the seed: everyone
// against friends defends the same map from the same waves.
import { seededRand } from "./rand.mjs";

export const GAME = "tower";
export const TICK_MS = 100;
export const W = 9, H = 13;
export const LIVES = 20;
export const START_COINS = 120;
export const FIRST_WAVE_S = 10;      // time to build before the first wave
export const BREATHER_S = 6;         // between waves
export const WAVE_PTS = 40;          // for every wave seen off
export const SELL_BACK = 0.6;
export const MAX_LEVEL = 3;

// The paths, as corners (tile coordinates): in at the top, the castle at the end.
export const MAPS = [
  { name: "Meadow", path: [[1, -1], [1, 3], [7, 3], [7, 7], [1, 7], [1, 10], [4, 10], [4, 12]] },
  { name: "Riverside", path: [[7, -1], [7, 2], [2, 2], [2, 6], [6, 6], [6, 9], [3, 9], [3, 12]] },
  { name: "Hilltop", path: [[4, -1], [4, 2], [1, 2], [1, 5], [7, 5], [7, 9], [2, 9], [2, 11], [5, 11], [5, 12]] },
];

export const TOWERS = {
  archer: { name: "Archer", icon: "🏹", cost: 50, range: 2.6, rate: 1.6, dmg: 9, colour: "#8FDB5C" },
  cannon: { name: "Cannon", icon: "💣", cost: 80, range: 2.2, rate: 0.55, dmg: 24, splash: 0.95, colour: "#FFA36C" },
  frost: { name: "Frost", icon: "❄️", cost: 60, range: 2.2, rate: 1.0, dmg: 3, slow: 0.45, slowS: 1.6, colour: "#8FD8F5" },
};
export const MONSTERS = {
  slime: { name: "Slime", hp: 30, speed: 1.15, bounty: 6, harm: 1 },
  bat: { name: "Bat", hp: 18, speed: 2.1, bounty: 6, harm: 1 },
  ogre: { name: "Ogre", hp: 115, speed: 0.75, bounty: 15, harm: 2 },
  dragon: { name: "Dragon", hp: 650, speed: 0.6, bounty: 80, harm: 5 },
};

export const upgradeCost = (kind, level) => Math.round(TOWERS[kind].cost * 0.8 * level);
export function towerStats(kind, level) {
  const t = TOWERS[kind];
  return { range: t.range + 0.3 * (level - 1), dmg: t.dmg * Math.pow(1.5, level - 1), rate: t.rate * (1 + 0.15 * (level - 1)), splash: t.splash, slow: t.slow, slowS: t.slowS };
}

// ── the map ──────────────────────────────────────────────────────────────────
export function mapFor(seed) {
  const m = MAPS[Math.abs(Number(seed) || 0) % MAPS.length];
  const pts = m.path.map(([x, y]) => [x + 0.5, y + 0.5]);
  const segs = [];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const l = Math.hypot(bx - ax, by - ay);
    segs.push({ ax, ay, bx, by, l, at: len });
    len += l;
  }
  const road = new Set();
  for (const s of segs) {
    const steps = Math.ceil(s.l * 4);
    for (let k = 0; k <= steps; k++) {
      const x = Math.floor(s.ax + ((s.bx - s.ax) * k) / steps), y = Math.floor(s.ay + ((s.by - s.ay) * k) / steps);
      if (x >= 0 && y >= 0 && x < W && y < H) road.add(y * W + x);
    }
  }
  const end = m.path[m.path.length - 1];
  // a few trees, from the seed, never on the road or right by the castle
  const r = seededRand((Number(seed) || 1) * 13 + 5);
  const trees = new Set();
  for (let tries = 0; trees.size < 6 && tries < 200; tries++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H), k = y * W + x;
    if (road.has(k) || Math.abs(x - end[0]) + Math.abs(y - end[1]) < 3) continue;
    trees.add(k);
  }
  return { name: m.name, path: m.path, pts, segs, len, road, trees, castle: { x: end[0], y: end[1] } };
}
export function at(map, d) {
  if (d <= 0) return [map.pts[0][0], map.pts[0][1] + d];
  for (const s of map.segs) {
    if (d <= s.at + s.l) { const k = (d - s.at) / s.l; return [s.ax + (s.bx - s.ax) * k, s.ay + (s.by - s.ay) * k]; }
  }
  const last = map.pts[map.pts.length - 1];
  return [last[0], last[1]];
}
export const buildable = (map, x, y) => x >= 0 && y >= 0 && x < W && y < H && !map.road.has(y * W + x) && !map.trees.has(y * W + x);

// ── the waves ────────────────────────────────────────────────────────────────
export function waveList(seed, wave) {
  const r = seededRand((Number(seed) || 1) * 101 + wave * 7);
  const out = [];
  const n = 6 + 2 * wave;
  for (let i = 0; i < n; i++) {
    const x = r();
    let kind = "slime";
    if (wave >= 2 && x < 0.3) kind = "bat";
    else if (wave >= 3 && x > 0.82) kind = "ogre";
    out.push(kind);
  }
  if (wave % 5 === 0) out.splice(Math.floor(n / 2), 0, "dragon");
  return out;
}
const hpScale = (wave, n) => (1 + 0.2 * (wave - 1)) * (1 + 0.6 * (n - 1));

// ── a side ───────────────────────────────────────────────────────────────────
export function createSide(seed, { players, durMs }) {
  const s = {
    seed, map: mapFor(seed), t: 0, dur: durMs / 1000, n: Math.max(1, players.length),
    purse: new Map(players.map((id) => [Number(id), START_COINS])), gone: new Set(),
    towers: [], monsters: [], mid: 0, wave: 0, queue: [], spawnT: 0, nextWave: FIRST_WAVE_S, waveLive: false,
    lives: LIVES, fallen: false, kills: 0, bounty: 0, waves: 0, leaked: 0, score: 0, ev: [], shots: [],
  };
  return s;
}

function startWave(s) {
  s.wave++;
  s.queue = waveList(s.seed, s.wave);
  s.spawnT = 0;
  s.waveLive = true;
  s.ev.push({ type: "wave", wave: s.wave, dragon: s.queue.includes("dragon") });
}

function spawn(s, kind) {
  const m = MONSTERS[kind];
  const hp = Math.round(m.hp * hpScale(s.wave, s.n));
  s.monsters.push({ id: ++s.mid, kind, d: -0.4, hp, max: hp, speed: m.speed, slowT: 0, slow: 0 });
}

function pay(s, amount) {
  for (const id of s.purse.keys()) if (!s.gone.has(id)) s.purse.set(id, s.purse.get(id) + amount);
}

function hurt(s, m, dmg) {
  if (m.hp <= 0) return;
  m.hp -= dmg;
  if (m.hp <= 0) {
    const b = MONSTERS[m.kind].bounty;
    s.kills++;
    s.bounty += b;
    pay(s, b);
    const [x, y] = at(s.map, m.d);
    s.ev.push({ type: "kill", kind: m.kind, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, b });
  }
}

export function step(s, dt) {
  s.t += dt;
  if (s.fallen) return;
  // the waves
  if (!s.waveLive) {
    s.nextWave -= dt;
    if (s.nextWave <= 0) startWave(s);
  } else {
    if (s.queue.length) {
      s.spawnT -= dt;
      if (s.spawnT <= 0) { spawn(s, s.queue.shift()); s.spawnT = Math.max(0.45, 0.9 - s.wave * 0.03); }
    } else if (!s.monsters.length) {
      s.waveLive = false;
      s.waves++;
      s.nextWave = BREATHER_S;
      pay(s, 10 + 2 * s.wave);
      s.ev.push({ type: "cleared", wave: s.wave });
    }
  }
  // the monsters walk
  for (const m of s.monsters) {
    if (m.slowT > 0) m.slowT -= dt; else m.slow = 0;
    m.d += m.speed * (1 - m.slow) * dt;
    if (m.d >= s.map.len) {
      m.hp = 0;
      m.leaked = true;
      s.lives = Math.max(0, s.lives - MONSTERS[m.kind].harm);
      s.leaked++;
      s.ev.push({ type: "leak", kind: m.kind, lives: s.lives });
      if (s.lives <= 0 && !s.fallen) { s.fallen = true; s.ev.push({ type: "fallen" }); }
    }
  }
  // the towers shoot
  s.shots = [];
  for (const T of s.towers) {
    T.cool -= dt;
    if (T.cool > 0) continue;
    const st = towerStats(T.kind, T.level);
    let target = null, best = -Infinity;
    for (const m of s.monsters) {
      if (m.hp <= 0 || m.d < 0) continue;
      const [mx, my] = at(s.map, m.d);
      if (Math.hypot(mx - (T.x + 0.5), my - (T.y + 0.5)) > st.range) continue;
      if (m.d > best) { best = m.d; target = m; }
    }
    if (!target) continue;
    T.cool = 1 / st.rate;
    const [tx, ty] = at(s.map, target.d);
    T.aim = Math.atan2(ty - (T.y + 0.5), tx - (T.x + 0.5));
    s.shots.push([T.x, T.y, Math.round(tx * 100) / 100, Math.round(ty * 100) / 100, T.kind]);
    if (T.kind === "cannon") {
      for (const m of s.monsters) {
        if (m.hp <= 0) continue;
        const [mx, my] = at(s.map, m.d);
        if (Math.hypot(mx - tx, my - ty) <= st.splash) hurt(s, m, st.dmg);
      }
    } else {
      hurt(s, target, st.dmg);
      if (T.kind === "frost") { target.slow = st.slow; target.slowT = st.slowS; }
    }
  }
  s.monsters = s.monsters.filter((m) => m.hp > 0);
  s.score = s.bounty + WAVE_PTS * s.waves;
}

// ── what a player does ───────────────────────────────────────────────────────
// { a: "build", x, y, kind } | { a: "up", x, y } | { a: "sell", x, y }
export function act(s, pid, m) {
  pid = Number(pid);
  if (s.fallen || !s.purse.has(pid) || s.gone.has(pid)) return { ok: false, why: "out" };
  const x = Math.floor(Number(m.x)), y = Math.floor(Number(m.y));
  const here = s.towers.find((T) => T.x === x && T.y === y);
  const coins = s.purse.get(pid);
  if (m.a === "build") {
    const def = TOWERS[m.kind];
    if (!def) return { ok: false };
    if (!buildable(s.map, x, y) || here) return { ok: false, why: "spot" };
    if (coins < def.cost) return { ok: false, why: "coins", need: def.cost };
    s.purse.set(pid, coins - def.cost);
    s.towers.push({ x, y, kind: m.kind, level: 1, owner: pid, spent: def.cost, cool: 0, aim: -Math.PI / 2 });
    s.ev.push({ type: "built", x, y, kind: m.kind, id: pid });
    return { ok: true };
  }
  if (m.a === "up") {
    if (!here) return { ok: false };
    if (here.level >= MAX_LEVEL) return { ok: false, why: "max" };
    const cost = upgradeCost(here.kind, here.level);
    if (coins < cost) return { ok: false, why: "coins", need: cost };
    s.purse.set(pid, coins - cost);
    here.level++;
    here.spent += cost;
    s.ev.push({ type: "up", x, y, level: here.level, id: pid });
    return { ok: true };
  }
  if (m.a === "sell") {
    if (!here) return { ok: false };
    if (here.owner !== pid && !s.gone.has(here.owner)) return { ok: false, why: "notyours" };
    const back = Math.round(here.spent * SELL_BACK);
    s.purse.set(pid, coins + back);
    s.towers = s.towers.filter((T) => T !== here);
    s.ev.push({ type: "sold", x, y, back, id: pid });
    return { ok: true, back };
  }
  return { ok: false };
}

export function removePlayer(s, pid) { s.gone.add(Number(pid)); }
export const score = (s) => s.score;
export const goal = (s) => !s.fallen && s.waves >= 1;
export const done = (s) => s.fallen;

// ── what travels ─────────────────────────────────────────────────────────────
const r2 = (n) => Math.round(n * 100) / 100;
// `peek`: a look for a phone just arriving — the events stay for the next tick.
export function view(s, peek = false) {
  const ev = peek ? [] : s.ev;
  if (!peek) s.ev = [];
  return {
    m: s.monsters.map((m) => [m.id, m.kind, r2(m.d), Math.round((100 * Math.max(0, m.hp)) / m.max), m.slow > 0 ? 1 : 0]),
    tw: s.towers.map((T) => [T.x, T.y, T.kind, T.level, T.owner, r2(T.aim)]),
    sh: s.shots,
    $: [...s.purse.entries()],
    lv: s.lives, wv: s.wave, nw: s.waveLive ? 0 : r2(Math.max(0, s.nextWave)), lf: s.queue.length + s.monsters.length,
    fl: s.fallen ? 1 : 0, sc: s.score, k: s.kills,
    e: ev,
  };
}
export function init(s) { return { map: { name: s.map.name, path: s.map.path, trees: [...s.map.trees], castle: s.map.castle }, lives: LIVES }; }
export function summary(s) { return { waves: s.waves, kills: s.kills, lives: s.lives, fallen: s.fallen, wave: s.wave }; }
