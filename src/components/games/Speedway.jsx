// src/components/games/Speedway.jsx
// Speedway: a top-down drift racer, in the style of "Turbo Drift" — dusk
// palette, asphalt with red/white curbs, grass run-off, a wall, tree
// clusters, boost pads, and cars that slide. Hold DRIFT through a bend to
// charge a boost (sparks white → blue → orange → purple), let go to fire it.
//
// Everyone in the room races the same track: its code comes from the room's
// seed (driftSim.js: trackCode). Laps follow the room's clock: 2 min → 3,
// 3–4 min → 5, 5 min → 8. A 3-2-1-GO countdown holds the cars, then it's on.
// Each phone drives its own car and tells the room where it is (race:pos,
// ~10 times a second): position, angle, speed, drift and boost — so a
// friend's car is drawn sliding, smoking and flaming just like yours, eased
// between reports. On your own, three computer cars race you.
//
// The room's clock and the scores decide the result (raceScore): the first
// across the line wins; if the clock runs out first, whoever got furthest.
//
// The rules are driftSim.js. This file draws, plays the sounds and reads keys
// (W/↑ go, S/↓ brake, A D/← → steer, Shift/Space drift) and thumbs (◀ ▶ on
// the left, BRK and DRIFT on the right; the pedal's down by itself).
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { useSocket } from "../../utils/SocketContext";
import {
  buildTrack, trackCode, lapsFor, makeCar, stepCar, carFx, trackUpdate, wallHit, bump, aiInput, checkStuck,
  raceScore, placeOf, padHit, chargeLevel, clamp, ad, HALF, CURB, WALL, START_S, KMH, COLORS,
} from "./driftSim.js";

const SEND_MS = 100;
const TAU = Math.PI * 2;
const DISPLAY = "Bungee, Impact, sans-serif";
const BODY = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
const BOTS = [{ name: "Rex", skill: 0.96 }, { name: "Mika", skill: 0.92 }, { name: "Bolt", skill: 0.88 }];
const ord = (n) => n + (n === 1 ? "ST" : n === 2 ? "ND" : n === 3 ? "RD" : "TH");
const fmt = (t) => { if (!t) return "--:--.--"; const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2); };

// ── sound: Web Audio only ────────────────────────────────────────────────────
function makeAudio() {
  let AC = null, eng, engG, skidG, master, nbuf, muted = false;
  const init = () => {
    if (AC) { if (AC.state === "suspended") AC.resume(); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(AC.destination);
      eng = AC.createOscillator(); eng.type = "sawtooth";
      const f = AC.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 420;
      engG = AC.createGain(); engG.gain.value = 0; eng.connect(f); f.connect(engG); engG.connect(master); eng.start();
      nbuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const d = nbuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const ns = AC.createBufferSource(); ns.buffer = nbuf; ns.loop = true;
      const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = 2.5;
      skidG = AC.createGain(); skidG.gain.value = 0; ns.connect(bp); bp.connect(skidG); skidG.connect(master); ns.start();
    } catch { AC = null; }
  };
  const beep = (fr, d, type, v) => {
    if (!AC) return;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || "sine"; o.frequency.value = fr;
    g.gain.setValueAtTime(v || 0.2, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + d);
    o.connect(g); g.connect(master); o.start(); o.stop(AC.currentTime + d);
  };
  const burst = (fr, d, v) => {
    if (!AC) return;
    const s = AC.createBufferSource(); s.buffer = nbuf;
    const bp = AC.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.setValueAtTime(fr, AC.currentTime); bp.frequency.exponentialRampToValueAtTime(fr * 3, AC.currentTime + d);
    const g = AC.createGain(); g.gain.setValueAtTime(v, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + d);
    s.connect(bp); bp.connect(g); g.connect(master); s.start(); s.stop(AC.currentTime + d);
  };
  const update = (car, on) => {
    if (!AC) return;
    const t = AC.currentTime, spd = Math.hypot(car.vx, car.vy);
    eng.frequency.setTargetAtTime(52 + spd * 0.2 + (car.boostT > 0 ? 30 : 0), t, 0.05);
    engG.gain.setTargetAtTime(on ? 0.05 + 0.04 * car.thr : 0, t, 0.06);
    skidG.gain.setTargetAtTime(on && car.drifting ? 0.1 : 0, t, 0.05);
  };
  const mute = (m) => { muted = m; if (master) master.gain.value = m ? 0 : 0.5; };
  const close = () => { try { if (AC) AC.close(); } catch { /* gone */ } AC = null; };
  return { init, beep, burst, update, mute, close };
}

