// scripts/check-typing.mjs — Typing Race's words and scoring (src/components/games/typingBoard.js).
//
//   node scripts/check-typing.mjs
//
// The same stream for everyone; never a word twice running; short words
// first, longer ones later; golden words; points for a word, a streak, a
// clean word, the nitro and a golden word; checking letters as you type.
import { wordStream, pointsFor, check, clean, isGolden, levelOf, SHORT, LONG, NITRO_AT, CLEAN } from "../src/components/games/typingBoard.js";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

const A = wordStream(9), B = wordStream(9), C = wordStream(10);
ok("the same seed, the same words (a fair race)", A.join() === B.join() && A.join() !== C.join());
ok("never the same word twice running", A.every((w, i) => i === 0 || w !== A[i - 1]));
ok("the first fifteen are short words", A.slice(0, 15).every((w) => SHORT.includes(w)));
ok("longer words come later", A.slice(0, 40).every((w) => w.length <= 6) && A.slice(40, 200).some((w) => LONG.includes(w)));
const avg = (a) => a.reduce((s, w) => s + w.length, 0) / a.length;
ok("…so the average word grows", avg(A.slice(0, 15)) < avg(A.slice(15, 40)) && avg(A.slice(15, 40)) < avg(A.slice(40, 400)), `${avg(A.slice(0, 15)).toFixed(1)} → ${avg(A.slice(40, 400)).toFixed(1)}`);
ok("levels 1, 2, 3 at words 0, 15, 40", levelOf(0) === 1 && levelOf(14) === 1 && levelOf(15) === 2 && levelOf(40) === 3);
ok("every 12th word is golden", isGolden(11) && isGolden(23) && !isGolden(12) && !isGolden(0));

ok("a word: 10 + 2 a letter + the streak", pointsFor("tiger", 0) === 20 && pointsFor("tiger", 3) === 23 && pointsFor("tiger", 99) === pointsFor("tiger", NITRO_AT + 50));
ok("a clean word earns 3 more", pointsFor("tiger", 0, { clean: true }) === 20 + CLEAN);
ok("nitro from ten in a row: half as much again", pointsFor("tiger", NITRO_AT - 1) === 29 && pointsFor("tiger", NITRO_AT) === Math.round(30 * 1.5));
ok("a golden word pays double", pointsFor("tiger", 0, { golden: true }) === 40);
ok("letters checked as you type; capitals and spaces forgiven", check("tiger", "tig").letters.join() === "ok,ok,ok,todo,todo" && check("tiger", "tix").bad && !check("tiger", clean("Tig ")).bad);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
