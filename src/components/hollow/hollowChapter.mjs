// src/components/hollow/hollowChapter.mjs
// The rest of Chapter 1, The Clockworks: the rooms after the Hall, each with
// its own rules. Pure — no three.js, no React, no Math.random: the scene and
// the sound read what's here, scripts/check-hollow.mjs plays it.
//
//   the Workshop    a breather: a giant clockmaker's bench. Wind the crank,
//                   then get onto the lift before it rises to the hatch.
//   the Gallery     the Cuckoo: on its clock's hour it comes out on its long
//                   neck and sweeps a beam of light across the room. Caught
//                   in the light, in the open, where it can see you — it has
//                   you. Furniture between you and its eye is a shadow.
//   the Stairwell   the chase: the Keeper breaks through the door behind you.
//                   Over a chair, across a gap, under a gate (it has to smash
//                   it), up a ledge, up the shelves out of its reach.
//   the Bell Tower  the end: climb the great clock's insides by moonlight —
//                   beams, a counterweight going up and down, ledges — pull
//                   the lever at the top: midnight. The door in the clock
//                   face opens.
//
// A room here is boxes as in hollowCore, plus: init(S) → its state (S.rs);
// tick(S, dt, emit) every frame; use(S, emit) for GRAB; hint(S).
// Boxes marked `kin` are moved by tick; the kid rides them.

const D = 6;
const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (k) => k * k * (3 - 2 * k);

function maker() {
  const solids = [];
  const add = (x0, x1, y0, y1, z0, z1, o = {}) => {
    const s = { x0, x1, y0, y1, z0, z1, mat: "wood", grab: true, look: "wood", ...o, id: solids.length };
    solids.push(s);
    return s;
  };
  return { solids, add };
}
const WALL = { grab: false, look: "wall", mat: "wood" };
const BACK = { ...WALL, look: "back" };

// the shell every room has: a floor, side walls, the glass toward the camera,
// and a back wall round its holes
function shell(add, w, holes, h = 14) {
  add(-4, w + 6, -1, 0, -4, 12, { grab: false, look: "floor" });
  add(-2, 0, 0, h, -1, 10, WALL);
  add(w, w + 1, 0, h, -1, 10, WALL);
  add(-2, w + 4, 0, h, -1, 0, { grab: false, look: "none" });
  const xs = [0, w, ...holes.flatMap((o) => [o.x0, o.x1])].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    if (x1 - x0 < 1e-6) continue;
    const hs = holes.filter((o) => (x0 + x1) / 2 > o.x0 && (x0 + x1) / 2 < o.x1).sort((a, b) => a.y0 - b.y0);
    let y = 0;
    for (const o of hs) { if (o.y0 > y) add(x0, x1, y, o.y0, D, D + 1, BACK); y = o.y1; }
    add(x0, x1, y, h, D, D + 1, BACK);
  }
  // behind each hole, a short dark passage
  for (const o of holes) {
    add(o.x0, o.x1, o.y1, o.y1 + 0.4, D + 1, D + 3.5, { ...WALL, look: "dark" });
    if (o.y0 > 0) add(o.x0, o.x1, o.y0 - 0.4, o.y0, D + 1, D + 3.5, { ...WALL, look: "dark" });
    add(o.x0 - 0.3, o.x0, o.y0, o.y1, D + 1, D + 3.5, { ...WALL, look: "dark" });
    add(o.x1, o.x1 + 0.3, o.y0, o.y1, D + 1, D + 3.5, { ...WALL, look: "dark" });
  }
}

const near = (P, x, y, z, r) => Math.abs(P.y - y) < 0.6 && Math.hypot(P.x - x, P.z - z) < r;

