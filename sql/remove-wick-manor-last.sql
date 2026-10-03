-- Wick is gone, and Hollow Manor moves to the end of the game list.
-- Run once against each database (local and production). Safe to run twice.

-- 1. Wick's rooms. rooms -> game_types has no cascade, so these go first;
--    deleting a room takes its players, scores, chat and invites with it.
--    (The overall leaderboard totals are kept as they are.)
DELETE r FROM rooms r
  JOIN game_types g ON g.id = r.game_type_id
 WHERE g.slug = 'wick';

-- 2. The game itself.
DELETE FROM game_types WHERE slug = 'wick';

-- 3. Hollow Manor last: past every other game's sort_order.
UPDATE game_types SET sort_order = 1000 WHERE slug = 'manor';

-- Check: Hollow Manor should be the last row, and no Wick.
SELECT slug, name, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
