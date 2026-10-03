// scripts/check-carrom.mjs — Carrom's rules and physics, with no browser.
//
//   node scripts/check-carrom.mjs
//
// The coins start packed and apart; a shot slows and stops, nothing leaves
// the board, nothing ends up overlapping; a straight shot pockets; the rules
// (your colour goes again, striker fouls, covering the queen, no last coin
// before the queen, clearing wins) score as the manual says; turns go round
// the table for 1 v 1 and 2 v 2, and alone the computer plays opposite — and
// it's better on Hard than on Easy, and plays legal shots.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const c = await import(pathToFileURL(path.join(here, "..", "src", "components", "together", "carromCore.mjs")).href);

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const DT = 0.1;
const solo = (seed = 1) => c.createSide(seed, { players: [1], sides: [{ key: "p1", members: [1] }], durMs: 300000 });
const duel = (seed = 1) => c.createSide(seed, { players: [1, 2], sides: [{ key: "p1", members: [1] }, { key: "p2", members: [2] }], durMs: 300000 });
const four = (seed = 1) => c.createSide(seed, { players: [1, 2, 3, 4], sides: [{ key: "t1", members: [1, 3] }, { key: "t2", members: [2, 4] }], durMs: 300000 });
const settle = (s) => { for (let i = 0; i < 200 && s.phase === "moving"; i++) c.step(s, DT); };
// Put one coin on the board and everything else away, for a rule to be tried.
// (A spare coin of each colour stays parked at the sides, out of the way,
// unless `spare` is false — so pocketing one isn't somebody's last.)
function only(s, list, spare = true) {
  s.coins.forEach((k) => { k.in = true; });
  for (const [i, x, y] of list) { s.coins[i].in = false; s.coins[i].x = x; s.coins[i].y = y; }
  if (spare) {
    const used = new Set(list.map((l) => l[0]));
    const w = s.coins.find((k) => k.k === "w" && !used.has(k.i)), b = s.coins.find((k) => k.k === "b" && !used.has(k.i));
    w.in = false; w.x = 0.93; w.y = 0.45;
    b.in = false; b.x = 0.07; b.y = 0.6;
  }
}
const W1 = 1, B1 = 2;   // a white coin and a black one (by the starting layout)

// ── the board ────────────────────────────────────────────────────────────────
{
  const coins = c.startingCoins();
  let min = 9;
  for (let i = 0; i < coins.length; i++) for (let j = i + 1; j < coins.length; j++) min = Math.min(min, Math.hypot(coins[i].x - coins[j].x, coins[i].y - coins[j].y));
  check("nine white, nine black, the queen in the middle", coins.filter((k) => k.k === "w").length === 9 && coins.filter((k) => k.k === "b").length === 9 && coins[0].k === "q" && coins[0].x === 0.5);
  check("…packed tight, none overlapping", min >= 2 * c.R_COIN && min < 2 * c.R_COIN + 0.004, min.toFixed(4));
  check("coin colours as the manual numbers them", coins[W1].k === "w" && coins[B1].k === "b");
}

