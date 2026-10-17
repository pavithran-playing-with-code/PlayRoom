// scripts/check-blast.mjs — Block Blast's rules (src/components/games/blastBoard.js).
//
//   node scripts/check-blast.mjs
//
// The same pieces for everyone; pieces fit or don't; full rows and columns
// clear together; the preview names the lines a drop would fill; the combo
// grows on clears within three placements and lapses after; points for lines,
// several at once and a combo; an emptied board.
import { SIZE, PIECES, emptyBoard, canPlace, place, clearLines, wouldClear, comboStep, clearPoints, scoreForClear, isEmpty, makeDealer, COMBO_STEP } from "../src/components/games/blastBoard.js";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const P = (k) => PIECES.find((p) => p.k === k);

const a = makeDealer(5), b = makeDealer(5);
ok("the same seed, the same pieces", JSON.stringify([a.deal(), a.deal()].flat().map((p) => p.k)) === JSON.stringify([b.deal(), b.deal()].flat().map((p) => p.k)));
let B = emptyBoard();
ok("a piece fits on an empty board, not off the edge", canPlace(B, P("4h"), 0, 4) && !canPlace(B, P("4h"), 0, 5));
// fill row 0 but the last two cells
B = place(place(B, P("4h"), 0, 0), P("2h"), 0, 4);
ok("…and not on top of another", !canPlace(B, P("1"), 0, 0));
const pv = wouldClear(B, P("2h"), 0, 6);
ok("the preview names the row a drop would fill", pv.rows.join() === "0" && pv.cols.length === 0);
ok("…and nothing for a drop that fills none, or doesn't fit", wouldClear(B, P("2h"), 3, 0).rows.length === 0 && wouldClear(B, P("2h"), 0, 0).rows.length === 0);
// a row and a column at once: fill col 7 rows 1..7 first
let C = B;
for (let r = 1; r < SIZE; r++) C = place(C, P("1"), r, 7);
const both = clearLines(place(C, P("2h"), 0, 6));
ok("a full row and a full column clear together", both.cleared === 2 && both.rows.join() === "0" && both.cols.join() === "7");
ok("several lines at once pay more than one at a time", scoreForClear(2) > 2 * scoreForClear(1));

let st = { combo: 0, since: 0 };
st = comboStep(st, 1); ok("a first clear starts a combo of 1", st.combo === 1);
st = comboStep(st, 0); st = comboStep(st, 0); st = comboStep(st, 2);
ok("a clear within three placements grows it", st.combo === 2);
st = comboStep(st, 0); st = comboStep(st, 0); st = comboStep(st, 0);
ok("three placements with no clear and it's over", st.combo === 0);
st = comboStep(st, 1); ok("…the next clear starts again at 1", st.combo === 1);
ok("each line in a combo of 3 pays 40 more", clearPoints(2, 3) === scoreForClear(2) + COMBO_STEP * 2 * 2 && clearPoints(0, 5) === 0);
ok("an emptied board is empty", isEmpty(emptyBoard()) && !isEmpty(B));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
