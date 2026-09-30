// src/pages/Hollow.jsx
// The Hollow — a dark house, three candles, and something walking the halls.
//
// Deliberately not a PlayRoom room game: no lobby, no seats, no database, no
// login. It is a door off the navbar you can walk through and try. Everything
// else here is bright and friendly; this is the one place that isn't.
//
// The rules live in components/horror/hollowSim.js.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { N, E, S, W, DIRS, isOpen } from "../components/games/mazeBoard";
import {
  newFloor, move, reprieve, gap, visible, exitOpen,
  VISION, HEAR_DIST, CANDLE_POINTS, scoreForFloor,
} from "../components/horror/hollowSim";

const SWIPE_MIN = 22;
const CAUGHT_MS = 1600;

// A cold palette: the only warm things in the house are the candles and you.
const DARK = "#0A0810";
const FLOOR_LIT = "#241F33";
const WALL = "#6B6480";
const WALL_DIM = "#2A2540";
const YOU = "#7FE3FF";
const CANDLE = "#FFC53D";
const DOOR_SHUT = "#4A3A5E";
const DOOR_OPEN = "#B5E655";
const IT = "#E8E2F0";

// Things it is unpleasant to read in the dark.
const WHISPERS = [
  "something shifts in the dark",
  "a floorboard settles",
  "it knows where you are",
  "closer",
  "don't stop",
  "it was not there before",
];

