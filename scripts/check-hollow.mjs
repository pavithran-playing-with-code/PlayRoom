// scripts/check-hollow.mjs — Hollow Hours' rules, without a browser.
//
//   node scripts/check-hollow.mjs
//
// A bot plays the test room from the door to the vent the way a player
// would (crawl under the cot, drag the block, climb the drawers, jump to the
// shelf, crawl in), and the rules that make that the only way are checked:
// the cot is too low to walk under, the first drawer is out of reach from
// the floor, a big drop knocks you down, a thrown can lands and stops.
import { newRun, step, H, HC, R, findLedge, BOX_RUN, covered, buildHall, ROOMS } from "../src/components/hollow/hollowCore.mjs";
import { noiseOf } from "../src/components/hollow/hollowKeeper.mjs";
import { kidMsg, onKid, roomMsg, onRoom } from "../src/components/hollow/hollowNet.mjs";
import { buildWorkshop, buildGallery, buildStairwell, buildTower, cuckooAt, CUCKOO, WS_CRANK, LIFT, SW_TRIGGER } from "../src/components/hollow/hollowChapter.mjs";
import { lightning, flashAt, LP, dropAt, DRIP, DROP_FALL, gust, cloud, LEAK } from "../src/components/hollow/hollowWeather.mjs";

let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const DT = 1 / 60;
const f2 = (v) => v.toFixed(2);

// press: one frame's buttons; run(S, fn, max) calls fn each frame until it returns true
function run(S, fn, max = 1200) {
  let prev = {};
  for (let i = 0; i < max; i++) {
    const I = fn(S, i) || {};
    if (I === true || I.done) return true;
    step(S, { ...I, jump: !!I.jump && !prev.jump, grabP: !!I.grab && !prev.grab }, DT);
    prev = I;
    if (S.done) return true;
  }
  return false;
}
const toward = (from, to) => (Math.abs(to - from) < 0.05 ? 0 : Math.sign(to - from));
// walk (on the ground) to a point; done when there
const goTo = (x, z, o = {}) => (S) => {
  const P = S.P, dx = x - P.x, dz = z - P.z;
  if (Math.abs(dx) < 0.08 && Math.abs(dz) < 0.08 && P.speed < 0.2) return true;
  const l = Math.hypot(dx, dz), k = Math.min(1, l / 0.6);
  return { mx: dx / l * k, mz: dz / l * k, ...o };
};
const wait = (n) => { let i = 0; return () => (i++ >= n ? true : {}); };
const until = (cond, I) => (S) => (cond(S) ? true : I(S));

// ── 1. The way through ──
{
  const S = newRun();
  const P = S.P;
  // the cot is too low to walk under standing up
  run(S, goTo(4.5, 2.6), 200);
  check("standing, the cot stops you", P.x < 4.5 - R + 0.01, `x=${f2(P.x)}`);
  // crouched you can get under it
  run(S, wait(5));
  const under = run(S, (s) => (s.P.x > 10.5 ? true : { mx: 1, crouch: true }), 900);
  check("crouched, you crawl under the cot", under && P.crouch, `x=${f2(P.x)}`);
  run(S, wait(10));
  check("out the other side, you stand up", !P.crouch);

  // the first drawer can't be reached from the floor
  run(S, goTo(22.5, 2.1), 600);
  let best = 0;
  run(S, (s, i) => { best = Math.max(best, s.P.y); return i > 70 ? true : { mz: 1, jump: i < 3 }; });
  check("the first drawer is out of reach from the floor", P.y < 0.05 && best < 1.2, `best y=${f2(best)}`);

  // to the block's left side, then GRAB and push it under the drawers
  const okBlock = run(S, goTo(18.4 - R - 0.03, 2.0), 900);
  run(S, (s, i) => (i > 20 ? true : { mx: 0.4 }));
  const b = S.room.solids.find((s) => s.movable);
  let grabbed = false;
  const pushed = run(S, (s) => { if (s.P.st === "drag") grabbed = true; return b.x0 >= 21.0 ? true : { mx: 1, grab: true }; }, 900);
  check("GRAB takes hold of the block", okBlock && grabbed);
  check("the block is pushed under the drawers", pushed, `block x=${f2(b.x0)}..${f2(b.x1)}`);
  run(S, wait(10));
  check("letting go of GRAB lets go of the block", P.st === "ground");

  // round to the front of it, and up
  run(S, goTo(20.6, 1.0), 600);
  run(S, goTo(21.6, 1.0), 600);
  const onBlock = run(S, (s, i) => (s.P.st === "ground" && s.P.y > 1.05 ? true : { mz: 1, jump: i < 4 }), 200);
  check("you scramble onto the block", onBlock, `y=${f2(P.y)}`);
  // and drawer to drawer to the top of the chest
  const up = (top, name) => {
    run(S, (s, i) => (i > 40 ? true : { mz: 1 }));
    let hung = false;
    const ok = run(S, (s, i) => { if (s.P.st === "hang") hung = true; return s.P.st === "ground" && Math.abs(s.P.y - top) < 0.01 ? true : { mz: 1, jump: i % 30 < 3 }; }, 400);
    check(`up onto ${name}`, ok, `y=${f2(P.y)} z=${f2(P.z)}${hung ? " (hung first)" : ""}`);
  };
  up(2.6, "the first drawer");
  up(4.0, "the second drawer");
  up(5.2, "the top of the chest");

  // across the top, then a running jump for the shelf
  run(S, goTo(21.0, 5.3), 600);
  let caught = false;
  const across = run(S, (s, i) => {
    if (s.P.st === "hang" || s.P.st === "climb") caught = true;
    if (s.P.st === "ground" && s.P.y > 5.9) return true;
    return { mx: 1, mz: s.P.st === "hang" ? 0 : 0, jump: s.P.x > 24.55 && s.P.y > 5.1 && s.P.st === "ground" };
  }, 600);
  check("a running jump reaches the shelf", across, `x=${f2(P.x)} y=${f2(P.y)}${caught ? " (caught the edge)" : " (landed on it)"}`);

  // standing, the vent is too low; crouched, in you go
  run(S, goTo(28.8, 5.3), 600);
  run(S, (s, i) => (i > 90 ? true : { mz: 1 }));
  check("standing, the vent stops you", !S.done && P.z < 6 - R + 0.01, `z=${f2(P.z)}`);
  const inVent = run(S, (s) => (s.roomI === 1 ? true : { mz: 1, crouch: true }), 300);
  check("crouched, you crawl into the vent, and on into the Hall", inVent && S.room.name === "hall" && !S.done, `t=${f2(S.T)}s`);
  run(S, wait(90));
  check("…dropping out of the duct onto the boards", S.P.st === "ground" && S.P.y < 0.05 && S.P.x < 3, `x=${f2(S.P.x)} y=${f2(S.P.y)}`);
}

