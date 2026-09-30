// src/components/horror/wickSim.js
// WICK — go down with a lantern. Every step burns oil, and the oil is the light.
//
// Two earlier attempts taught the rules this one is built on:
//   - a hidden stalker made every death arbitrary: here every monster is on
//     the board at all times, and what each one will do next is drawn on it;
//   - a single timing idea was readable but shallow: here each turn is a
//     choice — which way round a pillar, whether a flask is worth the detour,
//     whether to burn five oil on a flare.
//
// It is turn-based. Nothing moves until you do, so a warning is always a
// warning you had time to read. Monsters follow fixed rules, no dice:
//
//   SHADE    cannot enter the light. As the oil drops the light shrinks and
//            they close in; when it goes out, they reach you.
//   CRAWLER  ignores the light but is slow: it moves every other turn, and on
//            the turn it will move, the tiles it can reach are marked.
//   LUNGER   the tall one. If it sees you along a row or column it takes aim
//            (the lane is marked), and next turn charges to the end of it.
//
// No drawing and no React, so every rule can be exercised from a Node script.
import { seededRand } from "../games/seededRand.js";

export const COLS = 7;
export const ROWS = 9;

export const SHADE = "shade";
export const CRAWLER = "crawler";
export const LUNGER = "lunger";

export const START_OIL = 24;
export const MAX_OIL = 30;
export const FLASK_OIL = 8;
export const DESCEND_OIL = 6;         // found at the foot of every stair
export const FLARE_COST = 5;
export const FLARE_RANGE = 3;
export const FLARE_STUN = 2;          // turns a crawler or lunger loses to a flare
export const DARK_STEPS = 3;          // turns you last with the lantern out
export const DARK = "dark";           // what took you, when nothing else did

// How far the lantern reaches, by oil left. The thresholds are drawn on the
// oil gauge so you can see the light is about to shrink before it does.
export const BRIGHT_AT = 12;          // radius 2 at or above this
export const DIM_AT = 5;              // radius 1 at or above this
export function radiusFor(oil) {
  if (oil >= BRIGHT_AT) return 2;
  if (oil >= DIM_AT) return 1;
  if (oil >= 1) return 0;             // only your own tile
  return -1;                          // out: nothing stops them
}

export const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const idx = (x, y) => y * COLS + x;
export const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function isLit(s, x, y) {
  const r = radiusFor(s.oil);
  return r >= 0 && Math.abs(x - s.player.x) + Math.abs(y - s.player.y) <= r;
}

export function monsterAt(s, x, y, except = null) {
  return s.monsters.find((m) => m !== except && m.x === x && m.y === y) || null;
}

// Breadth-first distances over open floor from one tile. Monsters and light
// are ignored: this is the shape of the room, which the movers then descend.
function distances(walls, from) {
  const d = new Array(COLS * ROWS).fill(-1);
  const q = [[from.x, from.y]];
  d[idx(from.x, from.y)] = 0;
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    for (const [dx, dy] of STEPS) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny) || walls[idx(nx, ny)] || d[idx(nx, ny)] !== -1) continue;
      d[idx(nx, ny)] = d[idx(x, y)] + 1;
      q.push([nx, ny]);
    }
  }
  return d;
}

// ── Floors ───────────────────────────────────────────────────────────────────

// What is down there, by depth. Each kind arrives on its own floor so it can
// be met alone before it is met in company.
export function roster(depth) {
  const d = Math.max(1, depth);
  return {
    shades: 1 + Math.ceil(d / 2),
    crawlers: d >= 2 ? 1 + Math.floor((d - 2) / 3) : 0,
    lungers: d >= 3 ? 1 + Math.floor((d - 3) / 3) : 0,
    flasks: Math.max(1, 3 - Math.floor((d - 1) / 3)),
    walls: 9 + Math.min(5, d),
  };
}

