// scripts/check-tower.mjs — Sunshard Jump's Sky Tree, with no browser.
//
//   node scripts/check-tower.mjs          (a few minutes; NB=3 for a quick run, TV=1 to see each climb)
//
// Builds the tree from many seeds and checks every jump on the way up is a
// jump (edge gap and rise), that no stone sits inside another, that the
// Sunshards are reachable, and that a simple bot — run at the next stone, jump
// at the edge, double-jump on the way down — climbs every tree to the Crown,
// faster than its Gloom rises.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "src", "components", "games");
const { buildTower, towerCode, gloomAt, summitOf, BANDS, bandAt, startClimb, fallBack } = await import(pathToFileURL(path.join(src, "towerWorld.js")).href);
const { newRun, step, pressJump, releaseJump } = await import(pathToFileURL(path.join(src, "sunshardSim.js")).href);
const { blinkLeft } = await import(pathToFileURL(path.join(src, "sunshardWorld.js")).href);

let fails = 0;
const check = (name, ok, note = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${note ? `  (${note})` : ""}`); if (!ok) fails++; };
const dt = 1 / 120;

// ── the shape ────────────────────────────────────────────────────────────────
const N = 30;
let badGap = [], badRise = [], overlap = [], stones = 0, shards = 0, minPath = 1e9, maxPath = 0;
for (let s = 1; s <= N; s++) {
  for (const rd of [0, 2, 4]) {
    const W = buildTower(towerCode(s * 7919, rd), rd);
    minPath = Math.min(minPath, W.path.length); maxPath = Math.max(maxPath, W.path.length);
    stones += W.plats.length; shards += W.shards.length;
    for (let k = 2; k < W.path.length; k++) {
      const a = W.plats[W.path[k - 1]], b = W.plats[W.path[k]];
      const edge = Math.hypot(a.bx - b.bx, a.bz - b.bz) - a.r - b.r;
      const lim = a.kind === "mover" || b.kind === "mover" ? 3.5 : 4.05;
      if (edge > lim || edge < 1.0) badGap.push(`seed ${s} rd ${rd} #${k} ${a.kind}→${b.kind} gap ${edge.toFixed(2)}`);
      const rise = b.by - a.by, rlim = a.kind === "lift" ? 5.7 : a.kind === "spring" ? 4.8 : 1.35;
      if (rise > rlim || rise < -0.01) badRise.push(`seed ${s} rd ${rd} #${k} ${a.kind}→${b.kind} rise ${rise.toFixed(2)}`);
    }
    for (let i = 0; i < W.plats.length; i++) for (let j = i + 1; j < W.plats.length; j++) {
      const a = W.plats[i], b = W.plats[j];
      if (a.kind === "trunk" || b.kind === "trunk" || a.zone === -1 || b.zone === -1) continue;
      if (W.crown && (i === W.crown.p || j === W.crown.p)) continue;
      const d = Math.hypot(a.bx - b.bx, a.bz - b.bz) - a.r - b.r - (a.kind === "mover" ? a.amp : 0) - (b.kind === "mover" ? b.amp : 0);
      if (d < 0.6 && Math.abs(a.by - b.by) < 3.2) overlap.push(`seed ${s} rd ${rd} ${i}/${j} ${d.toFixed(2)} dy ${(a.by - b.by).toFixed(1)}`);
    }
    // nothing on the spiral inside the tree
    for (const p of W.plats) if (p.kind !== "trunk" && p.zone !== -1 && p !== W.plats[W.crown.p] && Math.hypot(p.bx, p.bz) - p.r < W.trunk.r + 0.8) overlap.push(`seed ${s} rd ${rd} stone ${p.i} in the trunk`);
  }
}
check(`every jump up the spiral is a jump (${N * 3} trees, ${minPath}–${maxPath} stones to the Crown)`, !badGap.length, badGap.slice(0, 5).join("; "));
check("every rise is one you can make", !badRise.length, badRise.slice(0, 5).join("; "));
check("no stone sits in another, or in the tree", !overlap.length, overlap.slice(0, 5).join("; "));
check("there are Sunshards on the way up", shards / (N * 3) >= 8, `${(shards / (N * 3)).toFixed(1)} a tree`);
const W0 = buildTower(towerCode(1, 0), 0);
check("the bands go bottom to top", bandAt(0) === 0 && bandAt(W0.summit) === BANDS.length - 1);
check("the Gloom waits, then rises faster and faster", gloomAt(5) === gloomAt(0) && gloomAt(200) - gloomAt(190) > gloomAt(60) - gloomAt(50));
check("a later tree is taller", summitOf(3) > summitOf(0));

