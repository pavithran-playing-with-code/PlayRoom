// src/components/horror/s13Core.mjs
// STATION 13 — the rules everything else is built on, shared three ways: the
// solo page (s13Sim.js), the multiplayer client (s13Client.js) and the
// server, which runs the monsters for a room (config/manorWorld.js).
//
// A hospital at 02:14, the power gone. Find four fuses, restore the power,
// reach the elevator at the east end of the central hall — and don't be heard.
//
// Why .mjs: the server is CommonJS and loads this with import(). It imports
// nothing (the random generator is inlined). No React, no DOM, no sockets.

export const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const N = 33;                    // the grid is N×N; rows past H are solid
export const H = 25;                    // rows in use
export const S = 3;                     // world units per tile (the renderer's)
export const WALL = 1, FLOOR = 0, FURN = 2;
export const R_BODY = 0.22;             // a body's radius, in tiles

// ── the player ──────────────────────────────────────────────────────────────
export const WALK = 1.6, RUN = 2.7;     // tiles a second
export const MAX_SPEED = RUN + 0.6;     // the server refuses reports faster than this
export const STAM_RUN = 0.2;            // stamina a second while running
export const WINDED_UNTIL = 0.4;        // run it dry and you're winded until it passes this
export const BAT_DRAIN = 0.42;          // battery % a second, ×(1 + tension×0.35)
export const BATTERY_GIVES = 40;
export const NOISE_RUN = 7, NOISE_WALK = 2.2;
export const PICK_R = 0.7, USE_R = 1.3, EXIT_R = 1.3;
export const NEED = 4;                  // fuses to restore the power

// ── the monster ─────────────────────────────────────────────────────────────
export const SLEEP_S = 35;              // asleep this long, or until the first fuse
export const PAUSE_S = 2.6;             // patrol: a pause at each room
export const INVEST_WAIT = 3.5;
export const NOTICE_S = 3.6, BREAK_LOS_S = 1.2, LOSE_S = 4.5;
export const REAR_S = 0.55, LUNGE_S = 0.5, LUNGE_SPEED = 3.8, ATTACK_R = 2.4;
export const CATCH_R = 0.65, HIDE_FIND_R = 1.4, HIDE_FIND_S = 2.6;
export const SIGHT_LIT = 10, SIGHT_TORCH = 8, SIGHT_DARK = 4;
export const monsterSpeed = (M, fuses) => (M.lg > 0 ? LUNGE_SPEED
  : M.st === "chase" ? Math.min(2.5, 1.95 + 0.12 * fuses) : M.st === "invest" ? 1.4 : 1);

