-- A new game: Sunshard Islands (a 3D island hop — race, or play together).
-- Run once against each database (local and production). Safe to run twice:
-- an existing row is left as it is.
-- max_players 8; sort_order 5 puts it first in the lobby.
INSERT IGNORE INTO game_types (slug, name, description, min_players, max_players, icon, is_active, sort_order) VALUES
  ('sunshard', 'Sunshard Islands', 'A 3D island hop: jump, double-jump and glide across floating islands, grab 5 Sunshards and light the Sky Temple.', 1, 8, CONVERT(UNHEX('F09F8F9DEFB88F') USING utf8mb4), 1, 5);

SELECT slug, name, max_players, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
