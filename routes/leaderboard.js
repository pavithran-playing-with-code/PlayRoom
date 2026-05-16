// routes/leaderboard.js
const router = require("express").Router();
const db     = require("../config/db");
const { verifyToken } = require("../middleware/auth");

// Hard caps prevent a tampered client from posting absurd scores.
// Memory max ~5k, Mahjong max ~12k. 25k leaves headroom for future games.
const MAX_SCORE_PER_GAME = 25000;

// GET /api/leaderboard
router.get("/", async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT l.user_id, l.username, l.avatar,
             l.total_score, l.games_played, l.games_won, l.win_rate,
             RANK() OVER (ORDER BY l.total_score DESC) AS \`rank\`
      FROM leaderboard l
      ORDER BY l.total_score DESC
      LIMIT 50
    `);
    res.json({ success: true, leaderboard: rows });
  } catch (err) { next(err); }
});

// POST /api/leaderboard/update — call when a game session ends.
// Server-authoritative: ignores any client-sent score. Reads the user's
// actual room_players.score for the supplied room_code, caps it, and
// ensures the leaderboard can only be updated once per room+user.
router.post("/update", verifyToken, async (req, res, next) => {
  try {
    const { room_code, won = false } = req.body;
    if (!room_code || typeof room_code !== "string")
      return res.status(400).json({ success: false, message: "room_code is required." });

    // 1. Find the room and confirm the user was a player in it.
    const [rooms] = await db.execute(
      `SELECT r.id, r.status, r.game_type_id, gt.slug AS game_slug
       FROM rooms r JOIN game_types gt ON gt.id = r.game_type_id
       WHERE r.room_code = ?`,
      [room_code.toUpperCase()]
    );
    if (!rooms.length)
      return res.status(404).json({ success: false, message: "Room not found." });

    const room = rooms[0];
    if (room.status === "waiting")
      return res.status(409).json({ success: false, message: "Game has not started." });

    const [playerRows] = await db.execute(
      "SELECT score, pairs_matched, moves, is_spectator FROM room_players WHERE room_id = ? AND user_id = ?",
      [room.id, req.user.id]
    );
    if (!playerRows.length)
      return res.status(403).json({ success: false, message: "You were not a player in this room." });
    if (playerRows[0].is_spectator)
      return res.json({ success: true, spectator: true });

    // 2. Idempotent: one leaderboard update per (room, user). Re-submits no-op.
    const [existing] = await db.execute(
      "SELECT id FROM game_sessions WHERE room_id = ? AND user_id = ?",
      [room.id, req.user.id]
    );
    if (existing.length)
      return res.json({ success: true, already_recorded: true });

    // 3. Pull server-stored score (still client-written via /score, but capped).
    const rawScore = Number(playerRows[0].score) || 0;
    const score    = Math.max(0, Math.min(rawScore, MAX_SCORE_PER_GAME));
    const wonFlag  = won ? 1 : 0;

    // 4. Persist the session record (also marks this room+user as recorded).
    await db.execute(
      `INSERT INTO game_sessions (room_id, user_id, game_type, score, pairs_matched, moves, result)
       VALUES (?,?,?,?,?,?,?)`,
      [room.id, req.user.id, room.game_slug, score,
       playerRows[0].pairs_matched, playerRows[0].moves,
       wonFlag ? "win" : "loss"]
    );

    // 5. Update aggregate stats.
    await db.execute(
      `UPDATE users SET
         total_score  = total_score  + ?,
         games_played = games_played + 1,
         games_won    = games_won    + ?
       WHERE id = ?`,
      [score, wonFlag, req.user.id]
    );
    await db.execute(`
      INSERT INTO leaderboard (user_id, username, avatar, total_score, games_played, games_won, win_rate)
      SELECT id, username, avatar, total_score, games_played, games_won,
             IF(games_played > 0, ROUND(games_won / games_played * 100, 2), 0)
      FROM users WHERE id = ?
      ON DUPLICATE KEY UPDATE
        username     = VALUES(username),
        avatar       = VALUES(avatar),
        total_score  = VALUES(total_score),
        games_played = VALUES(games_played),
        games_won    = VALUES(games_won),
        win_rate     = VALUES(win_rate)
    `, [req.user.id]);

    res.json({ success: true, score });
  } catch (err) { next(err); }
});

module.exports = router;
