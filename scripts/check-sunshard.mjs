// scripts/check-sunshard.mjs — Sunshard Islands' level and rules, with no browser.
//
//   node scripts/check-sunshard.mjs
//
// The same seed builds the same islands; the path keeps its promises (gaps,
// rises, no overlaps); the explorer runs, jumps, double-jumps and glides as
// specified; and a simple bot — run at the next platform, jump at the edge,
// double-jump, glide, ride vents and mushrooms, wait for moving platforms —
// gets through every jump, collects all five Sunshards, opens the gate and
// finishes, on many levels.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "components", "games");
const Wm = await import(pathToFileURL(path.join(src, "sunshardWorld.js")).href);
const Sm = await import(pathToFileURL(path.join(src, "sunshardSim.js")).href);
const { buildWorld, levelCode, SHARDS, ZONES } = Wm;
const { newRun, step, pressJump, releaseJump, spin, score, RUN, JUMP, GRAVITY, tether, tiedTo, LEASH, TAUT_S } = Sm;

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const dt = 1 / 120;                    // two sub-steps at 60 fps

// ── the level ────────────────────────────────────────────────────────────────
const W = buildWorld(levelCode(424242));
check("the same seed builds the same islands", JSON.stringify(buildWorld(levelCode(424242)).plats.map((p) => [p.x, p.y, p.z])) === JSON.stringify(W.plats.map((p) => [p.x, p.y, p.z])));
check("a different seed, different islands", JSON.stringify(buildWorld(levelCode(7)).plats[5]) !== JSON.stringify(W.plats[5]));
const steps = W.path.length - 1;
check("a hub, ~50 platforms and 5 shard islands", steps >= 50 && steps <= 56 && W.shards.length === SHARDS && !!W.temple, `${steps} hops, ${W.shards.length} shards`);
check("a flag on the hub and on every shard island", W.flags.length === 6);
check("twelve pillars round the temple, one of them the gate", W.pillars.length === 12 && W.pillars.filter((p) => p.gate).length === 1);
check("every zone has its own platforms", ZONES.every((_, zi) => W.plats.some((p) => p.zone === zi && !p.island && p.kind !== "pillar")));
let worstGap = 0, worstRise = 0, overlaps = 0;
for (let s = 1; s <= 30; s++) {
  const w = buildWorld(levelCode(s * 7919));
  for (const i of w.path.slice(1)) {
    const p = w.plats[i], f = w.plats[p.from];
    const edge = Math.hypot(p.bx - f.bx, p.bz - f.bz) - p.r - f.r;
    if (f.kind !== "lift" && f.kind !== "spring") { worstGap = Math.max(worstGap, edge); worstRise = Math.max(worstRise, p.by - f.by); }
  }
  const pl = w.plats.filter((p) => p.kind !== "pillar");
  for (let a = 0; a < pl.length; a++) for (let b = a + 1; b < pl.length; b++) {
    const A = pl[a], B = pl[b];
    if (Math.abs(A.by - B.by) < 1.6 && Math.hypot(A.bx - B.bx, A.bz - B.bz) < A.r + B.r - 0.2) overlaps++;
  }
}
check("edge gaps never past 4 m, rises never past 1 m (except after a vent or a mushroom)", worstGap <= 4.01 && worstRise <= 1.01, `worst ${worstGap.toFixed(2)} m, ${worstRise.toFixed(2)} m`);
check("no platform sits inside another", overlaps === 0, `${overlaps}`);

