// routes/friends.js — friend requests, friend list, room invites, search
const router = require("express").Router();
const db     = require("../config/db");
const { verifyToken } = require("../middleware/auth");
const { emitUser } = require("../config/socket");
const { presenceOf } = require("../config/presence");

// Which of these people are in a match you could go and watch, right now.
//
// Solo runs count. Nobody can take a seat in one or touch the score, but
// watching a friend play is the whole point of the feature and most games here
// get played alone. A room whose clock has already run out is left out — it is
// about to be settled and there is nothing left to see.
// Returns { userId: { room_code, game_name, game_icon, seconds_left } }.
async function playingNow(ids) {
  if (!ids.length) return {};
  const marks = ids.map(() => "?").join(",");
  const [rows] = await db.execute(
    `SELECT rp.user_id, r.room_code, gt.name AS game_name, gt.icon AS game_icon,
            GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(),
              r.started_at + INTERVAL r.duration_seconds SECOND)) AS seconds_left
       FROM room_players rp
       JOIN rooms r       ON r.id  = rp.room_id
       JOIN game_types gt ON gt.id = r.game_type_id
      WHERE rp.user_id IN (${marks})
        AND rp.is_spectator = 0
        AND r.status = 'in_progress'
        AND r.started_at IS NOT NULL
        AND r.started_at + INTERVAL r.duration_seconds SECOND > NOW()`,
    ids
  );
  const out = {};
  for (const r of rows) {
    out[r.user_id] = {
      room_code: r.room_code,
      game_name: r.game_name,
      game_icon: r.game_icon,
      seconds_left: Number(r.seconds_left) || 0,
    };
  }
  return out;
}

// Friendships use canonical (user_a, user_b) order with user_a < user_b.
function orderPair(x, y) {
  const a = Number(x), b = Number(y);
  return a < b ? [a, b] : [b, a];
}

async function publicUser(id) {
  const [rows] = await db.execute("SELECT id, username, avatar FROM users WHERE id = ?", [id]);
  return rows[0] || { id: Number(id), username: "Someone", avatar: "🎮" };
}

// Live nudge to the other person. Never fails the request: if the push is
// missed, the inbox and the badge still have it.
async function notify(req, userId, event, payload) {
  try {
    const body = typeof payload === "function" ? await payload() : payload;
    emitUser(req.app.get("io"), userId, event, body);
  } catch { /* best-effort */ }
}

router.use(verifyToken);

// ── GET /api/friends/inbox-count — badge: pending requests + invites
router.get("/inbox-count", async (req, res, next) => {
  try {
    const [r1] = await db.execute(
      `SELECT COUNT(*) AS n FROM friendships
       WHERE status = 'pending'
         AND requested_by <> ?
         AND (user_a = ? OR user_b = ?)`,
      [req.user.id, req.user.id, req.user.id]
    );
    // Only invites you can still act on: the room is open and you're not in it.
    const [r2] = await db.execute(
      `SELECT COUNT(*) AS n FROM room_invites inv
         JOIN rooms r ON r.id = inv.room_id
        WHERE inv.to_user = ? AND inv.status = 'pending'
          AND r.status IN ('waiting', 'in_progress')
          AND NOT EXISTS (SELECT 1 FROM room_players rp
                           WHERE rp.room_id = inv.room_id AND rp.user_id = inv.to_user)`,
      [req.user.id]
    );
    res.json({ success: true, count: Number(r1[0].n) + Number(r2[0].n) });
  } catch (err) { next(err); }
});

// ── GET /api/friends — accepted friends, with who's online and last seen
router.get("/", async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.username, u.avatar, f.created_at AS friends_since
       FROM friendships f
       JOIN users u
         ON u.id = IF(f.user_a = ?, f.user_b, f.user_a)
       WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'accepted'
       ORDER BY u.username`,
      [req.user.id, req.user.id, req.user.id]
    );
    const pres = await presenceOf(rows.map((r) => r.id));
    const live = await playingNow(rows.map((r) => r.id));
    const friends = rows.map((r) => ({
      ...r,
      online: !!pres[r.id]?.online,
      last_seen: pres[r.id]?.last_seen || null,
      playing: live[r.id] || null,
    }));
    res.json({ success: true, friends });
  } catch (err) { next(err); }
});

// ── GET /api/friends/pending — incoming + outgoing
router.get("/pending", async (req, res, next) => {
  try {
    const [incoming] = await db.execute(
      `SELECT f.id, u.id AS user_id, u.username, u.avatar, f.created_at
       FROM friendships f
       JOIN users u ON u.id = f.requested_by
       WHERE f.status = 'pending'
         AND f.requested_by <> ?
         AND (f.user_a = ? OR f.user_b = ?)
       ORDER BY f.created_at DESC`,
      [req.user.id, req.user.id, req.user.id]
    );
    const [outgoing] = await db.execute(
      `SELECT f.id,
              u.id AS user_id, u.username, u.avatar, f.created_at
       FROM friendships f
       JOIN users u
         ON u.id = IF(f.user_a = ?, f.user_b, f.user_a)
       WHERE f.status = 'pending'
         AND f.requested_by = ?
         AND (f.user_a = ? OR f.user_b = ?)
       ORDER BY f.created_at DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id]
    );
    res.json({ success: true, incoming, outgoing });
  } catch (err) { next(err); }
});

