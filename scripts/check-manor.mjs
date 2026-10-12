// scripts/check-manor.mjs — the rules of STATION 13 (slug "manor"), with no browser.
//
//   node scripts/check-manor.mjs
//
// The hospital must always be finishable (every fuse, battery, locker and the
// elevator reachable from the Main Hall) and the same on every phone for a
// seed; the monster must behave as the page says it does (asleep at first,
// it notices you, stares, chases, loses you, hears a run and not a creep,
// finds you in a locker if it lingers); and a bot that plays like a person —
// walk to the fuses, break its sight and creep off, out the elevator — must
// get out of a fair share of runs, and of every run while the monster sleeps.
import {
  N, NEED, START, EXIT, SLEEP_S, NOTICE_S, LOSE_S, NOISE_RUN, HIDE_FIND_S, POW, LIT_START, WALK,
  genStation, placeItems, placeMonsters, monstersFor, dmap, canAt, los, litZones, zoneAt, stepMonster, newMonster, setTarget,
  newPlayer, stepPlayer, drainTorch, lockerNear, atExit, rng,
} from "../src/components/horror/s13Core.mjs";
import { newRun, tick, interact } from "../src/components/horror/s13Sim.js";

let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};
const DT = 1 / 30;

// ── the building ─────────────────────────────────────────────────────────────
{
  let bad = [], same = true;
  for (let seed = 1; seed <= 300; seed++) {
    const st = genStation(seed);
    const { items, lockers } = placeItems(st, seed, [{ key: "a", need: NEED }, { key: "b", need: NEED }], 2);
    const d = dmap(st.g, START.x | 0, START.y | 0);
    const reach = (x, y) => d[(x | 0) + (y | 0) * N] >= 0;
    const exitNear = [[-1, 0], [0, -1], [0, 1]].some(([a, b]) => reach(EXIT.x + a, EXIT.y + b));
    if (!canAt(st.g, START.x, START.y)) bad.push(`${seed}: start in a wall`);
    if (!items.every((it) => reach(it.x, it.y))) bad.push(`${seed}: an item out of reach`);
    if (!lockers.every((l) => reach(l.x, l.y))) bad.push(`${seed}: a locker out of reach`);
    if (!exitNear) bad.push(`${seed}: no way to the elevator`);
    if (lockers.length !== 14) bad.push(`${seed}: ${lockers.length} lockers`);
    if (items.filter((it) => it.t === "f" && it.side === "a").length !== NEED || items.filter((it) => it.t === "f" && it.side === "b").length !== NEED) bad.push(`${seed}: fuses`);
    if (seed % 50 === 0) {
      const again = genStation(seed);
      if (JSON.stringify(again.g) !== JSON.stringify(st.g) || JSON.stringify(placeItems(again, seed).items) !== JSON.stringify(placeItems(st, seed).items)) same = false;
    }
  }
  check("300 seeds: every fuse, battery, locker and the elevator reachable from the Main Hall", !bad.length, bad.slice(0, 4).join("; "));
  check("a seed is the same building on every phone", same);
  const a = genStation(7), b = genStation(8);
  check("…and different seeds are different buildings", JSON.stringify(a.g) !== JSON.stringify(b.g) || JSON.stringify(placeItems(a, 7).items) !== JSON.stringify(placeItems(b, 8).items));
  check("the Main Hall is where you start", zoneAt(a, START.x, START.y) === "hall");
  check("it's lit from the start; each fuse lights two more zones; all four light them all",
    LIT_START.every((z) => litZones(0).has(z)) && litZones(1).size === litZones(0).size + 2 && POW.every((z) => litZones(NEED).has(z)));
  check("more players, more batteries", placeItems(a, 7, undefined, 4).items.filter((i) => i.t === "b").length > placeItems(a, 7).items.filter((i) => i.t === "b").length);
  check("monsters: 1 to 3 players one, 4 to 6 two, 7 or 8 three", [1, 3, 4, 6, 7, 8].map(monstersFor).join() === "1,1,2,2,3,3");
  const ms = placeMonsters(a, 7, 3);
  check("…and they start apart, far from the Main Hall", ms.length === 3 && ms.every((m) => Math.hypot(m.x - START.x, m.y - START.y) > 8));
}

