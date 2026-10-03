// src/components/games/speedwaySim.js
// Speedway's rules: a looping road of bends and hills, laps, your car, and
// everyone else's on the same road. No drawing and no React, so the rules
// can be exercised from a plain Node script.
//
// The road is built from the room's seed, so every car in a room races the
// same one. Distances are in road units: a segment is SEG long, and a car's
// `d` is how far it has gone in total — laps × LAP + where it is on this lap.
// `x` is across the road: -1 and 1 are its edges; beyond them is grass.
import { seededRand } from "./seededRand.js";

export const SEG = 200;                       // one road segment
export const ROAD_W = 2000;                   // half the road's width, in road units
export const LAPS = 3;
export const MAX_SPEED = SEG * 60;            // a segment a frame at 60 fps
export const ACCEL = MAX_SPEED / 5;
export const BRAKE = -MAX_SPEED;
export const DECEL = -MAX_SPEED / 5;
export const OFF_ROAD_DECEL = -MAX_SPEED / 2;
export const OFF_ROAD_LIMIT = MAX_SPEED / 4;
export const CENTRIFUGAL = 0.3;
export const START_S = 3;                     // the countdown at the start of a match
export const KMH = 260;                       // what MAX_SPEED reads as
// Turbo: hold it for a burst past top speed. It runs on a tank that empties
// in TURBO_S of use and fills back up on its own over TURBO_REFILL_S. No use
// on the grass.
export const TURBO_TOP = 1.35;                // top speed on turbo, × MAX_SPEED
export const TURBO_S = 2.5;
export const TURBO_REFILL_S = 7;
export const TURBO_READY = 0.3;

// ── the road ─────────────────────────────────────────────────────────────────
// Built from pieces: ease into a bend (or a hill), hold it, ease out.
const ease = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);

export function buildTrack(seed) {
  const rand = seededRand((Number(seed) || 1) * 6151 + 23);
  const segs = [];
  let y = 0;
  const add = (enter, hold, leave, curve, dy) => {
    const y0 = y, y1 = y0 + dy * SEG;
    const n = enter + hold + leave;
    for (let i = 0; i < n; i++) {
      const c = i < enter ? ease(0, curve, i / enter) : i < enter + hold ? curve : ease(curve, 0, (i - enter - hold) / leave);
      const yy = ease(y0, y1, i / n);
      segs.push({ i: segs.length, curve: c, y1: yy, y2: 0 });
    }
    y = y1;
  };
  add(20, 40, 20, 0, 0);                              // the start straight
  // about 25 seconds a lap, so a good race is three laps in a minute and a
  // half — inside a two-minute match, with time to spare for the slower
  const pieces = 14;
  for (let k = 0; k < pieces; k++) {
    const len = 18 + Math.floor(rand() * 28);
    const kind = rand();
    const curve = kind < 0.7 ? (rand() < 0.5 ? -1 : 1) * (2 + Math.floor(rand() * 4)) : 0;
    const hill = rand() < 0.5 ? (rand() < 0.5 ? -1 : 1) * (10 + Math.floor(rand() * 30)) : 0;
    add(len, len, len, curve, hill);
  }
  add(30, 30, 30, 0, -y / SEG);                       // and back down to where it began
  for (let i = 0; i < segs.length; i++) {
    segs[i].y2 = segs[(i + 1) % segs.length].y1;
    segs[i].z1 = i * SEG;
  }
  return { segs, LAP: segs.length * SEG };
}

export const segAt = (track, d) => track.segs[Math.floor((((d % track.LAP) + track.LAP) % track.LAP) / SEG)];

// ── a car ────────────────────────────────────────────────────────────────────
export function newCar(gridSlot = 0) {
  // two abreast, rows a few segments apart, behind the line
  const row = Math.floor(gridSlot / 2), col = gridSlot % 2;
  return { d: -row * SEG * 4, x: col ? 0.45 : -0.45, speed: 0, finishedAt: null, bump: 0, turbo: 1, boosting: false };
}

