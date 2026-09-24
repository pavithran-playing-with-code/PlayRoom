-- ─────────────────────────────────────────────────────────────────────────────
--  PlayRoom — recompute past match results and rebuild the leaderboard
--
--  WHY: until 2026-09-24 each player recorded their own result when they
--  dismissed the results screen, reading the scores table at that moment. If an
--  opponent's final score had not landed yet, both players could be written
--  down as the winner. games_won, and therefore the Hall of Fame, drifted.
--
--  The code no longer does that — the whole room is ranked once, from one
--  snapshot. This script repairs the history that was already recorded.
--
--  SAFE TO RE-RUN. It derives everything from the stored per-player scores in
--  room_players, so running it twice gives the same answer.
--
--  BEFORE YOU RUN IT: take a backup. In Aiven, Backups in the left sidebar.
--  This rewrites game_sessions.result, the three counters on users, and the
--  whole leaderboard table.
--
--  Run it top to bottom in one go (Workbench: the ⚡ "execute all" button).
-- ─────────────────────────────────────────────────────────────────────────────

USE `defaultdb`;

-- Workbench refuses UPDATEs that don't key off a primary key unless this is off.
SET SQL_SAFE_UPDATES = 0;


-- ── 1. Look before you leap ──────────────────────────────────────────────────
-- Rooms where more than one player is currently recorded as the winner. These
-- are the matches the old bug corrupted. Expect this to be non-empty; that is
-- the whole reason for running this.
SELECT gs.room_id,
       COUNT(*) AS winners_recorded,
       GROUP_CONCAT(u.username ORDER BY u.username SEPARATOR ', ') AS all_marked_winner
  FROM game_sessions gs
  JOIN users u ON u.id = gs.user_id
 WHERE gs.result = 'win'
 GROUP BY gs.room_id
HAVING COUNT(*) > 1;


-- ── 2. The final score of every seat, and the best of them ───────────────────
DROP TEMPORARY TABLE IF EXISTS _room_best;
CREATE TEMPORARY TABLE _room_best AS
SELECT room_id,
       COUNT(*)   AS seats,
       MAX(score) AS best
  FROM room_players
 WHERE is_spectator = 0
 GROUP BY room_id;

-- How many players share that best score. Two or more is a draw, not a win.
DROP TEMPORARY TABLE IF EXISTS _room_ties;
CREATE TEMPORARY TABLE _room_ties AS
SELECT rp.room_id, COUNT(*) AS tied_at_top
  FROM room_players rp
  JOIN _room_best b ON b.room_id = rp.room_id AND rp.score = b.best
 WHERE rp.is_spectator = 0
 GROUP BY rp.room_id;


-- ── 3. Rewrite each recorded match ───────────────────────────────────────────
-- Scores are taken from room_players, which holds the final synced value, and
-- capped the same way the app caps them. Solo games fall back to the objective:
-- a cleared board is a win, anything else is not. Games with no objective are
-- score-attack, so a solo run is 'incomplete' — played, but not won or lost.
UPDATE game_sessions gs
  JOIN room_players  rp ON rp.room_id = gs.room_id AND rp.user_id = gs.user_id
  JOIN _room_best    b  ON b.room_id  = gs.room_id
  JOIN _room_ties    t  ON t.room_id  = gs.room_id
   SET gs.score  = LEAST(GREATEST(COALESCE(rp.score, 0), 0), 25000),
       gs.moves  = COALESCE(rp.moves, gs.moves),
       gs.pairs_matched = COALESCE(rp.pairs_matched, gs.pairs_matched),
       gs.result = CASE
         WHEN b.seats > 1 AND rp.score < b.best   THEN 'loss'
         WHEN b.seats > 1 AND t.tied_at_top > 1   THEN 'draw'
         WHEN b.seats > 1                         THEN 'win'
         -- Solo. These thresholds must match TOTAL_PAIRS in the game
         -- components and OBJECTIVE_PAIRS in routes/leaderboard.js.
         WHEN gs.game_type = 'mahjong' THEN IF(COALESCE(rp.pairs_matched, 0) >= 24, 'win', 'loss')
         WHEN gs.game_type = 'memory'  THEN IF(COALESCE(rp.pairs_matched, 0) >= 16, 'win', 'loss')
         ELSE 'incomplete'
       END;


-- ── 4. Rebuild each player's totals from the repaired history ────────────────
-- Recomputed from scratch rather than adjusted, so it is correct even if the
-- counters had drifted for some other reason.
UPDATE users u
  LEFT JOIN (
    SELECT user_id,
           SUM(score)            AS total_score,
           COUNT(*)              AS games_played,
           SUM(result = 'win')   AS games_won
      FROM game_sessions
     GROUP BY user_id
  ) a ON a.user_id = u.id
   SET u.total_score  = COALESCE(a.total_score, 0),
       u.games_played = COALESCE(a.games_played, 0),
       u.games_won    = COALESCE(a.games_won, 0);


-- ── 5. Rebuild the Hall of Fame ──────────────────────────────────────────────
-- leaderboard holds nothing of its own; it is a copy of users kept for reading.
DELETE FROM leaderboard;
INSERT INTO leaderboard (user_id, username, avatar, total_score, games_played, games_won, win_rate)
SELECT id, username, avatar, total_score, games_played, games_won,
       IF(games_played > 0, ROUND(games_won / games_played * 100, 2), 0)
  FROM users;


-- ── 6. Check it worked ───────────────────────────────────────────────────────
-- This must now come back EMPTY. Any row means a room still has two winners.
SELECT gs.room_id, COUNT(*) AS winners_recorded
  FROM game_sessions gs
 WHERE gs.result = 'win'
 GROUP BY gs.room_id
HAVING COUNT(*) > 1;

-- The repaired board.
SELECT l.username, l.total_score, l.games_played, l.games_won, l.win_rate
  FROM leaderboard l
 ORDER BY l.total_score DESC
 LIMIT 20;

DROP TEMPORARY TABLE IF EXISTS _room_best;
DROP TEMPORARY TABLE IF EXISTS _room_ties;
SET SQL_SAFE_UPDATES = 1;
