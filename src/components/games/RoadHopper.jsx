// src/components/games/RoadHopper.jsx
// Road Hopper — hop the chicken across roads, rivers and railways, as far as
// you can (in the spirit of Crossy Road). Tap to hop forward, swipe left,
// right or back; or the arrow keys. Everyone in a room hops the same course
// (the seed); the room's clock decides it, and your best row counts. The
// rules are hopperSim.js; this file draws them, blocky and a little 3D, and
// reads the thumbs.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { newHopper, hop, step, score, rowAt, thingsAt, trainAt, COLS, HOP_S } from "./hopperSim.js";

const SWIPE = 22;
const CAR_COLOURS = ["#FF6B6B", "#4CC9F0", "#FFC53D", "#9B5DE5", "#8FDB5C", "#FF9F43"];
const SAY = { car: "🚗 Splat! Look both ways", water: "💦 Splash! Only the logs are safe", edge: "🪵 Carried off the edge!", train: "🚂 Watch for the flashing light!", eagle: "🦅 Too slow — the eagle got you!" };

// a block with a top and a darker front, `hgt` of a square tall
function block(ctx, x, y, w, d, hgt, top, side, S) {
  const lift = hgt * S * 0.55;
  ctx.fillStyle = side; ctx.fillRect(x, y - lift + d, w, lift);
  ctx.fillStyle = top; ctx.fillRect(x, y - lift, w, d);
}
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

