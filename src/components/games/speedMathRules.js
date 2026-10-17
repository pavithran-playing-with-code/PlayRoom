// src/components/games/speedMathRules.js
// Speed Math's rules, with no React: the seeded run of sums (the same for
// everyone in a room — a fair race), getting harder level by level, wrong
// answers that look like real slips, and what an answer is worth.
// scripts/check-speedmath.mjs checks it.
//
// Levels (by how many sums in you are):
//   1  small + and −                      (sums 0–9)
//   2  bigger + and −, times tables to 9   (10–24)
//   3  times tables to 12, and ÷           (25–44)
//   4  two-step sums, "? + 17 = 42", squares (45 on)
// Every 8th sum (from the 6th) is ★ gold: worth double.
import { seededRand, randInt, shuffleInPlace } from "./seededRand.js";

export const LEVELS = [0, 10, 25, 45];                  // the sum each level starts at
export const LEVEL_NAMES = ["+ −", "+ − ×", "× ÷", "mixed"];
export const BASE = 10, LEVEL_PTS = 2, WRONG = -6, QUICK_MS = 2000, QUICK = 4, STREAK_STEP = 5;

export const levelOf = (i) => LEVELS.filter((s) => i >= s).length;   // 1..4
export const isGold = (i) => i >= 6 && i % 8 === 6;

function sum(rand, lvl) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  if (lvl === 1) {
    if (rand() < 0.5) { const a = randInt(rand, 2, 20), b = randInt(rand, 2, 20); return { text: `${a} + ${b}`, answer: a + b, op: "+" }; }
    const a = randInt(rand, 8, 30), b = randInt(rand, 1, a); return { text: `${a} − ${b}`, answer: a - b, op: "-" };
  }
  if (lvl === 2) {
    const op = pick(["+", "-", "×"]);
    if (op === "+") { const a = randInt(rand, 12, 69), b = randInt(rand, 12, 49); return { text: `${a} + ${b}`, answer: a + b, op }; }
    if (op === "-") { const a = randInt(rand, 30, 99), b = randInt(rand, 5, a); return { text: `${a} − ${b}`, answer: a - b, op }; }
    const a = randInt(rand, 2, 9), b = randInt(rand, 2, 9); return { text: `${a} × ${b}`, answer: a * b, op };
  }
  if (lvl === 3) {
    if (rand() < 0.5) { const a = randInt(rand, 3, 12), b = randInt(rand, 3, 12); return { text: `${a} × ${b}`, answer: a * b, op: "×" }; }
    const b = randInt(rand, 2, 12), q = randInt(rand, 2, 12); return { text: `${b * q} ÷ ${b}`, answer: q, op: "÷" };
  }
  // level 4: a mix
  const k = rand();
  if (k < 0.35) {
    // a × b ± c, never below zero: what's taken off is less than the product
    const a = randInt(rand, 3, 9), b = randInt(rand, 3, 9), plus = rand() < 0.5, c = randInt(rand, 2, plus ? 15 : Math.min(15, a * b - 1));
    return { text: `${a} × ${b} ${plus ? "+" : "−"} ${c}`, answer: a * b + (plus ? c : -c), op: "×+" };
  }
  if (k < 0.65) { const x = randInt(rand, 4, 40), b = randInt(rand, 5, 45); return { text: `? + ${b} = ${x + b}`, answer: x, op: "?" }; }
  if (k < 0.82) { const a = randInt(rand, 4, 15); return { text: `${a}²`, answer: a * a, op: "²" }; }
  const b = randInt(rand, 3, 9), q = randInt(rand, 6, 15); return { text: `${b * q} ÷ ${b}`, answer: q, op: "÷" };
}

// Three wrong answers that look like real slips: off by one, off by ten,
// the digits swapped, a neighbouring times-table answer — near enough that a
// guess from the last digit doesn't work.
function slips(rand, p) {
  const a = p.answer, out = new Set();
  const cand = [a + 1, a - 1, a + 10, a - 10, a + 2, a - 2];
  if (a >= 10) { const s = String(a); cand.push(Number(s.split("").reverse().join(""))); }
  if (p.op === "×" || p.op === "×+" || p.op === "²") cand.push(a + randInt(rand, 3, 9), a - randInt(rand, 3, 9));
  if (p.op === "÷" || p.op === "?") cand.push(a + 3, a - 3);
  shuffleInPlace(cand, rand);
  for (const c of cand) { if (c !== a && c >= 0 && !out.has(c)) out.add(c); if (out.size === 3) break; }
  while (out.size < 3) { const c = a + randInt(rand, -12, 12); if (c !== a && c >= 0) out.add(c); }
  return [...out];
}

export function buildProblems(seed, n = 320) {
  const rand = seededRand(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const lvl = levelOf(i), p = sum(rand, lvl);
    const options = shuffleInPlace([p.answer, ...slips(rand, p)], rand);
    out.push({ text: p.text, answer: p.answer, options, level: lvl, gold: isGold(i) });
  }
  return out;
}

// the streak's multiplier: ×1, ×1.5 after 5 right in a row, ×2 after 10
export const streakMult = (n) => (n >= 2 * STREAK_STEP ? 2 : n >= STREAK_STEP ? 1.5 : 1);

// An answer to sum i, given after ms. live: { idx, streak, right, best } —
// changed in place. Returns what happened, or null if it wasn't this sum's.
export function answerOn(problems, live, i, choice, ms) {
  if (i !== live.idx) return null;
  const p = problems[live.idx % problems.length];
  const out = { right: choice === p.answer, answer: p.answer, gold: p.gold, quick: false, points: 0, levelUp: false };
  if (out.right) {
    const mult = streakMult(live.streak);
    out.quick = ms <= QUICK_MS;
    out.points = Math.round((BASE + (p.level - 1) * LEVEL_PTS) * mult * (p.gold ? 2 : 1)) + (out.quick ? QUICK : 0);
    out.mult = mult;
    live.streak += 1; live.right += 1; live.best = Math.max(live.best, live.streak);
    out.multUp = streakMult(live.streak) > mult;
  } else {
    out.points = WRONG; out.streakBroke = live.streak > 0; live.streak = 0;
  }
  live.idx += 1;
  out.levelUp = levelOf(live.idx) > p.level;
  out.level = levelOf(live.idx);
  return out;
}
