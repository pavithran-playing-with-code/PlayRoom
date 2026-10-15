// src/components/games/sunhavenWorld.js
// Sunshard Jump, stage two: Sunhaven Isle, the island you reach through the
// temple's portal. No three.js and no React — just numbers, so
// scripts/check-sunshard.mjs can build it and walk it.
//
// Made from a text seed (the island's code: "sunhaven-" + the sky island's),
// so every phone in a room builds the same island: a village in the middle,
// a mesa climbed by stepping stones and bounce mushrooms, a lake crossed on
// lily pads, ember ruins with a wind vent up to a ledge, a slime hollow, and
// the Shade Tower's walled yard in the north. Four sun shrines to light, then
// the Shade Colossus. Everything that can change in play (a shrine, a slime, a
// wisp, a flag) has a stable index, so the room can say "slime 7" instead of
// sending positions.
//
// The ground is a height map (H). Layout, decoration and the ground's noise
// draw from different streams.
import { TAU, clamp, lerp, mkRng } from "./sunshardWorld.js";

const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function makeNoise(rng) {
  const T = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) T[i] = rng();
  const at = (x, y) => T[((y & 255) << 8) | (x & 255)];
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), u), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u), v);
  };
  return (x, y) => n(x, y) * 0.55 + n(x * 2.1 + 7.3, y * 2.1 + 1.7) * 0.3 + n(x * 4.3 + 3.1, y * 4.3 + 9.2) * 0.15;
}

// ── where things are ────────────────────────────────────────────────────────
export const SEA = 0, ISLAND_R = 96, MAP_SIZE = 210;
export const HUBP = { x: 0, z: 0 }, CLIFF = { x: 50, z: -38 }, LAKE = { x: -50, z: 8 }, EMBER = { x: 8, z: 56 },
  LEDGE = { x: 14, z: 68 }, HOLLOW = { x: -46, z: -36 }, TOWER = { x: -6, z: -66 };
export const ARENA_R = 15;
export const ISLE_ZONES = [
  { name: "Sunhaven Village", c: HUBP, r: 20, col: 0xffe28a },
  { name: "Bounce Cliffs", c: CLIFF, r: 26, col: 0xffd24a },
  { name: "Lily Lake", c: LAKE, r: 30, col: 0x7fe3ff },
  { name: "Ember Ruins", c: EMBER, r: 30, col: 0xff7a4a },
  { name: "Slime Hollow", c: HOLLOW, r: 24, col: 0x6dff9c },
  { name: "Shade Tower", c: TOWER, r: 22, col: 0xc08aff },
];
const ZONE_ORDER = [5, 1, 2, 3, 4, 0];                 // which zone wins where they overlap
export function zoneAt(x, z, prev) {
  for (const i of ZONE_ORDER) { const Z = ISLE_ZONES[i]; if (Math.hypot(x - Z.c.x, z - Z.c.z) < Z.r) return i; }
  return prev === undefined ? 0 : prev;
}
const SHRINE_DEF = [
  { name: "Lily Shrine", at: LAKE, zone: 2, col: 0x7fe3ff },
  { name: "Cliff Shrine", at: CLIFF, zone: 1, col: 0xffd24a },
  { name: "Ember Shrine", at: LEDGE, zone: 3, col: 0xff7a4a },
  { name: "Hollow Shrine", at: HOLLOW, zone: 4, col: 0x6dff9c },
];
export const SHRINES = SHRINE_DEF.length;
export const SHRINE_COLS = SHRINE_DEF.map((s) => s.col);

