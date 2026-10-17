// scripts/check-pipes-score.mjs — Pipes' bonuses and hint (src/components/games/pipesScore.js).
//
//   node scripts/check-pipes-score.mjs
//
// Following the hint solves every board; turning each tile its fewest turns
// solves it in exactly "par"; a solve in par is Perfect, one over isn't; the
// speed bonus runs out; the hint prefers a pipe beside the water.
import { makeBoard, currentMasks, flow, isSolved } from "../src/components/games/pipesBoard.js";
import { need, turnsLeft, hintFor, solveScore, solveBonus, perfectBonus } from "../src/components/games/pipesScore.js";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

let allSolve = true, parExact = true, phonePar = true, why = "";
for (const seed of [1, 7, 42, 999]) for (let lv = 1; lv <= 5; lv++) {
  const b = makeBoard(seed, lv);
  // follow hints until done
  let turns = b.solution.map(() => 0), used = 0;
  const par = turnsLeft(b, turns);
  for (let guard = 0; guard < 400; guard++) {
    const wet = flow(currentMasks(b, turns), b.cols, b.rows, b.source);
    const h = hintFor(b, turns, wet);
    if (!h) break;
    turns = turns.map((t, i) => (i === h.cell ? t + h.by : t));
    used++;
  }
  if (!isSolved(currentMasks(b, turns), b.cols, b.rows, b.source)) { allSolve = false; why = `seed ${seed} board ${lv}`; }
  if (used > par) { parExact = false; why = `par ${par} used ${used} (${seed}/${lv})`; }
  // a phone: forward taps only, each tile its turns — exactly par, and solved
  let t2 = b.solution.map(() => 0), taps = 0;
  b.solution.forEach((_, i) => { const k = need(b, t2, i); t2 = t2.map((t, j) => (j === i ? t + k : t)); taps += k; });
  if (taps !== par || !isSolved(currentMasks(b, t2), b.cols, b.rows, b.source)) { phonePar = false; why = `phone ${taps}/${par} (${seed}/${lv})`; }
}
ok("following the hints solves every board", allSolve, why);
ok("…never over par (a turn back is one move)", parExact, why);
ok("tapping forward only, each tile its turns, solves it in exactly par — Perfect is possible on a phone", phonePar, why);

const b = makeBoard(3, 2);
const zero = b.solution.map(() => 0);
const wet = flow(currentMasks(b, zero), b.cols, b.rows, b.source);
const h = hintFor(b, zero, wet);
const x = h.cell % b.cols, y = (h.cell - x) / b.cols;
const besideWater = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]].some(([nx, ny]) => wet.has(ny * b.cols + nx) && nx >= 0 && ny >= 0 && nx < b.cols && ny < b.rows);
ok("the hint picks a wrong pipe beside the water", need(b, zero, h.cell) > 0 && besideWater);
ok("a turn back is one move, not three", hintFor(b, zero, wet).by === (need(b, zero, h.cell) === 3 ? -1 : 1));

const s1 = solveScore(b, 10, 10, 0), s2 = solveScore(b, 11, 10, 0), s3 = solveScore(b, 10, 10, 9999);
ok("solving in par is Perfect", s1.perfect === perfectBonus(b.n) && s2.perfect === 0);
ok("a quick solve pays a speed bonus; a slow one doesn't", s1.fast > 0 && s3.fast === 0 && s3.total === solveBonus(b.n) + perfectBonus(b.n));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
