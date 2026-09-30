// src/pages/Wick.jsx
// WICK — a single-player horror page. No room, no login, no score server.
//
// The rules live in components/horror/wickSim.js and the pictures in
// wickArt.js; this file is the glue: input, animation, and the HUD.
//
// Play state is held in a ref (`sim`) and mutated directly, then a counter is
// bumped to re-render the HUD. Two taps in one tick each see the other's
// result, which state alone would not give.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  COLS, ROWS, SHADE, CRAWLER, LUNGER, DARK, MAX_OIL, BRIGHT_AT, DIM_AT, FLARE_COST, FLARE_RANGE,
  DIRS, newRun, act, preview, threats, warning, radiusFor, isLit,
} from "../components/horror/wickSim";
import {
  drawShade, drawCrawler, drawLunger, drawPlayer, drawKey, drawFlask, drawStairs, drawScare, flicker,
} from "../components/horror/wickArt";

const STEP_MS = 130;        // your move
const THEIR_DELAY = 90;     // they move a beat after you, so the order reads
const DASH_MS = 150;
const SCARE_MS = 1100;
const FLOOR_FADE_MS = 1100;
const SWIPE_PX = 28;        // further than this between press and lift is a swipe

const BEST_KEY = "wick.best";
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const writeBest = (n) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* private window */ } };

// Every death is explained in terms of the rule you broke.
const CAUSE = {
  [SHADE]: ["A SHADE TOOK YOU", "Your lantern went out, and nothing held them back. Shades can't cross the light — keep it burning."],
  [CRAWLER]: ["THE CRAWLER GOT YOU", "It moves every other turn. The red corners mark where it can reach next — don't end your step there."],
  [LUNGER]: ["THE TALL ONE CAUGHT YOU", "A red lane means it charges next turn, all the way to the end. Step out, or get a pillar between you."],
  [DARK]: ["THE DARK TOOK YOU", "Out of oil. Every step burns one — sometimes a flask is worth the detour."],
};

// Met for the first time on this floor: one line on how it works.
const MEET = {
  [SHADE]: ["Shades", "can't enter your light. As the oil runs down, the light shrinks and they close in."],
  [CRAWLER]: ["A crawler", "ignores the light, but only moves every other turn. Red corners: where it can reach next."],
  [LUNGER]: ["The tall one", "watches rows and columns. A red lane means it charges next turn. Break the line."],
};

const KEYS = {
  ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left",
  w: "up", d: "right", s: "down", a: "left", " ": "wait", f: "flare",
};

