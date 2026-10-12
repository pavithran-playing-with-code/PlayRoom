// src/components/horror/s13Client.js
// STATION 13 online, the phone's half. The server runs the building and its
// monsters (config/manorWorld.js); this keeps a phone's picture of it:
//
//   - the building itself, built here from the room's seed exactly as the
//     server builds it (genStation), and the fuses, batteries and lockers it
//     sends;
//   - your own body, moved here every frame so walking feels instant, and
//     reported to the server; your torch and its battery are yours;
//   - everyone else and the monsters, as the server last said, eased toward
//     each new report so ten updates a second look like motion;
//   - what the server says happened — fuses, the power, who was caught, who
//     got out — turned into sounds and a line of text;
//   - lockers: Use hides you at once and asks the server, which has the last word;
//   - the building's scares (a bang, a whisper, the lights), this phone's alone.
// No React and no DOM; ManorGame.jsx draws it and wires the socket.
import {
  genStation, newPlayer, stepPlayer, drainTorch, tension, litZones, lockerNear, hideIn, leaveLocker, zoneAt, ZN, NEED, BATTERY_GIVES, atExit,
} from "./s13Core.mjs";

export const SCARE_MS = 1600;          // the monster's face, when it gets you
const EASE = 12;
const HIDE_TRUST_MS = 1500;            // a locker you just got into: your word over the server's for this long
const MST = ["sleep", "patrol", "invest", "notice", "chase"];

export function createClient(init, now = Date.now()) {
  const st = genStation(init.seed);
  const sides = new Map(init.sides.map((s) => [s.key, { ...s }]));
  const players = new Map(init.players.map((p) => [p.id, { ...p, tx: p.x, ty: p.y, tyaw: p.yaw || 0, yaw: p.yaw || 0, fl: true, hid: false }]));
  const me = init.role === "player" ? players.get(init.you) : null;
  const mySide = me ? me.side : null;
  const items = init.items.map(([x, y, t, side, got]) => {
    const sd = sides.get(side);
    return { x, y, t, side, got: !!got, color: sd ? sd.color : null, mine: t !== "f" || init.mode === "coop" || side === mySide };
  });
  const c = {
    mode: init.mode, you: init.you, role: me ? "player" : "spectator", code: init.code,
    st, items, lockers: init.lockers.map(([x, y, nx, ny]) => ({ x, y, nx, ny })),
    sides, players, mySide,
    body: newPlayer(me ? me.x : 9.5, me ? me.y : 16.5, me ? me.yaw : 0),
    monsters: Array.from({ length: init.monsters || 1 }, () => ({ x: -99, y: -99, tx: -99, ty: -99, st: "sleep", vx: 0, vy: 1, moving: false, wd: 0, nt: 0 })),
    fuses: init.fuses || 0, lit: litZones(init.fuses || 0),
    msg: "", msgT: 0, flick: 0, shake: 0, evT: 25, area: "", tlv: 0,
    alive: me ? me.alive : false, left: me ? !!me.left : false, deadAt: null, catcher: 0, watch: null,
    startLocal: now - init.elapsed, durMs: init.duration, over: init.over || null,
  };
  if (me && !me.alive && !me.left) c.deadAt = now - SCARE_MS;
  if (c.role === "player" && c.alive) say(c, init.mode === "coop"
    ? `Find ${NEED} fuses between you, then the elevator. Lit areas are safe to read. Dark ones are not.`
    : `Find your ${NEED} fuses — they glow in your colour — then the elevator. Don't be heard.`, 6);
  return c;
}

export const say = (c, text, secs) => { c.msg = text; c.msgT = secs || 4; };
export const timeLeft = (c, now = Date.now()) => Math.max(0, c.durMs - (now - c.startLocal));
export const playing = (c) => c.role === "player" && c.alive && !c.left && !c.over;
export const respawning = (c) => c.role === "player" && !c.alive && !c.left && !c.over;
export const sideOfMe = (c) => (c.mySide ? c.sides.get(c.mySide) : null);
const nameOf = (c, id) => (c.players.get(id) || {}).name || "Someone";