// Park-Miller, the same generator as games/seededRand.js.
export function rng(seed) {
  let s = (Number(seed) || 1) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
export function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// ── the building (the same every run) ───────────────────────────────────────
export const ZN = {
  ringN: "North corridor", ringS: "South corridor", ringW: "West corridor", ringE: "East corridor",
  hallW: "Central hall (west)", hallE: "Central hall (east)", crossN: "North passage", crossS: "South passage",
  wardA: "Ward A", wardB: "Ward B", icu: "ICU", pharmacy: "Pharmacy", hall: "Main Hall", surgery: "Surgery", morgue: "Morgue",
};
// [zone, plate, x0, x1, y0, y1]
export const RM = [
  ["wardA", "WARD A", 5, 8, 5, 9], ["wardB", "WARD B", 10, 13, 5, 9], ["icu", "ICU", 18, 22, 5, 9], ["pharmacy", "PHARMACY", 24, 27, 5, 9],
  ["hall", "MAIN HALL", 5, 13, 14, 19], ["surgery", "SURGERY", 18, 22, 14, 19], ["morgue", "MORGUE", 24, 27, 14, 19],
];
// where the green direction signs point
export const DS = [["ICU", 20, 7], ["WARD A", 6, 7], ["WARD B", 11, 7], ["PHARMACY", 25, 7], ["MAIN HALL", 9, 16], ["SURGERY", 20, 16], ["MORGUE", 25, 16], ["ELEVATOR", 30, 11]];
// lit from the start, and then two more zones a fuse, in this order
export const LIT_START = ["hall", "ringW", "hallW"];
export const POW = ["ringN", "wardA", "hallE", "crossS", "icu", "ringE", "wardB", "crossN"];
export const litZones = (fuses) => new Set([...LIT_START, ...POW.slice(0, 2 * Math.max(0, Math.min(NEED, fuses)))]);
export const EXIT = { x: 31, y: 11 };   // the elevator: the wall tile at the east end of the central hall
export const START = { x: 9.5, y: 16.5, yaw: 0 };
// the patrol: a fixed loop of the room centres
export const ROUTE = RM.map((r) => [(r[2] + r[3]) >> 1, (r[4] + r[5]) >> 1]);
const isCorridor = (z) => /^(ring|hall[WE]|cross)/.test(z);

export function dmap(g, sx, sy) {
  const d = new Int16Array(N * N).fill(-1), q = [sx + sy * N];
  d[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % N, y = (c / N) | 0;
    for (const [a, b] of D4) {
      const nx = x + a, ny = y + b;
      if (nx >= 0 && ny >= 0 && nx < N && ny < N && !g[ny][nx] && d[nx + ny * N] < 0) { d[nx + ny * N] = d[c] + 1; q.push(nx + ny * N); }
    }
  }
  return d;
}
export const floors = (g) => { const f = []; for (let y = 0; y < N; y++) for (let x = 1; x < N; x++) if (!g[y][x]) f.push([x, y]); return f; };
// a clear line (walls and furniture block it)
export function los(g, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.2);
  for (let i = 1; i < n; i++) { const t = i / n; const row = g[(ay + (by - ay) * t) | 0]; if (!row || row[(ax + (bx - ax) * t) | 0]) return false; }
  return true;
}
const solid = (g, x, y) => { const row = g[y | 0]; return !row || row[x | 0] > 0; };
export const canAt = (g, x, y) => !(solid(g, x - R_BODY, y - R_BODY) || solid(g, x + R_BODY, y - R_BODY) || solid(g, x - R_BODY, y + R_BODY) || solid(g, x + R_BODY, y + R_BODY));
export const zoneAt = (st, x, y) => (st.zn[y | 0] && st.zn[y | 0][x | 0]) || "";
export const isLit = (st, lit, x, y) => lit.has(zoneAt(st, x, y));

