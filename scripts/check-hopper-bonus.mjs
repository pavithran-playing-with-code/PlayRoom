// scripts/check-hopper-bonus.mjs — Road Hopper's hot streak and gems (src/components/games/hopperSim.js).
//
//   node scripts/check-hopper-bonus.mjs
//
// Quick new rows build the streak (x2 from 6, x3 from 15) and pay for it;
// a pause or a crash ends it; a gem rides one log on about one river in four,
// the same for everyone; landing on that log takes it for +50, once.
import * as m from "../src/components/games/hopperSim.js";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const DT = 1 / 60;
const land = (h) => { let out; for (let i = 0; i < 20 && h.hop; i++) out = m.step(h, DT); return out; };

ok("x2 from 6 in a row, x3 from 15", m.streakMult(5) === 1 && m.streakMult(6) === 2 && m.streakMult(15) === 3);

// a straight corridor of grass: hop up quickly six times
{
  const h = m.newHopper(5);
  for (let n = 1; n < 40; n++) { const r = m.rowAt(h.course, n); r.kind = "grass"; r.trees = new Set(); r.coin = -1; }
  let last;
  for (let k = 0; k < 6; k++) { m.hop(h, "up"); last = land(h); }
  ok("six quick new rows: a streak of 6, now x2", h.streak === 6 && last.multUp && m.score(h) === 6 * m.ROW_PTS + m.ROW_PTS);
  m.hop(h, "up"); land(h);
  ok("…the next row pays double", m.score(h) === 7 * m.ROW_PTS + 2 * m.ROW_PTS);
  for (let i = 0; i < 70; i++) m.step(h, DT);        // stand still over a second
  m.hop(h, "up"); land(h);
  ok("a pause ends it: back to a streak of 1", h.streak === 1);
}

// gems
{
  const a = m.newHopper(9), b = m.newHopper(9);
  const gemsA = [], gemsB = [];
  let rivers = 0;
  for (let n = 0; n < 600; n++) { gemsA.push(m.gemOn(a, n)); gemsB.push(m.gemOn(b, n)); if (n >= 6 && m.rowAt(a.course, n).kind === "river") rivers++; }
  const count = gemsA.filter((g) => g >= 0).length;
  ok("gems are the same for everyone", JSON.stringify(gemsA) === JSON.stringify(gemsB));
  ok("about one river in four has one, and only rivers", count > rivers * 0.15 && count < rivers * 0.4 && gemsA.every((g, n) => g < 0 || m.rowAt(a.course, n).kind === "river"), `${count} of ${rivers}`);
  // stand on the gem's log and step
  const n = gemsA.findIndex((g) => g >= 0);
  const h = m.newHopper(9);
  const logs = m.thingsAt(m.rowAt(h.course, n), h.t);
  h.row = n; h.best = n; h.cam = n; h.x = logs[0].x0 + (logs[0].x1 - logs[0].x0) / 2 - 0.5;
  const out = m.step(h, DT);
  ok("standing on its log takes the gem: +50", out.gem && h.gems === 1 && h.bonus === m.GEM_PTS);
  m.step(h, DT);
  ok("…once", h.gems === 1);
}

// a crash ends the streak
{
  const h = m.newHopper(5);
  h.streak = 9;
  h.row = 3; h.best = 3; h.cam = 3;
  // force a car under the chicken: a road row with a car where it stands
  const r = m.rowAt(h.course, 3);
  r.kind = "road"; r.dir = 1; r.speed = 0; r.wrap = 40; r.things = [{ x: h.x + 2 - 0.3, len: 1.6 }];
  const out = m.step(h, DT);
  ok("a crash ends the streak", out.crashed === "car" && h.streak === 0);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
