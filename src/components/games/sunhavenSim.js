// src/components/games/sunhavenSim.js
// Sunshard Jump, stage two: one player's run on Sunhaven Isle — the explorer,
// the live things and the rules. No three.js and no React:
// scripts/check-sunshard.mjs drives it.
//
// The explorer is the sky hop's (the same run, jump, double jump and glide),
// on a height map instead of cylinders: a step too steep is a wall, so a cliff
// is climbed by its stepping stones. Talk to Elder Sol, light the four sun
// shrines (each teaches a power: the sun pulse, the air dash, a heart, a wider
// pulse), then beat the Shade Colossus in the tower yard.
//
// Every change to the shared world is an event with a stable index ({k:"kill",
// t, i}, {k:"shrine", i}, {k:"heal", id}…) and applyEvent() plays a friend's
// into this run: that is the whole co-op seam.
//
// Nothing here is random. Slimes and wisps wander round their homes by the
// world clock (S.T, the match clock) and their index, so they're in the same
// place on every phone; the boss's orbs come from the island's seed. Who
// runs the creatures and the boss (S.ai) is the game's choice: every phone
// alone or in a race; in a together room only the host, who sends the rest a
// snapshot (hostSnap → applyHost) — and every phone still decides the damage
// to its own explorer from what it sees (contacts, bossHurt).
import { TAU, clamp, mkRng } from "./sunshardWorld.js";
import { SEA, SHRINES, zoneAt } from "./sunhavenWorld.js";

export const RUN = 7.4, GLIDE_RUN = 8.6, GRAVITY = 26, JUMP = 10.6, DOUBLE = 9.6, GLIDE_FALL = 2.5;
const COYOTE = 0.1, BUFFER = 0.14, SPRING = 17.5, LIFT_UP = 7.5, INV_S = 1.6, PR = 0.45, HH = 1.25;
const BASE_HP = 3, DASH_SPD = 15, DASH_T = 0.2, DASH_CD = 1.1, PULSE_CD = 0.9, PULSE_R = 3.6;
const WALL_SLOPE = 2.3, BOSS_HP = 9, SL_WANDER = 2.6, FALL = 36;
const CYCLE = ["slam", "rain", "slam", "rain", "stun"];
export const BOSS_STATES = ["sleep", "intro", "cycle", "dead"];
export const ISLE_PTS_CAP = 25000;

export const hasPulse = (S) => S.shrines.size >= 1;
export const hasDash = (S) => S.shrines.size >= 2;
export const maxHp = (S) => BASE_HP + (S.shrines.size >= 3 ? 1 : 0) + (S.pipQ === 2 ? 1 : 0);
const pulseR = (S) => PULSE_R + (S.shrines.size >= 4 ? 1.0 : 0);

export function newRun(W) {
  const st = W.start;
  return {
    T: 0, t0: 0, ev: [], ai: true, team: false,
    pl: { x: st.x, y: st.y, z: st.z, vx: 0, vz: 0, vy: 0, onG: true, gp: null, coyote: 0, jumps: 0, gliding: false, face: Math.PI, hp: BASE_HP, inv: 0, stun: 0, speed: 0, sq: 0, own: false, dashT: 0, dashCd: 0, pulseCd: 0, dx: 0, dz: 0 },
    jumpBuf: 0, jumpHeld: false,
    plats: W.plats.map((p) => ({ x: p.x, y: p.y, z: p.z, solid: true, state: 0, t: 0, vy: 0, shake: 0 })),
    seeds: new Set(), shrines: new Set(), flags: new Set([0]), ckpt: { x: W.flags[0].x, y: W.flags[0].y, z: W.flags[0].z },
    slimes: W.slimes.map((s) => ({ i: s.i, x: s.hx, z: s.hz, hx: s.hx, hz: s.hz, y: W.H(s.hx, s.hz), ph: s.i * 1.618, t: 0, alive: true, dir: 0 })),
    wisps: W.wisps.map((w) => ({ i: w.i, x: w.hx, z: w.hz, hx: w.hx, hz: w.hz, y: W.H(w.hx, w.hz) + 1.8, ph: w.i * 2.399, t: 0, alive: true, st: 0, st0: 0, vx: 0, vz: 0, vy: 0, cd: 0, boss: false })),
    boss: { hp: BOSS_HP, max: BOSS_HP, state: "sleep", t: 0, idx: 0, sub: 0, stunned: false, stunT: 0, ringR: 0, tele: 0, orbs: [], x: W.arena.x, z: W.arena.z, y: W.arena.y, hitCd: 0, face: 0, rains: 0 },
    springs: W.springs.map(() => 0), gateOpen: false, gateT: 0, finished: false, finishT: 0, rainSeen: -1,
    zone: 0, quest: 0, pipQ: 0, pipK: 0, pickups: [], boots: false, kills: 0, hits: 0, dlg: null,
    nearNpc: null, nearShrine: null, inLift: false,
  };
}

// every press buffers a jump: a release the phone never delivered (a finger
// lifted during a system gesture) must not leave the jump dead
export const pressJump = (S) => { S.jumpBuf = BUFFER; S.jumpHeld = true; };
export const releaseJump = (S) => { S.jumpHeld = false; };

export function respawn(S, W, ko) {
  const P = S.pl;
  Object.assign(P, { x: S.ckpt.x, y: S.ckpt.y + 0.3, z: S.ckpt.z, vx: 0, vz: 0, vy: 0, onG: false, gp: null, hp: maxHp(S), inv: 1.2, stun: 0, dashT: 0 });
  S.ev.push({ k: "respawn", ko: !!ko });
  // alone, falling ends the fight; together the host's yard empties first
  const B = S.boss;
  if (!S.team && B.state !== "dead" && B.state !== "sleep") bossReset(S);
}
function bossReset(S) {
  const B = S.boss;
  Object.assign(B, { hp: B.max, state: "sleep", t: 0, idx: 0, sub: 0, stunned: false, tele: 0, orbs: [], ringR: 0 });
  S.rainSeen = -1;
  S.wisps.forEach((w) => { if (w.boss) w.alive = false; });
  S.ev.push({ k: "bossReset" });
}

