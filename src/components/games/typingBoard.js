// src/components/games/typingBoard.js
// Typing Race — the words, and what a typed word is worth.
//
// Everyone in a room gets the same endless stream of words, drawn from the
// room's seed, so the race is fair. Type a word and press space: right, and
// it scores by its length plus a streak bonus; wrong, and it scores nothing
// and the streak starts again.
//
// No React and no DOM, so it can be exercised from a Node script.
import { seededRand } from "./seededRand";

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

// Word n of a room's stream. Built in one pass and kept, so word 900 is the
// same word for everyone however fast they reached it.
export function wordStream(seed, count = 1500) {
  const rand = seededRand((Number(seed) || 1) * 2741 + 17);
  const out = [];
  let last = "";
  while (out.length < count) {
    const w = WORDS[Math.floor(rand() * WORDS.length)];
    if (w === last) continue;                   // never the same word twice running
    out.push(w);
    last = w;
  }
  return out;
}

export const STREAK_CAP = 10;
export const pointsFor = (word, streak) => 10 + 2 * word.length + Math.min(STREAK_CAP, streak);

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
