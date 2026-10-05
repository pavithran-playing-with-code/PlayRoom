// src/components/horror/manorClient.js
// NANA'S LULLABY online, the phone's half. The server runs the house
// (config/manorWorld.js); this keeps a phone's picture of it:
//
//   - your own body, moved here every frame so walking feels instant, and
//     reported to the server;
//   - everyone else and the ghosts, as the server last said, eased toward
//     each new report so ten updates a second look like motion;
//   - what the server says happened — relics taken, gates opening, who was
//     caught, who got out — turned into sounds and a line of text;
//   - doors and hiding spots: Use acts here at once (so a door you open lets you
//     straight through) and asks the server, which has the last word — the
//     door states in every tick put any disagreement right;
//   - the scares, which are this phone's alone and change nothing.
//
// No React and no DOM; ManorGame.jsx draws it and wires the socket.
import {
  unpackWalls, newBody, stepBody, jumpBody, litBody, HURDLE, FLOOR, DOOR,
  actionAt, ACTION_LABEL, hideIn, leaveLocker, unstick, roomAt, spotKind, ROOM_KINDS, lampCount, HEAR_R,
} from "./manorCore.mjs";
import { AMBIENT, hints as hintsFor, say, scareStep } from "./manorSim.js";

export const SHOW_MAP_MS = 6000;       // the map you memorise; ghosts sleep a little longer
export const SCARE_MS = 1400;          // the face, when it gets you
const EASE = 12;                       // how fast others catch up with their last report
const DOOR_TRUST_MS = 1500;            // a door you just used: your word over the server's for this long
const HIDE_TRUST_MS = 1500;            // likewise a locker you just got into

const RELIC_LINES = [
  "An iron key, tied with a faded pink ribbon.",
  "A brass key, wrapped in a lace handkerchief. It smells of lavender.",
  "A tiny key from a sewing tin. Somewhere, the humming falters.",
  "A black key. Footsteps overhead.",
];
const PLACE = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
export const placeName = (n) => PLACE[n] || `${n}th`;

export function createClient(init, now = Date.now()) {
  const N = init.house.N;
  const g = unpackWalls(init.house.walls);
  const obst = init.house.obst || {};
  const doorList = init.house.doors || [];
  const sides = new Map(init.sides.map((s) => [s.key, { ...s }]));
  const players = new Map(init.players.map((p) => [p.id, {
    ...p, tx: p.x, ty: p.y, tfa: p.fa || 0, fa: p.fa || 0, jz: 0, cr: 0, lit: true,
  }]));
  const me = init.role === "player" ? players.get(init.you) : null;
  const mySide = me ? me.side : null;
  const body = newBody(me ? me.x : init.house.spawn.x, me ? me.y : init.house.spawn.y, me ? me.fa || 0 : 0);
  const c = {
    mode: init.mode, you: init.you, role: me ? "player" : "spectator", code: init.code,
    N, g, obst, env: { g, N, obst, doors: new Set(doorList) }, exitT: init.house.exitT,
    doorList, pend: new Map(),            // door tile -> until when our own change stands
    rooms: init.house.rooms || [],
    lamps: init.house.lamps ? [...init.house.lamps] : new Array(lampCount(N)).fill(0), lampPend: 0,
    sides, players, mySide, body,
    relics: init.house.relics.map(([x, y, side, got]) => ({
      x, y, side, got: !!got, color: sides.get(side)?.color, mine: init.mode === "coop" || side === mySide,
    })),
    cells: init.house.batts.map(([x, y, got]) => ({ x, y, got: !!got })),
    ghosts: [], pulses: [], puffs: [],
    hint: {}, msg: "", msgT: 0, tm: 0, ambT: 20, hb: 0, gStep: 0,
    bodies: [], flick: 0, scareT: 25 + Math.random() * 15,
    alive: me ? me.alive : false, left: me ? !!me.left : false, spawn: init.house.spawn,
    startLocal: now - init.elapsed, durMs: init.duration, introMs: init.intro,
    skipIntro: init.elapsed > SHOW_MAP_MS, deadAt: null, watch: null,
    over: init.over || null,
    // her lullaby, as the server last said: humming, or listening
    hum: init.hum ? { on: !!init.hum[0], t: init.hum[1], since: init.hum[2] } : { on: true, t: 99, since: 0 },
  };
  if (me && !me.alive && !me.left) c.deadAt = now - SCARE_MS;  // came back while caught
  if (c.role === "player" && c.alive) say(c, "Find your keys, then the front door. While she hums, move. When the humming stops — freeze.", 5500);
  return c;
}

