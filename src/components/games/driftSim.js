// src/components/games/driftSim.js
// Speedway's rules — a top-down drift racer in the style of "Turbo Drift".
// No drawing and no React: scripts/check-speedway.mjs drives it.
//
// The track: a closed loop from a radius with a few sine harmonics, stretched
// into an oval, resampled to M evenly spaced points, from a text code hashed
// with xmur3 + mulberry32 — the room's seed makes the code, so everyone in a
// room races the same course. Retried until its bends are gentle and it never
// comes near itself. Each point keeps its tangent angle, its normal and how
// sharply the road turns there (for the computer's drivers).
//
// The car: arcade drift. Velocity is split into forward and sideways parts;
// sideways slip dies away fast on the road, slower on grass and slowly while
// drifting. Hold drift through a bend above 200 to build a charge; let go
// for a boost — longer the more you charged (sparks white → blue → orange →
// purple). Boost pads give a boost too.
//
// Effects (smoke, sparks, flames, dust, skid marks) are asked for through
// fx(type, …) so the rules stay pure; sounds through the events returned.

export const HALF = 88, CURB = 14, RUN = 100, WALL = HALF + CURB + RUN, M = 640;
export const MAXV = 480, GRASSV = 270;
export const START_S = 3;                       // the countdown: cars locked until GO
export const KMH = 0.4;                         // px/s → km/h on the speedo
export const CAR_R = 21;
export const COLORS = ["#ff5d3b", "#37c8e6", "#ffc83d", "#a678ff", "#f4efe6", "#ff8fc7", "#8fdb5c", "#ff9f43"];
const PI = Math.PI, TAU = PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const ad = (a, b) => { let d = a - b; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };

// Laps from the room's clock: the prompt's 3 / 5 / 8, each with time to spare.
export const lapsFor = (secs) => (secs >= 300 ? 8 : secs >= 180 ? 5 : 3);
export const trackCode = (seed) => `room-${Number(seed) || 1}`;

