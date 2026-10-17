// src/components/games/wordRushRules.js
// Word Rush's words and scoring, with no React. scripts/check-wordrush.mjs checks it.
//
// The pile grows harder as you go: four-letter words first, then five, then
// six and seven mixed in. Words are picked so that no other common word
// hides in their letters (or, where one does, it counts too — ALSO). The
// pile and every scramble come from the room's seed, so it's a fair race.
//
// On your own a word is worth more the longer it is, plus your streak, plus
// a quick bonus; every 8th word is ★ golden and pays double. A hint places
// the next right letter for HINT; showing the answer costs SKIP.
import { seededRand, shuffleInPlace } from "./seededRand.js";

export const FOUR = [
  "frog","duck","milk","jump","fish","bird","cake","king","bell","gift","hand","kite","tree","book","sock",
  "rock","desk","ball","blue","gold","baby","girl","park","corn","farm","wind","hill","fork","cook","drum",
  "swim","worm","boat","moon",
];
export const FIVE = [
  "apple","river","stone","cloud","tiger","plant","music","dance","light","ocean",
  "happy","green","sugar","table","chair","bread","dream","smile","earth","glass",
  "honey","jolly","lemon","mango","night","piano","queen","robot","snake","train",
  "voice","water","zebra","brave","charm","dwarf","eagle","flame","grape","heart",
  "ivory","koala","maple","noble","olive","pearl","quilt","raven","shore","trust",
];
export const SIX = [
  "rocket","jungle","monkey","pencil","rabbit","turtle","bubble","button","cookie","dragon","guitar","hammer",
  "island","jacket","kitten","ladder","magnet","orange","pillow","pirate","puzzle","school","summer","tomato",
  "tunnel","wallet","winter","yellow","zipper","doctor","family","banana","basket","bottle","cactus","cheese",
  "cherry","donkey",
];
export const SEVEN = [
  "rainbow","dolphin","giraffe","pumpkin","penguin","octopus","chicken","kingdom","blanket","library","mermaid",
  "thunder","volcano","lantern","whisper","cupcake","popcorn","unicorn","teacher","picture","captain","diamond",
  "balloon","holiday","journey","kitchen","morning","pancake","rooster","science","vampire","harvest","freedom",
  "cabbage","avocado","chimney",
];
// Other real words made of the same letters: any of them counts. (Only
// common words — "earth" takes HEART and HATER, not every Scrabble oddity.)
export const ALSO = {
  stone: ["notes", "onset", "tones"], cloud: ["could"], dance: ["caned"], ocean: ["canoe"], green: ["genre"],
  table: ["bleat"], bread: ["beard", "bared", "debar"], dream: ["armed"], smile: ["limes", "miles", "slime"],
  earth: ["heart", "hater"], heart: ["earth", "hater"], lemon: ["melon"], mango: ["among"], night: ["thing"],
  snake: ["sneak"], zebra: ["braze"], charm: ["march"], grape: ["pager"], maple: ["ample"], olive: ["voile"],
  pearl: ["paler"], shore: ["horse"], trust: ["strut"], orange: ["onager"], song: ["snog"], boat: ["bota"], kitchen: ["thicken"], teacher: ["cheater"], blue: ["lube"], moon: ["mono"], bird: ["drib"],
};
export const accepts = (word, guess) => guess === word || (ALSO[word] || []).includes(guess);

// The pile's levels, by how far in you are.
export const LEVEL_AT = [0, 6, 20, 40];
export const levelOf = (i) => LEVEL_AT.filter((s) => i >= s).length;     // 1..4
export const LEVEL_NAMES = ["4 letters", "5 letters", "6 letters", "7 letters"];
const POOLS = [FOUR, FIVE, [...FIVE, ...SIX], [...SIX, ...SEVEN]];

export function buildRound(seed, count = 400) {
  const rand = seededRand(seed);
  const bags = POOLS.map((p) => shuffleInPlace([...p], rand));
  const at = POOLS.map(() => 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    const L = levelOf(i) - 1, bag = bags[L];
    const w = bag[at[L]++ % bag.length];
    let scrambled = shuffleInPlace(w.split(""), rand).join("");
    // never show an answer (the word, or another real word of its letters)
    for (let k = 1; k < w.length && accepts(w, scrambled); k++) scrambled = scrambled.slice(1) + scrambled[0];
    if (accepts(w, scrambled)) scrambled = w.split("").reverse().join("");
    out.push({ word: w, scrambled });
  }
  return out;
}

export const GOLD_EVERY = 8, STREAK_MAX = 10, QUICK = 5, HINT = -2, SKIP = -4;
export const isGolden = (i) => i % GOLD_EVERY === GOLD_EVERY - 1;
export const quickMs = (word) => 1000 * word.length;
// a solve: more for a longer word, plus the streak (words in a row before
// this one), plus a quick bonus; a golden word pays double
export function pointsFor(word, streak, ms, golden) {
  const quick = ms <= quickMs(word);
  const pts = (4 + 3 * word.length + Math.min(STREAK_MAX, streak) + (quick ? QUICK : 0)) * (golden ? 2 : 1);
  return { pts, quick };
}

// The hint: which scrambled tile is the next right letter, given the tiles
// picked so far (indexes into the scramble). If what's picked has already
// gone wrong, the answer is "take back from here" (back: the slot).
export function hintFor(item, picked) {
  const { word, scrambled } = item;
  for (let k = 0; k < picked.length; k++) {
    if (scrambled[picked[k]] !== word[k]) return { back: k };
  }
  const k = picked.length;
  if (k >= word.length) return null;
  const j = scrambled.split("").findIndex((c, x) => c === word[k] && !picked.includes(x));
  return j >= 0 ? { tile: j } : null;
}
