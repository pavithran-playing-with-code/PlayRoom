// scripts/check-moving.mjs — Moving Day's rules (src/components/together/movingCore.mjs)
// with no server and no phone: bots walk the house, carry everything to the
// van (the big things two at a time), throw, get knocked by the dog, and
// empty house after house.
//   node scripts/check-moving.mjs
import * as M from "../src/components/together/movingCore.mjs";

let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const DT = M.TICK_MS / 1000;

// walkable tile path (BFS) from (x, y) to the tile holding (gx, gy)
function path(x, y, gx, gy) {
  const key = (a, b) => a * 100 + b;
  const start = [Math.floor(x), Math.floor(y)], goal = [Math.floor(gx), Math.floor(gy)];
  const prev = new Map([[key(...start), null]]);
  const q = [start];
  while (q.length) {
    const [cx, cy] = q.shift();
    if (cx === goal[0] && cy === goal[1]) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (M.solid(nx, ny) || nx < 0 || ny < 0 || nx >= M.W || ny >= M.H || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), [cx, cy]);
      q.push([nx, ny]);
    }
  }
  const out = [];
  let at = goal;
  if (!prev.has(key(...goal))) return null;
  while (at) { out.unshift([at[0] + 0.5, at[1] + 0.5]); at = prev.get(key(...at)); }
  return out;
}

// one tick of walking towards (gx, gy) for mover pid, reported like a phone
function walkTo(s, pid, gx, gy, now) {
  const p = s.players.get(pid);
  const way = path(p.x, p.y, gx, gy);
  if (!way) return true;
  const tgt = way.length > 1 ? way[1] : [gx, gy];
  const last = way.length <= 2;
  const [tx, ty] = last ? [gx, gy] : tgt;
  const dx = tx - p.x, dy = ty - p.y, l = Math.hypot(dx, dy);
  if (l < 0.08 && last) return true;
  const sp = M.speedOf(s, pid) * DT, k = Math.min(1, sp / (l || 1));
  const [nx, ny] = M.slide(p.x, p.y, dx * k, dy * k);
  M.report(s, pid, { x: nx, y: ny, fx: dx / (l || 1), fy: dy / (l || 1) }, now);
  return false;
}

const VAN = [11.5, 9.5];

// a crew of bots empties houses for `secs` seconds; returns the side
function crew(seed, ids, secs) {
  const s = M.createSide(seed, { players: ids, durMs: secs * 1000 });
  let now = 1000;
  const job = new Map();               // pid -> { it, e } it is going for
  for (let t = 0; t < secs; t += DT) {
    now += M.TICK_MS;
    for (const pid of ids) {
      const p = s.players.get(pid);
      if (p.hold != null) {
        const it = s.items.find((x) => x.id === p.hold);
        if (!it) { p.hold = null; continue; }
        if (M.KINDS[it.k].big) {
          const mates = it.by.filter((x) => x != null);
          // a big thing waits for its second carrier, if there is one free
          if (ids.length > 1 && mates.length < 2 && t % 30 < 25) continue;
        }
        walkTo(s, pid, VAN[0], VAN[1], now);
        continue;
      }
      // pick a job: the nearest thing nobody's going for (a big thing's free end)
      let j = job.get(pid);
      if (j && (j.it.gone || (M.KINDS[j.it.k].big ? j.it.by[j.e] != null : j.it.by.length))) j = null;
      if (!j) {
        let best = null, bd = 1e9;
        for (const it of s.items) {
          if (it.gone || it.fly) continue;
          const taken = [...job.values()].filter((v) => v.it === it).map((v) => v.e);
          if (M.KINDS[it.k].big) {
            M.ends(it).forEach(([ex, ey], e) => {
              if (it.by[e] != null || taken.includes(e)) return;
              const d = Math.hypot(ex - p.x, ey - p.y) + (ids.length > 1 ? 0 : 6);
              if (d < bd) { bd = d; best = { it, e }; }
            });
          } else if (!it.by.length && !taken.length) {
            const d = Math.hypot(it.x - p.x, it.y - p.y);
            if (d < bd) { bd = d; best = { it, e: 0 }; }
          }
        }
        j = best;
        if (j) job.set(pid, j); else job.delete(pid);
      }
      if (!j) continue;
      const [gx, gy] = M.KINDS[j.it.k].big ? M.ends(j.it)[j.e] : [j.it.x, j.it.y];
      walkTo(s, pid, gx, gy, now);
      if (Math.hypot(gx - p.x, gy - p.y) < M.REACH * 0.8) M.act(s, pid, { a: "grab" });
    }
    M.step(s, DT);
    s.ev = [];
  }
  return s;
}

