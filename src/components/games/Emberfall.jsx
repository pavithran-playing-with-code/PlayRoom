// src/components/games/Emberfall.jsx
// Emberfall: a 3D open-island adventure — four heroes, three guardians, the
// Cinder Colossus — alone or with one friend on the same island.
//
// The game itself is a finished single page, public/emberfall/ (index.html,
// game.js, three.js r128), kept as it was written and run here in a
// full-screen frame. This component is only the bridge:
//   • the page posts { ef: 'send', d } → we emit ef:msg to the room, and every
//     ef:msg from the room goes back into the page ({ ef: 'msg', from, d });
//     config/socket.js relays it untouched
//   • the page posts its score (and whether the Colossus is down) once a
//     second; the engine syncs it like any game (pairs_matched 1 = the win)
//   • the room's clock running out pauses the page
//   • { ef: 'leave' } (its Quit, confirmed) leaves the room — the floating
//     clock, Leave and ? are hidden for this game (GameFrame helpOnly, noHelp):
//     the page has its own How to play in its menu
//   • { ef: 'fs' } (a tap in the page) puts this page full screen, so a phone's
//     status bar goes; the tap's activation reaches us from the frame. The whole
//     page, not the frame: it keeps the sideways turn for an upright phone
// The current page (the mobile rebuild) speaks the same bridge but has no co-op
// yet: it ignores ef:msg, so two players each play their own island. How the
// old co-op worked (who runs the enemies, a second hero, two to a horse): the
// NET section of public/emberfall/game.js, kept with index-backup-before-p6a.html.
// Watching (useSpecStream): while a friend watches, frame() pokes the page ({ ef: 'spec-want' }) and
// relays the newest picture it posted ({ ef: 'frame', f }); the watcher loads the page with &watch=1 and
// posts every frame that arrives into it. The page draws the player's game from them: no input, no sound,
// no save.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpecStream from "./useSpecStream";
import { useSocket } from "../../utils/SocketContext";
import { team as teamOf } from "./coopTeam";

const SRC = `${process.env.PUBLIC_URL || ""}/emberfall/index.html?embed=1`;
const SRC_WATCH = `${SRC}&watch=1`;
// the page answers a poke with ~3 s of frames; poke again well inside that
const POKE_MS = 1000;
// a frame older than this is not sent on (the page stopped: hidden, reloading)
const STALE_MS = 1500;
// the floating clock / ? / Leave row is this tall; the page keeps its HUD under it on a phone
const FLOAT_H = 50;

// full screen for the whole page (a refusal is fine: no full screen on iPhone)
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function enterFull() {
  if (typeof document === "undefined" || fsEl()) return;
  try {
    const el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen;
    const r = f && f.call(el, { navigationUI: "hide" });
    if (r && r.catch) r.catch(() => {});
  } catch { /* refused */ }
}
function leaveFull() {
  try {
    if (!fsEl()) return;
    const f = document.exitFullscreen || document.webkitExitFullscreen;
    const r = f && f.call(document);
    if (r && r.catch) r.catch(() => {});
  } catch { /* fine */ }
}

// the notch and home bar, measured here: env() reads 0 inside a frame
function safeInsets() {
  if (typeof document === "undefined") return { t: 0, b: 0, l: 0, r: 0 };
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const v = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  el.remove();
  return v;
}

