// scripts/check-speedway.mjs — Speedway's rules (driftSim.js), with no browser.
//
//   node scripts/check-speedway.mjs
//
// The same code builds the same track; tracks are closed, gentle and never
// touch themselves; the car's top speeds and grip; drift charge pays out the
// right boost; laps count (and going back over the line uncounts one); the
// computer can finish the race well inside the clock for every lap count;
// the wall and other cars push back; and the score and places rank as a race.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "components", "games");
const m = await import(pathToFileURL(path.join(src, "driftSim.js")).href);
const { buildTrack, makeCar, stepCar, trackUpdate, wallHit, bump, aiInput, checkStuck, raceScore, placeOf, raced, padHit, lapsFor, trackCode, M, MAXV, GRASSV, HALF, CURB, WALL } = m;

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const dt = 1 / 60;

// ── tracks ───────────────────────────────────────────────────────────────────
const T = buildTrack(trackCode(424242));
const T2 = buildTrack(trackCode(424242) + "");
check("the same code builds the same track", JSON.stringify(T.P.slice(0, 20)) === JSON.stringify(buildTrack("room-424242").P.slice(0, 20)) && T2 === T);
check("a different code, a different track", JSON.stringify(buildTrack(trackCode(7)).P[100]) !== JSON.stringify(T.P[100]));
let good = 0, worst = 0;
for (let s = 1; s <= 40; s++) { const t = buildTrack(trackCode(s * 9973)); if (t.ok) good++; worst = Math.max(worst, t.attempt); }
check("tracks come out gentle and never touch themselves", good === 40, `${good}/40, most retries ${worst}`);
check(`${M} evenly spaced points round a closed loop`, T.P.length === M && Math.abs(Math.hypot(T.P[0].x - T.P[M - 1].x, T.P[0].y - T.P[M - 1].y) - T.ds) < T.ds * 0.05);
check("seven boost pads or so, on the road", T.pads.length >= 5 && T.pads.length <= 7 && T.pads.every((p) => Math.abs(p.lane) <= 45));
{
  let worstBend = 0, worstHead = 0, shortest = 1e9;
  for (let s = 1; s <= 40; s++) {
    const t = buildTrack(trackCode(s * 9973));
    let bend = 0;
    for (let i = 1; i <= 56; i++) bend += Math.abs(m.ad(t.ANG[i], t.ANG[i - 1]));
    worstBend = Math.max(worstBend, bend); worstHead = Math.max(worstHead, Math.abs(t.ANG[0])); shortest = Math.min(shortest, 56 * t.ds);
  }
  check("every track starts on a dead straight (~3 s) before the first bend", worstBend < 0.05 && shortest > 700, `at most ${(worstBend * 57.3).toFixed(1)}° of bend over the first ${Math.round(shortest)}px`);
  check("…heading right, across the wide screen", worstHead < 0.01);
  // a car flat out from the grid, no steering, stays on the road for 3 s
  const c = makeCar(T, 0);
  let off = 0;
  for (let t = 0; t < 3; t += dt) { stepCar(T, c, { thr: 1, brk: 0, str: 0, dr: 0 }, dt); trackUpdate(T, c); off = Math.max(off, Math.abs(c.off)); }
  check("from the grid, flat out with no steering: still on the tarmac after 3 s", off < HALF, `${off.toFixed(0)}px off centre`);
}
check("trees stay off the road", T.trees.every((tr) => T.P.every((p, i) => i % 4 || Math.hypot(tr.x - p.x, tr.y - p.y) > WALL)));