// ── 2. Falls ──
{
  const S = newRun();
  Object.assign(S.P, { x: 22.5, y: 5.2, z: 4.6 });
  run(S, wait(2));
  // off the left end of the chest (the right end is near enough the shelf to catch it)
  Object.assign(S.P, { x: 20.4, y: 5.2, z: 5.0, face: Math.PI });
  let kind = null;
  run(S, (s) => { if (s.P.st === "stun") kind = s.P.stun.k; return s.P.st === "stun" || s.P.y < 0.01 && s.P.st === "ground" ? true : { mx: -1 }; }, 300);
  check("a drop from the top of the chest knocks you flat", kind === "tumble", `stun=${kind}`);
  const ok = run(S, (s) => (s.P.st === "ground" ? true : {}), 200);
  check("…and you get up again", ok);

  const S2 = newRun();
  // off the left end of the cot (the right end is near enough the table to catch it)
  Object.assign(S2.P, { x: 4.7, y: 2.8, z: 3, face: Math.PI });
  let k2 = null;
  run(S2, (s) => { if (s.P.st === "stun") k2 = s.P.stun.k; return s.P.y < 0.01 && s.P.st !== "air" ? true : { mx: -1 }; }, 300);
  check("off the top of the cot: a hard landing, not a fall flat", k2 === "hard", `stun=${k2}`);
}

// ── 3. Carry and throw ──
{
  const S = newRun();
  const it = S.items.find((i) => i.kind === "spool");
  run(S, goTo(it.x - 0.35, it.z), 400);
  run(S, (s, i) => (i > 2 ? true : { grab: i === 0 }));
  check("GRAB picks up the spool", S.P.hold >= 0 && it.held);
  run(S, wait(30));
  // out in the open, under the shelf, facing the right wall
  Object.assign(S.P, { x: 26, z: 1.5, face: 0 });
  run(S, wait(2));
  let clanks = 0;
  run(S, (s, i) => { clanks += s.events.filter((e) => e.n === "clank").length; s.events.length = 0; return i > 2 ? true : { grab: i === 0 }; });
  run(S, (s) => { clanks += s.events.filter((e) => e.n === "clank").length; s.events.length = 0; return it.rest ? true : {}; }, 600);
  check("GRAB again throws it; it lands and comes to rest", !it.held && it.rest && Math.abs(it.x - S.P.x) > 1, `x=${f2(it.x)} y=${f2(it.y)} clanks=${clanks}`);
  check("…making a noise when it lands", clanks > 0);
}

// ── 4. Ledges ──
{
  const S = newRun();
  // hanging from the chair seat: up, or away to let go
  Object.assign(S.P, { x: 16.7, y: 0, z: 1.0 });
  run(S, wait(2));
  let hung = false;
  run(S, (s, i) => { if (s.P.st === "hang") hung = true; return hung || i > 60 ? true : { mz: 1, jump: i < 3 }; });
  const P = S.P;
  if (hung) {
    check("hanging, the kid is under the edge", Math.abs(P.y - (1.75 - 0.97)) < 0.01, `y=${f2(P.y)}`);
    run(S, (s, i) => (i > 12 ? true : {}));
    run(S, (s, i) => (s.P.st === "air" || i > 20 ? true : { mz: -1 }));
    check("pushing away lets go", P.st === "air");
  } else check("a jump at the chair seat catches or clears it", P.y > 1.7 || P.st === "climb", `st=${P.st} y=${f2(P.y)}`);
  // no ledge without pushing into it
  const S2 = newRun();
  Object.assign(S2.P, { x: 16.7, y: 1.0, z: 1.12, st: "air", vy: 0 });
  check("no catching an edge you aren't pushing into", !findLedge(S2, S2.P, 0, 0));
  check("the kid is H tall and HC crouched", H === 1 && HC < 0.75);
}