// The building, its furniture and its dead, from a seed. Only the clutter
// changes between runs: a prop is kept only if every floor tile stays
// reachable and no corridor tile becomes a dead end.
//
// What lies on the floor — the dead, a bin or a wheelchair on its side — is
// knee-high, and with no jump a knee-high thing that stops you reads as the
// game being stuck. So those are LOW: drawn, but you (and it) walk past them;
// the tile stays floor. Beds, shelves, gurneys, carts and benches stand
// where they are.
export const isLow = (k, o) => k === "body" || ((k === "trash" || k === "wheel") && !!o && o.s === "tip");
export function genStation(seed) {
  const R = rng((Number(seed) || 1) * 7 + 130013);
  const pick = (a) => a[(R() * a.length) | 0];
  const g = Array.from({ length: N }, () => Array(N).fill(WALL)), zn = Array.from({ length: N }, () => Array(N).fill(""));
  const furn = [], deco = [], bl = [], doors = [];
  const cv = (x0, x1, y0, y1, z) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { g[y][x] = FLOOR; zn[y][x] = z; } };
  cv(4, 28, 2, 3, "ringN"); cv(4, 28, 21, 22, "ringS"); cv(2, 3, 2, 22, "ringW"); cv(29, 30, 2, 22, "ringE");
  cv(4, 16, 11, 12, "hallW"); cv(17, 28, 11, 12, "hallE"); cv(15, 16, 4, 10, "crossN"); cv(15, 16, 13, 20, "crossS");
  for (const [id, nm, x0, x1, y0, y1] of RM) {
    cv(x0, x1, y0, y1, id);
    const dx = (x0 + x1) >> 1, top = y1 < 12, ya = top ? 10 : 13, yb = top ? 4 : 20;
    for (const [x, y, ny] of [[dx, ya, top ? 1 : -1], [dx, yb, top ? -1 : 1]]) { g[y][x] = FLOOR; zn[y][x] = id; doors.push({ x, y, nm, n: [0, ny] }); }
  }
  g[16][4] = FLOOR; zn[16][4] = "hall"; doors.push({ x: 4, y: 16, nm: "MAIN HALL", n: [-1, 0] });

  const fb = (x, y, k, o) => { if (g[y][x] === FLOOR) { g[y][x] = FURN; furn.push({ x, y, k, ...(o || {}) }); } };
  const bedState = () => pick(["neat", "neat", "messy", "messy", "bloody", "body", "broken"]);
  for (const [a, b] of [[5, 8], [10, 13], [18, 22]]) for (const y of [6, 8]) { fb(a, y, "bed", { sd: 1, s: bedState() }); fb(b, y, "bed", { sd: -1, s: bedState() }); }
  for (let y = 5; y <= 9; y++) { fb(24, y, "shelf", { s: R() < 0.25 ? "fallen" : 0 }); fb(27, y, "shelf", { s: R() < 0.25 ? "fallen" : 0 }); }
  for (let y = 14; y <= 19; y++) { fb(24, y, "drawer", { sd: 1, s: R() < 0.5 ? "open" : 0 }); fb(27, y, "drawer", { sd: -1, s: R() < 0.5 ? "open" : 0 }); }
  fb(21, 16, "table", { s: R() < 0.75 ? "body" : 0 }); fb(21, 17, "table"); for (let y = 15; y <= 18; y++) fb(18, y, "shelf");
  for (const y of [15, 18]) for (const x of [6, 7, 8, 10, 11, 12]) fb(x, y, "bench", { s: R() < 0.25 ? "broken" : R() < 0.12 ? "body" : 0 });

  let fc = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (g[y][x] === FLOOR) fc++;
  const reach = () => {
    const sn = new Uint8Array(N * N), q = [9 + 16 * N]; sn[q[0]] = 1; let n = 1;
    for (let i = 0; i < q.length; i++) { const c = q[i], x = c % N, y = (c / N) | 0; for (const [a, b] of D4) { const k = (x + a) + (y + b) * N; if (g[y + b][x + a] === FLOOR && !sn[k]) { sn[k] = 1; q.push(k); n++; } } }
    return n;
  };
  // a prop only if it leaves no dead end in a corridor and nothing cut off
  const lowAt = new Set();
  const tb = (x, y, k, o) => {
    if (g[y][x] !== FLOOR || lowAt.has(x + y * N)) return false;
    if (isLow(k, o)) { lowAt.add(x + y * N); furn.push({ x, y, k, low: 1, ...(o || {}) }); return true; }
    g[y][x] = FURN;
    const dead = D4.some(([a, b]) => {
      const xx = x + a, yy = y + b;
      if (g[yy][xx] !== FLOOR || !isCorridor(zn[yy][xx])) return false;
      let c = 0; for (const [p, q] of D4) if (g[yy + q][xx + p] === FLOOR) c++;
      return c < 2;
    });
    if (!dead && reach() === fc - 1) { fc--; furn.push({ x, y, k, ...(o || {}) }); return true; }
    g[y][x] = FLOOR; return false;
  };
  [5, 6, 7].forEach((x) => tb(x, 19, "counter")); tb(13, 16, "vend"); tb(13, 17, "vend"); tb(5, 14, "plant"); tb(13, 14, "plant"); tb(13, 19, "plant");
  const fl = shuffle(floors(g), R);
  const nearD = (x, y, r) => doors.some((d) => Math.hypot(d.x - x, d.y - y) < r), sol = (x, y) => g[y][x] === WALL, pl = [];
  for (const [x, y] of fl) {
    if (pl.length >= 22) break;
    if (!isCorridor(zn[y][x]) || nearD(x, y, 2.5) || Math.hypot(x - 31, y - 11) < 3 || !(sol(x - 1, y) || sol(x + 1, y) || sol(x, y - 1) || sol(x, y + 1)) || pl.some((q) => Math.abs(q[0] - x) + Math.abs(q[1] - y) < 4)) continue;
    const k = pick(["gurney", "gurney", "wheel", "cart", "trash", "body", "body", "plant"]), r = (sol(x - 1, y) || sol(x + 1, y)) ? 0 : Math.PI / 2;
    if (tb(x, y, k, { r, s: R() < 0.5 ? (k === "trash" || k === "wheel" ? "tip" : "body") : 0, t: (R() * 4) | 0 })) pl.push([x, y]);
  }
  for (const [id] of RM) {
    let n = 0;
    for (const [x, y] of fl) {
      if (n >= (id === "hall" ? 3 : 2)) break;
      if (zn[y][x] !== id || g[y][x] !== FLOOR || nearD(x, y, 1.5)) continue;
      if (!(sol(x - 1, y) || sol(x + 1, y) || sol(x, y - 1) || sol(x, y + 1))) continue;
      if (tb(x, y, "body", { r: ((R() * 4) | 0) * Math.PI / 2, t: (R() * 4) | 0 })) n++;
    }
  }
  furn.filter((q) => q.k === "body" || q.s === "body" || q.s === "open").forEach((q) => bl.push([q.x + 0.5 + (R() - 0.5) * 0.4, q.y + 0.5 + (R() - 0.5) * 0.4, 2 + R() * 2, R() * 6, 1]));
  for (let i = 0; i < 10; i++) { const [x, y] = fl[i]; bl.push([x + 0.5, y + 0.5, 3, R() * 6, 2.2]); }
  // a trail of blood from a corridor body to the Morgue
  const bd = furn.find((q) => q.k === "body" && isCorridor(zn[q.y][q.x]));
  if (bd) {
    const dm = dmap(g, 25, 13);
    let c = [bd.x, bd.y];
    for (let i = 0; i < 48 && dm[c[0] + c[1] * N] > 0; i++) {
      let b = null, bv = dm[c[0] + c[1] * N];
      for (const [a, b2] of D4) { const v = dm[(c[0] + a) + (c[1] + b2) * N]; if (v >= 0 && v < bv) { bv = v; b = [a, b2]; } }
      if (!b) break;
      bl.push([c[0] + 0.5 + b[0] * 0.5, c[1] + 0.5 + b[1] * 0.5, 1.3, Math.atan2(-b[1], b[0]), 1.8]);
      if (i % 2) deco.push({ x: c[0] + 0.5 + b[0] * 0.5, y: c[1] + 0.5 + b[1] * 0.5, k: "print", r: Math.atan2(-b[1], b[0]) - Math.PI / 2 });
      c = [c[0] + b[0], c[1] + b[1]];
    }
  }
  const dc = (n, k) => { for (let i = 0; i < n; i++) { const [x, y] = fl[(R() * fl.length) | 0]; if (g[y][x] === FLOOR) deco.push({ x: x + R(), y: y + R(), k, r: R() * 6 }); } };
  dc(110, "paper"); dc(10, "chair"); dc(6, "ivfall"); dc(45, "glass"); dc(30, "pill"); dc(14, "ctile"); dc(7, "htile"); dc(10, "cable");
  // the per-run look of every human figure and prop that wants a die roll of its own
  return { seed, g, zn, doors, furn, deco, bl, exitT: { ...EXIT }, look: Math.floor(R() * 1e9) };
}

