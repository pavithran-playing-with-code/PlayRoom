// src/components/games/pianoSim.js
// The rules of Piano Tiles, with no React and no canvas — so a Node script
// can play it (scripts/check-piano.mjs).
//
// Four columns, one black tile in every row, rows rolling down the screen.
// Tap the lowest black tile; the next one is the one above it. A long tile is
// held until it has rolled past. Distances are in rows: a tile's `y` is where
// its bottom edge sits on the song, `pos` is the song row at the bottom of the
// screen, so a tile is drawn `y - pos` rows up from the bottom.
//
// The song (which column, which tiles are long) comes from the room's seed:
// everyone plays the same tiles. Nothing ever takes points away — a missed
// tile or a tap on white costs you your combo, some speed and a moment
// stood still, and the clock keeps running.
import { seededRand } from "./seededRand.js";

export const COLS = 4;
export const VISIBLE = 4;            // rows on the screen
export const BASE_SPEED = 2.4;       // rows a second at the start
export const MAX_SPEED = 7;
export const SPEED_PER_TILE = 0.02;
export const MISS_AT = -0.45;        // a tile's bottom this far below the screen: missed
export const SLOP = 0.3;             // rows of grace round a tile for a tap
export const HOLD_LINE = 1;          // a long tile is done when its top reaches this far up
export const HOLD_PTS = 10;          // for each extra row of a long tile, held all the way
export const STUN_MISS = 0.8;        // seconds stood still after a miss
export const STUN_WRONG = 0.45;      // …and after a tap on white
const LONG_FROM = 8;                 // no long tiles in the first few
const LONG_CHANCE = 0.13;

export function newSong(seed) {
  const s = {
    rand: seededRand(seed), tiles: [], end: 0.5, prevCol: -1, same: 0,
    pos: 0, speed: BASE_SPEED, started: false, next: 0,
    combo: 0, best: 0, hits: 0, misses: 0, wrongs: 0,
    points: 0, hold: null, stunT: 0, t: 0,
  };
  ensure(s, VISIBLE + 4);
  return s;
}

// Deal tiles until the song reaches `upto`. Never three in one column running.
function ensure(s, upto) {
  while (s.end < upto) {
    const r = s.rand;
    let col = Math.floor(r() * COLS);
    if (col === s.prevCol && s.same >= 1) col = (col + 1 + Math.floor(r() * (COLS - 1))) % COLS;
    s.same = col === s.prevCol ? s.same + 1 : 0;
    s.prevCol = col;
    const i = s.tiles.length;
    const len = i >= LONG_FROM && r() < LONG_CHANCE ? 2 + Math.floor(r() * 2) : 1;
    s.tiles.push({ i, col, y: s.end, len, done: false, missed: false, held: 0, at: 0 });
    s.end += len;
  }
}

export function tilePoints(combo) {
  return 10 + Math.min(10, Math.floor(combo / 25) * 2);
}

// How far a held long tile has got, 0..1.
function holdProgress(s, tile) {
  return Math.max(0, Math.min(1, (s.pos + HOLD_LINE - tile.y) / tile.len));
}

// Let go of a long tile: it pays for as much of it as was held.
function endHold(s) {
  if (s.hold === null) return null;
  const tile = s.tiles[s.hold];
  tile.held = holdProgress(s, tile);
  s.points += Math.round(HOLD_PTS * (tile.len - 1) * tile.held);
  s.hold = null;
  return tile;
}

export function release(s) {
  return endHold(s);
}

// The tiles worth drawing: anything touching the screen, and a little under it.
export function visible(s) {
  ensure(s, s.pos + VISIBLE + 4);
  const out = [];
  for (let k = Math.max(0, s.next - 8); k < s.tiles.length; k++) {
    const t = s.tiles[k];
    if (t.y > s.pos + VISIBLE + 0.1) break;
    if (t.y + t.len > s.pos - 1) out.push(t);
  }
  return out;
}

export function step(s, dt) {
  const out = { missed: null, held: null };
  s.t += dt;
  ensure(s, s.pos + VISIBLE + 4);
  if (s.hold !== null) s.tiles[s.hold].held = holdProgress(s, s.tiles[s.hold]);
  if (s.stunT > 0) { s.stunT = Math.max(0, s.stunT - dt); return out; }
  if (!s.started) return out;
  s.pos += s.speed * dt;

  if (s.hold !== null) {
    const tile = s.tiles[s.hold];
    tile.held = holdProgress(s, tile);
    if (tile.held >= 1) out.held = endHold(s);
  }

  const tile = s.tiles[s.next];
  if (tile.y - s.pos < MISS_AT) {
    tile.missed = true;
    tile.at = s.t;
    s.next += 1;
    s.combo = 0;
    s.misses += 1;
    s.speed = Math.max(BASE_SPEED, s.speed * 0.8);
    s.stunT = STUN_MISS;
    endHold(s);
    s.pos = tile.y - 0.7;             // roll back so you can see what you missed
    out.missed = tile;
  }
  return out;
}

// A tap in column `col`, `yRow` rows up the song (pos + rows up the screen).
//   hit    the lowest black tile — it plays
//   early  a black tile further up: nothing happens
//   none   nothing to judge (not started yet, stood still, a bounce on a tile just played)
//   wrong  white: the combo goes and you stand still a moment
export function tap(s, col, yRow) {
  if (s.stunT > 0) return { kind: "none" };
  ensure(s, s.pos + VISIBLE + 4);
  const on = (t) => t.col === col && yRow >= t.y - SLOP && yRow <= t.y + t.len + SLOP;
  const tile = s.tiles[s.next];
  if (on(tile)) {
    endHold(s);
    tile.done = true;
    tile.at = s.t;
    s.started = true;
    s.next += 1;
    s.combo += 1;
    s.best = Math.max(s.best, s.combo);
    s.hits += 1;
    s.points += tilePoints(s.combo);
    s.speed = Math.min(MAX_SPEED, s.speed + SPEED_PER_TILE);
    if (tile.len > 1) { s.hold = tile.i; tile.held = holdProgress(s, tile); }
    return { kind: "hit", tile };
  }
  for (let k = s.next + 1; k < s.tiles.length; k++) {
    const t = s.tiles[k];
    if (t.y > yRow + SLOP) break;
    if (on(t)) return { kind: "early" };
  }
  for (let k = Math.max(0, s.next - 3); k < s.next; k++) if (on(s.tiles[k])) return { kind: "none" };
  if (!s.started) return { kind: "none" };
  s.combo = 0;
  s.wrongs += 1;
  s.stunT = STUN_WRONG;
  return { kind: "wrong", col, yRow };
}

export function score(s) {
  return s.points;
}