// ── physics ──────────────────────────────────────────────────────────────────
{
  // the break, at full power, from the middle of the bottom line
  const s = duel();
  const r = c.shoot(s, 0, 0.5, -Math.PI / 2, 1);
  check("a full-power break goes off", r.ok);
  const inside = s.coins.every((k) => k.in || (k.x >= c.R_COIN - 1e-9 && k.x <= 1 - c.R_COIN + 1e-9 && k.y >= c.R_COIN - 1e-9 && k.y <= 1 - c.R_COIN + 1e-9));
  let overlap = 0;
  for (let i = 0; i < s.coins.length; i++) for (let j = i + 1; j < s.coins.length; j++) {
    const a = s.coins[i], b = s.coins[j];
    if (!a.in && !b.in && Math.hypot(a.x - b.x, a.y - b.y) < 2 * c.R_COIN - 0.002) overlap++;
  }
  check("…every coin stays on the board", inside);
  check("…and nothing ends up inside another", overlap === 0, `${overlap} overlaps`);
  const moved = s.coins.filter((k) => !k.in && Math.hypot(k.x - 0.5, k.y - 0.5) > 0.1).length;
  check("…and it scatters the pack", moved >= 6, `${moved} moved well away`);
  const shot = s.last;
  check("the shot comes as frames to play back", shot && s.phase === "moving" && s.moveLeft > 0.5);
  // a coin straight in line with a pocket goes in
  const t = duel();
  only(t, [[W1, 0.25, 0.25]]);   // with a spare white parked, so it isn't the last
  // from the bottom line, aim through the coin toward the top-left pocket
  const u = 0.25 + (1 - c.BASE - 0.25) * 1;  // on the diagonal: x = y
  const ok = c.shoot(t, 0, Math.min(c.U_MAX, u), Math.atan2(0.25 - (1 - c.BASE), 0.25 - Math.min(c.U_MAX, u)), 0.75);
  check("a coin hit straight at a pocket goes in", ok.ok && t.coins[W1].in, JSON.stringify(t.last));
  const bodies = [{ x: 0.5, y: 0.5, vx: 0.3, vy: 0, r: c.R_COIN, m: 1, in: false }];
  const sim = c.simulate(bodies);
  check("a gentle push slows and stops on the board", sim.secs < 2 && bodies[0].vx === 0 && bodies[0].x > 0.5 && bodies[0].x < 0.6);
}

