// src/components/games/towerWorld.js
// Sunshard Jump — the Sky Tree climb. No three.js and no React: just
// numbers, so scripts/check-tower.mjs can build it and drive a bot up it.
//
// A giant tree grows out of a meadow island and up through the clouds. A
// spiral of floating stones winds round it, all the way up to the Sun Crown on
// its top. Behind you the Gloom — a sea of storm cloud — rises from below, a
// little faster all the time. Climb, grab the Sunshards on the stones that
// stick out (each one sinks the Gloom), and reach the Crown.
//
// The world is the same shape sunshardWorld.buildWorld makes (plats, path,
// flags, slimes, shards, springs, lifts…), so sunshardSim runs it and
// sunshardScene draws it unchanged; the tree is W.trunk, and it is a stone
// too (kind "trunk": you can't run through it, and the Crown sits on it).
//
// Every jump is kept possible, as on the islands: edge gaps 2–4 m, rises
// 0.3–1.1 m, and after a wind vent or a bounce mushroom 4–5.5 m up. A round
// after the first is a new tree from the next seed: a new look (LOOKS), a
// little harder, a twist (wind or blinking stones), and a taller tree.
import { mkRng, TAU, ZONES, LOOKS, LIFT_H, MOVER, twistOf } from "./sunshardWorld.js";

// The bands of the climb, bottom to top — each its own stones, sky and name
// (the stones' colours and the sky are the island zones').
export const BANDS = [
  { name: "Meadow Roots", top: 32 },
  { name: "Sandy Boughs", top: 70 },
  { name: "Frost Branches", top: 108 },
  { name: "Ember Canopy", top: 146 },
  { name: "Sun Crown", top: Infinity },
];
export const bandAt = (y) => { let b = 0; while (b < BANDS.length - 1 && y >= BANDS[b].top) b++; return b; };
export const summitOf = (round) => 176 + Math.min(4, Math.max(0, round | 0)) * 8;

// The Gloom: where it is t seconds into a climb (it waits a moment first,
// then rises, a little faster all the time). Your own Gloom — every phone
// works its own out, from when its climb began — less what you've sunk it by
// (Sunshards, and a catch pushes it back down under you).
export const GLOOM = { y0: -12, wait: 20, v0: 0.03, acc: 0.0013 };
export function gloomAt(t, round = 0) {
  const tt = Math.max(0, t - GLOOM.wait), k = 1 + 0.12 * Math.min(4, Math.max(0, round | 0));
  return GLOOM.y0 + GLOOM.v0 * k * tt + GLOOM.acc * k * tt * tt;
}
export const SHARD_SINK = 7;          // a Sunshard sinks your Gloom this far
export const BALLOONS = 3;            // catches before the climb is over (race and solo)

// Points: 20 a metre of your best height, 150 a Sunshard; the Crown 5,000 more.
export const PTS = { metre: 20, shard: 150, crown: 5000 };
export const climbPoints = (maxY, shards) => Math.max(0, Math.round(maxY)) * PTS.metre + shards * PTS.shard;

const TRUNK_R = 5, CROWN_R = 8, HUB_R = 12;

