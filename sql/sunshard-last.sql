-- Sunshard Islands moves to the end of the lobby, after Nana's Lullaby.
-- Run once against the production database. Safe to run twice.
UPDATE game_types g
  JOIN (SELECT MAX(sort_order) AS m FROM game_types WHERE slug <> 'sunshard') x
   SET g.sort_order = x.m + 10
 WHERE g.slug = 'sunshard';

SELECT slug, name, sort_order FROM game_types WHERE is_active = 1 ORDER BY sort_order, id;