// ── random ───────────────────────────────────────────────────────────────────
function xmur3(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const mkRng = (s) => mulberry32(xmur3(s)());

// ── the track ────────────────────────────────────────────────────────────────
const cache = new Map();
export function buildTrack(code) {
  if (cache.has(code)) return cache.get(code);
  let best = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = mkRng(code + "#" + attempt);
    const hs = [];
    for (let h = 2; h <= 6; h++) hs.push({ h, a: (0.05 + r() * 0.24) / Math.pow(h, 0.8), p: r() * TAU });
    const sx = 1.3 + r() * 0.25, sy = 0.85 + r() * 0.2, R = 1250, K = 1600, raw = [];
    for (let i = 0; i < K; i++) {
      const t = (i / K) * TAU;
      let rad = 1;
      for (const o of hs) rad += o.a * Math.sin(o.h * t + o.p);
      raw.push([Math.cos(t) * rad * R * sx, Math.sin(t) * rad * R * sy]);
    }
    const cum = [0];
    for (let i = 1; i <= K; i++) { const a = raw[i - 1], b = raw[i % K]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const L = cum[K], ds = L / M, pts = [];
    let j = 0;
    for (let i = 0; i < M; i++) {
      const d = i * ds;
      while (cum[j + 1] < d) j++;
      const f = (d - cum[j]) / (cum[j + 1] - cum[j]), a = raw[j], b = raw[(j + 1) % K];
      pts.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f });
    }
    const ang = [], turn = [];
    for (let i = 0; i < M; i++) { const a = pts[(i + M - 1) % M], b = pts[(i + 1) % M]; ang.push(Math.atan2(b.y - a.y, b.x - a.x)); }
    let maxT = 0;
    for (let i = 0; i < M; i++) { const t = Math.abs(ad(ang[(i + 2) % M], ang[(i + M - 2) % M])) / (4 * ds); turn.push(t); if (t > maxT) maxT = t; }
    let minD = 1e9;
    for (let i = 0; i < M; i++) for (let k = i + 45; k < M; k++) {
      if (M - (k - i) < 45) continue;
      const d = Math.hypot(pts[i].x - pts[k].x, pts[i].y - pts[k].y);
      if (d < minD) minD = d;
    }
    const ok = maxT < 1 / 175 && minD > 2 * WALL + 40;
    const score = (maxT < 1 / 175 ? 0 : maxT * 1000) + (minD > 2 * WALL + 40 ? 0 : 1000);
    if (!best || score < best.score || ok) { best = { score, pts, ang, turn, ds, L, ok, attempt }; if (ok) break; }
  }
  const { pts, ang, turn, ds, L } = best;
  const t = { code, P: pts, ANG: ang, TURN: turn, Rx: ang.map((a) => -Math.sin(a)), Ry: ang.map((a) => Math.cos(a)), ds, L, ok: best.ok, attempt: best.attempt };
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  t.bb = { x0: x0 - WALL, y0: y0 - WALL, x1: x1 + WALL, y1: y1 + WALL };
  // scenery: tree clusters, never on the road
  t.trees = [];
  const lim = WALL + 60, pr = mkRng(code + "/trees");
  for (let n = 0, tries = 0; n < 420 && tries < 4000; tries++) {
    const x = t.bb.x0 - 500 + pr() * (t.bb.x1 - t.bb.x0 + 1000), y = t.bb.y0 - 500 + pr() * (t.bb.y1 - t.bb.y0 + 1000);
    let ok = true;
    for (let i = 0; i < M; i += 2) { const dx = x - pts[i].x, dy = y - pts[i].y; if (dx * dx + dy * dy < lim * lim) { ok = false; break; } }
    if (ok) { t.trees.push({ x, y, r: 16 + pr() * 20, k: pr(), ph: pr() * 6 }); n++; }
  }
  // seven boost pads, in random lanes
  t.pads = [];
  for (let i = 0; i < 7; i++) {
    const idx = Math.floor((M * (i + 0.25 + pr() * 0.5)) / 7);
    if (idx < 30 || idx > M - 30) continue;
    t.pads.push({ idx, lane: (pr() - 0.5) * 90 });
  }
  for (const p of t.pads) { p.x = pts[p.idx].x + t.Rx[p.idx] * p.lane; p.y = pts[p.idx].y + t.Ry[p.idx] * p.lane; }
  cache.set(code, t);
  return t;
}

// ── cars ─────────────────────────────────────────────────────────────────────
// Grid: two abreast, rows four points apart, behind the line.
export function makeCar(T, slot, o = {}) {
  const row = slot >> 1, side = slot % 2 ? 1 : -1, idx = (M - 6 - row * 4 + M * 4) % M;
  return {
    name: o.name || "", color: o.color || COLORS[slot % COLORS.length], human: !!o.human, ai: !!o.ai, skill: o.skill || 1,
    lane: o.lane ?? 0, ph: o.ph ?? 0, mul: 1,
    x: T.P[idx].x + T.Rx[idx] * side * 34, y: T.P[idx].y + T.Ry[idx] * side * 34, a: T.ANG[idx], vx: 0, vy: 0,
    steer: 0, drifting: false, charge: 0, boostT: 0, boostMax: 1,
    lap: 0, idx, prog: idx, off: 0, finished: false, finAt: null, lapStart: 0, best: 0, last: 0,
    stuck: 0, sk: null, sm: 0, sp: 0, braking: false, wrong: 0, thr: 0, roll: 0,
  };
}
export const chargeLevel = (c) => (c > 3 ? 3 : c > 1.7 ? 2 : c > 0.7 ? 1 : 0);
export const SPARK = ["#ffffff", "#37c8e6", "#ff9a2e", "#d46bff"];

