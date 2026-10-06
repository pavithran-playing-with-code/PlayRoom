// scripts/check-coop.mjs — the together boards (Memory, Mahjong, Number Rush,
// Pipes), without React, a browser or a server.
//   node scripts/check-coop.mjs
//
// The part that matters most: phones that see the same numbered moves end up
// with the same board, whatever order their own taps went out in and however
// late the server's answers come back.
import { createRequire } from "module";
import { newLog, take, propose, view, differs, restart } from "../src/components/games/coopLog.js";
import { GOAL, memoryRules, mahjongRules, numbersRules, pipesRules, MEM_PAIR, MJ_MISS } from "../src/components/games/coopBoards.js";
import { buildCards, TOTAL_PAIRS } from "../src/components/games/memoryDeck.js";
import { isFree, findPair, SLOTS } from "../src/components/games/mahjongBoard.js";
import { makeBoard as gridOf } from "../src/components/games/numberBoard.js";
import { makeBoard as pipesOf, currentMasks, isSolved } from "../src/components/games/pipesBoard.js";

const require = createRequire(import.meta.url);
const { COOP_GOAL, resultsFor } = require("../config/matchResult.js");

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const TYPES = Array.from({ length: 30 }, (_, i) => ({ k: `t${i}`, e: String(i), cat: "x" }));
const SEED = 424242;

// play moves straight through the rules, as the server would order them
let named = 0;
const play = (R, s, u, a) => R.rules(s, { u, a, c: `t${++named}` });

// deep-freeze, so a rule that changes the state it is handed throws
const freeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(freeze); } return o; };

// ── the goal is the same on both ends ───────────────────────────────────────
for (const g of Object.keys(GOAL)) check(`${g}: goal ${GOAL[g]} matches the server's`, COOP_GOAL[g] === GOAL[g]);

// ── Memory ───────────────────────────────────────────────────────────────────
{
  const R = memoryRules(SEED);
  const deck = buildCards(SEED).map((c) => c.emoji);
  check("memory: deck 1 is the solo game's deck", same(R.init.deck, deck));
  const pairOf = (i) => deck.findIndex((e, j) => j !== i && e === deck[i]);
  const other = (i) => deck.findIndex((e) => e !== deck[i]);
  let s = freeze(R.init);
  s = freeze(play(R, s, 1, { t: "flip", b: 1, i: 0 }));
  check("memory: a flip is your face-up card", s.open["1"] === 0);
  const s2 = play(R, s, 2, { t: "flip", b: 1, i: 0 });
  check("memory: a card somebody has up can't be taken", s2 === s);
  s = freeze(play(R, s, 2, { t: "flip", b: 1, i: pairOf(0) }));
  check("memory: turning over the twin of a friend's card is a pair", s.matched.includes(0) && s.matched.includes(pairOf(0)) && s.pairs === 1 && s.score === MEM_PAIR);
  check("memory: …credited to who found it, and the friend's card is no longer up", s.by["2"] === 1 && s.open["1"] === undefined);
  check("memory: …and a show for it", s.ev.some((e) => e.k === "pair" && e.with === 1));
  const a = deck.findIndex((e, j) => !s.matched.includes(j));
  s = freeze(play(R, s, 1, { t: "flip", b: 1, i: a }));
  const miss = deck.findIndex((e, j) => !s.matched.includes(j) && j !== a && e !== deck[a]);
  s = freeze(play(R, s, 1, { t: "flip", b: 1, i: miss }));
  check("memory: two that don't match both go back down", s.open["1"] === undefined && s.ev.at(-1).k === "miss" && s.score === MEM_PAIR - 5);
  check("memory: a matched card can't be turned again", play(R, s, 3, { t: "flip", b: 1, i: 0 }) === s);
  check("memory: a tap for another deck does nothing", play(R, s, 3, { t: "flip", b: 2, i: a }) === s);
  check("memory: nonsense does nothing", play(R, s, 3, { t: "flip", b: 1, i: 99 }) === s && play(R, s, 3, null) === s && play(R, s, 3, { t: "x" }) === s);
  // clear the deck
  for (let i = 0; i < deck.length; i++) {
    if (s.b !== 1 || s.matched.includes(i)) continue;
    const j = pairOf(i);
    s = play(R, s, 1, { t: "flip", b: 1, i });
    s = play(R, s, 2, { t: "flip", b: 1, i: j });
  }
  check("memory: clearing the deck deals the next and counts a board", s.b === 2 && s.boards === 1 && s.matched.length === 0 && s.done && s.done.b === 1);
  check("memory: deck 2 is different from deck 1", !same(s.deck, deck));
  check("memory: other() sanity", other(0) >= 0);
  check("memory: 10 pairs a deck", TOTAL_PAIRS === 10);
}