// ── the explorer ─────────────────────────────────────────────────────────────
{
  const S = newRun(W);
  for (let t = 0; t < 1; t += dt) step(S, W, { mx: 1, mz: 0 }, dt);
  check("runs at 7.4", Math.abs(S.pl.speed - RUN) < 0.05, S.pl.speed.toFixed(2));
  pressJump(S);
  let top = 0;
  for (let t = 0; t < 1.2; t += dt) { step(S, W, {}, dt); top = Math.max(top, S.pl.y); }
  check("a full jump: ~2.2 m (10.6² / 2·26)", Math.abs(top - (JUMP * JUMP) / (2 * GRAVITY)) < 0.15, top.toFixed(2));
  const S2 = newRun(W);
  step(S2, W, {}, dt);
  pressJump(S2); for (let t = 0; t < 0.08; t += dt) step(S2, W, {}, dt);
  releaseJump(S2);
  let top2 = 0;
  for (let t = 0; t < 1.2; t += dt) { step(S2, W, {}, dt); top2 = Math.max(top2, S2.pl.y); }
  check("let go early: a shorter hop", top2 < top * 0.7, top2.toFixed(2));
  // double jump then glide
  const S3 = newRun(W);
  step(S3, W, {}, dt);
  pressJump(S3);
  let t = 0;
  for (; t < 0.45; t += dt) step(S3, W, {}, dt);
  releaseJump(S3); step(S3, W, {}, dt); pressJump(S3);
  for (let k = 0; k < 120; k++) step(S3, W, {}, dt);
  check("double jump, then hold to glide: falls at 2.5 m/s", S3.pl.jumps === 2 && S3.pl.gliding && Math.abs(S3.pl.vy + 2.5) < 0.05, `vy ${S3.pl.vy.toFixed(2)}`);
  // a mushroom's bounce is the full 17.5 whether or not jump is held
  {
    const Ws = buildWorld(levelCode(104729 * 2)), k = Ws.springs[0], sp = Ws.plats[k.p];
    const S5 = newRun(Ws);
    Object.assign(S5.pl, { x: sp.x, y: sp.y + 0.5, z: sp.z, vy: -1 });
    let top5 = -1e9;
    for (let i = 0; i < 160; i++) { step(S5, Ws, {}, dt); top5 = Math.max(top5, S5.pl.y - sp.y); }
    check("a mushroom throws you ~5.9 m, holding jump or not", top5 > 5.5, top5.toFixed(2));
  }
  // spin
  const S4 = newRun(W);
  check("spin attack, then a cooldown", spin(S4) && !spin(S4));
}

