-- The together games: Kitchen Rush, Bomb Squad and Tower Guard.
-- Run once against each database (local and production). Safe to run twice:
-- an existing row is left as it is.
-- sort_order 910+ puts them at the end of the list, before Hollow Manor (1000).
INSERT IGNORE INTO game_types (slug, name, description, min_players, max_players, icon, is_active, sort_order) VALUES
  ('kitchen', 'Kitchen Rush', 'Chop, cook, plate up and serve before the orders run out. Best with friends in one kitchen.', 1, 8, CONVERT(UNHEX('F09F8DB3') USING utf8mb4), 1, 910),
  ('bomb', 'Bomb Squad', 'One of you sees the bomb, the rest have the manual. Talk it through before the timer runs out.', 1, 8, CONVERT(UNHEX('F09F92A3') USING utf8mb4), 1, 920),
  ('tower', 'Tower Guard', 'Build towers along the road and keep the monsters off your castle. Together, defend one castle.', 1, 8, CONVERT(UNHEX('F09F8FB0') USING utf8mb4), 1, 930);

SELECT slug, name, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
