// src/components/games/BombBlast.jsx
// BOMB BLAST — drop bombs, break bricks, grab power-ups, be the last one
// standing. Solo against three computer bombers (Easy / Medium / Hard),
// against friends (only the people in the room), in teams, or together
// against two computer bombers.
//
// The server runs the arena (config/togetherWorld.js, rules and the computer
// in together/bombCore.mjs): bombs, flames, bricks, who's out and who won.
// This phone moves its own bomber at once (the same lane-walking rules the
// server checks it against), tells the server where it is, and draws.
// Move with the stick (or arrows / WASD); 💣 or Space drops a bomb.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import TogetherResults from "../together/TogetherResults";
import useTogether, { secondsLeft, smoothRows, rivals, myScore } from "../together/useTogether";
import { W, H, FLOOR, SOLID, BRICK, FUSE, LEVELS, POWERS, moveBody, inside } from "../together/bombCore.mjs";

const TAU = Math.PI * 2;
const REPORT_MS = 66;
const STICK_R = 44;
const LEVEL_TEXT = { easy: ["🙂", "Easy", "Slow and careless"], medium: ["😐", "Medium", "Knows its way round"], hard: ["😈", "Hard", "Hunts you down"] };
const POWER_COL = { bomb: "#4CC9F0", fire: "#FF6B6B", speed: "#8FDB5C" };

