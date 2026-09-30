// scripts/check-wick.mjs — the rules of WICK, with no browser.
//
//   node scripts/check-wick.mjs
//
// The promise the game makes is that nothing kills you without warning. The
// important checks here are the ones that hold that promise to account: across
// thousands of seeded turns, a move the page marks safe never kills, and a
// move it marks deadly always does.
import {
  COLS, ROWS, SHADE, CRAWLER, LUNGER, START_OIL, FLASK_OIL, DESCEND_OIL, FLARE_COST, BRIGHT_AT, DIM_AT,
  ACTIONS, DARK, DARK_STEPS, idx, radiusFor, makeFloor, newRun, clone, act, preview, threats, laneOf, canAct, warning,
} from "../src/components/horror/wickSim.js";

let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

// A hand-built room: open floor, one monster, you where you are told.
function room({ player, monsters = [], walls = [], oil = START_OIL, flasks = [], key = null, hasKey = true, exit = { x: 6, y: 0 } }) {
  const s = newRun(1);
  s.walls = new Array(COLS * ROWS).fill(false);
  for (const [x, y] of walls) s.walls[idx(x, y)] = true;
  s.player = { ...player };
  s.oil = oil;
  s.flasks = flasks.map(([x, y]) => ({ x, y }));
  s.key = key && { x: key[0], y: key[1] };
  s.hasKey = hasKey;
  s.exit = exit;
  s.monsters = monsters.map((m, i) => ({ id: i + 1, aim: null, rest: 0, stun: 0, ready: false, ...m }));
  return s;
}

// ── floors ───────────────────────────────────────────────────────────────────
{
  let okAll = true, sameAll = true, detour = true, why = "";
  for (let seed = 1; seed <= 300; seed++) {
    for (let depth = 1; depth <= 10; depth++) {
      const f = makeFloor(seed, depth);
      const g = makeFloor(seed, depth);
      if (JSON.stringify(f) !== JSON.stringify(g)) sameAll = false;
      // flood fill: everything open is reachable from the start
      const seen = new Set([idx(f.start.x, f.start.y)]);
      const q = [f.start];
      while (q.length) {
        const t = q.shift();
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const x = t.x + dx, y = t.y + dy;
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS || f.walls[idx(x, y)] || seen.has(idx(x, y))) continue;
          seen.add(idx(x, y)); q.push({ x, y });
        }
      }
      const open = f.walls.filter((w) => !w).length;
      if (seen.size !== open) { okAll = false; why = `seed ${seed} depth ${depth} sealed`; }
      const all = [f.start, f.exit, f.key, ...f.flasks, ...f.monsters];
      if (all.some((t) => f.walls[idx(t.x, t.y)])) { okAll = false; why = `seed ${seed} depth ${depth} thing in a wall`; }
      if (new Set(all.map((t) => idx(t.x, t.y))).size !== all.length) { okAll = false; why = `seed ${seed} depth ${depth} overlap`; }
      if (f.key.x === f.start.x && f.key.y === f.start.y) detour = false;
      for (const m of f.monsters) {
        if (m.kind === LUNGER && (m.x === f.start.x || m.y === f.start.y)) { okAll = false; why = `seed ${seed} depth ${depth} lunger faces start`; }
      }
    }
  }
  check("3000 floors: all reachable, nothing overlaps, no lunger aimed at the start", okAll, why);
  check("floors are identical for the same seed and depth", sameAll);
  check("the key is never where you stand", detour);
  const kinds = (d) => makeFloor(7, d).monsters.map((m) => m.kind);
  check("depth 1 is shades only", kinds(1).every((k) => k === SHADE));
  check("crawlers arrive at depth 2", kinds(2).includes(CRAWLER) && !kinds(2).includes(LUNGER));
  check("the tall one arrives at depth 3", kinds(3).includes(LUNGER));
  check("deeper floors are more crowded", kinds(9).length > kinds(3).length && kinds(3).length > kinds(1).length);
}

// ── light ────────────────────────────────────────────────────────────────────
check("radius steps down at the thresholds",
  radiusFor(BRIGHT_AT) === 2 && radiusFor(BRIGHT_AT - 1) === 1 && radiusFor(DIM_AT) === 1 &&
  radiusFor(DIM_AT - 1) === 0 && radiusFor(1) === 0 && radiusFor(0) === -1);

