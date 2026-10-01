// scripts/check-manor.mjs — the rules of HOLLOW MANOR, with no browser.
//
//   node scripts/check-manor.mjs
//
// The house must always be finishable (every relic and the far gate reachable,
// every barricade and beam passable), the thing must behave as the page tells
// you it does — doors, lockers and all — and a bot that walks the rooms,
// opening doors as it goes, must be able to get out.
import {
  HURDLE, BEAM, FLOOR, WALL, DOOR, LOCKER, INTRO_S, DECOYS, nightSize, dmap, floors, los, newNight, tick, begin,
  jump, decoy, doAction, actionLabel, toggleCrouch, toggleLight, toggleRun, mvOK, lit, seesYou, ghostSpeed,
} from "../src/components/horror/manorSim.js";

let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};
const DT = 1 / 60;
const still = { ix: 0, iy: 0, turn: 0, shift: false };
const run = (s, secs, inp = still) => { for (let t = 0; t < secs; t += DT) tick(s, inp, DT); };

// Through the gate and standing in the first hall, with the thing parked
// harmlessly inside a wall unless a test wants it.
function inside(seed = 1, night = 1) {
  const s = newNight(seed, night);
  begin(s);
  run(s, 1);
  s.events.length = 0;
  return s;
}
const park = (s) => { s.G.x = 0.5; s.G.y = 0.5; s.G.stun = 1e9; };

// ── the house ────────────────────────────────────────────────────────────────
{
  let ok = true, why = "", minRelics = 99, sameAll = true;
  for (let seed = 1; seed <= 150; seed++) {
    for (let night = 1; night <= 7; night++) {
      const s = newNight(seed, night), { N } = s;
      if (JSON.stringify(newNight(seed, night).g) !== JSON.stringify(s.g)) sameAll = false;
      if (N !== nightSize(night).N || N % 8 !== 1) { ok = false; why = `size ${N}`; }
      const d = dmap(s.g, N, 1, 1);
      const open = floors(s.g, N).filter(([x, y]) => !(x === 0 && y === 1));
      if (open.some(([x, y]) => d[x + y * N] < 0)) { ok = false; why = `seed ${seed} night ${night}: sealed room`; }
      for (let i = 0; i < N; i++) {
        for (const [x, y] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) {
          if ((s.g[y][x] === FLOOR || s.g[y][x] === DOOR) && !(x === 0 && y === 1)) { ok = false; why = `seed ${seed} night ${night}: hole in the outer wall at ${x},${y}`; }
        }
      }
      // doors sit in the walls between rooms, lockers in plain wall facing a room
      for (const k of s.env.doors) {
        const x = k % N, y = (k / N) | 0;
        if (x % 8 && y % 8) { ok = false; why = `door inside a room at ${x},${y}`; }
        if (s.g[y][x] !== DOOR) { ok = false; why = `door at ${x},${y} not shut to start`; }
      }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (s.g[y][x] !== LOCKER) continue;
        if (x % 8 && y % 8) { ok = false; why = `locker inside a room at ${x},${y}`; }
        if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => s.g[y + b] && s.g[y + b][x + a] === FLOOR)) { ok = false; why = `locker at ${x},${y} faces no floor`; }
      }
      const e = s.exitT, beside = e.x === N - 1 ? [N - 2, e.y] : [e.x, N - 2];
      if (s.g[e.y][e.x] !== WALL || d[beside[0] + beside[1] * N] < 0) { ok = false; why = `seed ${seed} night ${night}: gate not on a reachable wall`; }
      for (const r of s.relics) if (d[(r.x | 0) + (r.y | 0) * N] < 12) { ok = false; why = `relic too near the start`; }
      minRelics = Math.min(minRelics, s.relics.length);
      for (const k in s.obst) {
        const x = k % N, y = (k / N) | 0, g = s.g;
        const doorway = (!g[y][x - 1] && !g[y][x + 1] && g[y - 1][x] && g[y + 1][x]) || (!g[y - 1][x] && !g[y + 1][x] && g[y][x - 1] && g[y][x + 1]);
        if (!doorway || (x % 8 && y % 8) || s.env.doors.has(+k)) { ok = false; why = `obstacle at ${x},${y} not in an open doorway`; }
      }
      for (const r of [...s.relics, ...s.cells]) if ((r.x | 0) % 8 === 0 || (r.y | 0) % 8 === 0) { ok = false; why = `a pickup in a doorway`; }
      if (s.need !== s.relics.length) { ok = false; why = `need ${s.need} vs ${s.relics.length} relics`; }
    }
  }
  check("1050 houses: one piece, walled in, gate reachable, doors and lockers in the walls, obstacles only in open doorways", ok, why);
  check("the same seed builds the same house", sameAll);
  check("every house has relics to find", minRelics >= 3, `fewest ${minRelics}`);
  check("houses grow each night: 3×3 rooms, 4×4, then 5×5", nightSize(1).N === 25 && nightSize(2).N === 33 && nightSize(3).N === 41 && nightSize(9).N === 41);
}