// ── a bot plays it ───────────────────────────────────────────────────────────
function bot(Wb, team = null, maxS = 900, rope = null) {
  const S = newRun(Wb);
  const P = S.pl;
  let last = 0, doubled = false, lastJumpT = -1, t = 0, wait = 0, traced = 0;
  const pathOf = (i) => Wb.path.indexOf(i);
  const shardHere = (pi) => Wb.shards.find((s) => s.p === Wb.path[pi] && !S.shards.has(s.i) && !(team && team.has(s.i)));
  while (t < maxS && !S.finished) {
    t += dt;
    const ci = Wb.path[last], cur = Wb.plats[ci], cq = S.plats[ci];
    const lastStop = last === Wb.path.length - 1;
    let tx, tz, tgt = null, tq = null;
    // on an island with its shard still there: fetch it first; at the temple, the shard, then the middle
    const sh = shardHere(last);
    if (sh) { tx = sh.x; tz = sh.z; }
    else if (lastStop) {
      // into the temple through its gate, not into a pillar
      const g = Wb.gate, gx = g.x - Wb.temple.x, gz = g.z - Wb.temple.z, gl = Math.hypot(gx, gz);
      const outX = Wb.temple.x + (gx / gl) * 5.2, outZ = Wb.temple.z + (gz / gl) * 5.2;
      const nearIn = Math.hypot(P.x - Wb.temple.x, P.z - Wb.temple.z) < 3.0 || Math.hypot(P.x - g.x, P.z - g.z) < 1.0;
      if (nearIn || Math.hypot(P.x - outX, P.z - outZ) < 0.6) S.thruGate = true;
      if (S.thruGate && S.gateOpen && S.gateT > 0.35) { tx = Wb.temple.x; tz = Wb.temple.z; } else { tx = outX; tz = outZ; }
    }
    else { tgt = Wb.plats[Wb.path[last + 1]]; tq = S.plats[Wb.path[last + 1]]; tx = tq.x; tz = tq.z; }
    let mx = 0, mz = 0;
    const dxT = tx - P.x, dzT = tz - P.z, dT = Math.hypot(dxT, dzT) || 1;
    if (P.onG) {
      doubled = false;
      releaseJump(S);
      if (!tgt) { mx = dxT / dT; mz = dzT / dT; if (dT < 0.3) { mx = mz = 0; } }
      else if (cur.kind === "lift" || cur.kind === "spring") {
        // to the middle: the vent / the mushroom does the rest
        const dc = Math.hypot(cq.x - P.x, cq.z - P.z) || 1;
        mx = (cq.x - P.x) / dc; mz = (cq.z - P.z) / dc;
        if (dc < 0.25) { mx = mz = 0; }
      } else {
        const edgeGap = Math.hypot(tq.x - cq.x, tq.z - cq.z) - cur.r - tgt.r;
        // a moving platform: wait at the edge until it's coming close
        if (tgt.kind === "mover" && edgeGap > 2.6) {
          const dEdge = Math.hypot(P.x - cq.x, P.z - cq.z);
          const ex = cq.x + ((tq.x - cq.x) / Math.hypot(tq.x - cq.x, tq.z - cq.z)) * (cur.r - 0.9), ez = cq.z + ((tq.z - cq.z) / Math.hypot(tq.x - cq.x, tq.z - cq.z)) * (cur.r - 0.9);
          const de = Math.hypot(ex - P.x, ez - P.z) || 1;
          if (de > 0.2) { mx = (ex - P.x) / de; mz = (ez - P.z) / de; }
          void dEdge;
        } else {
          mx = dxT / dT; mz = dzT / dT;
          const fromMid = Math.hypot(P.x - cq.x, P.z - cq.z);
          const toward = ((P.x - cq.x) * dxT + (P.z - cq.z) * dzT) / dT;
          if (fromMid > cur.r - 0.55 && toward > 0 && t - lastJumpT > 0.3) { pressJump(S); lastJumpT = t; }
        }
      }
    } else {
      // in the air: steer at the target; double-jump on the way down if it's still far; glide
      if (!tgt) { mx = dxT / dT; mz = dzT / dT; }
      else {
        const rising = S.inLift || (cur.kind === "spring" && P.vy > 0);
        const aboveTarget = P.y > tq.y + 0.6;
        // launched (a mushroom, a vent): head for the next one straight away — but
        // don't press into its side while still below its top
        const underIt = !aboveTarget && dT < tgt.r + 0.8 && P.y < tq.y - 0.2;
        if (!underIt) { mx = dxT / dT; mz = dzT / dT; }
        const farOut = dT > tgt.r - 0.4;
        if (!doubled && P.vy < 0.5 && farOut && P.jumps <= 1 && !rising) { releaseJump(S); pressJump(S); doubled = true; }
        // after the double jump, keep holding to glide (pressing again would be another jump)
        else if (!farOut) releaseJump(S);
      }
      S.inLift = false;
    }
    // slimes close by: spin
    if (S.slimes.some((s) => s.alive && Math.hypot(s.x - P.x, s.z - P.z) < 2.0 && Math.abs(s.y - P.y) < 1.4)) spin(S);
    const preX = P.x, preY = P.y, preZ = P.z;
    if (process.env.SS_TRACE && cur.kind === process.env.SS_TRACE && tgt && (Math.round(t * 120) % 6 === 0) && traced < 400) {
      traced++;
      console.log(`      t ${t.toFixed(2)} onG ${P.onG ? 1 : 0} y ${(P.y - tq.y).toFixed(2)} vs target top, ${Math.hypot(P.x - tq.x, P.z - tq.z).toFixed(2)} m from its middle (r ${tgt.r.toFixed(1)}), ${Math.hypot(P.x - cq.x, P.z - cq.z).toFixed(2)} from the mushroom, vy ${P.vy.toFixed(1)} jumps ${P.jumps} held ${S.jumpHeld ? 1 : 0} m ${mx.toFixed(2)},${mz.toFixed(2)}`);
    }
    const ev = step(S, Wb, { mx, mz }, dt, team);
    if (rope) ev.push(...tether(S, Wb, rope, preX, preZ, dt));
    for (const e of ev) if ((e.k === "on" || e.k === "spring") && pathOf(e.i ?? -1) >= 0) last = pathOf(e.i);   // landed, or bounced off a mushroom
    if (ev.some((e) => e.k === "spring")) { doubled = false; releaseJump(S); }       // a fresh flight
    // caught by a vent's updraft on the way in: that's the vent reached
    if (tgt && tgt.kind === "lift" && Math.hypot(P.x - tq.x, P.z - tq.z) < 1.7 && P.y > tq.y - 0.3) last = last + 1;
    if (ev.some((e) => e.k === "respawn")) last = Math.max(0, Wb.path.indexOf(Wb.flags[[...S.flags].pop()].p));
    if (ev.some((e) => e.k === "respawn")) {
      wait++;
      if (process.env.SS_DEBUG && wait <= 4 && tgt) console.log(`      fell: hop ${last} (${cur.kind}) -> ${tgt.kind}, gap ${(Math.hypot(tq.x - cq.x, tq.z - cq.z) - cur.r - tgt.r).toFixed(2)} m, rise ${(tq.y - cq.y).toFixed(2)}, last seen ${Math.hypot(preX - tq.x, preZ - tq.z).toFixed(2)} m from its middle (r ${tgt.r.toFixed(1)}), ${(preY - tq.y).toFixed(1)} m vs its top, doubled ${doubled}`);
    }
  }
  if (process.env.SS_DEBUG && !S.finished) {
    const ci = Wb.path[last], cur = Wb.plats[ci], nx = Wb.plats[Wb.path[last + 1]], nq = S.plats[Wb.path[last + 1]], cq = S.plats[ci];
    const nearLift = Wb.lifts.map((l) => [Wb.path.indexOf(l.p), Math.hypot(P.x - l.x, P.z - l.z).toFixed(1), (P.y - l.y0).toFixed(1)]).filter((v) => Number(v[1]) < 3);
    const nearSpring = Wb.springs.map((sp) => [Wb.path.indexOf(sp.p), Math.hypot(P.x - S.plats[sp.p].x, P.z - S.plats[sp.p].z).toFixed(1)]).filter((v) => Number(v[1]) < 3);
    console.log(`      near lifts ${JSON.stringify(nearLift)} springs ${JSON.stringify(nearSpring)} vy ${P.vy.toFixed(1)} shards ${[...S.shards]} gate ${S.gateOpen}`);
    console.log(`      stuck on hop ${last} (${cur.kind}, r ${cur.r.toFixed(1)}) -> ${nx && nx.kind}: onG ${P.onG}, gp ${P.gp} (hop ${Wb.path.indexOf(P.gp)}), at ${Math.hypot(P.x - cq.x, P.z - cq.z).toFixed(2)} m from its middle, y ${P.y.toFixed(1)} vs ${cq.y.toFixed(1)}; next is ${nx ? (Math.hypot(nq.x - cq.x, nq.z - cq.z) - cur.r - nx.r).toFixed(2) : "-"} m away, ${nx ? (nq.y - cq.y).toFixed(2) : "-"} up`);
  }
  return { S, t, respawns: wait };
}

