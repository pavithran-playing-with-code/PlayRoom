// src/components/horror/hollowSim.js
// The Hollow: a dark house, three candles, and something walking the halls
// looking for you.
//
// The house is a perfect maze (see games/mazeBoard.js) — exactly one route
// between any two rooms. That matters here for a reason it didn't in Maze
// Runner: it means there is never a loop to lose a pursuer in. If it is coming
// down your corridor, you cannot circle round behind it. You can only back away
// and hope for a junction.
//
// No drawing and no React, so the rules can be exercised from a Node script.
import { makeMaze, DIRS, canMove, distances, idx } from "../games/mazeBoard";

export const CANDLES = 3;
export const VISION = 2.6;            // how many rooms the torch reaches
export const HEAR_DIST = 4;           // when you start to hear it
export const CAUGHT_DIST = 0;         // it has to be in the room with you

// It starts slow and gets worse with every candle you take. Each is the
// chance, per step of yours, that it takes a step of its own.
export const PACE = [0.45, 0.62, 0.78, 0.92];

// Bigger houses as you go, but never so big the torch feels pointless.
export function floorSize(floor) {
  const n = Math.min(11, 7 + Math.floor((floor - 1) / 2));
  return n;
}

const key = (r, c) => `${r},${c}`;

// Candles go in the rooms furthest from the door, so you are always dragged
// away from the way out before you can use it.
function placeCandles(maze, rand) {
  const fromExit = distances(maze, maze.goal);
  const cells = [];
  for (let r = 0; r < maze.rows; r++) {
    for (let c = 0; c < maze.cols; c++) {
      if (r === 0 && c === 0) continue;                    // not on top of you
      if (r === maze.goal.r && c === maze.goal.c) continue;
      cells.push({ r, c, d: fromExit[idx(maze, r, c)] });
    }
  }
  cells.sort((a, b) => b.d - a.d);
  const pool = cells.slice(0, Math.max(CANDLES, Math.floor(cells.length * 0.45)));
  const picked = [];
  while (picked.length < CANDLES && pool.length) {
    const i = Math.floor(rand() * pool.length);
    const cell = pool.splice(i, 1)[0];
    // spread them out a bit, so two aren't in neighbouring rooms
    if (picked.every((p) => Math.abs(p.r - cell.r) + Math.abs(p.c - cell.c) > 2)) picked.push(cell);
    else if (pool.length < CANDLES) picked.push(cell);
  }
  return picked.map((p) => ({ r: p.r, c: p.c }));
}

// A tiny seeded generator of its own, so placing candles can't disturb the
// maze's own sequence and change the house.
function rngFor(seed, floor) {
  let s = ((Number(seed) || 1) * 48271 + floor * 40503) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function newFloor(seed, floor = 1) {
  const n = floorSize(floor);
  const maze = makeMaze((Number(seed) || 1) + floor * 101, Math.max(1, (n - 5) * 2 + 1));
  const rand = rngFor(seed, floor);
  const candles = placeCandles(maze, rand);
  // It waits by the door. The way out is the one place you have to go.
  return {
    floor,
    maze,
    player: { r: 0, c: 0 },
    stalker: { r: maze.goal.r, c: maze.goal.c },
    candles,
    taken: [],
    steps: 0,
    caught: false,
    escaped: false,
    lastHeard: null,        // the direction it was last heard in
  };
}

export const allCandlesTaken = (s) => s.taken.length >= s.candles.length;
export const exitOpen = allCandlesTaken;

// How many rooms apart, walking — not as the crow flies. In a maze those are
// very different numbers, and the walking one is the one that matters.
export function gap(s) {
  const d = distances(s.maze, s.player);
  return d[idx(s.maze, s.stalker.r, s.stalker.c)];
}

export function visible(s, r, c) {
  const d = distances(s.maze, s.player);
  const steps = d[idx(s.maze, r, c)];
  return steps >= 0 && steps <= VISION;
}

// One step along the only route to you. There is no cleverness to it and there
// does not need to be: in a perfect maze the only route is the shortest one.
export function stalkerStep(s) {
  if (s.caught || s.escaped) return false;
  const fromPlayer = distances(s.maze, s.player);
  const here = fromPlayer[idx(s.maze, s.stalker.r, s.stalker.c)];
  if (here <= 0) return false;
  for (const d of DIRS) {
    if (!canMove(s.maze, s.stalker.r, s.stalker.c, d)) continue;
    const nr = s.stalker.r + d.dr, nc = s.stalker.c + d.dc;
    if (fromPlayer[idx(s.maze, nr, nc)] === here - 1) {
      s.stalker = { r: nr, c: nc };
      s.lastHeard = d.bit;
      return true;
    }
  }
  return false;
}

// A move of yours. It listens, and usually follows.
export function move(s, dir, roll = Math.random) {
  if (s.caught || s.escaped) return { moved: false };
  if (!canMove(s.maze, s.player.r, s.player.c, dir)) return { moved: false, wall: true };

  s.player = { r: s.player.r + dir.dr, c: s.player.c + dir.dc };
  s.steps += 1;

  let tookCandle = false;
  const at = s.candles.findIndex((x) => x.r === s.player.r && x.c === s.player.c);
  if (at >= 0 && !s.taken.includes(key(s.player.r, s.player.c))) {
    s.taken.push(key(s.player.r, s.player.c));
    tookCandle = true;
  }

  let escaped = false;
  if (s.player.r === s.maze.goal.r && s.player.c === s.maze.goal.c && exitOpen(s)) {
    s.escaped = true;
    escaped = true;
  }

  // It moves after you do, so a step is always a gamble rather than a race you
  // have already lost.
  let itMoved = false;
  if (!s.escaped) {
    const pace = PACE[Math.min(PACE.length - 1, s.taken.length)];
    if (roll() < pace) itMoved = stalkerStep(s);
    if (s.stalker.r === s.player.r && s.stalker.c === s.player.c) s.caught = true;
  }

  return { moved: true, tookCandle, escaped, itMoved, caught: s.caught };
}

// After it catches you: the house stays, the candles you found stay found, and
// you are put back at the start with it sent away again. Losing everything to
// one wrong turn is not frightening, it is just annoying.
export function reprieve(s) {
  s.player = { r: 0, c: 0 };
  s.stalker = { r: s.maze.goal.r, c: s.maze.goal.c };
  s.caught = false;
  s.lastHeard = null;
  return s;
}

export const FLOOR_POINTS = 200;
export const CANDLE_POINTS = 60;
export const scoreForFloor = (s) => FLOOR_POINTS + s.floor * 40;
