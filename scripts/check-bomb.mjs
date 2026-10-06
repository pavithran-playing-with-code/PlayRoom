// scripts/check-bomb.mjs — Bomb Blast's rules, with no browser.
//
//   node scripts/check-bomb.mjs
//
// The arena is a grid of pillars with bricks between, every start has room
// to move; bombers walk the lanes and turn corners, can step off their own
// bomb but not back on; a bomb burns a + that stops at pillars and the first
// brick, breaks it (power-ups under some), sets off other bombs, and knocks
// out whoever's in it — the bomber too, but not a partner; last side standing
// wins the round, then a fresh arena; the arena closes in late on; solo is
// against three computer bombers once a level is picked, a friends match is
// only the people in the room; and the computer bombers play a decent game.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const B = await import(pathToFileURL(path.join(here, "..", "src", "components", "together", "bombCore.mjs")).href);

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const DT = 0.1;
const { W, H, idx, FLOOR, SOLID, BRICK } = B;
const solo = (seed = 1) => B.createSide(seed, { players: [1], sides: [{ key: "p1", members: [1] }], durMs: 300000, mode: "free" });
const duel = (seed = 1) => B.createSide(seed, { players: [1, 2], sides: [{ key: "p1", members: [1] }, { key: "p2", members: [2] }], durMs: 300000, mode: "free" });
const teams = (seed = 1) => B.createSide(seed, { players: [1, 2, 3, 4], sides: [{ key: "t1", members: [1, 3] }, { key: "t2", members: [2, 4] }], durMs: 300000, mode: "teams" });
const coop = (seed = 1) => B.createSide(seed, { players: [1, 2], sides: [{ key: "all", members: [1, 2] }], durMs: 300000, mode: "coop" });
const body = (s, id) => s.bodies.find((b) => b.id === id);
// Clear the arena to floor (pillars kept), for a rule to be tried on its own.
function empty(s) { for (let k = 0; k < W * H; k++) if (s.g[k] === BRICK) s.g[k] = FLOOR; s.hidden = new Map(); s.pow = new Map(); }
const put = (b, x, y) => { b.x = x + 0.5; b.y = y + 0.5; };
const run = (s, secs) => { for (let t = 0; t < secs; t += DT) B.step(s, DT); };

// ── the arena ────────────────────────────────────────────────────────────────
{
  const s = duel(5);
  let pillars = true;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1, post = x % 2 === 0 && y % 2 === 0;
    if ((edge || post) !== (s.g[idx(x, y)] === SOLID)) pillars = false;
  }
  check("walls round the edge, a pillar on every other crossing", pillars);
  const bricks = [...s.g].filter((c) => c === BRICK).length;
  check("…bricks fill most of the rest", bricks > 40, `${bricks} bricks`);
  let roomy = true;
  for (let seed = 1; seed <= 50; seed++) {
    const a = B.buildArena(seed, 1, B.SPAWNS);
    for (const [x, y] of B.SPAWNS) {
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => a.g[idx(x + dx, y + dy)] === FLOOR).length;
      if (a.g[idx(x, y)] !== FLOOR || open < 2) roomy = false;
    }
  }
  check("every start has room to move and hide", roomy);
  check("the same seed and round, the same arena; a new round, a new one", B.buildArena(9, 2, B.SPAWNS).g.join() === B.buildArena(9, 2, B.SPAWNS).g.join() && B.buildArena(9, 2, B.SPAWNS).g.join() !== B.buildArena(9, 3, B.SPAWNS).g.join());
  check("some bricks hide power-ups", B.buildArena(3, 1, B.SPAWNS).hidden.size > 5);
}

