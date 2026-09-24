// routes/rooms.js
const router = require("express").Router();
const db     = require("../config/db");
const { settleIfExpired } = require("../config/matchClock");
const { recordResults } = require("../config/recordResults");
const { verifyToken } = require("../middleware/auth");
const { emitRoom, emitUser, tellFriends, isOnline } = require("../config/socket");

// The match clock is server-authoritative and lives in config/matchClock.js:
// the countdown a player sees is client-side, so it can be paused, slowed or
// ignored entirely.

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

// Tell each player's friends that they have started or stopped playing, so a
// "watch" button can appear and disappear as it happens. Without this the
// friends list only learns on its next poll, a minute later — most of a match.
//
// Only `playing` is sent: PresenceContext leaves any field it isn't given
// alone, so this can't accidentally mark someone offline.
async function announcePlaying(req, roomId, code, playing) {
  const io = req.app.get("io");
  if (!io) return;
  try {
    const [seats] = await db.execute(
      "SELECT user_id FROM room_players WHERE room_id = ? AND is_spectator = 0", [roomId]
    );
    let info = null;
    if (playing) {
      const [[g]] = await db.execute(
        `SELECT gt.name AS game_name, gt.icon AS game_icon, r.duration_seconds, r.max_players
           FROM rooms r JOIN game_types gt ON gt.id = r.game_type_id WHERE r.id = ?`,
        [roomId]
      );
      // A solo run can't be joined, so there is nothing to advertise.
      if (!g || Number(g.max_players) <= 1) return;
      info = {
        room_code: code,
        game_name: g.game_name,
        game_icon: g.game_icon,
        seconds_left: Number(g.duration_seconds) || 0,
      };
    }
    for (const s of seats) {
      tellFriends(io, Number(s.user_id), { userId: Number(s.user_id), playing: info });
    }
  } catch { /* best-effort: the next friends poll will correct it */ }
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

// Team play. Four sides is plenty for eight seats, and a side of one is just a
// player with extra steps, so two apiece is the floor.
const MAX_TEAMS = 4;
const MIN_PER_TEAM = 2;
const MIN_TEAM_PLAYERS = MIN_PER_TEAM * 2;

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
             r.host_id, r.last_activity_at,
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
        AND COALESCE(r.last_activity_at, r.created_at) > NOW() - INTERVAL 20 MINUTE
      GROUP BY r.id
      HAVING player_count > 0
      ORDER BY r.created_at DESC
      LIMIT 20
    `);
    // Only rooms somebody is actually sitting in: the host is connected right
    // now, or the room was touched in the last few minutes. A host who closed
    // the tab without leaving used to leave an empty room on this list for an
    // hour, and everyone who tried it got "Room not found" or an empty seat.
    const FRESH_MS = 5 * 60 * 1000;
    const live = rows.filter((r) => isOnline(r.host_id)
      || Date.now() - new Date(r.last_activity_at || r.created_at).getTime() < FRESH_MS);
    res.json({ success: true, rooms: live });
  } catch (err) { next(err); }
});

// POST /api/rooms — create room
router.post("/", verifyToken, async (req, res, next) => {
  try {
    const { game_slug, max_players = 2, is_private = false, duration_seconds = 120,
            mode = "free" } = req.body;
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

    // Teams need two sides of two, so a teams room has to seat at least four.
    const roomMode = mode === "teams" ? "teams" : "free";
    if (roomMode === "teams" && cap < MIN_TEAM_PLAYERS)
      return res.status(400).json({
        success: false,
        message: `A team match needs room for at least ${MIN_TEAM_PLAYERS} players.`,
      });

    const seed = Math.floor(Math.random() * 1_000_000);
    const [result] = await db.execute(
      "INSERT INTO rooms (room_code, game_type_id, host_id, max_players, is_private, seed, duration_seconds, mode, last_activity_at) VALUES (?,?,?,?,?,?,?,?,NOW())",
      [code, gt[0].id, req.user.id, cap, priv, seed, duration, roomMode]
    );
    const roomId = result.insertId;
    await db.execute(
      "INSERT INTO room_players (room_id, user_id, is_host) VALUES (?,?,1)",
      [roomId, req.user.id]
    );
    res.status(201).json({ success: true, room: { id: roomId, room_code: code, seed, max_players: cap, duration_seconds: duration, mode: roomMode } });
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
    if (pre.length && await settleIfExpired(pre[0].id)) {
      push(req, req.params.code, "room:ended", { code: req.params.code });
      await announcePlaying(req, pre[0].id, req.params.code, false);
      await recordResults(pre[0].id);
    }

    const [rooms] = await db.execute(`
      SELECT r.id, r.room_code, r.status, r.max_players, r.seed, r.duration_seconds, r.mode,
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
      SELECT rp.is_host, rp.is_spectator, rp.team, rp.score, rp.joined_at,
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
      "SELECT id, host_id, status, max_players, mode FROM rooms WHERE room_code = ?",
      [req.params.code]
    );
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });
    const room = rooms[0];
    if (room.host_id !== req.user.id)
      return res.status(403).json({ success: false, message: "Only the host can start." });
    if (room.status !== "waiting")
      return res.status(409).json({ success: false, message: "Game already started." });

    // A match with other people needs at least one other person. Empty seats
    // are fine: nobody should have to abandon a 5-seat room and make a new one
    // because only three friends turned up. (Playing alone is what a solo run
    // is for, so a multi-seat room still can't start with one player.)
    const [[seated]] = await db.execute(
      "SELECT COUNT(*) AS n FROM room_players WHERE room_id = ? AND is_spectator = 0", [room.id]
    );
    if (Number(room.max_players) > 1 && Number(seated.n) < 2)
      return res.status(409).json({
        success: false,
        message: "Waiting for at least one more player to join.",
      });

    // A team match needs everyone on a side, at least two sides, and nobody
    // stranded on their own — a team of one is just a player, and would be
    // beaten by any pair on the straight total this mode scores by.
    if (room.mode === "teams") {
      const [sides] = await db.execute(
        `SELECT team, COUNT(*) AS n FROM room_players
          WHERE room_id = ? AND is_spectator = 0 GROUP BY team`, [room.id]
      );
      const unplaced = sides.find(t => t.team === null);
      if (unplaced)
        return res.status(409).json({
          success: false,
          message: `${unplaced.n} player${unplaced.n > 1 ? "s haven't" : " hasn't"} picked a team yet.`,
        });
      const placed = sides.filter(t => t.team !== null);
      if (placed.length < 2)
        return res.status(409).json({ success: false, message: "A team match needs at least two teams." });
      const short = placed.find(t => Number(t.n) < MIN_PER_TEAM);
      if (short)
        return res.status(409).json({
          success: false,
          message: `Every team needs at least ${MIN_PER_TEAM} players — team ${short.team} has ${short.n}.`,
        });
    }

    // started_at is the anchor the server measures the match deadline from.
    await db.execute(
      "UPDATE rooms SET status = 'in_progress', started_at = NOW(), last_activity_at = NOW() WHERE id = ?",
      [room.id]
    );
    push(req, req.params.code, "room:started", { code: req.params.code });
    await announcePlaying(req, room.id, req.params.code, true);
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

