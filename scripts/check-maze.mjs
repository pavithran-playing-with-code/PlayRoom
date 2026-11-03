// scripts/check-maze.mjs — Maze Runner's mazes, without React or a browser.
//   node scripts/check-maze.mjs
import { createRequire } from "module";
import { makeMaze, sizeFor, distances, MIN_SIZE, MAX_SIZE, fewestRolls } from "../src/components/games/mazeBoard.js";

const require = createRequire(import.meta.url);
const { resultsFor } = require("../config/matchResult.js");

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

// ── sizes ────────────────────────────────────────────────────────────────────
const first = sizeFor(1), late = sizeFor(40);
check("the first maze is 7 x 7, bigger than it was", first.rows === 7 && first.cols === 7 && MIN_SIZE === 7);
check("…and they grow to 15 x 15, no further", late.rows === MAX_SIZE && late.cols === MAX_SIZE && MAX_SIZE === 15);

// ── every maze is a perfect maze ─────────────────────────────────────────────
let perfect = true, allReach = true, why = "";
for (let seed = 1; seed <= 40; seed++) for (let level = 1; level <= 18; level += 3) {
  const m = makeMaze(seed, level);
  if (m.carved !== m.rows * m.cols - 1) { perfect = false; why = `seed ${seed} level ${level}`; }
  if (distances(m).some((d) => d < 0)) { allReach = false; why = `seed ${seed} level ${level}`; }
}
check("every maze: exactly one route between any two cells", perfect, why);
check("every maze: every cell can be reached", allReach, why);
check("the same seed and level make the same maze (everyone in a room runs one)",
  JSON.stringify(makeMaze(77, 4)) === JSON.stringify(makeMaze(77, 4)) && JSON.stringify(makeMaze(77, 4)) !== JSON.stringify(makeMaze(78, 4)));

// ── who won ──────────────────────────────────────────────────────────────────
{
  const vs = resultsFor({ game_slug: "maze", mode: "free" }, [{ user_id: 1, score: 300 }, { user_id: 2, score: 120 }]);
  check("against each other: still the best score wins", vs.get(1) === "win" && vs.get(2) === "loss");
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
