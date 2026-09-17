// routes/rooms.js
const router = require("express").Router();
const db     = require("../config/db");
const { verifyToken } = require("../middleware/auth");
const { emitRoom, emitUser } = require("../config/socket");

// ── Match clock (server-authoritative) ────────────────────────────────────────
// The countdown a player sees is client-side, so it can be paused, slowed or
// ignored entirely. The server therefore owns the real deadline:
// started_at + duration_seconds. Once that passes, the room is `finished` and
// no further score writes are accepted.
//
// The comparison is done in SQL rather than JS so it never depends on the Node
// process and MySQL agreeing about the current time or the timezone.
const CLOCK_GRACE_SECONDS = 3;   // absorbs network latency on the final sync

// Flip an expired in_progress room to `finished`. Idempotent — the WHERE clause
// means only the first caller to notice actually performs the transition.
// Returns true if this call ended the match.
async function settleIfExpired(roomId) {
  const [r] = await db.execute(
    `UPDATE rooms SET status = 'finished', finished_at = NOW()
      WHERE id = ? AND status = 'in_progress' AND started_at IS NOT NULL
        AND started_at + INTERVAL (duration_seconds + ${CLOCK_GRACE_SECONDS}) SECOND <= NOW()`,
    [roomId]
  );
  return r.affectedRows > 0;
}

// Keeps the stale-room sweep honest — see sweepStaleRooms() in server.js.
async function touchRoom(roomId) {
  try {
    await db.execute("UPDATE rooms SET last_activity_at = NOW() WHERE id = ?", [roomId]);
  } catch { /* non-critical */ }
}

// Joining a room answers any invite to it, so it stops counting in the badge.
async function answerInvite(roomId, userId) {
  try {
    await db.execute(
      "UPDATE room_invites SET status = 'accepted', responded_at = NOW() WHERE room_id = ? AND to_user = ? AND status = 'pending'",
      [roomId, userId]
    );
  } catch { /* non-critical */ }
}

// Push a change to everyone subscribed to this room's socket channel. REST
// stays the source of truth; this just saves clients from waiting for the poll.
function push(req, code, event, payload = {}) {
  emitRoom(req.app.get("io"), code, event, payload);
}

function genCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const ROOM_CODE_RE = /^[A-Z0-9]{4,8}$/;
const GAME_SLUG_RE = /^[a-z0-9_-]{1,40}$/;
function normCode(raw) {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return ROOM_CODE_RE.test(code) ? code : null;
}

// Normalize/validate any `:code` URL param once for all routes below.
router.param("code", (req, res, next, raw) => {
  const code = normCode(raw);
  if (!code) return res.status(400).json({ success: false, message: "Invalid room code." });
  req.params.code = code;
  next();
});

// GET /api/rooms — open public rooms
router.get("/", verifyToken, async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT r.id, r.room_code, r.status, r.max_players, r.is_private, r.duration_seconds, r.created_at,
             gt.name AS game_name, gt.icon AS game_icon, gt.slug AS game_slug,
             u.username AS host_name,
             COUNT(rp.id) AS player_count
      FROM rooms r
      JOIN game_types gt  ON gt.id = r.game_type_id
      JOIN users u        ON u.id  = r.host_id
      LEFT JOIN room_players rp ON rp.room_id = r.id
      -- max_players = 1 is a solo run: nobody can join it, so listing it as an
      -- "open room" would only produce failed joins.
      WHERE r.status = 'waiting' AND r.is_private = 0 AND r.max_players > 1
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT 20
    `);
    res.json({ success: true, rooms: rows });
  } catch (err) { next(err); }
});

// POST /api/rooms — create room
router.post("/", verifyToken, async (req, res, next) => {
  try {
    const { game_slug, max_players = 2, is_private = false, duration_seconds = 120 } = req.body;
    if (typeof game_slug !== "string" || !GAME_SLUG_RE.test(game_slug))
      return res.status(400).json({ success: false, message: "Invalid game_slug." });

    // Match length: clamp to [120s, 300s] (2–5 minutes).
    const DURATION_MIN = 120, DURATION_MAX = 300;
    const duration = Math.max(DURATION_MIN,
      Math.min(DURATION_MAX, Math.floor(Number(duration_seconds) || DURATION_MIN)));

    const [gt] = await db.execute(
      "SELECT id, max_players FROM game_types WHERE slug = ? AND is_active = 1",
      [game_slug]
    );
    if (!gt.length)
      return res.status(404).json({ success: false, message: `"${game_slug}" isn't set up in the database yet (game_types).` });

    const requested = Number(max_players);
    if (!Number.isFinite(requested) || requested < 1)
      return res.status(400).json({ success: false, message: "max_players must be a positive number." });
    const cap = Math.min(Math.floor(requested), gt[0].max_players);
    // A solo run is always private — there is no seat for anyone else, so it
    // must never appear in the open-room list regardless of what was sent.
    const priv = (cap === 1 || is_private) ? 1 : 0;

    let code; let tries = 0;
    do {
      code = genCode(6);
      const [ex] = await db.execute("SELECT id FROM rooms WHERE room_code = ?", [code]);
      if (!ex.length) break;
    } while (++tries < 10);

    const seed = Math.floor(Math.random() * 1_000_000);
    const [result] = await db.execute(
      "INSERT INTO rooms (room_code, game_type_id, host_id, max_players, is_private, seed, duration_seconds, last_activity_at) VALUES (?,?,?,?,?,?,?,NOW())",
      [code, gt[0].id, req.user.id, cap, priv, seed, duration]
    );
    const roomId = result.insertId;
    await db.execute(
      "INSERT INTO room_players (room_id, user_id, is_host) VALUES (?,?,1)",
      [roomId, req.user.id]
    );
    res.status(201).json({ success: true, room: { id: roomId, room_code: code, seed, max_players: cap, duration_seconds: duration } });
  } catch (err) { next(err); }
});

