// src/components/together/carromCore.mjs
// CARROM — the board, the physics, the rules and the computer player, shared
// by the server (config/togetherWorld.js runs one board per room) and the
// phones (which draw it). No React, no network: scripts/check-carrom.mjs
// plays whole boards with it.
//
// The board is the unit square (0,0 top-left), its four pockets in the
// corners. Nine white coins, nine black and the red queen start in the
// middle. Each player has a baseline: bottom, right, top, left. On your turn
// you put the striker on your baseline and flick it; the server works out
// the whole shot at once and sends it to everyone as frames to play back.
//
// Sides: the first plays white, the second black.
//   solo   you (bottom, white) against the computer (top, black)
//   1 v 1  bottom against top
//   2 v 2  partners sit opposite: white bottom and top, black right and left;
//          turns go round the table
// Pocket one of your own colour and you go again. Pocket the striker and
// it's a foul: what went in comes back, and one of yours with it. The queen
// must be covered — pocket one of yours straight after her, or she goes back
// to the middle. Your last coin can't go in before the queen is settled.
// Clear your colour first and the board is yours. Points: 10 a coin of your
// colour in a pocket, 30 the queen, 100 for winning the board — so whoever
// wins the board has the most; if the clock runs out first, the most wins.
import { seededRand } from "./rand.mjs";

export const GAME = "carrom";
export const SHARED = true;           // one board for the whole room, not one per side
export const TICK_MS = 100;

export const R_COIN = 0.0215;
export const R_STRIKER = 0.028;
export const POCKET_AT = 0.036;       // pocket centres, in from each corner
export const POCKET_R = 0.034;        // a centre this near a pocket's centre is in
export const BASE = 0.135;            // the baseline, in from the edge
export const U_MIN = 0.2, U_MAX = 0.8; // where on it the striker may sit
export const VMAX = 3.6;              // board widths a second, at full power
export const FRICTION = 1.5;          // slowing, board widths a second a second
export const DRAG = 0.35;             // and a little more the faster it goes
export const WALL_E = 0.72, BALL_E = 0.9;
export const M_COIN = 1, M_STRIKER = 1.7;
export const TURN_S = 20;
export const FPS = 30;
const DT = 1 / 240;
const MAX_SHOT_S = 7;

export const POCKETS = [[POCKET_AT, POCKET_AT], [1 - POCKET_AT, POCKET_AT], [POCKET_AT, 1 - POCKET_AT], [1 - POCKET_AT, 1 - POCKET_AT]];
export const POS = ["bottom", "right", "top", "left"];
export const COIN_PTS = 10, QUEEN_PTS = 30, WIN_PTS = 100;
export const LEVELS = ["easy", "medium", "hard"];

// Where the striker sits for a seat at u along its baseline, and which way is forward.
export function strikerAt(pos, u) {
  if (pos === "bottom") return [u, 1 - BASE];
  if (pos === "top") return [u, BASE];
  if (pos === "left") return [BASE, u];
  return [1 - BASE, u];
}
export const FORWARD = { bottom: [0, -1], top: [0, 1], left: [1, 0], right: [-1, 0] };

// ── the coins at the start ───────────────────────────────────────────────────
export function startingCoins() {
  const coins = [{ k: "q", x: 0.5, y: 0.5 }];
  const d1 = 2 * R_COIN + 0.001, d2 = 2 * d1;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    coins.push({ k: i % 2 ? "b" : "w", x: 0.5 + Math.cos(a) * d1, y: 0.5 + Math.sin(a) * d1 });
  }
  // the outer ring packs round the inner one like a honeycomb: in line with an
  // inner coin it sits two coins out, between two of them a little nearer
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const dist = i % 2 ? d2 : Math.sqrt(3) * d1;
    coins.push({ k: i % 2 ? "w" : "b", x: 0.5 + Math.cos(a) * dist, y: 0.5 + Math.sin(a) * dist });
  }
  return coins.map((c, i) => ({ ...c, i, in: false }));
}

