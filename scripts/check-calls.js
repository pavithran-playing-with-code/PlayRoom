// scripts/check-calls.js — the rules of video calls (config/calls.js), with a
// fake socket hub and fake presence: no browser, no database, a second to run.
//
//   node scripts/check-calls.js
//
// The phones' side (cameras, the connection itself) is tested in a real
// browser — see CLAUDE.md, "Video calls".
process.env.CALL_RING_MS = "150";
process.env.CALL_GRACE_MS = "150";
// a pretend Cloudflare: TURN credentials, counted, so we see they're cached
process.env.CF_TURN_KEY_ID = "test-key";
process.env.CF_TURN_KEY_TOKEN = "test-token";
let cfAsked = 0;
global.fetch = async (url, opts) => {
  cfAsked++;
  const ok = /rtc\.live\.cloudflare\.com\/v1\/turn\/keys\/test-key\/credentials\/generate-ice-servers/.test(url) && /test-token/.test(opts.headers.Authorization);
  return { ok, status: ok ? 201 : 401, json: async () => ({ iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
    { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "p" },
  ] }) };
};
const path = require("path");

// who is friends with whom, and who is online
const FRIENDS = { 1: [2, 3, 4, 5, 6], 2: [1, 3], 3: [1, 2], 4: [1], 5: [1], 6: [1], 9: [] };
const ONLINE = new Set([1, 2, 3, 4, 5, 6, 9]);
const presencePath = require.resolve(path.join(__dirname, "..", "config", "presence"));
require.cache[presencePath] = {
  id: presencePath, filename: presencePath, loaded: true,
  exports: { friendIdsOf: async (u) => FRIENDS[u] || [], isOnline: (u) => ONLINE.has(Number(u)) },
};
const calls = require(path.join(__dirname, "..", "config", "calls"));