// ── GET /api/friends/search?q=foo — find users to add (excludes self + existing)
router.get("/search", async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    if (q.length < 2)
      return res.json({ success: true, users: [] });

    const [rows] = await db.execute(
      `SELECT u.id, u.username, u.avatar,
              (SELECT status FROM friendships f
                 WHERE (f.user_a = LEAST(u.id, ?) AND f.user_b = GREATEST(u.id, ?))
                 LIMIT 1) AS rel_status,
              (SELECT requested_by FROM friendships f
                 WHERE (f.user_a = LEAST(u.id, ?) AND f.user_b = GREATEST(u.id, ?))
                 LIMIT 1) AS rel_requested_by
       FROM users u
       WHERE u.id <> ?
         AND u.is_active = 1
         AND u.username LIKE ?
       ORDER BY u.username
       LIMIT 20`,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, `%${q}%`]
    );
    res.json({ success: true, users: rows });
  } catch (err) { next(err); }
});

// ── POST /api/friends/request   { user_id }
router.post("/request", async (req, res, next) => {
  try {
    const target = Number(req.body.user_id);
    if (!Number.isInteger(target) || target <= 0)
      return res.status(400).json({ success: false, message: "Invalid user_id." });
    if (target === req.user.id)
      return res.status(400).json({ success: false, message: "Cannot friend yourself." });

    const [exists] = await db.execute("SELECT id FROM users WHERE id = ? AND is_active = 1", [target]);
    if (!exists.length)
      return res.status(404).json({ success: false, message: "User not found." });

    const [a, b] = orderPair(req.user.id, target);
    let requestId;
    try {
      const [ins] = await db.execute(
        "INSERT INTO friendships (user_a, user_b, requested_by, status) VALUES (?,?,?, 'pending')",
        [a, b, req.user.id]
      );
      requestId = ins.insertId;
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY")
        return res.status(409).json({ success: false, message: "Friend request already exists or you're already friends." });
      throw err;
    }
    await notify(req, target, "friend:request", async () => ({
      id: requestId, from: await publicUser(req.user.id),
    }));
    res.status(201).json({ success: true });
  } catch (err) { next(err); }
});

// ── POST /api/friends/:id/accept
router.post("/:id/accept", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ success: false, message: "Invalid id." });

    const [result] = await db.execute(
      `UPDATE friendships SET status = 'accepted'
       WHERE id = ? AND status = 'pending'
         AND requested_by <> ?
         AND (user_a = ? OR user_b = ?)`,
      [id, req.user.id, req.user.id, req.user.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: "No pending request to accept." });

    const [fr] = await db.execute("SELECT requested_by FROM friendships WHERE id = ?", [id]);
    if (fr.length) {
      await notify(req, fr[0].requested_by, "friend:accepted", async () => ({
        by: await publicUser(req.user.id),
      }));
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── POST /api/friends/:id/reject — delete pending request (also "cancel" for the sender)
router.post("/:id/reject", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ success: false, message: "Invalid id." });

    const [pair] = await db.execute(
      "SELECT user_a, user_b FROM friendships WHERE id = ? AND status = 'pending' AND (user_a = ? OR user_b = ?)",
      [id, req.user.id, req.user.id]
    );
    const [result] = await db.execute(
      `DELETE FROM friendships
       WHERE id = ? AND status = 'pending'
         AND (user_a = ? OR user_b = ?)`,
      [id, req.user.id, req.user.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: "No pending request found." });
    if (pair.length) {
      const other = Number(pair[0].user_a) === Number(req.user.id) ? pair[0].user_b : pair[0].user_a;
      await notify(req, other, "friends:changed", {});
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── DELETE /api/friends/:user_id — remove an accepted friend
router.delete("/:user_id", async (req, res, next) => {
  try {
    const other = Number(req.params.user_id);
    if (!Number.isInteger(other) || other <= 0)
      return res.status(400).json({ success: false, message: "Invalid user_id." });

    const [a, b] = orderPair(req.user.id, other);
    const [result] = await db.execute(
      "DELETE FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'accepted'",
      [a, b]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: "Not friends." });
    await notify(req, other, "friends:changed", {});
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Room invites ─────────────────────────────────────────────────────────────

// GET /api/friends/invites — pending invites for me
router.get("/invites", async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT inv.id, inv.created_at,
              r.room_code, r.status AS room_status,
              gt.name AS game_name, gt.icon AS game_icon, gt.slug AS game_slug,
              u.id AS from_id, u.username AS from_username, u.avatar AS from_avatar
       FROM room_invites inv
       JOIN rooms r       ON r.id = inv.room_id
       JOIN game_types gt ON gt.id = r.game_type_id
       JOIN users u       ON u.id = inv.from_user
       WHERE inv.to_user = ? AND inv.status = 'pending'
         AND r.status IN ('waiting', 'in_progress')
         AND NOT EXISTS (SELECT 1 FROM room_players rp
                          WHERE rp.room_id = inv.room_id AND rp.user_id = inv.to_user)
       ORDER BY inv.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, invites: rows });
  } catch (err) { next(err); }
});

// POST /api/friends/invites/:id/decline
router.post("/invites/:id/decline", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ success: false, message: "Invalid id." });
    await db.execute(
      "UPDATE room_invites SET status = 'declined', responded_at = NOW() WHERE id = ? AND to_user = ? AND status = 'pending'",
      [id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