// ── going in ─────────────────────────────────────────────────────────────────
{
  const s = newNight(3, 1);
  check("a night opens on the map", s.mode === "intro" && s.introT === INTRO_S);
  run(s, INTRO_S + 0.1);
  check("the dark falls by itself after the countdown", s.mode === "play" && s.P.entering);
  const t = newNight(3, 1);
  begin(t);
  check("or when you tap", t.mode === "play");
  let secs = 0;
  while (t.P.entering && secs < 5) { tick(t, still, DT); secs += DT; }
  check("you walk yourself in through the gate", !t.P.entering && t.P.x >= 1.6, `${secs.toFixed(2)}s`);
  check("and it slams shut behind you", t.g[1][0] === WALL && t.events.some((e) => e.name === "gateSlam"));
  check("the thing is held a moment when it slams", t.G.stun > 2.5);
}

// ── walking ──────────────────────────────────────────────────────────────────
{
  const s = inside(5);
  park(s);
  s.P.fa = Math.PI;                       // face the shut gate
  const x0 = s.P.x;
  run(s, 1, { ...still, iy: -1 });
  check("walls stop you", s.P.x >= 1 + 0.28 - 1e-9 && s.P.x <= x0, `x ${s.P.x.toFixed(2)}`);

  // find a barricade and a beam, stand before each, and try both ways
  const tryObstacle = (kind) => {
    const k = Object.keys(s.obst).find((k) => s.obst[k] === kind);
    if (!k) return null;
    const N = s.N, x = +k % N, y = (+k / N) | 0;
    const horiz = !s.g[y][x - 1];
    const from = horiz ? { x: x - 1 + 0.5, y: y + 0.5 } : { x: x + 0.5, y: y - 1 + 0.5 };
    const setup = () => {
      const c = newNight(5, 1); begin(c); run(c, 1); park(c);
      Object.assign(c.P, { ...from }); c.P.lastTile = -1; c.P.fa = horiz ? 0 : Math.PI / 2; c.P.crouch = false; c.P.cr = 0; c.P.jz = 0; c.P.vz = 0;
      return c;
    };
    const plain = setup();
    run(plain, 1.2, { ...still, iy: -1 });
    const blocked = horiz ? plain.P.x < x : plain.P.y < y;
    const skilled = setup();
    if (kind === HURDLE) { jump(skilled); run(skilled, 1.2, { ...still, iy: -1 }); }
    else { toggleCrouch(skilled); run(skilled, 0.3); run(skilled, 2, { ...still, iy: -1 }); }
    const through = horiz ? skilled.P.x > x + 1 : skilled.P.y > y + 1;
    return { blocked, through };
  };
  const h = tryObstacle(HURDLE), w = tryObstacle(BEAM);
  check("a barricade stops you walking", h && h.blocked);
  check("…and you can jump it", h && h.through);
  check("a low beam stops you walking", w && w.blocked);
  check("…and you can crouch under it", w && w.through);

  const j = inside(5); park(j);
  toggleCrouch(j);
  jump(j);
  check("no jumping from a crouch", j.P.vz === 0);
}

