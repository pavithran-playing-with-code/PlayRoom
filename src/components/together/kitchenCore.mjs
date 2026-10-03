// src/components/together/kitchenCore.mjs
// KITCHEN RUSH — the rules, shared by the server (config/togetherWorld.js
// runs a kitchen per side) and the phones (which move their own chef and
// draw). No React, no canvas, no network: a Node script can cook in it
// (scripts/check-kitchen.mjs).
//
// One kitchen, seen from above, nine tiles by nine. Orders come in at the
// top; take the ingredients from the crates, chop what needs chopping on a
// board, grill the meat on a stove (and take it off before it burns), put it
// all on a plate, and hand the plate in at the window before the order runs
// out. Everybody on a side shares the kitchen: pass things across the
// counters, one chops while one cooks.
//
// Positions are in tiles: (x, y) is a chef's centre, tile (tx, ty) covers
// tx..tx+1 by ty..ty+1.
import { seededRand } from "./rand.mjs";

export const GAME = "kitchen";
export const TICK_MS = 100;
export const W = 9, H = 9;
export const R = 0.3;                 // a chef's radius
export const SPEED = 4.2;             // tiles a second
export const REACH = 1.4;             // a counter whose centre is this near is in reach
export const CHOP_S = 1.6;            // seconds of chopping
export const COOK_S = 5;              // seconds on the stove until done…
export const BURN_S = 9;              // …and this much more until it burns
export const MAX_ORDERS = 4;
export const FIRST_ORDER = 1.5;       // seconds in
export const TIP = 0.5;               // a plate handed in at once earns half again

//   # counter   T tomato  L lettuce  C cheese  B bun  M meat   (crates)
//   K chopping board   S stove   P plates   W serving window   X bin   . floor
export const LAYOUT = [
  "#TLCWWBM#",
  "#.......#",
  "K.......S",
  "#.......S",
  "K..#P#..#",
  "#..###..X",
  "#.......S",
  "#.......#",
  "##P##K###",
];
export const CRATE = { T: "tomato", L: "lettuce", C: "cheese", B: "bun", M: "meat" };
const KIND = { "#": "counter", K: "board", S: "stove", P: "plates", W: "window", X: "bin", T: "crate", L: "crate", C: "crate", B: "crate", M: "crate" };
export const ING = {
  tomato: { name: "Tomato", icon: "🍅", chop: true },
  lettuce: { name: "Lettuce", icon: "🥬", chop: true },
  cheese: { name: "Cheese", icon: "🧀", chop: true },
  bun: { name: "Bun", icon: "🍞" },
  meat: { name: "Meat", icon: "🥩", cook: true },
};
// parts in alphabetical order: a plate's contents are kept sorted the same way
export const RECIPES = {
  salad: { name: "Salad", icon: "🥗", parts: ["lettuce", "tomato"], pts: 40, life: 60 },
  burger: { name: "Burger", icon: "🍔", parts: ["bun", "meat"], pts: 50, life: 65 },
  cheese: { name: "Cheeseburger", icon: "🍔", parts: ["bun", "cheese", "meat"], pts: 70, life: 80 },
  deluxe: { name: "Deluxe burger", icon: "🍔", parts: ["bun", "lettuce", "meat", "tomato"], pts: 95, life: 95 },
};
const SPAWNS = [[2.5, 2.5], [6.5, 2.5], [2.5, 6.5], [6.5, 6.5]];

export const kindAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? "wall" : KIND[LAYOUT[y][x]] || "floor");
export const isCounter = (x, y) => { const k = kindAt(x, y); return k !== "floor"; };
export const tileIndex = (x, y) => y * W + x;

// Is a chef's body clear of every counter here?
export function canAt(x, y) {
  if (x - R < 0 || y - R < 0 || x + R > W || y + R > H) return false;
  for (const [cx, cy] of [[x - R, y - R], [x + R, y - R], [x - R, y + R], [x + R, y + R]]) {
    if (kindAt(Math.floor(cx), Math.floor(cy)) !== "floor") return false;
  }
  return true;
}

