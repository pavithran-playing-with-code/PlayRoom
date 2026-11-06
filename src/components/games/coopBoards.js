// src/components/games/coopBoards.js
// The rules for playing together on one board: Memory Match, Mahjong and
// Word Rush. No React, so scripts/check-coop.mjs plays them.
//
// Every phone plays the same numbered moves through these (coopLog.js), so
// they must give the same answer everywhere: no clock, no Math.random, and
// never change the state they are handed — make a new one.
//
// A move a phone sends is `a`; `u` is who sent it; `c` is the move's own name,
// used for the little shows (a pair found, a miss) so each one plays once.
// Each move names its board (`b`), so a tap that lands after the board was
// cleared does nothing to the next one.
//
// The score is the team's: everyone on the side carries it. `by` counts what
// each player did, for the strip and the results. `boards` is how many have
// been cleared — the match is a win for the team once it reaches GOAL.
import { buildCards, deckSeed } from "./memoryDeck.js";
import { deal, isFree, findPair, reshuffle, TOTAL_PAIRS as MJ_PAIRS } from "./mahjongBoard.js";
import { seededRand } from "./seededRand.js";

// Boards to clear together for the match to count as a win. Must match
// COOP_GOAL in config/matchResult.js (check-coop proves it).
export const GOAL = { memory: 1, mahjong: 1 };

const blank = (b) => ({ b, score: 0, boards: 0, by: {}, ev: [], done: null });
// a little show for the phones to play once: { id, k, u, … }
const said = (s, c, e) => { s.ev = [...s.ev.slice(-7), { id: `${c}:${e.k}`, ...e }]; };
const credit = (s, u) => { s.by = { ...s.by, [u]: (s.by[u] || 0) + 1 }; };
const lose = (s, n) => { s.score = Math.max(0, s.score - n); };
const int = (v) => (Number.isInteger(v) ? v : NaN);

// ── Memory Match ─────────────────────────────────────────────────────────────
// One deck. Everyone can have one card of their own face up. Turn over a
// card whose twin is face up — anyone's — and that's a pair, for the team.
// Turn over a second one that isn't, and both of yours go back down (the
// phones show them for a moment first).
export const MEM_PAIR = 100;
export const MEM_MISS = 5;
export const MEM_CLEAR = 300;
const memDeck = (seed, n) => buildCards(deckSeed(seed, n), n).map((c) => c.emoji);

export function memoryRules(seed) {
  const init = { ...blank(1), deck: memDeck(seed, 1), matched: [], open: {}, pairs: 0 };
  function rules(st, { u, a, c }) {
    if (!a || a.t !== "flip" || a.b !== st.b) return st;
    const i = int(a.i);
    if (!(i >= 0 && i < st.deck.length) || st.matched.includes(i)) return st;
    if (Object.values(st.open).includes(i)) return st;              // somebody's card already
    const s = { ...st, open: { ...st.open } };
    const me = String(u);
    const twin = Object.keys(s.open).find((k) => s.deck[s.open[k]] === s.deck[i]);
    if (twin !== undefined) {
      const j = s.open[twin];
      delete s.open[twin];
      s.matched = [...s.matched, i, j];
      s.pairs += 1;
      s.score += MEM_PAIR;
      credit(s, u);
      said(s, c, { k: "pair", u, i, j, with: Number(twin) });
      if (s.pairs >= s.deck.length / 2) {
        s.score += MEM_CLEAR;
        s.boards += 1;
        s.done = { b: s.b, deck: s.deck };
        said(s, c, { k: "clear", u, b: s.b });
        s.b += 1;
        s.deck = memDeck(seed, s.b);
        s.matched = [];
        s.open = {};
        s.pairs = 0;
      }
    } else if (s.open[me] !== undefined) {
      const j = s.open[me];
      delete s.open[me];
      lose(s, MEM_MISS);
      said(s, c, { k: "miss", u, i, j });
    } else {
      s.open[me] = i;
    }
    return s;
  }
  return { init, rules };
}

// ── Mahjong ──────────────────────────────────────────────────────────────────
// One stack. Everyone picks their own tile; pick a free tile with the same
// picture as yours — or as anybody's — and the pair goes. A board with no
// pair left on it is shuffled at once, the same way on every phone.
export const MJ_MATCH = 100;
export const MJ_MISS = 10;
export const MJ_HINT = 20;
export const MJ_SHUFFLE = 50;
export const MJ_CLEAR = 400;
const mjSeed = (seed, n) => (n <= 1 ? seed : (Number(seed) || 1) + n * 7919);
// the same number from the same board and pair count, everywhere
const stuckRand = (seed, b, pairs) => seededRand(((Number(seed) || 1) * 977 + b * 131 + pairs * 17) % 2147483646 + 1);

