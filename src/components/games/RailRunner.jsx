// src/components/games/RailRunner.jsx
// Rail Runner: run down three railway lanes, jump the barriers, slide under
// the bars, swerve round the train cars, grab the coins. Swipe left or right
// to change lane, up to jump, down to slide — or the arrow keys, or the
// buttons under the track.
//
// Everyone in a room runs the same course (from the seed) and the room's
// clock decides it; a crash slows you right down but takes nothing away.
// The rules are runnerSim.js; this file draws it, in perspective from just
// behind and above the runner, and reads the thumbs.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { newRun, step, steer, jump, slide, sliding, score, LANE_W, LOW, HIGH, TRAIN } from "./runnerSim.js";

const SWIPE_PX = 26;
const CAM_BACK = 5.2, CAM_H = 3.1;           // metres behind and above the runner
const FAR = 95;                              // how far down the line we draw
const TAU = Math.PI * 2;

// ── drawing ──────────────────────────────────────────────────────────────────
function makeView(W, H, s) {
  const F = Math.min(W * 1.05, H * 0.95), HZ = H * 0.34;
  const camX = s.x * LANE_W * 0.55, camZ = s.z - CAM_BACK;
  const P = (x, y, z) => {
    const dz = Math.max(0.35, z - camZ);
    return [W / 2 + ((x - camX) * F) / dz, HZ + ((CAM_H - y) * F) / dz, dz];
  };
  return { W, H, F, HZ, camX, camZ, P };
}

function poly(ctx, pts, fill) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// A box in the world: x0..x1 across, y0..y1 up, z0..z1 along the track.
function box(ctx, v, x0, x1, y0, y1, z0, z1, front, side, top) {
  const { P, camX } = v;
  const a = P(x0, y0, z0), b = P(x1, y0, z0), c = P(x1, y1, z0), d = P(x0, y1, z0);
  const e = P(x0, y0, z1), f = P(x1, y0, z1), g = P(x1, y1, z1), h = P(x0, y1, z1);
  if (camX < x0) poly(ctx, [a, d, h, e], side);
  if (camX > x1) poly(ctx, [b, c, g, f], side);
  if (CAM_H > y1) poly(ctx, [d, c, g, h], top);
  poly(ctx, [a, b, c, d], front);
  return { a, b, c, d };
}

