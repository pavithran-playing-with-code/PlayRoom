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
import { deviceId } from "./deviceId";
import { cleanMic } from "./cleanMic";
import { howlGuard } from "./howlGuard";
import { useDrawnSideways } from "../components/LandscapeGate";
import { openFilm, soundMissing, dolbyLike, warmDecoder } from "./filmSound";

const CallContext = createContext(null);

export const CALL_MAX = 4;
const WHY = {
  "not-friends": "You can only call friends.",
  offline: "They're offline right now.",
  busy: "They're on another call.",
  full: "The call is full (4 people).",
  gone: "That call has ended.",
  error: "Couldn't start the call. Try again.",
  elsewhere: "You're in a call on your other device — tap “Move here” to take it.",
  bad: "Couldn't start the call.",
};
const ENDED = { declined: "Call declined", "no-answer": "No answer", left: "Call ended", dropped: "Call ended — connection lost", switched: "Call ended" };

// Clear voice first: the browser's echo cancelling, noise removal and level,
// and one channel (a voice needs no more). (Not "voice isolation": where a
// laptop's driver can't do it, the mic could come out silent.)
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };

// How loud a microphone track is, over `ms`: the biggest sample, 0..1. A mic
// that's connected always hears something — a room is never digital zero —
// so 0 means it sends nothing at all. null: couldn't tell (sound locked).
const MIC_SILENT = 1e-5;
async function peakOf(track, ms) {
  let ac;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state !== "running") await ac.resume().catch(() => {});
    if (ac.state !== "running") return null;
    const an = ac.createAnalyser();
    an.fftSize = 2048;
    ac.createMediaStreamSource(new MediaStream([track])).connect(an);
    const buf = new Float32Array(an.fftSize);
    let peak = 0;
    for (const end = Date.now() + ms; Date.now() < end;) {
      await new Promise((r) => setTimeout(r, 100));
      an.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > peak) peak = v; }
    }
    return peak;
  } catch { return null; } finally { if (ac) ac.close().catch(() => {}); }
}
// a computer's mic, cleaned of the steady tones laptops put into it (cleanMic.js)
const micId = (t) => { const r = (t && t.__raw) || t; return r && r.getSettings ? r.getSettings().deviceId : null; };

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
// a lost link waits this long to come back by itself before a new route is
// sought; two restarts are never closer than KICK_GAP_MS
const LOST_WAIT_MS = 2500, KICK_GAP_MS = 4000;
// a weak link: they lose over 5% of what I send, or there's under 300 kbps
// of upload to them; it counts as better after 15 s without either
const WEAK_LOSS = 0.05, WEAK_UP = 300000, WEAK_HOLD_MS = 15000;
// Ask the other side to send stereo, at film quality. A browser sends stereo
// Opus only when the far side's description says it wants it, so this is
// done to each description as it arrives.
function stereo(desc) {
  if (!desc || !desc.sdp) return desc;
  const m = desc.sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!m) return desc;
  const re = new RegExp(`a=fmtp:${m[1]} ([^\r\n]*)`);
  // (every sound slot: the voice, and a shared screen's — and in-band error
  // correction, so a lost packet is patched rather than crackling)
  const all = new RegExp(re.source, "g");
  const sdp = desc.sdp.replace(all, (line, params) => (/stereo=1/.test(params) ? line
    : `a=fmtp:${m[1]} ${params}${/useinbandfec/.test(params) ? "" : ";useinbandfec=1"};stereo=1;sprop-stereo=1;maxaveragebitrate=128000`));
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
// A film's picture goes as H.264 where this phone can make it: phones have a
// chip for it, so a 1080p film stays 1080p. In VP8 (the default) the phone
// encodes in software, can't keep up, and the browser shrinks the picture —
// the soft, blurry film friends saw. Only a phone that lists H.264 (it has the
// chip) asks for it; the others keep the default.
function preferH264(tx) {
  try {
    if (!tx.setCodecPreferences || !window.RTCRtpReceiver?.getCapabilities || !window.RTCRtpSender?.getCapabilities) return;
    const sends = (RTCRtpSender.getCapabilities("video")?.codecs || []).some((c) => /h264/i.test(c.mimeType));
    const all = RTCRtpReceiver.getCapabilities("video")?.codecs || [];
    if (!sends || !all.some((c) => /h264/i.test(c.mimeType))) return;
    const h = all.filter((c) => /h264/i.test(c.mimeType));
    // the high-quality profiles first (profile-level-id 64… high, 4d… main)
    const rank = (c) => (/profile-level-id=64/i.test(c.sdpFmtpLine || "") ? 0 : /profile-level-id=4d/i.test(c.sdpFmtpLine || "") ? 1 : 2);
    h.sort((a, b) => rank(a) - rank(b));
    tx.setCodecPreferences([...h, ...all.filter((c) => !/h264/i.test(c.mimeType))]);
  } catch { /* the default, then */ }
}

