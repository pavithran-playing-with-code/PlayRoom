// src/components/horror/manorClient.js
// HOLLOW MANOR online, the phone's half. The server runs the house
// (config/manorWorld.js); this keeps a phone's picture of it:
//
//   - your own body, moved here every frame so walking feels instant, and
//     reported to the server;
//   - everyone else and the ghosts, as the server last said, eased toward
//     each new report so ten updates a second look like motion;
//   - what the server says happened — relics taken, doors opening, who was
//     caught, who got out — turned into sounds and a line of text.
//
// No React and no DOM; ManorGame.jsx draws it and wires the socket.
import {
  unpackWalls, newBody, stepBody, jumpBody, litBody, HURDLE,
} from "./manorCore.mjs";
import { AMBIENT, hints as hintsFor, say } from "./manorSim.js";

export const SHOW_MAP_MS = 6000;       // the map you memorise; ghosts sleep a little longer
export const SCARE_MS = 1400;          // the face, when it gets you
const EASE = 12;                       // how fast others catch up with their last report

const RELIC_LINES = [
  "A child's tooth wrapped in silk. Something stirs.",
  "A cracked locket. It whispers your name.",
  "A wedding ring, still warm. The walls lean closer.",
  "A black candle. Footsteps overhead.",
];
const PLACE = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
export const placeName = (n) => PLACE[n] || `${n}th`;

export function createClient(init, now = Date.now()) {
  const N = init.house.N;
  const g = unpackWalls(init.house.walls);
  const obst = init.house.obst || {};
  const sides = new Map(init.sides.map((s) => [s.key, { ...s }]));
  const players = new Map(init.players.map((p) => [p.id, {
    ...p, tx: p.x, ty: p.y, tfa: p.fa || 0, fa: p.fa || 0, jz: 0, cr: 0, lit: true,
  }]));
  const me = init.role === "player" ? players.get(init.you) : null;
  const mySide = me ? me.side : null;
  const body = newBody(me ? me.x : init.house.spawn.x, me ? me.y : init.house.spawn.y, me ? me.fa || 0 : 0);
  const c = {
    mode: init.mode, you: init.you, role: me ? "player" : "spectator", code: init.code,
    N, g, obst, env: { g, N, obst }, exitT: init.house.exitT,
    sides, players, mySide, body,
    relics: init.house.relics.map(([x, y, side, got]) => ({
      x, y, side, got: !!got, color: sides.get(side)?.color, mine: init.mode === "coop" || side === mySide,
    })),
    cells: init.house.batts.map(([x, y, got]) => ({ x, y, got: !!got })),
    ghosts: [], pulses: [], puffs: [],
    expl: Array.from({ length: N }, () => Array(N).fill(0)),
    hint: {}, msg: "", msgT: 0, tm: 0, ambT: 20, hb: 0, gStep: 0,
    alive: me ? me.alive : false, escaped: me ? me.escaped : false, place: me ? me.place : null,
    decoys: me ? me.decoys : 0,
    startLocal: now - init.elapsed, durMs: init.duration, introMs: init.intro,
    skipIntro: init.elapsed > SHOW_MAP_MS, deadAt: null, watch: null,
    over: init.over || null,
  };
  if (me && !me.alive) c.deadAt = now - SCARE_MS;             // came back after being caught
  if (c.role === "player" && c.alive && !c.escaped) say(c, "Find your relics. Then the far gate.", 4000);
  return c;
}

