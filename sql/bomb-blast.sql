-- Bomb Squad (wires and a manual) is now Bomb Blast (an arena of bombs and
-- bricks). Same game slot ('bomb'), new name and description; max 4 players.
-- Safe to run twice.
UPDATE game_types
   SET name = 'Bomb Blast',
       description = 'Drop bombs, blast the bricks, grab power-ups — last bomber standing wins the round.',
       max_players = 4
 WHERE slug = 'bomb';

SELECT slug, name, max_players, description FROM game_types WHERE slug = 'bomb';