// Fuses, batteries and lockers. `sides`: [{ key, need }] — each side's own
// fuses, NEED of them, one each in NEED of the six rooms other than the Main
// Hall (more than one in a room only when there are many sides). Batteries:
// 7, more for a crowd, apart from everything. Lockers: about 14, against walls.
export function placeItems(st, seed, sides = [{ key: "solo", need: NEED }], players = 1) {
  const R = rng((Number(seed) || 1) * 13 + 77777);
  const { g, zn, doors } = st;
  // not on top of the dead: a fuse or a locker on a body would be hidden in it
  const low = new Set(st.furn.filter((q) => q.low).map((q) => q.x + q.y * N));
  const f = shuffle(floors(g).filter((c) => !low.has(c[0] + c[1] * N)), R);
  const items = [];
  const taken = new Set();
  const free = (c) => !taken.has(c[0] + c[1] * N);
  for (const s of sides) {
    const rooms = shuffle(RM.filter((r) => r[0] !== "hall").map((r) => r[0]), R).slice(0, s.need);
    for (const id of rooms) {
      const c = f.find((q) => zn[q[1]][q[0]] === id && free(q) && items.every((i) => Math.hypot(i.x - q[0] - 0.5, i.y - q[1] - 0.5) > 1.2)) || f.find((q) => zn[q[1]][q[0]] === id && free(q));
      if (!c) continue;
      taken.add(c[0] + c[1] * N);
      items.push({ x: c[0] + 0.5, y: c[1] + 0.5, t: "f", side: s.key, got: false });
    }
  }
  const nb = 7 + Math.max(0, players - 1) * 2;
  let n = 0;
  for (const c of f) {
    if (n >= nb) break;
    if (free(c) && items.every((i) => Math.hypot(i.x - c[0] - 0.5, i.y - c[1] - 0.5) > 5)) { items.push({ x: c[0] + 0.5, y: c[1] + 0.5, t: "b", got: false }); taken.add(c[0] + c[1] * N); n++; }
  }
  const lockers = [];
  for (const c of f) {
    if (lockers.length >= 14) break;
    for (const [a, b] of D4) {
      if (g[c[1] + b][c[0] + a] === WALL && !doors.some((d) => Math.hypot(d.x - c[0], d.y - c[1]) < 2) &&
          lockers.every((l) => Math.hypot(l.x - c[0] - 0.5, l.y - c[1] - 0.5) > 4) && Math.hypot(c[0] - 9, c[1] - 16) > 2) {
        lockers.push({ x: c[0] + 0.5, y: c[1] + 0.5, nx: -a, ny: -b });
        break;
      }
    }
  }
  return { items, lockers };
}