function hurt(S, W, dx, dz) {
  const P = S.pl;
  if (P.inv > 0 || S.finished) return;
  P.hp--; P.inv = INV_S; P.stun = 0.35; S.hits++;
  P.vx = dx * 8; P.vz = dz * 8; P.vy = 7; P.onG = false; P.gp = null; P.dashT = 0;
  S.ev.push({ k: "hurt" });
  if (P.hp <= 0) respawn(S, W, true);
}

// ── talking, shrines, pulse ────────────────────────────────────────────────
function npcLines(S, W, n) {
  const n4 = S.shrines.size >= SHRINES, B = S.boss;
  if (n.id === "sol") {
    if (B.state === "dead") return ["You did it! The shade is gone and the sun shines on every shrine again.", "Sunhaven will never forget you."];
    if (S.quest === 0) return ["Welcome, traveller! Sunhaven's four sun shrines have gone dark.", "Light them all and the Shade Colossus in the north tower will lose its power.", "Every shrine you light teaches you a new sun power. Start wherever you like!"];
    if (!n4) return [`${SHRINES - S.shrines.size} shrine${SHRINES - S.shrines.size > 1 ? "s" : ""} still dark. Try the lake, the cliffs, the ember ruins and the slime hollow.`, "The mini map? Follow the golden arrow at the top!"];
    return ["All four shrines shine! The tower gate stands open.", "Go north and face the Shade Colossus. Wait until its crystal glows, then pulse it with the sun!"];
  }
  if (n.id === "pip" && S.pipQ === 0) return ["Hi! Slimes keep nibbling my garden.", "Pop 4 of them for me and I will give you a lucky charm!"];
  if (n.id === "pip" && S.pipQ === 1) return S.pipK >= 4 ? ["You did it! Take this lucky charm.", "It gives you one more heart. Thank you!"] : [`Slimes popped: ${S.pipK} / 4. Stomp them or use your sun pulse!`];
  if (n.id === "pip" && S.pipQ === 2) return ["Thanks again, hero! My garden is safe."];
  if (n.id === "pip") {
    const tips = ["Springs on the cliffs bounce you way up. Look for the red mushrooms!", "Lily pads crumble when you stand on them. Keep hopping!", "Wisps hate the sun pulse. Or jump on their heads!", "After a double jump, hold JUMP to glide across big gaps.", "Slimes hop after you when you get close. Stomp them or pulse them."];
    return [tips[(S.hits + S.kills + S.shrines.size) % tips.length]];
  }
  if (n.id === "brindle") {
    if (S.boots) return ["Those Sun Boots suit you. Keep running!"];
    if (S.shrines.size >= 2) return ["You lit two shrines already! Here, I made you these boots.", "Sun Boots! You will run a little faster now."];
    return ["Light two sun shrines and I will forge you some Sun Boots."];
  }
  return ["..."];
}
function startDialog(S, W, n) {
  S.dlg = { npc: n.id, name: n.name, lines: npcLines(S, W, n), i: 0 };
  S.ev.push({ k: "talk", id: n.id });
}
function finishDialog(S) {
  const d = S.dlg; S.dlg = null; if (!d) return;
  if (d.npc === "sol" && S.quest === 0) { S.quest = 1; S.ev.push({ k: "quest", q: 1 }); }
  if (d.npc === "pip") { if (S.pipQ === 0) { S.pipQ = 1; S.pipK = 0; S.ev.push({ k: "pipq" }); } else if (S.pipQ === 1 && S.pipK >= 4) { S.pipQ = 2; S.pl.hp = maxHp(S); S.ev.push({ k: "charm" }); } }
  if (d.npc === "brindle" && !S.boots && S.shrines.size >= 2) { S.boots = true; S.ev.push({ k: "boots" }); }
}
function lightShrine(S, W, sh) {
  if (S.shrines.has(sh.i)) return;
  S.shrines.add(sh.i);
  const P = S.pl; P.hp = maxHp(S);
  S.ckpt = { x: sh.x + 1.8, y: sh.y, z: sh.z };
  const count = S.shrines.size;
  S.ev.push({ k: "shrine", i: sh.i, count, x: sh.x, y: sh.y, z: sh.z, col: sh.col });
  if (S.quest === 0) S.quest = 1;
  if (count >= SHRINES && !S.gateOpen) { S.gateOpen = true; S.gateT = 0; S.ev.push({ k: "gate" }); }
}
function hitBoss(S, W) {
  const B = S.boss;
  B.hp--; B.hitCd = 0.5;
  S.ev.push({ k: "bossHit", hp: B.hp });
  if (B.hp <= 0) bossDie(S);
}
function doPulse(S, W) {
  const P = S.pl;
  if (!hasPulse(S) || P.pulseCd > 0) return false;
  P.pulseCd = PULSE_CD;
  const R = pulseR(S);
  S.ev.push({ k: "pulse", x: P.x, y: P.y, z: P.z, r: R });
  for (const s of S.slimes) if (s.alive && Math.hypot(s.x - P.x, s.z - P.z) < R + 0.5 && Math.abs(s.y - P.y) < 3) killSlime(S, s, "pulse");
  for (const w of S.wisps) if (w.alive && Math.hypot(w.x - P.x, w.z - P.z) < R + 0.8 && Math.abs(w.y - P.y) < 3.5) killWisp(S, w, "pulse");
  const B = S.boss;
  if (B.stunned && B.state === "cycle" && B.hitCd <= 0 && Math.hypot(B.x - P.x, B.z - P.z) < R + 3.2) {
    // the one running the boss takes the hit; anyone else asks them (bossHitAsk → isl:ev bossHit)
    if (S.ai) hitBoss(S, W);
    else { B.hitCd = 0.5; S.ev.push({ k: "bossHitAsk", x: B.x, y: B.y, z: B.z }); }
  }
  return true;
}
// a heart drops from one creature in four, by its index: the same on every phone
function dropHeart(S, t, i, x, y, z) { if ((i * 7 + (t === "slime" ? 3 : 5)) % 4 !== 0) return; S.pickups.push({ id: t + i, x, y: y + 0.6, z, t: 0 }); }
function killSlime(S, s, how) { s.alive = false; S.kills++; if (S.pipQ === 1) S.pipK++; dropHeart(S, "slime", s.i, s.x, s.y, s.z); S.ev.push({ k: "kill", t: "slime", i: s.i, how, x: s.x, y: s.y, z: s.z }); }
function killWisp(S, w, how) { w.alive = false; if (!w.boss) { S.kills++; dropHeart(S, "wisp", w.i, w.x, w.y - 1, w.z); } S.ev.push({ k: "kill", t: "wisp", i: w.i, how, x: w.x, y: w.y, z: w.z }); }
function bossDie(S) {
  const B = S.boss; B.state = "dead"; B.stunned = false; B.orbs = []; B.tele = 0; B.t = 0; B.hp = 0;
  S.wisps.forEach((w) => { if (w.boss && w.alive) w.alive = false; });
  S.finished = true; S.finishT = S.T;
  S.ev.push({ k: "bossDead", x: B.x, y: B.y, z: B.z });
}
// the action button: advance a talk, talk, light a shrine, or pulse
export function pressAction(S, W) {
  S.ev = [];
  if (S.dlg) { S.dlg.i++; if (S.dlg.i >= S.dlg.lines.length) finishDialog(S); else S.ev.push({ k: "talkNext" }); return S.ev; }
  if (S.nearNpc) { startDialog(S, W, S.nearNpc); return S.ev; }
  if (S.nearShrine) { lightShrine(S, W, S.nearShrine); return S.ev; }
  doPulse(S, W);
  return S.ev;
}
export function pressDash(S) {
  S.ev = [];
  const P = S.pl;
  if (!hasDash(S) || P.dashCd > 0 || S.dlg || S.finished) return S.ev;
  let dx = P.dx, dz = P.dz;
  const l = Math.hypot(dx, dz);
  if (l < 0.2) { dx = Math.sin(P.face); dz = Math.cos(P.face); } else { dx /= l; dz /= l; }
  P.dashT = DASH_T; P.dashCd = DASH_CD; P.vx = dx * DASH_SPD; P.vz = dz * DASH_SPD; if (P.vy < 1.5) P.vy = 1.5;
  P.face = Math.atan2(dx, dz);
  S.ev.push({ k: "dash", x: P.x, y: P.y, z: P.z });
  return S.ev;
}