export function makeFloor(seed, depth) {
  const rand = seededRand((Number(seed) || 1) * 31 + depth * 7919);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const want = roster(depth);

  for (let attempt = 0; attempt < 200; attempt++) {
    const start = { x: 1 + Math.floor(rand() * (COLS - 2)), y: ROWS - 1 };
    const exit = { x: Math.floor(rand() * COLS), y: 0 };
    const walls = new Array(COLS * ROWS).fill(false);
    const keep = (x, y) =>
      (Math.abs(x - start.x) + Math.abs(y - start.y) <= 1) ||
      (Math.abs(x - exit.x) + Math.abs(y - exit.y) <= 1);
    let placed = 0;
    for (let tries = 0; placed < want.walls && tries < 400; tries++) {
      const x = Math.floor(rand() * COLS), y = 1 + Math.floor(rand() * (ROWS - 2));
      if (keep(x, y) || walls[idx(x, y)]) continue;
      walls[idx(x, y)] = true;
      placed++;
    }

    const fromStart = distances(walls, start);
    const open = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!walls[idx(x, y)]) open.push({ x, y });
    }
    // every open tile reachable, so nothing can be sealed away from you
    if (open.some((t) => fromStart[idx(t.x, t.y)] < 0)) continue;

    const fromExit = distances(walls, exit);
    const direct = fromStart[idx(exit.x, exit.y)];
    const taken = new Set([idx(start.x, start.y), idx(exit.x, exit.y)]);
    const free = (t) => !taken.has(idx(t.x, t.y));

    // The key is a detour off the straight road, never on it.
    const keySpots = open.filter((t) => free(t) &&
      fromStart[idx(t.x, t.y)] >= 3 && fromExit[idx(t.x, t.y)] >= 3 &&
      fromStart[idx(t.x, t.y)] + fromExit[idx(t.x, t.y)] >= direct + 4);
    if (!keySpots.length) continue;
    const key = pick(keySpots);
    taken.add(idx(key.x, key.y));

    const flasks = [];
    for (let i = 0; i < want.flasks; i++) {
      const spots = open.filter((t) => free(t) && fromStart[idx(t.x, t.y)] >= 3);
      if (!spots.length) break;
      const f = pick(spots);
      taken.add(idx(f.x, f.y));
      flasks.push(f);
    }

    const monsters = [];
    let id = 1;
    const place = (kind, ok) => {
      const spots = open.filter((t) => free(t) && ok(t));
      if (!spots.length) return false;
      const t = pick(spots);
      taken.add(idx(t.x, t.y));
      monsters.push({ id: id++, kind, x: t.x, y: t.y, aim: null, rest: 0, stun: 0, ready: false });
      return true;
    };
    let ok = true;
    const far = (t, n) => fromStart[idx(t.x, t.y)] >= n;
    // Lungers go first in turn order and never start looking straight at you.
    for (let i = 0; i < want.lungers && ok; i++) {
      ok = place(LUNGER, (t) => far(t, 4) && t.x !== start.x && t.y !== start.y);
    }
    for (let i = 0; i < want.crawlers && ok; i++) ok = place(CRAWLER, (t) => far(t, 5));
    for (let i = 0; i < want.shades && ok; i++) ok = place(SHADE, (t) => far(t, 4));
    if (!ok) continue;

    return { walls, start, exit, key, flasks, monsters };
  }
  throw new Error(`no floor for seed ${seed} depth ${depth}`);
}

// ── A run ────────────────────────────────────────────────────────────────────

function enterFloor(s, depth) {
  const f = makeFloor(s.seed, depth);
  s.depth = depth;
  s.walls = f.walls;
  s.exit = f.exit;
  s.key = f.key;
  s.flasks = f.flasks;
  s.monsters = f.monsters;
  s.player = { ...f.start };
  s.hasKey = false;
  s.floorTurn = 0;
}

export function newRun(seed) {
  const s = {
    seed: Number(seed) || 1,
    depth: 1,
    oil: START_OIL,
    turn: 0,
    floorTurn: 0,
    dead: null,           // { by: monster id, kind } once it is over
    dark: 0,              // turns spent with the lantern out
    burned: 0,
  };
  enterFloor(s, 1);
  return s;
}

export function clone(s) {
  return {
    ...s,
    walls: s.walls,                       // never mutated after a floor is made
    player: { ...s.player },
    exit: { ...s.exit },
    key: s.key && { ...s.key },
    flasks: s.flasks.map((f) => ({ ...f })),
    monsters: s.monsters.map((m) => ({ ...m, aim: m.aim && { ...m.aim } })),
    dead: s.dead && { ...s.dead },
  };
}

// Tiles a lunger would sweep going (dx,dy): everything up to the first wall,
// edge or other monster. You do not stop it — it goes through where you were.
export function laneOf(s, m, dx, dy) {
  const out = [];
  let x = m.x + dx, y = m.y + dy;
  while (inside(x, y) && !s.walls[idx(x, y)] && !monsterAt(s, x, y, m)) {
    out.push({ x, y });
    x += dx; y += dy;
  }
  return out;
}