// ── 5. The room's life (Phase 2) ──
{
  const S = newRun();
  // the music box runs down, and GRAB beside it winds it again
  run(S, wait(Math.round(BOX_RUN * 0.5 * 60)), 99999);
  check("the music box runs down", Math.abs(S.box.wound - 0.5) < 0.02, `wound=${f2(S.box.wound)}`);
  Object.assign(S.P, { x: S.room.box.x - 0.4, y: S.room.box.y, z: S.room.box.z, st: "ground" });
  run(S, wait(2));
  let wound = false;
  run(S, (s, i) => { if (s.events.some((e) => e.n === "wind")) wound = true; s.events.length = 0; return i > 3 ? true : { grab: i === 0 }; });
  check("GRAB beside the music box winds it", wound && S.box.wound > 0.99 && S.P.hold < 0, `wound=${f2(S.box.wound)}`);
  run(S, wait(Math.round((BOX_RUN + 2) * 60)), 99999);
  check("…and it stops when it's run down", S.box.wound === 0);

  // every event says where it happened
  const S2 = newRun();
  let evs = [];
  run(S2, (s, i) => { evs.push(...s.events); s.events.length = 0; return i > 90 ? true : { mx: 1, jump: i === 30 }; });
  check("events carry a position", evs.length > 3 && evs.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.z)), `${evs.length} events`);

  // stepping in the puddle under the leak splashes
  const S3 = newRun();
  Object.assign(S3.P, { x: LEAK.x - 1.2, z: LEAK.z });
  evs = [];
  run(S3, (s, i) => { evs.push(...s.events); s.events.length = 0; return i > 60 ? true : { mx: 1 }; });
  check("feet in the puddle splash", evs.some((e) => e.n === "step" && e.mat === "water"));

  // under the cot counts as covered (camera low, sound muffled)
  const S4 = newRun();
  Object.assign(S4.P, { x: 7, z: 3, crouch: true });
  check("under the cot is covered; the open floor isn't", covered(S4) && !covered(newRun()));

  // first time on top of the chest: the discovery chord, once
  const S5 = newRun();
  Object.assign(S5.P, { x: 22.5, y: 5.2, z: 5.0 });
  evs = [];
  run(S5, (s, i) => { evs.push(...s.events); s.events.length = 0; return i > 20 ? true : {}; });
  check("the first look from the chest top is marked once", evs.filter((e) => e.n === "discover").length === 1);

  // the weather is the same for everyone who asks: flashes, a gap between drops
  let flashes = 0, lastF = 0;
  for (let T = 0; T < LP * 5; T += 0.02) { const f = lightning(T); if (f > 0.5 && lastF <= 0.5) flashes++; lastF = f; }
  check("lightning: a double flash in every stretch of LP seconds", flashes === 10, `${flashes} rises in ${LP * 5}s`);
  check("each flash comes inside its own stretch", [0, 1, 2, 3].every((k) => flashAt(k) >= k * LP && flashAt(k) + 1 < (k + 1) * LP));
  check("a drop falls, then a gap", dropAt(0.1) >= 0 && dropAt(DROP_FALL + 0.1) < 0 && dropAt(DRIP + 0.1) >= 0);
  let gMin = 1, gMax = 0, cMax = 0;
  for (let T = 0; T < 600; T += 0.5) { gMin = Math.min(gMin, gust(T)); gMax = Math.max(gMax, gust(T)); cMax = Math.max(cMax, cloud(T)); }
  check("the wind rises and falls; clouds sometimes cover the moon", gMax - gMin > 0.5 && cMax > 0.5, `gust ${f2(gMin)}..${f2(gMax)} cloud≤${f2(cMax)}`);
}

// ── 6. The Hall (Phase 3a) ──
{
  const S = newRun(buildHall());
  run(S, wait(90));
  const P = S.P;
  check("the Hall: you start on the boards by the duct", P.st === "ground" && P.y < 0.05, `y=${f2(P.y)}`);
  // the runner is quiet cloth, the trays are tin
  let mats = new Set();
  run(S, goTo(6.5, 2.5), 600);
  run(S, (s, i) => { s.events.forEach((e) => e.n === "step" && mats.add(e.mat)); s.events.length = 0; return i > 40 ? true : { mx: 1 }; });
  check("the runner is soft underfoot", mats.has("cloth"), [...mats].join(","));
  Object.assign(S.P, { x: 14.6, z: 4.3 }); mats = new Set();
  run(S, (s, i) => { s.events.forEach((e) => e.n === "step" && mats.add(e.mat)); s.events.length = 0; return i > 40 ? true : { mx: 1 }; });
  check("a tin tray is loud underfoot", mats.has("tin"), [...mats].join(","));
  // under the bench and under the side table count as covered
  Object.assign(S.P, { x: 10.5, y: 0, z: 4.8, st: "ground" }); run(S, wait(2));
  const underBench = covered(S);
  Object.assign(S.P, { x: 26.7, y: 0, z: 5.0, st: "ground" }); run(S, wait(2));
  check("under the bench and the side table, you're covered", underBench && covered(S));
  // the way out: along the runner, then crouched under the far door
  Object.assign(S.P, { x: 3, y: 0, z: 2.5, st: "ground" });
  const along = run(S, goTo(40.7, 2.5), 2000);
  run(S, goTo(40.7, 5.3), 600);
  run(S, (s, i) => (i > 60 ? true : { mz: 1 }));
  check("standing, the door stops you", !S.done && S.P.z < 6 - R + 0.01, `z=${f2(S.P.z)}`);
  const out = run(S, () => ({ mz: 1, crouch: true }), 300);
  check("crouched, you crawl under the door: the Hall is done", along && out && S.done);
}