function drawScene(ctx, s, W, H, t) {
  const v = makeView(W, H, s);
  const { P, HZ } = v;
  // sky and skyline
  const sky = ctx.createLinearGradient(0, 0, 0, HZ);
  sky.addColorStop(0, "#7cc8f2");
  sky.addColorStop(1, "#cdebfa");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HZ + 2);
  ctx.fillStyle = "#a7c7dd";
  for (let i = 0; i < 9; i++) {
    const bw = W / 7, bx = ((i * bw * 1.1 - (s.z * 0.6) % (bw * 1.1)) + W) % (W + bw) - bw;
    const bh = HZ * (0.25 + ((i * 37) % 10) / 30);
    ctx.fillRect(bx, HZ - bh, bw * 0.8, bh);
  }
  // ground: gravel either side, the track bed in the middle
  ctx.fillStyle = "#8fbf6a";
  ctx.fillRect(0, HZ, W, H - HZ);
  const zNear = v.camZ + 0.6, zFar = v.camZ + FAR;
  poly(ctx, [P(-4.2, 0, zNear), P(4.2, 0, zNear), P(4.2, 0, zFar), P(-4.2, 0, zFar)], "#b9a68a");
  // sleepers, far to near
  const first = Math.floor(zNear / 1.6) * 1.6;
  for (let z = first + Math.floor((zFar - first) / 1.6) * 1.6; z >= first; z -= 1.6) {
    for (const lane of [-1, 0, 1]) {
      const cx = lane * LANE_W;
      poly(ctx, [P(cx - 0.9, 0, z), P(cx + 0.9, 0, z), P(cx + 0.9, 0, z + 0.45), P(cx - 0.9, 0, z + 0.45)], "#6b4f36");
    }
  }
  // rails
  ctx.strokeStyle = "#c9ccd6";
  ctx.lineWidth = 2;
  for (const lane of [-1, 0, 1]) for (const off of [-0.55, 0.55]) {
    const a = P(lane * LANE_W + off, 0.05, zNear), b = P(lane * LANE_W + off, 0.05, zFar);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }

  // distance haze on the ground, before anything stands on it
  const haze = ctx.createLinearGradient(0, HZ, 0, HZ + H * 0.12);
  haze.addColorStop(0, "rgba(205,235,250,.8)");
  haze.addColorStop(1, "rgba(205,235,250,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, HZ, W, H * 0.12);

  // everything standing on the track, far to near, with the runner among them
  const things = [];
  for (let k = Math.ceil(zFar / 11); k >= Math.floor(zNear / 11); k--) {
    const z = k * 11, hgt = 4 + ((k * 7919) % 9);
    for (const side of [-1, 1]) things.push({ z, draw: () => {
      const x0 = side * 6.2, x1 = side * 9.5;
      const col = ["#e8a87c", "#d4a5c9", "#9fc6e7", "#f2d07a"][(k + (side > 0 ? 1 : 0)) & 3];
      const fr = box(ctx, v, Math.min(x0, x1), Math.max(x0, x1), 0, hgt, z, z + 8, col, shade(col, 0.82), shade(col, 1.08));
      // windows
      ctx.fillStyle = "rgba(60,70,90,.35)";
      const w = fr.b[0] - fr.a[0], hh = fr.a[1] - fr.d[1];
      for (let r = 0; r < 3; r++) for (let q = 0; q < 2; q++) ctx.fillRect(fr.a[0] + w * (0.15 + q * 0.45), fr.d[1] + hh * (0.15 + r * 0.27), w * 0.3, hh * 0.15);
    } });
  }
  for (const row of s.rows) for (const o of row.items) {
    if (o.z + (o.len || 0) < zNear || o.z > zFar) continue;
    if (o.kind === "coin" && o.got) continue;
    things.push({ z: o.z, draw: () => drawItem(ctx, v, o, t) });
  }
  things.push({ z: s.z, runner: true, draw: () => drawRunner(ctx, v, s, t) });
  things.sort((a, b) => b.z - a.z || (a.runner ? 1 : -1));
  for (const th of things) th.draw();
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function drawItem(ctx, v, o, t) {
  const cx = o.lane * LANE_W;
  if (o.kind === "coin") {
    const [x, y, dz] = v.P(cx, o.y, o.z);
    const r = Math.max(2, (0.32 * v.F) / dz), sq = Math.abs(Math.cos(t * 5 + o.z));
    ctx.fillStyle = "#ffc53d";
    ctx.strokeStyle = "#b8860b";
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(1, r * (0.25 + 0.75 * sq)), r, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (o.kind === LOW) {
    const fr = box(ctx, v, cx - 0.85, cx + 0.85, 0, 0.9, o.z, o.z + 0.4, "#f2f2f2", "#cfcfcf", "#ffffff");
    const w = fr.b[0] - fr.a[0], hh = fr.a[1] - fr.d[1];
    ctx.fillStyle = "#e5484d";                           // red stripes
    for (let k = 0; k < 4; k++) ctx.fillRect(fr.d[0] + w * (0.05 + k * 0.25), fr.d[1] + hh * 0.18, w * 0.12, hh * 0.5);
    return;
  }
  if (o.kind === HIGH) {
    box(ctx, v, cx - 0.95, cx - 0.8, 0, 2.2, o.z, o.z + 0.15, "#555", "#444", "#666");
    box(ctx, v, cx + 0.8, cx + 0.95, 0, 2.2, o.z, o.z + 0.15, "#555", "#444", "#666");
    const fr = box(ctx, v, cx - 0.95, cx + 0.95, 1.35, 1.95, o.z, o.z + 0.3, "#ffc53d", "#d9a12c", "#ffe08a");
    const w = fr.b[0] - fr.a[0];
    ctx.fillStyle = "#2e2140";                           // hazard stripes
    for (let k = 0; k < 6; k++) {
      const x0 = fr.d[0] + w * (k / 6);
      ctx.beginPath();
      ctx.moveTo(x0, fr.a[1]); ctx.lineTo(x0 + w * 0.08, fr.a[1]); ctx.lineTo(x0 + w * 0.16, fr.d[1]); ctx.lineTo(x0 + w * 0.08, fr.d[1]);
      ctx.fill();
    }
    return;
  }
  if (o.kind === TRAIN) {
    const body = ["#4cc9f0", "#ff6b6b", "#9b5de5"][Math.abs(Math.round(o.z)) % 3];
    const fr = box(ctx, v, cx - 1.0, cx + 1.0, 0.15, 2.9, o.z, o.z + o.len, body, shade(body, 0.75), shade(body, 1.1));
    const w = fr.b[0] - fr.a[0], hh = fr.a[1] - fr.d[1];
    ctx.fillStyle = "#1d2b3a";                           // windscreen
    ctx.fillRect(fr.d[0] + w * 0.12, fr.d[1] + hh * 0.12, w * 0.76, hh * 0.32);
    ctx.fillStyle = "#fff3b0";                           // lamps
    for (const fx of [0.18, 0.72]) ctx.fillRect(fr.d[0] + w * fx, fr.d[1] + hh * 0.7, w * 0.1, hh * 0.08);
    ctx.fillStyle = "rgba(0,0,0,.25)";                   // a stripe
    ctx.fillRect(fr.d[0], fr.d[1] + hh * 0.55, w, hh * 0.06);
  }
}

// The runner: cap, hoodie, shorts, legs and arms swinging; crouched low when
// sliding, tucked up in a jump, blinking while briefly untouchable.
function drawRunner(ctx, v, s, t) {
  if (s.safeT > 0 && Math.floor(t * 12) % 2) return;
  const cx = s.x * LANE_W;
  const [x, yFoot, dz] = v.P(cx, s.y, s.z);
  const u = v.F / dz;                                     // pixels per metre here
  const slid = sliding(s), air = s.y > 0.05;
  const run = s.stunT > 0 ? 0 : Math.sin(t * (6 + s.speed * 0.45));
  ctx.save();
  ctx.translate(x, yFoot);
  ctx.lineCap = "round";
  // shadow on the track
  ctx.fillStyle = "rgba(0,0,0,.25)";
  const [, ys] = v.P(cx, 0, s.z);
  ctx.beginPath();
  ctx.ellipse(0, ys - yFoot, u * 0.45, u * 0.12, 0, 0, TAU);
  ctx.fill();
  const H = slid ? u * 0.85 : u * 1.7;
  const lean = slid ? 0.9 : 0;
  ctx.rotate(-lean * 0.9);
  // legs
  ctx.strokeStyle = "#2e2140";
  ctx.lineWidth = u * 0.16;
  const hip = -H * 0.45;
  const legA = air ? 0.6 : run * 0.6, legB = air ? -0.2 : -run * 0.6;
  for (const a of [legA, legB]) {
    ctx.beginPath();
    ctx.moveTo(0, hip);
    ctx.lineTo(Math.sin(a) * H * 0.25, hip + Math.cos(a) * H * 0.25);
    ctx.lineTo(Math.sin(a) * H * 0.25 - (air ? H * 0.1 : 0), hip + H * 0.45);
    ctx.stroke();
  }
  // shorts and hoodie
  ctx.fillStyle = "#3a3f8f";
  ctx.fillRect(-u * 0.2, hip - u * 0.05, u * 0.4, u * 0.2);
  ctx.fillStyle = "#ff6b6b";
  ctx.beginPath();
  ctx.moveTo(-u * 0.24, hip);
  ctx.lineTo(u * 0.24, hip);
  ctx.lineTo(u * 0.22, -H * 0.82);
  ctx.lineTo(-u * 0.22, -H * 0.82);
  ctx.closePath();
  ctx.fill();
  // arms
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = u * 0.12;
  for (const a of [run * 0.8, -run * 0.8]) {
    ctx.beginPath();
    ctx.moveTo(0, -H * 0.78);
    ctx.lineTo(Math.sin(a) * H * 0.22, -H * 0.78 + H * 0.3);
    ctx.stroke();
  }
  // head and cap
  ctx.fillStyle = "#f2c49b";
  ctx.beginPath();
  ctx.arc(0, -H * 0.93, u * 0.17, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffc53d";
  ctx.beginPath();
  ctx.arc(0, -H * 0.97, u * 0.18, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-u * 0.05, -H * 0.97, u * 0.3, u * 0.05);
  ctx.restore();
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function RailRunner(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;
  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;
  const sim = useRef(null);
  if (sim.current === null) sim.current = newRun(seed);
  const canvasRef = useRef(null);
  const size = useRef({ w: 300, h: 400 });
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);
  const [hud, setHud] = useState({ dist: 0, coins: 0, crashes: 0 });
  const [msg, setMsg] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type) => {
    setMsg({ text, type });
    timers.current.push(setTimeout(() => setMsg(null), 700));
  };

  const act = (what) => {
    if (overRef.current || isSpectator) return;
    const s = sim.current;
    if (what === "left") steer(s, -1);
    else if (what === "right") steer(s, 1);
    else if (what === "up") jump(s);
    else if (what === "down") slide(s);
  };

  useEffect(() => {
    if (isSpectator) return undefined;
    const onKey = (e) => {
      const k = e.key;
      const what = k === "ArrowLeft" || k === "a" ? "left" : k === "ArrowRight" || k === "d" ? "right"
        : k === "ArrowUp" || k === "w" || k === " " ? "up" : k === "ArrowDown" || k === "s" ? "down" : null;
      if (what) { e.preventDefault(); act(what); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // a swipe: one move, the moment the finger has gone far enough
  const touch = useRef(null);
  const onDown = (e) => {
    if (overRef.current || isSpectator) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, used: false };
  };
  const onMove = (e) => {
    const t = touch.current;
    if (!t || t.used || e.pointerId !== t.id) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    t.used = true;
    act(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down");
  };
  const onUp = (e) => { if (touch.current && e.pointerId === touch.current.id) touch.current = null; };

  useEffect(() => {
    if (isSpectator) return undefined;
    let raf, last = performance.now(), pushed = 0, lastHud = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = sim.current;
      if (!overRef.current) {
        const out = step(s, dt);
        if (out.crashed) flash("Ouch! Keep running!", "error");
        else if (out.coins) flash(`+${out.coins * 10} coin${out.coins > 1 ? "s" : ""}`, "success");
        const target = score(s);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
        if (now - lastHud > 150) { lastHud = now; setHud({ dist: Math.floor(s.z), coins: s.coins, crashes: s.crashes }); }
      }
      const c = canvasRef.current;
      if (c) {
        const { w, h } = size.current, dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const ctx = c.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScene(ctx, s, w, h, now / 1000);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, addScore]);

  const stats = [
    { label: "Score", value: Number(isSpectator ? (spectatorWatching?.score ?? 0) : eng.score).toLocaleString() },
    { label: "Distance", value: `${hud.dist}m` },
    { label: "Coins", value: hud.coins },
  ];
  const btn = (what, label, aria) => (
    <button className="press p-white rr-btn" onPointerDown={(e) => { e.preventDefault(); act(what); }} aria-label={aria}>{label}</button>
  );
  const controls = !isSpectator ? (
    <>{btn("left", "◀", "Left")}{btn("up", "▲", "Jump")}{btn("down", "▼", "Slide")}{btn("right", "▶", "Right")}</>
  ) : null;

  return (
    <>
      <GameFrame
        gameName="Rail Runner" badge="🏃 RAIL RUNNER"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={Object.values(eng.opponents)}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
        controls={controls}
      >
        {({ w, h }) => {
          if (isSpectator) {
            return <div className="muted">👀 Watching {spectatorWatching?.username} — {Number(spectatorWatching?.score ?? 0).toLocaleString()} pts</div>;
          }
          const cw = Math.min(w, h * 0.8), ch = h;
          size.current = { w: cw, h: ch };
          return (
            <div className="rr-pad" style={{ width: w, height: h }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              onContextMenu={(e) => e.preventDefault()}>
              <canvas ref={canvasRef} className="rr-canvas" style={{ width: cw, height: ch }}
                role="img" aria-label="Rail Runner: swipe to change lane, jump and slide" />
              <div className="rr-help muted">Swipe ◀ ▶ to change lane · ▲ jump · ▼ slide</div>
            </div>
          );
        }}
      </GameFrame>
      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Distance: ${hud.dist}m · Coins: ${hud.coins}${hud.crashes ? ` · Crashes: ${hud.crashes}` : ""}`} />
      )}
    </>
  );
}
