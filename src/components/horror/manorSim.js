// src/components/horror/manorSim.js
// NANA'S LULLABY, solo — a first-person walk through Nana Elowen's house at
// night: find the three keys, unlock the front door, get out. Nana walks the
// halls humming a lullaby. While she hums you're safe to move; when the
// humming stops she is listening — move then and she hears you. She also
// hears running and sees your light, and hunts.
// Doors creak open and can be shut behind you; tables, beds and wardrobes
// hide you — it can't catch you there, and if it watched you go in it only
// searches a while and gives up. Now and then the house tries to frighten you (scareStep)
// — cosmetic only: it never changes what the ghost does.
//
// Ported from a standalone page; the numbers are the original's. The house,
// movement, doors, hiding spots and the ghost are manorCore.mjs, shared with the multiplayer game
// and the server. This file is the solo night around them: nights that grow,
// the memorise-the-map intro, the walk in through the gate, the music box,
// and the lines it says to you.
//
// Nothing here draws or plays sound: anything the page should hear about is
// pushed onto `s.events`. No React and no DOM, so it runs from a Node script.
import {
  D4, R, HURDLE, BEAM, FLOOR, WALL, DOOR, SPOT, rng, shuffle, genHouse, houseSize, dmap, floors, roomFloors,
  nameRooms, roomAt, ROOM_KINDS,
  los, canAt, farGate, gapObstacles,
  newBody, litBody, mvOK as bodyMvOK, jumpBody, stepBody,
  newGhost, ghostTarget, ghostPatrol, ghostSees, ghostSpeed as speedOf, stepGhost,
  actionAt, ACTION_LABEL, watcher, hideIn, leaveLocker,
  newHum, stepHum, listeningNow, lampCount, lampOn, stepLamps, GRACE_S, HEAR_R,
} from "./manorCore.mjs";

export { D4, R, HURDLE, BEAM, FLOOR, WALL, DOOR, SPOT, dmap, floors, los, canAt, ROOM_KINDS, roomAt };
export const INTRO_S = 9;              // seconds to memorise the map

const RELIC_LINES = [
  "An iron key, tied with a faded pink ribbon.",
  "A brass key, wrapped in a lace handkerchief. It smells of lavender.",
  "A tiny key from a sewing tin. Somewhere, the humming falters.",
  "A black key. Footsteps overhead.",
];
const LAST_RELIC = "The third key. The front door is unlocked. Go — quietly.";
export const AMBIENT = [
  "Somewhere, a rocking chair creaks.",
  "Knitting needles click in the dark.",
  "A whisper: stay for tea, dear.",
  "Lavender and dust. She was here a moment ago.",
];

// A little bigger and fuller with the nights, but never a hard map: 3×3
// rooms for the first two nights, 4×4 after that.
export function nightSize(night) {
  return { N: houseSize(night <= 2 ? 3 : 4), need: 3 };   // always the three keys
}

// ── a night ──────────────────────────────────────────────────────────────────