// ── physics ──────────────────────────────────────────────────────────────────
// Bodies: { x, y, vx, vy, r, m, in }. Runs until everything stops (or a few
// seconds have gone). Pocketed bodies are marked `in`. With `record`, keeps a
// frame every 1/FPS of a second: [[index, x*1000, y*1000] | [index, -1, -1]].
export function simulate(bodies, { record = false, maxS = MAX_SHOT_S } = {}) {
  const frames = [];
  const lastRec = bodies.map((b) => [b.x, b.y, b.in]);
  const pocketed = [];
  const n = bodies.length;
  let t = 0, nextRec = 0;
  for (; t < maxS; t += DT) {
    let moving = false;
    for (const b of bodies) {
      if (b.in) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 0.004) { b.vx = 0; b.vy = 0; continue; }
      moving = true;
      const dec = (FRICTION + DRAG * sp) * DT;
      const k = Math.max(0, sp - dec) / sp;
      b.vx *= k; b.vy *= k;
      b.x += b.vx * DT; b.y += b.vy * DT;
    }
    // bumps between bodies
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      if (a.in) continue;
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        if (b.in) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        const vrel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (vrel > 0) {
          const jimp = ((1 + BALL_E) * vrel) / (1 / a.m + 1 / b.m);
          a.vx -= (jimp / a.m) * nx; a.vy -= (jimp / a.m) * ny;
          b.vx += (jimp / b.m) * nx; b.vy += (jimp / b.m) * ny;
          moving = true;
        }
        const push = (rr - d) / (1 / a.m + 1 / b.m);
        a.x -= (push / a.m) * nx; a.y -= (push / a.m) * ny;
        b.x += (push / b.m) * nx; b.y += (push / b.m) * ny;
      }
    }
    // the frame, then the pockets
    for (const b of bodies) {
      if (b.in) continue;
      if (b.x - b.r < 0) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * WALL_E; }
      if (b.x + b.r > 1) { b.x = 1 - b.r; if (b.vx > 0) b.vx = -b.vx * WALL_E; }
      if (b.y - b.r < 0) { b.y = b.r; if (b.vy < 0) b.vy = -b.vy * WALL_E; }
      if (b.y + b.r > 1) { b.y = 1 - b.r; if (b.vy > 0) b.vy = -b.vy * WALL_E; }
      for (const [px, py] of POCKETS) {
        if (Math.hypot(b.x - px, b.y - py) < POCKET_R) { b.in = true; b.vx = 0; b.vy = 0; b.x = px; b.y = py; pocketed.push(bodies.indexOf(b)); break; }
      }
    }
    if (record && t >= nextRec) {
      nextRec += 1 / FPS;
      const f = [];
      bodies.forEach((b, i) => {
        const [lx, ly, lin] = lastRec[i];
        if (b.in && !lin) { f.push([i, -1, -1]); lastRec[i] = [b.x, b.y, true]; }
        else if (!b.in && Math.hypot(b.x - lx, b.y - ly) > 0.0006) { f.push([i, Math.round(b.x * 1000), Math.round(b.y * 1000)]); lastRec[i] = [b.x, b.y, false]; }
      });
      frames.push(f);
    }
    if (!moving) break;
  }
  if (record) {
    // a last frame where everything lies
    const f = [];
    bodies.forEach((b, i) => { if (!b.in) f.push([i, Math.round(b.x * 1000), Math.round(b.y * 1000)]); else if (!lastRec[i][2]) f.push([i, -1, -1]); });
    frames.push(f);
  }
  return { frames, pocketed, secs: t };
}

const bodiesOf = (coins) => coins.map((c) => ({ x: c.x, y: c.y, vx: 0, vy: 0, r: R_COIN, m: M_COIN, in: c.in }));