// Move a chef by (dx, dy), sliding along counters rather than stopping dead.
export function slide(x, y, dx, dy) {
  let nx = x, ny = y;
  if (canAt(x + dx, y)) nx = x + dx;
  if (canAt(nx, y + dy)) ny = y + dy;
  return [nx, ny];
}

// The counter a chef is facing: the tile next to them in the direction they
// face most, else the other way they lean if they lean enough.
export function facingTile(x, y, fx, fy) {
  const cx = Math.floor(x), cy = Math.floor(y);
  const sx = Math.sign(fx), sy = Math.sign(fy);
  const tries = Math.abs(fx) >= Math.abs(fy)
    ? [[sx, 0, true], [0, sy, Math.abs(fy) > 0.3]]
    : [[0, sy, true], [sx, 0, Math.abs(fx) > 0.3]];
  for (const [dx, dy, ok] of tries) {
    if (!ok || (dx === 0 && dy === 0)) continue;
    if (isCounter(cx + dx, cy + dy) && kindAt(cx + dx, cy + dy) !== "wall") return { x: cx + dx, y: cy + dy };
  }
  return null;
}

const item = (k) => ({ k, s: "raw", p: 0 });
const plate = () => ({ k: "plate", s: "", p: 0, on: [] });
export function ready(it) {
  if (!it || it.k === "plate") return false;
  const g = ING[it.k];
  if (g.chop) return it.s === "chopped";
  if (g.cook) return it.s === "cooked";
  return it.s === "raw";
}
function addTo(pl, it) {
  if (!pl || pl.k !== "plate" || !ready(it)) return false;
  if (pl.on.includes(it.k) || pl.on.length >= 4) return false;
  pl.on.push(it.k);
  pl.on.sort();
  return true;
}

// How many points make one, two and three stars, for this many cooks and
// this long. Scaled so a steady solo cook gets two stars and a team that
// works together gets three.
export function starLine(players, durSec) {
  const min = Math.max(1, durSec / 60);
  const base = 75 * min * (1 + 0.6 * (Math.max(1, players) - 1));
  return [Math.round(base), Math.round(base * 2), Math.round(base * 3)];
}

export function createSide(seed, { players, durMs }) {
  const s = {
    rand: seededRand((Number(seed) || 1) * 7 + 3), t: 0, dur: durMs / 1000, n: Math.max(1, players.length),
    tiles: [], at: new Map(), players: new Map(), orders: [], nextOrder: FIRST_ORDER, oid: 0,
    score: 0, served: 0, missed: 0, ev: [],
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = LAYOUT[y][x];
      if (ch === ".") continue;
      const t = { i: tileIndex(x, y), x, y, c: KIND[ch], ch, item: null };
      s.tiles.push(t);
      s.at.set(t.i, t);
    }
  }
  players.forEach((id, i) => {
    const [x, y] = SPAWNS[i % SPAWNS.length];
    s.players.set(Number(id), { id: Number(id), x, y, fx: 0, fy: -1, hold: null, chop: null, at: 0, off: 0, left: false });
  });
  s.line = starLine(s.n, s.dur);
  return s;
}

// ── orders ───────────────────────────────────────────────────────────────────
function nextRecipe(s) {
  const r = s.rand();
  if (s.t < 45) return r < 0.5 ? "salad" : "burger";
  if (s.t < 100) return r < 0.3 ? "salad" : r < 0.65 ? "burger" : "cheese";
  return r < 0.2 ? "salad" : r < 0.45 ? "burger" : r < 0.75 ? "cheese" : "deluxe";
}
const gap = (s) => (20 / (1 + 0.85 * (s.n - 1))) * Math.max(0.7, 1 - s.t / 600);

function serve(s, pl, pid) {
  const key = pl.on.join(",");
  let best = null;
  for (const o of s.orders) {
    if (RECIPES[o.r].parts.join(",") !== key) continue;
    if (!best || o.until < best.until) best = o;
  }
  if (!best) { s.ev.push({ type: "wrong", id: pid }); return 0; }
  const rec = RECIPES[best.r];
  const left = Math.max(0, best.until - s.t) / best.life;
  const pts = rec.pts + Math.round(rec.pts * TIP * left);
  s.score += pts;
  s.served++;
  s.orders = s.orders.filter((o) => o !== best);
  s.ev.push({ type: "served", id: pid, r: best.r, pts });
  // an empty pass: the next order comes sooner
  if (!s.orders.length) s.nextOrder = Math.min(s.nextOrder, s.t + 2);
  return pts;
}

