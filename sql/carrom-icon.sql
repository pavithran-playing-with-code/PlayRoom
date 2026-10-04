-- Carrom's stored icon: two coins (⚫⚪) instead of the dartboard (🎯).
-- The app draws a little carrom board wherever it can; this emoji is what
-- shows in plain text (invites, "playing …" lines). Safe to run twice.
UPDATE game_types SET icon = CONVERT(UNHEX('E29AABE29AAA') USING utf8mb4) WHERE slug = 'carrom';

SELECT slug, name, icon FROM game_types WHERE slug = 'carrom';
