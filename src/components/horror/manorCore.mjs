// src/components/horror/manorCore.mjs
// HOLLOW MANOR — the rules everything else is built on, shared three ways:
// the solo page (manorSim.js), the multiplayer client, and the server, which
// runs the ghosts for a room (config/manorWorld.js).
//
// Why .mjs: the server is CommonJS and loads this with import(). The .mjs
// extension makes Node treat it as a module on any version, without
// "type": "module" in package.json; webpack handles it like any other file.
// For the same reason it imports nothing — the random generator is inlined
// rather than pulled from games/seededRand.js.
//
// No React, no DOM, no sockets.

export const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const R = 0.28;                 // a body's radius, in tiles
export const HURDLE = "h";             // barricade: jump it
export const BEAM = "w";               // low beam: crouch under it
export const CATCH_R = 0.55;           // this close and it has you
export const PICK_R = 0.6;             // this close and a relic is yours
export const EXIT_R = 1.2;             // this close to the far gate and you are out

// What a tile is. Anything but FLOOR stops a body and blocks sight; a ghost
// can path through a DOOR (it stops to open it), never through a LOCKER.
export const FLOOR = 0;
export const WALL = 1;
export const DOOR = 2;                 // a closed door. Open, its tile is FLOOR again.
export const LOCKER = 3;               // a locker set into a wall: step in and hide

export const SNOOP_R = 2.2;            // a ghost this near your locker is snooping
export const SNOOP_MAX = 3;            // seconds of snooping before it opens the door