// ── what the server says ─────────────────────────────────────────────────────
// Returns the sounds to play: [{ name, x?, y? }].
export function applyTick(c, m, now = Date.now()) {
  const out = [];
  const snd = (name, o) => out.push({ name, ...(o || {}) });
  m.g.forEach(([x, y, s, vx, vy, mv, wd, lg, nt], i) => {
    const M = c.monsters[i] || (c.monsters[i] = { x, y });
    if (M.x < -50) { M.x = x; M.y = y; }
    M.tx = x; M.ty = y; M.st = MST[s] || "patrol"; M.vx = vx; M.vy = vy; M.moving = !!mv; M.wd = wd ? 1 : 0; M.lg = lg ? 1 : 0; M.nt = nt ? 1 : 0;
  });
  for (const [id, x, y, yaw, state, caught, hid, fl] of m.p) {
    const p = c.players.get(id);
    if (!p) continue;
    p.tx = x; p.ty = y; p.tyaw = yaw; p.alive = state === 1; p.left = state === 3; p.caught = caught || 0; p.hid = !!hid; p.fl = !!fl;
    if (id !== c.you || c.role !== "player") continue;
    if (!p.alive && c.alive) { c.alive = false; c.deadAt = now; }
    if (p.alive && !c.alive) { c.alive = true; c.deadAt = null; }
    if (p.left) c.left = true;
    // it never let you into that locker (someone beat you to it, or the ask was lost)
    if (!hid && c.body.hid && now - (c.body.hideAt || 0) > HIDE_TRUST_MS) leaveLocker(c.body);
  }
  [...m.r].forEach((ch, i) => { if (c.items[i]) c.items[i].got = ch === "1"; });
  for (const [key, got, open, escapes, total, score] of m.s) {
    const s = c.sides.get(key);
    if (s) { s.got = got; s.open = !!open; s.escapes = escapes; s.total = total; s.score = score; }
  }
  if (m.f !== c.fuses) { c.fuses = m.f; c.lit = litZones(m.f); }
  const B = c.body;
  for (const e of m.e || []) {
    const mine = e.side && e.side === c.mySide;
    if (e.type === "fuse") {
      c.flick = 3; snd("bang");
      if (e.id === c.you) { snd("pick"); say(c, e.got >= e.need ? "Power restored for you. The elevator is waiting. So is IT." : `Fuse ${e.got}/${e.need}. The lights come back somewhere. Something heard that.`, 5); }
      else if (mine) say(c, `${nameOf(c, e.id)} found a fuse. ${e.got} of ${e.need}.`, 3.5);
      else say(c, "Somewhere, the lights come back on.", 3);
    } else if (e.type === "open") {
      if (mine) { snd("alarm"); if (c.mode !== "free") say(c, "Every fuse found. The elevator is working — get there!", 5); }
      else if (c.mode !== "coop") say(c, `${c.sides.get(e.side)?.name || "Someone"} has every fuse — they're heading for the elevator!`, 4);
    } else if (e.type === "battery") {
      if (e.id === c.you) { B.bat = Math.min(100, B.bat + BATTERY_GIVES); if (B.bat > 0 && !B.fl) B.fl = true; snd("battery"); say(c, "Battery found.", 2); }
    } else if (e.type === "dead") {
      if (e.id === c.you) { if (e.cause !== "left") { c.catcher = e.m || 0; snd("scream"); c.shake = 1.4; } }
      else say(c, e.cause === "left" ? `${nameOf(c, e.id)} left the building.` : `${nameOf(c, e.id)} was caught!`, 3);
    } else if (e.type === "respawn" && e.id === c.you) {
      B.x = e.x; B.y = e.y; B.yaw = e.yaw || 0; B.pitch = 0; B.hid = null;
      say(c, "You wake in the Main Hall. Your fuses are still yours.", 3.5);
    } else if (e.type === "notice") {
      if (e.id === c.you) { snd("growl"); c.shake = 0.7; c.flick = 2; say(c, "It noticed you. Break line of sight!", 3.5); }
      else say(c, `It's seen ${nameOf(c, e.id)}!`, 2.5);
    } else if (e.type === "chase" && e.id === c.you) say(c, "RUN.", 2);
    else if (e.type === "rear" && e.id === c.you) snd("growl");
    else if (e.type === "lostsight" && e.id === c.you) say(c, "It lost track of you.", 2.5);
    else if (e.type === "zone") { if (Math.hypot(e.x - B.x, e.y - B.y) > 7 && Math.random() < 0.6) snd("bangAt", { x: e.x, y: e.y }); }
    else if (e.type === "door") { const d = c.st.doors[e.i]; if (d) snd("creakAt", { x: d.x + 0.5, y: d.y + 0.5 }); }
    else if (e.type === "escaped") {
      if (e.id === c.you) { snd("door"); say(c, "You made it out!", 3); }
      else if (mine) { snd("door"); say(c, `${nameOf(c, e.id)} got out — your side wins!`, 3); }
      else say(c, `${nameOf(c, e.id)} got out first.`, 3);
    }
  }
  return out;
}

