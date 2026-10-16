// src/components/hollow/hollowNet.mjs
// HOLLOW HOURS together: what one phone tells the others, and what it does
// with what they tell it. Pure — no sockets here (the room component sends
// and receives; scripts/check-hollow.mjs passes the messages between two
// runs directly).
//
// Every phone sends its kid (kidMsg, ~15 a second): where it is and what it's
// doing — enough for the others to draw it — whether it's hidden from the
// Keeper, whether it's through the exit, the noises it made (for the Keeper
// to hear), anything it used (a crank, a lever), and if it's been caught.
//
// The host (the lowest seat) also sends the room (roomMsg, ~8 a second): its
// clock, the state of its machinery (the lift, the levers, the gate), the
// boxes that move, and the Keeper with the sounds it made. The others take
// the room from it; their own kid is always their own.
import { noiseOf } from "./hollowKeeper.mjs";
import { hidden } from "./hollowCore.mjs";

const r2 = (v) => Math.round(v * 100) / 100;

// ── what this phone says about its kid ──
export function kidMsg(S, sent) {
  const P = S.P;
  const ev = [], use = [];
  for (const e of sent) {
    if (e.fromHost || e.fromFriend) continue;   // what others told us isn't ours to tell back
    if (e.n === "crank" || e.n === "lever") use.push({ n: e.n, x: r2(P.x), y: r2(P.y), z: r2(P.z) });
    if (noiseOf(e) > 0) ev.push({ n: e.n, x: r2(e.x), y: r2(e.y || 0), z: r2(e.z), v: e.v && r2(e.v), mat: e.mat, crouch: e.crouch, drag: e.drag, kind: e.kind });
  }
  const m = { ...kidPose(S), ev, use };
  // the block being dragged moves for everyone
  if (P.st === "drag" && P.drag) m.mv = [P.drag.b.id, r2(P.drag.b.x0), r2(P.drag.b.z0)];
  // caught: tell everyone once — the room starts again for all of you
  if (S.caught && !S.caught.told) { S.caught.told = true; m.caught = { who: S.caught.who, by: S.caught.by }; }
  return m;
}

// the kid's pose and state: enough for another phone to draw it (no side effects)
export function kidPose(S) {
  const P = S.P;
  return {
    r: S.roomI, x: r2(P.x), y: r2(P.y), z: r2(P.z), f: r2(P.face), st: P.st, sT: r2(P.stT), sp: r2(P.speed), sd: r2(P.stride),
    c: P.crouch ? 1 : 0, h: P.hold >= 0 ? 1 : 0, vy: r2(P.vy), at: r2(P.airT), te: P.teeter ? 1 : 0,
    lv: r2(P.landV), lt: r2(Math.min(P.landT, 9)), jt: r2(Math.min(P.jumpT, 9)),
    a: P.act ? { k: P.act.k, t: r2(P.act.t), d: P.act.dur } : null, cu: P.climb ? r2(P.climb.u) : null,
    sk: P.stun ? { k: P.stun.k, d: P.stun.dur } : null, pu: P.pushing === false ? 0 : 1,
    hid: hidden(S) ? 1 : 0, out: S.out ? 1 : 0,
  };
}

// ── watching: what a player's phone sends a spectator, and how the
// spectator's phone draws from it (useSpecStream: room:frame, < 6 KB) ──
export function watchMsg(S) {
  return {
    k: kidPose(S), rm: roomMsg(S, []), c: S.caught ? { who: S.caught.who, by: S.caught.by, t: r2(S.caught.t) } : null,
    fr: S.friends.filter((f) => f.here && f.roomI === S.roomI).map((f) => ({ id: f.id, n: f.name, x: f.x, y: f.y, z: f.z, f: f.face, st: f.st, c: f.crouch ? 1 : 0, sp: f.speed, sd: f.stride, out: f.out ? 1 : 0 })),
  };
}
export function onWatch(S, w) {
  const k = w.k, P = S.P;
  Object.assign(P, { x: k.x, y: k.y, z: k.z, face: k.f, st: k.st, stT: k.sT, speed: k.sp, stride: k.sd, crouch: !!k.c, hold: k.h ? 0 : -1,
    vy: k.vy, airT: k.at, teeter: !!k.te, landV: k.lv, landT: k.lt, jumpT: k.jt,
    act: k.a ? { k: k.a.k, t: k.a.t, dur: k.a.d } : null, climb: k.cu == null ? null : { u: k.cu },
    stun: k.sk ? { k: k.sk.k, dur: k.sk.d } : null, pushing: !!k.pu });
  S.out = !!k.out;
  S.caught = w.c ? { ...w.c } : null;
  S.host = false;
  onRoom(S, w.rm);
  S.friends = (w.fr || []).map((f) => ({ id: f.id, name: f.n, here: true, roomI: S.roomI, x: f.x, y: f.y, z: f.z, face: f.f, st: f.st, crouch: !!f.c, speed: f.sp, stride: f.sd, out: !!f.out, landT: 9, jumpT: 9, stT: 1 }));
}

