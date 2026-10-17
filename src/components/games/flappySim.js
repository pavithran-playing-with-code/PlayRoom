// src/components/games/flappySim.js
// Flappy Dash's rules: gravity, flaps, pipes. No drawing and no React, so the
// rules can be tested on their own.
//
// Everyone sees the same slice of the world (VIEW_W wide), and the pipes come
// from the room's seed, so a room all flies the same course.
import { seededRand } from "./seededRand.js";

export const VIEW_W = 320;
export const VIEW_H = 460;
export const GROUND = 44;          // the strip of ground at the bottom
export const BIRD_X = 86;          // the bird sits here; the world moves past it
export const BIRD_RX = 15;         // half width / half height of its hit box
export const BIRD_RY = 11;
export const GRAVITY = 1050;       // pixels per second, per second
export const FLAP_V = -330;        // a flap sets this upward speed
export const SPEED = 130;          // how fast the world scrolls
export const PIPE_W = 54;
export const GAP = 150;            // the hole between top and bottom pipe
export const SPACING = 210;        // distance from one pipe pair to the next
export const STUN_S = 1.1;         // how long a crash dazes you
export const PIPE_POINTS = 10;
export const CRASH_COST = -10;
export const MARGIN = 54;          // keep gaps this far from ceiling and ground
export const STAR_PTS = 5;         // a star grabbed between the pipes
export const STAR_R = 12;
export const GOLD_EVERY = 10;      // every 10th pipe is golden: double
// pipes in a row pay more: x2 from 10, x3 from 20
export const streakMult = (run) => (run >= 20 ? 3 : run >= 10 ? 2 : 1);
export const isGolden = (i) => i % GOLD_EVERY === GOLD_EVERY - 1;

// The pipes for this room, built as the bird gets to them. Stars come from a
// stream of their own (so the pipes are exactly as they always were): now
// and then one sits between two pipes, a little off the straight line from
// one gap to the next, so it takes a choice to fly through it.
export function makeCourse(seed) {
  const rand = seededRand((Number(seed) || 1) * 7907 + 13);
  for (let i = 0; i < 6; i++) rand();
  const srand = seededRand((Number(seed) || 1) * 4243 + 7);
  for (let i = 0; i < 3; i++) srand();
  const list = [];
  const stars = [];
  let next = 300;
  function extend(upTo) {
    while (next < upTo) {
      const top = MARGIN + GAP / 2;
      const bottom = VIEW_H - GROUND - MARGIN - GAP / 2;
      const p = { x: next, gapY: top + rand() * (bottom - top), passed: false, gone: false };
      const prev = list[list.length - 1];
      list.push(p);
      if (prev && srand() < 0.45) {
        const y = (prev.gapY + p.gapY) / 2 + (srand() * 2 - 1) * 45;
        stars.push({ x: prev.x + PIPE_W + (SPACING - PIPE_W) / 2, y: Math.max(MARGIN + 20, Math.min(VIEW_H - GROUND - MARGIN - 20, y)), taken: false });
      }
      next += SPACING;
    }
  }
  return { list, stars, extend };
}

export function newBird() {
  return {
    x: 0,                  // how far the world has scrolled
    y: VIEW_H / 2 - 40,    // height of the bird on screen
    vy: 0,
    started: false,
    stun: 0,
    flapAt: -9999,         // when the last flap happened (for the wing)
    pipes: 0, run: 0, best: 0, crashes: 0,
    points: 0,
    first: 0,
    stars: 0,
    events: [],            // pipes passed and stars grabbed this frame, for the screen
  };
}

export function flap(s, now = 0) {
  s.started = true;
  if (s.stun > 0) return;
  s.vy = FLAP_V;
  s.flapAt = now;
}

export function birdBox(s) {
  return { l: BIRD_X - BIRD_RX, r: BIRD_X + BIRD_RX, t: s.y - BIRD_RY, b: s.y + BIRD_RY };
}

function crash(s, course) {
  s.crashes += 1;
  s.best = Math.max(s.best, s.run);
  s.run = 0;
  s.points = Math.max(0, s.points + CRASH_COST);
  s.stun = STUN_S;
  s.y = VIEW_H / 2 - 30;
  s.vy = 0;
  // Hop forward into clear air. Pipes left behind are taken off the board
  // entirely (`gone`), so the bird can't wake up inside one, and they don't
  // score either. The next real pipe is always a good second away.
  const skipTo = s.x + 250;
  for (let i = s.first; i < course.list.length; i++) {
    if (course.list[i].x > skipTo + BIRD_X + 200) break;
    course.list[i].passed = true;
    course.list[i].gone = true;
  }
  for (const st of course.stars || []) if (!st.taken && st.x < skipTo + BIRD_X + 200 && st.x > s.x) st.taken = true;
  s.x = skipTo;
}

// One frame. Returns "crash" on the frame the bird hits something.
export function step(s, course, dt) {
  if (s.stun > 0) { s.stun = Math.max(0, s.stun - dt); return null; }
  if (!s.started) return null;

  s.vy += GRAVITY * dt;
  s.y += s.vy * dt;
  s.x += SPEED * dt;
  course.extend(s.x + VIEW_W + SPACING);

  const me = birdBox(s);
  if (me.t <= 0 || me.b >= VIEW_H - GROUND) { crash(s, course); return "crash"; }

  const list = course.list;
  while (s.first < list.length && list[s.first].x - s.x + PIPE_W < -40) s.first++;
  for (let i = s.first; i < list.length; i++) {
    const p = list[i];
    if (p.gone) continue;
    const left = p.x - s.x;
    if (left > VIEW_W) break;
    const overlapsX = left < me.r && left + PIPE_W > me.l;
    if (overlapsX && (me.t < p.gapY - GAP / 2 || me.b > p.gapY + GAP / 2)) { crash(s, course); return "crash"; }
    if (!p.passed && left + PIPE_W < me.l) {
      p.passed = true;
      s.pipes += 1;
      s.run += 1;
      const pts = PIPE_POINTS * streakMult(s.run) * (isGolden(i) ? 2 : 1);
      s.points += pts;
      s.events.push({ k: "pass", i, pts, golden: isGolden(i), mult: streakMult(s.run), up: streakMult(s.run) > streakMult(s.run - 1) });
    }
  }
  // stars: any the bird's box touches
  for (const st of course.stars || []) {
    const sx = BIRD_X + (st.x - s.x);
    if (sx < -40) continue;
    if (sx > VIEW_W) break;
    if (st.taken) continue;
    if (sx + STAR_R > me.l && sx - STAR_R < me.r && st.y + STAR_R > me.t && st.y - STAR_R < me.b) {
      st.taken = true;
      s.stars += 1;
      s.points += STAR_PTS;
      s.events.push({ k: "star", x: st.x, y: st.y });
    }
  }
  return null;
}