// ── a chef's hands ───────────────────────────────────────────────────────────
// Use the counter at (tx, ty): take, put down, chop, plate up, serve, bin.
export function use(s, pid, tx, ty) {
  const p = s.players.get(Number(pid));
  if (!p || p.left) return { ok: false };
  tx = Math.floor(Number(tx)); ty = Math.floor(Number(ty));
  const t = s.at.get(tileIndex(tx, ty));
  if (!t || tx < 0 || ty < 0 || tx >= W || ty >= H) return { ok: false };
  if (Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) > REACH) return { ok: false, why: "far" };
  const h = p.hold, it = t.item;
  const done = (what) => { s.ev.push({ type: what, id: p.id, x: tx, y: ty }); return { ok: true, what }; };
  const no = (why) => ({ ok: false, why });
  switch (t.c) {
    case "crate": {
      const k = CRATE[t.ch];
      if (!h) { p.hold = item(k); return done("take"); }
      if (h.k === "plate") return addTo(h, item(k)) ? done("plate") : no(ING[k].chop ? "chop" : ING[k].cook ? "cook" : "full");
      if (h.k === k && h.s === "raw") { p.hold = null; return done("back"); }
      return no("hands");
    }
    case "window":
      if (h && h.k === "plate" && h.on.length) { p.hold = null; return serve(s, h, p.id) ? done("serve") : { ok: true, what: "wrong" }; }
      return no(h ? "plate" : "empty");
    case "bin":
      if (!h) return no("empty");
      if (h.k === "plate") { if (!h.on.length) return no("empty"); h.on = []; } else p.hold = null;
      return done("bin");
    case "plates":
      if (!h) { p.hold = plate(); return done("take"); }
      if (h.k !== "plate" && ready(h)) { const pl = plate(); addTo(pl, h); p.hold = pl; return done("plate"); }
      return no(h.k === "plate" ? "hands" : ING[h.k].chop ? "chop" : "cook");
    case "board":
      if (!h && it && it.s === "raw" && ING[it.k]?.chop) { p.chop = t.i; return done("chop"); }
      if (!h && it) { t.item = null; p.hold = it; return done("take"); }
      if (h && !it && h.k !== "plate") {
        if (!ING[h.k].chop) return no("nochop");
        t.item = h; p.hold = null;
        if (h.s === "raw") p.chop = t.i;            // set it down and get chopping
        return done("put");
      }
      if (h && h.k === "plate" && it && addTo(h, it)) { t.item = null; return done("plate"); }
      return no(it ? "busy" : "hands");
    case "stove":
      if (!h && it) { t.item = null; p.hold = it; return done("take"); }
      if (h && !it) {
        if (h.k !== "meat") return no("nocook");
        t.item = h; p.hold = null;
        return done("put");
      }
      if (h && h.k === "plate" && it && addTo(h, it)) { t.item = null; return done("plate"); }
      return no(it ? "busy" : "hands");
    default: // a plain counter
      if (!h && it) { t.item = null; p.hold = it; return done("take"); }
      if (h && !it) { t.item = h; p.hold = null; return done("put"); }
      if (h && h.k === "plate" && it && it.k !== "plate" && addTo(h, it)) { t.item = null; return done("plate"); }
      if (h && h.k !== "plate" && it && it.k === "plate" && addTo(it, h)) { p.hold = null; return done("plate"); }
      return no("busy");
  }
}

