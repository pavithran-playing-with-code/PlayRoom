// src/components/hollow/hollowKeeper.mjs
// THE KEEPER — the thing in the Hall. Huge, slow, and blind: it hunts by
// sound. Pure rules, no three.js: hollowCore's step() calls stepKeeper()
// every frame with the sounds the kid (and the world) made that frame.
//
// How loud is a sound? noiseOf() turns an event into how far it carries, in
// metres. Bare feet running on boards carry ~7 m; walking softly on the
// carpet runner well under a metre; a tin tray underfoot, a thrown can
// landing, a hard fall — much further. The Keeper hears anything that
// carries as far as it is from the Keeper.
//
// What it does:
//   patrol   walks its round (room.keeper.route): along the back of the hall,
//            into its room behind the doorway for a while, out again
//   listen   heard something: stops, turns its head to it
//   go       walks to where the sound was
//   search   gropes about that spot with its long arms, a few seconds
//   chase    heard the kid close by: goes for them, fast
//   return   gives up and walks back to its round
//   grab     has the kid
// It catches the kid if it gets within reach and the kid isn't hidden —
// under something (a bench, a table: covered) or among the coats. Up on
// something tall is out of reach too. On its round it simply walks into
// anyone standing in its way.
//
// Everything it does goes out as events too (kStep, kHear, kRoar, kGrab,
// kLost…) for the sound and the pictures.

export const K_PATROL = 1.25, K_GO = 2.0, K_CHASE = 2.9, K_SEARCH = 0.8;
export const K_REACH = 1.15;        // how close it must be to take you (chasing or searching)
export const K_BUMP = 0.85;         // …or to walk into you on its round
export const K_TOP = 3.3;           // it can't reach anyone higher than this
const LISTEN_T = 1.1, SEARCH_T = 4.5, CHASE_LOSE = 1.6, STRIDE = 1.5;

const MAT = { wood: 1, cloth: 0.35, book: 0.6, water: 1.3, tin: 2.2 };

// how far (m) a sound carries; 0 for silence
export function noiseOf(e) {
  const m = MAT[e.mat] == null ? 1 : MAT[e.mat];
  switch (e.n) {
    case "step": {
      const v = e.v || 0;
      const k = e.crouch ? 0.25 : v >= 2.6 ? 1 : v >= 1.6 ? 0.6 : 0.3;
      return (e.drag ? 6 : 7 * m * k);
    }
    case "land": return e.v > 2.5 ? e.v * 0.9 * (e.mat === "cloth" ? 0.5 : m) : 0;
    case "hardLand": return 10;
    case "tumble": return 12;
    case "bump": return 6;
    case "clank": return e.kind === "can" || e.kind === "cup" ? e.v * 1.5 : e.v * 1.0;
    case "grab": case "mantle": case "climb": return 0.8;
    case "throw": case "jump": return 0.5;
    case "dragOn": return 2;
    default: return 0;
  }
}

export function newKeeper(spec) {
  const r = spec.route[0];
  return { x: r[0], z: r[1], face: Math.PI, st: "patrol", stT: 0, wp: 0, pause: 0, tx: r[0], tz: r[1], spd: 0, stride: 0,
    hx: r[0], hz: r[1], quiet: 0, sp: [], spI: 0, alert: 0 };
}

const ang = (dx, dz) => Math.atan2(dz, dx);
function turnTo(K, a, rate) {
  let d = a - K.face;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  K.face += Math.max(-rate, Math.min(rate, d));
}
function setSt(K, st) { K.st = st; K.stT = 0; }

// keep it in the hall (or in its own room, through the doorway)
function bound(room, K) {
  const d = room.door;
  K.x = Math.max(1.2, Math.min(room.w - 1.2, K.x));
  const inDoor = d && d.y1 > 4 && K.x > d.x0 + 0.9 && K.x < d.x1 - 0.9;
  K.z = Math.max(0.8, Math.min(inDoor ? room.d + 2.6 : room.d - 0.6, K.z));
}

