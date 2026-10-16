// src/components/hollow/hollowCore.mjs
// HOLLOW HOURS — the rules: one tiny kid in a giant room. No three.js, no
// React, no clock of its own: the page calls step() every frame, the scene
// (hollowScene.js) draws what's here, and scripts/check-hollow.mjs drives a
// bot through it.
//
// The world is side-on with depth: x runs along the room (right), y is up,
// z runs from the camera (0) to the back wall. Everything solid is a box
// (x0..x1, y0..y1, z0..z1). The kid is a box too, R either side and H tall
// (HC crouched), standing at (x, y, z) — y is the feet.
//
// Moving is one axis at a time, in small steps, so a thin drawer can't be
// tunnelled through. A ledge is the top edge of any box marked `grab`: push
// into its side in the air with your hands above it and you catch it —
// a low one you scramble straight onto (mantle), a high one you hang from
// and pull yourself up. A box marked `movable` is dragged with GRAB held.
// Small things (`items`) are picked up and thrown.
//
// Everything that happens is pushed to S.events for the sound and the
// pictures: { n: "step", mat, v, x, y, z } and so on — where it happened,
// so the sound can come from there.
import { LEAK } from "./hollowWeather.mjs";
import { newKeeper, stepKeeper, hiddenFrom } from "./hollowKeeper.mjs";
import { buildWorkshop, buildGallery, buildStairwell, buildTower } from "./hollowChapter.mjs";

// The Keeper is on unless a run says otherwise (newRun(room, { keeper: false })).
export const KEEPER_DEFAULT = true;
export const CAUGHT_T = 2.6;        // caught: this long, then back to the start of the room

export const H = 1.0, HC = 0.62, R = 0.22;
export const RUN = 3.4, CROUCH_SPEED = 1.15, CARRY_RUN = 2.9, DRAG_SPEED = 1.05, WALK_K = 0.42;
export const GRAV = 24, JUMP = 6.9, COYOTE = 0.1, BUFFER = 0.13, STEP = 0.28;
export const REACH = 1.2;            // feet to fingertips, arms up
export const HANG = 0.97;            // a hanging kid's feet are this far under the edge
export const HARD = 9, TUMBLE = 13;  // landing speeds: a stagger, a fall flat
const ACC_G = 22, ACC_A = 8, TURN = 13, EPS = 1e-4, SUB = 0.12;
const CLIMB_T = 0.62, MANTLE_T = 0.36;

// ── the rooms ──
// A chapter is a list of rooms (ROOMS); leaving one by its exit puts you at
// the start of the next. Each room says what it is (`name`), its boxes, its
// things to carry, where you start and where the way out is, and the holes
// in its back wall (`holes`, for the pictures).
//
// The Nursery: a cot you crawl under (or climb over, from the books), a
// table and chair to scramble on, a toy block to drag under the chest of
// drawers, the drawers as steps, a jump to the shelf and the vent at the end
// of it, in the back wall.
export const ROOM_W = 30, ROOM_D = 6;
const NURSERY_WIN = { x0: 12.5, x1: 17.5, y0: 4.6, y1: 9.2 };
export const VENT = { x0: 28.1, x1: 29.5, y0: 6.0, y1: 6.75 };     // a hole in the back wall: crouch to get in
export function buildNursery() {
  const solids = [];
  const add = (x0, x1, y0, y1, z0, z1, o = {}) => {
    const s = { x0, x1, y0, y1, z0, z1, mat: "wood", grab: true, look: "wood", ...o, id: solids.length };
    solids.push(s);
    return s;
  };
  const wall = { grab: false, look: "wall", mat: "wood" };
  // the shell: floor, walls, and the glass you can't walk through toward the camera
  add(-4, 36, -1, 0, -4, 10, { grab: false, look: "floor" });
  add(-2, 0, 0, 14, -1, 7, wall);
  // the back wall, with the vent in it at the end of the high shelf
  const V = VENT;
  add(0, V.x0, 0, 14, ROOM_D, 7, { ...wall, look: "back" });
  add(V.x1, 30, 0, 14, ROOM_D, 7, { ...wall, look: "back" });
  add(V.x0, V.x1, 0, V.y0, ROOM_D, 7, { ...wall, look: "back" });
  add(V.x0, V.x1, V.y1, 14, ROOM_D, 7, { ...wall, look: "back" });
  add(-2, 34, 0, 14, -1, 0, { grab: false, look: "none" });
  add(30, 31, 0, 14, -1, 7, wall);
  // the duct behind it: a floor, a roof and two sides, going back into the dark
  add(V.x0, V.x1, V.y0 - 0.4, V.y0, 7, 10, { ...wall, look: "duct" });
  add(V.x0, V.x1, V.y1, V.y1 + 0.3, 7, 10, { ...wall, look: "duct" });
  add(V.x0 - 0.3, V.x0, V.y0, V.y1, 7, 10, { ...wall, look: "duct" });
  add(V.x1, V.x1 + 0.3, V.y0, V.y1, 7, 10, { ...wall, look: "duct" });

  // a stack of books by the cot: the way over it
  add(2.6, 3.7, 0, 0.9, 3.9, 5.3, { look: "books", mat: "book" });
  // the cot: legs at the corners, the frame and a heap of mattresses on top
  for (const [x, z] of [[4.5, 0.05], [9.8, 0.05], [4.5, 5.75], [9.8, 5.75]]) add(x, x + 0.2, 0, 0.9, z, z + 0.2, { look: "leg", grab: false });
  add(4.5, 10, 0.9, 2.8, 0, ROOM_D, { look: "cot", mat: "cloth" });

  // a threadbare rug: soft underfoot
  add(9.6, 16.4, 0, 0.02, 0.5, 5.5, { look: "rug", mat: "cloth", grab: false });
  // the table, and its chair beside it
  for (const [x, z] of [[11, 1.0], [15.2, 1.0], [11, 4.7], [15.2, 4.7]]) add(x, x + 0.3, 0, 2.8, z, z + 0.3, { look: "leg", grab: false });
  add(10.9, 15.6, 2.8, 3.05, 0.9, 5.1, { look: "table" });
  for (const [x, z] of [[15.9, 1.4], [17.3, 1.4], [15.9, 3.0], [17.3, 3.0]]) add(x, x + 0.18, 0, 1.5, z, z + 0.18, { look: "leg", grab: false });
  add(15.85, 17.55, 1.5, 1.75, 1.35, 3.25, { look: "seat" });
  add(15.85, 17.55, 1.75, 3.6, 3.05, 3.25, { look: "chairback" });

  // the toy block — dragged with GRAB held
  add(18.4, 19.6, 0, 1.1, 1.4, 2.6, { look: "block", movable: true });

  // the chest of drawers, two of them pulled out: the steps up
  add(20, 25, 0, 5.2, 4.2, ROOM_D, { look: "chest" });
  add(20.5, 24.5, 2.0, 2.6, 2.6, 4.2, { look: "drawer", mat: "cloth" });
  add(20.5, 24.5, 3.4, 4.0, 3.4, 4.2, { look: "drawer", mat: "cloth" });

  // the high shelf, and the vent at the end of it
  add(26.2, 30, 5.6, 6.0, 4.6, ROOM_D, { look: "shelf" });

  // a music box on the table: GRAB winds it, and it plays until it runs down
  const box = { x: 13.7, y: 3.05, z: 3.9 };
  const items = [
    { kind: "spool", x: 2.1, y: 0, z: 3.5 },
    { kind: "can", x: 12.4, y: 3.05, z: 2.4 },
  ];
  return {
    name: "nursery", make: buildNursery, solids, items, box, leak: LEAK, vent: VENT, win: NURSERY_WIN, holes: [NURSERY_WIN, VENT],
    spawn: { x: 1.4, y: 0, z: 2.6 }, exit: { x0: VENT.x0, x1: VENT.x1, y: VENT.y0, z: ROOM_D + 0.45 }, w: ROOM_W, d: ROOM_D,
  };
}
export const buildRoom = buildNursery;

