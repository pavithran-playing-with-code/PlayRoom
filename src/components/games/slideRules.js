// src/components/games/slideRules.js
// Slide Puzzle's rules, with no React. scripts/check-slide.mjs checks them.
//
// Boards grow: two 3×3, then 4×4. Every second board is a picture — one big
// picture cut into tiles (the numbers stay, small, in the corner). Boards are
// shuffled by sliding, never by shuffling the numbers: a random arrangement
// is only solvable half the time. Everyone in a room gets the same boards.
//
// Tap a tile in the gap's row or column and the whole line slides toward the
// gap; each tile that moves is a move. Fewer moves and a quicker solve score more.
import { seededRand } from "./seededRand.js";

export const PICTURES = ["🦁", "🚀", "🌻", "🐙", "🦄", "🍉", "🐳", "🎃"];

export const sizeFor = (level) => (level <= 2 ? 3 : 4);
export const isPicture = (level) => level % 2 === 0;
const shuffleMoves = (level) => (level <= 2 ? 56 : level === 3 ? 34 : level === 4 ? 46 : 60);

export const solvedTiles = (n) => [...Array(n * n - 1).keys()].map((i) => i + 1).concat(0);
export const isSolved = (tiles) => tiles.every((t, i) => (i === tiles.length - 1 ? t === 0 : t === i + 1));
export const neighbours = (n, i) => {
  const x = i % n, y = Math.floor(i / n);
  return [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < n && ny < n)
    .map(([nx, ny]) => ny * n + nx);
};

// how many tiles are in their own place
export const inPlace = (tiles) => tiles.reduce((k, t, i) => k + (t !== 0 && t === i + 1 ? 1 : 0), 0);

export function makeBoard(seed, level, salt = 0) {
  const n = sizeFor(level);
  const rand = seededRand((Number(seed) || 1) * 8191 + level * 31337 + 7 + salt * 104729);
  for (let i = 0; i < 6; i++) rand();
  const tiles = solvedTiles(n);
  let gap = n * n - 1, last = -1;
  for (let i = 0; i < shuffleMoves(level); i++) {
    const cameFrom = last;
    const options = neighbours(n, gap).filter((x) => x !== cameFrom);   // never undo the move just made
    const pick = options[Math.floor(rand() * options.length)];
    tiles[gap] = tiles[pick]; tiles[pick] = 0;
    last = gap; gap = pick;
  }
  // A shuffle that lands back on (or next to) the solved board would be a free point.
  if (isSolved(tiles) || inPlace(tiles) >= n * n - 3) return makeBoard(seed, level, salt + 1);
  const picture = isPicture(level) ? PICTURES[Math.floor(rand() * PICTURES.length)] : null;
  const hue = Math.floor(rand() * 360);
  return { n, tiles, picture, hue };
}

// rows finished from the top (every tile right, in that row and all above)
export function rowsDone(tiles, n) {
  for (let r = 0; r < n - 1; r++) {
    for (let x = 0; x < n; x++) if (tiles[r * n + x] !== r * n + x + 1) return r;
  }
  return n - 1;
}

// Slide toward the gap from cell i: every tile between i and the gap, in its
// row or column, moves one step. Returns the new tiles and how many moved,
// or null if i isn't in the gap's row or column.
export function slideFrom(tiles, n, i) {
  const gap = tiles.indexOf(0);
  if (i === gap || i < 0 || i >= tiles.length) return null;
  const gx = gap % n, gy = Math.floor(gap / n), x = i % n, y = Math.floor(i / n);
  let step;
  if (gy === y) step = x < gx ? -1 : 1;
  else if (gx === x) step = y < gy ? -n : n;
  else return null;
  const out = tiles.slice();
  let at = gap, moved = 0;
  while (at !== i) { out[at] = out[at + step]; at += step; moved++; }
  out[i] = 0;
  return { tiles: out, moved };
}

// a swipe: the tile on the far side of the gap from the direction moves in
export function swipe(tiles, n, dir) {
  const gap = tiles.indexOf(0), gx = gap % n, gy = Math.floor(gap / n);
  const from = { left: [gx + 1, gy], right: [gx - 1, gy], up: [gx, gy + 1], down: [gx, gy - 1] }[dir];
  if (!from || from[0] < 0 || from[1] < 0 || from[0] >= n || from[1] >= n) return null;
  return slideFrom(tiles, n, from[1] * n + from[0]);
}

// points for a solve: a base for the size, less for every move, plus speed
export const BASE = { 3: 300, 4: 700 }, FLOOR = { 3: 60, 4: 150 }, PER_MOVE = 4, PAR_SECS = { 3: 30, 4: 90 }, PER_SEC = 3;
export function scoreFor(n, moves, secs) {
  const pts = Math.max(FLOOR[n], BASE[n] - moves * PER_MOVE);
  const fast = Math.max(0, Math.floor(PAR_SECS[n] - secs)) * PER_SEC;
  return { pts, fast, total: pts + fast };
}
