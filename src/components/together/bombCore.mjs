// src/components/together/bombCore.mjs
// BOMB SQUAD — the rules, shared by the server (config/togetherWorld.js runs
// one per side) and the phones (which draw the bomb and print the manual).
// No React, no network: scripts/check-bomb.mjs defuses bombs with it.
//
// One player — the defuser — sees the bomb: its timer, its serial number,
// its batteries and its modules (wires, a big button, a keypad of symbols,
// a Simon). Everybody else on the side sees the MANUAL, which says how each
// module is solved — but the answer depends on what's on the bomb. So they
// talk: "how many wires? is the last one white?". Solve every module before
// the timer runs out or three mistakes are made, and the bomb is defused;
// either way, the next bomb comes, and the next player defuses it.
//
// Alone, you have the bomb and the manual on one phone.
//
// The bomb's details go to the defuser only (`secret`): what the side sees
// together (`view`) is the timer, the strikes and which modules are done.
import { seededRand, randInt, shuffle } from "./rand.mjs";

export const GAME = "bomb";
export const TICK_MS = 100;
export const MAX_STRIKES = 3;
export const PAUSE_S = 3.5;          // between bombs: what happened, and who's next
export const TAP_S = 0.7;            // shorter than this, the button was pressed; longer, held

export const COLOURS = { red: "#FF4D4D", blue: "#3A86FF", yellow: "#FFD60A", white: "#F5F5F5", black: "#222222", green: "#2ECC71" };
export const WIRE_COLOURS = ["red", "blue", "yellow", "white", "black"];
export const SIMON_COLOURS = ["red", "blue", "green", "yellow"];
export const BUTTON_COLOURS = ["blue", "white", "yellow", "red"];
export const BUTTON_LABELS = ["ABORT", "DETONATE", "HOLD", "PRESS"];

// The keypad's symbols, chosen to differ by shape, and the manual's columns.
export const KEYPAD_COLUMNS = [
  ["⭐", "🌙", "☂️", "⚓", "🔔", "🍀", "🎈"],
  ["🎈", "⭐", "🔑", "💎", "☂️", "🎵", "🔥"],
  ["❄️", "⚡", "🔑", "🦋", "🔔", "🌙", "🐌"],
  ["👑", "🍄", "🦋", "⚓", "💎", "⚡", "⭐"],
  ["🔥", "🐌", "✂️", "🍀", "👑", "❄️", "🎵"],
  ["✂️", "🍄", "🎈", "🔔", "⚓", "🐌", "💎"],
];

// Simon: the colour that flashes → the colour to press, by vowel in the
// serial and by strikes so far.
export const SIMON_MAP = {
  vowel: [
    { red: "blue", blue: "red", green: "yellow", yellow: "green" },
    { red: "yellow", blue: "green", green: "blue", yellow: "red" },
    { red: "green", blue: "red", green: "yellow", yellow: "blue" },
  ],
  none: [
    { red: "blue", blue: "yellow", green: "green", yellow: "red" },
    { red: "red", blue: "blue", green: "yellow", yellow: "green" },
    { red: "yellow", blue: "green", green: "blue", yellow: "red" },
  ],
};
// Holding the button: the colour of the strip → the digit to let go on.
export const STRIP_DIGIT = { blue: "4", white: "1", yellow: "5", red: "1" };

// The manual, as the phones print it. The rules below implement exactly this.
export const MANUAL = {
  wires: [
    { n: 3, rules: ["If there are no red wires, cut the second wire.", "Otherwise, if the last wire is white, cut the last wire.", "Otherwise, if there is more than one blue wire, cut the last blue wire.", "Otherwise, cut the last wire."] },
    { n: 4, rules: ["If there is more than one red wire and the serial number's last digit is odd, cut the last red wire.", "Otherwise, if the last wire is yellow and there are no red wires, cut the first wire.", "Otherwise, if there is exactly one blue wire, cut the first wire.", "Otherwise, if there is more than one yellow wire, cut the last wire.", "Otherwise, cut the second wire."] },
    { n: 5, rules: ["If the last wire is black and the serial number's last digit is odd, cut the fourth wire.", "Otherwise, if there is exactly one red wire and more than one yellow wire, cut the first wire.", "Otherwise, if there are no black wires, cut the second wire.", "Otherwise, cut the first wire."] },
    { n: 6, rules: ["If there are no yellow wires and the serial number's last digit is odd, cut the third wire.", "Otherwise, if there is exactly one yellow wire and more than one white wire, cut the fourth wire.", "Otherwise, if there are no red wires, cut the last wire.", "Otherwise, cut the fourth wire."] },
  ],
  button: [
    "If the button is blue and says ABORT, hold it.",
    "Otherwise, if there is more than one battery and the button says DETONATE, press and let go at once.",
    "Otherwise, if the button is white and the serial number has a vowel, hold it.",
    "Otherwise, if there are more than two batteries, press and let go at once.",
    "Otherwise, if the button is yellow, hold it.",
    "Otherwise, if the button is red and says HOLD, press and let go at once.",
    "Otherwise, hold it.",
  ],
  hold: ["Holding it, a coloured strip lights up beside it. Let go when the timer shows:", "Blue strip — a 4 anywhere on the timer.", "White strip — a 1 anywhere.", "Yellow strip — a 5 anywhere.", "Any other colour — a 1 anywhere."],
  keypad: "Exactly one column has all four symbols on the keypad. Press the four in the order they come down that column.",
  simon: "A colour flashes; press the colour the table says. Each time you get the run right, it flashes one more. The table changes with the strikes.",
};

