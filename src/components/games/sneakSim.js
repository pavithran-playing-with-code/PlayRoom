// src/components/games/sneakSim.js
// SHADOW SNEAK — the rules. A lighthouse stands in the middle of a block
// maze and sweeps its beam round. Walls cast real shadows: you are seen only
// while the beam points your way AND nothing stands between you and the
// lamp. Sneak from your corner to the lighthouse, shadow to shadow, and
// switch it off; then a bigger maze with a faster lamp, then two beams.
//
// Pure: no React, no three.js, no clock of its own, no Math.random. A level
// is built from the room's seed (buildLevel), so everyone gets the same maze;
// the beam's angle is a function of the match clock, so everyone sees the
// same sweep. scripts/check-sneak.mjs plans a safe route through every level
// and walks it through these rules.
//
// Space: a grid of 1 m cells, x across and z toward you; a cell's centre is
// (cx + 0.5, cz + 0.5). The lighthouse fills the middle cell.
import { seededRand } from "./seededRand.js";

export const OPEN = 0, LOW = 1, TALL = 2, TOWER = 3;
export const R = 0.3;              // the sneaker, a circle this wide
export const RUN = 3.0;            // m/s
export const CROUCH = 1.7;         // m/s, ducked (a low wall hides you only then)
export const HALF = 0.25;          // half the beam's width, radians
export const SPOT_S = 0.3;         // in the light this long: spotted
export const COOL_S = 0.5;         // out of it this long: forgotten
export const DOWN_S = 0.9;         // spotted: frozen this long, then back at your flag
export const GRACE_S = 1.8;        // just back (or just started): can't be spotted
export const TOUCH = 1.2;          // this near the lamp's middle: you're at its door
export const HEAT_S = 6;           // together: someone spotted, the lamp turns faster this long…
export const HEAT_X = 0.5;         // …by this much
export const TURN = 2.4;           // rad/s the lamp swings to a bell, and back to its round
export const PTS = { step: 12, off: 400, quick: 300, quickLose: 4, spotted: 20 };

export const sizeFor = (level) => (level < 1 ? 17 : level < 3 ? 21 : 25);
export const levelCode = (seed, level) => (((Number(seed) || 1) % 1000003) * 7919 + level * 104729) % 2147483646 + 1;
const wrap = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };
export const cellAt = (W, x, z) => { const cx = Math.floor(x), cz = Math.floor(z); return cx < 0 || cz < 0 || cx >= W.n || cz >= W.n ? TALL : W.cells[cz * W.n + cx]; };

// Does the lamp have a clear line to this spot? Low walls hide you only when
// you're ducked.
export function sees(W, x, z, ducked = false) {
  const tx = W.c + 0.5, tz = W.c + 0.5;
  const dx = x - tx, dz = z - tz, d = Math.hypot(dx, dz);
  if (d < 0.75) return true;
  const n = Math.ceil(d / 0.08);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (k * d < 0.72) continue;                        // still inside the lamp's own cell
    const c = cellAt(W, tx + dx * k, tz + dz * k);
    if (c === TALL || (c === LOW && ducked)) return false;
  }
  return true;
}

// Can this corner get to the lamp's door without ever crossing more than
// `reach` lit squares in a row? (A search over squares and how many lit ones
// in a row so far.)
const SPOTS = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];
function wayIn(W, dist, reach, sx, sz) {
  const n = W.n, cells = W.cells;
  if (!W.lit) {
    W.lit = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) if (cells[i] === OPEN) W.lit[i] = SPOTS.some(([ox, oz]) => sees(W, (i % n) + ox, Math.floor(i / n) + oz, false)) ? 1 : 0;
  }
  const lit = W.lit, seen = new Uint8Array(n * n * (reach + 1)), todo = [[sz * n + sx, 0]];
  seen[(sz * n + sx) * (reach + 1)] = 1;
  for (let h = 0; h < todo.length; h++) {
    const [cell, run] = todo[h];
    if (dist[cell] === 0) return true;
    for (const d of [1, -1, n, -n]) {
      const nc = cell + d;
      if (cells[nc] !== OPEN) continue;
      const nr = lit[nc] ? run + 1 : 0;
      if (nr > reach || seen[nc * (reach + 1) + nr]) continue;
      seen[nc * (reach + 1) + nr] = 1; todo.push([nc, nr]);
    }
  }
  return false;
}