export function newNight(seed, night = 1) {
  const rand = rng((Number(seed) || 1) + night * 104729);
  let { N, need } = nightSize(night);
  const { g, doors, gaps, spots } = genHouse(N, rand);
  const d0 = dmap(g, N, 1, 1);
  const f = shuffle(roomFloors(g, N, new Set([...doors, ...gaps])), rand);
  const { far, exitT } = farGate(g, N, d0, f);
  g[exitT.y][exitT.x] = WALL;           // the far gate
  g[1][0] = FLOOR;                      // the entrance gate, open until you are through

  const relics = [];
  for (const c of f) {
    if (relics.length >= need) break;
    if (d0[c[0] + c[1] * N] < 12 || Math.hypot(c[0] - exitT.x, c[1] - exitT.y) < 6) continue;
    if (relics.every((r) => Math.hypot(r.x - c[0] - 0.5, r.y - c[1] - 0.5) > 7)) relics.push({ x: c[0] + 0.5, y: c[1] + 0.5, got: false });
  }
  need = relics.length;

  const cells = [];                      // no batteries in Nana's house: your light never dies

  const gs = f.find((c) => d0[c[0] + c[1] * N] > 24 && relics.every((r) => Math.hypot(r.x - c[0], r.y - c[1]) > 4)) || far;
  const obst = {};                      // and nothing to jump
  void gapObstacles;

  const P = newBody(0.5, 1.5, 0);
  const s = {
    seed, night, rand, N, g, need, relics, cells, exitT, obst, far, spots,
    rooms: nameRooms((N - 1) / 8, rand),
    env: { g, N, obst, doors: new Set(doors) },
    G: newGhost(gs[0] + 0.5, gs[1] + 0.5),
    P,
    count: 0,
    pulses: [], puffs: [], hint: {}, hum: newHum(rand),
    lamps: new Array(lampCount(N)).fill(0), grace: 0,
    tm: 0, gStep: 0, hb: 0, ambT: 20,
    bodies: [], flick: 0, scareT: 25 + rand() * 15,
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
  say(s, "You step in through the front door...", 3000);
}

// ── things you do ────────────────────────────────────────────────────────────

export const mvOK = (s, nx, ny) => bodyMvOK(s.env, s.P, nx, ny);

// Use: open or shut the door in front of you, hide, come out.
// Opening is loud (it carries like a landing); shutting is quieter.
export function doAction(s) {
  if (s.mode !== "play") return;
  const P = s.P;
  const u = actionAt(s.env, P, [s.G]);
  if (!u) {
    // nothing in reach: the room's light switch
    if (P.entering) return;
    const room = roomAt(s.N, P.x, P.y);
    s.lamps[room] = s.lamps[room] ? 0 : 1;
    emit(s, "click");
    say(s, s.lamps[room] ? "Lights on. She'll see you in here — and they go out when she comes in." : "Lights off.", 2600);
    return;
  }
  if (u.t === "open") { s.g[u.y][u.x] = FLOOR; P.noiseT = 0.6; emit(s, "creak", 0.28); }
  else if (u.t === "close") {
    s.g[u.y][u.x] = DOOR; P.noiseT = 0.3; emit(s, "creak", 0.15);
    say(s, "Door shut. She will have to open it.", 2000);
  } else if (u.t === "hide") {
    const seenBy = watcher([s.G], s.env, P, 1);
    hideIn(P, u, seenBy);
    emit(s, "locker");
    const where = { table: "under the table", bed: "under the bed", wardrobe: "in the wardrobe" }[u.kind];
    say(s, seenBy ? `She saw you get ${where}. Stay still — she will give up.` : `You hide ${where}. She cannot find you here.`, 3500);
  } else { leaveLocker(P); emit(s, "locker"); }
}
export const actionLabel = (s) => {
  if (s.mode !== "play") return null;
  const u = actionAt(s.env, s.P, [s.G]);
  if (u) return ACTION_LABEL[u.t];
  if (s.P.entering) return null;
  return s.lamps[roomAt(s.N, s.P.x, s.P.y)] ? "Lights off" : "Lights on";
};

export function jump(s) {
  if (s.mode !== "play") return;
  if (jumpBody(s.P)) emit(s, "jump");
}

export function toggleCrouch(s) { s.P.crouch = !s.P.crouch; }
// Your light: on, you see the halls — and she sees you from five tiles off;
// off, it's dark, and she has to be right beside you to see you.
export function toggleLight(s) {
  s.P.light = !s.P.light;
  say(s, s.P.light ? "Light on." : "Light off. Dark — but she has to be right beside you to see you now.", 2200);
}
export function toggleRun(s) { s.P.runOn = !s.P.runOn; }

// ── the thing ────────────────────────────────────────────────────────────────

// a lit room shows you as plainly as your own light does
const asTarget = (s) => ({ id: 1, x: s.P.x, y: s.P.y, lit: litBody(s.P) || lampOn(s.lamps, s.N, s.P.x, s.P.y), cr: s.P.cr, noiseR: s.P.noiseR, hid: s.P.hiding });
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
    s.g[1][0] = WALL;
    emit(s, "gateSlam");
    s.G.stun = 3;
    s.grace = GRACE_S;                       // a moment to get your bearings
    say(s, "The front door locks behind you. Find the three keys.", 5000);
  }

  const ct = (P.y | 0) * N + (P.x | 0);
  if (ct !== P.lastTile) {
    if (s.obst[ct]) { s.puffs.push({ x: (ct % N) + 0.5, y: ((ct / N) | 0) + 0.5, t: 0.9 }); emit(s, "puff"); }
    P.lastTile = ct;
  }

  // her lullaby: humming, then the silence where she listens
  if (!P.entering) {
    const hv = stepHum(s.hum, dt, s.rand);
    if (hv) emit(s, hv);
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
    else if (s.msgT <= 0) say(s, "The front door is locked. Find all three keys.", 2500);
  }

  s.grace = Math.max(0, s.grace - dt);
  if (!P.entering) {
    // walking into a lit room, she puts its light out
    stepLamps(s.lamps, s.N, [s.G], (room) => {
      if (roomAt(s.N, P.x, P.y) === room) { emit(s, "flicker"); say(s, "The lights go out. She's in here.", 2500); }
    });
    const got = stepGhost(s.G, s.env, s.grace > 0 ? [] : [asTarget(s)], dt, s.rand, hustleOf(s), (name, e) => {
      if (name === "spotted") emit(s, "spotted");
      if (name === "heard") { emit(s, "heard"); say(s, "She heard you. She's coming.", 2500); }
      if (name === "lost") say(s, "She lost you...", 2500);
      if (name === "door") emit(s, "creak", Math.max(0.03, 0.3 * (1 - Math.hypot(P.x - e.x, P.y - e.y) / 14)));
      if (name === "gaveup") say(s, "She gives up and shuffles away, humming...", 3000);
    }, s.hum);
    if (got != null) caught(s);
  }
  if (s.mode !== "play") return;

  hints(s, P);
  s.puffs.forEach((q) => { q.t -= dt; });
  s.puffs = s.puffs.filter((q) => q.t > 0);
  P.lightOut -= dt;
  s.pulses.forEach((q) => { q.t -= dt; });
  s.pulses = s.pulses.filter((q) => q.t > 0);

  scareStep(s, P, dt, s.rand, s.G.st === "hunt", (name, v) => emit(s, name, v));

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

