// src/components/games/sunshardSim.js
// Sunshard Islands: one player's run — the explorer, the platforms as this
// player sees them (crumbling stones, slimes and gems are each player's own),
// and the rules. No three.js and no React: scripts/check-sunshard.mjs drives a
// bot through it.
//
// Physics is simple on purpose: platforms are cylinders (a flat top, a
// thickness). Sideways first — you can't walk into a platform's side — then
// up and down: you land on the highest top under you. Moving platforms carry
// you. Falling never kills: below the last flag, or out of hearts, you're put
// back on the last flag with full hearts.
//
// The world clock (T) is the match clock, so moving platforms are in the same
// place on every phone.
import { TAU, clamp, moverAt, SHARDS } from "./sunshardWorld.js";

export const RUN = 7.4, GLIDE_RUN = 8.6, GRAVITY = 26, JUMP = 10.6, DOUBLE = 9.6, GLIDE_FALL = 2.5;
export const COYOTE = 0.1, BUFFER = 0.14, SPRING = 17.5, LIFT_UP = 7.5;
export const SPIN_S = 0.4, SPIN_R = 2.3, SPIN_CD = 0.6, HEARTS = 3, INV_S = 1.6;
const PR = 0.45, HH = 1.25;

export function newRun(W) {
  const hub = W.flags[0];
  return {
    T: 0,
    pl: { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, onG: false, gp: null, coyote: 0, jumps: 0, gliding: false, face: 0,
      hp: HEARTS, inv: 0, atk: 0, atkCd: 0, stun: 0, speed: 0, sq: 0 },
    jumpBuf: 0, jumpHeld: false,
    plats: W.plats.map((p) => ({ x: p.x, y: p.y, z: p.z, dx: 0, dz: 0, solid: true, state: 0, t: 0, vy: 0, shake: 0 })),
    gems: new Uint8Array(W.gems.length), extraGems: [],
    shards: new Set(),
    slimes: W.slimes.map((s) => ({ ...s, y: W.plats[s.p].y, tx: s.x, tz: s.z, t: Math.random() * 5, alive: true, dir: 0 })),
    flags: new Set([0]),
    ckpt: { x: hub.x, y: hub.y, z: hub.z },
    zone: -2, gemCount: 0, gateOpen: false, gateT: 0, finished: false, maxPath: 0, hits: 0, springs: W.springs.map(() => 0),
  };
}

export const pressJump = (S) => { if (!S.jumpHeld) S.jumpBuf = BUFFER; S.jumpHeld = true; };
export const releaseJump = (S) => { S.jumpHeld = false; };
export function spin(S) {
  const P = S.pl;
  if (P.atkCd > 0 || P.stun > 0) return false;
  P.atk = SPIN_S; P.atkCd = SPIN_CD;
  return true;
}
export function respawn(S) {
  const P = S.pl;
  Object.assign(P, { x: S.ckpt.x, y: S.ckpt.y + 0.2, z: S.ckpt.z, vx: 0, vz: 0, vy: 0, onG: false, gp: null, hp: HEARTS, inv: 1, stun: 0 });
}

// the shards that count for this player: their own, plus (together) the team's
export const shardsHave = (S, team) => (team ? new Set([...S.shards, ...team]) : S.shards);

// Platforms: movers by the clock, crumbling stones by whether you're on them.
function platforms(S, W, dt) {
  for (let i = 0; i < W.plats.length; i++) {
    const p = W.plats[i], q = S.plats[i];
    q.dx = q.dz = 0;
    if (p.kind === "mover") {
      const [nx, nz] = moverAt(p, S.T);
      q.dx = nx - q.x; q.dz = nz - q.z; q.x = nx; q.z = nz;
    } else if (p.kind === "crumble") {
      if (q.state === 0 && S.pl.onG && S.pl.gp === i) { q.state = 1; q.t = 0; S.ev.push({ k: "crumble", i }); }
      else if (q.state === 1) { q.t += dt; q.shake = 1; if (q.t > 0.75) { q.state = 2; q.solid = false; q.vy = 0; q.shake = 0; } }
      else if (q.state === 2) { q.vy -= 22 * dt; q.y += q.vy * dt; if (p.by - q.y > 30) { q.state = 3; q.t = 0; } }
      else if (q.state === 3) { q.t += dt; if (q.t > 3.2) { q.state = 0; q.y = p.by; q.solid = true; S.ev.push({ k: "regrow", i }); } }
    } else if (p.kind === "pillar" && p.gate && S.gateOpen && q.solid && S.gateT > 0.3) q.solid = false;
  }
}

