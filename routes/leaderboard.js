// routes/leaderboard.js
const router = require("express").Router();
const db     = require("../config/db");
const { verifyToken } = require("../middleware/auth");

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

// POST /api/leaderboard/update — call when a game session ends
router.post("/update", verifyToken, async (req, res, next) => {
  try {
    const { score = 0, won = false } = req.body;
    await db.execute(
      `UPDATE users SET
         total_score  = total_score  + ?,
         games_played = games_played + 1,
         games_won    = games_won    + ?
       WHERE id = ?`,
      [score, won ? 1 : 0, req.user.id]
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
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
