// scripts/check-together-world.js — the together games online, the server's side.
//
//   node scripts/check-together-world.js
//
// No database, no network: config/db.js, recordResults and the socket hub are
// swapped for fakes before the world module loads, and the test plays the
// part of the phones by calling the same socket handlers they call.
//
// Sides come out right for every mode (a world each, a world per team, one
// world for all); a phone only reaches its own side's world; spectators can
// watch any side; the server writes every member's score and goal; leaving
// keeps the seat; and the match ends on the clock, or when everyone's gone.
const path = require("path");

// ── fakes ────────────────────────────────────────────────────────────────────
const writes = [];
let spectators = new Set();
const fakeDb = {
  execute: async (sql, args) => {
    if (/^\s*SELECT rp\.is_spectator/.test(sql)) return [[{ is_spectator: spectators.has(Number(args[1])) ? 1 : 0 }]];
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
  to: (ch) => ({ emit: (ev, payload) => sent.push({ ch, ev, payload }) }),
};

const world = require("../config/togetherWorld");
const { togetherResults, resultsFor } = require("../config/matchResult");

let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};
const tick = () => new Promise((r) => setImmediate(r));

function phone(uid) {
  const h = {}, got = [], rooms = new Set();
  const sock = { user: { id: uid }, on: (ev, fn) => { h[ev] = fn; }, emit: (ev, p) => got.push({ ev, p }), join: (c) => rooms.add(c), leave: (c) => rooms.delete(c) };
  fakeIo.handlers(sock);
  return { h, got, rooms, last: (ev) => [...got].reverse().find((g) => g.ev === ev)?.p };
}

let codeN = 0;
function room(game, mode, seats, { elapsed = 0, duration = 120 } = {}) {
  const code = `G${String(++codeN).padStart(5, "0")}`;
  const r = { id: 100 + codeN, room_code: code, seed: 999 + codeN, mode, duration_seconds: duration, game_slug: game };
  const w = world._buildWorld(r, seats.map((s) => ({ user_id: s.id, team: s.team ?? null, username: `p${s.id}`, avatar: "🙂", game_state: s.state || null })), elapsed);
  world._worlds.set(code, w);
  return w;
}

