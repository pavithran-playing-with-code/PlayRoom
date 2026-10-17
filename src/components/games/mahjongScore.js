// src/components/games/mahjongScore.js
// Mahjong on your own (or racing a room): what a match is worth, with no
// React. The board itself is mahjongBoard.js. scripts/check-mahjong-score.mjs
// checks this.
//
// A match is MATCH plus the seconds left on the clock, as it always was.
// Matches less than COMBO_MS apart build a combo, worth COMBO_STEP more for
// each one in the chain (up to COMBO_MAX). From board 2 one picture is ★
// golden: its pair pays double. Clearing a board pays CLEAR_BONUS × the board.
import { seededRand } from "./seededRand.js";
import { isFree } from "./mahjongBoard.js";

export const MATCH = 100, CLEAR_BONUS = 400, MISS = -10, HINT_COST = -20, SHUFFLE_COST = -50;
export const COMBO_MS = 4000, COMBO_STEP = 20, COMBO_MAX = 100;

// the combo after a match at `now`, given the last match's time and combo
export const comboAfter = (combo, lastAt, now) => (lastAt != null && now - lastAt <= COMBO_MS ? combo + 1 : 1);
export const comboBonus = (combo) => Math.min(COMBO_MAX, COMBO_STEP * Math.max(0, combo - 1));
export const matchPoints = ({ timeLeft = 0, combo = 1, golden = false }) =>
  Math.round((MATCH + Math.max(0, Math.floor(timeLeft)) + comboBonus(combo)) * (golden ? 2 : 1));

// board `n`'s golden picture (its key), the same for everyone; none on board 1
export function goldenOf(seed, n, keys) {
  if (n < 2 || !keys.length) return null;
  const rand = seededRand((Number(seed) || 1) * 211 + n * 4441 + 3);
  rand(); rand();
  return keys[Math.floor(rand() * keys.length)];
}

// how many pictures have two or more free tiles: the moves open right now
export function movesOpen(tiles) {
  const free = {};
  tiles.forEach((t, i) => { if (t && !t.matched && isFree(tiles, i)) free[t.k] = (free[t.k] || 0) + 1; });
  return Object.values(free).filter((n) => n >= 2).length;
}
