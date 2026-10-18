// src/components/games/memoryDeck.js
// Memory Match's deck: ten pictures, two of each, shuffled from the room's
// seed. No React, so the together rules (coopBoards.js) and their check
// script can deal the same deck the game does.

// ten pictures that differ in shape and colour, not just in detail
export const EMOJIS = ["🍎","🐸","🚗","⭐","🎈","🐙","🌵","🍕","👑","🦋"];
export const TOTAL_PAIRS = EMOJIS.length;

function seededRand(seed) {
  let s = (seed || 99) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function buildCards(seed) {
  const rand = seededRand(seed);
  const deck = [...EMOJIS, ...EMOJIS].map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Deck `n` of a match: the first is the room's seed, as it always was; each
// one after is dealt fresh, the same for everyone.
export const deckSeed = (seed, n) => (n <= 1 ? seed : (Number(seed) || 1) + n * 7919);
