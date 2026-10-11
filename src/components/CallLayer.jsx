// src/components/CallLayer.jsx
// Everything you see of a call, over whatever page you're on — a game too:
//   • a friend calling: their face, Accept / Decline
//   • calling them: your own camera, "Calling Ben…", Cancel
//   • in the call: them full screen, you in a corner, the buttons
//   • shrunk: a small picture you can drag anywhere; tap to open it again
//   • someone sharing their screen: it takes the stage (⛶ for full screen,
//     sideways on a phone), the cameras in a strip
// The call itself lives in CallContext.
import React, { useEffect, useRef, useState } from "react";
import { useCall as useCallCtx, CALL_MAX, canShareScreen } from "../utils/CallContext";
import { usePresence } from "../utils/PresenceContext";
import { canDocPip, openPip, updatePip, closePip, pipOpen } from "../utils/callPip";
import { canFloatBoth, createFloat } from "../utils/callFloat";
import { useDrawnSideways, isDrawnSideways, toGame, gameRect, isInstalled } from "./horror/LandscapeGate";

// Where the floating call window (callPip.js) can be used, a video's own
// picture-in-picture is turned off: it can only show one face.
const NO_VIDEO_PIP = canDocPip();
// A phone: the call can float as the friend's video in its own little window,
// which stays over other apps when you leave PlayRoom (like WhatsApp).
const VIDEO_PIP = !NO_VIDEO_PIP && typeof document !== "undefined" && !!document.pictureInPictureEnabled;

// The call drawn turned a quarter: 90 (clockwise) with a game drawn
// sideways, or with the phone held sideways while the screen stays upright
// (heldSideways); -90 the other way. Set as the call draws.
let layerTurn = 0;
// Positions while dragging, in the call's own frame.
const at = (e) => (layerTurn === 90 ? toGame(e, true) : layerTurn === -90 ? { x: window.innerHeight - e.clientY, y: e.clientX } : { x: e.clientX, y: e.clientY });
const area = () => (layerTurn ? { w: window.innerHeight, h: window.innerWidth } : { w: window.innerWidth, h: window.innerHeight });
// An element's box in the call's frame.
const layerRect = (el) => {
  if (layerTurn === 90) return gameRect(el, true);
  const r = el.getBoundingClientRect();
  if (layerTurn === -90) return { left: window.innerHeight - r.bottom, top: r.left, width: r.height, height: r.width };
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

// An Android phone held sideways while its screen stays upright — the
// installed app is portrait (manifest.json), and asking the screen to turn
// isn't honoured everywhere. Read from the motion sensor (gravity along the
// phone's width): 90 when its top points left, -90 right, 0 upright or flat.
// Once the screen really turns, it's landscape and this says 0.
function useHeldSideways(on) {
  const [deg, setDeg] = useState(0);
  useEffect(() => {
    if (!on || typeof window === "undefined" || !/Android/i.test(navigator.userAgent || "")) { setDeg(0); return undefined; }
    let cur = 0;
    const onMotion = (e) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null) return;
      const ax = Math.abs(g.x), ay = Math.abs(g.y);
      let next = cur;
      if (!window.matchMedia("(orientation: portrait)").matches) next = 0;
      else if (cur === 0) { if (ax > 7 && ax > ay + 3) next = g.x > 0 ? 90 : -90; }
      else if (ax < 4 || ay > ax + 2) next = 0;
      if (next !== cur) { cur = next; setDeg(next); }
    };
    window.addEventListener("devicemotion", onMotion);
    return () => { window.removeEventListener("devicemotion", onMotion); setDeg(0); };
  }, [on]);
  return deg;
}

