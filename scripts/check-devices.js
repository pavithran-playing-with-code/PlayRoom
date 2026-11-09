// scripts/check-devices.js — one account on two devices, and one device whose
// connection blips: the real socket server (config/socket.js) and real
// socket.io connections, with a pretend database. A second to run.
//
//   node scripts/check-devices.js
//
// The bug it guards: a phone whose connection dropped for a moment came back
// on a new socket while the server still thought the old one was alive (for
// up to ~20 s), and was told its own match was being played "on your other
// device". The fix tells devices apart (src/utils/deviceId.js, sent with the
// socket) rather than sockets.
const path = require("path");
const http = require("http");

process.env.JWT_SECRET = "test-secret";
// a pretend database: no friends, nothing stored
const dbPath = require.resolve(path.join(__dirname, "..", "config", "db"));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => [[], []], execute: async () => [[], []], getConnection: async () => ({ query: async () => [[]], release() {} }) } };

const jwt = require("jsonwebtoken");
const { io: connectTo } = require("socket.io-client");
const S = require(path.join(__dirname, "..", "config", "socket.js"));

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = http.createServer();
  const io = S.initSocket(server);
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const token = (id) => jwt.sign({ id, username: `u${id}` }, process.env.JWT_SECRET);
  const open = (id, device) => new Promise((res) => {
    const s = connectTo(url, { auth: device ? { token: token(id), device } : { token: token(id) }, transports: ["websocket"], forceNew: true, reconnection: false });
    s.on("connect", () => res(s));
  });
  const play = (s, code) => new Promise((res) => s.emit("room:play", code, (r) => res(r && r.ok !== false)));

  // the phone plays; its connection blips: a new socket while the old one
  // is still "connected" as far as the server knows
  const phone = await open(5, "phone-5");
  check("the phone takes its match", await play(phone, "ABCD"));
  const phoneAgain = await open(5, "phone-5");
  check("the same phone on a new socket: still its match, not 'another device'", await play(phoneAgain, "ABCD"));
  const laptop = await open(5, "laptop-5");
  check("a really different device (still connected one playing): 'elsewhere'", !(await play(laptop, "ABCD")));
  // an old app with no device id: as before, one socket, one device
  const oldApp = await open(5);
  check("an old app without a device id: 'elsewhere' too", !(await play(oldApp, "ABCD")));
  // the playing device goes away: the laptop can take over
  phoneAgain.disconnect(); phone.disconnect();
  await sleep(150);
  check("the phone gone: the laptop can play", await play(laptop, "ABCD"));

  // leaving a room: is my seat being kept for my other device?
  const room = (s, code) => s.emit("room:join", code);
  const a1 = await open(7, "phone-7");
  await play(a1, "WXYZ"); room(a1, "WXYZ");
  const a2 = await open(7, "phone-7");
  room(a2, "WXYZ");
  await sleep(100);
  const ids = [...io.sockets.sockets.keys()];
  const a2id = ids.find((id) => io.sockets.sockets.get(id).handshake.auth.device === "phone-7" && id !== a1.id) || a2.id;
  check("leaving from the same phone's new socket: not 'held on another device'", !S.heldElsewhere(io, 7, "WXYZ", a2id));
  const b = await open(7, "laptop-7");
  room(b, "WXYZ");
  await sleep(100);
  check("leaving from the laptop while the phone plays: kept for the phone", S.heldElsewhere(io, 7, "WXYZ", b.id));

  [a1, a2, b, laptop, oldApp].forEach((s) => s.disconnect());
  io.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
