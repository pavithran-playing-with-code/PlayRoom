-- Nana's Lullaby is now Station 13: the same game slot ('manor'), a new
-- name, description and icon (🏥). Safe to run twice.
UPDATE game_types
   SET name = 'Station 13',
       description = 'A dark hospital and something that hunts by sound. Find 4 fuses, bring the power back, reach the elevator.',
       icon = CONVERT(UNHEX('F09F8FA5') USING utf8mb4)
 WHERE slug = 'manor';

SELECT slug, name, icon, description FROM game_types WHERE slug = 'manor';
