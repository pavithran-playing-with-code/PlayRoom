// scripts/check-runner-power.mjs — Rail Runner's power-ups (src/components/games/runnerSim.js).
//
//   node scripts/check-runner-power.mjs [old-runnerSim.js]
//
// Power-ups are the same for everyone, never in a lane something else uses;
// a magnet takes coins from every lane near you, double makes coins worth
// twice, a shield takes one crash and is gone. Given the previous
// runnerSim.js, the course (everything but the power-ups) is exactly as before.
import * as m from "../src/components/games/runnerSim.js";
import { pathToFileURL } from "node:url";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const lay = (run, to) => { const all = []; while (run.nextZ < to) { run.z = run.nextZ - 50; m.layCourse(run); } return run; };
const rowsOf = (seed, to) => { const s = m.newRun(seed), seen = new Map(); for (let z = 0; z < to; z += 40) { s.z = z; m.layCourse(s); for (const r of s.rows) seen.set(r.z, r); } return [...seen.values()]; };

const A = rowsOf(4, 4000), B = rowsOf(4, 4000);
const powers = (rows) => rows.flatMap((r) => r.items.filter((o) => o.kind === m.POWER).map((o) => `${o.p}@${o.lane}@${o.z}`));
ok("power-ups are the same for everyone", powers(A).join() === powers(B).join() && powers(A).length > 5, `${powers(A).length} in 4 km`);
ok("all three kinds turn up", m.POWERS.every((p) => powers(A).some((x) => x.startsWith(p))));
ok("never in a lane with something in the way", A.every((r) => r.items.filter((o) => o.kind === m.POWER).every((pw) => !r.items.some((o) => o !== pw && o.kind !== "coin" && o.lane === pw.lane))));
if (process.argv[2]) {
  const old = await import(pathToFileURL(process.argv[2]).href);
  const rowsOld = (() => { const s = old.newRun(4), seen = new Map(); for (let z = 0; z < 4000; z += 40) { s.z = z; old.layCourse(s); for (const r of s.rows) seen.set(r.z, r); } return [...seen.values()]; })();
  const sig = (rows) => JSON.stringify(rows.map((r) => [r.z, r.items.filter((o) => o.kind !== m.POWER).map((o) => [o.kind, o.lane, o.z, o.y])]));
  ok("the course is exactly what it was, power-ups aside", sig(rowsOld) === sig(A), `${rowsOld.length} rows`);
}

// a magnet: coins in the other lanes come to you
{
  const s = m.newRun(1);
  s.rows = [{ z: 5, items: [-1, 1, -1].map((lane, k) => ({ kind: "coin", lane, z: 3 + k, y: 0.6, got: false })) }];
  s.nextZ = 1e9;
  s.magnetT = m.MAGNET_S;
  for (let i = 0; i < 6; i++) m.step(s, 1 / 60);
  ok("a magnet takes coins from the other lanes", s.coins === 3, `${s.coins}`);
}
// double: coins worth twice while it lasts
{
  const s = m.newRun(1);
  s.rows = [{ z: 1.2, items: [{ kind: "coin", lane: 0, z: 1.2, y: 0.6, got: false }] }];
  s.nextZ = 1e9; s.doubleT = m.DOUBLE_S;
  const before = m.score(s);
  m.step(s, 1 / 60);
  ok("double: a coin is worth twice", s.coins === 1 && m.score(s) - before >= 2 * m.COIN_POINTS);
}
// a shield takes one crash
{
  const s = m.newRun(1);
  s.rows = [{ z: 0.2, items: [{ kind: m.LOW, lane: 0, z: 0.2, len: 0.5, hit: false }] }, { z: 12, items: [{ kind: m.LOW, lane: 0, z: 12, len: 0.5, hit: false }] }];
  s.nextZ = 1e9; s.shield = true;
  let used = false, crashed = false;
  for (let i = 0; i < 20; i++) { const o = m.step(s, 1 / 60); used = used || o.shieldUsed; crashed = crashed || o.crashed; }
  ok("a shield takes the crash, and is gone", used && !crashed && !s.shield && s.crashes === 0);
  s.safeT = 0;
  for (let i = 0; i < 90; i++) { const o = m.step(s, 1 / 60); crashed = crashed || o.crashed; }
  ok("…the next one is a crash", crashed && s.crashes === 1);
}
// running through a power-up takes it
{
  const s = m.newRun(1);
  s.rows = [{ z: 1, items: [{ kind: m.POWER, p: "magnet", lane: 0, z: 1.2, y: 0.9, len: 0.5, hit: false }] }];
  s.nextZ = 1e9;
  const o = m.step(s, 1 / 60);
  ok("run through a power-up: it's yours", o.power === "magnet" && s.magnetT > 0 && s.rows[0].items[0].hit);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
