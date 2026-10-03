// scripts/check-bomb.mjs — Bomb Squad's rules, with no browser.
//
//   node scripts/check-bomb.mjs
//
// Every bomb can be solved from the manual (each keypad has exactly one
// column); the answers follow the manual line by line; right answers defuse
// it and score, wrong ones strike, three strikes or the clock set it off;
// the next bomb comes either way and the next player defuses it; only the
// defuser touches the bomb, and only the defuser is told what's on it.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const b = await import(pathToFileURL(path.join(here, "..", "src", "components", "together", "bombCore.mjs")).href);

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const DT = 0.1;

// ── the bombs ────────────────────────────────────────────────────────────────
{
  let keypadsOk = true, wiresOk = true, firstHasWires = true, kinds = new Set(), same = true, counts = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    for (let i = 0; i < 9; i++) {
      const bomb = b.makeBomb(seed, i);
      if (JSON.stringify(bomb) !== JSON.stringify(b.makeBomb(seed, i))) same = false;
      counts.add(bomb.modules.length);
      if (i === 0 && !bomb.modules.some((m) => m.kind === "wires")) firstHasWires = false;
      for (const m of bomb.modules) {
        kinds.add(m.kind);
        if (m.kind === "keypad" && (!m.symbols || !b.keypadAnswer(m.symbols))) keypadsOk = false;
        if (m.kind === "wires" && (m.colours.length < 3 || m.colours.length > 6)) wiresOk = false;
      }
      if (!/^[A-Z0-9]{5}[0-9]$/.test(bomb.serial)) wiresOk = false;
    }
  }
  check("the same seed builds the same bombs", same);
  check("every keypad has exactly one column in the manual", keypadsOk);
  check("wires 3 to 6, a serial ending in a digit", wiresOk);
  check("the first bomb always has wires", firstHasWires);
  check("all four kinds of module turn up, two to four a bomb", kinds.size === 4 && counts.has(2) && counts.has(4), [...counts].join(","));
  const t0 = b.makeBomb(1, 0).limit, t6 = b.makeBomb(1, 6).limit;
  check("later bombs give less time per module", t6 / b.makeBomb(1, 6).modules.length < t0 / b.makeBomb(1, 0).modules.length);
}

// ── the manual, line by line ─────────────────────────────────────────────────
{
  const odd = { serial: "AB12C3" }, even = { serial: "AB12C4" };
  const W = (c, s = even) => b.wireAnswer(c, s);
  const cases = [
    [["blue", "white", "yellow"], even, 1, "3: no red → second"],
    [["red", "blue", "white"], even, 2, "3: last white → last"],
    [["blue", "red", "blue"], even, 2, "3: two blues → last blue"],
    [["blue", "blue", "red"], even, 1, "3: two blues, last red → last blue"],
    [["red", "yellow", "black"], even, 2, "3: otherwise → last"],
    [["red", "red", "blue", "white"], odd, 1, "4: two reds, odd → last red"],
    [["blue", "white", "black", "yellow"], even, 0, "4: last yellow, no red → first"],
    [["red", "blue", "black", "white"], even, 0, "4: one blue → first"],
    [["red", "yellow", "black", "yellow"], even, 3, "4: two yellows → last"],
    [["red", "white", "black", "white"], even, 1, "4: otherwise → second"],
    [["red", "blue", "white", "yellow", "black"], odd, 3, "5: last black, odd → fourth"],
    [["red", "yellow", "yellow", "white", "black"], even, 0, "5: one red, two yellows → first"],
    [["blue", "blue", "white", "white", "yellow"], even, 1, "5: no black → second"],
    [["blue", "black", "white", "white", "red"], even, 0, "5: otherwise → first"],
    [["red", "blue", "white", "black", "blue", "red"], odd, 2, "6: no yellow, odd → third"],
    [["red", "yellow", "white", "white", "blue", "red"], even, 3, "6: one yellow, two whites → fourth"],
    [["blue", "yellow", "yellow", "white", "black", "blue"], even, 5, "6: no red → last"],
    [["red", "yellow", "yellow", "white", "black", "blue"], even, 3, "6: otherwise → fourth"],
  ];
  const bad = cases.filter(([c, s, want]) => W(c, s) !== want).map((x) => x[3]);
  check("wires: every line of the manual", bad.length === 0, bad.join("; "));
  const B = (colour, label, batteries, serial = "BC12D4") => b.buttonAnswer({ colour, label }, { batteries, serial });
  const bcases = [
    [B("blue", "ABORT", 3), "hold"], [B("red", "DETONATE", 2), "press"], [B("white", "PRESS", 0, "AB12C4"), "hold"],
    [B("white", "PRESS", 3), "press"], [B("yellow", "PRESS", 1), "hold"], [B("red", "HOLD", 0), "press"], [B("blue", "PRESS", 0), "hold"],
  ];
  check("the button: every line of the manual", bcases.every(([got, want]) => got === want), JSON.stringify(bcases.map((x) => x[0])));
  check("the keypad: in the order down its column", b.keypadAnswer(["⚓", "⭐", "🎈", "🌙"]).join("") === "⭐🌙⚓🎈");
  check("Simon: the table, by vowel and strikes", b.simonWant({ serial: "AB1234" }, 0, "red") === "blue" && b.simonWant({ serial: "BC1234" }, 1, "green") === "yellow" && b.simonWant({ serial: "BC1234" }, 2, "red") === "yellow");
}

