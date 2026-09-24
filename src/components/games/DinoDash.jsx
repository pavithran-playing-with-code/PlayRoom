// src/components/games/DinoDash.jsx
// Dino Dash: a runner in the spirit of Chrome's offline dinosaur game, drawn in
// PlayRoom's style. Jump the cacti, duck the birds. A crash doesn't end your
// match: you're knocked back to starting speed and lose a few points, then run
// on until the clock stops. Every room runs the same course.
//
// Rules live in dinoSim.js. This file draws them on a canvas and wires up input.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import {
  VIEW_W, DINO_X, CRASH_COST, UNITS_PER_METRE,
  makeCourse, newRunner, jump, releaseJump, setDuck, step,
} from "./dinoSim";

const INK = "#2E2140";
const GROUND_PAD = 34;               // world units of ground under the running line

// ── drawing helpers ──────────────────────────────────────────────────────────
const mod = (a, m) => ((a % m) + m) % m;

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

function paint(ctx, fill) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function pill(ctx, text, cx, cy, fill) {
  ctx.font = "600 17px Fredoka, Nunito, sans-serif";
  const w = ctx.measureText(text).width + 28;
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  rrect(ctx, cx - w / 2, cy - 17, w, 34, 17);
  paint(ctx, fill);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 1);
}

function drawDino(ctx, x, footY, { duck, dazed, legs }) {
  const body = "#8FDB5C", belly = "#E1F7C4";
  ctx.save();
  ctx.translate(x, footY);
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  const lift = legs ? [0, 4] : [4, 0];

  if (duck) {
    ctx.beginPath(); ctx.moveTo(8, -16); ctx.lineTo(-10, -22); ctx.quadraticCurveTo(-4, -10, 10, -8); ctx.closePath(); paint(ctx, body);
    rrect(ctx, 16, -9, 7, 9 - lift[0], 3); paint(ctx, body);
    rrect(ctx, 32, -9, 7, 9 - lift[1], 3); paint(ctx, body);
    ellipse(ctx, 27, -14, 24, 12); paint(ctx, body);
    ellipse(ctx, 29, -10, 12, 5); ctx.fillStyle = belly; ctx.fill();
    rrect(ctx, 40, -28, 24, 18, 7); paint(ctx, body);
    drawEye(ctx, 56, -21, dazed);
    ctx.beginPath(); ctx.moveTo(55, -14); ctx.lineTo(62, -14); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(10, -30); ctx.lineTo(-9, -38); ctx.quadraticCurveTo(-3, -22, 12, -16); ctx.closePath(); paint(ctx, body);
    // little spikes down the back, drawn first so the body covers their bases
    for (const [sx, sy] of [[18, -38], [10, -34], [4, -27]]) {
      ctx.beginPath(); ctx.moveTo(sx + 4, sy + 5); ctx.lineTo(sx - 5, sy - 6); ctx.lineTo(sx - 5, sy + 7); ctx.closePath(); paint(ctx, "#5DBB5A");
    }
    rrect(ctx, 12, -13, 8, 13 - lift[0], 3); paint(ctx, body);
    rrect(ctx, 25, -13, 8, 13 - lift[1], 3); paint(ctx, body);
    ellipse(ctx, 22, -26, 17, 15); paint(ctx, body);
    ellipse(ctx, 25, -21, 9, 8); ctx.fillStyle = belly; ctx.fill();
    rrect(ctx, 34, -27, 8, 5, 2.5); paint(ctx, body);
    rrect(ctx, 24, -51, 25, 21, 8); paint(ctx, body);
    drawEye(ctx, 40, -43, dazed);
    ctx.beginPath(); ctx.moveTo(39, -36); ctx.lineTo(47, -36); ctx.stroke();
  }
  ctx.restore();
}

function drawEye(ctx, x, y, dazed) {
  if (dazed) {
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
    ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4);
    ctx.stroke();
    return;
  }
  ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); paint(ctx, "#FFFFFF");
  ctx.beginPath(); ctx.arc(x + 1.2, y, 2.2, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
}

function drawCactus(ctx, x, gy, o, faded) {
  ctx.save();
  ctx.globalAlpha = faded ? 0.35 : 1;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  for (let j = 0; j < o.n; j++) {
    const tx = x + j * (o.tw + 6);
    const armY = gy - o.h * (j % 2 ? 0.5 : 0.62);
    const left = j % 2 === 0;
    const ax = left ? tx - 8 : tx + o.tw - 2;
    rrect(ctx, ax, armY - 12, 10, 16, 5); paint(ctx, "#5DBB5A");
    rrect(ctx, tx, gy - o.h, o.tw, o.h + 2, o.tw / 2); paint(ctx, "#5DBB5A");
    ctx.fillStyle = "rgba(46,33,64,.45)";
    for (let k = 0; k < 3; k++) ctx.fillRect(tx + o.tw / 2 - 1, gy - o.h + 9 + k * 10, 2, 4);
  }
  ctx.restore();
}

