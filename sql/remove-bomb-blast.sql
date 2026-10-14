-- Bomb Blast is gone from the app. Hide its game type so no room can be made
-- for it. Its old matches and results stay (rooms point at this row, so it is
-- switched off rather than deleted).
UPDATE game_types SET is_active = 0 WHERE slug = 'bomb';
