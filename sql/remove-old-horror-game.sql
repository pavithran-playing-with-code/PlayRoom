-- A game was removed from PlayRoom (slug 'manor'). This deletes what it left
-- in the database: its rooms (and, with them, their players, match records,
-- chat and invites), then the game itself.
-- Run once against each database (local and production). Safe to run twice.
-- Points already in the Hall of Fame stay: they are totals per player.
DELETE FROM rooms
 WHERE game_type_id IN (SELECT id FROM game_types WHERE slug = 'manor');

DELETE FROM game_types WHERE slug = 'manor';

-- Check: no row comes back.
SELECT slug, name FROM game_types WHERE slug = 'manor';