export function buildWorld(code) {
  const R = mkRng(code), D = mkRng(code + "/deco"), nz = makeNoise(mkRng(code + "/h"));
  // the ground: an island with a flat village, a mesa, a lake, a ledge, a hill and a tower yard
  const H = (x, z) => {
    const r = Math.hypot(x, z), m = sstep(96, 56, r);
    let h = m * 5.2 + (nz(x * 0.045 + 3, z * 0.045 + 5) - 0.5) * 3.2 * m - (1 - m) * 3.2;
    h -= sstep(78, 96, r) * 70 + sstep(100, 112, r) * 130;     // the island floats: past the beach it drops away
    let d = Math.hypot(x - HUBP.x, z - HUBP.z);
    h = lerp(h, 5.0, 1 - sstep(9, 17, d));
    d = Math.hypot(x - CLIFF.x, z - CLIFF.z);
    h = lerp(h, 22, 1 - sstep(11, 15.5, d));
    d = Math.hypot(x - LAKE.x, z - LAKE.z);
    h = lerp(h, -2.6, 1 - sstep(16, 23, d));
    h = lerp(h, 1.4, 1 - sstep(5, 7, d));
    d = Math.hypot(x - LEDGE.x, z - LEDGE.z);
    h = lerp(h, 11.5, 1 - sstep(8, 11, d));
    d = Math.hypot(x - HOLLOW.x, z - HOLLOW.z);
    h = lerp(h, 10, 1 - sstep(3, 18, d));
    d = Math.hypot(x - TOWER.x, z - TOWER.z);
    h = lerp(h, 4.5, 1 - sstep(15, 19, d));
    return h;
  };
  const W = {
    code, H, plats: [], lifts: [], springs: [], flags: [], shrines: [], npcs: [], seeds: [], slimes: [], wisps: [],
    trees: [], rocks: [], houses: [], flowers: [], cols: [], pillars: [], clouds: [], arena: null, gate: null, fountain: null,
  };
  const addCol = (x, z, r, h, y0) => W.cols.push({ x, z, r, h, y0: y0 === undefined ? H(x, z) : y0, on: true });
  const addPlat = (o) => {
    const p = { x: 0, y: 0, z: 0, r: 2, th: 1.0, kind: "static", zone: 0, rot: D() * TAU, ...o };
    p.i = W.plats.length; W.plats.push(p); return p;
  };
  const addFlag = (x, z, zone, name) => { const f = { i: W.flags.length, x, z, y: H(x, z), zone, name }; W.flags.push(f); return f; };

  // ── the village ──
  addFlag(4, 6, 0, "Village");
  W.fountain = { x: 0, z: 0, y: H(0, 0) }; addCol(0, 0, 1.9, 3);
  [0.4, 1.2, 2.1, 3.3, 4.2, 5.2].forEach((a, k) => {
    const x = Math.cos(a) * 14, z = Math.sin(a) * 14, y = H(x, z);
    W.houses.push({ x, z, y, rot: a + Math.PI / 2, wall: [0xf3e2c0, 0xe8c9a0, 0xd9e8f0, 0xf0d0d0, 0xe0e8c8, 0xf4dca8][k], roof: [0xd9573a, 0xc9483a, 0x4a7ab5, 0x8a4ab5, 0xd9573a, 0x3a9a6a][k] });
    addCol(x, z, 3.0, 5, y);
  });
  W.npcs.push({ id: "sol", name: "Elder Sol", x: 3.4, z: 3.6, col: 0xf4efe6, hat: 0xffd24a, s: 1.15, prop: "staff" });
  W.npcs.push({ id: "pip", name: "Pip", x: -6.5, z: 4.2, col: 0xff8fc7, hat: 0x62d36c, s: 0.8, prop: "none" });
  W.npcs.push({ id: "brindle", name: "Brindle", x: 7.6, z: -5.4, col: 0xb07a4a, hat: 0x7a4a2a, s: 1.05, prop: "hammer" });
  W.npcs.forEach((n) => { n.y = H(n.x, n.z); addCol(n.x, n.z, 0.7, 2, n.y); });

  // ── the shrines ──
  SHRINE_DEF.forEach((s, i) => { W.shrines.push({ i, name: s.name, x: s.at.x, z: s.at.z, y: H(s.at.x, s.at.z), zone: s.zone, col: s.col }); addCol(s.at.x, s.at.z, 0.9, 1.4, H(s.at.x, s.at.z)); });

  // ── Bounce Cliffs: a mesa you climb by stepping stones and bounce mushrooms ──
  {
    const a0 = Math.atan2(HUBP.z - CLIFF.z, HUBP.x - CLIFF.x);
    const g = H(CLIFF.x + Math.cos(a0) * 18.5, CLIFF.z + Math.sin(a0) * 18.5);
    const seq = [["static", 0.9], ["static", 0.9], ["spring", 0.9], ["static", 4.4], ["static", 0.9], ["spring", 0.9], ["static", 4.4], ["static", 0.9], ["spring", 0.9], ["static", 4.2]];
    let ang = a0, prev = null, y = g;
    seq.forEach(([kind, rise], k) => {
      y = (prev ? prev.y : g) + rise;
      if (k === seq.length - 1) y = Math.min(y, 21.4);
      const rr = kind === "spring" ? 2.4 : 2.0;
      let rad = 18.5;
      while (rad > 12.6 && H(CLIFF.x + Math.cos(ang) * (rad - 0.4), CLIFF.z + Math.sin(ang) * (rad - 0.4)) <= y - 0.7) rad -= 0.4;
      if (prev) ang += (prev.r + rr + (prev.kind === "spring" ? 2.6 : 2.9)) / Math.max(rad, 12);
      const p = addPlat({ x: CLIFF.x + Math.cos(ang) * rad, z: CLIFF.z + Math.sin(ang) * rad, y, r: rr, kind, zone: 1, mesa: k });
      if (kind === "spring") W.springs.push({ p: p.i });
      prev = p;
    });
    const fa = a0 + 0.12;
    addFlag(CLIFF.x + Math.cos(fa) * 22, CLIFF.z + Math.sin(fa) * 22, 1, "Cliff Base");
  }
  // ── Lily Lake: crumbling lily pads across the water to a little island ──
  const a0L = Math.atan2(HUBP.z - LAKE.z, HUBP.x - LAKE.x);
  {
    let ang = a0L, rad = 18.5;
    for (let k = 0; k < 6; k++) {
      addPlat({ x: LAKE.x + Math.cos(ang) * rad, z: LAKE.z + Math.sin(ang) * rad, y: 0.5, r: 1.7, kind: k % 2 ? "crumble" : "static", zone: 2, pad: true });
      ang -= 5.0 / rad; rad -= 2.0;
    }
    addFlag(LAKE.x + Math.cos(a0L + 0.2) * 26, LAKE.z + Math.sin(a0L + 0.2) * 26, 2, "Lake Shore");
  }
  // ── Ember Ruins: a wind vent lifts you to a high ledge ──
  {
    const vx = LEDGE.x + (EMBER.x - LEDGE.x) * 0.46, vz = LEDGE.z + (EMBER.z - LEDGE.z) * 0.46;
    const d = Math.hypot(vx - LEDGE.x, vz - LEDGE.z), k = 11.6 / d;
    const x = LEDGE.x + (vx - LEDGE.x) * k, z = LEDGE.z + (vz - LEDGE.z) * k, y = H(x, z) + 0.25;
    const p = addPlat({ x, z, y, r: 1.9, kind: "lift", zone: 3 });
    W.lifts.push({ p: p.i, x, z, r: 1.7, y0: y, h: 9 });
    addFlag(EMBER.x, EMBER.z - 11, 3, "Ember Gate");
    for (let i = 0; i < 9; i++) { const a = D() * TAU, dd = 5 + D() * 20, px = EMBER.x + Math.cos(a) * dd, pz = EMBER.z + Math.sin(a) * dd; if (Math.hypot(px - LEDGE.x, pz - LEDGE.z) > 13) W.rocks.push({ x: px, z: pz, s: 0.8 + D() * 1.4, y: H(px, pz), ember: true, rot: D() * TAU }); }
  }
  // ── Slime Hollow ──
  addFlag(HOLLOW.x + 0.79 * 18, HOLLOW.z + 0.62 * 18, 4, "Hollow Edge");
  // ── Shade Tower: a sealed yard with a golden gate ──
  {
    const ga = Math.atan2(HUBP.z - TOWER.z, HUBP.x - TOWER.x);
    W.arena = { x: TOWER.x, z: TOWER.z, r: ARENA_R, y: H(TOWER.x, TOWER.z), gateAng: ga };
    for (let k = 0; k < 24; k++) {
      const a = ga + (k / 24) * TAU, x = TOWER.x + Math.cos(a) * ARENA_R, z = TOWER.z + Math.sin(a) * ARENA_R;
      W.pillars.push({ x, z, y0: W.arena.y, gate: k === 0, k });
    }
    W.gate = { x: W.pillars[0].x, z: W.pillars[0].z, y0: W.arena.y, ang: ga };
    addFlag(TOWER.x + Math.cos(ga) * 21, TOWER.z + Math.sin(ga) * 21, 5, "Tower Gate");
  }

  // ── trees, rocks, flowers ──
  const nearCol = (x, z, pad) => W.cols.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + pad);
  const blocked = (x, z) => {
    const h = H(x, z);
    if (h < 1.0 || h > 10) return true;
    if (Math.hypot(x - CLIFF.x, z - CLIFF.z) < 20.5 || Math.hypot(x - LAKE.x, z - LAKE.z) < 25 || Math.hypot(x - LEDGE.x, z - LEDGE.z) < 13 ||
      Math.hypot(x - HOLLOW.x, z - HOLLOW.z) < 6 || Math.hypot(x - TOWER.x, z - TOWER.z) < 22) return true;
    if (Math.hypot(x, z) < 11.5) return true;
    return nearCol(x, z, 2);
  };
  for (let tries = 0, n = 0; tries < 1400 && n < 170; tries++) {
    const a = D() * TAU, d = 8 + D() * 78, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (blocked(x, z)) continue;
    const ember = Math.hypot(x - EMBER.x, z - EMBER.z) < 28, s = 0.85 + D() * 0.6;
    W.trees.push({ x, z, y: H(x, z), s, rot: D() * TAU, round: D() < 0.5, ember, v: D() });
    addCol(x, z, 0.5 * s, 4, H(x, z)); n++;
  }
  for (let tries = 0, n = 0; tries < 400 && n < 36; tries++) {
    const a = D() * TAU, d = 10 + D() * 78, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (blocked(x, z)) continue;
    const s = 0.7 + D() * 1.2;
    W.rocks.push({ x, z, s, y: H(x, z), ember: false, rot: D() * TAU }); n++;
  }
  W.rocks.forEach((r) => addCol(r.x, r.z, 0.85 * r.s, 1.3 * r.s, r.y));
  for (let tries = 0, n = 0; tries < 1600 && n < 260; tries++) {
    const a = D() * TAU, d = D() * 88, x = Math.cos(a) * d, z = Math.sin(a) * d, h = H(x, z);
    if (h < 1.1 || h > 21 || (Math.hypot(x - LAKE.x, z - LAKE.z) < 22 && h < 0.2)) continue;
    if (Math.hypot(x - EMBER.x, z - EMBER.z) < 24 || Math.hypot(x - TOWER.x, z - TOWER.z) < 17) continue;
    W.flowers.push({ x, z, y: h, c: (D() * 4) | 0 }); n++;
  }

  // ── sun seeds (placed, then taken away: no collecting on this island — the
  // layout stream still draws them, so the slimes below land where they did) ──
  const addSeed = (x, z, y) => W.seeds.push({ i: W.seeds.length, x, z, y: y === undefined ? H(x, z) + 1.0 : y });
  W.plats.forEach((p, k) => { if (p.kind === "static" || p.kind === "crumble") { if (k % 2 === 0 || p.pad) addSeed(p.x, p.z, p.y + 1.0); } });
  W.shrines.forEach((s, i) => { const a = i * 1.7; addSeed(s.x + Math.cos(a) * 2.6, s.z + Math.sin(a) * 2.6); addSeed(s.x + Math.cos(a + 2.4) * 3.2, s.z + Math.sin(a + 2.4) * 3.2); });
  [[7, 8], [-8, -8], [10, 1], [-3, 9], [-10, 3], [2, -11]].forEach(([x, z]) => addSeed(x, z));
  for (let tries = 0; tries < 600 && W.seeds.length < 52; tries++) {
    const a = R() * TAU, d = 14 + R() * 70, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (blocked(x, z)) continue;
    addSeed(x, z);
  }

  // ── slimes and wisps: a home each (they wander round it by the match clock) ──
  const addSlime = (x, z) => W.slimes.push({ i: W.slimes.length, hx: x, hz: z });
  addSlime(-12, -9); addSlime(11, 10);
  for (let k = 0; k < 2; k++) { const a = a0L + (k - 0.5) * 0.9; addSlime(LAKE.x + Math.cos(a) * 27, LAKE.z + Math.sin(a) * 27); }
  for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.3, d = 6 + R() * 7; addSlime(HOLLOW.x + Math.cos(a) * d, HOLLOW.z + Math.sin(a) * d); }
  for (let k = 0; k < 5; k++) { const a = k * 1.25, d = 6 + R() * 12; addSlime(EMBER.x + Math.cos(a) * d, EMBER.z + Math.sin(a) * d - 4); }
  for (let k = 0; k < 4; k++) { const a = k * 1.6 + 0.6, d = 7 + R() * 8; W.wisps.push({ i: k, hx: EMBER.x + Math.cos(a) * d, hz: EMBER.z + Math.sin(a) * d }); }

  // ── drifting clouds ──
  for (let i = 0; i < 30; i++) {
    const n = 3 + ((D() * 3) | 0), a = D() * TAU, d = 60 + D() * 230;
    W.clouds.push({ n, x: Math.cos(a) * d, y: 30 + D() * 60, z: Math.sin(a) * d, sp: 0.4 + D() * 1.0, v: Array.from({ length: n * 3 }, () => D()) });
  }
  W.seeds.length = 0;   // no gem collecting in this island
  W.start = { x: 0.5, z: 8.5, y: H(0.5, 8.5) };
  W.startYaw = 0;
  return W;
}
