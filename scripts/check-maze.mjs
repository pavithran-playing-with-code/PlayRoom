// scripts/check-maze.mjs — Maze Runner's mazes, without React or a browser.
//   node scripts/check-maze.mjs
import { createRequire } from "module";
import { makeMaze, sizeFor, distances, keyCell, idx, MIN_SIZE, MAX_SIZE, fewestRolls } from "../src/components/games/mazeBoard.js";

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

// ── together: the key ────────────────────────────────────────────────────────
let keyOk = true, keyWhy = "", trip = 0;
for (let seed = 1; seed <= 40; seed++) for (let level = 1; level <= 9; level += 2) {
  const m = makeMaze(seed, level), k = keyCell(m);
  const fromStart = distances(m)[idx(m, k.r, k.c)], toDoor = distances(m, m.goal)[idx(m, k.r, k.c)];
  if ((k.r === m.start.r && k.c === m.start.c) || (k.r === m.goal.r && k.c === m.goal.c) || fromStart < 3 || toDoor < 3) { keyOk = false; keyWhy = `seed ${seed} level ${level}: ${JSON.stringify(k)}`; }
  trip = Math.max(trip, fromStart + toDoor - distances(m)[idx(m, m.goal.r, m.goal.c)]);
  if (JSON.stringify(keyCell(makeMaze(seed, level))) !== JSON.stringify(k)) { keyOk = false; keyWhy = "not the same twice"; }
}
check("the key: never at the start or the door, a real trip from both, the same for everyone", keyOk, keyWhy);
check("…fetching it is a detour, not on the way", trip > 0, `up to ${trip} cells out of the way`);
check("the door can still be reached by rolling", fewestRolls(makeMaze(5, 3)) < Infinity);

// ── together: who won ────────────────────────────────────────────────────────
{
  const room = { game_slug: "maze", mode: "coop" };
  const won = resultsFor(room, [{ user_id: 1, score: 240, pairs_matched: 2 }, { user_id: 2, score: 240, pairs_matched: 2 }]);
  check("together, through a door: everyone wins", won.get(1) === "win" && won.get(2) === "win");
  const none = resultsFor(room, [{ user_id: 1, score: 0, pairs_matched: 0 }, { user_id: 2, score: 0, pairs_matched: 0 }]);
  check("…through none: everyone loses", none.get(1) === "loss" && none.get(2) === "loss");
  const vs = resultsFor({ game_slug: "maze", mode: "free" }, [{ user_id: 1, score: 300 }, { user_id: 2, score: 120 }]);
  check("against each other: still the best score wins", vs.get(1) === "win" && vs.get(2) === "loss");
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
