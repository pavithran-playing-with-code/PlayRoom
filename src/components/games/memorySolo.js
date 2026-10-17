// src/components/games/memorySolo.js
// Memory Match on your own (or racing a room): the rules, with no React.
// scripts/check-memory.mjs checks them.
//
// Turn two cards. The same picture: a pair, worth PAIR plus a combo bonus
// for pairs in a row without a miss; the ★ golden pair pays double. Not the
// same: −5, the combo's gone, and they go back down (the game shows them a
// moment first). Clearing a deck pays CLEAR and deals the next — the room's
// clock ends the match, not the deck.
import { deckFor, pairsIn } from "./memoryDeck.js";

export const PAIR = 100, COMBO_STEP = 20, COMBO_MAX = 5, MISS = -5, CLEAR = 300;

export function newDeck(seed, d, total = 0, best = 0) {
  const { cards, golden } = deckFor(seed, d);
  return { d, cards, golden, matched: cards.map(() => false), seen: cards.map(() => false),
    open: [], pairs: 0, size: pairsIn(d), total, combo: 0, best };
}

// a combo of n pairs in a row: the bonus on the nth
export const comboBonus = (n) => COMBO_STEP * Math.min(COMBO_MAX, Math.max(0, n - 1));

// Turn card i over. st is changed in place (it lives in a ref). Returns what
// happened, or null if the tap does nothing (a matched card, one already up).
// A third tap while a wrong pair is still showing turns that pair back first.
export function flip(seed, st, i) {
  if (!(i >= 0 && i < st.cards.length) || st.matched[i]) return null;
  if (st.open.length === 2) st.open = [];       // a wrong pair showing: back down, and this is a fresh first card
  if (st.open.includes(i)) return null;
  st.open.push(i);
  if (st.open.length === 1) { const fresh = !st.seen[i]; st.seen[i] = true; return { k: "open", i, fresh }; }
  const [a, b] = st.open;
  const bSeen = st.seen[b];
  st.seen[b] = true;
  if (st.cards[a] !== st.cards[b]) {
    const broke = st.combo;
    st.combo = 0;
    return { k: "miss", a, b, points: MISS, broke };
  }
  st.open = [];
  st.matched[a] = st.matched[b] = true;
  st.pairs += 1; st.total += 1; st.combo += 1; st.best = Math.max(st.best, st.combo);
  const golden = st.cards[a] === st.golden;
  // lucky: the second card had never been seen — it wasn't memory, it was a guess that landed
  const out = { k: "pair", a, b, golden, combo: st.combo, lucky: !bSeen, points: (PAIR + comboBonus(st.combo)) * (golden ? 2 : 1) };
  if (st.pairs >= st.size) {
    out.clear = true;
    out.points += CLEAR;
    Object.assign(st, newDeck(seed, st.d + 1, st.total, st.best));
    st.combo = out.combo;                                          // a combo carries into the next deck
    out.next = st.d;
  }
  return out;
}
