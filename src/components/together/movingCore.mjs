// src/components/together/movingCore.mjs
// MOVING DAY — the rules, shared by the server (config/togetherWorld.js runs
// a house per side) and the phones (which move their own mover and draw).
// No React, no three.js, no network: a Node script can move a whole house
// (scripts/check-moving.mjs).
//
// A little house seen from above, the yard in front, the van at the kerb.
// Everything in the house goes in the van before the clock runs out:
//   • boxes, lamps, plants, the telly… one mover picks them up (Grab) and
//     carries them, or throws them (Throw) — through an open window, even
//     into the van. Fragile things (💡 lamp, 📺 telly, 🪴 plant) break if
//     they're thrown or knocked out of your hands.
//   • the sofa, the fridge, the bed and the bookcase are BIG: they have two
//     ends. One mover can drag one alone, slowly; two movers — one at each
//     end — carry it at a walk, and it swings between them.
//   • Anything that reaches the van is loaded and scores.
//   • Biscuit the dog trots round the house on his own route. Walk into him
//     with something small in your hands and you drop it.
// Load the last thing and the side gets a bonus, and the next house is ready
// at once (the match clock decides the end, never an empty house).
//
// Positions are in tiles: (x, y) is a centre; tile (tx, ty) covers
// tx..tx+1 by ty..ty+1. y grows down the screen (towards the street).
import { seededRand } from "./rand.mjs";

export const GAME = "moving";
export const TICK_MS = 100;
//   #  wall     w  open window (things fly through it; people don't)
//   .  floor    ,  grass      T  the van's bed (loading)   C  the van's cab
//   r  a rug (floor)          s  where small things may start
export const LAYOUT = [
  "################",
  "#.srrss#....sss#",
  "#..rr..#.....s.#",
  "#.............s#",
  "#s.....#..rr...#",
  "#ss..s.#s.rr..s#",
  "##ww####..###ww#",
  ",,,,,,,,,,,,,,,,",
  ",,,,,,,,TTTTTTCC",
  ",,,,,,,,TTTTTTCC",
  ",,,,,,,,TTTTTTCC",
];
export const W = LAYOUT[0].length, H = LAYOUT.length;
export const R = 0.28;                 // a mover's radius
export const SPEED = 4.3;              // tiles a second, empty-handed
export const SLOW_ALONE = 0.42;        // a big thing dragged alone
export const SLOW_PAIR = 0.82;         // …carried by two
export const SLOW_SMALL = 0.92;        // anything small in your hands
export const REACH = 1.05;             // how near a thing (or a big thing's end) must be to grab it
export const HALF = 0.85;              // a big thing: centre to each end
export const STRETCH = 2.15;           // two carriers can't get further apart than this
export const THROW_SPEED = 8.5;        // tiles a second
export const THROW_RANGE = 3.6;
export const CLEAR_BONUS = 100;
export const DOG_SPEED = 1.5;

// What can be moved. `big`: two ends. `fragile`: breaks when thrown or dropped hard.
export const KINDS = {
  box:      { name: "Box",       pts: 10 },
  books:    { name: "Box of books", pts: 15 },
  lamp:     { name: "Lamp",      pts: 20, fragile: true },
  plant:    { name: "Plant",     pts: 15, fragile: true },
  tv:       { name: "Telly",     pts: 30, fragile: true },
  guitar:   { name: "Guitar",    pts: 20 },
  chair:    { name: "Chair",     pts: 15 },
  teddy:    { name: "Teddy",     pts: 10 },
  sofa:     { name: "Sofa",      pts: 60, big: true },
  fridge:   { name: "Fridge",    pts: 70, big: true },
  bed:      { name: "Bed",       pts: 60, big: true },
  shelf:    { name: "Bookcase",  pts: 50, big: true },
};
const SMALL = ["box", "box", "box", "books", "lamp", "plant", "tv", "guitar", "chair", "teddy"];
// the big things and where they stand (centre, and lying along x or y)
const BIG_SLOTS = [
  { k: "sofa", x: 3.5, y: 4.2, a: 0 },
  { k: "bed", x: 12.6, y: 4.8, a: 0 },
  { k: "fridge", x: 1.5, y: 2.2, a: Math.PI / 2 },
  { k: "shelf", x: 9.6, y: 1.6, a: 0 },
];
const SPAWNS = [[4.5, 3.4], [9.5, 3.4], [5.5, 2.4], [8.5, 4.4]];
// Biscuit's rounds: the hall, both rooms, out the front and back
const DOG_ROUTE = [[4.5, 2.6], [7.5, 3.4], [11.0, 3.6], [13.5, 4.6], [10.5, 5.4], [8.5, 6.6], [8.5, 5.0], [7.5, 3.4], [2.5, 3.0], [5.0, 5.2]];