// Park-Miller, the same generator as games/seededRand.js.
export function rng(seed) {
  let s = (Number(seed) || 1) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── the house ────────────────────────────────────────────────────────────────
// Rooms, not a maze: a grid of 7×7 rooms (8 tiles apart, walls shared), each
// joined to its neighbours by a one-tile doorway. A random tree of doorways
// makes every room reachable; extra ones make loops to run round. About half
// the doorways have a door, starting shut. Each room gets a little furniture
// (single blocks, never in front of a doorway) and a couple of lockers set
// into its walls. Barricades and beams go only in open doorways.
//
// N must be 1 + 8·rooms-per-side. Returns { g, doors, gaps, lockers }:
// doors and gaps are tile indices (y·N + x), lockers are [x, y].

export const ROOM = 8;
export const houseSize = (rooms) => 1 + ROOM * rooms;

export function genHouse(N, rand) {
  const RN = (N - 1) / ROOM;
  for (let tries = 0; ; tries++) {
    const g = Array.from({ length: N }, () => Array(N).fill(WALL));
    const doors = [], gaps = [], lockers = [];
    for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
      for (let y = 1 + ROOM * j; y < ROOM + ROOM * j; y++) for (let x = 1 + ROOM * i; x < ROOM + ROOM * i; x++) g[y][x] = FLOOR;
    }

    // which rooms join: a spanning tree, then some extra links for loops
    const seen = new Set(["0,0"]), st = [[0, 0]], links = [], linked = new Set();
    const link = (i, j, a, b) => { links.push([i, j, a, b]); linked.add(`${i},${j},${a},${b}`); linked.add(`${a},${b},${i},${j}`); };
    while (st.length) {
      const [i, j] = st[st.length - 1];
      const nb = shuffle(D4.map(([a, b]) => [i + a, j + b]), rand)
        .filter(([a, b]) => a >= 0 && b >= 0 && a < RN && b < RN && !seen.has(`${a},${b}`));
      if (!nb.length) { st.pop(); continue; }
      const [a, b] = nb[0];
      seen.add(`${a},${b}`);
      link(i, j, a, b);
      st.push([a, b]);
    }
    for (let k = 0; k < (RN * RN) / 2; k++) {
      const i = (rand() * RN) | 0, j = (rand() * RN) | 0, [a, b] = D4[(rand() * 4) | 0], ni = i + a, nj = j + b;
      if (ni < 0 || nj < 0 || ni >= RN || nj >= RN || linked.has(`${i},${j},${ni},${nj}`)) continue;
      link(i, j, ni, nj);
    }

    // a doorway for each link; the floor either side of it stays clear
    const clear = new Set();
    for (const [i, j, a, b] of links) {
      const o = 1 + ((rand() * 5) | 0);
      let x, y;
      if (a !== i) { x = ROOM * (Math.min(i, a) + 1); y = 1 + ROOM * j + o; clear.add(y * N + x - 1); clear.add(y * N + x + 1); }
      else { y = ROOM * (Math.min(j, b) + 1); x = 1 + ROOM * i + o; clear.add((y - 1) * N + x); clear.add((y + 1) * N + x); }
      if (rand() < 0.55) { g[y][x] = DOOR; doors.push(y * N + x); }
      else { g[y][x] = FLOOR; gaps.push(y * N + x); }
    }

    // furniture, except on the last try, which is bare and always connected
    if (tries < 39) {
      for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
        const n = 2 + ((rand() * 3) | 0);
        for (let k = 0; k < n; k++) {
          const x = 2 + ROOM * i + ((rand() * 5) | 0), y = 2 + ROOM * j + ((rand() * 5) | 0);
          if (!clear.has(y * N + x) && !(x < 4 && y < 4)) g[y][x] = WALL;
        }
      }
    }

    // lockers: in a stretch of plain wall, not beside a doorway or another locker
    for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) for (let k = 0; k < 2; k++) {
      const sd = (rand() * 4) | 0, o = 1 + ((rand() * 5) | 0);
      let x, y, ax = 0, ay = 0;
      if (sd < 2) { x = ROOM * i + (sd ? ROOM : 0); y = 1 + ROOM * j + o; ay = 1; }
      else { y = ROOM * j + (sd === 3 ? ROOM : 0); x = 1 + ROOM * i + o; ax = 1; }
      if ((x === 0 && y === 1) || g[y][x] !== WALL || g[y - ay][x - ax] !== WALL || g[y + ay][x + ax] !== WALL) continue;
      g[y][x] = LOCKER;
      lockers.push([x, y]);
    }

    // every floor tile must be reachable from the start (furniture can wall a
    // corner off); if not, deal again
    const d = dmap(g, N, 1, 1);
    let ok = true;
    for (let y = 0; y < N && ok; y++) for (let x = 0; x < N; x++) if (g[y][x] === FLOOR && d[x + y * N] < 0) { ok = false; break; }
    if (ok || tries >= 39) return { g, doors, gaps, lockers };
  }
}

// Walking distance from one tile to every other (-1: unreachable). Doors
// count as open: a ghost goes through them, and so can you.
export function dmap(g, N, sx, sy) {
  const d = new Int16Array(N * N).fill(-1), q = [sx + sy * N];
  d[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % N, y = (c / N) | 0;
    for (const [a, b] of D4) {
      const nx = x + a, ny = y + b;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || d[nx + ny * N] >= 0) continue;
      const v = g[ny][nx];
      if (v === FLOOR || v === DOOR) {
        d[nx + ny * N] = d[c] + 1;
        q.push(nx + ny * N);
      }
    }
  }
  return d;
}

export function floors(g, N) {
  const f = [];
  for (let y = 0; y < N; y++) for (let x = 1; x < N; x++) if (!g[y][x]) f.push([x, y]);
  return f;
}

// Clear sight: closed doors and lockers block it like walls.
export function los(g, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.15);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const row = g[(ay + (by - ay) * t) | 0];
    if (!row || row[(ax + (bx - ax) * t) | 0]) return false;
  }
  return true;
}

const solid = (g, x, y) => { const row = g[y | 0]; return !row || row[x | 0] !== FLOOR; };
export const canAt = (g, x, y) =>
  !(solid(g, x - R, y - R) || solid(g, x + R, y - R) || solid(g, x - R, y + R) || solid(g, x + R, y + R));