// ── a bot climbs it ─────────────────────────────────────────────────────────
function bot(W, maxS = 900) {
  const S = startClimb(newRun(W), W), P = S.pl, crownAt = W.path.length - 1;
  let doubled = false, lastJumpT = -1, t = 0, falls = 0, caughtAt = null;
  while (t < maxS && S.maxPath < crownAt) {
    t += dt;
    // the stone I'm on (or last stood on) along the path, and the next one
    const on = P.onG && P.gp !== null ? W.path.indexOf(P.gp) : -1;
    let last = on >= 0 ? on : S._last ?? 0;
    // carried up by a vent or a mushroom without landing on it: it's behind me now
    const nk = W.plats[W.path[last + 1]], nq = S.plats[W.path[last + 1]];
    if (!P.onG && (nk.kind === "lift" || nk.kind === "spring") && (P.vy > 11 || S.inLift) && P.y > nq.y + 0.5 && Math.hypot(P.x - nq.x, P.z - nq.z) < nk.r) last++;
    S._last = last;
    const ci = W.path[last], cur = W.plats[ci], cq = S.plats[ci];
    const tgt = W.plats[W.path[last + 1]], tq = S.plats[W.path[last + 1]];
    let mx = 0, mz = 0;
    const dxT = tq.x - P.x, dzT = tq.z - P.z, dT = Math.hypot(dxT, dzT) || 1;
    if (P.onG) {
      doubled = false;
      releaseJump(S);
      if (cur.kind === "lift" || cur.kind === "spring") {
        const dc = Math.hypot(cq.x - P.x, cq.z - P.z) || 1;
        if (dc > 0.25) { mx = (cq.x - P.x) / dc; mz = (cq.z - P.z) / dc; }
      } else {
        const edgeGap = Math.hypot(tq.x - cq.x, tq.z - cq.z) - (cur.zone === -1 ? cur.r : cur.r) - tgt.r;
        const L = Math.hypot(tq.x - cq.x, tq.z - cq.z), ex = cq.x + ((tq.x - cq.x) / L) * (cur.r - 0.9), ez = cq.z + ((tq.z - cq.z) / L) * (cur.r - 0.9);
        const waitAtEdge = (tgt.kind === "blink" && blinkLeft(tgt, S.T) < 2.0) || (tgt.kind === "mover" && edgeGap > 2.6);
        if (waitAtEdge) {
          const de = Math.hypot(ex - P.x, ez - P.z) || 1;
          if (de > 0.2) { mx = (ex - P.x) / de; mz = (ez - P.z) / de; }
        } else {
          mx = dxT / dT; mz = dzT / dT;
          const fromMid = Math.hypot(P.x - cq.x, P.z - cq.z);
          const toward = ((P.x - cq.x) * dxT + (P.z - cq.z) * dzT) / dT;
          if (fromMid > cur.r - 0.55 && toward > 0 && t - lastJumpT > 0.3) { pressJump(S); lastJumpT = t; }
        }
      }
    } else {
      const rising = S.inLift || (cur.kind === "spring" && P.vy > 0);
      const aboveTarget = P.y > tq.y + 0.6;
      const underIt = !aboveTarget && dT < tgt.r + 0.8 && P.y < tq.y - 0.2;
      if (!underIt) { mx = dxT / dT; mz = dzT / dT; }
      const farOut = dT > tgt.r - 0.4;
      if (!doubled && P.vy < 0.5 && farOut && P.jumps <= 1 && !rising) { releaseJump(S); pressJump(S); doubled = true; }
      else if (!farOut) releaseJump(S);
      S.inLift = false;
    }
    if (P.onG && S.slimes.some((s) => s.alive && Math.hypot(s.x - P.x, s.z - P.z) < 1.9 && Math.abs(s.y - P.y) < 1.2)) { releaseJump(S); pressJump(S); }
    const ev = step(S, W, { mx, mz }, dt);
    if (fallBack(S, W)) falls++;
    for (const e of ev) if (e.k === "respawn") { falls++; S._last = W.path.indexOf(W.flags[[...S.flags].pop()].p); }
    if (P.onG && P.y > (S._top || 0)) S._top = P.y;
    if (caughtAt === null && P.y < gloomAt(t, W.round) && t > 15) { caughtAt = t; S._caughtY = S._top || 0; }
  }
  return { ok: S.maxPath >= crownAt, t, falls, caughtAt, caughtY: S._caughtY };
}

const NB = Number(process.env.NB || 8);
let up = 0, worst = 0, falls = 0, beatGloom = 0;
const bad = [];
for (let s = 1; s <= NB; s++) {
  const rd = s % 5;
  const W = buildTower(towerCode(s * 104729, rd), rd), r = bot(W, Number(process.env.MAXS || 900));
  if (process.env.TV) console.log(`   tree ${s} rd ${rd}: ${r.ok ? "crown" : "stuck"} ${Math.round(r.t)}s, falls ${r.falls}, caught ${r.caughtAt === null ? "never" : Math.round(r.caughtAt) + "s at " + Math.round(r.caughtY) + " m"}`);
  if (r.ok) { up++; worst = Math.max(worst, r.t); } else bad.push(`seed ${s} rd ${rd}: stuck at ${Math.round(r.t)}s`);
  if (r.caughtAt === null || r.caughtY >= 0.4 * W.summit) beatGloom++;
  falls += r.falls;
}
check(`a simple bot climbs every tree to the Crown (${NB} trees, rounds 0–4)`, up === NB, `${up}/${NB}, slowest ${Math.round(worst)}s, ${falls} falls${bad.length ? " — " + bad.slice(0, 4).join("; ") : ""}`);
check("a steady climber gets 40% of the way up before the Gloom first catches up", beatGloom >= NB * 0.5, `${beatGloom}/${NB}`);

console.log(fails ? `\n${fails} failed` : "\nall good");
process.exit(fails ? 1 : 0);
