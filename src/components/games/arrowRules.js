// src/components/games/arrowRules.js
// Arrow Escape's scoring and specials, with no React. The boards themselves
// are arrowBoard.js (always solvable); this dresses them and scores taps.
// scripts/check-arrows.mjs checks it.
//
// Every arrow gets a colour. From board 2 one arrow is ★ golden (+GOLD).
// From board 3 one is a 💣 bomb: when it slides out, every arrow touching it
// goes too, and scores. Taking arrows away only ever frees cells, so a board
// stays solvable whatever is blasted. Arrows out in a row build a streak; a
// blocked tap breaks it and costs MISS. A board cleared under par pays more.
import { seededRand } from "./seededRand.js";
import { generateBoard, occupancy, blockerOf } from "./arrowBoard.js";

export const MISS = -8, GOLD = 20, STREAK_MAX = 10, PAR_BASE = 10, PAR_PER = 1.6, PER_SEC = 3;
export const COLOURS = ["#F2413F", "#2F7BEF", "#8B5CF6", "#16A34A", "#F97316", "#EC4899", "#0EA5A4"];
export const pointsFor = (arrow) => 6 + 2 * arrow.cells.length;
export const boardBonus = (level) => 40 + 10 * level;
export const parFor = (count) => PAR_BASE + count * PAR_PER;            // seconds
export const speedBonus = (count, secs) => Math.max(0, Math.floor(parFor(count) - secs)) * PER_SEC;

// Board `level` for this room: the same shapes as ever, then dressed from a stream of its own.
export function boardFor(seed, level) {
  const arrows = generateBoard(seededRand(seed * 1009 + level * 7919 + 1), level);
  const rand = seededRand((Number(seed) || 1) * 523 + level * 1201 + 17);
  rand(); rand();
  const order = arrows.map((a) => a.id);
  const take = () => order.splice(Math.floor(rand() * order.length), 1)[0];
  const gold = level >= 2 && arrows.length > 2 ? take() : null;
  const bomb = level >= 3 && arrows.length > 3 ? take() : null;
  const shift = Math.floor(rand() * COLOURS.length);
  return arrows.map((a) => ({ ...a, colour: COLOURS[(a.id + shift) % COLOURS.length],
    kind: a.id === gold ? "gold" : a.id === bomb ? "bomb" : null }));
}

const touching = (a, b) => a.cells.some((p) => b.cells.some((q) => Math.abs(p.c - q.c) + Math.abs(p.r - q.r) === 1));

// A tap on arrow `id`. live: { arrows, streak, total (arrows on the board at
// the start), began (ms), level } — changed in place. Returns what happened.
export function tapArrow(live, id, now) {
  const arrow = live.arrows.find((a) => a.id === id);
  if (!arrow) return null;
  const occ = occupancy(live.arrows);
  const blocker = blockerOf(arrow, occ);
  if (blocker != null) {
    const broke = live.streak;
    live.streak = 0;
    return { k: "blocked", id, blocker, points: MISS, broke };
  }
  const streakBonus = Math.min(STREAK_MAX, live.streak);
  live.streak += 1;
  let points = pointsFor(arrow) + streakBonus + (arrow.kind === "gold" ? GOLD : 0);
  let rest = live.arrows.filter((a) => a.id !== id);
  let blasted = [];
  if (arrow.kind === "bomb") {
    blasted = rest.filter((a) => touching(a, arrow));
    rest = rest.filter((a) => !blasted.includes(a));
    points += blasted.reduce((s, a) => s + pointsFor(a) + (a.kind === "gold" ? GOLD : 0), 0);
  }
  live.arrows = rest;
  const out = { k: "out", id, arrow, points, golden: arrow.kind === "gold", bomb: arrow.kind === "bomb", blasted, streak: live.streak };
  if (!rest.length) {
    out.clear = true;
    out.bonus = boardBonus(live.level);
    out.speed = speedBonus(live.total, (now - live.began) / 1000);
    out.points += out.bonus + out.speed;
  }
  return out;
}

// an arrow that can leave right now (the lowest id), for the hint
export function freeArrow(arrows) {
  const occ = occupancy(arrows);
  const a = arrows.find((x) => blockerOf(x, occ) == null);
  return a ? a.id : null;
}