// ── platforms ──────────────────────────────────────────────────────────────
function platforms(S, W, dt) {
  for (let i = 0; i < W.plats.length; i++) {
    const p = W.plats[i], q = S.plats[i];
    if (p.kind !== "crumble") continue;
    if (q.state === 0 && S.pl.onG && S.pl.gp === i) { q.state = 1; q.t = 0; S.ev.push({ k: "crumble", i }); }
    else if (q.state === 1) { q.t += dt; q.shake = 1; if (q.t > 0.8) { q.state = 2; q.solid = false; q.vy = 0; q.shake = 0; } }
    else if (q.state === 2) { q.vy -= 22 * dt; q.y += q.vy * dt; if (p.y - q.y > 12) { q.state = 3; q.t = 0; } }
    else if (q.state === 3) { q.t += dt; if (q.t > 3.0) { q.state = 0; q.y = p.y; q.solid = true; S.ev.push({ k: "regrow", i }); } }
  }
}

// ── one step ───────────────────────────────────────────────────────────────
// inp: { mx, mz } — where to go, already turned to the camera (length ≤ 1).
// others: where the friends on this island are ([{ x, y, z }]) — the
// creatures and the boss go after whoever is nearest, when this run runs them.
export function step(S, W, inp, dt, others = []) {
  const P = S.pl;
  S.ev = [];
  S.T += dt;
  platforms(S, W, dt);
  if (S.gateOpen) S.gateT = Math.min(1, S.gateT + dt * 0.5);
  P.inv = Math.max(0, P.inv - dt); P.stun = Math.max(0, P.stun - dt); P.coyote = Math.max(0, P.coyote - dt);
  P.pulseCd = Math.max(0, P.pulseCd - dt); P.dashCd = Math.max(0, P.dashCd - dt); P.dashT = Math.max(0, P.dashT - dt);
  S.jumpBuf = Math.max(0, S.jumpBuf - dt);
  if (S.boss.hitCd > 0) S.boss.hitCd -= dt;

  // running (frozen while talking or after the finish)
  let ix = clamp(inp.mx || 0, -1, 1), iz = clamp(inp.mz || 0, -1, 1);
  const il = Math.hypot(ix, iz);
  if (il > 1) { ix /= il; iz /= il; }
  if (S.dlg || S.finished) { ix = 0; iz = 0; }
  P.dx = ix; P.dz = iz;
  const run = RUN * (S.boots ? 1.12 : 1), top = P.gliding ? GLIDE_RUN : run;
  if (P.dashT <= 0 && P.stun <= 0) {
    const tx = ix * top, tz = iz * top, acc = P.onG ? 64 : P.gliding ? 20 : 34;
    const dvx = tx - P.vx, dvz = tz - P.vz, dl = Math.hypot(dvx, dvz), mx = acc * dt;
    if (dl <= mx) { P.vx = tx; P.vz = tz; } else { P.vx += (dvx / dl) * mx; P.vz += (dvz / dl) * mx; }
  }
  // jumping: a buffered press, coyote time off an edge, one more in the air
  if (S.jumpBuf > 0 && P.stun <= 0 && !S.finished && !S.dlg) {
    if (P.onG || P.coyote > 0) { P.vy = JUMP; P.jumps = 1; P.own = true; P.onG = false; P.gp = null; P.coyote = 0; S.jumpBuf = 0; P.sq = -0.6; S.ev.push({ k: "jump" }); }
    else if (P.jumps < 2) { P.vy = DOUBLE; P.jumps = 2; S.jumpBuf = 0; P.sq = -0.5; S.ev.push({ k: "dbl" }); }
  }
  if (!S.jumpHeld && P.vy > 5 && P.jumps === 1 && !P.onG && P.own) P.vy -= 60 * dt;
  P.gliding = !P.onG && S.jumpHeld && P.jumps >= 2 && P.vy < -1.2 && P.stun <= 0 && P.dashT <= 0;
  if (P.dashT > 0) P.vy = Math.max(P.vy - GRAVITY * 0.15 * dt, -1);
  else if (P.gliding) P.vy = Math.max(P.vy - GRAVITY * dt, -GLIDE_FALL); else P.vy -= GRAVITY * dt;
  if (P.vy < -32) P.vy = -32;
  // wind vents
  S.inLift = false;
  for (const l of W.lifts) {
    const d = Math.hypot(P.x - l.x, P.z - l.z);
    if (d < l.r && P.y > l.y0 - 0.3 && P.y < l.y0 + l.h) { if (P.vy < LIFT_UP) P.vy += 75 * dt; if (P.jumps > 1) P.jumps = 1; S.inLift = true; }
  }

  // sideways: the ground is a height map; a step too steep is a wall
  const prevY = P.y, vyBefore = P.vy;
  {
    const nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
    const hereT = W.H(P.x, P.z), newT = W.H(nx, nz), run2 = Math.max(0.01, Math.hypot(nx - P.x, nz - P.z));
    const air = !P.onG || P.gp !== null;
    let ok = true;
    // a cliff is climbed by its stepping stones, never by hopping up its face:
    // steep rising ground is a wall unless you are clearly above it (a bounce mushroom, a wind vent)
    const steepAir = (nT, hT, rn) => air && nT > hT && (nT - hT) / rn > WALL_SLOPE && P.y - nT < 4.6;
    if (!air) { if (newT > hereT && (newT - hereT) / run2 > WALL_SLOPE) ok = false; }
    else if (newT > P.y + 0.25 && newT > hereT) ok = false;
    else if (steepAir(newT, hereT, run2)) ok = false;
    if (ok) { P.x = nx; P.z = nz; }
    else {
      const tx = W.H(nx, P.z), tz = W.H(P.x, nz);
      const rx = Math.max(0.01, Math.abs(nx - P.x)), rz = Math.max(0.01, Math.abs(nz - P.z));
      const okx = !air ? !(tx > hereT && (tx - hereT) / rx > WALL_SLOPE) : (tx <= P.y + 0.25 && !steepAir(tx, hereT, rx));
      const okz = !air ? !(tz > hereT && (tz - hereT) / rz > WALL_SLOPE) : (tz <= P.y + 0.25 && !steepAir(tz, hereT, rz));
      if (okx) { P.x = nx; P.vz *= 0.2; }
      else if (okz) { P.z = nz; P.vx *= 0.2; }
      else { P.vx = 0; P.vz = 0; }
    }
  }
  // the cylinder platforms (stones, pads, vents) push you out sideways
  for (let i = 0; i < W.plats.length; i++) {
    const p = W.plats[i], q = S.plats[i];
    if (!q.solid) continue;
    if (P.y < q.y - 0.4 && P.y + HH > q.y - p.th) {
      const dx = P.x - q.x, dz = P.z - q.z, d = Math.hypot(dx, dz), lim = p.r + PR;
      if (d < lim && d > 1e-4) {
        const nx = dx / d, nz = dz / d; P.x = q.x + nx * lim; P.z = q.z + nz * lim;
        const vn = P.vx * nx + P.vz * nz; if (vn < 0) { P.vx -= vn * nx; P.vz -= vn * nz; }
      }
    }
  }
  // round things: trees, houses, rocks, the fountain, people, the boss, the yard wall
  collide(S, W);

  P.y += P.vy * dt;
  // landing: the ground, or the highest platform top under you
  let best = -1, bestY = -1e9;
  const gT = W.H(P.x, P.z);
  let onTerrain = false;
  if (P.vy <= 0.01 && P.y <= gT + 0.001 && gT - P.y < 1.2) { onTerrain = true; bestY = gT; }
  for (let i = 0; i < W.plats.length; i++) {
    const p = W.plats[i], q = S.plats[i];
    if (!q.solid) continue;
    const d = Math.hypot(P.x - q.x, P.z - q.z);
    if (P.vy <= 0.01 && d < p.r + 0.18 && P.y <= q.y + 0.001 && prevY >= q.y - 0.4) { if (q.y >= bestY) { best = i; bestY = q.y; onTerrain = false; } }
    else if (P.vy > 0 && d < p.r) { const hb = prevY + HH; if (hb <= q.y - p.th + 0.1 && P.y + HH > q.y - p.th) { P.vy = 0; P.y = q.y - p.th - HH; } }
  }
  // walking along the ground keeps you on it (down slopes too)
  if (!onTerrain && best < 0 && P.onG && P.gp === null && P.vy <= 0.01 && gT < P.y && P.y - gT < 0.55 && P.dashT <= 0) { onTerrain = true; bestY = gT; }
  if (onTerrain || best >= 0) {
    if (!P.onG) {
      if (vyBefore < -7) { P.sq = clamp(-vyBefore / 24, 0.3, 1); S.ev.push({ k: "land", hard: -vyBefore }); }
      P.jumps = 0;
    }
    if (best >= 0) { const q = S.plats[best]; P.y = q.y; P.gp = best; } else { P.y = gT; P.gp = null; }
    if (best >= 0 && !P.onG) S.ev.push({ k: "on", i: best });
    P.onG = true; P.vy = -2; P.coyote = COYOTE;
  } else if (P.onG) { P.onG = false; P.gp = null; P.coyote = COYOTE; if (P.jumps === 0) P.jumps = 1; }

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

  // flags
  for (const f of W.flags) {
    if (S.flags.has(f.i)) continue;
    if (Math.hypot(P.x - f.x, P.z - f.z) < 3 && Math.abs(P.y - f.y) < 3) { S.flags.add(f.i); S.ckpt = { x: f.x, y: f.y, z: f.z }; S.ev.push({ k: "flag", i: f.i, x: f.x, y: f.y, z: f.z }); }
  }
  // zones
  const z = zoneAt(P.x, P.z, S.zone);
  if (z !== S.zone) { S.zone = z; S.ev.push({ k: "zone", zone: z }); }
  // who is close enough to talk to or to light
  S.nearNpc = null; S.nearShrine = null;
  if (!S.finished) {
    let bd = 3.3;
    for (const n of W.npcs) { const d = Math.hypot(P.x - n.x, P.z - n.z); if (d < bd && Math.abs(P.y - n.y) < 2.5) { bd = d; S.nearNpc = n; } }
    if (!S.nearNpc) for (const sh of W.shrines) { if (S.shrines.has(sh.i)) continue; const d = Math.hypot(P.x - sh.x, P.z - sh.z); if (d < 3.6 && Math.abs(P.y - sh.y) < 2.6) { S.nearShrine = sh; break; } }
  }
  if (S.dlg) { const n = W.npcs.find((q) => q.id === S.dlg.npc); if (!n || Math.hypot(P.x - n.x, P.z - n.z) > 6) S.dlg = null; }

  for (let i = S.pickups.length - 1; i >= 0; i--) {
    const q = S.pickups[i]; q.t += dt;
    if (Math.hypot(P.x - q.x, P.z - q.z) < 1.3 && Math.abs(P.y + 0.7 - q.y) < 1.8) { S.pickups.splice(i, 1); if (P.hp < maxHp(S)) P.hp++; S.ev.push({ k: "heal", id: q.id, x: q.x, y: q.y, z: q.z }); }
    else if (q.t > 30) S.pickups.splice(i, 1);
  }
  // enemies and the boss: run here, or followed from the host's snapshots
  const who = [P, ...others];
  if (S.ai) { creatures(S, W, dt, who); bossStep(S, W, dt, who); } else follow(S, dt);
  contacts(S, W);
  bossHurt(S, W);
  // fallen into the water, or off the world: back to the last flag
  if (P.y < SEA - 0.4 && W.H(P.x, P.z) < 0) { S.ev.push({ k: "splash", x: P.x, z: P.z }); respawn(S, W, false); }
  else if (P.y < S.ckpt.y - FALL) respawn(S, W, false);
  const sp = Math.hypot(P.vx, P.vz);
  P.speed = sp;
  if (sp > 0.6 && P.dashT <= 0) { let d = Math.atan2(P.vx, P.vz) - P.face; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; P.face += d * Math.min(1, dt * 14); }
  return S.ev;
}

