// config/calls.js — video calls between friends (up to 4 in a call).
//
// The video and the sound go phone to phone (WebRTC); none of it passes
// through here. This only does what the phones can't do for themselves:
//   • ring a friend, on every tab and device they have open, and stop the
//     ringing everywhere once they answer, decline, or it times out
//   • keep who's in which call, so a friend already on a call shows as busy
//   • pass the phones' connection details to each other (call:signal) until
//     they're talking directly
//
// Only accepted friends can be called. The sender of everything is their
// verified token, never the payload. Calls live in memory: a restart ends
// them, and the phones see the socket drop and hang up.
//
// A member's socket can drop for a moment (a phone changing networks) while
// the call itself carries on phone to phone. They have GRACE_MS to come back
// (call:rejoin) before the others are told they left.
const presence = require("./presence");

const MAX = 4;
// (overridable so scripts/check-calls.js doesn't wait half a minute)
const RING_MS = Number(process.env.CALL_RING_MS) || 35000;
const GRACE_MS = Number(process.env.CALL_GRACE_MS) || 15000;
// A description from Chrome lists every codec it has: 4-5 KB a video
// section, and a call with a screen shared has several. 20 KB dropped a
// second share's offer, and the share never arrived.
const SIGNAL_MAX = 100000;

const calls = new Map();           // id -> { id, members: Map<uid, {sid, name, gone}>, invited: Map<uid, {by, timer}> }
const inCall = new Map();          // uid -> call id
let seq = 0;

const userChannel = (uid) => `user:${Number(uid)}`;

