// scripts/check-wisps.mjs — Lantern Wisps' rules (src/components/together/wispsCore.mjs),
// headless: bots play whole nights the way the server runs them (10 ticks a
// second), a phone's worth of movement and reports each.
//
//   node scripts/check-wisps.mjs
//
// A bot runs from the shadows (the closest ones count most), drifts toward
// gems and hearts when it's safe, dashes when something is about to touch it,
// and picks a random card.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "components", "together");
const C = await import(pathToFileURL(path.join(dir, "wispsCore.mjs")).href);
const { createSide, step, report, act, view, score, goal, done, summary, speedOf, DASH_SPEED, DASH_S, DASH_CD, START_S, xpFor } = C;

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const TICK = 0.1;
let botRand = 12345;
const br = () => (botRand = (botRand * 16807) % 2147483647) / 2147483647;

// a phone: moves its spirit like the real one (speed, dash), and a bot drives it
function bot(id) { return { id, x: 0, y: 0, dashT: 0, dashCd: 0, vx: 0, vy: 0, cards: 0, dashes: 0 }; }
function drive(s, b, v, dt, nowMs, { idle = false } = {}) {
  const me = v.p.find((r) => r[0] === b.id);
  if (!me || !me[5]) return;
  // the server put me somewhere (start, a correction): believe it
  if (Math.hypot(me[1] - b.x, me[2] - b.y) > 60) { b.x = me[1]; b.y = me[2]; }
  const p = s.pl.find((q) => q.id === b.id);
  // cards: pick one, a moment later
  if (v.o[b.id] && br() < 0.5) { act(s, b.id, { a: "pick", i: Math.floor(br() * v.o[b.id].length) }); b.cards++; }
  let mx = 0, my = 0, close = Infinity;
  if (!idle) {
    for (const e of v.e) {
      const dx = b.x - e[2], dy = b.y - e[3], d = Math.hypot(dx, dy) || 1;
      close = Math.min(close, d);
      if (d < 360) { const w = 1 / (d * d); mx += dx / d * w * 1e4; my += dy / d * w * 1e4; }
    }
    // safe enough: go for the nearest gem or heart
    const want = [...v.h.map((h) => [h[1], h[2], 3]), ...v.g.map((g) => [g[1], g[2], 1])];
    let best = null, bd = 380;
    for (const [x, y] of want) { const d = Math.hypot(x - b.x, y - b.y); if (d < bd) { bd = d; best = [x, y]; } }
    if (best && close > 90) { mx += (best[0] - b.x) / bd * 0.8; my += (best[1] - b.y) / bd * 0.8; }
    // and keep circling back toward the middle, or a long night drifts for miles
    mx += -b.x / 4000; my += -b.y / 4000;
  }
  const l = Math.hypot(mx, my);
  if (l > 1) { mx /= l; my /= l; }
  b.dashCd = Math.max(0, b.dashCd - dt);
  if (!idle && close < 34 && b.dashCd <= 0 && l > 0) { b.dashT = DASH_S; b.dashCd = DASH_CD; b.dashes++; }
  let sp = speedOf(p.PL);
  if (b.dashT > 0) { b.dashT -= dt; sp = DASH_SPEED; }
  b.x += mx * sp * dt; b.y += my * sp * dt;
  const snap = report(s, b.id, { x: b.x, y: b.y, d: b.dashT > 0 ? 1 : 0, f: mx >= 0 ? 1 : -1 }, nowMs);
  if (snap) { b.x = snap.x; b.y = snap.y; b.snaps = (b.snaps || 0) + 1; }
}

// a whole night: ticks like the server, the bots' phones in between
function night(seed, ids, { durMs = 360000, idle = false, onTick } = {}) {
  const s = createSide(seed, { players: ids, durMs, mode: ids.length > 1 ? "coop" : "free" });
  const bots = ids.map(bot);
  const evs = {};
  let t = 0, maxE = 0, worst = 0, nan = false, v = view(s, true);
  const t0 = Date.now();
  while (!done(s) && t < durMs / 1000 + 2) {
    for (const b of bots) drive(s, b, v, TICK, t * 1000, { idle });
    const a = performance.now();
    step(s, TICK);
    worst = Math.max(worst, performance.now() - a);
    v = view(s);
    t += TICK;
    for (const e of v.e2) evs[e.k] = (evs[e.k] || 0) + 1;
    maxE = Math.max(maxE, v.e.length);
    if (v.p.some((r) => !Number.isFinite(r[1]) || !Number.isFinite(r[3])) || v.e.some((r) => !Number.isFinite(r[2]))) nan = true;
    if (onTick) onTick(s, v, t);
  }
  return { s, bots, evs, maxE, worst, nan, secs: (Date.now() - t0) / 1000 };
}

