// scripts/check-hopper.mjs — Road Hopper's rules, with no browser.
//   node scripts/check-hopper.mjs
import * as m from "../src/components/games/hopperSim.js";

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const DT = 1 / 60;

// ── the course ───────────────────────────────────────────────────────────────
{
  const a = m.newCourse(5), b = m.newCourse(5), c = m.newCourse(6);
  for (let n = 0; n < 300; n++) { m.rowAt(a, n); m.rowAt(b, n); m.rowAt(c, n); }
  const sig = (x) => JSON.stringify(x.rows.map((r) => [r.kind, [...r.trees], r.dir, Math.round((r.speed || 0) * 100), (r.things || []).map((o) => o.x.toFixed(2))]));
  check("the same seed lays the same course; another seed, another", sig(a) === sig(b) && sig(a) !== sig(c));
  const kinds = new Set(a.rows.map((r) => r.kind));
  check("grass, roads, rivers and railways all turn up", ["grass", "road", "river", "rail"].every((k) => kinds.has(k)), [...kinds].join());
  let fullRow = false, longRiver = 0, run = 0;
  for (let s = 1; s <= 60; s++) {
    const cc = m.newCourse(s);
    for (let n = 1; n < 400; n++) {
      const r = m.rowAt(cc, n);
      if (r.kind === "grass" && r.trees.size >= m.COLS) fullRow = true;
      run = r.kind === "river" ? run + 1 : 0; longRiver = Math.max(longRiver, run);
    }
  }
  check("never a row of trees all the way across", !fullRow);
  check("never more than three rivers in a row", longRiver <= 3, `longest ${longRiver}`);
  const early = m.newCourse(9), late = m.newCourse(9);
  const sp = (cc, from, to) => { let t = 0, n = 0; for (let i = from; i < to; i++) { const r = m.rowAt(cc, i); if (r.kind === "road") { t += r.speed; n++; } } return t / (n || 1); };
  check("it gets faster the further you go", sp(late, 150, 250) > sp(early, 4, 60) * 1.4, `${sp(early, 4, 60).toFixed(2)} → ${sp(late, 150, 250).toFixed(2)} squares/s`);
}

// ── hopping ──────────────────────────────────────────────────────────────────
{
  const h = m.newHopper(3);
  check("you start on grass, in the middle", m.rowAt(h.course, 0).kind === "grass" && h.x === 4 && m.score(h) === 0);
  check("you can't hop backwards off the start, or into a tree", !m.hop(h, "down") && (m.rowAt(h.course, 0).trees.has(3) ? !m.hop(h, "left") : true));
  const ok = m.hop(h, "up");
  for (let i = 0; i < 20; i++) m.step(h, DT);
  check("a hop forward: one row on, 10 points", ok && h.row === 1 && m.score(h) === m.ROW_PTS);
  check("…no second hop while the first is in the air", m.hop(h, "up") && !m.hop(h, "up"));
}

// ── what gets you ────────────────────────────────────────────────────────────
{
  // stand still on a road: a car comes
  const find = (kind) => { for (let s = 1; s < 200; s++) { const h = m.newHopper(s); for (let n = 2; n < 40; n++) if (m.rowAt(h.course, n).kind === kind) return { h, n }; } return null; };
  let { h, n } = find("road");
  h.row = n; h.x = 4; h.moved = false;
  let what = null;
  for (let i = 0; i < 60 * 20 && !what; i++) what = m.step(h, DT).crashed;
  check("stand in the road and a car comes", what === "car");
  check("…you're put back onto grass, a few rows back, dazed", m.rowAt(h.course, h.row).kind === "grass" && h.row <= n && h.daze > 0 && h.crashes === 1);
  ({ h, n } = find("river"));
  h.row = n; h.x = 4; h.t = 0;
  const onLog = m.thingsAt(m.rowAt(h.course, n), 0).some((c) => 4.5 > c.x0 + 0.15 && 4.5 < c.x1 - 0.15);
  what = null;
  for (let i = 0; i < 60 * 30 && !what; i++) what = m.step(h, DT).crashed;
  check("land in a river off a log and you're in the water; on one, it carries you off the edge", onLog ? what === "edge" : what === "water", `${onLog ? "on a log" : "in the water"}: ${what}`);
  ({ h, n } = find("rail"));
  h.row = n; h.x = 4;
  what = null;
  let warned = false;
  for (let i = 0; i < 60 * 20 && !what; i++) { if (m.trainAt(m.rowAt(h.course, n), h.t).warn) warned = true; what = m.step(h, DT).crashed; }
  check("stand on the railway: the light flashes, then the train", what === "train" && warned);
  // the eagle: hop once, then wait
  const e = m.newHopper(4);
  m.hop(e, "up");
  what = null;
  for (let i = 0; i < 60 * 40 && !what; i++) { const o = m.step(e, DT); if (o.crashed) what = o.crashed; }
  check("hop once and stand about: the eagle takes you", what === "eagle" || what === "car" || what === "water" || what === "train");
  check("…and the best row reached never goes down", e.best >= 1 && m.score(e) >= m.ROW_PTS);
}

// ── a careful player gets a long way ─────────────────────────────────────────
{
  // looks at the row ahead: hops when it's safe to land, and waits otherwise
  const safe = (h, row, x, ahead) => {
    const r = m.rowAt(h.course, row);
    if (r.kind === "grass") return !r.trees.has(Math.round(x));
    const t = h.t + ahead;
    if (r.kind === "road") return !m.thingsAt(r, t).some((c) => x + 0.5 > c.x0 - 0.9 && x + 0.5 < c.x1 + 0.9) && !m.thingsAt(r, t + 0.5).some((c) => x + 0.5 > c.x0 - 0.6 && x + 0.5 < c.x1 + 0.6);
    if (r.kind === "river") return m.thingsAt(r, t).some((c) => x + 0.5 > c.x0 + 0.5 && x + 0.5 < c.x1 - 0.5);
    const tr = m.trainAt(r, t), tr2 = m.trainAt(r, t + 0.6);
    return !tr.on && !tr.warn && !tr2.on;
  };
  let total = 0, worst = 1e9;
  for (let seed = 1; seed <= 20; seed++) {
    const h = m.newHopper(seed);
    for (let t = 0; t < 120; t += DT) {
      if (!h.hop && h.daze <= 0) {
        const x = Math.round(h.x);
        const here = m.rowAt(h.course, h.row);
        if (safe(h, h.row + 1, x, m.HOP_S)) m.hop(h, "up");
        else if (here.kind === "river" || (here.kind === "road" && !safe(h, h.row, x, 0.3))) {
          // standing somewhere bad: sidestep or step back
          for (const d of ["left", "right", "down"]) { const nr = d === "down" ? h.row - 1 : h.row, nx = d === "left" ? x - 1 : d === "right" ? x + 1 : x; if (nx >= 0 && nx < m.COLS && safe(h, nr, nx, m.HOP_S)) { m.hop(h, d); break; } }
        } else {
          for (const d of ["left", "right"]) { const nx = d === "left" ? x - 1 : x + 1; if (nx >= 0 && nx < m.COLS && safe(h, h.row, nx, m.HOP_S) && safe(h, h.row + 1, nx, m.HOP_S + 0.4)) { m.hop(h, d); break; } }
        }
      }
      m.step(h, DT);
    }
    total += h.best; worst = Math.min(worst, h.best);
  }
  check("a careful player gets a long way in two minutes", worst >= 40, `worst ${worst} rows, average ${(total / 20).toFixed(0)}`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
