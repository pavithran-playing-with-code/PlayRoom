// src/components/games/ManorGame.jsx
// STATION 13 in a room: versus, teams or together, in one shared hospital.
//
// Unlike every other game here this one does not use useGameEngine. Its
// scores are not a phone's to post: the server runs the building and its
// monsters (config/manorWorld.js), decides who took what, who was caught and
// who got out, writes the scores itself and ends the match. This page moves
// your own player, reports where you are, and draws what the server says.
//
// The solo page (pages/Manor.jsx) shares the drawing, the sound, the rules,
// the HUD and the controls.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "../../utils/SocketContext";
import {
  createClient, applyTick, stepLocal, report, interact, actionDone, actionLabel, toggleTorch, playing, respawning, timeLeft, sideOfMe,
  watchedPlayer, cycleWatch, viewState,
} from "../horror/s13Client";
import { NEED, S as TILE_M } from "../horror/s13Core.mjs";
import { createStation } from "../horror/s13Scene";
import { createS13Audio } from "../horror/s13Audio";
import { useSideways, toGame } from "../horror/LandscapeGate";
import { S13Hud, lookBy, loadSettings, coarse } from "../../pages/Manor";
import { usePlayAgain } from "./PlayAgain";

const REPORT_MS = 66;                  // ~15 a second
const HUD_MS = 120;

