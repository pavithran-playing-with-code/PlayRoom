// scripts/check-mahjong-score.mjs — Mahjong's scoring on your own (src/components/games/mahjongScore.js).
//
//   node scripts/check-mahjong-score.mjs
//
// The combo builds on quick matches and drops on slow ones; a match is worth
// MATCH + the seconds left + the combo, double for the golden pair; the
// golden picture is the same for everyone and none on board 1; moves open
// counts the pictures with a free pair, and a dealt board always has one.
import { deal, isFree, findPair } from "../src/components/games/mahjongBoard.js";
import { comboAfter, comboBonus, matchPoints, goldenOf, movesOpen, MATCH, COMBO_MS } from "../src/components/games/mahjongScore.js";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const TYPES = Array.from({ length: 24 }, (_, i) => ({ e: String(i), k: `t${i}`, cat: "x" }));
const keys = TYPES.map((t) => t.k);

ok("the first match starts a combo of 1", comboAfter(0, null, 1000) === 1);
ok("a quick match builds it; a slow one starts again", comboAfter(3, 1000, 1000 + COMBO_MS) === 4 && comboAfter(3, 1000, 1001 + COMBO_MS) === 1);
ok("the combo bonus: nothing for one, 20 each after, at most 100", comboBonus(1) === 0 && comboBonus(3) === 40 && comboBonus(99) === 100);
ok("a match: 100 + the seconds left + the combo", matchPoints({ timeLeft: 87.6, combo: 3 }) === MATCH + 87 + 40);
ok("the golden pair pays double", matchPoints({ timeLeft: 50, combo: 1, golden: true }) === 2 * (MATCH + 50));
ok("no golden picture on board 1; the same for everyone after", goldenOf(9, 1, keys) === null && goldenOf(9, 2, keys) === goldenOf(9, 2, keys) && keys.includes(goldenOf(9, 2, keys)));
ok("the golden picture changes from board to board", new Set([2, 3, 4, 5, 6, 7].map((n) => goldenOf(9, n, keys))).size >= 3);

let good = true;
for (const seed of [1, 2, 9, 77]) {
  const tiles = deal(seed, TYPES);
  const n = movesOpen(tiles);
  if (n < 1 || !findPair(tiles)) good = false;
  // play a pair and check the count follows the board
  const [a, b] = findPair(tiles);
  const after = tiles.map((t, i) => (i === a || i === b ? { ...t, matched: true } : t));
  const free = {}; after.forEach((t, i) => { if (!t.matched && isFree(after, i)) free[t.k] = (free[t.k] || 0) + 1; });
  if (movesOpen(after) !== Object.values(free).filter((x) => x >= 2).length) good = false;
}
ok("moves open: at least one on every fresh deal, and it follows the board", good);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
