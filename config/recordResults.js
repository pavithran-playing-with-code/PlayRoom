// config/recordResults.js — write a finished match into the record books.
//
// Called the moment the server notices a match's clock has stopped, not when a
// client gets round to asking. The clients used to be the only trigger: each
// posted /api/leaderboard/update as the player left the results screen, which
// is a second or two after the deadline — inside the 3s grace the clock allows
// for late score writes. The room was therefore still 'in_progress', the update
// recorded nothing, and nobody ever asked again. Matches simply vanished, which
// is why the Hall of Fame only sometimes moved.
const db = require("./db");
const { cap, resultsFor } = require("./matchResult");

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
async function recordResults(roomId) {
  const [[room]] = await db.execute(
    `SELECT r.id, r.mode, gt.slug AS game_slug
       FROM rooms r JOIN game_types gt ON gt.id = r.game_type_id
      WHERE r.id = ?`, [roomId]);
  if (!room) return [];
  const [all] = await db.execute(
    "SELECT user_id, team, score, pairs_matched, moves, is_spectator FROM room_players WHERE room_id = ?",
    [roomId]);
  const seated = all.filter((p) => !p.is_spectator);
  if (!seated.length) return [];

  const [done] = await db.execute(
    "SELECT user_id FROM game_sessions WHERE room_id = ?", [room.id]
  );
  const recorded = new Set(done.map((r) => Number(r.user_id)));
  const outcomes = resultsFor(room, seated);
  const results = [];

  for (const p of seated) {
    const userId = Number(p.user_id);
    const score = cap(p.score);
    const result = outcomes.get(userId) || "incomplete";
    results.push({ user_id: userId, team: p.team ?? null, score, result });
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

module.exports = { recordResults };