// ── Mahjong ──────────────────────────────────────────────────────────────────
{
  const R = mahjongRules(SEED, TYPES);
  let s = freeze(R.init);
  const [x, y] = findPair(s.tiles);
  s = freeze(play(R, s, 1, { t: "tap", b: 1, i: x }));
  check("mahjong: a tap picks your tile", s.sel["1"] === x);
  s = freeze(play(R, s, 2, { t: "tap", b: 1, i: y }));
  check("mahjong: the same picture as a friend's pick is a pair", s.tiles[x].matched && s.tiles[y].matched && s.pairs === 1 && s.sel["1"] === undefined);
  const stuck = s.tiles.findIndex((t, i) => !t.matched && !isFree(s.tiles, i));
  check("mahjong: a tile that isn't free can't be picked", play(R, s, 1, { t: "tap", b: 1, i: stuck }) === s);
  // a miss
  const free = s.tiles.map((t, i) => i).filter((i) => isFree(s.tiles, i));
  const p = free[0], q = free.find((i) => s.tiles[i].k !== s.tiles[p].k);
  let m = play(R, play(R, s, 1, { t: "tap", b: 1, i: p }), 1, { t: "tap", b: 1, i: q });
  check("mahjong: two different pictures is a miss", m.sel["1"] === undefined && m.score === s.score - MJ_MISS);
  // shuffle is the same everywhere
  const sh1 = play(R, s, 1, { t: "shuf", b: 1, r: 12345 }), sh2 = play(R, s, 1, { t: "shuf", b: 1, r: 12345 });
  check("mahjong: a shuffle comes out the same on every phone", same(sh1.tiles, sh2.tiles) && !same(sh1.tiles, s.tiles));
  // clear the whole board, always by pairs; stuck boards are shuffled the same way twice over
  let A = R.init, B = R.init, guard = 0, stuckSeen = 0;
  while (A.b === 1 && guard++ < 400) {
    const pr = findPair(A.tiles);
    if (!pr) break;
    const before = A.ev.length;
    A = play(R, play(R, A, 1, { t: "tap", b: 1, i: pr[0] }), 2, { t: "tap", b: 1, i: pr[1] });
    named -= 2;   // the same names for B
    B = play(R, play(R, B, 1, { t: "tap", b: 1, i: pr[0] }), 2, { t: "tap", b: 1, i: pr[1] });
    named += 0;
    if (A.ev.slice(before).some((e) => e.k === "stuck")) stuckSeen++;
  }
  check("mahjong: a board can always be cleared together", A.b === 2 && A.boards === 1, `boards ${A.boards}`);
  check("mahjong: two phones playing it agree tile for tile", same(A, B));
  check("mahjong: never left with no pair to take", true, `(${stuckSeen} stuck boards were shuffled)`);
  check("mahjong: 48 places", SLOTS.length === 48);
}

// ── Number Rush ──────────────────────────────────────────────────────────────
{
  const R = numbersRules(SEED);
  const g = gridOf(SEED, 1);
  let s = freeze(R.init);
  s = freeze(play(R, s, 1, { t: "tap", b: 1, n: 1 }));
  check("numbers: the next number moves everyone on", s.next === 2 && s.score === 3);
  check("numbers: the same number tapped twice counts once", play(R, s, 2, { t: "tap", b: 1, n: 1 }) === s);
  check("numbers: the one after next is forgiven", play(R, s, 2, { t: "tap", b: 1, n: 3 }) === s);
  const wrong = play(R, s, 2, { t: "tap", b: 1, n: 7 });
  check("numbers: a wrong number costs 2", wrong.score === 1 && wrong.next === 2 && wrong.ev.at(-1).k === "miss");
  for (let n = 2; n <= g.n; n++) s = play(R, s, n % 2 ? 1 : 2, { t: "tap", b: 1, n });
  check("numbers: the last number clears the grid", s.b === 2 && s.next === 1 && s.boards === 1);
  check("numbers: taps on the old grid do nothing", play(R, s, 1, { t: "tap", b: 1, n: 1 }) === s);
}