function sightline(s, m) {
  for (const [dx, dy] of STEPS) {
    if (laneOf(s, m, dx, dy).some((t) => t.x === s.player.x && t.y === s.player.y)) return { dx, dy };
  }
  return null;
}

// One step downhill on the distance field, onto a free tile that `allowed`
// accepts. Ties go to the first direction in STEPS, so it never wavers.
function stepToward(s, m, field, allowed) {
  const here = field[idx(m.x, m.y)];
  let best = null, bestD = here < 0 ? Infinity : here;
  for (const [dx, dy] of STEPS) {
    const nx = m.x + dx, ny = m.y + dy;
    if (!inside(nx, ny) || s.walls[idx(nx, ny)] || monsterAt(s, nx, ny, m)) continue;
    const d = field[idx(nx, ny)];
    if (d < 0 || d >= bestD || !allowed(nx, ny)) continue;
    best = { x: nx, y: ny }; bestD = d;
  }
  return best;
}

// A shade caught in the light backs away from you if it can, and otherwise
// stands frozen where it is.
function stepAway(s, m, field) {
  let best = null, bestD = field[idx(m.x, m.y)];
  for (const [dx, dy] of STEPS) {
    const nx = m.x + dx, ny = m.y + dy;
    if (!inside(nx, ny) || s.walls[idx(nx, ny)] || monsterAt(s, nx, ny, m)) continue;
    if (nx === s.player.x && ny === s.player.y) continue;
    if (isLit(s, nx, ny)) continue;
    const d = field[idx(nx, ny)];
    if (d > bestD) { best = { x: nx, y: ny }; bestD = d; }
  }
  return best;
}

// Validity alone, no turn taken. Used by the page for what is tappable.
export function canAct(s, action) {
  if (s.dead) return false;
  if (action === "wait") return true;
  if (action === "flare") return s.oil > FLARE_COST;
  const d = DIRS[action];
  if (!d) return false;
  const nx = s.player.x + d[0], ny = s.player.y + d[1];
  return inside(nx, ny) && !s.walls[idx(nx, ny)] && !monsterAt(s, nx, ny);
}

// Take one turn. Returns null (and changes nothing) if the action is not
// allowed; otherwise what happened, so the page can animate it.
export function act(s, action) {
  if (!canAct(s, action)) return null;
  const ev = { moves: [], burned: [], stunned: [], picked: [], descended: false, dead: null, aimed: [] };
  const from = { ...s.player };
  const wasOut = s.oil <= 0;

  if (action === "flare") {
    s.oil -= FLARE_COST;
    const keep = [];
    for (const m of s.monsters) {
      const near = manhattan(m, s.player) <= FLARE_RANGE;
      if (near && m.kind === SHADE) { ev.burned.push(m.id); s.burned++; continue; }
      if (near) { m.stun = FLARE_STUN; m.aim = null; ev.stunned.push(m.id); }
      keep.push(m);
    }
    s.monsters = keep;
  } else {
    s.oil = Math.max(0, s.oil - 1);
    if (action !== "wait") {
      const [dx, dy] = DIRS[action];
      s.player.x += dx; s.player.y += dy;
    }
  }
  ev.player = { from, to: { ...s.player } };

  const p = s.player;
  if (s.key && s.key.x === p.x && s.key.y === p.y) { s.hasKey = true; s.key = null; ev.picked.push("key"); }
  const flask = s.flasks.findIndex((f) => f.x === p.x && f.y === p.y);
  if (flask >= 0) {
    s.flasks.splice(flask, 1);
    s.oil = Math.min(MAX_OIL, s.oil + FLASK_OIL);
    ev.picked.push("flask");
  }
  s.turn++;
  s.floorTurn++;
  // Out of oil is not instant: you get DARK_STEPS turns, counted down on
  // screen, to reach a flask or the stairs. Without this, a floor whose
  // shades were all burned could be wandered forever.
  s.dark = s.oil > 0 || !wasOut ? 0 : s.dark + 1;

  if (s.hasKey && p.x === s.exit.x && p.y === s.exit.y) {
    enterFloor(s, s.depth + 1);
    s.oil = Math.min(MAX_OIL, s.oil + DESCEND_OIL);
    ev.descended = true;
    return ev;
  }

  const kill = (m) => { s.dead = { by: m.id, kind: m.kind }; ev.dead = s.dead; };
  if (s.dark > DARK_STEPS) {
    s.dead = { by: null, kind: DARK };
    ev.dead = s.dead;
    return ev;
  }
  const field = distances(s.walls, p);

  for (const m of s.monsters) {
    if (s.dead) break;
    const was = { x: m.x, y: m.y };
    if (m.stun > 0) {
      m.stun--;
      if (m.kind === CRAWLER) m.ready = false;
      continue;
    }

    if (m.kind === LUNGER) {
      if (m.aim) {
        const lane = laneOf(s, m, m.aim.dx, m.aim.dy);
        let end = lane.length ? lane[lane.length - 1] : was;
        const hit = lane.findIndex((t) => t.x === p.x && t.y === p.y);
        if (hit >= 0) end = lane[hit];
        m.x = end.x; m.y = end.y;
        m.aim = null;
        m.rest = 1;
        ev.moves.push({ id: m.id, from: was, to: { x: m.x, y: m.y }, dash: true });
        if (hit >= 0) kill(m);
      } else if (m.rest > 0) {
        m.rest--;
      } else {
        m.aim = sightline(s, m);
        if (m.aim) ev.aimed.push(m.id);
      }
      continue;
    }

    if (m.kind === CRAWLER) {
      if (m.ready) {
        const to = stepToward(s, m, field, () => true);
        if (to) { m.x = to.x; m.y = to.y; ev.moves.push({ id: m.id, from: was, to }); }
      }
      m.ready = !m.ready;
      if (m.x === p.x && m.y === p.y) kill(m);
      continue;
    }

    // SHADE
    if (isLit(s, m.x, m.y)) {
      const to = stepAway(s, m, field);
      if (to) { m.x = to.x; m.y = to.y; ev.moves.push({ id: m.id, from: was, to }); }
    } else {
      const to = stepToward(s, m, field, (x, y) => !isLit(s, x, y));
      if (to) { m.x = to.x; m.y = to.y; ev.moves.push({ id: m.id, from: was, to }); }
      if (m.x === p.x && m.y === p.y) kill(m);
    }
  }
  return ev;
}

