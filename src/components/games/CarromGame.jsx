// src/components/games/CarromGame.jsx
// CARROM — flick the striker, pocket your colour, cover the queen. Alone
// against the computer (Easy, Medium or Hard), one against one, or two
// against two with your partner sitting opposite.
//
// The server runs the board (config/togetherWorld.js, rules and physics in
// together/carromCore.mjs): it works out every shot and sends it as frames,
// which this phone plays back. The board is turned so your baseline is at
// the bottom. On your turn: drag the striker (or the slider) along your line,
// then pull back from it — away from where you want it to go — and let go.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import TogetherResults from "../together/TogetherResults";
import GameIcon from "./GameIcon";
import useTogether, { secondsLeft } from "../together/useTogether";
import {
  R_COIN, R_STRIKER, POCKETS, U_MIN, U_MAX, TURN_S, FORWARD, LEVELS, strikerAt,
} from "../together/carromCore.mjs";

const TAU = Math.PI * 2;
const SEAT_COLOURS = ["#4CC9F0", "#FF8FC7", "#8FDB5C", "#FFA36C"];
const SOUND_KEY = "carrom.sound";
const LEVEL_TEXT = { easy: ["🙂", "Easy", "It misses a fair bit"], medium: ["😐", "Medium", "A steady hand"], hard: ["😈", "Hard", "Rarely misses"] };

// ── turning the board so my line is at the bottom ────────────────────────────
// board (0..1) → view (0..1); directions turn the same way, and back.
const TURN = {
  bottom: [(x, y) => [x, y], (x, y) => [x, y]],
  right: [(x, y) => [-y, x], (x, y) => [y, -x]],
  top: [(x, y) => [-x, -y], (x, y) => [-x, -y]],
  left: [(x, y) => [y, -x], (x, y) => [-y, x]],
};
const toView = (pos, x, y) => { const [a, b] = TURN[pos][0](x - 0.5, y - 0.5); return [a + 0.5, b + 0.5]; };
const dirToBoard = (pos, x, y) => TURN[pos][1](x, y);
const dirToView = (pos, x, y) => TURN[pos][0](x, y);