// ── what this phone does with a friend's kid ──
export function onKid(S, id, m, name) {
  let f = S.friends.find((o) => o.id === id);
  if (!f) { f = { id, name, here: true }; S.friends.push(f); }
  f.here = true; f.seen = S.T; if (name) f.name = name;
  f.roomI = m.r; f.x = m.x; f.y = m.y; f.z = m.z; f.face = m.f; f.st = m.st; f.stT = m.sT; f.speed = m.sp; f.stride = m.sd;
  f.crouch = !!m.c; f.hold = m.h ? 0 : -1; f.vy = m.vy; f.airT = m.at; f.teeter = !!m.te;
  f.landV = m.lv; f.landT = m.lt; f.jumpT = m.jt;
  f.act = m.a ? { k: m.a.k, t: m.a.t, dur: m.a.d } : null; f.climb = m.cu == null ? null : { u: m.cu };
  f.stun = m.sk ? { k: m.sk.k, dur: m.sk.d } : null; f.pushing = !!m.pu;
  f.hidden = !!m.hid; f.out = !!m.out; f.outRoom = m.out ? m.r : -1;
  const same = m.r === S.roomI;
  // their noises are the Keeper's to hear (on the phone that runs it)
  if (same && S.host && m.ev) for (const e of m.ev) S.inbox.push(e);
  // their crank or lever: the host's room answers it
  if (same && S.host && m.use && S.room.use) for (const u of m.use) S.room.use(S, () => {}, { x: u.x, y: u.y, z: u.z, face: 0 });
  // the block they're dragging
  if (same && m.mv) {
    const b = S.room.solids.find((o) => o.id === m.mv[0]);
    if (b && !(S.P.st === "drag" && S.P.drag && S.P.drag.b === b)) { const dx = m.mv[1] - b.x0, dz = m.mv[2] - b.z0; b.x0 += dx; b.x1 += dx; b.z0 += dz; b.z1 += dz; }
  }
  // caught (by the Keeper or the Cuckoo): the room starts again for everyone
  if (same && m.caught && !S.caught) S.caught = { t: 0, who: m.caught.who, by: m.caught.by, told: true };
  return f;
}

// a friend gone quiet, or gone from the room: not waited for, not hunted
export function dropKid(S, id) { const f = S.friends.find((o) => o.id === id); if (f) f.here = false; }

// ── what the host says about the room ──
const K_KEYS = ["x", "z", "face", "st", "stT", "spd", "stride", "tx", "tz", "pause", "who", "hunt"];
export function roomMsg(S, sent) {
  const sol = S.room.solids;
  const m = {
    r: S.roomI, rt: r2(S.roomT), rs: S.rs,
    kin: sol.filter((o) => o.kin && !o.friend).map((o) => [o.id, r2(o.x0), r2(o.y0), r2(o.y1), r2(o.z0)]),
    gone: sol.filter((o) => o.gone).map((o) => o.id),
    mov: sol.filter((o) => o.movable).map((o) => [o.id, r2(o.x0), r2(o.z0)]),
  };
  if (S.K) {
    m.K = {}; for (const k of K_KEYS) m.K[k] = typeof S.K[k] === "number" ? r2(S.K[k]) : S.K[k];
    m.kev = sent.filter((e) => e.n[0] === "k" && e.n !== "kGrab").map((e) => ({ n: e.n, x: r2(e.x), y: r2(e.y || 0), z: r2(e.z), v: e.v && r2(e.v) }));
  }
  // the room's own one-off moments, so every phone sees and hears them
  m.rev = sent.filter((e) => ["burst", "smash", "bell", "faceOpen", "liftGo", "liftStop", "ding", "lever", "crank"].includes(e.n)).map((e) => ({ ...e }));
  return m;
}

// ── what a guest does with the host's room ──
export function onRoom(S, m) {
  if (m.r !== S.roomI || S.host) return;
  // one clock for the room: small drift eased out, a big one jumped
  const d = m.rt - S.roomT;
  S.roomT += Math.abs(d) > 0.35 ? d : d * 0.2;
  if (m.rs) S.rs = JSON.parse(JSON.stringify(m.rs));
  const sol = S.room.solids, byId = (id) => sol.find((o) => o.id === id);
  for (const [id, x0, y0, y1, z0] of m.kin || []) { const o = byId(id); if (!o) continue; const dx = x0 - o.x0, dz = z0 - o.z0; o.x0 += dx; o.x1 += dx; o.z0 += dz; o.z1 += dz; o.y0 = y0; o.y1 = y1; }
  for (const id of m.gone || []) { const o = byId(id); if (o && !o.gone) { o.y0 += 100; o.y1 += 100; o.gone = true; } }
  for (const [id, x0, z0] of m.mov || []) {
    const o = byId(id);
    if (!o || (S.P.st === "drag" && S.P.drag && S.P.drag.b === o)) continue;
    const dx = x0 - o.x0, dz = z0 - o.z0; o.x0 += dx; o.x1 += dx; o.z0 += dz; o.z1 += dz;
  }
  // the Keeper, as the host has it; and what it sounded like
  if (m.K) { S.K = S.K || { alert: 0, sp: [], spI: 0 }; Object.assign(S.K, m.K); }
  else S.K = null;
  for (const e of [...(m.kev || []), ...(m.rev || [])]) S.events.push({ ...e, fromHost: true });
}

// The host is the lowest seat still here. Returns whether this phone is it.
export function pickHost(S, ids) {
  const live = [S.me, ...S.friends.filter((f) => f.here).map((f) => f.id)].filter((id) => !ids || ids.includes(id));
  const lead = live.sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0))[0];
  const was = S.host;
  S.host = lead === S.me;
  // becoming the host mid-room (the old one left): take over the Keeper as last told
  if (S.host && !was && S.K && !S.K.route) Object.assign(S.K, { quiet: 0, sp: [], spI: 0, alert: 0, wp: S.K.wp || 0 });
  return S.host;
}
