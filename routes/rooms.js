// routes/rooms.js
const router = require("express").Router();
const db     = require("../config/db");
const { verifyToken } = require("../middleware/auth");

function genCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// GET /api/rooms — open public rooms
router.get("/", verifyToken, async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT r.id, r.room_code, r.status, r.max_players, r.is_private, r.created_at,
             gt.name AS game_name, gt.icon AS game_icon, gt.slug AS game_slug,
             u.username AS host_name,
             COUNT(rp.id) AS player_count
      FROM rooms r
      JOIN game_types gt  ON gt.id = r.game_type_id
      JOIN users u        ON u.id  = r.host_id
      LEFT JOIN room_players rp ON rp.room_id = r.id
      WHERE r.status = 'waiting' AND r.is_private = 0
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT 20
    `);
    res.json({ success: true, rooms: rows });
  } catch (err) { next(err); }
});

// POST /api/rooms — create room
router.post("/", verifyToken, async (req, res, next) => {
  try {
    const { game_slug, max_players = 2, is_private = false } = req.body;
    if (!game_slug) return res.status(400).json({ success: false, message: "game_slug is required." });

    const [gt] = await db.execute(
      "SELECT id, max_players FROM game_types WHERE slug = ? AND is_active = 1",
      [game_slug]
    );
    if (!gt.length) return res.status(404).json({ success: false, message: "Game type not found." });

    const cap  = Math.min(Number(max_players), gt[0].max_players);
    let code; let tries = 0;
    do {
      code = genCode(6);
      const [ex] = await db.execute("SELECT id FROM rooms WHERE room_code = ?", [code]);
      if (!ex.length) break;
    } while (++tries < 10);

    const seed = Math.floor(Math.random() * 1_000_000);
    const [result] = await db.execute(
      "INSERT INTO rooms (room_code, game_type_id, host_id, max_players, is_private, seed) VALUES (?,?,?,?,?,?)",
      [code, gt[0].id, req.user.id, cap, is_private ? 1 : 0, seed]
    );
    const roomId = result.insertId;
    await db.execute(
      "INSERT INTO room_players (room_id, user_id, is_host) VALUES (?,?,1)",
      [roomId, req.user.id]
    );
    res.status(201).json({ success: true, room: { id: roomId, room_code: code, seed, max_players: cap } });
  } catch (err) { next(err); }
});

// POST /api/rooms/join
router.post("/join", verifyToken, async (req, res, next) => {
  try {
    const { room_code } = req.body;
    if (!room_code) return res.status(400).json({ success: false, message: "room_code is required." });

    const [rooms] = await db.execute(`
      SELECT r.id, r.status, r.max_players, r.seed,
             gt.slug AS game_slug, gt.name AS game_name
      FROM rooms r JOIN game_types gt ON gt.id = r.game_type_id
      WHERE r.room_code = ?
    `, [room_code.toUpperCase()]);
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });

    const room = rooms[0];
    if (room.status !== "waiting") return res.status(409).json({ success: false, message: "Room is not open." });

    const [players] = await db.execute("SELECT user_id FROM room_players WHERE room_id = ?", [room.id]);
    if (players.length >= room.max_players)
      return res.status(409).json({ success: false, message: "Room is full." });
    if (players.find(p => p.user_id === req.user.id))
      return res.json({ success: true, room, already_joined: true });

    await db.execute("INSERT INTO room_players (room_id, user_id) VALUES (?,?)", [room.id, req.user.id]);
    res.json({ success: true, room });
  } catch (err) { next(err); }
});

// GET /api/rooms/:code
router.get("/:code", verifyToken, async (req, res, next) => {
  try {
    const [rooms] = await db.execute(`
      SELECT r.id, r.room_code, r.status, r.max_players, r.seed, r.started_at, r.created_at,
             gt.slug AS game_slug, gt.name AS game_name, gt.icon AS game_icon,
             u.username AS host_name
      FROM rooms r
      JOIN game_types gt ON gt.id = r.game_type_id
      JOIN users u       ON u.id  = r.host_id
      WHERE r.room_code = ?
    `, [req.params.code.toUpperCase()]);
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });

    const room = rooms[0];
    const [players] = await db.execute(`
      SELECT rp.is_host, rp.score, rp.joined_at,
             u.id AS user_id, u.username, u.avatar
      FROM room_players rp JOIN users u ON u.id = rp.user_id
      WHERE rp.room_id = ?
    `, [room.id]);
    res.json({ success: true, room: { ...room, players } });
  } catch (err) { next(err); }
});

// PATCH /api/rooms/:code/start
router.patch("/:code/start", verifyToken, async (req, res, next) => {
  try {
    const [rooms] = await db.execute(
      "SELECT id, host_id, status FROM rooms WHERE room_code = ?",
      [req.params.code.toUpperCase()]
    );
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });
    const room = rooms[0];
    if (room.host_id !== req.user.id)
      return res.status(403).json({ success: false, message: "Only the host can start." });
    if (room.status !== "waiting")
      return res.status(409).json({ success: false, message: "Game already started." });

    await db.execute(
      "UPDATE rooms SET status = 'in_progress', started_at = NOW() WHERE id = ?",
      [room.id]
    );
    res.json({ success: true, message: "Game started!" });
  } catch (err) { next(err); }
});

// PATCH /api/rooms/:code/score
router.patch("/:code/score", verifyToken, async (req, res, next) => {
  try {
    const { score = 0, pairs_matched = 0, moves = 0 } = req.body;
    const [rooms] = await db.execute("SELECT id FROM rooms WHERE room_code = ?", [req.params.code.toUpperCase()]);
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });
    await db.execute(
      "UPDATE room_players SET score = ?, pairs_matched = ?, moves = ? WHERE room_id = ? AND user_id = ?",
      [score, pairs_matched, moves, rooms[0].id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/rooms/:code/poll
router.get("/:code/poll", verifyToken, async (req, res, next) => {
  try {
    const [rooms] = await db.execute(
      "SELECT id, status, seed FROM rooms WHERE room_code = ?",
      [req.params.code.toUpperCase()]
    );
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });

    const [players] = await db.execute(`
      SELECT rp.is_host, rp.score, rp.pairs_matched, rp.moves,
             u.id AS user_id, u.username, u.avatar
      FROM room_players rp JOIN users u ON u.id = rp.user_id
      WHERE rp.room_id = ?
    `, [rooms[0].id]);

    const [msgs] = await db.execute(`
      SELECT cm.message, cm.sent_at, u.username, u.avatar
      FROM chat_messages cm JOIN users u ON u.id = cm.user_id
      WHERE cm.room_id = ?
      ORDER BY cm.sent_at DESC LIMIT 30
    `, [rooms[0].id]);

    res.json({ success: true, status: rooms[0].status, seed: rooms[0].seed, players, chat: msgs.reverse() });
  } catch (err) { next(err); }
});

// POST /api/rooms/:code/chat
router.post("/:code/chat", verifyToken, async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, message: "Message cannot be empty." });
    const [rooms] = await db.execute("SELECT id FROM rooms WHERE room_code = ?", [req.params.code.toUpperCase()]);
    if (!rooms.length) return res.status(404).json({ success: false, message: "Room not found." });
    await db.execute(
      "INSERT INTO chat_messages (room_id, user_id, message) VALUES (?,?,?)",
      [rooms[0].id, req.user.id, message.trim().slice(0, 300)]
    );
    res.status(201).json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
