// scripts/check-speedmath.mjs — Speed Math's rules (src/components/games/speedMathRules.js).
//
//   node scripts/check-speedmath.mjs
//
// The same seed gives everyone the same sums; every sum's answer is right and
// among its four choices, the other three different and not negative; it gets
// harder level by level, with ÷ and two-step sums later on; a streak, a quick
// answer and a ★ gold sum all pay more; a wrong answer costs and breaks the streak.
import { buildProblems, answerOn, levelOf, streakMult, isGold, BASE, WRONG, QUICK } from "../src/components/games/speedMathRules.js";

let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

const A = buildProblems(777), B = buildProblems(777), C = buildProblems(778);
check("the same seed, the same sums (a fair race)", JSON.stringify(A) === JSON.stringify(B) && JSON.stringify(A) !== JSON.stringify(C));

// every answer really is the answer
const evalSum = (t) => {
  const s = t.replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  let m;
  if ((m = s.match(/^\? \+ (\d+) = (\d+)$/))) return Number(m[2]) - Number(m[1]);
  if ((m = s.match(/^(\d+)²$/))) return Number(m[1]) ** 2;
  return Function(`return (${s})`)();
};
const bad = [];
for (const seed of [1, 2, 3, 777, 4242]) for (const p of buildProblems(seed)) {
  const v = evalSum(p.text);
  if (v !== p.answer || !Number.isInteger(p.answer) || p.answer < 0) bad.push(`${p.text}=${p.answer} (${v})`);
  if (p.options.length !== 4 || new Set(p.options).size !== 4 || !p.options.includes(p.answer) || p.options.some((o) => o < 0)) bad.push(`options ${p.text}: ${p.options}`);
}
check("every sum's answer is right, whole and not negative, among four different choices", bad.length === 0, bad.slice(0, 3).join(" | "));

check("it gets harder: level 1 to 4", levelOf(0) === 1 && levelOf(10) === 2 && levelOf(25) === 3 && levelOf(45) === 4 && levelOf(200) === 4);
const early = A.slice(0, 10), later = A.slice(25, 45), late = A.slice(45, 120);
check("level 1 is only + and −", early.every((p) => /[+−]/.test(p.text) && !/[×÷?²]/.test(p.text)));
check("÷ turns up by level 3", later.some((p) => p.text.includes("÷")));
check("level 4 has two-step sums, missing numbers and squares", late.some((p) => /× \d+ [+−]/.test(p.text)) && late.some((p) => p.text.startsWith("?")) && late.some((p) => p.text.includes("²")));
check("every 8th sum (from the 6th) is gold", isGold(6) && isGold(14) && !isGold(7) && A[6].gold && !A[5].gold);

// answering
const live = { idx: 0, streak: 0, right: 0, best: 0 };
check("an answer to another sum (a late tap) does nothing", answerOn(A, live, 3, A[3].answer, 500) === null && live.idx === 0);
const r0 = answerOn(A, live, 0, A[0].answer, 3000);
check("a right answer, slowly: the base points", r0.right && r0.points === BASE && !r0.quick);
const r1 = answerOn(A, live, 1, A[1].answer, 900);
check("a quick one (under 2 s) earns the quick bonus", r1.quick && r1.points === BASE + QUICK);
for (let i = 2; i < 5; i++) answerOn(A, live, i, A[i].answer, 3000);
check("five right in a row: the streak is ×1.5", streakMult(live.streak) === 1.5 && live.streak === 5);
const r5 = answerOn(A, live, 5, A[5].answer, 3000);
check("…and the next pays half as much again", r5.points === Math.round(BASE * 1.5));
const r6 = answerOn(A, live, 6, A[6].answer, 3000);
check("a gold sum pays double", r6.gold && r6.points === Math.round(BASE * 1.5 * 2));
const wrong = A[7].options.find((o) => o !== A[7].answer);
const r7 = answerOn(A, live, 7, wrong, 500);
check("a wrong answer: −6, the streak's gone, and you're told the right one", !r7.right && r7.points === WRONG && r7.streakBroke && live.streak === 0 && r7.answer === A[7].answer);
const L2 = { idx: 9, streak: 0, right: 0, best: 0 };
check("finishing the tenth sum moves you up a level", answerOn(A, L2, 9, A[9].answer, 3000).levelUp);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