// Monsters: asleep somewhere far from the Main Hall, apart from each other.
export function newMonster(x, y) {
  return { x, y, st: "sleep", sl: SLEEP_S, dm: null, rt: 0, wait: 0, lose: 0, hold: {}, tx: 0, ty: 0, vx: 0, vy: 1, ri: null, pw: 0,
    nt: 0, nl: 0, wd: 0, lg: 0, prey: null, moving: false, zo: "", ld: -1 };
}
export function placeMonsters(st, seed, count = 1) {
  const R = rng((Number(seed) || 1) * 31 + 4242);
  const d0 = dmap(st.g, 9, 16);
  const far = floors(st.g).filter((c) => d0[c[0] + c[1] * N] > 0).sort((a, b) => d0[b[0] + b[1] * N] - d0[a[0] + a[1] * N]);
  const out = [];
  for (let k = 0; out.length < count && k < 400; k++) {
    const c = far[(R() * Math.min(far.length, 20 + out.length * 25)) | 0];
    if (out.every((m) => Math.hypot(m.x - c[0], m.y - c[1]) > 8) || k > 300) out.push(newMonster(c[0] + 0.5, c[1] + 0.5));
  }
  return out;
}
export const monstersFor = (players) => (players >= 7 ? 3 : players >= 4 ? 2 : 1);