// POST /api/rooms/join
router.post("/join", verifyToken, async (req, res, next) => {
  try {
    const code = normCode(req.body.room_code);
    if (!code) return res.status(400).json({ success: false, message: "Invalid room_code." });

    const [rooms] = await db.execute(`
      SELECT r.id, r.status, r.max_players, r.seed,
             gt.slug AS game_slug, gt.name AS game_name
      FROM rooms r JOIN game_types gt ON gt.id = r.game_type_id
      WHERE r.room_code = ?
    `, [code]);
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });

    const room = rooms[0];
    if (room.status === "finished" || room.status === "abandoned")
      return res.status(409).json({ success: false, message: "Game has ended." });

    // Count active players (spectators don't take a seat).
    const [members] = await db.execute(
      "SELECT user_id, is_spectator FROM room_players WHERE room_id = ?",
      [room.id]
    );
    const existing = members.find(p => p.user_id === req.user.id);
    if (existing) {
      await answerInvite(room.id, req.user.id);
      return res.json({ success: true, room, already_joined: true, as_spectator: !!existing.is_spectator });
    }

    // Solo run: closed to everyone but its owner — not even as a spectator.
    if (Number(room.max_players) === 1)
      return res.status(403).json({ success: false, message: "That's a solo run — it can't be joined." });

    const seatedCount = members.filter(m => !m.is_spectator).length;
    const isFull      = seatedCount >= room.max_players;
    const isLive      = room.status === "in_progress";

    // Join as spectator when seats are full OR the game is already underway.
    const asSpectator = isFull || isLive ? 1 : 0;

    await db.execute(
      "INSERT INTO room_players (room_id, user_id, is_spectator) VALUES (?,?,?)",
      [room.id, req.user.id, asSpectator]
    );
    await touchRoom(room.id);
    await answerInvite(room.id, req.user.id);
    push(req, code, "room:players", { code, joined: req.user.id });
    res.json({ success: true, room, as_spectator: !!asSpectator });
  } catch (err) { next(err); }
});

// GET /api/rooms/:code
router.get("/:code", verifyToken, async (req, res, next) => {
  try {
    // Same authority as /poll — never report a room as live past its deadline.
    const [pre] = await db.execute("SELECT id FROM rooms WHERE room_code = ?", [req.params.code]);
    if (pre.length && await settleIfExpired(pre[0].id))
      push(req, req.params.code, "room:ended", { code: req.params.code });

    const [rooms] = await db.execute(`
      SELECT r.id, r.room_code, r.status, r.max_players, r.seed, r.duration_seconds,
             r.started_at, r.created_at,
             gt.slug AS game_slug, gt.name AS game_name, gt.icon AS game_icon,
             u.username AS host_name
      FROM rooms r
      JOIN game_types gt ON gt.id = r.game_type_id
      JOIN users u       ON u.id  = r.host_id
      WHERE r.room_code = ?
    `, [req.params.code]);
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });

    const room = rooms[0];
    const [players] = await db.execute(`
      SELECT rp.is_host, rp.is_spectator, rp.score, rp.joined_at,
             u.id AS user_id, u.username, u.avatar
      FROM room_players rp JOIN users u ON u.id = rp.user_id
      WHERE rp.room_id = ?
      ORDER BY rp.is_spectator, rp.is_host DESC, rp.joined_at
    `, [room.id]);
    res.json({ success: true, room: { ...room, players } });
  } catch (err) { next(err); }
});