// One step. inp: { mx, mz } — where to go, on the ground, already turned to
// the camera (length ≤ 1). team: the team's shards (together), or null.
// Returns the events of the step: [{ k: "jump" | "dbl" | "land" | "gem" | "shard" | … }].
export function step(S, W, inp, dt, team = null) {
  const P = S.pl;
  S.ev = [];
  S.T += dt;
  platforms(S, W, dt);
  if (S.gateOpen) S.gateT = Math.min(1, S.gateT + dt * 0.5);
  P.inv = Math.max(0, P.inv - dt); P.atkCd = Math.max(0, P.atkCd - dt); P.atk = Math.max(0, P.atk - dt);
  P.stun = Math.max(0, P.stun - dt); P.coyote = Math.max(0, P.coyote - dt); S.jumpBuf = Math.max(0, S.jumpBuf - dt);
  if (P.gp !== null && P.onG) { const q = S.plats[P.gp]; P.x += q.dx; P.z += q.dz; }
  if (S.finished) { P.vx *= 0.8; P.vz *= 0.8; }

  // running
  let ix = clamp(inp.mx || 0, -1, 1), iz = clamp(inp.mz || 0, -1, 1);
  const il = Math.hypot(ix, iz);
  if (il > 1) { ix /= il; iz /= il; }
  if (S.finished) { ix = 0; iz = 0; }
  const top = (P.gliding ? GLIDE_RUN : RUN) * (P.atk > 0 ? 0.65 : 1);
  if (P.stun <= 0) {
    const tx = ix * top, tz = iz * top, acc = P.onG ? 64 : P.gliding ? 20 : 34;
    const dvx = tx - P.vx, dvz = tz - P.vz, dl = Math.hypot(dvx, dvz), mx = acc * dt;
    if (dl <= mx) { P.vx = tx; P.vz = tz; } else { P.vx += (dvx / dl) * mx; P.vz += (dvz / dl) * mx; }
  }
  // jumping: a buffered press, coyote time off an edge, one more in the air
  if (S.jumpBuf > 0 && P.stun <= 0 && !S.finished) {
    if (P.onG || P.coyote > 0) { P.vy = JUMP; P.jumps = 1; P.own = true; P.onG = false; P.gp = null; P.coyote = 0; S.jumpBuf = 0; P.sq = -0.6; S.ev.push({ k: "jump" }); }
    else if (P.jumps < 2) { P.vy = DOUBLE; P.jumps = 2; S.jumpBuf = 0; P.sq = -0.5; S.ev.push({ k: "dbl" }); }
  }
  // let go early: a shorter hop — your own jump only; a mushroom or a slime's bounce is never cut short
  if (!S.jumpHeld && P.vy > 5 && P.jumps === 1 && !P.onG && P.own) P.vy -= 60 * dt;
  P.gliding = !P.onG && S.jumpHeld && P.jumps >= 2 && P.vy < -1.2 && P.stun <= 0;
  if (P.gliding) P.vy = Math.max(P.vy - GRAVITY * dt, -GLIDE_FALL); else P.vy -= GRAVITY * dt;
  if (P.vy < -32) P.vy = -32;
  // wind vents
  for (const l of W.lifts) {
    const d = Math.hypot(P.x - l.x, P.z - l.z);
    if (d < l.r && P.y > l.y0 - 0.3 && P.y < l.y0 + l.h) { if (P.vy < LIFT_UP) P.vy += 75 * dt; if (P.jumps > 1) P.jumps = 1; S.inLift = true; }
  }
  // sideways, then up and down
  const prevY = P.y, vyBefore = P.vy;
  P.x += P.vx * dt; P.z += P.vz * dt;
  for (let i = 0; i < W.plats.length; i++) {
    const p = W.plats[i], q = S.plats[i];
    if (!q.solid) continue;
    if (P.y < q.y - 0.4 && P.y + HH > q.y - p.th) {
      const dx = P.x - q.x, dz = P.z - q.z, d = Math.hypot(dx, dz), lim = p.r + PR;
      if (d < lim && d > 1e-4) {
        const nx = dx / d, nz = dz / d;
        P.x = q.x + nx * lim; P.z = q.z + nz * lim;
        const vn = P.vx * nx + P.vz * nz;
        if (vn < 0) { P.vx -= vn * nx; P.vz -= vn * nz; }
      }
    }
  }
  P.y += P.vy * dt;
  let best = -1;
  for (let i = 0; i < W.plats.length; i++) {
    const p = W.plats[i], q = S.plats[i];
    if (!q.solid) continue;
    const d = Math.hypot(P.x - q.x, P.z - q.z);
    if (P.vy <= 0.01 && d < p.r + 0.18 && P.y <= q.y + 0.001 && prevY >= q.y - 0.4) { if (best < 0 || q.y > S.plats[best].y) best = i; }
    else if (P.vy > 0 && d < p.r) { const hb = prevY + HH; if (hb <= q.y - p.th + 0.1 && P.y + HH > q.y - p.th) { P.vy = 0; P.y = q.y - p.th - HH; } }
  }
  if (best >= 0) {
    const p = W.plats[best], q = S.plats[best];
    if (!P.onG) {
      if (vyBefore < -7) { P.sq = clamp(-vyBefore / 24, 0.3, 1); S.ev.push({ k: "land", hard: -vyBefore }); }
      P.jumps = 0;
      if (p.zone !== S.zone && p.kind !== "pillar") { S.zone = p.zone; S.ev.push({ k: "zone", zone: p.zone }); }
      if (p.cp && p.flag !== undefined && !S.flags.has(p.flag)) {
        S.flags.add(p.flag);
        const f = W.flags[p.flag];
        S.ckpt = { x: f.x, y: p.y, z: f.z };
        S.ev.push({ k: "flag", f: p.flag });
      }
      const at = W.path.indexOf(best);
      if (at > S.maxPath) S.maxPath = at;
      S.ev.push({ k: "on", i: best, at });
    }
    P.onG = true; P.gp = best; P.y = q.y; P.vy = -2; P.coyote = COYOTE;
  } else {
    if (P.onG) { P.onG = false; P.gp = null; P.coyote = COYOTE; if (P.jumps === 0) P.jumps = 1; }
  }
  // bounce mushrooms
  W.springs.forEach((s, k) => {
    const p = W.plats[s.p], q = S.plats[s.p];
    const d = Math.hypot(P.x - q.x, P.z - q.z);
    if (d < 0.95 && P.y < q.y + 0.9 && P.y > q.y - 0.2 && P.vy <= 0.01 && q.solid) {
      P.vy = SPRING; P.jumps = 1; P.own = false; P.onG = false; P.gp = null; P.sq = -0.9; S.springs[k] = 1;
      S.ev.push({ k: "spring", i: s.p, x: p.x, y: q.y, z: p.z });
    }
    S.springs[k] = Math.max(0, S.springs[k] - dt * 4);
  });
  // gems
  for (let i = 0; i < W.gems.length; i++) {
    if (S.gems[i]) continue;
    const g = W.gems[i], dx = g.x - P.x, dy = g.y - (P.y + 0.6), dz = g.z - P.z;
    if (dx * dx + dy * dy + dz * dz < 1.3) { S.gems[i] = 1; S.gemCount++; S.ev.push({ k: "gem", x: g.x, y: g.y, z: g.z }); }
  }
  for (const g of S.extraGems) {
    if (g.got) continue;
    const dx = g.x - P.x, dy = g.y - (P.y + 0.6), dz = g.z - P.z;
    if (dx * dx + dy * dy + dz * dz < 1.3) { g.got = true; S.gemCount++; S.ev.push({ k: "gem", x: g.x, y: g.y, z: g.z }); }
  }
  // shards
  const have = shardsHave(S, team);
  for (const s of W.shards) {
    if (have.has(s.i)) continue;
    const dx = s.x - P.x, dy = s.y - (P.y + 0.6), dz = s.z - P.z;
    if (dx * dx + dy * dy + dz * dz < 2.6) {
      S.shards.add(s.i);
      have.add(s.i);
      S.ev.push({ k: "shard", i: s.i, count: have.size, x: s.x, y: s.y, z: s.z, col: s.col });
    }
  }
  if (have.size >= SHARDS && !S.gateOpen) { S.gateOpen = true; S.gateT = 0; S.ev.push({ k: "gate" }); }
  // slimes: spin them, land on them — or they knock you about
  for (const s of S.slimes) {
    if (!s.alive) continue;
    const dx = P.x - s.x, dz = P.z - s.z, dxz = Math.hypot(dx, dz), dy = P.y - s.y;
    const kill = () => {
      s.alive = false;
      S.ev.push({ k: "stomp", x: s.x, y: s.y, z: s.z });
      for (let k = 0; k < 2; k++) S.extraGems.push({ x: s.x + (Math.random() - 0.5), y: s.y + 1, z: s.z + (Math.random() - 0.5), got: false });
    };
    if (P.atk > 0 && dxz < SPIN_R && Math.abs(dy) < 1.6) { kill(); continue; }
    if (dxz < 0.95 && dy > -0.6 && dy < 1.1) {
      if (P.vy < -2 && dy > 0.35) { kill(); P.vy = 10; P.jumps = 1; P.own = false; P.onG = false; P.gp = null; P.sq = -0.5; }
      else if (P.inv <= 0) { const l = Math.max(dxz, 0.01); hurt(S, dx / l, dz / l); }
    }
  }
  moveSlimes(S, W, dt);
  // the temple: into the glowing circle once the gate is open
  if (W.temple && S.gateOpen && !S.finished) {
    const d = Math.hypot(P.x - W.temple.x, P.z - W.temple.z);
    if (d < 1.7 && Math.abs(P.y - W.temple.y) < 1.8) { S.finished = true; S.ev.push({ k: "win" }); }
  }
  // fallen too far: back to the last flag
  if (P.y < S.ckpt.y - 30 || P.y < -80) { respawn(S); S.ev.push({ k: "respawn" }); }
  const sp = Math.hypot(P.vx, P.vz);
  P.speed = sp;
  if (sp > 0.6) { let d = Math.atan2(P.vx, P.vz) - P.face; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; P.face += d * Math.min(1, dt * 14); }
  return S.ev;
}

