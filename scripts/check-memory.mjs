// scripts/check-memory.mjs — Memory Match on your own (src/components/games/memorySolo.js)
// and its decks (memoryDeck.js).
//
//   node scripts/check-memory.mjs
//
// The same seed deals everyone the same decks; deck 1 is the one it always
// was; later decks are new pictures, twelve pairs from deck 3, each with one
// golden pair; pairs, combos, misses and a cleared deck score as they should,
// and a cleared deck deals the next rather than ending the match.
import { buildCards, deckFor, POOL, EMOJIS, TOTAL_PAIRS } from "../src/components/games/memoryDeck.js";
import { newDeck, flip, PAIR, MISS, CLEAR, comboBonus } from "../src/components/games/memorySolo.js";

let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const SEED = 4242;

check("deck 1 is the deck it always was", JSON.stringify(deckFor(SEED, 1).cards) === JSON.stringify(buildCards(SEED).map((c) => c.emoji)) && deckFor(SEED, 1).golden === null);
check("the same seed, the same decks (a fair race)", JSON.stringify([2, 3, 4].map((n) => deckFor(SEED, n))) === JSON.stringify([2, 3, 4].map((n) => deckFor(SEED, n))) && JSON.stringify(deckFor(SEED, 2)) !== JSON.stringify(deckFor(SEED + 1, 2)));
check("no picture twice in the pool", new Set(POOL).size === POOL.length && EMOJIS.every((e) => POOL.includes(e)));
let okDecks = true;
for (const seed of [1, 7, SEED, 99999]) for (let n = 1; n <= 8; n++) {
  const { cards, golden } = deckFor(seed, n), want = n >= 3 ? 12 : 10;
  const counts = {}; cards.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
  if (cards.length !== want * 2 || Object.values(counts).some((v) => v !== 2) || (n > 1 && !counts[golden])) okDecks = false;
}
check("every deck is pairs of each picture: 10 pairs, then 12 from deck 3; a golden pair after deck 1", okDecks);

// play a deck with perfect memory, the order chosen to show each rule
const st = newDeck(SEED, 1);
const twin = (i) => st.cards.findIndex((e, j) => j !== i && e === st.cards[i]);
check("a matched card or one already up does nothing", (() => { flip(SEED, st, 0); const r = flip(SEED, st, 0); st.open = []; return r === null; })());
const a = 0, notTwin = st.cards.findIndex((e, j) => j !== a && e !== st.cards[a]);
flip(SEED, st, a);
const miss = flip(SEED, st, notTwin);
check("two that differ: a miss, −5", miss.k === "miss" && miss.points === MISS);
const r1a = flip(SEED, st, a), r1 = flip(SEED, st, twin(a));
check("a third tap while a miss is showing turns it back and starts afresh", r1a.k === "open" && st.matched[a]);
check("a pair: 100 — its twin never seen before, so a lucky one", r1.k === "pair" && r1.points === PAIR && r1.lucky === true);
let last = null, sawCombo = 0;
for (let i = 0; i < st.cards.length && st.d === 1; i++) {
  if (st.matched[i]) continue;
  flip(SEED, st, i); last = flip(SEED, st, twin(i));
  if (last.combo === 3) sawCombo = last.points;
}
check("pairs in a row build a combo: the third pays 100 + 40", sawCombo === PAIR + comboBonus(3) && comboBonus(3) === 40 && comboBonus(99) === 100);
check("clearing the deck pays the clear bonus and deals deck 2 — the match goes on", last.clear && last.next === 2 && st.d === 2 && st.pairs === 0 && st.total === TOTAL_PAIRS && last.points >= CLEAR + PAIR);
check("…the combo carries into the next deck", st.combo === last.combo && st.combo > 0);
const g = st.cards.indexOf(st.golden), gTwin = st.cards.lastIndexOf(st.golden);
flip(SEED, st, g); const gr = flip(SEED, st, gTwin);
check("the golden pair pays double", gr.golden && gr.points === (PAIR + comboBonus(gr.combo)) * 2);
// play on to deck 3: twelve pairs
while (st.d < 3) { const i = st.matched.findIndex((m) => !m); const j = st.cards.findIndex((e, k) => k !== i && e === st.cards[i]); flip(SEED, st, i); flip(SEED, st, j); }
check("deck 3 has twelve pairs, and the overall pair count keeps going", st.cards.length === 24 && st.size === 12 && st.total === 20);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