function drawBird(ctx, x, top, flap, faded) {
  ctx.save();
  ctx.globalAlpha = faded ? 0.35 : 1;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.translate(x, top);
  ctx.beginPath(); ctx.moveTo(34, 12); ctx.lineTo(46, 6); ctx.lineTo(44, 18); ctx.closePath(); paint(ctx, "#FF6B6B");
  ellipse(ctx, 24, 14, 15, 9); paint(ctx, "#FF6B6B");
  ctx.beginPath(); ctx.arc(9, 11, 8, 0, Math.PI * 2); paint(ctx, "#FF6B6B");
  ctx.beginPath(); ctx.moveTo(2, 9); ctx.lineTo(-8, 13); ctx.lineTo(2, 16); ctx.closePath(); paint(ctx, "#FFC53D");
  ctx.beginPath(); ctx.arc(8, 9, 2.4, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  ctx.beginPath();
  if (flap) { ctx.moveTo(18, 10); ctx.lineTo(34, -8); ctx.lineTo(31, 12); }
  else { ctx.moveTo(18, 16); ctx.lineTo(34, 32); ctx.lineTo(31, 14); }
  ctx.closePath(); paint(ctx, "#FF9A9A");
  ctx.restore();
}

function drawCloud(ctx, x, y) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  const blobs = [[0, 0, 13], [15, -7, 16], [31, 0, 12]];
  for (const [bx, by, r] of blobs) { ctx.beginPath(); ctx.arc(x + bx, y + by, r + 3, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill(); }
  for (const [bx, by, r] of blobs) { ctx.beginPath(); ctx.arc(x + bx, y + by, r, 0, Math.PI * 2); ctx.fillStyle = "#FFFFFF"; ctx.fill(); }
}

function draw(ctx, s, course, view, now) {
  const { WH, k } = view;
  const gy = WH - GROUND_PAD;
  ctx.setTransform(k, 0, 0, k, 0, 0);

  // sky, sun, clouds, far hills (slower = further away)
  ctx.fillStyle = "#FFF6E6";
  ctx.fillRect(0, 0, VIEW_W, WH);
  ctx.beginPath(); ctx.arc(VIEW_W - 64, 46, 22, 0, Math.PI * 2);
  ctx.lineWidth = 3; ctx.strokeStyle = INK; paint(ctx, "#FFC53D");
  for (let i = 0; i < 4; i++) drawCloud(ctx, mod(i * 190 + 40 - s.x * 0.15, VIEW_W + 160) - 80, 44 + ((i * 37) % Math.max(20, gy - 120)));
  ctx.fillStyle = "#FFE3B8";
  ctx.beginPath(); ctx.moveTo(0, gy);
  for (let x = 0; x <= VIEW_W; x += 8) ctx.lineTo(x, gy - 22 - 16 * Math.sin((x + s.x * 0.4) / 55) - 8 * Math.sin((x + s.x * 0.4) / 23));
  ctx.lineTo(VIEW_W, gy); ctx.closePath(); ctx.fill();

  // ground
  ctx.fillStyle = "#FFEAC9";
  ctx.fillRect(0, gy, VIEW_W, WH - gy);
  ctx.fillStyle = "rgba(46,33,64,.3)";
  for (let i = 0; i < 16; i++) ctx.fillRect(mod(i * 97 - s.x, VIEW_W + 40) - 20, gy + 7 + ((i * 13) % 20), 6 + (i % 3) * 4, 3);
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(VIEW_W, gy);
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();

  const shake = s.stun > 0.75 ? Math.sin(now / 18) * 3 : 0;
  ctx.save();
  ctx.translate(shake, 0);
  const flap = Math.floor(now / 160) % 2 === 0;
  for (let i = s.first; i < course.list.length; i++) {
    const o = course.list[i];
    const x = DINO_X + (o.x - s.x);
    if (x > VIEW_W + 10) break;
    if (x + o.w < -20) continue;
    if (o.kind === "cactus") drawCactus(ctx, x, gy, o, s.hit.has(i));
    else drawBird(ctx, x, gy - o.lift - o.h, flap, s.hit.has(i));
  }
  const running = s.started && s.stun <= 0 && s.y <= 0;
  drawDino(ctx, DINO_X, gy - s.y, {
    duck: s.duck && s.y <= 0,
    dazed: s.stun > 0,
    legs: running ? Math.floor(s.x / 38) % 2 === 0 : false,
  });
  ctx.restore();

  // what's going on
  ctx.font = "600 15px Fredoka, Nunito, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = INK;
  ctx.fillText(`🏃 ${Math.floor(s.run / UNITS_PER_METRE)} m`, 12, 12);
  if (!s.started) pill(ctx, "Tap or press Space to jump!", VIEW_W / 2, Math.min(gy - 90, WH / 2), "#FFC53D");
  else if (s.stun > 0) pill(ctx, `Oops! −${CRASH_COST}`, DINO_X + 60, gy - 96, "#FF8A8A");
}

// The canvas, sized to the board area. Every player's view is VIEW_W units
// wide; a taller screen just shows more sky.
function Stage({ w, h, canvasRef, view, onDown, onUp }) {
  const WH = Math.round(Math.min(340, Math.max(190, (VIEW_W * h) / Math.max(1, w))));
  let cssW = w;
  let cssH = (w * WH) / VIEW_W;
  if (cssH > h) { cssH = h; cssW = (h * VIEW_W) / WH; }
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  const pw = Math.max(1, Math.round(cssW * dpr));
  const ph = Math.max(1, Math.round(cssH * dpr));

  useLayoutEffect(() => { view.current = { WH, k: pw / VIEW_W }; }, [view, WH, pw]);

  return (
    <div className="dino-pad" style={{ width: w, height: h }}
      onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} width={pw} height={ph} className="dino-canvas"
        style={{ width: cssW, height: cssH }} aria-label="Dino Dash: tap to jump" role="img" />
    </div>
  );
}

