// src/components/CallWatch.jsx — a video everyone in the call watches
// together, on the stage where a shared screen would be: a file, or YouTube.
//
// Nothing of the video is sent between phones. A file: everyone plays their
// own copy of the same one (its own quality). YouTube: everyone's own
// YouTube player. The server keeps what's on and where (config/callWatch.js);
// this steers the player to it (watchSync.js) every moment.
//
// A player that's stuck — YouTube showing someone an ad, still loading, or a
// phone waiting for a tap before it plays sound — asks everyone to wait
// ("wait"); once it moves, it says "go" and all carry on together.
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { posAt, steer, clockOf, sizeOf } from "../utils/watchSync";
import { YtPlayer, YtBrowse } from "./CallYouTube";

const HOLD_MS = 1500;           // after my own tap, wait this long for the server before steering again
const HIDE_MS = 3000;           // the controls fade while it plays
const STUCK_MS = 2500;          // meant to be playing and hasn't moved for this long: ask everyone to wait
const WAIT_GAP_MS = 6000;       // and not more often than this
const MAX_WAITS = 2;            // a player that asked twice and still lags just catches up by jumping
const JUMP_GAP_YT_MS = 3000;    // YouTube, after a jump, gets this long to load before another
const SILENT_MS = 1500;         // YouTube that won't start (no tap yet) starts silent after this

// A file's <video>, with the same handful of controls as YouTube's player.
const FilePlayer = forwardRef(function FilePlayer({ url, onFail }, ref) {
  const v = useRef(null);
  useImperativeHandle(ref, () => ({
    ok: () => !!v.current && v.current.readyState >= 1,
    time: () => (v.current ? v.current.currentTime : 0),
    state: () => (!v.current ? -1 : v.current.ended ? 0 : v.current.paused ? 2 : 1),
    paused: () => !v.current || v.current.paused,
    play: () => (v.current ? v.current.play() : Promise.resolve()),
    pause: () => v.current && v.current.pause(),
    seek: (t) => { if (v.current) v.current.currentTime = t; },
    rate: (r) => { if (v.current && v.current.playbackRate !== r) v.current.playbackRate = r; },
    busy: () => false,
    fine: true,
  }), []);
  return <video ref={v} className="call-fit" src={url} playsInline preload="auto" onError={() => onFail("This phone can't play that file.")} />;
});