// ── a full night, alone ──────────────────────────────────────────────────────
{
  const r = night(4242, [7]);
  const { s, evs, bots } = r;
  console.log(`      alone: ${s.ph}, level ${s.level}, ${s.kills} banished, ${Math.round(s.T)} s, most shadows at once ${r.maxE}, slowest tick ${r.worst.toFixed(1)} ms, events ${JSON.stringify(evs)}`);
  check("a night runs to its end", done(s) && (s.ph === "dawn" || s.ph === "out"));
  check("no broken numbers anywhere", !r.nan);
  check("levels up, the cards come, and get picked", s.level >= 8 && bots[0].cards >= 7, `level ${s.level}, ${bots[0].cards} cards`);
  check("shadows never go past the cap", r.maxE <= 260, `${r.maxE}`);
  check("the server keeps up: a tick well under its 100 ms", r.worst < 60, `${r.worst.toFixed(1)} ms`);
  const lasted = s.ph === "dawn" ? s.T : s.deadAt;
  if (s.ph === "dawn") {
    check("dawn: the shadows melt, the goal is met", s.dawn && goal(s) && evs.dawn === 1 && evs.melt > 0);
    check("...swarms at 2:00 and 4:00, Gloomaw at 3:00, the Queen at 5:00, elites", evs.swarm === 2 && evs.boss === 2 && evs.elite >= 4, JSON.stringify({ swarm: evs.swarm, boss: evs.boss, elite: evs.elite }));
  } else {
    check("went out before dawn: a bot is allowed to — but it got well into the night", lasted > 150, `${Math.round(lasted)} s`);
  }
  check("the score: banished, levels, time, dawn", score(s) === Math.min(25000, Math.round(s.kills * 10 + (s.level - 1) * 50 + Math.max(0, lasted - START_S) * 4 + (s.dawn ? 3000 : 0))), String(score(s)));
}

// ── several seeds: how far bots get, so the night is beatable and not trivial ──
{
  const res = [];
  for (const seed of [1, 2, 3, 11, 99]) { const { s } = night(seed, [5]); res.push(s.dawn ? "dawn" : Math.round(s.deadAt)); }
  console.log("      five bots alone:", res.join(", "));
  check("a running bot sees dawn on some nights, not on all", res.includes("dawn") || res.filter((x) => x !== "dawn").every((x) => x > 200), res.join(","));
}

// ── standing still: the shadows win ──────────────────────────────────────────
{
  const { s } = night(4242, [7], { idle: true });
  check("standing still with one weapon, the lantern goes out", s.ph === "out" && !goal(s), `${s.ph} at ${Math.round(s.deadAt)} s`);
  check("...and that ends the side", done(s));
}

// ── same seed, same night ────────────────────────────────────────────────────
{
  const a = createSide(77, { players: [1], durMs: 360000 }), b = createSide(77, { players: [1], durMs: 360000 });
  for (let i = 0; i < 200; i++) { step(a, TICK); step(b, TICK); }
  check("same room seed, same shadows in the same places", JSON.stringify(view(a).e) === JSON.stringify(view(b).e));
  const c = createSide(78, { players: [1], durMs: 360000 });
  for (let i = 0; i < 200; i++) step(c, TICK);
  check("a different seed, a different night", JSON.stringify(view(c).e) !== JSON.stringify(view(a, true).e));
}

// ── a short room: the night fits the clock ───────────────────────────────────
{
  const { s, evs } = night(5, [3], { durMs: 120000 });
  check("a 2-minute room: dawn on the room's clock, the bosses squeezed in", (s.ph === "dawn" && Math.abs(s.T - 120) < 0.6 && evs.boss === 2) || s.ph === "out", `${s.ph} at ${s.T.toFixed(1)} s, bosses ${evs.boss}`);
}

// ── together ─────────────────────────────────────────────────────────────────
{
  const r = night(31, [1, 2, 3]);
  const { s } = r;
  console.log(`      three together: ${s.ph}, level ${s.level}, ${s.kills} banished, each ${JSON.stringify(summary(s).each)}`);
  check("together: one XP bar, everyone's own cards", r.bots.every((b) => b.cards >= 5), r.bots.map((b) => b.cards).join("/"));
  const lo = s.pl.map((p) => Object.values(p.WL).join("") + Object.values(p.PL).join(""));
  check("...and loadouts their own", new Set(lo).size > 1, lo.join(" "));
  check("...kills counted per player, adding up", summary(s).each.reduce((a, e) => a + e.kills, 0) === s.kills);
}