export const charAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= H ? "#" : LAYOUT[ty][tx]);
// solid to a mover
export const solid = (tx, ty) => { const c = charAt(tx, ty); return c === "#" || c === "w" || c === "C"; };
// solid to a thrown thing (an open window lets it through)
const blocksThrow = (tx, ty) => { const c = charAt(tx, ty); return c === "#" || c === "C"; };
export const inVan = (x, y) => charAt(Math.floor(x), Math.floor(y)) === "T";

// Is a mover's body clear of every wall here?
export function canAt(x, y) {
  if (x - R < 0 || y - R < 0 || x + R > W || y + R > H) return false;
  for (const [cx, cy] of [[x - R, y - R], [x + R, y - R], [x - R, y + R], [x + R, y + R]]) {
    if (solid(Math.floor(cx), Math.floor(cy))) return false;
  }
  return true;
}

// Move by (dx, dy), sliding along walls, eased into doorways when nearly lined up.
export function slide(x, y, dx, dy) {
  let nx = x, ny = y;
  if (canAt(x + dx, y)) nx = x + dx;
  else if (dx && Math.abs(dy) <= Math.abs(dx) * 0.6) ny = ease(y, (cy) => canAt(x + dx, cy), Math.abs(dx));
  if (canAt(nx, ny + dy)) ny += dy;
  else if (dy && Math.abs(dx) <= Math.abs(dy) * 0.6) nx = ease(nx, (cx) => canAt(cx, ny + dy), Math.abs(dy));
  return [nx, ny];
}
function ease(c, openAt, step) {
  const mid = Math.floor(c) + 0.5, off = mid - c;
  if (Math.abs(off) > 0.4 || Math.abs(off) < 1e-6 || !openAt(mid)) return c;
  return c + Math.sign(off) * Math.min(Math.abs(off), step);
}

// A big thing's two ends.
export function ends(it) {
  const c = Math.cos(it.a) * HALF, s = Math.sin(it.a) * HALF;
  return [[it.x - c, it.y - s], [it.x + c, it.y + s]];
}

// How many points make one, two and three stars, for this many movers and this long.
export function starLine(players, durSec) {
  const min = Math.max(1, durSec / 60);
  const base = 110 * min * (1 + 0.6 * (Math.max(1, players) - 1));
  return [Math.round(base), Math.round(base * 2), Math.round(base * 3)];
}

