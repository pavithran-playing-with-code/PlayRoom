// scripts/check-kitchen.mjs — Kitchen Rush's rules, with no browser.
//
//   node scripts/check-kitchen.mjs
//
// The kitchen joins up (every crate, board, stove and the window can be
// reached); every recipe can be cooked; the same seed brings the same orders;
// the hands do what they should (no chopping meat, no two buns on a plate,
// burnt meat won't plate, a wrong plate scores nothing); a phone can't walk
// through a counter or teleport; and cooks that work like players reach
// their stars — and two cooks together beat one.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const k = await import(pathToFileURL(path.join(here, "..", "src", "components", "together", "kitchenCore.mjs")).href);

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const DT = 0.1;

// ── the room ─────────────────────────────────────────────────────────────────
const floor = (x, y) => k.kindAt(x, y) === "floor";
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function dist(fx, fy) {
  const d = new Map([[`${fx},${fy}`, 0]]);
  const q = [[fx, fy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [a, b] of N4) {
      const nx = x + a, ny = y + b, key = `${nx},${ny}`;
      if (floor(nx, ny) && !d.has(key)) { d.set(key, d.get(`${x},${y}`) + 1); q.push([nx, ny]); }
    }
  }
  return d;
}
{
  const d = dist(2, 2);
  let floors = 0, joined = 0;
  for (let y = 0; y < k.H; y++) for (let x = 0; x < k.W; x++) if (floor(x, y)) { floors++; if (d.has(`${x},${y}`)) joined++; }
  check("the floor joins up", floors === joined && floors > 30, `${floors} floor tiles`);
  const special = [];
  for (let y = 0; y < k.H; y++) for (let x = 0; x < k.W; x++) if (!["floor", "counter"].includes(k.kindAt(x, y))) special.push([x, y]);
  const unreachable = special.filter(([x, y]) => !N4.some(([a, b]) => d.has(`${x + a},${y + b}`)));
  check("every crate, board, stove, plate stack, bin and the window can be reached", unreachable.length === 0, JSON.stringify(unreachable));
  for (const want of ["T", "L", "C", "B", "M", "K", "S", "P", "W", "X"]) {
    if (!k.LAYOUT.some((r) => r.includes(want))) check(`the kitchen has a ${want}`, false);
  }
}

// ── a cook that works like a player ──────────────────────────────────────────
const find = (ch) => { const out = []; k.LAYOUT.forEach((r, y) => [...r].forEach((c, x) => { if (c === ch) out.push([x, y]); })); return out; };
const BOARDS = find("K"), STOVES = find("S"), STAGES = [[0, 1], [0, 3], [0, 5], [0, 6]];
const CRATES = Object.fromEntries(Object.entries(k.CRATE).map(([ch, ing]) => [ing, find(ch)[0]]));
const PLATES = find("P")[0], WINDOW = find("W")[0];

function makeCook(s, id, i) {
  return { id, i, ops: [], busy: 0, order: null, fails: 0, board: BOARDS[i % BOARDS.length], stove: STOVES[i % STOVES.length], stage: STAGES[i % STAGES.length] };
}
function plan(c, s, claimed) {
  const o = s.orders.filter((x) => !claimed.has(x.id)).sort((a, b) => a.until - b.until)[0];
  if (!o) return;
  c.order = o.id;
  claimed.add(o.id);
  const parts = k.RECIPES[o.r].parts;
  const ops = [["use", PLATES], ["use", c.stage]];
  if (parts.includes("meat")) ops.push(["use", CRATES.meat], ["use", c.stove]);
  for (const part of parts) {
    if (part === "meat") continue;
    ops.push(["use", CRATES[part]]);
    if (k.ING[part].chop) ops.push(["use", c.board], ["wait", () => { const it = s.at.get(c.board[1] * k.W + c.board[0]).item; return it && it.s === "chopped"; }], ["use", c.board]);
    ops.push(["use", c.stage]);
  }
  if (parts.includes("meat")) ops.push(["wait", () => { const it = s.at.get(c.stove[1] * k.W + c.stove[0]).item; return it && it.s === "cooked"; }], ["use", c.stove], ["use", c.stage]);
  ops.push(["use", c.stage], ["use", WINDOW], ["done"]);
  c.ops = ops;
}
// Walk (at chef's pace, along the floor) to beside a counter, face it, use it.
function walkUse(s, c, [tx, ty]) {
  const p = s.players.get(c.id);
  const d = dist(Math.floor(p.x), Math.floor(p.y));
  let best = null;
  for (const [a, b] of N4) { const key = `${tx + a},${ty + b}`; if (d.has(key) && (!best || d.get(key) < best.d)) best = { x: tx + a, y: ty + b, d: d.get(key) }; }
  if (!best) return { ok: false, why: "nopath" };
  return { at: best, secs: best.d / k.SPEED + 0.25 };
}
function run(seed, cooks, secs) {
  const s = k.createSide(seed, { players: cooks, durMs: secs * 1000 });
  const cs = cooks.map((id, i) => makeCook(s, id, i));
  const claimed = new Set();
  const why = [];
  for (let t = 0; t < secs; t += DT) {
    k.step(s, DT);
    for (const c of cs) {
      if (s.t < c.busy) continue;
      if (!c.ops.length) { plan(c, s, claimed); continue; }
      const [op, arg] = c.ops[0];
      if (op === "done") { c.ops.shift(); c.order = null; continue; }
      if (op === "wait") { if (arg()) c.ops.shift(); continue; }
      if (!c.walk) {
        const w = walkUse(s, c, arg);
        if (!w.at) { c.fails++; why.push(w.why); c.ops = []; continue; }
        c.walk = w; c.busy = s.t + w.secs; continue;
      }
      const p = s.players.get(c.id);
      p.x = c.walk.at.x + 0.5; p.y = c.walk.at.y + 0.5;
      c.walk = null;
      const r = k.use(s, c.id, arg[0], arg[1]);
      if (!r.ok) { c.fails++; why.push(`${op}@${arg}:${r.why}`); c.ops = []; const pl = s.players.get(c.id); pl.hold = null; continue; }
      c.ops.shift();
      c.busy = s.t + 0.15;
    }
  }
  return { s, fails: cs.reduce((a, c) => a + c.fails, 0), why };
}

