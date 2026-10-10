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
//
// Sharing a screen (from a computer — phone browsers can't capture theirs)
// adds its picture and sound as a second stream on every connection; the
// others are told its stream id (call:media), so they know which picture is
// the screen and which is the camera. Tuned for films: smooth motion over
// sharp detail, a higher bitrate, and stereo sound.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useSocket } from "./SocketContext";
import { reportError } from "./reportError";

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
// a screen: full HD, smooth, and its sound left alone (no echo or noise
// cancelling — that would eat the music)
const SCREEN = {
  video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 60 } },
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000 },
  systemAudio: "include", selfBrowserSurface: "exclude", surfaceSwitching: "include",
};
// Whether this browser lets a page share the screen. Computers do; on phones
// it depends on the browser (iPhone browsers don't let a website, only an
// installed app) — so the button shows everywhere and says so if it can't.
export const canShareScreen = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
const STUCK_MS = 20000, RETRY_MS = 15000;
// Ask the other side to send stereo, at film quality. A browser sends stereo
// Opus only when the far side's description says it wants it, so this is
// done to each description as it arrives.
function stereo(desc) {
  if (!desc || !desc.sdp) return desc;
  const m = desc.sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!m) return desc;
  const re = new RegExp(`a=fmtp:${m[1]} ([^\r\n]*)`);
  const sdp = desc.sdp.replace(re, (line, params) => (/stereo=1/.test(params) ? line : `a=fmtp:${m[1]} ${params};stereo=1;sprop-stereo=1;maxaveragebitrate=128000`));
  return { type: desc.type, sdp };
}

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