// ── stamina, noise, light ────────────────────────────────────────────────────
{
  const s = inside(7); park(s);
  toggleRun(s);
  run(s, 3, { ...still, iy: -1, turn: 0.3 });
  check("running drains stamina", s.P.stam < 0.5, s.P.stam.toFixed(2));
  run(s, 3, { ...still, iy: -1, turn: 0.3 });
  check("run it dry and you are tired for a moment", s.P.stam >= 0 && (s.P.stamCool > -1));
  toggleRun(s);
  run(s, 3);
  check("standing still gets it back", s.P.stam > 0.9);

  const n = inside(7); park(n);
  run(n, 0.2, { ...still, iy: -1, shift: true });
  check("running is loud (8 tiles)", n.P.noiseR === 8);
  run(n, 0.2, { ...still, iy: -1 });
  check("walking is quieter (3)", n.P.noiseR === 3);
  toggleCrouch(n); run(n, 0.5, { ...still, iy: -1 });
  check("creeping is nearly silent (1)", n.P.noiseR === 1);
  toggleCrouch(n); run(n, 0.3);
  check("standing still is silent", n.P.noiseR === 0);

  const b = inside(8); park(b);
  const b0 = b.P.bat;
  run(b, 10);
  check("the torch burns its battery", b.P.bat < b0 && Math.abs((b0 - b.P.bat) - 0.11) < 0.01, (b0 - b.P.bat).toFixed(3));
  toggleLight(b);
  const b1 = b.P.bat;
  run(b, 10);
  check("off, it does not", b.P.bat === b1);
  toggleLight(b);
  b.P.bat = 0.001;
  run(b, 0.5);
  check("run it flat and the light dies", b.P.bat === 0 && !lit(b) && /light died/.test(b.msg));
  const cell = b.cells.find((c) => !c.got);
  Object.assign(b.P, { x: cell.x, y: cell.y });
  run(b, DT);
  check("a battery brings it back", b.P.bat > 0.59 && lit(b) && cell.got);
}

// ── the thing ────────────────────────────────────────────────────────────────
// Put it in a long straight hall with you, and watch. Rooms are only 7 wide,
// so the hall is cut: a row through two rooms, cleared of furniture, with the
// doorway between them open.
function hall(seed = 11) {
  const s = inside(seed);
  const y = 4, x0 = 1, x1 = 13;
  for (let x = x0; x <= x1; x++) { s.g[y][x] = FLOOR; delete s.obst[x + y * s.N]; }
  Object.assign(s.P, { x: x0 + 0.5, y: y + 0.5 });
  s.G.x = x0 + 8.5; s.G.y = y + 0.5; s.G.st = "patrol"; s.G.stun = 0;
  s.P.fa = 0; s.P.lastTile = -1;
  return { s, y, x0, x1 };
}
{
  const { s } = hall();
  check("(set-up) torch on, 8 tiles apart down a hall: out of sight", !seesYou(s));
  s.G.x -= 2.5;
  check("5.5 tiles with the torch on: it sees you", seesYou(s));
  toggleLight(s);
  check("torch off at the same distance: it does not", !seesYou(s));
  toggleLight(s);
  run(s, DT);
  check("when it first sees you it freezes a beat — your warning", s.G.st === "hunt" && s.G.stun > 1 && s.events.some((e) => e.name === "spotted"));
  const gx = s.G.x;
  run(s, 0.9);
  check("…and does not move while frozen", Math.abs(s.G.x - gx) < 1e-9);
  run(s, 0.5);
  check("then it comes", s.G.x < gx);
  check("hunting speed is 2.5, plus a little per relic and per night", Math.abs(ghostSpeed(s) - 2.5) < 1e-9);
  s.count = 3; s.night = 2;
  check("…faster with relics taken and nights survived", Math.abs(ghostSpeed(s) - (2.5 + 0.36 + 0.08)) < 1e-9);
  s.count = 0; s.night = 1;
  run(s, 4);
  check("stand in the open and it gets you", s.mode === "dead" && s.events.some((e) => e.name === "caught"));

  // lost you: break the line for 5 seconds
  const h2 = hall(40).s;
  h2.G.x -= 3;                          // 5 tiles: inside torch range
  run(h2, DT);
  h2.G.stun = 0;
  check("(set-up) hunting", h2.G.st === "hunt");
  Object.assign(h2.P, { x: h2.far[0] + 0.5, y: h2.far[1] + 0.5 });   // far away, rooms between
  h2.G.stun = 1e9;                      // hold it still so only sight matters
  run(h2, 5.2);
  check("out of sight for five seconds, it loses you", h2.G.st === "search" && /lost you/.test(h2.msg), h2.G.st);

  // noise: a patrolling thing within 8 tiles hears you run
  const h3 = hall(60).s;
  toggleLight(h3);
  h3.G.x = h3.P.x + 6; h3.G.st = "patrol";
  h3.g[h3.G.y | 0][(h3.P.x | 0) + 3] = WALL;  // a wall between, so it cannot see
  run(h3, 0.1, { ...still, iy: -1, shift: true, turn: 0 });
  check("run within earshot and it comes looking", h3.G.st === "search");
}