// PATCH /:code/team — choose a side. Players pick their own, and can keep
// changing until the host starts.
router.patch("/:code/team", verifyToken, async (req, res, next) => {
  try {
    const team = req.body.team === null ? null : Number(req.body.team);
    if (team !== null && (!Number.isInteger(team) || team < 1 || team > MAX_TEAMS))
      return res.status(400).json({ success: false, message: `Team must be 1-${MAX_TEAMS}.` });

    const [rooms] = await db.execute(
      "SELECT id, status, mode FROM rooms WHERE room_code = ?", [req.params.code]
    );
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });
    const room = rooms[0];
    if (room.mode !== "teams")
      return res.status(409).json({ success: false, message: "This room isn't a team match." });
    if (room.status !== "waiting")
      return res.status(409).json({ success: false, message: "The match has already started." });

    const [result] = await db.execute(
      "UPDATE room_players SET team = ? WHERE room_id = ? AND user_id = ? AND is_spectator = 0",
      [team, room.id, req.user.id]
    );
    if (!result.affectedRows)
      return res.status(403).json({ success: false, message: "You're not seated in this room." });

    await touchRoom(room.id);
    push(req, req.params.code, "room:players", { code: req.params.code, team: { user_id: req.user.id, team } });
    res.json({ success: true, team });
  } catch (err) { next(err); }
});

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
    if (await settleIfExpired(roomId)) {
      push(req, req.params.code, "room:ended", { code: req.params.code });
      await announcePlaying(req, roomId, req.params.code, false);
      await recordResults(roomId);
    }

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

    // Tell the room straight away. The 2s poll is the fallback; without this an
    // opponent's score only moved when the *reader* next polled, so it could be
    // four seconds stale — long enough, in a two-minute match, to look like the
    // wrong number rather than a late one.
    push(req, req.params.code, "room:score", {
      user_id: Number(req.user.id),
      score, pairs_matched, moves,
    });

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
    if (await settleIfExpired(pre[0].id)) {
      push(req, req.params.code, "room:ended", { code: req.params.code });
      await announcePlaying(req, pre[0].id, req.params.code, false);
      await recordResults(pre[0].id);
    }

    const [rooms] = await db.execute(
      "SELECT id, status, seed, duration_seconds, started_at, mode FROM rooms WHERE room_code = ?",
      [req.params.code]
    );
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });

    const [players] = await db.execute(`
      SELECT rp.is_host, rp.is_spectator, rp.team, rp.score, rp.pairs_matched, rp.moves, rp.game_state,
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
      mode: rooms[0].mode,
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
    } else if (room.status === "in_progress" || room.status === "waiting") {
      // Last one out closes the room, so it stops showing in the lobby list.
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