// ── a board ──────────────────────────────────────────────────────────────────
// players: room member ids; sides: [{ key, members }] in team order.
export function createSide(seed, { players, sides, durMs }) {
  const list = sides && sides.length ? sides : [{ key: "all", members: players.map(Number) }];
  const s = {
    rand: seededRand((Number(seed) || 1) * 17 + 9), dur: durMs / 1000, t: 0,
    coins: startingCoins(), keys: list.map((x) => x.key), seats: [], gone: new Set(),
    turn: 0, phase: "aim", turnLeft: TURN_S, moveLeft: 0, keep: false, aim: null, level: null, cpuWait: 0,
    queenDue: null, queenBy: null, winner: null, shots: 0, ev: [], last: null,
  };
  if (list.length === 1 && list[0].members.length === 1) {
    // alone: the computer sits opposite and plays black, once you've picked how good
    s.keys.push("cpu");
    s.seats = [{ id: list[0].members[0], side: 0, pos: "bottom" }, { id: "cpu", side: 1, pos: "top" }];
    s.phase = "level";
  } else if (list.length >= 2 && list[0].members.length >= 2 && list[1].members.length >= 2) {
    const [a, b] = [list[0].members, list[1].members];
    s.seats = [{ id: a[0], side: 0, pos: "bottom" }, { id: b[0], side: 1, pos: "right" }, { id: a[1], side: 0, pos: "top" }, { id: b[1], side: 1, pos: "left" }];
  } else {
    const ids = list.flatMap((x) => x.members);
    s.seats = [{ id: ids[0], side: 0, pos: "bottom" }, { id: ids[1] ?? "cpu", side: 1, pos: "top" }];
    if (ids[1] == null) { s.keys = [list[0].key, "cpu"]; s.phase = "level"; }
  }
  return s;
}

const colourOf = (side) => (side === 0 ? "w" : "b");
export const leftOf = (s, side) => s.coins.filter((c) => c.k === colourOf(side) && !c.in).length;
export function points(s, side) {
  const coins = s.coins.filter((c) => c.k === colourOf(side) && c.in).length;
  return coins * COIN_PTS + (s.queenBy === side ? QUEEN_PTS : 0) + (s.winner === side ? WIN_PTS : 0);
}

// Back to the middle, or as near it as there's room.
function toCentre(s, c) {
  c.in = false;
  for (let ring = 0; ring < 30; ring++) {
    const steps = ring === 0 ? 1 : ring * 8;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2, d = ring * R_COIN * 1.1;
      const x = 0.5 + Math.cos(a) * d, y = 0.5 + Math.sin(a) * d;
      if (s.coins.every((o) => o === c || o.in || Math.hypot(o.x - x, o.y - y) >= 2 * R_COIN + 0.001)) { c.x = x; c.y = y; return; }
    }
  }
  c.x = 0.5; c.y = 0.5;
}

// The rules, once a shot has stopped.
function resolve(s, seat, pocketed, strikerIn) {
  const me = seat.side, opp = 1 - me, mine = colourOf(me), theirs = colourOf(opp);
  const got = pocketed.map((i) => s.coins[i]);
  const out = { keep: false, foul: false, own: 0, opp: 0, queen: null };
  if (strikerIn) {
    out.foul = true;
    for (const c of got) toCentre(s, c);
    const pen = s.coins.find((c) => c.k === mine && c.in);
    if (pen) toCentre(s, pen);
    if (s.queenDue === me) { toCentre(s, s.coins[0]); s.queenDue = null; out.queen = "back"; }
    return out;
  }
  out.own = got.filter((c) => c.k === mine).length;
  out.opp = got.filter((c) => c.k === theirs).length;
  const queenIn = got.some((c) => c.k === "q");
  if (s.queenDue === me) {
    if (out.own) { s.queenBy = me; out.queen = "covered"; }
    else { toCentre(s, s.coins[0]); out.queen = "back"; }
    s.queenDue = null;
  }
  if (queenIn) {
    if (out.own) { s.queenBy = me; out.queen = "covered"; }
    else { s.queenDue = me; out.queen = "due"; out.keep = true; }
  }
  if (out.own) out.keep = true;
  // a last coin can't go in before the queen is settled; and you can't finish theirs
  for (const side of [me, opp]) {
    if (leftOf(s, side) === 0 && (s.queenBy === null || side === opp)) {
      const back = got.find((c) => c.k === colourOf(side));
      if (back) { toCentre(s, back); if (side === me) { out.keep = false; out.early = true; } else out.theirs = true; }
    }
  }
  if (leftOf(s, me) === 0 && s.queenBy !== null) s.winner = me;
  return out;
}