// ── playing a bomb ───────────────────────────────────────────────────────────
// The right move for module i of the side's bomb, as a player reading the manual would make it.
function rightMoves(s, i) {
  const bomb = s.bomb, m = bomb.modules[i];
  if (m.kind === "wires") return [{ a: "cut", m: i, i: b.wireAnswer(m.colours, bomb) }];
  if (m.kind === "keypad") return b.keypadAnswer(m.symbols).map((sym) => ({ a: "key", m: i, i: m.symbols.indexOf(sym) }));
  if (m.kind === "simon") {
    const out = [];
    for (let st = 1; st <= m.seq.length; st++) for (let k = 0; k < st; k++) out.push({ a: "simon", m: i, c: b.simonWant(bomb, bomb.strikes, m.seq[k]) });
    return out;
  }
  return [{ a: "button", m: i }];
}
function pressButton(s, pid, i) {
  const bomb = s.bomb, m = bomb.modules[i];
  b.act(s, pid, { a: "bdown", m: i });
  if (b.buttonAnswer(m, bomb) === "press") { b.step(s, 0.2); return b.act(s, pid, { a: "bup", m: i, shown: b.fmt(bomb.left) }); }
  const digit = b.STRIP_DIGIT[m.strip];
  b.step(s, b.TAP_S + 0.05);
  for (let g = 0; g < 400 && !b.fmt(bomb.left).includes(digit); g++) b.step(s, 0.1);
  return b.act(s, pid, { a: "bup", m: i, shown: b.fmt(bomb.left) });
}
function solveAll(s, pid) {
  const bomb = s.bomb;
  bomb.modules.forEach((m, i) => {
    if (m.done) return;
    for (const mv of rightMoves(s, i)) {
      if (mv.a === "button") pressButton(s, pid, i);
      else b.act(s, pid, mv);
      b.step(s, 0.5);
    }
  });
}
function untilBomb(s) { for (let g = 0; g < 200 && !s.bomb; g++) b.step(s, DT); }

