// config/matchClock.js — when a match is over, and who says so.
//
// A match runs until started_at + duration_seconds. Once that passes the room
// is `finished` and no further score writes are accepted, which is what lets
// the result be decided from stored scores rather than trusted from a client.
//
// The comparison is done in SQL rather than JS so it never depends on the Node
// process and MySQL agreeing about the current time or the timezone.
//
// Shared by routes/rooms.js (which settles on poll and on score writes) and
// routes/leaderboard.js (which must not rank anyone while scores can still
// change underneath it).
const db = require("./db");

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

module.exports = { CLOCK_GRACE_SECONDS, settleIfExpired };
