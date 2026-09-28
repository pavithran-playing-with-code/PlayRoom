// scripts/e2e-tokens.js — hand the test harness its logins without using the
// login endpoint.
//
// Login is rate limited per IP (20 in 15 minutes), which is right for the app
// and hopeless for a test run that signs three tabs in for each of a dozen
// games. This mints the same tokens the login route would, straight from the
// local database and the local JWT secret, and writes them where e2e.mjs looks.
//
//   node scripts/e2e-tokens.js [user1 user2 …]
//
// Development only: it needs your .env, so it can only ever mint tokens for the
// database you are pointed at.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");

const OUT = path.join(__dirname, "..", ".e2e-tokens.json");
const wanted = process.argv.slice(2);

(async () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not set — check .env");
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "playroom",
  });

  // Default to whatever test accounts already exist, newest first.
  const [rows] = wanted.length
    ? await db.query("SELECT id, username FROM users WHERE username IN (?)", [wanted])
    : await db.query(
        `SELECT id, username FROM users
          WHERE username REGEXP '^(p[12]|t[1-4]|s[1-3]|lb[12]|sp[1-3])[a-z0-9]{5}$'
          ORDER BY id DESC LIMIT 12`);

  if (!rows.length) {
    console.log("No test accounts found. Run the harness once to create some,");
    console.log("or pass usernames: node scripts/e2e-tokens.js alice bob");
    await db.end();
    return;
  }

  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { cache = {}; }
  for (const u of rows) {
    cache[u.username] = jwt.sign({ id: u.id, username: u.username },
      process.env.JWT_SECRET, { expiresIn: "7d" });
  }
  fs.writeFileSync(OUT, JSON.stringify(cache, null, 2));
  console.log(`Wrote ${rows.length} token(s) to ${path.basename(OUT)}:`);
  for (const u of rows) console.log(`  ${u.username}`);
  await db.end();
})().catch((e) => { console.error("Could not mint tokens:", e.message); process.exit(1); });
