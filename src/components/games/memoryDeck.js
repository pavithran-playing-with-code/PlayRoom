// src/components/games/memoryDeck.js
// Memory Match's deck: ten pictures, two of each, shuffled from the room's
// seed. No React, so the together rules (coopBoards.js) and their check
// script can deal the same deck the game does.

// twelve pictures that differ in shape and colour, not just in detail
export const EMOJIS = ["🍎","🐸","🚗","⭐","🎈","🐙","🌵","🍕","👑","🦋","⚽","🐧"];
export const TOTAL_PAIRS = 10;              // the classic deck (level 2); the objective counts these

// Levels: every deck in a match is one, a little harder than the last.
//   1  8 pairs, a warm-up   2  10 pairs, the classic deck   3  12 pairs
//   4+ 12 pairs, and a wrong pair turns back over much faster
export function memLevel(deck) {
  const n = Math.max(1, Number(deck) || 1);
  return { level: n, pairs: n === 1 ? 8 : n === 2 ? 10 : 12, peek: n >= 4 ? 420 : 800 };
}
const SAYS = { 1: "A warm-up: 8 pairs", 2: "10 pairs", 3: "12 pairs — a bigger deck", 4: "Wrong pairs flip back faster!" };
export const memSays = (deck) => SAYS[Math.min(4, Math.max(1, deck))];

function seededRand(seed) {
  let s = (seed || 99) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function buildCards(seed, deckNo = 2) {
  const rand = seededRand(seed);
  // the classic ten first, the two extra once the deck grows
  const pics = EMOJIS.slice(0, memLevel(deckNo).pairs);
  const deck = [...pics, ...pics].map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Deck `n` of a match: the first is the room's seed, as it always was; each
// one after is dealt fresh, the same for everyone.
export const deckSeed = (seed, n) => (n <= 1 ? seed : (Number(seed) || 1) + n * 7919);
