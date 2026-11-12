// src/pages/Player.jsx
// PlayRoom Player: watch a video from your phone, no call needed. It plays
// what phone browsers can't on their own — Dolby / DTS sound is decoded the
// way VLC does (utils/filmSound.js), any of the file's sound tracks can be
// picked, and its text subtitles shown — with a phone player's gestures:
//   • tap: show / hide the controls
//   • double-tap the left or right half: back / forward 10 s
//   • swipe up or down on the left half: brightness; on the right: volume
//   • swipe sideways: scrub through the film
// It remembers where you were in each file and offers to carry on, keeps
// the screen awake while it plays, and goes full screen (sideways for a
// wide film). Nothing leaves the phone: the file is read where it is.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openFilm, dolbyLike, soundMissing, warmDecoder } from "../utils/filmSound";
import { isInstalled } from "../components/LandscapeGate";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const fmt = (t) => {
  if (!Number.isFinite(t)) return "0:00";
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const resumeKey = (f) => `pr_resume:${f.name}:${f.size}`;
const getResume = (f) => { try { return Number(localStorage.getItem(resumeKey(f))) || 0; } catch { return 0; } };
const setResume = (f, t) => { try { if (t > 0) localStorage.setItem(resumeKey(f), String(Math.round(t))); else localStorage.removeItem(resumeKey(f)); } catch { /* private */ } };

export default function Player() {
  const nav = useNavigate();
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState("");
  const vRef = useRef(null), stageRef = useRef(null), inputRef = useRef(null);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ui, setUi] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [bright, setBright] = useState(1);
  const [level, setLevel] = useState(null);        // { kind: "b" | "v" | "seek" | "skip", v, text }
  const [note, setNote] = useState(null);           // a passing line
  const [menu, setMenu] = useState(null);           // "tracks" | "speed"
  const [tracks, setTracks] = useState(null);       // { audio, subs } once read
  const [audioN, setAudioN] = useState(null);
  const [subN, setSubN] = useState(null);
  const [cues, setCues] = useState(null);
  const [subText, setSubText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [resume, setResumeAt] = useState(0);
  const F = useRef(null);                            // the file opened by ffmpeg (a promise)
  const snd = useRef(null);                          // the decoded sound, when in use
  const hideT = useRef(0), noteT = useRef(0), levelT = useRef(0);

  // for tests (and a curious friend's console): the decoder's numbers, the taps
  const taps = useRef([]);
  useEffect(() => { window.__pl = { stats: () => (snd.current ? snd.current.stats() : null), taps: () => taps.current.slice() }; return () => { delete window.__pl; }; }, []);
  const say = useCallback((text, ms = 2200) => { clearTimeout(noteT.current); setNote(text); noteT.current = setTimeout(() => setNote(null), ms); }, []);
  const poke = useCallback(() => {
    setUi(true); clearTimeout(hideT.current);
    hideT.current = setTimeout(() => { const v = vRef.current; if (v && !v.paused) setUi(false); }, 3200);
  }, []);
  const showLevel = (l) => { clearTimeout(levelT.current); setLevel(l); levelT.current = setTimeout(() => setLevel(null), 700); };

  // ── a file picked ──
  const pick = (f) => {
    if (!f) return;
    close();
    // Dolby sound: start reading the file's tracks at once, while the picture loads
    dolbyLike(f).then((d) => { if (d && !F.current) { warmDecoder(); F.current = openFilm(f).catch((e) => { F.current = null; throw e; }); } });
    setErr(""); setFile(f); setUrl(URL.createObjectURL(f));
    setTracks(null); setAudioN(null); setSubN(null); setCues(null); setSpeed(1);
  };
  const close = () => {
    subTok.current++;
    if (turned.current) { turned.current = false; try { window.screen.orientation.unlock(); } catch { /* fine */ } }
    if (snd.current) { snd.current.stop(); snd.current = null; }
    if (F.current) { F.current.then((x) => x.close()).catch(() => {}); F.current = null; }
    if (url) URL.revokeObjectURL(url);
    setUrl(null); setWaiting(false);
  };
  useEffect(() => () => { if (snd.current) snd.current.stop(); if (F.current) F.current.then((x) => x.close()).catch(() => {}); }, []);
  const tracksOf = useCallback(() => {
    if (!file) return Promise.reject(new Error("no file"));
    if (!F.current) F.current = openFilm(file).catch((e) => { F.current = null; throw e; });
    return F.current;
  }, [file]);
  // the film's sound from now on: track n, decoded here
  // `start`: the film hasn't begun — it begins when its sound is ready, never before
  const pickAudio = useCallback(async (n, quiet, start = false) => {
    const v = vRef.current;
    if (!v) return;
    try {
      const X = await tracksOf();
      const s = await X.sound(n, v, { onWait: setWaiting, start });
      if (snd.current) snd.current.stop();
      snd.current = s; setAudioN(n);
      if (!quiet) say(`🔊 ${X.audio[n] ? X.audio[n].label : "Sound"}`);
    } catch { say("Couldn't play that sound track — check the connection (the decoder loads once)"); }
  }, [tracksOf, say]);
  const subTok = useRef(0);                         // which pick of subtitles is the current one
  const pickSubs = useCallback(async (n) => {
    const tok = ++subTok.current;
    if (n === null) { setSubN(null); setCues(null); return; }
    say("💬 Loading subtitles…", 6000);
    try {
      const X = await tracksOf();
      // the stretch the film is in comes first, the rest of the film after it
      const c = await X.subtitles(n, {
        where: () => (vRef.current ? vRef.current.currentTime : 0),
        alive: () => subTok.current === tok,
        onPart: (l) => { if (subTok.current === tok) setCues(l); },
      });
      if (subTok.current !== tok) return;
      if (!c) { say("Couldn't read those subtitles"); return; }
      setSubN(n); setCues(c); say(`💬 ${X.subs[n].label}`);
    } catch { say("Couldn't read those subtitles"); }
  }, [tracksOf, say]);

  // ── the video's events ──
  const onLoaded = async () => {
    const v = vRef.current;
    setDur(v.duration || 0);
    const r = getResume(file);
    if (r > 30 && r < (v.duration || 0) - 30) { v.currentTime = r; setResumeAt(r); setTimeout(() => setResumeAt(0), 6000); }
    v.playbackRate = speed;
    poke();
    // Dolby / DTS sound (the browser plays it silent, and Chrome on Android
    // even says it's playing it): decode it ourselves, and don't start the
    // picture until its sound is ready — never a silent first scene.
    const f = file;
    const dolby = await dolbyLike(f);
    if (vRef.current !== v || f !== file) return;
    if (!dolby) { try { await v.play(); } catch { /* the ▶ starts it */ } }
    if (dolby || (await soundMissing(v))) {
      if (vRef.current !== v || snd.current) return;
      if (dolby) setWaiting(true);
      try {
        const X = await tracksOf();
        setTracks({ audio: X.audio, subs: X.subs });
        if (X.audio.length) await pickAudio((X.audio.find((a) => a.def) || X.audio[0]).n, true, dolby);
        else if (dolby) { setWaiting(false); v.play().catch(() => {}); }
      } catch {
        say("Couldn't load the sound decoder — check the connection and open the video again", 5000);
        if (dolby) { setWaiting(false); v.play().catch(() => {}); }
      }
    }
  };
  useEffect(() => {
    const v = vRef.current;
    if (!v || !url) return undefined;
    let last = 0;
    const tick = () => {
      setT(v.currentTime);
      if (Math.abs(v.currentTime - last) > 5) { last = v.currentTime; setResume(file, v.currentTime > (v.duration || 0) - 20 ? 0 : v.currentTime); }
    };
    const on = () => { setPlaying(!v.paused); };
    v.addEventListener("timeupdate", tick); v.addEventListener("play", on); v.addEventListener("pause", on); v.addEventListener("ended", on);
    return () => { v.removeEventListener("timeupdate", tick); v.removeEventListener("play", on); v.removeEventListener("pause", on); v.removeEventListener("ended", on); };
  }, [url, file]);
  // the subtitle line
  useEffect(() => {
    if (!cues) { setSubText(""); return undefined; }
    const id = setInterval(() => {
      const v = vRef.current; if (!v) return;
      const now = v.currentTime;
      setSubText(cues.filter((c) => c.a <= now && now < c.b).map((c) => c.text).join("\n"));
    }, 150);
    return () => clearInterval(id);
  }, [cues]);
  // keep the screen awake while it plays
  useEffect(() => {
    if (!playing || !navigator.wakeLock) return undefined;
    let lock = null, gone = false;
    navigator.wakeLock.request("screen").then((l) => { if (gone) l.release(); else lock = l; }).catch(() => {});
    return () => { gone = true; if (lock) lock.release().catch(() => {}); };
  }, [playing]);

  // ── controls ──
  const toggle = () => { const v = vRef.current; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause(); poke(); };
  const skip = (d) => {
    const v = vRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.5, v.currentTime + d));
    showLevel({ kind: "skip", text: d > 0 ? `⏩ +${d}s` : `⏪ ${d}s`, side: d > 0 ? "right" : "left" });
  };
  const setVolume = (x) => { const v = vRef.current; if (snd.current) snd.current.setVolume(x); else if (v) v.volume = x; };
  const getVolume = () => { const v = vRef.current; return snd.current ? snd.current.volume() : v ? v.volume : 1; };
  const turned = useRef(false);                     // the installed app: the film is held sideways by ⛶
  const full = async () => {
    const el = stageRef.current;
    // The installed app has the whole screen already and never asks the
    // browser for full screen (Chrome answers with a notice no page can turn
    // off): ⛶ there turns the film sideways and back.
    if (isInstalled()) {
      const o = window.screen.orientation;
      try {
        if (turned.current) { turned.current = false; o.unlock(); }
        else { await o.lock("landscape"); turned.current = true; }
      } catch { /* not on this phone */ }
      return;
    }
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      await el.requestFullscreen();
      const v = vRef.current;
      if (v && v.videoWidth > v.videoHeight && window.screen.orientation && window.screen.orientation.lock) await window.screen.orientation.lock("landscape").catch(() => {});
    } catch { /* not here */ }
  };
  useEffect(() => {
    const key = (e) => {
      if (!url || e.target.tagName === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.code === "ArrowRight") skip(10);
      else if (e.code === "ArrowLeft") skip(-10);
      else if (e.code === "KeyF") full();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // ── gestures: tap, double-tap, swipes ──
  const g = useRef(null), lastTap = useRef({ t: 0, x: 0 }), tapT = useRef(0);
  const down = (e) => {
    if (e.target.closest && e.target.closest("button, input, .pl-menu")) return;
    const r = stageRef.current.getBoundingClientRect();
    g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, w: r.width, h: r.height, side: e.clientX - r.left < r.width / 2 ? "b" : "v", mode: null, from: 0, t0: vRef.current ? vRef.current.currentTime : 0 };
  };
  const move = (e) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x0, dy = s.y0 - e.clientY;
    if (!s.mode) {
      if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx) * 1.5) { s.mode = s.side; s.y0 = e.clientY; s.from = s.side === "b" ? bright : getVolume(); }
      else if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy) * 1.5) { s.mode = "seek"; s.x0 = e.clientX; }
      return;
    }
    if (s.mode === "seek") {
      const d = Math.round(((e.clientX - s.x0) / s.w) * 120);
      const to = Math.max(0, Math.min(dur || 0, s.t0 + d));
      s.to = to;
      showLevel({ kind: "seek", text: `${d >= 0 ? "+" : "−"}${fmt(Math.abs(d))}  ·  ${fmt(to)}` });
      return;
    }
    const k = (s.y0 - e.clientY) / Math.max(160, s.h * 0.7);
    if (s.mode === "b") { const v = Math.max(0.15, Math.min(1.6, s.from + k * 1.45)); setBright(v); showLevel({ kind: "b", v, side: "left" }); }
    else { const v = Math.max(0, Math.min(1, s.from + k)); setVolume(v); showLevel({ kind: "v", v, side: "right" }); }
  };
  const up = (e) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    g.current = null;
    if (s.mode === "seek" && vRef.current && s.to !== undefined) { vRef.current.currentTime = s.to; return; }
    if (s.mode) return;
    // a tap: two quick ones on a side skip; one shows or hides the controls
    const now = performance.now(), side = s.side === "b" ? -10 : 10;
    taps.current = [...taps.current.slice(-5), Math.round(now - lastTap.current.t)];
    if (now - lastTap.current.t < 400 && Math.abs(e.clientX - lastTap.current.x) < 90) {
      clearTimeout(tapT.current); lastTap.current = { t: 0, x: 0 };
      skip(side); return;
    }
    lastTap.current = { t: now, x: e.clientX };
    clearTimeout(tapT.current);
    tapT.current = setTimeout(() => { if (ui && playing) { setUi(false); setMenu(null); } else poke(); }, 400);
  };

  const openTracks = async () => {
    setMenu("tracks");
    if (!tracks) {
      try { const X = await tracksOf(); setTracks({ audio: X.audio, subs: X.subs }); }
      catch { setTracks({ err: true }); }
    }
  };

  // ── the screen ──
  if (!url) {
    return (
      <div className="pl-home">
        <button type="button" className="pl-back press p-white" onClick={() => nav(-1)}>← Back</button>
        <div className="pl-pick pop">
          <div className="pl-logo">🎬</div>
          <h1>PlayRoom Player</h1>
          <p>Plays the movies phones can't: Dolby &amp; DTS sound, MKV, every audio language and subtitles — with swipe controls.</p>
          <button type="button" className="press p-sun lg" onClick={() => inputRef.current && inputRef.current.click()}>📂 Pick a video</button>
          <ul className="pl-feats">
            <li>👆 Double-tap a side: ⏪ 10 s / ⏩ 10 s</li>
            <li>☀️ Swipe up/down on the left: brightness</li>
            <li>🔊 Swipe up/down on the right: volume</li>
            <li>↔️ Swipe sideways: scrub through</li>
            <li>📍 Carries on where you stopped</li>
          </ul>
          {err && <p className="pl-err">{err}</p>}
          <small>The video stays on your phone — nothing is uploaded.</small>
        </div>
        <input ref={inputRef} type="file" accept="video/*,.mkv,.mp4,.m4v,.mov,.webm,.avi,.ts,.3gp" hidden onChange={(e) => { pick(e.target.files && e.target.files[0]); e.target.value = ""; }} />
      </div>
    );
  }
  return (
    <div className={`pl-stage${ui ? " ui" : ""}`} ref={stageRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { g.current = null; }}>
      <video ref={vRef} src={url} className="pl-video" playsInline preload="auto" style={bright !== 1 ? { filter: `brightness(${bright})` } : undefined}
        onLoadedMetadata={onLoaded} onError={() => { setErr("This phone can't open that video's picture. MP4 and MKV with H.264 play almost everywhere."); close(); }} />
      {subText && <div className="pl-sub">{subText}</div>}
      {level && (
        level.kind === "b" || level.kind === "v" ? (
          <div className={`pl-level ${level.side}`}>
            <span>{level.kind === "b" ? "☀️" : level.v === 0 ? "🔇" : "🔊"}</span>
            <i><b style={{ height: `${Math.round((level.kind === "b" ? (level.v - 0.15) / 1.45 : level.v) * 100)}%` }} /></i>
            <em>{Math.round(level.v * 100)}%</em>
          </div>
        ) : <div className={`pl-flash ${level.side || ""}`}>{level.text}</div>
      )}
      {waiting && <div className="pl-chip">🔊 Getting the sound ready…</div>}
      {note && <div className="pl-note">{note}</div>}
      {resume > 0 && (
        <div className="pl-resume">Carried on from {fmt(resume)}
          <button type="button" onClick={() => { vRef.current.currentTime = 0; setResumeAt(0); setResume(file, 0); }}>Start over</button>
        </div>
      )}
      <div className="pl-top">
        <button type="button" className="pl-ib" onClick={() => { close(); setFile(null); }} aria-label="Close the video">←</button>
        <div className="pl-title">{file.name.replace(/\.[^.]+$/, "")}</div>
        <button type="button" className="pl-pill" onClick={openTracks}>🎧 Audio &amp; subs</button>
        <button type="button" className="pl-pill" onClick={() => setMenu(menu === "speed" ? null : "speed")}>{speed}×</button>
      </div>
      <div className="pl-mid">
        <button type="button" className="pl-ib big" onClick={() => skip(-10)} aria-label="Back 10 seconds">⏪</button>
        <button type="button" className="pl-ib huge" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚" : "▶"}</button>
        <button type="button" className="pl-ib big" onClick={() => skip(10)} aria-label="Forward 10 seconds">⏩</button>
      </div>
      <div className="pl-bottom">
        <span>{fmt(t)}</span>
        <input type="range" min={0} max={dur || 0} step={0.1} value={Math.min(t, dur || 0)} aria-label="Where in the film"
          onChange={(e) => { const v = vRef.current; if (v) { v.currentTime = Number(e.target.value); setT(v.currentTime); } poke(); }} />
        <span>{fmt(dur)}</span>
        <button type="button" className="pl-ib" onClick={full} aria-label="Full screen">⛶</button>
      </div>
      {menu === "speed" && (
        <div className="pl-menu pl-speeds">
          {SPEEDS.map((x) => (
            <button type="button" key={x} className={x === speed ? "on" : ""} onClick={() => { setSpeed(x); if (vRef.current) vRef.current.playbackRate = x; setMenu(null); }}>{x}×</button>
          ))}
        </div>
      )}
      {menu === "tracks" && (
        <div className="pl-menu pl-tracks" onClick={() => setMenu(null)}>
          <div className="pop" onClick={(e) => e.stopPropagation()}>
            {!tracks && <p>Reading the film's tracks…<small>The first time loads the decoder (about 30 MB)</small></p>}
            {tracks && tracks.err && <p>Couldn't read this file's tracks.<small>Check the connection and try again.</small></p>}
            {tracks && !tracks.err && (
              <>
                <b>🔊 Audio</b>
                {tracks.audio.length ? tracks.audio.map((a) => (
                  <button type="button" key={a.n} className={audioN === a.n ? "on" : ""} onClick={() => { pickAudio(a.n); setMenu(null); }}>{a.label}</button>
                )) : <p>No sound in this file</p>}
                <b>💬 Subtitles</b>
                <button type="button" className={subN == null ? "on" : ""} onClick={() => { pickSubs(null); setMenu(null); }}>Off</button>
                {tracks.subs.map((x) => (
                  <button type="button" key={x.n} disabled={!x.text} className={subN === x.n ? "on" : ""} onClick={() => { pickSubs(x.n); setMenu(null); }}>{x.label}</button>
                ))}
                {!tracks.subs.length && <p>No subtitles in this file</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
