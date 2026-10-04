-- A new game: Carrom (alone against the computer, 1 v 1, or 2 v 2).
-- Run once against each database (local and production). Safe to run twice:
-- an existing row is left as it is.
-- max_players 4; sort_order 940 puts it after the together games, before Hollow Manor (1000).
INSERT IGNORE INTO game_types (slug, name, description, min_players, max_players, icon, is_active, sort_order) VALUES
  ('carrom', 'Carrom', 'Flick the striker, pocket your colour, cover the queen. Against the computer, 1 v 1, or 2 v 2.', 1, 4, CONVERT(UNHEX('E29AABE29AAA') USING utf8mb4), 1, 940);

SELECT slug, name, max_players, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
