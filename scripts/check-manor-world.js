// scripts/check-manor-world.js — Hollow Manor online, the server's side of it.
//
//   node scripts/check-manor-world.js
//
// No database, no network: config/db.js, recordResults and the socket hub are
// swapped for fakes before the world module loads, and the test plays the
// part of the phones by calling the same socket handlers they call. The house
// runs on its real rules (manorCore.mjs) and time is moved by hand.
const path = require("path");

// ── fakes ────────────────────────────────────────────────────────────────────
const writes = [];
const fakeDb = {
  execute: async (sql, args) => {
    // "are you in this room?" — everyone the tests send is seated
    if (/^\s*SELECT rp\.is_spectator/.test(sql)) return [[{ is_spectator: 0 }]];
    writes.push({ sql: sql.replace(/\s+/g, " ").trim(), args });
    return [{ affectedRows: 1 }];
  },
  query: async () => [[]],
};
const recorded = [];
const stub = (rel, exports) => {
  const file = require.resolve(path.join(__dirname, "..", rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub("config/db.js", fakeDb);
stub("config/recordResults.js", { recordResults: async (id) => { recorded.push(id); return []; } });
stub("config/socket.js", { tellFriends: () => {}, roomChannel: (c) => `room:${c}` });

const sent = [];
const fakeIo = {
  handlers: null,
  on(ev, fn) { if (ev === "connection") this.handlers = fn; },
  to: () => ({ emit: (ev, payload) => sent.push({ ev, payload }) }),
};

const world = require("../config/manorWorld");
const { manorResults, ESCAPE_POINTS, MAX_RELIC_POINTS, MAX_SCORE_PER_GAME } = require("../config/matchResult");

let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

// A phone: a fake socket whose handlers are the real ones.
function phone(uid) {
  const h = {}, got = [];
  const sock = { user: { id: uid }, on: (ev, fn) => { h[ev] = fn; }, emit: (ev, p) => got.push({ ev, p }), join() {} };
  fakeIo.handlers(sock);
  return { h, got, me: (code, x, y, extra = {}) => h["manor:me"]({ code, x, y, fa: 0, jz: 0, cr: 0, lit: true, n: 0, ...extra }) };
}

let codeN = 0;
function room(mode, seats, { elapsed = 9000, duration = 300 } = {}) {
  const code = `T${String(++codeN).padStart(5, "0")}`;
  const r = { id: codeN, room_code: code, seed: 4242 + codeN, mode, duration_seconds: duration };
  const w = world._buildWorld(r, seats.map((s, i) => ({ user_id: s.id, team: s.team ?? null, username: s.name || `p${s.id}`, avatar: "🙂", game_state: s.state || null, i })), elapsed);
  world._worlds.set(code, w);
  // park every ghost out of harm's way (off the map, where it can see nobody)
  // unless a test wants one
  for (const G of w.house.ghosts) { G.x = -50; G.y = -50; G.stun = 1e9; }
  return w;
}

// Walk a player to a spot in small legal steps (the server refuses teleports).
function walk(w, ph, id, tx, ty) {
  const p = w.players.get(id);
  const { dmap } = coreMod;
  const N = w.house.N, g = w.house.g;
  const d = dmap(g, N, tx | 0, ty | 0);
  let guard = 0;
  while (Math.hypot(p.x - tx, p.y - ty) > 0.05 && guard++ < 4000) {
    const cx = p.x | 0, cy = p.y | 0;
    let nx = cx, ny = cy;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v = d[(cx + a) + (cy + b) * N];
      if (v >= 0 && v < d[nx + ny * N]) { nx = cx + a; ny = cy + b; }
    }
    // a shut door on the way: open it, as a person would
    if ((nx !== cx || ny !== cy) && g[ny][nx] === coreMod.DOOR) ph.h["manor:use"]({ code: w.code, act: "open", x: nx, y: ny });
    // square up to the middle of the corridor before turning, as a person
    // does; cutting the corner clips the wall and the server refuses it
    let gx = nx === cx && ny === cy ? tx : nx + 0.5, gy = nx === cx && ny === cy ? ty : ny + 0.5;
    if (nx !== cx && Math.abs(p.y - (cy + 0.5)) > 0.02) { gx = p.x; gy = cy + 0.5; }
    else if (ny !== cy && Math.abs(p.x - (cx + 0.5)) > 0.02) { gx = cx + 0.5; gy = p.y; }
    const dx = gx - p.x, dy = gy - p.y, l = Math.hypot(dx, dy), step = Math.min(0.4, l);
    p.at = Date.now() - 100;
    ph.me(w.code, p.x + (dx / l) * step, p.y + (dy / l) * step);
  }
  return Math.hypot(p.x - tx, p.y - ty) < 0.06;
}
const exitSpot = (w) => {
  const e = w.house.exitT, N = w.house.N;
  return e.x === N - 1 ? [e.x - 0.5, e.y + 0.5] : [e.x + 0.5, e.y - 0.5];
};
const lastEv = (type) => sent.filter((s) => s.ev === "manor:tick").flatMap((s) => s.payload.e).filter((e) => e.type === type);

let coreMod;
(async () => {
  coreMod = await world.coreReady;
  world.attach(fakeIo);

  // ── houses ─────────────────────────────────────────────────────────────────
  {
    let ok = true, why = "";
    for (let n = 1; n <= 8; n++) {
      for (let seed = 1; seed <= 25; seed++) {
        const sides = Array.from({ length: n }, (_, i) => ({ key: `p${i}`, need: 3 }));
        const h = coreMod.buildHouse(seed * 31 + n, { players: n, sides });
        const d = coreMod.dmap(h.g, h.N, 1, 1);
        const open = coreMod.floors(h.g, h.N);
        if (open.some(([x, y]) => d[x + y * h.N] < 0)) { ok = false; why = `n${n} s${seed} sealed`; }
        for (const s of sides) if (h.relics.filter((r) => r.side === s.key).length !== s.need) { ok = false; why = `n${n} s${seed} side ${s.key} short`; }
        const spots = [...h.relics, ...h.batts].map((q) => `${q.x | 0},${q.y | 0}`);
        if (new Set(spots).size !== spots.length) { ok = false; why = `n${n} s${seed} overlap`; }
        if (spots.some((k) => h.obst[+k.split(",")[0] + +k.split(",")[1] * h.N])) { ok = false; why = "obstacle on a pickup"; }
        if (h.ghosts.length !== coreMod.ghostsFor(n)) { ok = false; why = "ghost count"; }
      }
    }
    check("200 houses for 1–8 players: connected, every side's relics all there, nothing stacked", ok, why);
    const sizes = [1, 2, 4, 6, 8].map((n) => coreMod.sizeFor(n));
    check("the house grows with the crowd", sizes.every((v, i) => i === 0 || v >= sizes[i - 1]) && sizes[4] > sizes[0], sizes.join(" ≤ "));
    check("more ghosts for more players", coreMod.ghostsFor(2) === 1 && coreMod.ghostsFor(4) === 2 && coreMod.ghostsFor(8) === 3);

    // fairness: each side's relics sit at a similar spread of distances
    const h = coreMod.buildHouse(77, { players: 4, sides: [0, 1, 2, 3].map((i) => ({ key: `p${i}`, need: 3 })) });
    const d = coreMod.dmap(h.g, h.N, 1, 1);
    const sums = [0, 1, 2, 3].map((i) => h.relics.filter((r) => r.side === `p${i}`).reduce((a, r) => a + d[(r.x | 0) + (r.y | 0) * h.N], 0));
    const spread = (Math.max(...sums) - Math.min(...sums)) / Math.max(...sums);
    check("relics are dealt fairly: every player's are about as far away", spread < 0.25, `walking distance per player ${sums.join(", ")}`);
  }

  // ── a free-for-all: first one out wins, and that ends it ──────────────────
  {
    const w = room("free", [{ id: 1, name: "Asha" }, { id: 2, name: "Ben" }, { id: 3, name: "Cy" }]);
    const A = phone(1), B = phone(2), C = phone(3);
    const score = (id) => Number(w.lastScores.get(id).split("|")[0]);
    check("everyone has a colour of their own", new Set([...w.players.values()].map((p) => p.color)).size === 3);
    check("three keys each", w.sides.every((s) => s.need === 3 && w.house.relics.filter((r) => r.side === s.key).length === 3));

    const bens = w.house.relics.find((r) => r.side === "p2");
    walk(w, A, 1, bens.x, bens.y);
    world._tick(w);
    check("someone else's key can't be taken", !bens.got && w.sides[0].got === 0);

    const [ex, ey] = exitSpot(w);
    walk(w, A, 1, ex, ey);
    world._tick(w);
    check("the gate stays shut until your keys are all taken", w.sides[0].escapes === 0 && !w.over);

    // the thing gets Cy: a scare, then back in — not out of the match
    const G = w.house.ghosts[0];
    const cy = w.players.get(3);
    const cyKey = w.house.relics.find((r) => r.side === "p3");
    walk(w, C, 3, cyKey.x, cyKey.y);
    world._tick(w);
    G.x = cy.x + 0.2; G.y = cy.y; G.stun = 0;
    sent.length = 0;
    world._tick(w);
    G.stun = 1e9; G.x = -50; G.y = -50;
    check("a ghost on top of you: caught", !cy.alive && cy.caught === 1 && lastEv("dead").some((e) => e.id === 3 && e.cause === "ghost"));
    check("…but the match goes on", !w.over);
    world._tick(w);
    check("…not back yet (a moment for the scare)", !cy.alive);
    cy.respawnAt = Date.now() - 1;
    world._tick(w);
    check("…then back in at the entrance", cy.alive && Math.hypot(cy.x - w.house.spawn.x, cy.y - w.house.spawn.y) < 1e-9 && lastEv("respawn").some((e) => e.id === 3 && e.why === "caught"));
    check("…keeping the keys you'd found", w.sides[2].got === 1);

    for (const r of w.house.relics.filter((q) => q.side === "p1")) { walk(w, A, 1, r.x, r.y); world._tick(w); }
    check("walk onto your own and it's yours", w.sides[0].got === 3 && w.sides[0].open);
    check("…and the score is written by the server: 100 a key", score(1) === 300);
    walk(w, A, 1, ex, ey);
    world._tick(w);
    check("all your keys and the gate: out — and that ends the match for everyone", w.sides[0].escapes === 1 && w.over && w.reason === "escaped");
    await new Promise((r) => setTimeout(r, 30));
    check("…scored as a time out", score(1) === ESCAPE_POINTS + 300);
    check("the room is closed and the results recorded", writes.some((q) => /UPDATE rooms SET status = 'finished'/.test(q.sql)) && recorded.includes(w.roomId));
    const over = sent.filter((x) => x.ev === "manor:over").pop();
    check("the results come out, the one who got out on top", over && over.payload.reason === "escaped" && over.payload.sides[0].key === "p1");
    const res = manorResults({ mode: "free", game_slug: "manor" }, [1, 2, 3].map((id) => ({ user_id: id, score: score(id) })));
    check("results: first out wins, the rest lose", res.get(1) === "win" && res.get(2) === "loss" && res.get(3) === "loss");
  }

  // ── the score scale ────────────────────────────────────────────────────────
  {
    // the most relic points a side can hold in one round: a four-player co-op
    const most = (2 * 4 + 1) * 100;
    check("one round's relics fit the scale", most <= MAX_RELIC_POINTS);
    check("getting out is worth more than a round's relics, so 'got out' reads off the score", ESCAPE_POINTS > MAX_RELIC_POINTS);
    check("ten times out, every relic each time, fits under the score cap", 10 * (ESCAPE_POINTS + MAX_RELIC_POINTS) <= MAX_SCORE_PER_GAME);
    const res = manorResults({ mode: "free" }, [{ user_id: 1, score: 1300 }, { user_id: 2, score: 1300 }, { user_id: 3, score: 900 }]);
    check("level at the top: a draw", res.get(1) === "draw" && res.get(2) === "draw" && res.get(3) === "loss");
  }

  // ── nobody gets out ────────────────────────────────────────────────────────
  {
    const res = manorResults({ mode: "free" }, [{ user_id: 1, score: 800 }, { user_id: 2, score: 200 }]);
    check("nobody got out: nobody wins, however many relics", res.get(1) === "loss" && res.get(2) === "loss");
    const w = room("free", [{ id: 1 }, { id: 2 }], { elapsed: 301000 });
    world._tick(w);
    check("the clock runs out: the match ends", w.over && w.reason === "time");
  }

  // ── co-op ──────────────────────────────────────────────────────────────────
  {
    const w = room("coop", [{ id: 11 }, { id: 12 }, { id: 13 }]);
    check("co-op: one side, gold, 2 relics a head + 1", w.sides.length === 1 && w.sides[0].need === 7 && w.sides[0].color === "#ffdca0");
    const P = [phone(11), phone(12), phone(13)];
    const rs = w.house.relics;
    rs.forEach((r, i) => { walk(w, P[i % 3], 11 + (i % 3), r.x, r.y); world._tick(w); });
    check("any of you can take any relic", w.sides[0].got === 7 && w.sides[0].open);
    const G = w.house.ghosts[0];
    const p12 = w.players.get(12);
    G.x = p12.x + 0.1; G.y = p12.y; G.stun = 0;
    world._tick(w);
    G.stun = 1e9; G.x = -50; G.y = -50;
    check("one of you caught: not the end — the others play on", !p12.alive && !w.over);
    const [ex, ey] = exitSpot(w);
    walk(w, P[0], 11, ex, ey); world._tick(w);
    check("one of you out: you've all won, and it's over", w.sides[0].escapes === 1 && w.over && w.reason === "escaped");
    await new Promise((r) => setTimeout(r, 30));
    const s = w.lastScores.get(11).split("|")[0];
    const res = manorResults({ mode: "coop" }, [11, 12, 13].map((id) => ({ user_id: id, score: s })));
    check("…a win for every one of you", [11, 12, 13].every((id) => res.get(id) === "win"));

    const res2 = manorResults({ mode: "coop" }, [{ user_id: 21, score: 700 }, { user_id: 22, score: 700 }]);
    check("never got out: lost for both", res2.get(21) === "loss" && res2.get(22) === "loss");

    const w3 = room("coop", [{ id: 31 }, { id: 32 }]);
    world.forfeit(w3.code, 31);
    check("co-op: one leaves, the other plays on", !w3.over && w3.players.get(31).left && w3.players.get(32).alive);
    world.forfeit(w3.code, 32);
    check("…and when everyone has left, it's over", w3.over && w3.reason === "done");
  }

  // ── teams ──────────────────────────────────────────────────────────────────
  {
    const w = room("teams", [{ id: 41, team: 1 }, { id: 42, team: 1 }, { id: 43, team: 1 }, { id: 44, team: 2 }, { id: 45, team: 2 }]);
    const ph = { 41: phone(41), 42: phone(42), 43: phone(43), 44: phone(44), 45: phone(45) };
    const red = w.sides.find((s) => s.key === "t1"), yel = w.sides.find((s) => s.key === "t2");
    check("teams: a colour and a relic set per team, sized to the team", red.need === 5 && yel.need === 4 && red.color !== yel.color);
    w.house.relics.filter((r) => r.side === "t2").forEach((r) => { walk(w, ph[44], 44, r.x, r.y); world._tick(w); });
    check("a team's door opens when its relics are all taken", yel.open && !red.open);
    const [ex, ey] = exitSpot(w);
    walk(w, ph[44], 44, ex, ey); world._tick(w);
    check("one member out: the whole team wins, and it's over", yel.escapes === 1 && w.over && w.reason === "escaped");
    await new Promise((r) => setTimeout(r, 30));
    const score = (id) => w.lastScores.get(id).split("|")[0];
    const res = manorResults({ mode: "teams" }, [41, 42, 43, 44, 45].map((id) => ({ user_id: id, team: id < 44 ? 1 : 2, score: score(id) })));
    check("results: every member of the team that got out wins", res.get(44) === "win" && res.get(45) === "win");
    check("the bigger team doesn't win on a sum", res.get(41) === "loss" && res.get(42) === "loss");
  }

  // ── what a phone may and may not claim ─────────────────────────────────────
  {
    const w = room("free", [{ id: 51 }, { id: 52 }]);
    const ph = phone(51);
    const p = w.players.get(51);
    p.at = Date.now() - 100;
    ph.me(w.code, p.x + 10, p.y);
    check("a teleport is refused: you get no further than a sprint would take you", p.x < w.house.spawn.x + 1);
    Object.assign(p, { x: w.house.spawn.x, y: w.house.spawn.y });
    p.at = Date.now() - 100;
    ph.me(w.code, 0.5, 0.5);
    check("a step into a wall is refused", p.x === w.house.spawn.x && p.y === w.house.spawn.y);
    p.at = Date.now() - 100;
    const east = !w.house.g[1][2];                       // whichever way the hall runs
    ph.me(w.code, p.x + (east ? 0.3 : 0), p.y + (east ? 0 : 0.3));
    check("an honest step is taken", Math.abs(p.x + p.y - (w.house.spawn.x + w.house.spawn.y + 0.3)) < 1e-9);
    const stranger = phone(99);
    stranger.me(w.code, 5, 5);
    check("someone not in the house moves nobody", ![...w.players.values()].some((q) => q.x === 5));

    // marbles: thrown ahead, they rattle where they stop, and she goes there
    const land = coreMod.marbleLanding(w.house.g, p.x, p.y, p.fa);
    for (let i = 0; i < 4; i++) ph.h["manor:decoy"](w.code);
    const replies = ph.got.filter((g) => g.ev === "manor:decoyed").map((g) => g.p);
    check("marbles: three to throw, then none", replies.length === 4 && replies.slice(0, 3).every((r) => r.ok) && !replies[3].ok && replies[3].why === "empty");
    check("…one lands ahead of you, and Nana goes to where it stopped, not to you", w.house.ghosts.some((G) => G.st === "search" && G.tx === (land.x | 0) && G.ty === (land.y | 0)) && Math.hypot(land.x - p.x, land.y - p.y) > 0.5,
      `landed ${land.x.toFixed(1)},${land.y.toFixed(1)} from ${p.x.toFixed(1)},${p.y.toFixed(1)}`);

    const w2 = room("free", [{ id: 61 }, { id: 62 }]);
    const ph2 = phone(61);
    const G = w2.house.ghosts[0];
    G.st = "hunt"; G.prey = 61; G.lose = 0;
    ph2.h["manor:decoy"](w2.code);
    const r2 = ph2.got.filter((g) => g.ev === "manor:decoyed").pop().p;
    check("…but not while it's staring at you", !r2.ok && r2.why === "watched");

    world.forfeit(w2.code, 61);
    check("leaving: out for good, your score still counts, the others play on", !w2.players.get(61).alive && w2.players.get(61).left && !w2.over);
  }

  // ── the thing, with a crowd ────────────────────────────────────────────────
  {
    const w = room("free", [{ id: 71 }, { id: 72 }]);
    phone(71); phone(72);
    const G = w.house.ghosts[0];
    G.stun = 0; G.st = "patrol";
    const a = w.players.get(71), b = w.players.get(72);
    // put both in a straight hall with the ghost, b nearer
    // rooms are 7 wide: cut a straight hall through the first two
    const N = w.house.N, g = w.house.g;
    const hall = { y: 4, x: 9 };
    for (let x = 1; x <= 13; x++) { g[hall.y][x] = coreMod.FLOOR; delete w.house.obst[x + hall.y * N]; }
    Object.assign(a, { x: hall.x - 7 + 0.5, y: hall.y + 0.5, lit: true });
    Object.assign(b, { x: hall.x - 4 + 0.5, y: hall.y + 0.5, lit: true });
    Object.assign(G, { x: hall.x + 0.5, y: hall.y + 0.5 });
    world._tick(w);
    check("with two in sight it hunts the nearer", G.st === "hunt" && G.prey === 72);
    const spotted = lastEv("spotted").pop();
    check("…and the phones are told who it saw", spotted && spotted.id === 72);
    check("it freezes a beat first, as on the solo page", G.stun > 1);

    const early = room("free", [{ id: 81 }, { id: 82 }], { elapsed: 2000 });
    phone(81);
    const G2 = early.house.ghosts[0];
    G2.stun = 0;
    Object.assign(G2, { x: early.players.get(81).x + 0.2, y: early.players.get(81).y });
    world._tick(early);
    check("while everyone memorises the map, the ghosts sleep", early.players.get(81).alive);
  }

  // ── doors ──────────────────────────────────────────────────────────────────
  // Shared: one player shuts it, it's shut for everyone and for the ghosts.
  {
    const w = room("free", [{ id: 111 }, { id: 112 }]);
    const A = phone(111), B = phone(112);
    const N = w.house.N, g = w.house.g;
    const k = w.house.doors[0], dx = k % N, dy = (k / N) | 0;
    const horiz = dx % 8 === 0;
    const before = horiz ? [dx - 0.5, dy + 0.5] : [dx + 0.5, dy - 0.5];
    const after = horiz ? [dx + 1.5, dy + 0.5] : [dx + 0.5, dy + 1.5];
    check("doors start shut", g[dy][dx] === coreMod.DOOR);
    walk(w, A, 111, before[0], before[1]);
    const a = w.players.get(111);
    const far = phone(112);
    far.h["manor:use"]({ code: w.code, act: "open", x: dx, y: dy });
    check("someone across the house can't open it", g[dy][dx] === coreMod.DOOR &&
      far.got.filter((q) => q.ev === "manor:used").pop().p.ok === false);
    A.h["manor:use"]({ code: w.code, act: "open", x: dx, y: dy });
    check("standing at it, you can", g[dy][dx] === coreMod.FLOOR && A.got.filter((q) => q.ev === "manor:used").pop().p.ok);
    sent.length = 0;
    world._tick(w);
    const t = sent.filter((q) => q.ev === "manor:tick").pop().payload;
    check("…and every phone is told: the door, and its creak", t.d[0] === "0" && t.e.some((e) => e.type === "door" && e.open === 1 && e.id === 111));
    walk(w, A, 111, after[0], after[1]);
    check("through it", Math.hypot(a.x - after[0], a.y - after[1]) < 0.1);
    // B in the doorway: it won't shut on him
    const b = w.players.get(112);
    Object.assign(b, { x: dx + 0.5, y: dy + 0.5 });
    A.h["manor:use"]({ code: w.code, act: "close", x: dx, y: dy });
    check("a door won't shut on someone standing in it", g[dy][dx] === coreMod.FLOOR);
    Object.assign(b, { x: w.house.spawn.x, y: w.house.spawn.y });
    A.h["manor:use"]({ code: w.code, act: "close", x: dx, y: dy });
    check("…and shuts when they've gone", g[dy][dx] === coreMod.DOOR);
    b.at = Date.now() - 100;
    B.me(w.code, before[0], before[1]);
    const bx = b.x;
    b.at = Date.now() - 100;
    B.me(w.code, dx + 0.5, dy + 0.5);
    check("a shut door: nobody walks through it", b.x === bx || b.y !== dy + 0.5);
    // a ghost: it opens it (with nobody in its sight to stop and stare at)
    Object.assign(a, { x: w.house.spawn.x, y: w.house.spawn.y });
    Object.assign(b, { x: w.house.spawn.x, y: w.house.spawn.y });
    const G = w.house.ghosts[0];
    Object.assign(G, { x: after[0], y: after[1], stun: 0, st: "search", wait: -99 });
    coreMod.ghostTarget(G, w.env, before[0] | 0, before[1] | 0);
    sent.length = 0;
    for (let i = 0; i < 5 && g[dy][dx] === coreMod.DOOR; i++) world._tick(w);
    check("a ghost opens a shut door in its way — and the phones hear it", g[dy][dx] === coreMod.FLOOR && G.stun > 0.5 &&
      lastEv("door").some((e) => e.id === 0 && e.open === 1));
  }

  // ── the house and the phone never drift apart ───────────────────────────
  {
    const w = room("free", [{ id: 211 }, { id: 212 }]);
    const A = phone(211);
    for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) w.house.g[y][x] = coreMod.FLOOR;
    const a = w.players.get(211);
    Object.assign(a, { x: 1.5, y: 4.5, at: Date.now() - 100 });
    // one report too far (a lag spike): then the phone carries on from there
    A.me(w.code, 4.5, 4.5);
    for (let i = 0; i < 6; i++) { a.at = Date.now() - 100; A.me(w.code, 5.5, 4.5); }
    const snaps = A.got.filter((q) => q.ev === "manor:snap");
    check("one refused report doesn't freeze you: the house follows, or puts the phone back",
      a.x > 3 || snaps.length > 0, `house has you at ${a.x.toFixed(2)}, ${snaps.length} snap(s)`);
    check("…and the two end up in the same place", Math.abs(a.x - 5.5) < 0.01 || (snaps.length && Math.abs(snaps.pop().p.x - a.x) < 1e-9));
    // the phone claims you're inside a wall: put back at once
    A.got.length = 0;
    a.at = Date.now() - 100;
    A.me(w.code, a.x, 0.5);
    check("a phone that has you in a wall is put back straight away", A.got.some((q) => q.ev === "manor:snap"));
  }

  // ── a door you're touching opens, even if the server's idea of you lags ───
  {
    const w = room("free", [{ id: 201 }, { id: 202 }]);
    const A = phone(201);
    const N = w.house.N, k = w.house.doors[0], dx = k % N, dy = (k / N) | 0, hz = dx % 8 === 0;
    const at = hz ? [dx - 0.5, dy + 0.5] : [dx + 0.5, dy - 0.5];
    walk(w, A, 201, at[0], at[1]);
    const a = w.players.get(201);
    // the server last heard of you a running step and a half back, 250ms ago
    const back = hz ? [at[0] - 1.5, at[1]] : [at[0], at[1] - 1.5];
    Object.assign(a, { x: back[0], y: back[1], at: Date.now() - 250 });
    A.h["manor:use"]({ code: w.code, act: "open", x: dx, y: dy, px: at[0], py: at[1] });
    check("a door you're at opens though the server's last report of you lags", w.house.g[dy][dx] === coreMod.FLOOR);
    w.house.g[dy][dx] = coreMod.DOOR;
    Object.assign(a, { x: 1.5, y: 1.5, at: Date.now() - 50 });
    A.h["manor:use"]({ code: w.code, act: "open", x: dx, y: dy, px: at[0], py: at[1] });
    check("…but a phone can't claim to be across the room to open one", w.house.g[dy][dx] === coreMod.DOOR &&
      A.got.filter((q) => q.ev === "manor:used").pop().p.why === "far");
  }

  // ── hiding spots ───────────────────────────────────────────────────────────
  {
    // A table in the first room, with clear floor to its west: you stand at
    // (4.5, 4.5); a ghost three tiles further west can see you there.
    const setSpot = (w) => {
      const g = w.house.g;
      for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) g[y][x] = coreMod.FLOOR;
      g[4][5] = coreMod.SPOT;
      return { x: 5, y: 4, out: [4.5, 4.5] };
    };
    const w = room("free", [{ id: 121 }, { id: 122 }]);
    const A = phone(121), B = phone(122);
    const L = setSpot(w);
    walk(w, A, 121, L.out[0], L.out[1]);
    const a = w.players.get(121);
    A.h["manor:use"]({ code: w.code, act: "hide", x: L.x, y: L.y });
    const r = A.got.filter((q) => q.ev === "manor:used").pop().p;
    check("into a hiding spot", r.ok && !r.seen && a.hiding && (a.x | 0) === L.x);
    const bb = w.players.get(122);
    walk(w, B, 122, L.out[0], L.out[1] - 1);
    B.h["manor:use"]({ code: w.code, act: "hide", x: L.x, y: L.y });
    check("one to a hiding spot", B.got.filter((q) => q.ev === "manor:used").pop().p.why === "taken" && !bb.hiding);
    walk(w, B, 122, w.house.spawn.x, w.house.spawn.y);
    a.at = Date.now() - 100;
    A.me(w.code, L.out[0] - 2, L.out[1]);
    check("hiding, a phone can't walk off", (a.x | 0) === L.x);
    sent.length = 0;
    world._tick(w);
    const t = sent.filter((q) => q.ev === "manor:tick").pop().payload;
    check("everyone's told you're hidden (so nobody draws you)", t.p.find((q) => q[0] === 121)[9] === 1);

    // a ghost passes by: it doesn't see, hear or catch you — however long it stays
    const G = w.house.ghosts[0];
    Object.assign(G, { x: 1.5, y: 4.5, stun: 0, st: "patrol" });
    a.lit = true;
    world._tick(w);
    check("a ghost nearby doesn't see someone hiding", !(G.st === "hunt" && G.prey === 121) && a.alive);
    Object.assign(G, { x: L.out[0], y: L.out[1], stun: 0 });
    for (let i = 0; i < 80; i++) world._tick(w);
    check("hidden, you're safe: eight seconds right beside you and nothing", a.alive && !w.over);

    // out again
    const w2 = room("free", [{ id: 131 }, { id: 132 }]);
    const C = phone(131);
    const L2 = setSpot(w2);
    walk(w2, C, 131, L2.out[0], L2.out[1]);
    C.h["manor:use"]({ code: w2.code, act: "hide", x: L2.x, y: L2.y });
    C.h["manor:use"]({ code: w2.code, act: "out" });
    const c = w2.players.get(131);
    check("Leave: back where you stood", !c.hiding && Math.abs(c.x - L2.out[0]) < 1e-9 && Math.abs(c.y - L2.out[1]) < 1e-9);

    // seen going in: it searches, gives up, and you live
    const w3 = room("free", [{ id: 141 }, { id: 142 }]);
    const D = phone(141);
    const L3 = setSpot(w3);
    walk(w3, D, 141, L3.out[0], L3.out[1]);
    const G3 = w3.house.ghosts[0];
    Object.assign(G3, { x: 1.5, y: 4.5, stun: 0, st: "hunt", prey: 141, lose: 0 });
    D.h["manor:use"]({ code: w3.code, act: "hide", x: L3.x, y: L3.y });
    check("hide while it's watching: it knows", D.got.filter((q) => q.ev === "manor:used").pop().p.seen === true);
    sent.length = 0;
    let n = 0, came = false;
    while (w3.players.get(141).hiding && w3.players.get(141).hiding.ghost && n++ < 150) {
      world._tick(w3);
      if (Math.hypot(G3.x - L3.out[0], G3.y - L3.out[1]) < 1.2) came = true;
    }
    check("…it comes to search the spot", came);
    check("…gives up, and you're still alive", w3.players.get(141).alive && !w3.players.get(141).hiding.ghost, `${n / 10}s`);
    check("…and that phone is told it gave up", lastEv("gaveup").some((e) => e.id === 141));
  }

  // ── a restart keeps the score so far, and who left ───────────────────────
  {
    const saved = JSON.stringify({ manor: { left: true, caught: 2, escapes: 1, total: 4 } });
    const saved2 = JSON.stringify({ manor: { left: false, caught: 0, escapes: 2, total: 6 } });
    const w = room("free", [{ id: 91, state: saved }, { id: 92, state: saved2 }, { id: 93 }]);
    check("rebuilt after a restart: escapes and relics kept, who left stays left",
      w.players.get(91).left && !w.players.get(91).alive && w.sides[0].escapes === 1 && w.sides[1].escapes === 2 && w.sides[1].total === 6 && w.players.get(92).alive);
  }

  // ── the phone's half, fed by the server's messages ─────────────────────────
  // The real client module (what ManorGame.jsx runs) against the real world:
  // hello → init → ticks, and its reports back. Catches the two halves
  // drifting apart on the shape of a message.
  {
    const mc = await import("../src/components/horror/manorClient.js");
    const w = room("free", [{ id: 101, name: "Ana" }, { id: 102, name: "Bo" }]);
    const A = phone(101), B = phone(102);
    await A.h["manor:hello"](w.code);
    await B.h["manor:hello"](w.code);
    const initA = A.got.find((g) => g.ev === "manor:init");
    check("hello → the house, sent whole", initA && initA.p.house.walls.length > 0 && initA.p.role === "player" && initA.p.you === 101);
    const ca = mc.createClient(initA.p);
    check("the phone builds the same walls the server has", JSON.stringify(ca.g) === JSON.stringify(w.house.g));
    check("…the same relics, with its own marked as its own",
      ca.relics.length === w.house.relics.length && ca.relics.filter((r) => r.mine).length === 3);

    // the phone walks; its report is accepted as it is
    ca.body.x = w.house.spawn.x; ca.body.y = w.house.spawn.y;
    const east = !w.house.g[1][2];
    for (let i = 0; i < 20; i++) mc.stepLocal(ca, { ix: 0, iy: -1, turn: 0 }, 1 / 60, Date.now() + 60000);
    if (!east) { ca.body.fa = Math.PI / 2; for (let i = 0; i < 20; i++) mc.stepLocal(ca, { ix: 0, iy: -1 }, 1 / 60, Date.now() + 60000); }
    w.players.get(101).at = Date.now() - 400;
    A.h["manor:me"](mc.report(ca));
    check("a walking phone's report is accepted", Math.abs(w.players.get(101).x - ca.body.x) < 0.01 && Math.abs(w.players.get(101).y - ca.body.y) < 0.01,
      `${ca.body.x.toFixed(2)},${ca.body.y.toFixed(2)}`);

    // Bo takes a relic and is then caught; Ana's phone hears it all
    const bos = w.house.relics.find((r) => r.side === "p102");
    walk(w, B, 102, bos.x, bos.y);
    sent.length = 0;
    world._tick(w);
    const G = w.house.ghosts[0];
    Object.assign(G, { x: w.players.get(102).x + 0.1, y: w.players.get(102).y, stun: 0 });
    world._tick(w);
    for (const t of sent.filter((s) => s.ev === "manor:tick")) mc.applyTick(ca, t.payload);
    const i = w.house.relics.indexOf(bos);
    check("the phone sees the relic go", ca.relics[i].got);
    check("…and sees Bo taken", !ca.players.get(102).alive);
    check("…and says so", /Bo was caught/.test(ca.msg), ca.msg);
    check("…while it is still alive itself", ca.alive && mc.playing(ca));
    const v = mc.viewState(ca, Date.now() + 60000);
    check("its view: its own eyes, a ghost, nobody else still inside", v.P === ca.body && v.ghosts.length === 1 && v.others.length === 0);

    // Bo's phone, caught: the face, then someone else's eyes
    const initB = B.got.find((g) => g.ev === "manor:init").p;
    const cb = mc.createClient(initB);
    for (const t of sent.filter((s) => s.ev === "manor:tick")) mc.applyTick(cb, t.payload, Date.now());
    check("a caught phone knows it", !cb.alive && cb.deadAt !== null);
    const scared = mc.viewState(cb, Date.now() + 200);
    check("…first the face", scared.mode === "dead");
    const later = mc.viewState(cb, Date.now() + 5000);
    check("…then it waits, on its own spot, to be back in — no watching someone else", later.mode === "play" && later.camId === 102);
    // back in: the server says so, and the phone puts you at the entrance and lets you play
    w.players.get(102).respawnAt = Date.now() - 1;
    sent.length = 0;
    world._tick(w);
    for (const t of sent.filter((x) => x.ev === "manor:tick")) mc.applyTick(cb, t.payload, Date.now() + 3000);
    check("back in after the scare: the phone is playing again, at the entrance",
      cb.alive && mc.playing(cb) && Math.hypot(cb.body.x - w.house.spawn.x, cb.body.y - w.house.spawn.y) < 1e-6 && /Back in/.test(cb.msg), cb.msg);

    // Use on the phone: at once, then the server agrees — or doesn't
    {
      const w4 = room("free", [{ id: 151 }, { id: 152 }]);
      const E = phone(151), F = phone(152);
      await E.h["manor:hello"](w4.code);
      const ce = mc.createClient(E.got.find((q) => q.ev === "manor:init").p);
      const N4 = w4.house.N, k4 = w4.house.doors[0], x4 = k4 % N4, y4 = (k4 / N4) | 0, hz = x4 % 8 === 0;
      const at = hz ? [x4 - 0.5, y4 + 0.5] : [x4 + 0.5, y4 - 0.5];
      walk(w4, E, 151, at[0], at[1]);
      Object.assign(ce.body, { x: at[0], y: at[1], fa: hz ? 0 : Math.PI / 2 });
      const later = Date.now() + 60000;
      check("the phone's Use button reads Open at a shut door", mc.actionLabel(ce, later) === "Open");
      const u = mc.doAction(ce, later);
      check("Use opens it on the phone at once, and asks the server", ce.g[y4][x4] === coreMod.FLOOR && u.ask && u.ask.act === "open" && u.sounds.some((q) => q.name === "creak"));
      // a tick from before the server heard: the phone keeps its own word for a moment
      sent.length = 0;
      world._tick(w4);
      mc.applyTick(ce, sent.filter((q) => q.ev === "manor:tick").pop().payload, later);
      check("…a stale tick doesn't slam it in your face", ce.g[y4][x4] === coreMod.FLOOR);
      E.h["manor:use"](u.ask);
      sent.length = 0;
      world._tick(w4);
      mc.applyTick(ce, sent.filter((q) => q.ev === "manor:tick").pop().payload, later + 5000);
      check("…and once the server has it, they agree", ce.g[y4][x4] === coreMod.FLOOR && w4.house.g[y4][x4] === coreMod.FLOOR);
      // someone else shuts it: the phone follows the server
      const f = w4.players.get(152);
      walk(w4, F, 152, hz ? x4 + 1.5 : x4 + 0.5, hz ? y4 + 0.5 : y4 + 1.5);
      Object.assign(w4.players.get(151), { x: w4.house.spawn.x, y: w4.house.spawn.y });
      F.h["manor:use"]({ code: w4.code, act: "close", x: x4, y: y4 });
      sent.length = 0;
      world._tick(w4);
      mc.applyTick(ce, sent.filter((q) => q.ev === "manor:tick").pop().payload, later + 6000);
      check("a door someone else shuts is shut on your phone too", ce.g[y4][x4] === coreMod.DOOR && f.alive);
      // a door shut on you in the lag: you're put clear of it, not stuck in it
      Object.assign(ce.body, { x: x4 + (hz ? 0.5 - 0.6 : 0.5), y: y4 + (hz ? 0.5 : 0.5 - 0.6) });
      mc.applyTick(ce, sent.filter((q) => q.ev === "manor:tick").pop().payload, later + 7000);
      check("…and if it shut on you, you're nudged clear rather than stuck", coreMod.canAt(ce.g, ce.body.x, ce.body.y));
    }

    // a latecomer who never had a seat in the house watches
    const S = phone(103);
    world._worlds.get(w.code);
    await S.h["manor:hello"](w.code);
    const initS = S.got.find((g) => g.ev === "manor:init");
    check("someone without a seat in the house is sent it to watch", initS && initS.p.role === "spectator");
  }

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