// If a door shut on you (online, a moment of lag can do it), step to the
// nearest spot that is clear.
export function unstick(g, p) {
  if (canAt(g, p.x, p.y)) return false;
  for (let r = 0.1; r <= 1.2; r += 0.1) {
    for (const [a, b] of D4) {
      if (canAt(g, p.x + a * r, p.y + b * r)) { p.x += a * r; p.y += b * r; return true; }
    }
  }
  return false;
}

// The far gate: the deepest cell on the right or bottom edge. The gate is the
// outer-wall tile beside it.
export function farGate(g, N, d0, cells) {
  let far = null;
  for (const c of cells) {
    if ((c[0] === N - 2 || c[1] === N - 2) && (!far || d0[c[0] + c[1] * N] > d0[far[0] + far[1] * N])) far = c;
  }
  return { far, exitT: far[0] === N - 2 ? { x: N - 1, y: far[1] } : { x: far[0], y: N - 1 } };
}

// Barricades and beams, alternating, in about two in three open doorways —
// never one listed in `avoid` ("x,y"), nor the first room's own.
export function gapObstacles(gaps, N, rand, avoid = new Set()) {
  const obst = {};
  let on = 0;
  for (const k of gaps) {
    const x = k % N, y = (k / N) | 0;
    if (avoid.has(`${x},${y}`)) continue;
    if (rand() < 0.65) { obst[k] = on % 2 ? BEAM : HURDLE; on++; }
  }
  return obst;
}

// Floor that isn't a doorway: where relics, batteries and ghosts can go.
export function roomFloors(g, N, doorways) {
  return floors(g, N).filter(([x, y]) => !doorways.has(y * N + x));
}

// ── a body in the halls ──────────────────────────────────────────────────────
// A player's physical state. The same object shape is used on the solo page,
// for your own player online, and (x, y, fa, jz, cr only) for everyone else.

export function newBody(x, y, fa = 0) {
  return {
    x, y, fa, jz: 0, vz: 0, cr: 0, crouch: false, stam: 1, stamCool: 0, runOn: false,
    noiseR: 0, noiseT: 0, stepT: 0, shake: 0, bat: 1, light: true, lightOut: 0,
    entering: false, lastTile: -1, hiding: null, snoop: 0,
  };
}

export const litBody = (p) => p.light && p.lightOut <= 0 && p.bat > 0;

// env: { g, N, obst, doors }
export function mvOK(env, p, nx, ny) {
  if (!canAt(env.g, nx, ny)) return false;
  const ti = (ny | 0) * env.N + (nx | 0);
  if (ti === (p.y | 0) * env.N + (p.x | 0)) return true;   // already in it
  const o = env.obst[ti];
  return !o || (o === HURDLE ? p.jz >= 0.15 : p.cr >= 0.6);
}

export function jumpBody(p) {
  if (p.entering || p.hiding || p.jz > 0 || p.crouch) return false;
  p.vz = 2.9;
  return true;
}

