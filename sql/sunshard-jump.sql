-- Sunshard Islands is now Sunshard Jump: the same game slot ('sunshard'), a
-- new name and description. Safe to run twice.
UPDATE game_types
   SET name = 'Sunshard Jump',
       description = 'A 3D jumping game: jump, double-jump and glide across floating islands, grab 5 Sunshards and light the Sky Temple.'
 WHERE slug = 'sunshard';

SELECT slug, name, description FROM game_types WHERE slug = 'sunshard';