// The Hall: a long dark corridor, where something lives. You drop out of a
// duct at the left end. A carpet runner down the middle is quiet underfoot;
// the bare boards either side aren't, and tin trays left on the floor are
// loud. A bench and a side table to get under, a stack of suitcases, a coat
// stand hung with long coats, a grandfather clock. Halfway along, a tall
// doorway into the dark — its room. At the far end, a door with a gap
// under it, just big enough to crawl through.
export const HALL_W = 44;
export const HALL_DOOR = { x0: 20, x1: 23.4, y0: 0, y1: 8.5 };     // the Keeper's doorway: dark behind
export const HALL_EXIT = { x0: 39.6, x1: 41.8, y0: 0, y1: 0.72 };   // the gap under the far door: crouch
export const HALL_DUCT = { x0: 1.0, x1: 2.4, y0: 1.6, y1: 2.35 };  // where you come in, up on the wall: a drop, not a fall
export function buildHall() {
  const solids = [];
  const add = (x0, x1, y0, y1, z0, z1, o = {}) => {
    const s = { x0, x1, y0, y1, z0, z1, mat: "wood", grab: true, look: "wood", ...o, id: solids.length };
    solids.push(s);
    return s;
  };
  const wall = { grab: false, look: "wall", mat: "wood" }, back = { ...wall, look: "back" }, D = ROOM_D, W = HALL_W;
  add(-4, W + 6, -1, 0, -4, 12, { grab: false, look: "floor" });
  add(-2, 0, 0, 14, -1, 10, wall);
  add(W, W + 1, 0, 14, -1, 10, wall);
  add(-2, W + 4, 0, 14, -1, 0, { grab: false, look: "none" });
  // the back wall, round three holes: the duct you came from, the doorway, the gap under the door
  const holes = [HALL_DUCT, HALL_DOOR, HALL_EXIT];
  const xs = [0, W, ...holes.flatMap((h) => [h.x0, h.x1])].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], h = holes.find((o) => (x0 + x1) / 2 > o.x0 && (x0 + x1) / 2 < o.x1);
    if (!h) { add(x0, x1, 0, 14, D, D + 1, back); continue; }
    if (h.y0 > 0) add(x0, x1, 0, h.y0, D, D + 1, back);
    add(x0, x1, h.y1, 14, D, D + 1, back);
  }
  // behind the doorway, the Keeper's room: dark, a few metres deep
  const K = HALL_DOOR;
  add(K.x0 - 3, K.x1 + 3, 0, 14, D + 4, D + 5, { ...wall, look: "dark" });
  add(K.x0 - 3, K.x0, 0, 14, D + 1, D + 4, { ...wall, look: "dark" });
  add(K.x1, K.x1 + 3, 0, 14, D + 1, D + 4, { ...wall, look: "dark" });
  // behind the gap under the far door: a passage on into the dark
  const E = HALL_EXIT;
  add(E.x0, E.x1, E.y1, 3, D + 1, D + 4, { ...wall, look: "dark" });
  add(E.x0 - 0.3, E.x0, 0, 3, D + 1, D + 4, { ...wall, look: "dark" });
  add(E.x1, E.x1 + 0.3, 0, 3, D + 1, D + 4, { ...wall, look: "dark" });
  // the duct you drop out of: a short tube into the wall
  const U = HALL_DUCT;
  add(U.x0, U.x1, U.y0 - 0.3, U.y0, D + 1, D + 3, { ...wall, look: "duct" });
  add(U.x0, U.x1, U.y1, U.y1 + 0.3, D + 1, D + 3, { ...wall, look: "duct" });

  // the runner down the middle: quiet underfoot
  add(5, 37.5, 0, 0.02, 1.5, 3.5, { look: "runner", mat: "cloth", grab: false });
  // tin trays left on the boards: loud
  add(15.2, 16.5, 0, 0.03, 3.8, 4.8, { look: "tray", mat: "tin", grab: false });
  add(31.0, 32.3, 0, 0.03, 0.7, 1.6, { look: "tray", mat: "tin", grab: false });
  // the bench: high enough to walk under
  for (const [x, z] of [[8.6, 3.95], [12.2, 3.95], [8.6, 5.5], [12.2, 5.5]]) add(x, x + 0.2, 0, 1.15, z, z + 0.2, { look: "leg", grab: false });
  add(8.5, 12.5, 1.15, 1.4, 3.9, 5.8, { look: "bench" });
  // a stack of suitcases
  add(16.8, 18.8, 0, 0.9, 4.4, 5.9, { look: "case", mat: "cloth" });
  add(17.0, 18.4, 0.9, 1.6, 4.6, 5.8, { look: "case2", mat: "cloth" });
  // the side table by the coat stand: under it, out of reach
  for (const [x, z] of [[25.6, 4.4], [27.7, 4.4], [25.6, 5.6], [27.7, 5.6]]) add(x, x + 0.18, 0, 2.5, z, z + 0.18, { look: "leg", grab: false });
  add(25.5, 28.0, 2.5, 2.65, 4.3, 5.9, { look: "sidetable" });
  // the coat stand: a pole, long coats round it to the floor (hide among them: `hides`)
  add(31.15, 31.45, 0, 7.6, 5.0, 5.3, { look: "pole", grab: false });
  // the grandfather clock, and an umbrella stand
  add(34.4, 36.0, 0, 7.2, 5.1, 6.0, { look: "gclock", grab: false });
  add(37.0, 37.8, 0, 1.6, 5.2, 5.9, { look: "ustand", mat: "tin" });

  const items = [
    { kind: "can", x: 6.6, y: 0, z: 4.9 },
    { kind: "cup", x: 26.6, y: 2.65, z: 5.0 },
  ];
  return {
    name: "hall", make: buildHall, solids, items, holes, w: W, d: D, hemi: [0x3a3040, 0x140c08],
    // the Keeper's round: [x, z, pause]: the far end, into its room for a
    // while, the near end, its room again
    keeper: { route: [[37, 4.5, 3], [21.7, 4.6, 0], [21.7, 8.0, 5], [21.7, 4.6, 0], [6, 4.5, 3], [21.7, 4.6, 0], [21.7, 8.0, 4], [21.7, 4.6, 0]] },
    hides: [{ x0: 30.2, x1: 32.4, z0: 4.4, z1: 5.95 }],
    duct: HALL_DUCT, door: HALL_DOOR, exitDoor: HALL_EXIT,
    // you come out of the duct high on the wall and drop to the boards
    spawn: { x: 1.7, y: 1.6, z: 5.4, air: true },
    exit: { x0: E.x0, x1: E.x1, y: 0, z: D + 0.45 },
  };
}