// STUN finds a phone's public address; TURN relays for the few networks where
// two phones can't reach each other directly (some mobile carriers). The TURN
// details come from the environment — never from the repository.
function iceServers() {
  const list = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const urls = (process.env.TURN_URLS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (urls.length) list.push({ urls, username: process.env.TURN_USERNAME || "", credential: process.env.TURN_CREDENTIAL || "" });
  return list;
}

function view(c) {
  return {
    callId: c.id,
    members: [...c.members].map(([id, m]) => ({ id, name: m.name, away: !!m.gone })),
    invited: [...c.invited.keys()],
  };
}

function attach(io) {
  const toMembers = (c, event, payload, exceptUid = null) => {
    for (const [id, m] of c.members) if (id !== exceptUid && m.sid) io.to(m.sid).emit(event, payload);
  };
  const tellState = (c) => toMembers(c, "call:state", view(c));

  function stopRinging(c, uid) {
    const inv = c.invited.get(uid);
    if (!inv) return;
    clearTimeout(inv.timer);
    c.invited.delete(uid);
    io.to(userChannel(uid)).emit("call:ring-stop", { callId: c.id });
  }
  function end(c, reason) {
    for (const uid of [...c.invited.keys()]) stopRinging(c, uid);
    toMembers(c, "call:ended", { callId: c.id, reason });
    for (const [id, m] of c.members) { clearTimeout(m.gone); if (inCall.get(id) === c.id) inCall.delete(id); }
    calls.delete(c.id);
  }
  // nobody left to talk to: end it
  function settle(c, reason) {
    if (!calls.has(c.id)) return;
    if (c.members.size === 0 || (c.members.size === 1 && c.invited.size === 0)) end(c, reason);
    else tellState(c);
  }
  function leave(c, uid, reason) {
    const m = c.members.get(uid);
    if (!m) return;
    clearTimeout(m.gone);
    c.members.delete(uid);
    if (inCall.get(uid) === c.id) inCall.delete(uid);
    toMembers(c, "call:left", { callId: c.id, id: uid, reason });
    settle(c, reason);
  }

  io.on("connection", (socket) => {
    const uid = Number(socket.user.id);
    const name = socket.user.username || "Friend";

    // Ring a friend. Starts a call, or (in one already) adds them to it.
    socket.on("call:start", async (msg, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const to = Number(msg && msg.to);
      if (!Number.isInteger(to) || to === uid) return reply({ ok: false, why: "bad" });
      let friends;
      try { friends = await presence.friendIdsOf(uid); } catch { return reply({ ok: false, why: "error" }); }
      if (!friends.includes(to)) return reply({ ok: false, why: "not-friends" });
      if (!presence.isOnline(to)) return reply({ ok: false, why: "offline" });
      let c = calls.get(inCall.get(uid));
      if (c && !c.members.has(uid)) c = null;
      // still in a call from a connection that dropped (another tab, or this
      // phone before it reconnected): that one's over, this is a new call
      if (c && c.members.get(uid).sid !== socket.id) { leave(c, uid, "switched"); c = null; }
      if (inCall.has(to) && (!c || inCall.get(to) !== c.id)) return reply({ ok: false, why: "busy" });
      if (c && (c.members.has(to) || c.invited.has(to))) return reply({ ok: true, callId: c.id, iceServers: iceServers() });
      if (c && c.members.size + c.invited.size >= MAX) return reply({ ok: false, why: "full" });
      if (!c) {
        c = { id: `c${Date.now().toString(36)}${(++seq).toString(36)}`, members: new Map(), invited: new Map() };
        c.members.set(uid, { sid: socket.id, name, gone: null });
        calls.set(c.id, c);
        inCall.set(uid, c.id);
      }
      const timer = setTimeout(() => {
        if (!c.invited.has(to)) return;
        stopRinging(c, to);
        toMembers(c, "call:missed", { callId: c.id, id: to });
        settle(c, "no-answer");
      }, RING_MS);
      c.invited.set(to, { by: uid, timer });
      io.to(userChannel(to)).emit("call:ring", { callId: c.id, from: { id: uid, name }, members: view(c).members });
      reply({ ok: true, callId: c.id, iceServers: iceServers() });
      tellState(c);
    });

    // Answer: this socket joins (leaving any call it was in), every other
    // tab of mine stops ringing.
    socket.on("call:accept", (msg, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const c = calls.get(msg && msg.callId);
      if (!c || !c.invited.has(uid)) return reply({ ok: false, why: "gone" });
      const old = calls.get(inCall.get(uid));
      if (old && old !== c) leave(old, uid, "switched");
      stopRinging(c, uid);
      c.members.set(uid, { sid: socket.id, name, gone: null });
      inCall.set(uid, c.id);
      reply({ ok: true, iceServers: iceServers(), ...view(c) });
      tellState(c);
    });

    socket.on("call:decline", (msg) => {
      const c = calls.get(msg && msg.callId);
      if (!c || !c.invited.has(uid)) return;
      stopRinging(c, uid);
      toMembers(c, "call:declined", { callId: c.id, id: uid });
      settle(c, "declined");
    });

    // Hang up (or, still ringing them, cancel).
    socket.on("call:leave", (msg) => {
      const c = calls.get(msg && msg.callId);
      if (c && c.members.has(uid) && c.members.get(uid).sid === socket.id) leave(c, uid, "left");
    });

    // Back after a dropped socket: the call goes on.
    socket.on("call:rejoin", (msg, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const c = calls.get(msg && msg.callId);
      const m = c && c.members.get(uid);
      if (!m) return reply({ ok: false });
      clearTimeout(m.gone); m.gone = null; m.sid = socket.id;
      reply({ ok: true, iceServers: iceServers(), ...view(c) });
      tellState(c);
    });

    // Connection details, phone to phone, only between members of one call.
    socket.on("call:signal", (msg) => {
      const c = calls.get(msg && msg.callId);
      if (!c || !c.members.has(uid) || c.members.get(uid).sid !== socket.id) return;
      const to = c.members.get(Number(msg.to));
      if (!to || !to.sid || msg.data === undefined) return;
      let size = 0;
      try { size = JSON.stringify(msg.data).length; } catch { return; }
      if (size > SIGNAL_MAX) return;
      io.to(to.sid).emit("call:signal", { callId: c.id, from: uid, data: msg.data });
    });

    // Mic and camera on or off, and which of my streams is a shared screen
    // (its id, as the phones see it), so the others can show it.
    socket.on("call:media", (msg) => {
      const c = calls.get(msg && msg.callId);
      if (!c || !c.members.has(uid)) return;
      const screen = typeof msg.screen === "string" && /^[\w{}-]{1,100}$/.test(msg.screen) ? msg.screen : null;
      toMembers(c, "call:media", { callId: c.id, id: uid, mic: !!msg.mic, cam: !!msg.cam, screen }, uid);
    });

    socket.on("disconnect", () => {
      const c = calls.get(inCall.get(uid));
      const m = c && c.members.get(uid);
      if (!m || m.sid !== socket.id) return;
      m.sid = null;
      m.gone = setTimeout(() => leave(c, uid, "dropped"), GRACE_MS);
      tellState(c);
    });
  });
}

module.exports = { attach, MAX, _calls: calls };
