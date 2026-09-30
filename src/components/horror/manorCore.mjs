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

// A recursive-backtracker maze on odd cells, then some walls knocked through
// so there are loops to run round.
export function genMaze(N, rand, loops = 60) {
  const g = Array.from({ length: N }, () => Array(N).fill(1));
  const st = [[1, 1]];
  g[1][1] = 0;
  while (st.length) {
    const [x, y] = st[st.length - 1];
    const d = shuffle(D4.map(([a, b]) => [a * 2, b * 2]), rand).filter(([a, b]) => {
      const nx = x + a, ny = y + b;
      return nx > 0 && ny > 0 && nx < N - 1 && ny < N - 1 && g[ny][nx];
    });
    if (!d.length) { st.pop(); continue; }
    const [a, b] = d[0];
    g[y + b / 2][x + a / 2] = 0;
    g[y + b][x + a] = 0;
    st.push([x + a, y + b]);
  }
  for (let i = 0; i < loops; i++) {
    const x = 1 + ((rand() * (N - 2)) | 0), y = 1 + ((rand() * (N - 2)) | 0);
    if (g[y][x] && ((x % 2 && !(y % 2) && !g[y - 1][x] && !g[y + 1][x]) ||
                    (!(x % 2) && y % 2 && !g[y][x - 1] && !g[y][x + 1]))) g[y][x] = 0;
  }
  return g;
}

