-- A new game: Piano Tiles.
-- Run once against each database (local and production). Safe to run twice:
-- an existing row is left as it is.
-- sort_order 900 puts it at the end of the list, just before Hollow Manor (1000).
INSERT IGNORE INTO game_types (slug, name, description, min_players, max_players, icon, is_active, sort_order) VALUES
  ('piano', 'Piano Tiles', 'Tap the black tiles, never the white. Every tile is the next note of the song.', 1, 8, CONVERT(UNHEX('F09F8EB9') USING utf8mb4), 1, 900);

-- Check: Piano Tiles second to last, Hollow Manor last.
SELECT slug, name, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
