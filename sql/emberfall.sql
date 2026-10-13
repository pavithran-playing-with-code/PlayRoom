-- A new game: Emberfall (a 3D island adventure, 1 or 2 players).
-- Run once against each database (local and production). Safe to run twice:
-- an existing row is left as it is. It goes to the end of the lobby.
INSERT IGNORE INTO game_types (slug, name, description, min_players, max_players, icon, is_active, sort_order)
SELECT 'emberfall', 'Emberfall',
       'A 3D island adventure, alone or with a friend: beat three guardians for their Ember Shards, then the Cinder Colossus.',
       1, 2, CONVERT(UNHEX('F09F94A5') USING utf8mb4), 1, COALESCE(MAX(sort_order), 0) + 10
  FROM game_types;

-- Check: Emberfall last.
SELECT slug, name, max_players, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