// walk toward (tx, tz) at up to v; true when there
function walk(S, K, tx, tz, v, dt) {
  const dx = tx - K.x, dz = tz - K.z, l = Math.hypot(dx, dz);
  K.spd += (v - K.spd) * Math.min(1, dt * 3);
  if (l < 0.08) { K.spd = 0; return true; }
  const st = Math.min(l, K.spd * dt);
  K.x += dx / l * st; K.z += dz / l * st;
  turnTo(K, ang(dx, dz), dt * (v > 2 ? 4 : 2.2));
  bound(S.room, K);
  // its feet: every STRIDE metres a heavy step
  const b = Math.floor(K.stride);
  K.stride += st / STRIDE;
  if (Math.floor(K.stride) !== b) S.events.push({ n: "kStep", x: K.x, y: 0, z: K.z, v: K.spd });
  return false;
}

// Out of its reach: under something, among the coats, or up high.
export function hiddenFrom(S, covered) {
  const P = S.P;
  if (P.y > K_TOP) return true;
  if (covered(S)) return true;
  return (S.room.hides || []).some((h) => P.x > h.x0 && P.x < h.x1 && P.z > h.z0 && P.z < h.z1 && P.speed < 1.8 && P.y < 0.2);
}

// Everyone it could take: this kid, and (playing together) the friends, as
// their phones last said — where they are, and whether they're hidden.
function players(S, covered) {
  const P = S.P, me = { id: S.me || "me", x: P.x, y: P.y, z: P.z, hidden: hiddenFrom(S, covered) };
  return [me, ...(S.friends || []).filter((f) => f.here && !f.out).map((f) => ({ id: f.id, x: f.x, y: f.y, z: f.z, hidden: !!f.hidden }))];
}
// take whoever is within reach and not hidden
function reach(S, K, all, r) {
  for (const p of all) if (!p.hidden && p.y < K_TOP && Math.hypot(p.x - K.x, p.z - K.z) < r) { grab(S, K, p); return true; }
  return false;
}