function makeSound() {
  let ctx = null;
  const ready = () => {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const knock = (f, vol, dur, when = 0) => {
    const c = ready(); if (!c) return;
    const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  return {
    clack: (p) => knock(900, 0.12 + p * 0.15, 0.06),
    plop: (when) => { knock(320, 0.18, 0.18, when); knock(180, 0.12, 0.25, when + 0.05); },
    close: () => { try { ctx && ctx.close(); } catch { /* gone */ } },
  };
}

// ── drawing ──────────────────────────────────────────────────────────────────
function drawBoard(ctx, B, pos) {
  const F = B * 0.055, S = B - 2 * F;
  const P = (x, y) => { const [a, b] = toView(pos, x, y); return [F + a * S, F + b * S]; };
  // the frame
  const fg = ctx.createLinearGradient(0, 0, B, B);
  fg.addColorStop(0, "#7A4A2A"); fg.addColorStop(1, "#4E2E1A");
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(0, 0, B, B, 16) : ctx.rect(0, 0, B, B); ctx.fill();
  // the surface, with a little grain
  const sg = ctx.createRadialGradient(B / 2, B / 2, S * 0.1, B / 2, B / 2, S * 0.75);
  sg.addColorStop(0, "#F8E6BF"); sg.addColorStop(1, "#EBCF98");
  ctx.fillStyle = sg;
  ctx.fillRect(F, F, S, S);
  ctx.strokeStyle = "rgba(160,110,60,.10)"; ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const y = F + (i / 40) * S + Math.sin(i * 1.7) * 2; ctx.beginPath(); ctx.moveTo(F, y); ctx.bezierCurveTo(F + S * 0.3, y + 3, F + S * 0.7, y - 3, F + S, y); ctx.stroke(); }
  ctx.strokeStyle = "#3B2416"; ctx.lineWidth = 2;
  ctx.strokeRect(F, F, S, S);
  // the four baselines: two lines with a red circle at each end
  ctx.lineWidth = 1.6;
  for (const side of ["bottom", "right", "top", "left"]) {
    for (const off of [-R_STRIKER, R_STRIKER]) {
      const [a1, b1] = strikerAt(side, U_MIN), [a2, b2] = strikerAt(side, U_MAX);
      const [fx, fy] = FORWARD[side];
      const [x1, y1] = P(a1 + fx * off, b1 + fy * off), [x2, y2] = P(a2 + fx * off, b2 + fy * off);
      ctx.strokeStyle = "#3B2416"; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    for (const u of [U_MIN, U_MAX]) {
      const [x, y] = P(...strikerAt(side, u));
      ctx.fillStyle = "#D62828"; ctx.strokeStyle = "#3B2416";
      ctx.beginPath(); ctx.arc(x, y, R_STRIKER * S, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }
  // arrows in from the corners
  ctx.strokeStyle = "#3B2416"; ctx.lineWidth = 1.5;
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const dx = cx ? -1 : 1, dy = cy ? -1 : 1;
    const [x1, y1] = P(cx + dx * 0.13, cy + dy * 0.13), [x2, y2] = P(cx + dx * 0.32, cy + dy * 0.32);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1), h = S * 0.02;
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - Math.cos(ang - 0.5) * h, y2 - Math.sin(ang - 0.5) * h);
    ctx.moveTo(x2, y2); ctx.lineTo(x2 - Math.cos(ang + 0.5) * h, y2 - Math.sin(ang + 0.5) * h); ctx.stroke();
  }
  // the middle: two rings and a flower
  const [mx, my] = P(0.5, 0.5);
  ctx.strokeStyle = "#3B2416"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(mx, my, S * 0.125, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(mx, my, S * 0.115, 0, TAU); ctx.stroke();
  ctx.strokeStyle = "rgba(214,40,40,.55)";
  for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; ctx.beginPath(); ctx.ellipse(mx + Math.cos(a) * S * 0.05, my + Math.sin(a) * S * 0.05, S * 0.05, S * 0.018, a, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = "#D62828"; ctx.beginPath(); ctx.arc(mx, my, S * 0.018, 0, TAU); ctx.fill();
  // the pockets
  for (const [px, py] of POCKETS) {
    const [x, y] = P(px, py);
    const pg = ctx.createRadialGradient(x, y, 1, x, y, S * 0.046);
    pg.addColorStop(0, "#000"); pg.addColorStop(1, "#2A1A10");
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(x, y, S * 0.046, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#C9A06A"; ctx.lineWidth = 2; ctx.stroke();
  }
  return { F, S };
}

function drawCoin(ctx, kind, x, y, r) {
  ctx.fillStyle = "rgba(40,20,10,.28)";
  ctx.beginPath(); ctx.arc(x + r * 0.18, y + r * 0.22, r, 0, TAU); ctx.fill();
  const base = kind === "w" ? "#FFF4D6" : kind === "b" ? "#2B2730" : "#E63946";
  const ring = kind === "w" ? "#D9C79A" : kind === "b" ? "#56505F" : "#9E1B26";
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, kind === "b" ? "#4A4452" : "#FFFFFF"); g.addColorStop(1, base);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = ring; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, TAU); ctx.stroke();
}
function drawStriker(ctx, x, y, r, colour, glow) {
  ctx.fillStyle = "rgba(40,20,10,.3)";
  ctx.beginPath(); ctx.arc(x + r * 0.15, y + r * 0.2, r, 0, TAU); ctx.fill();
  if (glow) { ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(x, y, r * 1.45, 0, TAU); ctx.fill(); }
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, "#FFFFFF"); g.addColorStop(1, colour);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = "rgba(46,33,64,.5)"; ctx.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25); ctx.lineTo(x + Math.cos(a) * r * 0.65, y + Math.sin(a) * r * 0.65); ctx.stroke(); }
}

