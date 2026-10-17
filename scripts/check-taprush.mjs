// scripts/check-taprush.mjs — Tap Rush's rules (src/components/games/tapRushRules.js).
//
//   node scripts/check-taprush.mjs
//
// The same seed gives everyone the same tiles; streaks climb ×2…×4 and a bomb
// or a miss breaks them; ice takes two taps; a double needs both tiles; only
// lit tiles count.
import { buildSequence, tapOn, timeOut, multFor, windowFor, HIT, GOLD, BOMB } from "../src/components/games/tapRushRules.js";

let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const fresh = () => ({ step: 0, hits: 0, combo: 0, ice: 0, done: [] });

const a = buildSequence(1234), b = buildSequence(1234), c = buildSequence(99);
check("the same seed, the same tiles (a fair race)", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c));
const counts = {}; a.forEach((t) => { counts[t.kind] = (counts[t.kind] || 0) + 1; });
check("every kind of tile turns up", ["star", "bomb", "gold", "ice", "double"].every((k) => counts[k] > 10), JSON.stringify(counts));
check("it starts gently: the first tiles are plain stars", a.slice(0, 4).every((t) => t.kind === "star"));
check("a double lights two different tiles", a.filter((t) => t.kind === "double").every((t) => t.pos2 !== t.pos && t.pos2 >= 0 && t.pos2 < 9));

// a sequence to tap through: a fixed one, built by hand
const S = [{ pos: 0, kind: "star" }, { pos: 1, kind: "star" }, { pos: 2, kind: "star" }, { pos: 3, kind: "star" }, { pos: 4, kind: "star" },
  { pos: 5, kind: "star" }, { pos: 6, kind: "gold" }, { pos: 7, kind: "ice" }, { pos: 0, kind: "double", pos2: 8 }, { pos: 1, kind: "bomb" }, { pos: 2, kind: "star" }];
const L = fresh();
check("a tap on a dark tile does nothing", tapOn(S, L, 5) === null && L.step === 0);
let pts = 0;
for (let i = 0; i < 5; i++) pts += tapOn(S, L, i).points;
check("five stars in a row: 14 each, and the streak reaches ×2", pts === 5 * HIT && multFor(L.combo) === 2);
const sixth = tapOn(S, L, 5);
check("the sixth is worth double", sixth.points === HIT * 2);
const gold = tapOn(S, L, 6);
check("gold is worth 40 × the multiplier", gold.points === GOLD * 2);
const ice1 = tapOn(S, L, 7);
check("ice: the first tap only cracks it", ice1.cracked && ice1.points === 0 && L.step === 7);
const ice2 = tapOn(S, L, 7);
check("…the second breaks it, and scores", ice2.points === HIT * 2 && L.step === 8);
const d1 = tapOn(S, L, 8);
check("a double: one tile isn't enough to move on", d1.points > 0 && !d1.advance && L.step === 8);
check("…a second tap on the same tile does nothing", tapOn(S, L, 8) === null);
const d2 = tapOn(S, L, 0);
check("…the other tile finishes it", d2.advance && L.step === 9);
const before = L.combo;
const bomb = tapOn(S, L, 1);
check("a bomb: −12 and the streak's gone", bomb.points === BOMB && bomb.streakBroke && before > 0 && L.combo === 0);

// timing out
const T = [{ pos: 0, kind: "star" }, { pos: 1, kind: "bomb" }, { pos: 2, kind: "star" }];
const M = fresh(); M.combo = 7;
const left = timeOut(T, M);
check("a star left to go out breaks the streak", left.streakBroke && M.combo === 0 && M.step === 1);
M.combo = 3;
const dodged = timeOut(T, M);
check("a bomb left alone is dodged, the streak kept", dodged.dodged && M.combo === 3);
check("multiplier caps at ×4", multFor(100) === 4 && multFor(0) === 1 && multFor(4) === 1 && multFor(5) === 2);
check("tiles go out faster as you score, never faster than 480 ms; ice and doubles get longer", windowFor(0, "star") > windowFor(50, "star") && windowFor(500, "star") === 480 && windowFor(10, "ice") > windowFor(10, "star") && windowFor(10, "double") > windowFor(10, "ice"));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