// ── 7. The Keeper (Phase 3b) ──
{
  const hall = () => { const S = newRun(buildHall(), { keeper: true }); run(S, wait(90)); return S; };
  const place = (S, o) => Object.assign(S.P, { y: 0, vx: 0, vz: 0, st: "ground", ...o });

  // how far sounds carry
  const sneakRunner = noiseOf({ n: "step", mat: "cloth", v: 1.4 }), runBoards = noiseOf({ n: "step", mat: "wood", v: 3.4 }), runTin = noiseOf({ n: "step", mat: "tin", v: 3.4 });
  check("sneaking on the runner is near silent; running on boards carries; tin carries far",
    sneakRunner < 1 && runBoards > 6 && runTin > 14, `${f2(sneakRunner)} / ${f2(runBoards)} / ${f2(runTin)} m`);

  // sneaking the length of the hall, on the runner, you get through
  {
    const S = hall();
    let worst = 9;
    const watch = (s) => { if (s.K) worst = Math.min(worst, Math.hypot(s.P.x - s.K.x, s.P.z - s.K.z)); };
    const sneak = (x, z) => (s) => { watch(s); const r = goTo(x, z, { walk: true })(s); return r === true || s.deaths > 0 ? true : r; };
    run(S, sneak(3.0, 2.5), 3000);
    run(S, sneak(38.5, 2.5), 6000);
    run(S, sneak(40.7, 2.5), 3000);
    run(S, sneak(40.7, 5.2), 3000);
    run(S, (s) => (s.deaths > 0 ? true : { mz: 1, crouch: true }), 400);
    check("sneaking along the runner, you get past it and out", S.done && S.deaths === 0, `deaths=${S.deaths} closest=${f2(worst)} m keeper=${S.K && S.K.st}`);
  }

  // on the carpet as it walks by: sneaking past, it doesn't hear you; running past, it does
  for (const [walk, heardOk] of [[true, false], [false, true]]) {
    const S = hall();
    Object.assign(S.K, { x: 24, z: 4.5, st: "patrol", wp: 4, pause: 0 });
    place(S, { x: 12, z: 2.6 });
    let heard = false;
    run(S, (s, i) => { if (s.K.st !== "patrol") heard = true; return heard || s.P.x > 30 || i > 60 * 20 ? true : { mx: 1, walk }; }, 99999);
    check(walk ? "sneaking past it on the carpet: it doesn't hear you" : "running past it on the carpet: it hears you", heard === heardOk, `keeper=${S.K.st} kid x=${f2(S.P.x)}`);
  }

  // running on the boards near it: it hears, comes for you, takes you, and you start the hall again
  {
    const S = hall();
    Object.assign(S.K, { x: 35, z: 4.5, st: "patrol", wp: 0, pause: 2 });
    place(S, { x: 29, z: 4.0 });
    let chased = false, caught = false;
    run(S, (s, i) => { if (s.K.st === "chase") chased = true; if (s.caught) caught = true; return caught || i > 400 ? true : { mx: 1 }; });
    check("running on the boards near it: it hears you, and takes you", chased && caught);
    run(S, wait(Math.round(3 * 60)));
    check("…and a moment later you're back at the start of the hall", S.deaths === 1 && !S.caught && S.P.x < 3 && S.K.st === "patrol", `x=${f2(S.P.x)}`);
  }

  // it searches where it heard you: under the bench you're safe; beside it in the open you're not
  for (const [z, safe] of [[4.8, true], [3.2, false]]) {
    const S = hall();
    place(S, { x: 10.5, z });
    Object.assign(S.K, { x: 15, z: 4.5, st: "go", stT: 0, tx: 10.5, tz: z });
    let caught = false;
    run(S, (s, i) => { if (s.caught) caught = true; return caught || i > 60 * 10 ? true : {}; }, 99999);
    check(safe ? "under the bench while it searches: it doesn't find you" : "in the open beside the bench: it finds you", caught === !safe, `keeper=${S.K.st}`);
  }

  // on its round it walks right through the coats; among them you're safe, just outside them you're not
  for (const [z, safe] of [[5.4, true], [4.3, false]]) {
    const S = hall();
    place(S, { x: 31.3, z });
    Object.assign(S.K, { x: 35, z: 4.6, st: "patrol", wp: 1, pause: 0 });
    let caught = false;
    run(S, (s, i) => { if (s.caught) caught = true; return caught || i > 60 * 6 ? true : {}; }, 99999);
    check(safe ? "standing still among the coats as it passes: safe" : "just outside the coats as it passes: it walks into you", caught === !safe);
  }

  // a thrown can draws it away from you
  {
    const S = hall();
    const can = S.items.find((it) => it.kind === "can");
    place(S, { x: can.x - 0.4, z: can.z, face: 0 });
    run(S, (s, i) => (i > 2 ? true : { grab: i === 0 }));
    place(S, { x: 12.0, z: 2.5, face: 0 });
    Object.assign(S.K, { x: 24, z: 4.6, st: "patrol", wp: 4, pause: 0 });
    S.events.length = 0;
    run(S, (s, i) => (i > 0 ? true : { grab: true }));              // throw it on ahead, toward the Keeper
    let went = null, landed = null;
    run(S, (s, i) => {
      const c = s.events.find((e) => e.n === "clank"); if (c && landed == null) landed = c.x;
      s.events.length = 0;
      if (!went && s.K.st === "go") went = { tx: s.K.tx };
      return i > 60 * 4 ? true : {};
    }, 99999);
    check("a thrown can draws it to where the can landed, not to you", went && landed != null && Math.abs(went.tx - landed) < 1 && Math.abs(went.tx - S.P.x) > 2, went ? `went to x=${f2(went.tx)}, can landed at ${f2(landed)}, you at ${f2(S.P.x)}` : `keeper=${S.K.st}`);
  }

  // the Nursery has no Keeper; and with it off, the hall is empty
  check("no Keeper in the Nursery; none when it's switched off", !newRun(undefined, { keeper: true }).K && !newRun(buildHall(), { keeper: false }).K);
}

