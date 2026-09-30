// routes/games.js
// The playable games, in the order the lobby and home page show them.
//
// That order is data, not code: game_types.sort_order, lowest first (ties by
// id). Change it with an UPDATE and the site follows on the next page load,
// no deploy needed.
const router = require("express").Router();
const db     = require("../config/db");

const COLS = "id, slug, name, description, min_players, max_players, icon";

router.get("/", async (req, res, next) => {
  try {
    let rows;
    try {
      [rows] = await db.execute(
        `SELECT ${COLS} FROM game_types WHERE is_active = 1 ORDER BY sort_order, id`
      );
    } catch (err) {
      // A database that hasn't had the sort_order column added yet: keep
      // answering, in the old order, rather than break the lobby.
      if (err.code !== "ER_BAD_FIELD_ERROR") throw err;
      [rows] = await db.execute(`SELECT ${COLS} FROM game_types WHERE is_active = 1 ORDER BY id`);
    }
    res.json({ success: true, games: rows });
  } catch (err) { next(err); }
});

module.exports = router;