// One frame of your car. inp: { steer: -1..1, turbo: bool, brake: bool }, go: past the
// countdown. others: [{ d, x }] — cars to bump into. elapsed: the match clock.
export function drive(track, car, inp, dt, go, others = [], elapsed = 0) {
  const raceLen = LAPS * track.LAP;
  if (!go) return { bumped: false };
  if (car.finishedAt !== null) {                        // across the line: roll to a stop
    car.speed = Math.max(0, car.speed + DECEL * 3 * dt);
    car.d += car.speed * dt;
    return { bumped: false };
  }
  const seg = segAt(track, car.d);
  const pct = car.speed / MAX_SPEED;
  const dx = dt * 2 * pct;
  car.x += (inp.steer || 0) * dx;
  car.x -= dx * pct * seg.curve * CENTRIFUGAL;
  const onGrass = Math.abs(car.x) > 1;
  // run it dry and it has to refill to TURBO_READY before it works again —
  // otherwise a held button boosted forever on the trickle coming back in
  if (car.turbo <= 0) car.dry = true;
  if (car.dry && car.turbo >= TURBO_READY) car.dry = false;
  car.boosting = !!inp.turbo && car.turbo > 0 && !car.dry && !onGrass && !inp.brake;
  if (car.boosting) car.turbo = Math.max(0, car.turbo - dt / TURBO_S);
  else car.turbo = Math.min(1, car.turbo + dt / TURBO_REFILL_S);
  const top = car.boosting ? MAX_SPEED * TURBO_TOP : MAX_SPEED;
  if (inp.brake) car.speed += BRAKE * dt;
  else if (car.speed > top) car.speed = Math.max(top, car.speed - MAX_SPEED * 0.5 * dt);   // off turbo: ease back down
  else car.speed = Math.min(top, car.speed + (car.boosting ? ACCEL * 2.2 : ACCEL) * dt);   // the pedal is always down
  if (onGrass && car.speed > OFF_ROAD_LIMIT) car.speed += OFF_ROAD_DECEL * dt;
  car.x = Math.max(-2.5, Math.min(2.5, car.x));
  car.speed = Math.max(0, Math.min(MAX_SPEED * TURBO_TOP, car.speed));

  let bumped = false;
  car.bump = Math.max(0, car.bump - dt);
  for (const o of others) {
    const gap = o.d - car.d;
    if (gap > 0 && gap < SEG * 0.9 && Math.abs(o.x - car.x) < 0.35 && car.bump <= 0) {
      car.speed *= 0.55;                                // into the back of them
      car.bump = 0.6;
      bumped = true;
    }
  }
  car.d += car.speed * dt;
  if (car.d >= raceLen) { car.d = raceLen; car.finishedAt = elapsed; }
  return { bumped };
}

export const lapOf = (track, d) => Math.min(LAPS, Math.max(1, Math.floor(d / track.LAP) + 1));
export const kmh = (car) => Math.round((car.speed / MAX_SPEED) * KMH);

// The score the room ranks: how far round the race (up to 1000 a lap), and
// for finishing, 5000 plus 20 for every second left on the clock — so the
// first across the line is ahead of the second, and both ahead of anyone
// still racing. Never more than the score cap (25,000).
export function raceScore(track, car, duration) {
  const raceLen = LAPS * track.LAP;
  const prog = Math.floor((Math.max(0, Math.min(car.d, raceLen)) / track.LAP) * 1000);
  if (car.finishedAt === null) return prog;
  return prog + 5000 + Math.max(0, Math.round((duration - car.finishedAt) * 20));
}

// Places: the finished by when they finished, then everyone else by how far.
export function placeOf(me, all) {
  const key = (c) => (c.finishedAt !== null ? [0, c.finishedAt] : [1, -c.d]);
  const mk = key(me);
  return 1 + all.filter((c) => c !== me).filter((c) => {
    const k = key(c);
    return k[0] < mk[0] || (k[0] === mk[0] && k[1] < mk[1]);
  }).length;
}

// The computer's cars, for a race on your own: each keeps its own pace and
// line, eases off on the bends, and steers round a car in its way.
export function newBots(seed, n = 3, firstSlot = 1) {
  const rand = seededRand((Number(seed) || 1) * 811 + 5);
  return Array.from({ length: n }, (_, i) => ({
    ...newCar(firstSlot + i), bot: true, pace: 0.8 + rand() * 0.14, line: (rand() - 0.5) * 1.2,
    color: ["#4cc9f0", "#8fe36b", "#9b5de5"][i % 3], name: ["Blaze", "Comet", "Dash"][i % 3],
  }));
}

export function driveBot(track, bot, dt, go, others, elapsed) {
  const seg = segAt(track, bot.d);
  const target = MAX_SPEED * bot.pace * (1 - Math.min(0.25, Math.abs(seg.curve) * 0.035));
  let line = bot.line;
  for (const o of others) {
    const gap = o.d - bot.d;
    if (gap > 0 && gap < SEG * 6 && Math.abs(o.x - bot.x) < 0.5) line = o.x > 0 ? -0.55 : 0.55;
  }
  const steerTo = Math.max(-1, Math.min(1, (line - bot.x) * 4 + seg.curve * 0.12));
  const brake = bot.speed > target;
  return drive(track, bot, { steer: steerTo, brake: brake && bot.speed > target * 1.05 }, dt, go, others, elapsed);
}
