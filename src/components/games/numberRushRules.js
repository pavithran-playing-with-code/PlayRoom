// src/components/games/numberRushRules.js
// Number Rush on your own (or racing a room): what a tap is worth, with no
// React. The grids are numberBoard.js. scripts/check-numberrush.mjs checks it.
//
// Tap the next number: HIT points, times the rush — hits less than RUSH_MS
// apart build a chain (×2 from 5, ×3 from 12); a slow hit starts it again, a
// miss breaks it. One number on each grid is ★ golden, worth GOLD more. Clear
// a grid under its par time for a speed bonus on top of the clear bonus.
import { seededRand } from "./seededRand.js";
import { HIT, MISS, clearBonus } from "./numberBoard.js";

export const RUSH_MS = 1000, GOLD = 10, PAR_PER = 800, PAR_BASE = 2000, PER_SEC = 2;
export const rushMult = (chain) => (chain >= 12 ? 3 : chain >= 5 ? 2 : 1);
export const parFor = (n) => PAR_BASE + n * PAR_PER;
export const speedBonus = (n, ms) => Math.max(0, Math.floor((parFor(n) - ms) / 1000)) * PER_SEC;
// grid `level`'s golden number: somewhere past the first third, the same for everyone
export function goldenOf(seed, level, n) {
  const rand = seededRand((Number(seed) || 1) * 3301 + level * 613 + 9);
  rand(); rand();
  const lo = Math.ceil(n / 3) + 1;
  return lo + Math.floor(rand() * (n - lo + 1));
}

// A tap on `num` at time `now` (ms). live: { level, next, chain, lastHit,
// startedAt } — changed in place. board: { n }. Returns what happened, or
// null if it does nothing (a number already done, or one tapped twice).
export function tapOn(seed, board, live, num, now) {
  if (!(num >= live.next && num <= board.n)) return null;
  if (num !== live.next) {
    const broke = live.chain;
    live.chain = 0;
    return { k: "miss", num, want: live.next, points: MISS, broke };
  }
  live.chain = live.lastHit != null && now - live.lastHit <= RUSH_MS ? live.chain + 1 : 1;
  live.lastHit = now;
  const mult = rushMult(live.chain);
  const golden = num === goldenOf(seed, live.level, board.n);
  const out = { k: "hit", num, mult, chain: live.chain, golden, multUp: mult > rushMult(live.chain - 1), points: HIT * mult + (golden ? GOLD : 0) };
  live.next += 1;
  if (live.next > board.n) {
    out.clear = true;
    out.bonus = clearBonus(live.level);
    out.speed = speedBonus(board.n, now - live.startedAt);
    out.points += out.bonus + out.speed;
  }
  return out;
}