// ── your body ────────────────────────────────────────────────────────────────
{
  const st = genStation(11);
  const P = newPlayer();
  let t = 0;
  while (!P.tired && t < 20) { stepPlayer(P, st, { ix: 0, iz: 1, run: true }, DT); P.x = START.x; P.y = START.y; t += DT; }
  check("running empties your stamina in about five seconds", P.tired && t > 4.5 && t < 5.5, `${t.toFixed(1)}s`);
  stepPlayer(P, st, { ix: 0, iz: 1, run: true }, DT);
  check("…winded, you can only walk", !P.run && P.moving);
  for (let i = 0; i < 60; i++) stepPlayer(P, st, {}, DT);
  check("…until it comes back", !P.tired);
  const T = newPlayer();
  for (let i = 0; i < 30 * 60; i++) drainTorch(T, DT, 0);
  check("the flashlight drains, about 25% a minute when calm", T.bat > 70 && T.bat < 78, T.bat.toFixed(1));
  const T2 = newPlayer();
  for (let i = 0; i < 30 * 60; i++) drainTorch(T2, DT, 4);
  check("…faster when it's close", T2.bat < T.bat - 5, T2.bat.toFixed(1));
  const W = newPlayer(START.x, START.y, 0);
  for (let i = 0; i < 30 * 30; i++) stepPlayer(W, st, { ix: 0, iz: 1 }, DT);
  check("you can't walk through walls", canAt(st.g, W.x, W.y));
  // what lies on the floor you walk past; what stands, you go round
  const lows = st.furn.filter((q) => q.low), stands = st.furn.filter((q) => !q.low);
  check("the dead, and a tipped bin or wheelchair, don't stop you (there's no jump)", lows.length > 0 && lows.every((q) => canAt(st.g, q.x + 0.5, q.y + 0.5)), `${lows.length} on the floor`);
  check("…beds, shelves, gurneys and benches still do", stands.every((q) => !canAt(st.g, q.x + 0.5, q.y + 0.5)));
  const q0 = lows.find((q) => canAt(st.g, q.x - 0.7, q.y + 0.5) && canAt(st.g, q.x + 1.5, q.y + 0.5)) || lows[0], Pw = newPlayer(q0.x + 0.5 - 1.2, q0.y + 0.5, 0);
  Pw.yaw = Math.atan2(-1, 0);                     // facing +x, straight over it
  let crossed = false;
  for (let i = 0; i < 60 && canAt(st.g, Pw.x + 0.1, Pw.y); i++) { stepPlayer(Pw, st, { ix: 0, iz: 1 }, DT); if (Pw.x > q0.x + 0.9) crossed = true; }
  if (canAt(st.g, q0.x - 0.7, q0.y + 0.5) && canAt(st.g, q0.x + 1.5, q0.y + 0.5)) check("…walking straight at one, you carry on over it", crossed);
  // a gurney or a cart stops you at itself, not at the edge of its tile a step short
  let near = [], seeds = 0;
  for (let sd = 1; sd <= 100; sd++) {
    const s2 = genStation(sd);
    for (const q of s2.furn.filter((f) => f.k === "gurney" || f.k === "cart")) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!canAt(s2.g, q.x + 0.5 + dx * 1.2, q.y + 0.5 + dy * 1.2)) continue;      // only from a side you can stand on
        let d = 1.2; while (d > 0 && canAt(s2.g, q.x + 0.5 + dx * (d - 0.01), q.y + 0.5 + dy * (d - 0.01))) d -= 0.01;
        near.push(d);
      }
    }
    seeds++;
  }
  const worst = Math.max(...near);
  check("gurneys and carts stop you at them, not a step short", near.length > 50 && worst < 0.7, `stopped ${worst.toFixed(2)} tiles from the middle at worst (a whole tile stopped you at 0.72); ${near.length} approaches`);
}

