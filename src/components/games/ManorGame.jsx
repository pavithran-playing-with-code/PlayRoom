// src/components/games/ManorGame.jsx
// NANA'S LULLABY in a room: versus, teams or co-op, in one shared house.
//
// Unlike every other game here this one does not use useGameEngine. Its
// scores are not a phone's to post: the server runs the house (config/
// manorWorld.js), decides who took what and who got out, writes the scores
// itself and ends the match when everyone is out or caught. This page moves
// your own player, reports where you are, and draws what the server says.
//
// The solo page (pages/Manor.jsx) shares the drawing, the sound and the
// rules; the two-thumb controls here are the same as there.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "../../utils/SocketContext";
import { drawManor, lookBy, mapRect, SPRINT_PX, STICK_R, METRES_PER_TILE } from "../horror/manorRender";
import { createManorAudio } from "../horror/manorAudio";
import {
  createClient, applyTick, stepLocal, report, doAction, actionDone, actionLabel, playing, respawning, inIntro, timeLeft, sideOfMe,
  watchedPlayer, cycleWatch, viewState, roomNameAt, isListening, listeningNear, nearestGhost,
} from "../horror/manorClient";
import { useSideways, toGame } from "../horror/LandscapeGate";
import { usePlayAgain } from "./PlayAgain";

const REPORT_MS = 66;                  // ~15 a second
const HUD_MS = 100;