{
  let worstFails = 0, served = 0, starsSolo = [], why = [];
  for (let seed = 1; seed <= 20; seed++) {
    const r = run(seed, [1], 120);
    worstFails = Math.max(worstFails, r.fails);
    served += r.s.served;
    starsSolo.push(k.stars(r.s));
    why.push(...r.why);
  }
  check("a cook working like a player never gets stuck", worstFails === 0, why.slice(0, 4).join(" "));
  check("…serving every kind of order, over and over", served > 20 * 5, `${(served / 20).toFixed(1)} a match`);
  const avg = starsSolo.reduce((a, b) => a + b, 0) / starsSolo.length;
  check("a steady solo cook earns about two stars in two minutes", avg >= 1.5 && avg <= 2.6, `average ${avg.toFixed(2)}: ${starsSolo.join("")}`);

  let one = 0, two = 0, twoStars = [];
  for (let seed = 1; seed <= 20; seed++) {
    one += run(seed, [1], 120).s.score;
    const r = run(seed, [1, 2], 120);
    two += r.s.score;
    twoStars.push(k.stars(r.s));
  }
  check("two cooks together serve more than one", two > one * 1.4, `${Math.round(one / 20)} → ${Math.round(two / 20)} points`);
  const avg2 = twoStars.reduce((a, b) => a + b, 0) / twoStars.length;
  check("…and earn their stars too (the line rises with the cooks)", avg2 >= 1.5, `average ${avg2.toFixed(2)}`);
  const kinds = new Set();
  const r = run(5, [1, 2], 240);
  for (const o of r.s.orders) kinds.add(o.r);
  check("all four recipes come up in a long match", (() => { const s = k.createSide(5, { players: [1], durMs: 240000 }); const seen = new Set(); for (let t = 0; t < 240; t += DT) { k.step(s, DT); s.orders.forEach((o) => seen.add(o.r)); s.orders = []; } return seen.size === 4; })());
}

// ── same seed, same orders ───────────────────────────────────────────────────
{
  const a = k.createSide(77, { players: [1], durMs: 120000 }), b = k.createSide(77, { players: [9], durMs: 120000 });
  const seqA = [], seqB = [];
  for (let t = 0; t < 120; t += DT) {
    k.step(a, DT); k.step(b, DT);
    for (const e of a.ev) if (e.type === "order") seqA.push(e.r);
    for (const e of b.ev) if (e.type === "order") seqB.push(e.r);
    a.ev = []; b.ev = [];
    a.orders = []; b.orders = [];
  }
  check("the same seed brings the same orders", seqA.join() === seqB.join() && seqA.length > 5, `${seqA.length} orders`);
}