// ── 8. Chapter 1: the Workshop, the Gallery, the Stairwell, the Bell Tower (Phase 4) ──
// climb: push toward (dx, dz) and jump until standing at height y
const climbTo = (dx, dz, y, max = 400) => (S) => run(S, (s, i) => (s.P.st === "ground" && Math.abs(s.P.y - y) < 0.06 ? true : { mx: dx, mz: dz, jump: s.P.st === "ground" && i % 24 < 2 }), max);
const waitFor = (cond) => (s) => (cond(s) ? true : {});
{
  check("Chapter 1 is six rooms, Nursery to Bell Tower", ROOMS.length === 6 && ROOMS.map((b) => b().name).join(",") === "nursery,hall,workshop,gallery,stairwell,tower");
  const C = newRun(undefined, { startAt: 3 });
  check("Continue starts at a later room", C.room.name === "gallery" && C.roomI === 3);
}

// the Workshop: up the stool to the bench, wind the crank, catch the lift, up to the hatch
{
  const S = newRun(buildWorkshop());
  const P = () => S.P;
  run(S, goTo(5.9, 2.9), 900);
  const onStool = climbTo(1, 0, 1.9)(S);
  run(S, goTo(7.5, 2.9), 300);
  const onBench = climbTo(1, 0, 3.5)(S);
  check("the Workshop: up the stool, onto the bench", onStool && onBench, `y=${f2(P().y)}`);
  run(S, goTo(WS_CRANK.x - 0.5, WS_CRANK.z), 900);
  let wound = 0;
  for (let k = 0; k < 4; k++) run(S, (s, i) => { if (i === 0) wound++; return i > 30 ? true : { grab: i === 0 }; });
  check("GRAB four times winds the crank, and the lift is set to go", S.rs.lift === "wait", `lift=${S.rs.lift} wind=${S.rs.wind}`);
  run(S, goTo(23.7, 3.2), 600);
  // wait for the lift to come up near the bench's height, then jump for it
  run(S, waitFor((s) => s.rs.lift === "up" && s.room.solids.find((o) => o.lift).y1 > 2.6), 900);
  let rode = false;
  run(S, (s, i) => { if (s.P.st === "ground" && s.P.x > 25.2) rode = true; return rode ? true : { mx: 1, jump: s.P.st === "ground" && i < 3 }; }, 300);
  run(S, waitFor((s) => s.rs.lift === "top"), 900);
  check("onto the rising lift, and up with it", rode && Math.abs(P().y - LIFT.hi) < 0.05, `y=${f2(P().y)}`);
  run(S, goTo(26.3, 5.0), 400);
  const out = run(S, () => ({ mz: 1, crouch: true }), 300);
  check("crouched into the hatch: the Workshop is done", out && S.done);
  // the lift won't come down on you
  const T = newRun(buildWorkshop());
  const L = T.room.solids.find((o) => o.lift);
  Object.assign(T.rs, { lift: "down", t: 0 }); L.y1 = 3; L.y0 = 2.75;
  Object.assign(T.P, { x: 26.3, y: 0, z: 3.5, st: "ground" });
  run(T, wait(240));
  check("the lift stops rather than come down on you", L.y0 > 1.0 && T.P.y < 0.05, `lift bottom=${f2(L.y0)}`);
}