export function buildTower(code, round = 0) {
  const R = mkRng(code);
  const D = mkRng(code + "/deco");
  const tier = Math.min(4, Math.max(0, round | 0)), twist = twistOf(tier ? round : 0);
  const SUMMIT = summitOf(round);
  const W = { code, round: round | 0, look: (round | 0) % LOOKS.length, twist, tower: true, plats: [], slimes: [], shards: [], flags: [], springs: [], lifts: [], trees: [], flowers: [], clouds: [], pillars: [], temple: null, gate: null, path: [], topY: SUMMIT, summit: SUMMIT };
  const plats = W.plats;
  const addPlat = (o) => {
    const p = { x: 0, y: 0, z: 0, r: 3, th: 1.2, kind: "static", zone: 0, ph: 0, amp: 0, spd: 0, ax: 0, az: 0, cp: false, rot: D() * TAU, ...o };
    p.bx = p.x; p.by = p.y; p.bz = p.z;
    p.i = plats.length;
    plats.push(p);
    return p;
  };
  const tree = (zi, x, y, z, s) => W.trees.push({ zi, x, y, z, s, rot: D() * TAU, v: [D(), D(), D(), D(), D(), D(), D()] });
  const addSlime = (p) => { const a = D() * TAU; W.slimes.push({ p: p.i, x: p.x + Math.cos(a) * p.r * 0.5, z: p.z + Math.sin(a) * p.r * 0.5 }); };
  const addFlag = (p, ox, oz) => { const f = { p: p.i, ox, oz, x: p.x + ox, y: p.y, z: p.z + oz }; W.flags.push(f); p.flag = W.flags.length - 1; };

  // the meadow at the foot of the tree: a ring round the trunk
  const hub = addPlat({ x: 0, y: 0, z: 0, r: HUB_R, zone: -1, cp: true, th: 1.8 });
  addFlag(hub, Math.cos(-1.0) * (HUB_R - 2.4), Math.sin(-1.0) * (HUB_R - 2.4));        // round the meadow from the first jump: you set off side-on to the tree
  // trees round the meadow, but not on the way from the flag to the first stone
  for (let i = 0; i < 14; i++) { const a = D() * TAU, d = TRUNK_R + 2.2 + D() * (HUB_R - TRUNK_R - 3.4); if (a > TAU - 1.4 || a < 0.4) continue; tree(0, Math.cos(a) * d, 0, Math.sin(a) * d, 0.9 + D() * 0.5); }
  for (let i = 0; i < 50; i++) { const a = D() * TAU, d = TRUNK_R + 0.8 + D() * (HUB_R - TRUNK_R - 1.4); W.flowers.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, c: i % 4 }); }
  W.path.push(hub.i);
  // the tree itself: a stone you can't run through, its top just under the Crown
  const trunk = addPlat({ x: 0, y: SUMMIT - 1.7, z: 0, r: TRUNK_R, th: SUMMIT + 1, kind: "trunk", zone: 4 });
  W.trunk = { x: 0, z: 0, r: TRUNK_R, y0: -1, y1: SUMMIT - 1.7, p: trunk.i };

  // The spiral: stone after stone round the tree, each a jump from the last.
  // ang: where round the tree; rad: how far out (it wanders a little, and
  // comes in near the top, for the jump onto the Crown).
  let ang = 0, rad = 18, cur = hub, prevKind = "static", sinceFlag = 0, sinceShard = 0, n = 0;
  // the first stone: off the meadow's edge, by the flag
  const pickKind = (Z, first) => {
    if (first) return "static";
    const ks = Object.keys(Z.w);
    let tot = 0;
    for (const k of ks) tot += Z.w[k];
    let r = R() * tot;
    for (const k of ks) { r -= Z.w[k]; if (r <= 0) return k; }
    return "static";
  };
  const clashes = (x, y, z, r) => plats.some((q) => q !== cur && q.kind !== "trunk" && q !== hub && Math.hypot(q.bx - x, q.bz - z) < q.r + r + 1.3 + (q.kind === "mover" ? q.amp : 0) && Math.abs(q.by - y) < 5.5);
  // on until the last stone is a plain jump onto the Crown: just under its rim, and in reach
  const atCrown = () => cur !== hub && cur.by >= SUMMIT - 1.25 && Math.hypot(cur.bx, cur.bz) - cur.r - CROWN_R <= 3.6 && !["mover", "lift", "spring", "blink", "crumble"].includes(cur.kind);
  while (!atCrown() && n < 600) {
    const zi = Math.min(4, bandAt(cur.y + 1));
    const Z0 = ZONES[zi];
    const Z = !tier ? Z0 : {
      ...Z0,
      gap: [Math.min(3.4, Z0.gap[0] + 0.1 * tier), Math.min(3.9, Z0.gap[1] + 0.08 * tier)],
      r: [Math.max(1.9, Z0.r[0] - 0.08 * tier), Math.max(2.2, Z0.r[1] - 0.08 * tier)],
      w: { ...Z0.w, static: Math.max(0.15, (Z0.w.static || 0) * (1 - 0.12 * tier)), crumble: (Z0.w.crumble || 0) + 0.04 * tier, mover: (Z0.w.mover || 0) + 0.04 * tier },
      slime: Z0.slime + 0.04 * tier,
    };
    let kind = pickKind(Z, n === 0);
    if ((kind === "mover" && prevKind === "mover") || ((kind === "lift" || kind === "spring") && (prevKind === "lift" || prevKind === "spring"))) kind = "static";
    if (kind === "mover" && prevKind === "crumble") kind = "static";
    if (twist === "blink" && kind === "static" && n > 0 && !["crumble", "blink", "mover", "lift", "spring"].includes(prevKind) && R() < 0.35) kind = "blink";
    // a checkpoint every so often: a wider, plain stone with a flag
    const cp = sinceFlag >= 13 && !["mover", "lift", "spring"].includes(prevKind);
    if (cp) kind = "static";
    let r2 = Z.r[0] + R() * (Z.r[1] - Z.r[0]), gap = Z.gap[0] + R() * (Z.gap[1] - Z.gap[0]), rise = 0.3 + R() * 0.8;
    if (cp) r2 = 3.6;
    if (kind === "mover") { r2 = 2.1; gap = 3.4; }
    if (kind === "lift") r2 = 1.9;
    if (kind === "spring") r2 = 2.5;
    if (kind === "crumble") r2 = Math.max(r2, 2.2);
    if (cur.kind === "mover") gap = 3.4;
    if (cur.kind === "lift") { rise = 5.3 + R() * 0.2; gap = 2.0 + R() * 0.5; }
    if (cur.kind === "spring") { rise = 4.2 + R() * 0.4; gap = 2.4 + R() * 0.5; }
    if (n === 0) { rise = 0.6; gap = 2.6; }
    // near the top: nothing that throws you up past the Crown, and never above its rim
    if (cur.by > SUMMIT - 14 && (kind === "lift" || kind === "spring" || kind === "mover")) kind = "static";
    if (cur.by + rise > SUMMIT - 0.4) rise = Math.max(0, SUMMIT - 0.4 - cur.by);
    // how far out: wanders between 16 and 20, then in toward the Crown near the top
    const nearTop = cur.by + rise > SUMMIT - 26;
    let rad2 = nearTop ? Math.max(13.5, rad - 0.9) : Math.min(20, Math.max(16, rad + (R() - 0.5) * 2.4));
    // the distance from this stone's middle to the next one's
    const want = (cur === hub ? 0 : cur.r) + gap + r2;
    let x, z, y = cur.by + rise, tries = 0;
    for (;;) {
      if (cur === hub) {
        // off the meadow's edge, outward from the flag
        x = HUB_R + gap + r2; z = 0; ang = 0; rad2 = x; break;
      }
      // the angle step that puts the next one `want` away (the chord between two radii)
      const c = (rad * rad + rad2 * rad2 - want * want) / (2 * rad * rad2);
      const da = Math.acos(Math.max(-1, Math.min(1, c)));
      const a2 = ang + da;
      x = Math.cos(a2) * rad2; z = Math.sin(a2) * rad2;
      if (!clashes(x, y, z, r2) || tries > 6) { ang = a2; break; }
      // a stone of the lap below is in the way: a little higher, or a little further out
      tries++; y += 0.25; if (!nearTop) rad2 = Math.min(21, rad2 + 0.5);
      if (y - cur.by > (cur.kind === "lift" ? 5.6 : cur.kind === "spring" ? 4.7 : 1.15)) y = cur.by + (cur.kind === "lift" ? 5.5 : cur.kind === "spring" ? 4.6 : 1.1);
      if (y > SUMMIT - 0.4) y = Math.max(cur.by, SUMMIT - 0.4);
    }
    rad = rad2;
    const o = { x, y, z, r: r2, kind, zone: Math.min(4, bandAt(y)), from: cur.i, gap, rise: y - cur.by, cp };
    if (kind === "mover") {
      const tx = -Math.sin(ang), tz = Math.cos(ang);               // along the spiral
      o.amp = MOVER.amp; o.spd = MOVER.spd; o.ph = R() * TAU; o.ax = tx; o.az = tz;
    }
    if (kind === "blink") o.ph = D();
    const p = addPlat(o);
    W.path.push(p.i);
    if (cp) { const fa = ang + Math.PI; addFlag(p, Math.cos(fa) * 1.6, Math.sin(fa) * 1.6); sinceFlag = 0; } else sinceFlag++;
    if (kind === "lift") W.lifts.push({ p: p.i, x: p.x, z: p.z, r: 1.7, y0: p.y, h: LIFT_H });
    if (kind === "spring") W.springs.push({ p: p.i });
    if (kind === "static" && !cp && p.r >= 2.4 && n > 4 && R() < Z.slime) addSlime(p);
    if (kind === "static" && !cp && D() < 0.35) { const a = D() * TAU, d = p.r * 0.7; tree(p.zone, p.x + Math.cos(a) * d, p.y, p.z + Math.sin(a) * d, 0.7 + D() * 0.4); }
    // a Sunshard, now and then, on a little stone sticking out from the spiral:
    // off the way up, so it costs you a detour
    sinceShard++;
    if (sinceShard >= 9 && kind === "static" && !cp && !nearTop) {
      const out = rad + p.r + 2.6 + 1.7, sx = Math.cos(ang) * out, sz = Math.sin(ang) * out, sy = p.y + 0.5;
      if (!plats.some((q) => q !== p && q.kind !== "trunk" && q !== hub && Math.hypot(q.bx - sx, q.bz - sz) < q.r + 1.7 + 1.2 && Math.abs(q.by - sy) < 5.5)) {
        const b = addPlat({ x: sx, y: sy, z: sz, r: 1.7, kind: "static", zone: p.zone, side: true });
        W.shards.push({ i: W.shards.length, x: b.x, y: b.y + 1.9, z: b.z, col: ZONES[p.zone].col, p: b.i });
        sinceShard = 0;
      }
    }
    prevKind = kind;
    cur = p;
    n++;
  }
  // the Sun Crown on top of the tree: the last jump, onto it
  const crown = addPlat({ x: 0, y: SUMMIT, z: 0, r: CROWN_R, th: 1.6, kind: "static", zone: 4, cp: true, island: true, from: cur.i });
  W.path.push(crown.i);
  W.crown = { x: 0, y: SUMMIT, z: 0, r: CROWN_R, p: crown.i };
  addFlag(crown, CROWN_R - 1.8, 0);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + 0.3; tree(4, Math.cos(a) * (CROWN_R - 1.2), SUMMIT, Math.sin(a) * (CROWN_R - 1.2), 0.8 + D() * 0.3); }
  // clouds all the way up
  for (let i = 0; i < 60; i++) {
    const n2 = 3 + ((D() * 3) | 0), a = D() * TAU, d = 45 + D() * 220;
    W.clouds.push({ n: n2, x: Math.cos(a) * d, y: -30 + D() * (SUMMIT + 60), z: Math.sin(a) * d, sp: 0.4 + D() * 1.2, v: Array.from({ length: n2 * 3 }, () => D()) });
  }
  return W;
}

// Each round is a new tree from the room's seed.
export const towerCode = (seed, round) => `skytree-${Number(seed) || 1}${round ? "-" + round : ""}`;

// A climb begins at the meadow's flag (sunshardSim's newRun puts you in the
// middle of the map, which here is inside the tree).
export function startClimb(S, W) {
  const f = W.flags[0];
  Object.assign(S.pl, { x: f.x, y: 0, z: f.z });
  return S;
}

// Falling off the spiral never drops you down the laps below: more than
// FALL_BACK under the last solid stone you stood on (a plain one — never one
// that moves, crumbles or blinks) and you pop back up onto it. True when it did.
export const FALL_BACK = 8;
export function fallBack(S, W) {
  const P = S.pl;
  if (P.onG && P.gp !== null && W.plats[P.gp].kind === "static") { const q = S.plats[P.gp]; S.safe = { x: q.x, y: q.y, z: q.z }; }
  if (!S.safe || P.y > S.safe.y - FALL_BACK) return false;
  Object.assign(P, { x: S.safe.x, y: S.safe.y + 0.3, z: S.safe.z, vx: 0, vy: 0, vz: 0, onG: false, gp: null, inv: 1 });
  return true;
}
