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

// PATCH /api/auth/me - change your username and/or badge.
router.patch("/me", verifyToken, async (req, res, next) => {
  try {
    const { username, avatar } = req.body || {};
    const sets = [], vals = [];

    if (username !== undefined) {
      const clean = typeof username === "string" ? username.trim() : "";
      if (!USERNAME_RE.test(clean))
        return res.status(400).json({ success: false, message: "Username must be 3-32 chars: letters, numbers, _ . -" });
      sets.push("username = ?"); vals.push(clean);
    }
    if (avatar !== undefined) {
      if (typeof avatar !== "string" || !avatar || avatar.length > AVATAR_MAX)
        return res.status(400).json({ success: false, message: "Invalid avatar." });
      sets.push("avatar = ?"); vals.push(avatar);
    }
    if (!sets.length)
      return res.status(400).json({ success: false, message: "Nothing to update." });

    await db.execute(`UPDATE users SET ${sets.join(", ")} WHERE id = ? AND is_active = 1`, [...vals, req.user.id]);

    // The leaderboard keeps its own copy of name and badge. Refresh it now,
    // instead of leaving it stale until this player's next game.
    await db.execute(
      `UPDATE leaderboard l JOIN users u ON u.id = l.user_id
          SET l.username = u.username, l.avatar = u.avatar
        WHERE l.user_id = ?`,
      [req.user.id]
    );

    const [rows] = await db.execute(
      "SELECT id, username, email, avatar, total_score, games_played, games_won, created_at FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "User not found." });

    // The token carries the username, so hand back a fresh one.
    const token = jwt.sign(
      { id: rows[0].id, username: rows[0].username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
    return res.json({ success: true, user: rows[0], token });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ success: false, message: "That username is already taken." });
    next(err);
  }
});

// POST /api/auth/change-password - the current password is required as proof.
router.post("/change-password", verifyToken, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (typeof current_password !== "string" || !current_password || typeof new_password !== "string")
      return res.status(400).json({ success: false, message: "Current and new password are required." });
    if (new_password.length < 6 || new_password.length > 200)
      return res.status(400).json({ success: false, message: "New password must be 6-200 characters." });

    const [rows] = await db.execute("SELECT password FROM users WHERE id = ? AND is_active = 1", [req.user.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "User not found." });

    // 400, not 401: the client treats any 401 as "your session expired" and
    // logs you out. A typo in the current password shouldn't do that.
    if (!(await bcrypt.compare(current_password, rows[0].password)))
      return res.status(400).json({ success: false, message: "Your current password isn't right." });
    if (await bcrypt.compare(new_password, rows[0].password))
      return res.status(400).json({ success: false, message: "That's already your password - pick a new one." });

    const hash = await bcrypt.hash(new_password, 12);
    await db.execute("UPDATE users SET password = ? WHERE id = ?", [hash, req.user.id]);
    return res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
