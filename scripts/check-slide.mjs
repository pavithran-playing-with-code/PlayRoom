// scripts/check-slide.mjs — Slide Puzzle's rules (src/components/games/slideRules.js).
//
//   node scripts/check-slide.mjs
//
// Boards are the same for everyone, never already solved, and always
// solvable (checked by the parity rule); they grow to 4×4; pictures every
// second board; a line slides, a swipe slides; rows done and scoring.
import { makeBoard, slideFrom, swipe, isSolved, rowsDone, inPlace, scoreFor, sizeFor, isPicture, solvedTiles } from "../src/components/games/slideRules.js";

let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

// solvable: odd n, an even number of inversions; even n, inversions + the gap's row from the bottom is odd
function solvable(tiles, n) {
  const a = tiles.filter((t) => t !== 0);
  let inv = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) inv++;
  if (n % 2) return inv % 2 === 0;
  const rowFromBottom = n - Math.floor(tiles.indexOf(0) / n);
  return (inv + rowFromBottom) % 2 === 1;
}

check("the same seed, the same boards", JSON.stringify(makeBoard(5, 3)) === JSON.stringify(makeBoard(5, 3)) && JSON.stringify(makeBoard(5, 3)) !== JSON.stringify(makeBoard(6, 3)));
let ok = true, bad = "";
for (const seed of [1, 2, 5, 99, 4242]) for (let lv = 1; lv <= 8; lv++) {
  const b = makeBoard(seed, lv);
  if (b.n !== sizeFor(lv) || b.tiles.length !== b.n * b.n || new Set(b.tiles).size !== b.tiles.length || isSolved(b.tiles) || !solvable(b.tiles, b.n)) { ok = false; bad = `seed ${seed} board ${lv}`; }
  if (!!b.picture !== isPicture(lv)) { ok = false; bad = `picture ${seed}/${lv}`; }
}
check("every board: right size, every tile once, not solved, solvable, a picture every second one", ok, bad);
check("two 3×3 boards, then 4×4", sizeFor(1) === 3 && sizeFor(2) === 3 && sizeFor(3) === 4 && sizeFor(9) === 4);

// sliding
const T = [1, 2, 3, 4, 5, 6, 7, 0, 8];                   // gap at 7
check("a tile beside the gap slides in, one move", JSON.stringify(slideFrom(T, 3, 8)) === JSON.stringify({ tiles: [1, 2, 3, 4, 5, 6, 7, 8, 0], moved: 1 }));
const line = slideFrom([1, 2, 3, 4, 5, 6, 0, 7, 8], 3, 8);
check("a tile two away slides the whole line, two moves", line.moved === 2 && isSolved(line.tiles));
const col = slideFrom([0, 2, 3, 1, 5, 6, 4, 7, 8], 3, 6);
check("…and up a column", col.moved === 2 && JSON.stringify(col.tiles) === JSON.stringify([1, 2, 3, 4, 5, 6, 0, 7, 8]));
check("a tile off the gap's row and column does nothing", slideFrom(T, 3, 0) === null && slideFrom(T, 3, 7) === null);
check("a swipe left pulls the tile right of the gap in", JSON.stringify(swipe(T, 3, "left").tiles) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 0]) && swipe(T, 3, "right").moved === 1 && swipe([1, 2, 3, 4, 5, 6, 7, 8, 0], 3, "left") === null);
check("rows done counts from the top", rowsDone([1, 2, 3, 4, 5, 6, 7, 0, 8], 3) === 2 && rowsDone([1, 2, 3, 5, 4, 6, 7, 8, 0], 3) === 1 && rowsDone([2, 1, 3, 4, 5, 6, 7, 8, 0], 3) === 0);
check("tiles in place", inPlace(solvedTiles(4)) === 15 && inPlace([0, 1, 2, 3, 4, 5, 6, 7, 8]) === 0);
const s = scoreFor(3, 20, 10), slow = scoreFor(3, 200, 99);
check("scoring: fewer moves and a quicker solve score more; never below the floor", s.pts === 220 && s.fast === 60 && slow.total === 60 && scoreFor(4, 50, 60).total === 500 + 90);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