// Walking, running, crouching, jumping, stamina and noise for one frame.
// `inp`: ix, iy (-1..1; iy -1 = forward), turn (-1..1), shift. `emit(name)`
// receives step and landing sounds. Returns whether you moved.
export function stepBody(p, env, inp, dt, emit) {
  let ix = inp.ix || 0, iy = inp.iy || 0;
  p.fa += (inp.turn || 0) * 2.4 * dt;
  if (p.entering) { ix = 0; iy = -1; p.fa = 0; }
  if (p.hiding) { ix = 0; iy = 0; }
  const m = Math.hypot(ix, iy);
  if (m > 1) { ix /= m; iy /= m; }
  const moving = m > 0.1;

  p.cr += ((p.crouch && !p.entering ? 1 : 0) - p.cr) * Math.min(1, dt * 10);
  if (p.jz > 0 || p.vz > 0) {
    p.vz -= 10.5 * dt;
    p.jz += p.vz * dt;
    if (p.jz <= 0) { p.jz = 0; p.vz = 0; p.noiseT = 0.5; p.shake = 0.25; emit("land"); }
  }

  const wantRun = (inp.shift || p.runOn) && moving;
  const run = wantRun && p.stam > 0 && p.stamCool <= 0 && p.cr < 0.5;
  if (run) { p.stam = Math.max(0, p.stam - dt * 0.22); if (p.stam === 0) p.stamCool = 1; }
  else { p.stamCool -= dt; if (!wantRun || p.stamCool > 0) p.stam = Math.min(1, p.stam + dt * (moving ? 0.2 : 0.4)); }
  const sp = p.cr > 0.5 ? 1.7 : run ? 5.4 : 3;

  if (moving) {
    const f = -iy, sd = ix, c = Math.cos(p.fa), n = Math.sin(p.fa);
    const dx = (c * f - n * sd) * sp * dt, dy = (n * f + c * sd) * sp * dt;
    if (!p.entering) { p.stepT -= dt; if (p.stepT <= 0) { p.stepT = run ? 0.3 : 0.55; emit(run ? "stepRun" : "step"); } }
    if (mvOK(env, p, p.x + dx, p.y)) p.x += dx;
    if (mvOK(env, p, p.x, p.y + dy)) p.y += dy;
  }

  p.noiseR = p.entering ? 0 : run ? 8 : moving ? (p.cr > 0.5 ? 1 : 3) : 0;
  if (p.noiseT > 0) { p.noiseT -= dt; p.noiseR = Math.max(p.noiseR, 6); }
  if (p.hiding) p.noiseR = 0;
  p.shake = Math.max(0, p.shake - dt);
  return moving;
}

// The fastest anyone can legitimately cover ground: a sprint (5.4 tiles/s)
// plus slack for jitter. The server refuses reported moves faster than this.
export const MAX_SPEED = 6.2;

// ── doors and lockers ────────────────────────────────────────────────────────
// What "Use" would do right now: the tile a step in front of you. A shut door
// opens, an open one closes (unless someone is standing in it), a locker
// takes you in, and in a locker Use lets you out. `blockers`: other bodies
// and ghosts, [{ x, y }], that a door must not close on.

const inTile = (b, tx, ty) => Math.abs(b.x - tx - 0.5) < 0.52 + R && Math.abs(b.y - ty - 0.5) < 0.52 + R;

export function actionAt(env, p, blockers = []) {
  if (p.hiding) return { t: "out" };
  if (p.entering || p.jz > 0) return null;
  const tx = (p.x + Math.cos(p.fa)) | 0, ty = (p.y + Math.sin(p.fa)) | 0;
  const row = env.g[ty];
  if (!row || tx < 0 || tx >= env.N) return null;
  const v = row[tx];
  if (v === LOCKER) return { t: "hide", x: tx, y: ty };
  if (v === DOOR) return { t: "open", x: tx, y: ty };
  if (v === FLOOR && env.doors && env.doors.has(ty * env.N + tx) && !inTile(p, tx, ty) &&
      !blockers.some((b) => b && inTile(b, tx, ty))) return { t: "close", x: tx, y: ty };
  return null;
}

export const ACTION_LABEL = { open: "Open", close: "Close", hide: "Hide", out: "Leave" };

// Can a door at (x, y) shut now? Same rule as actionAt, for the server.
export const canClose = (env, x, y, bodies) =>
  env.g[y] && env.g[y][x] === FLOOR && env.doors && env.doors.has(y * env.N + x) && !bodies.some((b) => b && inTile(b, x, y));

// Did a ghost see you go in? One that is hunting you, has had you in sight
// in the last two seconds, and can see you now. Returns that ghost, or null.
export function watcher(ghosts, env, p, id) {
  for (const G of ghosts) {
    if (G.st === "hunt" && G.prey === id && G.lose < 2 && los(env.g, G.x, G.y, p.x, p.y)) return G;
  }
  return null;
}