const present = (s, seat) => seat.id === "cpu" || !s.gone.has(Number(seat.id));
function nextTurn(s, keep) {
  if (s.winner !== null) { s.phase = "over"; return; }
  if (!keep) {
    for (let k = 1; k <= s.seats.length; k++) {
      const i = (s.turn + k) % s.seats.length;
      if (present(s, s.seats[i])) { s.turn = i; break; }
    }
  }
  s.phase = "aim";
  s.turnLeft = TURN_S;
  s.aim = null;
  s.cpuWait = 1.3 + s.rand() * 0.8;
  s.ev.push({ type: "turn", seat: s.turn, keep: !!keep });
}

// Flick the striker from u along the seat's baseline, at angle `ang` (radians,
// board coordinates), power 0..1. Returns what happened, or why it couldn't.
export function shoot(s, seatIdx, u, ang, pow) {
  const seat = s.seats[seatIdx];
  u = Math.max(U_MIN, Math.min(U_MAX, Number(u)));
  pow = Math.max(0.05, Math.min(1, Number(pow)));
  ang = Number(ang);
  if (!Number.isFinite(u) || !Number.isFinite(ang) || !Number.isFinite(pow)) return { ok: false };
  const [sx, sy] = strikerAt(seat.pos, u);
  const [fx, fy] = FORWARD[seat.pos];
  const dx = Math.cos(ang), dy = Math.sin(ang);
  if (dx * fx + dy * fy < -0.05) return { ok: false, why: "back" };
  if (s.coins.some((c) => !c.in && Math.hypot(c.x - sx, c.y - sy) < R_COIN + R_STRIKER)) return { ok: false, why: "onCoin" };
  const bodies = bodiesOf(s.coins);
  bodies.push({ x: sx, y: sy, vx: dx * pow * VMAX, vy: dy * pow * VMAX, r: R_STRIKER, m: M_STRIKER, in: false });
  const start = bodies.map((b) => (b.in ? null : [Math.round(b.x * 1000), Math.round(b.y * 1000)]));
  const sim = simulate(bodies, { record: true });
  const strikerIn = bodies[bodies.length - 1].in;
  const coinsIn = sim.pocketed.filter((i) => i < s.coins.length);
  bodies.slice(0, s.coins.length).forEach((b, i) => { s.coins[i].x = b.x; s.coins[i].y = b.y; s.coins[i].in = b.in; });
  const res = resolve(s, seat, coinsIn, strikerIn);
  s.shots++;
  s.phase = "moving";
  s.moveLeft = sim.frames.length / FPS + 0.4;
  s.keep = res.keep;
  s.aim = null;
  s.last = { seat: seatIdx, ...res, kinds: coinsIn.map((i) => s.coins[i].k), strikerIn };
  s.ev.push({ type: "shot", seat: seatIdx, start, frames: sim.frames, fps: FPS, res: s.last });
  return { ok: true, res };
}