// ── your own frame ───────────────────────────────────────────────────────────
// Moves you (if you are still in it), eases everyone else, and returns the sounds.
export function stepLocal(c, inp, dt, now = Date.now()) {
  const out = [];
  const k = Math.min(1, dt * EASE);
  for (const M of c.monsters) { M.x += (M.tx - M.x) * k; M.y += (M.ty - M.y) * k; }
  for (const p of c.players.values()) {
    p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
    let da = p.tyaw - p.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); p.yaw += da * k;
  }
  if (c.msgT > 0) { c.msgT -= dt; if (c.msgT <= 0) c.msg = ""; }
  c.flick = Math.max(0, c.flick - dt); c.shake = Math.max(0, c.shake - dt * 1.5);
  const P = c.body;
  c.tlv = c.monsters.reduce((a, M) => Math.max(a, tension(M, P.x, P.y)), 0);
  if (!playing(c)) return out;
  for (const n of stepPlayer(P, c.st, inp, dt)) out.push({ name: n });
  if (drainTorch(P, dt, c.tlv)) say(c, "The flashlight dies.", 3);
  const side = sideOfMe(c);
  if (side && !side.open && atExit(P.x, P.y) && c.msgT <= 0) say(c, `The elevator has no power. ${side.need - side.got} of your fuses still out there.`, 2.5);
  // the building, now and then, when nothing is hunting you
  c.evT -= dt;
  if (c.evT <= 0 && !c.monsters.some((M) => M.st === "chase")) {
    c.evT = 22 + Math.random() * 25;
    const r = Math.random();
    if (r < 0.35) { out.push({ name: "bang" }); say(c, "Something fell over in the dark.", 3.5); c.flick = 1.5; }
    else if (r < 0.7) { out.push({ name: "whisper" }); say(c, "...behind you...", 3); }
    else { c.flick = 2.5; say(c, "The lights flicker.", 2.5); }
  }
  c.area = ZN[zoneAt(c.st, P.x, P.y)] || "";
  return out;
}

// What the server needs from you, ~15 times a second.
export function report(c) {
  const P = c.body, r2 = (n) => Math.round(n * 1000) / 1000;
  return { code: c.code, x: r2(P.x), y: r2(P.y), yaw: r2(P.yaw), fl: P.fl && P.bat > 0, mv: P.moving, run: P.run };
}

// ── lockers ──────────────────────────────────────────────────────────────────
export const actionLabel = (c) => (!playing(c) ? "" : c.body.hid ? "LEAVE" : lockerNear(c.lockers, c.body.x, c.body.y) ? "HIDE" : "");
// Use, now, on this phone. Returns what to send the server (manor:use), or null.
export function interact(c, now = Date.now()) {
  if (!playing(c)) return null;
  const P = c.body;
  if (P.hid) { leaveLocker(P); return { code: c.code, act: "out" }; }
  const l = lockerNear(c.lockers, P.x, P.y);
  if (!l) return null;
  const at = { px: P.x, py: P.y };
  hideIn(P, l); P.hideAt = now;
  return { code: c.code, act: "hide", ...at };
}
export function actionDone(c, r) {
  if (r.act === "hide" && !r.ok) { leaveLocker(c.body); say(c, r.why === "taken" ? "Someone is already hiding in there." : "You couldn't get in.", 2.5); }
}
export function toggleTorch(c) { const P = c.body; if (P.bat > 0) P.fl = !P.fl; }

// ── watching ─────────────────────────────────────────────────────────────────
// Once you've left, or are only here to watch, you look through somebody else's eyes.
export const watchable = (c) => [...c.players.values()].filter((p) => p.alive && !p.left && p.id !== (c.role === "player" ? c.you : null));
export const watchedPlayer = (c) => { const l = watchable(c); return l.find((p) => p.id === c.watch) || l[0] || null; };
export function cycleWatch(c, dir) {
  const l = watchable(c);
  if (!l.length) return;
  const i = l.findIndex((p) => p.id === (watchedPlayer(c) || {}).id);
  c.watch = l[(i + dir + l.length) % l.length].id;
}

// What the scene draws this frame.
export function viewState(c, now = Date.now()) {
  const own = c.role === "player" && !c.left;
  let P, camId;
  if (own) { P = c.body; camId = c.you; }
  else {
    const w = watchedPlayer(c);
    const src = w || { x: c.body.x, y: c.body.y, yaw: c.body.yaw };
    camId = w ? w.id : null;
    P = { x: src.x, y: src.y, yaw: src.yaw || 0, pitch: 0, fl: w ? w.fl : true, bat: 100, hid: w && w.hid ? {} : null, moving: false, stam: 1 };
  }
  const camSide = c.sides.get((c.players.get(camId) || {}).side);
  const scared = c.deadAt !== null && now - c.deadAt < SCARE_MS;
  return {
    mode: scared ? "dead" : own && !c.alive ? "play" : own ? "play" : "watch",
    P, monsters: c.monsters, lit: c.lit, ready: !!(camSide && camSide.open),
    others: [...c.players.values()].filter((p) => p.id !== camId && p.alive && !p.left).map((p) => ({ id: p.id, x: p.x, y: p.y, yaw: p.yaw, color: p.color, name: p.name, lit: p.fl, hid: p.hid })),
    itemsGot: c.items.map((i) => i.got), tlv: own ? c.tlv : 0, flick: c.flick, shake: c.shake, catcher: c.catcher,
  };
}