// ── a level ─────────────────────────────────────────────────────────────────
// coop: the bells are put out (a friend ringing one makes the lamp look at it).
export function buildLevel(seed, level, { coop = false } = {}) {
  const n = sizeFor(level), c = (n - 1) / 2;
  const rand = seededRand(levelCode(seed, level));
  const at = (x, z) => z * n + x;
  // The lamp. One beam on the first ground (about 6 s of dark, and the walk in
  // is 6 s: you can nearly run it); two from the second (5 s of dark, falling
  // to under 4 as it turns faster, on grounds that take 7 to 10 s to cross);
  // three from the seventh (3.5 s of dark, falling to under 3).
  const beams = level >= 6 ? 3 : level >= 1 ? 2 : 1;
  const omega = beams === 1 ? 0.95 : beams === 2 ? 0.6 + (level - 1) * 0.05 : Math.min(0.75, 0.6 + (level - 6) * 0.03);
  // the longest stretch of lit ground you can cross between two beams, in squares
  const reach = Math.max(3, Math.floor(((Math.PI * 2) / (omega * beams) - (2 * HALF) / omega) * RUN * 0.42));
  const lowP = level >= 2 ? Math.min(0.4, 0.2 + (level - 2) * 0.05) : 0;     // low walls from the third maze on: they hide you only if you duck
  const corners = [[1, 1], [n - 2, n - 2], [n - 2, 1], [1, n - 2]];
  let cells, dist, W;
  // Open ground inside a wall, with short walls standing about on it: each
  // casts a wedge of shadow away from the lamp. (A tight maze is all shadow —
  // the lamp never matters; this way about half the floor can be lit.)
  // Built again, with a few more walls, until every corner has a way in whose
  // lit stretches can each be crossed in the dark between two beams.
  for (let go = 0; go < 8; go++) {
    cells = new Uint8Array(n * n).fill(OPEN);
    for (let i = 0; i < n; i++) cells[at(i, 0)] = cells[at(i, n - 1)] = cells[at(0, i)] = cells[at(n - 1, i)] = TALL;
    // a nook in every corner: its walls keep the corner dark, so a start is safe
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) for (const [x, z] of [[2, 2], [3, 2], [2, 3]]) cells[at(sx > 0 ? x : n - 1 - x, sz > 0 ? z : n - 1 - z)] = TALL;
    const want = Math.round((n - 2) * (n - 2) * (0.13 + go * 0.012));
    let put = 0;
    for (let tries = 0; tries < n * n * 6 && put < want; tries++) {
      const len = 2 + Math.floor(rand() * 4), across = rand() < 0.5;
      const x0 = 2 + Math.floor(rand() * (n - 4)), z0 = 2 + Math.floor(rand() * (n - 4));
      const kind = rand() < lowP ? LOW : TALL;
      let ok = true;
      for (let k = 0; k < len && ok; k++) {
        const x = x0 + (across ? k : 0), z = z0 + (across ? 0 : k);
        if (x > n - 3 || z > n - 3) { ok = false; break; }
        if (Math.max(Math.abs(x - c), Math.abs(z - c)) <= 2) { ok = false; break; }         // the lamp's own ground stays bare
        if (Math.min(x, n - 1 - x) <= 4 && Math.min(z, n - 1 - z) <= 4) { ok = false; break; } // and the corners keep their nooks
        for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) if (cells[at(x + dx, z + dz)] !== OPEN) { ok = false; break; }
      }
      if (!ok) continue;
      for (let k = 0; k < len; k++) cells[at(x0 + (across ? k : 0), z0 + (across ? 0 : k))] = kind;
      put += len;
    }
    cells[at(c, c)] = TOWER;
    W = { n, c, cells, level, beams, omega };
    // how far every square is from the lamp's door, in steps
    dist = new Int16Array(n * n).fill(-1);
    const q = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { dist[at(c + dx, c + dz)] = 0; q.push([c + dx, c + dz]); }
    for (let h = 0; h < q.length; h++) {
      const [x, z] = q[h];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (cells[at(nx, nz)] !== OPEN || dist[at(nx, nz)] >= 0) continue;
        dist[at(nx, nz)] = dist[at(x, z)] + 1; q.push([nx, nz]);
      }
    }
    let all = true;
    for (const [sx, sz] of corners) if (!wayIn(W, dist, reach, sx, sz)) { all = false; break; }
    if (all) break;
  }
  W.dist = dist;
  // a corner each, dark behind its nook
  W.starts = corners.map(([x, z]) => ({ x: x + 0.5, z: z + 0.5, d: dist[at(x, z)] }));
  // squares the lamp can never see: where flags and bells go
  const dark = [];
  for (let z = 1; z < n - 1; z++) for (let x = 1; x < n - 1; x++) {
    if (cells[at(x, z)] !== OPEN) continue;
    if (dist[at(x, z)] < 3) continue;
    if (Math.min(x, n - 1 - x) <= 3 && Math.min(z, n - 1 - z) <= 3) continue;      // not in a start's own nook
    let hid = true;
    for (const [ox, oz] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) if (sees(W, x + ox, z + oz, false)) { hid = false; break; }
    if (hid) dark.push({ x: x + 0.5, z: z + 0.5, d: dist[at(x, z)] });
  }
  // spread them out: each next one is the room furthest from those chosen
  const spread = (pool, k, from) => {
    const got = [], left = pool.slice();
    while (got.length < k && left.length) {
      let bi = 0, bd = -1;
      left.forEach((p, i) => {
        let m = 1e9;
        for (const g of got.concat(from)) m = Math.min(m, Math.hypot(p.x - g.x, p.z - g.z));
        if (m > bd) { bd = m; bi = i; }
      });
      got.push(left.splice(bi, 1)[0]);
    }
    return got;
  };
  W.checks = spread(dark, n === 17 ? 5 : n === 21 ? 7 : 9, W.starts).map((p, i) => ({ ...p, i }));
  const rest = dark.filter((p) => !W.checks.some((k) => k.x === p.x && k.z === p.z));
  W.bells = coop ? spread(rest, n === 17 ? 2 : 3, []).map((p, i) => ({ ...p, i, a: Math.atan2(p.z - (c + 0.5), p.x - (c + 0.5)) })) : [];
  W.phase = rand() * Math.PI * 2;
  return W;
}