// One frame. heard: the sounds made this frame (events with a position) —
// together, the friends' too.
export function stepKeeper(S, dt, heard, covered) {
  const K = S.K, P = S.P;
  if (!K) return;
  K.stT += dt;
  if (K.st === "grab") { K.spd = 0; return; }
  // held up (bursting in, tearing a gate away): it stands, then comes on
  if (K.stall > 0) { K.stall -= dt; K.spd = 0; return; }
  // hunting (the chase in the Stairwell): it knows where you are, and never gives up
  if (K.hunt) {
    // the nearest of you it can still reach
    const all = players(S, covered).filter((p) => p.y < K_TOP);
    const tgt = all.sort((a, b) => Math.hypot(a.x - K.x, a.z - K.z) - Math.hypot(b.x - K.x, b.z - K.z))[0] || P;
    K.tx = tgt.x; K.tz = tgt.z; K.quiet = 0;
    walk(S, K, K.tx, K.tz, K.huntV || K_CHASE, dt);
    reach(S, K, players(S, covered).map((p) => ({ ...p, hidden: false })), K_REACH);
    return;
  }

  // ── listening ──
  let best = null;
  for (const e of heard) {
    const r = noiseOf(e);
    if (!r) continue;
    const d = Math.hypot(e.x - K.x, (e.z - K.z), ((e.y || 0) - 0) * 0.4);
    if (d > r) continue;
    const kid = e.n !== "clank";               // a thing landing isn't the kid
    const score = r - d;
    if (!best || score > best.score) best = { x: e.x, z: e.z, d, r, kid, score };
  }
  if (best) {
    K.alert = Math.min(1, K.alert + 0.4);
    const close = best.kid && best.d < 3.2 && best.r > 3;
    if (K.st === "chase") { if (best.kid) { K.tx = best.x; K.tz = best.z; K.quiet = 0; } }
    else if (close || (best.kid && (K.st === "search" || K.st === "go") && best.d < 2.5)) {
      setSt(K, "chase"); K.tx = best.x; K.tz = best.z; K.quiet = 0;
      S.events.push({ n: "kRoar", x: K.x, y: 4, z: K.z });
    } else if (K.st === "patrol" || K.st === "return" || K.st === "listen") {
      if (K.st !== "listen") S.events.push({ n: "kHear", x: K.x, y: 4, z: K.z });
      setSt(K, "listen"); K.tx = best.x; K.tz = best.z;
    } else { K.tx = best.x; K.tz = best.z; if (K.st === "search") setSt(K, "go"); }
  } else K.alert = Math.max(0, K.alert - dt * 0.15);

  const all = players(S, covered);

  // ── what it does ──
  switch (K.st) {
    case "patrol": {
      const route = S.room.keeper.route, w = route[K.wp];
      if (K.pause > 0) {
        K.pause -= dt; K.spd = 0;
        if (K.pause <= 0) K.wp = (K.wp + 1) % route.length;
        // now and then, standing still, it sniffs the air
        if (Math.floor((K.pause + dt) / 1.7) !== Math.floor(K.pause / 1.7)) S.events.push({ n: "kSniff", x: K.x, y: 4, z: K.z });
      } else if (walk(S, K, w[0], w[1], K_PATROL, dt)) {
        K.pause = w[2] || 0;
        if (!K.pause) K.wp = (K.wp + 1) % route.length;
      }
      reach(S, K, all, K_BUMP);
      break;
    }
    case "listen": {
      K.spd = 0;
      turnTo(K, ang(K.tx - K.x, K.tz - K.z), dt * 2);
      if (K.stT > LISTEN_T) setSt(K, "go");
      reach(S, K, all, K_BUMP);
      break;
    }
    case "go": {
      if (walk(S, K, K.tx, K.tz, K_GO, dt)) startSearch(S, K);
      reach(S, K, all, K_REACH);
      break;
    }
    case "search": {
      // grope round the spot: a few places close by, in turn
      const p = K.sp[K.spI];
      if (p && walk(S, K, p[0], p[1], K_SEARCH, dt)) K.spI = (K.spI + 1) % K.sp.length;
      reach(S, K, all, K_REACH + 0.3);
      if (K.stT > SEARCH_T) { setSt(K, "return"); S.events.push({ n: "kLost", x: K.x, y: 4, z: K.z }); }
      break;
    }
    case "chase": {
      // it follows the last place it heard you; hidden and quiet, it loses you
      K.quiet += dt;
      walk(S, K, K.tx, K.tz, K_CHASE, dt);
      if (reach(S, K, all, K_REACH)) break;
      if (K.quiet > CHASE_LOSE && (all.every((p) => p.hidden) || Math.hypot(K.tx - K.x, K.tz - K.z) < 0.3)) startSearch(S, K);
      break;
    }
    case "return": {
      // back to the nearest point of its round
      const route = S.room.keeper.route;
      let bi = 0, bd = 1e9;
      route.forEach((w, i) => { const d = Math.hypot(w[0] - K.x, w[1] - K.z); if (d < bd) { bd = d; bi = i; } });
      K.wp = bi;
      setSt(K, "patrol");
      break;
    }
    default: break;
  }
}

function startSearch(S, K) {
  setSt(K, "search");
  // three places around where it heard you, turning a little each time
  const a0 = (S.T * 1.7) % (Math.PI * 2);
  K.sp = [0, 1, 2].map((i) => [K.tx + Math.cos(a0 + i * 2.1) * 1.1, K.tz + Math.sin(a0 + i * 2.1) * 0.9]);
  K.spI = 0;
  S.events.push({ n: "kSniff", x: K.x, y: 4, z: K.z });
}

// it has someone: this kid or a friend. Either way the room starts again for all.
function grab(S, K, p) {
  const who = p || { id: S.me || "me", x: S.P.x, y: S.P.y, z: S.P.z };
  setSt(K, "grab");
  K.face = Math.atan2(who.z - K.z, who.x - K.x);
  K.who = who.id;
  S.events.push({ n: "kGrab", x: who.x, y: who.y, z: who.z, who: who.id });
  S.caught = { t: 0, who: who.id, by: "keeper" };
}