function collide(S, W) {
  const P = S.pl;
  for (const c of W.cols) {
    if (!c.on) continue;
    const dx = P.x - c.x, dz = P.z - c.z;
    if (dx > 6 || dx < -6 || dz > 6 || dz < -6) continue;
    if (P.y > c.y0 + c.h - 0.1) continue;
    const d = Math.hypot(dx, dz), lim = c.r + PR;
    if (d < lim && d > 1e-4) {
      const nx = dx / d, nz = dz / d; P.x = c.x + nx * lim; P.z = c.z + nz * lim;
      const vn = P.vx * nx + P.vz * nz; if (vn < 0) { P.vx -= vn * nx; P.vz -= vn * nz; }
    }
  }
  const B = S.boss, A = W.arena;
  if (B.state !== "dead") {
    const dx = P.x - B.x, dz = P.z - B.z, d = Math.hypot(dx, dz), lim = 3.0 + PR;
    if (d < lim && d > 1e-4) { P.x = B.x + (dx / d) * lim; P.z = B.z + (dz / d) * lim; }
  }
  // the yard wall: shut until the gate is open, and only the gate gap is a door
  const dx = P.x - A.x, dz = P.z - A.z, d = Math.hypot(dx, dz);
  if (Math.abs(d - A.r) < 0.9 && P.y < A.y + 7) {
    let ad = Math.atan2(dz, dx) - A.gateAng; while (ad > Math.PI) ad -= TAU; while (ad < -Math.PI) ad += TAU;
    const door = S.gateOpen && S.gateT > 0.7 && Math.abs(ad) < 0.21;
    if (!door) {
      const out = d > A.r, tgt = out ? A.r + 0.9 : A.r - 0.9;
      P.x = A.x + (dx / d) * tgt; P.z = A.z + (dz / d) * tgt;
      const nx = dx / d, nz = dz / d, vn = P.vx * nx + P.vz * nz;
      if ((out && vn < 0) || (!out && vn > 0)) { P.vx -= vn * nx; P.vz -= vn * nz; }
    }
  }
}