// One frame of a car. inp: { thr, brk, str (-1..1), dr }. fx(type, x, y, vx, vy, life, size, color)
// draws effects (pass a no-op in tests). Returns { boosted } — a drift boost let go this frame.
export function stepCar(T, c, inp, dt, fx = () => {}) {
  const out = { boosted: 0 };
  c.steer += (inp.str - c.steer) * Math.min(1, dt * 9);
  c.thr = inp.thr; c.braking = !!inp.brk;
  const dx = Math.cos(c.a), dy = Math.sin(c.a), rx = -dy, ry = dx;
  let f = c.vx * dx + c.vy * dy, l = c.vx * rx + c.vy * ry;
  const grass = Math.abs(c.off) > HALF + CURB, boosting = c.boostT > 0;
  const maxV = (grass ? GRASSV : MAXV) * c.mul + (boosting ? 230 : 0);
  if (inp.thr) { if (f < maxV) f += (boosting ? 1500 : 640) * dt * Math.max(0.06, 1 - f / maxV); }
  if (f > maxV) f -= (f - maxV) * 1.6 * dt;
  if (inp.brk) { f -= (f > 5 ? 1300 : 420) * dt; if (f < -160) f = -160; }
  if (!inp.thr && !inp.brk) f -= f * 0.7 * dt;
  f -= f * 0.18 * dt;
  if (grass) f -= f * 1.1 * dt;
  const sp = Math.abs(f);
  const want = inp.dr && f > 200 && (c.drifting || Math.abs(c.steer) > 0.3);
  if (want) { c.drifting = true; c.charge += dt * (0.9 + Math.abs(c.steer) * 0.6); }
  else if (c.drifting) {
    c.drifting = false;
    const t = c.charge > 3 ? 1.6 : c.charge > 1.7 ? 1.1 : c.charge > 0.7 ? 0.6 : 0;
    if (t > 0) {
      c.boostT = Math.max(c.boostT, t); c.boostMax = t; out.boosted = t;
      for (let i = 0; i < 18; i++) fx("spark", c.x - dx * 14, c.y - dy * 14, -dx * 200 + (Math.random() - 0.5) * 240, -dy * 200 + (Math.random() - 0.5) * 240, 0.4, 2, "#fff");
    }
    c.charge = 0;
  }
  c.a += ((c.steer * 2.5 * clamp(sp / 160, 0, 1)) / (1 + sp / 1000)) * (f < 0 ? -1 : 1) * (c.drifting ? 1.3 : 1) * dt;
  l *= Math.exp(-(c.drifting ? 1.5 : grass ? 5 : 10) * dt);
  c.vx = f * dx + l * rx; c.vy = f * dy + l * ry;
  c.x += c.vx * dt; c.y += c.vy * dt;
  if (c.boostT > 0) c.boostT = Math.max(0, c.boostT - dt);
  c.roll += (clamp(l / 160, -1, 1) - c.roll) * Math.min(1, dt * 10);
  c.slide = c.drifting || (inp.brk && f > 250) || Math.abs(l) > 110;
  carFx(c, dt, fx, grass);
  return out;
}

