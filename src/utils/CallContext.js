// src/utils/CallContext.js
// Video calls with friends, up to 4 at once. The pictures and the sound go
// phone to phone (WebRTC); the server (config/calls.js) only rings people and
// passes each pair of phones the details they need to find each other.
//
// One connection per friend in the call. In each pair the lower user id makes
// the first offer; the other waits and answers, its camera going in the
// answer. (Letting both offer and having one back off — "perfect
// negotiation" — is still the fallback for later offers, but in Chrome the
// side that backed off sometimes never gathered its addresses again, and the
// call sat on "Connecting…" for good.) The offering side also owns recovery:
// a connection that fails, or hasn't connected in a while, it restarts.
//
// Lives above the router, so a call carries on while you move between pages
// or start a game; the call screen can shrink to a bubble (CallLayer).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useSocket } from "./SocketContext";

const CallContext = createContext(null);

export const CALL_MAX = 4;
const WHY = {
  "not-friends": "You can only call friends.",
  offline: "They're offline right now.",
  busy: "They're on another call.",
  full: "The call is full (4 people).",
  gone: "That call has ended.",
  error: "Couldn't start the call. Try again.",
  bad: "Couldn't start the call.",
};
const ENDED = { declined: "Call declined", "no-answer": "No answer", left: "Call ended", dropped: "Call ended — connection lost", switched: "Call ended" };

// Clear voice first: the browser's echo cancelling, noise removal and level.
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const video = (facing) => ({ facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } });

// ── sound: the ring and the ring-back, made here (no files) ─────────────────
function makeTones() {
  let ac = null, timer = null;
  const ctx = () => {
    try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch { ac = null; }
    return ac;
  };
  const beep = (f1, f2, dur, vol) => {
    const a = ctx(); if (!a) return;
    const t = a.currentTime, g = a.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(a.destination);
    for (const f of [f1, f2]) { const o = a.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur); }
  };
  // a phone only lets a page buzz once you've tapped it
  const buzz = (p) => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch { /* fine */ } };
  const stop = () => { clearInterval(timer); timer = null; buzz(0); };
  return {
    // someone is calling me: a bright double ring, and a buzz
    ring() {
      stop();
      const go = () => { beep(880, 1320, 0.35, 0.12); setTimeout(() => beep(880, 1320, 0.35, 0.12), 450); buzz([400, 200, 400]); };
      go(); timer = setInterval(go, 2400);
    },
    // I'm calling them: a soft ring-back
    back() { stop(); const go = () => beep(440, 480, 1.2, 0.05); go(); timer = setInterval(go, 3000); },
    stop,
    blip(up) { beep(up ? 660 : 520, up ? 990 : 390, 0.18, 0.08); },
  };
}

