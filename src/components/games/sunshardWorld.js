// src/components/games/sunshardWorld.js
// Sunshard Islands: the level. No three.js and no React — just numbers, so
// scripts/check-sunshard.mjs can build it, walk it and drive a bot across it.
//
// Made from a text seed (xmur3 + mulberry32), so everyone in a room gets the
// same islands: a hub, then five zones of floating platforms, each ending on
// a shard island; the last is the Sun Temple. Platforms are cylinders (a flat
// top, a little thickness). Every jump is kept possible: edge gaps 2–4 m,
// rises 0.2–1 m, and after a wind vent or a bounce mushroom the next one is
// 4–5.5 m higher. Each new platform is checked against the earlier ones and
// the heading tried again if it would overlap.
//
// Layout and decoration draw from different streams, so trees and clouds
// can change without moving a single platform.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

function xmur3(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const mkRng = (s) => mulberry32(xmur3(String(s))());
export const levelCode = (seed) => `sunshard-${Number(seed) || 1}`;

export const PAL0 = { top: 0x72d15a, side: 0x8b5e3c, crum: 0xb98a5e };
export const ZONES = [
  { name: "Meadow Hop", pal: { top: 0x72d15a, side: 0x8b5e3c, crum: 0xb98a5e }, n: 8, gap: [2.0, 3.2], rise: [0.2, 0.8], r: [2.4, 3.4], w: { static: 1 }, slime: 0.25, col: 0x6dff9c },
  { name: "Sandy Steps", pal: { top: 0xe9c46a, side: 0xb5803f, crum: 0xc2864a }, n: 9, gap: [2.4, 3.5], rise: [0.3, 1], r: [2.2, 3.2], w: { static: 0.45, mover: 0.35, crumble: 0.2 }, slime: 0.25, col: 0xffd24a },
  { name: "Frost Ridge", pal: { top: 0xe4f7ff, side: 0x7aa5d0, crum: 0xa4cfe8 }, n: 9, gap: [2.6, 3.7], rise: [0.3, 1], r: [2.1, 3], w: { static: 0.35, crumble: 0.25, lift: 0.2, spring: 0.2 }, slime: 0.3, col: 0x7fe3ff },
  { name: "Ember Cliffs", pal: { top: 0x8b5a52, side: 0x3b2430, crum: 0xc0643a }, n: 10, gap: [2.6, 3.9], rise: [0.3, 1], r: [2, 2.9], w: { static: 0.25, mover: 0.3, crumble: 0.25, spring: 0.1, lift: 0.1 }, slime: 0.35, col: 0xff7a4a },
  { name: "Sky Temple", pal: { top: 0xf3ead7, side: 0xbfa98a, crum: 0xd2bf9c }, n: 10, gap: [2.8, 3.9], rise: [0.3, 1], r: [2, 2.8], w: { static: 0.25, mover: 0.25, crumble: 0.2, lift: 0.15, spring: 0.15 }, slime: 0.3, col: 0xffffff },
];
export const SHARDS = ZONES.length;
export const LIFT_H = 9;
export const MOVER = { amp: 2.0, spd: 0.8 };

// Where a moving platform is at time t (it slides back and forth along the path).
export const moverAt = (p, t) => {
  const s = Math.sin(t * p.spd + p.ph) * p.amp;
  return [p.bx + p.ax * s, p.bz + p.az * s];
};

export function buildWorld(code) {
  const R = mkRng(code);
  const D = mkRng(code + "/deco");
  const W = { code, plats: [], gems: [], slimes: [], shards: [], flags: [], springs: [], lifts: [], trees: [], flowers: [], clouds: [], pillars: [], temple: null, gate: null, path: [], topY: 0 };
  const plats = W.plats;
  const addPlat = (o) => {
    const p = { x: 0, y: 0, z: 0, r: 3, th: 1.2, kind: "static", zone: 0, ph: 0, amp: 0, spd: 0, ax: 0, az: 0, cp: false, rot: D() * TAU, ...o };
    p.bx = p.x; p.by = p.y; p.bz = p.z;
    p.i = plats.length;
    plats.push(p);
    return p;
  };
  const tree = (zi, x, y, z, s) => W.trees.push({ zi, x, y, z, s, rot: D() * TAU, v: [D(), D(), D(), D(), D(), D(), D()] });
  const scatter = (p, zi, n) => { for (let i = 0; i < n; i++) { const a = D() * TAU, d = p.r * (0.55 + D() * 0.35); tree(zi, p.x + Math.cos(a) * d, p.y, p.z + Math.sin(a) * d, 0.8 + D() * 0.5); } };
  const addGem = (x, y, z) => W.gems.push({ x, y, z });
  const addSlime = (p) => { const a = D() * TAU; W.slimes.push({ p: p.i, x: p.x + Math.cos(a) * p.r * 0.5, z: p.z + Math.sin(a) * p.r * 0.5 }); };
  const addFlag = (p, ox, oz) => { const f = { p: p.i, ox, oz, x: p.x + ox, y: p.y, z: p.z + oz }; W.flags.push(f); p.flag = W.flags.length - 1; };

  // the hub
  const hub = addPlat({ x: 0, y: 0, z: 0, r: 9, zone: -1, cp: true, th: 1.6 });
  addFlag(hub, 3.5, 3.5);
  for (let i = 0; i < 12; i++) { const a = D() * TAU, d = 5.5 + D() * 2.6; tree(0, Math.cos(a) * d, 0, Math.sin(a) * d, 1 + D() * 0.5); }
  for (let i = 0; i < 46; i++) { const a = D() * TAU, d = D() * 8.2; W.flowers.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, c: i % 4 }); }
  W.path.push(hub.i);

  let cur = hub, heading = 0.55, prevKind = "static";
  W.startHeading = heading;
  const pickKind = (Z, first) => {
    if (first) return "static";
    const ks = Object.keys(Z.w);
    let tot = 0;
    for (const k of ks) tot += Z.w[k];
    let r = R() * tot;
    for (const k of ks) { r -= Z.w[k]; if (r <= 0) return k; }
    return "static";
  };
  const place = (from, r2, gap, rise) => {
    for (let t = 0; t < 40; t++) {
      const h = heading + (t === 0 ? 0 : (R() - 0.5) * 2.2 * Math.min(1, t / 8));
      const d = from.r + gap + r2, x = from.bx + Math.cos(h) * d, z = from.bz + Math.sin(h) * d, y = from.by + rise;
      const clash = plats.some((q) => q !== from && Math.hypot(q.bx - x, q.bz - z) < q.r + r2 + 1.3 + (q.kind === "mover" ? q.amp : 0) && Math.abs(q.by - y) < 6.5);
      if (!clash || t === 39) return { x, y, z, h, gap, rise };
    }
    return null;
  };

  let shardNo = 0;
  for (let zi = 0; zi < ZONES.length; zi++) {
    const Z = ZONES[zi];
    for (let i = 0; i < Z.n; i++) {
      let kind = pickKind(Z, i === 0);
      if ((kind === "mover" && prevKind === "mover") || ((kind === "lift" || kind === "spring") && (prevKind === "lift" || prevKind === "spring"))) kind = "static";
      // you wait for a moving platform to come close — not on a stone that's falling away
      if (kind === "mover" && prevKind === "crumble") kind = "static";
      let r2 = Z.r[0] + R() * (Z.r[1] - Z.r[0]), gap = Z.gap[0] + R() * (Z.gap[1] - Z.gap[0]), rise = Z.rise[0] + R() * (Z.rise[1] - Z.rise[0]);
      if (kind === "mover") { r2 = 2.1; gap = 3.4; }
      if (kind === "lift") r2 = 1.9;
      if (kind === "spring") r2 = 2.5;
      if (kind === "crumble") r2 = Math.max(r2, 2.2);
      if (cur.kind === "mover") gap = 3.4;
      if (cur.kind === "lift") { rise = 5.3 + R() * 0.2; gap = 2.0 + R() * 0.5; }
      if (cur.kind === "spring") { rise = 4.2 + R() * 0.4; gap = 2.4 + R() * 0.5; }
      const pos = place(cur, r2, gap, rise);
      heading = pos.h + (R() - 0.5) * 0.8 + 0.1;
      const o = { x: pos.x, y: pos.y, z: pos.z, r: r2, kind, zone: zi, from: cur.i, gap, rise };
      if (kind === "mover") { o.amp = MOVER.amp; o.spd = MOVER.spd; o.ph = R() * TAU; o.ax = Math.cos(pos.h); o.az = Math.sin(pos.h); }
      const p = addPlat(o);
      W.path.push(p.i);
      if (kind === "lift") W.lifts.push({ p: p.i, x: p.x, z: p.z, r: 1.7, y0: p.y, h: LIFT_H });
      if (kind === "spring") W.springs.push({ p: p.i });
      if (kind === "static" && p.r >= 2.4 && i > 2 && R() < Z.slime) addSlime(p);
      if (kind === "static" && D() < 0.6) scatter(p, zi, 1);
      // gems: an arc of three between platforms, or one over a platform you can't arc to
      if (cur.kind !== "mover" && kind !== "mover" && kind !== "lift" && cur.kind !== "lift") {
        for (let k = 1; k <= 3; k++) { const t = k / 4; addGem(lerp(cur.bx, p.bx, t), lerp(cur.by, p.by, t) + 1.5 + Math.sin(Math.PI * t) * 1.1, lerp(cur.bz, p.bz, t)); }
      } else addGem(p.x, p.y + 1.4, p.z);
      prevKind = kind;
      cur = p;
    }
    // the shard island — or, last, the Sun Temple
    const last = zi === ZONES.length - 1;
    const rI = last ? 8 : 5.2;
    let rise = 0.5 + R() * 0.4, gap = 3;
    if (cur.kind === "lift") { rise = 5.3; gap = 2.2; }
    if (cur.kind === "spring") { rise = 4.2; gap = 2.6; }
    if (cur.kind === "mover") gap = 3.4;
    const pos = place(cur, rI, gap, rise);
    heading = pos.h + (R() - 0.5) * 0.6;
    const isl = addPlat({ x: pos.x, y: pos.y, z: pos.z, r: rI, kind: "static", zone: zi, cp: true, th: 1.6, from: cur.i, gap, rise, island: true });
    W.path.push(isl.i);
    const ang = Math.atan2(cur.bz - isl.z, cur.bx - isl.x);      // back the way you came
    addFlag(isl, Math.cos(ang + 0.7) * (rI - 1.6), Math.sin(ang + 0.7) * (rI - 1.6));
    scatter(isl, zi, 3);
    if (!last) {
      W.shards.push({ i: shardNo++, x: isl.x, y: isl.y + 1.9, z: isl.z, col: Z.col, p: isl.i });
      addSlime(isl);
      if (zi >= 2) addSlime(isl);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; addGem(isl.x + Math.cos(a) * 2.4, isl.y + 0.9, isl.z + Math.sin(a) * 2.4); }
    } else {
      // twelve pillars round the middle; the golden one (the gate) faces the way you arrive
      const pr = 3.4, N = 12;
      for (let k = 0; k < N; k++) {
        const a = ang + (k / N) * TAU, x = isl.x + Math.cos(a) * pr, z = isl.z + Math.sin(a) * pr;
        const pc = addPlat({ x, y: isl.y + 4.2, z, r: 0.7, th: 4.2, kind: "pillar", zone: 4, gate: k === 0 });
        W.pillars.push({ x, z, y0: isl.y, p: pc.i, gate: k === 0 });
        if (k === 0) W.gate = { x, z, y0: isl.y, p: pc.i };
      }
      W.temple = { x: isl.x, y: isl.y, z: isl.z, p: isl.i };
      const sa = ang + Math.PI * 0.55;
      W.shards.push({ i: shardNo++, x: isl.x + Math.cos(sa) * (rI - 2.3), y: isl.y + 1.9, z: isl.z + Math.sin(sa) * (rI - 2.3), col: Z.col, p: isl.i });
      addSlime(isl); addSlime(isl);
    }
    prevKind = "static";
    cur = isl;
  }
  W.topY = Math.max(...plats.map((p) => p.y));
  for (let i = 0; i < 46; i++) {
    const n = 3 + ((D() * 3) | 0), a = D() * TAU, d = 40 + D() * 230;
    W.clouds.push({ n, x: Math.cos(a) * d, y: -38 + D() * (W.topY + 70), z: Math.sin(a) * d, sp: 0.4 + D() * 1.2, v: Array.from({ length: n * 3 }, () => D()) });
  }
  return W;
}

// How far along the race: the furthest path platform reached (0…path.length-1).
// The shard count is the main thing; this breaks ties and shows the ranking.
export const pathIndexOf = (W, platIdx) => W.path.indexOf(platIdx);
