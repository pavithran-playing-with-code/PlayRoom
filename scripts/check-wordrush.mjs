// scripts/check-wordrush.mjs — Word Rush's words and scoring (src/components/games/wordRushRules.js).
//
//   node scripts/check-wordrush.mjs
//
// The same pile for everyone; four letters first, then five, six and seven;
// no scramble ever shows an answer; no word twice in a list; golden words;
// points for length, streak, speed and gold; the hint finds the next letter
// (or says where you went wrong).
import { buildRound, accepts, levelOf, isGolden, pointsFor, hintFor, FOUR, FIVE, SIX, SEVEN, QUICK } from "../src/components/games/wordRushRules.js";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

const A = buildRound(5), B = buildRound(5), C = buildRound(6);
ok("the same seed, the same pile (a fair race)", JSON.stringify(A) === JSON.stringify(B) && JSON.stringify(A) !== JSON.stringify(C));
const all = [...FOUR, ...FIVE, ...SIX, ...SEVEN];
ok("no word twice; every word plain lower-case letters of the right length", new Set(all).size === all.length
  && FOUR.every((w) => /^[a-z]{4}$/.test(w)) && FIVE.every((w) => /^[a-z]{5}$/.test(w)) && SIX.every((w) => /^[a-z]{6}$/.test(w)) && SEVEN.every((w) => /^[a-z]{7}$/.test(w)));
ok("four letters first, then five, then six, then six and seven", A.slice(0, 6).every((x) => x.word.length === 4) && A.slice(6, 20).every((x) => x.word.length === 5)
  && A.slice(20, 40).every((x) => x.word.length >= 5 && x.word.length <= 6) && A.slice(20, 40).some((x) => x.word.length === 6)
  && A.slice(40, 120).every((x) => x.word.length >= 6) && A.slice(40, 120).some((x) => x.word.length === 7));
ok("levels 1–4 at words 0, 6, 20, 40", levelOf(0) === 1 && levelOf(6) === 2 && levelOf(20) === 3 && levelOf(40) === 4);
let bad = [];
for (const seed of [1, 2, 5, 77, 9999]) for (const x of buildRound(seed)) {
  if (accepts(x.word, x.scrambled)) bad.push(`${x.word}/${x.scrambled}`);
  if ([...x.scrambled].sort().join() !== [...x.word].sort().join()) bad.push(`letters ${x.word}/${x.scrambled}`);
}
ok("no scramble ever shows an answer, and every scramble has the word's letters", bad.length === 0, bad.slice(0, 3).join(" "));
ok("no word repeats for a long while", new Set(A.slice(40, 100).map((x) => x.word)).size === 60);
ok("every 8th word is golden", isGolden(7) && isGolden(15) && !isGolden(8));

ok("longer words score more", pointsFor("frog", 0, 99999).pts < pointsFor("tiger", 0, 99999).pts && pointsFor("tiger", 0, 99999).pts < pointsFor("rainbow", 0, 99999).pts);
ok("a streak adds to it", pointsFor("tiger", 4, 99999).pts === pointsFor("tiger", 0, 99999).pts + 4);
const q = pointsFor("tiger", 0, 2000);
ok("a quick solve adds 5", q.quick && q.pts === pointsFor("tiger", 0, 99999).pts + QUICK);
ok("a golden word pays double", pointsFor("tiger", 0, 99999, true).pts === 2 * pointsFor("tiger", 0, 99999).pts);

const item = { word: "tiger", scrambled: "regit" };
ok("the hint finds the next right letter", hintFor(item, []).tile === 4 && hintFor(item, [4]).tile === 3);
ok("…and points back to a wrong letter already placed", hintFor(item, [4, 0]).back === 1);
ok("other real words of the same letters count", accepts("earth", "heart") && accepts("lemon", "melon") && !accepts("tiger", "regit"));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