// Into the locker at u = { x, y }, facing out. `seenBy`: the ghost that
// watched you go in, if one did — it will come straight for the locker.
export function hideIn(p, u, seenBy) {
  p.hiding = { x: u.x, y: u.y, bx: p.x, by: p.y, bfa: p.fa, ghost: seenBy || null };
  p.snoop = 0;
  p.fa = Math.atan2(p.y - (u.y + 0.5), p.x - (u.x + 0.5));
  p.x = u.x + 0.5;
  p.y = u.y + 0.5;
  p.crouch = false;
  p.stam = Math.min(1, p.stam + 0.3);
}

export function leaveLocker(p) {
  const h = p.hiding;
  if (!h) return;
  p.x = h.bx; p.y = h.by; p.fa = h.bfa;
  p.hiding = null;
  p.snoop = 0;
}

// A ghost lingering by your locker wears your nerve down; three seconds of it
// (much less if it saw you get in) and it opens the door. Returns true then.
export function snoopStep(p, ghosts, dt) {
  if (!p.hiding) return false;
  let gd = Infinity;
  for (const G of ghosts) gd = Math.min(gd, Math.hypot(G.x - p.x, G.y - p.y));
  if (gd < SNOOP_R) {
    p.snoop += dt * (p.hiding.ghost ? 4 : 1);
    return p.snoop > SNOOP_MAX;
  }
  p.snoop = Math.max(0, p.snoop - dt * 0.5);
  return false;
}

// ── the thing ────────────────────────────────────────────────────────────────
// A ghost patrols, hears noise, and hunts anyone it can see. On first sight it
// freezes for a beat — the warning — then comes. `hustle` adds to its hunting
// speed as the house empties. A shut door stops it for a moment while it
// opens it (with a creak you can hear); someone hiding is invisible to it,
// unless it watched them get in.

export function newGhost(x, y) {
  return { stun: 0, x, y, st: "patrol", tx: 0, ty: 0, dm: null, wait: 0, lose: 0, rt: 0, prey: null };
}

export function ghostTarget(G, env, x, y) { G.tx = x; G.ty = y; G.dm = dmap(env.g, env.N, x, y); }

export function ghostPatrol(G, env, rand) {
  let f = floors(env.g, env.N).filter((c) => Math.hypot(c[0] - G.x, c[1] - G.y) > 9);
  if (!f.length) f = floors(env.g, env.N);
  const c = f[(rand() * f.length) | 0];
  ghostTarget(G, env, c[0], c[1]);
}

// Can it see this body? 6 tiles with the torch on, 2.2 without, less again
// crouched, and only along a clear line. Never someone in a locker.
export function ghostSees(G, env, t) {
  if (t.hid) return false;
  const d = Math.hypot(t.x - G.x, t.y - G.y);
  return d < (t.lit ? 6 : 2.2) * (t.cr > 0.5 ? 0.7 : 1) && los(env.g, G.x, G.y, t.x, t.y);
}

export function ghostSpeed(G, hustle = 0) {
  if (G.stun > 0) return 0;
  if (G.st === "hunt") return Math.min(3.4, 2.5 + hustle);
  return G.st === "search" ? 2.1 : 1.4;
}