// PATCH /api/rooms/:code/start
router.patch("/:code/start", verifyToken, async (req, res, next) => {
  try {
    const [rooms] = await db.execute(
      "SELECT id, host_id, status, max_players FROM rooms WHERE room_code = ?",
      [req.params.code]
    );
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });
    const room = rooms[0];
    if (room.host_id !== req.user.id)
      return res.status(403).json({ success: false, message: "Only the host can start." });
    if (room.status !== "waiting")
      return res.status(409).json({ success: false, message: "Game already started." });

    // A 2-player room is a 2-player match: every seat must be filled first.
    const [[seated]] = await db.execute(
      "SELECT COUNT(*) AS n FROM room_players WHERE room_id = ? AND is_spectator = 0", [room.id]
    );
    const waitingFor = Number(room.max_players) - Number(seated.n);
    if (waitingFor > 0)
      return res.status(409).json({
        success: false,
        message: `Waiting for ${waitingFor} more player${waitingFor > 1 ? "s" : ""} to join.`,
      });

    // started_at is the anchor the server measures the match deadline from.
    await db.execute(
      "UPDATE rooms SET status = 'in_progress', started_at = NOW(), last_activity_at = NOW() WHERE id = ?",
      [room.id]
    );
    push(req, req.params.code, "room:started", { code: req.params.code });
    res.json({ success: true, message: "Game started!" });
  } catch (err) { next(err); }
});

// PATCH /api/rooms/:code/score
// Caps prevent client tampering. Leaderboard route re-caps on game-end.
const MAX_SCORE      = 25000;
const MAX_PAIRS      = 100;
const MAX_MOVES      = 5000;
const MAX_STATE_LEN  = 4096;   // JSON game_state string upper bound

// Absent field → null → COALESCE leaves the stored value alone.
// This used to coerce `undefined` to 0, so a caller that sent only `score`
// silently zeroed pairs_matched and moves. useGameEngine does exactly that.
function clampOrNull(raw, max) {
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(Math.floor(n), max));
}

function sanitizeState(raw) {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  if (raw.length > MAX_STATE_LEN) return null;
  try {
    const parsed = JSON.parse(raw);
    // Whitelist: { matched: number[] } shape only.
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.matched)) return null;
    if (parsed.matched.length > 200) return null;
    const cleaned = parsed.matched
      .map(n => Number(n))
      .filter(n => Number.isInteger(n) && n >= 0 && n < 200);
    return JSON.stringify({ matched: cleaned });
  } catch { return null; }
}

