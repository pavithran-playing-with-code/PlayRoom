// src/components/CallYouTube.jsx — YouTube in a call: finding a video
// (YtBrowse: trending, a few shelves, search — routes/youtube.js asks
// YouTube) and playing it (YtPlayer: YouTube's own player, which CallWatch
// keeps in step with everyone's).
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api } from "../utils/api";
import { clockOf } from "../utils/watchSync";

// ── the player ────────────────────────────────────────────────────────────────
let apiReady = null;
function loadYt() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!apiReady) {
    apiReady = new Promise((resolve, reject) => {
      const before = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (before) before(); resolve(window.YT); };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => { apiReady = null; reject(new Error("YouTube didn't load")); };
      document.head.appendChild(s);
    });
  }
  return apiReady;
}

// YouTube's player, with the same handful of controls as a file's <video>
// (CallWatch steers either). `onState`: its state changed (-1 not started,
// 0 ended, 1 playing, 2 paused, 3 loading, 5 ready); `onFail`: it can't be
// played here (the owner doesn't allow it outside YouTube).
export const YtPlayer = forwardRef(function YtPlayer({ id, onState, onFail }, ref) {
  const box = useRef(null);
  const p = useRef(null);
  const ready = useRef(false);
  const cb = useRef({ onState, onFail }); cb.current = { onState, onFail };
  useImperativeHandle(ref, () => ({
    ok: () => ready.current,
    time: () => (ready.current ? p.current.getCurrentTime() || 0 : 0),
    state: () => (ready.current ? p.current.getPlayerState() : -1),
    paused() { const s = this.state(); return s !== 1 && s !== 3; },
    play: () => { if (ready.current) p.current.playVideo(); return Promise.resolve(); },
    pause: () => { if (ready.current) p.current.pauseVideo(); },
    seek: (t) => { if (ready.current) p.current.seekTo(t, true); },
    rate: () => {},
    fine: false,
  }), []);
  useEffect(() => {
    let gone = false;
    const el = document.createElement("div");
    box.current.appendChild(el);
    loadYt().then((YT) => {
      if (gone) return;
      p.current = new YT.Player(el, {
        videoId: id, width: "100%", height: "100%",
        playerVars: { playsinline: 1, controls: 0, rel: 0, modestbranding: 1, disablekb: 1, fs: 0, iv_load_policy: 3, autoplay: 0 },
        events: {
          onReady: () => { ready.current = true; cb.current.onState && cb.current.onState(5); },
          onStateChange: (e) => cb.current.onState && cb.current.onState(e.data),
          onError: (e) => cb.current.onFail && cb.current.onFail(e.data === 101 || e.data === 150 ? "The owner doesn't let this video play outside YouTube." : "YouTube couldn't play this video."),
        },
      });
      const f = p.current.getIframe && p.current.getIframe();
      if (f) f.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
    }).catch(() => cb.current.onFail && cb.current.onFail("YouTube didn't load. Check the connection."));
    return () => { gone = true; ready.current = false; try { p.current && p.current.destroy(); } catch { /* gone */ } p.current = null; };
  }, [id]);
  return <div className="yt-box" ref={box} />;
});

// ── finding a video ───────────────────────────────────────────────────────────
const SHELVES = [["", "🔥 Trending"], ["music", "🎵 Music"], ["films", "🎬 Films"], ["comedy", "😂 Comedy"], ["gaming", "🎮 Gaming"], ["sports", "🏏 Sports"]];
const views = (n) => (n >= 1e7 ? `${Math.round(n / 1e6)}M` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

export function YtBrowse({ onPick, onClose }) {
  const [shelf, setShelf] = useState("");
  const [q, setQ] = useState("");                  // what's typed
  const [query, setQuery] = useState("");          // what was searched (empty: a shelf)
  const [list, setList] = useState([]);
  const [next, setNext] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const asking = useRef(0);
  const end = useRef(null);
  const scroller = useRef(null);

  const load = useCallback(async (more) => {
    const n = ++asking.current;
    setBusy(true); setErr("");
    const page = more ? `&page=${encodeURIComponent(more)}` : "";
    const url = query ? `/api/youtube/search?q=${encodeURIComponent(query)}${page}` : `/api/youtube/trending?cat=${shelf}${page}`;
    try {
      const res = await api.get(url);
      const d = await res.json();
      if (n !== asking.current) return;
      if (!d.success) { setErr(d.message || "Couldn't load videos."); if (!more) setList([]); return; }
      setList((old) => (more ? [...old, ...d.videos.filter((v) => !old.some((o) => o.id === v.id))] : d.videos));
      setNext(d.next);
    } catch { if (n === asking.current) setErr("Couldn't reach the server."); }
    finally { if (n === asking.current) setBusy(false); }
  }, [query, shelf]);
  useEffect(() => { setList([]); setNext(null); if (scroller.current) scroller.current.scrollTop = 0; load(null); }, [load]);
  // more as you near the bottom; a search only on asking (each page of one spends the day's quota)
  useEffect(() => {
    const el = end.current;
    if (!el || !next || query) return undefined;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && !busy) load(next); }, { root: scroller.current, rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [next, busy, query, load]);

  return (
    <div className="yt-sheet" role="dialog" aria-label="YouTube" onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
      <form className="yt-head" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <button type="button" className="yt-back" onClick={onClose} aria-label="Close YouTube">✕</button>
        <input className="yt-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search YouTube" aria-label="Search YouTube"
          enterKeyHint="search" maxLength={100} autoComplete="off" />
        {query ? <button type="button" className="yt-clear" onClick={() => { setQ(""); setQuery(""); }} aria-label="Back to trending">↺</button>
          : <button type="submit" className="yt-go" aria-label="Search">🔍</button>}
      </form>
      {!query && (
        <div className="yt-shelves">
          {SHELVES.map(([k, label]) => (
            <button type="button" key={k || "top"} className={`chip${shelf === k ? " on" : ""}`} onClick={() => setShelf(k)} aria-pressed={shelf === k}>{label}</button>
          ))}
        </div>
      )}
      <div className="yt-list" ref={scroller}>
        {list.map((v) => (
          <button type="button" key={v.id} className="yt-card" onClick={() => onPick(v)} aria-label={`Watch ${v.title}`}>
            <span className="yt-thumb"><img src={v.thumb} alt="" loading="lazy" /><span className="yt-dur">{clockOf(v.dur)}</span></span>
            <span className="yt-meta"><b className="yt-title">{v.title}</b><span className="yt-sub">{v.ch}{v.views ? ` · ${views(v.views)} views` : ""}</span></span>
          </button>
        ))}
        {busy && <div className="yt-note">Loading…</div>}
        {!busy && err && <div className="yt-note">{err}</div>}
        {!busy && !err && !list.length && <div className="yt-note">Nothing here. Try another search.</div>}
        {query && next && !busy && <button type="button" className="press p-white sm yt-more" onClick={() => load(next)}>More results</button>}
        <div ref={end} className="yt-end" />
      </div>
    </div>
  );
}
