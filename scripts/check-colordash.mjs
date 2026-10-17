// scripts/check-colordash.mjs — Color Dash's rules (src/components/games/colorDashRules.js).
//
//   node scripts/check-colordash.mjs
//
// The same seed gives everyone the same rounds; every round's answer is the
// tile that really matches; the kinds unlock in order; word-vs-ink rounds
// never print a word in its own colour; odd-one-out tiles really are one off
// and get subtler; fever rounds pay double.
import { makeRound, windowFor, pointsFor, tileHex, shade, PALETTE, KIND_START, isFever } from "../src/components/games/colorDashRules.js";

let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const rounds = (seed, n = 200) => Array.from({ length: n }, (_, i) => makeRound(seed, i));

const A = rounds(31), B = rounds(31), C = rounds(32);
check("the same seed, the same rounds (a fair race)", JSON.stringify(A) === JSON.stringify(B) && JSON.stringify(A) !== JSON.stringify(C));

const bad = [];
for (const seed of [1, 2, 31, 999]) for (const r of rounds(seed)) {
  if (r.answer < 0 || r.answer > 8) bad.push(`round ${r.i}: answer ${r.answer}`);
  if (r.kind === "odd") {
    const hexes = Array.from({ length: 9 }, (_, s) => tileHex(r, s));
    const odd = hexes.filter((h) => h !== PALETTE[r.base].hex);
    if (odd.length !== 1 || hexes[r.answer] !== r.oddHex) bad.push(`round ${r.i}: odd tiles ${odd.length}`);
  } else {
    if (r.order[r.answer] !== r.target) bad.push(`round ${r.i}: the answer tile isn't the target`);
    if (new Set(r.order).size !== 9) bad.push(`round ${r.i}: not nine different colours`);
  }
  if (r.kind === "stroop" && r.word === r.ink) bad.push(`round ${r.i}: word printed in its own ink`);
  if (r.kind === "stroop" && r.target !== (r.rule === "word" ? r.word : r.ink)) bad.push(`round ${r.i}: stroop target`);
}
check("every round's answer is the tile that really matches", bad.length === 0, bad.slice(0, 3).join(" | "));

const kindsAt = (from, to) => new Set(A.slice(from, to).map((r) => r.kind));
check("the first rounds are named with a swatch", [...kindsAt(0, 8)].join() === "name");
check("name-only from round 8, word-vs-ink from 16, odd-one-out from 28",
  kindsAt(8, 16).has("nameOnly") && !kindsAt(0, 16).has("stroop") && kindsAt(16, 28).has("stroop") && !kindsAt(0, 28).has("odd") && kindsAt(28, 120).has("odd"));
check("word-vs-ink asks for the word sometimes, the ink sometimes", new Set(A.filter((r) => r.kind === "stroop").map((r) => r.rule)).size === 2);

// the odd tile gets harder to spot
const diff = (r) => { const a = parseInt(r.oddHex.slice(1), 16), b = parseInt(PALETTE[r.base].hex.slice(1), 16); return Math.abs((a >> 16) - (b >> 16)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255)); };
const odds = A.filter((r) => r.kind === "odd");
check("odd-one-out gets subtler, but never vanishes", diff(odds[0]) > diff(odds[odds.length - 1]) && odds.every((r) => diff(r) > 0), `${diff(odds[0])} → ${diff(odds[odds.length - 1])}`);
check("shade() lightens toward white and darkens toward black", shade("#808080", 0.5) === "#C0C0C0" && shade("#808080", -0.5) === "#404040");

check("rounds shorten as you go; the tricky kinds get longer", windowFor(A[0]) === 1500 && windowFor({ i: 30, kind: "name" }) < 1500 && windowFor({ i: 150, kind: "name" }) === 1100 &&windowFor({ i: 100, kind: "stroop" }) > windowFor({ i: 100, kind: "name" }));
check("every 10th round is a fever round, paying double", isFever(9) && isFever(19) && !isFever(10) && pointsFor({ kind: "name", fever: true }, 1) === 2 * pointsFor({ kind: "name", fever: false }, 1));
check("points: 15 + the streak (capped), tricky kinds +5", pointsFor({ kind: "name" }, 1) === 16 && pointsFor({ kind: "name" }, 99) === 45 && pointsFor({ kind: "stroop" }, 1) === 21);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