// ── drawing ──────────────────────────────────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
}
function emoji(ctx, e, x, y, size) {
  ctx.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(e, x, y + size * 0.05);
}
function pillar(ctx, x, y, T) {
  ctx.fillStyle = "#6E6E78"; ctx.fillRect(x, y, T, T);
  ctx.fillStyle = "#C4C4CC"; ctx.fillRect(x, y, T, T * 0.14); ctx.fillRect(x, y, T * 0.14, T);
  ctx.fillStyle = "#9C9CA6"; ctx.fillRect(x + T * 0.14, y + T * 0.14, T * 0.72, T * 0.72);
  ctx.strokeStyle = "rgba(30,30,40,.35)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
}
function brick(ctx, x, y, T) {
  ctx.fillStyle = "#8D8D96"; ctx.fillRect(x, y, T, T);
  const rows = 3, h = T / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? T / 4 : 0;
    for (let c = -1; c < 2; c++) {
      const bx = x + off + c * (T / 2) + 1, by = y + r * h + 1;
      const bw = T / 2 - 2, bh = h - 2;
      const l = Math.max(x, bx), rgt = Math.min(x + T, bx + bw);
      if (rgt <= l) continue;
      ctx.fillStyle = "#D2D2D8"; ctx.fillRect(l, by, rgt - l, bh);
      ctx.fillStyle = "#E9E9EE"; ctx.fillRect(l, by, rgt - l, bh * 0.28);
    }
  }
}
function bomb(ctx, cx, cy, T, left, t) {
  const k = 1 - Math.max(0, left) / FUSE;
  const pulse = 1 + Math.sin(t * (8 + k * 22)) * (0.05 + k * 0.07);
  const r = T * 0.36 * pulse;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.85, r * 0.9, r * 0.3, 0, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, "#6A6A7A"); g.addColorStop(1, "#111118");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = k > 0.75 && Math.sin(t * 30) > 0 ? "#FF6B6B" : "#000"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(cx - r * 0.38, cy - r * 0.38, r * 0.18, 0, TAU); ctx.fill();
  // the fuse and its spark
  ctx.strokeStyle = "#C9A06A"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx + r * 0.5, cy - r * 0.7); ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 1.3, cx + r * 1.1, cy - r * 1.05); ctx.stroke();
  const sx = cx + r * 1.1, sy = cy - r * 1.05;
  for (let i = 0; i < 5; i++) {
    const a = t * 20 + i * 1.3, d = T * (0.06 + 0.06 * Math.abs(Math.sin(t * 17 + i)));
    ctx.fillStyle = i % 2 ? "#FFE34D" : "#FF8A00";
    ctx.beginPath(); ctx.arc(sx + Math.cos(a) * d, sy + Math.sin(a) * d, T * 0.035, 0, TAU); ctx.fill();
  }
}
function fire(ctx, fireSet, T, t) {
  const has = (x, y) => fireSet.has(y * W + x);
  for (const k of fireSet.keys()) {
    const x = k % W, y = Math.floor(k / W), px = x * T, py = y * T, cx = px + T / 2, cy = py + T / 2;
    const fl = 1 + Math.sin(t * 40 + k) * 0.06;
    const band = (w, col) => {
      ctx.fillStyle = col;
      const left = has(x - 1, y), right = has(x + 1, y), up = has(x, y - 1), down = has(x, y + 1);
      const hw = (T * w * fl) / 2;
      if (left || right) { rr(ctx, left ? px : cx - hw, cy - hw, (left ? T / 2 : hw) + (right ? T / 2 : hw), hw * 2, hw); ctx.fill(); }
      if (up || down) { rr(ctx, cx - hw, up ? py : cy - hw, hw * 2, (up ? T / 2 : hw) + (down ? T / 2 : hw), hw); ctx.fill(); }
      ctx.beginPath(); ctx.arc(cx, cy, hw * 1.05, 0, TAU); ctx.fill();
    };
    band(0.86, "rgba(255,90,0,.9)");
    band(0.6, "#FFA21F");
    band(0.36, "#FFE34D");
    band(0.14, "#FFFFFF");
  }
}
function power(ctx, kind, x, y, T, t) {
  const px = x * T, py = y * T, bob = Math.sin(t * 4 + x + y) * T * 0.03;
  ctx.fillStyle = POWER_COL[kind];
  rr(ctx, px + T * 0.12, py + T * 0.12 + bob, T * 0.76, T * 0.76, T * 0.18); ctx.fill();
  ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.35)"; rr(ctx, px + T * 0.18, py + T * 0.16 + bob, T * 0.64, T * 0.16, T * 0.08); ctx.fill();
  emoji(ctx, POWERS[kind], px + T / 2, py + T / 2 + bob, T * 0.48);
}
// A bomber, like the arcade ones: white helmet, a visor, an antenna, a suit.
function bomber(ctx, b, T, t, me) {
  const x = b.x * T, y = b.y * T, s = T * 0.42;
  const step = b.moving ? Math.sin(t * 16) : 0;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x, y + s * 0.95, s * 0.7, s * 0.22, 0, 0, TAU); ctx.fill();
  if (me) { ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(x, y + s * 0.95, s * 0.95, s * 0.34, 0, 0, TAU); ctx.stroke(); }
  // feet
  ctx.fillStyle = b.cpu ? "#2E2140" : "#FF5FA2";
  ctx.beginPath(); ctx.ellipse(x - s * 0.32, y + s * 0.82 + step * s * 0.08, s * 0.26, s * 0.16, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.32, y + s * 0.82 - step * s * 0.08, s * 0.26, s * 0.16, 0, 0, TAU); ctx.fill();
  // suit
  ctx.fillStyle = b.colour; ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2;
  rr(ctx, x - s * 0.45, y + s * 0.05, s * 0.9, s * 0.7, s * 0.25); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#2E2140"; ctx.fillRect(x - s * 0.45, y + s * 0.42, s * 0.9, s * 0.1);
  // hands
  ctx.fillStyle = "#FF8FC7";
  ctx.beginPath(); ctx.arc(x - s * 0.55, y + s * 0.35 - step * s * 0.1, s * 0.15, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + s * 0.55, y + s * 0.35 + step * s * 0.1, s * 0.15, 0, TAU); ctx.fill(); ctx.stroke();
  // helmet
  const hy = y - s * 0.38;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath(); ctx.arc(x, hy, s * 0.55, 0, TAU); ctx.fill(); ctx.stroke();
  // visor and eyes, looking the way it walks
  ctx.fillStyle = b.cpu ? "#FF6B6B" : "#FFB3C7";
  rr(ctx, x - s * 0.36 + b.fx * s * 0.08, hy - s * 0.2 + b.fy * s * 0.06, s * 0.72, s * 0.42, s * 0.18); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#2E2140";
  for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + k * s * 0.14 + b.fx * s * 0.08, hy + b.fy * s * 0.06, s * 0.06, s * 0.11, 0, 0, TAU); ctx.fill(); }
  // antenna
  ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, hy - s * 0.55); ctx.lineTo(x, hy - s * 0.8); ctx.stroke();
  ctx.fillStyle = b.colour === "#FFFFFF" ? "#FF5FA2" : b.colour;
  ctx.beginPath(); ctx.arc(x, hy - s * 0.88, s * 0.13, 0, TAU); ctx.fill(); ctx.stroke();
  if (b.name) {
    ctx.font = `800 ${Math.max(9, Math.round(T * 0.26))}px Fredoka,sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.lineWidth = 3; ctx.strokeStyle = "#2E2140"; ctx.strokeText(b.name, x, hy - s * 1.1);
    ctx.fillStyle = "#FFFFFF"; ctx.fillText(b.name, x, hy - s * 1.1);
  }
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function BombBlast(props) {
  const { roomCode, currentUser, isSpectator = false, spectatorWatching = null, onGameEnd, durationSeconds = 180 } = props;
  const myId = Number(currentUser?.id);
  const canvasRef = useRef(null);
  const size = useRef({ T: 32 });
  const me = useRef(null);                     // my bomber, moved here at once
  const keys = useRef({});
  const stick = useRef(null);
  const knobRef = useRef(null);
  const sentAt = useRef(0);
  const fx = useRef({ ghosts: [], shake: 0, pops: [] });
  const [hud, setHud] = useState({ left: durationSeconds, v: null, rivals: [] });
  const [msg, setMsg] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type = "info", ms = 1500) => { setMsg({ text, type }); timers.current.push(setTimeout(() => setMsg(null), ms)); };

  const nameOf = (id) => {
    if (id === myId) return "You";
    if (id < 0) return `Bot ${-id}`;
    return tg.live.current?.players.find((p) => p.id === id)?.name || "Someone";
  };
  const fromServer = (v) => {
    const mine = v.p.find((p) => p[0] === myId);
    if (!mine || !mine[3] || isSpectator) { me.current = null; return; }
    me.current = { x: mine[1], y: mine[2], fx: 0, fy: 1, moving: false };
  };

  const tg = useTogether({
    roomCode, watchId: spectatorWatching?.user_id ?? null,
    onInit: (init) => fromServer(init.view),
    onTick: (v) => {
      const L = tg.live.current, f = fx.current, now = performance.now() / 1000;
      let reset = false;
      for (const e of v.e || []) {
        if (e.type === "round") reset = true;
        else if (e.type === "boom") f.shake = Math.max(f.shake, 0.25);
        else if (e.type === "ko") {
          const p = (L?.prev?.p || v.p).find((q) => q[0] === e.id);
          if (p) f.ghosts.push({ x: p[1], y: p[2], at: now });
          if (e.id === myId) { me.current = null; flash(e.by === myId ? "💥 Caught in your own blast!" : e.by == null ? "🧱 The walls got you!" : `💥 ${nameOf(e.by)} got you!`, "error", 2200); }
          else if (e.by === myId) flash(`💥 You got ${nameOf(e.id)}! +25`, "success");
        } else if (e.type === "power" && e.id === myId) {
          flash(e.p === "bomb" ? "💣 One more bomb at a time!" : e.p === "fire" ? "🔥 Bigger blasts!" : "👟 Faster!", "success", 1100);
        }
        // a round won or drawn: the banner over the arena says it
      }
      if (reset || (!me.current && v.ph === "play" && v.p.find((p) => p[0] === myId)?.[3])) fromServer(v);
    },
    onSnap: (r) => { if (me.current) { me.current.x = r.x; me.current.y = r.y; } },
  });
  const sideName = (side) => {
    const L = tg.live.current;
    if (!L) return "";
    const who = L.world.bodies.filter((b) => b.side === side).map((b) => nameOf(b.id));
    return who.join(" & ");
  };

  // ── input ──────────────────────────────────────────────────────────────────
  const dropBomb = () => {
    const m = me.current, L = tg.live.current;
    if (!m || !L || L.over || L.view.ph !== "play") return;
    tg.send("bomb", { x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100 });
  };
  useEffect(() => {
    if (isSpectator) return undefined;
    const down = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) { keys.current[k] = true; e.preventDefault(); }
      if ((k === " " || k === "enter" || k === "e") && !e.repeat) { e.preventDefault(); dropBomb(); }
    };
    const up = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  });
  const stickDown = (e) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
    const r = e.currentTarget.getBoundingClientRect();
    stick.current = { id: e.pointerId, ox: r.left + r.width / 2, oy: r.top + r.height / 2, x: e.clientX, y: e.clientY };
  };
  const stickMove = (e) => { const s = stick.current; if (s && s.id === e.pointerId) { s.x = e.clientX; s.y = e.clientY; } };
  const stickUp = (e) => { if (stick.current && stick.current.id === e.pointerId) stick.current = null; };

  // ── the loop ───────────────────────────────────────────────────────────────
  const { live: tgLive, report: tgReport } = tg;
  useEffect(() => {
    let raf, last = performance.now(), lastHud = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      const L = tgLive.current, c = canvasRef.current;
      if (!L) return;
      const v = L.view;
      const grid = v.g;
      const bombs = new Map(v.b.map((b) => [b[0], b]));
      const m = me.current;
      // move my bomber the way the server will check it
      if (m && v.ph === "play" && !L.over) {
        let ix = 0, iy = 0;
        const k = keys.current;
        if (k.a || k.arrowleft) ix--;
        if (k.d || k.arrowright) ix++;
        if (k.w || k.arrowup) iy--;
        if (k.s || k.arrowdown) iy++;
        const st = stick.current;
        if (st) {
          const dx = st.x - st.ox, dy = st.y - st.oy, l = Math.hypot(dx, dy);
          if (l > 10) { ix = dx; iy = dy; }
          if (knobRef.current) { const cl = Math.min(l, STICK_R) / (l || 1); knobRef.current.style.transform = `translate(${dx * cl}px, ${dy * cl}px)`; }
        } else if (knobRef.current) knobRef.current.style.transform = "";
        m.moving = !!(ix || iy);
        if (m.moving) {
          // four ways only: the stronger push wins
          const horiz = Math.abs(ix) >= Math.abs(iy);
          const ddx = horiz ? Math.sign(ix) : 0, ddy = horiz ? 0 : Math.sign(iy);
          const mine = v.p.find((p) => p[0] === myId);
          const speed = mine ? mine[6] : 3.2;
          const open = (tx, ty) => {
            if (!inside(tx, ty) || Number(grid[ty * W + tx]) !== FLOOR) return false;
            const b = bombs.get(ty * W + tx);
            return !b || b[4].includes(myId) || (Math.floor(m.x) === tx && Math.floor(m.y) === ty);
          };
          moveBody(open, m, ddx, ddy, speed * dt);
          m.fx = ddx; m.fy = ddy;
        }
        const now = Date.now();
        if (now - sentAt.current >= (m.moving ? REPORT_MS : 300)) {
          sentAt.current = now;
          tgReport({ x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100 });
        }
      }
      if (c) {
        const { T } = size.current;
        const cw = W * T, ch = H * T, dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
        const ctx = c.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const t = ts / 1000, f = fx.current;
        f.shake = Math.max(0, f.shake - dt);
        ctx.save();
        if (f.shake > 0) ctx.translate(Math.sin(t * 90) * f.shake * 10, Math.cos(t * 70) * f.shake * 6);
        // floor, pillars, bricks
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const cell = Number(grid[y * W + x]);
          if (cell === SOLID) pillar(ctx, x * T, y * T, T);
          else if (cell === BRICK) brick(ctx, x * T, y * T, T);
          else {
            ctx.fillStyle = (x + y) % 2 ? "#3E9B43" : "#45A84A";
            ctx.fillRect(x * T, y * T, T, T);
            // the shade a pillar or brick casts on the floor below it
            if (y > 0 && Number(grid[(y - 1) * W + x]) !== FLOOR) { ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(x * T, y * T, T, T * 0.18); }
          }
        }
        for (const [k, kind] of v.pw) power(ctx, kind, k % W, Math.floor(k / W), T, t);
        // bombs, counting down smoothly between ticks
        const since = (Date.now() - L.viewAt) / 1000;
        for (const b of v.b) bomb(ctx, ((b[0] % W) + 0.5) * T, (Math.floor(b[0] / W) + 0.5) * T, T, b[1] - since, t);
        fire(ctx, new Map(v.f.map(([k, ttl]) => [k, ttl])), T, t);
        // bombers: others glide a moment behind the server, me where I am
        const bodies = new Map(L.world.bodies.map((b) => [b.id, b]));
        const many = L.world.bodies.length > 1;
        const draw = smoothRows(L, "p", [1, 2]).filter(({ row }) => row[3]).map(({ row: p, moving, dx = 0, dy = 0 }) => {
          const mine = m && p[0] === myId;
          const x = mine ? m.x : p[1], y = mine ? m.y : p[2];
          return {
            id: p[0], x, y, cpu: p[0] < 0, colour: bodies.get(p[0])?.colour || "#FFFFFF",
            moving: mine ? m.moving : moving,
            fx: mine ? m.fx : Math.sign(Math.abs(dx) > Math.abs(dy) ? dx : 0), fy: mine ? m.fy : Math.sign(Math.abs(dy) >= Math.abs(dx) ? dy : 0) || 1,
            name: many ? (p[0] === myId ? "You" : nameOf(p[0])) : null,
          };
        }).sort((a, b) => a.y - b.y);
        for (const b of draw) bomber(ctx, b, T, t, b.id === myId);
        // the knocked out float away
        const now = performance.now() / 1000;
        f.ghosts = f.ghosts.filter((g) => now - g.at < 1.4);
        for (const g of f.ghosts) {
          const q = (now - g.at) / 1.4;
          ctx.globalAlpha = 1 - q;
          emoji(ctx, "💀", g.x * T, g.y * T - q * T * 1.4, T * (0.7 + q * 0.3));
          ctx.globalAlpha = 1;
        }
        ctx.restore();
        // late on, a warning as the walls start closing
        if (v.ph === "play" && v.rt > 52 && v.rt < 60) {
          ctx.fillStyle = `rgba(255,107,107,${0.25 + 0.2 * Math.sin(t * 10)})`;
          ctx.fillRect(0, 0, cw, T * 0.6);
          ctx.font = `800 ${Math.round(T * 0.42)}px Fredoka,sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillStyle = "#fff"; ctx.fillText("⚠️ The walls are closing in!", cw / 2, T * 0.3);
        }
      }
      if (ts - lastHud > 200) { lastHud = ts; setHud({ left: secondsLeft(L), v, rivals: rivals(L) }); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tgLive, tgReport, myId, isSpectator]);

  const L = tg.live.current, v = hud.v;
  const mySide = L ? L.world.bodies.find((b) => b.id === myId)?.side : undefined;
  const cpuIdx = L ? L.world.keys.indexOf("cpu") : -1;
  const stats = v ? [
    { label: "Score", value: Number(myScore(L) || (mySide !== undefined ? v.sc[mySide] : 0)).toLocaleString() },
    { label: "Rounds won", value: mySide !== undefined ? v.wn[mySide] : "—" },
    cpuIdx >= 0 ? { label: "🤖 won", value: v.wn[cpuIdx] } : { label: "Round", value: v.rd },
  ] : [];
  const amAlive = !!(v && v.p.find((p) => p[0] === myId)?.[3]);
  const showLevel = !isSpectator && v && v.ph === "level";
  const controls = !isSpectator ? (
    <div className="bb-controls">
      <div className="bb-stick" onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp} aria-label="Move" role="application">
        <div className="bb-knob" ref={knobRef} />
      </div>
      <div className="bb-mid muted">
        {v && v.ph === "pause" ? `Next round in ${Math.ceil(v.pz)}…` : v && v.ph === "play" && !amAlive ? "💀 Out — watching till the round ends" : ""}
      </div>
      <button className="press bb-bomb" onPointerDown={(e) => { e.preventDefault(); dropBomb(); }} disabled={!amAlive} aria-label="Drop a bomb">💣</button>
    </div>
  ) : null;

  return (
    <>
      <GameFrame
        gameName="Bomb Blast" badge="💣 BOMB BLAST"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: hud.left, max: durationSeconds }}
        opponents={hud.rivals}
        message={msg}
        onQuit={onGameEnd}
        controls={controls}
      >
        {({ w, h }) => {
          const T = Math.max(18, Math.floor(Math.min(w / W, h / H)));
          size.current = { T };
          return (
            <div className="bb-pad" style={{ width: w, height: h }} onContextMenu={(e) => e.preventDefault()}>
              {!tg.ready && <div className="muted">{tg.gone ? "This arena is closed." : "Into the arena…"}</div>}
              <canvas ref={canvasRef} className="bb-canvas" style={{ width: W * T, height: H * T, display: tg.ready ? "block" : "none" }}
                role="img" aria-label="Bomb Blast: the arena from above" />
              {v && v.ph === "pause" && (
                <div className="bb-banner pop">
                  {v.lw === null ? "💥 A draw!" : v.lw === mySide ? "🏆 You win the round!" : cpuIdx === v.lw ? "🤖 The computer wins the round" : `${sideName(v.lw)} ${L.mode === "teams" ? "win" : "wins"} the round`}
                  <small>Round {v.rd + 1} in {Math.ceil(v.pz)}…</small>
                </div>
              )}
              {showLevel && (
                <div className="cr-level pop" role="dialog" aria-label="How good should the computer be?">
                  <h3>🤖 How good are the computer bombers?</h3>
                  <div className="cr-levels">
                    {LEVELS.map((lvl) => (
                      <button key={lvl} className={`press cr-lvl lvl-${lvl}`} onClick={() => tg.send("level", { lvl })}>
                        <span className="cr-face">{LEVEL_TEXT[lvl][0]}</span><b>{LEVEL_TEXT[lvl][1]}</b><small>{LEVEL_TEXT[lvl][2]}</small>
                      </button>
                    ))}
                  </div>
                  <p className="muted">Three of them, one of you. Last one standing wins the round.</p>
                </div>
              )}
              {isSpectator && L && L.sides.length > 1 && (
                <div className="kr-watch">
                  {L.sides.map((s) => <span key={s.key} className="chip">{L.mode === "teams" ? `${s.name} team` : s.name}</span>)}
                </div>
              )}
            </div>
          );
        }}
      </GameFrame>
      {tg.over && !isSpectator && (
        <TogetherResults over={tg.over} me={currentUser} onExit={onGameEnd} icon="💣"
          goalText={(s) => (s.sum?.cpuWins != null ? `Rounds: you ${s.sum.wins}, the computer ${s.sum.cpuWins}${s.sum.level ? ` (${s.sum.level})` : ""}.` : `${s.sum?.wins ?? 0} rounds won.`)}
          describe={(s) => `${s.sum?.wins ?? 0} round${s.sum?.wins === 1 ? "" : "s"} won · ${s.sum?.kos ?? 0} knockout${s.sum?.kos === 1 ? "" : "s"}`} />
      )}
    </>
  );
}
