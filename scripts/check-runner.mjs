// scripts/check-runner.mjs — Rail Runner's rules, with no browser.
//
//   node scripts/check-runner.mjs
//
// Every row of every course leaves a way through; jumping clears a barrier,
// sliding clears a bar, swerving clears a train; a crash slows you, never
// takes points, and can't hit you twice; everyone with a seed runs the same
// course; and a bot that reacts like a player can run for minutes.
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// the module imports "./seededRand.js": copy both somewhere Node can load them as ES modules
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-"));
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "components", "games");
for (const f of ["runnerSim.js", "seededRand.js"]) fs.copyFileSync(path.join(src, f), path.join(dir, f.replace(".js", ".mjs")));
fs.writeFileSync(path.join(dir, "runnerSim.mjs"), fs.readFileSync(path.join(dir, "runnerSim.mjs"), "utf8").replace("./seededRand.js", "./seededRand.mjs"));
const m = await import(pathToFileURL(path.join(dir, "runnerSim.mjs")).href);

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const DT = 1 / 60;

// ── the course ───────────────────────────────────────────────────────────────
{
  let ok = true, why = "", same = true;
  for (let seed = 1; seed <= 200; seed++) {
    const s = m.newRun(seed), t = m.newRun(seed);
    while (s.made < 120) { s.z += 50; m.step(s, 0); }
    while (t.made < 120) { t.z += 50; m.step(t, 0); }
    if (JSON.stringify(s.rows.map((r) => r.items.map((o) => [o.kind, o.lane, o.z]))) !== JSON.stringify(t.rows.map((r) => r.items.map((o) => [o.kind, o.lane, o.z])))) same = false;
  }
  // every row: at least one lane with nothing that can't be passed by jumping or sliding
  for (let seed = 1; seed <= 200; seed++) {
    const s = m.newRun(seed);
    const rows = [];
    while (s.made < 150) { s.z += 40; m.step(s, 0); rows.push(...s.rows); }
    for (const row of rows) {
      const blocked = new Set(row.items.filter((o) => o.kind !== "coin").map((o) => o.lane));
      if (blocked.size >= 3) { ok = false; why = `seed ${seed}: a row with all three lanes taken`; }
    }
  }
  check("200 courses: every row leaves at least one lane open", ok, why);
  check("the same seed lays the same course", same);
}

// ── moves ────────────────────────────────────────────────────────────────────
function facing(kind, lane = 0) {
  const s = m.newRun(5);
  s.rows = [{ z: 20, items: [{ kind, lane, z: 20, len: kind === m.TRAIN ? 12 : 0.5, hit: false }] }];
  s.nextZ = 1e9;
  s.z = 14;
  return s;
}
const runTo = (s, z, act) => { let crashed = false; while (s.z < z) { if (act) act(s); crashed = m.step(s, DT).crashed || crashed; } return crashed; };
{
  check("run into a barrier: crash", runTo(facing(m.LOW), 22));
  check("jump it: clear", !runTo(facing(m.LOW), 22, (s) => { if (s.z > 18.6 && s.z < 18.8) m.jump(s); }));
  check("run into a high bar: crash", runTo(facing(m.HIGH), 22));
  check("slide under it: clear", !runTo(facing(m.HIGH), 22, (s) => { if (s.z > 18.5 && s.z < 18.7) m.slide(s); }));
  check("jumping a high bar doesn't help", runTo(facing(m.HIGH), 22, (s) => { if (s.z > 18.6 && s.z < 18.8) m.jump(s); }));
  check("a train: crash if you stay in its lane", runTo(facing(m.TRAIN), 35));
  check("…swerve round it: clear", !runTo(facing(m.TRAIN), 35, (s) => { if (s.z > 16 && s.lane === 0) m.steer(s, 1); }));
  check("…and jumping a train doesn't help", runTo(facing(m.TRAIN), 35, (s) => { if (s.z > 18.6 && s.z < 18.8) m.jump(s); }));

  const s = facing(m.TRAIN);
  const before = m.score(s);
  runTo(s, 35);
  check("a crash: one crash, however long the train", s.crashes === 1);
  check("…slows you right down, but takes no points off", m.score(s) >= before);
  check("no steering while you stumble", !(() => { const t = facing(m.LOW); runTo(t, 22); t.stunT = 0.5; return m.steer(t, 1); })());
  const c = m.newRun(3);
  c.rows = [{ z: 10, items: [{ kind: "coin", lane: 0, z: 10, y: 0.6, got: false }] }];
  c.nextZ = 1e9; c.z = 5;
  runTo(c, 12);
  check("run over a coin: it's yours, +10", c.coins === 1 && m.score(c) === Math.floor(c.z) + 10);
  // the coin bug: a coin is taken a step before you reach it, not as it passes under you
  const k = m.newRun(3);
  k.rows = [{ z: 10, items: [{ kind: "coin", lane: 0, z: 10, y: 0.6, got: false }] }];
  k.nextZ = 1e9; k.z = 5;
  let takenAt = null;
  while (k.z < 12 && takenAt === null) { const o = m.step(k, DT); if (o.got.length) takenAt = k.z; }
  check("a coin is taken just before you reach it — so you see it go", takenAt !== null && takenAt < 10 && takenAt > 10 - m.COIN_REACH - 0.5, `at ${takenAt && takenAt.toFixed(2)} m, the coin at 10 m`);
  const line = m.newRun(3);
  line.rows = [{ z: 10, items: Array.from({ length: 10 }, (_, i) => ({ kind: "coin", lane: 0, z: 10 + i * 2, y: 0.6, got: false })) }];
  line.nextZ = 1e9; line.z = 5;
  let firstFour = 0;
  while (line.z < 40) { const o = m.step(line, DT); if (line.coins <= 4) firstFour += o.got.length; }
  check("a line of ten coins: all ten taken, the first four included", line.coins === 10 && firstFour === 4);
  const sp = m.newRun(1); sp.rows = []; sp.nextZ = 1e9;
  for (let t = 0; t < 200; t += DT) m.step(sp, DT);
  check("the run speeds up, to a limit", sp.speed === m.MAX_SPEED);
}

// ── a bot that plays like a person: looks ahead, picks a lane, jumps, slides ─
{
  let worst = 0, total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = m.newRun(seed);
    for (let t = 0; t < 180; t += DT) {
      const near = (lane) => s.rows.flatMap((r) => r.items).filter((o) => o.kind !== "coin" && o.lane === lane && o.z + o.len > s.z - 0.5 && o.z < s.z + s.speed * 0.9);
      const here = near(s.lane);
      if (here.some((o) => o.kind === m.TRAIN) || here.length) {
        const ob = here[0];
        if (ob.kind === m.TRAIN || (ob.kind !== m.TRAIN && ob.z - s.z > 4)) {
          const alt = [s.lane - 1, s.lane + 1].filter((l) => l >= -1 && l <= 1 && !near(l).some((o) => o.kind === m.TRAIN));
          if (alt.length && ob.kind === m.TRAIN) m.steer(s, alt[0] - s.lane);
        }
        if (ob.kind === m.LOW && ob.z - s.z < s.speed * 0.16 + 0.6) m.jump(s);
        if (ob.kind === m.HIGH && ob.z - s.z < s.speed * 0.1 + 0.6) m.slide(s);
      }
      m.step(s, DT);
    }
    worst = Math.max(worst, s.crashes);
    total += s.crashes;
  }
  check("40 three-minute runs: a careful runner almost never crashes", worst <= 3, `worst ${worst}, average ${(total / 40).toFixed(2)}`);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