// ── the lamp ────────────────────────────────────────────────────────────────
// Where beam 0 points on its round at match time T. heats: the times someone
// was spotted (together) — the lamp turns faster for HEAT_S after each.
export function roundAngle(W, T, heats = []) {
  let extra = 0;
  for (const h of heats) extra += Math.max(0, Math.min(T, h + HEAT_S) - h) * HEAT_X;
  return W.phase + W.omega * (T + extra);
}
// every beam's angle now (beam 0 is S.b0: it may be off its round, held by a bell)
export const beamAngles = (W, S) => Array.from({ length: W.beams }, (_, k) => S.b0 + (k * Math.PI * 2) / W.beams);
export const heated = (T, heats) => heats.some((h) => T >= h && T < h + HEAT_S);

export function inBeam(W, S, x, z) {
  const a = Math.atan2(z - (W.c + 0.5), x - (W.c + 0.5));
  for (const b of beamAngles(W, S)) if (Math.abs(wrap(a - b)) < HALF) return true;
  return false;
}

// ── a run of one level ──────────────────────────────────────────────────────
export function newRun(W, seat = 0, T = 0) {
  const st = W.starts[((seat % 4) + 4) % 4];
  return {
    x: st.x, z: st.z, face: 0, duck: false, moving: 0,
    cpX: st.x, cpZ: st.z, cp: -1, startD: st.d, best: st.d,
    seen: 0, down: 0, grace: GRACE_S, spots: 0, in: false, bell: -1,
    t: 0, b0: roundAngle(W, T), heats: [], lit: false,
  };
}