// ── slimes and wisps ───────────────────────────────────────────────────────
// Where an idle slime is at clock T: a loop round its home (no dice — they
// gave every phone its own slimes).
export const slimeWander = (s, T) => [s.hx + Math.sin(T * 0.37 + s.ph) * SL_WANDER, s.hz + Math.sin(T * 0.29 + s.ph * 2.1) * SL_WANDER];
const nearestTo = (who, x, y, z, maxD, maxDy) => {
  let best = null, bd = maxD;
  for (const p of who) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd && Math.abs(p.y - y) < maxDy) { bd = d; best = p; } }
  return best;
};
function creatures(S, W, dt, who) {
  for (const s of S.slimes) {
    if (!s.alive) continue;
    s.t = S.T + s.ph;
    const hop = Math.max(0, Math.sin(s.t * 5)), tg = nearestTo(who, s.x, s.y, s.z, 7, 3);
    // somebody close: it hops after them; otherwise back onto its loop, and along it
    let tx, tz, sp;
    if (tg) { tx = tg.x; tz = tg.z; sp = 2.1 * (0.4 + hop); } else { [tx, tz] = slimeWander(s, S.T); sp = 2.4; }
    const dx = tx - s.x, dz = tz - s.z, l = Math.hypot(dx, dz);
    if (!tg && l < 0.3) { if (W.H(tx, tz) > 0.6) { s.x = tx; s.z = tz; } }
    else if (l > 1e-3) {
      const m = Math.min(l, sp * dt), nx = s.x + (dx / l) * m, nz = s.z + (dz / l) * m;
      if (W.H(nx, nz) > 0.6 && Math.abs(W.H(nx, nz) - W.H(s.x, s.z)) < 0.8) { s.x = nx; s.z = nz; }
    }
    if (l > 1e-3) s.dir = Math.atan2(dx, dz);
    s.y = W.H(s.x, s.z) + hop * 0.5;
  }
  for (const w of S.wisps) {
    if (!w.alive) continue;
    w.t = S.T + w.ph; w.cd = Math.max(0, w.cd - dt);
    const hx = w.boss ? W.arena.x : w.hx, hz = w.boss ? W.arena.z : w.hz;
    if (w.st === 0) {
      // drifting round its home by the clock
      const a = w.t * 0.8, tx = hx + Math.cos(a) * 2.5, tz = hz + Math.sin(a) * 2.5, ty = W.H(tx, tz) + 1.8 + Math.sin(w.t * 2) * 0.35;
      const dx = tx - w.x, dz = tz - w.z, l = Math.hypot(dx, dz);
      if (l < 0.3 && Math.abs(ty - w.y) < 0.3) { w.x = tx; w.z = tz; w.y = ty; }
      else {
        const m = Math.min(l, 5 * dt);
        if (l > 1e-4) { w.x += (dx / l) * m; w.z += (dz / l) * m; }
        w.y += clamp(ty - w.y, -4 * dt, 4 * dt);
      }
      const tg = nearestTo(who, w.x, w.y - 0.7, w.z, 9, 9);
      if (tg && w.cd <= 0 && !S.finished) {
        const ex = tg.x - w.x, ez = tg.z - w.z, ey = tg.y + 0.7 - w.y, d3 = Math.hypot(ex, ez, ey) || 1;
        if (d3 < 9) { w.st = 1; w.st0 = 0; w.vx = ex / d3; w.vz = ez / d3; w.vy = ey / d3; }
      }
    } else if (w.st === 1) {
      w.st0 += dt; w.x += w.vx * 5.5 * dt; w.z += w.vz * 5.5 * dt; w.y += w.vy * 5.5 * dt;
      if (w.st0 > 1.1) { w.st = 2; w.st0 = 0; }
    } else {
      w.st0 += dt;
      const idleY = W.H(w.x, w.z) + 1.8 + Math.sin(w.t * 2) * 0.35;
      w.x += (hx - w.x) * Math.min(1, dt * 1.4); w.z += (hz - w.z) * Math.min(1, dt * 1.4); w.y += (idleY - w.y) * Math.min(1, dt * 2);
      if (w.st0 > 1.3) { w.st = 0; w.cd = 1.2; }
    }
  }
}
// my explorer against the slimes and wisps as they are here: land on one and
// it pops, touch one and it hurts
function contacts(S, W) {
  const P = S.pl;
  for (const s of S.slimes) {
    if (!s.alive) continue;
    const dxp = P.x - s.x, dzp = P.z - s.z, dp = Math.hypot(dxp, dzp), dy = P.y - s.y;
    if (dp < 0.95 && dy > -0.6 && dy < 1.1) {
      if (P.vy < -2 && dy > 0.35) { killSlime(S, s, "stomp"); P.vy = 10; P.jumps = 1; P.own = false; P.onG = false; P.gp = null; P.sq = -0.5; S.ev.push({ k: "stomp", x: s.x, y: s.y, z: s.z }); }
      else if (P.inv <= 0) { const l2 = Math.max(dp, 0.01); hurt(S, W, dxp / l2, dzp / l2); }
    }
  }
  for (const w of S.wisps) {
    if (!w.alive) continue;
    const hd = Math.hypot(P.x - w.x, P.z - w.z), vd = (P.y + 0.7) - w.y;
    if (hd < 0.95 && vd > -1.0 && vd < 1.3) {
      if (P.vy < -2 && vd > 0.5) { killWisp(S, w, "stomp"); P.vy = 10; P.jumps = 1; P.own = false; P.onG = false; P.gp = null; P.sq = -0.5; S.ev.push({ k: "stomp", x: w.x, y: w.y, z: w.z }); }
      else if (P.inv <= 0) { const l2 = Math.max(hd, 0.01); hurt(S, W, (P.x - w.x) / l2, (P.z - w.z) / l2); }
    }
  }
}
function spawnWisps(S, W, n) {
  let alive = 0; S.wisps.forEach((w) => { if (w.boss && w.alive) alive++; });
  const rng = mkRng(W.code + "/wisp" + S.wisps.length), A = W.arena;
  for (let k = 0; k < n && alive < 3; k++) {
    const a = rng() * TAU;
    S.wisps.push({ i: 100 + S.wisps.length, x: A.x + Math.cos(a) * (A.r - 3), z: A.z + Math.sin(a) * (A.r - 3), hx: A.x, hz: A.z, y: A.y + 2.2, ph: rng() * 6, t: 0, alive: true, st: 0, st0: 0, vx: 0, vz: 0, vy: 0, cd: 0.6, boss: true });
    alive++;
  }
}