// ── the computer ─────────────────────────────────────────────────────────────
const NOISE = { easy: 0.06, medium: 0.022, hard: 0.006 };
const CHECK = { easy: 2, medium: 6, hard: 14 };
function clearPath(coins, ax, ay, bx, by, r, skip) {
  const lx = bx - ax, ly = by - ay, L = Math.hypot(lx, ly) || 1;
  for (const c of coins) {
    if (c.in || skip.includes(c)) continue;
    const t = Math.max(0, Math.min(1, ((c.x - ax) * lx + (c.y - ay) * ly) / (L * L)));
    if (Math.hypot(ax + lx * t - c.x, ay + ly * t - c.y) < r + R_COIN) return false;
  }
  return true;
}
// Try a shot on a copy of the board: how good was it for this side?
function trial(s, seat, u, ang, pow) {
  const [sx, sy] = strikerAt(seat.pos, u);
  const bodies = bodiesOf(s.coins);
  bodies.push({ x: sx, y: sy, vx: Math.cos(ang) * pow * VMAX, vy: Math.sin(ang) * pow * VMAX, r: R_STRIKER, m: M_STRIKER, in: false });
  const sim = simulate(bodies, { maxS: 5 });
  if (bodies[bodies.length - 1].in) return -6;
  let v = 0;
  for (const i of sim.pocketed) { if (i >= s.coins.length) continue; const k = s.coins[i].k; v += k === colourOf(seat.side) ? 3 : k === "q" ? 1.5 : -1.5; }
  return v;
}
export function cpuShot(s, seatIdx) {
  const seat = s.seats[seatIdx], lvl = s.level || "medium";
  const mine = colourOf(seat.side);
  const [fx, fy] = FORWARD[seat.pos];
  const targets = s.coins.filter((c) => !c.in && (c.k === mine || (c.k === "q" && s.queenBy === null && leftOf(s, seat.side) > 0)));
  const cands = [];
  for (let u = U_MIN; u <= U_MAX + 1e-9; u += 0.04) {
    const [sx, sy] = strikerAt(seat.pos, u);
    if (s.coins.some((c) => !c.in && Math.hypot(c.x - sx, c.y - sy) < R_COIN + R_STRIKER)) continue;
    for (const c of targets) {
      for (const [px, py] of POCKETS) {
        const tx = px - c.x, ty = py - c.y, tl = Math.hypot(tx, ty);
        const gx = c.x - (tx / tl) * (R_COIN + R_STRIKER), gy = c.y - (ty / tl) * (R_COIN + R_STRIKER);
        const ax = gx - sx, ay = gy - sy, al = Math.hypot(ax, ay);
        if ((ax * fx + ay * fy) / al < 0.05) continue;
        const cut = (ax * tx + ay * ty) / (al * tl);
        if (cut < 0.35) continue;
        if (!clearPath(s.coins, sx, sy, gx, gy, R_STRIKER, [c]) || !clearPath(s.coins, c.x, c.y, px, py, R_COIN, [c])) continue;
        cands.push({ u, ang: Math.atan2(ay, ax), score: cut * 2 - al - tl * 0.6, need: Math.min(1, 0.35 + (al + tl) * 0.55) });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  let pick = null;
  if (cands.length) {
    let best = -Infinity;
    for (const c of cands.slice(0, CHECK[lvl])) {
      for (const pow of [c.need, Math.min(1, c.need + 0.15), Math.max(0.2, c.need - 0.1)]) {
        const v = trial(s, seat, c.u, c.ang, pow);
        if (v > best) { best = v; pick = { u: c.u, ang: c.ang, pow }; }
      }
    }
  }
  if (!pick) {
    // nothing clean: from a free spot on the line, blast at the nearest coin
    // in front (one behind the line can't be hit straight)
    let u = 0.5;
    for (const tryU of [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78]) {
      const [x, y] = strikerAt(seat.pos, tryU);
      if (!s.coins.some((o) => !o.in && Math.hypot(o.x - x, o.y - y) < R_COIN + R_STRIKER)) { u = tryU; break; }
    }
    const [sx, sy] = strikerAt(seat.pos, u);
    const ahead = (o) => ((o.x - sx) * fx + (o.y - sy) * fy) / (Math.hypot(o.x - sx, o.y - sy) || 1) > 0.15;
    const pool = targets.filter(ahead).length ? targets.filter(ahead) : s.coins.filter((o) => !o.in && ahead(o));
    const c = pool.reduce((a, b) => (!a || Math.hypot(b.x - sx, b.y - sy) < Math.hypot(a.x - sx, a.y - sy) ? b : a), null);
    pick = { u, ang: c ? Math.atan2(c.y - sy, c.x - sx) : Math.atan2(fy, fx), pow: 0.85 };
  }
  // a human hand: not quite where it meant
  const g = () => (s.rand() + s.rand() + s.rand() - 1.5) / 1.5;
  pick.ang += g() * NOISE[lvl];
  if (Math.cos(pick.ang) * fx + Math.sin(pick.ang) * fy < 0) pick.ang = Math.atan2(fy, fx);
  pick.pow = Math.max(0.15, Math.min(1, pick.pow * (1 + g() * NOISE[lvl] * 2)));
  return pick;
}

// ── time ─────────────────────────────────────────────────────────────────────
export function step(s, dt) {
  s.t += dt;
  if (s.phase === "over" || s.phase === "level") return;
  if (s.phase === "moving") {
    s.moveLeft -= dt;
    if (s.moveLeft <= 0) nextTurn(s, s.keep);
    return;
  }
  const seat = s.seats[s.turn];
  if (seat.id === "cpu") {
    s.cpuWait -= dt;
    if (s.cpuWait <= 0) { const p = cpuShot(s, s.turn); if (!shoot(s, s.turn, p.u, p.ang, p.pow).ok) shoot(s, s.turn, 0.5, Math.atan2(FORWARD[seat.pos][1], FORWARD[seat.pos][0]), 0.6); }
    return;
  }
  if (!present(s, seat)) { nextTurn(s, false); return; }
  s.turnLeft -= dt;
  if (s.turnLeft <= 0) { s.ev.push({ type: "timeout", seat: s.turn }); nextTurn(s, false); }
}

// ── what a player does ───────────────────────────────────────────────────────
// { a: "level", lvl } | { a: "aim", u, ang, pow } | { a: "shoot", u, ang, pow }
export function act(s, pid, m) {
  pid = Number(pid);
  if (m.a === "level") {
    if (s.phase !== "level" || s.seats[0].id !== pid || !LEVELS.includes(m.lvl)) return { ok: false };
    s.level = m.lvl;
    s.phase = "aim";
    s.turn = 0;
    s.turnLeft = TURN_S;
    s.ev.push({ type: "level", lvl: m.lvl });
    return { ok: true };
  }
  const seat = s.seats[s.turn];
  if (s.phase !== "aim" || seat.id !== pid) return { ok: false, why: "notyou" };
  if (m.a === "aim") {
    const n = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
    s.aim = [Math.round(n(m.u, U_MIN, U_MAX) * 1000) / 1000, Math.round(n(m.ang, -10, 10) * 1000) / 1000, Math.round(n(m.pow, 0, 1) * 100) / 100];
    return { ok: true, quiet: true };
  }
  if (m.a === "shoot") return shoot(s, s.turn, m.u, m.ang, m.pow);
  return { ok: false };
}

export function removePlayer(s, pid) {
  s.gone.add(Number(pid));
  // a side with nobody left has given the board away
  for (const side of [0, 1]) {
    const seats = s.seats.filter((x) => x.side === side);
    if (s.winner === null && seats.length && seats.every((x) => !present(s, x))) {
      s.winner = 1 - side;
      s.phase = "over";
      s.ev.push({ type: "forfeit", side });
    }
  }
}

const sideOfKey = (s, key) => s.keys.indexOf(key);
export const score = (s, key) => { const i = sideOfKey(s, key); return i < 0 ? 0 : points(s, i); };
export const goal = (s, key) => s.winner !== null && s.winner === sideOfKey(s, key);
export const done = (s) => s.winner !== null;

// ── what travels ─────────────────────────────────────────────────────────────
// `peek`: a look for a phone just arriving — the events stay for the next tick.
export function view(s, peek = false) {
  const ev = peek ? [] : s.ev;
  if (!peek) s.ev = [];
  return {
    c: s.coins.map((c) => (c.in ? 0 : [Math.round(c.x * 1000), Math.round(c.y * 1000)])),
    tn: s.turn, ph: s.phase, tl: Math.round(Math.max(0, s.turnLeft) * 10) / 10, aim: s.aim,
    qd: s.queenDue, qb: s.queenBy, pts: [points(s, 0), points(s, 1)], lf: [leftOf(s, 0), leftOf(s, 1)],
    win: s.winner, lvl: s.level, last: s.last,
    e: ev,
  };
}
export function init(s) {
  return { kinds: s.coins.map((c) => c.k), seats: s.seats.map((x) => ({ id: x.id, side: x.side, pos: x.pos })), keys: s.keys };
}
export function summary(s, key) {
  const i = sideOfKey(s, key);
  return { won: s.winner === i, left: i < 0 ? 0 : leftOf(s, i), queen: s.queenBy === i, vsCpu: s.seats.some((x) => x.id === "cpu"), level: s.level };
}