const ease = (k) => 1 - (1 - k) * (1 - k);

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

    a.tweens.set("p", { fx: from.x, fy: from.y, tx: s.player.x, ty: s.player.y, t0: now, dur: STEP_MS });
    for (const mv of ev.moves) {
      const was = displayOf(a, mv.id, before.get(mv.id) || mv.from, now);
      a.tweens.set(mv.id, {
        fx: was.x, fy: was.y, tx: mv.to.x, ty: mv.to.y,
        t0: now + THEIR_DELAY, dur: mv.dash ? DASH_MS : STEP_MS, dash: mv.dash,
      });
    }
    for (const id of ev.burned) {
      const at = before.get(id);
      if (at) a.burns.push({ x: at.x, y: at.y, t0: now });
    }
    if (action === "flare") { a.flare = { t0: now, x: s.player.x, y: s.player.y }; a.shake = 6; }
    if (ev.moves.some((m) => m.dash)) a.shake = Math.max(a.shake, 10);

    if (ev.dead) {
      a.scare = { t0: now + THEIR_DELAY + STEP_MS + 60, kind: ev.dead.kind };
      a.shake = 22;
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

// The oil left, with the two points where the light shrinks marked on it —
// the most important thing to watch after the monsters themselves.
function OilGauge({ oil, dark }) {
  const pct = (n) => `${(n / MAX_OIL) * 100}%`;
  const r = radiusFor(oil);
  return (
    <div className={`wk-oil r${r}`} aria-label={`Oil ${oil}`}>
      <div className="wk-oil-bar">
        <span className="wk-oil-fill" style={{ width: pct(oil) }} />
        <i style={{ left: pct(DIM_AT) }} />
        <i style={{ left: pct(BRIGHT_AT) }} />
      </div>
      <div className="wk-oil-label">
        <b>{oil}</b> OIL · {r === 2 ? "bright" : r === 1 ? "dim" : r === 0 ? "guttering" : `dark ${dark}`}
      </div>
    </div>
  );
}

// ── painting ─────────────────────────────────────────────────────────────────

function displayOf(a, id, fallback, now) {
  const tw = a.tweens.get(id);
  if (!tw) return { x: fallback.x, y: fallback.y };
  const k = Math.max(0, Math.min(1, (now - tw.t0) / tw.dur));
  const e = tw.dash ? k * k : ease(k);
  return { x: tw.fx + (tw.tx - tw.fx) * e, y: tw.fy + (tw.ty - tw.fy) * e };
}

function paint(canvas, B, s, a, pv, threat, armed, now, screen) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { W, H, T, ox, oy, dpr } = B;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#040308";
  ctx.fillRect(0, 0, W, H);
  if (!s) { paintIdle(ctx, W, H, now); return; }

  ctx.save();
  a.shake *= 0.86;
  if (a.shake > 0.5) ctx.translate((Math.random() - 0.5) * a.shake, (Math.random() - 0.5) * a.shake);

  const pp = displayOf(a, "p", s.player, now);
  const r = radiusFor(s.oil);
  const fl = flicker(now, s.oil);
  const cx = (x) => ox + (x + 0.5) * T;
  const cy = (y) => oy + (y + 0.5) * T;

  // floor and pillars
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const x0 = ox + x * T, y0 = oy + y * T;
      if (s.walls[y * COLS + x]) {
        ctx.fillStyle = "#0A0910";
        ctx.fillRect(x0, y0, T, T);
        ctx.fillStyle = "#1C1928";
        ctx.fillRect(x0 + T * 0.1, y0 + T * 0.06, T * 0.8, T * 0.72);
        ctx.fillStyle = "#26222F";
        ctx.fillRect(x0 + T * 0.1, y0 + T * 0.06, T * 0.8, T * 0.14);
        continue;
      }
      const lit = isLit(s, x, y);
      const d = Math.abs(x - s.player.x) + Math.abs(y - s.player.y);
      if (lit) {
        const w = 1 - d / (r + 1.6);
        ctx.fillStyle = `rgb(${Math.round(34 + 34 * w * fl)},${Math.round(25 + 22 * w * fl)},${Math.round(20 + 8 * w)})`;
      } else {
        ctx.fillStyle = "#0F0D16";
      }
      ctx.fillRect(x0 + 1, y0 + 1, T - 2, T - 2);
      // a few cracks, fixed per tile
      if ((x * 7 + y * 13) % 5 === 0) {
        ctx.strokeStyle = lit ? "rgba(0,0,0,.35)" : "rgba(0,0,0,.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0 + T * 0.2, y0 + T * 0.3);
        ctx.lineTo(x0 + T * 0.45, y0 + T * 0.45);
        ctx.lineTo(x0 + T * 0.4, y0 + T * 0.7);
        ctx.stroke();
      }
    }
  }

  // the lantern's glow, on top of the floor
  if (r >= 0) {
    const g = ctx.createRadialGradient(cx(pp.x), cy(pp.y), T * 0.2, cx(pp.x), cy(pp.y), (r + 1.3) * T * fl);
    g.addColorStop(0, "rgba(255,176,80,.30)");
    g.addColorStop(1, "rgba(255,150,60,0)");
    ctx.fillStyle = g;
    ctx.fillRect(ox, oy, T * COLS, T * ROWS);
  }

  drawStairs(ctx, ox + s.exit.x * T, oy + s.exit.y * T, T, s.hasKey, now);
  if (s.key) drawKey(ctx, cx(s.key.x), cy(s.key.y), T, now);
  for (const f of s.flasks) drawFlask(ctx, cx(f.x), cy(f.y), T, now);

  // what reaches where next turn
  const pulse = 0.5 + Math.sin(now / 160) * 0.5;
  const aimOf = new Map(s.monsters.filter((m) => m.aim).map((m) => [m.id, m.aim]));
  for (const t of threat) {
    const x0 = ox + t.x * T, y0 = oy + t.y * T;
    if (t.kind === LUNGER) {
      ctx.fillStyle = `rgba(255,30,50,${0.2 + pulse * 0.16})`;
      ctx.fillRect(x0 + 1, y0 + 1, T - 2, T - 2);
      const aim = aimOf.get(t.id);
      if (aim) chevron(ctx, x0 + T / 2, y0 + T / 2, T * 0.16, aim, `rgba(255,120,120,${0.5 + pulse * 0.4})`);
    } else {
      ctx.fillStyle = `rgba(255,30,50,${0.1 + pulse * 0.08})`;
      ctx.fillRect(x0 + 1, y0 + 1, T - 2, T - 2);
      corners(ctx, x0, y0, T, `rgba(255,60,70,${0.6 + pulse * 0.35})`);
    }
  }

  // where you can step, and which steps are deadly
  if (pv && !s.dead && screen === "play") {
    for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
      const o = pv[dir];
      if (!o || !o.ok) continue;
      const x = s.player.x + dx, y = s.player.y + dy;
      const px = cx(x), py = cy(y);
      if (o.deadly) {
        const hot = armed === dir;
        ctx.strokeStyle = hot ? "#FFFFFF" : "rgba(255,70,80,.9)";
        ctx.lineWidth = Math.max(2, T * (hot ? 0.08 : 0.05));
        const k = T * (hot ? 0.2 + pulse * 0.04 : 0.15);
        ctx.beginPath();
        ctx.moveTo(px - k, py - k); ctx.lineTo(px + k, py + k);
        ctx.moveTo(px + k, py - k); ctx.lineTo(px - k, py + k);
        ctx.stroke();
      } else {
        ctx.strokeStyle = o.descends ? "rgba(150,255,190,.85)" : "rgba(255,230,190,.28)";
        ctx.lineWidth = Math.max(1.5, T * 0.035);
        ctx.beginPath();
        ctx.arc(px, py, T * 0.13, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // things, back to front so a tall one stands in front of the row behind it
  const people = s.monsters.map((m) => ({ m, at: displayOf(a, m.id, m, now) }));
  people.push({ m: null, at: pp });
  people.sort((u, v) => u.at.y - v.at.y);
  for (const { m, at } of people) {
    const px = cx(at.x), py = cy(at.y);
    if (!m) { drawPlayer(ctx, px, py, T, { t: now, oil: s.oil }); continue; }
    const lit = isLit(s, m.x, m.y);
    const look = [Math.sign(s.player.x - m.x), Math.sign(s.player.y - m.y)];
    if (m.kind === SHADE) drawShade(ctx, px, py, T, { lit, t: now, look, phase: m.id * 1.9 });
    else if (m.kind === CRAWLER) drawCrawler(ctx, px, py, T, { lit, t: now, ready: m.ready, stunned: m.stun > 0, look });
    else drawLunger(ctx, px, py, T, { lit, t: now, aim: m.aim, rest: m.rest > 0, stunned: m.stun > 0 });
    if (m.stun > 0) {
      ctx.fillStyle = "rgba(255,220,150,.85)";
      ctx.font = `700 ${Math.round(T * 0.26)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("✦", px + T * 0.28, py - T * 0.3);
    }
  }

  // shades burning away
  a.burns = a.burns.filter((b) => now - b.t0 < 700);
  for (const b of a.burns) {
    const k = (now - b.t0) / 700;
    drawShade(ctx, cx(b.x), cy(b.y) - k * T * 0.4, T, { lit: true, t: now, alpha: 1 - k, phase: 0 });
    ctx.fillStyle = `rgba(255,190,90,${0.5 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(cx(b.x), cy(b.y), T * (0.3 + k * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  if (a.flare) {
    const k = (now - a.flare.t0) / 500;
    if (k >= 1) a.flare = null;
    else {
      ctx.strokeStyle = `rgba(255,210,140,${1 - k})`;
      ctx.lineWidth = T * 0.2 * (1 - k);
      ctx.beginPath();
      ctx.arc(cx(a.flare.x), cy(a.flare.y), (FLARE_RANGE + 0.5) * T * ease(k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,230,190,${0.35 * (1 - k)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Vignette: closes in as the light does, and breathes when you are in the dark.
  const reach = r >= 0 ? (r + 2.2) * T : T * (1.1 + Math.sin(now / 240) * 0.2);
  const v = ctx.createRadialGradient(cx(pp.x), cy(pp.y), reach * 0.6, cx(pp.x), cy(pp.y), reach + Math.max(W, H) * 0.55);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, r >= 0 ? "rgba(0,0,0,.55)" : "rgba(8,0,4,.82)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (a.floor) {
    const k = (now - a.floor.t0) / FLOOR_FADE_MS;
    if (k >= 1) a.floor = null;
    else {
      ctx.fillStyle = `rgba(0,0,0,${1 - ease(k)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(236,226,210,${k < 0.5 ? 1 : 2 - 2 * k})`;
      ctx.font = `700 ${Math.round(T * 0.8)}px Fredoka, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`DEPTH ${a.floor.depth}`, W / 2, H / 2);
    }
  }
}

// The scare gets the whole screen, HUD and all, for about a second.
function paintScare(canvas, a, now) {
  if (!canvas) return;
  const on = a.scare && now >= a.scare.t0 && now - a.scare.t0 < SCARE_MS;
  canvas.style.display = on ? "block" : "none";
  if (!on) return;
  const W = window.innerWidth, H = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawScare(ctx, W, H, a.scare.kind, now, (now - a.scare.t0) / SCARE_MS);
}

// Behind the title card: a dark floor and one pair of eyes that is not yours.
function paintIdle(ctx, W, H, now) {
  const blink = Math.sin(now / 1900) > 0.96;
  if (blink) return;
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.shadowColor = "#C8D2FF";
  ctx.shadowBlur = 12;
  const y = H * 0.12, x = W * 0.5 + Math.sin(now / 3000) * W * 0.05;
  ctx.beginPath();
  ctx.arc(x - 9, y, 2.4, 0, Math.PI * 2);
  ctx.arc(x + 9, y, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function chevron(ctx, x, y, k, aim, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(aim.dy, aim.dx));
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, k * 0.5);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-k * 0.6, -k);
  ctx.lineTo(k * 0.6, 0);
  ctx.lineTo(-k * 0.6, k);
  ctx.stroke();
  ctx.restore();
}

function corners(ctx, x0, y0, T, color) {
  const k = T * 0.22, p = T * 0.1;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, T * 0.05);
  ctx.beginPath();
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = x0 + (sx ? T - p : p), y = y0 + (sy ? T - p : p);
    const hx = sx ? -k : k, vy = sy ? -k : k;
    ctx.moveTo(x + hx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + vy);
  }
  ctx.stroke();
}
