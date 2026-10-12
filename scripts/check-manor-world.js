// scripts/check-manor-world.js — Station 13 online, the server's side of it.
//
//   node scripts/check-manor-world.js
//
// No database, no network: config/db.js, recordResults and the socket hub are
// swapped for fakes before the world module loads, and the test plays the
// part of the phones by calling the same socket handlers they call. The
// building runs on its real rules (s13Core.mjs) and time is moved by hand.
const path = require("path");

// ── fakes ────────────────────────────────────────────────────────────────────
const writes = [];
const fakeDb = {
  execute: async (sql, args) => {
    // "are you in this room?" — everyone the tests send is seated
    if (/^\s*SELECT rp\.is_spectator/.test(sql)) return [[{ is_spectator: 0 }]];
    // a building being started, for the "calls at once" check
    const later = () => new Promise((r) => setImmediate(r));
    if (/FROM rooms r JOIN game_types/.test(sql) && args[0] === "RACE01") { await later(); return [[{ id: 900, room_code: "RACE01", status: "in_progress", seed: 77, mode: "coop", duration_seconds: 300, elapsed_ms: 0, game_slug: "manor" }]]; }
    if (/FROM room_players rp JOIN users/.test(sql) && args[0] === 900) { await later(); return [[{ user_id: 31, team: null, game_state: null, username: "p31", avatar: "🙂" }]]; }
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
const { manorResults, ESCAPE_POINTS } = require("../config/matchResult");

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
  return { h, got, me: (code, x, y, extra = {}) => h["manor:me"]({ code, x, y, yaw: 0, fl: true, mv: true, run: false, ...extra }) };
}

let codeN = 0;
function room(mode, seats, { elapsed = 9000, duration = 300, monsters = false } = {}) {
  const code = `T${String(++codeN).padStart(5, "0")}`;
  const r = { id: codeN, room_code: code, seed: 4242 + codeN, mode, duration_seconds: duration };
  const w = world._buildWorld(r, seats.map((s) => ({ user_id: s.id, team: s.team ?? null, username: s.name || `p${s.id}`, avatar: "🙂", game_state: s.state || null })), elapsed);
  world._worlds.set(code, w);
  w.allMonsters = w.monsters;
  if (!monsters) w.monsters = [];           // out of the way unless a test wants one
  return w;
}
const lastTick = (code) => { for (let i = sent.length - 1; i >= 0; i--) if (sent[i].ev === "manor:tick" && sent[i].payload.c === code) return sent[i].payload; return null; };
const put = (p, x, y) => { p.x = x; p.y = y; };
const flush = () => new Promise((r) => setTimeout(r, 20));

(async () => {
  const core = await world.coreReady;
  world._setIo(fakeIo);
  world.attach(fakeIo);

  // ── the building ─────────────────────────────────────────────────────────
  {
    const w = room("free", [{ id: 1 }, { id: 2 }, { id: 3 }]);
    check("free-for-all: a side each", w.sides.length === 3 && w.sides.every((s) => s.members.length === 1));
    const fusesBy = (k) => w.items.filter((it) => it.t === "f" && it.side === k).length;
    check("…and each side has its own NEED fuses", w.sides.every((s) => fusesBy(s.key) === core.NEED), w.sides.map((s) => fusesBy(s.key)).join(","));
    check("…everyone starts in the Main Hall, standing somewhere legal", [...w.players.values()].every((p) => core.canAt(w.st.g, p.x, p.y) && core.zoneAt(w.st, p.x, p.y) === "hall"));
    check("one monster for up to three", w.allMonsters.length === 1);
    const w5 = room("free", [1, 2, 3, 4, 5].map((id) => ({ id })));
    check("two for four to six", w5.allMonsters.length === 2);
    const w8 = room("free", [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id })));
    check("three for seven or eight", w8.allMonsters.length === 3);
    check("monsters start far from the Main Hall", w8.allMonsters.every((M) => Math.hypot(M.x - core.START.x, M.y - core.START.y) > 8));
    const wt = room("teams", [{ id: 1, team: 1 }, { id: 2, team: 1 }, { id: 3, team: 2 }, { id: 4, team: 2 }]);
    check("teams: a side per team, named and coloured", wt.sides.length === 2 && wt.sides[0].name === "Red" && wt.sides[1].name === "Yellow" && wt.sides[0].members.length === 2);
    const wc = room("coop", [{ id: 1 }, { id: 2 }, { id: 3 }]);
    check("together: one side, one set of fuses", wc.sides.length === 1 && wc.sides[0].key === "all" && wc.items.filter((it) => it.t === "f").length === core.NEED);
  }

  // ── hello ─────────────────────────────────────────────────────────────────
  {
    const w = room("free", [{ id: 11 }, { id: 12 }]);
    const ph = phone(11);
    await ph.h["manor:hello"](w.code);
    const init = ph.got.find((g) => g.ev === "manor:init");
    check("hello: the phone is told the building", init && init.p.seed === w.seed && init.p.role === "player" && init.p.items.length === w.items.length && init.p.lockers.length === w.lockers.length);
    check("…its sides and players", init && init.p.sides.length === 2 && init.p.players.length === 2 && init.p.monsters === 0);
    const out = phone(99);
    await out.h["manor:hello"](w.code);
    const i2 = out.got.find((g) => g.ev === "manor:init");
    check("a seat not in the building watches", i2 && i2.p.role === "spectator");
  }

  // ── moving ────────────────────────────────────────────────────────────────
  {
    const w = room("free", [{ id: 21 }]);
    const ph = phone(21), p = w.players.get(21);
    const x0 = p.x, y0 = p.y;
    p.at = Date.now() - 200;
    ph.me(w.code, x0 + 0.3, y0);
    check("a step is taken", Math.abs(p.x - (x0 + 0.3)) < 1e-9 && p.moving);
    p.at = Date.now() - 100;
    ph.me(w.code, x0 + 8, y0);
    check("a jump across the hall is refused", p.x < x0 + 2);
    // straight into a wall: find the nearest wall west of the start
    let wx = Math.floor(p.x); while (w.st.g[Math.floor(p.y)][wx] === 0) wx--;
    put(p, wx + 1.3, p.y); p.at = Date.now() - 1000;
    const before = ph.got.length;
    ph.me(w.code, wx + 0.5, p.y);
    check("…walking into a wall is refused, and the phone put back", p.x > wx + 1 && ph.got.slice(before).some((g) => g.ev === "manor:snap"));
    ph.me(w.code, p.x, p.y, { run: true });
    check("running is reported", p.run === true);
  }

  // ── fuses, light, the elevator ───────────────────────────────────────────
  {
    const w = room("free", [{ id: 31 }, { id: 32 }]);
    const p = w.players.get(31), q = w.players.get(32);
    const mine = w.items.filter((it) => it.t === "f" && it.side === "p31");
    const theirs = w.items.find((it) => it.t === "f" && it.side === "p32");
    put(p, theirs.x, theirs.y);
    world._tick(w);
    check("someone else's fuse can't be taken", !theirs.got && w.sides[0].got === 0);
    const lit0 = w.lit.size;
    put(p, mine[0].x, mine[0].y);
    world._tick(w);
    check("your own fuse is taken", mine[0].got && w.sides.find((s) => s.key === "p31").got === 1);
    check("…and the lights come back somewhere, for everyone", w.lit.size > lit0, `${lit0} → ${w.lit.size}`);
    const t1 = lastTick(w.code);
    check("…the tick says so", t1 && t1.e.some((e) => e.type === "fuse" && e.id === 31) && t1.f === 1);
    put(p, core.EXIT.x - 0.4, core.EXIT.y + 0.5);
    world._tick(w);
    check("the elevator is shut without all four", !w.over);
    for (const it of mine.slice(1)) { put(p, it.x, it.y); world._tick(w); }
    const side = w.sides.find((s) => s.key === "p31");
    check("four fuses: the elevator opens", side.got === 4 && side.open);
    check("…for that side only", !w.sides.find((s) => s.key === "p32").open);
    void q;
    put(p, core.EXIT.x - 0.4, core.EXIT.y + 0.5);
    world._tick(w);
    await flush();
    check("into the elevator: it's over, and that side got out", w.over && w.reason === "escaped" && side.escapes === 1);
    const over = sent.filter((s) => s.ev === "manor:over" && s.payload.code === w.code).pop();
    check("…standings go out, the escaped side first", over && over.payload.sides[0].key === "p31" && over.payload.sides[0].score === ESCAPE_POINTS + 400);
    check("…the room is finished and its result recorded", recorded.includes(w.roomId) && writes.some((x) => /status = 'finished'/.test(x.sql) && x.args[0] === w.roomId));
    const scoreW = writes.filter((x) => /UPDATE room_players SET score/.test(x.sql) && x.args[3] === w.roomId);
    const s31 = scoreW.filter((x) => x.args[4] === 31).pop(), s32 = scoreW.filter((x) => x.args[4] === 32).pop();
    check("…scores written by the server", s31 && s31.args[0] === ESCAPE_POINTS + 400 && s32 && s32.args[0] === 0);
    const res = manorResults({ mode: "free" }, [{ user_id: 31, score: s31.args[0] }, { user_id: 32, score: s32.args[0] }]);
    check("…and the one who got out wins", res.get(31) === "win" && res.get(32) === "loss");
  }

  // ── together ──────────────────────────────────────────────────────────────
  {
    const w = room("coop", [{ id: 41 }, { id: 42 }]);
    const a = w.players.get(41), b = w.players.get(42);
    const fz = w.items.filter((it) => it.t === "f");
    fz.forEach((it, i) => { const who = i % 2 ? b : a; put(who, it.x, it.y); world._tick(w); put(who, core.START.x, core.START.y); });
    check("together: either of you takes a fuse for both", w.sides[0].got === 4 && w.sides[0].open);
    put(b, core.EXIT.x - 0.4, core.EXIT.y + 0.5);
    world._tick(w);
    await flush();
    check("…one of you out is all of you out", w.over && w.sides[0].escapes === 1);
    const res = manorResults({ mode: "coop" }, [{ user_id: 41, score: 1400 }, { user_id: 42, score: 1400 }]);
    check("…and you both win", res.get(41) === "win" && res.get(42) === "win");
  }

  // ── teams ─────────────────────────────────────────────────────────────────
  {
    const w = room("teams", [{ id: 51, team: 1 }, { id: 52, team: 1 }, { id: 53, team: 2 }]);
    const a = w.players.get(51), b = w.players.get(52);
    const red = w.items.filter((it) => it.t === "f" && it.side === "t1");
    put(a, red[0].x, red[0].y); world._tick(w); put(a, core.START.x, core.START.y);
    put(b, red[1].x, red[1].y); world._tick(w);
    check("teams: partners share their team's fuses", w.sides.find((s) => s.key === "t1").got === 2 && w.sides.find((s) => s.key === "t2").got === 0);
  }

  // ── caught, and back ─────────────────────────────────────────────────────
  {
    const w = room("free", [{ id: 61 }, { id: 62 }], { monsters: true });
    w.monsters = w.allMonsters;
    const M = w.monsters[0], p = w.players.get(61), q = w.players.get(62);
    // somewhere away from the start, in a corridor
    const far = core.floors(w.st.g).find(([x, y]) => Math.hypot(x - core.START.x, y - core.START.y) > 12 && core.canAt(w.st.g, x + 0.5, y + 0.5));
    put(p, far[0] + 0.5, far[1] + 0.5);
    put(q, core.START.x, core.START.y); q.graceUntil = Date.now() + 1e6;
    Object.assign(M, { x: p.x + 0.3, y: p.y, st: "chase", prey: 61, lg: 0.4, wd: 0 });
    core.setTarget(M, w.st, p.x | 0, p.y | 0);
    world._tick(w);
    check("a lunge that reaches you catches you", !p.alive && p.caught === 1 && p.respawnAt > Date.now());
    check("…the tick says who", lastTick(w.code).e.some((e) => e.type === "dead" && e.id === 61 && e.cause === "monster"));
    check("…and it goes back on its rounds", M.st === "patrol");
    check("…the match goes on", !w.over);
    p.respawnAt = Date.now() - 1;
    Object.assign(M, { x: core.START.x + 3, y: core.START.y, st: "patrol" });
    world._tick(w);
    check("a moment later: back in the Main Hall", p.alive && core.zoneAt(w.st, p.x, p.y) === "hall" && p.graceUntil > Date.now());
    check("…with the monster sent far off", Math.hypot(M.x - p.x, M.y - p.y) >= 14, Math.hypot(M.x - p.x, M.y - p.y).toFixed(1));
    check("…the tick says where", lastTick(w.code).e.some((e) => e.type === "respawn" && e.id === 61));
    // grace: it can't see you for a moment
    Object.assign(M, { x: p.x + 1.5, y: p.y, st: "patrol", prey: null });
    world._tick(w);
    check("in your moment's grace it doesn't notice you", M.st !== "notice" || M.prey !== 61);
  }

  // ── lockers ──────────────────────────────────────────────────────────────
  {
    const w = room("free", [{ id: 71 }, { id: 72 }]);
    const a = phone(71), b = phone(72), pa = w.players.get(71), pb = w.players.get(72);
    const L = w.lockers;
    // a pair of lockers close together, if this building has one
    let i0 = 0, i1 = -1;
    for (let i = 0; i < L.length && i1 < 0; i++) for (let j = 0; j < L.length; j++) if (i !== j && Math.hypot(L[i].x - L[j].x, L[i].y - L[j].y) < 1.5) { i0 = i; i1 = j; break; }
    const l = L[i0];
    put(pa, l.x + l.nx * 0.9, l.y + l.ny * 0.9);
    a.h["manor:use"]({ code: w.code, act: "hide", px: pa.x, py: pa.y });
    const r1 = a.got.find((g) => g.ev === "manor:used");
    check("hide: into the locker in front of you", r1 && r1.p.ok && pa.hid === i0 && pa.x === l.x && pa.y === l.y, `got ${pa.hid}, wanted ${i0}`);
    put(pb, l.x + l.nx * 0.9, l.y + l.ny * 0.9);
    b.h["manor:use"]({ code: w.code, act: "hide", px: pb.x, py: pb.y });
    const r2 = b.got.find((g) => g.ev === "manor:used");
    if (i1 >= 0 && Math.hypot(L[i1].x - pb.x, L[i1].y - pb.y) < 2.2) check("…the one next to it, when yours is taken", r2 && r2.p.ok && pb.hid === i1);
    else check("…not one somebody's already in", r2 && !r2.p.ok && r2.p.why === "taken" && pb.hid == null);
    const far = L.find((x) => Math.hypot(x.x - core.START.x, x.y - core.START.y) > 5);
    const c = phone(71);
    pa.hid = null; put(pa, core.START.x, core.START.y);
    c.h["manor:use"]({ code: w.code, act: "hide", px: far.x, py: far.y });
    const r3 = c.got.find((g) => g.ev === "manor:used");
    check("a locker across the building can't be reached", r3 && !r3.p.ok && pa.hid == null);
    put(pa, l.x + l.nx * 0.9, l.y + l.ny * 0.9);
    if (pb.hid === i0) pb.hid = null;
    c.h["manor:use"]({ code: w.code, act: "hide", px: pa.x, py: pa.y });
    const x0 = pa.x;
    c.me(w.code, pa.x + 0.4, pa.y);
    check("in a locker, reports don't move you", pa.x === x0 && !pa.moving);
    c.h["manor:use"]({ code: w.code, act: "out" });
    check("out again", pa.hid == null);
  }

  // ── a monster in front of your locker ────────────────────────────────────
  {
    const w = room("free", [{ id: 81 }], { monsters: true });
    w.monsters = w.allMonsters;
    const M = w.monsters[0], p = w.players.get(81), ph = phone(81);
    const l = w.lockers[0];
    put(p, l.x + l.nx * 0.9, l.y + l.ny * 0.9);
    ph.h["manor:use"]({ code: w.code, act: "hide", px: p.x, py: p.y });
    Object.assign(M, { x: l.x + l.nx * 1.0, y: l.y + l.ny * 1.0, st: "invest", wait: 0, prey: null, dm: null });
    for (let i = 0; i < 40 && p.alive; i++) { M.x = l.x + l.nx * 1.0; M.y = l.y + l.ny * 1.0; world._tick(w); }
    check("it lingers right by your locker: it finds you", !p.alive && p.hid == null);
  }

  // ── the clock, and leaving ───────────────────────────────────────────────
  {
    const w = room("free", [{ id: 91 }, { id: 92 }], { elapsed: 299950, duration: 300 });
    w.players.get(91).x = w.players.get(91).x;       // nobody does anything
    await new Promise((r) => setTimeout(r, 80));
    world._tick(w);
    await flush();
    check("time up: it's over, nobody got out", w.over && w.reason === "time" && w.sides.every((s) => !s.escapes));
    const res = manorResults({ mode: "free" }, [{ user_id: 91, score: 200 }, { user_id: 92, score: 0 }]);
    check("…and nobody wins", res.get(91) === "loss" && res.get(92) === "loss");
  }
  {
    const w = room("free", [{ id: 93 }, { id: 94 }]);
    check("leaving: you're out for good", world.forfeit(w.code, 93) && w.players.get(93).left && !w.over);
    world.forfeit(w.code, 94);
    await flush();
    check("…and when everyone has, it's over", w.over && w.reason === "done");
  }

  // ── a restart keeps what a side had ──────────────────────────────────────
  {
    const saved = JSON.stringify({ manor: { left: false, caught: 2, escapes: 0, total: 3 } });
    const w = room("free", [{ id: 95, state: saved }]);
    check("a building rebuilt after a restart keeps its fuses and catches", w.sides[0].total === 3 && w.players.get(95).caught === 2);
  }

  {
    // the room starting and phones saying hello, all at once: one building
    const ws = await Promise.all([world.worldFor("RACE01"), world.worldFor("RACE01"), world.worldFor("RACE01")]);
    check("three calls at once build one building, not three", ws[0] && ws.every((x) => x === ws[0]) && world._worlds.get("RACE01") === ws[0]);
    for (const x of new Set(ws)) if (x) clearInterval(x.timer);
  }

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
