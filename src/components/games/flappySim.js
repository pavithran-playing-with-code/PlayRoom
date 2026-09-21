// src/components/games/flappySim.js
// Flappy Dash's rules: gravity, flaps, pipes. No drawing and no React, so the
// rules can be tested on their own.
//
// Everyone sees the same slice of the world (VIEW_W wide), and the pipes come
// from the room's seed, so a room all flies the same course.
import { seededRand } from "./seededRand";

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

// The pipes for this room, built as the bird gets to them.
export function makeCourse(seed) {
  const rand = seededRand((Number(seed) || 1) * 7907 + 13);
  for (let i = 0; i < 6; i++) rand();
  const list = [];
  let next = 300;
  function extend(upTo) {
    while (next < upTo) {
      const top = MARGIN + GAP / 2;
      const bottom = VIEW_H - GROUND - MARGIN - GAP / 2;
      list.push({ x: next, gapY: top + rand() * (bottom - top), passed: false, gone: false });
      next += SPACING;
    }
  }
  return { list, extend };
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
      s.points += PIPE_POINTS;
    }
  }
  return null;
}
