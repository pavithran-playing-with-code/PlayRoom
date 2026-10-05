// src/components/games/runnerSim.js
// Rail Runner's rules: three lanes, an endless run that keeps speeding up,
// and things in the way — low barriers to jump, high bars to slide under,
// train cars to swerve round — with coins to grab. No drawing and no React,
// so the rules can be exercised from a plain Node script.
//
// The course comes from the room's seed, row by row in a fixed order, so
// everyone in a room runs exactly the same one. A crash doesn't end the run
// or take points off: you stumble, slow right down, and run on (briefly
// untouchable, so the thing you hit can't hit you again).
//
// Distances are metres; time is seconds.
import { seededRand, shuffleInPlace } from "./seededRand.js";

export const LANES = [-1, 0, 1];
export const LANE_W = 2.2;                    // metres between lane centres
export const BASE_SPEED = 14;                 // m/s at the start, and after a crash
export const MAX_SPEED = 30;
export const ACCEL = 0.28;                    // m/s gained every second
export const JUMP_V = 7.5;                    // up, m/s
export const GRAVITY = 22;
export const SLIDE_S = 0.75;
export const STUN_S = 1.0;                    // a crash: stumbling, no steering
export const SAFE_S = 1.6;                    // …then untouchable this long
export const COIN_POINTS = 10;
export const VIEW_AHEAD = 140;                // how far ahead the course is laid

// What's in a lane at a row: a low barrier (jump it), a high bar (slide
// under it), a train car (go round it), or nothing.
export const LOW = "low", HIGH = "high", TRAIN = "train";
const DEPTH = { [LOW]: 0.5, [HIGH]: 0.5 };

export function newRun(seed) {
  const s = {
    rand: seededRand((Number(seed) || 1) * 4271 + 9),
    lane: 0, x: 0,                // the lane you're heading for, and where you are
    y: 0, vy: 0, slideT: 0,
    z: 0, speed: BASE_SPEED, t: 0,
    stunT: 0, safeT: 0,
    rows: [], nextZ: 30, made: 0,
    coins: 0, crashes: 0,
  };
  layCourse(s);
  return s;
}

// One row of the course. Early on, one thing at a time; then two lanes
// taken more often than not; and later a wall across all three, where at
// least one is a barrier or a bar — never three trains, so there is always
// a way through, jumping or sliding.
function makeRow(s) {
  const r = s.rand, n = s.made++;
  const z = s.nextZ;
  const items = [];
  const wall = n >= 10 && r() < 0.25;
  const busy = wall ? 3 : n < 3 ? 1 : r() < 0.6 ? 2 : 1;
  // Fisher–Yates, not sort(() => r() - 0.5): browsers sort differently, and
  // an iPhone would have laid a different course from everyone else's
  const lanes = shuffleInPlace([-1, 0, 1], r);
  let longest = 0;
  for (let i = 0; i < busy; i++) {
    const roll = r();
    // a wall's last lane is always one you can get through
    const kind = wall && i === 2 ? (roll < 0.5 ? LOW : HIGH) : roll < 0.36 ? LOW : roll < 0.68 ? HIGH : TRAIN;
    const len = kind === TRAIN ? 9 + Math.floor(r() * 7) : DEPTH[kind];
    items.push({ kind, lane: lanes[i], z, len, hit: false });
    longest = Math.max(longest, len);
  }
  // coins: a line in a free lane, or arcing over a low barrier
  const free = lanes.slice(busy);
  if (r() < 0.7 && free.length) {
    const lane = free[Math.floor(r() * free.length)];
    for (let k = 0; k < 6; k++) items.push({ kind: "coin", lane, z: z - 6 + k * 2, y: 0.6, got: false });
  } else {
    const low = items.find((o) => o.kind === LOW);
    if (low) for (let k = 0; k < 5; k++) items.push({ kind: "coin", lane: low.lane, z: z - 3 + k * 1.5, y: 0.6 + Math.sin((k / 4) * Math.PI) * 1.1, got: false });
  }
  s.rows.push({ z, items });
  // the gap to the next row. You run faster the further you get, so the
  // gaps open out with distance (not speed: the course must be the same for
  // everyone, however their run is going) — about a second and a half to
  // react, whatever the pace.
  s.nextZ = z + longest + 15 + Math.min(12, z / 160) + Math.floor(r() * 7);
}

