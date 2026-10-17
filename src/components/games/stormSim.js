// src/components/games/stormSim.js
// Dodge Storm's rules: an open arena, shards flying in from every edge, and
// nothing to do but not be there. Surviving is the score; skimming a shard
// without touching it pays a little extra.
//
// No drawing and no React, so the rules can be exercised from Node. Seeded, so
// everyone in a room dodges the same storm.
//
// The longer you stay alive the more each second is worth (x2 from 20 s, x3
// from 40 s). Pickups float in now and then — a star (+15), a shield (takes
// one hit), slow time (the shards crawl for a few seconds) — from a stream of
// their own, so the shards are what they always were. From 30 s some shards
// seek you out for a while before flying straight.
import { seededRand } from "./seededRand.js";

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
export const STAR_PTS = 15;
export const SLOW_FRAMES = 240;           // slow time lasts this long (4 s)
export const SLOW_K = 0.4;                // shards at this much of their speed meanwhile
export const PICKUP_R = 12;
export const SAFE_FRAMES = 45;            // after a shield breaks: a moment nothing can hit you
export const PICKUP_LIFE = 420;           // a pickup waits this long (7 s), then fades
export const SEEK_FROM = 1800;            // seekers from 30 s
export const SEEK_FRAMES = 150;           // they turn toward you this long, then fly straight
export const SEEK_TURN = 0.035;           // radians a frame
// each second alive is worth more the longer you've lived: x2 from 20 s, x3 from 40 s
export const aliveMult = (frame) => (frame >= 2400 ? 3 : frame >= 1200 ? 2 : 1);

// Shards get faster the longer you live. 1800 frames is about thirty seconds.
export const difficultyAt = (frame) => 1 + frame / 1800;

export function newStorm(seed) {
  const rand = seededRand((Number(seed) || 1) * 5231 + 41);
  for (let i = 0; i < 6; i++) rand();
  const prand = seededRand((Number(seed) || 1) * 3967 + 7);
  for (let i = 0; i < 3; i++) prand();
  const srand = seededRand((Number(seed) || 1) * 1777 + 3);
  return {
    rand, prand, srand,
    items: [], nextItem: 240, shield: false, slow: 0, timePts: 0, safe: 0,
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

export const timeScore = (s) => Math.floor(s.timePts != null ? s.timePts : s.frame / SCORE_DIVISOR);
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
  // seekers: their own stream decides, so the storm itself is unchanged
  const seek = s.frame >= SEEK_FROM && s.srand() < 0.22 ? SEEK_FRAMES : 0;
  s.shards.push({ x, y, r, vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, grazed: false, seek, spin: s.srand() * 6 });
}

// a pickup somewhere in the open middle of the arena
function spawnItem(s) {
  const k = s.prand();
  const kind = k < 0.6 ? "star" : k < 0.8 ? "shield" : "slow";
  s.items.push({ kind, x: 40 + s.prand() * (VIEW_W - 80), y: 50 + s.prand() * (VIEW_H - 100), life: PICKUP_LIFE });
}

export function step(s, dtFrames = 1) {
  if (s.hit) return { hit: false, grazes: 0, picked: [], shieldPop: false };
  const d = Math.max(0, Math.min(3, dtFrames));
  s.frame += d;
  s.timePts = (s.timePts || 0) + (d / SCORE_DIVISOR) * aliveMult(s.frame);
  const picked = [];
  let shieldPop = false;
  // pickups: one now and then; taken by touching; gone if left too long
  s.nextItem -= d;
  if (s.nextItem <= 0) { s.nextItem = 300 + s.prand() * 240; spawnItem(s); }
  for (const it of s.items) {
    it.life -= d;
    if (Math.hypot(it.x - s.x, it.y - s.y) < PICKUP_R + PLAYER_R) {
      it.life = 0;
      picked.push(it.kind);
      if (it.kind === "star") s.points += STAR_PTS;
      else if (it.kind === "shield") s.shield = true;
      else s.slow = SLOW_FRAMES;
    }
  }
  s.items = s.items.filter((it) => it.life > 0);
  s.slow = Math.max(0, (s.slow || 0) - d);
  s.safe = Math.max(0, (s.safe || 0) - d);
  const sd = d * (s.slow > 0 ? SLOW_K : 1);           // how far the shards move this frame

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
    if (p.seek > 0) {
      // turn toward the player a little, keeping the speed
      p.seek -= d;
      const sp = Math.hypot(p.vx, p.vy), want = Math.atan2(s.y - p.y, s.x - p.x), now = Math.atan2(p.vy, p.vx);
      let da = want - now; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      const a = now + Math.max(-SEEK_TURN * d, Math.min(SEEK_TURN * d, da));
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
    }
    p.x += p.vx * sd;
    p.y += p.vy * sd;
    const gap = Math.hypot(p.x - s.x, p.y - s.y) - p.r - PLAYER_R;
    if (gap < 0) {
      if (s.safe > 0) continue;
      if (s.shield) { s.shield = false; shieldPop = true; p.gone = true; s.safe = SAFE_FRAMES; }
      else hit = true;
    } else if (!p.grazed && gap < GRAZE_DIST) { p.grazed = true; grazes += 1; s.points += GRAZE_POINTS; }
  }
  const m = 40;
  s.shards = s.shards.filter((p) => !p.gone && p.x > -m && p.x < VIEW_W + m && p.y > -m && p.y < VIEW_H + m);

  if (hit) s.hit = true;
  return { hit, grazes, picked, shieldPop };
}