// One step of one ghost. `targets`: the living, [{ id, x, y, lit, cr, noiseR,
// hid }] — `hid` is the body's `hiding` while it is in a locker.
// `emit(name, extra)` hears "spotted", "lost" and "door" ({ x, y }: it opened
// one). Returns the id of whoever it caught this step, or null.
export function stepGhost(G, env, targets, dt, rand, hustle, emit) {
  if (G.stun > 0) G.stun -= dt;

  // it watched someone get into a locker: it goes to the locker door
  for (const t of targets) {
    if (!t.hid || t.hid.ghost !== G) continue;
    G.st = "hunt"; G.prey = t.id; G.lose = 0; G.rt -= dt;
    if (G.rt <= 0) { ghostTarget(G, env, t.hid.bx | 0, t.hid.by | 0); G.rt = 0.5; }
  }

  let seen = null, seenD = Infinity;
  for (const t of targets) {
    if (!ghostSees(G, env, t)) continue;
    const d = Math.hypot(t.x - G.x, t.y - G.y);
    if (d < seenD) { seen = t; seenD = d; }
  }
  if (seen) {
    if (G.st !== "hunt" || G.prey !== seen.id) {
      if (G.st !== "hunt") { G.stun = 1.1; emit("spotted", { id: seen.id }); }
      G.st = "hunt"; G.prey = seen.id; G.rt = 0;
    }
    G.lose = 0; G.rt -= dt;
    if (G.rt <= 0) { ghostTarget(G, env, seen.x | 0, seen.y | 0); G.rt = 0.25; }
  } else if (G.st === "hunt") {
    G.lose += dt;
    if (G.lose > 5) { G.st = "search"; G.wait = 0; G.prey = null; emit("lost", {}); }
  }
  if (G.st === "patrol") {
    let heard = null, hd = Infinity;
    for (const t of targets) {
      if (t.hid) continue;
      const d = Math.hypot(t.x - G.x, t.y - G.y);
      if (d < t.noiseR && d < hd) { heard = t; hd = d; }
    }
    if (heard) { G.st = "search"; G.wait = 0; ghostTarget(G, env, heard.x | 0, heard.y | 0); }
  }

  const spd = ghostSpeed(G, hustle), N = env.N;
  const gx = G.x | 0, gy = G.y | 0;
  let bd = G.dm ? G.dm[gx + gy * N] : -1, best = null;
  if (bd === 0) best = [gx, gy];
  else if (bd > 0) {
    for (const [a, b] of D4) {
      const nd = G.dm[(gx + a) + (gy + b) * N];
      if (nd >= 0 && nd < bd) { bd = nd; best = [gx + a, gy + b]; }
    }
  }
  // a shut door in its way: it stops and opens it
  if (best && env.g[best[1]][best[0]] === DOOR && G.stun <= 0) {
    env.g[best[1]][best[0]] = FLOOR;
    G.stun = 1.1;
    emit("door", { x: best[0], y: best[1] });
    best = null;
  } else if (best && env.g[best[1]][best[0]] === DOOR) best = null;   // still opening it
  else {
    let arrived = false;
    if (best) {
      const dx = best[0] + 0.5 - G.x, dy = best[1] + 0.5 - G.y, l = Math.hypot(dx, dy);
      if (l < 0.08 && bd === 0) arrived = true;
      else if (l > 0) { const v = Math.min(spd * dt, l); G.x += (dx / l) * v; G.y += (dy / l) * v; }
    } else arrived = true;
    if (arrived && !seen) {
      if (G.st === "hunt") { G.st = "search"; G.wait = 0; G.prey = null; }
      if (G.st === "search") { G.wait += dt; if (G.wait > 2.5) { G.st = "patrol"; ghostPatrol(G, env, rand); } }
      else ghostPatrol(G, env, rand);
    }
  }
  for (const t of targets) if (!t.hid && Math.hypot(t.x - G.x, t.y - G.y) < CATCH_R) return t.id;
  return null;
}

// ── a house for a room ───────────────────────────────────────────────────────
// Everyone starts in the first room; the gate you came in by is already shut.
//
// sides: [{ key, need }] — whose relics are whose. Relics are dealt out so
// every side's set sits at a similar spread of distances from the start:
// sorted by distance, then dealt in snake order (1,2,3,3,2,1,…), so nobody
// gets all the near ones.

// The house grows with the crowd: 3×3 rooms alone, up to 6×6 for eight.
export function sizeFor(players) {
  const n = Math.max(1, players);
  return houseSize(n <= 1 ? 3 : n <= 3 ? 4 : n <= 6 ? 5 : 6);
}
export const ghostsFor = (players) => (players >= 7 ? 3 : players >= 4 ? 2 : 1);

