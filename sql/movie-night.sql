-- Movie Night: a room to watch a movie together (2 to 4 people).
-- Run once against each database (local and production). Safe to run twice:
-- an existing row is left as it is. It goes to the end of the lobby.
INSERT IGNORE INTO game_types (slug, name, description, min_players, max_players, icon, is_active, sort_order)
SELECT 'movie', 'Movie Night',
       'Not a game: a room to watch a movie together, from someone''s phone, with everyone''s voices.',
       2, 4, CONVERT(UNHEX('F09F8EAC') USING utf8mb4), 1, COALESCE(MAX(sort_order), 0) + 10
  FROM game_types;

-- Check: Movie Night last.
SELECT slug, name, max_players, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