let worst = 0, total = 0, done = 0, respawns = 0, failures = [];
const N = Number(process.env.SS_N) || 24;
for (let s = 1; s <= N; s++) {
  if (process.env.SS_ONLY && Number(process.env.SS_ONLY) !== s) continue;
  const w = buildWorld(levelCode(s * 104729));
  const r = bot(w);
  total++;
  respawns += r.respawns;
  if (r.S.finished && r.S.shards.size === SHARDS) { done++; worst = Math.max(worst, r.t); }
  else failures.push(`seed ${s * 104729}: stuck at hop ${r.S.maxPath}/${w.path.length - 1} after ${Math.round(r.t)}s, ${r.S.shards.size} shards`);
}
check(`a simple bot gets through every jump, takes all 5 shards, opens the gate and finishes (${N} levels)`, done === total, `${done}/${total}, slowest ${Math.round(worst)}s, ${respawns} falls${failures.length ? "\n      " + failures.slice(0, 6).join("\n      ") : ""}`);

// ── together, and the score ──────────────────────────────────────────────────
{
  const team = new Set([0, 1, 2]);
  const r = bot(W, team);
  check("together: shards a friend took count for you; the gate opens at five between you", r.S.finished && r.S.shards.size === 2, `you took ${r.S.shards.size}`);
  const S = newRun(W);
  const a = score(S, W);
  S.maxPath = 10; S.shards.add(0);
  const b = score(S, W);
  S.finished = true; S.finishLeft = 60;
  const c = score(S, W);
  check("score: further and more shards scores more; finishing beats any progress", b > a && c > 10000 && c > b && c <= 25000, `${a} / ${b} / ${c}`);
}

