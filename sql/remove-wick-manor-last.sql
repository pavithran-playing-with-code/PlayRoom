-- Wick is gone, and Hollow Manor moves to the end of the game list.
-- Run once against each database (local and production). Safe to run twice.

-- 1. Everything hanging off Wick's rooms, then the rooms. Each table is
--    cleared by hand rather than trusting ON DELETE CASCADE: older installs
--    have the foreign keys without it, and the room delete then fails (1451).
--    (The overall leaderboard totals are kept as they are.)
DELETE x FROM game_sessions x JOIN rooms r ON r.id = x.room_id JOIN game_types g ON g.id = r.game_type_id WHERE g.slug = 'wick';
DELETE x FROM room_players  x JOIN rooms r ON r.id = x.room_id JOIN game_types g ON g.id = r.game_type_id WHERE g.slug = 'wick';
DELETE x FROM chat_messages x JOIN rooms r ON r.id = x.room_id JOIN game_types g ON g.id = r.game_type_id WHERE g.slug = 'wick';
DELETE x FROM room_invites  x JOIN rooms r ON r.id = x.room_id JOIN game_types g ON g.id = r.game_type_id WHERE g.slug = 'wick';
DELETE r FROM rooms r JOIN game_types g ON g.id = r.game_type_id WHERE g.slug = 'wick';

-- 2. The game itself.
DELETE FROM game_types WHERE slug = 'wick';

-- 3. Hollow Manor last: past every other game's sort_order.
UPDATE game_types SET sort_order = 1000 WHERE slug = 'manor';

-- Check: Hollow Manor should be the last row, and no Wick.
SELECT slug, name, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
