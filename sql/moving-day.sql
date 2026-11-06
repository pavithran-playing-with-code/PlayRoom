-- A new game: Moving Day (empty a house into the van — solo, against friends,
-- in teams or together in one house; up to 8, together up to 4).
-- Run once against each database (local and production). Safe to run twice:
-- an existing row is left as it is. It goes to the end of the lobby.
INSERT IGNORE INTO game_types (slug, name, description, min_players, max_players, icon, is_active, sort_order)
SELECT 'moving', 'Moving Day',
       'Empty the house into the van before the clock runs out: boxes, lamps, the telly — and a sofa that needs two. Watch out for Biscuit.',
       1, 8, CONVERT(UNHEX('F09F93A6') USING utf8mb4), 1, COALESCE(MAX(sort_order), 0) + 10
  FROM game_types;

-- Check: Moving Day last.
SELECT slug, name, max_players, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