const hits = (W, x, z) => {
  const x0 = Math.floor(x - R), x1 = Math.floor(x + R), z0 = Math.floor(z - R), z1 = Math.floor(z + R);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    if (cellAt(W, cx + 0.5, cz + 0.5) === OPEN) continue;
    const px = Math.max(cx, Math.min(x, cx + 1)), pz = Math.max(cz, Math.min(z, cz + 1));
    if ((x - px) ** 2 + (z - pz) ** 2 < R * R - 1e-9) return true;
  }
  return false;
};

// One step. inp: { mx, mz (a push, length ≤ 1), duck }. T: the match clock.
// rung: a bell someone else is standing on (its index), or -1.
// Returns what happened: [{ k: "flag" | "spotted" | "back" | "in" | "bell" }].
export function step(S, W, inp, dt, T, rung = -1) {
  const ev = [];
  S.t += dt;
  // the lamp: on its round, unless a bell holds it
  const hold = S.bell >= 0 ? S.bell : rung;
  const want = hold >= 0 && W.bells[hold] ? W.bells[hold].a : roundAngle(W, T, S.heats);
  const off = wrap(want - S.b0);
  if (hold < 0 && Math.abs(off) < 0.02) S.b0 = want;
  else {
    const rate = Math.max(TURN, W.omega * 2.5) * dt;
    S.b0 += Math.abs(off) <= rate ? off : Math.sign(off) * rate;
  }
  S.held = hold >= 0;
  if (S.in) { S.moving = 0; return ev; }
  if (S.down > 0) {
    S.down -= dt; S.moving = 0;
    if (S.down <= 0) { S.x = S.cpX; S.z = S.cpZ; S.grace = GRACE_S; S.seen = 0; S.down = 0; ev.push({ k: "back" }); }
    return ev;
  }
  S.grace = Math.max(0, S.grace - dt);
  // walking
  S.duck = !!inp.duck;
  let mx = inp.mx || 0, mz = inp.mz || 0;
  const m = Math.hypot(mx, mz);
  if (m > 1) { mx /= m; mz /= m; }
  const sp = S.duck ? CROUCH : RUN;
  const dx = mx * sp * dt, dz = mz * sp * dt;
  if (dx && !hits(W, S.x + dx, S.z)) S.x += dx;
  if (dz && !hits(W, S.x, S.z + dz)) S.z += dz;
  S.moving = Math.min(1, m);
  if (m > 0.05) S.face = Math.atan2(mx, mz);
  // flags, bells, how near you've got
  for (const k of W.checks) if (S.cp !== k.i && Math.hypot(S.x - k.x, S.z - k.z) < 0.6) { S.cp = k.i; S.cpX = k.x; S.cpZ = k.z; ev.push({ k: "flag", i: k.i }); }
  let bell = -1;
  for (const b of W.bells) if (Math.hypot(S.x - b.x, S.z - b.z) < 0.55) bell = b.i;
  if (bell !== S.bell) { S.bell = bell; if (bell >= 0) ev.push({ k: "bell", i: bell }); }
  const d = W.dist[Math.floor(S.z) * W.n + Math.floor(S.x)];
  if (d >= 0 && d < S.best) S.best = d;
  // at the door
  if (Math.hypot(S.x - (W.c + 0.5), S.z - (W.c + 0.5)) < TOUCH) { S.in = true; S.best = 0; S.lit = false; S.seen = 0; ev.push({ k: "in" }); return ev; }
  // the light
  S.lit = inBeam(W, S, S.x, S.z) && sees(W, S.x, S.z, S.duck);
  if (S.lit && S.grace <= 0) {
    S.seen += dt / SPOT_S;
    if (S.seen >= 1) { S.seen = 1; S.down = DOWN_S; S.spots++; ev.push({ k: "spotted" }); }
  } else S.seen = Math.max(0, S.seen - dt / COOL_S);
  return ev;
}

// points for this level so far: how near you've got; switching it off, and doing it fast
export const progressPoints = (S) => Math.max(0, S.startD - S.best) * PTS.step;
export const offPoints = (S) => PTS.off + Math.max(0, Math.round(PTS.quick - S.t * PTS.quickLose));