function layCourse(s) {
  while (s.nextZ < s.z + VIEW_AHEAD) makeRow(s);
  s.rows = s.rows.filter((row) => row.z + 20 > s.z - 10);   // behind you: gone
}

// ── what you do ──────────────────────────────────────────────────────────────
export function steer(s, dir) {
  if (s.stunT > 0) return false;
  const lane = Math.max(-1, Math.min(1, s.lane + dir));
  if (lane === s.lane) return false;
  s.lane = lane;
  return true;
}
export function jump(s) {
  if (s.stunT > 0 || s.y > 0.01) return false;
  s.slideT = 0;
  s.vy = JUMP_V;
  return true;
}
export function slide(s) {
  if (s.stunT > 0) return false;
  if (s.y > 0.01) s.vy = Math.min(s.vy, -14);  // in the air: drop fast, then slide
  s.slideT = SLIDE_S;
  return true;
}

export const sliding = (s) => s.slideT > 0 && s.y < 0.3;
export const score = (s) => Math.floor(s.z) + s.coins * COIN_POINTS;

// ── one frame ────────────────────────────────────────────────────────────────
// dt: seconds. Returns what happened: { coins, crashed, got } — `got`: the
// coins taken this frame, [{ lane, y, z }], for the page to animate.
//
// A coin is taken a little before you reach it (COIN_REACH ahead), not as it
// passes under you: at that point it's drawn behind the runner, and taking
// it there looked like the first few coins of a line slipping past you.
export const COIN_REACH = 1.6;
const COIN_LEAD = 7;                     // the furthest a row lays its coins before itself
export function step(s, dt) {
  const d = Math.max(0, Math.min(0.1, dt));
  const out = { coins: 0, crashed: false, got: [] };
  s.t += d;
  if (s.stunT > 0) {
    s.stunT -= d;
    s.speed = BASE_SPEED * 0.35;
  } else {
    s.speed = Math.min(MAX_SPEED, Math.max(BASE_SPEED, s.speed) + ACCEL * d);
  }
  s.safeT = Math.max(0, s.safeT - d);
  s.z += s.speed * d;
  s.x += (s.lane - s.x) * Math.min(1, d * 14);
  if (s.y > 0 || s.vy > 0) {
    s.vy -= GRAVITY * d;
    s.y = Math.max(0, s.y + s.vy * d);
    if (s.y === 0) s.vy = 0;
  }
  s.slideT = Math.max(0, s.slideT - d);

  for (const row of s.rows) {
    // a row's coins start up to COIN_LEAD before it: look that far ahead, or
    // the first coins of a line are behind you before the row is looked at
    if (row.z - COIN_LEAD > s.z + COIN_REACH || row.z + 20 < s.z - 3) continue;
    for (const o of row.items) {
      if (Math.abs(o.lane - s.x) > (o.kind === "coin" ? 0.6 : 0.55)) continue;
      if (o.kind === "coin") {
        const ahead = o.z - s.z;
        if (!o.got && ahead > -0.8 && ahead < COIN_REACH && Math.abs(o.y - (s.y + 0.6)) < 1.0) {
          o.got = true; s.coins++; out.coins++;
          out.got.push({ lane: o.lane, y: o.y, z: o.z });
        }
        continue;
      }
      if (o.hit || s.z < o.z - 0.3 || s.z > o.z + o.len) continue;
      const cleared = (o.kind === LOW && s.y > 0.55) || (o.kind === HIGH && sliding(s));
      if (cleared || s.safeT > 0) continue;
      o.hit = true;
      s.crashes++;
      s.stunT = STUN_S;
      s.safeT = STUN_S + SAFE_S;
      s.speed = BASE_SPEED;
      s.vy = 0; s.y = 0; s.slideT = 0;
      out.crashed = true;
    }
  }
  layCourse(s);
  return out;
}
