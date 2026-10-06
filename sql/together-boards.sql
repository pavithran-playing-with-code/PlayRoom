-- sql/together-boards.sql — Memory Match, Mahjong, Number Rush, Pipes, Word
-- Rush, Rail Runner, Dino Dash and Flappy Dash can be played together (up to
-- 4 on one side) as well as against each other.
-- A room is capped at its game's max_players, and an older database still
-- has these at 2 or 4, which quietly turns a third or fourth friend into a
-- spectator. Brings them up to what config/setupDb.js seeds. Safe to run
-- twice. Run by hand.
UPDATE game_types
   SET max_players = 8
 WHERE slug IN ('memory', 'mahjong', 'numbers', 'pipes', 'wordrush', 'runner', 'dino', 'flappy');