// ── music box ────────────────────────────────────────────────────────────────
{
  const s = inside(21); park(s);
  s.G.stun = 0; s.G.x = 0.5;
  decoy(s);
  check("the music box calls it to where you stand", s.decoys === DECOYS - 1 && s.G.st === "search" &&
    s.G.tx === (s.P.x | 0) && s.G.ty === (s.P.y | 0) && s.pulses.length === 1);
  decoy(s);
  decoy(s);
  check("two uses, then it is empty", s.decoys === 0 && /empty/.test(s.msg));
  const { s: h } = hall(80);
  h.G.x -= 3;
  run(h, DT);
  const before = h.decoys;
  decoy(h);
  check("it will not work while the thing is staring at you", h.decoys === before && /watching you/.test(h.msg));
}

// ── doors ────────────────────────────────────────────────────────────────────
// A shut door in front of you, both ways.
function atDoor(seed = 41) {
  const s = inside(seed); park(s);
  const N = s.N;
  const k = [...s.env.doors][0], x = k % N, y = (k / N) | 0;
  const horiz = x % 8 === 0;                       // a door in an up-and-down wall: walk through along x
  Object.assign(s.P, horiz ? { x: x - 0.5, y: y + 0.5, fa: 0 } : { x: x + 0.5, y: y - 0.5, fa: Math.PI / 2 });
  return { s, x, y, horiz };
}
{
  const { s, x, y, horiz } = atDoor();
  check("facing a shut door, Use says Open", actionLabel(s) === "Open");
  const p0 = { ...s.P };
  run(s, 1, { ...still, iy: -1 });
  check("a shut door stops you", horiz ? s.P.x < x : s.P.y < y);
  Object.assign(s.P, { x: p0.x, y: p0.y });
  doAction(s);
  check("Use opens it, with a creak", s.g[y][x] === FLOOR && s.events.some((e) => e.name === "creak"));
  run(s, DT);
  check("…and opening it is loud — as loud as a landing", s.P.noiseR >= 6);
  check("an open door: Use says Close", actionLabel(s) === "Close");
  doAction(s);
  check("Use shuts it again", s.g[y][x] === DOOR && /Door shut/.test(s.msg));
  doAction(s);
  run(s, 1, { ...still, iy: -1 });
  check("through the open door", horiz ? s.P.x > x + 1 : s.P.y > y + 1);
  s.P.fa += Math.PI;                               // turn round: the door behind you
  run(s, 0.6, { ...still, iy: -1 });
  const back = actionLabel(s);
  s.P.x = horiz ? x + 0.5 : s.P.x; s.P.y = horiz ? s.P.y : y + 0.5;      // stand in the doorway
  check("you cannot shut a door you are standing in", actionLabel(s) !== "Close", `behind you: ${back}`);

  // the ghost: a shut door costs it a moment, and you hear it
  const d = atDoor(43);
  const { s: g, x: gx, y: gy, horiz: gh } = d;
  Object.assign(g.P, gh ? { x: gx - 3.5 } : { y: gy - 3.5 });
  g.G.stun = 0; g.G.st = "search"; g.G.wait = -99;
  Object.assign(g.G, gh ? { x: gx + 1.5, y: gy + 0.5 } : { x: gx + 0.5, y: gy + 1.5 });
  g.G.tx = 0; g.G.dm = dmap(g.g, g.N, gh ? gx - 2 : gx, gh ? gy : gy - 2);
  let t = 0;
  while (g.g[gy][gx] === DOOR && t < 3) { tick(g, still, DT); t += DT; }
  check("the thing opens a shut door in its way", g.g[gy][gx] === FLOOR, `${t.toFixed(2)}s`);
  check("…stopping to do it (1.1s), with a creak you can hear", g.G.stun > 1 && g.events.some((e) => e.name === "creak"));
}