router.patch("/:code/score", verifyToken, async (req, res, next) => {
  try {
    const score         = clampOrNull(req.body.score,         MAX_SCORE);
    const pairs_matched = clampOrNull(req.body.pairs_matched, MAX_PAIRS);
    const moves         = clampOrNull(req.body.moves,         MAX_MOVES);
    const game_state    = sanitizeState(req.body.game_state); // null if absent/invalid

    const [rooms] = await db.execute(
      "SELECT id, status FROM rooms WHERE room_code = ?", [req.params.code]
    );
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });
    const roomId = rooms[0].id;

    // End the match first if its clock has run out, so the write below is
    // rejected by the status guard rather than landing after the deadline.
    if (await settleIfExpired(roomId)) push(req, req.params.code, "room:ended", { code: req.params.code });

    // One guarded write: the join enforces "match is actually running", the
    // WHERE enforces "you are a seated player in it".
    const [result] = await db.execute(
      `UPDATE room_players rp
         JOIN rooms r ON r.id = rp.room_id
          SET rp.score         = COALESCE(?, rp.score),
              rp.pairs_matched = COALESCE(?, rp.pairs_matched),
              rp.moves         = COALESCE(?, rp.moves),
              rp.game_state    = COALESCE(?, rp.game_state),
              r.last_activity_at = NOW()
        WHERE rp.room_id = ? AND rp.user_id = ? AND rp.is_spectator = 0
          AND r.status = 'in_progress'`,
      [score, pairs_matched, moves, game_state, roomId, req.user.id]
    );

    if (result.affectedRows === 0) {
      // Only now pay for a second query, to say *why* it was rejected.
      const [me] = await db.execute(
        "SELECT is_spectator FROM room_players WHERE room_id = ? AND user_id = ?",
        [roomId, req.user.id]
      );
      if (!me.length)
        return res.status(403).json({ success: false, message: "You are not in this room." });
      if (me[0].is_spectator)
        return res.status(403).json({ success: false, message: "Spectators cannot submit scores." });
      return res.status(409).json({ success: false, message: "The match is not running.", match_over: true });
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/rooms/:code/poll
router.get("/:code/poll", verifyToken, async (req, res, next) => {
  try {
    const [pre] = await db.execute(
      "SELECT id FROM rooms WHERE room_code = ?", [req.params.code]
    );
    if (!pre.length) return res.status(404).json({ success: false, message: "Room not found." });

    // Expire the match before reporting status, so every client learns the
    // game is over from the same authority instead of its own local clock.
    if (await settleIfExpired(pre[0].id)) push(req, req.params.code, "room:ended", { code: req.params.code });

    const [rooms] = await db.execute(
      "SELECT id, status, seed, duration_seconds, started_at FROM rooms WHERE room_code = ?",
      [req.params.code]
    );
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });

    const [players] = await db.execute(`
      SELECT rp.is_host, rp.is_spectator, rp.score, rp.pairs_matched, rp.moves, rp.game_state,
             u.id AS user_id, u.username, u.avatar
      FROM room_players rp JOIN users u ON u.id = rp.user_id
      WHERE rp.room_id = ?
      ORDER BY rp.is_spectator, rp.is_host DESC, rp.joined_at
    `, [rooms[0].id]);

    // game_state is a player's private board progress. Spectators need it to
    // mirror the player they're watching; opponents have no business seeing it.
    const iAmSpectator = players.some(p => p.user_id === req.user.id && p.is_spectator);
    const visiblePlayers = players.map(p =>
      (iAmSpectator || p.user_id === req.user.id) ? p : { ...p, game_state: null }
    );

    const [msgs] = await db.execute(`
      SELECT cm.message, cm.sent_at, u.username, u.avatar
      FROM chat_messages cm JOIN users u ON u.id = cm.user_id
      WHERE cm.room_id = ?
      ORDER BY cm.sent_at DESC LIMIT 30
    `, [rooms[0].id]);

    res.json({
      success: true,
      status: rooms[0].status,
      seed: rooms[0].seed,
      duration_seconds: rooms[0].duration_seconds,
      started_at: rooms[0].started_at,
      server_now: new Date().toISOString(),  // lets clients anchor the clock to server time
      players: visiblePlayers,
      chat: msgs.reverse(),
    });
  } catch (err) { next(err); }
});

