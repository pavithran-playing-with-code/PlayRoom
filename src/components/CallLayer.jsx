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
import { useCall as useCallCtx, CALL_MAX } from "../utils/CallContext";
import { usePresence } from "../utils/PresenceContext";

const two = (n) => String(n).padStart(2, "0");
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${two(s % 60)}`; };

// A picture. Always silent: the sound is played by <Sound>, which stays put
// whether the call is full screen or shrunk to the bubble. Mine is mirrored,
// like a mirror.
function Vid({ stream, mirror = false, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream || null;
    if (stream) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
  }, [stream]);
  return <video ref={ref} className={`${className}${mirror ? " mirror" : ""}`} autoPlay playsInline muted />;
}

// A friend's voice. If the browser won't start sound without a tap, says so.
function Sound({ stream, onNeedTap }) {
  const ref = useRef(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    if (a.srcObject !== stream) a.srcObject = stream || null;
    if (stream) { const p = a.play(); if (p && p.catch) p.catch(() => onNeedTap && onNeedTap()); }
  }, [stream, onNeedTap]);
  return <audio ref={ref} className="call-sound" autoPlay />;
}

// a white handset: the 📞 emoji is red itself, and vanishes on a red button
const Phone = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <path fill="#fff" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
  </svg>
);

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
  const { call, ring, local, peers, mic, cam, facing, notice, expanded, screen } = C;
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
  useEffect(() => { if (!call) { setTapForSound(false); setPicking(false); } }, [call]);

  // the bubble: drag it out of the way
  const [pos, setPos] = useState(null);
  const drag = useRef(null);
  const bubbleDown = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const bubbleMove = (e) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) d.moved = true;
    if (!d.moved) return;
    const w = e.currentTarget.offsetWidth, h = e.currentTarget.offsetHeight;
    setPos({ x: Math.max(4, Math.min(window.innerWidth - w - 4, e.clientX - d.dx)), y: Math.max(4, Math.min(window.innerHeight - h - 4, e.clientY - d.dy)) });
  };
  const bubbleUp = (e) => {
    const d = drag.current; drag.current = null;
    if (d && d.id === e.pointerId && !d.moved) C.setExpanded(true);
  };

  const others = call ? call.members.filter((m) => m.id !== C.myId) : [];
  // friends still being rung into the call: a tile each, "Ringing…"
  const waiting = call && call.phase === "active" ? call.invited.map((id) => ({ id, name: call.names[id] || "Friend" })) : [];
  const seats = others.length + waiting.length;
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
        const v = el.querySelector("video");
        if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen();       // iPhone: the video itself goes full screen
      }
    } catch { /* stays as it is */ }
  };
  const canAdd = friends.filter((f) => f.online && !call?.members.some((m) => m.id === Number(f.id)) && !call?.invited.includes(Number(f.id)));
  const needTap = React.useCallback(() => setTapForSound(true), []);
  const ringing = ring && (!call || call.id !== ring.callId);

  return (
    <>
      {notice && !ringing && <div className="call-notice" role="status">{notice.text}</div>}
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
        <div className={`call-screen n${Math.max(1, seats)}${shown ? " sharing" : ""}`} role="dialog" aria-label="Call">
          {call.phase === "outgoing" ? (
            <div className="call-stage">
              {local && cam ? <Vid stream={local} mirror={facing === "user"} className="call-full" /> : <Face avatar={avatarOf(call.first?.id)} big />}
              <div className="call-calling">
                <Face avatar={avatarOf(call.first?.id)} name={call.first?.name} />
                <div className="call-ring-sub">Calling…</div>
              </div>
            </div>
          ) : shown ? (
            <>
              <div className="call-share" ref={shareRef} onDoubleClick={big}>
                <Vid stream={shown} className="call-fit" />
                <div className="call-share-tag">🖥️ {sharer.name}'s screen</div>
                <button type="button" className="call-big" onClick={big} aria-label="Full screen">⛶</button>
              </div>
              <div className="call-strip">
                {others.map((m) => {
                  const p = peers[m.id] || {};
                  const v = p.stream && p.cam !== false && p.stream.getVideoTracks().length > 0;
                  return (
                    <div className="call-mini-tile" key={m.id} title={m.name}>
                      {v ? <Vid stream={p.stream} className="call-full" /> : <span className="call-emoji">{avatarOf(m.id) || "🙂"}</span>}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="call-grid">
              {others.map((m) => {
                const p = peers[m.id] || {};
                const showVid = p.stream && p.cam !== false && p.stream.getVideoTracks().length > 0;
                return (
                  <div className="call-tile" key={m.id}>
                    {showVid && <Vid stream={p.stream} className="call-full" />}
                    {!showVid && <Face avatar={avatarOf(m.id)} name={seats > 1 ? m.name : null} big={seats === 1} />}
                    <div className="call-tag">{m.name}{p.mic === false ? " · 🔇" : ""}</div>
                    {(p.link === "lost" || m.away) && <div className="call-weak">Reconnecting…</div>}
                    {p.link === "connecting" && !m.away && <div className="call-weak">Connecting…</div>}
                    {p.link === "blocked" && !m.away && (
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
            <div className="call-me">
              {cam ? <Vid stream={local} mirror={facing === "user"} className="call-full" /> : <div className="call-me-off">📷 off</div>}
            </div>
          )}

          <div className="call-top">
            <button type="button" className="call-mini" onClick={() => C.setExpanded(false)} aria-label="Shrink the call">⌄</button>
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
              <button type="button" className={`call-btn${screen ? " off" : ""}`} onClick={C.share}
                aria-label={screen ? "Stop sharing your screen" : "Share your screen"} aria-pressed={!!screen}>🖥️</button>
            )}
            {call.phase === "active" && room && (
              <button type="button" className="call-btn" onClick={() => setPicking(true)} aria-label="Add a friend to the call">➕</button>
            )}
            <button type="button" className="call-btn red" onClick={C.hangUp} aria-label={call.phase === "active" ? "Hang up" : "Cancel"}><Phone /></button>
          </div>

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

      {call && !expanded && (
        <div className="call-bubble" style={pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined}
          onPointerDown={bubbleDown} onPointerMove={bubbleMove} onPointerUp={bubbleUp} onPointerCancel={() => { drag.current = null; }}
          role="button" aria-label="Open the call">
          {shown
            ? <Vid stream={shown} className="call-fit" />
            : others[0] && peers[others[0].id]?.stream && peers[others[0].id]?.cam !== false
            ? <Vid stream={peers[others[0].id].stream} className="call-full" />
            : <Face avatar={avatarOf(others[0]?.id || call.first?.id)} />}
          <div className="call-bubble-tag">{call.phase === "active" ? clock(now - (call.startedAt || now)) : "Calling…"}{mic ? "" : " 🔇"}</div>
        </div>
      )}
    </>
  );
}