export default function ManorGame({ roomCode, currentUser, isSpectator = false, spectatorWatching = null, onGameEnd }) {
  const { socket } = useSocket() || {};
  const client = useRef(null);
  const audio = useRef(null);
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const view = useRef({ W: 390, H: 844, dpr: 1, safeTop: 0 });
  const keys = useRef({});
  const stick = useRef(null);
  const look = useRef(null);
  const sentAt = useRef(0);

  const [hud, setHud] = useState(null);
  const [over, setOver] = useState(null);
  const [gone, setGone] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // A landscape game: if the screen stays upright, it draws itself sideways.
  const [rotated, sideways] = useSideways();
  useEffect(() => { stick.current = null; look.current = null; }, [rotated]);

  const syncHud = useCallback(() => {
    const c = client.current;
    if (!c) return;
    const now = Date.now();
    const side = sideOfMe(c);
    const w = watchedPlayer(c);
    setHud({
      role: c.role, mode: c.mode, alive: c.alive, left: c.left, respawning: respawning(c), intro: inIntro(c, now),
      timeLeft: timeLeft(c, now), msg: c.msg,
      side: side && { name: side.name, color: side.color, got: side.got, need: side.need, open: side.open, escapes: side.escapes || 0, score: side.score || 0 },
      stam: c.body.stam, bat: c.body.bat, light: c.body.light, runOn: c.body.runOn, tired: c.body.stamCool > 0,
      crouch: c.body.crouch, watching: w && { name: w.name, color: w.color }, use: actionLabel(c, now),
      room: roomNameAt(c, playing(c) ? c.body : w || c.body),
      players: [...c.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, alive: p.alive, left: p.left })),
      playing: playing(c), listening: listeningNear(c), quiet: isListening(c) && !listeningNear(c),
      ...(() => {
        // the nearest key of yours not found yet, and Nana: how far
        const P = c.body, m = (d) => Math.round(d * METRES_PER_TILE);
        const left = c.relics.filter((r) => !r.got && r.mine !== false).sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y));
        const k = left[0], G = nearestGhost(c, P), nd = G ? Math.hypot(G.x - P.x, G.y - P.y) : 99;
        const door = { x: c.exitT.x + 0.5, y: c.exitT.y + 0.5 };
        return {
          goal: k ? `Next key: ${roomNameAt(c, k)} · ${m(Math.hypot(k.x - P.x, k.y - P.y))} m` : `The front door is open · ${m(Math.hypot(door.x - P.x, door.y - P.y))} m`,
          open: !k, nana: m(nd), near: nd < 4, close: nd < 3, hiding: !!P.hiding,
        };
      })(),
    });
  }, []);

  useEffect(() => {
    document.body.classList.add("in-game");
    const noMenu = (e) => e.preventDefault();          // a long press is a held button, not a copy menu
    document.addEventListener("contextmenu", noMenu);
    audio.current = createManorAudio();
    return () => {
      document.body.classList.remove("in-game");
      document.removeEventListener("contextmenu", noMenu);
      audio.current.close();
    };
  }, []);

  // ── the socket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !roomCode) return undefined;
    const hello = () => socket.emit("manor:hello", roomCode);
    const onInit = (init) => {
      if (init.code !== roomCode) return;
      const c = createClient(init);
      if (spectatorWatching) c.watch = Number(spectatorWatching.user_id);
      client.current = c;
      if (init.over) setOver(init.over);
      syncHud();
    };
    const onTick = (m) => {
      const c = client.current;
      if (!c || m.c !== roomCode) return;
      for (const s of applyTick(c, m)) audio.current.play(s);
    };
    const onOver = (o) => {
      if (o.code !== roomCode) return;
      if (client.current) client.current.over = o;
      setOver(o);
    };
    const onUsed = (r) => {
      const c = client.current;
      if (!c || r.code !== roomCode) return;
      actionDone(c, r);
      syncHud();
    };
    // the house and this phone disagreed about where you are: the house wins
    const onSnap = (m) => {
      const c = client.current;
      if (!c || m.code !== roomCode || c.body.hiding) return;
      c.body.x = m.x; c.body.y = m.y;
    };
    const onGone = (g) => { if (g.code === roomCode && !client.current) setGone(true); };
    socket.on("manor:init", onInit);
    socket.on("manor:tick", onTick);
    socket.on("manor:over", onOver);
    socket.on("manor:used", onUsed);
    socket.on("manor:snap", onSnap);
    socket.on("manor:gone", onGone);
    socket.on("connect", hello);
    hello();
    // if the first hello was lost (socket still connecting), keep asking
    const retry = setInterval(() => { if (!client.current) hello(); }, 3000);
    return () => {
      clearInterval(retry);
      socket.off("manor:init", onInit);
      socket.off("manor:tick", onTick);
      socket.off("manor:over", onOver);
      socket.off("manor:used", onUsed);
      socket.off("manor:snap", onSnap);
      socket.off("manor:gone", onGone);
      socket.off("connect", hello);
    };
  }, [socket, roomCode, spectatorWatching, syncHud]);

  // ── the canvas ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const fit = () => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // the game's own box: the screen, or the screen turned a quarter
      const box = rootRef.current;
      const W = box ? box.clientWidth : window.innerWidth, H = box ? box.clientHeight : window.innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      const safeTop = rootRef.current ? parseFloat(getComputedStyle(rootRef.current).paddingTop) || 0 : 0;
      view.current = { W, H, dpr, safeTop, bigMap: view.current.bigMap };
    };
    fit();
    window.addEventListener("resize", fit);
    // turning the phone (or being drawn turned) changes the box, not always the window
    const ro = typeof ResizeObserver !== "undefined" && rootRef.current ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(rootRef.current);
    return () => { window.removeEventListener("resize", fit); if (ro) ro.disconnect(); };
  }, []);

  // ── the loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf, last = 0, lastHud = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - last) / 1000 || 0);
      last = ts;
      const c = client.current;
      const cv = canvasRef.current;
      if (!c || !cv) return;
      const now = Date.now();

      const k = keys.current;
      let ix = 0, iy = 0;
      if (k.a) ix--;
      if (k.d) ix++;
      if (k.w || k.ArrowUp) iy--;
      if (k.s || k.ArrowDown) iy++;
      const st = stick.current;
      if (st) {
        const dx = st.x - st.ox, dy = st.y - st.oy, l = Math.hypot(dx, dy);
        if (l > 8) { ix = dx / Math.max(l, 1) * Math.min(1, l / STICK_R); iy = dy / Math.max(l, 1) * Math.min(1, l / STICK_R); }
        st.run = l > SPRINT_PX;                          // pushed past the ring: sprint
      }
      const turn = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
      for (const s of stepLocal(c, { ix, iy, turn, shift: !!k.Shift || !!(st && st.run) }, dt, now)) audio.current.play(s);

      if (playing(c) && !inIntro(c, now) && socket && now - sentAt.current >= REPORT_MS) {
        sentAt.current = now;
        socket.emit("manor:me", report(c));
      }

      // her lullaby: louder the nearer she is; nothing at all while she listens
      const G = nearestGhost(c, c.body);
      audio.current.humming(!inIntro(c, now) && !c.over && !isListening(c), G ? Math.max(0, 1 - Math.hypot(c.body.x - G.x, c.body.y - G.y) / 18) : 0);
      drawManor(cv.getContext("2d"), viewState(c, now), view.current, ts / 1000, playing(c) ? stick.current : null);
      if (ts - lastHud > HUD_MS) { lastHud = ts; syncHud(); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [socket, syncHud]);

  // Use: doors and hiding spots. It happens here at once, and the server is asked.
  const doUse = useCallback((c) => {
    const r = doAction(c);
    for (const s of r.sounds) audio.current.play(s);
    if (r.ask && socket) socket.emit("manor:use", r.ask);
    if (r.lamp && socket) socket.emit("manor:lamp", r.lamp);
  }, [socket]);

  // ── keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e) => {
      const c = client.current;
      if (!c) return;
      audio.current.start();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) e.preventDefault();
      if (inIntro(c)) { c.skipIntro = true; return; }
      if (!playing(c)) {
        if (k === "ArrowLeft") cycleWatch(c, -1);
        if (k === "ArrowRight") cycleWatch(c, 1);
        return;
      }
      keys.current[k] = true;
      if (k === "r") c.body.runOn = !c.body.runOn;
      if (k === "e") doUse(c);
      if (k === "f") c.body.light = !c.body.light;
      syncHud();
    };
    const up = (e) => { keys.current[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; };
    const blur = () => { keys.current = {}; stick.current = null; look.current = null; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [socket, roomCode, syncHud, doUse]);

  // ── thumbs: left moves, right looks ────────────────────────────────────────
  const onDown = (e) => {
    const c = client.current;
    audio.current.start();
    if (!c) return;
    if (inIntro(c)) { c.skipIntro = true; syncHud(); return; }
    const at = toGame(e, sideways.current);
    // the map: tap it for the big one, tap again (anywhere) to close it
    const v = view.current, m = mapRect(v);
    if (v.bigMap) { v.bigMap = false; return; }
    if (at.x >= m.x0 - 6 && at.y <= m.y0 + m.size + 18 && at.y >= m.y0 - 6) { v.bigMap = true; return; }
    if (!playing(c)) return;
    const cv = canvasRef.current;
    if (e.pointerType === "mouse" || at.x >= view.current.W * 0.5) {
      if (!look.current) { look.current = { id: e.pointerId, lx: at.x, ly: at.y }; cv.setPointerCapture(e.pointerId); }
    } else if (!stick.current) {
      stick.current = { id: e.pointerId, ox: at.x, oy: at.y, x: at.x, y: at.y };
      cv.setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e) => {
    const st = stick.current, lk = look.current, c = client.current;
    const at = toGame(e, sideways.current);
    if (st && e.pointerId === st.id) { st.x = at.x; st.y = at.y; }
    if (lk && e.pointerId === lk.id && c && playing(c)) { lookBy(c.body, at.x - lk.lx, at.y - lk.ly); lk.lx = at.x; lk.ly = at.y; }
  };
  const onEnd = (e) => {
    if (stick.current && e.pointerId === stick.current.id) stick.current = null;
    if (look.current && e.pointerId === look.current.id) look.current = null;
  };

  // Buttons act on touch-down: a phone won't reliably make a click while the
  // other thumb holds the joystick, and jumping a barricade mid-run is that.
  const press = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    audio.current.start();
    const c = client.current;
    if (c && playing(c)) { fn(c); syncHud(); }
  };
  const watch = (dir) => (e) => { e.preventDefault(); e.stopPropagation(); const c = client.current; if (c) { cycleWatch(c, dir); syncHud(); } };

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    try { await onGameEnd?.(); } finally { setLeaving(false); }
  }

  // ── the screen ─────────────────────────────────────────────────────────────
  const h = hud;
  const clock = h ? `${Math.floor(h.timeLeft / 60000)}:${String(Math.floor(h.timeLeft / 1000) % 60).padStart(2, "0")}` : "";
  // watching: only once you've left, or if you came to watch — being caught
  // is a moment's wait, not the end
  const watchingNow = h && !h.playing && !h.respawning && !over;

  return (
    <div className={`hm hmx${rotated ? " hm-rot" : ""}`} ref={rootRef} data-no-fun>
      <canvas ref={canvasRef} className="hm-cv"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} />

      {!h && !gone && (
        <div className="hm-ov"><p>Opening the house…</p></div>
      )}
      {gone && !over && (
        <div className="hm-ov">
          <h1>The house is shut</h1>
          <p>This match has already ended.</p>
          <button className="hm-go" onClick={leave}>Back to the lobby</button>
        </div>
      )}

      {h && !h.intro && !over && (
        <div className="hm-hud hmx-hud">
          <div className="hmx-top">
            <span className="hmx-clock">{clock}</span>
            {h.side && (
              <span className="hmx-mine" style={{ "--c": h.side.color }}>
                {Array.from({ length: h.side.need }).map((_, i) => <i key={i} className={i < h.side.got ? "got" : ""} />)}
                <b>{h.side.got}/{h.side.need}</b>
              </span>
            )}
            {h.side && <span className="hmx-score" title="Times out · score">🚪 {h.side.escapes} · {h.side.score}</span>}
          </div>
          {h.playing && <div className="hm-bar stam"><i style={{ width: `${h.stam * 100}%` }} /></div>}
          {h.room && <div className="hm-room">{h.room}</div>}
          {h.playing && <div className={`hm-goal${h.open ? " open" : ""}`}>{h.goal}</div>}
          {h.playing && <div className={`hm-nanad${h.near ? " near" : ""}`}>Nana: {h.nana} m away</div>}
          <div className="hmx-who">
            {h.players.map((p) => (
              <span key={p.id} className={`hmx-p${p.alive ? "" : " dead"}`} style={{ "--c": p.color }}
                title={p.name}>
                <i />{p.name}{p.left ? " · left" : !p.alive ? " · caught" : ""}
              </span>
            ))}
          </div>
          {h.playing && (
            <button className="hmx-leave" onPointerDown={(e) => { e.stopPropagation(); setConfirmLeave(true); }}>Leave</button>
          )}
        </div>
      )}

      <div className="hm-msg" style={{ opacity: h && !h.intro && h.msg && !over ? 1 : 0 }} aria-live="polite">{h && !over ? h.msg : ""}</div>

      {h && h.playing && h.hiding && !over && (
        <div className="hm-hidetext">{h.close ? "Hold still… she's right outside." : "Hidden and safe. Press Use to come out."}</div>
      )}
      {h && !h.intro && !over && (
        <>
          {/* while she hums you may move; when it stops, she listens */}
          <div className={`hm-humming${h.listening ? " off" : ""}`} aria-hidden="true">{h.quiet ? "Nana has gone quiet — far off, she can't hear you" : "♪ Nana is humming…"}</div>
          <div className={`hm-listen${h.listening ? "" : " off"}`} role="alert">
            <b>SHE'S LISTENING</b>
            <span>The humming stopped. Freeze. Do not move.</span>
          </div>
        </>
      )}

      {h && h.playing && !h.intro && (
        <div className="hm-pad">
          {/* Use (doors, hiding — lit when there's something to use) and your light */}
          <button className={`hm-use${h.use && !/^Lights/.test(h.use) ? " on" : ""}`} onPointerDown={press(doUse)}>{h.use || "Use"}</button>
          <button className={`hm-light${h.light ? " on" : ""}`} onPointerDown={press((c) => { c.body.light = !c.body.light; })}
            title="Your light: off, she has to be right beside you to see you">{h.light ? "Light on" : "Light off"}</button>
        </div>
      )}

      {/* Caught: a moment, then back in at the entrance. */}
      {h && h.respawning && !over && (
        <div className="hmx-spec"><div className="hmx-banner">Caught! Back at the entrance in a moment…</div></div>
      )}

      {/* Left, or only watching: look through someone else's eyes until the
          clock runs out, and go whenever you like. */}
      {watchingNow && h && (
        <div className="hmx-spec">
          {h.role === "player" && h.left && (
            <div className="hmx-banner">You left the house. <span>Watch the others, or go back to the lobby.</span></div>
          )}
          <div className="hmx-specbar">
            <button onPointerDown={watch(-1)} aria-label="Watch the previous player">◀</button>
            <span className="hmx-watching" style={{ "--c": h.watching?.color || "#a39a88" }}>
              {h.watching ? <>Watching <b>{h.watching.name}</b></> : "Nobody left inside"}
            </span>
            <button onPointerDown={watch(1)} aria-label="Watch the next player">▶</button>
          </div>
          <button className="hmx-out" onClick={leave} disabled={leaving}>{leaving ? "Leaving…" : "← Leave"}</button>
        </div>
      )}

      {confirmLeave && (
        <div className="hm-ov">
          <h1>Leave the house?</h1>
          <p>
            {h?.mode === "coop"
              ? "Your friends play on to the end of the clock. What you've scored together still counts."
              : "Your score so far counts. Anyone else plays on to the end of the clock."}
          </p>
          <button className="hm-go" onClick={leave} disabled={leaving}>{leaving ? "Leaving…" : "Leave"}</button>
          <button className="hm-go" onClick={() => setConfirmLeave(false)}>Stay</button>
        </div>
      )}

      {over && <Results over={over} me={currentUser} onExit={leave} leaving={leaving} />}

      {rotated && h && !over && <div className="hm-rothint" aria-hidden="true">↺ Turn your phone to the left</div>}
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
    ? (mine && mine.escapes ? "You got out!" : "Nana kept you")
    : iWon ? (over.mode === "teams" ? `${mine.name} team wins!` : "You got out — you win!")
    : winners.length ? `${winnerName(winners[0])} got out first`
    : timeUp ? "The night ran out" : "Nobody got out";
  const sub = coop
    ? (mine && mine.escapes ? `Out through the front door together — ${mine.score} points.` : timeUp ? "The clock ran out before you found the way out." : "Nobody made it out.")
    : winners.length ? "First one out wins." : "Nobody got out before the clock ran out — nobody wins.";
  return (
    <div className="hm-ov hmx-results">
      <h1>{headline}</h1>
      <p>{sub}</p>
      <div className="hmx-standings">
        {over.sides.map((s, i) => (
          <div key={s.key} className={`hmx-row${mine && s.key === mine.key ? " mine" : ""}`} style={{ "--c": s.color }}>
            <span className="hmx-place">{s.escapes ? "🏆" : "✕"}</span>
            <span className="hmx-name">
              <b>{over.mode === "free" ? s.members[0]?.name : s.name}</b>
              <small>{s.escapes ? "Got out · " : ""}{plural(s.total, "key", "keys")}{over.mode !== "free" ? ` · ${s.members.map((m) => m.name).join(", ")}` : ""}</small>
            </span>
            <span className="hmx-got">{s.score}</span>
          </div>
        ))}
      </div>
      {ctx && (
        <>
          {rematch && <p className="hmx-rematch">🎮 {rematch.by} started a new game — join in!</p>}
          <button className="hm-go hm-again" onClick={playAgain} disabled={again === "busy" || leaving}>
            {again === "busy" ? "Setting up…" : rematch ? `🔄 Join ${rematch.by}'s game` : "🔄 Play again"}
          </button>
          {again && again !== "busy" && <p className="hmx-rematch">{again}</p>}
        </>
      )}
      <button className="hm-go" onClick={onExit} disabled={leaving}>{leaving ? "Saving…" : "Back to the lobby"}</button>
    </div>
  );
}