// a socket.io stand-in: rooms are a socket's id and "user:<id>"
const sockets = new Map();
const onConnect = [];
const io = {
  on(ev, fn) { if (ev === "connection") onConnect.push(fn); },
  to(target) {
    return { emit(ev, payload) { for (const s of sockets.values()) if (s.id === target || target === `user:${s.user.id}`) s.inbox.push([ev, payload]); } };
  },
};
calls.attach(io);
let n = 0;
function connect(uid) {
  const h = {};
  const s = {
    id: `s${++n}`, user: { id: uid, username: `u${uid}` }, inbox: [],
    on(ev, fn) { h[ev] = fn; },
    send(ev, msg) {
      return new Promise((res) => { h[ev](msg, res); setTimeout(() => res(undefined), 30); });
    },
    drop() { sockets.delete(s.id); if (h.disconnect) h.disconnect(); },
    got(ev) { return s.inbox.filter(([e]) => e === ev).map(([, p]) => p); },
    clear() { s.inbox.length = 0; },
  };
  sockets.set(s.id, s);
  onConnect.forEach((f) => f(s));
  return s;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

(async () => {
  const A = connect(1), B1 = connect(2), B2 = connect(2), C = connect(3), D = connect(4), E = connect(5), F = connect(6), X = connect(9);

  // ── who can call ──
  check("a stranger can't call you", (await X.send("call:start", { to: 1 })).why === "not-friends");
  ONLINE.delete(4);
  check("an offline friend: told so", (await A.send("call:start", { to: 4 })).why === "offline");
  ONLINE.add(4);
  check("nobody calls themselves", (await A.send("call:start", { to: 1 })).why === "bad");

  // ── ring, answer ──
  const r = await A.send("call:start", { to: 2 });
  check("a call starts and comes with the connection servers", r.ok && r.callId && Array.isArray(r.iceServers) && r.iceServers.length > 0);
  const turn = r.iceServers.find((x) => x.username === "u");
  check("...including the relay, from Cloudflare (for phones that can't reach each other)", !!turn && turn.credential === "p" && turn.urls.some((u) => u.startsWith("turns:")), JSON.stringify(r.iceServers));
  check("...without the port 53 addresses browsers refuse", !JSON.stringify(r.iceServers).includes(":53"));
  check("it rings on every tab they have open", B1.got("call:ring").length === 1 && B2.got("call:ring").length === 1);
  const acc = await B1.send("call:accept", { callId: r.callId });
  check("the one answering gets the relay too", acc.iceServers.some((x) => x.username === "u"));
  check("...and Cloudflare is asked once, not every call", cfAsked === 1, `${cfAsked} times`);
  check("answered on one tab", acc.ok && acc.members.length === 2);
  check("...the other tab stops ringing", B2.got("call:ring-stop").length === 1);
  check("...and the caller sees them join", A.got("call:state").some((st) => st.members.length === 2));

  // ── signals only between members, only to the tab in the call ──
  A.clear(); B1.clear(); B2.clear();
  await A.send("call:signal", { callId: r.callId, to: 2, data: { description: { type: "offer", sdp: "x" } } });
  check("connection details reach the tab in the call", B1.got("call:signal").length === 1 && B2.got("call:signal").length === 0);
  check("...from the right person (the token, not the payload)", B1.got("call:signal")[0].from === 1);
  await X.send("call:signal", { callId: r.callId, to: 2, data: { candidate: "x" } });
  check("someone outside the call can't send into it", B1.got("call:signal").length === 1);
  // a call with a screen shared sends offers of 20 KB and more (a 20 KB
  // limit once dropped a second share's offer)
  await A.send("call:signal", { callId: r.callId, to: 2, data: { description: { type: "offer", sdp: "x".repeat(22000) } } });
  check("a big real offer (a screen shared) gets through", B1.got("call:signal").length === 2);
  await A.send("call:signal", { callId: r.callId, to: 2, data: { blob: "x".repeat(120000) } });
  check("an oversized message is dropped", B1.got("call:signal").length === 2);

  // ── busy ──
  check("someone on a call is busy to others", (await C.send("call:start", { to: 2 })).why === "busy");

  // ── four at most ──
  const add3 = await A.send("call:start", { to: 3 });
  const add4 = await A.send("call:start", { to: 4 });
  check("add friends into the call", add3.ok && add4.ok && add3.callId === r.callId);
  check("the fifth is turned away", (await A.send("call:start", { to: 5 })).why === "full");
  await C.send("call:decline", { callId: r.callId });
  check("one declines: the call goes on for the others", B1.got("call:ended").length === 0 && A.got("call:declined").length === 1);
  check("...and a seat is free again", (await A.send("call:start", { to: 5 })).ok);
  await D.send("call:accept", { callId: r.callId });
  await sleep(220);
  check("not answered in time: it stops ringing and says so", E.got("call:ring-stop").length === 1 && A.got("call:missed").some((m) => m.id === 5));

  // ── leaving ──
  A.clear(); D.clear();
  await B1.send("call:leave", { callId: r.callId });
  check("one leaves: the others are told, the call goes on", A.got("call:left").some((m) => m.id === 2) && A.got("call:ended").length === 0);
  await D.send("call:leave", { callId: r.callId });
  check("the last other leaves: the call ends", A.got("call:ended").length === 1);

  // ── decline / cancel a one-to-one ──
  A.clear();
  const r2 = await A.send("call:start", { to: 3 });
  await C.send("call:decline", { callId: r2.callId });
  check("declined: the caller's call ends, 'declined'", A.got("call:ended").some((e) => e.reason === "declined"));
  const r3 = await A.send("call:start", { to: 3 });
  check("...and you can call again straight away", r3.ok && r3.callId !== r2.callId);
  C.clear();
  await A.send("call:leave", { callId: r3.callId });
  check("cancel while it rings: it stops ringing for them", C.got("call:ring-stop").length === 1);

  // ── a connection drops for a moment ──
  A.clear();
  const r4 = await A.send("call:start", { to: 3 });
  await C.send("call:accept", { callId: r4.callId });
  C.drop();
  const C2 = connect(3);
  const back = await C2.send("call:rejoin", { callId: r4.callId });
  await sleep(220);
  check("back within the grace: the call goes on", back.ok && A.got("call:left").length === 0 && A.got("call:ended").length === 0);
  C2.drop();
  await sleep(220);
  check("gone for good: the others are told and it ends", A.got("call:left").some((m) => m.reason === "dropped") && A.got("call:ended").length === 1);

  // ── calling again from a new connection while the old one hangs ──
  B1.clear();
  const r5 = await A.send("call:start", { to: 2 });
  await B1.send("call:accept", { callId: r5.callId });
  A.drop();
  const A2 = connect(1);
  F.clear();
  const r6 = await A2.send("call:start", { to: 6 });
  check("the stale call is left and a new one rings", r6.ok && r6.callId !== r5.callId && F.got("call:ring").length === 1);
  check("...and the friend in the stale call isn't left hanging", B1.got("call:ended").length === 1);

  // ── chat in a call: passed on, never kept ──
  {
    const P = connect(1), Q = connect(3), R = connect(2), Z = connect(9);
    const rc = await P.send("call:start", { to: 3 });
    await Q.send("call:accept", { callId: rc.callId });
    Q.clear(); P.clear();
    await P.send("call:chat", { callId: rc.callId, text: "  hi 😂" + String.fromCharCode(0, 7) + " ❤️ ", key: "k1" });
    const got = Q.got("call:chat");
    check("a chat message reaches the others in the call", got.length === 1 && got[0].text === "hi 😂 ❤️" && got[0].id === 1 && got[0].key === "k1", JSON.stringify(got));
    check("...not echoed back to the sender", P.got("call:chat").length === 0);
    await Z.send("call:chat", { callId: rc.callId, text: "spam" });
    await R.send("call:chat", { callId: rc.callId, text: "not in it" });
    check("someone outside the call can't post in it", Q.got("call:chat").length === 1);
    await P.send("call:chat", { callId: rc.callId, text: "x".repeat(900) });
    check("a long message is cut to 500", Q.got("call:chat")[1].text.length === 500);
    await P.send("call:chat", { callId: rc.callId, text: "   " });
    check("an empty one is dropped", Q.got("call:chat").length === 2);
    for (let i = 0; i < 12; i++) await P.send("call:chat", { callId: rc.callId, text: "m" + i });
    check("a flood is held back (8 in 5 s)", Q.got("call:chat").length === 8, String(Q.got("call:chat").length));
  }
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