// POST /api/rooms/:code/chat
router.post("/:code/chat", verifyToken, async (req, res, next) => {
  try {
    const { message } = req.body;
    if (typeof message !== "string" || !message.trim())
      return res.status(400).json({ success: false, message: "Message cannot be empty." });
    // Strip control chars (incl. zero-width) but keep newlines and printable unicode.
    const cleaned = message.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trim().slice(0, 300);
    if (!cleaned) return res.status(400).json({ success: false, message: "Message cannot be empty." });

    const [rooms] = await db.execute("SELECT id FROM rooms WHERE room_code = ?", [req.params.code]);
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });

    // Only room members may chat.
    const [member] = await db.execute(
      "SELECT 1 FROM room_players WHERE room_id = ? AND user_id = ? LIMIT 1",
      [rooms[0].id, req.user.id]
    );
    if (!member.length)
      return res.status(403).json({ success: false, message: "Join the room before chatting." });

    await db.execute(
      "INSERT INTO chat_messages (room_id, user_id, message) VALUES (?,?,?)",
      [rooms[0].id, req.user.id, cleaned]
    );
    await touchRoom(rooms[0].id);
    push(req, req.params.code, "room:chat", {
      code: req.params.code, username: req.user.username, message: cleaned,
    });
    res.status(201).json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/rooms/:code/invite  { user_id }
// Only members can invite, target must be an accepted friend.
router.post("/:code/invite", verifyToken, async (req, res, next) => {
  try {
    const target = Number(req.body.user_id);
    if (!Number.isInteger(target) || target <= 0)
      return res.status(400).json({ success: false, message: "Invalid user_id." });
    if (target === req.user.id)
      return res.status(400).json({ success: false, message: "Cannot invite yourself." });

    const [rooms] = await db.execute(
      `SELECT r.id, r.status, r.max_players, gt.name AS game_name, gt.icon AS game_icon
         FROM rooms r JOIN game_types gt ON gt.id = r.game_type_id
        WHERE r.room_code = ?`,
      [req.params.code]
    );
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });
    if (rooms[0].status === "finished" || rooms[0].status === "abandoned")
      return res.status(409).json({ success: false, message: "Game has ended." });
    if (Number(rooms[0].max_players) === 1)
      return res.status(409).json({ success: false, message: "Solo runs can't be shared." });

    const [member] = await db.execute(
      "SELECT 1 FROM room_players WHERE room_id = ? AND user_id = ? LIMIT 1",
      [rooms[0].id, req.user.id]
    );
    if (!member.length)
      return res.status(403).json({ success: false, message: "Join the room before inviting." });

    // Must be an accepted friend.
    const a = Math.min(req.user.id, target), b = Math.max(req.user.id, target);
    const [fr] = await db.execute(
      "SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'accepted' LIMIT 1",
      [a, b]
    );
    if (!fr.length)
      return res.status(403).json({ success: false, message: "You can only invite accepted friends." });

    // Don't invite if the target is already in the room.
    const [already] = await db.execute(
      "SELECT 1 FROM room_players WHERE room_id = ? AND user_id = ? LIMIT 1",
      [rooms[0].id, target]
    );
    if (already.length)
      return res.status(409).json({ success: false, message: "They're already in the room." });

    // Upsert: replace prior invite for this room+user.
    await db.execute(
      `INSERT INTO room_invites (room_id, from_user, to_user, status)
         VALUES (?,?,?, 'pending')
       ON DUPLICATE KEY UPDATE
         from_user    = VALUES(from_user),
         status       = 'pending',
         responded_at = NULL,
         created_at   = CURRENT_TIMESTAMP`,
      [rooms[0].id, req.user.id, target]
    );

    // Tell them now, wherever they are in the app (mid-game included). Never
    // fails the invite: it's already saved and waiting in their inbox.
    try {
      const [inv] = await db.execute(
        "SELECT id FROM room_invites WHERE room_id = ? AND to_user = ?", [rooms[0].id, target]
      );
      const [from] = await db.execute("SELECT id, username, avatar FROM users WHERE id = ?", [req.user.id]);
      emitUser(req.app.get("io"), target, "room:invite", {
        id: inv[0] ? inv[0].id : null,
        room_code: req.params.code,
        game_name: rooms[0].game_name,
        game_icon: rooms[0].game_icon,
        from: from[0] || { id: req.user.id, username: req.user.username },
      });
    } catch { /* best-effort */ }

    res.status(201).json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/rooms/:code/leave — remove self from the room.
// If the host leaves a waiting room, the room is abandoned.
// If the host leaves an in_progress room, it's also abandoned for everyone.
router.post("/:code/leave", verifyToken, async (req, res, next) => {
  try {
    const [rooms] = await db.execute(
      "SELECT id, status, host_id FROM rooms WHERE room_code = ?",
      [req.params.code]
    );
    if (!rooms.length) return res.json({ success: true });
    const room = rooms[0];

    const [mine] = await db.execute(
      "SELECT is_host, is_spectator FROM room_players WHERE room_id = ? AND user_id = ?",
      [room.id, req.user.id]
    );
    if (!mine.length) return res.json({ success: true });

    await db.execute(
      "DELETE FROM room_players WHERE room_id = ? AND user_id = ?",
      [room.id, req.user.id]
    );

    // Host leaving collapses the room for everyone.
    if (mine[0].is_host) {
      if (room.status === "waiting" || room.status === "in_progress") {
        await db.execute(
          "UPDATE rooms SET status = 'abandoned', finished_at = NOW() WHERE id = ?",
          [room.id]
        );
      }
    } else if (room.status === "in_progress") {
      // Non-host left mid-game: if no seated players remain, abandon.
      const [remaining] = await db.execute(
        "SELECT COUNT(*) AS n FROM room_players WHERE room_id = ? AND is_spectator = 0",
        [room.id]
      );
      if (Number(remaining[0].n) === 0) {
        await db.execute(
          "UPDATE rooms SET status = 'abandoned', finished_at = NOW() WHERE id = ?",
          [room.id]
        );
      }
    }
    push(req, req.params.code, "room:players", { code: req.params.code, left: req.user.id });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
