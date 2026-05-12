// config/db.js — MySQL2 promise pool

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || "localhost",
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || "root",
  // Use the env var directly — mysql2 handles special chars in passwords fine
  password:           process.env.DB_PASSWORD || "",
  database:           process.env.DB_NAME     || "playroom",
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  timezone:           "+00:00",
  charset:            "utf8mb4",
  connectTimeout:     10_000,
});

pool.getConnection()
  .then(conn => {
    console.log("🔗 Database connected successfully");
    conn.release();
  })
  .catch(err => {
    console.error("❌ DB connection failed:", err.message);
    console.error("   Check .env  →  DB_HOST / DB_USER / DB_PASSWORD / DB_NAME");
    process.exit(1);
  });

module.exports = pool;