// ── lockers ──────────────────────────────────────────────────────────────────
// Stand before a locker, facing it.
function atLocker(seed = 51) {
  for (let sd = seed; sd < seed + 50; sd++) {
    const s = inside(sd); park(s);
    const N = s.N;
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      if (s.g[y][x] !== LOCKER) continue;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (s.g[y + b][x + a] !== FLOOR) continue;
        Object.assign(s.P, { x: x + a + 0.5, y: y + b + 0.5, fa: Math.atan2(-b, -a) });
        return { s, x, y, out: [x + a, y + b], dir: [a, b] };
      }
    }
  }
  throw new Error("no locker");
}
{
  const { s, x, y, out } = atLocker();
  check("facing a locker, Use says Hide", actionLabel(s) === "Hide");
  doAction(s);
  check("Use takes you in; you look out through the slats", !!s.P.hiding && (s.P.x | 0) === x && (s.P.y | 0) === y);
  check("…and it did not see you, so it is not coming", !s.P.hiding.ghost && /Stay quiet/.test(s.msg));
  check("in a locker, Use says Leave", actionLabel(s) === "Leave");
  run(s, 0.5, { ...still, iy: -1, shift: true });
  check("hiding, you cannot walk off, and you make no sound", (s.P.x | 0) === x && s.P.noiseR === 0);
  jump(s);
  check("…nor jump", s.P.vz === 0);

  // it walks right past
  s.G.stun = 0; s.G.st = "patrol";
  s.G.x = out[0] + 0.5 + (out[0] === x ? 3 : 0); s.G.y = out[1] + 0.5 + (out[1] === y ? 3 : 0);
  toggleLight(s); toggleLight(s);                  // the torch on: it would see you in the open
  run(s, 0.8);
  check("it walks right past a locker it did not see you get into", s.mode === "play" && !seesYou(s));
  // but lingering wears you down
  s.G.stun = 1e9; s.G.x = out[0] + 0.5; s.G.y = out[1] + 0.5;
  run(s, 2.5);
  check("(lingering by it for 2.5s: not yet)", s.mode === "play");
  run(s, 0.7);
  check("…but if it lingers three seconds, it opens the door", s.mode === "dead" && s.events.some((e) => e.name === "caught"));
  const l = atLocker(51).s;
  doAction(l);
  doAction(l);
  check("Use again lets you out where you stood", !l.P.hiding && Math.abs(l.P.x - (out[0] + 0.5)) < 1e-9 && Math.abs(l.P.y - (out[1] + 0.5)) < 1e-9);

  // hide in front of it and it knows
  const w = atLocker(51), ws = w.s;
  // it stands four tiles behind you, in the same room, with nothing between
  for (let k = 1; k <= 4; k++) ws.g[w.out[1] + w.dir[1] * k][w.out[0] + w.dir[0] * k] = FLOOR;
  ws.G.stun = 0; ws.G.st = "patrol";
  ws.G.x = ws.P.x + w.dir[0] * 4; ws.G.y = ws.P.y + w.dir[1] * 4;
  run(ws, DT);
  ws.G.stun = 0;
  check("(set-up) it is hunting you", ws.G.st === "hunt");
  {
    doAction(ws);
    check("hide while it watches and it knows where you went", !!ws.P.hiding && ws.P.hiding.ghost === ws.G && /saw you hide/.test(ws.msg));
    let t = 0;
    while (ws.mode === "play" && t < 6) { tick(ws, still, DT); t += DT; }
    check("…it comes straight for the locker and drags you out — fast", ws.mode === "dead" && t < 4, `${t.toFixed(2)}s`);
  }
}

// ── scares ───────────────────────────────────────────────────────────────────
{
  const s = inside(61); park(s);
  const seen = new Set();
  const g0 = { ...s.G };
  for (let t = 0; t < 400; t += DT) {
    tick(s, still, DT);
    for (const e of s.events) seen.add(e.name);
    s.events.length = 0;
    if (s.flick > 0) seen.add("flicker-on");
    if (s.bodies.length) seen.add("body");
    s.P.fa += DT * 0.4;                          // look about, so a body has somewhere to drop
  }
  check("left alone, the house tries all three scares", seen.has("flicker-on") && seen.has("whisper") && seen.has("body"),
    [...seen].join(","));
  check("…and none of them moves the thing or touches the rules", s.G.x === g0.x && s.G.y === g0.y && s.mode === "play");
  const h = hall(71).s;
  h.G.x -= 3;
  run(h, DT);
  h.scareT = 0;
  h.G.stun = 1e9;
  const sc = h.scareT;
  tick(h, still, DT);
  check("no scares while it is hunting you", h.G.st === "hunt" && h.scareT <= sc && !h.flick && !h.bodies.length);
}