// ── moving ───────────────────────────────────────────────────────────────────
{
  const s = room({ player: { x: 3, y: 4 }, walls: [[3, 3]] });
  const before = JSON.stringify(s);
  check("walking into a wall is refused and costs nothing", act(s, "up") === null && JSON.stringify(s) === before);
  const t = room({ player: { x: 0, y: 0 } });
  check("walking off the board is refused", act(t, "left") === null && act(t, "up") === null);
  const u = room({ player: { x: 3, y: 4 }, monsters: [{ kind: CRAWLER, x: 3, y: 3 }] });
  check("walking into a monster is refused", act(u, "up") === null);
  const v = room({ player: { x: 3, y: 4 }, oil: 10 });
  act(v, "right");
  check("a step costs one oil", v.oil === 9 && v.player.x === 4);
  act(v, "wait");
  check("waiting costs one oil too", v.oil === 8 && v.player.x === 4);
  const w = room({ player: { x: 3, y: 4 }, oil: 10, flasks: [[4, 4]] });
  act(w, "right");
  check("a flask is picked up and refills", w.oil === 10 - 1 + FLASK_OIL && w.flasks.length === 0);
}

// ── key and exit ─────────────────────────────────────────────────────────────
{
  const s = room({ player: { x: 5, y: 0 }, hasKey: false, key: [5, 1] });
  act(s, "right");
  check("the stairs do nothing without the key", s.depth === 1 && s.player.x === 6);
  const t = room({ player: { x: 5, y: 1 }, hasKey: false, key: [5, 0] });
  act(t, "up");
  check("stepping on the key takes it", t.hasKey && t.key === null);
  const ev = act(t, "right");
  check("with the key, the stairs take you down", ev.descended && t.depth === 2 && !t.hasKey);
  check("oil carries down with you, plus what is left at the foot of the stair", t.oil === START_OIL - 2 + DESCEND_OIL);
  check("the new floor is a real one", t.monsters.length > 0 && t.player.y === ROWS - 1);
}

// ── shades ───────────────────────────────────────────────────────────────────
{
  // radius 2: a shade two tiles off stays out of the light
  const s = room({ player: { x: 3, y: 6 }, oil: 20, monsters: [{ kind: SHADE, x: 3, y: 2 }] });
  for (let i = 0; i < 6; i++) act(s, "wait");
  const m = s.monsters[0];
  check("a shade stops at the edge of the light", m.x === 3 && m.y === 3 && !s.dead, `at ${m.x},${m.y}`);

  // shrink the light and it closes in
  s.oil = BRIGHT_AT - 1;              // next wait: radius 1
  act(s, "wait");
  check("when the light shrinks, the shade closes in", s.monsters[0].y === 4, `y=${s.monsters[0].y}`);

  // walk at it: it backs away rather than letting itself be lit
  const t = room({ player: { x: 3, y: 7 }, oil: 20, monsters: [{ kind: SHADE, x: 3, y: 4 }] });
  act(t, "up");
  check("a lit shade backs away", manhattanOk(t), `shade ${t.monsters[0].x},${t.monsters[0].y}`);

  // lantern out: it comes
  const u = room({ player: { x: 3, y: 6 }, oil: 1, monsters: [{ kind: SHADE, x: 3, y: 4 }] });
  act(u, "wait");                     // oil 0, light out, shade -> 3,5
  check("with the lantern out, a shade comes for you", !u.dead && u.monsters[0].y === 5);
  act(u, "wait");
  check("…and takes you", u.dead && u.dead.kind === SHADE);

  // radius 0: it can stand next to you, but not on you
  const v = room({ player: { x: 3, y: 6 }, oil: 4, monsters: [{ kind: SHADE, x: 3, y: 5 }] });
  act(v, "wait");                     // oil 3, radius 0
  check("at radius 0 a shade can stand beside you but not reach you", !v.dead);
}
function manhattanOk(s) {
  const m = s.monsters[0];
  return Math.abs(m.x - s.player.x) + Math.abs(m.y - s.player.y) > radiusFor(s.oil);
}

// ── the dark ─────────────────────────────────────────────────────────────────
{
  // nothing on the floor at all: running dry must still end it
  const s = room({ player: { x: 3, y: 6 }, oil: 1 });
  const alive = [];
  for (let i = 0; i < DARK_STEPS + 2 && !s.dead; i++) { act(s, "wait"); alive.push(!s.dead); }
  check(`with the lantern out you get ${DARK_STEPS} more steps`, alive.join() === "true,true,true,true,false", alive.join());
  check("then the dark takes you", s.dead && s.dead.kind === DARK);
  const t = room({ player: { x: 3, y: 6 }, oil: 1, flasks: [[3, 3]] });
  act(t, "up"); act(t, "up"); act(t, "up");
  check("a flask in the dark relights the lantern", !t.dead && t.oil > 0 && t.dark === 0);
  const u = room({ player: { x: 3, y: 6 }, oil: 0 });
  u.dark = DARK_STEPS;
  check("the last step in the dark is marked deadly", preview(u).wait.deadly && preview(u).up.deadly);
}

