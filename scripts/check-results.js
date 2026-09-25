// scripts/check-results.js — does a finished match actually reach the Hall of Fame?
//
// API-level, no browser. Run a local backend first:
//   PORT=4399 node server.js
//   node scripts/check-results.js
//
// It creates throwaway accounts and rooms, so point it at a development
// database, never production.

require("dotenv").config();
const mysql = require("mysql2/promise");

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
  return { token: r.body.token, id: r.body.user?.id };
}

let bad = 0;
const check = (n, ok, extra = "") => { if (!ok) bad++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost", port: +process.env.DB_PORT || 3306,
    user: process.env.DB_USER || "root", password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "playroom",
  });

  const a = await signUp(`lb1${stamp}`);
  const b = await signUp(`lb2${stamp}`);

  const made = await call("/api/rooms", { method: "POST", token: a.token,
    body: { game_slug: "numbers", max_players: 2, duration_seconds: 120 } });
  const code = made.body?.room?.room_code;
  const roomId = made.body?.room?.id;
  if (!code) throw new Error("no room: " + JSON.stringify(made.body));
  await call("/api/rooms/join", { method: "POST", token: b.token, body: { room_code: code } });
  await call(`/api/rooms/${code}/start`, { method: "PATCH", token: a.token });

  // both players score something
  await call(`/api/rooms/${code}/score`, { method: "PATCH", token: a.token, body: { score: 500, moves: 10 } });
  await call(`/api/rooms/${code}/score`, { method: "PATCH", token: b.token, body: { score: 900, moves: 12 } });

  // The clock runs out. The client notices at the deadline and the player taps
  // away a second later — still inside the server's grace window.
  await db.execute(
    "UPDATE rooms SET started_at = NOW() - INTERVAL (duration_seconds + 1) SECOND WHERE id = ?", [roomId]);

  const ra = await call("/api/leaderboard/update", { method: "POST", token: a.token, body: { room_code: code } });
  console.log("  inside the grace window:", JSON.stringify(ra.body));
  const [early] = await db.execute("SELECT user_id FROM game_sessions WHERE room_id = ?", [roomId]);
  check("nothing is ranked while scores can still land", early.length === 0, `${early.length} rows`);

  // Now the grace has passed. NOBODY calls /leaderboard/update — the players
  // shut the tab. The only thing that happens is the client's ordinary poll,
  // which is what the engine keeps doing on the results screen.
  await db.execute(
    "UPDATE rooms SET started_at = NOW() - INTERVAL (duration_seconds + 10) SECOND WHERE id = ?", [roomId]);
  await call(`/api/rooms/${code}/poll`, { token: b.token });

  const [rows] = await db.execute("SELECT user_id, score, result FROM game_sessions WHERE room_id = ?", [roomId]);
  check("a poll alone records the finished match", rows.length === 2,
    `${rows.length} of 2 rows — ${JSON.stringify(rows)}`);
  if (rows.length === 2) {
    const winner = rows.find((r) => r.result === "win");
    check("the higher score won", winner && Number(winner.score) === 900, JSON.stringify(rows));
  }

  // and the player's own totals moved
  const [[me]] = await db.execute("SELECT games_played, games_won FROM users WHERE id = ?", [b.id]);
  check("the winner's record was updated", me && me.games_played >= 1 && me.games_won >= 1, JSON.stringify(me));

  // calling update afterwards must not double-count
  await call("/api/leaderboard/update", { method: "POST", token: a.token, body: { room_code: code } });
  const [again] = await db.execute("SELECT user_id FROM game_sessions WHERE room_id = ?", [roomId]);
  check("reporting it twice doesn't double-count", again.length === 2, `${again.length} rows`);

  await db.end();
  console.log(bad ? `\n${bad} FAILED` : "\nall pass");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("harness error:", e.message); process.exit(1); });
