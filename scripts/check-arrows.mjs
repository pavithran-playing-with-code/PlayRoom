// scripts/check-arrows.mjs — Arrow Escape's boards (arrowBoard.js) and rules (arrowRules.js).
//
//   node scripts/check-arrows.mjs
//
// The same boards for everyone, always solvable, dressed with colours, a
// golden arrow from board 2 and a bomb from board 3; a blocked tap, a free
// one, the streak, the bomb's blast (and that what's left is still
// solvable), and the clear and speed bonuses.
import { isSolvable, occupancy, blockerOf } from "../src/components/games/arrowBoard.js";
import { boardFor, tapArrow, freeArrow, pointsFor, boardBonus, speedBonus, MISS, GOLD, STREAK_MAX } from "../src/components/games/arrowRules.js";

let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const SEED = 321;

check("the same seed, the same boards", JSON.stringify(boardFor(SEED, 3)) === JSON.stringify(boardFor(SEED, 3)) && JSON.stringify(boardFor(SEED, 3)) !== JSON.stringify(boardFor(SEED + 1, 3)));
let ok = true, why = "";
for (const seed of [1, 7, SEED, 9999]) for (let lv = 1; lv <= 8; lv++) {
  const b = boardFor(seed, lv);
  const golds = b.filter((a) => a.kind === "gold").length, bombs = b.filter((a) => a.kind === "bomb").length;
  if (!isSolvable(b)) { ok = false; why = `unsolvable ${seed}/${lv}`; }
  if (golds !== (lv >= 2 ? 1 : 0) || bombs !== (lv >= 3 ? 1 : 0)) { ok = false; why = `specials ${seed}/${lv}: ${golds} gold ${bombs} bomb`; }
  if (b.some((a) => !/^#[0-9A-F]{6}$/.test(a.colour))) { ok = false; why = "colour"; }
}
check("every board solvable, coloured; a golden arrow from board 2, a bomb from board 3", ok, why);

// taps
const b = boardFor(SEED, 1);
const occ = occupancy(b);
const stuck = b.find((a) => blockerOf(a, occ) != null);
const L = { arrows: b, streak: 3, total: b.length, began: 0, level: 1 };
const r1 = tapArrow(L, stuck.id, 0);
check("a blocked arrow stays, −8, the streak broken, its blocker named", r1.k === "blocked" && r1.points === MISS && r1.broke === 3 && L.streak === 0 && L.arrows.length === b.length && r1.blocker != null);
const f = freeArrow(L.arrows);
const r2 = tapArrow(L, f, 0);
check("a free arrow leaves and scores", r2.k === "out" && r2.points === pointsFor(r2.arrow) && L.arrows.length === b.length - 1);
let last;
for (let i = 0; i < 12 && L.arrows.length > 1; i++) last = tapArrow(L, freeArrow(L.arrows), 0);
check("arrows out in a row build a streak bonus (capped)", last.points === pointsFor(last.arrow) + Math.min(STREAK_MAX, last.streak - 1));
while (L.arrows.length) last = tapArrow(L, freeArrow(L.arrows), 5000);
check("the last arrow clears the board: the board bonus and a speed bonus", last.clear && last.bonus === boardBonus(1) && last.speed === speedBonus(b.length, 5) && last.speed > 0);
check("no speed bonus when slow", speedBonus(20, 999) === 0);

// golden and bomb
const b3 = boardFor(SEED, 3);
const L3 = { arrows: b3, streak: 0, total: b3.length, began: 0, level: 3 };
let gold = null, bomb = null;
while (L3.arrows.length && (!gold || !bomb)) {
  // play the specials as soon as they can leave
  const o = occupancy(L3.arrows);
  const sp = L3.arrows.find((a) => a.kind && blockerOf(a, o) == null);
  const r = tapArrow(L3, sp ? sp.id : freeArrow(L3.arrows), 0);
  if (r.golden) gold = r;
  if (r.bomb) { bomb = r; check("after the blast, what's left is still solvable", isSolvable(L3.arrows)); }
}
check("the golden arrow pays +20", gold && gold.points >= pointsFor(gold.arrow) + GOLD);
check("the bomb takes every arrow touching it, and scores them", bomb && bomb.blasted.length > 0
  && bomb.blasted.every((a) => a.cells.some((p) => bomb.arrow.cells.some((q) => Math.abs(p.c - q.c) + Math.abs(p.r - q.r) === 1)))
  && bomb.points >= pointsFor(bomb.arrow) + bomb.blasted.reduce((s, a) => s + pointsFor(a), 0), bomb ? `${bomb.blasted.length} blasted` : "no bomb");

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