// ── the Workshop ──
export const WS_W = 34;
export const WS_IN = { x0: 0.9, x1: 2.3, y0: 0, y1: 0.72 };          // where you crawled in
export const WS_HATCH = { x0: 25.6, x1: 27.0, y0: 7.2, y1: 7.95 };   // the way out, high up
export const WS_CRANK = { x: 21.8, y: 3.5, z: 4.6 };
export const LIFT = { lo: 0.25, hi: 7.2, up: 1.5, down: 1.2, delay: 2.2, hold: 7 };
export function buildWorkshop(opts = {}) {
  const { solids, add } = maker();
  shell(add, WS_W, [WS_IN, WS_HATCH]);
  // a stool, and the great bench
  add(6.6, 7.8, 0, 1.9, 2.2, 3.6, { look: "stool" });
  for (const [x, z] of [[8.9, 0.9], [23.5, 0.9], [8.9, 5.1], [23.5, 5.1]]) add(x, x + 0.4, 0, 3.2, z, z + 0.4, { look: "leg", grab: false });
  add(8.8, 24, 3.2, 3.5, 0.8, 5.6, { look: "bench" });
  // under the bench: crates, and a heap of old gears
  add(12, 13.4, 0, 1.2, 1.5, 2.7, { look: "crate" });
  add(16.5, 17.5, 0, 0.6, 3.6, 4.6, { look: "crate" });
  // the lift, in its shaft at the end of the bench
  add(25.2, 27.4, LIFT.lo - 0.25, LIFT.lo, 1.4, 5.9, { look: "lift", kin: true, lift: true, mat: "tin" });
  const items = [{ kind: "cup", x: 15.2, y: 3.5, z: 2.2 }];
  return {
    name: "workshop", make: () => buildWorkshop(opts), everyone: true, solids, items, holes: [WS_IN, WS_HATCH], w: WS_W, d: D, hemi: [0x40382c, 0x140c06],
    spawn: { x: 1.6, y: 0, z: 5.1 }, crank: WS_CRANK, inDoor: WS_IN,
    exit: { x0: WS_HATCH.x0, x1: WS_HATCH.x1, y: WS_HATCH.y0, z: D + 0.45 },
    init: () => ({ wind: 0, lift: "rest", t: 0, at: 0 }),
    use(S, emit, who = S.P) {
      const P = who, c = WS_CRANK;
      if (!near(P, c.x, c.y, c.z, 0.75)) return false;
      const r = S.rs;
      if (r.lift !== "rest" && r.lift !== "down") { emit("crankStuck", { x: c.x, y: c.y, z: c.z }); return true; }
      r.wind = Math.min(1, r.wind + 0.25);
      P.act = { k: "wind", t: 0, dur: 0.45 };
      P.face = Math.atan2(c.z - P.z, c.x - P.x);
      emit("crank", { x: c.x, y: c.y, z: c.z, wind: r.wind });
      if (r.wind >= 1) { r.lift = "wait"; r.t = 0; emit("ding", { x: c.x, y: c.y + 0.5, z: c.z }); }
      return true;
    },
    tick(S, dt, emit) {
      const r = S.rs, L = S.room.solids.find((s) => s.lift), P = S.P;
      r.t += dt;
      const top = L.y1;
      const setTop = (y) => { L.y1 = y; L.y0 = y - 0.25; };
      if (r.lift === "wait" && r.t > LIFT.delay) { r.lift = "up"; r.t = 0; r.wind = 0; emit("liftGo", { x: 26.3, y: top, z: 3.6 }); }
      else if (r.lift === "up") {
        setTop(Math.min(LIFT.hi, top + LIFT.up * dt));
        if (L.y1 >= LIFT.hi) { r.lift = "top"; r.t = 0; emit("liftStop", { x: 26.3, y: L.y1, z: 3.6 }); }
      } else if (r.lift === "top" && r.t > LIFT.hold) { r.lift = "down"; r.t = 0; emit("liftGo", { x: 26.3, y: top, z: 3.6 }); }
      else if (r.lift === "down") {
        // it won't come down on you
        const under = P.x + 0.22 > L.x0 && P.x - 0.22 < L.x1 && P.z + 0.22 > L.z0 && P.z - 0.22 < L.z1 && P.y + 1.0 > L.y0 - LIFT.down * dt - 0.05 && P.y < L.y0;
        if (!under) setTop(Math.max(LIFT.lo, top - LIFT.down * dt));
        if (L.y1 <= LIFT.lo) { r.lift = "rest"; r.t = 0; emit("liftStop", { x: 26.3, y: L.y1, z: 3.6 }); }
      }
    },
    hint(S) {
      const P = S.P, r = S.rs;
      if (r.lift === "wait" || (r.lift === "up" && P.y < 3.4)) return "The lift! Quick";
      if (near(P, WS_CRANK.x, WS_CRANK.y, WS_CRANK.z, 1.6) && r.lift === "rest") return r.wind > 0 ? "Keep winding" : "GRAB the crank to wind it";
      if (P.y > 7 && P.x > 25) return P.crouch ? "" : "Crouch into the hatch";
      return null;
    },
  };
}