export function setTarget(M, st, x, y) { M.tx = x; M.ty = y; M.dm = dmap(st.g, x, y); }
// the next room of the patrol loop (now and then skipping one)
export function pickPatrol(M, st, rand) {
  M.ri = ((M.ri == null ? (rand() * ROUTE.length) | 0 : M.ri) + 1 + (rand() < 0.25 ? 1 : 0)) % ROUTE.length;
  let c = ROUTE[M.ri];
  if (st.g[c[1]][c[0]] !== FLOOR) { const f = floors(st.g); c = f[(rand() * f.length) | 0]; }
  setTarget(M, st, c[0], c[1]);
  M.pw = 0;
}

// How close it is, as a tension level 0..4: farther than 18 tiles 0, 12–18
// 1, 8–12 2, 4.5–8 3, nearer 4. Noticing or chasing: at least 3.
export function tension(M, px, py) {
  if (!M || M.st === "sleep") return 0;
  const d = Math.hypot(px - M.x, py - M.y);
  let l = d > 18 ? 0 : d > 12 ? 1 : d > 8 ? 2 : d > 4.5 ? 3 : 4;
  if (M.st === "chase" || M.st === "notice") l = Math.max(l, 3);
  return l;
}

// One step of one monster. `targets`: the living, [{ id, x, y, fl (torch
// on, battery left), hid (in a locker), moving, run }]; `ctx`: { lit (Set of
// lit zones), fuses (for its chase speed) }. `emit(name, extra)` hears:
// "wake", "notice" { id }, "chase" { id }, "lostsight" { id }, "gaveup",
// "rear" { id }, "zone" { x, y }, "door" { i }, "heard" { id }.
// Returns the id it caught this step ({ id, hidden }), or null.
export function stepMonster(M, st, targets, dt, rand, ctx, emit = () => {}) {
  M.moving = false;
  const fuses = ctx.fuses || 0, lit = ctx.lit || new Set();
  if (M.st === "sleep") {
    M.sl -= dt;
    if (M.sl <= 0 || fuses > 0) { M.st = "patrol"; pickPatrol(M, st, rand); emit("wake", {}); }
    return null;
  }
  const dist = (t) => Math.hypot(t.x - M.x, t.y - M.y) || 0.01;
  const range = (t) => (isLit(st, lit, t.x, t.y) ? SIGHT_LIT : t.fl ? SIGHT_TORCH : SIGHT_DARK);
  const sees = (t) => !t.hid && dist(t) < range(t) * (M.st === "chase" ? 1.25 : 1) && los(st.g, M.x, M.y, t.x, t.y);
  // it walks the building: a bang as it goes from zone to zone, a creak in a doorway
  const zz = zoneAt(st, M.x, M.y);
  if (zz !== M.zo) { if (M.zo) emit("zone", { x: M.x, y: M.y }); M.zo = zz; }
  const di = st.doors.findIndex((q) => q.x === (M.x | 0) && q.y === (M.y | 0));
  if (di >= 0 && di !== M.ld) { M.ld = di; emit("door", { i: di }); } else if (di < 0) M.ld = -1;

  let prey = targets.find((t) => t.id === M.prey) || null;
  // the warning: it has seen you, it stops and stares; break its sight a moment and it gives up
  if (M.st === "notice") {
    M.nt -= dt;
    if (prey) { const d = dist(prey); M.vx = (prey.x - M.x) / d; M.vy = (prey.y - M.y) / d; }
    if (!prey || !sees(prey)) {
      M.nl += dt;
      if (M.nl > BREAK_LOS_S) { M.st = "invest"; M.wait = 0; if (prey) setTarget(M, st, prey.x | 0, prey.y | 0); emit("lostsight", { id: M.prey }); M.prey = null; return null; }
    } else M.nl = 0;
    if (M.nt <= 0) {
      if (prey && sees(prey)) { M.st = "chase"; M.lose = 0; emit("chase", { id: prey.id }); }
      else { M.st = "invest"; M.wait = 0; M.prey = null; }
    }
    return null;
  }
  // first sight of anyone: the warning
  if (M.st !== "chase") {
    let seen = null, sd = Infinity;
    for (const t of targets) if (sees(t)) { const d = dist(t); if (d < sd) { sd = d; seen = t; } }
    if (seen) { M.st = "notice"; M.prey = seen.id; M.nt = NOTICE_S; M.nl = 0; emit("notice", { id: seen.id }); return null; }
  }
  if (M.st === "chase") {
    if (!prey) { M.st = "invest"; M.wait = 0; M.prey = null; }
    else if (sees(prey)) { M.lose = 0; M.rt -= dt; if (M.rt <= 0) { setTarget(M, st, prey.x | 0, prey.y | 0); M.rt = 0.3; } }
    else { M.lose += dt; if (M.lose > LOSE_S) { M.st = "invest"; M.wait = 0; M.prey = null; emit("gaveup", {}); } }
  }
  // noise: running carries 7 tiles, walking 2.2, standing still nothing
  if (M.st === "patrol" || M.st === "invest") {
    for (const t of targets) {
      const nr = t.run ? NOISE_RUN : t.moving ? NOISE_WALK : 0;
      if (!t.hid && dist(t) < nr) {
        if (M.st === "patrol") emit("heard", { id: t.id });
        M.st = "invest"; M.wait = 0;
        if (M.rt <= 0) { setTarget(M, st, t.x | 0, t.y | 0); M.rt = 0.8; }
        break;
      }
    }
    M.rt -= dt;
  }
  // in a locker: if it lingers right by you, it finds you
  for (const t of targets) {
    if (t.hid && dist(t) < HIDE_FIND_R) { M.hold[t.id] = (M.hold[t.id] || 0) + dt; if (M.hold[t.id] > HIDE_FIND_S) { M.hold[t.id] = 0; return { id: t.id, hidden: true }; } }
    else if (M.hold[t.id]) M.hold[t.id] = Math.max(0, M.hold[t.id] - dt);
  }
  prey = targets.find((t) => t.id === M.prey) || null;
  // close: it rears up, then lunges
  if (M.st === "chase" && prey && !prey.hid && dist(prey) < ATTACK_R && !(M.wd > 0) && !(M.lg > 0)) { M.wd = REAR_S; emit("rear", { id: prey.id }); }
  if (M.wd > 0) {
    M.wd -= dt;
    if (prey) { const d = dist(prey); M.vx = (prey.x - M.x) / d; M.vy = (prey.y - M.y) / d; }
    if (M.wd <= 0) M.lg = LUNGE_S;
    return null;
  }
  const spd = monsterSpeed(M, fuses);
  if (M.lg > 0) M.lg -= dt;
  const gx = M.x | 0, gy = M.y | 0;
  let bd = M.dm ? M.dm[gx + gy * N] : -1, best = null;
  if (bd === 0) best = [gx, gy];
  else if (bd > 0) for (const [a, b] of D4) { const nd = M.dm[(gx + a) + (gy + b) * N]; if (nd >= 0 && nd < bd) { bd = nd; best = [gx + a, gy + b]; } }
  let arr = false;
  if (best) {
    const ax = best[0] + 0.5 - M.x, ay = best[1] + 0.5 - M.y, l = Math.hypot(ax, ay);
    if (l < 0.08 && bd === 0) arr = true;
    else if (l > 0) { const v = Math.min(spd * dt, l); M.x += (ax / l) * v; M.y += (ay / l) * v; M.vx = ax / l; M.vy = ay / l; M.moving = true; }
  } else arr = true;
  const anySeen = targets.some(sees);
  if (arr && !anySeen) {
    if (M.st === "chase") { M.st = "invest"; M.wait = 0; M.prey = null; }
    if (M.st === "invest") { M.wait += dt; if (M.wait > INVEST_WAIT) { M.st = "patrol"; pickPatrol(M, st, rand); } }
    else { M.pw += dt; if (M.pw > PAUSE_S) pickPatrol(M, st, rand); }
  }
  for (const t of targets) if (!t.hid && dist(t) < CATCH_R) return { id: t.id, hidden: false };
  return null;
}

