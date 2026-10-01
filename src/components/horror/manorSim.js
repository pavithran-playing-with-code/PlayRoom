// src/components/horror/manorSim.js
// HOLLOW MANOR, solo — a first-person walk through a maze at night: take every
// relic, keep the torch fed with batteries, leave by the far gate. Something
// patrols the halls. It hears running, sees torchlight, and hunts.
//
// Ported from a standalone page; the numbers are the original's. The maze,
// movement and the ghost are manorCore.mjs, shared with the multiplayer game
// and the server. This file is the solo night around them: nights that grow,
// the memorise-the-map intro, the walk in through the gate, the music box,
// and the lines it says to you.
//
// Nothing here draws or plays sound: anything the page should hear about is
// pushed onto `s.events`. No React and no DOM, so it runs from a Node script.
import {
  D4, R, HURDLE, BEAM, rng, shuffle, genMaze, dmap, floors, los, canAt, farGate, placeObstacles,
  newBody, litBody, mvOK as bodyMvOK, jumpBody, stepBody,
  newGhost, ghostTarget, ghostPatrol, ghostSees, ghostSpeed as speedOf, stepGhost,
} from "./manorCore.mjs";

export { D4, R, HURDLE, BEAM, dmap, floors, los, canAt };
export const INTRO_S = 9;              // seconds to memorise the map
export const DECOYS = 2;

const RELIC_LINES = [
  "A child's tooth wrapped in silk. Something stirs.",
  "A cracked locket. It whispers your name.",
  "A wedding ring, still warm. The walls lean closer.",
  "A black candle. Footsteps overhead.",
];
const LAST_RELIC = "The last relic. The gate is open. Run.";
export const AMBIENT = [
  "Something is breathing behind you...",
  "The floorboards creak. Not from you.",
  "A whisper: stay.",
  "Cold air brushes your neck.",
];

// Bigger and fuller every night.
export function nightSize(night) {
  return { N: Math.min(37, 25 + night * 2), need: Math.min(8, 4 + night) };
}

// ── a night ──────────────────────────────────────────────────────────────────

export function newNight(seed, night = 1) {
  const rand = rng((Number(seed) || 1) + night * 104729);
  let { N, need } = nightSize(night);
  const g = genMaze(N, rand);
  const d0 = dmap(g, N, 1, 1);
  const f = shuffle(floors(g, N), rand);
  const { far, exitT } = farGate(g, N, d0, f);
  g[1][0] = 0;                          // the entrance gate, open until you are through

  const relics = [];
  for (const c of f) {
    if (relics.length >= need) break;
    if (d0[c[0] + c[1] * N] < 12 || Math.hypot(c[0] - exitT.x, c[1] - exitT.y) < 6) continue;
    if (relics.every((r) => Math.hypot(r.x - c[0] - 0.5, r.y - c[1] - 0.5) > 7)) relics.push({ x: c[0] + 0.5, y: c[1] + 0.5, got: false });
  }
  need = relics.length;

  const cells = [];
  for (const c of f) {
    if (cells.length >= 4) break;
    if (d0[c[0] + c[1] * N] > 6 && cells.every((o) => Math.hypot(o.x - c[0] - 0.5, o.y - c[1] - 0.5) > 6)) cells.push({ x: c[0] + 0.5, y: c[1] + 0.5, got: false });
  }

  const gs = f.find((c) => d0[c[0] + c[1] * N] > 24 && relics.every((r) => Math.hypot(r.x - c[0], r.y - c[1]) > 4)) || far;
  const avoid = new Set([...relics, ...cells].map((q) => `${q.x | 0},${q.y | 0}`));
  const obst = placeObstacles(g, N, d0, f, avoid, 8);

  const P = newBody(0.5, 1.5, 0);
  const s = {
    seed, night, rand, N, g, need, relics, cells, exitT, obst, far,
    env: { g, N, obst },
    G: newGhost(gs[0] + 0.5, gs[1] + 0.5),
    P,
    count: 0,
    decoys: DECOYS, pulses: [], puffs: [], hint: {},
    tm: 0, gStep: 0, hb: 0, ambT: 20,
    msg: "", msgT: 0,
    mode: "intro", introT: INTRO_S, deadT: 0,
    events: [],
  };
  ghostPatrol(s.G, s.env, rand);
  return s;
}

