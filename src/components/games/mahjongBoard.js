// src/components/games/mahjongBoard.js
// Mahjong's board: where the tiles sit, which are free, and a deal that can
// always be cleared. No React, so it can be checked from a plain Node script
// (scripts/check-mahjong.mjs).
//
// A real stack, three layers: five tiles by six on the table, four by four on
// top of those sitting half a tile over, and two on the very top. Positions
// are in half-tiles (a tile is 2 x 2), so a tile on a higher layer can sit
// across four below it.
//
// A tile is free when nothing lies on it and its left or its right is open —
// the real rule. Every deal is made backwards: from the full stack, take two
// free tiles away at a time and give them the same picture. Played forwards,
// that order clears the board, so no deal is ever impossible.
import { seededRand } from "./seededRand.js";

export const TOTAL_PAIRS = 24;

function makeSlots() {
  const s = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) s.push({ x: c * 2, y: r * 2, z: 0 });
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s.push({ x: c * 2 + 1, y: r * 2 + 2, z: 1 });
  s.push({ x: 4, y: 4, z: 2 }, { x: 4, y: 6, z: 2 });
  return s;
}
export const SLOTS = makeSlots();                   // 30 + 16 + 2 = 48
export const BOARD_W = 10, BOARD_H = 12;            // in half-tiles
export const LAYERS = 3;

// in drawing order: lower layers first; within a layer top to bottom, left to right
export const DRAW_ORDER = SLOTS.map((_, i) => i).sort((a, b) =>
  SLOTS[a].z - SLOTS[b].z || SLOTS[a].y - SLOTS[b].y || SLOTS[a].x - SLOTS[b].x);

// `here(i)`: is slot i still on the table?
function freeIn(i, here) {
  const t = SLOTS[i];
  let left = false, right = false;
  for (let j = 0; j < SLOTS.length; j++) {
    if (j === i || !here(j)) continue;
    const o = SLOTS[j];
    const overlapY = Math.abs(o.y - t.y) < 2;
    if (o.z === t.z + 1 && Math.abs(o.x - t.x) < 2 && overlapY) return false;   // something on it
    if (o.z === t.z && overlapY) {
      if (o.x === t.x - 2) left = true;
      if (o.x === t.x + 2) right = true;
    }
  }
  return !left || !right;
}

// tiles: [{ k, e, cat, matched }] by slot
export const isFree = (tiles, i) => !!tiles[i] && !tiles[i].matched && freeIn(i, (j) => !tiles[j].matched);

export function findPair(tiles) {
  const free = [];
  for (let i = 0; i < tiles.length; i++) if (isFree(tiles, i)) free.push(i);
  for (let a = 0; a < free.length; a++)
    for (let b = a + 1; b < free.length; b++)
      if (tiles[free[a]].k === tiles[free[b]].k) return [free[a], free[b]];
  return null;
}

// A deal: `types` is the picture catalogue, at least TOTAL_PAIRS long.
export function deal(seed, types) {
  const rand = seededRand((Number(seed) || 1) * 31 + 17);
  for (let attempt = 0; attempt < 50; attempt++) {
    const faces = types.slice(0, TOTAL_PAIRS).map((t) => ({ ...t }));
    for (let i = faces.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [faces[i], faces[j]] = [faces[j], faces[i]]; }
    const out = new Array(SLOTS.length).fill(null);
    const left = new Set(SLOTS.map((_, i) => i));
    let ok = true;
    for (const face of faces) {
      const free = [...left].filter((i) => freeIn(i, (j) => left.has(j)));
      if (free.length < 2) { ok = false; break; }
      const a = free.splice(Math.floor(rand() * free.length), 1)[0];
      const b = free[Math.floor(rand() * free.length)];
      left.delete(a); left.delete(b);
      out[a] = { ...face, matched: false };
      out[b] = { ...face, matched: false };
    }
    if (ok) return out;
  }
  throw new Error("mahjong: no deal");          // never seen: 48 slots always work
}

// Stuck: every tile still on the table moved to a new place among the same
// places, until there is a pair to take. Not seeded on your own — only you
// are stuck; together, everybody shares the board, so the shuffle comes from
// a number in the move (`rand`) and every phone shuffles it the same way.
export function reshuffle(tiles, maxTries = 60, rand = Math.random) {
  const slots = [];
  for (let i = 0; i < tiles.length; i++) if (!tiles[i].matched) slots.push(i);
  if (slots.length < 2) return tiles;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const pool = slots.map((i) => tiles[i]);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const next = [...tiles];
    slots.forEach((idx, k) => { next[idx] = pool[k]; });
    if (findPair(next)) return next;
  }
  return tiles;
}