// the Gallery: out, in the beam, in the open: it has you. Behind things: shadow
{
  const at = (x, ph) => { for (let t = 0; t < 40; t += 0.01) { const q = cuckooAt(t); if (q.ph === ph && Math.abs(q.bx - x) < 0.05 && q.neck > 0.7) return t; } return -1; };
  const tryAt = (x, z, crouch = false) => {
    const S = newRun(buildGallery());
    Object.assign(S.P, { x, y: 0, z, st: "ground", crouch });
    S.roomT = at(x, "out") - 0.02;
    run(S, wait(6));
    return !!S.caught;
  };
  check("in the open, in its light: it has you", tryAt(20, 2.0) && tryAt(17.5, 4.0) && tryAt(24.2, 2.0));
  const spots = [["left of the statue", 5.6, 2.7], ["under the piano", 12, 2.8, true], ["left of the crates", 15.1, 2.1], ["right of the armchair", 27.7, 2.5], ["right of the plant", 31.9, 2.5], ["behind the screen", 34.5, 2.3]];
  const safe = spots.filter(([, x, z, c]) => !tryAt(Math.min(Math.max(x, CUCKOO.x0 + 0.1), CUCKOO.x1 - 0.1), z, !!c) || false);
  // the beam has to actually pass over each spot for this to mean anything
  const passes = spots.every(([, x]) => x < CUCKOO.x0 || x > CUCKOO.x1 || at(x, "out") >= 0);
  check("in shadow behind each piece of furniture, it misses you", safe.length === spots.length && passes, spots.filter((sp) => !safe.includes(sp)).map((sp) => sp[0]).join(", "));
  // a bot that dashes shadow to shadow between its hours gets through
  const S = newRun(buildGallery());
  // each hop: the way round the furniture to the next shadow
  const hops = [[[5.6, 2.7]], [[5.6, 1.5], [9.6, 1.5], [12, 2.8]], [[15.1, 2.1]], [[15.1, 0.7], [28, 0.7], [27.75, 2.5]],
    [[29.6, 1.3], [31.95, 1.3], [31.95, 2.5]], [[32.6, 0.6], [34.6, 0.6], [34.6, 2.3]], [[38.5, 5.4]]];
  for (const way of hops) {
    // go only right at the start of a safe stretch
    run(S, waitFor((s) => { const q = cuckooAt(s.roomT); return q.ph === "in" && q.k < 0.12; }), 2000);
    for (const [x, z] of way) run(S, (s) => (s.caught ? true : goTo(x, z)(s)), 900);
    if (S.caught) break;
  }
  run(S, () => (S.caught ? true : { mz: 1 }), 120);
  check("dashing shadow to shadow between its hours, you get through", S.done && S.deaths === 0, `x=${f2(S.P.x)} deaths=${S.deaths}`);
}

// the Stairwell: the chase
{
  const course = (S, dawdle) => {
    run(S, goTo(SW_TRIGGER + 0.5, 3), 600);
    if (dawdle) run(S, wait(Math.round(dawdle * 60)));
    run(S, (s, i) => (s.P.x > 11.3 || s.caught ? true : { mx: 1, jump: s.P.x > 9.3 && s.P.st === "ground" }), 300);     // over the chair
    run(S, (s) => (s.P.x > 17.3 && s.P.st === "ground" || s.caught ? true : { mx: 1, jump: s.P.x > 14.85 && s.P.st === "ground" }), 300);   // across the gap
    run(S, (s) => (s.P.x > 22.6 || s.caught ? true : { mx: 1, crouch: s.P.x > 20.8 }), 400);                 // under the gate
    run(S, (s) => (s.P.st === "ground" && s.P.y > 1.95 || s.caught ? true : { mx: 1, jump: s.P.x > 28.2 && s.P.st === "ground" }), 400);   // up the landing
    run(S, (s) => (s.P.st === "ground" && s.P.y > 3.55 || s.caught ? true : { mx: 1, mz: s.P.z < 3.5 ? 0.6 : 0, jump: s.P.x > 41.9 && s.P.st === "ground" }), 500);   // up the shelves
    run(S, (s) => (s.caught ? true : goTo(44.3, 4.6)(s)), 400);
    run(S, (s) => (s.caught || s.done ? true : { mz: 1, crouch: true }), 300);
  };
  const A = newRun(buildStairwell());
  let burst = false;
  const watch = A.events.length;
  course(A, 0);
  burst = A.rs.burst;
  check("the Stairwell: it bursts in behind you, and running the course well you get out", burst && A.done && A.deaths === 0, `x=${f2(A.P.x)} y=${f2(A.P.y)} caught=${!!A.caught} deaths=${A.deaths}`);
  void watch;
  const B = newRun(buildStairwell());
  course(B, 1.6);
  check("…hesitate at the start and it has you", !!B.caught || B.deaths > 0);
  const G = newRun(buildStairwell());
  run(G, goTo(SW_TRIGGER + 0.5, 3), 600);
  Object.assign(G.P, { x: 36, y: 2.0, z: 3, st: "ground" });          // well ahead of it, up on the landing
  const g = G.room.solids.find((o) => o.gate);
  run(G, waitFor((s) => s.rs.smashed || s.caught), 1200);
  check("it tears the gate out of its way", G.rs.smashed && g.gone);
}

