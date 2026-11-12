// scripts/check-sneak.mjs — Shadow Sneak's rules (src/components/games/sneakSim.js).
//
//   node scripts/check-sneak.mjs          (NS=40 for more seeds)
//
// For many seeds and every kind of level it builds the maze, plans a route
// from each corner to the lighthouse that is never in the light (a search
// over squares and time — walking upright, ducking while it waits — with a
// wider beam than the real one),
// then walks that route through the real rules and expects to arrive unseen.
// Also: the same seed gives the same maze; corners and bells are in
// shadow; a bell holds the lamp and it goes back to its round; being spotted
// sends you back to your corner.
import { buildLevel, newRun, step, sees, roundAngle, lampTurn, sizeFor, OPEN, HALF, RUN, TOUCH, GRACE_S, DOWN_S, HEAT_S, HEAT_X } from "../src/components/games/sneakSim.js";

const NS = Number(process.env.NS || 12);
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra !== "" ? "  " + extra : ""}`); };
const wrap = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };

const TAU = 0.1, MOVE = 4;             // a square every 0.4 s: slower than a run, so the walk can keep up
const MARGIN = 0.1;                    // the planner's beam is this much wider each side
function plan(W, seat) {
  const n = W.n, st = W.starts[seat], tx = W.c + 0.5, tz = W.c + 0.5;
  const vis = new Map();
  // seen here, or a step to any side of here: the walk is never exactly on the line
  const seen = (x, z) => {
    const k = Math.round(x * 4) + Math.round(z * 4) * 1000;
    if (!vis.has(k)) vis.set(k, [[0, 0], [0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]].some(([ox, oz]) => W.cells[Math.floor(z + oz) * W.n + Math.floor(x + ox)] === OPEN && sees(W, x + ox, z + oz, false)));
    return vis.get(k);
  };
  // waiting, the bot ducks (a low wall hides it then); walking, it stands
  const visD = new Map();
  const seenDucked = (x, z) => {
    const k = Math.round(x * 4) + Math.round(z * 4) * 1000;
    if (!visD.has(k)) visD.set(k, [[0, 0], [0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]].some(([ox, oz]) => W.cells[Math.floor(z + oz) * W.n + Math.floor(x + ox)] === OPEN && sees(W, x + ox, z + oz, true)));
    return visD.get(k);
  };
  const litAt = (x, z, t, still = false) => {
    const a = Math.atan2(z - tz, x - tx), b0 = roundAngle(W, t);
    for (let k = 0; k < W.beams; k++) if (Math.abs(wrap(a - b0 - (k * Math.PI * 2) / W.beams)) < HALF + MARGIN) return still ? seenDucked(x, z) : seen(x, z);
    return false;
  };
  const K = 1800, k0 = 3;
  const from = new Map();
  let layer = new Map([[Math.floor(st.z) * n + Math.floor(st.x), null]]);
  const layers = [];
  // layers[k]: squares we can be standing in at step k (arrivals MOVE steps later are added ahead)
  const pend = Array.from({ length: K + MOVE + 1 }, () => new Map());
  pend[k0] = layer;
  for (let k = k0; k < K; k++) {
    const cur = pend[k];
    layers[k] = cur;
    if (!cur.size) continue;
    const t = k * TAU;
    for (const [cell] of cur) {
      const cx = cell % n, cz = Math.floor(cell / n);
      if (W.dist[cell] === 0) return { k, cell, pend };
      // wait
      if (!litAt(cx + 0.5, cz + 0.5, t + TAU, true) && !pend[k + 1].has(cell)) pend[k + 1].set(cell, [cell, k]);
      // walk
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz, nc = nz * n + nx;
        if (W.cells[nc] !== OPEN || pend[k + MOVE].has(nc)) continue;
        let ok = true;
        for (let s = 1; s <= MOVE && ok; s++) if (litAt(cx + 0.5 + (dx * s) / MOVE, cz + 0.5 + (dz * s) / MOVE, t + s * TAU)) ok = false;
        if (ok) pend[k + MOVE].set(nc, [cell, k]);
      }
    }
  }
  return null;
}
function route(W, found) {
  const pts = [];
  let cell = found.cell, k = found.k;
  while (cell != null) {
    pts.push({ k, x: (cell % W.n) + 0.5, z: Math.floor(cell / W.n) + 0.5 });
    const p = found.pend[k].get(cell);
    if (!p) break;
    [cell, k] = p;
  }
  return pts.reverse();
}
function walk(W, seat, pts) {
  const S = newRun(W, seat, 0), dt = 1 / 60;
  let T = 0, i = 0;
  while (T < pts[pts.length - 1].k * TAU + 3 && !S.in) {
    while (i < pts.length - 1 && pts[i + 1].k * TAU <= T) i++;
    const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
    const f = b.k > a.k ? Math.max(0, Math.min(1, (T - a.k * TAU) / ((b.k - a.k) * TAU))) : 1;
    // a wait is a step to the same square: stand on it, ducked
    const waiting = a.x === b.x && a.z === b.z && i < pts.length - 1;
    const wx = a.x + (b.x - a.x) * f, wz = a.z + (b.z - a.z) * f;
    let mx = (wx - S.x) / (RUN * 0.06), mz = (wz - S.z) / (RUN * 0.06);
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    step(S, W, { mx, mz, duck: waiting && m < 0.2 }, dt, T);
    T += dt;
  }
  return { S, T };
}

// ── every kind of level can be beaten, unseen, from every corner ──
const times = {};
let planned = 0, unplanned = [], arrived = 0, spotted = 0, walked = 0; const bad = [];
for (let s = 0; s < NS; s++) {
  const seed = 1000 + s * 7717;
  for (const level of [0, 1, 2, 3, 4, 6, 8]) {
    const W = buildLevel(seed, level, { players: (s % 3) * 2 + 1 });      // alone, three and five in the room
    for (let seat = 0; seat < 4; seat++) {
      const found = plan(W, seat);
      if (!found) { unplanned.push(`${seed}/L${level}/c${seat}`); continue; }
      planned++;
      (times[level] = times[level] || []).push(found.k * TAU);
      const { S } = walk(W, seat, route(W, found));
      walked++;
      if (S.in) arrived++;
      if (S.spots || !S.in) { spotted += S.spots ? 1 : 0; bad.push(`${seed}/L${level}/c${seat}`); }
    }
  }
}
const total = NS * 7 * 4;
check("a safe route exists from every corner of every maze", planned === total, `${planned}/${total}${unplanned.length ? " missing " + unplanned.slice(0, 6).join(" ") : ""}`);
check("walking it through the real rules reaches the lighthouse", arrived === walked, `${arrived}/${walked}`);
check("...without being spotted once", spotted === 0, `${spotted} walks were spotted ${bad.slice(0, 5).join(" ")}`);
for (const l of Object.keys(times)) { const a = times[l].sort((x, y) => x - y); console.log(`      level ${l} (${sizeFor(Number(l))}×${sizeFor(Number(l))}): quickest safe route ${a[0].toFixed(0)}–${a[a.length - 1].toFixed(0)} s, middle ${a[a.length >> 1].toFixed(0)} s`); }

// ── the maze itself ──
{
  const A = buildLevel(4242, 3), B = buildLevel(4242, 3), C = buildLevel(4243, 3);
  check("the same seed builds the same maze", A.cells.join() === B.cells.join() && A.phase === B.phase && JSON.stringify(A.starts) === JSON.stringify(B.starts));
  check("another seed builds another", A.cells.join() !== C.cells.join());
  let ok = true, flags = 0, bells = 0, lows = 0;
  for (let s = 0; s < NS; s++) for (const level of [0, 2, 4, 7]) {
    const W = buildLevel(77 + s * 131, level, { coop: true });
    for (const p of W.starts) if (sees(W, p.x, p.z, false) || p.d < 4) ok = false;
    for (const p of [...W.checks, ...W.bells]) if (sees(W, p.x, p.z, false)) ok = false;
    for (const b of W.bells) if (W.checks.some((k) => k.x === b.x && k.z === b.z)) ok = false;
    flags += W.checks.length; bells += W.bells.length;
    if (level >= 2) lows += W.cells.filter((c) => c === 1).length;
    if (W.dist.some((d, i) => W.cells[i] === OPEN && d < 0)) ok = false;       // every open square reaches the lamp
  }
  check("corners, flags and bells are all in shadow; every square reaches the lamp", ok);
  check("every maze has flags, and (together) bells", flags >= NS * 4 * 3 && bells >= NS * 4 * 2, `${flags} flags, ${bells} bells`);
  check("low walls come in from the third maze", lows > 0 && buildLevel(5, 0).cells.every((c) => c !== 1));
  check("alone or against each other: no bells", buildLevel(5, 2).bells.length === 0);
}

// ── spotted: back to your corner; a low wall hides you only ducked ──
{
  const W = buildLevel(99, 0), S = newRun(W, 0, 0);
  // stand in the open by the lamp, with the beam on us
  S.x = W.c + 0.5 - 1.5; S.z = W.c + 0.5 - 1.5; S.grace = 0;
  const a = Math.atan2(S.z - (W.c + 0.5), S.x - (W.c + 0.5));
  const T = (a - W.phase) / W.omega;                  // the time its round points here
  S.b0 = a;
  let ev = [];
  for (let i = 0; i < 30 && !S.down; i++) ev = ev.concat(step(S, W, { mx: 0, mz: 0 }, 1 / 60, T));
  check("in the beam with nothing between: spotted in about a third of a second", S.down > 0 && S.spots === 1 && ev.some((e) => e.k === "spotted"));
  for (let i = 0; i < 80; i++) ev = ev.concat(step(S, W, { mx: 0, mz: 0 }, 1 / 60, T));
  check("...then back in your corner (no flag taken yet), safe for a moment", S.x === W.starts[0].x && S.z === W.starts[0].z && S.grace > 0 && ev.some((e) => e.k === "back"));
  check("the wait is short", DOWN_S <= 1 && GRACE_S >= 1.5);
  // a flag: walk over it and it's yours; spotted, you're back at it
  {
    const F = buildLevel(99, 0), R2 = newRun(F, 0, 0), k = F.checks[0];
    R2.x = k.x; R2.z = k.z;
    const e1 = step(R2, F, { mx: 0, mz: 0 }, 1 / 60, 0);
    R2.x = F.c + 0.5 - 1.5; R2.z = F.c + 0.5 - 1.5; R2.grace = 0;
    const a2 = Math.atan2(R2.z - (F.c + 0.5), R2.x - (F.c + 0.5)), T2 = (a2 - F.phase) / F.omega;
    R2.b0 = a2;
    for (let i = 0; i < 120; i++) step(R2, F, { mx: 0, mz: 0 }, 1 / 60, T2);
    check("a flag you walk over is yours, and spotted you're back at it", e1.some((e) => e.k === "flag" && e.i === k.i) && R2.cp === k.i && R2.spots === 1 && R2.x === k.x && R2.z === k.z);
  }
  // the lamp turning the other way, and a crowd
  {
    const A = buildLevel(1234, 3), B = buildLevel(1234, 3, { players: 4 }), E = buildLevel(1234, 0);
    const t0 = A.turns[0];
    const before = roundAngle(A, t0) - roundAngle(A, t0 - 1), after = roundAngle(A, t0 + 1) - roundAngle(A, t0);
    check("from the third maze the lamp turns the other way now and then", A.turns.length > 50 && before > 0 && after < 0 && Math.abs(before + after) < 1e-9 && E.turns.length === 0);
    check("...with a flicker of warning first", lampTurn(A, t0 - 0.4).warn > 0.3 && lampTurn(A, t0 - 2).warn === 0 && lampTurn(A, t0 - 0.1).dir === 1 && lampTurn(A, t0 + 0.1).dir === -1);
    check("more players in the room: a faster lamp, the same maze", B.omega > A.omega * 1.1 && B.cells.join() === A.cells.join());
  }
  // a low wall: build one between the lamp and a spot
  const L = buildLevel(99, 0);
  const x = L.c + 0.5 + 3, z = L.c + 0.5;
  for (let cx = L.c + 1; cx <= L.c + 4; cx++) L.cells[L.c * L.n + cx] = OPEN;
  L.cells[L.c * L.n + L.c + 2] = 1;
  check("a low wall hides you only when you duck", sees(L, x, z, false) && !sees(L, x, z, true));
  L.cells[L.c * L.n + L.c + 2] = 2;
  check("a tall wall hides you standing", !sees(L, x, z, false));
}

// ── together: a bell holds the lamp, and it goes back to its round; heat ──
{
  const W = buildLevel(31337, 1, { coop: true }), S = newRun(W, 0, 0);
  let T = 0;
  for (let i = 0; i < 240; i++) { step(S, W, { mx: 0, mz: 0 }, 1 / 60, T, 0); T += 1 / 60; }
  check("a friend on a bell: the lamp turns to look at it and stays", Math.abs(wrap(S.b0 - W.bells[0].a)) < 0.01 && S.held);
  for (let i = 0; i < 360; i++) { step(S, W, { mx: 0, mz: 0 }, 1 / 60, T, -1); T += 1 / 60; }
  check("...let go, it's back on its round within a few seconds", Math.abs(wrap(S.b0 - roundAngle(W, T - 1 / 60))) < 0.03 && !S.held);
  const cold = roundAngle(W, 20), hot = roundAngle(W, 20, [10]);
  check("someone spotted: the lamp turns faster for a while, then as before", hot > cold && Math.abs((roundAngle(W, 30, [10]) - roundAngle(W, 20 + 0, [10])) - W.omega * 10) < 1e-9 && Math.abs(hot - cold - W.omega * HEAT_X * HEAT_S) < 1e-9);
  check("reaching the lamp: you're in", (() => { const s2 = newRun(W, 0, 0); s2.x = W.c + 0.5 - 1; s2.z = W.c + 0.5; const e = step(s2, W, { mx: 0, mz: 0 }, 1 / 60, 0); return s2.in && e.some((x) => x.k === "in") && TOUCH > 1; })());
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
