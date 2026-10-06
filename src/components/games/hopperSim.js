// src/components/games/hopperSim.js
// Road Hopper's rules — a hop-across-the-road game in the spirit of Crossy
// Road. No React, no canvas: scripts/check-hopper.mjs plays it.
//
// Rows go up the screen, one at a time, made from the room's seed so
// everyone hops the same course: grass (trees in the way, a coin now and
// then), roads (cars, each lane its own way and pace), rivers (logs to ride:
// the water is deadly) and railway lines (a light flashes, then a train).
// It gets busier and faster the further you go.
//
// Hop forward, back, left or right — one square a hop. Points for every new
// row reached and every coin. Hit, drowned or carried off the edge, or
// fallen too far behind (the eagle): not the end of the match — the room's
// clock decides that — you're put back a few rows, onto grass, and
// stand dazed a moment. Your best row never goes down.
import { seededRand } from "./seededRand.js";

export const COLS = 9;
export const HOP_S = 0.13;              // a hop takes this long
export const ROW_PTS = 10;
export const COIN_PTS = 25;
export const DAZE_S = 1.1;
export const BACK_ROWS = 4;              // put back this many rows after a crash
export const EAGLE_ROWS = 3.2;           // this far behind the camera and the eagle takes you
export const CAM_SPEED = 0.22;           // rows a second the camera creeps on, once you've moved
export const CAR_HIT = 0.12;             // a car hits you once your middle is this far inside it
export const TRAIN_WARN = 1.2;           // seconds of flashing before a train

// ── the course ───────────────────────────────────────────────────────────────
// row: { kind: "grass" | "road" | "river" | "rail", trees: Set(cols), coin: col | -1,
//        dir, speed (squares/s), things: [{ x, len }] (at t = 0; they wrap),
//        period, offset (rail: a train every `period` s, first at `offset`) }
export function newCourse(seed) {
  return { rand: seededRand((Number(seed) || 1) * 7907 + 13), rows: [], lastKind: "grass", run: 0 };
}

function makeRow(c, n) {
  const r = c.rand;
  const hard = Math.min(1, n / 160);                  // how far in: 0 at the start, 1 by row 160
  if (n < 4) return grass(r, n, 0);
  // what comes next: never more than three rivers or four roads running
  let kind;
  const roll = r();
  if (roll < 0.3) kind = "grass";
  else if (roll < 0.66) kind = "road";
  else if (roll < 0.88) kind = "river";
  else kind = n > 12 ? "rail" : "road";
  if (kind === c.lastKind && kind !== "grass") c.run++; else c.run = 0;
  if ((kind === "river" && c.run >= 3) || (kind === "road" && c.run >= 4) || (kind === "rail" && c.run >= 1)) { kind = "grass"; c.run = 0; }
  c.lastKind = kind;
  if (kind === "grass") return grass(r, n, hard);
  if (kind === "road") {
    const dir = r() < 0.5 ? -1 : 1, speed = 1.3 + r() * 1.4 + hard * 2.2;
    const things = [];
    let x = r() * 3;
    while (x < COLS + 4) {
      const len = r() < 0.25 + hard * 0.2 ? 2 : 1;        // cars and the odd lorry
      things.push({ x, len });
      x += len + 2.2 + r() * (4 - hard * 1.6);
    }
    return { kind, dir, speed, things, wrap: x, trees: new Set(), coin: -1 };
  }
  if (kind === "river") {
    const dir = r() < 0.5 ? -1 : 1, speed = 0.8 + r() * 0.9 + hard * 1.1;
    const things = [];
    let x = r() * 1.5;
    while (x < COLS + 4) {
      const len = 2 + Math.floor(r() * (3.4 - hard * 1.2));    // logs get shorter
      things.push({ x, len });
      x += len + 1.2 + r() * (1.8 + hard * 0.8);
    }
    return { kind, dir, speed, things, wrap: x, trees: new Set(), coin: -1 };
  }
  // rail: a train every so often, a light flashing first
  return { kind: "rail", dir: r() < 0.5 ? -1 : 1, speed: 22, period: 5 + r() * 4 - hard * 1.5, offset: 1.5 + r() * 4, trees: new Set(), coin: -1, things: [] };
}

function grass(r, n, hard) {
  const trees = new Set();
  if (n === 0) for (const x of [0, 1, 7, 8]) trees.add(x);            // the start: walled at the sides
  else if (n > 0) {
    const want = Math.floor(r() * (2 + hard * 2.5));
    for (let i = 0; i < want; i++) trees.add(Math.floor(r() * COLS));
    trees.delete(Math.floor(r() * COLS));                              // never a full row
  }
  let coin = -1;
  if (n > 3 && r() < 0.18) { coin = Math.floor(r() * COLS); trees.delete(coin); }
  return { kind: "grass", trees, coin, things: [], dir: 0, speed: 0 };
}

export function rowAt(c, n) {
  if (n < 0) return { kind: "grass", trees: new Set([...Array(COLS).keys()]), coin: -1, things: [] };   // behind the start: a hedge
  while (c.rows.length <= n) c.rows.push(makeRow(c, c.rows.length));
  return c.rows[n];
}