const two = (n) => String(n).padStart(2, "0");
const BUBBLE_MIN = 0.8, BUBBLE_MAX = 2.4;        // how small and how big the bubble can be made
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${two(s % 60)}`; };

// A picture. Always silent: the sound is played by <Sound>, which stays put
// whether the call is full screen or shrunk to the bubble. Mine is mirrored,
// like a mirror. `turn`: the camera's picture came out turned (its phone is
// playing a sideways game with the screen upright) — it's turned back here,
// filling its box the same way.
function Vid({ stream, mirror = false, className = "", turn = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream || null;
    if (stream) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
  }, [stream, turn]);
  if (turn) {
    return (
      <div className={`${className} call-turnbox`}>
        <video ref={ref} className="call-turned" autoPlay playsInline muted disablePictureInPicture={NO_VIDEO_PIP}
          style={{ transform: `translate(-50%,-50%)${mirror ? " scaleX(-1)" : ""} rotate(${turn}deg)` }} />
      </div>
    );
  }
  return <video ref={ref} className={`${className}${mirror ? " mirror" : ""}`} autoPlay playsInline muted disablePictureInPicture={NO_VIDEO_PIP} />;
}

// A friend's voice. If the browser won't start sound without a tap, says so.
// A sound that arrives later (a shared film's, after the voices) is set
// again when its tracks change — some phones only play what a stream had
// when it was handed over — and if a phone won't start it without a tap,
// the next tap anywhere starts it.
function Sound({ stream, onNeedTap }) {
  const ref = useRef(null);
  const tracks = stream ? stream.getAudioTracks().map((t) => t.id).join() : "";
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    if (a.srcObject !== stream || tracks) { a.srcObject = null; a.srcObject = stream || null; }
    if (stream) { const p = a.play(); if (p && p.catch) p.catch(() => onNeedTap && onNeedTap()); }
  }, [stream, tracks, onNeedTap]);
  useEffect(() => {
    const kick = () => { const a = ref.current; if (a && a.paused && a.srcObject) a.play().catch(() => {}); };
    document.addEventListener("pointerdown", kick, true);
    return () => document.removeEventListener("pointerdown", kick, true);
  }, []);
  return <audio ref={ref} className="call-sound" autoPlay />;
}

// a white handset: the 📞 emoji is red itself, and vanishes on a red button
const Phone = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <path fill="#fff" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
  </svg>
);

// Drag something anywhere on the screen. A press that doesn't move is still
// a tap (the corner picture swaps who's big); one that moves is a drag.
function useDrag() {
  const [pos, setPos] = useState(null);           // { x, y, w, h } once moved
  const d = useRef(null);
  const moved = useRef(false);
  const start = (e, el) => {
    const r = layerRect(el || e.currentTarget), p = at(e);
    d.current = { id: e.pointerId, dx: p.x - r.left, dy: p.y - r.top, x0: p.x, y0: p.y, w: r.width, h: r.height, go: false };
    moved.current = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const move = (e) => {
    const s = d.current;
    if (!s || s.id !== e.pointerId) return;
    const p = at(e), A = area();
    if (!s.go && Math.hypot(p.x - s.x0, p.y - s.y0) < 6) return;
    s.go = true; moved.current = true;
    setPos({ x: Math.max(4, Math.min(A.w - s.w - 4, p.x - s.dx)), y: Math.max(4, Math.min(A.h - s.h - 4, p.y - s.dy)), w: s.w, h: s.h });
  };
  const end = (e) => { if (d.current && d.current.id === e.pointerId) d.current = null; };
  const style = pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined;
  // a tap after a drag isn't a tap
  const wasDrag = () => { const m = moved.current; moved.current = false; return m; };
  return { pos, setPos, start, move, end, style, wasDrag };
}

// ── chat in the call ─────────────────────────────────────────────────────────
const EMOJI = ["😂", "❤️", "👍", "🔥", "😮", "😢", "🎉", "🙏"];
const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function ChatPanel({ chat, onSend, onClose, drag }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);
  useEffect(() => { const l = listRef.current; if (l) l.scrollTop = l.scrollHeight; }, [chat.length]);
  const send = () => { if (text.trim()) { onSend(text); setText(""); } };
  // an emoji on its own is sent at once, like a reaction; in a message it's added to it
  const emoji = (e) => { if (text.trim()) setText((t) => t + e); else onSend(e); };
  // keys typed here are the chat's: a game listening on the page (Space to
  // jump…) mustn't take them
  const keep = (e) => e.stopPropagation();
  const panel = useRef(null);
  // dragged somewhere: it keeps its size there
  const style = drag.pos ? { ...drag.style, width: drag.pos.w, height: drag.pos.h } : undefined;
  return (
    <div className={`call-chat${drag.pos ? " moved" : ""}`} ref={panel} style={style} role="dialog" aria-label="Chat" onKeyDown={keep} onKeyUp={keep}>
      <div className="call-chat-head" title="Drag to move the chat"
        onPointerDown={(e) => { if (e.target.closest("button")) return; drag.start(e, panel.current); }}
        onPointerMove={drag.move} onPointerUp={drag.end} onPointerCancel={drag.end}>
        <b>💬 Chat</b><span className="call-chat-note">only in this call · not saved</span>
        <button type="button" className="call-chat-x" onClick={onClose} aria-label="Close the chat">✕</button>
      </div>
      <div className="call-chat-list" ref={listRef}>
        {chat.length === 0 && <div className="call-chat-empty">Say hi 👋</div>}
        {chat.map((m) => (
          <div key={m.key} className={`call-msg${m.mine ? " mine" : ""}${/^\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*$/u.test(m.text) ? " big" : ""}`}>
            {!m.mine && <b>{m.name}</b>}
            <span>{m.text}</span>
            <time>{hhmm(m.at)}</time>
          </div>
        ))}
      </div>
      <div className="call-chat-emoji">
        {EMOJI.map((e) => <button key={e} type="button" onClick={() => emoji(e)} aria-label={`Send ${e}`}>{e}</button>)}
      </div>
      <form className="call-chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Message…" aria-label="Message" enterKeyHint="send" autoComplete="off"
          autoFocus /* open the chat, start typing */ />
        <button type="submit" aria-label="Send" disabled={!text.trim()}>➤</button>
      </form>
    </div>
  );
}

function Face({ avatar, name, big }) {
  return (
    <div className={`call-face${big ? " big" : ""}`}>
      <div className="call-emoji">{avatar || "🙂"}</div>
      {name && <div className="call-name">{name}</div>}
    </div>
  );
}

export default function CallLayer() {
  const C = useCallCtx();
  const { friends } = usePresence();
  const [now, setNow] = useState(Date.now());
  const [tapForSound, setTapForSound] = useState(false);
  const [picking, setPicking] = useState(false);   // the "add a friend" list
  const [swapped, setSwapped] = useState(false);   // one-to-one: me big, them in the corner (tap the corner to swap, like WhatsApp)
  const meDrag = useDrag(), chatDrag = useDrag();
  // Whose faces you see in the bubble, the floating window and beside a
  // shared screen (👥): someone can be hidden — your own other device, say,
  // sharing a film with its camera off. Remembered for next time, by person.
  const [hidden, setHidden] = useState(() => {
    try { return new Set((JSON.parse(localStorage.getItem("pr_call_hidden") || "[]") || []).map(String)); } catch { return new Set(); }
  });
  const [facesOpen, setFacesOpen] = useState(false);
  const [facesNote, setFacesNote] = useState("");
  const seen = (key) => !hidden.has(String(key));   // the small picture and the chat, wherever you put them
  const { call, ring, local, peers, mic, cam, facing, notice, expanded, screen, chat = [], unread = 0, chatOpen } = C;
  // a message arriving with the chat closed: shown for a moment at the top
  const [peek, setPeek] = useState(null);
  const lastSeen = useRef(0);
  useEffect(() => {
    const last = chat[chat.length - 1];
    if (!last || chat.length <= lastSeen.current) { lastSeen.current = chat.length; return undefined; }
    lastSeen.current = chat.length;
    if (last.mine || chatOpen) return undefined;
    setPeek(last);
    const t = setTimeout(() => setPeek((p) => (p === last ? null : p)), 4000);
    return () => clearTimeout(t);
  }, [chat, chatOpen]);
  const shareRef = useRef(null);
  const avatarOf = (id) => friends.find((f) => Number(f.id) === Number(id))?.avatar;

  useEffect(() => {
    if (!call || call.phase !== "active") return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [call]);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => C.clearNotice(), 3200);
    return () => clearTimeout(t);
  }, [notice]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!call) { setTapForSound(false); setPicking(false); setSwapped(false); meDrag.setPos(null); chatDrag.setPos(null); } }, [call]); // eslint-disable-line react-hooks/exhaustive-deps

  // the bubble: drag it out of the way
  const [pos, setPos] = useState(null);
  const drag = useRef(null);
  // …and make it bigger or smaller: the handle in its top-left corner. The
  // bottom-right corner stays put while you drag. Remembered for next time.
  const [bscale, setBscale] = useState(() => {
    try { const v = Number(localStorage.getItem("pr_bubble_size")); return v >= BUBBLE_MIN && v <= BUBBLE_MAX ? v : 1; } catch { return 1; }
  });
  const grip = useRef(null);
  const bubbleEl = useRef(null);
  const gripDown = (e) => {
    e.stopPropagation();
    const el = bubbleEl.current;
    if (!el) return;
    const r = layerRect(el), p = at(e);
    grip.current = { id: e.pointerId, right: r.left + r.width, bottom: r.top + r.height, w1: r.width / bscale, h1: r.height / bscale, dx: p.x - r.left, s: bscale };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const gripMove = (e) => {
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;
    e.stopPropagation();
    const p = at(e);
    const k = Math.max(BUBBLE_MIN, Math.min(BUBBLE_MAX, (g.right - (p.x - g.dx)) / g.w1));
    setBscale(k);
    setPos({ x: Math.max(4, g.right - g.w1 * k), y: Math.max(4, g.bottom - g.h1 * k) });
  };
  const gripUp = (e) => {
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;
    e.stopPropagation();
    grip.current = null;
    try { localStorage.setItem("pr_bubble_size", String(Math.round(bscale * 100) / 100)); } catch { /* fine */ }
  };
  const bubbleDown = (e) => {
    const r = layerRect(e.currentTarget), p = at(e);
    drag.current = { id: e.pointerId, dx: p.x - r.left, dy: p.y - r.top, x0: p.x, y0: p.y, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const bubbleMove = (e) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const p = at(e), A = area();
    if (Math.hypot(p.x - d.x0, p.y - d.y0) > 6) d.moved = true;
    if (!d.moved) return;
    const w = e.currentTarget.offsetWidth, h = e.currentTarget.offsetHeight;
    setPos({ x: Math.max(4, Math.min(A.w - w - 4, p.x - d.dx)), y: Math.max(4, Math.min(A.h - h - 4, p.y - d.dy)) });
  };
  const bubbleUp = (e) => {
    const d = drag.current; drag.current = null;
    if (d && d.id === e.pointerId && !d.moved) C.setExpanded(true);
  };

  const others = call ? call.members.filter((m) => m.id !== C.myId) : [];
  const shownOthers = others.filter((m) => seen(m.id));
  const showMe = seen("me");
  const hiddenN = others.filter((m) => !seen(m.id)).length + (showMe ? 0 : 1);   // on the 👥 button
  // hide or show someone's face — never the last one showing
  const toggleFace = (key) => {
    const k = String(key), next = new Set(hidden);
    if (next.has(k)) next.delete(k);
    else {
      const left = [...others.map((m) => String(m.id)), "me"].filter((x) => x !== k && !next.has(x));
      if (!left.length) { setFacesNote("Keep at least one face showing."); return; }
      next.add(k);
    }
    setFacesNote("");
    setHidden(next);
    try { localStorage.setItem("pr_call_hidden", JSON.stringify([...next])); } catch { /* fine */ }
  };
  // friends still being rung into the call: a tile each, "Ringing…"
  const waiting = call && call.phase === "active" ? call.invited.map((id) => ({ id, name: call.names[id] || "Friend" })) : [];
  const seats = others.length + waiting.length;
  // swapping big and small: a one-to-one call, nobody sharing a screen
  const canSwap = !!call && call.phase === "active" && seats === 1 && others.length === 1 && !others.some((m) => peers[m.id]?.screen);
  const swap = swapped && canSwap;
  // (a camera that's paused — their phone left the app — shows their face, not a black box)
  const theirVid = others[0] && peers[others[0].id]?.stream && peers[others[0].id]?.cam !== false && !peers[others[0].id].paused && peers[others[0].id].stream.getVideoTracks().length > 0;
  const room = call && call.members.length + call.invited.length < CALL_MAX;
  // a friend sharing their screen (the first, if two are)
  const sharer = others.find((m) => peers[m.id]?.screen);
  const shown = sharer ? peers[sharer.id].screen : null;
  const big = async () => {
    const el = shareRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        // a film on a phone: sideways (where the phone lets a page turn it)
        try { await window.screen.orientation.lock("landscape"); } catch { /* not on every phone */ }
      } else {
        // an iPhone: only a <video> can go full screen there, in its own
        // player — which can't show the faces or 👥. So: our own full screen,
        // the shared screen over everything (the phone turns it by itself).
        setPseudo((x) => !x);
      }
    } catch { /* stays as it is */ }
  };
  const [full, setFull] = useState(false);          // the shared screen is full screen
  const [pseudo, setPseudo] = useState(false);      // …our own full screen (an iPhone: no element full screen)
  useEffect(() => { if (!sharer) setPseudo(false); }, [sharer]);
  const [tucked, setTucked] = useState(false);      // …with the faces tucked away
  useEffect(() => {
    const on = () => {
      const f = !!document.fullscreenElement && document.fullscreenElement === shareRef.current;
      setFull(f);
      // out of full screen in the installed app: back to following the phone
      if (!f && isInstalled() && sharerId) { try { window.screen.orientation.lock("any").catch(() => {}); } catch { /* fine */ } }
    };
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  });
  // The installed app is held upright (manifest.json: portrait), so turning
  // the phone did nothing while you watched a film someone was sharing.
  // While a screen is on show it follows the phone; after, upright again.
  const sharerId = sharer ? sharer.id : null;
  useEffect(() => {
    if (!sharerId || !isInstalled() || isDrawnSideways() || !window.screen?.orientation?.lock) return undefined;
    try { window.screen.orientation.lock("any").catch(() => {}); } catch { /* not on this phone */ }
    return () => { if (!isDrawnSideways()) { try { window.screen.orientation.lock("portrait").catch(() => {}); } catch { /* fine */ } } };
  }, [sharerId]);
  const canAdd = friends.filter((f) => f.online && !call?.members.some((m) => m.id === Number(f.id)) && !call?.invited.includes(Number(f.id)));
  const needTap = React.useCallback(() => setTapForSound(true), []);

  // ── the floating window: their faces left, mine right ──
  const pipState = {
    mic,
    chat,
    since: call && call.startedAt,
    people: [
      ...shownOthers.map((m) => {
        const p = peers[m.id] || {};
        return { key: String(m.id), name: m.name, stream: p.stream, avatar: avatarOf(m.id), muted: p.mic === false, turn: p.turn || 0,
          showVideo: !!p.stream && p.cam !== false && !p.paused && p.stream.getVideoTracks().length > 0 };
      }),
      ...(showMe ? [{ key: "me", name: "You", stream: local, avatar: "🙂", muted: !mic, mirror: facing === "user", turn: C.turn || 0,
        showVideo: !!local && cam && local.getVideoTracks().length > 0 }] : []),
    ],
  };
  const pipRef = useRef(pipState);
  pipRef.current = pipState;
  const pipOn = useRef({});
  pipOn.current = { onMic: C.toggleMic, onHangUp: C.hangUp, onBack: () => C.setExpanded(true), onSend: C.sendChat };
  const popOut = React.useCallback(() => openPip(pipRef.current, {
    onMic: () => pipOn.current.onMic(), onHangUp: () => pipOn.current.onHangUp(), onBack: () => pipOn.current.onBack(),
    onSend: (t) => pipOn.current.onSend(t),
  }), []);
  useEffect(() => { updatePip(pipRef.current); });                    // keep it current, every render
  const active = !!call && call.phase === "active";
  useEffect(() => {
    if (!active) { closePip(); return undefined; }
    // switching tabs mid-call: Chrome opens our window, not a one-face video
    if (!canDocPip() || !navigator.mediaSession) return undefined;
    try { navigator.mediaSession.setActionHandler("enterpictureinpicture", popOut); } catch { /* not this browser */ }
    return () => { try { navigator.mediaSession.setActionHandler("enterpictureinpicture", null); } catch { /* fine */ } };
  }, [active, popOut]);
  const ringing = ring && (!call || call.id !== ring.callId);

  // Back, with the call screen open, shrinks it to the bubble (like WhatsApp)
  // and leaves the page underneath where it was. The open call screen holds
  // one extra history entry; Back takes it away. (A ref, not the effect's
  // cleanup alone, so React's dev double-run doesn't push it twice.)
  const open = !!call && expanded;
  const openRef = useRef(open);
  openRef.current = open;
  const entry = useRef(false);
  useEffect(() => {
    const onPop = () => {
      if (!entry.current || (window.history.state && window.history.state.prCall)) return;
      entry.current = false;
      if (openRef.current) C.setExpanded(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open && !entry.current) {
      window.history.pushState({ ...(window.history.state || {}), prCall: true }, "");
      entry.current = true;
      return undefined;
    }
    if (open || !entry.current) return undefined;
    // shrunk or hung up some other way: take our entry back off, if it's still on top
    const t = setTimeout(() => {
      if (openRef.current || !entry.current) return;
      entry.current = false;
      if (window.history.state && window.history.state.prCall) window.history.back();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  // A phone: float the call in its own little window. It stays over other
  // apps when you leave PlayRoom, and tapping it brings you back to the
  // call. The float button does it; where the phone allows, leaving the app
  // does it by itself too. Both faces, drawn into one picture (callFloat.js)
  // — a phone can float only one video; where it can't draw them
  // (iPhone), the friend's video alone.
  const pipVid = useRef(null);
  const floatWho = others.find((m) => peers[m.id] && peers[m.id].stream) || others[0];
  const floatPeer = floatWho ? peers[floatWho.id] : null;
  const floatFace = floatPeer && floatPeer.stream && floatPeer.cam !== false && floatPeer.stream.getVideoTracks().length > 0 ? floatPeer : null;
  const hasCam = (s) => !!s && s.getVideoTracks().length > 0;
  const both = useRef(null);
  const [bothStream, setBothStream] = useState(null);
  useEffect(() => {
    if (!active || !VIDEO_PIP || !canFloatBoth()) return undefined;
    let f;
    try { f = createFloat(); } catch { return undefined; }
    both.current = f;
    setBothStream(f.stream);
    return () => { f.close(); both.current = null; setBothStream(null); };
  }, [active]);
  useEffect(() => {
    if (!both.current) return;
    // everyone in the call (up to four): friends first, you last
    both.current.set([
      ...shownOthers.slice(0, 3).map((m) => {
        const p = peers[m.id] || {};
        return { key: String(m.id), stream: p.stream || null, show: hasCam(p.stream) && p.cam !== false, name: m.name, avatar: avatarOf(m.id) || "🙂", muted: p.mic === false, mirror: false };
      }),
      ...(showMe ? [{ key: "me", me: true, stream: local, show: hasCam(local) && cam, name: "You", avatar: "🙂", muted: !mic, mirror: facing === "user" }] : []),
    ], { since: call && call.startedAt, muted: !mic });
  });
  const floatStream = bothStream || (floatFace ? floatFace.stream : local);
  useEffect(() => {
    const v = pipVid.current;
    if (!v) return;
    if (v.srcObject !== floatStream) {
      v.srcObject = floatStream || null;
      if (both.current && floatStream === bothStream) setTimeout(() => both.current && both.current.poke(), 50);   // a frame for it, so it can float at once
    }
    if (floatStream) { const q = v.play(); if (q && q.catch) q.catch(() => {}); }
  }, [floatStream, bothStream, active]);
  const floatOut = React.useCallback(async () => {
    const v = pipVid.current;
    if (!v || !v.srcObject) return;
    try {
      if (document.pictureInPictureElement === v) return;
      await v.requestPictureInPicture();
    } catch { /* not allowed right now: the bubble is there instead */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = pipVid.current;
    if (!active || !VIDEO_PIP || !v) return undefined;
    // Floating, and back: heard at the page (the events bubble), so it never
    // matters which <video> it was. Tapping the little window (back to
    // PlayRoom): the call, full screen.
    const mine = (e) => e.target === pipVid.current;
    const on = (e) => { if (mine(e)) { setFloating(true); if (both.current) both.current.run(true); } };
    const back = (e) => { if (mine(e)) { setFloating(false); if (both.current) both.current.run(false); C.setExpanded(true); } };
    document.addEventListener("enterpictureinpicture", on, true);
    document.addEventListener("leavepictureinpicture", back, true);
    if (document.pictureInPictureElement === v) { setFloating(true); if (both.current) both.current.run(true); }
    try { v.setAttribute("autopictureinpicture", ""); v.autoPictureInPicture = true; } catch { /* fine */ }
    if (navigator.mediaSession) {
      try { navigator.mediaSession.setActionHandler("enterpictureinpicture", floatOut); } catch { /* not this browser */ }
    }
    return () => {
      document.removeEventListener("enterpictureinpicture", on, true);
      document.removeEventListener("leavepictureinpicture", back, true);
      setFloating(false);
      if (document.pictureInPictureElement === v) document.exitPictureInPicture().catch(() => {});
      if (navigator.mediaSession) { try { navigator.mediaSession.setActionHandler("enterpictureinpicture", null); } catch { /* fine */ } }
    };
  }, [active, floatOut]); // eslint-disable-line react-hooks/exhaustive-deps
  const sideways = useDrawnSideways();
  // watching a shared screen with the phone held sideways: the call turns with it
  const held = useHeldSideways(!!shown && !!call && expanded && !sideways && !full);
  layerTurn = sideways ? 90 : held;
  useEffect(() => { if (C.setHeldTurn) C.setHeldTurn(held); }, [held]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⌄ Minimise — the one way to shrink the call: it floats, with everyone's
  // face, over this app and others (a computer: its own little window, with
  // the chat; a phone: a picture-in-picture of every face). Where floating
  // isn't possible (iPhone), or the browser says no, the bubble in the page.
  const [floating, setFloating] = useState(false);
  const minimise = () => {
    C.setExpanded(false);
    if (!active) return;
    if (canDocPip()) popOut();
    else if (VIDEO_PIP) floatOut();
  };
  const floatsNow = floating || (canDocPip() && pipOpen());

  return (
    <div className={`call-root${layerTurn === 90 ? " rot" : layerTurn === -90 ? " rot-ccw" : ""}`}>
      {active && VIDEO_PIP && <video ref={pipVid} className="call-pipvid" autoPlay playsInline muted aria-hidden="true" />}
      {notice && !ringing && <div className="call-notice" role="status">{notice.text}</div>}
      {C.elsewhere && !call && !ringing && (
        <div className="call-elsewhere" role="status">
          <span>📞 {C.elsewhere.sid ? "In a call" : "Your call"} on your other device{C.elsewhere.with.length ? ` · ${C.elsewhere.with.join(", ")}` : ""}</span>
          <button type="button" onClick={C.moveHere}>Move here</button>
        </div>
      )}
      {call && others.map((m) => peers[m.id]?.stream && <Sound key={m.id} stream={peers[m.id].stream} onNeedTap={needTap} />)}
      {call && others.map((m) => peers[m.id]?.screen && peers[m.id].screen.getAudioTracks().length > 0
        && <Sound key={"s" + m.id} stream={peers[m.id].screen} onNeedTap={needTap} />)}

      {ringing && (
        <div className="call-ring" role="dialog" aria-label={`${ring.from.name} is calling`}>
          <div className="call-ring-card pop">
            <div className="call-pulse"><Face avatar={avatarOf(ring.from.id)} big /></div>
            <div className="call-ring-who">{ring.from.name}</div>
            <div className="call-ring-sub">{ring.members.length > 1 ? `is calling you — ${ring.members.length} in the call` : "is calling you…"}{call ? " · this ends your call" : ""}</div>
            <div className="call-ring-btns">
              <button type="button" className="call-btn red" onClick={C.decline} aria-label="Decline">✕</button>
              <button type="button" className="call-btn green" onClick={C.accept} aria-label="Accept"><Phone /></button>
            </div>
          </div>
        </div>
      )}

      {call && expanded && (
        <div className={`call-screen n${Math.max(1, seats)}${shown ? " sharing" : ""}${chatOpen ? " chatting" : ""}`} role="dialog" aria-label="Call">
          {call.phase === "outgoing" ? (
            <div className="call-stage">
              {local && cam ? <Vid stream={local} mirror={facing === "user"} className="call-full" turn={C.turn} /> : <Face avatar={avatarOf(call.first?.id)} big />}
              <div className="call-calling">
                <Face avatar={avatarOf(call.first?.id)} name={call.first?.name} />
                <div className="call-ring-sub">Calling…</div>
              </div>
            </div>
          ) : shown ? (
            <>
              <div className={`call-share${pseudo ? " pfull" : ""}`} ref={shareRef} onDoubleClick={big}>
                <Vid stream={shown} className="call-fit" />
                <div className="call-share-tag">🖥️ {sharer.name}'s screen</div>
                <button type="button" className="call-big" onClick={big} aria-label="Full screen">⛶</button>
                {/* full screen, the film fills the screen: the faces come with it, small, over the top corner — tap to tuck them away */}
                {(full || pseudo) && (
                  <button type="button" className={`call-share-faces${tucked ? " tucked" : ""}`} onClick={() => setTucked((x) => !x)}
                    aria-label={tucked ? "Show the faces" : "Tuck the faces away"}>
                    {tucked ? <span className="call-share-faces-chip">👥 {shownOthers.length + (showMe ? 1 : 0)}</span> : (
                      <>
                        {shownOthers.map((m) => {
                          const p = peers[m.id] || {};
                          const v = p.stream && p.cam !== false && !p.paused && p.stream.getVideoTracks().length > 0;
                          return (
                            <span className="call-share-face" key={m.id}>
                              {v ? <Vid stream={p.stream} className="call-full" turn={p.turn} /> : <span className="call-emoji">{avatarOf(m.id) || "🙂"}</span>}
                              <span className="call-mini-name">{m.name}{p.mic === false ? " 🔇" : ""}</span>
                            </span>
                          );
                        })}
                        {showMe && (
                          <span className="call-share-face">
                            {local && cam ? <Vid stream={local} mirror={facing === "user"} className="call-full" turn={C.turn} /> : <span className="call-emoji">🙂</span>}
                            <span className="call-mini-name">You{mic ? "" : " 🔇"}</span>
                          </span>
                        )}
                      </>
                    )}
                  </button>
                )}
              </div>
              {/* everyone's face beside the screen — theirs and mine — like Discord */}
              <div className="call-strip">
                {shownOthers.map((m) => {
                  const p = peers[m.id] || {};
                  const v = p.stream && p.cam !== false && !p.paused && p.stream.getVideoTracks().length > 0;
                  return (
                    <div className="call-mini-tile" key={m.id} title={m.name}>
                      {v ? <Vid stream={p.stream} className="call-full" turn={p.turn} /> : <span className="call-emoji">{avatarOf(m.id) || "🙂"}</span>}
                      <span className="call-mini-name">{m.name}{p.mic === false ? " 🔇" : ""}</span>
                    </div>
                  );
                })}
                {showMe && (
                  <div className="call-mini-tile me" title="You">
                    {local && cam ? <Vid stream={local} mirror={facing === "user"} className="call-full" turn={C.turn} /> : <span className="call-emoji">🙂</span>}
                    <span className="call-mini-name">You{mic ? "" : " 🔇"}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="call-grid">
              {others.map((m) => {
                const p = peers[m.id] || {};
                const showVid = p.stream && p.cam !== false && !p.paused && p.stream.getVideoTracks().length > 0;
                if (swap) {
                  // swapped: my own picture big; theirs is in the corner
                  return (
                    <div className="call-tile" key={m.id}>
                      {cam ? <Vid stream={local} mirror={facing === "user"} className="call-full" turn={C.turn} /> : <Face avatar="🙂" name="Camera off" big />}
                    </div>
                  );
                }
                return (
                  <div className="call-tile" key={m.id}>
                    {showVid && <Vid stream={p.stream} className="call-full" turn={p.turn} />}
                    {!showVid && <Face avatar={avatarOf(m.id)} name={seats > 1 ? m.name : null} big={seats === 1} />}
                    <div className="call-tag">{m.name}{p.mic === false ? " · 🔇" : ""}</div>
                    {(p.hold || m.away) ? (
                      <div className="call-weak hold"><b>⏸ On hold</b><span>{m.name} stepped away — the call carries on when they're back</span></div>
                    ) : p.link === "lost" ? <div className="call-weak">Reconnecting…</div> : null}
                    {p.link === "connecting" && !m.away && !p.hold && <div className="call-weak">Connecting…</div>}
                    {p.link === "blocked" && !m.away && !p.hold && (
                      <div className="call-weak blocked">
                        <b>Can't get through yet</b>
                        <span>Your networks are blocking a direct call. Still trying — switching one of you to Wi-Fi usually helps.</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {waiting.map((w) => (
                <div className="call-tile ringing" key={"w" + w.id}>
                  <div className="call-pulse"><Face avatar={avatarOf(w.id)} /></div>
                  <div className="call-tag">{w.name} · ringing…</div>
                </div>
              ))}
            </div>
          )}

          {call.phase === "active" && local && (
            <button type="button" className={`call-me${meDrag.pos ? " moved" : ""}`} style={meDrag.style}
              onPointerDown={(e) => meDrag.start(e)} onPointerMove={meDrag.move} onPointerUp={meDrag.end} onPointerCancel={meDrag.end}
              onClick={() => { if (meDrag.wasDrag()) return; if (canSwap) setSwapped((x) => !x); }}
              aria-label={canSwap ? (swap ? "Make them big" : "Make me big") : "Your camera"} disabled={!canSwap}>
              {swap
                ? (theirVid ? <Vid stream={peers[others[0].id].stream} className="call-full" turn={peers[others[0].id].turn} /> : <span className="call-emoji">{avatarOf(others[0].id) || "🙂"}</span>)
                : cam ? <Vid stream={local} mirror={facing === "user"} className="call-full" turn={C.turn} /> : <div className="call-me-off">📷 off</div>}
            </button>
          )}

          <div className="call-top">
            <button type="button" className="call-mini" onClick={minimise} aria-label="Shrink the call" title="Minimise — the call floats over your apps">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {active && room && (
              <button type="button" className="call-mini" onClick={() => setPicking(true)} aria-label="Add a friend to the call">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>
              </button>
            )}
            {active && others.length > 0 && (
              <button type="button" className="call-mini" onClick={() => { setFacesNote(""); setFacesOpen(true); }} aria-label="Choose whose faces you see"
                title="Choose whose faces you see in the mini screen">
                <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><circle cx="9" cy="8" r="3.4" fill="none" stroke="#fff" strokeWidth="2.4" /><path d="M2.8 19c.6-3.4 3.2-5.2 6.2-5.2s5.6 1.8 6.2 5.2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6.1M18.3 14.3c1.6.8 2.6 2.4 2.9 4.7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
                {hiddenN > 0 && <span className="call-badge" aria-hidden="true">{hiddenN}</span>}
              </button>
            )}
            {call.phase === "active" && <div className="call-time">{seats === 1 ? others[0].name + " · " : `${call.members.length} in the call · `}{clock(now - (call.startedAt || now))}</div>}
          </div>

          {screen && (
            <div className="call-sharing" role="status">
              🖥️ You're sharing your screen
              <button type="button" className="press p-coral sm" onClick={C.share}>Stop</button>
            </div>
          )}

          {tapForSound && (
            <button type="button" className="call-tap" onClick={() => { document.querySelectorAll("audio.call-sound").forEach((a) => a.play().catch(() => {})); setTapForSound(false); }}>
              🔊 Tap to hear them
            </button>
          )}

          <div className="call-bar">
            <button type="button" className={`call-btn${mic ? "" : " off"}`} onClick={C.toggleMic} aria-label={mic ? "Mute" : "Unmute"} aria-pressed={!mic}>{mic ? "🎤" : "🔇"}</button>
            {local && local.getVideoTracks().length > 0 && (
              <>
                <button type="button" className={`call-btn${cam ? "" : " off"}`} onClick={C.toggleCam} aria-label={cam ? "Camera off" : "Camera on"} aria-pressed={!cam}>{cam ? "📹" : "🚫"}</button>
                <button type="button" className="call-btn" onClick={C.flip} aria-label="Switch camera">🔄</button>
              </>
            )}
            {call.phase === "active" && (
              <button type="button" className={`call-btn${screen ? " off" : ""}${canShareScreen() ? "" : " cant"}`} onClick={C.share}
                aria-label={screen ? "Stop sharing your screen" : canShareScreen() ? "Share your screen" : "Screen sharing (needs a computer)"}
                aria-pressed={!!screen}>🖥️</button>
            )}
            {active && (
              <button type="button" className={`call-btn call-chat-btn${chatOpen ? " off" : ""}`} onClick={() => C.setChatOpen(!chatOpen)}
                aria-label={unread ? `Chat, ${unread} new` : "Chat"} aria-pressed={!!chatOpen}>
                💬{unread > 0 && <span className="call-badge">{unread > 9 ? "9+" : unread}</span>}
              </button>
            )}
            <button type="button" className="call-btn red" onClick={C.hangUp} aria-label={call.phase === "active" ? "Hang up" : "Cancel"}><Phone /></button>
          </div>

          {active && chatOpen && <ChatPanel chat={chat} onSend={C.sendChat} onClose={() => C.setChatOpen(false)} drag={chatDrag} />}
          {active && !chatOpen && peek && (
            <button type="button" className="call-peek" onClick={() => { setPeek(null); C.setChatOpen(true); }} aria-label="Open the chat">
              <b>{peek.name}</b> {peek.text}
            </button>
          )}

          {C.shareHelp && (
            <div className="call-pick" role="dialog" aria-label="Screen sharing needs a computer"
              onClick={(e) => { if (e.target === e.currentTarget) C.setShareHelp(false); }}>
              <div className="call-pick-card pop call-help">
                <div className="call-help-icon">🖥️</div>
                <b className="call-help-title">Screen sharing needs a computer</b>
                <p>Phone browsers — Chrome on Android, Safari on iPhone — don't let <i>any</i> website share your screen. Only installed apps like WhatsApp or Discord can. It's the phone's rule, not PlayRoom's.</p>
                <p className="call-help-how"><b>To share a film or a game:</b> join this call from a computer with Chrome or Edge, tap 🖥️ there, and pick a tab (tick “Share tab audio” for sound). Everyone can watch on their phones.</p>
                <button type="button" className="press p-sun" onClick={() => C.setShareHelp(false)}>Got it</button>
              </div>
            </div>
          )}

          {facesOpen && (
            <div className="call-pick" role="dialog" aria-label="Whose faces you see" onClick={(e) => { if (e.target === e.currentTarget) setFacesOpen(false); }}>
              <div className="call-pick-card pop">
                <div className="call-pick-head">
                  <b>Faces in the mini screen</b>
                  <button type="button" className="press p-white sm" onClick={() => setFacesOpen(false)} aria-label="Close">✕</button>
                </div>
                {[...others.map((m) => ({ key: String(m.id), name: m.name, avatar: avatarOf(m.id) || "🙂" })), { key: "me", name: "You", avatar: "🙂" }].map((f) => (
                  <button type="button" key={f.key} className={`call-pick-row call-face-row${seen(f.key) ? "" : " hidden"}`} onClick={() => toggleFace(f.key)}
                    aria-pressed={seen(f.key)} aria-label={`${seen(f.key) ? "Hide" : "Show"} ${f.name}`}>
                    <span className="call-emoji">{f.avatar}</span>
                    <span className="call-pick-name">{f.name}</span>
                    <span className="call-face-state">{seen(f.key) ? "👁 Showing" : "Hidden"}</span>
                  </button>
                ))}
                <div className="call-pick-note">{facesNote || "Also beside a shared screen and in the floating window. The call itself still shows everyone."}</div>
                <button type="button" className="press p-white sm full" onClick={() => { setFacesOpen(false); C.listMics(); }}>🎙️ Change microphone</button>
              </div>
            </div>
          )}

          {C.mics && (
            <div className="call-pick" role="dialog" aria-label="Choose a microphone" onClick={(e) => { if (e.target === e.currentTarget) C.setMics(null); }}>
              <div className="call-pick-card pop">
                <div className="call-pick-head">
                  <b>🎙️ Your microphone</b>
                  <button type="button" className="press p-white sm" onClick={() => C.setMics(null)} aria-label="Close">✕</button>
                </div>
                {C.mics.length === 0
                  ? <div className="call-pick-none">No microphone found. Check one is plugged in and allowed for this browser.</div>
                  : C.mics.map((m) => (
                    <button type="button" key={m.id} className={`call-pick-row call-face-row${m.on ? "" : " hidden"}`} onClick={() => C.chooseMic(m.id)}
                      aria-label={`Use ${m.label}`}>
                      <span className="call-emoji">🎙️</span>
                      <span className="call-pick-name">{m.label}</span>
                      {m.on && <span className="call-face-state">In use</span>}
                    </button>
                  ))}
                <div className="call-pick-note">Your friends can't hear you? Pick the microphone you talk into. On Windows, “Communications” is usually the one calls use.</div>
              </div>
            </div>
          )}

          {picking && (
            <div className="call-pick" role="dialog" aria-label="Add a friend" onClick={(e) => { if (e.target === e.currentTarget) setPicking(false); }}>
              <div className="call-pick-card pop">
                <div className="call-pick-head">
                  <b>Add to the call</b>
                  <button type="button" className="press p-white sm" onClick={() => setPicking(false)} aria-label="Close">✕</button>
                </div>
                {canAdd.length === 0
                  ? <div className="call-pick-none">None of your friends are online right now.</div>
                  : canAdd.map((f) => (
                    <button type="button" key={f.id} className="call-pick-row" disabled={!room}
                      onClick={() => { C.startCall(f); setPicking(false); }} aria-label={`Add ${f.username}`}>
                      <span className="call-emoji">{f.avatar || "🙂"}</span>
                      <span className="call-pick-name">{f.username}</span>
                      <span className="call-pick-go">📞</span>
                    </button>
                  ))}
                <div className="call-pick-note">Up to {CALL_MAX} in a call</div>
              </div>
            </div>
          )}
        </div>
      )}

      {call && !expanded && !floatsNow && (
        <div ref={bubbleEl} className={`call-bubble n${Math.min(4, (others.length ? Math.min(3, shownOthers.length) : 1) + (showMe ? 1 : 0))}`}
          style={{ "--bs": bscale, ...(pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : {}) }}
          onPointerDown={bubbleDown} onPointerMove={bubbleMove} onPointerUp={bubbleUp} onPointerCancel={() => { drag.current = null; }}
          role="button" aria-label="Open the call">
          {/* everyone's face: friends first, mine last */}
          {(others.length ? shownOthers.slice(0, 3) : [{ id: call.first?.id }]).map((m) => {
            const p = peers[m.id] || {};
            const v = p.stream && p.cam !== false && !p.paused && p.stream.getVideoTracks().length > 0;
            return (
              <div className="call-bubble-half" key={m.id ?? "first"}>
                {v ? <Vid stream={p.stream} className="call-full" turn={p.turn} /> : <span className="call-emoji">{avatarOf(m.id) || "🙂"}</span>}
              </div>
            );
          })}
          {showMe && (
            <div className="call-bubble-half me">
              {local && cam ? <Vid stream={local} mirror={facing === "user"} className="call-full" turn={C.turn} /> : <span className="call-emoji">🙂</span>}
            </div>
          )}
          <span className="call-bubble-grip" aria-label="Drag to make the call bigger or smaller" title="Drag to resize"
            onPointerDown={gripDown} onPointerMove={gripMove} onPointerUp={gripUp} onPointerCancel={gripUp} onClick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M1 5V1h4M1 1l5 5M11 7v4H7M11 11L6 6" fill="none" stroke="#2E2140" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </span>
          {unread > 0 && <span className="call-badge on-bubble">{unread > 9 ? "9+" : unread}</span>}
          <div className="call-bubble-tag">{shown ? "🖥️ " : ""}{call.phase === "active" ? clock(now - (call.startedAt || now)) : "Calling…"}{mic ? "" : " 🔇"}</div>
        </div>
      )}
    </div>
  );
}