export default function Hollow() {
  const navigate = useNavigate();
  const seedRef = useRef(Math.floor(Math.random() * 1e6));
  const sim = useRef(null);
  if (sim.current === null) sim.current = newFloor(seedRef.current, 1);

  const [, forceDraw] = useState(0);
  const [score, setScore] = useState(0);
  const [floor, setFloor] = useState(1);
  const [caught, setCaught] = useState(0);
  const [escapes, setEscapes] = useState(0);
  const [whisper, setWhisper] = useState(null);
  const [over, setOver] = useState(false);          // the caught screen
  const canvasRef = useRef(null);
  const pulse = useRef(0);
  const flash = useRef(0);
  const timers = useRef([]);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const redraw = useCallback(() => forceDraw((n) => n + 1), []);

  const say = useCallback((text) => {
    setWhisper(text);
    timers.current.push(setTimeout(() => setWhisper((w) => (w === text ? null : w)), 1800));
  }, []);

  const step = useCallback((bit) => {
    const s = sim.current;
    if (s.caught || over) return;
    const dir = DIRS.find((d) => d.bit === bit);
    const before = s.taken.length;
    const out = move(s, dir);
    if (!out.moved) return;

    if (out.tookCandle) {
      setScore((v) => v + CANDLE_POINTS);
      say(s.taken.length === s.candles.length
        ? "the last one. the door will open now."
        : `${s.taken.length} of ${s.candles.length}. it heard that.`);
    } else if (before !== s.taken.length) { /* unreachable, kept for clarity */ }

    if (out.escaped) {
      setScore((v) => v + scoreForFloor(s));
      setEscapes((v) => v + 1);
      const next = s.floor + 1;
      sim.current = newFloor(seedRef.current, next);
      setFloor(next);
      say("out. but the house is bigger now.");
      redraw();
      return;
    }

    if (out.caught) {
      setCaught((v) => v + 1);
      flash.current = 1;
      setOver(true);
      timers.current.push(setTimeout(() => {
        reprieve(sim.current);
        setOver(false);
        say("you are back at the door. so is it.");
        redraw();
      }, CAUGHT_MS));
      redraw();
      return;
    }

    // It is close enough to hear but not to see.
    const d = gap(s);
    if (out.itMoved && d <= HEAR_DIST && d > VISION) {
      if (Math.random() < 0.55) say(WHISPERS[Math.floor(Math.random() * WHISPERS.length)]);
    }
    redraw();
  }, [over, say, redraw]);

  // Keys
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      const bit = (k === "arrowup" || k === "w") ? N
        : (k === "arrowright" || k === "d") ? E
        : (k === "arrowdown" || k === "s") ? S
        : (k === "arrowleft" || k === "a") ? W : null;
      if (!bit) return;
      e.preventDefault();
      step(bit);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // Swipe
  const touch = useRef(null);
  const onDown = (e) => { touch.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    const t = touch.current;
    touch.current = null;
    if (!t) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
    step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? E : W) : (dy > 0 ? S : N));
  };

  // The heartbeat runs whether or not you move: the house does not wait for you.
  useEffect(() => {
    let raf;
    const tick = () => {
      const s = sim.current;
      const d = Math.max(0, gap(s));
      // the nearer it is, the faster and harder this beats
      const rate = d <= 1 ? 4.6 : d <= 3 ? 3.0 : d <= 6 ? 1.9 : 1.1;
      pulse.current = (pulse.current + rate * 0.016) % (Math.PI * 2);
      flash.current *= 0.93;
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    const { maze } = s;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const box = canvas.parentElement.getBoundingClientRect();
    const side = Math.max(200, Math.min(box.width, box.height));
    if (canvas.width !== Math.round(side * dpr)) {
      canvas.width = Math.round(side * dpr);
      canvas.height = Math.round(side * dpr);
      canvas.style.width = `${side}px`;
      canvas.style.height = `${side}px`;
    }
    const cell = side / Math.max(maze.rows, maze.cols);
    const wall = Math.max(2, cell * 0.1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, side, side);

    // Rooms, but only the ones the torch reaches.
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        if (!visible(s, r, c)) continue;
        const x = c * cell, y = r * cell;
        const away = Math.hypot(r - s.player.r, c - s.player.c);
        const lit = Math.max(0.12, 1 - away / (VISION + 0.6));
        ctx.globalAlpha = lit;
        ctx.fillStyle = FLOOR_LIT;
        ctx.fillRect(x, y, cell, cell);

        // the door
        if (r === maze.goal.r && c === maze.goal.c) {
          ctx.fillStyle = exitOpen(s) ? DOOR_OPEN : DOOR_SHUT;
          ctx.fillRect(x + cell * 0.18, y + cell * 0.18, cell * 0.64, cell * 0.64);
        }
        // candles still standing
        for (const cd of s.candles) {
          if (cd.r !== r || cd.c !== c) continue;
          if (s.taken.includes(`${r},${c}`)) continue;
          const flicker = 0.75 + Math.sin(pulse.current * 3 + r + c) * 0.25;
          ctx.globalAlpha = lit * flicker;
          ctx.fillStyle = CANDLE;
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, cell * 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = lit;
        }

        // walls of this room
        ctx.strokeStyle = away < 1.2 ? WALL : WALL_DIM;
        ctx.lineWidth = wall;
        ctx.lineCap = "square";
        const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
        if (!isOpen(maze, r, c, N)) line(x, y, x + cell, y);
        if (!isOpen(maze, r, c, S)) line(x, y + cell, x + cell, y + cell);
        if (!isOpen(maze, r, c, W)) line(x, y, x, y + cell);
        if (!isOpen(maze, r, c, E)) line(x + cell, y, x + cell, y + cell);
      }
    }
    ctx.globalAlpha = 1;

    // It — only if the torch finds it. Otherwise you only ever hear it.
    if (visible(s, s.stalker.r, s.stalker.c)) {
      const x = s.stalker.c * cell + cell / 2, y = s.stalker.r * cell + cell / 2;
      ctx.fillStyle = IT;
      ctx.beginPath();
      ctx.ellipse(x, y, cell * 0.2, cell * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1A0B12";                       // two holes where eyes go
      ctx.beginPath(); ctx.arc(x - cell * 0.07, y - cell * 0.06, cell * 0.045, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + cell * 0.07, y - cell * 0.06, cell * 0.045, 0, Math.PI * 2); ctx.fill();
    }

    // You
    const px = s.player.c * cell + cell / 2, py = s.player.r * cell + cell / 2;
    const beat = 1 + Math.sin(pulse.current) * 0.08;
    ctx.fillStyle = YOU;
    ctx.beginPath(); ctx.arc(px, py, cell * 0.22 * beat, 0, Math.PI * 2); ctx.fill();

    // The torch falls off into nothing.
    const torch = ctx.createRadialGradient(px, py, cell * 0.4, px, py, cell * (VISION + 0.9));
    torch.addColorStop(0, "rgba(0,0,0,0)");
    torch.addColorStop(0.55, "rgba(6,5,12,.45)");
    torch.addColorStop(1, "rgba(6,5,12,.97)");
    ctx.fillStyle = torch;
    ctx.fillRect(0, 0, side, side);

    // Dread, in red, as it closes.
    const d = Math.max(0, gap(s));
    const dread = d <= 6 ? Math.min(0.5, (7 - d) / 10) * (0.7 + Math.sin(pulse.current) * 0.3) : 0;
    if (dread > 0.01) {
      const v = ctx.createRadialGradient(side / 2, side / 2, side * 0.2, side / 2, side / 2, side * 0.72);
      v.addColorStop(0, "rgba(120,0,0,0)");
      v.addColorStop(1, `rgba(150,0,10,${dread})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, side, side);
    }
    if (flash.current > 0.02) {
      ctx.fillStyle = `rgba(160,0,10,${flash.current * 0.85})`;
      ctx.fillRect(0, 0, side, side);
    }
  }

  const s = sim.current;
  const found = s.taken.length;
  const near = Math.max(0, gap(s));

  return (
    <div className="hollow">
      <div className="hollow-bar">
        <button className="hollow-out" onClick={() => navigate("/")} aria-label="Leave the house">← Leave</button>
        <span className="hollow-stat"><b>{floor}</b><span>FLOOR</span></span>
        <span className="hollow-stat"><b>{found}/{s.candles.length}</b><span>CANDLES</span></span>
        <span className="hollow-stat"><b>{score}</b><span>SCORE</span></span>
      </div>

      <div className="hollow-stage" onPointerDown={onDown} onPointerUp={onUp}>
        <canvas ref={canvasRef} className="hollow-canvas" role="img"
          aria-label="A dark house seen by torchlight" />
        {over && (
          <div className="hollow-caught">
            <div className="hollow-eyes" aria-hidden="true"><span /><span /></div>
            <div className="hollow-shout">IT FOUND YOU</div>
          </div>
        )}
      </div>

      <div className="hollow-said" aria-live="polite">
        {whisper || (near <= 1 ? "it is here" : near <= 3 ? "it is very close" : " ")}
      </div>

      <div className="hollow-pad">
        <button onClick={() => step(W)} aria-label="West">◀</button>
        <span>
          <button onClick={() => step(N)} aria-label="North">▲</button>
          <button onClick={() => step(S)} aria-label="South">▼</button>
        </span>
        <button onClick={() => step(E)} aria-label="East">▶</button>
      </div>

      <div className="hollow-help">
        {exitOpen(s)
          ? "the door is open. get out."
          : `find ${s.candles.length - found} more candle${s.candles.length - found === 1 ? "" : "s"}.`}
        {caught > 0 && <span className="hollow-caught-n"> · caught {caught}×</span>}
        {escapes > 0 && <span className="hollow-caught-n"> · escaped {escapes}×</span>}
      </div>
    </div>
  );
}