export default function ManorGame({ roomCode, currentUser, spectatorWatching = null, onGameEnd }) {
  const { socket } = useSocket() || {};
  const client = useRef(null);
  const audio = useRef(null);
  const scene = useRef(null);
  const three = useRef(null);
  const rootRef = useRef(null);
  const hostRef = useRef(null);
  const keys = useRef({});
  const stick = useRef(null);
  const drag = useRef(null);
  const runOn = useRef(false);
  const sentAt = useRef(0);
  const settings = useRef(loadSettings());

  const [hud, setHud] = useState(null);
  const [over, setOver] = useState(null);
  const [gone, setGone] = useState(false);
  const [noGl, setNoGl] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // A landscape game: if the screen stays upright, it draws itself sideways.
  const [rotated, sideways] = useSideways();
  useEffect(() => { stick.current = null; drag.current = null; }, [rotated]);

  // the scene, once both the building (from the server) and three.js are here
  const buildScene = useCallback(() => {
    const c = client.current;
    if (!c || !three.current || !hostRef.current || scene.current) return;
    try {
      scene.current = createStation(hostRef.current, three.current,
        { layout: c.st, items: c.items, lockers: c.lockers, quality: settings.current.q, aware: settings.current.aw });
    } catch (e) { setNoGl(true); }
  }, []);

  useEffect(() => {
    document.body.classList.add("in-game");
    const noMenu = (e) => e.preventDefault();
    document.addEventListener("contextmenu", noMenu);
    audio.current = createS13Audio();
    let alive = true;
    import("three").then((m) => { if (!alive) return; three.current = m; buildScene(); }).catch(() => { if (alive) setNoGl(true); });
    return () => {
      alive = false;
      document.body.classList.remove("in-game");
      document.removeEventListener("contextmenu", noMenu);
      audio.current.close();
      delete window.__s13x;
      if (scene.current) { scene.current.dispose(); scene.current = null; }
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [buildScene]);

  const syncHud = useCallback(() => {
    const c = client.current;
    if (!c) return;
    const now = Date.now(), side = sideOfMe(c), w = watchedPlayer(c);
    setHud({
      role: c.role, mode: c.mode, playing: playing(c), respawning: respawning(c), left: c.left, timeLeft: timeLeft(c, now),
      side: side && { name: side.name, color: side.color, got: side.got, need: side.need, open: side.open, escapes: side.escapes || 0, score: side.score || 0 },
      // how far each friend is from you, in metres (a tile is TILE_M), while you're in the building
      players: [...c.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, alive: p.alive, left: p.left,
        m: playing(c) && p.id !== c.you && p.alive && !p.left ? Math.round(Math.hypot(p.x - c.body.x, p.y - c.body.y) * TILE_M) : null })),
      watching: w && { name: w.name, color: w.color },
      bat: c.body.bat, stam: c.body.stam, msg: c.msg, use: actionLabel(c), fl: c.body.fl && c.body.bat > 0, run: runOn.current, area: c.area,
      stick: stick.current && { ...stick.current },
    });
  }, []);

  // ── the socket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !roomCode) return undefined;
    const hello = () => socket.emit("manor:hello", roomCode);
    const onInit = (init) => {
      if (init.code !== roomCode) return;
      if (client.current) return;                          // the building is built once
      const c = createClient(init);
      if (spectatorWatching) c.watch = Number(spectatorWatching.user_id);
      client.current = c;
      window.__s13x = () => client.current;
      if (init.over) setOver(init.over);
      buildScene();
      syncHud();
    };
    const onTick = (m) => {
      const c = client.current;
      if (!c || m.c !== roomCode) return;
      for (const s of applyTick(c, m)) audio.current.play(s);
    };
    const onOver = (o) => { if (o.code !== roomCode) return; if (client.current) client.current.over = o; setOver(o); if (document.pointerLockElement) document.exitPointerLock(); };
    const onUsed = (r) => { const c = client.current; if (!c || r.code !== roomCode) return; actionDone(c, r); syncHud(); };
    // the building and this phone disagreed about where you are: the building wins
    const onSnap = (m) => { const c = client.current; if (!c || m.code !== roomCode || c.body.hid) return; c.body.x = m.x; c.body.y = m.y; };
    const onGone = (g) => { if (g.code === roomCode && !client.current) setGone(true); };
    socket.on("manor:init", onInit); socket.on("manor:tick", onTick); socket.on("manor:over", onOver);
    socket.on("manor:used", onUsed); socket.on("manor:snap", onSnap); socket.on("manor:gone", onGone); socket.on("connect", hello);
    hello();
    const retry = setInterval(() => { if (!client.current) hello(); }, 3000);
    return () => {
      clearInterval(retry);
      socket.off("manor:init", onInit); socket.off("manor:tick", onTick); socket.off("manor:over", onOver);
      socket.off("manor:used", onUsed); socket.off("manor:snap", onSnap); socket.off("manor:gone", onGone); socket.off("connect", hello);
    };
  }, [socket, roomCode, spectatorWatching, syncHud, buildScene]);

  // ── the loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf, last = 0, lastHud = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - last) / 1000 || 0);
      last = ts;
      const c = client.current, sc = scene.current;
      if (!c) return;
      const now = Date.now(), k = keys.current, st = stick.current;
      const ix = (k.d ? 1 : 0) - (k.a ? 1 : 0) + (st ? st.x : 0), iz = (k.w ? 1 : 0) - (k.s ? 1 : 0) - (st ? st.y : 0);
      for (const s of stepLocal(c, { ix, iz, run: !!k.Shift || runOn.current }, dt, now)) audio.current.play(s);
      if (playing(c) && socket && now - sentAt.current >= REPORT_MS) { sentAt.current = now; socket.emit("manor:me", report(c)); }
      const v = viewState(c, now);
      audio.current.tick(dt, v.P, c.monsters, c.tlv, playing(c) && !c.over);
      if (sc) sc.frame(v, dt, ts / 1000);
      if (ts - lastHud > HUD_MS) { lastHud = ts; syncHud(); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [socket, syncHud]);

  useEffect(() => {
    const r = () => scene.current && scene.current.resize();
    window.addEventListener("resize", r);
    const ro = typeof ResizeObserver !== "undefined" && rootRef.current ? new ResizeObserver(r) : null;
    if (ro) ro.observe(rootRef.current);
    return () => { window.removeEventListener("resize", r); if (ro) ro.disconnect(); };
  }, []);

  // Use: a locker. It happens here at once, and the server is asked.
  const doUse = useCallback((c) => { const ask = interact(c); if (ask) { audio.current.play({ name: "locker" }); if (socket) socket.emit("manor:use", ask); } }, [socket]);
  const doLight = useCallback((c) => { toggleTorch(c); audio.current.play({ name: "click" }); }, []);

  // ── keyboard and mouse ─────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e) => {
      const c = client.current;
      if (!c) return;
      audio.current.start();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === " ") e.preventDefault();
      if (!playing(c)) { if (k === "ArrowLeft") cycleWatch(c, -1); if (k === "ArrowRight") cycleWatch(c, 1); return; }
      keys.current[k] = true;
      if (k === "f") doLight(c);
      if (k === "e") doUse(c);
      syncHud();
    };
    const up = (e) => { keys.current[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; };
    const blur = () => { keys.current = {}; stick.current = null; drag.current = null; };
    const mm = (e) => {
      const c = client.current;
      if (!c || !playing(c)) return;
      if (document.pointerLockElement === hostRef.current) lookBy(c.body, e.movementX, e.movementY);
      else if (drag.current && drag.current.id === "m") { lookBy(c.body, e.clientX - drag.current.x, e.clientY - drag.current.y); drag.current.x = e.clientX; drag.current.y = e.clientY; }
    };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur); window.addEventListener("mousemove", mm);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); window.removeEventListener("mousemove", mm); };
  }, [syncHud, doUse, doLight]);

  // ── thumbs: left 45% moves, the rest looks ─────────────────────────────────
  const onDown = (e) => {
    const c = client.current;
    audio.current.start();
    if (!c || !playing(c)) return;
    if (e.pointerType === "mouse") {
      if (document.pointerLockElement !== hostRef.current) {
        try { const r = hostRef.current.requestPointerLock && hostRef.current.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* fine */ }
        drag.current = { id: "m", x: e.clientX, y: e.clientY };
      }
      return;
    }
    const at = toGame(e, sideways.current), W = rootRef.current ? rootRef.current.clientWidth : window.innerWidth;
    if (at.x < W * 0.45) { if (!stick.current) stick.current = { id: e.pointerId, ox: at.x, oy: at.y, x: 0, y: 0 }; }
    else if (!drag.current) drag.current = { id: e.pointerId, x: at.x, y: at.y };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const onMove = (e) => {
    if (e.pointerType === "mouse") return;
    const c = client.current, at = toGame(e, sideways.current), st = stick.current;
    if (st && e.pointerId === st.id) { const dx = at.x - st.ox, dy = at.y - st.oy, l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / 50); st.x = dx / l * k; st.y = dy / l * k; }
    const d = drag.current;
    if (d && d.id === e.pointerId && c && playing(c)) { lookBy(c.body, (at.x - d.x) * 1.4, (at.y - d.y) * 1.4); d.x = at.x; d.y = at.y; }
  };
  const onEnd = (e) => {
    if (stick.current && e.pointerId === stick.current.id) stick.current = null;
    if (drag.current && (drag.current.id === e.pointerId || (e.pointerType === "mouse" && drag.current.id === "m"))) drag.current = null;
  };
  // buttons act on touch-down: a phone won't reliably make a click while the other thumb holds the stick
  const press = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); audio.current.start(); const c = client.current; if (c && playing(c)) { fn(c); syncHud(); } };
  const watch = (dir) => (e) => { e.preventDefault(); e.stopPropagation(); const c = client.current; if (c) { cycleWatch(c, dir); syncHud(); } };

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    try { await onGameEnd?.(); } finally { setLeaving(false); }
  }

  const h = hud;
  const clock = h ? `${Math.floor(h.timeLeft / 60000)}:${String(Math.floor(h.timeLeft / 1000) % 60).padStart(2, "0")}` : "";
  const watchingNow = h && !h.playing && !h.respawning && !over;

  return (
    <div className={`s13 s13x${rotated ? " s13-rot" : ""}`} ref={rootRef} data-no-fun>
      <div className="s13-host" ref={hostRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} />

      {!h && !gone && !noGl && <div className="s13-ov"><p>Opening the doors…</p></div>}
      {noGl && <div className="s13-ov"><h1 className="s13-h2">STATION 13</h1><p>This device couldn't start the 3D view (WebGL). Try another browser.</p><button onClick={leave} disabled={leaving}>Back to the lobby</button></div>}
      {gone && !over && (
        <div className="s13-ov"><h1 className="s13-h2">CLOSED</h1><p>This match has already ended.</p><button onClick={leave}>Back to the lobby</button></div>
      )}

      {h && !over && (
        <div className="s13-obj s13x-top">
          <div className="hmx-top">
            <span className="hmx-clock">{clock}</span>
            {h.side && (
              <span className="hmx-mine" style={{ "--c": h.side.color }}>
                {Array.from({ length: h.side.need }).map((_, i) => <i key={i} className={i < h.side.got ? "got" : ""} />)}
                <b>{h.side.got >= h.side.need ? "Elevator!" : `Fuses ${h.side.got}/${h.side.need}`}</b>
              </span>
            )}
          </div>
          {h.playing && <span>{h.area}</span>}
          <div className="hmx-who">
            {h.players.map((p) => (
              <span key={p.id} className={`hmx-p${p.alive ? "" : " dead"}`} style={{ "--c": p.color }} title={p.name}>
                <i />{p.name}{p.left ? " · left" : !p.alive ? " · caught" : p.m != null ? ` · ${p.m} m` : ""}
              </span>
            ))}
          </div>
          {h.playing && <button className="s13x-leave" onPointerDown={(e) => { e.stopPropagation(); setConfirmLeave(true); }}>Leave</button>}
        </div>
      )}

      {h && h.playing && !over && (
        <>
          <S13Hud h={h} />
          {coarse && (
            <div className="s13-tb">
              <button type="button" className={`s13-use${h.use ? " on" : ""}`} onPointerDown={press(doUse)}>USE</button>
              <button type="button" className={`s13-run${h.run ? " on" : ""}`} onPointerDown={press(() => { runOn.current = !runOn.current; })}>RUN</button>
              <button type="button" className={`s13-light${h.fl ? " on" : ""}`} onPointerDown={press(doLight)}>LIGHT</button>
            </div>
          )}
        </>
      )}
      {h && !h.playing && !h.respawning && h.msg && !over && <div className="s13-sub" style={{ opacity: 1 }}>{h.msg}</div>}

      {/* Caught: a moment, then back in the Main Hall. */}
      {h && h.respawning && !over && <div className="hmx-spec"><div className="hmx-banner">Caught! Back in the Main Hall in a moment…</div></div>}

      {/* Left, or only watching: look through someone else's eyes. */}
      {watchingNow && h && (
        <div className="hmx-spec s13x-spec">
          {h.role === "player" && h.left && <div className="hmx-banner">You left the building. <span>Watch the others, or go back to the lobby.</span></div>}
          <div className="hmx-specbar">
            <button onPointerDown={watch(-1)} aria-label="Watch the previous player">◀</button>
            <span className="hmx-watching" style={{ "--c": h.watching?.color || "#a39a88" }}>{h.watching ? <>Watching <b>{h.watching.name}</b></> : "Nobody left inside"}</span>
            <button onPointerDown={watch(1)} aria-label="Watch the next player">▶</button>
          </div>
          <button onClick={leave} disabled={leaving}>{leaving ? "Leaving…" : "← Leave"}</button>
        </div>
      )}

      {confirmLeave && (
        <div className="s13-ov">
          <h1 className="s13-h2">LEAVE?</h1>
          <p>{h?.mode === "coop" ? "Your friends play on to the end of the clock. What you've scored together still counts." : "Your score so far counts. Anyone else plays on to the end of the clock."}</p>
          <div className="s13-row">
            <button onClick={leave} disabled={leaving}>{leaving ? "Leaving…" : "Leave"}</button>
            <button onClick={() => setConfirmLeave(false)}>Stay</button>
          </div>
        </div>
      )}

      {over && <Results over={over} me={currentUser} onExit={leave} leaving={leaving} />}

      {rotated && h && !over && <div className="s13-rothint" aria-hidden="true">↺ Turn your phone to the left</div>}
    </div>
  );
}