// ── tied together ────────────────────────────────────────────────────────────
{
  check("a conga line: the ends have one tail, the middle two", JSON.stringify([tiedTo([3, 5, 9, 12], 3), tiedTo([3, 5, 9, 12], 9), tiedTo([3, 5], 5), tiedTo([4], 4)]) === "[[5],[5,12],[3],[]]");
  // on the hub, a friend standing still on the far side; I walk away from them
  const S = newRun(W), P = S.pl, hub = W.plats[W.path[0]];
  const friend = [{ id: 2, x: hub.x - 6, y: hub.y, z: hub.z }];
  Object.assign(P, { x: hub.x - 1, z: hub.z, y: hub.y + 0.1 });
  const run = (secs, inp, who = friend) => {
    const evs = [];
    for (let t = 0; t < secs; t += dt) { const bx = P.x, bz = P.z; evs.push(...step(S, W, inp, dt), ...tether(S, W, who, bx, bz, dt)); }
    return evs;
  };
  const e0 = run(0.3, { mx: 0, mz: 0 });
  check("close by at the start: tied", e0.some((e) => e.k === "tie"));
  run(1.2, { mx: 1, mz: 0 });
  const held = Math.hypot(P.x - friend[0].x, P.z - friend[0].z);
  check("walking away on the ground: held at the end of the rope", held <= LEASH + 0.01 && P.onG, `${held.toFixed(2)} m, leash ${LEASH}`);
  run(0.5, { mx: 0, mz: 1 });
  check("...but free to walk round them", Math.hypot(P.x - friend[0].x, P.z - friend[0].z) <= LEASH + 0.01 && P.z > hub.z + 2);
  const e1 = run(TAUT_S + 0.5, { mx: 1, mz: 0 });
  check("pulling against a friend who won't come: the rope snaps", e1.some((e) => e.k === "snap"));
  const e2 = run(0.15, { mx: 1, mz: 0 });
  check("...and then you walk on", Math.hypot(P.x - friend[0].x, P.z - friend[0].z) > LEASH + 0.3 && !e2.some((e) => e.k === "tie"));
  // back to them: ties again
  Object.assign(P, { x: hub.x - 2, z: hub.z, y: hub.y + 0.1, vx: 0, vz: 0, vy: 0 });
  const e3 = run(0.2, { mx: 0, mz: 0 });
  check("close again: tied again", e3.some((e) => e.k === "tie"));
  // at the end of the rope, jumping away: the rope never stops a jump
  Object.assign(P, { x: friend[0].x + LEASH - 0.05, z: hub.z, vx: RUN, vz: 0 });
  pressJump(S);
  const x0 = P.x;
  run(0.25, { mx: 1, mz: 0 });
  check("in the air the rope doesn't hold you", !P.onG && P.x - x0 > 1.2, `${(P.x - x0).toFixed(2)} m in the air`);
  // a friend who fell back to a flag, far off: snapped, not dragged
  const S2 = newRun(W);
  Object.assign(S2.pl, { x: hub.x, z: hub.z, y: hub.y + 0.1 });
  const near = [{ id: 7, x: hub.x + 2, y: hub.y, z: hub.z }], far = [{ id: 7, x: hub.x + 40, y: hub.y - 20, z: hub.z }];
  tether(S2, W, near, S2.pl.x, S2.pl.z, dt);
  const e4 = tether(S2, W, far, S2.pl.x, S2.pl.z, dt);
  check("a friend far off (back at a flag): the rope snaps, nobody is dragged", e4.some((e) => e.k === "snap") && S2.pl.x === hub.x);
  // tied to a friend who never leaves the hub: you still get home
  const lv = Math.min(N, 12);
  let ok = 0, slow = 0;
  for (let sd = 1; sd <= lv; sd++) {
    const w = buildWorld(levelCode(sd)), h = w.plats[w.path[0]];
    const r = bot(w, null, 900, [{ id: 2, x: h.x, y: h.y, z: h.z }]);
    if (r.S.finished) ok++;
    slow = Math.max(slow, r.t);
  }
  check(`tied to a friend who never moves, the bot still gets home (${lv} levels)`, ok === lv, `${ok}/${lv}, slowest ${Math.round(slow)}s`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