export const timeLeft = (c, now = Date.now()) => Math.max(0, c.durMs - (now - c.startLocal));
export const inIntro = (c, now = Date.now()) => !c.skipIntro && now - c.startLocal < SHOW_MAP_MS;
export const playing = (c) => c.role === "player" && c.alive && !c.left && !c.over;
// caught, and about to be back in at the entrance
export const respawning = (c) => c.role === "player" && !c.alive && !c.left && !c.over;
export const sideOfMe = (c) => (c.mySide ? c.sides.get(c.mySide) : null);
// Has the humming stopped? Then she is listening, and you should be still.
export const isListening = (c) => !!c.hum && !c.hum.on;
// …and near enough to hear you: the red warning is only for then
export const listeningNear = (c) => isListening(c) && !!c.body && c.ghosts.some((G) => Math.hypot(G.x - c.body.x, G.y - c.body.y) < HEAR_R);
const nameOf = (c, id) => (c.players.get(id) || {}).name || "Someone";

// ── what the server says ─────────────────────────────────────────────────────
// Returns the sounds to play: [{ name, v }].
export function applyTick(c, m, now = Date.now()) {
  const sounds = [];
  const snd = (name, v) => sounds.push(v === undefined ? { name } : { name, v });

  m.g.forEach(([x, y, hunt, stun], i) => {
    const G = c.ghosts[i] || (c.ghosts[i] = { x, y, tx: x, ty: y });
    G.tx = x; G.ty = y; G.st = hunt ? "hunt" : "patrol"; G.stun = stun ? 1 : 0;
  });
  for (const [id, x, y, fa, jz, cr, lit, state, caught, hiding] of m.p) {
    const p = c.players.get(id);
    if (!p) continue;
    p.tx = x; p.ty = y; p.tfa = fa; p.jz = jz; p.cr = cr; p.lit = !!lit;
    p.alive = state === 1; p.left = state === 3; p.caught = caught || 0; p.hiding = !!hiding;
    if (id !== c.you || c.role !== "player") continue;
    // The server is the one who says you were caught, and when you're back.
    if (!p.alive && c.alive) { c.alive = false; c.deadAt = now; }
    if (p.alive && !c.alive) { c.alive = true; c.deadAt = null; }
    if (p.left) c.left = true;
    // it never took you into that locker (someone beat you to it, or the ask was lost)
    if (!hiding && c.body.hiding && now - (c.body.hideAt || 0) > HIDE_TRUST_MS) leaveLocker(c.body);
  }
  // doors, as the server has them — except one you have only just used
  if (m.d) {
    [...m.d].forEach((ch, i) => {
      const k = c.doorList[i];
      if (k === undefined || (c.pend.get(k) || 0) > now) return;
      c.g[(k / c.N) | 0][k % c.N] = ch === "1" ? DOOR : FLOOR;
    });
    if (playing(c) && !c.body.hiding) unstick(c.g, c.body);   // a door shut on you in the lag: step clear
  }
  [...m.r].forEach((ch, i) => { if (c.relics[i]) c.relics[i].got = ch === "1"; });
  [...m.b].forEach((ch, i) => { if (c.cells[i]) c.cells[i].got = ch === "1"; });
  for (const [key, got, open, escapes, total, score] of m.s) {
    const s = c.sides.get(key);
    if (s) { s.got = got; s.open = !!open; s.escapes = escapes; s.total = total; s.score = score; }
  }
  c.pulses = m.m.map(([x, y, t]) => ({ x, y, t }));
  if (m.h) c.hum = { on: !!m.h[0], t: m.h[1], since: m.h[2] };
  if (m.l && now > c.lampPend) c.lamps = [...m.l].map(Number);   // the rooms' lights, but not one you just switched

  for (const e of m.e || []) {
    const mine = e.side && e.side === c.mySide;
    if (e.type === "relic") {
      if (e.id === c.you) { snd("relic"); say(c, e.got >= e.need ? "The last key. The front door is unlocked. Go — quietly." : RELIC_LINES[(e.got - 1) % 4], 4000); }
      else if (mine) { snd("relic"); say(c, `${nameOf(c, e.id)} found one. ${e.got} of ${e.need}.`, 3000); }
    } else if (e.type === "open") {
      if (mine && c.mode !== "free") say(c, "Every key found. The front door is unlocked!", 4000);
      else if (!mine && c.mode !== "coop") say(c, `${c.sides.get(e.side)?.name || "Someone"} has every key. Their door is unlocked.`, 3500);
    } else if (e.type === "dead") {
      if (e.id === c.you) { if (e.cause !== "left") snd("caught"); }       // the banner says the rest
      else say(c, e.cause === "left" ? `${nameOf(c, e.id)} left the house.` : `${nameOf(c, e.id)} was caught!`, 3000);
    } else if (e.type === "respawn" && e.id === c.you) {
      // back at the entrance: after being caught, or for another round
      const P = c.body;
      P.x = e.x; P.y = e.y; P.fa = 0; P.pitch = 0; P.hiding = null; P.lastTile = -1; P.jz = 0; P.vz = 0;
      if (e.why === "caught") say(c, "Back in. Your keys are still yours.", 2600);
    } else if (e.type === "gaveup" && e.id === c.you) {
      say(c, "She gives up and shuffles away, humming...", 3000);
    } else if (e.type === "door" && e.id !== c.you) {
      // someone else's door, or a ghost's: louder the nearer it is
      const at = c.body, d = Math.hypot(at.x - e.x - 0.5, at.y - e.y - 0.5);
      if (d < 14) snd("creak", Math.max(0.03, (e.open ? 0.3 : 0.18) * (1 - d / 14)));
    } else if (e.type === "escaped") {
      if (e.id === c.you) { snd("win"); say(c, "You got out!", 3000); }
      else if (mine) { snd("win"); say(c, `${nameOf(c, e.id)} got out — your side wins!`, 3000); }
      else { snd("caught"); say(c, `${nameOf(c, e.id)} got out first.`, 3000); }
    } else if (e.type === "battery" && e.id === c.you) {
      c.body.bat = Math.min(1, c.body.bat + 0.6);
      snd("battery");
      say(c, "Fresh batteries.", 2500);
    } else if (e.type === "spotted" && e.id === c.you) {
      snd("spotted");
    } else if (e.type === "hum") {
      snd("hum");
    } else if (e.type === "listen") {
      snd("listen");
    } else if (e.type === "lampOut") {
      const here = c.body && roomAt(c.N, c.body.x, c.body.y) === e.room;
      if (here) { snd("flicker"); say(c, "The lights go out. She's in here.", 2500); }
    } else if (e.type === "lamp" && e.id !== c.you) {
      if (c.body && roomAt(c.N, c.body.x, c.body.y) === e.room) { snd("click"); say(c, `${nameOf(c, e.id)} switched the light ${e.on ? "on" : "off"}.`, 2000); }
    } else if (e.type === "heard") {
      if (e.id === c.you) { snd("heard"); say(c, "She heard you. She's coming.", 2500); }
      else say(c, `She heard ${nameOf(c, e.id)}!`, 2500);
    }
  }
  return sounds;
}