// ── the house ────────────────────────────────────────────────────────────────
{
  const s = M.createSide(7, { players: [1], durMs: 120000 });
  check("the house is 16 × 11 and every row is whole", M.W === 16 && M.H === 11 && M.LAYOUT.every((r) => r.length === 16));
  check("small things and three big ones in the first house", s.items.filter((i) => M.KINDS[i.k].big).length === 3 && s.items.length >= 11, String(s.items.length));
  const every = s.items.every((it) => M.KINDS[it.k].big ? M.ends(it).every(([x, y]) => path(4.5, 3.4, x, y)) : path(4.5, 3.4, it.x, it.y));
  check("everything can be walked up to", every);
  check("the van can be walked to", !!path(4.5, 3.4, VAN[0], VAN[1]));
  const a = JSON.stringify(M.createSide(9, { players: [1], durMs: 1 }).items.map((i) => [i.k, i.x, i.y]));
  const b = JSON.stringify(M.createSide(9, { players: [5, 6], durMs: 1 }).items.map((i) => [i.k, i.x, i.y]));
  check("same seed, same house — whoever's in it", a === b);
}

// ── hands ────────────────────────────────────────────────────────────────────
{
  const s = M.createSide(3, { players: [1], durMs: 60000 });
  const p = s.players.get(1);
  const box = s.items.find((i) => i.k === "box");
  p.x = box.x; p.y = box.y + 0.5;
  check("grab what's in reach", M.act(s, 1, { a: "grab" }).ok && p.hold === box.id);
  check("carrying something small is a little slower", M.speedOf(s, 1) < M.SPEED);
  M.act(s, 1, { a: "grab" });
  check("Grab again puts it down", p.hold === null && box.by.length === 0);
  p.x = 8.5; p.y = 9.5;
  box.x = 8.5; box.y = 9.8;
  M.act(s, 1, { a: "grab" });
  M.step(s, DT);
  check("carried into the van, it's loaded and scores", box.gone && s.score === 10, `score ${s.score}`);
}