export default function Emberfall(props) {
  const { roomCode, players, currentUser, onGameEnd, durationSeconds = 0,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null, mode } = props;
  const coop = mode === "coop";
  const myId = Number(currentUser?.id);
  const { socket } = useSocket() || {};
  const T = useMemo(() => teamOf(players, myId), [players, myId]);
  const seated = useMemo(() => (players || []).filter((p) => !p.is_spectator)
    .map((p) => ({ id: Number(p.user_id), name: p.username })), [players]);

  const wonRef = useRef(false);
  const [won, setWon] = useState(false);
  const eng = useGameEngine({
    roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: () => ({ pairs_matched: wonRef.current ? 1 : 0 }),
  });
  const { setScore } = eng;
  const quitRef = useRef(eng.endMatch);
  quitRef.current = eng.endMatch;

  // while it's open: any bar the phone keeps is black, not white; leaving takes full screen down
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const was = meta && meta.getAttribute("content");
    if (meta) meta.setAttribute("content", "#000000");
    return () => { if (meta && was != null) meta.setAttribute("content", was); leaveFull(); };
  }, []);

  const frameRef = useRef(null);
  const readyRef = useRef(false);
  const post = (m) => {
    const w = frameRef.current && frameRef.current.contentWindow;
    if (w) w.postMessage(m, window.location.origin);
  };
  const watchName = spectatorWatching?.username || "";
  const watchNameRef = useRef(watchName);
  watchNameRef.current = watchName;
  const initMsg = () => ({
    ef: "init", me: { id: myId, name: currentUser?.username || "You" }, peers: seated, coop,
    safe: safeInsets(), top: FLOAT_H,
    ...(isSpectator ? { watch: { name: watchNameRef.current } } : {}),
  });

  // live spectating: the player relays the page's newest frame, the watcher posts each one into its page
  const lastFrame = useRef({ f: null, at: 0, poked: 0 });
  const specFrame = useCallback(() => {
    const L = lastFrame.current, now = Date.now();
    if (now - L.poked > POKE_MS) { L.poked = now; post({ ef: "spec-want" }); }
    return L.f && now - L.at < STALE_MS ? L.f : null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const specOnFrame = useCallback((f) => { if (readyRef.current) post({ ef: "frame", f }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useSpecStream({
    roomCode, isSpectator, myId, watchId: spectatorWatching?.user_id,
    frame: specFrame, onFrame: specOnFrame,
  });

  // the watcher's page: told who it is watching once it has loaded, and again when that changes
  useEffect(() => {
    if (!isSpectator) return undefined;
    const onMsg = (e) => {
      if (e.origin !== window.location.origin || !frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const m = e.data;
      if (m && m.ef === "ready") { readyRef.current = true; post(initMsg()); }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isSpectator && readyRef.current) post({ ef: "watch", name: watchName });
  }, [isSpectator, watchName, spectatorWatching?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // the page → the room
  useEffect(() => {
    if (isSpectator) return undefined;
    const onMsg = (e) => {
      if (e.origin !== window.location.origin || !frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const m = e.data;
      if (!m || !m.ef) return;
      if (m.ef === "frame") { const L = lastFrame.current; L.f = m.f; L.at = Date.now(); }
      else if (m.ef === "ready") { readyRef.current = true; post(initMsg()); }
      else if (m.ef === "fs") enterFull();
      else if (m.ef === "leave") quitRef.current();
      else if (m.ef === "send") { if (socket && roomCode) socket.emit("ef:msg", { code: roomCode, d: m.d }); }
      else if (m.ef === "score") {
        if (m.won && !wonRef.current) { wonRef.current = true; setWon(true); }
        if (m.playing) setScore(Number(m.score) || 0);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [socket, roomCode, isSpectator, setScore, seated, coop, myId]); // eslint-disable-line react-hooks/exhaustive-deps

  // the room → the page
  useEffect(() => {
    if (!socket || isSpectator) return undefined;
    const on = (m) => { if (m && Number(m.user_id) !== myId) post({ ef: "msg", from: Number(m.user_id), d: m.d }); };
    socket.on("ef:msg", on);
    return () => socket.off("ef:msg", on);
  }, [socket, myId, isSpectator]);

  // someone joins or leaves: the page learns their names
  useEffect(() => { if (readyRef.current) post({ ef: "names", peers: seated }); }, [seated]);
  // the clock ran out: hands off the controls
  useEffect(() => { if (eng.gameOver) post({ ef: "over" }); }, [eng.gameOver]);

  const focus = () => { try { frameRef.current && frameRef.current.focus(); } catch { /* fine */ } };
  const scores = Object.fromEntries([[myId, eng.score], ...Object.values(eng.opponents).map((o) => [o.user_id, o.score])]);

  return (
    <>
      <GameFrame
        gameName="Emberfall" badge="🔥 EMBERFALL"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={isSpectator ? [{ label: "Score", value: Number(spectatorWatching?.score ?? 0).toLocaleString() }] : []}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={Object.values(eng.opponents)}
        teams={eng.teams}
        onQuit={eng.endMatch}
        landscape
        bare
        helpOnly={!isSpectator}
        noHelp={!isSpectator}
      >
        {({ w, h }) => (isSpectator
          ? (
            <iframe
              ref={frameRef} src={SRC_WATCH} title={`Emberfall: watching ${watchName || "a friend"}`} className="ef-frame"
              style={{ width: w, height: h }} tabIndex={-1}
            />
          )
          : (
            <iframe
              ref={frameRef} src={SRC} title="Emberfall" className="ef-frame"
              style={{ width: w, height: h }} allow="autoplay; fullscreen" allowFullScreen
              onLoad={focus} onPointerDown={focus}
            />
          ))}
      </GameFrame>
      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={won ? "The Flame of Emberfall burns again" : null}
          together={coop ? { reached: won, goal: "defeat the Cinder Colossus", unit: "pts", mates: T.all(scores) } : null} />
      )}
    </>
  );
}
