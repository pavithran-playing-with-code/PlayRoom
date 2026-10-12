// scripts/check-again.js — an unlimited match, and Play again together.
//
//   PORT=4399 node server.js        (a development database)
//   node scripts/check-again.js [api]
//
// API-level, no browser. Signs in three existing test accounts (it makes
// none: register is rate limited) and checks:
//   • a match with no time limit (duration 0) doesn't end on a clock; a
//     player leaving keeps their seat and score; when the last one has left
//     it's over and written down
//   • Play again: each player says they're ready; when everyone still in the
//     room is, the next match is made with all of them and already started
//   • somebody goes back to the lobby instead: the one left gets the next
//     room too, but waiting (a match for several needs a second player)
const API = process.argv[2] || "http://127.0.0.1:4399";
const PW = "Passw0rd!23";
let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (p, { method = "GET", token, body } = {}) => {
  const r = await fetch(API + p, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const login = async (u) => {
  const r = await call("/api/auth/login", { method: "POST", body: { username: u, password: PW } });
  if (!r.body.token) throw new Error(`login ${u}: ${JSON.stringify(r.body)}`);
  return { token: r.body.token, id: r.body.user.id, name: u };
};
const roomOf = async (code, t) => (await call(`/api/rooms/${code}`, { token: t })).body;

(async () => {
  const A = await login(process.env.U1 || "p13y8lt"), B = await login(process.env.U2 || "p23y8lt");

  // ── no time limit ───────────────────────────────────────────────────────────
  const made = await call("/api/rooms", { method: "POST", token: A.token, body: { game_slug: "memory", max_players: 2, duration_seconds: 0 } });
  const code = made.body.room?.room_code;
  check("a room with no time limit", made.status === 201 && Number(made.body.room?.duration_seconds) === 0, JSON.stringify(made.body.room || made.body).slice(0, 120));
  const odd = await call("/api/rooms", { method: "POST", token: A.token, body: { game_slug: "memory", max_players: 2, duration_seconds: 7 } });
  check("…other lengths are still 2 to 5 minutes", Number(odd.body.room?.duration_seconds) === 120);
  await call(`/api/rooms/${odd.body.room.room_code}/leave`, { method: "POST", token: A.token, body: {} });
  await call("/api/rooms/join", { method: "POST", token: B.token, body: { room_code: code } });
  await call(`/api/rooms/${code}/start`, { method: "PATCH", token: A.token });
  await call(`/api/rooms/${code}/score`, { method: "PATCH", token: A.token, body: { score: 300, moves: 4 } });
  await call(`/api/rooms/${code}/score`, { method: "PATCH", token: B.token, body: { score: 120, moves: 5 } });
  await sleep(4500);                                    // past any short clock's grace
  let r = await roomOf(code, A.token);
  check("it doesn't end on a clock", r.room?.status === "in_progress", r.room?.status);
  const up = await call("/api/leaderboard/update", { method: "POST", token: A.token, body: { room_code: code } });
  check("…asking for the result while it runs: still pending", !!up.body.pending, JSON.stringify(up.body).slice(0, 80));
  const la = await call(`/api/rooms/${code}/leave`, { method: "POST", token: A.token, body: {} });
  r = await roomOf(code, B.token);
  check("the host leaves: the match goes on for the other", la.body.kept && r.room?.status === "in_progress", r.room?.status);
  check("…and keeps the host's seat and score", (r.players || r.room?.players || []).some((p) => Number(p.user_id) === A.id && Number(p.score) === 300));
  await call(`/api/rooms/${code}/leave`, { method: "POST", token: B.token, body: {} });
  r = await roomOf(code, B.token);
  check("the last one leaves: it's over", r.room?.status === "finished", r.room?.status);
  await sleep(500);
  const hist = (await call(`/api/leaderboard/update`, { method: "POST", token: B.token, body: { room_code: code } })).body;
  check("…and written down, the higher score winning", JSON.stringify(hist).includes("win") || hist.success, JSON.stringify(hist).slice(0, 160));

  // ── play again, together ────────────────────────────────────────────────────
  const g0 = await call(`/api/rooms/${code}/again`, { token: B.token });
  check("after the match: who's ready (nobody yet)", g0.body.members?.length === 2 && g0.body.members.every((m) => !m.ready), JSON.stringify(g0.body).slice(0, 160));
  const a1 = await call(`/api/rooms/${code}/again`, { method: "POST", token: A.token, body: { ready: true } });
  check("A taps Play again: ready, waiting for B", a1.body.members?.find((m) => m.id === A.id)?.ready && !a1.body.next);
  const g1 = await call(`/api/rooms/${code}/again`, { token: B.token });
  check("…and B sees A ready", g1.body.members?.find((m) => m.id === A.id)?.ready === true);
  const a2 = await call(`/api/rooms/${code}/again`, { method: "POST", token: A.token, body: { ready: false } });
  check("A takes it back", a2.body.members?.find((m) => m.id === A.id)?.ready === false);
  await call(`/api/rooms/${code}/again`, { method: "POST", token: A.token, body: { ready: true } });
  const b1 = await call(`/api/rooms/${code}/again`, { method: "POST", token: B.token, body: { ready: true } });
  const nx = b1.body.next;
  check("B taps it too: everyone's ready, there's a next match", !!nx, JSON.stringify(b1.body).slice(0, 120));
  const n1 = await roomOf(nx, B.token);
  const seated = (n1.players || n1.room?.players || []).filter((p) => !p.is_spectator).map((p) => Number(p.user_id)).sort();
  check("…already started, no waiting room", n1.room?.status === "in_progress", n1.room?.status);
  check("…with both of them in it", seated.length === 2 && seated.includes(A.id) && seated.includes(B.id), JSON.stringify(seated));
  check("…same game and length", n1.room?.game_slug === "memory" && Number(n1.room?.duration_seconds) === 0);
  const late = await call(`/api/rooms/${code}/again`, { method: "POST", token: A.token, body: { ready: true } });
  check("asking again after: pointed at the same next match", late.body.next === nx);

  // ── one goes back to the lobby instead ─────────────────────────────────────
  await call(`/api/rooms/${nx}/leave`, { method: "POST", token: A.token, body: {} });
  await call(`/api/rooms/${nx}/leave`, { method: "POST", token: B.token, body: {} });
  const done2 = (await roomOf(nx, A.token)).room?.status;
  check("(the second match over: both left)", done2 === "finished", done2);
  await call(`/api/rooms/${nx}/again`, { method: "POST", token: A.token, body: { ready: true } });
  await call(`/api/rooms/${nx}/leave`, { method: "POST", token: B.token, body: {} });     // B: back to the lobby
  let n2 = null;
  for (let i = 0; i < 10 && !n2; i++) { await sleep(300); n2 = (await call(`/api/rooms/${nx}/again`, { token: A.token })).body.next; }
  const w2 = n2 && (await roomOf(n2, A.token)).room;
  check("B goes back to the lobby: A, the only one left and ready, gets the next room", !!n2, String(n2));
  check("…waiting, for someone to join (a match for several needs two)", w2 && w2.status === "waiting", w2 && w2.status);
  if (n2) await call(`/api/rooms/${n2}/leave`, { method: "POST", token: A.token, body: {} });

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