// ── the car ──────────────────────────────────────────────────────────────────
function drive(car, inp, secs, onTrack = true) {
  for (let t = 0; t < secs; t += dt) { stepCar(T, car, inp, dt); if (onTrack) { trackUpdate(T, car); wallHit(T, car); } }
  return Math.hypot(car.vx, car.vy);
}
{
  const c = makeCar(T, 0); c.off = 0;
  const v = drive(c, { thr: 1, brk: 0, str: 0, dr: 0 }, 6, false);
  // 480 is the cap; drag settles a car at ~423, as in Turbo Drift
  check("flat out on the road: ~420 (480 the cap)", v > 400 && v <= MAXV, v.toFixed(0));
  const g = makeCar(T, 0); g.off = HALF + CURB + 30;
  let gv = 0;
  for (let t = 0; t < 6; t += dt) { stepCar(T, g, { thr: 1, brk: 0, str: 0, dr: 0 }, dt); g.off = HALF + CURB + 30; gv = Math.hypot(g.vx, g.vy); }
  check("on the grass: slower than the road, but quick enough to get back", gv <= GRASSV && gv < 0.65 * 423 && gv > 200, gv.toFixed(0));
  const r = makeCar(T, 0);
  const rv = drive(r, { thr: 0, brk: 1, str: 0, dr: 0 }, 3, false);
  check("reversing is capped at 160", rv <= 161, rv.toFixed(0));
}
// drift: charge and payout
for (const [charge, want] of [[0.5, 0], [1.2, 0.6], [2.2, 1.1], [3.2, 1.6]]) {
  const c = makeCar(T, 0);
  drive(c, { thr: 1, brk: 0, str: 0, dr: 0 }, 3, false);
  // drift through a long bend until the charge is there, then let go
  let t = 0;
  while (c.charge < charge && t < 8) { stepCar(T, c, { thr: 1, brk: 0, str: 0.5, dr: 1 }, dt); t += dt; }
  const still = c.drifting;
  const got = stepCar(T, c, { thr: 1, brk: 0, str: 0.5, dr: 0 }, dt).boosted;
  check(`drift to charge ${charge}, let go: boost ${want ? want + " s" : "none"}`, still && got === want, `got ${got} after ${t.toFixed(1)}s`);
}
// A thumb is always full lock: once the drift is on, Speedway.jsx steers at
// DRIFT_STEER (0.55). Full lock spins out before a boost charges; 0.55 holds
// a long slide, charges the big boosts, and still turns fast enough for the
// track's tightest bend (radius 175 at ~400 px/s).
for (const [steer, wantLong] of [[1, false], [0.55, true]]) {
  const c = makeCar(T, 0);
  drive(c, { thr: 1, brk: 0, str: 0, dr: 0 }, 3, false);
  let firstEnd = null, maxC = 0, turn = 0, vsum = 0, n = 0, prev = null;
  for (let t = 0; t < 3; t += dt) {
    const dr = t > 0.28 ? 1 : 0;
    stepCar(T, c, { thr: 1, brk: 0, str: dr ? steer : 1, dr }, dt);
    if (dr && t > 0.35 && !c.drifting && firstEnd === null) firstEnd = t;
    maxC = Math.max(maxC, c.charge);
    const h = Math.atan2(c.vy, c.vx);
    if (t > 1 && prev !== null) { let d = h - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += d; vsum += Math.hypot(c.vx, c.vy); n++; }
    prev = h;
  }
  const radius = (vsum / n) / (Math.abs(turn) / (n * dt));        // the circle the car's path traces
  if (wantLong) check("thumb drift (steer 0.55): a long slide, a big boost, a circle tight enough for the bends", firstEnd === null && maxC > 1.7 && radius < 260, `charge ${maxC.toFixed(1)}, circle radius ${radius.toFixed(0)}`);
  else check("full lock in a drift spins out within a second (why the thumb drift eases off)", firstEnd !== null && firstEnd < 1.2, `slide ended at ${firstEnd && firstEnd.toFixed(2)}s`);
}
{
  const a = makeCar(T, 0), b = makeCar(T, 0);
  drive(a, { thr: 1, brk: 0, str: 0, dr: 0 }, 2, false); drive(b, { thr: 1, brk: 0, str: 0, dr: 0 }, 2, false);
  for (let i = 0; i < 40; i++) { stepCar(T, a, { thr: 1, brk: 0, str: 1, dr: 0 }, dt); stepCar(T, b, { thr: 1, brk: 0, str: 1, dr: 1 }, dt); }
  const slip = (c) => Math.abs(-Math.sin(c.a) * c.vx + Math.cos(c.a) * c.vy);
  check("drifting slides sideways more than gripping", slip(b) > slip(a) * 1.5, `${slip(b).toFixed(0)} vs ${slip(a).toFixed(0)}`);
}