// ── crawlers ─────────────────────────────────────────────────────────────────
{
  const s = room({ player: { x: 3, y: 8 }, monsters: [{ kind: CRAWLER, x: 3, y: 2 }] });
  const ys = [];
  for (let i = 0; i < 6; i++) { act(s, "wait"); ys.push(s.monsters[0].y); }
  check("a crawler moves every other turn", ys.join(",") === "2,3,3,4,4,5", ys.join(","));
  check("its reach is marked only on the turn it will move",
    s.monsters[0].ready === false && threats(s).length === 0);
  act(s, "wait");
  check("…and marked when it will", s.monsters[0].ready && threats(s).some((t) => t.kind === CRAWLER));

  const t = room({ player: { x: 3, y: 5 }, monsters: [{ kind: CRAWLER, x: 3, y: 3, ready: true }] });
  const pv = preview(t);
  check("stepping next to a ready crawler is marked deadly", pv.up.deadly && pv.up.by === CRAWLER);
  check("stepping away is marked safe", !pv.down.deadly && !pv.left.deadly && !pv.right.deadly);
  act(t, "up");
  check("and it is deadly", t.dead && t.dead.kind === CRAWLER);
}

// ── the tall one ─────────────────────────────────────────────────────────────
{
  const s = room({ player: { x: 3, y: 8 }, monsters: [{ kind: LUNGER, x: 3, y: 1 }] });
  act(s, "wait");
  const m = s.monsters[0];
  check("it takes aim when it sees you down a column", m.aim && m.aim.dy === 1 && !s.dead);
  check("the lane is marked all the way down", threats(s).filter((t) => t.kind === LUNGER).length === 7);
  check("the page is told", warning(s).level === 3);
  const pv = preview(s);
  check("staying in the lane is marked deadly", pv.wait.deadly && pv.up.deadly && pv.down.deadly === false);
  check("stepping out of the lane is marked safe", !pv.left.deadly && !pv.right.deadly);
  const dodge = clone(s);
  act(dodge, "right");
  check("stepping out: it charges past and you live",
    !dodge.dead && dodge.monsters[0].y === 8 && dodge.monsters[0].x === 3, `at ${dodge.monsters[0].x},${dodge.monsters[0].y}`);
  check("after charging it rests", dodge.monsters[0].rest === 1 && !dodge.monsters[0].aim);
  act(s, "up");
  check("staying in: it charges into you", s.dead && s.dead.kind === LUNGER);

  const t = room({ player: { x: 3, y: 8 }, walls: [[3, 5]], monsters: [{ kind: LUNGER, x: 3, y: 1 }] });
  act(t, "wait");
  check("a pillar between you blocks its sight", !t.monsters[0].aim);

  const u = room({ player: { x: 3, y: 8 }, monsters: [{ kind: LUNGER, x: 3, y: 1 }] });
  act(u, "wait");
  u.walls[idx(3, 6)] = true;          // put a pillar in the way after it aimed
  act(u, "wait");
  check("hiding behind a pillar mid-aim stops the charge short", !u.dead && u.monsters[0].y === 5);
}

// ── flare ────────────────────────────────────────────────────────────────────
{
  const s = room({
    player: { x: 3, y: 4 }, oil: 12,
    monsters: [{ kind: SHADE, x: 3, y: 1 }, { kind: SHADE, x: 0, y: 0 }, { kind: CRAWLER, x: 5, y: 4, ready: true }],
  });
  const ev = act(s, "flare");
  check("a flare costs its oil", s.oil === 12 - FLARE_COST);
  check("a flare burns the shades in range and spares the rest",
    ev.burned.length === 1 && s.monsters.filter((m) => m.kind === SHADE).length === 1);
  check("a flare stuns a crawler", s.monsters.find((m) => m.kind === CRAWLER).x === 5);
  const low = room({ player: { x: 3, y: 4 }, oil: FLARE_COST });
  check("no flare without the oil to spare", !canAct(low, "flare") && act(low, "flare") === null);

  const t = room({ player: { x: 3, y: 8 }, oil: 12, monsters: [{ kind: LUNGER, x: 3, y: 5 }] });
  act(t, "wait");
  check("(set-up) the tall one has aimed", !!t.monsters[0].aim);
  act(t, "flare");
  check("a flare breaks its aim", !t.dead && !t.monsters[0].aim);
}