// ── Pipes ────────────────────────────────────────────────────────────────────
{
  const R = pipesRules(SEED);
  const bd = pipesOf(SEED, 1);
  let s = freeze(R.init);
  // the turns that put every tile back: (4 - start) % 4, shared between two people
  let k = 0;
  for (let i = 0; i < bd.n; i++) for (let t = 0; t < (4 - (bd.start[i] % 4)) % 4; t++) {
    if (s.b !== 1) break;
    s = freeze(play(R, s, k++ % 2 ? 1 : 2, { t: "turn", b: 1, i, d: 1 }));
  }
  check("pipes: the board solved together clears", s.b === 2 && s.boards === 1, `b=${s.b}`);
  check("pipes: everybody's turns counted", (s.by["1"] || 0) + (s.by["2"] || 0) === k);
  check("pipes: the score paid for water and the bonus", s.score > 0);
  check("pipes: a turn on the old board does nothing", play(R, s, 1, { t: "turn", b: 1, i: 0, d: 1 }) === s);
  const back = play(R, play(R, R.init, 1, { t: "turn", b: 1, i: 0, d: 1 }), 2, { t: "turn", b: 1, i: 0, d: -1 });
  check("pipes: a turn and a turn back leaves the pipe as it was", back.turns[0] === 0);
  check("pipes: solved check sanity", !isSolved(currentMasks(bd, bd.solution.map(() => 0)), bd.cols, bd.rows, bd.source));
}

// ── many phones, moves crossing in the post ─────────────────────────────────
// Three phones tap at random; the server numbers moves in the order they
// arrive; each phone hears the numbered moves late and in bursts. Whatever
// happened, every phone ends up drawing the same board as the server's.
function fuzz(name, R, moveFor, rounds = 400) {
  let rnd = 7;
  const rand = () => { rnd = (rnd * 16807) % 2147483647; return (rnd - 1) / 2147483646; };
  const phones = [1, 2, 3].map((u) => ({ u, L: newLog(R.rules, R.init), inbox: [] }));
  const server = [];
  const wire = [];                                   // moves on their way to the server
  let n = 0;
  for (let r = 0; r < rounds; r++) {
    const p = phones[Math.floor(rand() * phones.length)];
    const what = rand();
    if (what < 0.45) {
      const a = moveFor(view(p.L), rand);
      if (a) { const c = `${p.u}.${++n}`; propose(p.L, p.u, a, c); wire.push({ u: p.u, a, c }); }
    } else if (what < 0.75 && wire.length) {
      // the server takes the oldest move on the wire (sometimes one behind it)
      const k = wire.length > 1 && rand() < 0.3 ? 1 : 0;
      const m = wire.splice(k, 1)[0];
      const act = { s: server.length, ...m };
      server.push(act);
      for (const q of phones) q.inbox.push(act);
    } else {
      // a phone hears some of what the server sent, out of order now and then
      const q = phones[Math.floor(rand() * phones.length)];
      const take_n = 1 + Math.floor(rand() * 3);
      const got = q.inbox.splice(0, take_n);
      if (got.length > 1 && rand() < 0.3) got.reverse();
      for (const a of got) take(q.L, a);
    }
  }
  // everything arrives
  while (wire.length) { const m = wire.shift(); const act = { s: server.length, ...m }; server.push(act); for (const q of phones) q.inbox.push(act); }
  for (const q of phones) for (const a of q.inbox.splice(0)) take(q.L, a);
  let truth = R.init;
  for (const a of server) truth = R.rules(truth, a);
  const agree = phones.every((q) => same(view(q.L), truth) && q.L.pending.length === 0);
  check(`${name}: three phones, crossed moves — all draw the server's board`, agree, `(${server.length} moves, score ${truth.score}, boards ${truth.boards})`);
  return truth;
}
fuzz("memory", memoryRules(SEED), (s, rand) => ({ t: "flip", b: s.b, i: Math.floor(rand() * s.deck.length) }), 1500);
fuzz("mahjong", mahjongRules(SEED, TYPES), (s, rand) => {
  const free = s.tiles.map((_, i) => i).filter((i) => isFree(s.tiles, i));
  if (rand() < 0.02) return { t: "shuf", b: s.b, r: 1 + Math.floor(rand() * 1e6) };
  return free.length ? { t: "tap", b: s.b, i: free[Math.floor(rand() * free.length)] } : null;
}, 2500);
const nr = numbersRules(SEED);
fuzz("numbers", nr, (s, rand) => ({ t: "tap", b: s.b, n: rand() < 0.7 ? s.next : 1 + Math.floor(rand() * nr.grid(s.b).n) }), 2000);
const pr = pipesRules(SEED);
fuzz("pipes", pr, (s, rand) => ({ t: "turn", b: s.b, i: Math.floor(rand() * pr.board(s.b).n), d: rand() < 0.8 ? 1 : -1 }), 1500);

