// scripts/check-maze-gems.mjs — Maze Runner's gems and fog (src/components/games/mazeBoard.js).
//
//   node scripts/check-maze-gems.mjs
//
// Gems are the same for everyone, at dead ends, never on the start, the flag
// or the key; there are more in later mazes (up to six); fog hides only far
// cells and only from maze 4.
import * as m from "../src/components/games/mazeBoard.js";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const DIRS = m.DIRS;

let good = true, why = "";
for (const seed of [1, 2, 7, 99]) for (let lv = 1; lv <= 10; lv++) {
  const mz = m.makeMaze(seed, lv), g = m.gemsFor(mz, seed, lv), g2 = m.gemsFor(mz, seed, lv), k = m.keyCell(mz);
  if (JSON.stringify(g) !== JSON.stringify(g2)) { good = false; why = "not the same"; }
  for (const { r, c } of g) {
    const open = DIRS.filter((d) => m.canMove(mz, r, c, d)).length;
    if (open !== 1) { good = false; why = `not a dead end ${seed}/${lv}`; }
    if ((r === mz.start.r && c === mz.start.c) || (r === mz.goal.r && c === mz.goal.c) || (r === k.r && c === k.c)) { good = false; why = "on the start, flag or key"; }
  }
  if (g.length < Math.min(3, g.length) || g.length > 6) { good = false; why = `count ${g.length}`; }
}
ok("gems: the same for everyone, at dead ends, never on the start, flag or key, at most six", good, why);
const early = m.gemsFor(m.makeMaze(3, 1), 3, 1).length, late = m.gemsFor(m.makeMaze(3, 8), 3, 8).length;
ok("more gems in later mazes", late > early, `${early} → ${late}`);
// a gem past the flag could never be taken: rolling onto the flag ends the maze
let reachable = true, where = "";
for (const seed of [1, 2, 7, 99]) for (let lv = 1; lv <= 10; lv++) {
  const mz = m.makeMaze(seed, lv), ds = m.distances(mz, mz.start), dg = m.distances(mz, mz.goal), toGoal = ds[m.idx(mz, mz.goal.r, mz.goal.c)];
  for (const g of m.gemsFor(mz, seed, lv)) if (ds[m.idx(mz, g.r, g.c)] === toGoal + dg[m.idx(mz, g.r, g.c)]) { reachable = false; where = `${seed}/${lv} ${g.r},${g.c}`; }
}
ok("no gem lies past the flag (it could never be taken)", reachable, where);
ok("every gem can be reached (it's a perfect maze)", (() => { const mz = m.makeMaze(5, 6), d = m.distances(mz); return m.gemsFor(mz, 5, 6).every((g) => d[m.idx(mz, g.r, g.c)] >= 0); })());
ok("no fog before maze 4", m.visible(3, ["0,0"], 9, 9));
ok("from maze 4: near what you've walked is seen, far isn't", m.visible(4, ["0,0"], 1, 1) && m.visible(4, ["0,0"], 0, 2) && !m.visible(4, ["0,0"], 2, 2) && m.visible(4, ["0,0", "2,1"], 2, 2));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
