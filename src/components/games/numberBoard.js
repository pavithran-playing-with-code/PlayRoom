// src/components/games/numberBoard.js
// Number Rush's grids. No React, so the together rules (coopBoards.js) and
// their check script build the same grids the game draws.
import { seededRand, shuffleInPlace } from "./seededRand.js";

export const HIT = 3;
export const MISS = -2;
export const clearBonus = (level) => 10 + 5 * level;
const TINTS = ["var(--sun)", "var(--mint)", "var(--sky)", "var(--bubble)", "var(--lime)", "var(--peach)"];

// Grid size per level: 3×3, 4×4, 4×5, 5×5, 5×6, then 6×6 from level 6 on.
export function gridFor(level) {
  const sizes = [[3, 3], [4, 4], [5, 4], [5, 5], [5, 6], [6, 6]];
  const [cols, rows] = sizes[Math.min(level, sizes.length) - 1];
  return { cols, rows, n: cols * rows };
}

export function makeBoard(seed, level) {
  const rand = seededRand((Number(seed) || 1) * 6151 + level * 92821 + 5);
  for (let i = 0; i < 6; i++) rand();
  const { cols, rows, n } = gridFor(level);
  const numbers = shuffleInPlace(Array.from({ length: n }, (_, i) => i + 1), rand);
  const cells = numbers.map((num) => ({
    num,
    // from level 4 the tiles are colourful, so the numbers stop jumping out
    tint: level >= 4 ? TINTS[Math.floor(rand() * TINTS.length)] : "#FFFFFF",
    // from level 6 the numbers are tilted, too
    tilt: level >= 6 ? Math.round((rand() * 2 - 1) * 16) : 0,
  }));
  return { cols, rows, n, cells };
}

// ── twists drawn on top of a grid (the numbers and their order never change) ──
// From grid 5, every SHUFFLE_EVERY numbers the tiles trade places — the same
// way on every phone, from the seed, the grid and how far the count has got.
export const SHUFFLE_FROM = 5, SHUFFLE_EVERY = 6;
export const shuffleStep = (level, next) => (level >= SHUFFLE_FROM ? Math.floor((next - 1) / SHUFFLE_EVERY) : 0);
// where each cell sits (an index into the grid's places) after `step` shuffles
export function placesFor(seed, level, step, n) {
  const places = Array.from({ length: n }, (_, i) => i);
  if (step <= 0) return places;
  const rand = seededRand((Number(seed) || 1) * 4099 + level * 271 + step * 7919 + 11);
  for (let i = 0; i < 3; i++) rand();
  return shuffleInPlace(places, rand);
}
