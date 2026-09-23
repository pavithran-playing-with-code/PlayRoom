#!/usr/bin/env node
/**
 * npm run sql — write sql/playroom-schema.sql from config/setupDb.js.
 *
 * The schema lives in one place (setupDb.js) and this renders it as plain SQL
 * for anyone who would rather run it by hand — in MySQL Workbench against a
 * hosted database, say — than let a script touch their data.
 *
 * Emoji go in as CONVERT(UNHEX('…') USING utf8mb4) rather than as characters,
 * because Workbench's parser mangles them depending on the file encoding and
 * you end up with '?' where the icon should be.
 */
const fs = require("fs");
const path = require("path");
const { TABLES, CREATE_ORDER, GAME_SEED, COLUMN_MIGRATIONS } = require("../config/setupDb");

const OUT = path.join(__dirname, "..", "sql", "playroom-schema.sql");
const DB_NAME = process.argv[2] || "defaultdb";

// 'it''s' is the portable way to quote an apostrophe; backslashes would depend
// on NO_BACKSLASH_ESCAPES being off.
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const emoji = (s) => `CONVERT(UNHEX('${Buffer.from(s, "utf8").toString("hex").toUpperCase()}') USING utf8mb4)`;
const trim = (sql) => sql.trim().replace(/\n {4}/g, "\n");

const out = [];
out.push(`-- ─────────────────────────────────────────────────────────────────────────────`);
out.push(`--  PlayRoom — full schema and game catalog`);
out.push(`--  Generated from config/setupDb.js by scripts/makeSql.js. Do not edit by hand.`);
out.push(`--`);
out.push(`--  Safe to run more than once: every table is CREATE TABLE IF NOT EXISTS and`);
out.push(`--  the catalog upserts, so re-running never destroys data.`);
out.push(`--`);
out.push(`--  The USE line below names Aiven's default schema. Change it if your`);
out.push(`--  database is called something else.`);
out.push(`-- ─────────────────────────────────────────────────────────────────────────────`);
out.push(``);
out.push(`USE \`${DB_NAME}\`;`);
out.push(``);

out.push(`-- ── Tables (parents first, so the foreign keys resolve) ──────────────────────`);
for (const name of CREATE_ORDER) {
  out.push(``);
  out.push(trim(TABLES[name]));
}

out.push(``);
out.push(`-- ── Columns added after the first release ────────────────────────────────────`);
out.push(`-- CREATE TABLE IF NOT EXISTS skips a table that already exists, so a database`);
out.push(`-- built before one of these columns existed would never gain it. MySQL has no`);
out.push(`-- ADD COLUMN IF NOT EXISTS, hence the look-then-run dance: each block adds the`);
out.push(`-- column only when it's missing, and does nothing at all when it's already there.`);
for (const [table, column, definition] of COLUMN_MIGRATIONS) {
  out.push(``);
  out.push(`SET @sql = (SELECT IF(COUNT(*) > 0, 'DO 0',`);
  out.push(`  ${q(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`)})`);
  out.push(`  FROM information_schema.COLUMNS`);
  out.push(`  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${q(table)} AND COLUMN_NAME = ${q(column)});`);
  out.push(`PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;`);
}

out.push(``);
out.push(`-- ── Game catalog ─────────────────────────────────────────────────────────────`);
out.push(`INSERT INTO game_types (slug, name, description, min_players, max_players, icon, is_active) VALUES`);
out.push(GAME_SEED.map((g) =>
  `  (${q(g.slug)}, ${q(g.name)}, ${q(g.description)}, ${g.min}, ${g.max}, ${emoji(g.icon)}, ${g.active})`
).join(",\n"));
out.push(`ON DUPLICATE KEY UPDATE`);
out.push(`  name = VALUES(name), description = VALUES(description),`);
out.push(`  min_players = VALUES(min_players), max_players = VALUES(max_players),`);
out.push(`  icon = VALUES(icon), is_active = VALUES(is_active);`);

out.push(``);
out.push(`-- ── Check it worked ──────────────────────────────────────────────────────────`);
out.push(`-- Expect ${CREATE_ORDER.length} tables and ${GAME_SEED.filter((g) => g.active).length} playable games.`);
out.push(`SELECT COUNT(*) AS tables_created FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();`);
out.push(`SELECT slug, name, icon, max_players FROM game_types WHERE is_active = 1 ORDER BY id;`);
out.push(``);
out.push(`-- Every foreign key pointing at users(id) must cascade, or deleting an account`);
out.push(`-- fails with a constraint error. This should return no rows; if it returns any,`);
out.push(`-- run "node config/setupDb.js" against this database to repair them.`);
out.push(`SELECT k.TABLE_NAME, k.COLUMN_NAME, r.DELETE_RULE`);
out.push(`  FROM information_schema.KEY_COLUMN_USAGE k`);
out.push(`  JOIN information_schema.REFERENTIAL_CONSTRAINTS r`);
out.push(`    ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME`);
out.push(` WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = 'users'`);
out.push(`   AND r.DELETE_RULE <> 'CASCADE';`);
out.push(``);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out.join("\n"), "utf8");
console.log(`✅ Wrote ${path.relative(path.join(__dirname, ".."), OUT)}`);
console.log(`   ${CREATE_ORDER.length} tables, ${GAME_SEED.length} game types, schema "${DB_NAME}"`);