export default function CallWatch({ C, names, myId, shareRef, pseudo, full, onBig, faces, onPickYt }) {
  const w = C.watch, f = C.watchFile, yt = w.src.kind === "yt";
  const player = useRef(null);
  const [anyway, setAnyway] = useState(false);     // a different file, watched anyway
  const [bad, setBad] = useState("");              // this phone can't play it
  const [needTap, setNeedTap] = useState(false);   // the phone wants a tap before it plays
  const [silent, setSilent] = useState(false);     // YouTube started muted (the phone wouldn't with sound)
  const [shown, setShown] = useState(true);        // the controls
  const [drag, setDrag] = useState(null);          // the seek bar, while a finger's on it
  const [t, setT] = useState(0);
  const hold = useRef({ until: 0, rev: 0 });
  const hideT = useRef(null);
  const seen = useRef({ t: -1, at: 0, waited: 0, stillSince: 0 });
  const same = yt || (!!f && f.size === w.src.size);
  const fileUrl = f ? f.url : null;
  const playable = (yt || (!!f && (same || anyway))) && !bad;
  useEffect(() => {
    setAnyway(false); setBad(""); setNeedTap(false); setSilent(false);
    Object.assign(seen.current, { waits: 0, wantSince: 0, mutedOnce: false, soundAsked: false });
  }, [w.src.size, w.src.id, fileUrl]);

  // steer my player to everyone's, now and every moment
  useEffect(() => {
    if (!playable) return undefined;
    const tick = () => {
      const p = player.current;
      if (!p || !p.ok()) return;
      const W = C.watch, now = p.time(), at = Date.now(), S = seen.current;
      setT(now);
      // a jump made with YouTube's own bar (not ours, not an ad standing still)
      if (yt && S.pt != null && !p.busy() && !W.hold && Math.abs(now - S.pt) > 1) {
        const expect = S.pt + (p.state() === 1 ? ((at - S.pat) / 1000) * (W.rate || 1) : 0);
        if (Math.abs(now - expect) > 2.5) { S.pt = now; S.pat = at; S.t = now; S.stillSince = at; mineRef.current("seek", now); return; }
      }
      S.pt = now; S.pat = at;
      const moved = Math.abs(now - S.t) > 0.15;
      if (moved || S.t < 0) { S.t = now; S.stillSince = at; }
      const still = at - S.stillSince;
      // A phone won't let YouTube start with sound until someone taps the
      // video itself — so it starts silent (always allowed) and in step, and
      // a button offers the sound. Before, it sat there, everyone waited.
      const shouldPlay = W.hold === myId || (W.playing && posAt(W, C.serverNow()) < W.src.dur - 0.3);
      if (!(shouldPlay && p.paused())) S.wantSince = 0;
      else if (!S.wantSince) S.wantSince = at;
      if (yt && shouldPlay && p.paused() && S.wantSince && at - S.wantSince > SILENT_MS && !S.mutedOnce && !S.soundAsked) {
        S.mutedOnce = true; p.mute(); p.play(); setSilent(true); setNeedTap(false);
      }
      if (silent && yt && !p.muted()) setSilent(false);
      // I'm the one everyone's waiting for: keep my player going (an ad
      // plays out; a tap may be needed), and once it moves, carry on
      if (W.hold === myId) {
        if (p.paused()) p.play().catch(() => setNeedTap(true));
        if (yt && still > 1200 && [-1, 2, 5].includes(p.state())) setNeedTap(true);
        if (!p.paused()) setNeedTap(false);
        if (moved && p.state() === 1) C.sendWatch({ op: "go", pos: now });
        return;
      }
      if (Date.now() < hold.current.until && W.rev <= hold.current.rev) return;
      if (yt && !p.busy() && p.speed() !== (W.rate || 1)) p.setSpeed(W.rate || 1);   // the speed everyone's at
      const target = posAt(W, C.serverNow());
      const wantPlay = W.playing && target < W.src.dur - 0.3;
      if (!wantPlay) S.stillSince = at;                  // standing still is only "stuck" while it should play
      if (wantPlay && p.paused()) {
        p.play().then(() => setNeedTap(false)).catch(() => setNeedTap(true));
        if (yt && still > 1200 && [-1, 2, 5].includes(p.state())) setNeedTap(true);
      } else if (!W.playing && !p.paused() && !(yt && p.state() === 3 && !p.busy())) p.pause();
      // (YouTube loading by itself is someone's tap on its ▶, about to play:
      // pausing it there cancelled every tap — a black player, and nothing
      // sent to the others. Once it plays, onYtState tells everyone.)
      if (!p.paused()) setNeedTap(false);
      // meant to be playing, not moving: hold everyone till I catch up
      if (wantPlay && !W.hold && still > STUCK_MS && at - S.waited > WAIT_GAP_MS && p.state() !== 0 && (S.waits || 0) < MAX_WAITS) {
        S.waited = at; S.waits = (S.waits || 0) + 1;
        C.sendWatch({ op: "wait", pos: now });
        return;
      }
      const { seek, rate } = steer(now, target, W.playing && !p.paused(), p.fine);
      // (a jump that doesn't take — YouTube showing an ad ignores it — isn't
      // tried again at once, and doesn't count as moving: that's how a stuck
      // player is noticed)
      // YouTube is only jumped while it's actually playing or paused, and not
      // again for a while: a jump while it loads starts the loading over, and
      // on a slow link that was a black player for good
      const loading = yt && [-1, 3, 5].includes(p.state());
      const since = at - (S.jumped || 0);
      const may = yt ? !loading && since > JUMP_GAP_YT_MS : still < 1000 || since > 2000;
      if (seek != null && may) { S.jumped = at; p.seek(seek); }
      p.rate(rate);
    };
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [playable, w, C, myId, yt, silent]);

  // the controls fade while it plays; a tap brings them back
  const poke = () => {
    setShown(true);
    clearTimeout(hideT.current);
    hideT.current = setTimeout(() => { if (C.watch && C.watch.playing) setShown(false); }, HIDE_MS);
  };
  useEffect(() => { poke(); return () => clearTimeout(hideT.current); }, [w.playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // YouTube's own play and pause buttons: for everyone
  const onYtState = (st) => {
    const p = player.current, W = C.watch;
    if (!p || !W || !p.ok() || p.busy() || W.hold) return;
    if (st === 1 && !W.playing) mine("play", p.time());
    else if (st === 2 && W.playing) mine("pause", p.time());
  };
  const mineRef = useRef(null);
  // YouTube's ⚙️ speed: for everyone
  const onYtRate = (r) => {
    const p = player.current, W = C.watch;
    if (!p || !W || p.busy() || r === (W.rate || 1)) return;
    hold.current = { until: Date.now() + HOLD_MS, rev: W.rev };
    C.sendWatch({ op: "rate", rate: r, pos: p.time() });
  };
  const putOn = (v) => C.sendWatch({ op: "open", src: { kind: "yt", id: v.id, title: v.title, ch: v.ch, dur: v.dur } });
  const mine = (op, pos) => {
    hold.current = { until: Date.now() + HOLD_MS, rev: C.watch.rev };
    C.sendWatch({ op, pos });
  };
  mineRef.current = mine;
  const sound = () => {
    const p = player.current;
    if (!p) return;
    seen.current.soundAsked = true;
    p.unMute(); p.play();
    setSilent(false);
  };
  const toggle = () => {
    const p = player.current;
    if (!p) return;
    poke();
    if (needTap) { p.play().then(() => setNeedTap(false)).catch(() => {}); if (w.playing || w.hold) return; }
    if (w.playing) { p.pause(); mine("pause", p.time()); }
    else { p.play().catch(() => {}); mine("play", p.time()); }
  };
  const seekTo = (s) => {
    const p = player.current;
    if (p) p.seek(s);
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

  const who = (id) => (id === myId ? "You" : names[id] || "Someone");
  const ready = (w.ready || []).map(who);
  const cur = drag != null ? drag : t;
  const waitingOn = w.hold && w.hold !== myId ? who(w.hold) : null;
  // YouTube's own buttons (Skip ad) must be tappable while it's me it shows an ad to
  const coverYt = yt && w.hold !== myId;

  if (yt) {
    return (
      <div className={`call-share cw cw-yt${pseudo ? " pfull" : ""}${full || pseudo ? " big" : ""}`} ref={shareRef}>
        <div className="cw-yt-top">
          <span className="cw-name">▶️ {w.src.name}{w.src.ch ? <small> · {w.src.ch}</small> : null}</span>
          {/* our full screen, not YouTube's: theirs is the player alone, with no faces */}
          <button type="button" className="cw-x" onClick={onBig} aria-label={full || pseudo ? "Leave full screen" : "Full screen"}>⛶</button>
          <button type="button" className="cw-x" onClick={() => C.sendWatch({ op: "close" })} aria-label="Stop the video for everyone">✕</button>
        </div>
        <div className="cw-yt-player">
          {bad ? <div className="cw-yt-bad">{bad}<small>Pick another video below.</small></div>
            : <YtPlayer ref={player} id={w.src.id} onFail={setBad} onState={onYtState} onRate={onYtRate} />}
          {/* a phone only lets YouTube start after a tap on YouTube's own ▶ — so ask for that, without covering it */}
          {needTap && !bad && !waitingOn && !silent && <div className="cw-wait cw-hint" role="status">👆 Tap ▶ on the video to join in</div>}
          {silent && !bad && !waitingOn && <button type="button" className="cw-wait cw-sound" onClick={sound}>🔇 Tap for sound</button>}
          {waitingOn && <div className="cw-wait">⏳ Waiting for {waitingOn}… <button type="button" onClick={() => mine("play", player.current ? player.current.time() : w.pos)}>Play anyway</button></div>}
          {w.hold === myId && !needTap && <div className="cw-wait">⏳ The others are waiting for you</div>}
        </div>
        <YtBrowse docked playing={w.src.id} onPick={putOn} />
        {faces}
      </div>
    );
  }

  return (
    <div className={`call-share cw${pseudo ? " pfull" : ""}`} ref={shareRef}>
      {playable ? (
        <>
          {yt ? <YtPlayer ref={player} id={w.src.id} onFail={setBad} onState={() => {}} />
            : <FilePlayer ref={player} url={f.url} onFail={setBad} />}
          {/* a tap on the picture shows or hides the controls; it never pauses it for everyone */}
          {(coverYt || !yt) && <div className="cw-cover" onClick={() => (shown && w.playing ? setShown(false) : poke())} />}
          {needTap && <button type="button" className="cw-tap" onClick={toggle}>🔊 Tap to watch with sound</button>}
          {waitingOn && <div className="cw-wait">⏳ Waiting for {waitingOn}… <button type="button" onClick={() => mine("play", player.current ? player.current.time() : w.pos)}>Play anyway</button></div>}
          {w.hold === myId && <div className="cw-wait">⏳ Catching up: the others are waiting for you</div>}
          {faces}
          <div className={`cw-ui${shown || !w.playing ? "" : " gone"}`} onPointerDown={poke}>
            <div className="cw-title">
              <span className="cw-name">{yt ? "▶️" : "🎬"} {w.src.name}{yt && w.src.ch ? <small> · {w.src.ch}</small> : null}</span>
              {yt && onPickYt && <button type="button" className="cw-x" onClick={onPickYt} aria-label="Pick another YouTube video">🔍</button>}
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
          <div className="cw-card-icon">{yt ? "▶️" : "🎬"}</div>
          <b className="cw-card-name">{w.src.name}</b>
          <div className="cw-card-sub">{who(w.by)} put this on · {clockOf(w.src.dur)}{yt ? "" : ` · ${sizeOf(w.src.size)}`}</div>
          {yt ? <div className="cw-warn">{bad}{onPickYt && <button type="button" className="press p-sun sm" onClick={onPickYt}>Pick another video</button>}</div>
            : bad ? <div className="cw-warn">{bad} Try an .mp4 copy.</div>
            : f && !same ? (
              <div className="cw-warn">
                That's a different file ({sizeOf(f.size)}), so it won't line up. Pick the same file they have.
                <button type="button" className="press p-sun sm" onClick={() => setAnyway(true)}>Watch mine anyway</button>
              </div>
            ) : <div className="cw-card-how">Everyone plays their own copy, so it's full quality. Get the same file (sent on WhatsApp, say), then pick it here.</div>}
          {!yt && (
            <label className="press p-lime cw-pick">
              Pick my copy
              <input type="file" accept="video/*,.mkv,.mov,.mp4,.webm" onChange={pick} hidden />
            </label>
          )}
          {!yt && <div className="cw-ready">Ready: {ready.join(", ") || "nobody yet"}</div>}
          <button type="button" className="cw-link" onClick={() => C.sendWatch({ op: "close" })}>Stop the video for everyone</button>
        </div>
      )}
    </div>
  );
}