// Smoke, sparks, flames, dust and skid marks off a car — yours, the computer's,
// or a friend's drawn from what their phone said (so they look the same).
export function carFx(c, dt, fx, grass = Math.abs(c.off) > HALF + CURB) {
  const ndx = Math.cos(c.a), ndy = Math.sin(c.a), nrx = -ndy, nry = ndx, spd = Math.hypot(c.vx, c.vy);
  const w1x = c.x - ndx * 12 + nrx * 10, w1y = c.y - ndy * 12 + nry * 10, w2x = c.x - ndx * 12 - nrx * 10, w2y = c.y - ndy * 12 - nry * 10;
  if (c.slide && !grass && spd > 80) {
    if (c.sk) fx("skid", c.sk[0], c.sk[1], w1x, w1y, c.sk[2], c.sk[3], w2x, w2y);
    c.sk = [w1x, w1y, w2x, w2y];
    c.sm -= dt;
    if (c.sm <= 0) {
      c.sm = 0.035;
      fx("smoke", w1x, w1y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.7, 7, "#e8e4dc");
      fx("smoke", w2x, w2y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.7, 7, "#e8e4dc");
    }
  } else c.sk = null;
  if (c.drifting) {
    c.sp -= dt;
    if (c.sp <= 0) {
      c.sp = 0.03;
      const s = Math.random() < 0.5;
      fx("spark", s ? w1x : w2x, s ? w1y : w2y, -ndx * 90 + (Math.random() - 0.5) * 180, -ndy * 90 + (Math.random() - 0.5) * 180, 0.35, 2, SPARK[chargeLevel(c.charge)]);
    }
  }
  if (grass && spd > 90 && Math.random() < dt * 30) fx("dust", w1x, w1y, (Math.random() - 0.5) * 50 - c.vx * 0.1, (Math.random() - 0.5) * 50 - c.vy * 0.1, 0.6, 6, "#6b8a3e");
  if (c.boostT > 0) fx("flame", c.x - ndx * 20 + (Math.random() - 0.5) * 5, c.y - ndy * 20 + (Math.random() - 0.5) * 5, -ndx * 160 + (Math.random() - 0.5) * 40, -ndy * 160 + (Math.random() - 0.5) * 40, 0.28, 7, c.boostMax > 1.5 ? "#d46bff" : "#ffb12e");
}

// Where a car is on the track: nearest point, laps (crossing the line one way
// or back), how far off the middle, and its progress (lap × M + point).
// Returns 1 when a lap was completed this frame.
export function trackUpdate(T, c) {
  let best = 1e18, bi = c.idx;
  for (let k = -30; k <= 30; k++) {
    const i = (c.idx + k + M) % M, dx = c.x - T.P[i].x, dy = c.y - T.P[i].y, d = dx * dx + dy * dy;
    if (d < best) { best = d; bi = i; }
  }
  const prev = c.idx;
  c.idx = bi;
  let lapped = 0;
  if (prev > M * 0.75 && bi < M * 0.25) { c.lap++; lapped = 1; }
  else if (prev < M * 0.25 && bi > M * 0.75) c.lap--;
  c.off = (c.x - T.P[bi].x) * T.Rx[bi] + (c.y - T.P[bi].y) * T.Ry[bi];
  c.prog = c.lap * M + bi;
  return lapped;
}

// The wall at the outside of the run-off: slide back on, bounce off it.
// Returns how hard it was hit (0 if not).
export function wallHit(T, c) {
  const o = c.off;
  if (Math.abs(o) <= WALL) return 0;
  const s = o > 0 ? 1 : -1, nx = T.Rx[c.idx] * s, ny = T.Ry[c.idx] * s, over = Math.abs(o) - WALL;
  c.x -= nx * over; c.y -= ny * over;
  const vn = c.vx * nx + c.vy * ny;
  if (vn > 0) { c.vx -= 1.45 * vn * nx; c.vy -= 1.45 * vn * ny; c.vx *= 0.92; c.vy *= 0.92; return vn; }
  return 0;
}

// Two cars: circles of CAR_R, pushed apart, bouncing (restitution 0.75). A
// car that's only drawn here (a friend's — their own phone moves it) doesn't
// move: `fixed`. Returns the closing speed if they hit, else 0.
export function bump(a, b, aFixed = false, bFixed = false) {
  let dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= CAR_R * 2 || d < 0.01 || (aFixed && bFixed)) return 0;
  dx /= d; dy /= d;
  const ov = CAR_R * 2 - d, wa = aFixed ? 0 : bFixed ? 1 : 0.5, wb = bFixed ? 0 : aFixed ? 1 : 0.5;
  a.x -= dx * ov * wa; a.y -= dy * ov * wa; b.x += dx * ov * wb; b.y += dy * ov * wb;
  const rv = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
  if (rv >= 0) return 0;
  const j = -rv * 0.75;                     // against a car that won't move, take it all yourself
  if (!aFixed) { const k = bFixed ? 2 : 1; a.vx -= dx * j * k; a.vy -= dy * j * k; }
  if (!bFixed) { const k = aFixed ? 2 : 1; b.vx += dx * j * k; b.vy += dy * j * k; }
  return -rv;
}

