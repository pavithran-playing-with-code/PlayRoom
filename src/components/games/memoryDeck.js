// src/components/games/memoryDeck.js
// Memory Match's decks, shuffled from the room's seed. No React, so the solo
// rules (memorySolo.js), the together rules (coopBoards.js) and their check
// scripts all deal the same deck the game does.
//
// Deck 1 is the ten pictures it always was. Each deck after draws its own ten
// from a bigger pool, and from deck 3 on there are twelve pairs. Every deck
// after the first has one ★ golden pair, worth double.

// ten pictures that differ in shape and colour, not just in detail
export const EMOJIS = ["🍎","🐸","🚗","⭐","🎈","🐙","🌵","🍕","👑","🦋"];
// the pool later decks draw from: every one a different silhouette at ~40px
// (no two fish, no two wedges of fruit)
export const POOL = [...EMOJIS, "🚀","🍄","🌙","🎸","⚽","🍩","🐢","🔑","☂️","🎁","🦒","🍌","⏰","🔥","🐘","🥕","✈️","🎩","🌈","🐌"];
export const TOTAL_PAIRS = EMOJIS.length;     // deck 1 (and what solo needs to clear to count as a win)
export const pairsIn = (n) => (n >= 3 ? 12 : 10);

function seededRand(seed) {
  let s = (seed || 99) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Deck 1 of a room: the ten pictures, two of each, shuffled.
export function buildCards(seed) {
  const rand = seededRand(seed);
  const deck = [...EMOJIS, ...EMOJIS].map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }));
  return shuffle(deck, rand);
}

// Deck `n` of a match: the first is the room's seed, as it always was; each
// one after is dealt fresh, the same for everyone.
export const deckSeed = (seed, n) => (n <= 1 ? seed : (Number(seed) || 1) + n * 7919);

// Deck n's pictures in order (emoji per card) and its golden picture (null on deck 1).
export function deckFor(seed, n) {
  if (n <= 1) return { cards: buildCards(seed).map((c) => c.emoji), golden: null };
  const rand = seededRand(deckSeed(seed, n));
  const pics = shuffle([...POOL], rand).slice(0, pairsIn(n));
  const cards = shuffle([...pics, ...pics], rand);
  return { cards, golden: pics[Math.floor(rand() * pics.length)] };
}