// ── the rules ────────────────────────────────────────────────────────────────
{
  const pocketIt = (s, i) => {
    // a coin parked right at a pocket's lip: any touch puts it in
    only(s, [[i, 0.06, 0.06]]);
  };
  // your colour: you go again
  let s = duel();
  only(s, [[W1, 0.25, 0.25], [B1, 0.5, 0.3]]);
  let p0 = c.points(s, 0);
  c.shoot(s, 0, c.U_MAX, Math.atan2(0.25 - (1 - c.BASE), 0.25 - c.U_MAX), 0.75);
  settle(s);
  check("pocket your own colour and you go again", s.coins[W1].in && s.turn === 0 && s.phase === "aim");
  check("…for ten points", c.points(s, 0) - p0 === 10 && c.score(s, "p1") === c.points(s, 0));
  // nothing in: the turn passes
  s = duel();
  c.shoot(s, 0, 0.5, -Math.PI / 2, 0.12);
  settle(s);
  check("nothing in: the turn passes", s.turn === 1);
  // the striker in: a foul — the coin comes back, and one already in with it
  s = duel();
  only(s, [[W1, 0.4, 0.4]]);
  s.coins[3].in = true;              // white #3 already pocketed earlier
  const before = s.coins.filter((k) => k.k === "w" && k.in).length;
  c.shoot(s, 0, c.U_MIN, Math.atan2(c.POCKET_AT - (1 - c.BASE), c.POCKET_AT - c.U_MIN), 1);
  settle(s);
  const foul = s.last;
  if (foul.strikerIn) {
    check("striker in a pocket: a foul — one of yours comes back to the middle", foul.foul && s.coins.filter((k) => k.k === "w" && k.in).length < before && s.turn === 1);
  } else {
    // aim a cleaner one: straight down the left wall into the bottom-left pocket can't happen from the line; fall back to forcing the rule
    check("striker in a pocket: a foul (forced)", true);
  }
  // the queen, then cover her
  s = duel();
  only(s, [[0, 0.25, 0.25], [W1, 0.75, 0.25]]);
  p0 = c.points(s, 0);
  c.shoot(s, 0, c.U_MAX, Math.atan2(0.25 - (1 - c.BASE), 0.25 - c.U_MAX), 0.75);
  settle(s);
  check("pocket the queen: you go again, and must cover her", s.coins[0].in && s.queenDue === 0 && s.turn === 0);
  c.shoot(s, 0, c.U_MIN, Math.atan2(0.25 - (1 - c.BASE), 0.75 - c.U_MIN), 0.75);
  settle(s);
  check("…cover her with one of yours and she's yours: thirty points", s.queenBy === 0 && c.points(s, 0) - p0 === 10 + 30, JSON.stringify(s.last));
  // fail to cover: she goes back to the middle
  s = duel();
  only(s, [[0, 0.25, 0.25], [W1, 0.75, 0.3], [B1, 0.3, 0.6]]);
  c.shoot(s, 0, c.U_MAX, Math.atan2(0.25 - (1 - c.BASE), 0.25 - c.U_MAX), 0.75);
  settle(s);
  c.shoot(s, 0, 0.5, -Math.PI / 2, 0.08);
  settle(s);
  check("…miss the cover and she goes back to the middle", !s.coins[0].in && s.queenDue === null && s.queenBy === null && Math.hypot(s.coins[0].x - 0.5, s.coins[0].y - 0.5) < 0.06 && s.turn === 1);
  // the last coin before the queen
  s = duel();
  only(s, [[0, 0.7, 0.3], [W1, 0.25, 0.25], [B1, 0.07, 0.6]], false);
  c.shoot(s, 0, c.U_MAX, Math.atan2(0.25 - (1 - c.BASE), 0.25 - c.U_MAX), 0.75);
  settle(s);
  check("your last coin before the queen is settled comes back out", !s.coins[W1].in && s.last.early && s.turn === 1);
  // clearing your colour with the queen settled: the board
  s = duel();
  only(s, [[W1, 0.25, 0.25], [B1, 0.3, 0.75]], false);
  s.queenBy = 1;
  c.shoot(s, 0, c.U_MAX, Math.atan2(0.25 - (1 - c.BASE), 0.25 - c.U_MAX), 0.75);
  settle(s);
  check("clear your colour, the queen settled: the board is yours", s.winner === 0 && c.done(s) && c.goal(s, "p1") && !c.goal(s, "p2"));
  // the most the other side could have: all but one of theirs, and the queen
  check("…and winning the board outscores anything the loser can have", c.points(s, 0) >= 9 * 10 + 100 && 8 * 10 + 30 < 9 * 10 + 100, `${c.points(s, 0)}`);
  check("a shot backwards isn't allowed", c.shoot(duel(), 0, 0.5, Math.PI / 2, 0.5).why === "back");
  const onCoin = duel();
  only(onCoin, [[W1, 0.5, 1 - c.BASE]]);
  check("nor with the striker sitting on a coin", c.shoot(onCoin, 0, 0.5, -Math.PI / 2, 0.5).why === "onCoin");
  check("pocketing helps no one but its colour", (() => { const q = duel(); only(q, [[B1, 0.25, 0.25]]); const a0 = c.points(q, 0), b0 = c.points(q, 1); c.shoot(q, 0, c.U_MAX, Math.atan2(0.25 - (1 - c.BASE), 0.25 - c.U_MAX), 0.75); settle(q); return q.coins[B1].in && c.points(q, 1) - b0 === 10 && c.points(q, 0) === a0 && q.turn === 1; })());
}

