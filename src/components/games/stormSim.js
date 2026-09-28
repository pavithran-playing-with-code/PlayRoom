// src/components/games/stormSim.js
// Dodge Storm's rules: an open arena, shards flying in from every edge, and
// nothing to do but not be there. Surviving is the score; skimming a shard
// without touching it pays a little extra.
//
// No drawing and no React, so the rules can be exercised from Node. Seeded, so
// everyone in a room dodges the same storm.
import { seededRand } from "./seededRand";

export const VIEW_W = 320;
export const VIEW_H = 440;
export const PLAYER_R = 10;
export const EASE = 0.25;                 // how much of the gap it closes a frame
export const TRAIL = 12;

export const SHARD_MIN_R = 6;
export const SHARD_MAX_R = 12;
export const SHARD_MIN_SPEED = 1.6;
export const SHARD_MAX_SPEED = 3.0;
export const AIM_SPREAD = 0.4;            // radians either side of dead centre
export const SPAWN_START = 34;
export const SPAWN_FLOOR = 14;
export const SCORE_DIVISOR = 6;
export const GRAZE_DIST = 22;
export const GRAZE_POINTS = 3;

// Shards get faster the longer you live. 1800 frames is about thirty seconds.
export const difficultyAt = (frame) => 1 + frame / 1800;

export function newStorm(seed) {
  const rand = seededRand((Number(seed) || 1) * 5231 + 41);
  for (let i = 0; i < 6; i++) rand();
  return {
    rand,
    x: VIEW_W / 2,
    y: VIEW_H / 2,
    tx: VIEW_W / 2,                       // where the player is heading
    ty: VIEW_H / 2,
    trail: [],
    shards: [],
    frame: 0,
    nextSpawn: 18,
    points: 0,                            // grazes, on top of time survived
    hit: false,
  };
}

export const moveTo = (s, x, y) => {
  if (s.hit) return;
  s.tx = Math.max(PLAYER_R, Math.min(VIEW_W - PLAYER_R, x));
  s.ty = Math.max(PLAYER_R, Math.min(VIEW_H - PLAYER_R, y));
};
export const nudge = (s, dx, dy) => moveTo(s, s.tx + dx, s.ty + dy);

export const timeScore = (s) => Math.floor(s.frame / SCORE_DIVISOR);
export const totalScore = (s) => timeScore(s) + s.points;

// Just outside a random edge, aimed roughly at the middle.
function spawn(s) {
  const r = SHARD_MIN_R + s.rand() * (SHARD_MAX_R - SHARD_MIN_R);
  const edge = Math.floor(s.rand() * 4);
  let x, y;
  if (edge === 0) { x = s.rand() * VIEW_W; y = -r - 4; }
  else if (edge === 1) { x = VIEW_W + r + 4; y = s.rand() * VIEW_H; }
  else if (edge === 2) { x = s.rand() * VIEW_W; y = VIEW_H + r + 4; }
  else { x = -r - 4; y = s.rand() * VIEW_H; }

  const aim = Math.atan2(VIEW_H / 2 - y, VIEW_W / 2 - x) + (s.rand() * 2 - 1) * AIM_SPREAD;
  const speed = (SHARD_MIN_SPEED + s.rand() * (SHARD_MAX_SPEED - SHARD_MIN_SPEED)) * difficultyAt(s.frame);
  s.shards.push({ x, y, r, vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, grazed: false });
}

export function step(s, dtFrames = 1) {
  if (s.hit) return { hit: false, grazes: 0 };
  const d = Math.max(0, Math.min(3, dtFrames));
  s.frame += d;

  s.x += (s.tx - s.x) * Math.min(1, EASE * d);
  s.y += (s.ty - s.y) * Math.min(1, EASE * d);
  s.trail.push({ x: s.x, y: s.y });
  while (s.trail.length > TRAIL) s.trail.shift();

  s.nextSpawn -= d;
  if (s.nextSpawn <= 0) {
    s.nextSpawn = Math.max(SPAWN_FLOOR, SPAWN_START - s.frame / 90);
    spawn(s);
  }

  let grazes = 0;
  let hit = false;
  for (const p of s.shards) {
    p.x += p.vx * d;
    p.y += p.vy * d;
    const gap = Math.hypot(p.x - s.x, p.y - s.y) - p.r - PLAYER_R;
    if (gap < 0) hit = true;
    else if (!p.grazed && gap < GRAZE_DIST) { p.grazed = true; grazes += 1; s.points += GRAZE_POINTS; }
  }
  const m = 40;
  s.shards = s.shards.filter((p) => p.x > -m && p.x < VIEW_W + m && p.y > -m && p.y < VIEW_H + m);

  if (hit) s.hit = true;
  return { hit, grazes };
}