// ── the Shade Colossus ─────────────────────────────────────────────────────
// Sleeps till the gate is open and someone steps in. Cycle: slam, rain, slam,
// rain, stunned. Jump the slam ring; leave the red circles before the orbs
// land; pulse it while it glows. Everyone out of the yard: it goes back to
// sleep with its hearts back.
function bossStep(S, W, dt, who) {
  const B = S.boss, A = W.arena;
  if (B.state === "dead") return;
  const inYard = who.filter((p) => Math.hypot(p.x - A.x, p.z - A.z) < A.r + 4);
  if (B.state === "sleep") {
    if (S.gateOpen && who.some((p) => Math.hypot(p.x - A.x, p.z - A.z) < A.r - 3)) { B.state = "intro"; B.t = 0; S.ev.push({ k: "bossIntro" }); }
    return;
  }
  if (!inYard.length) { bossReset(S); return; }
  B.t += dt;
  const tg = nearestTo(inYard, B.x, B.y, B.z, 1e9, 1e9) || inYard[0];
  B.face = Math.atan2(tg.x - B.x, tg.z - B.z);
  if (B.state === "intro") { if (B.t > 2.2) { B.state = "cycle"; B.idx = 0; B.t = 0; B.sub = 0; } return; }
  const phase2 = B.hp <= 5, cur = CYCLE[B.idx % 5];
  const next = () => { B.idx++; B.t = 0; B.sub = 0; B.tele = 0; B.ringR = 0; B.orbs = []; };
  if (cur === "slam") {
    if (B.sub === 0) { B.tele = clamp(B.t / 0.9, 0, 1); if (B.t >= 0.9) { B.sub = 1; B.t = 0; B.ringR = 2.4; B.tele = 0; S.ev.push({ k: "slam" }); if (phase2) spawnWisps(S, W, 2); } }
    else if (B.sub === 1) { B.ringR += (phase2 ? 11 : 9) * dt; if (B.ringR > A.r + 1) { B.sub = 2; B.t = 0; B.ringR = 0; } }
    else if (B.t > 0.6) next();
  } else if (cur === "rain") {
    if (B.sub === 0) {
      if (!B.orbs.length) {
        // where they fall: round whoever it faces, from the island's seed
        const rng = mkRng(W.code + "/boss" + B.rains++), n = phase2 ? 4 : 3;
        for (let k = 0; k < n; k++) B.orbs.push({ x: clamp(tg.x + (rng() - 0.5) * 7, A.x - A.r + 2, A.x + A.r - 2), z: clamp(tg.z + (rng() - 0.5) * 7, A.z - A.r + 2, A.z + A.r - 2) });
      }
      B.tele = clamp(B.t / (phase2 ? 0.9 : 1.1), 0, 1);
      if (B.tele >= 1) { B.sub = 1; B.t = 0; S.ev.push({ k: "rain" }); }
    } else { B.tele = 0; if (B.t > 0.8) next(); }
  } else {
    if (!B.stunned) { B.stunned = true; B.stunT = phase2 ? 4.2 : 5.2; B.t = 0; S.ev.push({ k: "stun" }); }
    B.stunT -= dt;
    if (B.stunT <= 0) { B.stunned = false; S.ev.push({ k: "unstun" }); next(); }
  }
}
// what the boss does to my explorer, from the boss as it is here: the slam
// ring as it passes (jump it), the orbs as they land (once a rain)
function bossHurt(S, W) {
  const B = S.boss, P = S.pl, A = W.arena;
  if (B.state !== "cycle" || S.finished) return;
  const cur = CYCLE[B.idx % 5];
  if (cur === "slam" && B.sub === 1) {
    const dd = Math.hypot(P.x - B.x, P.z - B.z);
    if (P.onG && Math.abs(dd - B.ringR) < 0.9 && P.y < A.y + 1.0 && P.inv <= 0) { const l = Math.max(dd, 0.01); hurt(S, W, (P.x - B.x) / l, (P.z - B.z) / l); }
  } else if (cur === "rain" && B.sub === 1 && S.rainSeen !== B.idx) {
    S.rainSeen = B.idx;
    for (const o of B.orbs) {
      const d = Math.hypot(P.x - o.x, P.z - o.z);
      if (d < 1.7 && P.y < A.y + 2.4 && P.inv <= 0) { const l = Math.max(d, 0.01); hurt(S, W, (P.x - o.x) / l, (P.z - o.z) / l); }
    }
  }
}

