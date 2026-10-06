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
