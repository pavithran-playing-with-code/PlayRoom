// scripts/check-speedway.mjs — Speedway's rules, with no browser.
//
//   node scripts/check-speedway.mjs
//
// The road loops back on itself, the same seed builds the same road, laps
// count, the finish freezes your time, a car that holds the racing line can
// finish three laps well inside two minutes, the grass is slow, the back of
// another car is slower, and the score and places rank the way a race does.
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "speedway-"));
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "components", "games");
fs.copyFileSync(path.join(src, "seededRand.js"), path.join(dir, "seededRand.mjs"));
fs.writeFileSync(path.join(dir, "speedwaySim.mjs"), fs.readFileSync(path.join(src, "speedwaySim.js"), "utf8").replace("./seededRand.js", "./seededRand.mjs"));
const m = await import(pathToFileURL(path.join(dir, "speedwaySim.mjs")).href);

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const DT = 1 / 60;

// ── the road ─────────────────────────────────────────────────────────────────
{
  let loops = true, same = true, lengths = [];
  for (let seed = 1; seed <= 100; seed++) {
    const t = m.buildTrack(seed), u = m.buildTrack(seed);
    if (JSON.stringify(t.segs.map((s) => [s.curve, s.y1])) !== JSON.stringify(u.segs.map((s) => [s.curve, s.y1]))) same = false;
    const last = t.segs[t.segs.length - 1];
    if (Math.abs(last.y2 - t.segs[0].y1) > 1e-6 || Math.abs(t.segs[0].y1) > 1e-6) loops = false;
    lengths.push(t.segs.length);
  }
  check("every road comes back to where it began (level, for the next lap)", loops);
  check("the same seed builds the same road", same);
  check("roads have bends and hills", m.buildTrack(7).segs.some((s) => s.curve !== 0) && m.buildTrack(7).segs.some((s) => s.y1 !== 0));
  console.log(`      laps are ${Math.min(...lengths)}–${Math.max(...lengths)} segments`);
}

// ── driving ──────────────────────────────────────────────────────────────────
// a driver that holds the middle of the road against the bends
const steerFor = (t, car) => Math.max(-1, Math.min(1, -car.x * 3 + m.segAt(t, car.d).curve * 0.15));
{
  const t = m.buildTrack(3);
  const car = m.newCar(0);
  m.drive(t, car, { steer: 0 }, DT, false);
  check("before the lights: nothing moves", car.speed === 0 && car.d === m.newCar(0).d);
  let elapsed = 0, lap2At = null;
  while (car.finishedAt === null && elapsed < 300) {
    m.drive(t, car, { steer: steerFor(t, car) }, DT, true, [], elapsed);
    elapsed += DT;
    if (lap2At === null && m.lapOf(t, car.d) === 2) lap2At = elapsed;
  }
  check("laps count", lap2At !== null && m.lapOf(t, car.d) === 3);
  check("three laps on the racing line inside two minutes", car.finishedAt !== null && car.finishedAt < 110, `${car.finishedAt && car.finishedAt.toFixed(1)}s (lap one ${lap2At && lap2At.toFixed(1)}s)`);
  const at = car.finishedAt, d0 = car.d;
  for (let i = 0; i < 120; i++) m.drive(t, car, { steer: 0 }, DT, true, [], elapsed + i * DT);
  check("across the line: your time stands, and you roll to a stop", car.finishedAt === at && car.d >= d0 && car.speed < m.MAX_SPEED * 0.2);

  // the grass is slow
  const a = m.newCar(0), b = m.newCar(0);
  for (let i = 0; i < 400; i++) { m.drive(t, a, { steer: steerFor(t, a) }, DT, true); m.drive(t, b, { steer: 1 }, DT, true); }
  check("drive onto the grass and you slow right down", Math.abs(b.x) > 1 && b.speed <= m.OFF_ROAD_LIMIT * 1.2 && a.speed > b.speed * 2);
  // the bends push you out
  const c = m.newCar(0);
  c.d = t.segs.find((s) => Math.abs(s.curve) >= 3).z1;
  c.speed = m.MAX_SPEED;
  const x0 = c.x;
  for (let i = 0; i < 30; i++) m.drive(t, c, { steer: 0 }, DT, true);
  check("a bend pushes you towards the outside if you don't steer", Math.abs(c.x - x0) > 0.05);
  // into the back of someone
  const d = m.newCar(0); d.speed = m.MAX_SPEED * 0.9; d.d = 5000; d.x = 0;
  const other = { d: 5000 + m.SEG * 0.5, x: 0 };
  const r = m.drive(t, d, { steer: 0 }, DT, true, [other]);
  check("drive into the back of a car: you lose speed", r.bumped && d.speed < m.MAX_SPEED * 0.6);
  const e = m.newCar(0); e.speed = m.MAX_SPEED * 0.9; e.d = 5000; e.x = 0.6;
  check("…but you can pass beside it", !m.drive(t, e, { steer: 0 }, DT, true, [other]).bumped);
}

// ── score and places ─────────────────────────────────────────────────────────
{
  const t = m.buildTrack(9);
  const first = { d: m.LAPS * t.LAP, finishedAt: 70 }, second = { d: m.LAPS * t.LAP, finishedAt: 80 };
  const racing = { d: 2.9 * t.LAP, finishedAt: null }, behind = { d: 1.2 * t.LAP, finishedAt: null };
  const all = [behind, second, racing, first];
  check("places: first across the line is first, then second, then by how far", m.placeOf(first, all) === 1 && m.placeOf(second, all) === 2 && m.placeOf(racing, all) === 3 && m.placeOf(behind, all) === 4);
  const sc = (c) => m.raceScore(t, c, 120);
  check("scores rank the same way", sc(first) > sc(second) && sc(second) > sc(racing) && sc(racing) > sc(behind), [first, second, racing, behind].map(sc).join(" > "));
  check("…and stay under the score cap", m.raceScore(t, { d: m.LAPS * t.LAP, finishedAt: 0 }, 300) <= 25000);
}

// ── racing the computer ──────────────────────────────────────────────────────
{
  const t = m.buildTrack(4);
  const me = m.newCar(0), bots = m.newBots(4, 3, 1);
  let elapsed = 0;
  while (elapsed < 120 && bots.some((b) => b.finishedAt === null)) {
    for (const b of bots) m.driveBot(t, b, DT, true, [me, ...bots.filter((o) => o !== b)], elapsed);
    elapsed += DT;
  }
  check("the computer's cars finish the race in under two minutes", bots.every((b) => b.finishedAt !== null && b.finishedAt < 120), bots.map((b) => b.finishedAt && b.finishedAt.toFixed(1)).join(", "));
  check("…at different paces", new Set(bots.map((b) => Math.round(b.finishedAt))).size === 3);
  check("…and stay on the road", bots.every((b) => Math.abs(b.x) < 1.2));
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
