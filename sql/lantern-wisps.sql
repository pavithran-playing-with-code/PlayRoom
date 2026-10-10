-- A new game: Lantern Wisps (survive the night — alone, against friends or together).
-- Run once against each database (local and production). Safe to run twice:
-- an existing row is left as it is. It goes last in the lobby.
INSERT IGNORE INTO game_types (slug, name, description, min_players, max_players, icon, is_active, sort_order)
SELECT 'wisps', 'Lantern Wisps', 'Survive the night: your lantern spirit''s weapons fire by themselves — dodge the shadows, grab gems, level up, hold out until dawn.', 1, 6, CONVERT(UNHEX('F09F8FAE') USING utf8mb4), 1, COALESCE(MAX(sort_order), 0) + 10
  FROM game_types;

SELECT slug, name, max_players, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