// The computer's driving: aim a few points ahead on its own lane, slow for
// the bends coming up, and a little rubber band toward the human (-6%..+7%).
export function aiInput(T, c, humanProg, clock) {
  const spd = Math.hypot(c.vx, c.vy), look = 7 + Math.floor(spd / 38), ti = (c.idx + look) % M;
  const lane = c.lane + Math.sin(clock * 0.4 + c.ph) * 18;
  const tx = T.P[ti].x + T.Rx[ti] * lane, ty = T.P[ti].y + T.Ry[ti] * lane;
  const d = ad(Math.atan2(ty - c.y, tx - c.x), c.a);
  let mt = 0.0008;
  for (let k = 3; k < look + 16; k += 3) mt = Math.max(mt, T.TURN[(c.idx + k) % M]);
  const tvc = (-1 + Math.sqrt(1 + (4 * 2.5) / (1000 * mt))) * 500 * 0.92;
  const tv = Math.min(tvc, MAXV * c.mul);
  c.mul = c.skill + clamp(((humanProg ?? c.prog) - c.prog) / M * 0.2, -0.06, 0.07);
  return { thr: spd < tv ? 1 : 0, brk: spd > tv * 1.14 ? 1 : 0, str: clamp(d * 2.4, -1, 1), dr: 0 };
}

// Back on the road where you are, stopped, pointing the right way.
export function respawn(T, c) {
  const i = c.idx;
  c.x = T.P[i].x; c.y = T.P[i].y; c.a = T.ANG[i]; c.vx = c.vy = 0; c.stuck = 0; c.off = 0; c.drifting = false; c.charge = 0; c.sk = null;
}

// Stuck (barely moving off the road, or not moving at all) for 2.2 s: respawn.
export function checkStuck(T, c, dt) {
  const spd = Math.hypot(c.vx, c.vy);
  if (spd < 28 && (Math.abs(c.off) > HALF || c.vx * c.vx + c.vy * c.vy < 4)) c.stuck += dt; else c.stuck = 0;
  if (c.stuck > 2.2) { respawn(T, c); return true; }
  return false;
}

// ── the race ─────────────────────────────────────────────────────────────────
// How far round: points raced since the start line (0 at the start, laps × M at the flag).
export const raced = (c) => Math.max(0, c.prog - M);

// The score the room ranks: up to 1000 a lap, and for finishing 5000 plus 20
// for every second left on the clock — first across the line beats second,
// both beat anyone still racing. Under the 25,000 cap for 8 laps.
export function raceScore(c, laps, duration) {
  const prog = Math.floor((Math.min(raced(c), laps * M) / M) * 1000);
  if (c.finAt === null) return prog;
  return prog + 5000 + Math.max(0, Math.round((duration - c.finAt) * 20));
}

// Places: the finished by when they finished, then everyone else by how far.
export function placeOf(me, all) {
  const key = (c) => (c.finAt !== null && c.finAt !== undefined ? [0, c.finAt] : [1, -c.prog]);
  const mk = key(me);
  return 1 + all.filter((c) => c !== me).filter((c) => { const k = key(c); return k[0] < mk[0] || (k[0] === mk[0] && k[1] < mk[1]); }).length;
}

// Boost pads: drive over one (not already boosting hard) and you're off.
export function padHit(T, c) {
  for (const p of T.pads) {
    if (Math.abs(p.idx - c.idx) < 8 && Math.hypot(c.x - p.x, c.y - p.y) < 42 && c.boostT < 0.7) { c.boostT = 1; c.boostMax = 1; return true; }
  }
  return false;
}