function Results({ over, me, onExit, leaving }) {
  const myId = Number(me?.id);
  const ctx = usePlayAgain();
  const [again, setAgain] = useState(null);             // null | "busy" | an error message
  const rematch = ctx && ctx.rematch && Number(ctx.rematch.byId) !== myId ? ctx.rematch : null;
  async function playAgain() {
    if (!ctx || again === "busy") return;
    setAgain("busy");
    setAgain((await ctx.start()) || null);
  }
  const mine = over.sides.find((s) => s.members.some((m) => m.id === myId));
  const coop = over.mode === "coop";
  // Only a side that got out can win; the most points among those does.
  const top = over.sides.filter((s) => s.escapes > 0).sort((a, b) => b.score - a.score);
  const winners = top.length ? top.filter((s) => s.score === top[0].score) : [];
  const iWon = !!mine && winners.some((s) => s.key === mine.key);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const timeUp = over.reason === "time";
  const winnerName = (w) => (over.mode === "teams" ? `${w.name} team` : w.members[0]?.name || "Someone");
  const headline = coop
    ? (mine && mine.escapes ? "ESCAPED" : timeUp ? "THE NIGHT RAN OUT" : "NOBODY GOT OUT")
    : iWon ? (over.mode === "teams" ? `${mine.name} team wins` : "YOU ESCAPED FIRST")
    : winners.length ? `${winnerName(winners[0])} got out first`
    : timeUp ? "THE NIGHT RAN OUT" : "NOBODY GOT OUT";
  const sub = coop
    ? (mine && mine.escapes ? `Out through the elevator together — ${mine.score} points. Behind the doors, something keeps knocking.` : timeUp ? "The clock ran out before you reached the elevator." : "Nobody made it out.")
    : winners.length ? "First one out wins." : "Nobody got out before the clock ran out — nobody wins.";
  return (
    <div className="s13-ov hmx-results">
      <h1 className="s13-h2">{headline}</h1>
      <p>{sub}</p>
      <div className="hmx-standings">
        {over.sides.map((s) => (
          <div key={s.key} className={`hmx-row${mine && s.key === mine.key ? " mine" : ""}`} style={{ "--c": s.color }}>
            <span className="hmx-place">{s.escapes ? "🏆" : "✕"}</span>
            <span className="hmx-name">
              <b>{over.mode === "free" ? s.members[0]?.name : s.name}</b>
              <small>{s.escapes ? "Got out · " : ""}{plural(s.total, "fuse", "fuses")}{over.mode !== "free" ? ` · ${s.members.map((m) => m.name).join(", ")}` : ""}</small>
            </span>
            <span className="hmx-got">{s.score}</span>
          </div>
        ))}
      </div>
      {ctx && (
        <>
          {rematch && <p className="hmx-rematch">🎮 {rematch.by} started a new game — join in!</p>}
          <button onClick={playAgain} disabled={again === "busy" || leaving}>{again === "busy" ? "Setting up…" : rematch ? `Join ${rematch.by}'s game` : "Play again"}</button>
          {again && again !== "busy" && <p className="hmx-rematch">{again}</p>}
        </>
      )}
      <button onClick={onExit} disabled={leaving}>{leaving ? "Saving…" : "Back to the lobby"}</button>
    </div>
  );
}

export const S13_NEED = NEED;
