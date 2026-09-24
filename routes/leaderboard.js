// routes/leaderboard.js
const router = require("express").Router();
const db     = require("../config/db");
const { settleIfExpired } = require("../config/matchClock");
const { verifyToken } = require("../middleware/auth");

// Hard caps prevent a tampered client from posting absurd scores.
// Memory max ~5k, Mahjong max ~12k. 25k leaves headroom for future games.
const MAX_SCORE_PER_GAME = 25000;

// Pairs required to clear the board, for the games that HAVE a win condition.
// Games absent from this map are pure score-attack: there is nothing to
// "complete", so a solo run of one is recorded as `incomplete` rather than
// being scored as a win or a loss.
// Must match TOTAL_PAIRS in the game component — see src/components/MahjongGame.jsx.
const OBJECTIVE_PAIRS = { mahjong: 24, memory: 16 };

const cap = (n) => Math.max(0, Math.min(Number(n) || 0, MAX_SCORE_PER_GAME));

/**
 * Decide the outcome of a match from data the server already holds.
 *
 * Previously the client simply POSTed `won: true|false` and we believed it,
 * which is why every row in game_sessions says 'loss': no game ever managed to
 * report a win, and nothing stopped a modified client from claiming one.
 *
 * Rules:
 *   • 2+ seated players → highest score wins; a tie for top is a draw.
 *   • solo + objective game → win if the board was cleared, else loss.
 *   • solo + score-attack  → 'incomplete' (counts as played, not as win/loss).
 */
function decideResult({ seated, myUserId, myScore, gameSlug }) {
  if (seated.length > 1) {
    const best = Math.max(...seated.map(p => cap(p.score)));
    if (myScore < best) return "loss";
    const tiedAtTop = seated.filter(p => cap(p.score) === best).length;
    return tiedAtTop > 1 ? "draw" : "win";
  }
  const needed = OBJECTIVE_PAIRS[gameSlug];
  if (!needed) return "incomplete";
  const me = seated.find(p => Number(p.user_id) === Number(myUserId));
  return (Number(me?.pairs_matched) || 0) >= needed ? "win" : "loss";
}

// Record the result for EVERY seated player, from one snapshot of the scores.
//
// Each player used to record only themselves, whenever they happened to dismiss
// the results screen. Two clients finishing at once would each read the table
// before the other's final score had landed, and both would be written down as
// the winner — which is how someone could lose a match and still climb the
// board. Ranking everyone against the same numbers, once, makes that
// impossible: there is exactly one snapshot and exactly one top score in it.
//
// Rows already present are left alone, so this stays safe to call repeatedly.
async function settleRoom(room, seated) {
  const [done] = await db.execute(
    "SELECT user_id FROM game_sessions WHERE room_id = ?", [room.id]
  );
  const recorded = new Set(done.map((r) => Number(r.user_id)));
  const results = [];

  for (const p of seated) {
    const userId = Number(p.user_id);
    const score = cap(p.score);
    const result = decideResult({ seated, myUserId: userId, myScore: score, gameSlug: room.game_slug });
    results.push({ user_id: userId, score, result });
    if (recorded.has(userId)) continue;

    // The unique key on (room_id, user_id) is the real guard: if two players
    // call this at the same instant, the loser of that race is ignored rather
    // than double-counting the match.
    const [ins] = await db.execute(
      `INSERT IGNORE INTO game_sessions (room_id, user_id, game_type, score, pairs_matched, moves, result)
       VALUES (?,?,?,?,?,?,?)`,
      [room.id, userId, room.game_slug, score, p.pairs_matched, p.moves, result]
    );
    if (!ins.affectedRows) continue;             // somebody else got there first

    await db.execute(
      `UPDATE users SET
         total_score  = total_score  + ?,
         games_played = games_played + 1,
         games_won    = games_won    + ?
       WHERE id = ?`,
      [score, result === "win" ? 1 : 0, userId]
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
    `, [userId]);
  }
  return results;
}

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
    // NOTE: the client may still send `won`. It is deliberately ignored —
    // the outcome is derived from stored scores below.
    const { room_code } = req.body;
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

    let room = rooms[0];
    if (room.status === "waiting")
      return res.status(409).json({ success: false, message: "Game has not started." });

    // If the clock has run out, end the match here — that freezes every score,
    // which is the precondition for ranking anyone.
    if (room.status === "in_progress" && await settleIfExpired(room.id)) room.status = "finished";

    // Pull the whole table at once — we need every seated player's score to
    // work out who actually won.
    const [allPlayers] = await db.execute(
      "SELECT user_id, score, pairs_matched, moves, is_spectator FROM room_players WHERE room_id = ?",
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
    const results = await settleRoom(room, seated);
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