// A screen onto one connection. The first time it gets a picture slot and a
// sound slot of its own; stopping empties them (CallProvider stopShare), and
// sharing again fills the same two. Adding fresh ones each time made every
// offer bigger — a second share's no longer fit the server's limit, and
// never arrived.
function shareInto(P, scr) {
  if (!P.screenTx) P.screenTx = [];
  for (const t of scr.getTracks()) {
    // an empty slot of the same kind from last time (the browser must be
    // able to re-label it with the new screen's stream — not every one can)
    const tx = P.screenTx.find((x) => x.sender.track === null && x.receiver.track.kind === t.kind);
    if (tx && tx.sender.setStreams) {
      try {
        tx.sender.replaceTrack(t);
        tx.sender.setStreams(scr);
        tx.direction = "sendrecv";
        continue;
      } catch { /* a fresh slot, then */ }
    }
    try {
      const snd = P.pc.addTrack(t, scr);
      const fresh = P.pc.getTransceivers().find((x) => x.sender === snd);
      if (fresh) P.screenTx.push(fresh);
    } catch { /* closed */ }
  }
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
  const [screen, setScreen] = useState(null);      // the screen I'm sharing
  const [onHold, setOnHold] = useState(false);     // my side's on hold (a phone call)
  const holdRef = useRef(false);
  const [shareHelp, setShareHelp] = useState(false); // "why can't I share from my phone" card
  // the call's chat: kept here for the call only, never saved anywhere
  const [chat, setChat] = useState([]);            // [{ key, from, name, text, at, mine }]
  const [unread, setUnread] = useState(0);
  const [chatOpen, setChatOpenState] = useState(false);
  const chatOpenRef = useRef(false);
  const setChatOpen = useCallback((v) => { chatOpenRef.current = v; setChatOpenState(v); if (v) setUnread(0); }, []);

  const callRef = useRef(null); callRef.current = call;
  const localRef = useRef(null); localRef.current = local;
  const micRef = useRef(true); micRef.current = mic;
  const camRef = useRef(true); camRef.current = cam;
  const screenRef = useRef(null); screenRef.current = screen;
  const pcs = useRef(new Map());                   // id -> { pc, polite, makingOffer, ignoreOffer, queue }
  const streams = useRef(new Map());               // id -> { all: Map<streamId, stream>, screenId }
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
        const isScreen = !!screenRef.current && screenRef.current.getTracks().includes(s.track);
        if (isScreen && s.track.kind === "video") {
          // a film: keep it moving, and give it most of the room. Every
          // friend gets their own copy, encoded separately, so with more
          // watching each copy is smaller — or the sharer's computer can't
          // keep up (1080p for one, ~900p for two, ~720p for three)
          p.encodings[0].maxBitrate = n === 1 ? 4000000 : n === 2 ? 2500000 : 1800000;
          p.encodings[0].scaleResolutionDownBy = n === 1 ? 1 : n === 2 ? 1.2 : 1.5;
          p.encodings[0].maxFramerate = 30;
          p.degradationPreference = "maintain-framerate";
        } else if (isScreen) p.encodings[0].maxBitrate = 128000;
        else p.encodings[0].maxBitrate = s.track.kind === "video" ? (n === 1 ? 1500000 : n === 2 ? 900000 : 600000) : 64000;
        s.setParameters(p).catch(() => {});
      } catch { /* not every browser lets us */ }
    }
  }, []);

  const closePeer = useCallback((id) => {
    const P = pcs.current.get(id);
    if (P) { clearInterval(P.watch); try { P.pc.close(); } catch { /* gone */ } pcs.current.delete(id); }
    streams.current.delete(id);
    setPeers((all) => { const n = { ...all }; delete n[id]; return n; });
  }, []);

  // which of a friend's pictures is their camera, and which their screen
  const place = useCallback((id) => {
    const S = streams.current.get(id);
    if (!S) return;
    let stream = null, scr = null;
    for (const [sid, st] of S.all) { if (sid === S.screenId) scr = st; else if (!stream) stream = st; }
    patchPeer(id, { stream, screen: scr });
  }, [patchPeer]);

  const peer = useCallback((id) => {
    let P = pcs.current.get(id);
    if (P) return P;
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    P = { pc, polite: myId > id, makingOffer: false, ignoreOffer: false, queue: [], video: null };
    pcs.current.set(id, P);
    const s = localRef.current;
    if (s) s.getTracks().forEach((t) => { const snd = pc.addTrack(t, s); if (t.kind === "video") P.video = snd; else P.audio = snd; });
    const scr = screenRef.current;                    // sharing already: they see it too
    if (scr) shareInto(P, scr);
    if (!streams.current.has(id)) streams.current.set(id, { all: new Map(), screenId: null });
    // Their pictures and sound, gathered into streams of our own, by the
    // stream id they were sent under. Not the browser's own stream objects:
    // when a screen's slot is reused, Chrome moves the track out of the
    // stream it handed us, and the shared screen went blank.
    pc.ontrack = (e) => {
      const S = streams.current.get(id);
      if (!S) return;
      const ids = e.streams.length ? e.streams.map((x) => x.id) : [`t${e.track.id}`];
      for (const sid of ids) {
        let own = S.all.get(sid);
        if (!own) { own = new MediaStream(); S.all.set(sid, own); }
        if (!own.getTracks().includes(e.track)) own.addTrack(e.track);
      }
      place(id);
    };
    P.since = Date.now(); P.found = {}; P.heard = 0;
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      P.found[e.candidate.type || "?"] = (P.found[e.candidate.type || "?"] || 0) + 1;   // host / srflx / relay: which routes we have
      send(id, { candidate: e.candidate });
    };
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
      if (st === "connected") {
        patchPeer(id, { link: "ok" }); tune(pc);
        // a newcomer needs telling what's what: mic, camera, and which stream is my screen
        const c = callRef.current;
        if (socket && c && c.id) socket.emit("call:media", { callId: c.id, mic: micRef.current, cam: camRef.current, screen: screenRef.current ? screenRef.current.id : null, hold: holdRef.current });
      }
      else if (st === "disconnected") patchPeer(id, { link: "lost" });
      else if (st === "failed") { patchPeer(id, { link: "lost" }); if (!P.polite) try { pc.restartIce(); } catch { /* old browser */ } }
    };
    // not through yet: try again (the offering side), and keep trying. Still
    // not through after a while: say so, and tell the server's log which
    // routes each side had — "no relay" means the TURN relay is missing.
    // (A restart only after RETRY_MS without getting through: a slow
    // network can take a while, and restarting it every few seconds would
    // stop it ever finishing.)
    P.kicked = P.since;
    P.watch = setInterval(() => {
      if (pc.connectionState === "connected" || pc.connectionState === "closed") { P.kicked = Date.now(); return; }
      if (!P.polite && Date.now() - P.kicked > RETRY_MS) { P.kicked = Date.now(); try { pc.restartIce(); } catch { /* old browser */ } }
      if (!P.told && Date.now() - P.since > STUCK_MS) {
        P.told = true;
        patchPeer(id, { link: "blocked" });
        const relay = ice.current.some((x) => [].concat(x.urls || []).some((u) => /^turns?:/.test(u)));
        reportError("call", `call not connecting after ${Math.round((Date.now() - P.since) / 1000)}s: `
          + `ice ${pc.iceConnectionState}, conn ${pc.connectionState}, signal ${pc.signalingState}, `
          + `my routes ${JSON.stringify(P.found)}, their routes heard ${P.heard}, relay ${relay ? "configured" : "MISSING"}, `
          + `${navigator.userAgent.slice(0, 120)}`);
      }
    }, 3000);
    patchPeer(id, {});
    return P;
  }, [myId, socket, send, patchPeer, tune, place]);

  const onSignal = useCallback(async ({ callId, from, data }) => {
    if (!callRef.current || callRef.current.id !== callId || !data) return;
    const P = peer(Number(from)), pc = P.pc;
    try {
      if (data.description) {
        const collide = data.description.type === "offer" && (P.makingOffer || pc.signalingState !== "stable");
        P.ignoreOffer = !P.polite && collide;
        if (P.ignoreOffer) return;
        await pc.setRemoteDescription(stereo(data.description));
        for (const c of P.queue.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (data.description.type === "offer") {
          await pc.setLocalDescription();
          send(Number(from), { description: pc.localDescription });
        }
        if (pc.signalingState === "stable" && pc.connectionState === "connected") tune(pc);
      } else if (data.candidate) {
        P.heard++;
        if (!pc.remoteDescription) P.queue.push(data.candidate);
        else await pc.addIceCandidate(data.candidate).catch(() => {});
      }
    } catch { /* a stale message from a negotiation that was replaced */ }
  }, [peer, send, tune]);

  // ── the whole call ─────────────────────────────────────────────────────────
  const finish = useCallback((reason) => {
    tones.current.stop();
    for (const id of [...pcs.current.keys()]) closePeer(id);
    stopMedia();
    if (screenRef.current) { screenRef.current.getTracks().forEach((t) => t.stop()); screenRef.current = null; setScreen(null); }
    if (callRef.current && reason) say(ENDED[reason] || "Call ended");
    callRef.current = null;
    setCall(null); setPeers({}); setExpanded(true);
    setChat([]); setUnread(0); chatOpenRef.current = false; setChatOpenState(false);
    holdRef.current = false; setOnHold(false);
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
    if (socket && c && c.id) socket.emit("call:media", { callId: c.id, mic: m, cam: k, screen: screenRef.current ? screenRef.current.id : null, hold: holdRef.current });
  }, [socket]);

  // ── on hold: a phone call came in ──────────────────────────────────────────
  // The phone takes the mic (and often the camera) for its own call, and may
  // pause the page. The others are told "on hold" rather than seeing the
  // call drop; coming back, any camera or mic the phone stopped is opened
  // again and put back into every connection.
  const setHold = useCallback((h) => {
    if (holdRef.current === h || !callRef.current) return;
    holdRef.current = h;
    setOnHold(h);
    tellMedia(micRef.current, camRef.current);
  }, [tellMedia]);
  const revive = useCallback(async () => {
    const s = localRef.current;
    if (!s || !callRef.current) return;
    const dead = s.getTracks().filter((t) => t.readyState === "ended");
    if (!dead.length) return;
    try {
      const want = { audio: dead.some((t) => t.kind === "audio") ? AUDIO : false, video: dead.some((t) => t.kind === "video") ? video(facing) : false };
      const fresh = await navigator.mediaDevices.getUserMedia(want);
      for (const t of fresh.getTracks()) {
        const old = dead.find((d) => d.kind === t.kind);
        if (!old) { t.stop(); continue; }
        t.enabled = t.kind === "audio" ? micRef.current : camRef.current;
        s.removeTrack(old); s.addTrack(t);
        for (const P of pcs.current.values()) { const snd = t.kind === "video" ? P.video : P.audio; if (snd) await snd.replaceTrack(t).catch(() => {}); }
      }
      const copy = new MediaStream(s.getTracks());
      localRef.current = copy; setLocal(copy);
    } catch { say("Couldn't get the camera or mic back — tap 🎤 or 📹"); }
  }, [facing, say]);
  useEffect(() => {
    if (!call || !local) return undefined;
    const mic0 = local.getAudioTracks()[0];
    const coarse = window.matchMedia && window.matchMedia("(pointer:coarse)").matches;
    const check = () => {
      const taken = !!mic0 && (mic0.muted || mic0.readyState === "ended");
      const away = coarse && document.visibilityState === "hidden";
      if (taken || away) { setHold(true); return; }
      if (holdRef.current) { setHold(false); revive(); say("Back from hold"); }
    };
    // back in front: get any stopped camera or mic back, then look again at once
    const onVis = () => { check(); if (document.visibilityState === "visible") revive().then(check); };
    if (mic0) { mic0.addEventListener("mute", check); mic0.addEventListener("unmute", check); mic0.addEventListener("ended", check); }
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(check, 2000);                 // some phones don't fire the events
    check();                                            // a new mic (just revived): straight away
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      if (mic0) { mic0.removeEventListener("mute", check); mic0.removeEventListener("unmute", check); mic0.removeEventListener("ended", check); }
    };
  }, [call, local, setHold, revive, say]);

  // ── chat ───────────────────────────────────────────────────────────────────
  const sendChat = useCallback((text) => {
    const c = callRef.current, t = String(text || "").trim().slice(0, 500);
    if (!socket || !c || !c.id || !t) return;
    const key = `${myId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setChat((all) => [...all, { key, from: myId, name: "You", text: t, at: Date.now(), mine: true }].slice(-200));
    socket.emit("call:chat", { callId: c.id, text: t, key });
  }, [socket, myId]);

  // ── sharing my screen ──────────────────────────────────────────────────────
  const stopShare = useCallback(() => {
    const scr = screenRef.current;
    if (!scr) return;
    // empty the screen's slots but keep them, to fill again next time
    for (const P of pcs.current.values()) {
      for (const tx of P.screenTx || []) {
        try { tx.sender.replaceTrack(null); tx.direction = "recvonly"; } catch { /* closed */ }
      }
    }
    scr.getTracks().forEach((t) => t.stop());
    screenRef.current = null; setScreen(null);
    tellMedia(micRef.current, camRef.current);
  }, [tellMedia]);
  const share = useCallback(async () => {
    if (screenRef.current) return stopShare();
    if (!canShareScreen()) {
      // phone browsers (Chrome on Android, Safari on iPhone) don't let any
      // website capture the screen — only installed apps can. Say so
      // properly (CallLayer's card), not in a line that gets cut off.
      setShareHelp(true);
      return undefined;
    }
    let scr;
    try { scr = await navigator.mediaDevices.getDisplayMedia(SCREEN); }
    catch (e) {
      if (e && e.name === "NotAllowedError") return undefined;          // they changed their mind
      try { scr = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); }   // a phone may refuse our film settings
      catch (e2) { if (!e2 || e2.name !== "NotAllowedError") say("Couldn't share the screen on this device"); return undefined; }
    }
    const v = scr.getVideoTracks()[0], a = scr.getAudioTracks()[0];
    if (v) { try { v.contentHint = "motion"; } catch { /* fine */ } v.addEventListener("ended", () => stopShare()); }
    if (a) { try { a.contentHint = "music"; } catch { /* fine */ } }
    screenRef.current = scr; setScreen(scr);
    for (const P of pcs.current.values()) shareInto(P, scr);
    tellMedia(micRef.current, camRef.current);
    say(a ? "Sharing your screen and its sound" : "Sharing without sound — for sound, share a tab and tick “Share tab audio”");
    return undefined;
  }, [stopShare, tellMedia, say]);
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
    const onMedia = ({ callId, id, mic: m, cam: k, screen: sid, hold }) => {
      if (!callRef.current || callRef.current.id !== callId) return;
      const S = streams.current.get(id);
      if (S) {
        if (S.screenId && S.screenId !== sid) S.all.delete(S.screenId);     // they stopped sharing
        S.screenId = sid || null;
      }
      patchPeer(id, { mic: m, cam: k, hold: !!hold });
      place(id);
    };
    // the socket came back: pick the call up where it was
    const onConnect = () => {
      const c = callRef.current;
      if (!c || !c.id) return;
      socket.emit("call:rejoin", { callId: c.id }, (r) => { if (!r || !r.ok) finish("dropped"); else apply(r); });
    };
    socket.on("call:ring", onRing); socket.on("call:ring-stop", onRingStop); socket.on("call:state", onState);
    socket.on("call:ended", onEnded); socket.on("call:left", onLeft); socket.on("call:declined", onDeclined);
    socket.on("call:missed", onMissed); socket.on("call:media", onMedia); socket.on("call:signal", onSignal);
    const onChat = ({ callId, id, name: who, text, at, key }) => {
      if (!callRef.current || callRef.current.id !== callId) return;
      setChat((all) => (all.some((m) => m.key === key) ? all : [...all, { key, from: id, name: who, text, at, mine: false }].slice(-200)));
      if (!chatOpenRef.current) setUnread((n) => n + 1);
      tones.current.blip(true);
    };
    socket.on("call:chat", onChat);
    socket.on("connect", onConnect);
    return () => {
      socket.off("call:chat", onChat);
      socket.off("call:ring", onRing); socket.off("call:ring-stop", onRingStop); socket.off("call:state", onState);
      socket.off("call:ended", onEnded); socket.off("call:left", onLeft); socket.off("call:declined", onDeclined);
      socket.off("call:missed", onMissed); socket.off("call:media", onMedia); socket.off("call:signal", onSignal);
      socket.off("connect", onConnect);
    };
  }, [socket, apply, finish, closePeer, patchPeer, onSignal, say, place]);

  // logged out, or the socket is gone for good: no call
  useEffect(() => { if (!user) { setRing(null); finish(null); } }, [user, finish]);
  useEffect(() => () => { tones.current.stop(); stopMedia(); }, [stopMedia]);

  const value = useMemo(() => ({
    call, ring, local, peers, mic, cam, facing, notice, expanded, myId, screen, chat, unread, chatOpen, shareHelp, setShareHelp, onHold,
    startCall, accept, decline, hangUp, toggleMic, toggleCam, flip, share, setExpanded, sendChat, setChatOpen, clearNotice: () => setNotice(null),
  }), [call, ring, local, peers, mic, cam, facing, notice, expanded, myId, screen, chat, unread, chatOpen, shareHelp, onHold,
    startCall, accept, decline, hangUp, toggleMic, toggleCam, flip, share, sendChat, setChatOpen]);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

const NONE = { call: null, ring: null, peers: {}, startCall() {}, notice: null };
export function useCall() {
  return useContext(CallContext) || NONE;
}
