// src/pages/Wick.jsx
// WICK — a single-player horror page. No room, no login, no score server.
//
// The rules live in components/horror/wickSim.js, the pictures in wickArt.js
// and the board painting in wickPaint.js (shared with the room game,
// games/WickGame.jsx); this file is the glue: input and the HUD.
//
// Play state is held in a ref (`sim`) and mutated directly, then a counter is
// bumped to re-render the HUD. Two taps in one tick each see the other's
// result, which state alone would not give.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  COLS, ROWS, SHADE, CRAWLER, LUNGER, FLARE_COST, FLARE_RANGE, DIRS, newRun, act, preview, threats, warning,
} from "../components/horror/wickSim";
import {
  SWIPE_PX, CAUSE, MEET, KEYS, displayOf, animateTurn, paint, paintScare,
} from "../components/horror/wickPaint";
import OilGauge from "../components/horror/WickOil";

const BEST_KEY = "wick.best";
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const writeBest = (n) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* private window */ } };

export default function Wick() {
  const navigate = useNavigate();
  const sim = useRef(null);
  const pv = useRef(null);
  const threat = useRef([]);
  const anim = useRef({ tweens: new Map(), burns: [], flare: null, floor: null, scare: null, shake: 0 });
  const armed = useRef(null);
  const met = useRef(new Set());
  const canvasRef = useRef(null);
  const scareRef = useRef(null);
  const stageRef = useRef(null);
  const box = useRef({ W: 300, H: 400, T: 40, ox: 0, oy: 0, dpr: 1 });

  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);
  const [screen, setScreen] = useState("title");      // title | play | dead
  const [best, setBest] = useState(readBest);
  const [meeting, setMeeting] = useState(null);       // [name, text] for a new kind
  const [armedMsg, setArmedMsg] = useState(null);

  // Keep the page from scrolling or pulling to refresh while it is open.
  useEffect(() => {
    document.body.classList.add("in-game");
    return () => document.body.classList.remove("in-game");
  }, []);

  const introduce = useCallback((s) => {
    const kinds = [SHADE, CRAWLER, LUNGER].filter((k) => s.monsters.some((m) => m.kind === k) && !met.current.has(k));
    kinds.forEach((k) => met.current.add(k));
    // Only the newest: one kind arrives per floor, and the line has room for one.
    setMeeting(kinds.length ? [MEET[kinds[kinds.length - 1]]] : null);
  }, []);

  const settle = useCallback(() => {
    const s = sim.current;
    pv.current = preview(s);
    threat.current = threats(s);
    armed.current = null;
    setArmedMsg(null);
  }, []);

  const start = useCallback(() => {
    sim.current = newRun(Math.floor(Math.random() * 1e9) + 1);
    met.current = new Set();
    const a = anim.current;
    a.tweens = new Map(); a.burns = []; a.flare = null; a.scare = null; a.shake = 0;
    a.floor = { t0: performance.now(), depth: 1 };
    settle();
    introduce(sim.current);
    setScreen("play");
  }, [settle, introduce]);

  const doAction = useCallback((action) => {
    const s = sim.current;
    if (!s || s.dead || screen !== "play") return;
    const p = pv.current && pv.current[action];
    if (!p || !p.ok) return;
    // A deadly move takes a second tap. A slip of the thumb is not a choice.
    if (p.deadly && armed.current !== action) {
      armed.current = action;
      setArmedMsg(action === "wait" || action === "flare"
        ? "Staying here gets you killed. Tap again if you mean it."
        : "That step gets you killed. Tap it again if you mean it.");
      refresh();
      return;
    }
    const now = performance.now();
    const a = anim.current;
    const before = new Map(s.monsters.map((m) => [m.id, { x: m.x, y: m.y }]));
    const from = displayOf(a, "p", s.player, now);
    const ev = act(s, action);
    if (!ev) return;

    if (ev.descended) {
      a.tweens = new Map();
      a.burns = [];
      a.floor = { t0: now, depth: s.depth };
      settle();
      introduce(s);
      refresh();
      return;
    }
    setMeeting(null);

    animateTurn(a, s, ev, action, before, from, now);

    if (ev.dead) {
      if (s.depth > best) { setBest(s.depth); writeBest(s.depth); }
      setScreen("dead");
    }
    settle();
    refresh();
  }, [screen, best, settle, introduce]);

  // keyboard, for a desk
  useEffect(() => {
    const down = (e) => {
      const k = KEYS[e.key] || KEYS[e.key.toLowerCase?.()];
      if (!k) return;
      e.preventDefault();
      if (screen === "title" || (screen === "dead" && e.key === " ")) return;
      doAction(k);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [doAction, screen]);

  // Board size from the stage, never the window.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const T = Math.floor(Math.min(r.width / COLS, r.height / ROWS));
      box.current = { W: r.width, H: r.height, T, ox: Math.floor((r.width - T * COLS) / 2), oy: Math.floor((r.height - T * ROWS) / 2), dpr };
      const c = canvasRef.current;
      if (c) {
        c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
        c.style.width = `${r.width}px`; c.style.height = `${r.height}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The paint loop. Reads the live sim; never changes it.
  useEffect(() => {
    let raf;
    const frame = (now) => {
      paint(canvasRef.current, box.current, sim.current, anim.current, pv.current, threat.current, armed.current, now, screen);
      paintScare(scareRef.current, anim.current, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  // Two ways to step, both one-thumbed: tap the tile next to you, or swipe
  // anywhere on the board — the stairs are at the top, and a thumb is not.
  // Decided on lift, so a swipe is never mistaken for a tap where it began.
  const press = useRef(null);
  const onDown = (e) => { press.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
  const onUp = (e) => {
    const p0 = press.current;
    press.current = null;
    const s = sim.current;
    if (!p0 || p0.id !== e.pointerId || !s || screen !== "play") return;
    const mx = e.clientX - p0.x, my = e.clientY - p0.y;
    if (Math.hypot(mx, my) >= SWIPE_PX) {
      return doAction(Math.abs(mx) > Math.abs(my) ? (mx > 0 ? "right" : "left") : (my > 0 ? "down" : "up"));
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const { T, ox, oy } = box.current;
    const gx = Math.floor((p0.x - rect.left - ox) / T);
    const gy = Math.floor((p0.y - rect.top - oy) / T);
    const dx = gx - s.player.x, dy = gy - s.player.y;
    if (dx === 0 && dy === 0) return doAction("wait");
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    const dir = Object.keys(DIRS).find((k) => DIRS[k][0] === dx && DIRS[k][1] === dy);
    doAction(dir);
  };

  const s = sim.current;
  const warn = s && screen === "play" ? warning(s) : null;
  const p = pv.current;
  const cause = s && s.dead ? CAUSE[s.dead.kind] : null;

  return (
    <div className="wk" data-no-fun>
      <canvas ref={scareRef} className="wk-scare" aria-hidden="true" />
      <div className="wk-bar">
        <button className="wk-out" onClick={() => navigate("/")}>← Leave</button>
        <span className="wk-title">WICK</span>
        {s && screen !== "title" && (
          <>
            <span className="wk-stat"><b>{s.depth}</b><span>DEPTH</span></span>
            <span className={`wk-stat wk-key${s.hasKey ? " got" : ""}`}><b>{s.hasKey ? "✓" : "—"}</b><span>KEY</span></span>
          </>
        )}
        <span className="wk-stat"><b>{best || "—"}</b><span>BEST</span></span>
      </div>

      <div className="wk-stage" ref={stageRef}>
        <canvas ref={canvasRef} className="wk-canvas"
          onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { press.current = null; }}
          role="img" aria-label="The floor, lit by your lantern" />

        {screen === "title" && (
          <div className="wk-card wk-intro">
            <h1 className="wk-logo">WICK</h1>
            <p className="wk-sub">Go down. Keep the light.</p>
            <ul className="wk-rules">
              <li><span className="wk-ico">🪔</span><span>Every step burns oil. The oil <i>is</i> your light — and it shrinks as it runs down.</span></li>
              <li><span className="wk-ico">🗝️</span><span>Take the key to the stairs. Nothing moves until you do.</span></li>
              <li><span className="wk-ico wk-red">▦</span><span>Red on the floor means something reaches there next turn. Don't end your step on it.</span></li>
              <li><span className="wk-ico">🔥</span><span>A flare spends {FLARE_COST} oil: burns shades within {FLARE_RANGE} tiles, stuns everything else.</span></li>
            </ul>
            <button className="wk-go" onClick={start}>Light the wick</button>
            <p className="wk-hint">Swipe anywhere, or tap a tile next to you, to step. Tap yourself to wait.</p>
          </div>
        )}

        {screen === "dead" && cause && (
          <div className="wk-card wk-over">
            <div className="wk-shout">{cause[0]}</div>
            <p className="wk-why">{cause[1]}</p>
            <div className="wk-final">
              <span><b>{s.depth}</b>DEPTH</span>
              <span><b>{s.turn}</b>STEPS</span>
              <span><b>{best}</b>BEST</span>
            </div>
            <button className="wk-go" onClick={start}>Go down again</button>
            <button className="wk-quiet" onClick={() => navigate("/")}>Leave</button>
          </div>
        )}
      </div>

      {/* One place for words, under the board, so nothing ever covers it.
          A warning outranks an introduction; an introduction outranks advice. */}
      <div className={`wk-msg lvl${armedMsg ? 3 : warn ? warn.level : 0}`} aria-live="assertive">
        {screen !== "play" ? null
          : armedMsg ? armedMsg
          : warn && warn.level >= 2 ? warn.text
          : meeting ? meeting.map(([name, text]) => <span key={name} className="wk-meet"><b>{name}</b> {text}</span>)
          : warn && warn.text}
      </div>

      <div className="wk-foot" style={{ visibility: s ? "visible" : "hidden" }}>
        <button className={`wk-btn${p && p.wait.deadly ? " deadly" : ""}${armed.current === "wait" ? " armed" : ""}`}
          disabled={screen !== "play"} onClick={() => doAction("wait")}>
          <b>WAIT</b><span>−1 oil</span>
        </button>
        <OilGauge oil={s ? s.oil : 0} dark={s ? s.dark : 0} />
        <button className={`wk-btn flare${p && p.flare.deadly ? " deadly" : ""}${armed.current === "flare" ? " armed" : ""}`}
          disabled={screen !== "play" || !(p && p.flare.ok)} onClick={() => doAction("flare")}>
          <b>FLARE</b><span>−{FLARE_COST} oil</span>
        </button>
      </div>
    </div>
  );
}