export function mahjongRules(seed, types) {
  const init = { ...blank(1), tiles: deal(mjSeed(seed, 1), types, 1), sel: {}, pairs: 0 };
  function unstick(s) {
    if (s.pairs < MJ_PAIRS && !findPair(s.tiles)) {
      s.tiles = reshuffle(s.tiles, 60, stuckRand(seed, s.b, s.pairs));
      s.sel = {};
      return true;
    }
    return false;
  }
  function rules(st, { u, a, c }) {
    if (!a || a.b !== st.b) return st;
    const me = String(u);
    if (a.t === "hint") { const s = { ...st }; lose(s, MJ_HINT); return s; }
    if (a.t === "shuf") {
      const r = int(a.r);
      if (!(r > 0)) return st;
      const s = { ...st, tiles: reshuffle(st.tiles, 60, seededRand(r)), sel: {} };
      lose(s, MJ_SHUFFLE);
      said(s, c, { k: "shuffle", u });
      return s;
    }
    if (a.t !== "tap") return st;
    const i = int(a.i);
    if (!(i >= 0 && i < st.tiles.length) || st.tiles[i].matched || !isFree(st.tiles, i)) return st;
    const s = { ...st, sel: { ...st.sel } };
    if (s.sel[me] === i) { delete s.sel[me]; return s; }
    const k = s.tiles[i].k;
    const fits = (who) => s.sel[who] !== undefined && s.sel[who] !== i
      && !s.tiles[s.sel[who]].matched && s.tiles[s.sel[who]].k === k;
    const partner = fits(me) ? me : Object.keys(s.sel).find(fits);
    if (partner !== undefined) {
      const j = s.sel[partner];
      s.tiles = s.tiles.map((t, x) => (x === i || x === j ? { ...t, matched: true } : t));
      for (const who of Object.keys(s.sel)) if (s.sel[who] === i || s.sel[who] === j) delete s.sel[who];
      s.pairs += 1;
      s.score += MJ_MATCH;
      credit(s, u);
      said(s, c, { k: "pair", u, i, j, e: s.tiles[i].e, with: Number(partner) });
      if (s.pairs >= MJ_PAIRS) {
        s.score += MJ_CLEAR * s.b;
        s.boards += 1;
        s.done = { b: s.b };
        said(s, c, { k: "clear", u, b: s.b });
        s.b += 1;
        s.tiles = deal(mjSeed(seed, s.b), types, s.b);
        s.sel = {};
        s.pairs = 0;
      } else if (unstick(s)) said(s, c, { k: "stuck", u });
    } else if (s.sel[me] !== undefined) {
      delete s.sel[me];
      lose(s, MJ_MISS);
      said(s, c, { k: "miss", u, i });
    } else {
      s.sel[me] = i;
    }
    return s;
  }
  return { init, rules };
}

// ── Word Rush ────────────────────────────────────────────────────────────────
// One pile of words for the side. Each of you has your own word to
// unscramble ("take" one to start); solve it or give it up and you get the
// next word nobody has had — two people never get the same one. The goal
// grows with the clock and the side: 3 words a minute each.
export const WORD_SOLVE = 16;
export const WORD_SKIP = 4;
export const wordGoal = (secs, n) => Math.max(4, Math.round((3 * (Number(secs) || 120) * Math.max(1, n)) / 60));

export function wordRules() {
  const init = { ...blank(1), next: 0, taken: {}, solved: 0 };
  function rules(st, { u, a, c }) {
    if (!a) return st;
    const me = String(u);
    if (a.t === "take") {
      if (st.taken[me] !== undefined) return st;
      return { ...st, taken: { ...st.taken, [me]: st.next }, next: st.next + 1 };
    }
    if (a.t !== "solve" && a.t !== "skip") return st;
    const i = int(a.i);
    if (st.taken[me] !== i) return st;                       // not the word you have
    const s = { ...st, taken: { ...st.taken, [me]: st.next }, next: st.next + 1 };
    if (a.t === "solve") {
      s.score += WORD_SOLVE;
      s.solved += 1;
      s.boards = s.solved;
      credit(s, u);
      said(s, c, { k: "solved", u, i });
    } else {
      lose(s, WORD_SKIP);
      said(s, c, { k: "skip", u, i });
    }
    return s;
  }
  return { init, rules };
}
