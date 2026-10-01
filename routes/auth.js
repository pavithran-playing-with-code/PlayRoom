// routes/auth.js
const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const crypto  = require("crypto");
const jwt     = require("jsonwebtoken");
const db      = require("../config/db");
const { verifyToken } = require("../middleware/auth");
const { sendMail } = require("../config/mailer");

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

// ── Email codes ──────────────────────────────────────────────────────────────
// A 6-digit code mailed to your account's address proves it's you, for the
// two things that need more than a login: changing your password without the
// old one, and deleting your account. Only a hash is stored; a code lasts 10
// minutes and allows 5 tries. One email a minute, 5 an hour, per account —
// the relay sends ~100 a day in all (config/mailer.js).
const CODE_MINUTES = 10;
const CODE_TRIES = 5;
const RESEND_SECONDS = 60;
const CODES_PER_HOUR = 5;
const PURPOSES = {
  password: { subject: "Your PlayRoom code to change your password", action: "change your password" },
  delete:   { subject: "Your PlayRoom code to delete your account",  action: "<b>delete your account</b> — for good" },
};

function codeEmail(username, code, purpose) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;padding:24px;border:3px solid #1d1a2f;border-radius:18px">
      <h2 style="margin:0 0 12px">🎮 PlayRoom</h2>
      <p>Hi ${username},</p>
      <p>Use this code to ${PURPOSES[purpose].action}:</p>
      <p style="font-size:34px;font-weight:bold;letter-spacing:8px;margin:18px 0">${code}</p>
      <p style="color:#666">It works for ${CODE_MINUTES} minutes. If you didn't ask for it, ignore this email —
        nothing changes without the code.</p>
    </div>`;
}

// POST /api/auth/email-code { purpose: "password" | "delete" } — mail a code.
router.post("/email-code", verifyToken, async (req, res, next) => {
  try {
    const purpose = req.body && req.body.purpose;
    if (!PURPOSES[purpose]) return res.status(400).json({ success: false, message: "Unknown purpose." });

    const [users] = await db.execute("SELECT username, email FROM users WHERE id = ? AND is_active = 1", [req.user.id]);
    if (!users.length) return res.status(404).json({ success: false, message: "User not found." });

    const [[recent]] = await db.execute(
      `SELECT COUNT(*) AS hour,
              COALESCE(MAX(TIMESTAMPDIFF(SECOND, created_at, NOW()) < ?), 0) AS tooSoon,
              ? - MIN(TIMESTAMPDIFF(SECOND, created_at, NOW())) AS wait
         FROM email_codes WHERE user_id = ? AND created_at > NOW() - INTERVAL 1 HOUR`,
      [RESEND_SECONDS, RESEND_SECONDS, req.user.id]);
    if (Number(recent.tooSoon))
      return res.status(429).json({ success: false, message: `Wait ${Math.max(1, Number(recent.wait))}s before asking for another code.`, wait: Math.max(1, Number(recent.wait)) });
    if (Number(recent.hour) >= CODES_PER_HOUR)
      return res.status(429).json({ success: false, message: "That's a lot of codes — try again in an hour." });

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const hash = await bcrypt.hash(code, 10);
    // a new code replaces any older one for the same thing
    await db.execute("UPDATE email_codes SET used_at = NOW() WHERE user_id = ? AND purpose = ? AND used_at IS NULL", [req.user.id, purpose]);
    const [ins] = await db.execute(
      "INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES (?, ?, ?, NOW() + INTERVAL ? MINUTE)",
      [req.user.id, purpose, hash, CODE_MINUTES]);
    db.execute("DELETE FROM email_codes WHERE created_at < NOW() - INTERVAL 1 DAY").catch(() => {});

    try {
      await sendMail({ to: users[0].email, subject: PURPOSES[purpose].subject, html: codeEmail(users[0].username, code, purpose) });
    } catch (e) {
      console.error("email-code:", e.message);
      await db.execute("DELETE FROM email_codes WHERE id = ?", [ins.insertId]);   // not sent: doesn't count
      return res.status(502).json({ success: false, message: "Couldn't send the email just now. Try again in a minute." });
    }
    return res.json({ success: true, email: users[0].email, minutes: CODE_MINUTES, resend: RESEND_SECONDS });
  } catch (err) { next(err); }
});

// Check a code, using it up if it's right. Returns null when it's good, or
// the message to show.
async function checkCode(userId, purpose, code) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) return "Enter the 6-digit code from the email.";
  const [rows] = await db.execute(
    `SELECT id, code_hash, attempts, expires_at > NOW() AS live FROM email_codes
      WHERE user_id = ? AND purpose = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1`,
    [userId, purpose]);
  const row = rows[0];
  if (!row || !Number(row.live)) return "That code has expired — send yourself a new one.";
  if (row.attempts >= CODE_TRIES) return "Too many wrong tries — send yourself a new code.";
  if (!(await bcrypt.compare(code.trim(), row.code_hash))) {
    await db.execute("UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?", [row.id]);
    const left = CODE_TRIES - row.attempts - 1;
    return left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries — send yourself a new code.";
  }
  // used up, atomically: two requests racing with the same code can't both win
  const [u] = await db.execute("UPDATE email_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL", [row.id]);
  return u.affectedRows ? null : "That code has already been used.";
}

// POST /api/auth/change-password - proof is either the current password or
// a code from /email-code: { current_password | code, new_password }.
router.post("/change-password", verifyToken, async (req, res, next) => {
  try {
    const { current_password, code, new_password } = req.body || {};
    const byCode = code !== undefined && code !== null && code !== "";
    if ((!byCode && (typeof current_password !== "string" || !current_password)) || typeof new_password !== "string")
      return res.status(400).json({ success: false, message: "Current and new password are required." });
    if (new_password.length < 6 || new_password.length > 200)
      return res.status(400).json({ success: false, message: "New password must be 6-200 characters." });

    const [rows] = await db.execute("SELECT password FROM users WHERE id = ? AND is_active = 1", [req.user.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "User not found." });

    // 400, not 401: the client treats any 401 as "your session expired" and
    // logs you out. A typo in the current password shouldn't do that.
    if (!byCode && !(await bcrypt.compare(current_password, rows[0].password)))
      return res.status(400).json({ success: false, message: "Your current password isn't right." });
    if (await bcrypt.compare(new_password, rows[0].password))
      return res.status(400).json({ success: false, message: "That's already your password - pick a new one." });

    // the code is checked last, so a new password that would be refused
    // anyway doesn't spend it
    if (byCode) {
      const bad = await checkCode(req.user.id, "password", String(code));
      if (bad) return res.status(400).json({ success: false, message: bad });
    }

    const hash = await bcrypt.hash(new_password, 12);
    await db.execute("UPDATE users SET password = ? WHERE id = ?", [hash, req.user.id]);
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/auth/delete-account { code } — gone for good: the account and
// everything that hangs off it. Not while you're in a match.
//
// The rows are removed one table at a time rather than trusting ON DELETE
// CASCADE, so it works on a database whose foreign keys predate the cascades.
router.post("/delete-account", verifyToken, async (req, res, next) => {
  const uid = req.user.id;
  try {
    const [[busy]] = await db.execute(
      `SELECT COUNT(*) AS n FROM room_players rp JOIN rooms r ON r.id = rp.room_id
        WHERE rp.user_id = ? AND rp.is_spectator = 0 AND r.status = 'in_progress'`, [uid]);
    if (Number(busy.n))
      return res.status(409).json({ success: false, message: "You're in a match right now — finish or leave it first." });

    const bad = await checkCode(uid, "delete", String((req.body && req.body.code) || ""));
    if (bad) return res.status(400).json({ success: false, message: bad });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      // rooms you host go too, with everything in them
      const [hosted] = await conn.execute("SELECT id FROM rooms WHERE host_id = ?", [uid]);
      if (hosted.length) {
        const ids = hosted.map((r) => r.id), qs = ids.map(() => "?").join(",");
        for (const t of ["room_invites", "chat_messages", "game_sessions", "room_players"]) {
          await conn.execute(`DELETE FROM ${t} WHERE room_id IN (${qs})`, ids);
        }
      }
      await conn.execute("DELETE FROM room_invites WHERE from_user = ? OR to_user = ?", [uid, uid]);
      for (const t of ["chat_messages", "game_sessions", "room_players", "leaderboard", "email_codes"]) {
        await conn.execute(`DELETE FROM ${t} WHERE user_id = ?`, [uid]);
      }
      await conn.execute("DELETE FROM friendships WHERE user_a = ? OR user_b = ? OR requested_by = ?", [uid, uid, uid]);
      await conn.execute("DELETE FROM rooms WHERE host_id = ?", [uid]);
      await conn.execute("DELETE FROM users WHERE id = ?", [uid]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
