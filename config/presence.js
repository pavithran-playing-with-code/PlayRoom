// config/presence.js
// Who is online right now, and when everyone else was last seen.
//
// "Online" lives in memory, owned by the Socket.io hub: a user is online while
// they hold at least one live socket. "Last seen" is kept in memory too, and is
// also written to users.last_seen_at so it survives a server restart. That
// column is optional. Until the owner adds it (one ALTER TABLE, run by hand),
// the database half is quietly skipped instead of failing.
const db = require("./db");

const online = new Map();     // userId -> Set<socketId>
const lastSeen = new Map();   // userId -> Date, for users seen since this process started

// Look for the column once, and again every few minutes while it's missing, so
// adding it takes effect without a restart.
const RECHECK_MS = 5 * 60 * 1000;
const column = { ok: false, checkedAt: 0 };

async function hasLastSeenColumn() {
  if (column.ok) return true;
  if (Date.now() - column.checkedAt < RECHECK_MS) return false;
  column.checkedAt = Date.now();
  try {
    const [rows] = await db.execute("SHOW COLUMNS FROM users LIKE 'last_seen_at'");
    column.ok = rows.length > 0;
  } catch {
    column.ok = false;
  }
  return column.ok;
}

function isOnline(userId) {
  return online.has(Number(userId));
}

function onlineUserIds() {
  return [...online.keys()];
}

async function stampLastSeen(userId) {
  const id = Number(userId);
  lastSeen.set(id, new Date());
  if (!(await hasLastSeenColumn())) return;
  try {
    await db.execute("UPDATE users SET last_seen_at = NOW() WHERE id = ?", [id]);
  } catch { /* presence is best-effort */ }
}

async function friendIdsOf(userId) {
  const id = Number(userId);
  const [rows] = await db.execute(
    `SELECT IF(user_a = ?, user_b, user_a) AS id
       FROM friendships
      WHERE (user_a = ? OR user_b = ?) AND status = 'accepted'`,
    [id, id, id]
  );
  return rows.map((r) => Number(r.id));
}

// { [id]: { online, last_seen } } for the given users. last_seen is an ISO
// string, or null when nobody knows.
async function presenceOf(ids) {
  const out = {};
  const unknown = [];
  for (const raw of ids) {
    const id = Number(raw);
    if (!Number.isInteger(id)) continue;
    const seen = lastSeen.get(id);
    out[id] = { online: online.has(id), last_seen: seen ? seen.toISOString() : null };
    if (!out[id].online && !seen) unknown.push(id);
  }
  if (unknown.length && (await hasLastSeenColumn())) {
    try {
      const [rows] = await db.execute(
        `SELECT id, last_seen_at FROM users WHERE id IN (${unknown.map(() => "?").join(",")})`,
        unknown
      );
      for (const r of rows) {
        if (r.last_seen_at) out[Number(r.id)].last_seen = new Date(r.last_seen_at).toISOString();
      }
    } catch { /* leave them as "offline" */ }
  }
  return out;
}

module.exports = { online, isOnline, onlineUserIds, stampLastSeen, friendIdsOf, presenceOf };