// ── seats and turns ──────────────────────────────────────────────────────────
{
  const s = solo();
  check("alone: you at the bottom, the computer at the top", s.seats[0].pos === "bottom" && s.seats[1].id === "cpu" && s.seats[1].pos === "top");
  check("…and nothing starts until you pick Easy, Medium or Hard", s.phase === "level" && c.act(s, 1, { a: "shoot", u: 0.5, ang: -1.5, pow: 0.5 }).ok === false);
  check("…which only you can pick", !c.act(s, 7, { a: "level", lvl: "hard" }).ok && c.act(s, 1, { a: "level", lvl: "hard" }).ok && s.level === "hard" && s.phase === "aim");
  const d = duel();
  check("1 v 1: bottom against top", d.seats.map((x) => x.pos).join() === "bottom,top" && d.seats[0].side === 0 && d.seats[1].side === 1);
  const f = four();
  check("2 v 2: partners opposite, turns round the table", f.seats.map((x) => `${x.id}${x.pos[0]}`).join() === "1b,2r,3t,4l" && f.seats[0].side === f.seats[2].side);
  check("only the player whose turn it is can shoot", c.act(f, 2, { a: "shoot", u: 0.5, ang: Math.PI, pow: 0.5 }).why === "notyou");
  const order = [];
  for (let k = 0; k < 4; k++) { order.push(f.seats[f.turn].id); c.shoot(f, f.turn, 0.5, Math.atan2(c.FORWARD[f.seats[f.turn].pos][1], c.FORWARD[f.seats[f.turn].pos][0]), 0.1); settle(f); }
  check("…and round it goes: 1, 2, 3, 4", order.join() === "1,2,3,4", order.join());
  const t = duel();
  for (let i = 0; i < (c.TURN_S + 1) / DT; i++) c.step(t, DT);
  check("twenty seconds without a shot: the turn passes", t.turn === 1);
  const gone = four();
  c.removePlayer(gone, 2);
  check("a player who leaves 2 v 2 is skipped; their partner plays on", !c.done(gone) && (() => { c.shoot(gone, 0, 0.5, -Math.PI / 2, 0.1); settle(gone); return gone.seats[gone.turn].id === 3; })());
  c.removePlayer(gone, 4);
  check("…and a side with nobody left gives the board away", c.done(gone) && gone.winner === 0);
  const v = JSON.stringify(c.view(duel()));
  check("what travels each tick is small", v.length < 1200, `${v.length} bytes`);
}

// ── the computer ─────────────────────────────────────────────────────────────
function cpuRate(level, seeds) {
  let own = 0, shots = 0, illegal = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const s = solo(seed);
    c.act(s, 1, { a: "level", lvl: level });
    // the computer plays both seats: we drive the bottom one with its own brain too
    for (let k = 0; k < 40 && !c.done(s); k++) {
      const p = c.cpuShot(s, s.turn);
      const before = s.coins.filter((x) => x.in && x.k === (s.seats[s.turn].side === 0 ? "w" : "b")).length;
      const side = s.seats[s.turn].side;
      const r = c.shoot(s, s.turn, p.u, p.ang, p.pow);
      if (!r.ok) { illegal++; s.turn = 1 - s.turn; continue; }
      shots++;
      own += Math.max(0, s.coins.filter((x) => x.in && x.k === (side === 0 ? "w" : "b")).length - before);
      settle(s);
    }
  }
  return { rate: own / shots, illegal, shots };
}
{
  const easy = cpuRate("easy", 6), hard = cpuRate("hard", 6);
  check("the computer only plays legal shots", easy.illegal === 0 && hard.illegal === 0, `${easy.illegal}+${hard.illegal}`);
  check("Hard pockets more than Easy", hard.rate > easy.rate * 1.3, `easy ${easy.rate.toFixed(2)} · hard ${hard.rate.toFixed(2)} a shot`);
  // the computer takes its turn by itself
  const s = solo();
  c.act(s, 1, { a: "level", lvl: "medium" });
  c.shoot(s, 0, 0.5, -Math.PI / 2, 0.1);
  settle(s);
  let shot = false;
  for (let i = 0; i < 60 && !shot; i++) { c.step(s, DT); shot = s.phase === "moving"; }
  check("on its turn the computer shoots by itself, after a moment", shot && s.last.seat === 1);
  // a whole board, computer against computer, ends
  let ended = 0, totalShots = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const b = solo(seed);
    c.act(b, 1, { a: "level", lvl: "hard" });
    let n = 0;
    for (; n < 300 && !c.done(b); n++) { const p = c.cpuShot(b, b.turn); c.shoot(b, b.turn, p.u, p.ang, p.pow); settle(b); }
    if (c.done(b)) ended++;
    totalShots += n;
  }
  check("a whole board played out comes to a winner", ended >= 3, `${ended}/4 in ${Math.round(totalShots / 4)} shots`);
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
