// scripts/check-mahjong.mjs — Mahjong's board, without React or a browser.
//   node scripts/check-mahjong.mjs
import { SLOTS, TOTAL_PAIRS, deal, isFree, findPair, reshuffle } from "../src/components/games/mahjongBoard.js";

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const TYPES = Array.from({ length: 30 }, (_, i) => ({ k: `t${i}`, e: String(i), cat: "x" }));

// ── the stack ────────────────────────────────────────────────────────────────
check("48 places: 24 pairs", SLOTS.length === TOTAL_PAIRS * 2);
let overlap = false, floating = false;
for (let i = 0; i < SLOTS.length; i++) for (let j = i + 1; j < SLOTS.length; j++) {
  const a = SLOTS[i], b = SLOTS[j];
  if (a.z === b.z && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2) overlap = true;
}
for (const t of SLOTS) if (t.z > 0) {
  // every corner of a raised tile rests on a tile below
  const below = SLOTS.filter((o) => o.z === t.z - 1);
  for (const [cx, cy] of [[t.x + 0.5, t.y + 0.5], [t.x + 1.5, t.y + 0.5], [t.x + 0.5, t.y + 1.5], [t.x + 1.5, t.y + 1.5]])
    if (!below.some((o) => cx > o.x && cx < o.x + 2 && cy > o.y && cy < o.y + 2)) floating = true;
}
check("no two tiles in one place", !overlap);
check("nothing floats: every raised tile sits on tiles below", !floating);

// ── deals ────────────────────────────────────────────────────────────────────
// can it be cleared? a full search, remembering positions already tried
function solvable(tiles) {
  const seen = new Set();
  const go = (t) => {
    const key = t.map((x) => (x.matched ? 1 : 0)).join("");
    if (!key.includes("0")) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    const free = [];
    for (let i = 0; i < t.length; i++) if (isFree(t, i)) free.push(i);
    for (let a = 0; a < free.length; a++) for (let b = a + 1; b < free.length; b++) {
      if (t[free[a]].k !== t[free[b]].k) continue;
      const n = t.map((x, i) => (i === free[a] || i === free[b] ? { ...x, matched: true } : x));
      if (go(n)) return true;
    }
    return false;
  };
  return go(tiles);
}
let allPairs = true, allSolvable = true, same = true, minFree = 99, bad = "";
for (let seed = 1; seed <= 120; seed++) {
  const t = deal(seed, TYPES);
  const counts = {};
  for (const x of t) counts[x.k] = (counts[x.k] || 0) + 1;
  if (Object.keys(counts).length !== TOTAL_PAIRS || Object.values(counts).some((n) => n !== 2)) { allPairs = false; bad = `seed ${seed}`; }
  if (!solvable(t)) { allSolvable = false; bad = `seed ${seed}`; }
  if (JSON.stringify(deal(seed, TYPES)) !== JSON.stringify(t)) same = false;
  minFree = Math.min(minFree, t.filter((_, i) => isFree(t, i)).length);
}
check("120 deals: 24 pictures, each exactly twice", allPairs, bad);
check("120 deals: every one can be cleared", allSolvable, bad);
check("the same seed deals the same board (everyone in a room races one board)", same);
check("a deal starts with several tiles free", minFree >= 6, `at least ${minFree}`);

// ── the free rule ────────────────────────────────────────────────────────────
{
  const t = deal(5, TYPES);
  const top = SLOTS.findIndex((s) => s.z === 2);
  const under = SLOTS.findIndex((s) => s.z === 1 && s.x === 3 && s.y === 4);
  check("the top tile is free", isFree(t, top));
  check("a tile with one on top of it is not", !isFree(t, under));
  const mid = SLOTS.findIndex((s) => s.z === 0 && s.x === 4 && s.y === 0);
  const end = SLOTS.findIndex((s) => s.z === 0 && s.x === 0 && s.y === 0);
  check("the end of a row is free; the middle of a full row is not", isFree(t, end) && !isFree(t, mid));
  const u = t.map((x, i) => (SLOTS[i].z === 0 && SLOTS[i].y === 0 && SLOTS[i].x < 4 ? { ...x, matched: true } : x));
  check("…take the tiles to its left away, and the middle one is free", isFree(u, mid));
}

// ── stuck: a reshuffle always leaves a pair ──────────────────────────────────
{
  let ok = true;
  for (let seed = 1; seed <= 40; seed++) {
    let t = deal(seed, TYPES);
    // play badly: always the first free pair, until stuck or done
    for (;;) { const p = findPair(t); if (!p) break; t = t.map((x, i) => (i === p[0] || i === p[1] ? { ...x, matched: true } : x)); }
    if (t.every((x) => x.matched)) continue;
    const n = reshuffle(t);
    if (!findPair(n)) ok = false;
  }
  check("stuck with tiles left: the reshuffle always finds you a pair", ok);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