// ── walls, cars, pads ────────────────────────────────────────────────────────
{
  const c = makeCar(T, 0);
  const i = c.idx;
  c.x = T.P[i].x + T.Rx[i] * (WALL + 15); c.y = T.P[i].y + T.Ry[i] * (WALL + 15);
  c.vx = T.Rx[i] * 300; c.vy = T.Ry[i] * 300;
  trackUpdate(T, c);
  const hit = wallHit(T, c);
  trackUpdate(T, c);
  const vn = c.vx * T.Rx[i] + c.vy * T.Ry[i];
  check("the wall stops you and bounces you back", hit > 250 && vn < 0 && Math.abs(c.off) <= WALL + 0.5, `hit ${hit.toFixed(0)}, back at ${vn.toFixed(0)}`);
}
{
  const a = { x: 0, y: 0, vx: 200, vy: 0 }, b = { x: 30, y: 0, vx: 0, vy: 0 };
  const h = bump(a, b);
  check("two cars: pushed apart, bounced", h > 0 && b.x - a.x >= 42 - 1e-6 && b.vx > 0 && a.vx < 200);
  const c = { x: 0, y: 0, vx: 200, vy: 0 }, f = { x: 30, y: 0, vx: 0, vy: 0 };
  bump(c, f, false, true);
  check("a friend's car (fixed): only yours moves", f.x === 30 && f.vx === 0 && c.x <= -12 && c.vx < 0);
}
{
  const p = T.pads[0], c = makeCar(T, 0);
  c.idx = p.idx; c.x = p.x; c.y = p.y;
  check("a boost pad boosts", padHit(T, c) && c.boostT === 1);
}

// ── laps and a whole race ────────────────────────────────────────────────────
{
  const c = makeCar(T, 0);
  trackUpdate(T, c);
  check("on the grid: lap 0, nothing raced", c.lap === 0 && raced(c) === 0);
  c.idx = M - 2; c.lap = 0;
  c.x = T.P[3].x; c.y = T.P[3].y;
  check("over the line: lap 1", trackUpdate(T, c) === 1 && c.lap === 1);
  c.x = T.P[M - 3].x; c.y = T.P[M - 3].y;
  trackUpdate(T, c);
  check("back over the line: that lap uncounted", c.lap === 0);
}
for (const secs of [120, 180, 240, 300]) {
  const laps = lapsFor(secs);
  const cars = [0, 1, 2, 3].map((s) => makeCar(T, s, { ai: true, skill: [0.96, 0.92, 0.88, 0.9][s], lane: (s - 1.5) * 20, ph: s }));
  let t = 0, clock = 0;
  const fin = [];
  while (t < secs - 3 && fin.length < cars.length) {
    for (const c of cars) {
      if (c.finAt !== null) continue;
      stepCar(T, c, aiInput(T, c, null, clock), dt);
    }
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) bump(cars[i], cars[j]);
    for (const c of cars) {
      trackUpdate(T, c); wallHit(T, c); padHit(T, c); checkStuck(T, c, dt);
      if (c.finAt === null && c.lap > laps) { c.finAt = t + 3; fin.push(c); }
    }
    t += dt; clock += dt;
  }
  check(`${secs / 60} min, ${laps} laps: the computer finishes with time to spare`, fin.length === 4, `slowest ${fin.length === 4 ? (fin[3].finAt).toFixed(0) + "s" : "didn't finish"}`);
  if (secs === 120) {
    const order = cars.map((c) => placeOf(c, cars)).sort();
    check("places are 1 2 3 4", order.join() === "1,2,3,4");
    const s = cars.map((c) => raceScore(c, laps, secs));
    check("the first across the line scores most", s[cars.indexOf(fin[0])] === Math.max(...s) && Math.max(...s) < 25000, s.join(" "));
  }
}
{
  const a = makeCar(T, 0), b = makeCar(T, 1);
  a.prog = M + 300; b.prog = M + 200;
  check("still racing: further round is ahead", placeOf(a, [a, b]) === 1 && raceScore(a, 3, 120) > raceScore(b, 3, 120));
  b.finAt = 90; b.prog = 4 * M;
  check("finished beats still racing", placeOf(b, [a, b]) === 1 && raceScore(b, 3, 120) > raceScore(a, 3, 120));
  check("8 laps, finished in good time: under the 25,000 cap", raceScore({ prog: 9 * M, finAt: 30 }, 8, 300) < 25000);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
