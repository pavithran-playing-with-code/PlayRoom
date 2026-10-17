// src/components/games/typingBoard.js
// Typing Race — the words, and what a typed word is worth.
//
// Everyone in a room gets the same endless stream of words, drawn from the
// room's seed, so the race is fair. Type a word and press space: right, and
// it scores by its length plus a streak bonus; wrong, and it scores nothing
// and the streak starts again. The words grow longer as you go (short, then
// medium, then long ones mixed in); every 12th is a ★ golden word worth
// double; a word typed without a single wrong letter is "clean" and earns a
// little more; ten in a row lights the nitro, half as much again.
//
// No React and no DOM, so it can be exercised from a Node script.
import { seededRand } from "./seededRand.js";

// Short, common, unambiguous on a phone keyboard: lower case, no
// punctuation, nothing autocorrect is likely to "fix".
export const WORDS = (
  "the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy " +
  "did its let put say she too use dog cat sun run fun big red top cup map sky sea ice egg arm leg eye ear box key " +
  "time work home game play fast slow good word line jump star moon fire wind rain snow tree leaf bird fish frog ship " +
  "road book door hand foot head ball cake milk king song blue gold pink gray dark warm cold soft hard near open " +
  "light water happy green music dance smile dream earth river stone cloud tiger plant ocean bread chair table sugar " +
  "apple grape lemon mango piano queen robot snake train voice zebra brave flame heart maple noble olive pearl shore " +
  "quick brown jumps lazy friend house world place great small large right young early never under often again round " +
  "planet garden window yellow orange purple silver summer winter spring autumn forest island rocket castle dragon " +
  "pencil basket button candle circle doctor family finger flower guitar hunter jacket kitten ladder magnet market " +
  "monkey number parrot pepper pillow puzzle rabbit ribbon saddle shadow spider sunset ticket tunnel turtle velvet " +
  "wallet wizard yogurt anchor bridge cactus feather harbor lantern meadow orchard pirate rainbow sandwich thunder " +
  "volcano whisper blanket chicken dolphin giraffe hamster kingdom library mermaid octopus penguin pumpkin science"
).split(" ").filter(Boolean);

// The words by length, for the stream's levels.
export const SHORT = WORDS.filter((w) => w.length <= 4);
export const MID = WORDS.filter((w) => w.length >= 5 && w.length <= 6);
export const LONG = WORDS.filter((w) => w.length >= 7);
export const LEVEL_AT = [0, 15, 40];                       // the word each level starts at
export const levelOf = (i) => LEVEL_AT.filter((s) => i >= s).length;   // 1..3
const POOLS = [SHORT, [...SHORT, ...MID], [...SHORT.filter((_, k) => k % 3 === 0), ...MID, ...LONG, ...LONG]];

// Word n of a room's stream. Built in one pass and kept, so word 900 is the
// same word for everyone however fast they reached it.
export function wordStream(seed, count = 1500) {
  const rand = seededRand((Number(seed) || 1) * 2741 + 17);
  const out = [];
  let last = "";
  while (out.length < count) {
    const pool = POOLS[levelOf(out.length) - 1];
    const w = pool[Math.floor(rand() * pool.length)];
    if (w === last) continue;                   // never the same word twice running
    out.push(w);
    last = w;
  }
  return out;
}

export const STREAK_CAP = 10, NITRO_AT = 10, CLEAN = 3, GOLD_EVERY = 12;
export const isGolden = (i) => i % GOLD_EVERY === GOLD_EVERY - 1;
export const nitro = (streak) => streak >= NITRO_AT;
// streak: right words in a row before this one
export const pointsFor = (word, streak, { golden = false, clean = false } = {}) =>
  Math.round((10 + 2 * word.length + Math.min(STREAK_CAP, streak) + (clean ? CLEAN : 0)) * (nitro(streak) ? 1.5 : 1) * (golden ? 2 : 1));

// What the typed text so far says about the word: which letters are right,
// and whether it's gone wrong.
export function check(word, typed) {
  const letters = [...word].map((ch, i) => (i >= typed.length ? "todo" : typed[i] === ch ? "ok" : "bad"));
  const bad = typed.length > word.length || letters.includes("bad");
  return { letters, bad, extra: Math.max(0, typed.length - word.length) };
}

// Phone keyboards add capitals, a trailing space or an autocorrected
// character; compare what the player meant.
export const clean = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");

// Words per minute, the usual way: five characters is a word.
export function wpm(correctChars, seconds) {
  if (seconds < 3) return 0;
  return Math.round((correctChars / 5) / (seconds / 60));
}

export function accuracy(right, wrong) {
  const n = right + wrong;
  return n ? Math.round((right / n) * 100) : 100;
}
