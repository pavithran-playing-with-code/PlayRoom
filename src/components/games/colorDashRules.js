// src/components/games/colorDashRules.js
// Color Dash's rules, with no React: round i for a room (the same for
// everyone — a fair race), how long it lasts, and what a right tap is worth.
// scripts/check-colordash.mjs checks it.
//
// Four kinds of round, unlocking as you go:
//   name      "Tap: Red", with a little red swatch to help        (rounds 0–7)
//   nameOnly  "Tap: Red", no swatch                               (from 8)
//   stroop    a colour word printed in another ink — "BLUE" in red —
//             and the card says whether to tap the WORD or the INK  (from 16)
//   odd       all nine tiles one colour but one, a shade off: find it;
//             the difference gets smaller                           (from 28)
// Every 10th round (from the 10th) is a ★ fever round: double points.
import { seededRand, shuffleInPlace } from "./seededRand.js";

// Nine colours far enough apart to tell at a glance. (An earlier set had two
// greens that were almost the same, which made some rounds a coin toss.)
export const PALETTE = [
  { name: "Red", hex: "#F2413F" }, { name: "Orange", hex: "#FF9233" }, { name: "Yellow", hex: "#FFD12E" },
  { name: "Green", hex: "#4CAF3F" }, { name: "Teal", hex: "#17BFC0" }, { name: "Blue", hex: "#2F7BEF" },
  { name: "Indigo", hex: "#3B32A6" }, { name: "Purple", hex: "#BC5CEE" }, { name: "Pink", hex: "#FF6FB5" },
];
export const WRONG = -5;
export const KIND_START = { nameOnly: 8, stroop: 16, odd: 28 };
export const isFever = (i) => i >= 9 && i % 10 === 9;

// a colour moved toward white (amt > 0) or black (amt < 0)
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16), ch = [n >> 16, (n >> 8) & 255, n & 255];
  const out = ch.map((c) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt)));
  return "#" + out.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function makeRound(seed, i) {
  const rand = seededRand((Number(seed) || 1) * 2903 + i * 7717 + 3);
  for (let k = 0; k < 4; k++) rand();
  const order = shuffleInPlace(PALETTE.map((_, idx) => idx), rand);
  const r = rand();
  let kind = "name";
  if (i >= KIND_START.odd) kind = r < 0.4 ? "stroop" : r < 0.7 ? "odd" : "nameOnly";
  else if (i >= KIND_START.stroop) kind = r < 0.5 ? "stroop" : "nameOnly";
  else if (i >= KIND_START.nameOnly) kind = r < 0.7 ? "nameOnly" : "name";
  const round = { i, kind, order, fever: isFever(i) };
  if (kind === "name" || kind === "nameOnly") {
    round.target = order[Math.floor(rand() * 9)];
    round.answer = order.indexOf(round.target);
  } else if (kind === "stroop") {
    const word = order[Math.floor(rand() * 9)];
    let ink = order[Math.floor(rand() * 9)];
    if (ink === word) ink = order[(order.indexOf(word) + 1 + Math.floor(rand() * 8)) % 9];
    round.word = word; round.ink = ink; round.rule = rand() < 0.5 ? "word" : "ink";
    round.target = round.rule === "word" ? word : ink;
    round.answer = order.indexOf(round.target);
  } else {
    // odd one out: the base colour everywhere, one tile a shade off — less and less as you go
    const base = order[Math.floor(rand() * 9)], slot = Math.floor(rand() * 9);
    const amt = Math.max(0.1, 0.26 - (i - KIND_START.odd) * 0.004) * (rand() < 0.5 ? 1 : -1);
    round.base = base; round.answer = slot; round.oddHex = shade(PALETTE[base].hex, amt); round.target = base;
  }
  return round;
}

// how long a round lasts (ms): a little shorter as you go; the tricky kinds get longer
export function windowFor(round) {
  const w = Math.max(1100, 1500 - round.i * 8);
  return round.kind === "stroop" ? w + 350 : round.kind === "odd" ? w + 450 : w;
}

// a right tap: 15 plus the streak (this tap included, up to +30); the tricky kinds +5; fever doubles
export function pointsFor(round, streak) {
  const p = 15 + Math.min(30, streak) + (round.kind === "stroop" || round.kind === "odd" ? 5 : 0);
  return round.fever ? p * 2 : p;
}

// what a tile looks like this round
export const tileHex = (round, slot) => (round.kind === "odd" ? (slot === round.answer ? round.oddHex : PALETTE[round.base].hex) : PALETTE[round.order[slot]].hex);