// ── drawing ──────────────────────────────────────────────────────────────────
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function text(ctx, s, x, y, px, col, al, font, sh) {
  ctx.font = font.includes("px") ? font.replace(/\d+px/, `${px}px`) : `${px}px ${font}`;
  ctx.textAlign = al || "left"; ctx.textBaseline = "alphabetic";
  if (sh) { ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillText(s, x + px * 0.05, y + px * 0.06); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function makeGrass(ctx) {
  const t = document.createElement("canvas");
  t.width = t.height = 160;
  const g = t.getContext("2d");
  g.fillStyle = "#1f6b4f"; g.fillRect(0, 0, 160, 160);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.08)";
    g.fillRect(Math.random() * 160, Math.random() * 160, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  return ctx.createPattern(t, "repeat");
}

function drawTrack(ctx, T, G, clock, vx0, vy0, vx1, vy1) {
  ctx.fillStyle = G.grass || "#1f6b4f"; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  for (const t of T.trees) {
    if (t.x < vx0 - 60 || t.x > vx1 + 60 || t.y < vy0 - 60 || t.y > vy1 + 60) continue;
    const r = t.r * (1 + 0.03 * Math.sin(clock * 1.4 + t.ph));
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(t.x + 9, t.y + 11, r, r * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = t.k < 0.5 ? "#14503a" : "#1a5a3c"; ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = t.k < 0.5 ? "#1f7550" : "#2a8a52"; ctx.beginPath(); ctx.arc(t.x - r * 0.2, t.y - r * 0.25, r * 0.62, 0, TAU); ctx.fill();
  }
  ctx.lineJoin = "round"; ctx.lineCap = "butt";
  // the wall, the run-off, the curbs, the asphalt, the centre line
  ctx.setLineDash([]); ctx.strokeStyle = "#ece7dc"; ctx.lineWidth = 2 * (WALL + 9); ctx.stroke(G.path);
  ctx.setLineDash([34, 34]); ctx.strokeStyle = "#d9482b"; ctx.stroke(G.path); ctx.setLineDash([]);
  ctx.strokeStyle = "#2c7d5c"; ctx.lineWidth = 2 * WALL; ctx.stroke(G.path);
  ctx.strokeStyle = "#f4efe6"; ctx.lineWidth = 2 * (HALF + CURB); ctx.stroke(G.path);
  ctx.setLineDash([30, 30]); ctx.strokeStyle = "#e0452c"; ctx.stroke(G.path); ctx.setLineDash([]);
  ctx.strokeStyle = "#2b313a"; ctx.lineWidth = 2 * HALF; ctx.stroke(G.path);
  ctx.setLineDash([34, 38]); ctx.strokeStyle = "rgba(244,239,230,.45)"; ctx.lineWidth = 4; ctx.stroke(G.path); ctx.setLineDash([]);
  // skid marks, kept on the road
  const sk = G.skids;
  ctx.strokeStyle = "rgba(8,10,14,.38)"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.beginPath();
  for (let i = 0; i < sk.length; i += 8) {
    const x = sk[i]; if (x < vx0 - 10 || x > vx1 + 10) continue;
    const y = sk[i + 1]; if (y < vy0 - 10 || y > vy1 + 10) continue;
    ctx.moveTo(sk[i], sk[i + 1]); ctx.lineTo(sk[i + 2], sk[i + 3]); ctx.moveTo(sk[i + 4], sk[i + 5]); ctx.lineTo(sk[i + 6], sk[i + 7]);
  }
  ctx.stroke(); ctx.lineCap = "butt";
  // boost pads
  for (const p of T.pads) {
    if (p.x < vx0 - 80 || p.x > vx1 + 80 || p.y < vy0 - 80 || p.y > vy1 + 80) continue;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(T.ANG[p.idx]);
    ctx.fillStyle = "rgba(255,200,61,.16)"; rr(ctx, -40, -32, 80, 64, 8); ctx.fill();
    ctx.strokeStyle = "#ffc83d"; ctx.lineWidth = 2; ctx.stroke();
    const off = (clock * 70) % 24;
    ctx.lineWidth = 7; ctx.lineJoin = "miter";
    for (let k = -1; k < 3; k++) {
      const x = -30 + k * 24 + off;
      ctx.globalAlpha = clamp(1 - Math.abs(x) / 46, 0.1, 1);
      ctx.beginPath(); ctx.moveTo(x, -18); ctx.lineTo(x + 14, 0); ctx.lineTo(x, 18); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore(); ctx.lineJoin = "round";
  }
  // the checkered start / finish
  ctx.save(); ctx.translate(T.P[0].x, T.P[0].y); ctx.rotate(T.ANG[0]);
  const cw = 22, n = Math.ceil((2 * HALF) / cw);
  for (let r = 0; r < 2; r++) for (let k = 0; k < n; k++) { ctx.fillStyle = (r + k) % 2 ? "#10151b" : "#f4efe6"; ctx.fillRect(-8 + (r * cw) / 1.1, -HALF + k * cw, cw / 1.1, cw); }
  ctx.restore();
}

function drawGantry(ctx, T) {
  ctx.save(); ctx.translate(T.P[0].x, T.P[0].y); ctx.rotate(T.ANG[0]);
  const hw = HALF + CURB + 8;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(-4, -hw + 10, 16, 2 * hw);
  ctx.fillStyle = "#8a94a3"; ctx.fillRect(-10, -hw - 6, 14, 12); ctx.fillRect(-10, hw - 6, 14, 12);
  ctx.fillStyle = "#e0452c"; ctx.fillRect(-9, -hw, 10, 2 * hw);
  for (let k = 0; k < 2 * hw; k += 24) { ctx.fillStyle = "#f4efe6"; ctx.fillRect(-9, -hw + k, 10, 12); }
  ctx.restore();
}

function drawCar(ctx, c) {
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
  if (c.boostT > 0) {
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
    g.addColorStop(0, c.boostMax > 1.5 ? "rgba(212,107,255,.55)" : "rgba(255,177,46,.5)"); g.addColorStop(1, "rgba(255,177,46,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,.3)"; rr(ctx, -15, -5, 38, 20, 7); ctx.fill();
  const hg = ctx.createLinearGradient(18, 0, 90, 0);
  hg.addColorStop(0, "rgba(255,240,190,.28)"); hg.addColorStop(1, "rgba(255,240,190,0)");
  ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(18, -5); ctx.lineTo(92, -22); ctx.lineTo(92, 22); ctx.lineTo(18, 5); ctx.fill();
  ctx.fillStyle = "#0c0f14";
  rr(ctx, -18, -13, 10, 5, 2); ctx.fill(); rr(ctx, -18, 8, 10, 5, 2); ctx.fill();
  for (const s of [-1, 1]) { ctx.save(); ctx.translate(11, s * 10.5); ctx.rotate(c.steer * 0.45); rr(ctx, -5, -2.5, 10, 5, 2); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = c.color; rr(ctx, -19, -9.5, 38, 19, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(-18, -1.5, 36, 3);
  ctx.fillStyle = "rgba(0,0,0,.28)"; rr(ctx, -22, -9, 5, 18, 2); ctx.fill();
  const ro = c.roll * 2.6;
  ctx.fillStyle = "#1a2230"; rr(ctx, -7, -6.5 + ro, 15, 13, 4); ctx.fill();
  ctx.fillStyle = "rgba(180,220,255,.35)"; rr(ctx, 2, -5.5 + ro, 5, 11, 2); ctx.fill();
  ctx.fillStyle = "#fff3c4"; ctx.fillRect(17, -8, 3, 4); ctx.fillRect(17, 4, 3, 4);
  ctx.fillStyle = c.braking ? "#ff2b2b" : "#8a1e1e"; ctx.fillRect(-19, -8, 3, 4); ctx.fillRect(-19, 4, 3, 4);
  if (c.braking) { ctx.fillStyle = "rgba(255,40,40,.35)"; ctx.beginPath(); ctx.arc(-21, 0, 10, 0, TAU); ctx.fill(); }
  ctx.restore();
}

function drawParts(ctx, parts) {
  for (const p of parts) {
    const k = p.life / p.max;
    if (p.type === "smoke" || p.type === "dust") { ctx.globalAlpha = k * (p.type === "smoke" ? 0.32 : 0.4); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2.2 - k), 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "lighter";
  for (const p of parts) {
    const k = p.life / p.max;
    if (p.type === "spark") { ctx.globalAlpha = k; ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); ctx.stroke(); }
    else if (p.type === "flame") { ctx.globalAlpha = k * 0.9; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k, 0, TAU); ctx.fill(); }
  }
  ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
}

// The HUD, on the canvas: place (top left), lap and times (top right), speed
// and the drift / boost bar (bottom centre), the map (bottom right), and the
// moments — countdown, lap banners, FINISHED.
function drawHud(ctx, w, h, S) {
  const { car, cars, T, laps, raceT, place, placePop, clock, banner, count, best } = S;
  const s = clamp(Math.min(w, h) / 640, 0.7, 1.25), pad = 14 * s;
  // place, popping when it changes
  const pop = 1 + 0.45 * placePop;
  ctx.save(); ctx.translate(pad, pad + 46 * s); ctx.scale(pop, pop);
  text(ctx, String(place), 0, 0, 56 * s, "#ffc83d", "left", DISPLAY, true);
  const rw = ctx.measureText(String(place)).width;
  text(ctx, ord(place).slice(String(place).length), rw + 4, 0, 22 * s, "#fff", "left", DISPLAY, true);
  ctx.restore();
  text(ctx, "/ " + cars.length, pad, pad + 70 * s, 20 * s, "rgba(255,255,255,.7)", "left", `700 20px ${BODY}`, true);
  text(ctx, "LAP " + clamp(car.lap, 1, laps) + "/" + laps, w - pad, pad + 34 * s, 26 * s, "#fff", "right", DISPLAY, true);
  text(ctx, fmt(raceT > 0 && !car.finished ? raceT - car.lapStart : 0), w - pad, pad + 64 * s, 24 * s, "#fff", "right", `700 24px ${BODY}`, true);
  text(ctx, "BEST " + fmt(best), w - pad, pad + 90 * s, 19 * s, "rgba(255,255,255,.7)", "right", `700 19px ${BODY}`, true);
  // speed and the charge / boost bar
  const spd = Math.round(Math.hypot(car.vx, car.vy) * KMH), bw = 170 * s, bx = w / 2 - bw / 2, by = h - pad - 18 * s;
  text(ctx, String(spd), w / 2, by - 30 * s, 36 * s, "#fff", "center", DISPLAY, true);
  text(ctx, "KM/H", w / 2, by - 2 * s, 15 * s, "rgba(255,255,255,.7)", "center", `700 15px ${BODY}`, false);
  ctx.fillStyle = "rgba(8,10,16,.6)"; ctx.fillRect(bx, by + 4 * s, bw, 10 * s);
  const col = ["#fff", "#37c8e6", "#ff9a2e", "#d46bff"][chargeLevel(car.charge)];
  if (car.boostT > 0) { ctx.fillStyle = "#ffc83d"; ctx.fillRect(bx, by + 4 * s, (bw * car.boostT) / car.boostMax, 10 * s); }
  else { ctx.fillStyle = col; ctx.fillRect(bx, by + 4 * s, bw * clamp(car.charge / 3.2, 0, 1), 10 * s); }
  ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1; ctx.strokeRect(bx, by + 4 * s, bw, 10 * s);
  // the map
  const mm = Math.min(150 * s, w * 0.3), bb = T.bb, k = Math.min((mm - 16) / (bb.x1 - bb.x0), (mm - 16) / (bb.y1 - bb.y0));
  const mw = (bb.x1 - bb.x0) * k + 16, mh = (bb.y1 - bb.y0) * k + 16, mx = w - pad - mw, my = h - pad - mh;
  ctx.fillStyle = "rgba(8,10,16,.6)"; ctx.fillRect(mx, my, mw, mh);
  ctx.save(); ctx.translate(mx + 8, my + 8); ctx.scale(k, k); ctx.translate(-bb.x0, -bb.y0);
  ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 7 / k; ctx.stroke(S.path);
  ctx.fillStyle = "#fff"; ctx.fillRect(T.P[0].x - 3 / k, T.P[0].y - 8 / k, 6 / k, 16 / k);
  for (const o of cars) {
    ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(o.x, o.y, (o === car ? 6 : 4) / k, 0, TAU); ctx.fill();
    if (o === car) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 / k; ctx.stroke(); }
  }
  ctx.restore();
  // moments
  if (car.wrong > 0.8 && raceT > 0 && !car.finished && Math.floor(clock * 3) % 2 === 0) text(ctx, "WRONG WAY", w / 2, h * 0.3, 38 * s, "#ff5d3b", "center", DISPLAY, true);
  if (car.boostT > 0.01) text(ctx, "BOOST", w / 2, h * 0.22, 24 * s, "#ffc83d", "center", DISPLAY, true);
  if (banner && banner.t < 2.2) {
    const a = clamp(banner.t * 4, 0, 1) * clamp((2.2 - banner.t) * 3, 0, 1), sc = 1 + 0.25 * Math.pow(1 - clamp(banner.t * 4, 0, 1), 2);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(w / 2, h * 0.36); ctx.scale(sc, sc);
    ctx.fillStyle = "rgba(8,10,16,.55)"; ctx.fillRect(-w / 2, -40 * s, w, 70 * s);
    text(ctx, banner.title, 0, -6 * s, 30 * s, banner.best ? "#ffc83d" : "#fff", "center", DISPLAY, true);
    text(ctx, banner.sub, 0, 22 * s, 22 * s, banner.best ? "#ffc83d" : "rgba(255,255,255,.85)", "center", `700 22px ${BODY}`, true);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  if (car.finished) {
    const a = clamp(S.finT * 3, 0, 1);
    ctx.globalAlpha = a; ctx.fillStyle = "rgba(8,10,16,.5)"; ctx.fillRect(0, h * 0.34, w, h * 0.2);
    text(ctx, "FINISHED", w / 2, h * 0.43, 32 * s, "#fff", "center", DISPLAY, true);
    text(ctx, ord(S.finPlace), w / 2, h * 0.5, 38 * s, "#ffc83d", "center", DISPLAY, true);
    ctx.globalAlpha = 1;
  }
  // the countdown: three lights, then GO
  if (count !== null) {
    const cx = w / 2, cy = h * 0.2, t = count;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = "#10151b"; ctx.beginPath(); ctx.arc(cx + (i - 1) * 52 * s, cy, 20 * s, 0, TAU); ctx.fill();
      const on = t >= 3 ? true : i <= Math.floor(t);
      ctx.fillStyle = t >= 3 ? "#3be08a" : on ? "#ff3b30" : "#3a1512"; ctx.beginPath(); ctx.arc(cx + (i - 1) * 52 * s, cy, 16 * s, 0, TAU); ctx.fill();
      if (on) { ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = t >= 3 ? "rgba(59,224,138,.35)" : "rgba(255,59,48,.35)"; ctx.beginPath(); ctx.arc(cx + (i - 1) * 52 * s, cy, 30 * s, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = "source-over"; }
    }
    const n = 3 - Math.floor(Math.min(t, 2.999)), fr = t % 1;
    const label = t >= 3 ? "GO!" : String(n), sc = 1 + 0.7 * Math.pow(1 - Math.min(1, fr * 3), 2);
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(sc, sc); ctx.globalAlpha = t >= 3 ? clamp(1 - (t - 3) * 1.2, 0, 1) : 1;
    text(ctx, label, 0, 50 * s, 130 * s, t >= 3 ? "#3be08a" : "#ffc83d", "center", DISPLAY, true);
    ctx.restore(); ctx.globalAlpha = 1;
  }
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function Speedway(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;
  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;
  const { socket } = useSocket() || {};
  const code = trackCode(seed);
  const T = useMemo(() => buildTrack(code), [code]);
  const laps = lapsFor(durationSeconds);

  // grid slots by join order (user id), the same on every phone
  const seated = useMemo(() => (players || []).filter((p) => !p.is_spectator)
    .map((p) => ({ id: Number(p.user_id), name: p.username })).sort((a, b) => a.id - b.id), [players]);
  const myId = Number(currentUser?.id);
  const mySlot = Math.max(0, seated.findIndex((p) => p.id === myId));
  const solo = seated.length <= 1;

  const me = useRef(null);
  if (me.current === null) me.current = makeCar(T, mySlot, { name: currentUser?.username || "You", color: COLORS[mySlot % COLORS.length], human: true });
  const bots = useRef(null);
  if (bots.current === null) {
    bots.current = solo ? BOTS.map((b, i) => makeCar(T, i + 1, { ...b, ai: true, color: COLORS[(i + 2) % COLORS.length], lane: (i - 1) * 25, ph: i * 2.1 })) : [];
  }
  const remote = useRef(new Map());                   // user id -> drawn car, eased toward its last report
  const keys = useRef({});
  const touch = useRef({ on: false, l: 0, r: 0, b: 0, d: 0 });
  const [touchUi, setTouchUi] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer:coarse)").matches);
  const [muted, setMuted] = useState(false);
  const audio = useRef(null);
  if (audio.current === null) audio.current = makeAudio();
  useEffect(() => { const a = audio.current; return () => a.close(); }, []);
  const canvasRef = useRef(null);
  const size = useRef({ w: 300, h: 400 });
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);
  // the match clock, to the frame: anchored like the engine's, never counted
  const anchor = useRef(null);
  if (anchor.current === null) {
    let gone = 0;
    if (startedAt && serverNow) { const g = (new Date(serverNow).getTime() - new Date(startedAt).getTime()) / 1000; if (Number.isFinite(g)) gone = clamp(g, 0, durationSeconds); }
    anchor.current = performance.now() - gone * 1000;
  }
  const [hud, setHud] = useState({ place: 1, of: 1, lap: 1, finished: false, finPlace: 0 });

  // everyone else's cars, from the room
  useEffect(() => {
    if (!socket) return undefined;
    const onPos = (m) => {
      const id = Number(m.user_id);
      if (id === myId || m.px === undefined) return;
      const slot = seated.findIndex((p) => p.id === id);
      let r = remote.current.get(id);
      if (!r) {
        r = makeCar(T, Math.max(0, slot), { name: seated[slot]?.name || "", color: COLORS[Math.max(0, slot) % COLORS.length] });
        r.x = m.px; r.y = m.py; r.a = m.a;
        remote.current.set(id, r);
      }
      Object.assign(r, { tx: m.px, ty: m.py, ta: m.a, vx: m.vx, vy: m.vy, said: m.p, drifting: !!m.dr, slide: !!m.sl,
        charge: [0, 1, 2, 3.2][m.lv | 0] || 0, boostT: m.b || 0, boostMax: m.bm || 1, steer: m.st || 0, braking: !!m.br,
        finAt: m.f === null || m.f === undefined ? null : m.f, at: performance.now() });
      r.finished = r.finAt !== null;
    };
    socket.on("race:pos", onPos);
    return () => socket.off("race:pos", onPos);
  }, [socket, myId, seated, T]);

  // keys
  useEffect(() => {
    if (isSpectator) return undefined;
    const GAME = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];
    const dn = (e) => {
      if (GAME.includes(e.code)) e.preventDefault();
      keys.current[e.code] = 1;
      audio.current.init();
      if (e.code === "KeyM" && !e.repeat) setMuted((m) => !m);
    };
    const up = (e) => { keys.current[e.code] = 0; };
    const blur = () => { keys.current = {}; };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [isSpectator]);
  useEffect(() => { audio.current.mute(muted); }, [muted]);

  const readInput = () => {
    const k = keys.current, any = (...c) => c.some((x) => k[x]);
    let thr = any("KeyW", "ArrowUp") ? 1 : 0, brk = any("KeyS", "ArrowDown") ? 1 : 0;
    let str = (any("KeyD", "ArrowRight") ? 1 : 0) - (any("KeyA", "ArrowLeft") ? 1 : 0);
    let dr = any("ShiftLeft", "ShiftRight", "Space") ? 1 : 0;
    const t = touch.current;
    if (t.on) { thr = 1; str += (t.r ? 1 : 0) - (t.l ? 1 : 0); if (t.d) dr = 1; if (t.b) { thr = 0; brk = 1; } }
    return { thr, brk, str: clamp(str, -1, 1), dr };
  };

  // ── the loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isSpectator) return undefined;
    const A = audio.current;
    const G = { path: null, grass: null, skids: [] };
    const path = new Path2D();
    T.P.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    path.closePath();
    G.path = path;
    const parts = [];
    const fx = (type, x, y, a, b, c, d, e, f) => {
      if (type === "skid") { G.skids.push(x, y, a, b, c, d, e, f); if (G.skids.length > 9000) G.skids.splice(0, 800); return; }
      if (parts.length > 700) return;
      parts.push({ type, x, y, vx: a, vy: b, life: c, max: c, size: d, color: e });
    };
    const view = { cx: me.current.x, cy: me.current.y, z: 0.8, shake: 0 };
    const conf = [];
    let raf, last = performance.now(), pushed = 0, sent = 0, lastHud = 0, clock = 0, prevPlace = 0, placePop = 0;
    let banner = null, beeped = -1, finT = 0, finPlace = 0;
    const best0 = (() => { try { return Number(localStorage.getItem("sw-best-" + code)) || 0; } catch { return 0; } })();
    let best = best0;
    const shakeBy = (a) => { view.shake = Math.max(view.shake, a); };

    const frame = (now) => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      clock += dt;
      const elapsed = (now - anchor.current) / 1000;
      const go = elapsed >= START_S, raceT = elapsed - START_S;
      const car = me.current;
      // countdown beeps
      if (!go) { const n = Math.floor(elapsed); if (n !== beeped && n >= 0) { beeped = n; A.beep(440, 0.18, "square", 0.12); } }
      else if (beeped < 3) { beeped = 3; A.beep(880, 0.45, "square", 0.14); }

      // friends: eased toward where they said they were, carried on at their speed
      const others = [];
      for (const r of remote.current.values()) {
        const age = Math.min(0.3, (now - r.at) / 1000);
        const tx = r.tx + r.vx * age, ty = r.ty + r.vy * age, k = Math.min(1, dt * 12);
        r.x += (tx - r.x) * k; r.y += (ty - r.y) * k; r.a += ad(r.ta, r.a) * k;
        r.boostT = Math.max(0, r.boostT - dt);
        trackUpdate(T, r);
        r.prog = r.said ?? r.prog;                   // how far round: their phone counts their laps
        carFx(r, dt, fx);
        others.push(r);
      }
      // the computer
      if (go) for (const b of bots.current) {
        if (b.finAt === null) stepCar(T, b, aiInput(T, b, car.prog, clock), dt, fx);
        else stepCar(T, b, { thr: 0, brk: 1, str: 0, dr: 0 }, dt, fx);
      }
      for (const b of bots.current) others.push(b);

      if (!overRef.current) {
        // you: locked until GO, coasting to a stop after the flag
        const inp = !go ? { thr: 0, brk: 0, str: 0, dr: 0 } : car.finished ? { thr: 0, brk: 1, str: 0, dr: 0 } : readInput();
        if (go) {
          const out = stepCar(T, car, inp, dt, fx);
          if (out.boosted) { A.burst(600, 0.5, 0.25); A.beep(520, 0.25, "triangle", 0.12); }
        }
        // bumps: the computer's cars move both ways; a friend's car only moves on their phone
        const cars = [car, ...bots.current];
        for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
          const hit = bump(cars[i], cars[j]);
          if (hit > 80 && (i === 0)) { shakeBy(clamp(hit / 50, 2, 8)); A.burst(260, 0.15, 0.25); for (let q = 0; q < 7; q++) fx("spark", (cars[i].x + cars[j].x) / 2, (cars[i].y + cars[j].y) / 2, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, 0.35, 2, "#fff"); }
        }
        for (const r of remote.current.values()) {
          const hit = bump(car, r, false, true);
          if (hit > 80) { shakeBy(clamp(hit / 50, 2, 8)); A.burst(260, 0.15, 0.25); for (let q = 0; q < 7; q++) fx("spark", (car.x + r.x) / 2, (car.y + r.y) / 2, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, 0.35, 2, "#fff"); }
        }
        for (const c of cars) {
          const lapped = trackUpdate(T, c);
          const wh = wallHit(T, c);
          if (wh > 60) {
            const s = Math.sign(c.off) || 1, nx = T.Rx[c.idx] * s, ny = T.Ry[c.idx] * s;
            for (let q = 0; q < 8; q++) fx("spark", c.x + nx * 14, c.y + ny * 14, -nx * 80 + (Math.random() - 0.5) * 220, -ny * 80 + (Math.random() - 0.5) * 220, 0.4, 2, "#ffd27a");
            if (c === car) { shakeBy(clamp(wh / 40, 2, 10)); A.burst(180, 0.2, 0.3); }
          }
          if (go && padHit(T, c) && c === car) { A.burst(500, 0.4, 0.25); shakeBy(3); }
          if (go && !c.finished) checkStuck(T, c, dt);
          const dot = c.vx * Math.cos(T.ANG[c.idx]) + c.vy * Math.sin(T.ANG[c.idx]);
          c.wrong = dot < -40 ? c.wrong + dt : 0;
          if (lapped && go) {
            if (c.lap >= 2) {
              const t = raceT - c.lapStart;
              c.last = t;
              if (!c.best || t < c.best) c.best = t;
              if (c === car && !(c.lap > laps)) {
                const newBest = !best || t < best;
                if (newBest) { best = t; try { localStorage.setItem("sw-best-" + code, String(t)); } catch { /* private */ } }
                banner = { t: 0, title: c.lap === laps ? "FINAL LAP" : `LAP ${c.lap}`, sub: `${fmt(t)}${newBest ? "  ★ NEW BEST" : ""}`, best: newBest };
                A.beep(newBest ? 760 : 620, 0.25, "triangle", 0.14);
              }
            }
            c.lapStart = raceT;
            if (c.lap > laps && !c.finished) {
              c.finished = true;
              c.finAt = elapsed;
              if (c === car) {
                if (!best || c.last < best) { best = c.last; try { localStorage.setItem("sw-best-" + code, String(c.last)); } catch { /* private */ } }
                finT = 0;
                finPlace = placeOf(car, [car, ...others]);
                A.beep(660, 0.4, "triangle", 0.18);
                for (let i = 0; i < 80; i++) conf.push({ x: Math.random(), y: -Math.random() * 0.3, vx: (Math.random() - 0.5) * 0.2, vy: 0.25 + Math.random() * 0.4, col: COLORS[i % 5] });
              }
            }
          }
        }
        const target = raceScore(car, laps, durationSeconds);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
        if (socket && roomCode && now - sent > SEND_MS) {
          sent = now;
          const r1 = (v) => Math.round(v * 10) / 10;
          socket.emit("race:pos", { code: roomCode, px: r1(car.x), py: r1(car.y), a: Math.round(car.a * 1000) / 1000, vx: r1(car.vx), vy: r1(car.vy),
            p: car.prog, dr: car.drifting ? 1 : 0, sl: car.slide ? 1 : 0, lv: chargeLevel(car.charge), b: r1(car.boostT), bm: car.boostMax,
            st: Math.round(car.steer * 100) / 100, br: car.braking ? 1 : 0, f: car.finAt });
        }
      }
      // particles
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.type === "smoke" || p.type === "dust") { p.vx *= 0.96; p.vy *= 0.96; }
      }
      for (let i = conf.length - 1; i >= 0; i--) { const p = conf[i]; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > 1.1) conf.splice(i, 1); }
      // the camera: ahead of the car, pulled back a touch at speed
      const spd = Math.hypot(car.vx, car.vy);
      const k = Math.min(1, dt * 6);
      view.cx += (car.x + car.vx * 0.32 - view.cx) * k; view.cy += (car.y + car.vy * 0.32 - view.cy) * k;
      const tz = 1 - 0.15 * Math.min(1, spd / 650) - (car.boostT > 0 ? 0.07 : 0);
      view.z += (tz - view.z) * Math.min(1, dt * 3);
      view.shake *= Math.pow(0.02, dt);
      const all = [car, ...others];
      const place = car.finished ? finPlace : placeOf(car, all);
      if (prevPlace && place !== prevPlace) placePop = 1;
      prevPlace = place;
      placePop = Math.max(0, placePop - dt * 3);
      if (banner) banner.t += dt;
      if (car.finished) finT += dt;
      A.update(car, go && !overRef.current);

      // draw
      const c = canvasRef.current;
      if (c) {
        const { w, h } = size.current, dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const ctx = c.getContext("2d");
        if (!G.grass) G.grass = makeGrass(ctx);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#10151b"; ctx.fillRect(0, 0, w, h);
        const base = clamp(Math.min(w, h) / 760, 0.5, 1.3), z = base * view.z, sh = view.shake;
        const ox = sh ? (Math.random() - 0.5) * sh * 2 : 0, oy = sh ? (Math.random() - 0.5) * sh * 2 : 0;
        ctx.save();
        ctx.translate(w / 2 + ox, h / 2 + oy); ctx.scale(z, z); ctx.translate(-view.cx, -view.cy);
        const hw = w / 2 / z + 80, hh = h / 2 / z + 80;
        drawTrack(ctx, T, G, clock, view.cx - hw, view.cy - hh, view.cx + hw, view.cy + hh);
        for (const o of all.slice().sort((p, q) => p.y - q.y)) drawCar(ctx, o);
        drawGantry(ctx, T);
        drawParts(ctx, parts);
        for (const o of all) {
          ctx.save(); ctx.translate(o.x, o.y - 34); ctx.scale(1 / z, 1 / z);
          text(ctx, o.name, 0, 0, 15, o === car ? "#fff" : "rgba(255,255,255,.75)", "center", `700 15px ${BODY}`, true);
          ctx.restore();
        }
        ctx.restore();
        // boost speed lines, the vignette, the HUD, confetti
        if (car.boostT > 0) {
          ctx.strokeStyle = "rgba(255,230,160,.35)"; ctx.lineWidth = 2; ctx.beginPath();
          const cx = w / 2, cy = h / 2;
          for (let i = 0; i < 26; i++) {
            const a = (i / 26) * TAU + clock * 0.3, r0 = Math.min(w, h) * (0.3 + ((i * 37 + clock * 900) % 100) / 250), r1 = r0 + Math.min(w, h) * 0.18;
            ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          }
          ctx.stroke();
        }
        const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
        vg.addColorStop(0, "rgba(8,10,16,0)"); vg.addColorStop(1, "rgba(8,10,16,.45)");
        ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
        const count = elapsed < START_S + 1 ? clamp(elapsed, 0, 4) : null;
        drawHud(ctx, w, h, { car, cars: all, T, laps, raceT, place, placePop, clock, banner, count, best, path, finT, finPlace });
        for (const p of conf) { ctx.fillStyle = p.col; ctx.fillRect(p.x * w, p.y * h, 7, 4); }
      }
      if (now - lastHud > 250) {
        lastHud = now;
        setHud((hh) => (hh.place === place && hh.of === all.length && hh.lap === car.lap && hh.finished === car.finished ? hh
          : { place, of: all.length, lap: car.lap, finished: car.finished, finPlace }));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, addScore, socket, roomCode, T, code, laps, durationSeconds]);

  // thumbs
  const hold = (k, label, aria, cls = "") => (
    <button className={`sw-tbtn${cls}`} aria-label={aria} data-k={k}
      onPointerDown={(e) => { e.preventDefault(); audio.current.init(); touch.current.on = true; touch.current[k] = 1; e.currentTarget.classList.add("on"); }}
      onPointerUp={(e) => { touch.current[k] = 0; e.currentTarget.classList.remove("on"); }}
      onPointerCancel={(e) => { touch.current[k] = 0; e.currentTarget.classList.remove("on"); }}
      onPointerLeave={(e) => { touch.current[k] = 0; e.currentTarget.classList.remove("on"); }}
      onContextMenu={(e) => e.preventDefault()}>{label}</button>
  );
  const controls = !isSpectator ? (touchUi ? (
    <div className="sw-touch">
      <div className="sw-grp">{hold("l", "◀", "Steer left")}{hold("r", "▶", "Steer right")}</div>
      <div className="sw-grp">{hold("b", "BRK", "Brake", " sm")}{hold("d", "DRIFT", "Drift", " sm")}</div>
    </div>
  ) : (
    <div className="sw-keys">
      <span><b>W / ↑</b> go</span><span><b>S / ↓</b> brake</span><span><b>A D / ← →</b> steer</span><span><b>Shift / Space</b> drift — let go to boost</span>
    </div>
  )) : null;

  return (
    <>
      <GameFrame
        gameName="Speedway" badge="🏁 SPEEDWAY"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={isSpectator ? [{ label: "Score", value: Number(spectatorWatching?.score ?? 0).toLocaleString() }]
          : []}                                       // place, lap and times are on the track itself
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={Object.values(eng.opponents)}
        teams={eng.teams}
        onQuit={eng.endMatch}
        controls={controls}
      >
        {({ w, h }) => {
          if (isSpectator) {
            return <div className="muted">👀 Watching {spectatorWatching?.username} — {Number(spectatorWatching?.score ?? 0).toLocaleString()} pts</div>;
          }
          size.current = { w, h };
          return (
            <div className="sw-pad" style={{ width: w, height: h }}
              onPointerDown={(e) => { audio.current.init(); if (e.pointerType === "touch" && !touchUi) { touch.current.on = true; setTouchUi(true); } }}
              onContextMenu={(e) => e.preventDefault()}>
              <canvas ref={canvasRef} className="sw-canvas" style={{ width: w, height: h }}
                role="img" aria-label={`Speedway: ${laps} laps, drift to charge a boost`} />
              <div className="sw-top">
                <button type="button" className="sw-mute" aria-label={muted ? "Sound on" : "Sound off"} aria-pressed={muted}
                  onClick={() => { audio.current.init(); setMuted((m) => !m); }}>{muted ? "✕" : "♪"}</button>
              </div>
            </div>
          );
        }}
      </GameFrame>
      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={hud.finished ? `Finished ${ord(hud.finPlace).toLowerCase()}` : `Lap ${clamp(hud.lap, 1, laps)} of ${laps} · ${ord(hud.place).toLowerCase()} place`} />
      )}
    </>
  );
}