// A subtitle line drawn over a film's picture: white, an outline, the bottom
function drawSub(g, text, w, h) {
  if (!text) return;
  const size = Math.max(14, Math.round(h * 0.055)), lines = text.split("\n").slice(-3);
  g.font = `700 ${size}px system-ui, -apple-system, Roboto, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "bottom"; g.lineJoin = "round";
  g.lineWidth = Math.max(3, size / 5); g.strokeStyle = "rgba(0,0,0,.9)"; g.fillStyle = "#fff";
  lines.forEach((l, i) => {
    const y = h - size * 0.7 - (lines.length - 1 - i) * size * 1.2;
    g.strokeText(l, w / 2, y, w * 0.94); g.fillText(l, w / 2, y, w * 0.94);
  });
}
// the cue at time t (cues sorted by start)
function cueAt(cues, t) {
  if (!cues) return "";
  let lo = 0, hi = cues.length - 1, at = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (cues[m].a <= t) { at = m; lo = m + 1; } else hi = m - 1; }
  const out = [];
  for (let i = at; i >= 0 && i > at - 4; i--) if (cues[i].a <= t && t < cues[i].b) out.unshift(cues[i].text);
  return out.join("\n");
}

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
      if (fresh) { if (t.kind === "video") preferH264(fresh); P.screenTx.push(fresh); }
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
  // A video of mine playing to the call: it plays here and goes to everyone
  // as my shared screen (picture and sound), so they need nothing.
  const [film, setFilm] = useState(null);          // { name, v } | null
  const filmRef = useRef(null);                    // { v, url, name, stop, sound? }
  const [filmWait, setFilmWait] = useState(false); // the film held a moment for its decoded sound
  // how loud my film is here (its decoded sound, or the player's own)
  const filmVolume = useCallback((x) => {
    const f = filmRef.current;
    if (!f) return 1;
    if (x === undefined) return f.sound ? f.sound.volume() : f.v.volume;
    if (f.sound) f.sound.setVolume(x); else f.v.volume = Math.max(0, Math.min(1, x));
    return x;
  }, []);
  const [onHold, setOnHold] = useState(false);     // my side's on hold (a phone call)
  const holdRef = useRef(false);
  // My account in a call on another device of mine: { callId, sid, with: [names] }.
  // This one can take it over (moveHere).
  const [elsewhere, setElsewhere] = useState(null);
  // the microphones to choose from, when the one in use sends no sound (or you asked)
  const [mics, setMics] = useState(null);
  // A game drawn sideways on an upright screen: the camera's picture comes
  // out a quarter turned. Everyone (me included) shows it turned back.
  // …or the phone held sideways to watch a shared screen, the screen upright
  // (CallLayer turns the call; held: 90 its top to the left, -90 right)
  const [heldTurn, setHeldTurn] = useState(0);
  const drawnSideways = useDrawnSideways();
  // Which way the picture turns depends on the camera. The back camera sees
  // the way the screen does: turn the phone to the left and the picture's top
  // goes to its right, turned back by -90. The front camera looks out the
  // other side, so left and right are swapped in its picture and the top goes
  // to its left: turned back by +90. (Using -90 for both showed every selfie
  // camera upside down in a sideways game, to you and to your friends.)
  const backTurn = drawnSideways || heldTurn === 90 ? -90 : heldTurn === -90 ? 90 : 0;
  const turn = facing === "user" ? -backTurn : backTurn;
  const turnRef = useRef(turn);
  const [shareHelp, setShareHelp] = useState(false); // "why can't I share from my phone" card
  // the call's chat: kept here for the call only, never saved anywhere
  const [chat, setChat] = useState([]);            // [{ key, from, name, text, at, mine }]
  const [unread, setUnread] = useState(0);
  const [chatOpen, setChatOpenState] = useState(false);
  const chatOpenRef = useRef(false);
  const setChatOpen = useCallback((v) => { chatOpenRef.current = v; setChatOpenState(v); if (v) setUnread(0); }, []);

  // Watching a video together (config/callWatch.js): what's on and where, as
  // the server last said, and my own copy of the file. Kept here, not in the
  // player, so shrinking the call to the bubble doesn't lose it.
  const [watch, setWatchState] = useState(null);    // { src, by, playing, pos, at, rev, ready, now } | null
  const watchRef = useRef(null);
  const [watchFile, setWatchFile] = useState(null); // { url, name, size, dur } — the file I picked
  const watchFileRef = useRef(null); watchFileRef.current = watchFile;
  const clockGap = useRef(0);                       // server clock − mine, ms
  const setWatch = useCallback((w) => {
    if (w && watchRef.current && w.rev < watchRef.current.rev) return;            // stale (every change counts up)
    if (w && !watchRef.current) clockGap.current = w.now - Date.now();          // a first guess, bettered by a ping
    watchRef.current = w; setWatchState(w);
    if (!w) setWatchFile((f) => { if (f) URL.revokeObjectURL(f.url); return null; });
  }, []);

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
    const raw = s.getAudioTracks()[0], clean = await cleanMic(raw);
    if (clean !== raw) { s.removeTrack(raw); s.addTrack(clean); }
    guard(s.getAudioTracks()[0]);
    localRef.current = s;
    setLocal(s); setMic(true); setCam(s.getVideoTracks().length > 0); setFacing("user");
    return s;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- guard is stable (and defined below)
  // Two devices near each other in one call feed back into a whistle: the
  // guard pauses my mic the moment it builds (howlGuard.js). Three in a
  // minute and the mic stays off, with a word on why.
  const guardRef = useRef(null);
  const sayRef = useRef(null); sayRef.current = say;
  const tellMediaRef = useRef(null);       // set once tellMedia exists, below
  const howls = useRef([]);
  const guard = useCallback((t) => {
    if (guardRef.current) guardRef.current();
    guardRef.current = t ? howlGuard(t, {
      isOn: () => micRef.current,
      onHowl: () => {
        const now = Date.now();
        howls.current = [...howls.current.filter((x) => now - x < 60000), now];
        if (howls.current.length >= 3) {
          howls.current = [];
          const s = localRef.current;
          if (s) s.getAudioTracks().forEach((x) => { x.enabled = false; });
          setMic(false); micRef.current = false;
          tellMediaRef.current && tellMediaRef.current(false, camRef.current);
          sayRef.current && sayRef.current("🔇 Your mic is off: two devices close together keep whistling. Use headphones, or keep one muted — tap 🎙️ to turn it back on.");
        } else {
          sayRef.current && sayRef.current("🔇 Whistling between two devices near each other — your mic paused a moment. Headphones, or move apart, stop it.");
        }
      },
    }) : null;
  }, []);
  const stopMedia = useCallback(() => {
    const s = localRef.current;
    if (guardRef.current) { guardRef.current(); guardRef.current = null; }
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
    const P = [...pcs.current.values()].find((x) => x.pc === pc);
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
          // A friend on a weak link (a phone on mobile data) gets a lighter
          // copy, ~720p: a film that keeps moving, not a sharp one that freezes.
          // Never above 1080p (a phone can't send 4K live): a taller source
          // is sized down to it first.
          const weak = P && P.weak;
          const tall = (s.track.getSettings && s.track.getSettings().height) || 1080;
          const fit = Math.max(1, tall / 1080);
          p.encodings[0].maxBitrate = weak ? 1800000 : n === 1 ? 8000000 : n === 2 ? 5500000 : 3500000;
          p.encodings[0].scaleResolutionDownBy = fit * (weak ? 1.5 : n === 1 ? 1 : n === 2 ? 1.2 : 1.5);
          p.encodings[0].maxFramerate = 30;
          // squeezed, give up a little of each — not all the sharpness
          p.degradationPreference = "balanced";
        } else if (isScreen) p.encodings[0].maxBitrate = 192000;      // a film's sound: stereo, full
        else if (s.track.kind === "video") {
          // A phone encodes my camera once for every friend, so with more of
          // us each copy is smaller: 720p for two, 480p for three, 360p for
          // four — a tile that size can't show more, and three full copies
          // starved the phone until the voices broke up. On a weak link
          // (lost packets, little upload) it drops further, so the voice
          // always gets through.
          const [bps, down, fps] = P && P.weak ? [150000, 3, 12] : n === 1 ? [1500000, 1, 30] : n === 2 ? [600000, 1.5, 24] : [400000, 2, 20];
          p.encodings[0].maxBitrate = bps;
          p.encodings[0].scaleResolutionDownBy = down;
          p.encodings[0].maxFramerate = fps;
          p.degradationPreference = "balanced";
        }
        else p.encodings[0].maxBitrate = 48000;            // one voice, clear: more is wasted upload, three times over
        // sound before pictures: on a busy connection (a film being shared)
        // the voices and the film's sound go first, so they don't break up
        const sound = s.track.kind === "audio";
        p.encodings[0].priority = sound ? "high" : isScreen ? "medium" : "low";
        p.encodings[0].networkPriority = sound ? "high" : isScreen ? "medium" : "low";
        s.setParameters(p).catch(() => {});
      } catch { /* not every browser lets us */ }
    }
  }, []);

  // How the link to a friend is doing, every few seconds: what they say they
  // lost of mine, and the upload the browser thinks there is. Weak, and my
  // camera to them goes small at once; it comes back only after a good while
  // well, so it doesn't flap.
  const gauge = useCallback(async (P) => {
    let lost = 0, up = Infinity;
    try {
      (await P.pc.getStats()).forEach((s) => {
        if (s.type === "remote-inbound-rtp" && s.fractionLost > lost) lost = s.fractionLost;
        if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded" && s.availableOutgoingBitrate) up = Math.min(up, s.availableOutgoingBitrate);
      });
    } catch { return; }
    const bad = lost > WEAK_LOSS || up < WEAK_UP;
    if (bad) P.goodSince = 0; else if (!P.goodSince) P.goodSince = Date.now();
    const weak = bad || (P.weak && Date.now() - P.goodSince < WEAK_HOLD_MS);
    if (weak !== !!P.weak) { P.weak = weak; tune(P.pc); }
  }, [tune]);

  const closePeer = useCallback((id) => {
    const P = pcs.current.get(id);
    if (P) { clearInterval(P.watch); try { P.pc.close(); } catch { /* gone */ } pcs.current.delete(id); }
    streams.current.delete(id);
    setPeers((all) => { const n = { ...all }; delete n[id]; return n; });
  }, []);

  // Find a new route to a friend: the offering side restarts ICE, the other
  // side asks it to. A connected link keeps playing on its old route while
  // the new one is found, so this is safe to do whenever the network moves.
  const kick = useCallback((id) => {
    const P = pcs.current.get(id);
    if (!P || P.pc.connectionState === "closed" || Date.now() - (P.lastKick || 0) < KICK_GAP_MS) return;
    P.kicked = P.lastKick = Date.now();
    if (P.polite) send(id, { restart: 1 });
    else try { P.pc.restartIce(); } catch { /* old browser */ }
  }, [send]);
  const kickAll = useCallback((all) => {
    for (const [id, P] of pcs.current) if (all || P.pc.connectionState !== "connected") kick(id);
  }, [kick]);

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
        // everyone's copies get smaller when someone joins, not just theirs
        patchPeer(id, { link: "ok" }); for (const x of pcs.current.values()) if (x.pc.connectionState === "connected") tune(x.pc);
        // a newcomer needs telling what's what: mic, camera, and which stream is my screen
        const c = callRef.current;
        if (socket && c && c.id) socket.emit("call:media", { callId: c.id, mic: micRef.current, cam: camRef.current, screen: screenRef.current ? screenRef.current.id : null, hold: holdRef.current, turn: turnRef.current, film: filmRef.current ? filmRef.current.name : null });
      }
      // Lost the route (Wi-Fi to mobile data, a lift, a tunnel): a blip
      // often comes back by itself, so give it a moment, then look for a new
      // route rather than waiting the browser's half a minute for "failed".
      else if (st === "disconnected") {
        patchPeer(id, { link: "lost" });
        setTimeout(() => { if (["disconnected", "failed"].includes(pc.connectionState)) kick(id); }, LOST_WAIT_MS);
      }
      else if (st === "failed") { patchPeer(id, { link: "lost" }); kick(id); }
    };
    // not through yet: try again (the offering side), and keep trying. Still
    // not through after a while: say so, and tell the server's log which
    // routes each side had — "no relay" means the TURN relay is missing.
    // (A restart only after RETRY_MS without getting through: a slow
    // network can take a while, and restarting it every few seconds would
    // stop it ever finishing.)
    P.kicked = P.since;
    P.watch = setInterval(() => {
      if (pc.connectionState === "connected") { P.kicked = Date.now(); gauge(P); return; }
      if (pc.connectionState === "closed") return;
      if (!P.polite && Date.now() - P.kicked > RETRY_MS) kick(id);
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
  }, [myId, socket, send, patchPeer, tune, place, kick, gauge]);

  const onSignal = useCallback(async ({ callId, from, data }) => {
    if (!callRef.current || callRef.current.id !== callId || !data) return;
    const P = peer(Number(from)), pc = P.pc;
    try {
      if (data.restart) {                                // they moved networks: the offering side restarts
        if (!P.polite) kick(Number(from));
      } else if (data.description) {
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
  }, [peer, send, tune, kick]);

  // ── the whole call ─────────────────────────────────────────────────────────
  // The film's player has to stay in the page while it plays (a player taken
  // out of the page pauses), so when the call shrinks it waits out of sight.
  const hideFilm = useCallback((v) => {
    let box = document.getElementById("call-film-hold");
    if (!box) { box = document.createElement("div"); box.id = "call-film-hold"; document.body.appendChild(box); }
    box.appendChild(v);
  }, []);
  const endFilm = useCallback(() => {
    const f = filmRef.current;
    if (!f) return;
    filmRef.current = null; setFilm(null); setFilmWait(false);
    try { f.v.pause(); } catch { /* gone */ }
    if (f.sound) f.sound.stop();
    if (f.burn) { cancelAnimationFrame(f.burn.raf); try { f.burn.track.stop(); } catch { /* gone */ } }
    if (f.open) f.open.then((F) => F.close()).catch(() => {});
    f.stop();
    f.v.removeAttribute("src"); f.v.remove();
    URL.revokeObjectURL(f.url);
  }, []);
  const finish = useCallback((reason) => {
    tones.current.stop();
    for (const id of [...pcs.current.keys()]) closePeer(id);
    stopMedia();
    if (screenRef.current) { screenRef.current.getTracks().forEach((t) => t.stop()); screenRef.current = null; setScreen(null); }
    endFilm();
    if (callRef.current && reason) say(ENDED[reason] || "Call ended");
    callRef.current = null;
    setCall(null); setPeers({}); setExpanded(true);
    setChat([]); setUnread(0); chatOpenRef.current = false; setChatOpenState(false);
    setWatch(null);
    holdRef.current = false; setOnHold(false);
  }, [closePeer, stopMedia, say, setWatch, endFilm]);

  // members changed: connect to newcomers, let go of whoever left
  const apply = useCallback((st) => {
    const c = callRef.current;
    if (!c || c.id !== st.callId) return;
    if ("watch" in st && (!st.watch || !watchRef.current || st.watch.rev !== watchRef.current.rev)) setWatch(st.watch);
    const others = st.members.filter((m) => m.id !== myId);
    for (const m of others) peer(m.id);
    for (const id of [...pcs.current.keys()]) if (!others.some((m) => m.id === id)) closePeer(id);
    const names = { ...c.names };
    for (const m of st.members) names[m.id] = m.name;
    const active = others.length > 0 || !!c.room;
    if (active && c.phase !== "active") tones.current.stop();
    setCall({ ...c, phase: active ? "active" : "outgoing", members: st.members, invited: st.invited, names,
      startedAt: active ? c.startedAt || Date.now() : null });
  }, [myId, peer, closePeer, setWatch]);

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

  // Take my call over from my other device: it hangs up there, and the
  // others connect to this device instead.
  const moveHere = useCallback(async () => {
    const e = elsewhere;
    if (!e || !socket || callRef.current) return;
    try { await getMedia(); } catch (err) { return say(err.message); }
    socket.emit("call:move", { callId: e.callId }, (r) => {
      if (!r || !r.ok) { stopMedia(); return say(WHY[r && r.why] || WHY.gone); }
      ice.current = r.iceServers || [];
      const draft = { id: e.callId, phase: "outgoing", members: [], invited: [], names: {}, startedAt: Date.now(), first: null };
      callRef.current = draft; setCall(draft); setExpanded(true);
      setElsewhere(null);
      apply(r);
    });
  }, [elsewhere, socket, getMedia, stopMedia, say, apply]);

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

  // A Movie Night room's call (config/calls.js, call:room): everyone seated
  // in the room is in it, no ringing, no friends needed. Mic on, camera off —
  // it's a film night; the camera button turns it on.
  const joinRoom = useCallback(async (code) => {
    if (!socket) return say("Not connected — try again in a moment.");
    const c = callRef.current;
    if (c && c.room === code) { setExpanded(true); return; }
    if (c) hangUp();
    let s;
    try { s = await getMedia(); } catch (e) { return say(e.message); }
    s.getVideoTracks().forEach((t) => { t.enabled = false; });
    camRef.current = false; setCam(false);
    socket.emit("call:room", { code }, (r) => {
      if (!r || !r.ok) { stopMedia(); return say(r && r.why === "not-in-room" ? "Join the room first." : WHY[r && r.why] || WHY.error); }
      ice.current = r.iceServers || [];
      const draft = { id: r.callId, room: r.room, phase: "active", members: [], invited: [], names: {}, startedAt: Date.now(), first: null };
      callRef.current = draft; setCall(draft); setExpanded(true);
      apply(r);
      socket.emit("call:media", { callId: r.callId, mic: true, cam: false, screen: null, hold: false, turn: 0, film: null });
    });
  }, [socket, getMedia, stopMedia, say, apply, hangUp]);

  // ── mic, camera, which camera ──────────────────────────────────────────────
  const tellMedia = useCallback((m, k) => {
    const c = callRef.current;
    if (socket && c && c.id) socket.emit("call:media", { callId: c.id, mic: m, cam: k, screen: screenRef.current ? screenRef.current.id : null, hold: holdRef.current, turn: turnRef.current,
      film: filmRef.current ? filmRef.current.name : null });
  }, [socket]);
  tellMediaRef.current = tellMedia;
  useEffect(() => {
    if (turnRef.current === turn) return;
    turnRef.current = turn;
    tellMedia(micRef.current, camRef.current);
  }, [turn, tellMedia]);

  // ── on hold: a phone call came in ──────────────────────────────────────────
  // The phone takes the mic (and often the camera) for its own call. The others are told "on hold" rather than seeing the
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
      for (let t of fresh.getTracks()) {
        const old = dead.find((d) => d.kind === t.kind);
        if (old && t.kind === "audio") t = await cleanMic(t);
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
    // Only the mic being taken puts the call on hold. Leaving the app doesn't:
    // the call carries on in the background, like WhatsApp (CallLayer floats it).
    const check = () => {
      const taken = !!mic0 && (mic0.muted || mic0.readyState === "ended");
      if (taken) { setHold(true); return; }
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

  const liveCall = call && call.phase === "active" ? call.id : null;   // (the call, once someone's in it)

  // ── a microphone that sends nothing ────────────────────────────────────────
  // A laptop can have several microphones, and the one the browser picks
  // ("Default") can be the wrong one — an empty headset socket, "Stereo Mix" —
  // sending pure silence: you hear your friends, they hear nothing. (WhatsApp
  // uses the one Windows keeps for calls.) While your mic is on its sound is
  // measured; nothing at all for a few seconds, and the others are tried —
  // Windows' call mic ("communications") first — and the first that hears
  // anything takes over in every connection. If none does, you're told and
  // shown them to choose from.
  const swapMic = useCallback(async (t) => {
    const s = localRef.current;
    if (!s) { t.stop(); return; }
    t.enabled = micRef.current;
    const old = s.getAudioTracks()[0];
    if (old) { s.removeTrack(old); old.stop(); }
    s.addTrack(t);
    guard(t);
    for (const P of pcs.current.values()) if (P.audio) await P.audio.replaceTrack(t).catch(() => {});
    const copy = new MediaStream(s.getTracks());
    localRef.current = copy; setLocal(copy);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- guard is stable
  const listMics = useCallback(async () => {
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      const cur = localRef.current && localRef.current.getAudioTracks()[0];
      const curId = micId(cur);
      setMics(all.map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}`, on: d.deviceId === curId })));
    } catch { setMics([]); }
  }, []);
  const chooseMic = useCallback(async (id) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO, deviceId: { exact: id } } });
      await swapMic(await cleanMic(s.getAudioTracks()[0]));
      setMics(null);
      say("Microphone changed");
    } catch { say("Couldn't open that microphone"); }
  }, [swapMic, say]);
  const tried = useRef(new Set());              // tracks already found silent (and dealt with)
  useEffect(() => {
    if (!liveCall || !local || !mic) return undefined;
    const t = local.getAudioTracks()[0];
    if (!t || tried.current.has(t.id)) return undefined;
    let stop = false, silent = 0;
    // only the first half-minute of a mic: a wrong one is silent from the
    // start, and measuring all call long was work a phone could do without
    const until = Date.now() + 30000;
    (async () => {
      await new Promise((r) => setTimeout(r, 1500));
      while (!stop && t.readyState === "live" && Date.now() < until) {
        const pk = await peakOf(t, 3000);
        if (stop || !micRef.current) return;
        if (pk == null) { await new Promise((r) => setTimeout(r, 3000)); continue; }
        silent = pk < MIC_SILENT ? silent + 1 : 0;
        if (silent < 2) { await new Promise((r) => setTimeout(r, 1000)); continue; }
        // six seconds of nothing at all: find a microphone that hears something
        tried.current.add(t.id);
        let all = [];
        try { all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"); } catch { /* none listed */ }
        const curId = micId(t);
        const order = [...all.filter((d) => d.deviceId === "communications"), ...all.filter((d) => d.deviceId !== "communications" && d.deviceId !== "default")]
          .filter((d) => d.deviceId && d.deviceId !== curId);
        for (const d of order) {
          if (stop) return;
          let fresh;
          try { fresh = (await navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO, deviceId: { exact: d.deviceId } } })).getAudioTracks()[0]; } catch { continue; }
          const p2 = await peakOf(fresh, 1500);
          if (p2 != null && p2 >= MIC_SILENT && !stop) {
            await swapMic(await cleanMic(fresh));
            say(`Your microphone wasn't sending any sound — switched to ${d.label || "another microphone"}`);
            return;
          }
          fresh.stop();
        }
        if (!stop) { say("Your friends can't hear your microphone — choose another one"); listMics(); }
        return;
      }
    })();
    return () => { stop = true; };
  }, [liveCall, local, mic, swapMic, listMics, say]);

  // ── a friend's camera paused ───────────────────────────────────────────────
  // A phone that leaves its app pauses its camera: the picture it sent last
  // freezes, or goes black. Every 1.5 s, count the frames each friend's
  // camera has sent; none since last time and they're "paused" — the call
  // shows their face instead of a black box, until the frames come back.
  useEffect(() => {
    if (!liveCall) return undefined;
    const last = new Map();
    const t = setInterval(() => {
      for (const [id, P] of pcs.current) {
        const S = streams.current.get(id);
        const cam = S && [...S.all.entries()].find(([sid]) => sid !== S.screenId);
        const vt = cam && cam[1].getVideoTracks()[0];
        const rc = vt && P.pc.getReceivers().find((r) => r.track === vt);
        if (!rc) continue;
        rc.getStats().then((rep) => {
          let n = null;
          rep.forEach((x) => { if (x.type === "inbound-rtp" && x.kind === "video") n = x.framesDecoded ?? x.framesReceived ?? n; });
          if (n == null) return;
          const was = last.get(id);
          last.set(id, n);
          if (was === undefined) return;
          const paused = n === was;
          setPeers((all) => (all[id] && !!all[id].paused !== paused ? { ...all, [id]: { ...all[id], paused } } : all));
        }).catch(() => {});
      }
    }, 1500);
    return () => clearInterval(t);
  }, [liveCall]);

  // ── chat ───────────────────────────────────────────────────────────────────
  const sendChat = useCallback((text) => {
    const c = callRef.current, t = String(text || "").trim().slice(0, 500);
    if (!socket || !c || !c.id || !t) return;
    const key = `${myId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setChat((all) => [...all, { key, from: myId, name: "You", text: t, at: Date.now(), mine: true }].slice(-200));
    socket.emit("call:chat", { callId: c.id, text: t, key });
  }, [socket, myId]);

  // ── watching a video together ──────────────────────────────────────────────
  const sendWatch = useCallback((msg) => {
    const c = callRef.current;
    if (socket && c && c.id) socket.emit("call:watch", { ...msg, callId: c.id });
  }, [socket]);
  // the server's clock, as near as a phone can tell
  const serverNow = useCallback(() => Date.now() + clockGap.current, []);
  // A video file I picked: its length from the file itself. First one in the
  // call starts the watching; after that it's my copy of what's on — the
  // same file if it's the same size.
  // (`fresh`: put this file on for everyone, instead of what's on now)
  const pickWatchFile = useCallback((file, fresh = false) => new Promise((resolve) => {
    if (!file) return resolve({ ok: false });
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true;
    const done = (dur) => {
      v.removeAttribute("src"); v.load();
      if (!(dur > 0) || !Number.isFinite(dur)) { URL.revokeObjectURL(url); return resolve({ ok: false, why: "unplayable" }); }
      const mine = { url, name: file.name, size: file.size, dur };
      setWatchFile((old) => { if (old) URL.revokeObjectURL(old.url); return mine; });
      const w = fresh ? null : watchRef.current;
      if (!w) sendWatch({ op: "open", src: { kind: "file", name: file.name, size: file.size, dur } });
      else if (w.src.size === file.size) sendWatch({ op: "ready" });
      resolve({ ok: true, same: !w || w.src.size === file.size });
    };
    // Some recordings (a phone's screen recorder's .webm) don't say how long
    // they are: jumping far past the end makes the browser work it out.
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration)) return done(v.duration);
      v.ontimeupdate = () => { v.ontimeupdate = null; done(v.duration); };
      v.currentTime = 1e101;
    };
    v.onerror = () => done(0);
    v.src = url;
  }), [sendWatch]);
  // Set my clock against the server's while something's on: the quickest of
  // a few round trips, halved.
  const watching = !!watch;
  useEffect(() => {
    if (!watching || !socket) return undefined;
    let best = Infinity, stop = false;
    const ping = () => {
      const t0 = Date.now();
      socket.emit("call:watch-time", {}, (srv) => {
        const t1 = Date.now();
        if (stop || typeof srv !== "number" || t1 - t0 >= best) return;
        best = t1 - t0; clockGap.current = srv - (t0 + t1) / 2;
      });
    };
    ping(); const a = setTimeout(ping, 400), b = setTimeout(ping, 1200), every = setInterval(() => { best = Infinity; ping(); }, 30000);
    return () => { stop = true; clearTimeout(a); clearTimeout(b); clearInterval(every); };
  }, [watching, socket]);

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
    endFilm();
    tellMedia(micRef.current, camRef.current);
  }, [tellMedia, endFilm]);
  // Play a video of mine to the call: it plays here (with its own controls)
  // and its picture and sound go to everyone as my shared screen. Chrome
  // and Android capture the player itself; an iPhone (no captureStream on a
  // <video>) draws it onto a canvas and takes its sound through Web Audio.
  // ── a film's tracks: sound and subtitles, as VLC offers them ───────────────
  // every step, for the Sound check in the menu (a screenshot of it says where it stopped)
  const note = (f, line) => { if (!f) return; (f.diag || (f.diag = [])).push(`${((performance.now() - (f.t0 || 0)) / 1000).toFixed(1)}s ${line}`); if (f.diag.length > 40) f.diag.shift(); };
  const filmDiag = useCallback(() => {
    const f = filmRef.current;
    if (!f) return null;
    const v = f.v;
    return {
      lines: (f.diag || []).slice(),
      sound: f.sound ? f.sound.stats() : null,
      video: { t: v.currentTime.toFixed(1), paused: v.paused, muted: v.muted, vol: v.volume, decoded: "webkitAudioDecodedByteCount" in v ? v.webkitAudioDecodedByteCount : "?" },
      sending: f.stream ? f.stream.getAudioTracks().map((t) => `${t.label || "track"} ${t.readyState}${t.enabled ? "" : " (off)"}`).join(", ") || "no sound track" : "—",
    };
  }, []);
  // its tracks, read by ffmpeg once (filmSound.openFilm)
  const filmTracksOf = useCallback((v) => {
    const f = filmRef.current;
    if (!f || f.v !== v) return Promise.reject(new Error("gone"));
    if (!f.open) {
      const t0 = performance.now();
      note(f, "decoder: loading…");
      f.open = openFilm(f.file).then((F) => {
        note(f, `decoder: ready in ${((performance.now() - t0) / 1000).toFixed(1)} s · ${F.audio.length} sound, ${F.subs.length} subtitle tracks`);
        F.audio.forEach((a) => note(f, `  sound ${a.n + 1}: ${a.label} [${a.codec}]`));
        if (!F.audio.length) F.probe.forEach((l) => note(f, "  " + l));
        return F;
      }).catch((e) => {
        note(f, `decoder: FAILED — ${e && e.message ? e.message : e}`);
        reportError("film", `decoder failed: ${e && e.message ? e.message : e}`);
        if (filmRef.current === f) f.open = null;
        throw e;
      });
    }
    return f.open;
  }, []);
  // the film's sound, from now on: audio track n, decoded here
  const pickAudio = useCallback(async (v, n, auto = false) => {
    const f = filmRef.current;
    if (!f || f.v !== v) return;
    const F = await filmTracksOf(v);
    note(f, `sound: starting track ${n + 1}${auto ? " (automatic)" : ""}`);
    const snd = await F.sound(n, v, { onWait: (w) => setFilmWait(w) });
    if (filmRef.current !== f) { snd.stop(); return; }
    note(f, "sound: decoder playing — the call now gets the decoded sound");
    if (f.sound) f.sound.stop();
    f.sound = snd; f.audioN = n;
    try { snd.track.contentHint = "music"; } catch { /* fine */ }
    // into the slot the old sound was going out in (no new offer), or a new one
    const stream = f.stream, old = stream.getAudioTracks();
    old.forEach((t) => stream.removeTrack(t));
    stream.addTrack(snd.track);
    if (screenRef.current === stream) {
      for (const P of pcs.current.values()) {
        const tx = (P.screenTx || []).find((x) => x.sender.track && old.includes(x.sender.track));
        if (tx) tx.sender.replaceTrack(snd.track).catch(() => shareInto(P, stream));
        else shareInto(P, stream);
      }
      tellMedia(micRef.current, camRef.current);
    }
    setFilm((x) => (x && x.v === v ? { ...x, audioN: n } : x));
    const a = F.audio[n];
    say(auto ? "🔊 Sound fixed — everyone can hear it" : `🔊 ${a ? a.label : "Sound"}`);
  }, [filmTracksOf, tellMedia, say]);
  // subtitles: track n, or null for none. Shown here over the film, and drawn
  // into the picture that goes to the call so friends see them too.
  const pickSubs = useCallback(async (v, n) => {
    const f = filmRef.current;
    if (!f || f.v !== v) return;
    const swapVideo = (from, to) => {
      const stream = f.stream;
      stream.removeTrack(from); stream.addTrack(to);
      for (const P of pcs.current.values()) {
        const tx = (P.screenTx || []).find((x) => x.sender.track === from);
        if (tx) tx.sender.replaceTrack(to).catch(() => {});
      }
    };
    const off = () => {
      if (f.burn) { const b = f.burn; f.burn = null; cancelAnimationFrame(b.raf); if (f.stream.getVideoTracks().includes(b.track)) swapVideo(b.track, b.orig); b.track.stop(); }
      f.cues = null; f.subN = null;
      setFilm((x) => (x && x.v === v ? { ...x, subN: null, cues: null } : x));
    };
    if (n === null) { off(); return; }
    const F = await filmTracksOf(v);
    say("💬 Loading subtitles — a long film takes a little while…");
    const cues = await F.subtitles(n);
    if (filmRef.current !== f) return;
    if (!cues || !cues.length) { say("Couldn't read those subtitles"); return; }
    off();
    f.cues = cues; f.subN = n;
    setFilm((x) => (x && x.v === v ? { ...x, subN: n, cues } : x));
    // friends: draw the picture and the line into a canvas and send that instead
    if (!f.drawn) {
      const orig = f.stream.getVideoTracks()[0];
      const c = document.createElement("canvas");
      const k = Math.min(1, 1280 / (v.videoWidth || 1280));
      c.width = Math.round((v.videoWidth || 1280) * k); c.height = Math.round((v.videoHeight || 720) * k);
      const g = c.getContext("2d");
      const burn = { raf: 0, orig, track: null };
      const draw = () => {
        try { g.drawImage(v, 0, 0, c.width, c.height); } catch { /* not yet */ }
        drawSub(g, cueAt(f.cues, v.currentTime), c.width, c.height);
        burn.raf = requestAnimationFrame(draw);
      };
      draw();
      burn.track = c.captureStream(30).getVideoTracks()[0];
      try { burn.track.contentHint = "motion"; } catch { /* fine */ }
      f.burn = burn;
      if (orig) swapVideo(orig, burn.track);
    }
    say(`💬 ${F.subs[n] ? F.subs[n].label : "Subtitles"} — everyone sees them`);
  }, [filmTracksOf, say]);

  const playFilm = useCallback(async (file) => {
    if (!file) return;
    if (screenRef.current) stopShare();
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.src = url; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto"; v.controls = true; v.className = "call-fit";
    // no full screen of its own: that's the video alone; the call's ⛶ takes it with the faces
    try { v.setAttribute("controlslist", "nofullscreen noremoteplayback"); } catch { /* fine */ }
    hideFilm(v);
    const ok = await new Promise((res) => { v.onloadedmetadata = () => res(true); v.onerror = () => res(false); });
    if (!ok) { v.remove(); URL.revokeObjectURL(url); say("This phone can't play that video. Try an .mp4."); return; }
    try { await v.play(); } catch { /* the controls' ▶ starts it */ }
    let stream = null, stop = () => {}, drawn = false;     // drawn: the picture goes out through a canvas (an iPhone), which draws subtitles itself
    const cap = v.captureStream || v.mozCaptureStream;
    if (cap) {
      try { stream = cap.call(v); } catch { stream = null; }
    }
    if (!stream) {
      drawn = true;
      const c = document.createElement("canvas");
      const k = Math.min(1, 1280 / (v.videoWidth || 1280));
      c.width = Math.round((v.videoWidth || 1280) * k); c.height = Math.round((v.videoHeight || 720) * k);
      const g = c.getContext("2d");
      let raf = 0;
      const draw = () => {
        try { g.drawImage(v, 0, 0, c.width, c.height); } catch { /* not yet */ }
        const f = filmRef.current;
        if (f && f.v === v && f.cues) drawSub(g, cueAt(f.cues, v.currentTime), c.width, c.height);
        raf = requestAnimationFrame(draw);
      };
      draw();
      stream = c.captureStream(30);
      let ac = null;
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const src = ac.createMediaElementSource(v), dest = ac.createMediaStreamDestination();
        src.connect(dest); src.connect(ac.destination);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch { /* picture only */ }
      stop = () => { cancelAnimationFrame(raf); if (ac) ac.close().catch(() => {}); };
    }

    filmRef.current = { v, url, file, stream, drawn, t0: performance.now(), name: file.name.replace(/\.[^.]+$/, "").slice(0, 100), stop };
    setFilm({ name: filmRef.current.name, v, audioN: null, subN: null, cues: null });
    const go = () => {
      if (!filmRef.current || filmRef.current.v !== v) return;
      const vt = stream.getVideoTracks()[0];
      if (!vt) { setTimeout(go, 200); return; }        // the player's tracks arrive once it has a frame
      if (vt) { try { vt.contentHint = "motion"; } catch { /* fine */ } }
      stream.getAudioTracks().forEach((t) => { try { t.contentHint = "music"; } catch { /* fine */ } });
      screenRef.current = stream; setScreen(stream);
      for (const P of pcs.current.values()) shareInto(P, stream);
      tellMedia(micRef.current, camRef.current);
      say("🎬 Everyone in the call can see and hear it. 🎧 headphones keep your mic from picking it up.");
    };
    go();
    // Sound the browser can't play (Dolby AC-3 / E-AC-3, DTS… — most
    // downloaded films): decode it ourselves, like VLC. Chrome on Android
    // even says it's playing such sound and puts out nothing, so the file is
    // looked at first; the browser's own word is the second check.
    (async () => {
      const f0 = filmRef.current;
      note(f0, `file: ${file.name.slice(0, 50)} · ${(file.size / 1048576).toFixed(0)} MB · ${file.type || "no type"}`);
      note(f0, `this phone: ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 110)}`);
      const dolby = await dolbyLike(file);
      if (dolby) warmDecoder();
      note(f0, `Dolby/DTS in the file's headers: ${dolby ? "yes" : "no"}`);
      const missing = dolby || (await soundMissing(v));
      if (!dolby) note(f0, `browser's own sound: ${missing ? "none decoded" : "playing"} (decoded bytes ${"webkitAudioDecodedByteCount" in v ? v.webkitAudioDecodedByteCount : "?"})`);
      const f = filmRef.current;
      if (!missing || !f || f.v !== v || f.sound) return;
      say(dolby ? "🔊 Dolby sound — decoding it so everyone can hear (the first time takes a moment)…" : "🔊 This video's sound needs decoding — fixing it (the first time takes a moment)…");
      let F;
      try { F = await filmTracksOf(v); } catch { say("Couldn't load the sound decoder — open Audio & subtitles › Sound check and send me a screenshot"); return; }
      if (!F.audio.length) { say("This video has no sound"); return; }
      try { await pickAudio(v, (F.audio.find((x) => x.def) || F.audio[0]).n, true); }
      catch (e) { note(filmRef.current, `sound: FAILED — ${e && e.message ? e.message : e}`); say("The sound didn't start — open Audio & subtitles › Sound check"); }
    })();
  }, [stopShare, tellMedia, say, hideFilm, filmTracksOf, pickAudio]);
  // for the menu: the tracks, and picking one
  const filmTracks = useCallback(() => { const f = filmRef.current; return f ? filmTracksOf(f.v) : Promise.reject(new Error("no film")); }, [filmTracksOf]);
  const filmAudio = useCallback((n) => { const f = filmRef.current; if (f) pickAudio(f.v, n).catch(() => say("Couldn't play that sound track")); }, [pickAudio, say]);
  const filmSubs = useCallback((n) => { const f = filmRef.current; if (f) pickSubs(f.v, n).catch(() => say("Couldn't read those subtitles")); }, [pickSubs, say]);
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
    say(a ? "Sharing your screen and its sound — 🎧 headphones keep your mic from picking it up" : "Sharing without sound — for sound, share a tab and tick “Share tab audio”");
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
    const onLeft = ({ callId, id, reason }) => {
      const c = callRef.current;
      // "moved": they took the call to their other device — reconnecting, not leaving
      if (c && c.id === callId) { closePeer(id); if (c.members.length > 2 && reason !== "moved") say(`${c.names[id] || "Someone"} left the call`); }
    };
    // "on your other device" only when it is one: this device on a new socket
    // (a blip, the old one not yet noticed gone) is still this device
    const onMine = (m) => setElsewhere(m && m.callId && m.sid !== socket.id && m.device !== deviceId() ? m : null);
    const onMoved = ({ callId }) => {
      if (!callRef.current || callRef.current.id !== callId) return;
      finish(null);
      say("Call moved to your other device");
    };
    const onDeclined = ({ callId, id }) => { const c = callRef.current; if (c && c.id === callId && c.members.length > 1) say(`${c.names[id] || "They"} can't join right now`); };
    const onMissed = ({ callId, id }) => { const c = callRef.current; if (c && c.id === callId && c.members.length > 1) say(`${c.names[id] || "They"} didn't answer`); };
    const onMedia = ({ callId, id, mic: m, cam: k, screen: sid, hold, turn: tn, film: fm }) => {
      if (!callRef.current || callRef.current.id !== callId) return;
      const S = streams.current.get(id);
      if (S) {
        if (S.screenId && S.screenId !== sid) S.all.delete(S.screenId);     // they stopped sharing
        S.screenId = sid || null;
      }
      patchPeer(id, { mic: m, cam: k, hold: !!hold, turn: [90, -90, 180].includes(tn) ? tn : 0, film: typeof fm === "string" ? fm : null });
      place(id);
    };
    // the socket came back: pick the call up where it was
    const onConnect = () => {
      socket.emit("call:mine");
      const c = callRef.current;
      if (!c || !c.id) return;
      socket.emit("call:rejoin", { callId: c.id }, (r) => {
        if (!r || !r.ok) return finish("dropped");
        apply(r);
        kickAll(false);                                  // signalling is back: mend any link that broke meanwhile
      });
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
    const onWatch = ({ callId, watch: w, by, name: who }) => {
      if (!callRef.current || callRef.current.id !== callId) return;
      const had = watchRef.current;
      setWatch(w);
      if (by === myId) return;
      const what = (x) => x && `${x.src.kind}|${x.src.id || ""}|${x.src.size || ""}|${x.src.name}`;
      if (w && what(w) !== what(had)) say(`${w.src.kind === "yt" ? "▶️" : "🎬"} ${who} put on “${w.src.name}”`);
      else if (!w && had) say(`${who} stopped the video`);
    };
    socket.on("call:watch", onWatch);
    socket.on("call:mine", onMine); socket.on("call:moved", onMoved);
    if (socket.connected) socket.emit("call:mine");      // listening now: am I in a call somewhere?
    socket.on("connect", onConnect);
    return () => {
      socket.off("call:chat", onChat); socket.off("call:watch", onWatch);
      socket.off("call:mine", onMine); socket.off("call:moved", onMoved);
      socket.off("call:ring", onRing); socket.off("call:ring-stop", onRingStop); socket.off("call:state", onState);
      socket.off("call:ended", onEnded); socket.off("call:left", onLeft); socket.off("call:declined", onDeclined);
      socket.off("call:missed", onMissed); socket.off("call:media", onMedia); socket.off("call:signal", onSignal);
      socket.off("connect", onConnect);
    };
  }, [socket, apply, finish, closePeer, patchPeer, onSignal, say, place, kickAll, setWatch, myId]);

  // The phone moved networks (Wi-Fi to mobile data and back): the old route
  // is about to die, so start finding the new one now, before the sound cuts.
  useEffect(() => {
    const moved = () => { if (callRef.current) kickAll(true); };
    const conn = navigator.connection;
    window.addEventListener("online", moved);
    if (conn && conn.addEventListener) conn.addEventListener("change", moved);
    return () => {
      window.removeEventListener("online", moved);
      if (conn && conn.removeEventListener) conn.removeEventListener("change", moved);
    };
  }, [kickAll]);

  // logged out, or the socket is gone for good: no call
  useEffect(() => { if (!user) { setRing(null); finish(null); } }, [user, finish]);
  useEffect(() => () => { tones.current.stop(); stopMedia(); }, [stopMedia]);

  const value = useMemo(() => ({
    call, ring, local, peers, mic, cam, facing, notice, expanded, myId, screen, chat, unread, chatOpen, shareHelp, setShareHelp, onHold, turn, elsewhere, moveHere, setHeldTurn, mics, setMics, listMics, chooseMic,
    startCall, joinRoom, accept, decline, hangUp, toggleMic, toggleCam, flip, share, setExpanded, sendChat, setChatOpen, clearNotice: () => setNotice(null),
    watch, watchFile, sendWatch, pickWatchFile, serverNow, say, film, playFilm, hideFilm, filmWait, filmVolume, filmTracks, filmAudio, filmSubs, filmDiag,
  }), [call, ring, local, peers, mic, cam, facing, notice, expanded, myId, screen, chat, unread, chatOpen, shareHelp, onHold, turn, elsewhere, moveHere, mics, listMics, chooseMic,
    startCall, joinRoom, accept, decline, hangUp, toggleMic, toggleCam, flip, share, sendChat, setChatOpen, watch, watchFile, sendWatch, pickWatchFile, serverNow, say, film, playFilm, hideFilm, filmWait, filmVolume, filmTracks, filmAudio, filmSubs, filmDiag]);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

const NONE = { call: null, ring: null, peers: {}, startCall() {}, notice: null };
export function useCall() {
  return useContext(CallContext) || NONE;
}