// the Bell Tower: climb, ride the counterweight, pull the lever, out through the clock face
{
  const S = newRun(buildTower());
  const ok = [];
  run(S, goTo(0.6, 3.6), 300);
  ok.push(climbTo(1, 0, 1.1)(S));                     // the crate
  ok.push(climbTo(1, 0, 2.7)(S));                     // beam A
  run(S, goTo(6.6, 3.0), 400);
  // wait for the counterweight to be down, step across onto it
  run(S, waitFor((s) => s.room.solids.find((o) => o.cw).y1 < 2.75), 1200);
  run(S, (s, i) => (s.P.st === "ground" && s.P.x > 7.7 ? true : { mx: 1, jump: i < 3 }), 200);
  ok.push(S.P.x > 7.6);
  run(S, waitFor((s) => s.room.solids.find((o) => o.cw).y1 > 6.25), 1200);
  ok.push(Math.abs(S.P.y - 6.3) < 0.08);              // ridden up
  run(S, (s, i) => (s.P.st === "ground" && s.P.x > 10 ? true : { mx: 1, jump: i < 3 }), 200);
  run(S, goTo(14.6, 3.0), 400);
  ok.push(climbTo(1, 0, 8.1)(S));                     // ledge C
  run(S, goTo(15.85, 3.0), 300);
  ok.push(climbTo(-1, 0, 9.9)(S));                    // beam D
  run(S, goTo(11.3, 3.0), 300);
  ok.push(climbTo(-1, 1, 11.6)(S));                   // the top platform
  check("the Bell Tower: up the crate, the beams, riding the counterweight, the ledges, to the top", ok.every(Boolean), ok.map((v) => (v ? 1 : 0)).join(""));
  run(S, goTo(7.8, 4.8), 400);
  run(S, (s, i) => (i > 3 ? true : { grab: i === 0 }));
  const bells = [];
  run(S, (s) => { s.events.forEach((e) => e.n === "bell" && bells.push(e.n)); s.events.length = 0; return s.rs.open ? true : {}; }, 60 * 20);
  check("GRAB the lever: twelve strokes of midnight, and the door in the clock face opens", bells.length === 12 && S.rs.open, `${bells.length} strokes; at ${f2(S.P.x)},${f2(S.P.y)},${f2(S.P.z)} ${S.P.st} lever=${S.rs.midnight}`);
  run(S, goTo(9.8, 5.2), 400);
  run(S, () => ({ mz: 1, crouch: true }), 300);
  check("through the clock face: the chapter's end", S.done);
}

// the whole chapter, room to room: the Hall's door leads to the Workshop, and on
{
  const S = newRun(undefined, { startAt: 1, keeper: false });
  Object.assign(S.P, { x: 40.7, y: 0, z: 5.6, st: "ground", crouch: true });
  run(S, (s) => (s.room.name !== "hall" ? true : { mz: 1, crouch: true }), 300);
  check("the Hall's door leads into the Workshop", S.room.name === "workshop" && S.roomI === 2);
}

