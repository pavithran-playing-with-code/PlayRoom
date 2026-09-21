// src/components/games/FlappyDash.jsx
// Tap to flap. Gravity does the rest. Squeeze through the gaps between pipes;
// each one you clear is 10 points. A crash costs 10 and dazes the bird for a
// moment, then you carry on — the room's clock decides when the match ends,
// not your last mistake. Everyone in a room flies the same pipes.
//
// The rules live in flappySim.js. This file draws the bird and takes the taps.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import {
  VIEW_W, VIEW_H, GROUND, BIRD_X, GAP, PIPE_W, CRASH_COST,
  makeCourse, newBird, flap, step,
} from "./flappySim";

const INK = "#2E2140";
const BODY = "#FFD23F";        // warm yellow, so the bird pops off the blue sky
const BODY_LIGHT = "#FFF3C4";  // belly
const WING = "#F2A227";        // wing sits a shade deeper than the body
const WING_LIGHT = "#FFE79A";
const BEAK = "#FF8A3D";        // orange, or a yellow beak would vanish into the face
const BEAK_DARK = "#E2662A";
const CHEEK = "#FF8FC7";
const PIPE = "#5DBB5A";
const PIPE_DARK = "#3E9E4F";

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
const paint = (ctx, fill) => { ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); };

// A round little yellow bird, drawn the way the app's other critters are:
// big eye, thick ink outline, simple shapes. Two passes — every shape in ink
// first (fat stroke plus fill, so they merge into one silhouette), then in
// colour on top — so the bird has one clean outline instead of one per part.
function drawBird(ctx, x, y, tilt, wing, dazed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // two little feathers sticking up off the head
  const tuft = () => {
    ctx.beginPath();
    ctx.moveTo(-1, -10); ctx.quadraticCurveTo(-5, -20, 3, -17);
    ctx.quadraticCurveTo(2, -22, 9, -16);
    ctx.quadraticCurveTo(6, -10, 0, -9);
    ctx.closePath();
  };
  const tailFeathers = () => {
    ctx.beginPath();
    ctx.moveTo(-10, -7);
    ctx.quadraticCurveTo(-22, -10, -27, -3);
    ctx.quadraticCurveTo(-21, 0, -25, 7);
    ctx.quadraticCurveTo(-17, 9, -9, 6);
    ctx.closePath();
  };
  const body = () => { ctx.beginPath(); ctx.ellipse(0, 0, 16.5, 14.5, 0, 0, Math.PI * 2); };
  const beak = () => {
    ctx.beginPath();
    ctx.moveTo(13, -5); ctx.lineTo(30, 0.5); ctx.lineTo(13, 6); ctx.closePath();
  };

  const parts = [[tailFeathers, WING], [tuft, WING], [body, BODY], [beak, BEAK]];
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  for (const [path] of parts) { path(); ctx.fill(); ctx.stroke(); }
  for (const [path, color] of parts) { path(); ctx.fillStyle = color; ctx.fill(); }

  // belly, the lower half of the beak, and a blush
  ctx.beginPath(); ctx.ellipse(3, 6, 11, 7.5, 0, 0, Math.PI * 2); ctx.fillStyle = BODY_LIGHT; ctx.fill();
  ctx.beginPath(); ctx.moveTo(13, 2); ctx.lineTo(27, 1); ctx.lineTo(13, 6); ctx.closePath();
  ctx.fillStyle = BEAK_DARK; ctx.fill();
  ctx.beginPath(); ctx.ellipse(3, 2, 4, 2.8, 0, 0, Math.PI * 2); ctx.fillStyle = CHEEK; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;

  // wing: a small feather that beats when you flap
  ctx.save();
  ctx.translate(-5, 1);
  ctx.rotate(wing);
  const feather = () => {
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.quadraticCurveTo(4, -6, 10, 2);
    ctx.quadraticCurveTo(2, 10, -7, 6);
    ctx.closePath();
  };
  ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 3.2;
  feather(); ctx.fill(); ctx.stroke();
  feather(); ctx.fillStyle = WING; ctx.fill();
  ctx.strokeStyle = WING_LIGHT; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(3, 0, 6, 3); ctx.stroke();
  ctx.restore();

  // the eye goes on last: big, forward, and the easiest thing to read
  const ex = 8.5, ey = -5;
  if (dazed) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ex - 4.5, ey - 4.5); ctx.lineTo(ex + 4.5, ey + 4.5);
    ctx.moveTo(ex + 4.5, ey - 4.5); ctx.lineTo(ex - 4.5, ey + 4.5);
    ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(ex, ey, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF"; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.beginPath(); ctx.arc(ex + 1.8, ey + 0.4, 3.2, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 0.5, ey - 1.6, 1.4, 0, Math.PI * 2); ctx.fillStyle = "#FFFFFF"; ctx.fill();
  }
  ctx.restore();
}

function drawPipe(ctx, left, gapY) {
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  const topH = gapY - GAP / 2;
  const botY = gapY + GAP / 2;
  const lip = 16;
  // shafts
  rrect(ctx, left, -20, PIPE_W, topH + 20 - lip, 6); paint(ctx, PIPE);
  rrect(ctx, left, botY + lip, PIPE_W, VIEW_H - botY - lip, 6); paint(ctx, PIPE);
  // lips
  rrect(ctx, left - 5, topH - lip, PIPE_W + 10, lip, 6); paint(ctx, PIPE_DARK);
  rrect(ctx, left - 5, botY, PIPE_W + 10, lip, 6); paint(ctx, PIPE_DARK);
}