const emit = (s, name, v) => s.events.push(v === undefined ? { name } : { name, v });
export function say(s, text, ms) { s.msg = text; s.msgT = ms || 0; }
export const lit = (s) => litBody(s.P);

// The dark falls: the map goes and you walk in through the gate.
export function begin(s) {
  if (s.mode !== "intro") return;
  s.mode = "play";
  s.P.entering = true;
  say(s, "You step through the entrance gate...", 3000);
}

// ── things you do ────────────────────────────────────────────────────────────

export const mvOK = (s, nx, ny) => bodyMvOK(s.env, s.P, nx, ny);

export function jump(s) {
  if (s.mode !== "play") return;
  if (jumpBody(s.P)) emit(s, "jump");
}

export function toggleCrouch(s) { s.P.crouch = !s.P.crouch; }
export function toggleLight(s) { s.P.light = !s.P.light; }
export function toggleRun(s) { s.P.runOn = !s.P.runOn; }

// The music box: the thing goes to where you are now. Leave.
export function decoy(s) {
  if (s.mode !== "play") return;
  if (!s.decoys) { say(s, "The music box is empty.", 2000); return; }
  if (s.G.st === "hunt" && s.G.lose < 1) { say(s, "It is watching you. Break line of sight first!", 2200); return; }
  s.decoys--;
  s.pulses.push({ x: s.P.x, y: s.P.y, t: 8 });
  emit(s, "musicBox");
  s.G.st = "search"; s.G.wait = -4; s.G.stun = 0; s.G.prey = null;
  ghostTarget(s.G, s.env, s.P.x | 0, s.P.y | 0);
  say(s, "The music box plays. It turns toward the sound. Slip away!", 3500);
}

// ── the thing ────────────────────────────────────────────────────────────────

const asTarget = (s) => ({ id: 1, x: s.P.x, y: s.P.y, lit: litBody(s.P), cr: s.P.cr, noiseR: s.P.noiseR });
export const seesYou = (s) => ghostSees(s.G, s.env, asTarget(s));
// Faster with each relic you take and each night you survive.
export const hustleOf = (s) => 0.12 * s.count + 0.08 * (s.night - 1);
export const ghostSpeed = (s) => speedOf(s.G, hustleOf(s));

function caught(s) {
  if (s.mode !== "play") return;
  s.mode = "dead";
  s.deadT = 0;
  emit(s, "caught");
  say(s, "", 0);
}

// ── one frame ────────────────────────────────────────────────────────────────
// `inp`: ix, iy (-1..1, iy -1 = forward), turn (-1..1), shift (bool).

export function tick(s, inp, dt) {
  if (s.mode === "intro") { s.introT -= dt; if (s.introT <= 0) begin(s); }
  else if (s.mode === "play") update(s, inp, dt);
  else if (s.mode === "dead") s.deadT += dt;
}

