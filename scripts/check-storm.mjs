// scripts/check-storm.mjs — Dodge Storm's rules (src/components/games/stormSim.js).
//
//   node scripts/check-storm.mjs [old-stormSim.js]
//
// The same storm for everyone; pickups from their own stream (so the shards
// before seekers begin are exactly as they were); a star scores, a shield
// takes one hit, slow time slows the shards; seekers turn toward you; each
// second alive is worth more the longer you live.
import * as m from "../src/components/games/stormSim.js";
import { pathToFileURL } from "node:url";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

// a player who runs away from the nearest shard (and toward stars), for N frames
function play(seed, frames, opts = {}) {
  const s = m.newStorm(seed), log = { picked: [], hits: 0, pops: 0 };
  for (let f = 0; f < frames && !s.hit; f++) {
    if (opts.still) { /* stand still */ }
    else {
      let ax = 0, ay = 0;
      for (const p of s.shards) { const dx = s.x - p.x, dy = s.y - p.y, d2 = dx * dx + dy * dy + 1; if (d2 < 120 * 120) { ax += dx / d2; ay += dy / d2; } }
      const star = s.items[0];
      if (star && !ax && !ay) { ax = (star.x - s.x) / 400; ay = (star.y - s.y) / 400; }
      m.moveTo(s, s.x + ax * 3000 + (m.VIEW_W / 2 - s.x) * 0.01, s.y + ay * 3000 + (m.VIEW_H / 2 - s.y) * 0.01);
    }
    const out = m.step(s, 1);
    log.picked.push(...out.picked);
    if (out.shieldPop) log.pops++;
  }
  return { s, log };
}

const A = play(5, 3000), B = play(5, 3000);
ok("the same seed, the same storm", A.s.frame === B.s.frame && A.s.points === B.s.points && JSON.stringify(A.log) === JSON.stringify(B.log));
if (process.argv[2]) {
  const old = await import(pathToFileURL(process.argv[2]).href);
  const o = old.newStorm(9), n = m.newStorm(9);
  let same = true;
  for (let f = 0; f < m.SEEK_FROM - 10; f++) {
    old.step(o, 1); m.step(n, 1);
    // keep the player away from everything so nobody is hit, and no pickup is taken
    o.x = o.y = n.x = n.y = -999; o.tx = n.tx = o.ty = n.ty = -999;
    const so = o.shards.map((p) => [p.x.toFixed(3), p.y.toFixed(3)]).join(), sn = n.shards.map((p) => [p.x.toFixed(3), p.y.toFixed(3)]).join();
    if (so !== sn) { same = false; break; }
  }
  ok("before the seekers, the shards are exactly what they were", same);
}
const many = play(11, 6000, { still: true });
ok("pickups turn up: stars, shields and slow time", (() => { const s = m.newStorm(3); const kinds = new Set(); for (let f = 0; f < 20000; f++) { m.step(s, 1); s.x = s.y = s.tx = s.ty = -999; for (const it of s.items) kinds.add(it.kind); } return kinds.size === 3; })());
// a star
{
  const s = m.newStorm(1);
  s.items = [{ kind: "star", x: s.x, y: s.y, life: 100 }];
  const out = m.step(s, 1);
  ok("touching a star: +15", out.picked[0] === "star" && s.points === m.STAR_PTS && s.items.length === 0);
}
// a shield takes one hit
{
  const s = m.newStorm(1);
  s.shield = true;
  s.shards = [{ x: s.x + 5, y: s.y, r: 8, vx: 0, vy: 0, grazed: false, seek: 0 }, { x: s.x - 5, y: s.y, r: 8, vx: 0, vy: 0, grazed: false, seek: 0 }];
  const o1 = m.step(s, 1);
  ok("a shield takes the hit — even two at once — and is gone", o1.shieldPop && !o1.hit && !s.shield && !s.hit);
  let later = null;
  for (let f = 0; f < m.SAFE_FRAMES + 5 && !s.hit; f++) { s.shards.forEach((p) => { p.x = s.x + 4; p.y = s.y; }); later = m.step(s, 1); if (f < m.SAFE_FRAMES - 2 && later.hit) break; }
  ok("…a moment of safety, then a hit is a hit", later && later.hit && s.frame > m.SAFE_FRAMES);
}
// slow time
{
  const a = m.newStorm(1), b = m.newStorm(1);
  b.slow = m.SLOW_FRAMES;
  for (const s of [a, b]) s.shards = [{ x: 0, y: 200, r: 6, vx: 3, vy: 0, grazed: false, seek: 0 }];
  a.x = a.y = b.x = b.y = a.tx = a.ty = b.tx = b.ty = 300;
  m.step(a, 1); m.step(b, 1);
  ok("slow time: the shards crawl", Math.abs(b.shards[0].x - 3 * m.SLOW_K) < 1e-9 && Math.abs(a.shards[0].x - 3) < 1e-9);
}
// a seeker turns toward you
{
  const s = m.newStorm(1);
  s.x = s.tx = 160; s.y = s.ty = 400;
  s.shards = [{ x: 160, y: 20, r: 6, vx: 3, vy: 0, grazed: false, seek: m.SEEK_FRAMES }];
  for (let i = 0; i < 40; i++) m.step(s, 1);
  ok("a seeker turns toward you", s.shards[0] && s.shards[0].vy > 1.5, s.shards[0] && s.shards[0].vy.toFixed(2));
}
// alive for longer: more a second
{
  ok("x2 from 20 s, x3 from 40 s", m.aliveMult(1199) === 1 && m.aliveMult(1200) === 2 && m.aliveMult(2400) === 3);
  const s = m.newStorm(1);
  s.x = s.y = s.tx = s.ty = -999;
  for (let f = 0; f < 3000; f++) { m.step(s, 1); s.shards = []; s.items = []; }
  const plain = Math.floor(3000 / m.SCORE_DIVISOR), got = m.timeScore(s);
  ok("…so 50 s alive scores more than 50 s at x1", got > plain * 1.6, `${got} vs ${plain}`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