function draw(ctx, s, course, k, now) {
  ctx.setTransform(k, 0, 0, k, 0, 0);
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, "#8FD3FF");
  sky.addColorStop(1, "#DDF3FF");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // clouds drifting by
  ctx.fillStyle = "#FFFFFF";
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 140 - s.x * 0.25) % (VIEW_W + 160) + VIEW_W + 160) % (VIEW_W + 160) - 80;
    const cy = 46 + ((i * 53) % 130);
    for (const [dx, dy, r] of [[0, 0, 15], [16, -7, 18], [33, 0, 14]]) {
      ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  // pipes
  for (let i = s.first; i < course.list.length; i++) {
    const p = course.list[i];
    const left = p.x - s.x;
    if (left > VIEW_W) break;
    if (!p.gone) drawPipe(ctx, left, p.gapY);
  }
  // ground
  const gy = VIEW_H - GROUND;
  ctx.fillStyle = "#F4D58D";
  ctx.fillRect(0, gy, VIEW_W, GROUND);
  ctx.fillStyle = "#E4BE6E";
  for (let i = 0; i < 12; i++) {
    const gx = ((i * 46 - s.x) % (VIEW_W + 46) + VIEW_W + 46) % (VIEW_W + 46) - 23;
    ctx.fillRect(gx, gy + 12, 22, 6);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(VIEW_W, gy); ctx.stroke();

  // the bird: nose up while rising, nose down while falling
  const tilt = Math.max(-0.45, Math.min(0.9, s.vy / 620));
  const since = now - s.flapAt;
  const wing = since < 180 ? -1.1 * (1 - since / 180) : 0;
  drawBird(ctx, BIRD_X, s.y, s.started ? tilt : 0, wing, s.stun > 0);

  if (!s.started || s.stun > 0) {
    const text = s.started ? `Ouch! ${CRASH_COST}` : "Tap or press Space to flap!";
    ctx.font = "600 17px Fredoka, Nunito, sans-serif";
    const w = ctx.measureText(text).width + 28;
    ctx.lineWidth = 3;
    rrect(ctx, VIEW_W / 2 - w / 2, 78, w, 34, 17);
    paint(ctx, s.started ? "#FF8A8A" : "#FFC53D");
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, VIEW_W / 2, 96);
  }
}

function Stage({ w, h, canvasRef, view, onDown }) {
  let cssW = Math.min(w, (h * VIEW_W) / VIEW_H);
  let cssH = (cssW * VIEW_H) / VIEW_W;
  if (cssH > h) { cssH = h; cssW = (h * VIEW_W) / VIEW_H; }
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  const pw = Math.max(1, Math.round(cssW * dpr));
  const ph = Math.max(1, Math.round(cssH * dpr));
  useEffect(() => { view.current = pw / VIEW_W; }, [view, pw]);
  return (
    <div className="fl-pad" style={{ width: w, height: h }} onPointerDown={onDown}
      onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} width={pw} height={ph} className="fl-canvas"
        style={{ width: cssW, height: cssH }} role="img" aria-label="Flappy Dash: tap to flap" />
    </div>
  );
}

export default function FlappyDash(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;

  const course = useMemo(() => makeCourse(seed), [seed]);
  const sim = useRef(null);
  if (sim.current === null) sim.current = newBird();
  const canvasRef = useRef(null);
  const view = useRef(1);
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);

  const [pipes, setPipes] = useState(0);
  const [best, setBest] = useState(0);

  const tap = () => { if (!overRef.current && !isSpectator) flap(sim.current, performance.now()); };

  useEffect(() => {
    if (isSpectator) return undefined;
    const onKey = (e) => {
      if ([" ", "Spacebar", "ArrowUp", "w", "W"].includes(e.key)) { e.preventDefault(); if (!e.repeat) tap(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // rebinds each render so the handler always sees the current state

  useEffect(() => {
    if (isSpectator) return undefined;
    let raf;
    let last = performance.now();
    let lastPush = 0;
    let pushed = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));   // a hidden tab mustn't teleport the bird
      last = now;
      const s = sim.current;
      if (!overRef.current) {
        const before = s.pipes;
        step(s, course, dt);
        if (s.pipes !== before) setPipes(s.pipes);
        if (s.best !== best) setBest(s.best);
      }
      if (now - lastPush > 100) {
        lastPush = now;
        const target = Math.floor(s.points);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
      }
      const c = canvasRef.current;
      if (c) draw(c.getContext("2d"), s, course, view.current, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, course, addScore, best]);

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Pipes", value: pipes },
        { label: "Best run", value: Math.max(best, sim.current.run) },
      ];

  return (
    <>
      <GameFrame
        gameName="Flappy Dash" badge="🐤 FLAPPY DASH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        onQuit={eng.endMatch}
        controls={!isSpectator ? (
          <button className="press p-sun fl-btn" onPointerDown={(e) => { e.preventDefault(); tap(); }}
            onContextMenu={(e) => e.preventDefault()}>
            🐤 Flap <span className="dino-key">Space</span>
          </button>
        ) : null}
      >
        {({ w, h }) => (isSpectator ? (
          <div className="muted">
            👀 Watching {spectatorWatching?.username} — {Number(specScore).toLocaleString()} pts
          </div>
        ) : (
          <Stage w={w} h={h} canvasRef={canvasRef} view={view} onDown={tap} />
        ))}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`Pipes cleared: ${pipes} · Best run: ${Math.max(best, sim.current.run)}`} />
      )}
    </>
  );
}