// ── relics and the gate ──────────────────────────────────────────────────────
{
  const s = inside(31); park(s);
  const r0 = s.relics[0];
  Object.assign(s.P, { x: r0.x, y: r0.y });
  run(s, DT);
  check("walk onto a relic and it is yours", r0.got && s.count === 1 && s.events.some((e) => e.name === "relic"));
  check("taking one draws the thing toward you", s.G.st === "search" && s.G.tx === (r0.x | 0));
  const e = s.exitT, stand = e.x === s.N - 1 ? { x: e.x - 0.5, y: e.y + 0.5 } : { x: e.x + 0.5, y: e.y - 0.5 };
  Object.assign(s.P, { ...stand }); s.msgT = 0;
  run(s, DT);
  check("the far gate is sealed until you have them all", s.mode === "play" && /sealed/.test(s.msg));
  for (const r of s.relics) r.got = true;
  s.count = s.need;
  run(s, DT);
  check("with every relic, it lets you out", s.mode === "won" && s.events.some((ev) => ev.name === "win"));
}

// ── a bot walks out, every night ─────────────────────────────────────────────
// Thing held still; the bot follows the shortest road to the nearest relic,
// then the gate, jumping barricades and crouching under beams. Proves every
// house can be finished with the controls the page gives you.
function walkOut(seed, night) {
  const s = newNight(seed, night);
  begin(s);
  s.G.x = 0.5; s.G.y = 0.5; s.G.stun = 1e9;
  const N = s.N;
  let t = 0, lastProgress = 0, bestLeft = Infinity, target = null;
  while (s.mode === "play" && t < 400) {
    if (s.P.entering) { tick(s, still, DT); t += DT; continue; }
    const px = s.P.x | 0, py = s.P.y | 0;
    const left = s.relics.filter((r) => !r.got);
    // Commit to one relic until it is in hand: re-choosing every frame, two
    // relics the same distance apart had it pacing between two tiles.
    let goal;
    if (left.length) {
      if (!target || target.got) {
        const here = dmap(s.g, N, px, py);
        target = left.slice().sort((a, b) => here[(a.x | 0) + (a.y | 0) * N] - here[(b.x | 0) + (b.y | 0) * N])[0];
        bestLeft = Infinity;              // a new target: progress is measured afresh
      }
      goal = [target.x | 0, target.y | 0];
    } else {
      const e = s.exitT;
      goal = e.x === N - 1 ? [N - 2, e.y] : [e.x, N - 2];
      if (target) { target = null; bestLeft = Infinity; }
    }
    const d = dmap(s.g, N, goal[0], goal[1]);
    let next = [px, py];
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v = d[(px + a) + (py + b) * N];
      if (v >= 0 && v < d[next[0] + next[1] * N]) next = [px + a, py + b];
    }
    const tx = next[0] + 0.5, ty = next[1] + 0.5;
    const aim = (next[0] === px && next[1] === py) ? (left.length ? [target.x, target.y] : [s.exitT.x + 0.5, s.exitT.y + 0.5]) : [tx, ty];
    s.P.fa = Math.atan2(aim[1] - s.P.y, aim[0] - s.P.x);
    if (s.g[next[1]][next[0]] === DOOR && actionLabel(s) === "Open") doAction(s);   // a shut door: open it
    const ob = s.obst[next[0] + next[1] * N], onBeam = s.obst[px + py * N] === BEAM;
    const want = ob === BEAM || onBeam;
    if (want !== s.P.crouch) toggleCrouch(s);
    if (ob === HURDLE && Math.hypot(tx - s.P.x, ty - s.P.y) < 1.0) jump(s);
    tick(s, { ...still, iy: -1 }, DT);
    t += DT;
    const remaining = s.relics.filter((r) => !r.got).length * 1000 + d[(s.P.x | 0) + (s.P.y | 0) * N];
    if (remaining < bestLeft) { bestLeft = remaining; lastProgress = t; }
    if (t - lastProgress > 6) return { ok: false, t, why: `stuck at ${s.P.x.toFixed(2)},${s.P.y.toFixed(2)} heading for ${next}` };
  }
  return { ok: s.mode === "won", t, why: s.mode };
}
{
  let ok = true, why = "", times = [];
  for (let seed = 1; seed <= 40; seed++) {
    for (let night = 1; night <= 5; night++) {
      const r = walkOut(seed, night);
      times.push(r.t);
      if (!r.ok) { ok = false; why = `seed ${seed} night ${night}: ${r.why}`; }
    }
  }
  times.sort((a, b) => a - b);
  check("200 nights: a bot gets every relic and out of the far gate, opening doors as it goes", ok, why);
  console.log(`      a perfect route takes ${times[0].toFixed(0)}–${times[times.length - 1].toFixed(0)}s (median ${times[times.length >> 1].toFixed(0)}s), before any detours to hide`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
