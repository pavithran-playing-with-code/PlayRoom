// config/db.js — MySQL2 promise pool

const mysql = require("mysql2/promise");
const { sslOptions } = require("./dbSsl");

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || "localhost",
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || "root",
  // Use the env var directly — mysql2 handles special chars in passwords fine
  password:           process.env.DB_PASSWORD || "",
  database:           process.env.DB_NAME     || "playroom",
  ssl:                sslOptions(),
  waitForConnections: true,
  // Free hosted tiers cap total connections (Aiven's is 76) and give the
  // database 1GB of RAM, so this stays deliberately small.
  connectionLimit:    parseInt(process.env.DB_POOL_SIZE) || 10,
  queueLimit:         0,
  timezone:           "+00:00",
  charset:            "utf8mb4",
  connectTimeout:     20_000,             // a sleeping free-tier host is slow to answer
});

// A free-tier database powers down when idle and takes a while to wake, so the
// first connection after a quiet spell can fail purely because nothing is
// listening yet. Give it several tries before declaring the app dead — a
// process that exits here would only be restarted into the same race.
const ATTEMPTS = 10;
const WAIT_MS = 3_000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      const conn = await pool.getConnection();
      console.log("🔗 Database connected successfully");
      conn.release();
      return;
    } catch (err) {
      const last = i === ATTEMPTS;
      console.error(`❌ DB connection failed (attempt ${i}/${ATTEMPTS}):`, err.message);
      if (last) {
        console.error("   Check DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME");
        if (!sslOptions()) console.error("   A hosted database also needs DB_SSL_CA (the CA certificate).");
        process.exit(1);
      }
      await wait(WAIT_MS);
    }
  }
})();

module.exports = pool;