// ── 9. Together (Phase 5): two phones, the messages passed between them directly ──
{
  // A is the host (the lower seat), B a guest. Every frame each sends its kid; A sends the room.
  const pair = (startAt) => {
    const A = newRun(undefined, { startAt, coop: true, me: "1", host: true });
    const B = newRun(undefined, { startAt, coop: true, me: "2", host: false });
    return { A, B };
  };
  const both = (pr, IA = () => ({}), IB = () => ({}), n = 1, stop) => {
    const { A, B } = pr;
    const prev = { A: {}, B: {} };
    for (let i = 0; i < n; i++) {
      const ia = IA(A, i) || {}, ib = IB(B, i) || {};
      step(A, { ...ia, jump: !!ia.jump && !prev.A.jump, grabP: !!ia.grab && !prev.A.grab }, DT);
      step(B, { ...ib, jump: !!ib.jump && !prev.B.jump, grabP: !!ib.grab && !prev.B.grab }, DT);
      prev.A = ia; prev.B = ib;
      const ma = kidMsg(A, A.events), mb = kidMsg(B, B.events), mr = roomMsg(A, A.events);
      A.events.length = 0; B.events.length = 0;
      onKid(B, "1", ma, "A"); onKid(A, "2", mb, "B"); onRoom(B, mr);
      if (stop && stop(A, B)) return true;
    }
    return false;
  };
  const at = (S, o) => Object.assign(S.P, { y: 0, vx: 0, vz: 0, vy: 0, st: "ground", ...o });

  // both through the vent, then on together
  {
    const pr = pair(0), { A, B } = pr;
    both(pr, () => ({}), () => ({}), 5);
    at(A, { x: 28.8, y: 6.0, z: 5.5, crouch: true });
    both(pr, () => ({ mz: 1, crouch: true }), () => ({}), 120);
    check("together: the first through the vent waits for the other", A.out && A.roomI === 0 && B.roomI === 0);
    at(B, { x: 28.8, y: 6.0, z: 5.5, crouch: true });
    both(pr, () => ({}), () => ({ mz: 1, crouch: true }), 120);
    check("…and when both are through, both go on into the Hall", A.roomI === 1 && B.roomI === 1 && !A.out && !B.out, `A=${A.roomI} B=${B.roomI}`);
  }

  // a boost: crouched, a friend's back is a step up — to the first drawer, out of reach alone
  {
    const pr = pair(0), { A, B } = pr;
    both(pr, () => ({}), () => ({}), 5);
    at(B, { x: 22.5, z: 1.6 }); at(A, { x: 22.5 - 0.9, z: 1.6, face: 0 });
    both(pr, () => ({}), () => ({ crouch: true }), 20);
    const onBack = both(pr, (a, i) => ({ mx: 1, jump: i % 30 < 2 }), () => ({ crouch: true }), 200, (a) => a.P.st === "ground" && a.P.y > 0.55 && a.P.y < 0.7);
    both(pr, (a) => ({ mx: (22.5 - a.P.x) * 2 }), () => ({ crouch: true }), 30);
    const up = both(pr, (a, i) => ({ mz: 1, jump: i % 30 < 2 }), () => ({ crouch: true }), 300, (a) => a.P.st === "ground" && Math.abs(a.P.y - 2.6) < 0.05);
    check("a boost: up onto your friend's back, then up to the first drawer", onBack && up, `A y=${f2(A.P.y)}`);
  }

  // the Keeper (on the host's phone) hears the guest, takes the guest, and the Hall starts again for both
  {
    const pr = pair(1), { A, B } = pr;
    both(pr, () => ({}), () => ({}), 90);
    check("the host's phone runs the Keeper; the guest's is told where it is", !!A.K && !!B.K && Math.abs(A.K.x - B.K.x) < 0.5);
    Object.assign(A.K, { x: 35, z: 4.5, st: "patrol", wp: 0, pause: 2 });
    at(A, { x: 3, z: 2.5 }); at(B, { x: 29, z: 4.0 });
    let who = null;
    both(pr, () => ({}), () => ({ mx: 1 }), 400, (a) => { if (a.caught) who = a.caught.who; return !!a.caught; });
    both(pr, () => ({}), () => ({}), 20);
    check("it hears the guest running, and takes the guest", who === "2" && !!B.caught, `who=${who}`);
    both(pr, () => ({}), () => ({}), 60 * 3);
    check("…and the Hall starts again for both of them", A.deaths === 1 && B.deaths === 1 && A.P.x < 3 && B.P.x < 3);
  }

  // the Cuckoo: one of you in its light — and you both start the Gallery again
  {
    const pr = pair(3), { A, B } = pr;
    let t0 = 0; for (let t = 0; t < 40; t += 0.01) { const q = cuckooAt(t); if (q.ph === "out" && Math.abs(q.bx - 20) < 0.05 && q.neck > 0.7) { t0 = t; break; } }
    A.roomT = t0 - 0.05; B.roomT = t0 - 0.05;
    at(A, { x: 5.6, z: 2.7 }); at(B, { x: 20, z: 2.0 });
    both(pr, () => ({}), () => ({}), 30);
    check("the guest in its light: both of you caught", !!A.caught && !!B.caught && B.caught.by === "cuckoo");
  }

  // the Bell Tower together: two levers; one alone does nothing, both together strike midnight
  {
    const pr = pair(5), { A, B } = pr;
    check("together, the Bell Tower has two levers", A.room.levers.length === 2 && B.room.levers.length === 2);
    const [L1, L2] = A.room.levers;
    at(A, { x: L1.x + 0.4, y: L1.y, z: L1.z }); at(B, { x: L2.x + 0.4, y: L2.y, z: L2.z });
    both(pr, () => ({}), () => ({}), 5);
    both(pr, (a, i) => ({ grab: i === 0 }), () => ({}), 60 * 4);
    check("one lever alone: nothing", A.rs.midnight < 0);
    both(pr, (a, i) => ({ grab: i === 0 }), (b, i) => ({ grab: i === 30 }), 60);
    check("both levers together: midnight", A.rs.midnight >= 0);
    both(pr, () => ({}), () => ({}), 60 * 16);
    const door = B.room.solids.find((o) => o.facedoor);
    check("…and on the guest's phone too, the door in the clock face opens", B.rs.open && door.gone);
  }

  // the Workshop: the guest winds the crank; the lift rises for both, in step
  {
    const pr = pair(2), { A, B } = pr;
    at(B, { x: WS_CRANK.x - 0.5, y: WS_CRANK.y, z: WS_CRANK.z });
    for (let k = 0; k < 4; k++) both(pr, () => ({}), (b, i) => ({ grab: i === 0 }), 35);
    check("the guest winds the crank: the host's lift is set to go", A.rs.lift === "wait" || A.rs.lift === "up");
    both(pr, () => ({}), () => ({}), 60 * 4);
    const la = A.room.solids.find((o) => o.lift).y1, lb = B.room.solids.find((o) => o.lift).y1;
    check("…and the lift is at the same height on both phones", la > 1 && Math.abs(la - lb) < 0.3, `host ${f2(la)} guest ${f2(lb)}`);
  }

  // one clock for the room
  {
    const pr = pair(3), { A, B } = pr;
    B.roomT += 2.0;
    both(pr, () => ({}), () => ({}), 30);
    check("the guest keeps the host's room clock", Math.abs(A.roomT - B.roomT) < 0.1, `${f2(A.roomT)} vs ${f2(B.roomT)}`);
  }
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