// ── the Gallery, and the Cuckoo ──
export const GA_W = 40;
export const GA_IN = { x0: 0.9, x1: 2.3, y0: 0, y1: 0.72 };
export const GA_DOOR = { x0: 37.6, x1: 39.4, y0: 0, y1: 3.2 };
export const CUCKOO = { x: 21, y: 7.7, zIn: 5.6, zOut: 2.4, x0: 8, x1: 34, half: 1.7, IN: 8, WARN: 2.2, OUT: 6.5, BACK: 1.5, LEAD: 2 };
const C_PERIOD = CUCKOO.IN + CUCKOO.WARN + CUCKOO.OUT + CUCKOO.BACK;
// Where the Cuckoo is at a moment of the room's clock: its phase (in, warn,
// out, back), how far into it (k), how far its neck is out (0..1), where its
// beam falls (bx). The pictures and the sound use this too.
export function cuckooAt(t) {
  const c = CUCKOO, p = ((t + c.LEAD) % C_PERIOD + C_PERIOD) % C_PERIOD;
  if (p < c.IN) return { ph: "in", k: p / c.IN, neck: 0, bx: c.x0, cycle: Math.floor((t + c.LEAD) / C_PERIOD) };
  if (p < c.IN + c.WARN) { const k = (p - c.IN) / c.WARN; return { ph: "warn", k, neck: ease(cl(k * 1.5 - 0.5, 0, 1)) * 0.25, bx: c.x0, cycle: Math.floor((t + c.LEAD) / C_PERIOD) }; }
  if (p < c.IN + c.WARN + c.OUT) {
    const k = (p - c.IN - c.WARN) / c.OUT;
    return { ph: "out", k, neck: 0.25 + 0.75 * ease(cl(k * 5, 0, 1)), bx: c.x0 + (c.x1 - c.x0) * ease(cl((k - 0.1) / 0.85, 0, 1)), cycle: Math.floor((t + c.LEAD) / C_PERIOD) };
  }
  const k = (p - c.IN - c.WARN - c.OUT) / c.BACK;
  return { ph: "back", k, neck: 1 - ease(k), bx: c.x1, cycle: Math.floor((t + c.LEAD) / C_PERIOD) };
}
export const cuckooHead = (q) => ({ x: CUCKOO.x, y: CUCKOO.y - 0.6 * q.neck, z: CUCKOO.zIn + (CUCKOO.zOut - CUCKOO.zIn) * q.neck });

