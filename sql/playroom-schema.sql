-- ─────────────────────────────────────────────────────────────────────────────
--  PlayRoom — full schema and game catalog
--  Generated from config/setupDb.js by scripts/makeSql.js. Do not edit by hand.
--
--  Safe to run more than once: every table is CREATE TABLE IF NOT EXISTS and
--  the catalog upserts, so re-running never destroys data.
--
--  The USE line below names Aiven's default schema. Change it if your
--  database is called something else.
-- ─────────────────────────────────────────────────────────────────────────────

USE `defaultdb`;

-- ── Tables (parents first, so the foreign keys resolve) ──────────────────────

CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username     VARCHAR(32)  NOT NULL,
  email        VARCHAR(120) NOT NULL,
  password     VARCHAR(255) NOT NULL,
  avatar       VARCHAR(16)  NOT NULL DEFAULT '🎮',
  total_score  INT          NOT NULL DEFAULT 0,
  games_played INT          NOT NULL DEFAULT 0,
  games_won    INT          NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP    NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_types (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug        VARCHAR(40)  NOT NULL,
  name        VARCHAR(80)  NOT NULL,
  description VARCHAR(255) NULL,
  min_players TINYINT      NOT NULL DEFAULT 1,
  max_players TINYINT      NOT NULL DEFAULT 2,
  icon        VARCHAR(16)  NOT NULL DEFAULT '🎮',
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_types_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rooms (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_code    VARCHAR(8)   NOT NULL,
  game_type_id INT UNSIGNED NOT NULL,
  host_id      INT UNSIGNED NOT NULL,
  max_players  TINYINT      NOT NULL DEFAULT 2,
  is_private   TINYINT(1)   NOT NULL DEFAULT 0,
  seed         INT          NOT NULL DEFAULT 0,
  -- Match length in seconds. Every game is time-boxed: min 120s, max 300s.
  -- When the clock hits 0, the player with the most points wins (a player
  -- who finishes early banks a big completion bonus, so finishing first
  -- naturally yields the top score).
  duration_seconds INT      NOT NULL DEFAULT 120,
  status       ENUM('waiting','in_progress','finished','abandoned')
                            NOT NULL DEFAULT 'waiting',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Touched on join/start/chat/score. The stale-room sweep uses this rather
  -- than created_at, so a busy lobby isn't culled just for being old.
  last_activity_at DATETIME NULL DEFAULT NULL,
  started_at   TIMESTAMP    NULL,
  finished_at  TIMESTAMP    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rooms_code (room_code),
  KEY idx_rooms_status (status),
  KEY idx_rooms_host (host_id),
  CONSTRAINT fk_rooms_game FOREIGN KEY (game_type_id) REFERENCES game_types(id),
  CONSTRAINT fk_rooms_host FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_players (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id       INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  is_host       TINYINT(1)   NOT NULL DEFAULT 0,
  is_spectator  TINYINT(1)   NOT NULL DEFAULT 0,
  score         INT          NOT NULL DEFAULT 0,
  pairs_matched INT          NOT NULL DEFAULT 0,
  moves         INT          NOT NULL DEFAULT 0,
  game_state    TEXT         NULL,
  joined_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_room_player (room_id, user_id),
  KEY idx_rp_room (room_id),
  CONSTRAINT fk_rp_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_sessions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id       INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  game_type     VARCHAR(40)  NOT NULL,
  score         INT          NOT NULL DEFAULT 0,
  pairs_matched INT          NOT NULL DEFAULT 0,
  moves         INT          NOT NULL DEFAULT 0,
  result        ENUM('win','loss','draw','incomplete') NOT NULL DEFAULT 'loss',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_session_room_user (room_id, user_id),
  KEY idx_gs_user (user_id),
  CONSTRAINT fk_gs_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_gs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leaderboard (
  user_id      INT UNSIGNED NOT NULL,
  username     VARCHAR(32)  NOT NULL,
  avatar       VARCHAR(16)  NOT NULL DEFAULT '🎮',
  total_score  INT          NOT NULL DEFAULT 0,
  games_played INT          NOT NULL DEFAULT 0,
  games_won    INT          NOT NULL DEFAULT 0,
  win_rate     DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (user_id),
  KEY idx_lb_score (total_score DESC),
  CONSTRAINT fk_lb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  message VARCHAR(300) NOT NULL,
  sent_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cm_room (room_id, sent_at),
  CONSTRAINT fk_cm_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_cm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS friendships (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_a       INT UNSIGNED NOT NULL,
  user_b       INT UNSIGNED NOT NULL,
  requested_by INT UNSIGNED NOT NULL,
  status       ENUM('pending','accepted','blocked','declined')
                            NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_friendship_pair (user_a, user_b),
  KEY idx_fr_b (user_b),
  CONSTRAINT chk_friend_order CHECK (user_a < user_b),
  CONSTRAINT fk_fr_a FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fr_b FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_invites (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id      INT UNSIGNED NOT NULL,
  from_user    INT UNSIGNED NOT NULL,
  to_user      INT UNSIGNED NOT NULL,
  status       ENUM('pending','accepted','declined')
                            NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invite_room_to (room_id, to_user),
  KEY idx_inv_to (to_user, status),
  CONSTRAINT fk_inv_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_from FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_to   FOREIGN KEY (to_user)   REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Columns added after the first release ────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS skips a table that already exists, so a database
-- built before one of these columns existed would never gain it. MySQL has no
-- ADD COLUMN IF NOT EXISTS, hence the look-then-run dance: each block adds the
-- column only when it's missing, and does nothing at all when it's already there.

SET @sql = (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE `rooms` ADD COLUMN duration_seconds INT NOT NULL DEFAULT 120 AFTER seed')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rooms' AND COLUMN_NAME = 'duration_seconds');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE `rooms` ADD COLUMN last_activity_at DATETIME NULL DEFAULT NULL AFTER created_at')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rooms' AND COLUMN_NAME = 'last_activity_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) > 0, 'DO 0',
  'ALTER TABLE `users` ADD COLUMN last_seen_at TIMESTAMP NULL DEFAULT NULL AFTER created_at')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_seen_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Game catalog ─────────────────────────────────────────────────────────────
INSERT INTO game_types (slug, name, description, min_players, max_players, icon, is_active) VALUES
  ('mahjong', 'Mahjong Solitaire', 'Match pairs of free tiles to clear the board. Solo or 1v1!', 1, 8, CONVERT(UNHEX('F09F8084') USING utf8mb4), 1),
  ('memory', 'Memory Match', 'Flip cards and find matching pairs. Race against friends!', 1, 8, CONVERT(UNHEX('F09F838F') USING utf8mb4), 1),
  ('speedmath', 'Speed Math', 'Solve as many problems as you can before the clock runs out!', 1, 8, CONVERT(UNHEX('E29E97') USING utf8mb4), 1),
  ('reaction', 'Tap Rush', 'Tap the lit tiles fast — rack up points against the clock!', 1, 8, CONVERT(UNHEX('E29AA1') USING utf8mb4), 1),
  ('wordrush', 'Word Rush', 'Unscramble as many words as possible before time''s up!', 1, 8, CONVERT(UNHEX('F09F94A4') USING utf8mb4), 1),
  ('arrows', 'Arrow Escape', 'Tap an arrow to slide it off the board, but only if its path is clear.', 1, 8, CONVERT(UNHEX('F09F8FB9') USING utf8mb4), 1),
  ('jigsaw', 'Missing Piece', 'Spot which piece fills the gap in the picture.', 1, 8, CONVERT(UNHEX('F09FA7A9') USING utf8mb4), 1),
  ('dino', 'Dino Dash', 'Jump the cacti, duck the birds, run as far as you can.', 1, 8, CONVERT(UNHEX('F09FA696') USING utf8mb4), 1),
  ('numbers', 'Number Rush', 'Tap the numbers in order, one grid after another.', 1, 8, CONVERT(UNHEX('F09F94A2') USING utf8mb4), 1),
  ('colors', 'Color Dash', 'Tap the swatch that matches the named colour, fast.', 1, 8, CONVERT(UNHEX('F09F8EA8') USING utf8mb4), 1),
  ('pipes', 'Pipes', 'Turn the pipes until every one joins up to the source.', 1, 8, CONVERT(UNHEX('F09F9AB0') USING utf8mb4), 1),
  ('flappy', 'Flappy Dash', 'Tap to flap and squeeze through the pipes.', 1, 8, CONVERT(UNHEX('F09F90A4') USING utf8mb4), 1),
  ('slide', 'Slide Puzzle', 'Slide the tiles until 1-8 are back in order.', 1, 8, CONVERT(UNHEX('F09F9480') USING utf8mb4), 1),
  ('blocks', 'Block Drop', 'Turn and drop the falling blocks to clear lines.', 1, 8, CONVERT(UNHEX('F09FA7B1') USING utf8mb4), 1),
  ('trivia', 'Trivia Quiz', 'Answer questions and outsmart your opponents.', 2, 4, CONVERT(UNHEX('F09FA7A0') USING utf8mb4), 0)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description),
  min_players = VALUES(min_players), max_players = VALUES(max_players),
  icon = VALUES(icon), is_active = VALUES(is_active);

-- ── Check it worked ──────────────────────────────────────────────────────────
-- Expect 9 tables and 14 playable games.
SELECT COUNT(*) AS tables_created FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();
SELECT slug, name, icon, max_players FROM game_types WHERE is_active = 1 ORDER BY id;

-- Every foreign key pointing at users(id) must cascade, or deleting an account
-- fails with a constraint error. This should return no rows; if it returns any,
-- run "node config/setupDb.js" against this database to repair them.
SELECT k.TABLE_NAME, k.COLUMN_NAME, r.DELETE_RULE
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
 WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = 'users'
   AND r.DELETE_RULE <> 'CASCADE';
