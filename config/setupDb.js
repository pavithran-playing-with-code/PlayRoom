// ─────────────────────────────────────────────────────────────────────────────
//  config/setupDb.js — one-shot database bootstrapper
//  Run:  node config/setupDb.js
//
//  Creates the `playroom` database (if missing) and every table the app needs,
//  then seeds the game_types catalog. Safe to re-run — every statement uses
//  IF NOT EXISTS / idempotent upserts, so running it again never destroys data.
//
//  This file is the single source of truth for the schema. When a new feature
//  needs a table or column, add it here AND ship a small ALTER so existing
//  installs migrate forward (see the `migrate()` section at the bottom).
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();
const mysql = require("mysql2/promise");

const DB_NAME = process.env.DB_NAME || "playroom";

// Connect WITHOUT a database selected first, so we can CREATE DATABASE.
const baseConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  charset: "utf8mb4",
  multipleStatements: true,
};

// ── Table definitions ─────────────────────────────────────────────────────────
// Order matters: parents before children (foreign keys).
const TABLES = {
  users: `
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
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_username (username),
      UNIQUE KEY uq_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  game_types: `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  rooms: `
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
      started_at   TIMESTAMP    NULL,
      finished_at  TIMESTAMP    NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_rooms_code (room_code),
      KEY idx_rooms_status (status),
      KEY idx_rooms_host (host_id),
      CONSTRAINT fk_rooms_game FOREIGN KEY (game_type_id) REFERENCES game_types(id),
      CONSTRAINT fk_rooms_host FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  room_players: `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  game_sessions: `
    CREATE TABLE IF NOT EXISTS game_sessions (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      room_id       INT UNSIGNED NOT NULL,
      user_id       INT UNSIGNED NOT NULL,
      game_type     VARCHAR(40)  NOT NULL,
      score         INT          NOT NULL DEFAULT 0,
      pairs_matched INT          NOT NULL DEFAULT 0,
      moves         INT          NOT NULL DEFAULT 0,
      result        ENUM('win','loss','draw') NOT NULL DEFAULT 'loss',
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_session_room_user (room_id, user_id),
      KEY idx_gs_user (user_id),
      CONSTRAINT fk_gs_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      CONSTRAINT fk_gs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  leaderboard: `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  chat_messages: `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  friendships: `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  room_invites: `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
};

// Order to create them in (parents → children).
const CREATE_ORDER = [
  "users", "game_types", "rooms", "room_players",
  "game_sessions", "leaderboard", "chat_messages",
  "friendships", "room_invites",
];

// ── Seed catalog ──────────────────────────────────────────────────────────────
// Upserted so editing a name/description here and re-running updates the row
// without creating duplicates. `trivia` ships inactive until the game is built.
const GAME_SEED = [
  { slug: "mahjong",   name: "Mahjong Solitaire", description: "Match pairs of free tiles to clear the board. Solo or 1v1!", min: 1, max: 2, icon: "🀄", active: 1 },
  { slug: "memory",    name: "Memory Match",      description: "Flip cards and find matching pairs. Race against friends!",   min: 1, max: 4, icon: "🃏", active: 1 },
  { slug: "speedmath", name: "Speed Math",        description: "Solve as many problems as you can before the clock runs out!", min: 1, max: 4, icon: "➗", active: 1 },
  { slug: "reaction",  name: "Tap Rush",          description: "Tap the lit tiles fast — rack up points against the clock!",   min: 1, max: 4, icon: "⚡", active: 1 },
  { slug: "wordrush",  name: "Word Rush",         description: "Unscramble as many words as possible before time's up!",       min: 1, max: 4, icon: "🔤", active: 1 },
  { slug: "trivia",    name: "Trivia Quiz",       description: "Answer questions and outsmart your opponents.",                 min: 2, max: 4, icon: "🧠", active: 0 },
];

// Add a column only if it's missing — keeps existing data, runs safely every time.
async function addColumnIfMissing(conn, table, column, definition) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_NAME, table, column]
  );
  if (rows[0].n === 0) {
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
    console.log(`   ↑ migrated: ${table}.${column} added`);
  }
}

async function migrate(conn) {
  await addColumnIfMissing(conn, "rooms", "duration_seconds",
    "duration_seconds INT NOT NULL DEFAULT 120 AFTER seed");
}

async function main() {
  console.log(`\n🛠  PlayRoom database setup → "${DB_NAME}"\n`);

  // 1. Connect without a DB and ensure the database exists.
  let conn = await mysql.createConnection(baseConfig);
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  console.log(`✅ Database ready: ${DB_NAME}`);
  await conn.end();

  // 2. Reconnect with the DB selected.
  conn = await mysql.createConnection({ ...baseConfig, database: DB_NAME });

  // 3. Create every table.
  for (const name of CREATE_ORDER) {
    await conn.query(TABLES[name]);
    console.log(`   • table ready: ${name}`);
  }

  // 3b. Forward migrations for installs created before a column existed.
  await migrate(conn);

  // 4. Seed / refresh the game catalog.
  for (const g of GAME_SEED) {
    await conn.execute(
      `INSERT INTO game_types (slug, name, description, min_players, max_players, icon, is_active)
         VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), description = VALUES(description),
         min_players = VALUES(min_players), max_players = VALUES(max_players),
         icon = VALUES(icon), is_active = VALUES(is_active)`,
      [g.slug, g.name, g.description, g.min, g.max, g.icon, g.active]
    );
  }
  console.log(`✅ Seeded ${GAME_SEED.length} game types`);

  await conn.end();
  console.log(`\n🎉 Setup complete. Start the backend with:  node server.js\n`);
}

main().catch((err) => {
  console.error("\n❌ Database setup failed:", err.message);
  console.error("   Check your .env → DB_HOST / DB_USER / DB_PASSWORD / DB_PORT\n");
  process.exit(1);
});