// Where a shot from (sx,sy) along (dx,dy) first meets a coin or a wall (board units).
function rayHit(coins, sx, sy, dx, dy) {
  let best = Infinity, hit = null;
  for (const c of coins) {
    if (!c) continue;
    const [cx, cy] = c;
    const fx = sx - cx, fy = sy - cy, rr = R_COIN + R_STRIKER;
    const b = fx * dx + fy * dy, cc = fx * fx + fy * fy - rr * rr, disc = b * b - cc;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t > 0.001 && t < best) { best = t; hit = [cx, cy]; }
  }
  for (const t of [dx < 0 ? (R_STRIKER - sx) / dx : dx > 0 ? (1 - R_STRIKER - sx) / dx : Infinity, dy < 0 ? (R_STRIKER - sy) / dy : dy > 0 ? (1 - R_STRIKER - sy) / dy : Infinity]) {
    if (t > 0 && t < best) { best = t; hit = null; }
  }
  return { t: Math.min(best, 2), coin: hit };
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function CarromGame(props) {
  const { roomCode, currentUser, isSpectator = false, spectatorWatching = null, onGameEnd, durationSeconds = 300 } = props;
  const myId = Number(currentUser?.id);
  const canvasRef = useRef(null);
  const size = useRef({ B: 360 });
  const play = useRef(null);                 // the shot being played back
  const me = useRef({ u: 0.5, aim: null, drag: null });
  const sentAim = useRef(0);
  const [, force] = useState(0);
  const [hud, setHud] = useState({ left: durationSeconds, v: null });
  const [msg, setMsg] = useState(null);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } });
  const soundRef = useRef(sound);
  useEffect(() => { soundRef.current = sound; try { localStorage.setItem(SOUND_KEY, sound ? "on" : "off"); } catch { /* private */ } }, [sound]);
  const sfx = useRef(null);
  if (sfx.current === null) sfx.current = makeSound();
  useEffect(() => () => sfx.current.close(), []);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type = "info", ms = 1600) => { setMsg({ text, type }); timers.current.push(setTimeout(() => setMsg(null), ms)); };

  const nameOf = (id) => {
    if (id === "cpu") return "Computer";
    if (Number(id) === myId) return "You";
    return tg.live.current?.players.find((p) => p.id === Number(id))?.name || "Someone";
  };

  const tg = useTogether({
    roomCode, watchId: spectatorWatching?.user_id ?? null,
    onTick: (v) => {
      const L = tg.live.current;
      for (const e of v.e || []) {
        if (e.type === "shot") {
          // every position of every frame, worked out once, for smooth playback
          const pos = e.start.map((p) => (p ? [p[0] / 1000, p[1] / 1000] : null));
          const frames = [pos.map((p) => p && [...p])];
          for (const f of e.frames) {
            const next = frames[frames.length - 1].map((p) => p && [...p]);
            for (const [i, x, y] of f) next[i] = x < 0 ? null : [x / 1000, y / 1000];
            frames.push(next);
          }
          play.current = { frames, fps: e.fps, t0: performance.now(), seat: e.seat };
          if (soundRef.current) {
            sfx.current.clack(0.6);
            let k = 0;
            e.frames.forEach((f, i) => f.forEach(([, x]) => { if (x < 0 && k++ < 4) sfx.current.plop(i / e.fps); }));
          }
          const r = e.res;
          const who = nameOf(L?.world.seats[e.seat]?.id);
          timers.current.push(setTimeout(() => {
            if (r.foul) flash(`Foul! ${who === "You" ? "Your" : `${who}'s`} striker went in — a coin comes back`, "error", 2200);
            else if (r.queen === "covered") flash("👑 Queen covered! +30", "success");
            else if (r.queen === "due") flash("👑 The queen! Cover her with your next coin", "info", 2200);
            else if (r.queen === "back") flash("👑 Not covered — the queen goes back", "error");
            else if (r.early) flash("Too soon — the queen has to be settled first", "error", 2200);
            else if (r.theirs) flash("That was their last coin — it comes back", "error");
            else if (r.own) flash(`${who === "You" ? "Nice!" : `${who}:`} ${r.own} in — ${who === "You" ? "go again" : "again"}`, "success");
          }, (e.frames.length / e.fps) * 1000));
        } else if (e.type === "turn") {
          const seat = L?.world.seats[e.seat];
          if (seat && seat.id === myId && !e.keep) { flash("🎯 Your turn!", "info", 1200); me.current.u = 0.5; }
        } else if (e.type === "timeout") flash(L?.world.seats[e.seat]?.id === myId ? "⏰ Too slow — the turn passes" : "⏰ Time — the turn passes", "error");
        else if (e.type === "forfeit") flash("The other side left", "info", 2500);
      }
    },
    onReply: (r) => {
      if (r.a === "shoot" && !r.ok) flash(r.why === "onCoin" ? "Move the striker off that coin" : r.why === "back" ? "You can't shoot backwards" : "Not your turn", "error");
    },
  });

  // ── input ──────────────────────────────────────────────────────────────────
  const myTurn = () => {
    const L = tg.live.current;
    if (!L || isSpectator || L.over || L.view.ph !== "aim") return false;
    return L.world.seats[L.view.tn]?.id === myId;
  };
  const viewPoint = (e) => {
    const c = canvasRef.current, r = c.getBoundingClientRect(), { B } = size.current;
    const k = B / (c.clientWidth || B);
    const F = B * 0.055, S = B - 2 * F;
    return [((e.clientX - r.left - c.clientLeft) * k - F) / S, ((e.clientY - r.top - c.clientTop) * k - F) / S];
  };
  // where I'm aiming, so the others can watch it (a few times a second)
  const sendAim = (now = false) => {
    const m = me.current, t = Date.now();
    if (!now && t - sentAim.current < 120) return;
    sentAim.current = t;
    tg.send("aim", { u: m.u, ang: m.aim ? m.aim.ang : 0, pow: m.aim ? m.aim.pow : 0 });
  };
  const onDown = (e) => {
    if (!myTurn()) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
    const L = tg.live.current, seat = L.world.seats[L.view.tn];
    const [vx, vy] = viewPoint(e);
    const [sx, sy] = toView(seat.pos, ...strikerAt(seat.pos, me.current.u));
    const onStriker = Math.hypot(vx - sx, vy - sy) < R_STRIKER * 2.2;
    me.current.drag = { id: e.pointerId, mode: onStriker ? "move" : "aim" };
    if (!onStriker) aimAt(vx, vy);
  };
  const aimAt = (vx, vy) => {
    const L = tg.live.current, seat = L.world.seats[L.view.tn], m = me.current;
    const [sx, sy] = toView(seat.pos, ...strikerAt(seat.pos, m.u));
    const dx = sx - vx, dy = sy - vy, d = Math.hypot(dx, dy);
    const pow = Math.max(0, Math.min(1, (d - 0.03) / 0.38));
    const [bx, by] = dirToBoard(seat.pos, dx / (d || 1), dy / (d || 1));
    // the shot goes away from the finger; pulling forward would send it backwards
    m.aim = { ang: Math.atan2(by, bx), pow, back: dy / (d || 1) > 0.05 };
    sendAim();
  };
  const onMove = (e) => {
    const m = me.current;
    if (!m.drag || m.drag.id !== e.pointerId || !myTurn()) return;
    const [vx, vy] = viewPoint(e);
    if (m.drag.mode === "move") { m.u = Math.max(U_MIN, Math.min(U_MAX, vx)); sendAim(); }
    else aimAt(vx, vy);
  };
  const onUp = (e) => {
    const m = me.current;
    if (!m.drag || m.drag.id !== e.pointerId) return;
    const mode = m.drag.mode;
    m.drag = null;
    if (mode === "aim" && m.aim && myTurn()) {
      if (m.aim.pow > 0.04 && !m.aim.back) tg.send("shoot", { u: m.u, ang: m.aim.ang, pow: m.aim.pow });
      else if (m.aim.back) flash("Pull back towards yourself, then let go", "info");
    }
    m.aim = null;
    sendAim(true);
  };

  // ── the loop ───────────────────────────────────────────────────────────────
  const { live: tgLive } = tg;
  useEffect(() => {
    let raf, lastHud = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const L = tgLive.current, c = canvasRef.current;
      if (!L || !c) return;
      const { B } = size.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(B * dpr)) { c.width = Math.round(B * dpr); c.height = Math.round(B * dpr); }
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const seats = L.world.seats, kinds = L.world.kinds, v = L.view;
      const mine = seats.find((x) => x.id === myId);
      const viewPos = mine ? mine.pos : "bottom";
      const { F, S } = drawBoard(ctx, B, viewPos);
      const P = (x, y) => { const [a, b] = toView(viewPos, x, y); return [F + a * S, F + b * S]; };
      // where everything is: the shot being played back, or the board at rest
      let coins = v.c.map((p) => (p ? [p[0] / 1000, p[1] / 1000] : null));
      let striker = null, playing = false;
      const pl = play.current;
      if (pl) {
        const tFrames = ((performance.now() - pl.t0) / 1000) * pl.fps;
        const k = Math.floor(tFrames);
        if (k < pl.frames.length - 1) {
          playing = true;
          const a = pl.frames[k], b = pl.frames[k + 1], f = tFrames - k;
          const pos = a.map((p, i) => (p && b[i] ? [p[0] + (b[i][0] - p[0]) * f, p[1] + (b[i][1] - p[1]) * f] : null));
          coins = pos.slice(0, kinds.length);
          striker = { p: pos[kinds.length], seat: pl.seat };
        } else play.current = null;
      }
      // coins
      for (let i = 0; i < kinds.length; i++) { const p = coins[i]; if (p) { const [x, y] = P(p[0], p[1]); drawCoin(ctx, kinds[i], x, y, R_COIN * S); } }
      // the striker: flying, or waiting on the line of whoever's turn it is
      const t = ts / 1000;
      if (playing && striker.p) {
        const [x, y] = P(striker.p[0], striker.p[1]);
        drawStriker(ctx, x, y, R_STRIKER * S, SEAT_COLOURS[striker.seat % 4], false);
      } else if (!playing && (v.ph === "aim")) {
        const seat = seats[v.tn];
        const isMe = seat.id === myId && !isSpectator;
        const u = isMe ? me.current.u : v.aim ? v.aim[0] : 0.5;
        const [bx, by] = strikerAt(seat.pos, u);
        const [x, y] = P(bx, by);
        const aim = isMe ? me.current.aim : v.aim && v.aim[2] > 0 ? { ang: v.aim[1], pow: v.aim[2] } : null;
        const blocked = coins.some((p) => p && Math.hypot(p[0] - bx, p[1] - by) < R_COIN + R_STRIKER);
        // the turn clock: a ring that runs down round the striker
        ctx.strokeStyle = "rgba(46,33,64,.25)"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, R_STRIKER * S * 1.8, 0, TAU); ctx.stroke();
        ctx.strokeStyle = v.tl < 6 ? "#FF6B6B" : "#FFFFFF"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, R_STRIKER * S * 1.8, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, v.tl / TURN_S)); ctx.stroke();
        if (aim && aim.pow > 0.02 && !aim.back) {
          // where it will go: to the first thing it meets, and that coin's way on
          const dx = Math.cos(aim.ang), dy = Math.sin(aim.ang);
          const hit = rayHit(coins, bx, by, dx, dy);
          const ex = bx + dx * hit.t, ey = by + dy * hit.t;
          const [hx, hy] = P(ex, ey);
          ctx.setLineDash([6, 6]); ctx.strokeStyle = isMe ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.6)"; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(hx, hy, R_STRIKER * S, 0, TAU); ctx.stroke();
          if (hit.coin) {
            const nx = hit.coin[0] - ex, ny = hit.coin[1] - ey, nl = Math.hypot(nx, ny) || 1;
            const [c1x, c1y] = P(hit.coin[0], hit.coin[1]), [c2x, c2y] = P(hit.coin[0] + (nx / nl) * 0.15, hit.coin[1] + (ny / nl) * 0.15);
            ctx.strokeStyle = "rgba(255,197,61,.95)"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(c1x, c1y); ctx.lineTo(c2x, c2y); ctx.stroke();
          }
          // power: a bar beside the striker
          const [vx, vy] = dirToView(viewPos, dx, dy);
          ctx.fillStyle = `hsl(${120 - aim.pow * 120},80%,55%)`;
          ctx.beginPath(); ctx.arc(x - vx * R_STRIKER * S * (1.6 + aim.pow * 3), y - vy * R_STRIKER * S * (1.6 + aim.pow * 3), 5, 0, TAU); ctx.fill();
        }
        drawStriker(ctx, x, y, R_STRIKER * S, blocked ? "#FF6B6B" : SEAT_COLOURS[v.tn % 4], isMe && Math.sin(t * 5) > 0);
      }
      if (ts - lastHud > 200) { lastHud = ts; setHud({ left: secondsLeft(L), v }); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tgLive, myId, isSpectator]);

  const L = tg.live.current;
  const v = hud.v;
  const seats = L ? L.world.seats : [];
  const mySide = seats.find((x) => x.id === myId)?.side;
  const sideName = (side) => {
    const who = seats.filter((x) => x.side === side).map((x) => nameOf(x.id));
    return who.includes("You") ? (who.length > 1 ? "You & " + who.filter((w) => w !== "You").join("") : "You") : who.join(" & ");
  };
  const stats = v ? [
    { label: `⚪ ${sideName(0)}`, value: `${v.pts[0]}` },
    { label: `⚫ ${sideName(1)}`, value: `${v.pts[1]}` },
    { label: v.ph === "aim" || v.ph === "moving" ? "Turn" : "", value: v.ph === "aim" || v.ph === "moving" ? nameOf(seats[v.tn]?.id) : "—" },
  ] : [];
  const showLevel = !isSpectator && v && v.ph === "level" && seats[0]?.id === myId;
  const mineNow = v && v.ph === "aim" && seats[v.tn]?.id === myId && !isSpectator;
  const controls = !isSpectator ? (
    <div className="cr-controls">
      {mineNow ? (
        <label className="cr-slide">
          <span>Striker</span>
          <input type="range" min={U_MIN} max={U_MAX} step={0.002} value={me.current.u}
            onChange={(e) => { me.current.u = Number(e.target.value); sendAim(); force((n) => n + 1); }} aria-label="Move the striker along your line" />
        </label>
      ) : (
        <span className="cr-wait muted">{v && v.ph === "aim" ? `${nameOf(seats[v.tn]?.id)} ${seats[v.tn]?.id === "cpu" ? "is thinking…" : "is aiming…"}` : v && v.ph === "moving" ? "…" : ""}</span>
      )}
      <button className="press p-white cr-snd" onClick={() => setSound((x) => !x)} aria-pressed={sound} aria-label={sound ? "Sound off" : "Sound on"}>{sound ? "🔊" : "🔇"}</button>
    </div>
  ) : null;

  return (
    <>
      <GameFrame
        gameName="Carrom" badge={<><GameIcon slug="carrom" /> CARROM</>}
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: hud.left, max: durationSeconds }}
        message={msg}
        onQuit={onGameEnd}
        controls={controls}
      >
        {({ w, h }) => {
          const B = Math.max(240, Math.floor(Math.min(w, h - 26)));
          size.current = { B };
          return (
            <div className="cr-pad" style={{ width: w, height: h }} onContextMenu={(e) => e.preventDefault()}>
              {!tg.ready && <div className="muted">{tg.gone ? "This board is packed away." : "Setting up the board…"}</div>}
              <canvas ref={canvasRef} className="cr-canvas" style={{ width: B, height: B, display: tg.ready ? "block" : "none" }}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                role="img" aria-label="Carrom board. On your turn drag the striker along your line, then pull back from it and let go" />
              {tg.ready && <div className="cr-help muted">{mySide === undefined ? "" : `You play ${mySide === 0 ? "⚪ white" : "⚫ black"} · drag the striker, pull back to shoot`}</div>}
              {showLevel && (
                <div className="cr-level pop" role="dialog" aria-label="How good should the computer be?">
                  <h3>🤖 How good is the computer?</h3>
                  <div className="cr-levels">
                    {LEVELS.map((lvl) => (
                      <button key={lvl} className={`press cr-lvl lvl-${lvl}`} onClick={() => tg.send("level", { lvl })}>
                        <span className="cr-face">{LEVEL_TEXT[lvl][0]}</span><b>{LEVEL_TEXT[lvl][1]}</b><small>{LEVEL_TEXT[lvl][2]}</small>
                      </button>
                    ))}
                  </div>
                  <p className="muted">You play ⚪ white and break first.</p>
                </div>
              )}
            </div>
          );
        }}
      </GameFrame>
      {tg.over && !isSpectator && (
        <TogetherResults over={tg.over} me={currentUser} onExit={onGameEnd} icon="🎯"
          goalText={(s) => (s.sum?.won ? `You beat the computer on ${s.sum.level || "medium"}!` : `The computer (${s.sum?.level || "medium"}) took it this time.`)}
          describe={(s) => (s.sum?.won ? "🏆 cleared the board" : `${s.sum?.left ?? 0} coins still to go`) + (s.sum?.queen ? " · 👑" : "")} />
      )}
    </>
  );
}