// Where a row's cars or logs are at time t: [{ x0, x1 }] in squares (they
// wrap round, so a lane is never empty for long).
export function thingsAt(row, t) {
  if (!row.things.length) return [];
  const span = row.wrap;
  return row.things.map((o) => {
    let x = (o.x + row.dir * row.speed * t) % span;
    if (x < 0) x += span;
    x -= 2;                                                  // so they come in from off the edge
    return { x0: x, x1: x + o.len };
  });
}

// A train: is it on the line now, or about to be (the light)?
export function trainAt(row, t) {
  if (row.kind !== "rail") return { on: false, warn: false, x: 0 };
  const q = ((t - row.offset) % row.period + row.period) % row.period;
  const pass = (COLS + 24) / row.speed;                      // from off one side to off the other, all 12 carriages
  const on = q < pass;
  const warn = !on && row.period - q < TRAIN_WARN;
  const x = row.dir > 0 ? -12 + q * row.speed : COLS + 12 - q * row.speed;
  return { on, warn, x };
}

// ── you ──────────────────────────────────────────────────────────────────────
export function newHopper(seed) {
  return {
    course: newCourse(seed), t: 0,
    row: 0, col: 4, x: 4,                // x: where you are across (a log carries you)
    hop: null,                           // { from: [row, x], to: [row, x], t }
    best: 0, coins: 0, crashes: 0, daze: 0, cam: 0, moved: false,
    taken: new Set(),                    // coins taken, by row
    last: null,                          // what got you last: "car" | "water" | "train" | "edge" | "eagle"
  };
}

export const score = (h) => h.best * ROW_PTS + h.coins * COIN_PTS;

// A hop: dir "up" | "down" | "left" | "right". Not while hopping or dazed,
// not into a tree, not off the sides.
export function hop(h, dir) {
  if (h.hop || h.daze > 0) return false;
  const [dr, dc] = dir === "up" ? [1, 0] : dir === "down" ? [-1, 0] : dir === "left" ? [0, -1] : [0, 1];
  const row = h.row + dr;
  const col = Math.round(h.x) + dc;
  if (col < 0 || col >= COLS) return false;
  const target = rowAt(h.course, row);
  if (target.kind === "grass" && target.trees.has(col)) return false;
  if (row < 0) return false;
  h.hop = { from: [h.row, h.x], to: [row, col], t: 0 };
  h.moved = true;
  return true;
}

// One frame. Returns { crashed: what | null, coin: bool, row: bool (a new best row) }.
export function step(h, dt) {
  const d = Math.max(0, Math.min(0.1, dt));
  h.t += d;
  const out = { crashed: null, coin: false, row: false };
  if (h.daze > 0) { h.daze = Math.max(0, h.daze - d); return out; }
  if (h.hop) {
    h.hop.t += d;
    if (h.hop.t >= HOP_S) {
      h.row = h.hop.to[0]; h.x = h.hop.to[1]; h.col = h.x; h.hop = null;
      if (h.row > h.best) { h.best = h.row; out.row = true; }
      const r = rowAt(h.course, h.row);
      if (r.coin >= 0 && Math.round(h.x) === r.coin && !h.taken.has(h.row)) { h.taken.add(h.row); h.coins++; out.coin = true; }
    } else return out;                               // in the air: nothing can touch you
  }
  // the camera creeps on once you've moved, and keeps up with you
  if (h.moved) h.cam = Math.max(h.cam + CAM_SPEED * d, h.row - 2.5);
  const row = rowAt(h.course, h.row);
  let what = null;
  if (row.kind === "road") {
    for (const c of thingsAt(row, h.t)) if (h.x + 0.5 > c.x0 + CAR_HIT && h.x + 0.5 < c.x1 - CAR_HIT) what = "car";
  } else if (row.kind === "river") {
    // on a log: ride it; off one: in the water
    const on = thingsAt(row, h.t).find((c) => h.x + 0.5 > c.x0 + 0.15 && h.x + 0.5 < c.x1 - 0.15);
    if (!on) what = "water";
    else { h.x += row.dir * row.speed * d; if (h.x < -0.4 || h.x > COLS - 0.6) what = "edge"; }
  } else if (row.kind === "rail") {
    const tr = trainAt(row, h.t);
    if (tr.on && h.x + 1 > tr.x && h.x < tr.x + 12) what = "train";
  }
  if (!what && h.row < h.cam - EAGLE_ROWS) what = "eagle";
  if (what) { crash(h, what); out.crashed = what; }
  return out;
}

function crash(h, what) {
  h.crashes++;
  h.last = what;
  h.hop = null;
  // back a few rows, onto grass, at a gap in the trees
  let r = Math.max(0, h.row - BACK_ROWS);
  while (r > 0 && rowAt(h.course, r).kind !== "grass") r--;
  const g = rowAt(h.course, r);
  let col = 4;
  for (let k = 0; k < COLS; k++) { const c = 4 + (k % 2 ? -1 : 1) * Math.ceil(k / 2); if (c >= 0 && c < COLS && !g.trees.has(c)) { col = c; break; } }
  h.row = r; h.x = col; h.col = col;
  h.cam = Math.min(h.cam, r - 0.5);
  h.daze = DAZE_S;
}
