// scripts/check-spectating.js — can you see, and watch, a friend who is mid-match?
//
// API-level, no browser. Run a local backend first:
//   PORT=4399 node server.js
//   node scripts/check-spectating.js
//
// It creates throwaway accounts and rooms, so point it at a development
// database, never production.

require("dotenv").config();

const API = "http://127.0.0.1:4399";
const pw = "Passw0rd!23";
const stamp = Date.now().toString(36).slice(-5);

const call = async (path, { method = "GET", token, body } = {}) => {
  const r = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
async function signUp(username) {
  let r = await call("/api/auth/register", { method: "POST", body: { username, email: `${username}@e2e.test`, password: pw } });
  if (!r.body.token) r = await call("/api/auth/login", { method: "POST", body: { username, password: pw } });
  if (!r.body.token) throw new Error("no token: " + JSON.stringify(r.body).slice(0, 200));
  return { token: r.body.token, id: r.body.user?.id, username };
}

let bad = 0;
const check = (n, ok, extra = "") => { if (!ok) bad++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

(async () => {
  const watcher = await signUp(`sp1${stamp}`);
  const player  = await signUp(`sp2${stamp}`);
  const mate    = await signUp(`sp3${stamp}`);

  // become friends: watcher asks, player accepts
  const req = await call("/api/friends/request", { method: "POST", token: watcher.token, body: { user_id: player.id } });
  check("friend request sent", req.body?.success === true, JSON.stringify(req.body).slice(0, 140));
  const pend = await call("/api/friends/pending", { token: player.token });
  const incoming = (pend.body?.incoming || [])[0];
  check("request arrived", !!incoming, JSON.stringify(pend.body).slice(0, 160));
  const acc = await call(`/api/friends/${incoming?.id ?? player.id}/accept`, { method: "POST", token: player.token });
  check("friend request accepted", acc.body?.success === true, JSON.stringify(acc.body).slice(0, 140));

  // before any match, nothing to watch
  const idle = await call("/api/friends", { token: watcher.token });
  const before = (idle.body?.friends || []).find((f) => f.id === player.id);
  check("friend appears in the list", !!before, JSON.stringify(idle.body).slice(0, 160));
  check("not watchable while idle", before && before.playing === null, JSON.stringify(before?.playing));

  // the friend starts a two-player match
  const made = await call("/api/rooms", { method: "POST", token: player.token,
    body: { game_slug: "numbers", max_players: 2, duration_seconds: 120 } });
  const code = made.body?.room?.room_code;
  await call("/api/rooms/join", { method: "POST", token: mate.token, body: { room_code: code } });
  const started = await call(`/api/rooms/${code}/start`, { method: "PATCH", token: player.token });
  check("their match started", started.body?.success === true, JSON.stringify(started.body).slice(0, 120));

  const live = await call("/api/friends", { token: watcher.token });
  const now = (live.body?.friends || []).find((f) => f.id === player.id);
  check("friend shows as playing", !!now?.playing, JSON.stringify(now?.playing));
  if (now?.playing) {
    check("it names the room to join", now.playing.room_code === code, now.playing.room_code);
    check("it names the game", !!now.playing.game_name, now.playing.game_name);
  }

  // and the watcher can actually get in, as a spectator
  const join = await call("/api/rooms/join", { method: "POST", token: watcher.token, body: { room_code: code } });
  check("watcher joined", join.body?.success === true, JSON.stringify(join.body).slice(0, 120));
  check("watcher is a spectator, not a player", join.body?.as_spectator === true, String(join.body?.as_spectator));

  // a solo run is watchable too — that is where most games actually get played
  const solo = await call("/api/rooms", { method: "POST", token: player.token,
    body: { game_slug: "mahjong", max_players: 1, duration_seconds: 120 } });
  const soloCode = solo.body?.room?.room_code;
  await call(`/api/rooms/${soloCode}/start`, { method: "PATCH", token: player.token });

  const during = await call("/api/friends", { token: watcher.token });
  const soloRow = (during.body?.friends || []).find((f) => f.id === player.id);
  check("a solo run is offered to watch", soloRow?.playing?.room_code === soloCode,
    JSON.stringify(soloRow?.playing));

  const watchSolo = await call("/api/rooms/join", { method: "POST", token: watcher.token, body: { room_code: soloCode } });
  check("watcher gets into the solo run", watchSolo.body?.success === true, JSON.stringify(watchSolo.body).slice(0, 140));
  check("and only as a spectator", watchSolo.body?.as_spectator === true, String(watchSolo.body?.as_spectator));

  // it must not have handed them a seat
  const poll = await call(`/api/rooms/${soloCode}/poll`, { token: player.token });
  const seats = (poll.body?.players || []).filter((p) => !p.is_spectator);
  check("the solo player is still alone in the game", seats.length === 1, `${seats.length} seated`);

  // a solo run nobody has started yet is still closed
  const notYet = await call("/api/rooms", { method: "POST", token: player.token,
    body: { game_slug: "mahjong", max_players: 1, duration_seconds: 120 } });
  const shut = await call("/api/rooms/join", { method: "POST", token: watcher.token,
    body: { room_code: notYet.body?.room?.room_code } });
  check("a solo run that hasn't started stays closed", shut.status === 403, `${shut.status} ${shut.body?.message}`);

  console.log(bad ? `\n${bad} FAILED` : "\nall pass");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("harness error:", e.message); process.exit(1); });