// Chapter 1, The Clockworks, in order. Rooms past the Hall (hollowChapter.mjs)
// bring their own rules: `init(S)` sets up the room's state (S.rs), `tick(S,
// dt, emit)` runs it every frame (a lift, the Cuckoo, a chase), `use(S, emit)`
// answers GRAB (a crank, a lever), `hint(S)` a line for the screen. A room
// whose boxes move (`kin` on a box) is rebuilt fresh when you're caught.
export const ROOMS = [buildNursery, buildHall, buildWorkshop, buildGallery, buildStairwell, buildTower];
export const ROOM_NAMES = ["nursery", "hall", "workshop", "gallery", "stairwell", "tower"];

// ── a run ──
// newRun() starts the chapter at its first room; newRun(room) plays that one
// room alone (the checks do this).
// newRun(undefined, { startAt: i }) begins at the i-th room (Continue).
//
// Together (opts.coop, opts.me = this player's id): each phone runs its own
// run; hollowNet.mjs carries what's needed between them. S.friends are the
// others as their phones last said; S.host is the one phone that runs the
// Keeper and the rooms' machinery; S.inbox the friends' sounds for it to
// hear. A friend crouching is something to climb on (a boost). An exit holds
// you (S.out) until everyone still here is through, then the next room
// starts for all at once.
export function newRun(room, opts = {}) {
  const at = room ? -1 : Math.max(0, Math.min(ROOMS.length - 1, opts.startAt | 0));
  const S = { roomI: at, T: 0, roomT: 0, done: false, doneT: 0, events: [], seen: {}, box: { wound: 1 },
    coop: !!opts.coop, me: opts.me || "me", host: opts.coop ? !!opts.host : true, friends: [], inbox: [], out: false,
    keeperOn: opts.keeper == null ? KEEPER_DEFAULT : opts.keeper, caught: null, K: null, deaths: 0, rs: null,
    // for rooms' own rules (hollowChapter.mjs), without importing back
    coveredFn: covered, newKeeper };
  S.roomOpts = { coop: S.coop };
  enterRoom(S, room || ROOMS[at](S.roomOpts));
  return S;
}

// put the kid at the start of a room, with its things where they began
function enterRoom(S, room) {
  const sp = room.spawn;
  S.room = room; S.roomT = 0; S.caught = null; S.out = false;
  // the Keeper is run by one phone (the host); the others are told where it is
  S.K = room.keeper && S.keeperOn && !room.keeper.later && S.host ? newKeeper(room.keeper) : null;
  S.rs = room.init ? room.init(S) : null;
  S.items = room.items.map((it) => ({ ...it, r: 0.12, vx: 0, vy: 0, vz: 0, held: false, rest: true }));
  // the music box starts wound, and runs down over BOX_RUN seconds
  if (room.box) S.box = { wound: 1 };
  S.P = {
    x: sp.x, y: sp.y, z: sp.z, vx: 0, vy: 0, vz: 0, face: 0, st: sp.air ? "air" : "ground", stT: 0,
    crouch: false, coyote: 0, jumpBuf: 0, airT: 0, fallTop: sp.y, noGrab: 0.3,
    stride: 0, speed: 0, mat: "wood", teeter: false,
    landV: 0, landT: 9, jumpT: 9,
    ledge: null, climb: null, drag: null, dragV: 0, stun: null, hold: -1, act: null,
  };
}

export const BOX_RUN = 75;
const ev = (S, n, o) => S.events.push({ n, x: S.P.x, y: S.P.y, z: S.P.z, ...o });
const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const hOf = (P) => (P.crouch ? HC : H);