function drawScene(ctx, W, H, h, camRow, now) {
  const S = W / COLS;
  const Y = (row) => H - (row - camRow + 1) * S;          // the top edge of a row on the screen
  const first = Math.floor(camRow) - 2, last = Math.ceil(camRow + H / S) + 2;
  // the ground, far rows first
  for (let n = last; n >= first; n--) {
    const r = rowAt(h.course, n), y = Y(n);
    if (r.kind === "grass") {
      ctx.fillStyle = n % 2 ? "#8ED15A" : "#83C64F"; ctx.fillRect(0, y, W, S + 1);
    } else if (r.kind === "road") {
      ctx.fillStyle = "#5A5C66"; ctx.fillRect(0, y, W, S + 1);
      const up = rowAt(h.course, n + 1);
      if (up.kind === "road") { ctx.fillStyle = "rgba(255,255,255,.75)"; for (let x = 0; x < W; x += S) ctx.fillRect(x + S * 0.2, y - 1, S * 0.5, 3); }
      else { ctx.fillStyle = "#3F4048"; ctx.fillRect(0, y, W, 4); }
    } else if (r.kind === "river") {
      ctx.fillStyle = "#4FB3F0"; ctx.fillRect(0, y, W, S + 1);
      ctx.fillStyle = "rgba(255,255,255,.35)";
      for (let k = 0; k < 4; k++) { const wx = ((k * W) / 4 + now * 20 * (r.dir || 1) + n * 37) % W; ctx.fillRect((wx + W) % W, y + S * (0.3 + (k % 2) * 0.35), S * 0.5, 2); }
    } else {
      ctx.fillStyle = "#B7AD9C"; ctx.fillRect(0, y, W, S + 1);
      ctx.fillStyle = "#7A5B3E"; for (let x = 0; x < W; x += S * 0.5) ctx.fillRect(x + 2, y + S * 0.18, S * 0.18, S * 0.64);
      ctx.fillStyle = "#8C939C"; ctx.fillRect(0, y + S * 0.28, W, 3); ctx.fillRect(0, y + S * 0.68, W, 3);
    }
  }
  // what stands on the rows, far rows first, the chicken in its row
  const hy = h.hop ? h.hop.from[0] + (h.hop.to[0] - h.hop.from[0]) * Math.min(1, h.hop.t / HOP_S) : h.row;
  const hx = h.hop ? h.hop.from[1] + (h.hop.to[1] - h.hop.from[1]) * Math.min(1, h.hop.t / HOP_S) : h.x;
  const meRow = Math.round(hy);
  for (let n = last; n >= first; n--) {
    const r = rowAt(h.course, n), y = Y(n);
    if (r.kind === "grass") {
      for (const c of r.trees) {
        const x = c * S;
        if (n < 0) { block(ctx, x + S * 0.06, y + S * 0.2, S * 0.88, S * 0.62, 0.3, "#4FAE3E", "#3A8A2E", S); continue; }   // behind the start: a low hedge
        ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(x + S * 0.12, y + S * 0.72, S * 0.8, S * 0.18);
        block(ctx, x + S * 0.38, y + S * 0.55, S * 0.24, S * 0.22, 0.5, "#8A5A33", "#6B4423", S);
        block(ctx, x + S * 0.12, y + S * 0.18, S * 0.76, S * 0.6, 1.1, "#4FAE3E", "#3A8A2E", S);
        block(ctx, x + S * 0.24, y + S * 0.22, S * 0.5, S * 0.4, 1.6, "#62C24E", "#46993A", S);
      }
      if (r.coin >= 0 && !h.taken.has(n)) {
        const cx = (r.coin + 0.5) * S, cy = y + S * 0.4 + Math.sin(now * 4) * S * 0.05, sq = Math.abs(Math.cos(now * 3));
        ctx.fillStyle = "#E3A21A"; ctx.beginPath(); ctx.ellipse(cx, cy, S * 0.22 * Math.max(0.2, sq), S * 0.22, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#FFD447"; ctx.beginPath(); ctx.ellipse(cx, cy, S * 0.16 * Math.max(0.15, sq), S * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (r.kind === "road") {
      thingsAt(r, h.t).forEach((c, i) => {
        const x = c.x0 * S, w = (c.x1 - c.x0) * S - S * 0.08, col = CAR_COLOURS[(n * 3 + i) % CAR_COLOURS.length];
        ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(x + 3, y + S * 0.72, w, S * 0.16);
        block(ctx, x, y + S * 0.2, w, S * 0.6, 0.6, col, shade(col, 0.72), S);
        // the cab and its windows
        const cab = c.x1 - c.x0 > 1.5 ? w * 0.3 : w * 0.6, cx0 = r.dir > 0 ? x + w - cab - S * 0.05 : x + S * 0.05;
        block(ctx, cx0, y + S * 0.26, cab, S * 0.46, 1.05, shade(col, 1.12), shade(col, 0.8), S);
        ctx.fillStyle = "rgba(200,235,255,.9)"; ctx.fillRect(cx0 + cab * 0.12, y + S * 0.26 - S * 0.58 + S * 0.08, cab * 0.76, S * 0.12);
        ctx.fillStyle = "#222"; for (const wx of [x + S * 0.12, x + w - S * 0.3]) ctx.fillRect(wx, y + S * 0.78, S * 0.18, S * 0.08);
      });
    } else if (r.kind === "river") {
      for (const c of thingsAt(r, h.t)) {
        const x = c.x0 * S, w = (c.x1 - c.x0) * S - S * 0.06;
        block(ctx, x, y + S * 0.22, w, S * 0.56, 0.22, "#A0703F", "#7A5230", S);
        ctx.strokeStyle = "rgba(90,60,30,.6)"; ctx.lineWidth = 1.5;
        for (let k = 1; k < (c.x1 - c.x0) * 2; k++) { ctx.beginPath(); ctx.moveTo(x + k * S * 0.5, y + S * 0.12); ctx.lineTo(x + k * S * 0.5 + S * 0.08, y + S * 0.62); ctx.stroke(); }
        ctx.fillStyle = "#C79A62"; ctx.beginPath(); ctx.ellipse(x + w, y + S * 0.38, S * 0.08, S * 0.24, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      // the signal: red lights flashing before and while the train passes
      const tr = trainAt(r, h.t);
      const lit = (tr.warn || tr.on) && Math.floor(now * 6) % 2 === 0;
      ctx.fillStyle = "#3A3A44"; ctx.fillRect(S * 0.12, y - S * 0.4, S * 0.08, S * 0.9);
      ctx.fillStyle = lit ? "#FF3B3B" : "#5A1E22"; ctx.beginPath(); ctx.arc(S * 0.16, y - S * 0.42, S * 0.12, 0, Math.PI * 2); ctx.fill();
      if (lit) { ctx.fillStyle = "rgba(255,60,60,.25)"; ctx.fillRect(0, y, W, S); }
      if (tr.on) {
        const x = tr.x * S, w = 12 * S;
        block(ctx, x, y + S * 0.14, w, S * 0.7, 1.1, "#E84A4A", "#B23434", S);
        ctx.fillStyle = "#FFE08A"; for (let k = 0; k < 12; k += 1.5) ctx.fillRect(x + k * S + S * 0.2, y + S * 0.14 - S * 0.6 + S * 0.12, S * 0.6, S * 0.16);
      }
    }
    if (n === meRow) drawChicken(ctx, (hx + 0.5) * S, Y(hy) + S * 0.55, S, h, now);
  }
}

function drawChicken(ctx, cx, cy, S, h, now) {
  const air = h.hop ? Math.sin(Math.PI * Math.min(1, h.hop.t / HOP_S)) : 0;
  const squash = h.hop ? 1 + air * 0.12 : 1 - Math.max(0, Math.sin(now * 3)) * 0.03;
  const lift = air * S * 0.35;
  ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(cx, cy + S * 0.2, S * 0.28 * (1 - air * 0.3), S * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(cx, cy - lift);
  ctx.scale(1 / squash, squash);
  const w = S * 0.5, d = S * 0.38;
  block(ctx, -w / 2, -d / 2, w, d, 0.85, "#FFFFFF", "#D9D9D9", S);              // the body
  ctx.fillStyle = "#FF5252"; ctx.fillRect(-S * 0.07, -d / 2 - S * 0.62, S * 0.14, S * 0.12);   // the comb
  ctx.fillStyle = "#FF9F1C"; ctx.fillRect(-S * 0.06, -d / 2 - S * 0.3, S * 0.12, S * 0.1);      // the beak
  ctx.fillStyle = "#222"; ctx.fillRect(-S * 0.16, -d / 2 - S * 0.38, S * 0.06, S * 0.06); ctx.fillRect(S * 0.1, -d / 2 - S * 0.38, S * 0.06, S * 0.06);
  ctx.fillStyle = "#FF9F1C"; ctx.fillRect(-S * 0.14, d / 2 - 2, S * 0.08, S * 0.1); ctx.fillRect(S * 0.06, d / 2 - 2, S * 0.08, S * 0.1);
  ctx.restore();
  if (h.daze > 0) {
    ctx.font = `${Math.round(S * 0.3)}px sans-serif`; ctx.textAlign = "center";
    for (let k = 0; k < 3; k++) { const a = now * 5 + (k * Math.PI * 2) / 3; ctx.fillText("⭐", cx + Math.cos(a) * S * 0.3, cy - S * 0.7 + Math.sin(a) * S * 0.1); }
  }
}

export default function RoadHopper(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;
  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;
  const sim = useRef(null);
  if (sim.current === null) sim.current = newHopper(seed);
  const canvasRef = useRef(null);
  const size = useRef({ w: 300, h: 400 });
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);
  const [hud, setHud] = useState({ best: 0, coins: 0, crashes: 0 });
  const [msg, setMsg] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type, ms = 1400) => { setMsg({ text, type }); timers.current.push(setTimeout(() => setMsg(null), ms)); };

  const go = (dir) => { if (!overRef.current && !isSpectator) hop(sim.current, dir); };

  // keys
  useEffect(() => {
    if (isSpectator) return undefined;
    const map = { ArrowUp: "up", w: "up", " ": "up", ArrowDown: "down", s: "down", ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right" };
    const dn = (e) => { const d = map[e.key]; if (d) { e.preventDefault(); if (!e.repeat) go(d); } };
    window.addEventListener("keydown", dn);
    return () => window.removeEventListener("keydown", dn);
  });

  // thumbs: a tap hops forward, a swipe hops that way
  const touch = useRef(null);
  const onDown = (e) => { touch.current = { x: e.clientX, y: e.clientY, used: false }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ } };
  const onMove = (e) => {
    const t = touch.current;
    if (!t || t.used) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) return;
    t.used = true;
    go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  };
  const onUp = () => { const t = touch.current; touch.current = null; if (t && !t.used) go("up"); };

  useEffect(() => {
    if (isSpectator) return undefined;
    let raf, last = performance.now(), pushed = 0, lastHud = 0, cam = -3;
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));   // never backwards: the first frame can be stamped early
      last = Math.max(last, now);
      const h = sim.current;
      if (!overRef.current) {
        const out = step(h, dt);
        if (out.crashed) flash(SAY[out.crashed] || "Ouch!", "error");
        if (out.coin) flash("🪙 +25", "success", 700);
        const target = score(h);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
      }
      // the camera: keeps the chicken a third of the way up, eases along
      const want = Math.max(h.cam - 3, (h.hop ? h.hop.to[0] : h.row) - 3);
      cam += (want - cam) * Math.min(1, dt * 6);
      const c = canvasRef.current;
      if (c) {
        const { w, h: hh } = size.current, dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); }
        const ctx = c.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScene(ctx, w, hh, h, cam, now / 1000);
      }
      if (now - lastHud > 150) { lastHud = now; setHud({ best: h.best, coins: h.coins, crashes: h.crashes }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, addScore]);

  const stats = isSpectator
    ? [{ label: "Score", value: Number(spectatorWatching?.score ?? 0).toLocaleString() }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Rows", value: hud.best },
        { label: "Coins", value: `🪙 ${hud.coins}` },
      ];

  return (
    <>
      <GameFrame
        gameName="Road Hopper" badge="🐔 ROAD HOPPER"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={Object.values(eng.opponents)}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          if (isSpectator) return <div className="muted">👀 Watching {spectatorWatching?.username} — {Number(spectatorWatching?.score ?? 0).toLocaleString()} pts</div>;
          const cw = Math.min(w, Math.round(h * 0.68)), ch = h - 22;
          size.current = { w: cw, h: ch };
          return (
            <div className="rh-pad" data-no-fun style={{ width: w, height: h }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { touch.current = null; }}
              onContextMenu={(e) => e.preventDefault()}>
              <canvas ref={canvasRef} className="rh-canvas" style={{ width: cw, height: ch }} role="img"
                aria-label="Road Hopper: tap to hop forward, swipe to hop sideways or back" />
              <div className="rh-help muted">Tap to hop · swipe ◀ ▶ ▼</div>
            </div>
          );
        }}
      </GameFrame>
      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`${hud.best} rows · 🪙 ${hud.coins}`} />
      )}
    </>
  );
}
