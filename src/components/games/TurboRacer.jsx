// src/components/games/TurboRacer.jsx
// Three lanes, traffic coming at you, coins worth swerving for, and a road
// that speeds up as you go. Swipe left or right on the road, tap a side of
// it, press an arrow key, or use the two buttons — they all change lane.
//
// Crashing doesn't end the match; the room's clock does. A crash costs a few
// points and puts you on a fresh road — everything you scored before it stays
// on the board. Your score never goes back to zero.
//
// The rules live in racerSim.js. This file draws the road and takes the input.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import {
  VIEW_W, VIEW_H, ROAD_X, ROAD_W, LANE_W, CAR_W, CAR_H, CAR_Y, LANES,
  newRace, steer, step, totalScore, laneCentre,
} from "./racerSim";

const INK = "#2E2140";
const ROAD = "#3A3550";
const VERGE = "#6FBF73";
const CRASH_COST = 15;             // a crash costs this; what you earned is kept
const SWIPE_PX = 26;               // a finger this far sideways is a swipe
const RESTART_MS = 900;

function rrect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// A little car: body, roof, lights. Ink outline like everything else here.
function drawCar(ctx, x, y, w, h, colour, tilt = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  rrect(ctx, -w / 2, -h / 2, w, h, 9);
  ctx.fillStyle = colour; ctx.fill(); ctx.stroke();
  // roof
  rrect(ctx, -w / 2 + 5, -h / 2 + 13, w - 10, h * 0.34, 5);
  ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fill();
  // lights
  ctx.fillStyle = "#FFE79A";
  rrect(ctx, -w / 2 + 4, -h / 2 + 2, 7, 5, 2); ctx.fill();
  rrect(ctx, w / 2 - 11, -h / 2 + 2, 7, 5, 2); ctx.fill();
  ctx.restore();
}

function draw(ctx, s, k, particles, shake) {
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  // verge and road
  ctx.fillStyle = VERGE;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = ROAD;
  ctx.fillRect(ROAD_X, 0, ROAD_W, VIEW_H);

  // dashes, scrolling with the road so it reads as movement
  ctx.strokeStyle = "rgba(255,255,255,.75)";
  ctx.lineWidth = 4;
  ctx.setLineDash([22, 22]);
  ctx.lineDashOffset = -(s.distance % 44);
  for (let i = 1; i < LANES; i++) {
    const x = ROAD_X + LANE_W * i;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, VIEW_H); ctx.stroke();
  }
  ctx.setLineDash([]);

  // traffic and coins
  for (const t of s.things) {
    const x = laneCentre(t.lane);
    if (t.kind === "coin") {
      ctx.save();
      ctx.translate(x, t.y);
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fillStyle = "#FFC53D"; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(46,33,64,.45)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    } else {
      drawCar(ctx, x, t.y, CAR_W, CAR_H, t.colour);
    }
  }

  // exhaust, then the player on top
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.colour;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (!s.crashed) drawCar(ctx, s.x, CAR_Y, CAR_W, CAR_H, "#FFC53D", s.tilt);
  ctx.restore();
}

function Stage({ w, h, canvasRef, view, onDown, onMove, onUp }) {
  let cssW = Math.min(w, (h * VIEW_W) / VIEW_H);
  let cssH = (cssW * VIEW_H) / VIEW_W;
  if (cssH > h) { cssH = h; cssW = (h * VIEW_W) / VIEW_H; }
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  const pw = Math.max(1, Math.round(cssW * dpr));
  const ph = Math.max(1, Math.round(cssH * dpr));
  useEffect(() => { view.current = pw / VIEW_W; }, [view, pw]);
  return (
    <div className="tr-pad" style={{ width: w, height: h }} onPointerDown={onDown}
      onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} width={pw} height={ph} className="tr-canvas"
        style={{ width: cssW, height: cssH }} role="img" aria-label="Turbo Racer: swerve between lanes" />
    </div>
  );
}