// Walking distance from one tile to every other (-1: unreachable).
export function dmap(g, N, sx, sy) {
  const d = new Int16Array(N * N).fill(-1), q = [sx + sy * N];
  d[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % N, y = (c / N) | 0;
    for (const [a, b] of D4) {
      const nx = x + a, ny = y + b;
      if (nx >= 0 && ny >= 0 && nx < N && ny < N && !g[ny][nx] && d[nx + ny * N] < 0) {
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

export function los(g, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.15);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const row = g[(ay + (by - ay) * t) | 0];
    if (!row || row[(ax + (bx - ax) * t) | 0]) return false;
  }
  return true;
}

const solid = (g, x, y) => { const row = g[y | 0]; return !row || row[x | 0] !== 0; };
export const canAt = (g, x, y) =>
  !(solid(g, x - R, y - R) || solid(g, x + R, y - R) || solid(g, x - R, y + R) || solid(g, x + R, y + R));

// The far gate: the deepest cell on the right or bottom edge. The gate is the
// outer-wall tile beside it.
export function farGate(g, N, d0, cells) {
  let far = null;
  for (const c of cells) {
    if ((c[0] === N - 2 || c[1] === N - 2) && (!far || d0[c[0] + c[1] * N] > d0[far[0] + far[1] * N])) far = c;
  }
  return { far, exitT: far[0] === N - 2 ? { x: N - 1, y: far[1] } : { x: far[0], y: N - 1 } };
}

// Barricades and beams, only across straight corridors, well spaced, never on
// a tile listed in `avoid` ("x,y").
export function placeObstacles(g, N, d0, cells, avoid, max = 8) {
  const obst = {};
  const oc = cells.filter(([x, y]) => {
    if (d0[x + y * N] < 5 || (x < 4 && y < 4) || avoid.has(`${x},${y}`)) return false;
    return (!g[y][x - 1] && !g[y][x + 1] && g[y - 1][x] && g[y + 1][x]) ||
           (!g[y - 1][x] && !g[y + 1][x] && g[y][x - 1] && g[y][x + 1]);
  });
  let on = 0;
  for (const c of oc) {
    if (on >= max) break;
    if (Object.keys(obst).every((k) => Math.hypot((k % N) - c[0], ((k / N) | 0) - c[1]) > 5)) {
      obst[c[0] + c[1] * N] = on % 2 ? BEAM : HURDLE;
      on++;
    }
  }
  return obst;
}

// ── a body in the halls ──────────────────────────────────────────────────────
// A player's physical state. The same object shape is used on the solo page,
// for your own player online, and (x, y, fa, jz, cr only) for everyone else.

export function newBody(x, y, fa = 0) {
  return {
    x, y, fa, jz: 0, vz: 0, cr: 0, crouch: false, stam: 1, stamCool: 0, runOn: false,
    noiseR: 0, noiseT: 0, stepT: 0, shake: 0, bat: 1, light: true, lightOut: 0,
    entering: false, lastTile: -1,
  };
}

export const litBody = (p) => p.light && p.lightOut <= 0 && p.bat > 0;

// env: { g, N, obst }
export function mvOK(env, p, nx, ny) {
  if (!canAt(env.g, nx, ny)) return false;
  const ti = (ny | 0) * env.N + (nx | 0);
  if (ti === (p.y | 0) * env.N + (p.x | 0)) return true;   // already in it
  const o = env.obst[ti];
  return !o || (o === HURDLE ? p.jz >= 0.15 : p.cr >= 0.6);
}

export function jumpBody(p) {
  if (p.entering || p.jz > 0 || p.crouch) return false;
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
  p.shake = Math.max(0, p.shake - dt);
  return moving;
}

// The fastest anyone can legitimately cover ground: a sprint (5.4 tiles/s)
// plus slack for jitter. The server refuses reported moves faster than this.
export const MAX_SPEED = 6.2;

// ── the thing ────────────────────────────────────────────────────────────────
// A ghost patrols, hears noise, and hunts anyone it can see. On first sight it
// freezes for a beat — the warning — then comes. `hustle` adds to its hunting
// speed as the house empties.

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
// crouched, and only along a clear line.
export function ghostSees(G, env, t) {
  const d = Math.hypot(t.x - G.x, t.y - G.y);
  return d < (t.lit ? 6 : 2.2) * (t.cr > 0.5 ? 0.7 : 1) && los(env.g, G.x, G.y, t.x, t.y);
}

export function ghostSpeed(G, hustle = 0) {
  if (G.stun > 0) return 0;
  if (G.st === "hunt") return Math.min(3.4, 2.5 + hustle);
  return G.st === "search" ? 2.1 : 1.4;
}

// One step of one ghost. `targets`: the living, [{ id, x, y, lit, cr, noiseR }].
// `emit(name, extra)` hears "spotted" and "lost". Returns the id of whoever it
// caught this step, or null.
export function stepGhost(G, env, targets, dt, rand, hustle, emit) {
  if (G.stun > 0) G.stun -= dt;
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
  for (const t of targets) if (Math.hypot(t.x - G.x, t.y - G.y) < CATCH_R) return t.id;
  return null;
}

// ── a house for a room ───────────────────────────────────────────────────────
// Everyone starts in the first hall; the gate you came in by is already shut.
//
// sides: [{ key, need }] — whose relics are whose. Relics are dealt out so
// every side's set sits at a similar spread of distances from the start:
// sorted by distance, then dealt in snake order (1,2,3,3,2,1,…), so nobody
// gets all the near ones.

// The house grows with the crowd.
export function sizeFor(players) {
  const n = Math.max(1, players);
  return n <= 1 ? 29 : n === 2 ? 31 : n <= 4 ? 35 : n <= 6 ? 39 : 43;
}
export const ghostsFor = (players) => (players >= 7 ? 3 : players >= 4 ? 2 : 1);

export function buildHouse(seed, { players, sides }) {
  const rand = rng((Number(seed) || 1) * 7 + 99991);
  const N = sizeFor(players);
  const g = genMaze(N, rand, Math.round(60 * (N * N) / (27 * 27)));   // loops scale with the floor
  const d0 = dmap(g, N, 1, 1);
  const cells = shuffle(floors(g, N), rand);
  const { exitT } = farGate(g, N, d0, cells);
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

  const obst = placeObstacles(g, N, d0, cells, taken, 8 + Math.floor((N - 27) / 3));

  // Ghosts start deep in, apart from each other.
  const ghosts = [];
  const nG = ghostsFor(players);
  const deep = cells.filter((c) => d0[c[0] + c[1] * N] > N * 0.8 && !obst[c[0] + c[1] * N]);
  for (const c of deep) {
    if (ghosts.length >= nG) break;
    if (ghosts.every((o) => Math.hypot(o.x - c[0], o.y - c[1]) > N / 3)) ghosts.push(newGhost(c[0] + 0.5, c[1] + 0.5));
  }
  while (ghosts.length < nG) {
    const c = deep[(rand() * deep.length) | 0] || cells[0];
    ghosts.push(newGhost(c[0] + 0.5, c[1] + 0.5));
  }

  return { N, g, exitT, relics, batts, obst, ghosts, spawn: { x: 1.5, y: 1.5 }, rand };
}

// The walls as a string of rows, for sending: '#' wall, '.' floor.
export const packWalls = (g) => g.map((r) => r.map((v) => (v ? "#" : ".")).join("")).join("/");
export const unpackWalls = (s) => s.split("/").map((r) => [...r].map((ch) => (ch === "#" ? 1 : 0)));
