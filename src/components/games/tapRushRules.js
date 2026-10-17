// src/components/games/tapRushRules.js
// Tap Rush's rules, with no React: the seeded run of lit tiles (the same for
// everyone in a room, so a race is fair), how long each stays lit, the streak
// multiplier, and what each tap is worth. scripts/check-taprush.mjs checks it.
//
// Tiles: ⭐ a star (tap it), 🌟 gold (rare, worth a lot), 🧊 ice (two taps),
// a double (two stars at once — tap both), 💣 a bomb (leave it alone).
import { seededRand } from "./seededRand.js";

export const GRID = 9;                         // 3×3
export const HIT = 14, GOLD = 40, BOMB = -12;
export const STREAK_STEP = 5, MAX_MULT = 4;    // ×2 after 5 in a row, ×3 after 10, ×4 after 15
const BASE_WINDOW = 1150, MIN_WINDOW = 480;

export function buildSequence(seed, n = 900) {
  const rand = seededRand(seed);
  const seq = [];
  for (let i = 0; i < n; i++) {
    const pos = Math.floor(rand() * GRID), r = rand(), r2 = rand();
    // the first few are always plain stars: a gentle start
    let kind = "star";
    if (i >= 4) {
      if (r < 0.16) kind = "bomb";
      else if (r < 0.21) kind = "gold";
      else if (r < 0.29) kind = "ice";
      else if (r < 0.39) kind = "double";
    }
    const item = { pos, kind };
    if (kind === "double") item.pos2 = (pos + 1 + Math.floor(r2 * (GRID - 1))) % GRID;
    seq.push(item);
  }
  return seq;
}

// the multiplier for a streak of n hits in a row
export const multFor = (n) => Math.min(MAX_MULT, 1 + Math.floor(n / STREAK_STEP));

// how long a tile stays lit (ms): shorter as you score; ice and doubles need more taps, so a little longer
export function windowFor(hits, kind) {
  const w = Math.max(MIN_WINDOW, BASE_WINDOW - hits * 10);
  return kind === "ice" ? w * 1.45 : kind === "double" ? w * 1.6 : w;
}

// the tiles still waiting for a tap on this item (a double has two)
export const targetsOf = (item, done) => (item.kind === "double" ? [item.pos, item.pos2] : [item.pos]).filter((p) => !done.includes(p));

// A tap on pos. live: { step, hits, combo, ice, done: [] } — changed in place.
// Returns what happened, or null if pos isn't lit.
export function tapOn(seq, live, pos) {
  const item = seq[live.step % seq.length];
  if (!targetsOf(item, live.done).includes(pos)) return null;
  const mult = multFor(live.combo);
  const out = { kind: item.kind, pos, points: 0, advance: true, streakBroke: false, multUp: false };
  if (item.kind === "bomb") {
    out.points = BOMB; out.streakBroke = live.combo > 0; live.combo = 0;
  } else if (item.kind === "ice" && live.ice === 0) {
    live.ice = 1; out.advance = false; out.cracked = true;               // first tap only cracks it
  } else {
    out.points = (item.kind === "gold" ? GOLD : HIT) * mult;
    live.hits += 1; live.combo += 1;
    out.multUp = multFor(live.combo) > mult;
    if (item.kind === "double") { live.done.push(pos); out.advance = targetsOf(item, live.done).length === 0; }
  }
  out.mult = multFor(live.combo);
  if (out.advance) next(live);
  return out;
}

// the tile went out untouched: fine for a bomb (dodged), a broken streak otherwise
export function timeOut(seq, live) {
  const item = seq[live.step % seq.length];
  const out = { kind: item.kind, dodged: item.kind === "bomb", streakBroke: item.kind !== "bomb" && live.combo > 0 };
  if (item.kind !== "bomb") live.combo = 0;
  next(live);
  return out;
}

function next(live) { live.step += 1; live.ice = 0; live.done = []; }