export default function TurboRacer(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;

  const runRef = useRef(0);
  const sim = useRef(null);
  if (sim.current === null) sim.current = newRace(seed);
  const canvasRef = useRef(null);
  const view = useRef(1);
  const bits = useRef([]);          // particles
  // Distance is counted across the whole match. A crash starts a new road,
  // and a number that jumped back to zero would read as losing progress.
  const distBase = useRef(0);
  // Every completed run's score, kept aside. The live total is this plus
  // whatever the current road is worth, so starting a new road can never take
  // points off the board — which is exactly what it used to do.
  const banked = useRef(0);
  const shake = useRef(0);
  const flash = useRef(0);
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);

  const [dist, setDist] = useState(0);
  const [crashes, setCrashes] = useState(0);
  const [msg, setMsg] = useState(null);
  const timers = useRef([]);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const puff = (x, y, n, colours, spread = 1.6, life = 26) => {
    for (let i = 0; i < n; i++) {
      bits.current.push({
        x, y,
        vx: (Math.random() - 0.5) * spread * 2,
        vy: (Math.random() - 0.5) * spread * 2 + 1,
        r: 2 + Math.random() * 3,
        life, max: life,
        colour: colours[Math.floor(Math.random() * colours.length)],
      });
    }
  };

  const move = (dir) => { if (!overRef.current && !isSpectator) steer(sim.current, dir); };

  useEffect(() => {
    if (isSpectator) return undefined;
    const onKey = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); move(-1); }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); move(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Swipe left or right to change lane — a lane a swipe, steered the moment
  // the finger has gone far enough, so a long swipe crosses two. A tap with
  // no swipe steers toward the side of the road you tapped.
  const touch = useRef(null);
  const onDown = (e) => {
    if (overRef.current || isSpectator) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, swiped: false };
  };
  const onMove = (e) => {
    const t = touch.current;
    if (!t || e.pointerId !== t.id) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    move(dx < 0 ? -1 : 1);
    t.swiped = true;
    t.x = e.clientX; t.y = e.clientY;                  // a longer swipe: another lane
  };
  const onUp = (e) => {
    const t = touch.current;
    if (!t || e.pointerId !== t.id) return;
    touch.current = null;
    if (t.swiped || e.type === "pointercancel" || overRef.current || isSpectator) return;
    const box = e.currentTarget.getBoundingClientRect();
    move(e.clientX - box.left < box.width / 2 ? -1 : 1);
  };

  useEffect(() => {
    if (isSpectator) return undefined;
    let raf;
    let last = performance.now();
    let pushed = 0;
    const frame = (now) => {
      const dt = Math.min(3, Math.max(0, (now - last) / (1000 / 60)));
      last = now;
      const s = sim.current;

      if (!overRef.current && !s.crashed) {
        const out = step(s, dt);
        if (out.coins) {
          puff(s.x, CAR_Y, 12, ["#FFC53D", "#FFE79A", "#FFFFFF"], 2.2, 22);
          setMsg({ text: `+25 coin!`, type: "success" });
          timers.current.push(setTimeout(() => setMsg(null), 700));
        }
        if (out.crashed) {
          puff(s.x, CAR_Y, 44, ["#FF6B6B", "#FF8A3D", "#FFFFFF"], 5, 40);
          shake.current = 16;
          flash.current = 1;
          setCrashes((c) => c + 1);
          distBase.current += Math.floor(s.distance / 8);
          setMsg({ text: "Crash!", type: "error" });
          const run = ++runRef.current;
          timers.current.push(setTimeout(() => {
            if (overRef.current || runRef.current !== run) return;
            // Bank here, not at the moment of the crash: the dead road is still
            // on screen and still being scored until this fires, so banking
            // early counted it twice and then dropped the lot.
            banked.current = Math.max(0, banked.current + totalScore(sim.current) - CRASH_COST);
            sim.current = newRace((Number(seed) || 1) + run * 977);
            setMsg({ text: "New road — go!", type: "info" });
            timers.current.push(setTimeout(() => setMsg(null), 700));
          }, RESTART_MS));
        }
        // exhaust
        if (Math.random() < 0.6) puff(s.x + (Math.random() - 0.5) * 10, CAR_Y + CAR_H / 2, 1,
          ["#FFA36C", "#FFFFFF"], 0.6, 16);
        const target = banked.current + totalScore(s);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
        const travelled = distBase.current + Math.floor(s.distance / 8);
        setDist((d) => (travelled !== d ? travelled : d));
      }

      for (const p of bits.current) { p.x += p.vx; p.y += p.vy; p.life -= 1; }
      bits.current = bits.current.filter((p) => p.life > 0);
      shake.current *= 0.86;
      flash.current *= 0.88;

      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext("2d");
        draw(ctx, sim.current, view.current, bits.current, shake.current);
        if (flash.current > 0.02) {
          ctx.setTransform(view.current, 0, 0, view.current, 0, 0);
          ctx.fillStyle = `rgba(255,80,80,${flash.current * 0.5})`;
          ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, addScore, seed]);

  const oppList = Object.values(eng.opponents);
  const stats = [
    { label: "Score", value: Number(isSpectator ? (spectatorWatching?.score ?? 0) : eng.score).toLocaleString() },
    { label: "Distance", value: `${dist}m` },
    ...(crashes ? [{ label: "Crashes", value: crashes }] : []),
  ];

  const controls = !isSpectator ? (
    <>
      <button className="press p-white tr-btn" onPointerDown={(e) => { e.preventDefault(); move(-1); }}
        aria-label="Move left">⬅️</button>
      <button className="press p-white tr-btn" onPointerDown={(e) => { e.preventDefault(); move(1); }}
        aria-label="Move right">➡️</button>
    </>
  ) : null;

  return (
    <>
      <GameFrame
        gameName="Turbo Racer" badge="🏎️ TURBO RACER"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
        controls={controls}
      >
        {({ w, h }) => {
          if (isSpectator) {
            return (
              <div className="muted">
                👀 Watching {spectatorWatching?.username} — {Number(spectatorWatching?.score ?? 0).toLocaleString()} pts
              </div>
            );
          }
          return <Stage w={w} h={h} canvasRef={canvasRef} view={view} onDown={onDown} onMove={onMove} onUp={onUp} />;
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`Distance: ${dist}m${crashes ? ` · Crashes: ${crashes}` : ""}`} />
      )}
    </>
  );
}