export function CallProvider({ children }) {
  const { user } = useAuth();
  const { socket } = useSocket() || {};
  const myId = Number(user?.id);

  // call: { id, phase: "outgoing" | "active", members: [{id, name, away}], invited: [ids], names: {id: name}, startedAt }
  const [call, setCall] = useState(null);
  const [ring, setRing] = useState(null);          // someone calling me: { callId, from: {id, name}, members }
  const [local, setLocal] = useState(null);        // my camera + mic
  const [peers, setPeers] = useState({});          // id -> { stream, mic, cam, link: "connecting" | "ok" | "lost" }
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [facing, setFacing] = useState("user");
  const [notice, setNotice] = useState(null);      // a short line after a call: { text, n }
  const [expanded, setExpanded] = useState(true);  // the full call screen, or the bubble

  const callRef = useRef(null); callRef.current = call;
  const localRef = useRef(null); localRef.current = local;
  const micRef = useRef(true); micRef.current = mic;
  const camRef = useRef(true); camRef.current = cam;
  const pcs = useRef(new Map());                   // id -> { pc, polite, makingOffer, ignoreOffer, queue }
  const ice = useRef([]);
  const tones = useRef(null);
  if (!tones.current) tones.current = makeTones();

  const say = useCallback((text) => setNotice({ text, n: Date.now() }), []);
  const patchPeer = useCallback((id, p) => setPeers((all) => ({ ...all, [id]: { mic: true, cam: true, link: "connecting", ...all[id], ...p } })), []);

  // ── my camera and mic ──────────────────────────────────────────────────────
  const getMedia = useCallback(async () => {
    if (localRef.current) return localRef.current;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Calls need a newer browser.");
    let s;
    try { s = await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: video("user") }); }
    catch (e) {
      // no camera, or it was refused: a voice call is still a call
      try { s = await navigator.mediaDevices.getUserMedia({ audio: AUDIO }); }
      catch { throw new Error(e && e.name === "NotAllowedError" ? "Allow the microphone (and camera) to call." : "Couldn't open the microphone."); }
    }
    localRef.current = s;
    setLocal(s); setMic(true); setCam(s.getVideoTracks().length > 0); setFacing("user");
    return s;
  }, []);
  const stopMedia = useCallback(() => {
    const s = localRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    localRef.current = null; setLocal(null);
  }, []);

  // ── one connection per friend ──────────────────────────────────────────────
  const send = useCallback((to, data) => {
    const c = callRef.current;
    if (socket && c) socket.emit("call:signal", { callId: c.id, to, data });
  }, [socket]);

  const tune = useCallback((pc) => {
    // a clear picture for two, a lighter one each when there are more of you
    const n = Math.max(1, pcs.current.size);
    for (const s of pc.getSenders()) {
      if (!s.track) continue;
      try {
        const p = s.getParameters();
        if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = s.track.kind === "video" ? (n === 1 ? 1500000 : n === 2 ? 900000 : 600000) : 64000;
        s.setParameters(p).catch(() => {});
      } catch { /* not every browser lets us */ }
    }
  }, []);

  const closePeer = useCallback((id) => {
    const P = pcs.current.get(id);
    if (P) { clearInterval(P.watch); try { P.pc.close(); } catch { /* gone */ } pcs.current.delete(id); }
    setPeers((all) => { const n = { ...all }; delete n[id]; return n; });
  }, []);

  const peer = useCallback((id) => {
    let P = pcs.current.get(id);
    if (P) return P;
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    P = { pc, polite: myId > id, makingOffer: false, ignoreOffer: false, queue: [], video: null };
    pcs.current.set(id, P);
    const s = localRef.current;
    if (s) s.getTracks().forEach((t) => { const snd = pc.addTrack(t, s); if (t.kind === "video") P.video = snd; });
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      patchPeer(id, { stream });
    };
    pc.onicecandidate = (e) => { if (e.candidate) send(id, { candidate: e.candidate }); };
    pc.onnegotiationneeded = async () => {
      if (P.polite && !pc.remoteDescription) return;     // the other side opens
      try {
        P.makingOffer = true;
        await pc.setLocalDescription();
        send(id, { description: pc.localDescription });
      } catch { /* the next negotiation will do */ } finally { P.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") { patchPeer(id, { link: "ok" }); tune(pc); }
      else if (st === "disconnected") patchPeer(id, { link: "lost" });
      else if (st === "failed") { patchPeer(id, { link: "lost" }); if (!P.polite) try { pc.restartIce(); } catch { /* old browser */ } }
    };
    // not through yet: try again (the offering side), and keep trying
    P.watch = setInterval(() => {
      if (pc.connectionState === "connected" || pc.connectionState === "closed") return;
      if (!P.polite) try { pc.restartIce(); } catch { /* old browser */ }
    }, 12000);
    patchPeer(id, {});
    return P;
  }, [myId, send, patchPeer, tune]);

  const onSignal = useCallback(async ({ callId, from, data }) => {
    if (!callRef.current || callRef.current.id !== callId || !data) return;
    const P = peer(Number(from)), pc = P.pc;
    try {
      if (data.description) {
        const collide = data.description.type === "offer" && (P.makingOffer || pc.signalingState !== "stable");
        P.ignoreOffer = !P.polite && collide;
        if (P.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        for (const c of P.queue.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (data.description.type === "offer") {
          await pc.setLocalDescription();
          send(Number(from), { description: pc.localDescription });
        }
      } else if (data.candidate) {
        if (!pc.remoteDescription) P.queue.push(data.candidate);
        else await pc.addIceCandidate(data.candidate).catch(() => {});
      }
    } catch { /* a stale message from a negotiation that was replaced */ }
  }, [peer, send]);

  // ── the whole call ─────────────────────────────────────────────────────────
  const finish = useCallback((reason) => {
    tones.current.stop();
    for (const id of [...pcs.current.keys()]) closePeer(id);
    stopMedia();
    if (callRef.current && reason) say(ENDED[reason] || "Call ended");
    callRef.current = null;
    setCall(null); setPeers({}); setExpanded(true);
  }, [closePeer, stopMedia, say]);

  // members changed: connect to newcomers, let go of whoever left
  const apply = useCallback((st) => {
    const c = callRef.current;
    if (!c || c.id !== st.callId) return;
    const others = st.members.filter((m) => m.id !== myId);
    for (const m of others) peer(m.id);
    for (const id of [...pcs.current.keys()]) if (!others.some((m) => m.id === id)) closePeer(id);
    const names = { ...c.names };
    for (const m of st.members) names[m.id] = m.name;
    const active = others.length > 0;
    if (active && c.phase !== "active") tones.current.stop();
    setCall({ ...c, phase: active ? "active" : "outgoing", members: st.members, invited: st.invited, names,
      startedAt: active ? c.startedAt || Date.now() : null });
  }, [myId, peer, closePeer]);

  const startCall = useCallback(async (friend) => {
    if (!socket) return say("Not connected — try again in a moment.");
    const c = callRef.current;
    if (c && (c.members.length + c.invited.length) >= CALL_MAX) return say(WHY.full);
    try { await getMedia(); } catch (e) { return say(e.message); }
    if (!c) {
      const draft = { id: null, phase: "outgoing", members: [{ id: myId, name: user?.username }], invited: [Number(friend.id)],
        names: { [friend.id]: friend.username }, startedAt: null, first: { id: Number(friend.id), name: friend.username, avatar: friend.avatar } };
      callRef.current = draft; setCall(draft); setExpanded(true);
      tones.current.back();
    }
    socket.emit("call:start", { to: Number(friend.id) }, (r) => {
      if (!r || !r.ok) {
        say(WHY[r && r.why] || WHY.error);
        if (!c) finish(null);
        return;
      }
      ice.current = r.iceServers || ice.current;
      // the call (new, or the one I'm in), and the name to show while it rings
      const base = callRef.current;
      if (!base) return;
      const cur = { ...base, id: base.id || r.callId, names: { ...base.names, [friend.id]: friend.username } };
      callRef.current = cur; setCall(cur);
    });
  }, [socket, myId, user, getMedia, say, finish]);

  const accept = useCallback(async () => {
    const r0 = ring;
    if (!r0 || !socket) return;
    tones.current.stop();
    setRing(null);
    if (callRef.current && callRef.current.id !== r0.callId) finish(null);      // switching calls
    try { await getMedia(); } catch (e) { socket.emit("call:decline", { callId: r0.callId }); return say(e.message); }
    socket.emit("call:accept", { callId: r0.callId }, (r) => {
      if (!r || !r.ok) { stopMedia(); return say(WHY[r && r.why] || WHY.gone); }
      ice.current = r.iceServers || [];
      const draft = { id: r0.callId, phase: "outgoing", members: [], invited: [], names: {}, startedAt: null, first: { id: r0.from.id, name: r0.from.name } };
      callRef.current = draft; setCall(draft); setExpanded(true);
      apply(r);
    });
  }, [ring, socket, getMedia, stopMedia, say, finish, apply]);

  const decline = useCallback(() => {
    if (!ring || !socket) return;
    tones.current.stop();
    socket.emit("call:decline", { callId: ring.callId });
    setRing(null);
  }, [ring, socket]);

  const hangUp = useCallback(() => {
    const c = callRef.current;
    if (socket && c && c.id) socket.emit("call:leave", { callId: c.id });
    finish(c && c.phase === "active" ? "left" : null);
  }, [socket, finish]);

  // ── mic, camera, which camera ──────────────────────────────────────────────
  const tellMedia = useCallback((m, k) => {
    const c = callRef.current;
    if (socket && c && c.id) socket.emit("call:media", { callId: c.id, mic: m, cam: k });
  }, [socket]);
  const toggleMic = useCallback(() => {
    const s = localRef.current; if (!s) return;
    const on = !micRef.current;
    s.getAudioTracks().forEach((t) => { t.enabled = on; });
    setMic(on); tellMedia(on, camRef.current); tones.current.blip(on);
  }, [tellMedia]);
  const toggleCam = useCallback(() => {
    const s = localRef.current; if (!s || !s.getVideoTracks().length) return;
    const on = !camRef.current;
    s.getVideoTracks().forEach((t) => { t.enabled = on; });
    setCam(on); tellMedia(micRef.current, on);
  }, [tellMedia]);
  const flip = useCallback(async () => {
    const s = localRef.current; if (!s || !s.getVideoTracks().length) return;
    const next = facing === "user" ? "environment" : "user";
    try {
      const old = s.getVideoTracks()[0];
      old.stop();                                     // many phones can't open both cameras at once
      const fresh = (await navigator.mediaDevices.getUserMedia({ video: video(next) })).getVideoTracks()[0];
      fresh.enabled = camRef.current;
      s.removeTrack(old); s.addTrack(fresh);
      for (const P of pcs.current.values()) if (P.video) await P.video.replaceTrack(fresh).catch(() => {});
      const copy = new MediaStream(s.getTracks());
      localRef.current = copy; setLocal(copy);
      setFacing(next);
    } catch { say("Couldn't switch camera."); }
  }, [facing, say]);

  // ── the room's messages ────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return undefined;
    const onRing = (r) => {
      setRing(r);
      if (!callRef.current) tones.current.ring();
      else tones.current.blip(true);
    };
    const onRingStop = ({ callId }) => setRing((r) => { if (r && r.callId === callId) { tones.current.stop(); return null; } return r; });
    const onState = (st) => apply(st);
    const onEnded = ({ callId, reason }) => { if (callRef.current && callRef.current.id === callId) finish(reason); };
    const onLeft = ({ callId, id }) => {
      const c = callRef.current;
      if (c && c.id === callId) { closePeer(id); if (c.members.length > 2) say(`${c.names[id] || "Someone"} left the call`); }
    };
    const onDeclined = ({ callId, id }) => { const c = callRef.current; if (c && c.id === callId && c.members.length > 1) say(`${c.names[id] || "They"} can't join right now`); };
    const onMissed = ({ callId, id }) => { const c = callRef.current; if (c && c.id === callId && c.members.length > 1) say(`${c.names[id] || "They"} didn't answer`); };
    const onMedia = ({ callId, id, mic: m, cam: k }) => { if (callRef.current && callRef.current.id === callId) patchPeer(id, { mic: m, cam: k }); };
    // the socket came back: pick the call up where it was
    const onConnect = () => {
      const c = callRef.current;
      if (!c || !c.id) return;
      socket.emit("call:rejoin", { callId: c.id }, (r) => { if (!r || !r.ok) finish("dropped"); else apply(r); });
    };
    socket.on("call:ring", onRing); socket.on("call:ring-stop", onRingStop); socket.on("call:state", onState);
    socket.on("call:ended", onEnded); socket.on("call:left", onLeft); socket.on("call:declined", onDeclined);
    socket.on("call:missed", onMissed); socket.on("call:media", onMedia); socket.on("call:signal", onSignal);
    socket.on("connect", onConnect);
    return () => {
      socket.off("call:ring", onRing); socket.off("call:ring-stop", onRingStop); socket.off("call:state", onState);
      socket.off("call:ended", onEnded); socket.off("call:left", onLeft); socket.off("call:declined", onDeclined);
      socket.off("call:missed", onMissed); socket.off("call:media", onMedia); socket.off("call:signal", onSignal);
      socket.off("connect", onConnect);
    };
  }, [socket, apply, finish, closePeer, patchPeer, onSignal, say]);

  // logged out, or the socket is gone for good: no call
  useEffect(() => { if (!user) { setRing(null); finish(null); } }, [user, finish]);
  useEffect(() => () => { tones.current.stop(); stopMedia(); }, [stopMedia]);

  const value = useMemo(() => ({
    call, ring, local, peers, mic, cam, facing, notice, expanded, myId,
    startCall, accept, decline, hangUp, toggleMic, toggleCam, flip, setExpanded, clearNotice: () => setNotice(null),
  }), [call, ring, local, peers, mic, cam, facing, notice, expanded, myId, startCall, accept, decline, hangUp, toggleMic, toggleCam, flip]);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

const NONE = { call: null, ring: null, peers: {}, startCall() {}, notice: null };
export function useCall() {
  return useContext(CallContext) || NONE;
}