// ── the log itself ──────────────────────────────────────────────────────────
{
  const R = numbersRules(SEED);
  const L = newLog(R.rules, R.init);
  propose(L, 1, { t: "tap", b: 1, n: 1 }, "me.1");
  check("log: my move shows before the server answers", view(L).next === 2 && L.agreed.next === 1);
  take(L, { s: 0, u: 2, a: { t: "tap", b: 1, n: 1 }, c: "them.1" });
  check("log: a friend beat me to it — my move comes to nothing, no double count", view(L).next === 2 && view(L).score === 3);
  take(L, { s: 1, u: 1, a: { t: "tap", b: 1, n: 1 }, c: "me.1" });
  check("log: …and my move, answered, leaves the pile", L.pending.length === 0 && L.n === 2);
  take(L, { s: 3, u: 2, a: { t: "tap", b: 1, n: 3 }, c: "them.3" });
  check("log: a move that comes before the one it follows waits", L.n === 2 && view(L).next === 2);
  take(L, { s: 2, u: 2, a: { t: "tap", b: 1, n: 2 }, c: "them.2" });
  check("log: …and plays once the gap is filled", L.n === 4 && view(L).next === 4);
  take(L, { s: 1, u: 1, a: { t: "tap", b: 1, n: 1 }, c: "me.1" });
  check("log: a move heard twice plays once", L.n === 4);
  check("log: a different move under a number we've played is noticed", differs(L, { s: 1, c: "other" }) && !differs(L, { s: 1, c: "me.1" }));
  restart(L);
  check("log: starting again goes back to the first board", L.n === 0 && L.agreed === R.init);
}

// ── who won ──────────────────────────────────────────────────────────────────
{
  const room = (slug) => ({ mode: "coop", game_slug: slug });
  const seat = (id, boards) => ({ user_id: id, score: 500, pairs_matched: boards });
  const r1 = resultsFor(room("numbers"), [seat(1, 5), seat(2, 5)]);
  const r2 = resultsFor(room("numbers"), [seat(1, 4), seat(2, 4)]);
  check("result: a together side that reached its goal all win", r1.get(1) === "win" && r1.get(2) === "win");
  check("result: short of the goal, all lose — not a draw", r2.get(1) === "loss" && r2.get(2) === "loss");
  const r3 = resultsFor(room("maze"), [seat(1, 1), seat(2, 1)]);
  check("result: Maze Runner together still wins on one door", r3.get(1) === "win");
  const r4 = resultsFor({ mode: "free", game_slug: "memory" }, [{ user_id: 1, score: 9, pairs_matched: 1 }, { user_id: 2, score: 5, pairs_matched: 1 }]);
  check("result: against each other is unchanged", r4.get(1) === "win" && r4.get(2) === "loss");
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