export default function DinoDash(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;

  const course = useMemo(() => makeCourse(seed), [seed]);
  const sim = useRef(null);
  if (sim.current === null) sim.current = newRunner();
  const canvasRef = useRef(null);
  const view = useRef({ WH: 260, k: 1 });
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);

  const [crashes, setCrashes] = useState(0);
  const [best, setBest] = useState(0);

  const canPlay = () => !overRef.current && !isSpectator;
  const press = useCallback(() => { if (canPlay()) jump(sim.current); }, [isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps
  const release = useCallback(() => releaseJump(sim.current), []);
  const duck = useCallback((on) => { if (canPlay() || !on) setDuck(sim.current, on); }, [isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Space / ↑ / W jump (hold for higher), ↓ / S duck.
  useEffect(() => {
    if (isSpectator) return undefined;
    const JUMP = [" ", "Spacebar", "ArrowUp", "w", "W"];
    const DUCK = ["ArrowDown", "s", "S"];
    const down = (e) => {
      if (JUMP.includes(e.key)) { e.preventDefault(); if (!e.repeat) press(); }
      else if (DUCK.includes(e.key)) { e.preventDefault(); duck(true); }
    };
    const up = (e) => {
      if (JUMP.includes(e.key)) release();
      else if (DUCK.includes(e.key)) duck(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [isSpectator, press, release, duck]);

  // The game loop. Runs outside React; the score is handed to the engine ten
  // times a second rather than every frame.
  useEffect(() => {
    if (isSpectator) return undefined;
    let raf;
    let last = performance.now();
    let lastPush = 0;
    let pushed = 0;
    const autoStart = setTimeout(() => { sim.current.started = true; }, 3000);
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));   // a hidden tab mustn't teleport the dino
      last = now;
      const s = sim.current;
      if (!overRef.current && step(s, course, dt) === "crash") {
        setCrashes(s.crashes);
        setBest(s.best);
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
    return () => { cancelAnimationFrame(raf); clearTimeout(autoStart); };
  }, [isSpectator, course, addScore]);

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const bestRun = Math.max(best, sim.current.run);
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Best run", value: `${Math.floor(best / UNITS_PER_METRE)}m` },
        { label: "Crashes", value: crashes },
      ];

  // Hold-to-duck and jump buttons, mainly for phones (keys work too).
  const hold = (on) => (e) => { e.preventDefault(); duck(on); };
  const controls = !isSpectator ? (
    <>
      <button className="press p-white dino-btn" onPointerDown={hold(true)} onPointerUp={hold(false)}
        onPointerLeave={hold(false)} onPointerCancel={hold(false)} onContextMenu={(e) => e.preventDefault()}>
        ⬇ Duck <span className="dino-key">↓</span>
      </button>
      <button className="press p-sun dino-btn" onPointerDown={(e) => { e.preventDefault(); press(); }}
        onPointerUp={release} onPointerLeave={release} onPointerCancel={release} onContextMenu={(e) => e.preventDefault()}>
        ⬆ Jump <span className="dino-key">Space</span>
      </button>
    </>
  ) : null;

  return (
    <>
      <GameFrame
        gameName="Dino Dash" badge="🦖 DINO DASH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        onQuit={eng.endMatch}
        controls={controls}
      >
        {({ w, h }) => (isSpectator ? (
          <div className="muted">
            👀 Watching {spectatorWatching?.username} — {Number(specScore).toLocaleString()} pts
          </div>
        ) : (
          <Stage w={w} h={h} canvasRef={canvasRef} view={view}
            onDown={(e) => { if (e.pointerType !== "mouse" || e.button === 0) press(); }}
            onUp={release} />
        ))}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`Best run: ${Math.floor(bestRun / UNITS_PER_METRE)} m · Crashes: ${crashes}`} />
      )}
    </>
  );
}
