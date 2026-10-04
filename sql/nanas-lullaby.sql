-- Hollow Manor is now Nana's Lullaby: the same game slot ('manor'), a new
-- name, description and icon (👵). Safe to run twice.
UPDATE game_types
   SET name = 'Nana''s Lullaby',
       description = 'Nana hums as she walks the halls. Find the three keys — and when the humming stops, freeze.',
       icon = CONVERT(UNHEX('F09F91B5') USING utf8mb4)
 WHERE slug = 'manor';

SELECT slug, name, icon, description FROM game_types WHERE slug = 'manor';