// ── together: the host's creatures and boss ─────────────────────────────────
// The host sends this ~8 times a second (isl:host): the boss, every slime,
// the wisps (the boss's only while they live). Rounded, well under 4 KB.
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
export function hostSnap(S) {
  const B = S.boss;
  return {
    b: { st: BOSS_STATES.indexOf(B.state), sub: B.sub, hp: B.hp, stun: B.stunned ? 1 : 0, tele: r2(B.tele), t: r2(B.t),
      orbs: B.orbs.flatMap((o) => [r1(o.x), r1(o.z)]), ringR: r1(B.ringR), face: r2(B.face), idx: B.idx },
    s: S.slimes.map((s) => [s.i, r1(s.x), r1(s.z), r1(s.y), r2(s.dir), s.alive ? 1 : 0]),
    w: S.wisps.filter((w) => !w.boss || w.alive).map((w) => [w.i, r1(w.x), r1(w.y), r1(w.z), w.st, w.alive ? 1 : 0, w.boss ? 1 : 0]),
  };
}
// Not the host: the snapshot becomes where things are heading (follow eases
// them there). Kills are never undone (a slime I've just popped may still be
// in it); one missing from it, or marked gone, is a kill here. Returns the
// moments to show: the slam, the rain, the stun, a kill.
export function applyHost(S, W, m) {
  S.ev = [];
  const B = S.boss, b = (m && m.b) || {}, num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const st = BOSS_STATES[num(b.st, -1)];
  if (st && B.state !== "dead") {
    if (st === "dead") applyEvent(S, W, { k: "bossDead" }).forEach((e) => S.ev.push(e));
    else {
      const idx = num(b.idx), sub = num(b.sub), stun = !!b.stun, cur = CYCLE[idx % 5];
      if (B.state === "sleep" && st !== "sleep") S.ev.push({ k: "bossIntro" });
      if (st === "sleep" && B.state !== "sleep") S.ev.push({ k: "bossReset" });
      if (st === "cycle" && sub === 1 && (B.sub !== 1 || B.idx !== idx)) { if (cur === "slam") S.ev.push({ k: "slam" }); else if (cur === "rain") S.ev.push({ k: "rain" }); }
      if (stun && !B.stunned) S.ev.push({ k: "stun" });
      if (idx < B.idx || st !== "cycle") S.rainSeen = -1;
      const ring = num(b.ringR);
      B.ringR = st === "cycle" && cur === "slam" && sub === 1 && B.idx === idx && B.sub === 1 ? Math.max(B.ringR, ring) : ring;
      Object.assign(B, { state: st, sub, idx, hp: clamp(num(b.hp, B.hp), 0, B.max), stunned: stun, tele: num(b.tele), t: num(b.t), nface: num(b.face) });
      if (stun) B.stunT = (B.hp <= 5 ? 4.2 : 5.2) - B.t;
      const o = Array.isArray(b.orbs) ? b.orbs : [];
      B.orbs = [];
      for (let k = 0; k + 1 < o.length && B.orbs.length < 4; k += 2) B.orbs.push({ x: num(o[k]), z: num(o[k + 1]) });
    }
  }
  for (const a of Array.isArray(m && m.s) ? m.s : []) {
    if (!Array.isArray(a)) continue;
    const s = S.slimes[num(a[0], -1)];
    if (!s || !s.alive) continue;
    if (!a[5]) { applyEvent(S, W, { k: "kill", t: "slime", i: s.i }).forEach((e) => S.ev.push(e)); continue; }
    Object.assign(s, { nx: num(a[1], s.x), nz: num(a[2], s.z), ny: num(a[3], s.y), ndir: num(a[4], s.dir) });
  }
  const seen = new Set();
  for (const a of Array.isArray(m && m.w) ? m.w : []) {
    if (!Array.isArray(a)) continue;
    const i = num(a[0], -1);
    if (i < 0 || i > 999) continue;
    seen.add(i);
    let w = S.wisps.find((q) => q.i === i);
    if (!w && a[5] && a[6]) {
      w = { i, x: num(a[1]), y: num(a[2]), z: num(a[3]), hx: W.arena.x, hz: W.arena.z, ph: (i * 2.399) % 6, t: 0, alive: true, st: 0, st0: 0, vx: 0, vz: 0, vy: 0, cd: 0, boss: true };
      S.wisps.push(w);
    }
    if (!w || !w.alive) continue;
    if (!a[5]) { applyEvent(S, W, { k: "kill", t: "wisp", i }).forEach((e) => S.ev.push(e)); continue; }
    Object.assign(w, { nx: num(a[1], w.x), ny: num(a[2], w.y), nz: num(a[3], w.z), st: num(a[4]) });
  }
  for (const w of S.wisps) if (w.boss && w.alive && !seen.has(w.i)) w.alive = false;
  return S.ev;
}
// easing toward the host's last word, between snapshots
function follow(S, dt) {
  const k = Math.min(1, dt * 10), wrap = (d) => { while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
  for (const s of S.slimes) {
    if (!s.alive) continue;
    s.t = S.T + s.ph;
    if (s.nx === undefined) continue;
    if (Math.hypot(s.nx - s.x, s.nz - s.z) > 6) { s.x = s.nx; s.z = s.nz; s.y = s.ny; }
    s.x += (s.nx - s.x) * k; s.z += (s.nz - s.z) * k; s.y += (s.ny - s.y) * k; s.dir += wrap(s.ndir - s.dir) * k;
  }
  for (const w of S.wisps) {
    if (!w.alive) continue;
    w.t = S.T + w.ph;
    if (w.nx === undefined) continue;
    if (Math.hypot(w.nx - w.x, w.nz - w.z) > 6) { w.x = w.nx; w.z = w.nz; w.y = w.ny; }
    w.x += (w.nx - w.x) * k; w.y += (w.ny - w.y) * k; w.z += (w.nz - w.z) * k;
  }
  const B = S.boss;
  if (B.nface !== undefined) B.face += wrap(B.nface - B.face) * k;
  if (B.state === "cycle" && CYCLE[B.idx % 5] === "slam" && B.sub === 1) B.ringR += (B.hp <= 5 ? 11 : 9) * dt;
}

// ── the shared-world seam ──────────────────────────────────────────────────
// A friend's moment, played into my run: the world changes, not their loot.
// Returns the moments to show here.
//   kill { t: "slime" | "wisp", i }  the same heart drops here (by its index),
//                                   and it counts for Pip while his quest is on
//   heart { id }                     a friend took that heart: it's gone here
//   shrine { i }                     lit for the side; the gate opens at four
//   bossHit                          (the host) a friend's pulse on the stunned boss
//   bossDead                         the colossus is gone: Sunhaven is saved
export function applyEvent(S, W, e) {
  const out = [];
  if (!e) return out;
  if (e.k === "kill") {
    const list = e.t === "slime" ? S.slimes : e.t === "wisp" ? S.wisps : null;
    const c = list && list.find((q) => q.i === e.i);
    if (c && c.alive) {
      c.alive = false;
      if (e.t === "slime" && S.pipQ === 1) S.pipK++;
      if (!c.boss) dropHeart(S, e.t, c.i, c.x, e.t === "wisp" ? c.y - 1 : c.y, c.z);
      out.push({ k: "kill", t: e.t, i: c.i, how: "friend", x: c.x, y: c.y, z: c.z });
    }
  } else if (e.k === "heart") {
    const n = S.pickups.length;
    S.pickups = S.pickups.filter((q) => q.id !== e.id);
    if (S.pickups.length !== n) out.push({ k: "heartGone", id: e.id });
  } else if (e.k === "shrine") {
    const sh = W.shrines[e.i];
    if (sh && !S.shrines.has(sh.i)) {
      S.shrines.add(sh.i);
      if (S.quest === 0) S.quest = 1;
      out.push({ k: "shrine", i: sh.i, count: S.shrines.size, x: sh.x, y: sh.y, z: sh.z, col: sh.col, friend: true });
      if (S.shrines.size >= SHRINES && !S.gateOpen) { S.gateOpen = true; S.gateT = 0; out.push({ k: "gate" }); }
    }
  } else if (e.k === "bossHit") {
    const B = S.boss;
    if (S.ai && B.state === "cycle" && B.stunned && B.hitCd <= 0) {
      const ev = S.ev; S.ev = out;
      hitBoss(S, W);
      S.ev = ev;
    }
  } else if (e.k === "bossDead") {
    const B = S.boss;
    if (B.state !== "dead") {
      const ev = S.ev; S.ev = out;
      bossDie(S);
      S.ev = ev;
      out[out.length - 1].friend = true;
    }
  }
  return out;
}

// ── score ──────────────────────────────────────────────────────────────────
// 1,000 a shrine, 50 a creature; the colossus beaten is 5,000 and 5 for every
// second under fifteen minutes on the island (S.t0: the clock on arrival).
export function score(S) {
  let s = S.shrines.size * 1000 + S.kills * 50;
  if (S.boss.state === "dead") s += 5000 + Math.max(0, Math.round(900 - (S.finishT - S.t0))) * 5;
  return Math.min(ISLE_PTS_CAP, s);
}
// the quest line, Pip's line, and what the golden arrow points at
export function sideText(S) { return S.pipQ === 1 ? (S.pipK >= 4 ? "Pip: talk to Pip for your charm" : `Pip: pop slimes ${S.pipK} / 4`) : ""; }
export function questText(S) {
  if (S.boss.state === "dead") return "Sunhaven is saved!";
  if (S.quest === 0) return "Talk to Elder Sol in the village";
  if (S.shrines.size < SHRINES) return `Light the sun shrines  ${S.shrines.size} / ${SHRINES}`;
  return "The tower gate is open: defeat the Shade Colossus";
}
export function objective(S, W) {
  const P = S.pl;
  if (S.boss.state === "dead") return null;
  if (S.quest === 0) { const n = W.npcs[0]; return { x: n.x, z: n.z, y: n.y, name: "Elder Sol" }; }
  if (S.shrines.size < SHRINES) {
    let best = null, bd = 1e9;
    for (const sh of W.shrines) { if (S.shrines.has(sh.i)) continue; const d = Math.hypot(sh.x - P.x, sh.z - P.z); if (d < bd) { bd = d; best = sh; } }
    return best && { x: best.x, z: best.z, y: best.y, name: best.name };
  }
  return { x: W.arena.x, z: W.arena.z, y: W.arena.y, name: "Shade Tower" };
}
