// scripts/check-dino.mjs — Dino Dash's coins (src/components/games/dinoSim.js).
//
//   node scripts/check-dino.mjs [old-dinoSim.js]
//
// The coins are the same for everyone; an autopilot that jumps each cactus
// on time and runs under the high birds grabs most of them; a grabbed coin
// scores and is gone; nothing grabs coins while dazed. Given the previous
// dinoSim.js, also checks the obstacles are exactly what they were.
import { makeCourse, newRunner, step, jump, setDuck, speedAfter, DINO_X, COIN_PTS } from "../src/components/games/dinoSim.js";
import { pathToFileURL } from "node:url";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

const a = makeCourse(7), b = makeCourse(7);
a.extend(60000); b.extend(60000);
ok("the same seed, the same coins", JSON.stringify(a.coins) === JSON.stringify(b.coins) && a.coins.length > 100, `${a.coins.length} coins`);

if (process.argv[2]) {
  const old = await import(pathToFileURL(process.argv[2]).href);
  const o = old.makeCourse(7); o.extend(60000);
  const n = makeCourse(7); n.extend(60000);
  ok("the obstacles are exactly what they were", JSON.stringify(o.list) === JSON.stringify(n.list.slice(0, o.list.length)) && o.list.length > 50, `${o.list.length} obstacles`);
}

// an autopilot: jump each cactus so the peak is over its middle; duck the middle birds; jump the low ones
function run(seed, seconds) {
  const course = makeCourse(seed), s = newRunner();
  s.started = true;
  const dt = 1 / 60;
  let crashes = 0;
  for (let t = 0; t < seconds; t += dt) {
    const v = speedAfter(s.run);
    const next = course.list.find((o, i) => i >= s.first && !s.hit.has(i) && o.x + o.w > s.x - 10);
    setDuck(s, false);
    if (next) {
      const mid = next.x + next.w / 2 - s.x;           // distance to its middle
      if (next.kind === "cactus" || next.lift < 20) { if (s.y <= 0 && mid < v * 0.31 + 20) jump(s); }
      else if (next.lift < 60 && next.x - s.x < 60) setDuck(s, true);
    }
    if (step(s, course, dt) === "crash") crashes++;
    s.events.length = 0;
  }
  const seen = course.coins.filter((c) => c.x < s.x).length;
  return { s, crashes, seen };
}
const r = run(7, 90);
ok("a well-timed run grabs most of the coins it passes", r.s.coins >= r.seen * 0.6, `${r.s.coins}/${r.seen}, ${r.crashes} crashes`);
ok("each coin scores and is gone", r.s.taken.size === r.s.coins);

// dazed: no coins
const course = makeCourse(3);
course.extend(5000);
const c0 = course.coins[0];
const s = newRunner();
s.started = true; s.x = c0.x - 23 - 5; s.y = Math.max(0, c0.y - 22); s.stun = 5;
step(s, course, 1 / 60);
ok("nothing is grabbed while dazed", s.coins === 0);
// the dino's body (DINO_X+8..+38 across, y+2..y+42 up) right on the coin
const s2 = newRunner();
s2.started = true; s2.x = c0.x - 23 - 5; s2.y = Math.max(0, c0.y - 22); s2.vy = 0;
const before = s2.points;
step(s2, course, 1 / 60);
ok("a coin at the dino scores " + COIN_PTS, s2.coins === 1 && s2.points - before >= COIN_PTS);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