function update(s, inp, dt) {
  const P = s.P, N = s.N;
  s.tm += dt;
  stepBody(P, s.env, inp, dt, (name) => emit(s, name));

  if (P.entering && P.x >= 1.6) {
    P.entering = false;
    s.g[1][0] = 1;
    emit(s, "gateSlam");
    s.G.stun = 3;
    say(s, "The gate slams shut behind you. Find the relics, then the far gate.", 5000);
  }

  const ct = (P.y | 0) * N + (P.x | 0);
  if (ct !== P.lastTile) {
    if (s.obst[ct]) { s.puffs.push({ x: (ct % N) + 0.5, y: ((ct / N) | 0) + 0.5, t: 0.9 }); emit(s, "puff"); }
    P.lastTile = ct;
  }

  if (P.light && !P.entering) {
    const b0 = P.bat;
    P.bat = Math.max(0, P.bat - dt * 0.011);
    if (b0 > 0 && P.bat === 0) say(s, "Your light died. Find a battery.", 3500);
  }
  for (const c of s.cells) {
    if (!c.got && Math.hypot(c.x - P.x, c.y - P.y) < 0.6) {
      c.got = true;
      P.bat = Math.min(1, P.bat + 0.6);
      emit(s, "battery");
      say(s, "Fresh batteries.", 2500);
    }
  }

  if (!P.entering) {
    for (const r of s.relics) {
      if (!r.got && Math.hypot(r.x - P.x, r.y - P.y) < 0.6) {
        r.got = true;
        s.count++;
        emit(s, "relic");
        if (s.G.st !== "hunt") { s.G.st = "search"; s.G.wait = 0; ghostTarget(s.G, s.env, P.x | 0, P.y | 0); }
        say(s, s.count >= s.need ? LAST_RELIC : RELIC_LINES[(s.count - 1) % 4], 4000);
      }
    }
  }

  const ex = s.exitT.x + 0.5, ey = s.exitT.y + 0.5;
  if (Math.hypot(ex - P.x, ey - P.y) < 1.2) {
    if (s.count >= s.need) { s.mode = "won"; emit(s, "win"); return; }
    else if (s.msgT <= 0) say(s, "The far gate is sealed. Find all the relics.", 2500);
  }

  if (!P.entering) {
    const got = stepGhost(s.G, s.env, [asTarget(s)], dt, s.rand, hustleOf(s), (name) => {
      if (name === "spotted") emit(s, "spotted");
      if (name === "lost") say(s, "It lost you...", 2500);
    });
    if (got != null) caught(s);
  }
  if (s.mode !== "play") return;

  hints(s, P);
  s.puffs.forEach((q) => { q.t -= dt; });
  s.puffs = s.puffs.filter((q) => q.t > 0);
  P.lightOut -= dt;
  s.pulses.forEach((q) => { q.t -= dt; });
  s.pulses = s.pulses.filter((q) => q.t > 0);

  s.ambT -= dt;
  if (s.ambT <= 0 && s.msgT <= 0) {
    s.ambT = 22 + s.rand() * 15;
    say(s, AMBIENT[(s.rand() * 4) | 0], 3000);
  }
  if (s.msgT > 0) { s.msgT -= dt * 1000; if (s.msgT <= 0) say(s, "", 0); }

  // Near it, the torch stutters, its footsteps get louder, your heart goes.
  const d = Math.hypot(P.x - s.G.x, P.y - s.G.y);
  const danger = dangerOf(s);
  if (danger > 0.55 && P.lightOut <= 0 && P.light && s.rand() < dt * 0.4) {
    P.lightOut = 0.5 + s.rand() * 0.6;
    emit(s, "flicker");
  }
  s.gStep -= dt;
  if (s.gStep <= 0 && s.G.stun <= 0 && !P.entering) {
    s.gStep = s.G.st === "hunt" ? 0.4 : 0.7;
    const v = Math.max(0, 1 - d / 12) * 0.35;
    if (v > 0.03) emit(s, "ghostStep", v);
  }
  if (danger > 0.12) { s.hb -= dt; if (s.hb <= 0) { s.hb = 1.1 - 0.7 * danger; emit(s, "heartbeat", 0.4 + danger); } }
}

// "A barricade blocks the way" the first time one is in front of you.
export function hints(s, P) {
  const N = s.N;
  for (const k in s.obst) {
    const ox = (+k % N) + 0.5, oy = ((+k / N) | 0) + 0.5;
    if (Math.hypot(ox - P.x, oy - P.y) < 2.4) {
      let da = Math.atan2(oy - P.y, ox - P.x) - P.fa;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < 0.7 && !s.hint[s.obst[k]] && s.msgT <= 0) {
        s.hint[s.obst[k]] = 1;
        say(s, s.obst[k] === HURDLE ? "A barricade blocks the way. Jump over it! (Space or Jump)" : "A low beam. Crouch under it! (C or Crouch)", 3500);
      }
    }
  }
}

// 0 far away, 1 on top of you; halved unless it is hunting.
export function dangerOf(s) {
  const G = s.G;
  const d = Math.hypot(s.P.x - G.x, s.P.y - G.y);
  return Math.max(0, 1 - d / 10) * (G.st === "hunt" ? 1 : 0.55);
}

export const timeText = (sec) => {
  const n = Math.floor(sec);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};
