// routes/leaderboard.js
const router = require("express").Router();
const db     = require("../config/db");
const { settleIfExpired } = require("../config/matchClock");
const { cap } = require("../config/matchResult");
const { recordResults } = require("../config/recordResults");
const { verifyToken } = require("../middleware/auth");

// GET /api/leaderboard
router.get("/", async (req, res, next) => {
  try {
    // Ranked on matches won, with lifetime points only breaking ties.
    //
    // It used to rank on total_score alone, which is a count of how much you
    // have played more than how well: someone could lose to a friend and stay
    // above them on the board, because points never come back off. Beating
    // people is what moves you now.
    const [rows] = await db.execute(`
      SELECT l.user_id, l.username, l.avatar,
             l.total_score, l.games_played, l.games_won, l.win_rate,
             RANK() OVER (ORDER BY l.games_won DESC, l.total_score DESC) AS \`rank\`
      FROM leaderboard l
      ORDER BY l.games_won DESC, l.total_score DESC
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
    // NOTE: the client may still send `won`. It is deliberately ignored —
    // the outcome is derived from stored scores below.
    const { room_code } = req.body;
    if (!room_code || typeof room_code !== "string")
      return res.status(400).json({ success: false, message: "room_code is required." });

    // 1. Find the room and confirm the user was a player in it.
    const [rooms] = await db.execute(
      `SELECT r.id, r.status, r.game_type_id, r.mode, gt.slug AS game_slug
       FROM rooms r JOIN game_types gt ON gt.id = r.game_type_id
       WHERE r.room_code = ?`,
      [room_code.toUpperCase()]
    );
    if (!rooms.length)
      return res.status(404).json({ success: false, message: "Room not found." });

    let room = rooms[0];
    if (room.status === "waiting")
      return res.status(409).json({ success: false, message: "Game has not started." });

    // If the clock has run out, end the match here — that freezes every score,
    // which is the precondition for ranking anyone.
    if (room.status === "in_progress" && await settleIfExpired(room.id)) room.status = "finished";

    // Pull the whole table at once — we need every seated player's score to
    // work out who actually won.
    const [allPlayers] = await db.execute(
      "SELECT user_id, team, score, pairs_matched, moves, is_spectator FROM room_players WHERE room_id = ?",
      [room.id]
    );
    const mine = allPlayers.find(p => Number(p.user_id) === Number(req.user.id));
    if (!mine)
      return res.status(403).json({ success: false, message: "You were not a player in this room." });
    if (mine.is_spectator)
      return res.json({ success: true, spectator: true });

    const seated = allPlayers.filter(p => !p.is_spectator);

    // 2. Nobody is ranked while the match can still change. A player who quits
    //    early would otherwise be scored against half-finished opponents. Their
    //    row gets written when the match actually ends and someone reports it,
    //    using whatever score they walked away with.
    if (room.status === "in_progress")
      return res.json({ success: true, pending: true, message: "Match still running." });

    // 3. Rank and record every seated player together, from one snapshot.
    const results = await recordResults(room.id);
    const me = results.find(r => r.user_id === Number(req.user.id));

    res.json({
      success: true,
      score: me?.score ?? 0,
      result: me?.result ?? "incomplete",
      won: me?.result === "win",
      standings: results,
    });
  } catch (err) { next(err); }
});

module.exports = router;
