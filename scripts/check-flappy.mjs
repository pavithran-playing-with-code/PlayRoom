// scripts/check-flappy.mjs — Flappy Dash's stars and streaks (src/components/games/flappySim.js).
//
//   node scripts/check-flappy.mjs [old-flappySim.js]
//
// The stars are the same for everyone and always inside the sky; an
// autopilot that steers for them grabs most and rarely crashes; pipes in a
// row pay x2 from 10 and x3 from 20, golden pipes double; a crash ends the
// streak. Given the previous flappySim.js, the pipes are exactly as before.
import { makeCourse, newBird, step, flap, streakMult, isGolden, VIEW_H, GROUND, MARGIN, PIPE_W, BIRD_X, PIPE_POINTS, STAR_PTS } from "../src/components/games/flappySim.js";
import { pathToFileURL } from "node:url";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

const a = makeCourse(11), b = makeCourse(11);
a.extend(40000); b.extend(40000);
ok("the same seed, the same stars", JSON.stringify(a.stars) === JSON.stringify(b.stars) && a.stars.length > 40, `${a.stars.length} stars`);
ok("every star is in open sky", a.stars.every((s) => s.y >= MARGIN + 20 && s.y <= VIEW_H - GROUND - MARGIN - 20));
if (process.argv[2]) {
  const old = await import(pathToFileURL(process.argv[2]).href);
  const o = old.makeCourse(11); o.extend(40000);
  ok("the pipes are exactly what they were", JSON.stringify(o.list) === JSON.stringify(a.list.slice(0, o.list.length)), `${o.list.length} pipes`);
}
ok("x2 from 10 in a row, x3 from 20", streakMult(9) === 1 && streakMult(10) === 2 && streakMult(20) === 3);
ok("every 10th pipe is golden", isGolden(9) && isGolden(19) && !isGolden(10));

// an autopilot: aim for the next star if it comes before the next pipe, else the gap
function fly(seed, seconds) {
  const course = makeCourse(seed), s = newBird();
  s.started = true;
  let crashes = 0, passEvents = [];
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) {
    const pipe = course.list.find((p, i) => i >= s.first && !p.gone && p.x - s.x + PIPE_W > BIRD_X - 20);
    const star = (course.stars || []).find((st) => !st.taken && st.x - s.x > BIRD_X - 10);
    let target = pipe ? pipe.gapY + 8 : VIEW_H / 2;
    if (star && pipe && star.x < pipe.x && star.x - s.x - BIRD_X < 150) target = star.y;
    if (s.y > target && s.vy > -40) flap(s, t * 1000);
    if (step(s, course, dt) === "crash") crashes++;
    passEvents.push(...s.events.filter((e) => e.k === "pass"));
    s.events.length = 0;
  }
  const seen = (course.stars || []).filter((st) => st.x < s.x).length;
  return { s, crashes, seen, passEvents };
}
const r = fly(11, 120);
ok("steering for the stars grabs most of them, and rarely crashes", r.s.stars >= r.seen * 0.6 && r.crashes <= 3, `${r.s.stars}/${r.seen} stars, ${r.crashes} crashes, ${r.s.pipes} pipes`);
const tenth = r.passEvents.find((e) => e.i === 9);
ok("the 10th pipe passed (golden) pays double", !tenth || tenth.pts === PIPE_POINTS * 2 * streakMult(10) && tenth.golden);
const later = r.passEvents.find((e) => e.mult === 2 && !e.golden);
ok("a long streak pays x2", !!later && later.pts === PIPE_POINTS * 2);
ok("…and the points add up", r.s.points >= r.s.stars * STAR_PTS + r.s.pipes * PIPE_POINTS);
// a crash ends the streak
const c = makeCourse(2), s = newBird();
s.started = true; s.run = 15; s.y = 2;
step(s, c, 1 / 60);
ok("a crash ends the streak", s.run === 0 && s.crashes === 1);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