export const timeLeft = (c, now = Date.now()) => Math.max(0, c.durMs - (now - c.startLocal));
export const inIntro = (c, now = Date.now()) => !c.skipIntro && now - c.startLocal < SHOW_MAP_MS;
export const playing = (c) => c.role === "player" && c.alive && !c.escaped && !c.over;
export const sideOfMe = (c) => (c.mySide ? c.sides.get(c.mySide) : null);
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
  for (const [id, x, y, fa, jz, cr, lit, state, place] of m.p) {
    const p = c.players.get(id);
    if (!p) continue;
    p.tx = x; p.ty = y; p.tfa = fa; p.jz = jz; p.cr = cr; p.lit = !!lit;
    p.alive = state !== 0; p.escaped = state === 2; p.place = place || null;
    if (id !== c.you || c.role !== "player") continue;
    // The server is the one who says you were caught or got out.
    if (!p.alive && c.alive) { c.alive = false; c.deadAt = now; }
    if (p.escaped && !c.escaped) { c.escaped = true; c.place = p.place; }
  }
  [...m.r].forEach((ch, i) => { if (c.relics[i]) c.relics[i].got = ch === "1"; });
  [...m.b].forEach((ch, i) => { if (c.cells[i]) c.cells[i].got = ch === "1"; });
  for (const [key, got, open, place] of m.s) {
    const s = c.sides.get(key);
    if (s) { s.got = got; s.open = !!open; s.place = place || null; }
  }
  c.pulses = m.m.map(([x, y, t]) => ({ x, y, t }));

  for (const e of m.e || []) {
    const mine = e.side && e.side === c.mySide;
    if (e.type === "relic") {
      if (e.id === c.you) { snd("relic"); say(c, e.got >= e.need ? "The last relic. The gate is open. Run." : RELIC_LINES[(e.got - 1) % 4], 4000); }
      else if (mine) { snd("relic"); say(c, `${nameOf(c, e.id)} found one. ${e.got} of ${e.need}.`, 3000); }
    } else if (e.type === "open") {
      if (mine && c.mode !== "free") say(c, "Every relic taken. The far gate is open!", 4000);
      else if (!mine && c.mode !== "coop") say(c, `${c.sides.get(e.side)?.name || "Someone"} has every relic. Their gate is open.`, 3500);
    } else if (e.type === "dead") {
      if (e.id === c.you) snd("caught");
      else say(c, e.cause === "left" ? `${nameOf(c, e.id)} ran out of the house.` : `${nameOf(c, e.id)} was taken.`, 3500);
    } else if (e.type === "escaped") {
      if (e.id === c.you) { snd("win"); say(c, c.mode === "free" ? `You got out — ${placeName(e.place)}!` : "You got out!", 4000); }
      else say(c, e.place ? `${nameOf(c, e.id)} got out — ${placeName(e.place)}.` : `${nameOf(c, e.id)} got out.`, 3500);
    } else if (e.type === "placed" && c.mode === "teams") {
      say(c, `${c.sides.get(e.side)?.name || "A team"} team is out — ${placeName(e.place)}.`, 4000);
    } else if (e.type === "battery" && e.id === c.you) {
      c.body.bat = Math.min(1, c.body.bat + 0.6);
      snd("battery");
      say(c, "Fresh batteries.", 2500);
    } else if (e.type === "spotted" && e.id === c.you) {
      snd("spotted");
    } else if (e.type === "decoy") {
      snd("musicBox");
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
  if (P.light) {
    const b0 = P.bat;
    P.bat = Math.max(0, P.bat - dt * 0.011);
    if (b0 > 0 && P.bat === 0) say(c, "Your light died. Find a battery.", 3500);
  }
  P.lightOut -= dt;

  const side = sideOfMe(c);
  const ex = c.exitT.x + 0.5, ey = c.exitT.y + 0.5;
  if (side && !side.open && Math.hypot(ex - P.x, ey - P.y) < 1.2 && c.msgT <= 0) {
    say(c, `The far gate is sealed. ${side.need - side.got} of your relics still out there.`, 2500);
  }
  hintsFor(c, P);
  c.ambT -= dt;
  if (c.ambT <= 0 && c.msgT <= 0) { c.ambT = 22 + Math.random() * 15; say(c, AMBIENT[(Math.random() * 4) | 0], 3000); }

  // near a ghost: the torch stutters, its steps get louder, your heart goes
  const G = nearestGhost(c, P);
  if (G) {
    const d = Math.hypot(P.x - G.x, P.y - G.y);
    const danger = Math.max(0, 1 - d / 10) * (G.st === "hunt" ? 1 : 0.55);
    if (danger > 0.55 && P.lightOut <= 0 && P.light && Math.random() < dt * 0.4) { P.lightOut = 0.5 + Math.random() * 0.6; snd("flicker"); }
    c.gStep -= dt;
    if (c.gStep <= 0 && !G.stun) {
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

// ── watching ─────────────────────────────────────────────────────────────────
// Once you are out of it — caught, escaped, or only here to watch — you look
// through somebody else's eyes. Whoever you picked, else the first still inside.
export function watchable(c) {
  return [...c.players.values()].filter((p) => p.alive && !p.escaped && p.id !== (c.role === "player" ? c.you : null));
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
  // your own eyes while you are alive and inside, someone else's after
  const own = c.role === "player" && c.alive && !c.escaped;
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
    };
    const ws = w && c.sides.get(w.side);
    exitOpen = !!(ws && ws.open);
  }
  const mine = c.relics.map((r) => (c.role === "player" || !camId ? r : { ...r, mine: c.mode === "coop" || r.side === c.players.get(camId)?.side }));
  const others = [...c.players.values()]
    .filter((p) => p.id !== camId && p.alive && !p.escaped)
    .map((p) => ({ x: p.x, y: p.y, color: p.color, name: p.name, lit: p.lit, cr: p.cr, jz: p.jz }));
  const scared = c.deadAt !== null && now - c.deadAt < SCARE_MS;
  return {
    mode: inIntro(c, now) ? "intro" : scared ? "dead" : "play",
    introT: Math.max(0, (SHOW_MAP_MS - (now - c.startLocal)) / 1000),
    deadT: scared ? (now - c.deadAt) / 1000 : 0,
    N: c.N, g: c.g, expl: c.expl, obst: c.obst, exitT: c.exitT,
    relics: mine, cells: c.cells, pulses: c.pulses, puffs: c.puffs, tm: c.tm,
    // before the first word from the server there are no ghosts yet: a
    // stand-in far away keeps the danger glow and arrows quiet
    P, G: nearestGhost(c, P) || FAR_GHOST, ghosts: c.ghosts.length ? c.ghosts : [FAR_GHOST],
    others, exitOpen, count: 0, need: 1, camId,
  };
}

const FAR_GHOST = { x: -99, y: -99, st: "patrol", stun: 1 };
export const isHurdle = (c, k) => c.obst[k] === HURDLE;