export function buildHouse(seed, { players, sides }) {
  const rand = rng((Number(seed) || 1) * 7 + 99991);
  const N = sizeFor(players);
  const { g, doors, gaps, lockers } = genHouse(N, rand);
  const doorways = new Set([...doors, ...gaps]);
  const d0 = dmap(g, N, 1, 1);
  const cells = shuffle(roomFloors(g, N, doorways), rand);
  const { exitT } = farGate(g, N, d0, cells);
  g[exitT.y][exitT.x] = WALL;                          // never a locker
  const taken = new Set(["1,1", "2,1", "1,2"]);
  const key = (c) => `${c[0]},${c[1]}`;

  // Relic spots: far enough in, not beside the gate, as spread out as the
  // count allows.
  const total = sides.reduce((a, s) => a + s.need, 0);
  const ok = (c) => d0[c[0] + c[1] * N] >= 10 && Math.hypot(c[0] - exitT.x, c[1] - exitT.y) >= 5;
  let spots = [];
  for (let gap = 7; gap >= 1 && spots.length < total; gap--) {
    spots = [];
    for (const c of cells) {
      if (spots.length >= total) break;
      if (!ok(c) || taken.has(key(c))) continue;
      if (spots.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) > gap)) spots.push(c);
    }
  }
  spots.sort((a, b) => d0[a[0] + a[1] * N] - d0[b[0] + b[1] * N]);
  const relics = [];
  const order = [], dealt = sides.map(() => 0);
  for (let round = 0; order.length < total && round < 100; round++) {
    const seq = sides.map((_, i) => i);
    if (round % 2) seq.reverse();
    for (const i of seq) if (dealt[i] < sides[i].need) { order.push(i); dealt[i]++; }
  }
  spots.forEach((c, i) => {
    const s = sides[order[i]];
    if (!s) return;
    relics.push({ x: c[0] + 0.5, y: c[1] + 0.5, side: s.key, got: false });
    taken.add(key(c));
  });

  // Batteries, shared: first to reach one takes it.
  const want = 2 + Math.ceil(players * 0.75);
  const batts = [];
  for (const c of cells) {
    if (batts.length >= want) break;
    if (taken.has(key(c)) || d0[c[0] + c[1] * N] <= 6) continue;
    if (batts.every((o) => Math.hypot(o.x - c[0] - 0.5, o.y - c[1] - 0.5) > 6)) {
      batts.push({ x: c[0] + 0.5, y: c[1] + 0.5, got: false });
      taken.add(key(c));
    }
  }

  const obst = gapObstacles(gaps, N, rand);

  // Ghosts start deep in, apart from each other.
  const ghosts = [];
  const nG = ghostsFor(players);
  const deep = cells.filter((c) => d0[c[0] + c[1] * N] > N * 0.8);
  for (const c of deep) {
    if (ghosts.length >= nG) break;
    if (ghosts.every((o) => Math.hypot(o.x - c[0], o.y - c[1]) > N / 3)) ghosts.push(newGhost(c[0] + 0.5, c[1] + 0.5));
  }
  while (ghosts.length < nG) {
    const c = deep[(rand() * deep.length) | 0] || cells[0];
    ghosts.push(newGhost(c[0] + 0.5, c[1] + 0.5));
  }

  return {
    N, g, exitT, relics, batts, obst, ghosts, doors,
    lockers: lockers.filter(([x, y]) => g[y][x] === LOCKER),
    spawn: { x: 1.5, y: 1.5 }, rand,
  };
}

// The house as a string of rows, for sending: '#' wall, '.' floor, 'D' a
// shut door, 'L' a locker. Which doorways have doors travels separately.
const CH = [".", "#", "D", "L"];
export const packWalls = (g) => g.map((r) => r.map((v) => CH[v] || "#").join("")).join("/");
export const unpackWalls = (s) => s.split("/").map((r) => [...r].map((ch) => { const v = CH.indexOf(ch); return v < 0 ? WALL : v; }));
