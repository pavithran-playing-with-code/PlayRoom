// src/components/games/pipesScore.js
// Pipes on your own (or racing a room): the bonuses and the hint, with no
// React. The boards themselves are pipesBoard.js. scripts/check-pipes-score.mjs
// checks this.
//
// A board's network is a tree, so every tile has a right way round (the
// one it was built in; a straight pipe has two). Solve in no more turns than
// it needs — the fewest possible — and it's Perfect. Solve quickly and
// there's a speed bonus. A hint turns one wrong pipe the right way, for HINT.
import { rotateMask } from "./pipesBoard.js";

export const HINT = -5, PER_SEC = 2;
export const solveBonus = (n) => 20 + 2 * n;
export const perfectBonus = (n) => 10 + n;
export const parSecs = (n) => Math.round(n * 1.2);

// quarter turns (clockwise) tile i still needs to sit the right way
export function need(board, turns, i) {
  const m = board.solution[i], at = board.start[i] + (turns[i] || 0);
  for (let k = 0; k < 4; k++) if (rotateMask(m, at + k) === m) return k;
  return 0;
}
// the turns that solve it from here, tapping forward only (a phone can't
// right-click to turn back; on a computer a turn back is one, so it only
// ever comes in under this)
export const turnsLeft = (board, turns) => board.solution.reduce((s, _, i) => s + need(board, turns, i), 0);

// One wrong tile to put right: one next to the water first, else the
// lowest. Returns { cell, by } (by: +1 turns, -1 turns back), or null if
// every tile is already right.
export function hintFor(board, turns, wet) {
  const wrong = board.solution.map((_, i) => i).filter((i) => need(board, turns, i) > 0);
  if (!wrong.length) return null;
  const { cols } = board;
  const touchesWater = (i) => {
    const x = i % cols, y = (i - x) / cols;
    return [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]].some(([nx, ny]) => nx >= 0 && ny >= 0 && nx < cols && ny < board.rows && wet.has(ny * cols + nx));
  };
  const cell = wrong.find(touchesWater) ?? wrong[0];
  const k = need(board, turns, cell);
  return { cell, by: k === 3 ? -1 : 1, k };
}

// what a solve pays: the solve bonus, Perfect if no turn was wasted, and speed
export function solveScore(board, used, par, secs) {
  const perfect = used <= par;
  const fast = Math.max(0, Math.floor(parSecs(board.n) - secs)) * PER_SEC;
  return { bonus: solveBonus(board.n), perfect: perfect ? perfectBonus(board.n) : 0, fast, total: solveBonus(board.n) + (perfect ? perfectBonus(board.n) : 0) + fast };
}