{
  const s = b.createSide(42, { players: [1, 2, 3], durMs: 300000 });
  untilBomb(s);
  check("a bomb arrives, the first player defusing", !!s.bomb && s.defuser === 1);
  const v = JSON.stringify(b.view(s));
  check("what the side sees has no serial, wires or symbols", !v.includes(s.bomb.serial) && !/colours|symbols|serial/.test(v));
  const sec = b.secret(s);
  check("the bomb itself goes to the defuser only", sec.to === 1 && sec.data.serial === s.bomb.serial && sec.data.m.length === s.bomb.modules.length);
  check("someone else can't touch it", b.act(s, 2, { a: "cut", m: 0, i: 0 }).why === "notyou");
  solveAll(s, 1);
  check("solving every module from the manual defuses it", s.defused === 1 && !s.bomb && s.exploded === 0, `${s.score} points`);
  check("…and scores", s.score > 100);
  untilBomb(s);
  check("the next bomb comes, and the next player defuses it", s.bomb && s.bomb.index === 1 && s.defuser === 2);
  // three wrong moves
  const before = s.score;
  const wires = s.bomb.modules.findIndex((m) => m.kind === "wires");
  const mi = wires >= 0 ? wires : 0;
  let strikes = 0;
  for (let k = 0; k < 6 && s.bomb && s.bomb.index === 1; k++) {
    const m = s.bomb.modules[mi];
    const r = m.kind === "wires"
      ? b.act(s, 2, { a: "cut", m: mi, i: [0, 1, 2, 3, 4, 5].find((x) => x < m.colours.length && x !== b.wireAnswer(m.colours, s.bomb) && !m.cut.includes(x)) })
      : m.kind === "keypad" ? b.act(s, 2, { a: "key", m: mi, i: m.symbols.indexOf(b.keypadAnswer(m.symbols)[3]) })
      : b.act(s, 2, { a: "simon", m: mi, c: ["red", "blue", "green", "yellow"].find((c) => c !== b.simonWant(s.bomb, s.bomb.strikes, m.seq[0])) });
    if (!r.ok) strikes++;
  }
  check("three mistakes set it off", s.exploded === 1 && !s.bomb && strikes === 3);
  check("…and cost nothing already scored", s.score === before);
  untilBomb(s);
  check("then the next bomb, the next player", s.bomb && s.defuser === 3);
  for (let g = 0; g < 4000 && s.bomb && s.bomb.index === 2; g++) b.step(s, DT);
  check("the clock running out sets it off too", s.exploded === 2 && s.last.why === "time");
  // a hold with the wrong timing, and a forged timer
  const s2 = b.createSide(7, { players: [1], durMs: 300000 });
  let found = null;
  for (let tries = 0; tries < 40 && !found; tries++) {
    untilBomb(s2);
    const i = s2.bomb.modules.findIndex((m) => m.kind === "button" && b.buttonAnswer(m, s2.bomb) === "hold");
    if (i >= 0) found = i; else { s2.bomb.left = 0; b.step(s2, DT); }
  }
  check("there is a hold-the-button bomb to try", found !== null);
  if (found !== null) {
    const m = s2.bomb.modules[found], digit = b.STRIP_DIGIT[m.strip];
    b.act(s2, 1, { a: "bdown", m: found });
    b.step(s2, 0.1);
    const tapped = b.act(s2, 1, { a: "bup", m: found, shown: b.fmt(s2.bomb.left) });
    check("a button to hold, only tapped: a strike", !tapped.ok && tapped.why === "tapped");
    b.act(s2, 1, { a: "bdown", m: found });
    b.step(s2, 1);
    for (let g = 0; g < 400 && b.fmt(s2.bomb.left).includes(digit); g++) b.step(s2, 0.1);
    const fake = `9:${digit}${digit}`;
    const forged = b.act(s2, 1, { a: "bup", m: found, shown: fake });
    check("let go on the wrong digit, claiming a far-off timer: still a strike", !forged.ok && forged.why === "timing");
  }
}

// ── a whole match ────────────────────────────────────────────────────────────
{
  let defused = 0, goals = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = b.createSide(seed, { players: [1], durMs: 180000 });
    // a careful solo player: a few seconds to read each module, then right
    for (let t = 0; t < 180; t += DT) {
      b.step(s, DT);
      if (s.bomb && s.t % 6 < DT) {
        const i = s.bomb.modules.findIndex((m) => !m.done);
        if (i >= 0) {
          for (const mv of rightMoves(s, i)) { if (!s.bomb) break; if (mv.a === "button") pressButton(s, 1, i); else b.act(s, 1, mv); }
        }
      }
    }
    defused += s.defused;
    if (b.goal(s)) goals++;
  }
  check("a careful solo player defuses bombs and reaches the goal", goals === 20, `${(defused / 20).toFixed(1)} bombs in 3 minutes`);
  const s = b.createSide(5, { players: [1, 2], durMs: 120000 });
  untilBomb(s);
  b.removePlayer(s, 1);
  check("the defuser leaves: the bomb is handed on", s.defuser === 2);
  check("the goal grows with the match", b.goalFor(120) === 1 && b.goalFor(300) === 2);
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
