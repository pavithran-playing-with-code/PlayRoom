-- A new game: Shadow Sneak (a lighthouse, its beam, and real shadows; 1 to 8 players).
-- Run once against each database (local and production). Safe to run twice:
-- an existing row is left as it is. It goes to the end of the lobby.
INSERT IGNORE INTO game_types (slug, name, description, min_players, max_players, icon, is_active, sort_order)
SELECT 'sneak', 'Shadow Sneak',
       'A lighthouse sweeps its beam over the dark and walls cast real shadows: sneak from shadow to shadow and switch it off.',
       1, 8, CONVERT(UNHEX('F09F94A6') USING utf8mb4), 1, COALESCE(MAX(sort_order), 0) + 10
  FROM game_types;

-- Check: Shadow Sneak last.
SELECT slug, name, max_players, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