// ── a house ──────────────────────────────────────────────────────────────────
function furnish(s) {
  s.items = [];
  const spots = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (LAYOUT[y][x] === "s") spots.push([x + 0.5, y + 0.5]);
  // shuffle the spots, the same for every side with this seed and house
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(s.rand() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  const n = Math.min(spots.length, 9 + Math.min(4, s.house));
  for (let i = 0; i < n; i++) {
    const k = i < SMALL.length ? SMALL[i] : SMALL[Math.floor(s.rand() * SMALL.length)];
    const [x, y] = spots[i];
    s.items.push({ id: ++s.iid, k, x, y, a: s.rand() * 0.6 - 0.3, by: [], fly: null, gone: false });
  }
  // the big things: all four from the second house on
  const bigs = BIG_SLOTS.slice(0, s.house === 0 ? 3 : 4);
  for (const b of bigs) s.items.push({ id: ++s.iid, k: b.k, x: b.x, y: b.y, a: b.a, by: [null, null], fly: null, gone: false });
  s.total = s.items.length;
}

export function createSide(seed, { players, durMs }) {
  const s = {
    rand: seededRand((Number(seed) || 1) * 13 + 5), t: 0, dur: durMs / 1000, n: Math.max(1, players.length),
    players: new Map(), items: [], iid: 0, house: 0, total: 0,
    score: 0, loaded: 0, broken: 0, houses: 0, ev: [],
    dog: { x: DOG_ROUTE[0][0], y: DOG_ROUTE[0][1], leg: 0, fx: 1, fy: 0, nap: 0 },
  };
  furnish(s);
  players.forEach((id, i) => {
    const [x, y] = SPAWNS[i % SPAWNS.length];
    s.players.set(Number(id), { id: Number(id), x, y, fx: 0, fy: 1, hold: null, end: 0, at: 0, off: 0, left: false });
  });
  s.line = starLine(s.n, s.dur);
  return s;
}

const itemOf = (s, id) => s.items.find((it) => it.id === id && !it.gone) || null;
const carriers = (it) => (KINDS[it.k].big ? it.by.filter((x) => x != null).length : it.by.length);

// How fast this mover may go now (the phones use the same).
export function speedOf(s, pid) {
  const p = s.players.get(Number(pid));
  if (!p || p.hold == null) return SPEED;
  const it = itemOf(s, p.hold);
  if (!it) return SPEED;
  if (!KINDS[it.k].big) return SPEED * SLOW_SMALL;
  return SPEED * (carriers(it) >= 2 ? SLOW_PAIR : SLOW_ALONE);
}

// ── hands ────────────────────────────────────────────────────────────────────
function letGo(s, p) {
  const it = p.hold != null ? itemOf(s, p.hold) : null;
  if (it) {
    if (KINDS[it.k].big) it.by[p.end] = null;
    else {
      it.by = [];
      // set down just in front, where there's floor
      const nx = p.x + p.fx * 0.55, ny = p.y + p.fy * 0.55;
      if (!solid(Math.floor(nx), Math.floor(ny))) { it.x = nx; it.y = ny; } else { it.x = p.x; it.y = p.y; }
    }
  }
  p.hold = null;
}

// Grab what's nearest in reach, or put down what you hold.
export function grab(s, pid) {
  const p = s.players.get(Number(pid));
  if (!p || p.left) return { ok: false };
  if (p.hold != null) {
    const it = itemOf(s, p.hold);
    letGo(s, p);
    if (it) { s.ev.push({ type: "drop", id: p.id, i: it.id }); load(s, it); }
    return { ok: true, what: "drop" };
  }
  let best = null, bd = REACH;
  for (const it of s.items) {
    if (it.gone || it.fly) continue;
    if (KINDS[it.k].big) {
      const both = ends(it);
      for (let e = 0; e < 2; e++) {
        if (it.by[e] != null) continue;
        const d = Math.hypot(both[e][0] - p.x, both[e][1] - p.y);
        if (d < bd) { bd = d; best = { it, e }; }
      }
    } else if (!it.by.length) {
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (d < bd) { bd = d; best = { it, e: 0 }; }
    }
  }
  if (!best) return { ok: false, why: "nothing" };
  const { it, e } = best;
  p.hold = it.id;
  p.end = e;
  if (KINDS[it.k].big) it.by[e] = p.id; else it.by = [p.id];
  s.ev.push({ type: "grab", id: p.id, i: it.id });
  return { ok: true, what: "grab", big: !!KINDS[it.k].big };
}

// Throw what you hold, the way you face. Big things can't be thrown.
export function toss(s, pid) {
  const p = s.players.get(Number(pid));
  if (!p || p.left || p.hold == null) return { ok: false, why: "empty" };
  const it = itemOf(s, p.hold);
  if (!it) { p.hold = null; return { ok: false, why: "empty" }; }
  if (KINDS[it.k].big) return { ok: false, why: "big" };
  it.by = [];
  p.hold = null;
  const l = Math.hypot(p.fx, p.fy) || 1;
  it.x = p.x + (p.fx / l) * 0.4; it.y = p.y + (p.fy / l) * 0.4;
  it.fly = { vx: (p.fx / l) * THROW_SPEED, vy: (p.fy / l) * THROW_SPEED, d: 0, by: p.id };
  s.ev.push({ type: "throw", id: p.id, i: it.id });
  return { ok: true, what: "throw" };
}

// Anything in the van is loaded: points, and gone from the house.
function load(s, it) {
  if (it.gone || !inVan(it.x, it.y)) return false;
  it.gone = true;
  for (const q of s.players.values()) if (q.hold === it.id) q.hold = null;
  const pts = KINDS[it.k].pts;
  s.score += pts;
  s.loaded++;
  s.ev.push({ type: "loaded", i: it.id, k: it.k, pts, x: it.x, y: it.y });
  return true;
}

function smash(s, it, why) {
  it.gone = true;
  for (const q of s.players.values()) if (q.hold === it.id) q.hold = null;
  s.broken++;
  s.ev.push({ type: "smash", i: it.id, k: it.k, x: it.x, y: it.y, why });
}

// ── time ─────────────────────────────────────────────────────────────────────
export function step(s, dt) {
  s.t += dt;
  // things in hand follow their movers
  for (const it of s.items) {
    if (it.gone || it.fly) continue;
    if (KINDS[it.k].big) {
      const a = it.by[0] != null ? s.players.get(it.by[0]) : null;
      const b = it.by[1] != null ? s.players.get(it.by[1]) : null;
      if (a && b) {
        // between the two: it swings to lie along them
        it.x = (a.x + b.x) / 2; it.y = (a.y + b.y) / 2;
        if (Math.hypot(b.x - a.x, b.y - a.y) > 0.2) it.a = Math.atan2(b.y - a.y, b.x - a.x);
      } else if (a || b) {
        // dragged by one end: the other trails behind
        const p = a || b, e = a ? 0 : 1;
        const [ox, oy] = ends(it)[1 - e];
        const dx = ox - p.x, dy = oy - p.y, l = Math.hypot(dx, dy) || 1;
        const fx = p.x + (dx / l) * HALF * 2, fy = p.y + (dy / l) * HALF * 2;
        it.x = (p.x + fx) / 2; it.y = (p.y + fy) / 2;
        it.a = e === 0 ? Math.atan2(fy - p.y, fx - p.x) : Math.atan2(p.y - fy, p.x - fx);
      }
      if (it.by.some((x) => x != null)) load(s, it);
    } else if (it.by.length) {
      const p = s.players.get(it.by[0]);
      if (p) { it.x = p.x + p.fx * 0.35; it.y = p.y + p.fy * 0.35; load(s, it); }
    }
  }
  // things in the air
  for (const it of s.items) {
    if (it.gone || !it.fly) continue;
    const f = it.fly;
    const nx = it.x + f.vx * dt, ny = it.y + f.vy * dt;
    f.d += Math.hypot(f.vx, f.vy) * dt;
    const hit = blocksThrow(Math.floor(nx), Math.floor(ny));
    if (!hit) { it.x = nx; it.y = ny; }
    if (hit || f.d >= THROW_RANGE || nx < 0 || ny < 0 || nx > W || ny > H) {
      it.fly = null;
      it.x = Math.max(0.3, Math.min(W - 0.3, it.x)); it.y = Math.max(0.3, Math.min(H - 0.3, it.y));
      if (KINDS[it.k].fragile) smash(s, it, "thrown");
      else if (!load(s, it)) s.ev.push({ type: "land", i: it.id, x: it.x, y: it.y });
    }
  }
  // Biscuit's rounds; walking into him with something small knocks it out of your hands
  const d = s.dog;
  if (d.nap > 0) d.nap -= dt;
  else {
    const [tx, ty] = DOG_ROUTE[(d.leg + 1) % DOG_ROUTE.length];
    const dx = tx - d.x, dy = ty - d.y, l = Math.hypot(dx, dy);
    if (l < 0.1) { d.leg = (d.leg + 1) % DOG_ROUTE.length; if (d.leg % 4 === 0) d.nap = 2.5; }
    else { const k = Math.min(l, DOG_SPEED * dt) / l; d.x += dx * k; d.y += dy * k; d.fx = dx / l; d.fy = dy / l; }
  }
  for (const p of s.players.values()) {
    if (p.left || p.hold == null || Math.hypot(p.x - d.x, p.y - d.y) > 0.5) continue;
    const it = itemOf(s, p.hold);
    if (!it || KINDS[it.k].big) continue;
    letGo(s, p);
    s.ev.push({ type: "woof", id: p.id, x: d.x, y: d.y });
    if (KINDS[it.k].fragile) smash(s, it, "dog");
    d.nap = 1.2;
  }
  // the house is empty: a bonus, and the next one
  if (s.items.every((it) => it.gone)) {
    s.score += CLEAR_BONUS;
    s.houses++;
    s.house++;
    s.ev.push({ type: "cleared", pts: CLEAR_BONUS, house: s.house });
    furnish(s);
  }
}

// ── where a phone says its mover is ─────────────────────────────────────────
// Accepted if it could have walked there; otherwise followed at full pace, and
// if the two still disagree the phone is told where its mover really is.
export function report(s, pid, m, nowMs) {
  const p = s.players.get(Number(pid));
  if (!p || p.left) return null;
  const x = Number(m.x), y = Number(m.y);
  let snap = null;
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const since = p.at ? Math.min(1, (nowMs - p.at) / 1000) : 1;
    const allowed = SPEED * since + 0.4;
    const dd = Math.hypot(x - p.x, y - p.y);
    const okThere = canAt(x, y);
    if (dd <= allowed && okThere) { p.x = x; p.y = y; p.off = 0; }
    else {
      if (dd > allowed) {
        const k = allowed / dd, nx = p.x + (x - p.x) * k, ny = p.y + (y - p.y) * k;
        if (canAt(nx, ny)) { p.x = nx; p.y = ny; }
      }
      p.off++;
      if (!okThere || p.off >= 4) { p.off = 0; snap = { x: p.x, y: p.y }; }
    }
  }
  const fx = Number(m.fx), fy = Number(m.fy);
  if (Number.isFinite(fx) && Number.isFinite(fy) && (fx || fy)) {
    const l = Math.hypot(fx, fy);
    p.fx = fx / l; p.fy = fy / l;
  }
  p.at = nowMs;
  return snap;
}