// ── the hands ────────────────────────────────────────────────────────────────
{
  const s = k.createSide(3, { players: [1], durMs: 120000 });
  const p = s.players.get(1);
  const at = (x, y) => { p.x = x + 0.5; p.y = y + 0.5; };
  // meat can't go on a board
  at(...[CRATES.meat[0], 1]); k.use(s, 1, ...CRATES.meat);
  at(1, BOARDS[0][1]);
  check("meat won't go on a chopping board", !k.use(s, 1, ...BOARDS[0]).ok && p.hold.k === "meat");
  // …but it goes on the stove, cooks, then burns
  at(7, STOVES[0][1]);
  check("meat goes on a stove", k.use(s, 1, ...STOVES[0]).ok && !p.hold);
  const st = s.at.get(STOVES[0][1] * k.W + STOVES[0][0]);
  for (let t = 0; t < k.COOK_S + 0.2; t += DT) k.step(s, DT);
  check("…and cooks", st.item.s === "cooked");
  for (let t = 0; t < k.BURN_S + 0.2; t += DT) k.step(s, DT);
  check("…and burns if it's left", st.item.s === "burnt");
  k.use(s, 1, ...STOVES[0]);
  at(PLATES[0], PLATES[1] - 1);
  check("burnt meat won't go on a plate", !k.use(s, 1, ...PLATES).ok);
  at(7, 5);
  check("the bin takes it", k.use(s, 1, 8, 5).ok && !p.hold);
  // a raw tomato won't plate; chopping needs you there
  at(CRATES.tomato[0], 1); k.use(s, 1, ...CRATES.tomato);
  at(PLATES[0], PLATES[1] - 1);
  check("a raw tomato won't go on a plate", !k.use(s, 1, ...PLATES).ok);
  at(1, BOARDS[0][1]);
  check("putting it on a board starts the chopping", k.use(s, 1, ...BOARDS[0]).ok && p.chop !== null);
  const bd = s.at.get(BOARDS[0][1] * k.W + BOARDS[0][0]);
  k.step(s, 0.5);
  at(5, 5.5); p.y = 6.5;                     // walk away
  k.step(s, 1.5);
  check("walking away stops the chopping", bd.item.s === "raw" && p.chop === null && bd.item.p > 0.2 && bd.item.p < 0.5);
  at(1, BOARDS[0][1]);
  k.use(s, 1, ...BOARDS[0]);
  for (let t = 0; t < k.CHOP_S; t += DT) k.step(s, DT);
  check("…and coming back carries on where it was", bd.item.s === "chopped");
  // two of the same on one plate
  at(PLATES[0], PLATES[1] - 1); k.use(s, 1, ...PLATES);
  at(1, BOARDS[0][1]);
  check("chopped tomato onto a plate", k.use(s, 1, ...BOARDS[0]).ok && p.hold.on.join() === "tomato");
  at(CRATES.bun[0], 1);
  check("a bun straight from the crate onto the plate", k.use(s, 1, ...CRATES.bun).ok && p.hold.on.join() === "bun,tomato");
  check("…but not a second bun", !k.use(s, 1, ...CRATES.bun).ok);
  // a plate nobody ordered
  s.orders = [{ id: 99, r: "salad", until: s.t + 30, life: 60 }];
  at(WINDOW[0], 1);
  const sc = s.score;
  k.use(s, 1, ...WINDOW);
  check("a plate nobody ordered scores nothing, and is gone", s.score === sc && !p.hold && s.orders.length === 1);
  // reach
  at(4, 4 - 3);
  check("a counter out of reach can't be used", k.use(s, 1, 0, 7).why === "far");
  // an order served quickly earns a tip
  const s2 = k.createSide(3, { players: [1], durMs: 120000 });
  s2.orders = [{ id: 1, r: "salad", until: 60, life: 60 }];
  const p2 = s2.players.get(1);
  p2.hold = { k: "plate", s: "", p: 0, on: ["lettuce", "tomato"] };
  p2.x = WINDOW[0] + 0.5; p2.y = 1.5;
  k.use(s2, 1, ...WINDOW);
  check("a plate handed in at once earns the tip", s2.score === 40 + 20 && s2.served === 1, `${s2.score}`);
  // orders run out
  const s3 = k.createSide(3, { players: [1], durMs: 120000 });
  for (let t = 0; t < 90; t += DT) k.step(s3, DT);
  check("orders nobody makes run out", s3.missed > 0 && s3.score === 0);
}

// ── where the phone says you are ─────────────────────────────────────────────
{
  const s = k.createSide(3, { players: [1], durMs: 120000 });
  const p = s.players.get(1);
  let now = 1000;
  k.report(s, 1, { x: p.x, y: p.y, fx: 0, fy: 1 }, now);
  now += 100;
  const snap1 = k.report(s, 1, { x: p.x + 0.3, y: p.y, fx: 1, fy: 0 }, now);
  check("a step at walking pace is taken", !snap1 && Math.abs(p.x - 2.8) < 1e-9 && p.fx === 1);
  now += 100;
  const snap2 = k.report(s, 1, { x: 0.5, y: 2.5, fx: -1, fy: 0 }, now);
  check("a phone that says its chef is inside a counter is put back", !!snap2 && k.canAt(p.x, p.y));
  now += 100;
  const before = p.x;
  k.report(s, 1, { x: 6.5, y: 2.5 }, now);
  check("a jump across the kitchen is refused", p.x - before < 1 && p.x > before);
  const v = k.view(s);
  check("what travels is small", JSON.stringify(v).length < 2000, `${JSON.stringify(v).length} bytes`);
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
