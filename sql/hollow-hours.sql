-- A new game: Hollow Hours (a side-on horror adventure, 1 or 2 players).
-- Run once against each database (local and production). Safe to run twice:
-- an existing row is left as it is. It goes to the end of the lobby.
INSERT IGNORE INTO game_types (slug, name, description, min_players, max_players, icon, is_active, sort_order)
SELECT 'hollow', 'Hollow Hours',
       'Two small children in a house built for giants, alone or together: past the Keeper and the Cuckoo, up the Bell Tower by midnight.',
       1, 2, CONVERT(UNHEX('F09F95B0EFB88F') USING utf8mb4), 1, COALESCE(MAX(sort_order), 0) + 10
  FROM game_types;

-- Check: Hollow Hours last.
SELECT slug, name, max_players, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