function overlapBox(x0, x1, y0, y1, z0, z1, s) {
  return x0 < s.x1 - EPS && x1 > s.x0 + EPS && y0 < s.y1 - EPS && y1 > s.y0 + EPS && z0 < s.z1 - EPS && z1 > s.z0 + EPS;
}
const overlapP = (x, y, z, h, s) => overlapBox(x - R, x + R, y, y + h, z - R, z + R, s);
export function fits(S, x, y, z, h, skip) {
  for (const s of S.room.solids) if (s !== skip && overlapP(x, y, z, h, s)) return false;
  return true;
}

// the boxes under the kid's feet; and whether the middle of the feet is on one
function support(S, P, skip) {
  let best = null, centred = false;
  for (const s of S.room.solids) {
    if (s === skip || Math.abs(s.y1 - P.y) > 0.03) continue;
    // the same overlap that lands you, or an edge would flicker between standing and falling
    if (P.x - R >= s.x1 - EPS || P.x + R <= s.x0 + EPS || P.z - R >= s.z1 - EPS || P.z + R <= s.z0 + EPS) continue;
    best = best || s;
    if (P.x > s.x0 && P.x < s.x1 && P.z > s.z0 && P.z < s.z1) { centred = true; best = s; }
  }
  return best && { s: best, centred };
}

// one horizontal axis, in short steps; returns the box it ran into
function moveAxis(S, P, ax, d, skip) {
  let hit = null;
  const n = Math.ceil(Math.abs(d) / SUB) || 1, dd = d / n, h = hOf(P);
  for (let k = 0; k < n; k++) {
    P[ax] += dd;
    for (const s of S.room.solids) {
      if (s === skip || !overlapP(P.x, P.y, P.z, h, s)) continue;
      // a low edge on the ground is stepped up onto
      if (P.st !== "air" && s.y1 > P.y && s.y1 - P.y <= STEP && fits(S, P.x, s.y1, P.z, h, skip)) { P.y = s.y1; continue; }
      if (ax === "x") P.x = dd > 0 ? s.x0 - R - EPS : s.x1 + R + EPS;
      else P.z = dd > 0 ? s.z0 - R - EPS : s.z1 + R + EPS;
      hit = s;
    }
    if (hit) break;
  }
  return hit;
}

function moveY(S, P, d) {
  let land = null, bonk = null;
  const n = Math.ceil(Math.abs(d) / SUB) || 1, dd = d / n, h = hOf(P);
  for (let k = 0; k < n && !land && !bonk; k++) {
    P.y += dd;
    for (const s of S.room.solids) {
      if (!overlapP(P.x, P.y, P.z, h, s)) continue;
      if (dd < 0) { P.y = s.y1; land = s; } else { P.y = s.y0 - h - EPS; bonk = s; }
    }
  }
  return { land, bonk };
}

// a box being dragged: one axis, against everything but itself and the kid
function moveBox(S, b, ax, d) {
  const lo = ax + "0", hi = ax + "1";
  const n = Math.ceil(Math.abs(d) / SUB) || 1, dd = d / n;
  let moved = 0;
  for (let k = 0; k < n; k++) {
    b[lo] += dd; b[hi] += dd;
    let blocked = false;
    for (const s of S.room.solids) {
      if (s === b || !overlapBox(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, s)) continue;
      const back = dd > 0 ? s[lo] - b[hi] - EPS : s[hi] - b[lo] + EPS;
      b[lo] += back; b[hi] += back; moved += back;
      blocked = true;
    }
    moved += dd;
    if (blocked) break;
  }
  return moved;
}

// Turn toward an angle, the short way round.
function turnTo(P, a, rate) {
  let d = a - P.face;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  P.face += cl(d, -rate, rate);
}

// The four sides of a box, as ledges the kid could be pushing into.
// n is the side's outward normal; the kid is on that side.
function sides(s) {
  return [
    { nx: -1, nz: 0, at: s.x0 }, { nx: 1, nz: 0, at: s.x1 },
    { nx: 0, nz: -1, at: s.z0 }, { nx: 0, nz: 1, at: s.z1 },
  ];
}

// Is there a ledge to catch? Hands above its top, feet well under it,
// against its side and pushing into it.
export function findLedge(S, P, mx, mz) {
  if (P.noGrab > 0 || P.vy > 3.5) return null;
  const hands = P.y + REACH;
  for (const s of S.room.solids) {
    if (!s.grab) continue;
    const top = s.y1;
    if (hands < top - 0.05 || P.y > top - 0.25) continue;
    for (const f of sides(s)) {
      if (mx * -f.nx + mz * -f.nz < 0.35) continue;
      let touching, along;
      if (f.nx) { touching = Math.abs(P.x + f.nx * -R - f.at) < 0.1; along = P.z > s.z0 + 0.05 && P.z < s.z1 - 0.05; }
      else { touching = Math.abs(P.z + f.nz * -R - f.at) < 0.1; along = P.x > s.x0 + 0.05 && P.x < s.x1 - 0.05; }
      if (!touching || !along) continue;
      // where you'd end up on top: just past the edge (or the middle of a thin top)
      let tx = P.x, tz = P.z;
      if (f.nx) tx = f.nx < 0 ? Math.min(s.x0 + R + 0.1, (s.x0 + s.x1) / 2) : Math.max(s.x1 - R - 0.1, (s.x0 + s.x1) / 2);
      else tz = f.nz < 0 ? Math.min(s.z0 + R + 0.1, (s.z0 + s.z1) / 2) : Math.max(s.z1 - R - 0.1, (s.z0 + s.z1) / 2);
      let crouch = false;
      if (!fits(S, tx, top, tz, H)) { if (fits(S, tx, top, tz, HC)) crouch = true; else continue; }
      const ex = f.nx ? f.at + f.nx * (R + 0.02) : P.x, ez = f.nz ? f.at + f.nz * (R + 0.02) : P.z;
      return { s, nx: f.nx, nz: f.nz, top, tx, tz, ex, ez, crouch };
    }
  }
  return null;
}