// ── one bomb ─────────────────────────────────────────────────────────────────
const LETTERS = "ABCDEFGHIJKLMNPQRSTUVXZ";      // no O: it reads as a 0
const VOWELS = /[AEIOU]/;
export const fmt = (secs) => { const s = Math.max(0, Math.ceil(secs)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
export const serialOdd = (b) => Number(b.serial[b.serial.length - 1]) % 2 === 1;
export const serialVowel = (b) => VOWELS.test(b.serial);

export function wireAnswer(colours, bomb) {
  const n = colours.length, count = (c) => colours.filter((x) => x === c).length;
  const last = colours[n - 1], lastOf = (c) => colours.lastIndexOf(c);
  const odd = serialOdd(bomb);
  if (n === 3) {
    if (!count("red")) return 1;
    if (last === "white") return n - 1;
    if (count("blue") > 1) return lastOf("blue");
    return n - 1;
  }
  if (n === 4) {
    if (count("red") > 1 && odd) return lastOf("red");
    if (last === "yellow" && !count("red")) return 0;
    if (count("blue") === 1) return 0;
    if (count("yellow") > 1) return n - 1;
    return 1;
  }
  if (n === 5) {
    if (last === "black" && odd) return 3;
    if (count("red") === 1 && count("yellow") > 1) return 0;
    if (!count("black")) return 1;
    return 0;
  }
  if (!count("yellow") && odd) return 2;
  if (count("yellow") === 1 && count("white") > 1) return 3;
  if (!count("red")) return n - 1;
  return 3;
}

export function buttonAnswer(m, bomb) {
  if (m.colour === "blue" && m.label === "ABORT") return "hold";
  if (bomb.batteries > 1 && m.label === "DETONATE") return "press";
  if (m.colour === "white" && serialVowel(bomb)) return "hold";
  if (bomb.batteries > 2) return "press";
  if (m.colour === "yellow") return "hold";
  if (m.colour === "red" && m.label === "HOLD") return "press";
  return "hold";
}

export function keypadAnswer(symbols) {
  const cols = KEYPAD_COLUMNS.filter((c) => symbols.every((s) => c.includes(s)));
  if (cols.length !== 1) return null;
  return [...symbols].sort((a, b) => cols[0].indexOf(a) - cols[0].indexOf(b));
}

export const simonWant = (bomb, strikes, flashed) => SIMON_MAP[serialVowel(bomb) ? "vowel" : "none"][Math.min(2, strikes)][flashed];

// How a bomb is built: more modules and less time as the match goes on.
export function makeBomb(seed, index) {
  const r = seededRand((Number(seed) || 1) * 31 + index * 7919 + 11);
  let serial = "";
  for (let i = 0; i < 5; i++) serial += r() < 0.45 ? String(randInt(r, 0, 9)) : LETTERS[randInt(r, 0, LETTERS.length - 1)];
  serial += String(randInt(r, 0, 9));
  const bomb = { index, serial, batteries: randInt(r, 0, 4), strikes: 0, modules: [] };
  const count = Math.min(4, 2 + Math.floor(index / 1.5));
  const kinds = shuffle(index === 0 ? ["wires", "button", "keypad"] : ["wires", "button", "keypad", "simon"], r).slice(0, count);
  if (index === 0 && !kinds.includes("wires")) kinds[0] = "wires";     // the first bomb always starts friendly
  for (const kind of kinds) {
    if (kind === "wires") {
      const n = randInt(r, 3, 6);
      const colours = Array.from({ length: n }, () => WIRE_COLOURS[randInt(r, 0, WIRE_COLOURS.length - 1)]);
      bomb.modules.push({ kind, colours, cut: [] });
    } else if (kind === "button") {
      bomb.modules.push({ kind, colour: BUTTON_COLOURS[randInt(r, 0, 3)], label: BUTTON_LABELS[randInt(r, 0, 3)], strip: ["blue", "white", "yellow", "red"][randInt(r, 0, 3)], down: null });
    } else if (kind === "keypad") {
      let symbols = null;
      for (let tries = 0; tries < 50 && !symbols; tries++) {
        const col = KEYPAD_COLUMNS[randInt(r, 0, KEYPAD_COLUMNS.length - 1)];
        const pick = shuffle([...col], r).slice(0, 4);
        if (keypadAnswer(pick)) symbols = pick;
      }
      bomb.modules.push({ kind, symbols, pressed: [] });
    } else {
      bomb.modules.push({ kind, seq: Array.from({ length: randInt(r, 3, 4) }, () => SIMON_COLOURS[randInt(r, 0, 3)]), stage: 1, at: 0 });
    }
  }
  for (const m of bomb.modules) m.done = false;
  bomb.limit = Math.max(80, 150 - index * 12) + 25 * Math.max(0, count - 2);
  bomb.left = bomb.limit;
  return bomb;
}

// ── a side ───────────────────────────────────────────────────────────────────
export function goalFor(durSec) { return Math.max(1, Math.round(durSec / 150)); }

export function createSide(seed, { players, durMs }) {
  const s = {
    seed, members: players.map(Number), gone: new Set(), dur: durMs / 1000, t: 0,
    bomb: null, index: 0, pause: 1.5, last: null,
    defused: 0, exploded: 0, solved: 0, score: 0, ev: [],
  };
  s.goal = goalFor(s.dur);
  return s;
}

const present = (s) => s.members.filter((id) => !s.gone.has(id));
export const defuserOf = (s) => { const p = present(s); return p.length ? p[s.index % p.length] : null; };

function nextBomb(s) {
  s.bomb = makeBomb(s.seed, s.index);
  s.defuser = defuserOf(s);
  s.ev.push({ type: "bomb", index: s.index, defuser: s.defuser });
}

function strike(s, m, why) {
  const b = s.bomb;
  b.strikes++;
  s.ev.push({ type: "strike", kind: m ? m.kind : null, strikes: b.strikes, why });
  if (b.strikes >= MAX_STRIKES) boom(s, "strikes");
}

function boom(s, why) {
  s.exploded++;
  s.last = { kind: "boom", why, index: s.index, defuser: s.defuser };
  s.ev.push({ type: "boom", why });
  s.bomb = null;
  s.index++;
  s.pause = PAUSE_S;
}

function solve(s, m) {
  m.done = true;
  s.solved++;
  s.score += 30;
  s.ev.push({ type: "solved", kind: m.kind });
  const b = s.bomb;
  if (b.modules.every((x) => x.done)) {
    const bonus = 100 + 15 * b.modules.length + 2 * Math.ceil(b.left);
    s.score += bonus;
    s.defused++;
    s.last = { kind: "defused", bonus, index: s.index, defuser: s.defuser, left: Math.ceil(b.left) };
    s.ev.push({ type: "defused", bonus });
    s.bomb = null;
    s.index++;
    s.pause = PAUSE_S;
  }
}

export function step(s, dt) {
  s.t += dt;
  if (!s.bomb) {
    s.pause -= dt;
    if (s.pause <= 0 && present(s).length) nextBomb(s);
    return;
  }
  s.bomb.left -= dt;
  if (s.bomb.left <= 0) boom(s, "time");
}

// ── what the defuser does ────────────────────────────────────────────────────
// { a: "cut", m, i } | { a: "bdown", m } | { a: "bup", m, shown } | { a: "key", m, i } | { a: "simon", m, c }
export function act(s, pid, msg) {
  const b = s.bomb;
  if (!b || Number(pid) !== s.defuser) return { ok: false, why: "notyou" };
  const m = b.modules[Number(msg.m)];
  if (!m || m.done) return { ok: false, why: "done" };
  const at = s.index;
  const result = (ok, extra) => ({ ok, ...extra, solved: m.done, boom: s.index !== at && s.last?.kind === "boom", strikes: b.strikes });

  if (msg.a === "cut" && m.kind === "wires") {
    const i = Number(msg.i);
    if (!(i >= 0 && i < m.colours.length) || m.cut.includes(i)) return { ok: false };
    m.cut.push(i);
    if (i === wireAnswer(m.colours, b)) { solve(s, m); return result(true); }
    strike(s, m, "wire");
    return result(false, { why: "wrong" });
  }
  if (msg.a === "bdown" && m.kind === "button") {
    m.down = s.t;
    return { ok: true, strip: m.strip };
  }
  if (msg.a === "bup" && m.kind === "button") {
    if (m.down === null) return { ok: false };
    const held = s.t - m.down;
    m.down = null;
    const want = buttonAnswer(m, b);
    if (want === "press") {
      if (held < TAP_S) { solve(s, m); return result(true); }
      strike(s, m, "held");
      return result(false, { why: "held" });
    }
    if (held < TAP_S) { strike(s, m, "tapped"); return result(false, { why: "tapped" }); }
    // what the defuser saw on the timer as they let go, if it's about right
    const near = [-1, 0, 1].map((d) => fmt(b.left + d));
    const shown = typeof msg.shown === "string" && near.includes(msg.shown) ? msg.shown : fmt(b.left);
    if (shown.includes(STRIP_DIGIT[m.strip] || "1")) { solve(s, m); return result(true); }
    strike(s, m, "timing");
    return result(false, { why: "timing" });
  }
  if (msg.a === "key" && m.kind === "keypad") {
    const i = Number(msg.i);
    const sym = m.symbols[i];
    if (sym === undefined || m.pressed.includes(i)) return { ok: false };
    const order = keypadAnswer(m.symbols);
    if (order[m.pressed.length] === sym) {
      m.pressed.push(i);
      if (m.pressed.length === 4) solve(s, m);
      return result(true);
    }
    strike(s, m, "key");
    return result(false, { why: "wrong" });
  }
  if (msg.a === "simon" && m.kind === "simon") {
    if (!SIMON_COLOURS.includes(msg.c)) return { ok: false };
    const want = simonWant(b, b.strikes, m.seq[m.at]);
    if (msg.c === want) {
      m.at++;
      if (m.at >= m.stage) {
        m.stage++; m.at = 0;
        if (m.stage > m.seq.length) solve(s, m);
        else s.ev.push({ type: "simon", stage: m.stage });
      }
      return result(true);
    }
    m.at = 0;
    strike(s, m, "simon");
    return result(false, { why: "wrong" });
  }
  return { ok: false };
}

export function removePlayer(s, pid) {
  s.gone.add(Number(pid));
  // the defuser walked off: hand the bomb to someone still here
  if (s.defuser === Number(pid)) {
    const p = present(s);
    s.defuser = p.length ? p[0] : null;
    s.ev.push({ type: "bomb", index: s.index, defuser: s.defuser, handed: true });
  }
}

export const score = (s) => s.score;
export const goal = (s) => s.defused >= s.goal;
export const done = () => false;

// ── what travels ─────────────────────────────────────────────────────────────
// Everyone on the side: the timer, the strikes, what's done — never the bomb.
export function view(s) {
  const ev = s.ev;
  s.ev = [];
  const b = s.bomb;
  return {
    b: b ? { i: b.index, left: Math.round(b.left * 10) / 10, limit: b.limit, k: b.strikes, m: b.modules.map((m) => [m.kind, m.done ? 1 : 0]) } : null,
    // who has the bomb — or, between bombs, who gets the next one
    d: (b ? s.defuser : defuserOf(s)) ?? null, pz: b ? 0 : Math.max(0, Math.round(s.pause * 10) / 10), last: s.last,
    sc: s.score, df: s.defused, ex: s.exploded, goal: s.goal, solo: present(s).length <= 1 ? 1 : 0,
    e: ev,
  };
}

// The defuser only: the bomb itself.
export function secret(s) {
  const b = s.bomb;
  if (!b || s.defuser == null) return null;
  return {
    to: s.defuser,
    data: {
      i: b.index, serial: b.serial, batteries: b.batteries,
      m: b.modules.map((m) => {
        if (m.kind === "wires") return { kind: m.kind, colours: m.colours, cut: m.cut, done: m.done };
        if (m.kind === "button") return { kind: m.kind, colour: m.colour, label: m.label, done: m.done };
        if (m.kind === "keypad") return { kind: m.kind, symbols: m.symbols, pressed: m.pressed, done: m.done };
        return { kind: m.kind, flash: m.seq.slice(0, Math.min(m.stage, m.seq.length)), at: m.at, done: m.done };
      }),
    },
  };
}

export function init(s) { return { goal: s.goal }; }
export function summary(s) { return { defused: s.defused, exploded: s.exploded, goal: s.goal, solved: s.solved }; }
