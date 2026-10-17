// scripts/check-numberrush.mjs — Number Rush on your own (numberRushRules.js)
// and the grid twists (numberBoard.js).
//
//   node scripts/check-numberrush.mjs
//
// A hit, a miss, the rush chain (and how slowness and misses break it), the
// golden number, the clear and speed bonuses; and the shuffle: the same for
// everyone, only from grid 5, a real rearrangement that keeps every tile.
import { makeBoard, HIT, MISS, clearBonus, shuffleStep, placesFor, SHUFFLE_EVERY } from "../src/components/games/numberBoard.js";
import { tapOn, goldenOf, rushMult, speedBonus, parFor, RUSH_MS, GOLD } from "../src/components/games/numberRushRules.js";

let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const SEED = 77;

const b1 = makeBoard(SEED, 1);
const g1 = goldenOf(SEED, 1, b1.n);
check("the golden number is on the grid, past the first third, the same for everyone", g1 > b1.n / 3 && g1 <= b1.n && g1 === goldenOf(SEED, 1, b1.n));
let ok = true;
for (let lv = 1; lv <= 10; lv++) { const n = makeBoard(SEED, lv).n, g = goldenOf(SEED, lv, n); if (!(g >= 1 && g <= n)) ok = false; }
check("every grid's golden number is one of its numbers", ok);

const L = { level: 1, next: 1, chain: 0, lastHit: null, startedAt: 0 };
check("a number already done, or past the end, does nothing", tapOn(SEED, b1, { ...L, next: 3 }, 2, 0) === null && tapOn(SEED, b1, L, 99, 0) === null);
const m = tapOn(SEED, b1, { ...L, chain: 4 }, 5, 0);
check("a wrong number: a miss, −2, the chain broken", m.k === "miss" && m.points === MISS && m.broke === 4);
let t = 100, r, sawX2 = false;
const quick = { ...L };
for (let i = 1; i <= 4; i++) { r = tapOn(SEED, b1, quick, i, t); t += 300; }
check("quick hits build a chain", r.k === "hit" && quick.chain === 4 && r.mult === 1);
r = tapOn(SEED, b1, quick, 5, t); t += 300;
check("…×2 from the fifth", r.mult === 2 && r.multUp && r.points === HIT * 2 + (5 === g1 ? GOLD : 0));
sawX2 = r.mult === 2;
r = tapOn(SEED, b1, quick, 6, t + RUSH_MS + 1);
check("a slow hit starts the chain again", r.chain === 1 && r.mult === 1 && sawX2);
check("×3 from twelve", rushMult(11) === 2 && rushMult(12) === 3);
// the golden number pays more
const G = { ...L, next: g1 };
const gr = tapOn(SEED, b1, G, g1, 0);
check("the golden number pays +10", gr.golden && gr.points === HIT + GOLD + (gr.clear ? gr.bonus + gr.speed : 0));
// clearing
const C = { ...L, next: b1.n, lastHit: null, startedAt: 0 };
const cr = tapOn(SEED, b1, C, b1.n, 3000);
check("the last number clears the grid: the clear bonus and a speed bonus", cr.clear && cr.bonus === clearBonus(1) && cr.speed === speedBonus(b1.n, 3000) && cr.speed > 0);
check("no speed bonus past par", speedBonus(9, parFor(9) + 1) === 0);

// the shuffle
check("no shuffling before grid 5", shuffleStep(4, 30) === 0 && shuffleStep(5, SHUFFLE_EVERY) === 0 && shuffleStep(5, SHUFFLE_EVERY + 1) === 1);
const n5 = makeBoard(SEED, 5).n;
const p1 = placesFor(SEED, 5, 1, n5), p1b = placesFor(SEED, 5, 1, n5), p2 = placesFor(SEED, 5, 2, n5);
check("a shuffle keeps every tile, and moves them", [...p1].sort((a, b) => a - b).every((v, i) => v === i) && p1.some((v, i) => v !== i));
check("the same shuffle for everyone; each one different", JSON.stringify(p1) === JSON.stringify(p1b) && JSON.stringify(p1) !== JSON.stringify(p2));
check("step 0 is the grid as dealt", placesFor(SEED, 5, 0, n5).every((v, i) => v === i));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