// the box beside the kid, in front, that GRAB would take hold of
function boxAhead(S, P) {
  const fx = Math.cos(P.face), fz = Math.sin(P.face);
  for (const s of S.room.solids) {
    if (!s.movable) continue;
    if (P.y >= s.y1 - 0.05 || P.y + H <= s.y0) continue;
    for (const f of sides(s)) {
      if (fx * -f.nx + fz * -f.nz < 0.55) continue;
      if (f.nx) { if (Math.abs(P.x + f.nx * -R - f.at) > 0.12 || P.z < s.z0 - 0.05 || P.z > s.z1 + 0.05) continue; }
      else if (Math.abs(P.z + f.nz * -R - f.at) > 0.12 || P.x < s.x0 - 0.05 || P.x > s.x1 + 0.05) continue;
      return { b: s, nx: f.nx, nz: f.nz };
    }
  }
  return null;
}

function itemNear(S, P) {
  let best = -1, bd = R + 0.45;
  S.items.forEach((it, i) => {
    if (it.held || Math.abs(it.y - P.y) > 0.6) return;
    const d = Math.hypot(it.x - P.x, it.z - P.z);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function nearBox(S, P) {
  const b = S.room.box;
  if (!b) return false;
  return b && Math.abs(b.y - P.y) < 0.5 && Math.hypot(b.x - P.x, b.z - P.z) < R + 0.55;
}

// Something over the kid's head (the cot, a table, a bench): the camera drops
// to look in under it, and sound is muffled.
// out of the Keeper's reach (under something, among the coats, up high)
export const hidden = (S) => hiddenFrom(S, covered);

export function covered(S) {
  const P = S.P;
  return S.room.solids.some((s) => s.look !== "none" && s.y0 > P.y + 0.3 && s.y0 < P.y + 2.85 && P.x > s.x0 && P.x < s.x1 && P.z > s.z0 && P.z < s.z1);
}

function dropHeld(S, P) {
  if (P.hold < 0) return;
  const it = S.items[P.hold];
  it.held = false; it.rest = false; it.vx = P.vx * 0.5; it.vz = P.vz * 0.5; it.vy = 0.5;
  P.hold = -1;
}

function setSt(P, st) { P.st = st; P.stT = 0; }

// where the held thing sits: above the head, in both hands
export function handsAt(P) {
  return { x: P.x + Math.cos(P.face) * 0.04, y: P.y + (P.crouch ? 0.72 : 1.1), z: P.z + Math.sin(P.face) * 0.04 };
}

// ── a frame ──
// I: { mx, mz (the stick, -1..1; mz is into the room), jump (pressed this
// frame), grab (held), grabP (pressed this frame), crouch (held), walk (held) }
export function step(S, I, dt) {
  const P = S.P;
  S.T += dt; P.stT += dt; P.landT += dt; P.jumpT += dt;
  P.noGrab = Math.max(0, P.noGrab - dt);
  P.jumpBuf = I.jump ? BUFFER : Math.max(0, P.jumpBuf - dt);
  if (P.act) { P.act.t += dt; if (P.act.t > P.act.dur) P.act = null; }

  let mx = I.mx || 0, mz = I.mz || 0;
  const m = Math.min(1, Math.hypot(mx, mz));
  if (m > 0.08) { const l = Math.hypot(mx, mz); mx /= l; mz /= l; } else { mx = mz = 0; }

  S.roomT += dt;
  S.box.wound = Math.max(0, S.box.wound - dt / BOX_RUN);
  const heardFrom = S.events.length;      // what's pushed from here on is this frame's sounds
  // caught: held still a moment, then back to the start of this room
  if (S.caught) {
    S.caught.t += dt; P.st = "caught"; P.vx = P.vz = P.vy = 0; P.speed = 0;
    if (S.caught.t > CAUGHT_T) {
      // the same room again (a fresh one only if something in it was moved)
      S.deaths++; enterRoom(S, S.room.solids.some((s) => s.movable || (s.kin && !s.friend)) ? S.room.make(S.roomOpts) : S.room); ev(S, "respawn");
    }
    return;
  }
  if (S.done) { S.doneT += dt; P.vx = P.vz = 0; stepItems(S, dt); return; }
  // through the exit, together: wait beyond it until everyone still here is through
  if (S.out) {
    P.vx = P.vz = 0; P.speed = 0;
    if (everyoneOut(S)) advance(S);
    return;
  }

  // GRAB pressed: throw what you hold, or pick up what's at your feet
  if (I.grabP && (P.st === "ground")) {
    if (P.hold >= 0) {
      const it = S.items[P.hold], hp = handsAt(P), fx = Math.cos(P.face), fz = Math.sin(P.face);
      Object.assign(it, { held: false, rest: false, x: hp.x + fx * 0.15, y: hp.y, z: hp.z + fz * 0.15, vx: fx * 6 + P.vx * 0.4, vy: 4.4, vz: fz * 6 + P.vz * 0.4 });
      P.hold = -1; P.act = { k: "throw", t: 0, dur: 0.38 };
      ev(S, "throw", { x: P.x });
    } else if (!P.act && S.room.use && S.room.use(S, (n, o) => ev(S, n, o), P)) {
      // the room took it
    } else if (!P.act && nearBox(S, P)) {
      S.box.wound = 1; S.seen.box = true;
      P.act = { k: "wind", t: 0, dur: 0.7 };
      P.face = Math.atan2(S.room.box.z - P.z, S.room.box.x - P.x);
      const b = S.room.box;
      ev(S, "wind", { x: b.x, y: b.y, z: b.z });
    } else if (!P.act) {
      const i = itemNear(S, P);
      if (i >= 0) {
        P.hold = i; S.items[i].held = true; S.seen.carry = true;
        P.act = { k: "pick", t: 0, dur: 0.36 };
        turnTo(P, Math.atan2(S.items[i].z - P.z, S.items[i].x - P.x), 9);
        ev(S, "pick", { kind: S.items[i].kind, x: P.x });
      }
    }
  }

  // crouching: only stands up where there's room to
  const wantC = !!I.crouch && P.st !== "air" && P.st !== "hang" && P.st !== "climb";
  if (P.crouch && !wantC) { if (fits(S, P.x, P.y, P.z, H)) P.crouch = false; }
  else if (!P.crouch && wantC && P.hold < 0 && P.st === "ground") P.crouch = true;

  // the room's own clockwork, and friends to climb on: what moves, the kid moves with
  {
    const ride = P.st === "ground" ? (support(S, P) || {}).s : P.st === "hang" ? P.ledge && P.ledge.s : P.st === "climb" ? P.climb && P.climb.L.s : null;
    const was = ride && ride.kin ? { x: ride.x0, y: ride.y1, z: ride.z0 } : null;
    if (S.coop) friendBacks(S);
    if (S.room.tick && (S.host || S.room.everyone)) S.room.tick(S, dt, (n, o) => ev(S, n, o));
    else if (S.room.local) S.room.local(S, dt, (n, o) => ev(S, n, o));
    if (was) {
      const dx = ride.x0 - was.x, dy = ride.y1 - was.y, dz = ride.z0 - was.z;
      if (dx || dy || dz) {
        P.x += dx; P.y += dy; P.z += dz;
        const L = P.st === "hang" ? P.ledge : P.st === "climb" ? P.climb.L : null;
        if (L) { L.top += dy; L.ex += dx; L.tx += dx; L.ez += dz; L.tz += dz; }
        if (P.st === "climb") { P.climb.fx += dx; P.climb.fy += dy; P.climb.fz += dz; }
      }
    }
    if (S.caught) return;
  }

  switch (P.st) {
    case "ground": ground(S, P, I, mx, mz, m, dt); break;
    case "air": air(S, P, I, mx, mz, m, dt); break;
    case "hang": hang(S, P, I, mx, mz, dt); break;
    case "climb": climb(S, P, dt); break;
    case "drag": drag(S, P, I, mx, mz, m, dt); break;
    case "stun": stun(S, P, dt); break;
    default: break;
  }
  stepItems(S, dt);
  // the Keeper runs on one phone, hearing everyone
  if (S.K && S.host) { stepKeeper(S, dt, S.events.slice(heardFrom).concat(S.inbox), covered); S.inbox.length = 0; }
  if (S.caught) return;

  // the first time up on the chest: the room opens out below you
  if (!S.seen.high && S.room.name === "nursery" && P.st === "ground" && P.y > 5.1) { S.seen.high = true; ev(S, "discover"); }
  // through the way out: on to the next room, or the end of the chapter
  const ex = S.room.exit;
  if (P.z > ex.z && P.x > ex.x0 && P.x < ex.x1 && P.y > ex.y - 0.2 && P.y < ex.y + 1) {
    ev(S, "vent", { x: P.x });
    S.out = true; P.st = "out";
    if (everyoneOut(S)) advance(S); else ev(S, "waitFriend");
  }
}

// the friends still in the game, and whether they're all through this room's exit
const here = (S) => (S.friends || []).filter((f) => f.here);
// (a friend whose phone has already gone on to the next room is through too)
export function everyoneOut(S) { return here(S).every((f) => (f.out && f.outRoom === S.roomI) || f.roomI > S.roomI); }
function advance(S) {
  const next = S.roomI >= 0 && ROOMS[S.roomI + 1];
  if (next) { S.roomI++; enterRoom(S, next(S.roomOpts)); ev(S, "room", { name: S.room.name }); }
  else S.done = true;
}

// A friend crouching is a back to climb on: a low, small box where they are.
// (Standing, they're not solid: you pass through each other.)
function friendBacks(S) {
  const sol = S.room.solids;
  for (const f of here(S)) {
    let b = sol.find((o) => o.friend === f.id);
    const on = f.crouch && f.st === "ground" && !f.out && f.roomI === S.roomI;
    if (!on) { if (b) { b.y0 = -50; b.y1 = -49.9; } continue; }
    if (!b) { b = { friend: f.id, kin: true, grab: true, look: "none", mat: "cloth", id: sol.length }; sol.push(b); }
    Object.assign(b, { x0: f.x - 0.28, x1: f.x + 0.28, y0: f.y + 0.4, y1: f.y + HC, z0: f.z - 0.26, z1: f.z + 0.26 });
  }
}

function accel(P, tvx, tvz, a, dt) {
  const dx = tvx - P.vx, dz = tvz - P.vz, l = Math.hypot(dx, dz), mx = a * dt;
  if (l <= mx) { P.vx = tvx; P.vz = tvz; } else { P.vx += dx / l * mx; P.vz += dz / l * mx; }
}

function stride(S, P, v, dt, len) {
  const before = Math.floor(P.stride);
  P.stride += v * dt / len;
  if (Math.floor(P.stride) !== before) ev(S, "step", { mat: P.mat, v, crouch: P.crouch, drag: P.st === "drag", x: P.x });
}

function ground(S, P, I, mx, mz, m, dt) {
  // GRAB held against the block: take hold of it
  if (I.grab && P.hold < 0 && !P.crouch && !P.act) {
    const b = boxAhead(S, P);
    if (b) { P.drag = b; P.dragV = 0; P.vx = P.vz = 0; setSt(P, "drag"); S.seen.drag = true; ev(S, "dragOn", { x: P.x }); return; }
  }
  const sp = (P.crouch ? CROUCH_SPEED : P.hold >= 0 ? CARRY_RUN : RUN) * (I.walk ? WALK_K : 1) * (P.act && P.act.k === "pick" ? 0.2 : 1);
  accel(P, mx * m * sp, mz * m * sp, ACC_G, dt);
  if (m > 0) turnTo(P, Math.atan2(mz, mx), TURN * dt);
  const speedIn = Math.hypot(P.vx, P.vz);
  const hx = moveAxis(S, P, "x", P.vx * dt), hz = moveAxis(S, P, "z", P.vz * dt);
  if (hx) P.vx = 0;
  if (hz) P.vz = 0;
  // running flat into a wall: bounce off it
  const hit = hx || hz;
  if (hit && speedIn > 2.8 && hit.y1 - P.y > 2.4 && hit.y0 <= P.y + 0.3 && !P.crouch) {
    const into = hx ? Math.abs(Math.cos(P.face)) : Math.abs(Math.sin(P.face));
    if (into > 0.85) {
      P.stun = { k: "bump", dur: 0.42 }; setSt(P, "stun");
      P.vx = -Math.cos(P.face) * 1.2; P.vz = -Math.sin(P.face) * 1.2;
      dropHeld(S, P);
      ev(S, "bump", { x: P.x });
      return;
    }
  }
  P.speed = Math.hypot(P.vx, P.vz);
  const sup = support(S, P);
  if (!sup) { setSt(P, "air"); P.coyote = COYOTE; P.airT = 0; P.fallTop = P.y; P.vy = 0; return; }
  const lk = S.room.leak;
  P.y = sup.s.y1; P.mat = lk && P.y < 0.05 && Math.hypot(P.x - lk.x, P.z - lk.z) < lk.r ? "water" : sup.s.mat;
  P.teeter = !sup.centred && P.speed < 0.3 && !P.crouch;
  if (P.speed > 0.15) stride(S, P, P.speed, dt, P.crouch ? 0.24 : P.speed > 2.2 ? 0.6 : 0.34);
  if (P.jumpBuf > 0 && !P.crouch && !P.act) jump(S, P);
}

function jump(S, P) {
  P.vy = JUMP; P.jumpBuf = 0; P.coyote = 0; P.jumpT = 0; P.airT = 0; P.fallTop = P.y; P.teeter = false;
  setSt(P, "air");
  ev(S, "jump", { x: P.x });
}

function air(S, P, I, mx, mz, m, dt) {
  P.airT += dt;
  if (P.coyote > 0) { P.coyote -= dt; if (P.jumpBuf > 0 && !P.crouch) { jump(S, P); return; } }
  P.vy = Math.max(P.vy - GRAV * dt, -22);
  const sp = P.hold >= 0 ? CARRY_RUN : RUN;
  accel(P, mx * m * sp, mz * m * sp, ACC_A, dt);
  if (m > 0) turnTo(P, Math.atan2(mz, mx), TURN * 0.6 * dt);
  if (moveAxis(S, P, "x", P.vx * dt)) P.vx = 0;
  if (moveAxis(S, P, "z", P.vz * dt)) P.vz = 0;
  const vyBefore = P.vy;
  const { land, bonk } = moveY(S, P, P.vy * dt);
  if (bonk) P.vy = Math.min(0, P.vy);
  P.fallTop = Math.max(P.fallTop, P.y);
  if (land) {
    const v = -vyBefore;
    P.vy = 0; P.mat = land.mat; P.landV = v; P.landT = 0;
    if (v > 1) ev(S, "land", { mat: land.mat, v, x: P.x });
    if (v > HARD) {
      dropHeld(S, P);
      P.stun = v > TUMBLE ? { k: "tumble", dur: 1.25 } : { k: "hard", dur: 0.6 };
      setSt(P, "stun");
      ev(S, v > TUMBLE ? "tumble" : "hardLand", { x: P.x });
    } else setSt(P, "ground");
    return;
  }
  // catching a ledge
  const L = findLedge(S, P, mx, mz);
  if (L) {
    dropHeld(S, P);
    P.vx = P.vz = P.vy = 0;
    P.face = Math.atan2(-L.nz, -L.nx);
    P.crouch = false;
    if (L.top - P.y <= 0.95) {
      P.climb = { L, k: "mantle", u: 0, dur: MANTLE_T, fx: P.x, fy: P.y, fz: P.z };
      setSt(P, "climb");
      ev(S, "mantle", { x: P.x });
    } else {
      P.ledge = L; P.x = L.ex; P.z = L.ez; P.y = L.top - HANG;
      setSt(P, "hang");
      ev(S, "grab", { x: P.x });
    }
  }
}

function hang(S, P, I, mx, mz, dt) {
  const L = P.ledge;
  const into = mx * -L.nx + mz * -L.nz;
  if (P.stT > 0.12 && (P.jumpBuf > 0 || into > 0.5)) {
    P.jumpBuf = 0;
    P.climb = { L, k: "climb", u: 0, dur: CLIMB_T, fx: P.x, fy: P.y, fz: P.z };
    setSt(P, "climb");
    ev(S, "climb", { x: P.x });
  } else if (P.stT > 0.12 && (into < -0.5 || I.crouch)) {
    P.ledge = null; P.noGrab = 0.4; P.vy = 0; P.airT = 0; P.fallTop = P.y;
    P.x += L.nx * 0.06; P.z += L.nz * 0.06;
    setSt(P, "air");
    ev(S, "letGo", { x: P.x });
  }
}

const ease = (k) => k * k * (3 - 2 * k);
function climb(S, P, dt) {
  const C = P.climb, L = C.L;
  C.u = Math.min(1, C.u + dt / C.dur);
  const a = 0.55;
  if (C.u < a) {
    const k = ease(C.u / a);
    P.y = C.fy + (L.top - 0.3 - C.fy) * k;
    P.x = C.fx + (L.ex - C.fx) * k; P.z = C.fz + (L.ez - C.fz) * k;
  } else {
    const k = ease((C.u - a) / (1 - a));
    P.y = L.top - 0.3 + 0.3 * k;
    P.x = L.ex + (L.tx - L.ex) * k; P.z = L.ez + (L.tz - L.ez) * k;
  }
  if (C.u >= 1) {
    P.x = L.tx; P.z = L.tz; P.y = L.top; P.crouch = L.crouch; P.mat = L.s.mat;
    P.climb = null; P.ledge = null;
    setSt(P, "ground");
    ev(S, "up", { mat: L.s.mat, x: P.x });
  }
}

function drag(S, P, I, mx, mz, m, dt) {
  const D = P.drag, b = D.b;
  if (!I.grab || P.jumpBuf > 0) { P.drag = null; P.dragV = 0; P.jumpBuf = 0; setSt(P, "ground"); ev(S, "dragOff", { x: P.x }); return; }
  P.face = Math.atan2(-D.nz, -D.nx);
  // + pushes the box away, − pulls it along; it takes a moment to get going
  const a = -(mx * D.nx + mz * D.nz) * m;
  const want = Math.abs(a) > 0.3 ? Math.sign(a) * DRAG_SPEED * (a < 0 ? 0.8 : 1) : 0;
  P.dragV += cl(want - P.dragV, -2.6 * dt, 2.6 * dt);
  const ax = D.nx ? "x" : "z", sgn = D.nx ? -D.nx : -D.nz;    // the push direction along that axis
  let d = P.dragV * dt * sgn, done = 0;
  if (P.dragV > 0) {
    done = moveBox(S, b, ax, d);
    moveAxis(S, P, ax, done, b);
  } else if (P.dragV < 0) {
    const before = P[ax];
    moveAxis(S, P, ax, d, b);
    done = P[ax] - before;
    const got = moveBox(S, b, ax, done);
    if (Math.abs(got - done) > 1e-4) P[ax] -= done - got;       // the box stuck: stay with it
    done = got;
  }
  const v = Math.abs(done) / dt;
  if (v < 0.05) P.dragV *= 0.5;
  P.speed = v; P.vx = P.vz = 0;
  P.pushing = P.dragV >= 0;
  if (v > 0.1) stride(S, P, v, dt, 0.22);
  const sup = support(S, P, null);
  if (!sup) { P.drag = null; setSt(P, "air"); P.airT = 0; P.fallTop = P.y; }
}

function stun(S, P, dt) {
  const k = Math.pow(0.02, dt);
  P.vx *= k; P.vz *= k;
  moveAxis(S, P, "x", P.vx * dt); moveAxis(S, P, "z", P.vz * dt);
  P.speed = 0;
  if (P.stT >= P.stun.dur) { P.stun = null; setSt(P, "ground"); }
}

// thrown and dropped things: bounce, clatter, come to rest
function stepItems(S, dt) {
  const P = S.P;
  for (const it of S.items) {
    if (it.held) { const h = handsAt(P); it.x = h.x; it.y = h.y; it.z = h.z; continue; }
    if (it.rest) continue;
    it.vy -= GRAV * dt;
    const r = it.r, n = Math.ceil(Math.max(Math.abs(it.vx), Math.abs(it.vy), Math.abs(it.vz)) * dt / 0.08) || 1, h = dt / n;
    for (let k = 0; k < n; k++) {
      for (const ax of ["x", "z", "y"]) {
        const v = "v" + ax;
        // push out against the way it was moving before this step's hits: with
        // two boxes stacked (a rug on the floor) the bounce off the first must
        // not turn the second into a push the other way, under the floor
        const v0 = it[v];
        it[ax] += v0 * h;
        let hitS = null;
        for (const s of S.room.solids) {
          if (!overlapBox(it.x - r, it.x + r, it.y, it.y + 2 * r, it.z - r, it.z + r, s)) continue;
          if (ax === "y") it.y = v0 < 0 ? s.y1 : s.y0 - 2 * r - EPS;
          else it[ax] = v0 > 0 ? s[ax + "0"] - r - EPS : s[ax + "1"] + r + EPS;
          hitS = s;
        }
        if (hitS) {
          const hitV = Math.abs(v0);
          if (ax === "y") it.vy = hitV > 1.6 ? -v0 * 0.32 : 0;
          else it[v] = -v0 * 0.35;
          if (hitV > 1.8) ev(S, "clank", { kind: it.kind, mat: hitS.mat, v: hitV, x: it.x, y: it.y, z: it.z });
        }
      }
    }
    // rolling to a stop on whatever it's lying on
    const onSomething = S.room.solids.some((s) => Math.abs(s.y1 - it.y) < 0.01 && it.x > s.x0 && it.x < s.x1 && it.z > s.z0 && it.z < s.z1);
    if (onSomething && it.vy === 0) {
      const f = Math.pow(0.06, dt);
      it.vx *= f; it.vz *= f;
      if (Math.hypot(it.vx, it.vz) < 0.05) { it.vx = it.vz = 0; it.rest = true; }
    }
    if (it.y < -2) { const o = S.room.items[S.items.indexOf(it)]; Object.assign(it, { x: o.x, y: o.y, z: o.z, vx: 0, vy: 0, vz: 0, rest: true }); }
  }
}

// A line for the bottom of the screen: what can be done here, first time only.
export function hint(S) {
  const P = S.P;
  if (S.done) return "";
  if (P.st === "hang") return "Push toward it or jump to climb up · away to let go";
  if (P.st === "drag") return P.speed > 0.1 ? "" : "Push or pull with the stick";
  const b = S.room.solids.find((s) => s.movable);
  if (b && !S.seen.drag && P.y < 0.1 && Math.abs(P.x - (b.x0 + b.x1) / 2) < 1.6 && Math.abs(P.z - (b.z0 + b.z1) / 2) < 1.6) return "Face the block and hold GRAB to drag it";
  if (!S.seen.box && P.hold < 0 && nearBox(S, P)) return "GRAB winds the music box";
  if (!S.seen.carry && P.hold < 0 && itemNear(S, P) >= 0) return "GRAB picks it up · GRAB again throws";
  if (S.room.hint) { const h = S.room.hint(S); if (h != null) return h; }
  if (S.room.name === "nursery") {
    if (P.y > 5.8 && P.x > 27.4 && !P.crouch) return "Crouch to crawl into the vent";
    if (P.x > 3.2 && P.x < 4.5 && P.y < 0.1 && !P.crouch) return "Crouch to crawl under the cot";
  }
  if (S.room.name === "hall") {
    if (S.K && S.K.st === "chase") return "Hide!";
    if (S.roomT < 7) return "It can't see you. It hears you. Tread softly, and keep to the carpet";
    const E = S.room.exitDoor;
    if (P.x > E.x0 - 1.5 && P.x < E.x1 + 0.5 && P.z > 4.6 && P.y < 0.1 && !P.crouch) return "Crouch to crawl under the door";
  }
  return "";
}