// ── your own frame ───────────────────────────────────────────────────────────
// Moves you (if you are still in the house), eases everyone else, and returns
// the sounds to play.
export function stepLocal(c, inp, dt, now = Date.now()) {
  const sounds = [];
  const snd = (name, v) => sounds.push(v === undefined ? { name } : { name, v });
  c.tm += dt;
  const k = Math.min(1, dt * EASE);
  for (const G of c.ghosts) { G.x += (G.tx - G.x) * k; G.y += (G.ty - G.y) * k; }
  for (const p of c.players.values()) {
    p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
    let da = p.tfa - p.fa;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    p.fa += da * k;
  }

  if (c.msgT > 0) { c.msgT -= dt * 1000; if (c.msgT <= 0) say(c, "", 0); }
  if (!playing(c) || inIntro(c, now)) return sounds;

  const P = c.body;
  stepBody(P, c.env, inp, dt, (name) => snd(name));
  const ct = (P.y | 0) * c.N + (P.x | 0);
  if (ct !== P.lastTile) {
    if (c.obst[ct]) { c.puffs.push({ x: (ct % c.N) + 0.5, y: ((ct / c.N) | 0) + 0.5, t: 0.9 }); snd("puff"); }
    P.lastTile = ct;
  }
  c.puffs.forEach((q) => { q.t -= dt; });
  c.puffs = c.puffs.filter((q) => q.t > 0);
  P.lightOut -= dt;                     // (no batteries in Nana's house: the light never dies)

  const side = sideOfMe(c);
  const ex = c.exitT.x + 0.5, ey = c.exitT.y + 0.5;
  if (side && !side.open && Math.hypot(ex - P.x, ey - P.y) < 1.2 && c.msgT <= 0) {
    say(c, `The front door is locked. ${side.need - side.got} of your keys still out there.`, 2500);
  }
  hintsFor(c, P);
  scareStep(c, P, dt, Math.random, c.ghosts.some((G) => G.st === "hunt"), snd);
  c.ambT -= dt;
  if (c.ambT <= 0 && c.msgT <= 0) { c.ambT = 22 + Math.random() * 15; say(c, AMBIENT[(Math.random() * 4) | 0], 3000); }

  // near a ghost: the torch stutters, its steps get louder, your heart goes
  const G = nearestGhost(c, P);
  if (G) {
    const d = Math.hypot(P.x - G.x, P.y - G.y);
    const danger = Math.max(0, 1 - d / 10) * (G.st === "hunt" ? 1 : 0.55);
    if (danger > 0.55 && P.lightOut <= 0 && P.light && Math.random() < dt * 0.4) { P.lightOut = 0.5 + Math.random() * 0.6; snd("flicker"); }
    c.gStep -= dt;
    if (c.gStep <= 0 && !G.stun && !isListening(c)) {     // listening, she makes no sound at all
      c.gStep = G.st === "hunt" ? 0.4 : 0.7;
      const v = Math.max(0, 1 - d / 12) * 0.35;
      if (v > 0.03) snd("ghostStep", v);
    }
    if (danger > 0.12) { c.hb -= dt; if (c.hb <= 0) { c.hb = 1.1 - 0.7 * danger; snd("heartbeat", 0.4 + danger); } }
  }
  return sounds;
}

