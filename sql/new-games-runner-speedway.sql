-- Two new games: Rail Runner and Speedway.
-- Run once against each database (local and production). Safe to run twice:
-- an existing row is left as it is.
-- sort_order puts them in the game list; change the numbers to move them.
INSERT IGNORE INTO game_types (slug, name, description, min_players, max_players, icon, is_active, sort_order) VALUES
  ('runner', 'Rail Runner', 'Run the rails: jump the barriers, slide under the bars, dodge the trains.', 1, 8, CONVERT(UNHEX('F09F8F83') USING utf8mb4), 1, 160),
  ('speedway', 'Speedway', 'Three laps, one road, everyone on it at once. First across the line wins.', 1, 8, CONVERT(UNHEX('F09F8F81') USING utf8mb4), 1, 170);