// Scares: every half a minute or so, unless it is hunting you, you are hiding
// or still coming in — the lights stutter, something whispers behind you, or
// a body drops from the ceiling ahead. They frighten; they change nothing.
// `s` holds bodies, flick and scareT; `snd(name, v)` plays a sound. Shared
// with the online game (manorClient), where `rand` is Math.random.
export function scareStep(s, P, dt, rand, hunting, snd) {
  if (P.hiding || P.entering) return;
  if (s.flick > 0) {
    s.flick -= dt;
    if (rand() < 0.4) P.lightOut = Math.max(P.lightOut, 0.07);
    if (rand() < 0.05) snd("buzz", rand());
  }
  for (const q of s.bodies) q.t += dt;
  s.bodies = s.bodies.filter((q) => q.t < 7);
  s.scareT -= dt;
  if (s.scareT > 0 || hunting) return;
  s.scareT = 28 + rand() * 25;
  const r = rand();
  if (r < 0.34) { s.flick = 2.5; say(s, "The lights stutter...", 2500); }
  else if (r < 0.67) { say(s, "Something whispers right behind you...", 3500); snd("whisper", rand() < 0.5 ? -0.8 : 0.8); }
  else {
    const bx = P.x + Math.cos(P.fa) * 2.8, by = P.y + Math.sin(P.fa) * 2.8;
    const g = s.env.g;
    if (g[by | 0] && g[by | 0][bx | 0] === FLOOR && los(g, P.x, P.y, bx, by)) {
      s.bodies.push({ x: bx, y: by, t: 0 });
      snd("thud");
      P.shake = 0.3;
    } else s.scareT = 3;                      // nowhere to drop it: try again soon
  }
}

// "A barricade blocks the way" the first time one is in front of you; the
// same for the first door and the first hiding spot.
export function hints(s, P) {
  if (s.msgT <= 0 && !P.hiding) {
    const u = actionAt(s.env, P);
    if (u && (u.t === "open" || u.t === "hide") && !s.hint[u.t]) {
      s.hint[u.t] = 1;
      say(s, u.t === "open"
        ? "A shut door. Use opens it, but it creaks. Shut it behind you to slow it down."
        : `${u.kind === "wardrobe" ? "A wardrobe" : u.kind === "bed" ? "A bed" : "A table"}. Use to hide — she cannot find you there.`, 4000);
      return;
    }
  }
  const N = s.N;
  for (const k in s.obst) {
    const ox = (+k % N) + 0.5, oy = ((+k / N) | 0) + 0.5;
    if (Math.hypot(ox - P.x, oy - P.y) < 2.4) {
      let da = Math.atan2(oy - P.y, ox - P.x) - P.fa;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < 0.7 && !s.hint[s.obst[k]] && s.msgT <= 0) {
        s.hint[s.obst[k]] = 1;
        say(s, "A barricade blocks the way. Jump over it! (Space or Jump)", 3500);
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

// The room you're in, by name.
export const roomName = (s, x = s.P.x, y = s.P.y) => ROOM_KINDS[s.rooms[roomAt(s.N, x, y)]][0];

// Is she listening right now (the humming has stopped)? And how long until
// that changes — for the page's "she's listening" and its sounds.
export const listening = (s) => listeningNow(s.hum);
// …and near enough to hear you: the red warning is only for then
export const listeningNear = (s) => listening(s) && Math.hypot(s.G.x - s.P.x, s.G.y - s.P.y) < HEAR_R;