export function nearestGhost(c, at) {
  let best = null, bd = Infinity;
  for (const G of c.ghosts) { const d = Math.hypot(G.x - at.x, G.y - at.y); if (d < bd) { bd = d; best = G; } }
  return best;
}

// What the server needs from you, ~15 times a second.
export function report(c) {
  const P = c.body;
  const r2 = (n) => Math.round(n * 1000) / 1000;
  return { code: c.code, x: r2(P.x), y: r2(P.y), fa: r2(P.fa), jz: r2(P.jz), cr: r2(P.cr), lit: litBody(P), n: P.noiseR };
}

export function jump(c) { return playing(c) && jumpBody(c.body); }

// ── doors and lockers ────────────────────────────────────────────────────────
// Bodies a door must not shut on: the ghosts, and everyone else still inside
// and out in the open.
const blockersOf = (c) => [
  ...c.ghosts,
  ...[...c.players.values()].filter((p) => p.id !== c.you && p.alive && !p.hiding),
];

export function actionLabel(c, now = Date.now()) {
  if (!playing(c) || inIntro(c, now)) return null;
  const u = actionAt(c.env, c.body, blockersOf(c));
  if (u) return ACTION_LABEL[u.t];
  // nothing in reach: the room's light switch
  return c.lamps[roomAt(c.N, c.body.x, c.body.y)] ? "Lights off" : "Lights on";
}