// ── walking ──────────────────────────────────────────────────────────────────
{
  const s = duel(); empty(s);
  const b = body(s, 1);
  const open = (tx, ty) => B.inside(tx, ty) && s.g[idx(tx, ty)] === FLOOR;
  put(b, 1, 1);
  for (let i = 0; i < 20; i++) B.moveBody(open, b, 1, 0, 0.1);
  check("walks along a lane", Math.abs(b.x - 3.5) < 1e-6 && b.y === 1.5);
  put(b, 1, 1);
  for (let i = 0; i < 20; i++) B.moveBody(open, b, 0, 1, 0.1);
  check("down the edge lane too", Math.abs(b.y - 3.5) < 1e-6);
  put(b, 2.95, 1); b.x = 2.9;                   // a little before the crossing at x=3
  for (let i = 0; i < 10; i++) B.moveBody(open, b, 0, 1, 0.1);
  check("turns a corner: slides into the lane, then goes down it", Math.abs(b.x - 3.5) < 1e-6 && b.y > 1.6, `${b.x.toFixed(2)},${b.y.toFixed(2)}`);
  put(b, 1, 2);
  B.moveBody(open, b, 1, 0, 0.6);
  check("can't walk into a pillar (2,2)", Math.abs(b.x - 1.5) < 1e-6, `${b.x.toFixed(2)}`);
  s.g[idx(2, 1)] = BRICK;
  put(b, 1, 1);
  for (let i = 0; i < 10; i++) B.moveBody(open, b, 1, 0, 0.1);
  check("nor through a brick", Math.abs(b.x - 1.5) < 1e-6);
}

// ── bombs ────────────────────────────────────────────────────────────────────
{
  const s = duel(); empty(s);
  const a = body(s, 1), o = body(s, 2);
  put(a, 1, 1); put(o, 9, 11);
  check("drop a bomb where you stand", B.act(s, 1, { a: "bomb" }).ok && s.bombs.length === 1);
  check("…only one at a time to start with", !B.act(s, 1, { a: "bomb" }).ok);
  // step off it, then try to walk back on
  B.report(s, 1, { x: 1.5, y: 2.2 }, 1000); B.step(s, 0.05);
  B.report(s, 1, { x: 1.5, y: 2.5 }, 1200); B.step(s, 0.05);
  const snap = B.report(s, 1, { x: 1.5, y: 1.5 }, 1500);
  check("you can step off your bomb, but not back on", !!snap && a.y > 2);
  run(s, B.FUSE);
  check("it goes off: a + of fire", s.bombs.length === 0 && s.fire.size > 0);
  check("…and you, two tiles down in the flames, are out", !a.alive && s.lastWin === 1, `${a.alive}`);
}
{
  const s = duel(); empty(s);
  const a = body(s, 1), o = body(s, 2);
  // a blast of three from (4,5): up and down are pillars, (4,4) and (4,6);
  // left runs open to the wall; right meets a brick at (5,5)
  put(a, 4, 5); put(o, 9, 11);
  a.range = 3;
  s.g[idx(5, 5)] = BRICK;
  s.hidden.set(idx(5, 5), "fire");
  B.act(s, 1, { a: "bomb" });
  put(a, 1, 11);
  run(s, B.FUSE + 0.05);
  const burnt = [...s.fire.keys()];
  check("the flames stop at a pillar, and run their full length where it's open", !burnt.includes(idx(4, 4)) && !burnt.includes(idx(4, 6)) && burnt.includes(idx(3, 5)) && burnt.includes(idx(1, 5)));
  check("…break the first brick, and stop there", s.g[idx(5, 5)] === FLOOR && burnt.includes(idx(5, 5)) && !burnt.includes(idx(6, 5)));
  check("…showing the power-up under it", s.pow.get(idx(5, 5)) === "fire");
  run(s, 1);
  const before = a.range;
  put(a, 5, 5); B.step(s, DT);
  check("walk over it and it's yours: a longer blast", a.range === before + 1 && !s.pow.has(idx(5, 5)));
  // a chain
  const c = duel(); empty(c);
  const p1 = body(c, 1), p2 = body(c, 2);
  put(p1, 1, 1); put(p2, 9, 11);
  B.act(c, 1, { a: "bomb" });
  run(c, 0.5);
  put(p1, 9, 1);
  put(p2, 2, 1); B.act(c, 2, { a: "bomb" });
  put(p2, 9, 11);
  run(c, B.FUSE - 0.5 + 0.05);
  check("one bomb sets off another in its flames", c.bombs.length === 0 && c.fire.has(idx(3, 1)));
}
{
  // partners
  const s = teams(); empty(s);
  const [a, b, c, d] = [1, 2, 3, 4].map((id) => body(s, id));
  put(a, 1, 1); put(c, 2, 1); put(b, 9, 11); put(d, 9, 1);
  B.act(s, 1, { a: "bomb" });
  put(a, 1, 5);                                 // out of reach of your own
  run(s, B.FUSE + 0.05);
  check("teams: a partner's flames don't hurt you", c.alive && a.alive);
  put(c, 3, 3);
  B.act(s, 3, { a: "bomb" });
  put(c, 3, 5);
  put(b, 3, 2);
  run(s, B.FUSE + 0.05);
  check("…but they do the other side, for 25 points", !b.alive && s.scores[0] === B.KO_PTS);
}