export function act(s, pid, m) {
  if (m && m.a === "grab") return grab(s, pid);
  if (m && m.a === "throw") return toss(s, pid);
  return { ok: false };
}

export function removePlayer(s, pid) {
  const p = s.players.get(Number(pid));
  if (!p) return;
  letGo(s, p);
  p.left = true;
}

export const score = (s) => s.score;
export const goal = (s) => s.score >= s.line[0];
export const done = () => false;
export const stars = (s) => s.line.filter((v) => s.score >= v).length;

// ── what travels ─────────────────────────────────────────────────────────────
const r2 = (n) => Math.round(n * 100) / 100;
// `peek`: a look for a phone just arriving — the events stay for the next tick.
export function view(s, peek = false) {
  const ev = peek ? [] : s.ev;
  if (!peek) s.ev = [];
  return {
    // id, x, y, fx, fy, holding (item id or 0), end, left
    p: [...s.players.values()].map((p) => [p.id, r2(p.x), r2(p.y), r2(p.fx), r2(p.fy), p.hold || 0, p.end, p.left ? 1 : 0]),
    // id, kind, x, y, angle, flying (0..1 of its range, or -1), carriers
    i: s.items.filter((it) => !it.gone).map((it) => [it.id, it.k, r2(it.x), r2(it.y), r2(it.a), it.fly ? r2(it.fly.d / THROW_RANGE) : -1,
      KINDS[it.k].big ? it.by.map((x) => x || 0) : it.by.slice()]),
    d: [r2(s.dog.x), r2(s.dog.y), r2(s.dog.fx), r2(s.dog.fy), s.dog.nap > 0 ? 1 : 0],
    sc: s.score, ld: s.loaded, br: s.broken, hs: s.house, st: stars(s), left: s.items.filter((it) => !it.gone).length, tot: s.total,
    e: ev,
  };
}

export function init(s) {
  return { line: s.line };
}

export function summary(s) {
  return { loaded: s.loaded, broken: s.broken, houses: s.houses, stars: stars(s), line: s.line };
}