// Use, now, on this phone. Returns { ask, sounds }: `ask` is what to send the
// server (manor:use), or null if there was nothing to use.
export function doAction(c, now = Date.now()) {
  const none = { ask: null, sounds: [] };
  if (!playing(c) || inIntro(c, now)) return none;
  const P = c.body;
  const u = actionAt(c.env, P, blockersOf(c));
  if (!u) {
    // the room's light: switched here at once, and the server told
    const room = roomAt(c.N, P.x, P.y);
    c.lamps[room] = c.lamps[room] ? 0 : 1;
    c.lampPend = now + 800;
    say(c, c.lamps[room] ? "Lights on. She'll see you in here — and they go out when she comes in." : "Lights off.", 2600);
    return { ask: null, lamp: { code: c.code }, sounds: [{ name: "click" }] };
  }
  const sounds = [];
  if (u.t === "open" || u.t === "close") {
    const open = u.t === "open";
    c.g[u.y][u.x] = open ? FLOOR : DOOR;
    c.pend.set(u.y * c.N + u.x, now + DOOR_TRUST_MS);
    P.noiseT = open ? 0.6 : 0.3;
    sounds.push({ name: "creak", v: open ? 0.28 : 0.15 });
    if (!open) say(c, "Door shut. She will have to open it.", 2000);
  } else if (u.t === "hide") {
    hideIn(P, u, null);
    P.hideAt = now;
    sounds.push({ name: "locker" });
    say(c, `You hide ${WHERE[u.kind]}. She cannot find you here.`, 3500);
  } else {
    leaveLocker(P);
    sounds.push({ name: "locker" });
  }
  // where you are, too: the server's last report of you can lag a step
  // behind, and judging reach from that refused doors you were touching
  return { ask: { code: c.code, act: u.t, x: u.x, y: u.y, px: P.x, py: P.y }, sounds };
}

const WHERE = { table: "under the table", bed: "under the bed", wardrobe: "in the wardrobe" };

// The room someone is in, by name.
export const roomNameAt = (c, at) => (at && c.rooms.length ? ROOM_KINDS[c.rooms[roomAt(c.N, at.tx ?? at.x, at.ty ?? at.y)] || 0][0] : "");

// The server's answer to a Use.
export function actionDone(c, r) {
  if (r.act === "hide") {
    if (!r.ok) { leaveLocker(c.body); say(c, r.why === "taken" ? "Someone is already hiding in there." : "You could not get in.", 2500); }
    else if (r.seen) say(c, "She saw you hide. Stay still — she will give up.", 3500);
  } else if ((r.act === "open" || r.act === "close") && !r.ok && r.x != null) {
    // refused: put it back now, and say so, rather than have it swing shut later
    const k = Math.floor(r.y) * c.N + Math.floor(r.x);
    c.pend.delete(k);
    if (c.g[Math.floor(r.y)]) c.g[Math.floor(r.y)][Math.floor(r.x)] = r.act === "open" ? DOOR : FLOOR;
    unstick(c.g, c.body);
    say(c, r.why === "far" ? "Step closer to the door." : r.act === "close" ? "Something is in the way." : "It won't open.", 1800);
  }
}