// ── rounds ───────────────────────────────────────────────────────────────────
{
  const s = duel(); empty(s);
  const a = body(s, 1), o = body(s, 2);
  put(a, 1, 1); put(o, 2, 1);
  B.act(s, 1, { a: "bomb" });
  put(a, 1, 5);
  run(s, B.FUSE + 0.05);
  check("last one standing wins the round: 100 + 25", s.phase === "pause" && s.wins[0] === 1 && s.scores[0] === B.WIN_PTS + B.KO_PTS && s.scores[1] === 0);
  run(s, B.PAUSE_S + 0.1);
  check("…then a fresh arena, everyone back in", s.round === 2 && s.phase === "play" && a.alive && o.alive && [...s.g].some((c) => c === BRICK));
  // both caught: nobody wins it
  empty(s);
  put(a, 1, 1); put(o, 2.5 - 0.5, 1); o.x = 2.5;
  B.act(s, 1, { a: "bomb" });
  run(s, B.FUSE + 0.05);
  check("both caught in it: a draw, nobody scores", s.phase === "pause" && s.lastWin === null && s.wins.join() === "1,0");
  // the arena closes in on a camper
  const t = duel(); empty(t);
  put(body(t, 1), 1, 1); put(body(t, 2), 5, 6);
  run(t, B.SHRINK_AT + 2);
  check("late on the arena closes in from the edge, and catches whoever's there", !body(t, 1).alive && body(t, 2).alive && t.wins[1] === 1, `${body(t, 1).alive} ${body(t, 2).alive} ${t.wins}`);
}

// ── who plays ────────────────────────────────────────────────────────────────
{
  const d = duel();
  check("a friends match is only the people in it — no computer", d.bodies.length === 2 && !d.bodies.some((b) => b.cpu) && d.phase === "play");
  const s = solo();
  check("solo: you and three computer bombers", s.bodies.filter((b) => b.cpu).length === 3 && s.bodies.length === 4);
  check("…nothing moves until you pick a level", s.phase === "level" && (() => { run(s, 3); return s.bombs.length === 0; })());
  check("…which only you can pick", !B.act(s, -1, { a: "level", lvl: "hard" }).ok && B.act(s, 1, { a: "level", lvl: "hard" }).ok && s.phase === "play");
  const c = coop();
  check("together: both of you on one side against two computer bombers", c.bodies.filter((b) => b.cpu).length === 2 && body(c, 1).side === body(c, 2).side && c.phase === "play");
  const t = teams();
  check("teams: two sides of two, no computer", t.bodies.length === 4 && !t.bodies.some((b) => b.cpu) && body(t, 1).side === body(t, 3).side && body(t, 1).side !== body(t, 2).side);
  const gone = duel();
  B.removePlayer(gone, 2);
  check("a friends match with one player left is over", B.done(gone) || (() => { B.step(gone, DT); return B.done(gone); })());
  const v = JSON.stringify(B.view(duel()));
  check("what travels each tick is small", v.length < 900, `${v.length} bytes`);
}