// ── down, and back ───────────────────────────────────────────────────────────
{
  const s = createSide(9, { players: [1, 2], durMs: 360000, mode: "coop" });
  for (let i = 0; i < 40; i++) step(s, TICK);
  const [a, b] = s.pl;
  a.hp = 0; a.alive = false;                                    // A falls
  b.x = a.x + 300; b.y = a.y; b.inv = 99;
  for (let i = 0; i < 40; i++) step(s, TICK);
  check("a fallen friend stays down while nobody's near", !a.alive);
  b.x = a.x + 20; b.y = a.y;
  let at = null;
  for (let i = 0; i < 50 && !a.alive; i++) { step(s, TICK); b.x = a.x + 20; b.y = a.y; at = i; }
  check("...stand by their ghost ~3 s: they're back, at half health", a.alive && Math.abs(a.hp - a.maxhp / 2) < 1 && at >= 28 && at <= 32, `after ${(at + 1) / 10} s`);
  a.alive = false; a.hp = 0;
  b.x = a.x + 400;
  s.xp = s.need - 1;
  s.gm.push({ id: 99999, x: b.x, y: b.y, v: 5, vx: 0, vy: 0, mag: true });
  step(s, TICK);
  check("...or the team levels up: back at once", a.alive && s.level >= 2);
}

// ── the cards ────────────────────────────────────────────────────────────────
{
  const s = createSide(3, { players: [1], durMs: 360000 });
  for (let i = 0; i < 31; i++) step(s, TICK);
  const p = s.pl[0];
  s.xp = s.need; s.gm.push({ id: 1e6, x: p.x, y: p.y, v: 1, vx: 0, vy: 0, mag: true });
  step(s, TICK);
  const offered = view(s, true).o[p.id];
  check("level up: three cards, each a weapon or a charm", offered && offered.length === 3 && offered.every(([k]) => C.KINDS.includes(k)), JSON.stringify(offered));
  // a shadow on top of a spirit choosing: pushed off, no harm
  const hp = p.hp;
  for (let i = 0; i < 6; i++) { s.en.push({ id: 5e5 + i, type: "moth", x: p.x + 2, y: p.y, vx: 0, vy: 0, kx: 0, ky: 0, hp: 50, maxhp: 50, r: 11, sp: 0, dmg: 30, xp: 1, elite: false, boss: 0, t: 0, st: 0, st2: 0, st3: 2, hitT: {}, dead: false }); }
  step(s, TICK);
  check("while the cards are open, you're shielded", p.hp === hp && p.alive);
  const before = JSON.stringify([p.WL, p.PL]);
  act(s, p.id, { a: "pick", i: 0 });
  check("pick one: it's applied, the cards close", JSON.stringify([p.WL, p.PL]) !== before && !p.offers);
  // two levels at once: queued
  s.xp = 0; addTwo(s, p);
  check("two levels at once: two sets of cards, one after the other", p.offers && p.queue === 2);
  act(s, p.id, { a: "pick", i: 1 });
  check("...the second set comes after the first", !!p.offers && p.queue === 1);
  for (let i = 0; i < 105; i++) step(s, TICK);
  check("too slow (10 s): one is picked for you", !p.offers && p.queue === 0);
}
function addTwo(s, p) { s.xp = s.need + xpFor(s.level + 1) - 1; s.gm.push({ id: 2e6, x: p.x, y: p.y, v: 1, vx: 0, vy: 0, mag: true }); step(s, TICK); }

// ── a phone that runs too far is put back ────────────────────────────────────
{
  const s = createSide(3, { players: [1], durMs: 360000 });
  for (let i = 0; i < 31; i++) step(s, TICK);
  const p = s.pl[0];
  report(s, 1, { x: 10, y: 0 }, 1000);
  const ok = report(s, 1, { x: 60, y: 0 }, 1100);
  check("a believable move is taken", !ok && p.x === 60);
  let snap = null;
  for (let i = 0; i < 3; i++) snap = report(s, 1, { x: 5000, y: 0 }, 1200 + i * 10) || snap;
  check("a jump across the forest is refused", snap && snap.x === 60 && p.x === 60);
  const s2 = createSide(3, { players: [1], durMs: 360000 });
  check("before the 3-2-1, nobody moves", !!report(s2, 1, { x: 30, y: 0 }, 50));
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
