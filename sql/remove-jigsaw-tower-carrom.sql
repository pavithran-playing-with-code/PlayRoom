-- Missing Piece (jigsaw), Tower Guard (tower) and Carrom (carrom) are gone,
-- with everything they left in the database: their rooms and everything
-- hanging off them, their recorded matches, and the points and wins they
-- added to everyone's totals and the Hall of Fame.
-- Run once against each database (local and production). Safe to run twice:
-- the second time there is nothing left to find.
START TRANSACTION;

-- 1. Take their matches back out of everyone's totals (before the matches
--    themselves are deleted, or there's nothing to count).
UPDATE users u
  JOIN (SELECT user_id, SUM(score) AS pts, COUNT(*) AS played, SUM(result = 'win') AS won
          FROM game_sessions WHERE game_type IN ('jigsaw', 'tower', 'carrom')
         GROUP BY user_id) x ON x.user_id = u.id
   SET u.total_score  = GREATEST(0, u.total_score  - x.pts),
       u.games_played = GREATEST(0, u.games_played - x.played),
       u.games_won    = GREATEST(0, u.games_won    - x.won);

-- …and the Hall of Fame, which is a copy of those totals.
UPDATE leaderboard l JOIN users u ON u.id = l.user_id
   SET l.total_score  = u.total_score,
       l.games_played = u.games_played,
       l.games_won    = u.games_won,
       l.win_rate     = IF(u.games_played > 0, ROUND(u.games_won / u.games_played * 100, 2), 0);

-- 2. Their recorded matches, then everything hanging off their rooms, then
--    the rooms. Each table is cleared by hand rather than trusting ON DELETE
--    CASCADE: older installs have the foreign keys without it.
DELETE FROM game_sessions WHERE game_type IN ('jigsaw', 'tower', 'carrom');
DELETE x FROM game_sessions x JOIN rooms r ON r.id = x.room_id JOIN game_types g ON g.id = r.game_type_id WHERE g.slug IN ('jigsaw', 'tower', 'carrom');
DELETE x FROM room_players  x JOIN rooms r ON r.id = x.room_id JOIN game_types g ON g.id = r.game_type_id WHERE g.slug IN ('jigsaw', 'tower', 'carrom');
DELETE x FROM chat_messages x JOIN rooms r ON r.id = x.room_id JOIN game_types g ON g.id = r.game_type_id WHERE g.slug IN ('jigsaw', 'tower', 'carrom');
DELETE x FROM room_invites  x JOIN rooms r ON r.id = x.room_id JOIN game_types g ON g.id = r.game_type_id WHERE g.slug IN ('jigsaw', 'tower', 'carrom');
DELETE r FROM rooms r JOIN game_types g ON g.id = r.game_type_id WHERE g.slug IN ('jigsaw', 'tower', 'carrom');

-- 3. The games themselves.
DELETE FROM game_types WHERE slug IN ('jigsaw', 'tower', 'carrom');

COMMIT;

-- Check: none of the three left, and no rows pointing at them.
SELECT slug, name FROM game_types WHERE slug IN ('jigsaw', 'tower', 'carrom');
SELECT COUNT(*) AS sessions_left FROM game_sessions WHERE game_type IN ('jigsaw', 'tower', 'carrom');