// ── watching ─────────────────────────────────────────────────────────────────
// Once you've left, or are only here to watch, you look through somebody
// else's eyes. Whoever you picked, else the first still inside.
export function watchable(c) {
  return [...c.players.values()].filter((p) => p.alive && !p.left && p.id !== (c.role === "player" ? c.you : null));
}
export function watchedPlayer(c) {
  const list = watchable(c);
  return list.find((p) => p.id === c.watch) || list[0] || null;
}
export function cycleWatch(c, dir) {
  const list = watchable(c);
  if (!list.length) return;
  const i = list.findIndex((p) => p.id === (watchedPlayer(c) || {}).id);
  c.watch = list[(i + dir + list.length) % list.length].id;
}

// What manorRender draws this frame.
export function viewState(c, now = Date.now()) {
  // your own eyes while you're playing (and, caught, while you wait to be back
  // in); someone else's once you've left or if you're only watching
  const own = c.role === "player" && !c.left;
  let P, camId = null, exitOpen = false;
  if (own) {
    P = c.body;
    camId = c.you;
    exitOpen = !!(sideOfMe(c) && sideOfMe(c).open);
  } else {
    const w = watchedPlayer(c);
    const src = w || c.players.get(c.you) || { x: c.body.x, y: c.body.y, fa: c.body.fa };
    camId = w ? w.id : null;
    P = {
      x: src.x, y: src.y, fa: src.fa || 0, jz: src.jz || 0, cr: src.cr || 0,
      noiseR: 0, shake: 0, entering: false, light: w ? w.lit : true, lightOut: 0, bat: 1,
      hiding: w && w.hiding ? { kind: spotKind(w.tx | 0, w.ty | 0) } : null,
    };
    const ws = w && c.sides.get(w.side);
    exitOpen = !!(ws && ws.open);
  }
  const mine = c.relics.map((r) => (c.role === "player" || !camId ? r : { ...r, mine: c.mode === "coop" || r.side === c.players.get(camId)?.side }));
  const others = [...c.players.values()]
    .filter((p) => p.id !== camId && p.alive && !p.left && !p.hiding)
    .map((p) => ({ x: p.x, y: p.y, color: p.color, name: p.name, lit: p.lit, cr: p.cr, jz: p.jz,
      moving: Math.hypot(p.tx - p.x, p.ty - p.y) > 0.015 }));         // still easing toward its last report: walking
  const scared = c.deadAt !== null && now - c.deadAt < SCARE_MS;
  return {
    mode: inIntro(c, now) ? "intro" : scared ? "dead" : "play",
    introT: Math.max(0, (SHOW_MAP_MS - (now - c.startLocal)) / 1000),
    deadT: scared ? (now - c.deadAt) / 1000 : 0,
    N: c.N, g: c.g, obst: c.obst, exitT: c.exitT, rooms: c.rooms, lamps: c.lamps,
    relics: mine, cells: c.cells, pulses: c.pulses, puffs: c.puffs, tm: c.tm, bodies: own ? c.bodies : [],
    // before the first word from the server there are no ghosts yet: a
    // stand-in far away keeps the danger glow and arrows quiet
    P, G: nearestGhost(c, P) || FAR_GHOST, ghosts: c.ghosts.length ? c.ghosts : [FAR_GHOST],
    others, exitOpen, count: 0, need: 1, camId,
    // the front door's lock lights: the keys of whoever we're looking through
    keysGot: (() => { const sd = c.sides.get((own ? c.players.get(c.you) : c.players.get(camId))?.side); return sd ? sd.got : 0; })(),
    keysNeed: (() => { const sd = c.sides.get((own ? c.players.get(c.you) : c.players.get(camId))?.side); return sd ? sd.need : 3; })(),
  };
}

const FAR_GHOST = { x: -99, y: -99, st: "patrol", stun: 1 };
export const isHurdle = (c, k) => c.obst[k] === HURDLE;