// ── throwing ─────────────────────────────────────────────────────────────────
{
  const s = M.createSide(3, { players: [1], durMs: 60000 });
  const p = s.players.get(1);
  const lamp = s.items.find((i) => i.k === "lamp");
  p.x = lamp.x; p.y = lamp.y; p.fx = 0; p.fy = 1;
  M.act(s, 1, { a: "grab" });
  check("a fragile thing thrown…", M.act(s, 1, { a: "throw" }).ok);
  for (let i = 0; i < 15; i++) M.step(s, DT);
  check("…breaks", lamp.gone && s.broken === 1 && s.score === 0);

  const s2 = M.createSide(3, { players: [1], durMs: 60000 });
  const q = s2.players.get(1);
  const box = s2.items.find((i) => i.k === "box");
  // stand under the left-hand window (2, 6) and throw out through it
  q.x = 2.5; q.y = 5.4; q.fx = 0; q.fy = 1; box.x = 2.5; box.y = 5.5; box.by = [];
  M.act(s2, 1, { a: "grab" });
  M.act(s2, 1, { a: "throw" });
  for (let i = 0; i < 15; i++) M.step(s2, DT);
  check("a box flies out through an open window", !box.gone && box.y > 7, `y ${box.y.toFixed(2)}`);
  const s3 = M.createSide(3, { players: [1], durMs: 60000 });
  const r = s3.players.get(1);
  const b3 = s3.items.find((i) => i.k === "box");
  r.x = 4.5; r.y = 3.5; r.fx = 0; r.fy = -1; b3.x = 4.5; b3.y = 3.4; b3.by = [];
  M.act(s3, 1, { a: "grab" });
  M.act(s3, 1, { a: "throw" });
  for (let i = 0; i < 15; i++) M.step(s3, DT);
  check("…but not through a wall", b3.y > 1 && b3.y < 3.5, `y ${b3.y.toFixed(2)}`);
  const s4 = M.createSide(3, { players: [1], durMs: 60000 });
  const u = s4.players.get(1);
  const b4 = s4.items.find((i) => i.k === "box");
  u.x = 10.5; u.y = 7.5; u.fx = 0; u.fy = 1; b4.x = 10.5; b4.y = 7.5; b4.by = [];
  M.act(s4, 1, { a: "grab" });
  M.act(s4, 1, { a: "throw" });
  for (let i = 0; i < 15; i++) M.step(s4, DT);
  check("a box thrown into the van is loaded", b4.gone && s4.score === 10);
}

// ── big things ───────────────────────────────────────────────────────────────
{
  const s = M.createSide(3, { players: [1, 2], durMs: 60000 });
  const sofa = s.items.find((i) => i.k === "sofa");
  const [e0, e1] = M.ends(sofa);
  const a = s.players.get(1), b = s.players.get(2);
  [a.x, a.y] = e0; [b.x, b.y] = e1;
  M.act(s, 1, { a: "grab" });
  check("one end alone: dragged, slowly", a.hold === sofa.id && M.speedOf(s, 1) === M.SPEED * M.SLOW_ALONE);
  M.act(s, 2, { a: "grab" });
  check("both ends: carried, faster", b.hold === sofa.id && b.end !== a.end && M.speedOf(s, 1) === M.SPEED * M.SLOW_PAIR);
  check("a big thing can't be thrown", !M.act(s, 1, { a: "throw" }).ok);
  a.x += 0.5; b.x += 0.5;
  M.step(s, DT);
  check("it moves between its carriers", Math.abs(sofa.x - (a.x + b.x) / 2) < 1e-6);
}

// ── Biscuit ──────────────────────────────────────────────────────────────────
{
  const s = M.createSide(3, { players: [1], durMs: 60000 });
  const p = s.players.get(1);
  const tv = s.items.find((i) => i.k === "tv");
  p.x = tv.x; p.y = tv.y;
  M.act(s, 1, { a: "grab" });
  p.x = s.dog.x; p.y = s.dog.y;
  M.step(s, DT);
  check("walk into the dog with the telly: dropped, and broken", tv.gone && s.broken === 1 && p.hold === null);
}

// ── whole matches ────────────────────────────────────────────────────────────
for (const seed of [11, 42, 77]) {
  const s = crew(seed, [1], 300);
  check(`seed ${seed}: one mover empties the first house in five minutes`, s.houses >= 1, `houses ${s.houses}, loaded ${s.loaded}, score ${s.score}, stars ${M.stars(s)}`);
}
for (const seed of [11, 42]) {
  const s = crew(seed, [1, 2], 300);
  check(`seed ${seed}: two movers do more`, s.houses >= 2, `houses ${s.houses}, loaded ${s.loaded}, score ${s.score}, stars ${M.stars(s)}`);
}
{
  const s = crew(5, [1], 120);
  check("two minutes alone earns a star", M.stars(s) >= 1, `score ${s.score} / line ${s.line.join(",")}`);
  const v = M.view(s);
  check("the view carries movers, things, the dog and the score", v.p.length === 1 && v.i.length > 0 && v.d.length === 5 && v.sc === s.score);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