(async () => {
  world._setIo(fakeIo);
  world.attach(fakeIo);
  await world.ready;

  // ── sides ──────────────────────────────────────────────────────────────────
  {
    const free = room("kitchen", "free", [{ id: 1 }, { id: 2 }, { id: 3 }]);
    check("against friends: a kitchen each", free.sides.length === 3 && free.sides.every((s) => s.inst.players.size === 1));
    const teams = room("kitchen", "teams", [{ id: 1, team: 1 }, { id: 2, team: 1 }, { id: 3, team: 2 }, { id: 4, team: 2 }]);
    check("teams: a kitchen per team, shared by its members", teams.sides.length === 2 && teams.sides.every((s) => s.inst.players.size === 2));
    const coop = room("kitchen", "coop", [{ id: 1 }, { id: 2 }, { id: 3 }]);
    check("together: one kitchen for everybody", coop.sides.length === 1 && coop.sides[0].inst.players.size === 3);
    const seqs = free.sides.map((s) => { const out = []; for (let i = 0; i < 600; i++) { world._worlds.get(free.code).core.step(s.inst, 0.1); out.push(...s.inst.orders.map((o) => o.r)); s.inst.orders = []; } return out.join(); });
    check("…and every kitchen gets the same orders", seqs.every((x) => x === seqs[0]) && seqs[0].length > 10);
  }

  // ── phones ─────────────────────────────────────────────────────────────────
  {
    const w = room("kitchen", "free", [{ id: 11 }, { id: 12 }]);
    world._start(w);
    const a = phone(11), b = phone(12);
    await a.h["tg:hello"]({ code: w.code });
    await b.h["tg:hello"]({ code: w.code });
    const ia = a.last("tg:init"), ib = b.last("tg:init");
    check("a phone is told its own side's world", ia && ia.side === "p11" && ib.side === "p12" && ia.role === "player");
    check("…and listens to its side's channel", a.rooms.has(`tg:${w.code}:p11`) && !a.rooms.has(`tg:${w.code}:p12`));
    // take a plate: use the plate stack from beside it
    const inst = w.sides.find((s) => s.key === "p11").inst;
    const p = inst.players.get(11);
    p.x = 4.5; p.y = 3.5;
    a.h["tg:act"]({ code: w.code, n: 1, a: "use", x: 4, y: 4 });
    const rep = a.last("tg:reply");
    check("an action is answered, with its number", rep && rep.n === 1 && rep.ok && p.hold && p.hold.k === "plate");
    check("…in that phone's own kitchen only", !w.sides.find((s) => s.key === "p12").inst.players.get(12).hold);
    a.h["tg:act"]({ code: "NOPE1", n: 2, a: "use", x: 4, y: 4 });
    check("an action for a room you're not in goes nowhere", a.last("tg:reply").n === 1);
    // spectating
    spectators = new Set([50]);
    const s = phone(50);
    await s.h["tg:hello"]({ code: w.code, watch: 12 });
    check("a spectator can watch the player they came for", s.last("tg:init").side === "p12" && s.last("tg:init").role === "spectator");
    s.h["tg:watch"]({ code: w.code, side: "p11" });
    check("…and switch to another side", s.last("tg:init").side === "p11" && s.rooms.has(`tg:${w.code}:p11`) && !s.rooms.has(`tg:${w.code}:p12`));
    s.h["tg:act"]({ code: w.code, n: 7, a: "use", x: 4, y: 4 });
    check("…but can't touch anything", !s.got.some((g) => g.ev === "tg:reply"));
    spectators = new Set();
    // ticks go to each side's channel
    sent.length = 0;
    world._tick(w);
    const chans = new Set(sent.filter((m) => m.ev === "tg:tick").map((m) => m.ch));
    check("each side's tick goes to its own channel", chans.has(`tg:${w.code}:p11`) && chans.has(`tg:${w.code}:p12`) && chans.size === 2);
    const tk = sent.find((m) => m.ev === "tg:tick").payload;
    check("…with everyone's score alongside", Array.isArray(tk.sc) && tk.sc.length === 2);
    // a teleport report is refused and answered with a snap
    a.h["tg:me"]({ code: w.code, x: 0.5, y: 0.5 });
    check("a chef reported inside a counter is put back", !!a.last("tg:snap"));
    clearInterval(w.timer);
  }

  // ── scores and the end ─────────────────────────────────────────────────────
  {
    const w = room("kitchen", "coop", [{ id: 21 }, { id: 22 }], { duration: 60 });
    world._start(w);
    const inst = w.sides[0].inst;
    inst.score = inst.line[0] + 5;              // past the first star
    writes.length = 0;
    w.startMs -= 61000;                         // the clock has run out
    world._tick(w);
    await tick(); await tick(); await tick();
    const ups = writes.filter((x) => /^UPDATE room_players SET score/.test(x.sql));
    check("when the clock runs out, every member's score is written", ups.length === 2 && ups.every((u) => u.args[0] === inst.score));
    check("…with the goal reached (pairs_matched = 1)", ups.every((u) => u.args[1] === 1));
    check("…the room is finished and the results recorded", writes.some((x) => /UPDATE rooms SET status = 'finished'/.test(x.sql)) && recorded.includes(w.roomId));
    const over = sent.filter((m) => m.ev === "tg:over").pop();
    check("…and everyone is told how it went", over && over.payload.code === w.code && over.payload.sides[0].goal === true && over.payload.reason === "time");
  }
  {
    const w = room("kitchen", "free", [{ id: 31 }, { id: 32 }]);
    world._start(w);
    check("leaving keeps the seat and the match goes on", world.forfeit(w.code, 31) && !w.over && w.players.get(31).left);
    check("…your chef is out of the kitchen", w.sides.find((s) => s.key === "p31").inst.players.get(31).left);
    world.forfeit(w.code, 32);
    await tick(); await tick();
    check("when the last one leaves, the match is over", w.over && w.reason === "left");
  }

  // ── who won ────────────────────────────────────────────────────────────────
  {
    const R = (mode, rows) => resultsFor({ game_slug: "kitchen", mode }, rows);
    const solo = R("free", [{ user_id: 1, score: 400, pairs_matched: 1 }]);
    check("solo: reaching the goal is a win", solo.get(1) === "win");
    check("solo: missing it is a loss", R("free", [{ user_id: 1, score: 40, pairs_matched: 0 }]).get(1) === "loss");
    const co = R("coop", [{ user_id: 1, score: 500, pairs_matched: 1 }, { user_id: 2, score: 500, pairs_matched: 1 }]);
    check("together: the whole side wins together", co.get(1) === "win" && co.get(2) === "win");
    const vs = R("free", [{ user_id: 1, score: 300, pairs_matched: 1 }, { user_id: 2, score: 500, pairs_matched: 1 }]);
    check("against friends: the best score wins", vs.get(2) === "win" && vs.get(1) === "loss");
    const tie = R("free", [{ user_id: 1, score: 300 }, { user_id: 2, score: 300 }]);
    check("…a tie at the top is a draw", tie.get(1) === "draw" && tie.get(2) === "draw");
    const tm = R("teams", [{ user_id: 1, team: 1, score: 600 }, { user_id: 2, team: 1, score: 600 }, { user_id: 3, team: 2, score: 700 }, { user_id: 4, team: 2, score: 700 }]);
    check("teams: sides compared on their own score, not a sum", tm.get(3) === "win" && tm.get(1) === "loss");
    check("the together rules are only for the together games", typeof togetherResults === "function" && resultsFor({ game_slug: "dino", mode: "free" }, [{ user_id: 1, score: 5 }]).get(1) === "incomplete");
  }

  console.log(fails ? `\n${fails} failed` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
