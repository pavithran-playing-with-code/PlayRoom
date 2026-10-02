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
const { manorResults, ESCAPE_BONUS, PLACE_STEP, MAX_RELIC_POINTS, MAX_SCORE_PER_GAME } = require("../config/matchResult");

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

  // ── a free-for-all ─────────────────────────────────────────────────────────
  {
    const w = room("free", [{ id: 1, name: "Asha" }, { id: 2, name: "Ben" }, { id: 3, name: "Cy" }]);
    const A = phone(1), B = phone(2), C = phone(3);
    check("everyone has a colour of their own", new Set([...w.players.values()].map((p) => p.color)).size === 3);
    check("three relics each", w.sides.every((s) => s.need === 3 && w.house.relics.filter((r) => r.side === s.key).length === 3));

    // Asha walks onto one of Ben's relics: not hers, nothing happens
    const bens = w.house.relics.find((r) => r.side === "p2");
    walk(w, A, 1, bens.x, bens.y);
    world._tick(w);
    check("someone else's relic can't be taken", !bens.got && w.sides[0].got === 0);

    const [ex, ey] = exitSpot(w);
    walk(w, A, 1, ex, ey);
    world._tick(w);
    check("the gate stays shut until your relics are all taken", !w.players.get(1).escaped);

    for (const r of w.house.relics.filter((q) => q.side === "p1")) { walk(w, A, 1, r.x, r.y); world._tick(w); }
    check("walk onto your own and it's yours", w.sides[0].got === 3 && w.sides[0].open);
    check("…and the score is written by the server", writes.some((q) => /UPDATE room_players SET score/.test(q.sql) && q.args[0] === 300 && q.args[4] === 1));
    walk(w, A, 1, ex, ey);
    world._tick(w);
    const a = w.players.get(1);
    check("all three and the gate: out, first", a.escaped && a.place === 1);
    check("first out scores its relics + the escape + 8 places beaten", writes.filter((q) => q.args && q.args[4] === 1).pop().args[0] === 300 + ESCAPE_BONUS + 8 * PLACE_STEP);

    for (const r of w.house.relics.filter((q) => q.side === "p2")) { walk(w, B, 2, r.x, r.y); world._tick(w); }
    walk(w, B, 2, ex, ey);
    world._tick(w);
    check("second out is second", w.players.get(2).place === 2);
    check("the match goes on while anyone is inside", !w.over);

    // the thing gets Cy
    const G = w.house.ghosts[0];
    const cy = w.players.get(3);
    G.x = cy.x + 0.2; G.y = cy.y; G.stun = 0;
    world._tick(w);
    check("a ghost on top of you: caught", !cy.alive && cy.cause === "ghost");
    check("everyone out or caught: the match ends", w.over && w.reason === "done");
    await new Promise((r) => setTimeout(r, 30));
    check("the room is closed and the results recorded", writes.some((q) => /UPDATE rooms SET status = 'finished'/.test(q.sql)) && recorded.includes(w.roomId));
    const over = sent.filter((s) => s.ev === "manor:over").pop();
    check("the final order is who got out first", over && over.payload.sides.map((s) => s.key).join(",") === "p1,p2,p3", over && over.payload.sides.map((s) => `${s.key}:${s.place}`).join(" "));

    const res = manorResults({ mode: "free", game_slug: "manor" }, [1, 2, 3].map((id) => ({ user_id: id, score: w.lastScores.get(id).split("|")[0] })));
    check("results: first out wins, the rest lose", res.get(1) === "win" && res.get(2) === "loss" && res.get(3) === "loss");
  }

  // ── the score scale ────────────────────────────────────────────────────────
  {
    // the most relic points any side can hold: a four-player co-op
    const most = (3 * 4 + 1) * 100;
    check("no side can hold more relic points than the scale allows for", most <= MAX_RELIC_POINTS);
    check("getting out beats any number of relics", ESCAPE_BONUS > MAX_RELIC_POINTS);
    check("a place beats any number of relics", PLACE_STEP > MAX_RELIC_POINTS);
    check("first place with every relic still fits under the score cap", ESCAPE_BONUS + 8 * PLACE_STEP + MAX_RELIC_POINTS <= MAX_SCORE_PER_GAME);
    const caughtWithAll = manorResults({ mode: "coop" }, [{ user_id: 1, score: most }, { user_id: 2, score: most }]);
    check("co-op that took every relic and was caught: a loss", caughtWithAll.get(1) === "loss");
  }

  // ── nobody gets out ────────────────────────────────────────────────────────
  {
    const res = manorResults({ mode: "free" }, [{ user_id: 1, score: 300 }, { user_id: 2, score: 200 }]);
    check("everyone caught: nobody wins, however many relics", res.get(1) === "loss" && res.get(2) === "loss");
    const w = room("free", [{ id: 1 }, { id: 2 }], { elapsed: 301000 });
    world._tick(w);
    check("the clock runs out: the match ends", w.over && w.reason === "time");
  }

  // ── co-op ──────────────────────────────────────────────────────────────────
  {
    const w = room("coop", [{ id: 11 }, { id: 12 }, { id: 13 }]);
    check("co-op: one side, gold, 2 relics a head + 1", w.sides.length === 1 && w.sides[0].need === 7 && w.sides[0].color === "#ffdca0");
    const P = [phone(11), phone(12), phone(13)];
    // anyone can take any relic
    const rs = w.house.relics;
    rs.forEach((r, i) => { walk(w, P[i % 3], 11 + (i % 3), r.x, r.y); world._tick(w); });
    check("any of you can take any relic", w.sides[0].got === 7 && w.sides[0].open);
    const [ex, ey] = exitSpot(w);
    walk(w, P[0], 11, ex, ey); world._tick(w);
    walk(w, P[1], 12, ex, ey); world._tick(w);
    check("out one by one: not over until you're all out", !w.over && w.players.get(11).escaped && w.players.get(12).escaped);
    walk(w, P[2], 13, ex, ey); world._tick(w);
    check("all out: you all win", w.over && w.reason === "won");
    const s = w.lastScores.get(11).split("|")[0];
    const res = manorResults({ mode: "coop" }, [11, 12, 13].map((id) => ({ user_id: id, score: s })));
    check("…and it's recorded as a win for every one of you", [11, 12, 13].every((id) => res.get(id) === "win"));

    const w2 = room("coop", [{ id: 21 }, { id: 22 }]);
    phone(21); const ph22 = phone(22);
    walk(w2, ph22, 22, w2.house.relics[0].x, w2.house.relics[0].y);   // away from 21
    const G = w2.house.ghosts[0];
    G.x = w2.players.get(22).x + 0.1; G.y = w2.players.get(22).y; G.stun = 0;
    world._tick(w2);
    check("co-op: one of you caught and it's over for both", w2.over && w2.reason === "lost" && w2.players.get(21).alive);
    const res2 = manorResults({ mode: "coop" }, [{ user_id: 21, score: 0 }, { user_id: 22, score: 0 }]);
    check("…lost for both", res2.get(21) === "loss" && res2.get(22) === "loss");

    const w3 = room("coop", [{ id: 31 }, { id: 32 }]);
    world.forfeit(w3.code, 31);
    check("co-op: walk out and your friends lose with you", w3.over && w3.reason === "lost" && w3.players.get(31).cause === "left");
  }

  // ── teams ──────────────────────────────────────────────────────────────────
  {
    const w = room("teams", [{ id: 41, team: 1 }, { id: 42, team: 1 }, { id: 43, team: 1 }, { id: 44, team: 2 }, { id: 45, team: 2 }]);
    const ph = { 41: phone(41), 42: phone(42), 43: phone(43), 44: phone(44), 45: phone(45) };
    const red = w.sides.find((s) => s.key === "t1"), yel = w.sides.find((s) => s.key === "t2");
    check("teams: a colour and a relic set per team, sized to the team", red.need === 5 && yel.need === 4 && red.color !== yel.color);
    // Yellow does it all: collect, one member caught, the other out
    w.house.relics.filter((r) => r.side === "t2").forEach((r) => { walk(w, ph[44], 44, r.x, r.y); world._tick(w); });
    check("a team's door opens when its relics are all taken", yel.open && !red.open);
    const [ex, ey] = exitSpot(w);
    walk(w, ph[44], 44, ex, ey); world._tick(w);
    check("one member out: the team isn't placed while a teammate is inside", w.players.get(44).escaped && !yel.place);
    walk(w, ph[45], 45, w.house.relics[0].x, w.house.relics[0].y);    // somewhere nobody else is
    const G = w.house.ghosts[0];
    G.x = w.players.get(45).x + 0.1; G.y = w.players.get(45).y; G.stun = 0;
    world._tick(w);
    G.stun = 1e9; G.x = -50; G.y = -50;
    check("…and is placed once nobody's left inside", yel.place === 1);
    check("the others play on", !w.over);
    // Red: relics, then all three out
    w.house.relics.filter((r) => r.side === "t1").forEach((r, i) => { const id = 41 + (i % 3); walk(w, ph[id], id, r.x, r.y); world._tick(w); });
    for (const id of [41, 42, 43]) { walk(w, ph[id], id, ex, ey); world._tick(w); }
    check("second team out is second", red.place === 2 && w.over);
    const score = (id) => w.lastScores.get(id).split("|")[0];
    const res = manorResults({ mode: "teams" }, [41, 42, 43, 44, 45].map((id) => ({ user_id: id, team: id < 44 ? 1 : 2, score: score(id) })));
    check("results: the first team out wins — even the member who was caught", res.get(44) === "win" && res.get(45) === "win");
    check("the bigger team doesn't win on a sum", res.get(41) === "loss" && res.get(42) === "loss");
  }

  // ── what a phone may and may not claim ─────────────────────────────────────
  {
    const w = room("free", [{ id: 51 }, { id: 52 }]);
    const ph = phone(51);
    const p = w.players.get(51);
    p.at = Date.now() - 100;
    ph.me(w.code, p.x + 10, p.y);
    check("a teleport is refused", p.x === w.house.spawn.x);
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

    // music box
    ph.h["manor:decoy"](w.code);
    ph.h["manor:decoy"](w.code);
    ph.h["manor:decoy"](w.code);
    const replies = ph.got.filter((g) => g.ev === "manor:decoyed").map((g) => g.p);
    check("the music box: two uses, then empty", replies.length === 3 && replies[0].ok && replies[1].ok && !replies[2].ok && replies[2].why === "empty");
    check("…and it draws a ghost to where you stood", w.house.ghosts.some((G) => G.st === "search" && G.tx === (p.x | 0)));

    const w2 = room("free", [{ id: 61 }, { id: 62 }]);
    const ph2 = phone(61);
    const G = w2.house.ghosts[0];
    G.st = "hunt"; G.prey = 61; G.lose = 0;
    ph2.h["manor:decoy"](w2.code);
    const r2 = ph2.got.filter((g) => g.ev === "manor:decoyed").pop().p;
    check("…but not while it's staring at you", !r2.ok && r2.why === "watched");

    world.forfeit(w2.code, 61);
    check("leaving counts as caught, and the seat's result still counts", !w2.players.get(61).alive && w2.players.get(61).cause === "left" && !w2.over);
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

  // ── a restart keeps who was caught and who got out ─────────────────────────
  {
    const saved = JSON.stringify({ manor: { alive: false, escaped: false, place: null, cause: "ghost" } });
    const saved2 = JSON.stringify({ manor: { alive: true, escaped: true, place: 1, cause: null } });
    const w = room("free", [{ id: 91, state: saved }, { id: 92, state: saved2 }, { id: 93 }]);
    check("rebuilt after a restart: the caught stay caught, the escaped stay out",
      !w.players.get(91).alive && w.players.get(92).escaped && w.players.get(92).place === 1 && w.places === 1);
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
    check("…and says so", /Bo was taken/.test(ca.msg), ca.msg);
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
    check("…then it watches whoever is still inside", later.mode === "play" && later.camId === 101);

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