// ── the computer ─────────────────────────────────────────────────────────────
function botMatch(level, seeds, secs = 60) {
  let selfKills = 0, kills = 0, rounds = 0, humanOut = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const s = solo(seed);
    B.act(s, 1, { a: "level", lvl: level });
    // you stand still in your corner; the bots get on with it
    for (let t = 0; t < secs; t += DT) {
      B.step(s, DT);
      for (const e of s.ev) {
        if (e.type === "ko") { const victim = s.bodies.find((b) => b.id === e.id); const by = s.bodies.find((b) => b.id === e.by); if (victim?.cpu && e.by === victim.id) selfKills++; if (by?.cpu && victim && !victim.cpu) { kills++; humanOut++; } }
        if (e.type === "won") rounds++;
      }
      s.ev = [];
    }
  }
  return { selfKills, kills, rounds, humanOut };
}
{
  const hard = botMatch("hard", 6), easy = botMatch("easy", 6);
  check("computer bombers find you and get you", hard.humanOut >= 4, `hard got you ${hard.humanOut}× in 6 minutes`);
  check("Hard rarely blows itself up", hard.selfKills <= 3, `${hard.selfKills} self-knockouts`);
  // how long someone standing still lasts against each level
  const lasts = (lvl) => {
    let tot = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = solo(seed);
      B.act(g, 1, { a: "level", lvl });
      let t = 0;
      for (; t < 70 && body(g, 1).alive; t += DT) B.step(g, DT);
      tot += t;
    }
    return tot / 12;
  };
  const le = lasts("easy"), lh = lasts("hard");
  check("Easy takes clearly longer to get you than Hard", le > lh * 1.15, `easy ${le.toFixed(1)}s · hard ${lh.toFixed(1)}s`);
  check("rounds keep coming", hard.rounds >= 6);
}

// ── where people start ───────────────────────────────────────────────────────
{
  const at = (mode, sides) => {
    const players = sides.flatMap((x) => x.members);
    const s = B.createSide(42, { players, sides, durMs: 180000, mode });
    if (s.phase === "level") B.act(s, players[0], { a: "level", lvl: "easy" });
    return s;
  };
  const co = at("coop", [{ key: "all", members: [1, 2] }]);
  const [a, b] = [co.bodies.find((x) => x.id === 1), co.bodies.find((x) => x.id === 2)];
  check("together: friends start side by side, not at either end", Math.hypot(a.x - b.x, a.y - b.y) <= 2.01, `${a.x},${a.y} and ${b.x},${b.y}`);
  check("…on open floor", [a, b].every((q) => co.g[Math.floor(q.y) * B.W + Math.floor(q.x)] === B.FLOOR));
  const bots = co.bodies.filter((x) => x.cpu);
  check("…and the computer bombers start away from them", bots.every((q) => Math.hypot(q.x - a.x, q.y - a.y) > 6));
  const tm = at("teams", [{ key: "t1", members: [1, 3] }, { key: "t2", members: [2, 4] }]);
  const p = (id) => tm.bodies.find((x) => x.id === id);
  check("teams: partners start together, the other team in another corner", Math.hypot(p(1).x - p(3).x, p(1).y - p(3).y) <= 2.01 && Math.hypot(p(2).x - p(4).x, p(2).y - p(4).y) <= 2.01 && Math.hypot(p(1).x - p(2).x, p(1).y - p(2).y) > 6);
  const vs = at("free", [{ key: "a", members: [1] }, { key: "b", members: [2] }]);
  check("against each other: opposite corners, as before", Math.hypot(vs.bodies[0].x - vs.bodies[1].x, vs.bodies[0].y - vs.bodies[1].y) > 9);
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
