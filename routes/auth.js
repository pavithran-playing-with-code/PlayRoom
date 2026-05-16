// routes/auth.js
const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const db      = require("../config/db");
const { verifyToken } = require("../middleware/auth");

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AVATAR_MAX  = 8; // emoji can be multi-codepoint; keep generous but bounded

// POST /api/auth/register
router.post("/register", async (req, res, next) => {
  try {
    const { username, email, password, avatar = "🎮" } = req.body;

    if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string")
      return res.status(400).json({ success: false, message: "username, email and password are required." });

    const cleanUsername = username.trim();
    const cleanEmail    = email.toLowerCase().trim();

    if (!USERNAME_RE.test(cleanUsername))
      return res.status(400).json({ success: false, message: "Username must be 3–32 chars: letters, numbers, _ . -" });
    if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 120)
      return res.status(400).json({ success: false, message: "Please provide a valid email." });
    if (password.length < 6 || password.length > 200)
      return res.status(400).json({ success: false, message: "Password must be 6–200 characters." });
    if (typeof avatar !== "string" || avatar.length > AVATAR_MAX)
      return res.status(400).json({ success: false, message: "Invalid avatar." });

    const hash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      "INSERT INTO users (username, email, password, avatar) VALUES (?, ?, ?, ?)",
      [cleanUsername, cleanEmail, hash, avatar]
    );
    const userId = result.insertId;

    // Create leaderboard entry
    await db.execute(
      "INSERT INTO leaderboard (user_id, username, avatar) VALUES (?, ?, ?)",
      [userId, cleanUsername, avatar]
    );

    const token = jwt.sign(
      { id: userId, username: cleanUsername },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    return res.status(201).json({
      success: true,
      token,
      user: { id: userId, username: cleanUsername, email: cleanEmail, avatar },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ success: false, message: "Username or email already taken." });
    next(err);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== "string" || typeof password !== "string" || !username || !password)
      return res.status(400).json({ success: false, message: "username and password are required." });
    if (username.length > 120 || password.length > 200)
      return res.status(400).json({ success: false, message: "Invalid credentials." });

    const [rows] = await db.execute(
      `SELECT id, username, email, password, avatar, total_score, games_played, games_won
       FROM users WHERE (username = ? OR email = ?) AND is_active = 1`,
      [username.trim(), username.toLowerCase().trim()]
    );
    if (!rows.length)
      return res.status(401).json({ success: false, message: "Invalid credentials." });

    const user  = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ success: false, message: "Invalid credentials." });

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    const { password: _p, ...safeUser } = user;
    return res.json({ success: true, token, user: safeUser });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get("/me", verifyToken, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      "SELECT id, username, email, avatar, total_score, games_played, games_won, created_at FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: "User not found." });
    return res.json({ success: true, user: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
