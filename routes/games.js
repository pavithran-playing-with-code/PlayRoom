// routes/games.js
const router = require("express").Router();
const db     = require("../config/db");

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      "SELECT id, slug, name, description, min_players, max_players, icon FROM game_types WHERE is_active = 1 ORDER BY id"
    );
    res.json({ success: true, games: rows });
  } catch (err) { next(err); }
});

module.exports = router;