// ── the promise: warnings never lie ──────────────────────────────────────────
// Play thousands of turns from random seeds, choosing moves at random, and at
// every turn compare what preview() said against what act() did.
{
  let turns = 0, lies = 0, deathsWithoutWarning = 0, example = "";
  let rng = 12345;
  const r = () => { rng = (rng * 16807) % 2147483647; return rng / 2147483647; };
  for (let seed = 1; seed <= 400; seed++) {
    const s = newRun(seed);
    for (let n = 0; n < 200 && !s.dead; n++) {
      const pv = preview(s);
      const legal = ACTIONS.filter((a) => pv[a].ok);
      // mostly the safe moves, sometimes a deadly one, so deaths are tested too
      const safe = legal.filter((a) => !pv[a].deadly);
      const a = (safe.length && r() < 0.9) ? safe[Math.floor(r() * safe.length)] : legal[Math.floor(r() * legal.length)];
      const ev = act(s, a);
      turns++;
      if (!!ev.dead !== pv[a].deadly) { lies++; example = `seed ${seed} turn ${n} ${a}`; }
      if (ev.dead && !pv[a].deadly) deathsWithoutWarning++;
    }
  }
  check(`${turns} random turns: preview always matches the outcome`, lies === 0, example);
  check("no death was ever unmarked", deathsWithoutWarning === 0);
}

// ── balance: a careful player ────────────────────────────────────────────────
// A bot that never takes a marked-deadly move and heads for flask, key, then
// stairs. Not a good player — it has no plan — but it shows the curve: runs
// should end, they should end deeper than the first floor, and they should end
// in a couple of minutes' worth of taps.
function bot(seed) {
  const s = newRun(seed);
  let taps = 0, waits = 0, flares = 0;
  while (!s.dead && taps < 2000) {
    const pv = preview(s);
    const target = pickTarget(s);
    const dist = bfs(s, target);
    let best = null, bestScore = Infinity;
    for (const a of ["up", "right", "down", "left", "wait"]) {
      if (!pv[a].ok || pv[a].deadly) continue;
      const d = a === "wait" ? [0, 0] : { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }[a];
      const x = s.player.x + d[0], y = s.player.y + d[1];
      let score = dist[idx(x, y)] < 0 ? 99 : dist[idx(x, y)];
      if (threats(s).some((t) => t.x === x && t.y === y)) score += 5;
      if (a === "wait") score += 0.5;
      if (score < bestScore) { bestScore = score; best = a; }
    }
    // stuck behind something the light froze: burn it out of the way
    if ((best === "wait" || !best) && pv.flare.ok && !pv.flare.deadly &&
        s.monsters.some((m) => m.kind === SHADE && Math.abs(m.x - s.player.x) + Math.abs(m.y - s.player.y) <= 2)) best = "flare";
    if (!best) best = ["up", "right", "down", "left", "wait"].find((a) => pv[a].ok) || "wait";
    if (best === "wait") waits++;
    if (best === "flare") flares++;
    act(s, best);
    taps++;
  }
  return { depth: s.depth, taps, by: s.dead && s.dead.kind, burned: s.burned, waits, flares };
}
function pickTarget(s) {
  const p = s.player;
  const d = (t) => Math.abs(t.x - p.x) + Math.abs(t.y - p.y);
  const flask = s.flasks.slice().sort((a, b) => d(a) - d(b))[0];
  if (flask && (s.oil < 10 || (s.oil < 22 && d(flask) <= 5))) return flask;
  if (!s.hasKey) return s.key;
  return s.exit;
}
function bfs(s, t) {
  const out = new Array(COLS * ROWS).fill(-1);
  out[idx(t.x, t.y)] = 0;
  const q = [t];
  while (q.length) {
    const c = q.shift();
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const x = c.x + dx, y = c.y + dy;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS || s.walls[idx(x, y)] || out[idx(x, y)] >= 0) continue;
      out[idx(x, y)] = out[idx(c.x, c.y)] + 1;
      q.push({ x, y });
    }
  }
  return out;
}
{
  const runs = [];
  for (let seed = 1; seed <= 500; seed++) runs.push(bot(seed));
  const depths = runs.map((r) => r.depth).sort((a, b) => a - b);
  const med = depths[Math.floor(depths.length / 2)];
  const taps = runs.map((r) => r.taps).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  const by = {};
  for (const r of runs) by[r.by || "alive"] = (by[r.by || "alive"] || 0) + 1;
  const hist = {};
  for (const d of depths) hist[d] = (hist[d] || 0) + 1;
  console.log(`      bot: median depth ${med}, median taps ${taps}, best ${depths[depths.length - 1]}`);
  console.log(`      died to: ${JSON.stringify(by)}`);
  const mean = (k) => (runs.reduce((a, r) => a + r[k], 0) / runs.length).toFixed(1);
  console.log(`      per run: ${mean("taps")} taps, ${mean("waits")} waits, ${mean("flares")} flares`);
  console.log(`      depth reached: ${JSON.stringify(hist)}`);
  check("every run ends", runs.every((r) => r.by));
  check("a careful player gets past the first floor", med >= 2);
  check("but not forever — runs stay short", depths[depths.length - 1] <= 20 && taps <= 250);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