// Coming back in after being caught (online): it is sent to the far side of
// the building, and for GRACE_S it can't see, hear or catch you.
export const GRACE_S = 5;
export function sendAway(M, st, from, rand) {
  const f = floors(st.g).map((c) => [c, Math.hypot(c[0] + 0.5 - from.x, c[1] + 0.5 - from.y)]);
  const far = Math.max(...f.map((q) => q[1]));
  const pk = f.filter((q) => q[1] >= far * 0.8);
  const c = pk[(rand() * pk.length) | 0][0];
  Object.assign(M, { x: c[0] + 0.5, y: c[1] + 0.5, st: "patrol", prey: null, lose: 0, wait: 0, wd: 0, lg: 0, nt: 0, hold: {} });
  pickPatrol(M, st, rand);
}

// ── a body in the halls ─────────────────────────────────────────────────────
export function newPlayer(x = START.x, y = START.y, yaw = START.yaw) {
  return { x, y, yaw, pitch: 0, stam: 1, tired: false, bat: 100, fl: true, hid: null, run: false, moving: false, bob: 0, stepT: 0 };
}
// One frame of walking. `inp`: { ix, iz (-1..1; iz +1 forward), run (wanting
// to) }. Returns the sounds: ["step" | "stepRun"].
export function stepPlayer(P, st, inp, dt) {
  const out = [];
  let ix = inp.ix || 0, iz = inp.iz || 0;
  const l = Math.hypot(ix, iz);
  if (l > 1) { ix /= l; iz /= l; }
  P.moving = l > 0.1 && !P.hid;
  const wr = !!inp.run && P.moving;
  P.run = wr && P.stam > 0 && !P.tired;
  if (P.run) { P.stam = Math.max(0, P.stam - dt * STAM_RUN); if (P.stam === 0) P.tired = true; }
  else { P.stam = Math.min(1, P.stam + dt * (P.moving ? 0.1 : 0.2)); if (P.stam > WINDED_UNTIL) P.tired = false; }
  if (P.moving) {
    const sp = P.run ? RUN : WALK, fx = -Math.sin(P.yaw), fy = -Math.cos(P.yaw), rx = Math.cos(P.yaw), ry = -Math.sin(P.yaw);
    const dx = (fx * iz + rx * ix) * sp * dt, dy = (fy * iz + ry * ix) * sp * dt;
    if (canAt(st.g, P.x + dx, P.y)) P.x += dx;
    if (canAt(st.g, P.x, P.y + dy)) P.y += dy;
    P.bob += dt * (P.run ? 13 : 8);
    P.stepT -= dt;
    if (P.stepT <= 0) { P.stepT = P.run ? 0.3 : 0.5; out.push(P.run ? "stepRun" : "step"); }
  }
  return out;
}
// The torch: drains faster the nearer it is. Returns true the moment it dies.
export function drainTorch(P, dt, tlv) {
  if (!P.fl || P.bat <= 0) return false;
  P.bat = Math.max(0, P.bat - dt * BAT_DRAIN * (1 + tlv * 0.35));
  if (P.bat <= 0) { P.fl = false; return true; }
  return false;
}
// The locker within reach, if any.
export function lockerNear(lockers, x, y) {
  let b = null, bd = USE_R;
  for (const l of lockers) { const d = Math.hypot(l.x - x, l.y - y); if (d < bd) { bd = d; b = l; } }
  return b;
}
export function hideIn(P, l) { P.hid = { x: l.x, y: l.y, bx: P.x, by: P.y }; P.x = l.x; P.y = l.y; P.yaw = Math.atan2(-l.nx, -l.ny); P.pitch = 0; }
export function leaveLocker(P) { P.hid = null; }
export const atExit = (x, y) => Math.hypot(EXIT.x + 0.5 - x, EXIT.y + 0.5 - y) < EXIT_R;