// ── time ─────────────────────────────────────────────────────────────────────
export function step(s, dt) {
  s.t += dt;
  // chopping: only while you stand at the board
  for (const p of s.players.values()) {
    if (p.chop === null) continue;
    const t = s.at.get(p.chop);
    const it = t && t.item;
    if (p.left || !it || it.s !== "raw" || !ING[it.k]?.chop || Math.hypot(t.x + 0.5 - p.x, t.y + 0.5 - p.y) > REACH) { p.chop = null; continue; }
    it.p += dt / CHOP_S;
    if (it.p >= 1) { it.s = "chopped"; it.p = 0; p.chop = null; s.ev.push({ type: "chopped", id: p.id, x: t.x, y: t.y }); }
  }
  // the stoves
  for (const t of s.tiles) {
    if (t.c !== "stove" || !t.item || t.item.k !== "meat") continue;
    const it = t.item;
    if (it.s === "raw") {
      it.p += dt / COOK_S;
      if (it.p >= 1) { it.s = "cooked"; it.p = 0; s.ev.push({ type: "cooked", x: t.x, y: t.y }); }
    } else if (it.s === "cooked") {
      it.p += dt / BURN_S;
      if (it.p >= 1) { it.s = "burnt"; it.p = 0; s.ev.push({ type: "burnt", x: t.x, y: t.y }); }
    }
  }
  // the orders
  for (const o of s.orders) {
    if (o.until <= s.t) { o.gone = true; s.missed++; s.ev.push({ type: "expired", r: o.r }); }
  }
  s.orders = s.orders.filter((o) => !o.gone);
  if (s.t >= s.nextOrder && s.orders.length < MAX_ORDERS) {
    const r = nextRecipe(s);
    const life = RECIPES[r].life * (s.n === 1 ? 1.15 : 1);
    s.orders.push({ id: ++s.oid, r, until: s.t + life, life });
    s.nextOrder = s.t + gap(s);
    s.ev.push({ type: "order", r });
  }
}

// ── where a phone says its chef is ───────────────────────────────────────────
// Accepted if it could have walked there; otherwise followed at full pace,
// and if the two still disagree the phone is told where its chef really is.
export function report(s, pid, m, nowMs) {
  const p = s.players.get(Number(pid));
  if (!p || p.left) return null;
  const x = Number(m.x), y = Number(m.y);
  let snap = null;
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const since = p.at ? Math.min(1, (nowMs - p.at) / 1000) : 1;
    const allowed = SPEED * since + 0.4;
    const d = Math.hypot(x - p.x, y - p.y);
    const okThere = canAt(x, y);
    if (d <= allowed && okThere) { p.x = x; p.y = y; p.off = 0; }
    else {
      if (d > allowed) {
        const k = allowed / d, nx = p.x + (x - p.x) * k, ny = p.y + (y - p.y) * k;
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
  if (m && m.a === "use") return use(s, pid, m.x, m.y);
  return { ok: false };
}

export function removePlayer(s, pid) {
  const p = s.players.get(Number(pid));
  if (p) { p.left = true; p.chop = null; }
}

export const score = (s) => s.score;
export const goal = (s) => s.score >= s.line[0];
export const done = () => false;
export const stars = (s) => s.line.filter((v) => s.score >= v).length;

// ── what travels ─────────────────────────────────────────────────────────────
const r2 = (n) => Math.round(n * 100) / 100;
export const packItem = (it) => (it ? [it.k, it.s, r2(it.p), it.on ? it.on.join("+") : ""] : 0);
export const unpackItem = (a) => (a ? { k: a[0], s: a[1], p: a[2], on: a[3] ? a[3].split("+") : [] } : null);

export function view(s) {
  const ev = s.ev;
  s.ev = [];
  return {
    p: [...s.players.values()].map((p) => [p.id, r2(p.x), r2(p.y), r2(p.fx), r2(p.fy), packItem(p.hold), p.chop !== null ? 1 : 0, p.left ? 1 : 0]),
    i: s.tiles.filter((t) => t.item).map((t) => [t.i, packItem(t.item)]),
    o: s.orders.map((o) => [o.id, o.r, r2(o.until - s.t), o.life]),
    sc: s.score, sv: s.served, ms: s.missed, st: stars(s),
    e: ev,
  };
}

export function init(s) {
  return { line: s.line, players: [...s.players.values()].map((p) => ({ id: p.id, x: p.x, y: p.y })) };
}

export function summary(s) {
  return { served: s.served, missed: s.missed, stars: stars(s), line: s.line };
}