// does the line from a to b pass through a box? (slab test, boxes that cast shadow)
export function lineBlocked(solids, a, b) {
  for (const s of solids) {
    if (!s.shade) continue;
    let t0 = 0, t1 = 1, ok = true;
    for (const ax of ["x", "y", "z"]) {
      const d = b[ax] - a[ax], lo = s[ax + "0"], hi = s[ax + "1"];
      if (Math.abs(d) < 1e-9) { if (a[ax] < lo || a[ax] > hi) { ok = false; break; } continue; }
      let u0 = (lo - a[ax]) / d, u1 = (hi - a[ax]) / d;
      if (u0 > u1) [u0, u1] = [u1, u0];
      t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
      if (t0 > t1) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

// in its light: out, in the beam, and nothing between you and its eye
export function inCuckooLight(S, covered) {
  const q = cuckooAt(S.roomT), P = S.P;
  if (q.ph !== "out" || q.neck < 0.6) return false;
  if (Math.abs(P.x - q.bx) > CUCKOO.half) return false;
  if (covered(S)) return false;
  return !lineBlocked(S.room.solids, cuckooHead(q), { x: P.x, y: P.y + 0.5, z: P.z });
}

export function buildGallery(opts = {}) {
  const { solids, add } = maker();
  shell(add, GA_W, [GA_IN, GA_DOOR]);
  const shade = { shade: true };
  // the cuckoo clock: a great case against the back wall, its little doors high up
  add(18.5, 23.5, 0, 10, 4.6, D, { look: "cclock", grab: false });
  // cover, left to right: a statue on a pedestal, the piano, crates, an armchair, a tall plant, a folding screen
  add(6, 7.2, 0, 2.6, 2, 3.4, { look: "pedestal", ...shade });
  // the piano: high enough to duck under without stopping
  for (const [x, z] of [[10.1, 1.3], [13.7, 1.3], [10.1, 4.0], [13.7, 4.0]]) add(x, x + 0.2, 0, 1.12, z, z + 0.2, { look: "leg", grab: false });
  add(10, 14, 1.12, 2.8, 1.2, 4.3, { look: "piano", ...shade });
  add(15.5, 16.8, 0, 2.0, 1.2, 3.0, { look: "crate", ...shade });
  add(25.5, 27.3, 0, 1.2, 1.6, 3.4, { look: "chair", mat: "cloth", ...shade });
  add(27.0, 27.3, 1.2, 2.8, 1.6, 3.4, { look: "chairback", ...shade });
  add(30.5, 31.5, 0, 3.2, 2.0, 3.0, { look: "plant", mat: "cloth", ...shade });
  add(34, 34.15, 0, 3.4, 1.0, 3.6, { look: "screen", grab: false, ...shade });
  return {
    name: "gallery", make: () => buildGallery(opts), everyone: true, solids, items: [], holes: [GA_IN, GA_DOOR], w: GA_W, d: D, hemi: [0x30344a, 0x100c10],
    spawn: { x: 1.6, y: 0, z: 5.1 }, inDoor: GA_IN, door: GA_DOOR,
    exit: { x0: GA_DOOR.x0, x1: GA_DOOR.x1, y: 0, z: D + 0.45 },
    init: () => ({ lastPh: "in" }),
    tick(S, dt, emit) {
      const q = cuckooAt(S.roomT), r = S.rs;
      if (q.ph !== r.lastPh) {
        r.lastPh = q.ph;
        const h = cuckooHead(q);
        emit(q.ph === "warn" ? "cWarn" : q.ph === "out" ? "cOut" : q.ph === "back" ? "cBack" : "cIn", { x: h.x, y: h.y, z: h.z });
      }
      if (inCuckooLight(S, S.coveredFn)) {
        S.caught = { t: 0, by: "cuckoo" };
        emit("cGrab", { x: S.P.x, y: S.P.y, z: S.P.z });
      }
    },
    hint(S) {
      if (S.roomT < 7) return "On the hour, the Cuckoo comes out. Keep out of its light";
      const q = cuckooAt(S.roomT);
      if (q.ph === "warn") return "Hide!";
      return null;
    },
  };
}

// ── the Stairwell: the chase ──
export const SW_W = 50;
export const SW_IN = { x0: 0.9, x1: 2.3, y0: 0, y1: 0.72 };
export const SW_OUT = { x0: 43.6, x1: 45.1, y0: 3.6, y1: 4.35 };
export const SW_GATE_X = 21.5, SW_TRIGGER = 6, SW_PIT = { x0: 15.4, x1: 17.0 };
export function buildStairwell(opts = {}) {
  const { solids, add } = maker();
  // the floor has a gap in it: the shell's floor is replaced by two pieces and a pit
  shell(add, SW_W, [SW_IN, SW_OUT]);
  const floor = solids.find((s) => s.look === "floor");
  floor.x1 = SW_PIT.x0;
  add(SW_PIT.x1, SW_W + 6, -1, 0, -4, 12, { grab: true, look: "floor" });
  add(SW_PIT.x0, SW_PIT.x1, -4, -3, -4, 12, { grab: false, look: "pit" });
  // a chair fallen across the way
  add(10, 11.2, 0, 0.95, 0.6, 5.4, { look: "fallen" });
  // the gate: a bar across, low enough to slide under
  add(SW_GATE_X, SW_GATE_X + 0.8, 0.75, 4.5, 0, D, { look: "gate", grab: false, gate: true });
  // the landing up a step, then the shelves to the hole high in the wall
  add(29, 46.5, 0, 2.0, 0, D, { look: "landing" });
  add(42.5, 46.5, 2.0, 3.6, 2.5, D, { look: "shelves" });
  return {
    name: "stairwell", make: () => buildStairwell(opts), everyone: true, solids, items: [], holes: [SW_IN, SW_OUT], w: SW_W, d: D, hemi: [0x2c3040, 0x0c0a08],
    spawn: { x: 1.6, y: 0, z: 5.1 }, inDoor: SW_IN,
    exit: { x0: SW_OUT.x0, x1: SW_OUT.x1, y: SW_OUT.y0, z: D + 0.45 },
    keeper: { later: true, route: [[2, 3, 0]] },
    init: () => ({ burst: false, smashed: false }),
    tick(S, dt, emit) {
      const r = S.rs, P = S.P;
      // past the trigger: the door behind you bursts, and it comes
      const past = P.x > SW_TRIGGER || (S.friends || []).some((f) => f.here && f.roomI === S.roomI && f.x > SW_TRIGGER);
      if (!r.burst && past && S.keeperOn && S.host) {
        r.burst = true;
        S.K = S.newKeeper({ route: [[0.8, 3, 0]] });
        Object.assign(S.K, { x: 0.8, z: 3.2, st: "chase", hunt: true, huntV: 3.0, stall: 1.0, face: 0 });
        emit("burst", { x: 0.8, y: 2, z: 5.5 });
        emit("kRoar", { x: 0.8, y: 4, z: 3.2 });
      }
      // the gate stops it, for a moment: it tears it out of the way
      const K = S.K;
      if (K && !r.smashed && K.x > SW_GATE_X - 1.2) {
        r.smashed = true;
        K.stall = 1.1;
        const g = S.room.solids.find((s) => s.gate);
        g.y0 += 100; g.y1 += 100; g.gone = true;
        emit("smash", { x: SW_GATE_X + 0.4, y: 1.5, z: 3 });
      }
    },
    hint(S) {
      if (!S.rs.burst) return S.roomT < 5 ? "Something is coming. When it does, run" : null;
      if (S.P.x < 24 && S.P.x > SW_GATE_X - 3 && S.P.y < 0.5 && !S.rs.smashed) return "Crouch under the gate";
      if (S.P.x < 29 && S.P.x > 25 && S.P.y < 0.5) return "Up!";
      return S.roomT < 3 ? null : "";
    },
  };
}

// ── the Bell Tower: the end ──
export const TW_W = 18;
export const TW_FACE = { x: 10, y: 10.2, r: 4.2 };                     // the great clock face, in the back wall
export const TW_DOOR = { x0: 9.0, x1: 10.6, y0: 11.6, y1: 12.4 };      // the little door in the face
export const TW_LEVER = { x: 7.3, y: 11.6, z: 4.8 };
export const TW_LEVER2 = { x: 10.1, y: 11.6, z: 4.8 };                 // together: a second lever, at the other end
export const LEVERS_T = 3;                                               // …and both pulled within this long
export const CW = { x0: 7.6, x1: 9.2, lo: 2.7, hi: 6.3, period: 9 };    // the counterweight you ride
export const cwTop = (t) => { const p = (t % CW.period) / CW.period, k = p < 0.5 ? ease(cl((p - 0.1) / 0.3, 0, 1)) : 1 - ease(cl((p - 0.6) / 0.3, 0, 1)); return CW.lo + (CW.hi - CW.lo) * k; };
export function buildTower(opts = {}) {
  const { solids, add } = maker();
  shell(add, TW_W, [TW_DOOR], 20);
  add(1.2, 2.6, 0, 1.1, 3, 4.4, { look: "crate" });
  add(2.8, 7.0, 2.4, 2.7, 1.5, 4.5, { look: "beam" });
  add(CW.x0, CW.x1, CW.lo - 0.3, CW.lo, 2, 4, { look: "weight", kin: true, cw: true, mat: "tin" });
  add(9.8, 15, 6.0, 6.3, 1.5, 4.5, { look: "beam" });
  add(15.6, 17.6, 7.6, 8.1, 2, 4.5, { look: "beam" });
  add(11, 15.0, 9.5, 9.9, 2, 4.5, { look: "beam" });
  add(6.5, 10.6, 11.3, 11.6, 3.5, D, { look: "platform" });
  // the little door in the clock face, shut until midnight
  add(TW_DOOR.x0, TW_DOOR.x1, TW_DOOR.y0, TW_DOOR.y1, D - 0.06, D + 0.05, { look: "facedoor", grab: false, facedoor: true });
  return {
    name: "tower", make: () => buildTower(opts), everyone: true, solids, items: [], holes: [TW_DOOR], w: TW_W, d: D, hemi: [0x30384e, 0x0c0c10],
    camMaxY: 15, tall: 20,
    spawn: { x: 4.0, y: 0, z: 2.2 },
    exit: { x0: TW_DOOR.x0, x1: TW_DOOR.x1, y: TW_DOOR.y0, z: D + 0.45 },
    levers: opts.coop ? [TW_LEVER, TW_LEVER2] : [TW_LEVER],
    init: () => ({ midnight: -1, open: false, strikes: 0, pulled: opts.coop ? [-99, -99] : [-99] }),
    use(S, emit, who = S.P) {
      const P = who, r = S.rs, levers = S.room.levers;
      const i = levers.findIndex((L) => near(P, L.x, L.y, L.z, 0.8));
      if (i < 0 || r.midnight >= 0) return false;
      const L = levers[i];
      r.pulled[i] = S.roomT;
      P.act = { k: "lever", t: 0, dur: 0.8 };
      P.face = Math.atan2(L.z - P.z, L.x - P.x);
      emit("lever", { x: L.x, y: L.y, z: L.z, i });
      // midnight when every lever is down at once
      if (r.pulled.every((t) => S.roomT - t < LEVERS_T)) r.midnight = S.roomT;
      return true;
    },
    tick(S, dt, emit) {
      const r = S.rs;
      const w = S.room.solids.find((s) => s.cw), y = cwTop(S.roomT);
      w.y1 = y; w.y0 = y - 0.3;
      if (r.midnight >= 0) {
        // twelve strokes, then the door in the face swings open
        const n = Math.floor((S.roomT - r.midnight - 0.6) / 1.1) + 1;
        while (r.strikes < Math.min(12, n)) { r.strikes++; emit("bell", { x: TW_FACE.x, y: 16, z: 4, strike: r.strikes }); }
        if (!r.open && r.strikes >= 12) {
          r.open = true;
          const d = S.room.solids.find((s) => s.facedoor);
          d.y0 += 100; d.y1 += 100; d.gone = true;
          emit("faceOpen", { x: (TW_DOOR.x0 + TW_DOOR.x1) / 2, y: TW_DOOR.y0, z: D });
        }
      }
    },
    hint(S) {
      const P = S.P, r = S.rs;
      if (S.roomT < 6) return "The great clock. Climb";
      if (r.midnight < 0 && S.room.levers.some((L) => near(P, L.x, L.y, L.z, 1.6))) {
        if (S.room.levers.length > 1 && r.pulled.some((t) => S.roomT - t < LEVERS_T)) return "Now the other lever, together!";
        return S.room.levers.length > 1 ? "Two levers: pull them together" : "GRAB the lever";
      }
      if (r.open && P.y > 11) return P.crouch ? "" : "The door in the clock face is open. Crouch through";
      return null;
    },
  };
}