export function hurt(S, dx, dz) {
  const P = S.pl;
  if (P.inv > 0 || S.finished) return;
  P.hp--; P.inv = INV_S; P.stun = 0.35; S.hits++;
  P.vx = dx * 8; P.vz = dz * 8; P.vy = 7; P.onG = false; P.gp = null;
  S.ev.push({ k: "hurt" });
  if (P.hp <= 0) { respawn(S); S.ev.push({ k: "respawn", ko: true }); }
}

function moveSlimes(S, W, dt) {
  for (const s of S.slimes) {
    if (!s.alive) continue;
    s.t += dt;
    const p = W.plats[s.p], q = S.plats[s.p];
    if (Math.hypot(s.tx - s.x, s.tz - s.z) < 0.3 || Math.random() < dt * 0.15) {
      const a = Math.random() * TAU, d = Math.random() * (p.r - 1.1);
      s.tx = q.x + Math.cos(a) * d; s.tz = q.z + Math.sin(a) * d;
    }
    const dx = s.tx - s.x, dz = s.tz - s.z, l = Math.hypot(dx, dz) || 1, hop = Math.max(0, Math.sin(s.t * 5));
    s.x += (dx / l) * 1.5 * dt * (0.4 + hop); s.z += (dz / l) * 1.5 * dt * (0.4 + hop); s.y = q.y + hop * 0.5;
    s.dir = Math.atan2(dx, dz);
  }
}

// How far along, for the ranking and the score: shards first, then the furthest
// platform reached. A finish is worth more than any progress.
export function progress(S, W, team = null) {
  const have = shardsHave(S, team).size;
  return { shards: have, path: S.maxPath, finished: S.finished };
}

// The score the room ranks (race): 100 a platform reached, 500 a shard, 5 a
// gem; finishing adds 10,000 and 10 for every second left — the first home
// is ahead of the second, and both are ahead of anyone still climbing.
// (S.finishLeft: the seconds left on the clock when you got home.)
export function score(S, W, team = null) {
  const pr = progress(S, W, team);
  let s = pr.path * 100 + pr.shards * 500 + S.gemCount * 5;
  if (S.finished) s += 10000 + Math.max(0, Math.round(S.finishLeft || 0)) * 10;
  return Math.min(25000, s);
}
