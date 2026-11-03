// src/components/CallWatch.jsx — a video everyone in the call watches
// together, on the stage where a shared screen would be.
//
// Everyone plays their own copy of the same file, so it's the file's own
// quality and nothing is sent but play / pause / where. The server keeps
// what's on (config/callWatch.js); this player steers itself to it
// (watchSync.js) every moment. Someone without the file yet is asked to
// pick their copy; a different file (another size) is caught.
import React, { useEffect, useRef, useState } from "react";
import { posAt, steer, clockOf, sizeOf } from "../utils/watchSync";

const HOLD_MS = 1500;           // after my own tap, wait this long for the server before steering again
const HIDE_MS = 3000;           // the controls fade while it plays

export default function CallWatch({ C, names, myId, shareRef, pseudo, onBig }) {
  const w = C.watch, f = C.watchFile;
  const v = useRef(null);
  const [anyway, setAnyway] = useState(false);     // a different file, watched anyway
  const [bad, setBad] = useState("");              // this phone can't play the file
  const [needTap, setNeedTap] = useState(false);   // the phone wants a tap before it plays sound
  const [shown, setShown] = useState(true);        // the controls
  const [drag, setDrag] = useState(null);          // the seek bar, while a finger's on it
  const [t, setT] = useState(0);
  const hold = useRef({ until: 0, rev: 0 });
  const hideT = useRef(null);
  const same = !!f && f.size === w.src.size;
  const playable = !!f && (same || anyway) && !bad;
  const fileUrl = f ? f.url : null;
  useEffect(() => { setAnyway(false); setBad(""); }, [w.src.size, fileUrl]);

  // steer my player to everyone's, now and every moment
  useEffect(() => {
    if (!playable) return undefined;
    const tick = () => {
      const el = v.current;
      if (!el || el.readyState < 1) return;
      setT(el.currentTime);
      if (Date.now() < hold.current.until && C.watch.rev <= hold.current.rev) return;
      const W = C.watch, target = posAt(W, C.serverNow());
      if (W.playing && el.paused && target < W.src.dur - 0.3) {
        const p = el.play();
        if (p && p.catch) p.then(() => setNeedTap(false)).catch(() => setNeedTap(true));
      } else if (!W.playing && !el.paused) el.pause();
      const { seek, rate } = steer(el.currentTime, target, W.playing && !el.paused);
      if (seek != null) el.currentTime = seek;
      if (el.playbackRate !== rate) el.playbackRate = rate;
    };
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [playable, w, C]);

  // the controls fade while it plays; a tap brings them back
  const poke = () => {
    setShown(true);
    clearTimeout(hideT.current);
    hideT.current = setTimeout(() => { if (C.watch && C.watch.playing) setShown(false); }, HIDE_MS);
  };
  useEffect(() => { poke(); return () => clearTimeout(hideT.current); }, [w.playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = (op, pos) => {
    hold.current = { until: Date.now() + HOLD_MS, rev: C.watch.rev };
    C.sendWatch({ op, pos });
  };
  const toggle = () => {
    const el = v.current;
    if (!el) return;
    poke();
    if (needTap) { el.play().then(() => setNeedTap(false)).catch(() => {}); if (w.playing) return; }
    if (w.playing) { el.pause(); mine("pause", el.currentTime); }
    else { el.play().catch(() => {}); mine("play", el.currentTime); }
  };
  const seekTo = (s) => {
    const el = v.current;
    if (el) el.currentTime = s;
    setDrag(null); poke();
    mine("seek", s);
  };

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const r = await C.pickWatchFile(file);
    if (!r.ok) setBad("This phone can't play that file.");
  };

  const by = w.by === myId ? "You" : names[w.by] || "Someone";
  const ready = (w.ready || []).map((id) => (id === myId ? "You" : names[id] || "Someone"));
  const cur = drag != null ? drag : t;

  return (
    <div className={`call-share cw${pseudo ? " pfull" : ""}`} ref={shareRef}>
      {playable ? (
        <>
          <video ref={v} className="call-fit" src={f.url} playsInline preload="auto" onClick={() => (shown && w.playing ? setShown(false) : poke())}
            onError={() => setBad("This phone can't play that file.")} />
          {needTap && <button type="button" className="cw-tap" onClick={toggle}>🔊 Tap to watch with sound</button>}
          <div className={`cw-ui${shown || !w.playing ? "" : " gone"}`} onPointerDown={poke}>
            <div className="cw-title">
              <span className="cw-name">🎬 {w.src.name}</span>
              <button type="button" className="cw-x" onClick={() => C.sendWatch({ op: "close" })} aria-label="Stop the video for everyone">✕</button>
            </div>
            <div className="cw-bar">
              <button type="button" className="cw-play" onClick={toggle} aria-label={w.playing ? "Pause for everyone" : "Play for everyone"}>
                {w.playing ? "⏸" : "▶"}
              </button>
              <input type="range" className="cw-seek" min={0} max={w.src.dur} step={0.5} value={Math.min(cur, w.src.dur)} aria-label="Where in the video"
                onChange={(e) => setDrag(Number(e.target.value))}
                onPointerUp={(e) => seekTo(Number(e.currentTarget.value))} onKeyUp={(e) => seekTo(Number(e.currentTarget.value))} />
              <span className="cw-time">{clockOf(cur)} / {clockOf(w.src.dur)}</span>
              <button type="button" className="cw-big" onClick={onBig} aria-label="Full screen">⛶</button>
            </div>
          </div>
        </>
      ) : (
        <div className="cw-card pop">
          <div className="cw-card-icon">🎬</div>
          <b className="cw-card-name">{w.src.name}</b>
          <div className="cw-card-sub">{by} put this on · {clockOf(w.src.dur)} · {sizeOf(w.src.size)}</div>
          {bad ? <div className="cw-warn">{bad} Try an .mp4 copy.</div>
            : f && !same ? (
              <div className="cw-warn">
                That's a different file ({sizeOf(f.size)}), so it won't line up. Pick the same file they have.
                <button type="button" className="press p-sun sm" onClick={() => setAnyway(true)}>Watch mine anyway</button>
              </div>
            ) : <div className="cw-card-how">Everyone plays their own copy, so it's full quality. Get the same file (sent on WhatsApp, say), then pick it here.</div>}
          <label className="press p-lime cw-pick">
            Pick my copy
            <input type="file" accept="video/*,.mkv,.mov,.mp4,.webm" onChange={pick} hidden />
          </label>
          <div className="cw-ready">Ready: {ready.join(", ") || "nobody yet"}</div>
          <button type="button" className="cw-link" onClick={() => C.sendWatch({ op: "close" })}>Stop the video for everyone</button>
        </div>
      )}
    </div>
  );
}