// ── the monster ──────────────────────────────────────────────────────────────
// A clear straight run of floor, to test sight and hearing on.
function corridor(st) {
  for (let y = 1; y < 25; y++) for (let x = 1; x < N - 12; x++) {
    let ok = true;
    for (let k = 0; k < 12 && ok; k++) ok = canAt(st.g, x + k + 0.5, y + 0.5);
    if (ok) return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
}
{
  const st = genStation(21), rand = rng(5);
  const c = corridor(st);
  const lit = litZones(NEED), dark = new Set();
  const me = (o = {}) => ({ id: 1, x: c.x + 9, y: c.y, fl: false, hid: false, moving: false, run: false, ...o });
  const awake = (o = {}) => Object.assign(newMonster(c.x, c.y), { st: "patrol", dm: null, ...o });

  const s = newMonster(c.x, c.y);
  let woke = 0;
  for (let t = 0; t < SLEEP_S + 1 && s.st === "sleep"; t += DT) { stepMonster(s, st, [me()], DT, rand, { lit, fuses: 0 }); woke = t; }
  check("asleep at first, for about half a minute", s.st === "patrol" && woke > SLEEP_S - 1, `${woke.toFixed(1)}s`);
  const s2 = newMonster(c.x, c.y);
  stepMonster(s2, st, [me()], DT, rand, { lit, fuses: 1 });
  check("…or until the first fuse comes out", s2.st === "patrol");

  const zl = zoneAt(st, c.x + 9, c.y);
  const seenLit = awake(), ev = [];
  stepMonster(seenLit, st, [me()], DT, rand, { lit: new Set([zl]), fuses: 0 }, (n) => ev.push(n));
  check("in the light it sees you nine tiles off", seenLit.st === "notice" && ev.includes("notice"));
  const dk = awake();
  stepMonster(dk, st, [me()], DT, rand, { lit: dark, fuses: 0 });
  check("…in the dark with your light off it doesn't", dk.st === "patrol");
  const tc = awake();
  stepMonster(tc, st, [me({ x: c.x + 7, fl: true })], DT, rand, { lit: dark, fuses: 0 });
  check("…your flashlight shows you seven tiles off in the dark", tc.st === "notice");
  const hd = awake();
  stepMonster(hd, st, [me({ x: c.x + 2, hid: true })], DT, rand, { lit: new Set([zl]), fuses: 0 });
  check("…in a locker you're not seen", hd.st === "patrol");

  // the stare, then the chase
  const n = awake();
  const ev2 = [];
  for (let t = 0; t < NOTICE_S + 0.3; t += DT) stepMonster(n, st, [me()], DT, rand, { lit: new Set([zl]), fuses: 0 }, (x) => ev2.push(x));
  check("it stares a few seconds, then chases", n.st === "chase" && ev2.includes("chase"));
  // break its line of sight while it stares, and it gives up the stare
  const b = awake();
  stepMonster(b, st, [me()], DT, rand, { lit: new Set([zl]), fuses: 0 });
  for (let t = 0; t < 1.6; t += DT) stepMonster(b, st, [me({ hid: true, fl: true })], DT, rand, { lit: new Set([zl]), fuses: 0 });
  check("…break its sight while it stares (your light still on) and it only comes to look", b.st === "invest");
  // into a locker and your light off: it gives up on you there and then
  for (const from of ["notice", "chase"]) {
    const gv = awake({ st: from, prey: 1, nt: NOTICE_S }), ev5 = [];
    setTarget(gv, st, (c.x + 9) | 0, c.y | 0);
    stepMonster(gv, st, [me({ hid: true, fl: false })], DT, rand, { lit: new Set([zl]), fuses: 0 }, (x) => ev5.push(x));
    check(`hidden with your light off, it stops its ${from === "notice" ? "stare" : "chase"} and goes back on its rounds`, gv.st === "patrol" && gv.prey === null && ev5.includes("gaveup"));
  }
  // out of sight in a chase: it loses you
  const ch = awake({ st: "chase", prey: 1 });
  setTarget(ch, st, (c.x + 11) | 0, c.y | 0);
  let lostAt = 0;
  for (let t = 0; t < LOSE_S + 2 && ch.st === "chase"; t += DT) { stepMonster(ch, st, [me({ hid: true, x: c.x + 11 })], DT, rand, { lit: dark, fuses: 0 }); lostAt = t; }
  check("out of sight it loses you", ch.st !== "chase", `${lostAt.toFixed(1)}s`);

  // hearing
  const hr = awake(); const ev3 = [];
  stepMonster(hr, st, [me({ x: c.x + NOISE_RUN - 1, moving: true, run: true })], DT, rand, { lit: dark, fuses: 0 }, (x) => ev3.push(x));
  check("it hears you run six tiles off", hr.st === "invest" && ev3.includes("heard"));
  const wk = awake();
  stepMonster(wk, st, [me({ x: c.x + 4, moving: true })], DT, rand, { lit: dark, fuses: 0 });
  check("…not a walk four tiles off", wk.st === "patrol");
  const sd = awake();
  stepMonster(sd, st, [me({ x: c.x + 5 })], DT, rand, { lit: dark, fuses: 0 });
  check("…nor standing still in the dark five tiles off", sd.st === "patrol");

  // close in a chase: it rears, then lunges, and that catches you
  const at = awake({ st: "chase", prey: 1 });
  setTarget(at, st, (c.x + 2) | 0, c.y | 0);
  const ev4 = []; let got = null;
  for (let t = 0; t < 3 && !got; t += DT) got = stepMonster(at, st, [me({ x: c.x + 2 })], DT, rand, { lit, fuses: 0 }, (x) => ev4.push(x));
  check("close in a chase it rears up, lunges, and catches you", ev4.includes("rear") && got && got.id === 1 && !got.hidden);
  // a locker: it finds you if it lingers right by you
  const lg = awake({ st: "invest", dm: null });
  let found = null, ft = 0;
  for (let t = 0; t < HIDE_FIND_S + 1 && !found; t += DT) { lg.x = c.x; found = stepMonster(lg, st, [me({ x: c.x + 1, hid: true, fl: true })], DT, rand, { lit: dark, fuses: 0 }); ft = t; }
  check("lingering right by your locker with your light on, it finds you", found && found.hidden, `${ft.toFixed(1)}s`);
  const lg2 = awake({ st: "invest", dm: null });
  let found2 = null;
  for (let t = 0; t < HIDE_FIND_S * 3; t += DT) { lg2.x = c.x; lg2.st = "invest"; found2 = found2 || stepMonster(lg2, st, [me({ x: c.x + 1, hid: true, fl: false })], DT, rand, { lit: dark, fuses: 0 }); }
  check("…light off, it can stand right by you and never find you", !found2);
}

// ── solo: standing still is no plan ──────────────────────────────────────────
{
  const s = newRun(5);
  let t = 0;
  while (s.mode === "play" && t < 400) { tick(s, { ix: 0, iz: 0 }, DT); t += DT; }
  check("solo: wait in the Main Hall and it comes for you", s.mode === "dead", `${t.toFixed(0)}s`);
}

// ── solo: a bot that plays like a person ─────────────────────────────────────
// Walks the shortest way to the nearest fuse it hasn't got, then to the
// elevator; noticed or chased, it makes for the locker it can reach well
// before the monster, running only while seen. (Hiding while it is onto you
// is no hiding: it comes to where you are and finds you, as in the original.)
function bot(seed, { monster = true, limit = 600 } = {}) {
  const s = newRun(seed);
  const { st } = s;
  let t = 0, hideFor = 0, flee = null;
  const steer = (tx, ty) => {
    const d = dmap(st.g, tx, ty), P = s.P, gx = P.x | 0, gy = P.y | 0;
    let best = [gx, gy], bd = d[gx + gy * N];
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = d[(gx + a) + (gy + b) * N]; if (v >= 0 && (bd < 0 || v < bd)) { bd = v; best = [gx + a, gy + b]; } }
    const dx = best[0] + 0.5 - P.x, dy = best[1] + 0.5 - P.y;
    if (Math.hypot(dx, dy) > 0.02) P.yaw = Math.atan2(-dx, -dy);
    return Math.hypot(dx, dy) > 0.02 ? 1 : 0;
  };
  while (s.mode === "play" && t < limit) {
    const P = s.P, M = s.M;
    if (!monster) { M.st = "sleep"; M.sl = 1e9; }    // a fuse wakes it: put it back to sleep every frame
    let inp = { ix: 0, iz: 0, run: false };
    const hunted = M.st === "notice" || M.st === "chase";
    if (P.hid) {
      hideFor += DT;
      if (!hunted && Math.hypot(M.x - P.x, M.y - P.y) > 6 && hideFor > 3) { interact(s); hideFor = 0; }
    } else if (hunted && !P.hid) {
      // hiding while it's onto you is no hiding: it comes to where you are, and
      // finds you. Out of its sight, keep creeping away; it loses you.
      {
        // the locker it can reach well before the monster does
        if (!flee || flee.until < t) {
          const dp = dmap(st.g, P.x | 0, P.y | 0), dm = dmap(st.g, M.x | 0, M.y | 0);
          const at = (d, l) => d[(l.x | 0) + (l.y | 0) * N];
          const pick = s.lockers.filter((l) => at(dp, l) >= 0).sort((a, b) => (at(dp, a) - at(dm, a)) - (at(dp, b) - at(dm, b)))[0];
          flee = { l: pick, until: t + 1 };
        }
        inp = { ix: 0, iz: steer(flee.l.x | 0, flee.l.y | 0), run: los(st.g, M.x, M.y, P.x, P.y) };   // out of its sight, creep: it hears a run
      }
    } else {
      const left = s.items.filter((it) => !it.got && it.t === "f").sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y));
      if (left.length) { const it = left[0]; inp.iz = steer(it.x | 0, it.y | 0); if (!inp.iz) { P.yaw = Math.atan2(-(it.x - P.x), -(it.y - P.y)); inp.iz = 1; } }
      else { inp.iz = steer(EXIT.x - 1, EXIT.y); if (!inp.iz) { P.yaw = Math.atan2(-(EXIT.x + 0.5 - P.x), -(EXIT.y + 0.5 - P.y)); inp.iz = 1; } }
    }
    tick(s, inp, DT);
    t += DT;
  }
  return { mode: s.mode, t, fuses: s.fuses };
}
{
  const calm = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => bot(seed, { monster: false }));
  check("solo with the monster asleep: the bot gets every fuse and out, every time", calm.every((r) => r.mode === "won"), calm.map((r) => `${r.mode}@${r.t.toFixed(0)}`).join(" "));
  const slow = Math.max(...calm.map((r) => r.t));
  check("…in a few minutes' walking", slow < 300, `slowest ${slow.toFixed(0)}s at ${WALK} tiles/s`);
  const real = Array.from({ length: 20 }, (_, i) => bot(100 + i));
  const won = real.filter((r) => r.mode === "won").length, dead = real.filter((r) => r.mode === "dead").length;
  // over 60 seeds this bot gets out of about 40% (24 of 60): it is a horror game
  check("solo with the monster: breaking its sight, then creeping, the bot gets out of a fair share of runs", won >= 5, `${won} out, ${dead} caught, of 20`);
  check("…but not every one: it's a horror game", dead >= 1, `${dead} caught`);
  check("…and no fuse was ever skipped on the way out", real.filter((r) => r.mode === "won").every((r) => r.fuses === NEED));
  void atExit;
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