// ── What the page draws as warnings ──────────────────────────────────────────

export const ACTIONS = ["up", "right", "down", "left", "wait", "flare"];

// For each thing you could do this turn: is it allowed, and would it kill
// you? Worked out by actually playing it on a copy, so the warning can never
// disagree with what happens.
export function preview(s) {
  const out = {};
  for (const a of ACTIONS) {
    if (!canAct(s, a)) { out[a] = { ok: false, deadly: false }; continue; }
    const c = clone(s);
    const ev = act(c, a);
    out[a] = { ok: true, deadly: !!ev.dead, by: ev.dead ? ev.dead.kind : null, descends: ev.descended };
  }
  return out;
}

// Tiles that are dangerous next turn, board-wide: every lane a lunger is aimed
// down, and the reach of every crawler about to move.
export function threats(s) {
  const tiles = [];
  for (const m of s.monsters) {
    if (m.stun > 0) continue;
    if (m.kind === LUNGER && m.aim) {
      for (const t of laneOf(s, m, m.aim.dx, m.aim.dy)) tiles.push({ ...t, kind: LUNGER, id: m.id });
    }
    if (m.kind === CRAWLER && m.ready) {
      for (const [dx, dy] of STEPS) {
        const x = m.x + dx, y = m.y + dy;
        if (inside(x, y) && !s.walls[idx(x, y)]) tiles.push({ x, y, kind: CRAWLER, id: m.id });
      }
    }
  }
  return tiles;
}

// The one line of advice that matters most right now, most urgent first.
export function warning(s) {
  if (s.dead) return null;
  const next = s.oil - 1;
  if (s.oil <= 0) {
    const left = DARK_STEPS - s.dark;
    return { level: 3, text: left > 0 ? `Lantern out. ${left} step${left === 1 ? "" : "s"} before the dark takes you.` : "The dark takes you on your next step." };
  }
  if (s.monsters.some((m) => m.kind === LUNGER && m.aim && m.stun === 0 &&
      laneOf(s, m, m.aim.dx, m.aim.dy).some((t) => t.x === s.player.x && t.y === s.player.y))) {
    return { level: 3, text: "It has seen you. Get out of the line." };
  }
  if (next === 0) return { level: 3, text: "One step of oil left." };
  if (radiusFor(next) < radiusFor(s.oil)) return { level: 2, text: "The light shrinks on your next step." };
  if (s.oil < DIM_AT) return { level: 2, text: "The light is almost gone." };
  if (!s.hasKey) return { level: 0, text: "Find the key." };
  return { level: 0, text: "The way down is open." };
}
