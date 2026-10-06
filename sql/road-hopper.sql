-- sql/road-hopper.sql — Turbo Racer becomes Road Hopper.
-- The game keeps its slug ("racer"), so rooms and results already played
-- still line up; only its name, icon and description change. Run by hand.
UPDATE game_types
   SET name = 'Road Hopper',
       icon = '🐔',
       description = 'Hop across roads, rivers and railways — how far can you get?'
 WHERE slug = 'racer';
