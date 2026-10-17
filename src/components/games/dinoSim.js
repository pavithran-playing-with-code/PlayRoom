// src/components/games/dinoSim.js
// Dino Dash's rules: the course, the physics and the crashes. No drawing and
// no React in here, so the rules can be tested on their own.
//
// World units: the screen is VIEW_W units across for every player (a wider
// screen gets a bigger picture, not a longer look ahead). Heights are measured
// up from the ground.
import { seededRand } from "./seededRand.js";

export const VIEW_W = 520;
export const DINO_X = 64;            // where the dino stands, from the left edge
export const BASE_SPEED = 330;       // units/second at the start and after a crash
export const MAX_SPEED = 760;
export const ACCEL = 0.021;          // extra speed per unit run without crashing
export const GRAVITY = 2700;
export const JUMP_V = 840;           // about 0.62s in the air, 130 units high
export const JUMP_CUT = 380;         // let go early for a short hop
export const STUN_S = 1;             // how long a crash knocks you out
export const CRASH_COST = 25;
export const UNITS_PER_POINT = 12;
export const UNITS_PER_METRE = 40;
export const COIN_PTS = 4;           // a coin grabbed
export const COIN_R = 9;

// The fastest anyone can be going after running `run` units without crashing.
export const speedAfter = (run) => Math.min(MAX_SPEED, BASE_SPEED + run * ACCEL);

// The same endless course for everyone in a room, built on demand. The gap
// after each obstacle is sized for the fastest anyone could possibly be going
// by that point, so every obstacle can always be cleared.
//
// Coins come from a stream of their own, so the obstacles are exactly what
// they always were: an arc over a cactus (a good jump takes it), a row on the
// ground under a high bird, and now and then a row in a gap.
export function makeCourse(seed) {
  const rand = seededRand((Number(seed) || 1) * 48271 + 99);
  for (let i = 0; i < 6; i++) rand();
  const crand = seededRand((Number(seed) || 1) * 7907 + 31);
  for (let i = 0; i < 3; i++) crand();
  const list = [];
  const coins = [];
  let pos = 900;
  const row = (x0, n, y) => { for (let k = 0; k < n; k++) coins.push({ x: x0 + k * 30, y }); };

  function extend(upTo) {
    while (pos < upTo) {
      const d = pos;
      let o;
      if (d > 2600 && rand() < 0.3) {
        // low: jump it · middle: duck under it · high: just keep running
        const lift = [8, 34, 72][Math.floor(rand() * 3)];
        o = { x: d, kind: "bird", w: 42, h: 26, lift };
      } else {
        const big = rand() < 0.45;
        const n = 1 + Math.floor(rand() * (d > 1800 ? 3 : 2));
        const tw = big ? 22 : 16;
        o = { x: d, kind: "cactus", big, n, tw, w: n * tw + (n - 1) * 6, h: big ? 48 : 34, lift: 0 };
      }
      list.push(o);
      const loose = Math.max(0.35, 1 - d / 40000);  // obstacles bunch up the further you get
      const next = d + o.w + speedAfter(d) * 0.62 + 170 + rand() * 460 * loose;
      const c = crand();
      if (o.kind === "cactus" && c < 0.55) {
        // an arc where a jump's body passes (its top is ~130 up, the body 2–42
        // above that): highest over the middle
        const mid = d + o.w / 2;
        for (const [dx, y] of [[-50, 122], [-17, 146], [17, 146], [50, 122]]) coins.push({ x: mid + dx, y });
      } else if (o.kind === "bird" && o.lift >= 72) row(d - 10, 3, 20);
      else if (c > 0.8 && next - (d + o.w) > 260) row(d + o.w + 90, 4, 20);
      pos = next;
    }
  }
  return { list, coins, extend };
}

export function newRunner() {
  return {
    x: 0,          // how far along the course
    run: 0,        // distance since the last crash (sets the speed)
    y: 0, vy: 0,   // height above the ground, and vertical speed
    duck: false,
    started: false,
    stun: 0,       // seconds left knocked out
    points: 0,
    crashes: 0,
    best: 0,       // longest run without a crash
    hit: new Set(),// obstacles already crashed into (you pass through those)
    first: 0,      // first obstacle that can still be on screen
    taken: new Set(), // coins grabbed
    cfirst: 0,     // first coin that can still be on screen
    coins: 0,      // how many grabbed
    events: [],    // coins grabbed this frame, for the screen to show (and clear)
  };
}

export function jump(s) {
  s.started = true;
  if (s.stun > 0 || s.y > 0) return;       // no jumping mid-air or while dazed
  s.vy = JUMP_V;
  s.y = 0.01;
}

export function releaseJump(s) {
  if (s.vy > JUMP_CUT) s.vy = JUMP_CUT;
}

export function setDuck(s, on) {
  s.duck = on;
}

export function dinoBox(s) {
  return s.duck && s.y <= 0
    ? { l: DINO_X + 6, r: DINO_X + 56, b: 2, t: 24 }
    : { l: DINO_X + 8, r: DINO_X + 38, b: s.y + 2, t: s.y + 42 };
}

export function obstacleBox(s, o) {
  const left = DINO_X + (o.x - s.x);
  return { l: left + 3, r: left + o.w - 3, b: o.lift + 3, t: o.lift + o.h - 3 };
}

function overlap(a, b) {
  return a.l < b.r && a.r > b.l && a.b < b.t && a.t > b.b;
}

// Advance one frame. Returns "crash" on the frame the dino hits something.
export function step(s, course, dt) {
  if (s.y > 0 || s.vy > 0) {
    s.vy -= GRAVITY * (s.duck ? 3 : 1) * dt;   // ducking in the air drops you fast
    s.y += s.vy * dt;
    if (s.y <= 0) { s.y = 0; s.vy = 0; }
  }
  if (s.stun > 0) {
    s.stun = Math.max(0, s.stun - dt);
    return null;
  }
  if (!s.started) return null;

  const dx = speedAfter(s.run) * dt;
  s.x += dx;
  s.run += dx;
  s.points += dx / UNITS_PER_POINT;

  course.extend(s.x + VIEW_W + 400);
  const list = course.list;
  while (s.first < list.length && list[s.first].x + list[s.first].w < s.x - DINO_X - 60) s.first++;

  const me = dinoBox(s);
  // coins: any the dino's box touches
  const coins = course.coins || [];
  while (s.cfirst < coins.length && coins[s.cfirst].x < s.x - DINO_X - 40) s.cfirst++;
  for (let i = s.cfirst; i < coins.length && coins[i].x - s.x < VIEW_W; i++) {
    if (s.taken.has(i)) continue;
    const cx = DINO_X + (coins[i].x - s.x), cy = coins[i].y;
    if (cx + COIN_R > me.l && cx - COIN_R < me.r && cy + COIN_R > me.b && cy - COIN_R < me.t) {
      s.taken.add(i);
      s.coins += 1;
      s.points += COIN_PTS;
      s.events.push({ k: "coin", i, x: coins[i].x, y: cy });
    }
  }
  for (let i = s.first; i < list.length && list[i].x - s.x < VIEW_W; i++) {
    if (s.hit.has(i) || !overlap(me, obstacleBox(s, list[i]))) continue;
    s.hit.add(i);
    s.crashes += 1;
    s.best = Math.max(s.best, s.run);
    s.run = 0;
    s.stun = STUN_S;
    s.vy = Math.min(s.vy, 0);
    s.points = Math.max(0, s.points - CRASH_COST);
    return "crash";
  }
  return null;
}
