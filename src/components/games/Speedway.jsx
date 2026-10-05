// src/components/games/Speedway.jsx
// Speedway: a three-lap race on a road of bends and hills, seen from behind
// your car — with everyone in the room on the same road at the same time.
// You see their cars ahead of you (and pass them), with their names over
// them; on your own, three computer cars race you. The pedal is always down:
// steer by tilting the phone like a wheel, by holding either side of the
// road, with the buttons, or the arrow keys. Turbo comes from the glowing
// booster pads on the road — drive over one in its lane and your tank fills;
// hold Turbo (or up / space) for a burst past top speed. Pads never go, so
// everyone can take them. A map in the corner shows where every car is.
// Stay on the tarmac — the grass is slow, and turbo won't work there — and
// don't drive into the back of anyone. A landscape game (GameFrame).
//
// Each phone drives its own car and tells the room where it is (race:pos,
// ~10 times a second); everyone else's car is drawn from that, carried
// forward at its speed between reports. The room's clock and the scores
// decide the result: the first across the line after three laps wins; if
// the clock runs out first, whoever got furthest.
//
// The rules are speedwaySim.js. The road is drawn the way the old arcade
// racers did it: one strip per road segment, projected from far to near.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { useSocket } from "../../utils/SocketContext";
import { useUprightTouch, toGame, gameRect } from "../horror/LandscapeGate";
import {
  buildTrack, newCar, drive, newBots, driveBot, segAt, lapOf, kmh, raceScore, placeOf,
  SEG, ROAD_W, LAPS, MAX_SPEED, START_S, PAD_W,
} from "./speedwaySim.js";

const DRAW = 180;                                     // segments drawn ahead
const CAM_H = 1000, CAM_DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180);
const PLAYER_Z = CAM_H * CAM_DEPTH;
const CAR_W = 520;                                    // a car's width, road units
const SEND_MS = 100;
const COLOURS = ["#ff5a5f", "#4cc9f0", "#8fe36b", "#ffc53d", "#c77dff", "#ff9f43", "#2de2c8", "#ff7bd5"];
const PLACE = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th"];
const TAU = Math.PI * 2;

// ── drawing ──────────────────────────────────────────────────────────────────
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// A car from behind: shaded body with a highlight, a spoiler, a rear window,
// tail lights, tyres that turn, and the exhaust — flames on turbo. w: its
// width; spin: how far the wheels have turned.
function drawCar(ctx, x, y, w, color, tilt = 0, opt = {}) {
  const h = w * 0.55;
  const { spin = 0, boosting = false, braking = false, t = 0 } = opt;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = "rgba(0,0,0,.32)";                  // shadow
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.56, h * 0.13, 0, 0, TAU);
  ctx.fill();
  // exhaust: flames on turbo, a puff otherwise
  if (boosting) {
    for (const side of [-1, 1]) {
      const fl = h * (0.35 + 0.25 * Math.abs(Math.sin(t * 40 + side)));
      const g = ctx.createLinearGradient(0, -h * 0.22, 0, -h * 0.22 + fl);
      g.addColorStop(0, "rgba(120,200,255,.95)");
      g.addColorStop(0.4, "rgba(255,190,60,.9)");
      g.addColorStop(1, "rgba(255,80,40,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(side * w * 0.22, -h * 0.22 + fl / 2, w * 0.06, fl / 2, 0, 0, TAU);
      ctx.fill();
    }
  }
  // tyres, with tread lines that turn
  for (const side of [-1, 1]) {
    const tx = side * w * 0.42 - w * 0.08, ty = -h * 0.34, tw = w * 0.16, th = h * 0.34;
    ctx.fillStyle = "#16161b";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(tx, ty, tw, th, w * 0.03) : ctx.rect(tx, ty, tw, th);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)";
    for (let k = 0; k < 3; k++) {
      const yy = ty + (((spin * 7 + k / 3) % 1) * th);
      ctx.fillRect(tx + tw * 0.15, yy, tw * 0.7, Math.max(1, th * 0.08));
    }
  }
  // body, shaded top to bottom, with an ink outline
  const body = ctx.createLinearGradient(0, -h, 0, -h * 0.15);
  body.addColorStop(0, shade(color, 1.18));
  body.addColorStop(0.55, color);
  body.addColorStop(1, shade(color, 0.72));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-w * 0.49, -h * 0.17);
  ctx.lineTo(-w * 0.47, -h * 0.6);
  ctx.quadraticCurveTo(-w * 0.34, -h * 0.98, 0, -h * 0.99);
  ctx.quadraticCurveTo(w * 0.34, -h * 0.98, w * 0.47, -h * 0.6);
  ctx.lineTo(w * 0.49, -h * 0.17);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(20,15,30,.6)";
  ctx.lineWidth = Math.max(1, w * 0.022);
  ctx.stroke();
  // spoiler
  ctx.fillStyle = shade(color, 0.6);
  ctx.fillRect(-w * 0.5, -h * 0.84, w, h * 0.07);
  ctx.fillRect(-w * 0.36, -h * 0.79, w * 0.05, h * 0.14);
  ctx.fillRect(w * 0.31, -h * 0.79, w * 0.05, h * 0.14);
  // rear window, with a glint
  ctx.fillStyle = "#1f2733";
  ctx.beginPath();
  ctx.moveTo(-w * 0.29, -h * 0.64);
  ctx.quadraticCurveTo(0, -h * 0.95, w * 0.29, -h * 0.64);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.22)";
  ctx.beginPath();
  ctx.moveTo(-w * 0.18, -h * 0.68); ctx.lineTo(-w * 0.06, -h * 0.86); ctx.lineTo(w * 0.0, -h * 0.86); ctx.lineTo(-w * 0.12, -h * 0.68);
  ctx.fill();
  // a stripe down the middle, the bumper, the number plate
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.fillRect(-w * 0.035, -h * 0.62, w * 0.07, h * 0.4);
  ctx.fillStyle = shade(color, 0.55);
  ctx.fillRect(-w * 0.45, -h * 0.3, w * 0.9, h * 0.12);
  ctx.fillStyle = "#f4f1e8";
  ctx.fillRect(-w * 0.1, -h * 0.29, w * 0.2, h * 0.09);
  // tail lights: bright when braking
  ctx.fillStyle = braking ? "#ff2b2b" : "#a3242a";
  if (braking) { ctx.shadowColor = "#ff2b2b"; ctx.shadowBlur = w * 0.15; }
  ctx.fillRect(-w * 0.43, -h * 0.5, w * 0.17, h * 0.1);
  ctx.fillRect(w * 0.26, -h * 0.5, w * 0.17, h * 0.1);
  ctx.restore();
}

function render(ctx, W, H, track, me, cars, t, skyOff) {
  const padsBySeg = new Map();
  for (const p of track.pads || []) { const i = Math.floor(p.z / SEG); if (!padsBySeg.has(i)) padsBySeg.set(i, []); padsBySeg.get(i).push(p); }
  const L = track.LAP, len = track.segs.length;
  const pos = (((me.d - PLAYER_Z) % L) + L) % L;
  const baseI = Math.floor(pos / SEG), basePct = (pos % SEG) / SEG;
  const pSeg = segAt(track, me.d), pPct = ((((me.d % L) + L) % L) % SEG) / SEG;
  const playerY = pSeg.y1 + (pSeg.y2 - pSeg.y1) * pPct;

  // sky, sun and clouds, then hills, all drifting with the bends
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, "#4f9fe2");
  sky.addColorStop(1, "#c6e8f8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const sunX = W * 0.78 - ((skyOff * W * 0.2) % (W * 1.6)), sunY = H * 0.14;
  const sun = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, H * 0.12);
  sun.addColorStop(0, "rgba(255,250,215,1)");
  sun.addColorStop(0.35, "rgba(255,235,150,.9)");
  sun.addColorStop(1, "rgba(255,235,150,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(sunX - H * 0.12, sunY - H * 0.12, H * 0.24, H * 0.24);
  ctx.fillStyle = "rgba(255,255,255,.85)";
  for (let i = 0; i < 5; i++) {
    const cx = ((i * W * 0.37 - skyOff * W * 0.6 - t * 6) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2, cy = H * (0.07 + (i % 3) * 0.06);
    for (const [ox, oy, r] of [[0, 0, 0.05], [0.05, -0.015, 0.04], [-0.05, 0.005, 0.035], [0.09, 0.008, 0.03]]) {
      ctx.beginPath();
      ctx.arc(cx + ox * W, cy + oy * H, r * W, 0, TAU);
      ctx.fill();
    }
  }
  for (const [hcol, amp, base, speed] of [["#9cc79a", 0.07, 0.5, 0.4], ["#78b16f", 0.05, 0.55, 0.7]]) {
    ctx.fillStyle = hcol;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H * base - Math.sin((x + skyOff * speed * W) / (W * 0.18)) * H * amp - H * amp);
    ctx.lineTo(W, H);
    ctx.fill();
  }

  // project the segments near to far, keeping each one's screen strip
  const proj = new Array(DRAW);
  let maxy = H, x = 0, dx = -(track.segs[baseI].curve * basePct);
  const camX = me.x * ROAD_W, camY = playerY + CAM_H;
  const P = (wx, wy, wz) => {
    const cz = wz, sc = CAM_DEPTH / cz;
    // whole pixels down the screen: half-pixel strip edges let the grass show through as lines
    return { x: W / 2 + sc * wx * W / 2, y: Math.round(H / 2 - sc * wy * H / 2), w: sc * ROAD_W * W / 2, sc };
  };
  for (let n = 0; n < DRAW; n++) {
    const seg = track.segs[(baseI + n) % len];
    const looped = seg.i < baseI;
    const z1 = seg.z1 - pos + (looped ? L : 0), z2 = z1 + SEG;
    // across: the road's centre, shifted by the bends so far, relative to your car
    const p1 = P(x - camX, seg.y1 - camY, z1), p2 = P(x + dx - camX, seg.y2 - camY, z2);
    x += dx;
    dx += seg.curve;
    proj[n] = { seg, p1, p2, clip: maxy, ok: false };
    if (z1 <= CAM_DEPTH || p2.y >= p1.y || p2.y >= maxy) continue;
    proj[n].ok = true;
    const dark = Math.floor(seg.i / 3) % 2;
    // grass, rumble strips, road, lane lines
    ctx.fillStyle = dark ? "#3f9a43" : "#47a84b";
    ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);
    const quad = (x1, w1, x2, w2, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      // a pixel of overlap with the strip nearer you, so no grass shows through the seam
      ctx.moveTo(x1 - w1, p1.y + 1); ctx.lineTo(x1 + w1, p1.y + 1); ctx.lineTo(x2 + w2, p2.y); ctx.lineTo(x2 - w2, p2.y);
      ctx.closePath();
      ctx.fill();
    };
    quad(p1.x, p1.w * 1.15, p2.x, p2.w * 1.15, dark ? "#e8e8e8" : "#d6283b");
    quad(p1.x, p1.w, p2.x, p2.w, dark ? "#5b5d66" : "#62646d");
    if (dark) for (const lane of [-1 / 3, 1 / 3]) {
      quad(p1.x + p1.w * lane * 2, p1.w * 0.02, p2.x + p2.w * lane * 2, p2.w * 0.02, "#f2f2f2");
    }
    if (seg.i % len === 0 || seg.i % len === 1) quad(p1.x, p1.w, p2.x, p2.w, (seg.i % 2) ? "#111" : "#fafafa");  // the line
    // a booster pad: a glowing strip across its lane, chevrons pointing on
    for (const pad of padsBySeg.get(seg.i) || []) {
      const glow = 0.75 + 0.25 * Math.sin(t * 10);
      for (const [k, col] of [[1.12, `rgba(255,120,30,${0.55 * glow})`], [1, "#ffb02e"], [0.5, `rgba(255,248,200,${glow})`]]) {
        quad(p1.x + p1.w * pad.x, p1.w * PAD_W * k, p2.x + p2.w * pad.x, p2.w * PAD_W * k, col);
      }
    }
    maxy = p1.y;
  }

  // far to near: roadside trees, then cars, each clipped behind the hills
  const carsBySeg = new Map();
  for (const c of cars) {
    const cz = (((c.d % L) + L) % L);
    const n = (Math.floor(cz / SEG) - baseI + len) % len;
    if (n >= DRAW || n < 1) continue;
    if (!carsBySeg.has(n)) carsBySeg.set(n, []);
    carsBySeg.get(n).push({ c, pct: (cz % SEG) / SEG });
  }
  for (let n = DRAW - 1; n > 0; n--) {
    const pr = proj[n];
    if (!pr || !pr.ok) continue;
    const { p1, p2, seg } = pr;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, pr.clip);
    ctx.clip();
    // roadside posts, red reflector on white
    if (seg.i % 4 === 0) {
      for (const side of [-1, 1]) {
        const px = p1.x + side * p1.w * 1.22, ph = p1.w * 0.12, pw = Math.max(1, p1.w * 0.025);
        ctx.fillStyle = "#f2f2f2";
        ctx.fillRect(px - pw / 2, p1.y - ph, pw, ph);
        ctx.fillStyle = "#e5484d";
        ctx.fillRect(px - pw / 2, p1.y - ph, pw, ph * 0.25);
      }
    }
    // a billboard now and then
    if (seg.i % 60 === 30) {
      const side = (seg.i / 60) % 2 ? 1 : -1;
      const bx = p1.x + side * p1.w * 1.9, bw = p1.w * 1.1, bh = p1.w * 0.45;
      ctx.fillStyle = "#5b4636";
      ctx.fillRect(bx - bw * 0.35, p1.y - bh * 1.6, bw * 0.05, bh * 1.6);
      ctx.fillRect(bx + bw * 0.3, p1.y - bh * 1.6, bw * 0.05, bh * 1.6);
      ctx.fillStyle = ["#ffc53d", "#ff6b6b", "#4cc9f0"][(seg.i / 60 | 0) % 3];
      ctx.fillRect(bx - bw / 2, p1.y - bh * 2, bw, bh);
      ctx.strokeStyle = "#2e2140";
      ctx.lineWidth = Math.max(1, bw * 0.02);
      ctx.strokeRect(bx - bw / 2, p1.y - bh * 2, bw, bh);
      if (bw > 30) {
        ctx.fillStyle = "#2e2140";
        ctx.font = `900 ${Math.max(8, bh * 0.42)}px Fredoka, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(["PLAYROOM", "TURBO!", "GO GO GO"][(seg.i / 60 | 0) % 3], bx, p1.y - bh * 1.38, bw * 0.9);
      }
    }
    if (seg.i % 8 === 0) {
      for (const side of [-1, 1]) {
        const tx = p1.x + side * p1.w * 1.45, th = p1.w * 0.9, tw = p1.w * 0.32;
        ctx.fillStyle = "#6b4a2b";
        ctx.fillRect(tx - tw * 0.08, p1.y - th * 0.35, tw * 0.16, th * 0.35);
        ctx.fillStyle = seg.i % 16 ? "#2f7d32" : "#3c8f3a";
        ctx.beginPath();
        ctx.moveTo(tx, p1.y - th); ctx.lineTo(tx + tw / 2, p1.y - th * 0.3); ctx.lineTo(tx - tw / 2, p1.y - th * 0.3);
        ctx.fill();
      }
    }
    for (const { c, pct } of carsBySeg.get(n) || []) {
      const sc = p1.sc + (p2.sc - p1.sc) * pct;
      const cx = p1.x + (p2.x - p1.x) * pct + sc * c.x * ROAD_W * W / 2;
      const cy = p1.y + (p2.y - p1.y) * pct;
      const cw = sc * CAR_W * W / 2;
      if (cw < 2) continue;
      drawCar(ctx, cx, cy, cw, c.color, 0, { spin: c.d / 400, t });
      if (c.name && cw > 14) {
        const fs = Math.max(10, Math.min(16, cw * 0.28));
        ctx.font = `bold ${fs}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,.7)";
        ctx.strokeText(c.name, cx, cy - cw * 0.62);
        ctx.fillStyle = "#fff";
        ctx.fillText(c.name, cx, cy - cw * 0.62);
      }
    }
    ctx.restore();
  }

  // speed lines streaming past at high speed, and a blue rush on turbo
  const pace = me.speed / MAX_SPEED;
  if (pace > 0.75 || me.boosting) {
    const n = me.boosting ? 26 : 12, a = Math.min(0.55, (pace - 0.7) * 1.4) + (me.boosting ? 0.25 : 0);
    ctx.strokeStyle = me.boosting ? `rgba(170,225,255,${a})` : `rgba(255,255,255,${a})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + i * 1.7, r0 = Math.min(W, H) * (0.35 + ((t * 2.5 + i * 0.37) % 1) * 0.5);
      const cx = W / 2, cy = H * 0.52;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0 * 0.7);
      ctx.lineTo(cx + Math.cos(ang) * (r0 + H * 0.12), cy + Math.sin(ang) * (r0 + H * 0.12) * 0.7);
      ctx.stroke();
    }
  }
  if (me.boosting) {
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(80,170,255,0)");
    vg.addColorStop(1, "rgba(80,170,255,.32)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
  // dust thrown up off the grass
  for (const p of me.dust || []) {
    ctx.fillStyle = `rgba(150,130,90,${0.45 * (p.life / p.max)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1.6 - p.life / p.max), 0, TAU);
    ctx.fill();
  }

  // your car: leaning into the steer, bouncing with the road
  const steerTilt = (me.steerShow || 0) * 0.07;
  const bounce = me.speed > 0 ? Math.sin(t * 30) * 1.4 * pace : 0;
  drawCar(ctx, W / 2 + (me.steerShow || 0) * W * 0.01, H - H * 0.04 + bounce, Math.min(W * 0.32, H * 0.38), me.color, steerTilt,
    { spin: me.d / 400, boosting: me.boosting, braking: me.braking, t });

  // the turbo tank, top left (the steering buttons sit bottom left)
  const tw = Math.min(140, W * 0.3), tx = 14, ty = 26;
  ctx.fillStyle = "rgba(20,15,30,.55)";
  ctx.fillRect(tx - 3, ty - 3, tw + 6, 14);
  const ready = me.turbo > 0;
  const tg = ctx.createLinearGradient(tx, 0, tx + tw, 0);
  tg.addColorStop(0, ready ? "#ffb02e" : "#7a6a55");
  tg.addColorStop(1, ready ? "#ff4d3d" : "#5e5246");
  ctx.fillStyle = tg;
  ctx.fillRect(tx, ty, tw * (me.turbo ?? 1), 8);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(me.boosting ? "TURBO!" : ready ? "TURBO" : "drive over a pad for turbo", tx, ty - 6);

  drawMap(ctx, W, H, track, me, cars);
}

// The circuit seen from above, for the map: turn by each segment's bend, then
// spread the gap between where it ends and where it began back over the lap,
// so the loop closes. Points every 6 segments, fitted to a 0..1 box.
function trackShape(track) {
  const segs = track.segs, n = segs.length;
  const total = segs.reduce((a, s) => a + s.curve, 0);
  const k = Math.abs(total) > 40 ? (Math.PI * 2) / total : 0.003;
  let h = 0, x = 0, y = 0;
  const raw = [];
  for (let i = 0; i < n; i++) { raw.push([x, y]); h += segs[i].curve * k; x += Math.cos(h); y += Math.sin(h); }
  const ex = x, ey = y;
  const pts = raw.map(([px, py], i) => [px - (ex * i) / n, py - (ey * i) / n]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), span = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0) || 1;
  return { at: pts.map(([px, py]) => [(px - x0) / span, (py - y0) / span]), w: (Math.max(...xs) - x0) / span, h: (Math.max(...ys) - y0) / span };
}

// The map, top right: the circuit, the line, a dot for every car.
function drawMap(ctx, W, H, track, me, cars) {
  const shape = track.shape;
  if (!shape) return;
  const box = Math.round(Math.min(118, Math.max(70, Math.min(W, H) * 0.3)));
  const pad = 8, bw = box * Math.max(0.5, shape.w), bh = box * Math.max(0.5, shape.h);
  const ox = W - bw - pad * 2 - 8, oy = 8;
  ctx.fillStyle = "rgba(20,15,30,.55)";
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ox, oy, bw + pad * 2, bh + pad * 2, 10) : ctx.rect(ox, oy, bw + pad * 2, bh + pad * 2); ctx.fill();
  const P = (i) => { const [px, py] = shape.at[i % shape.at.length]; return [ox + pad + px * box, oy + pad + py * box]; };
  const L = track.segs.length;
  ctx.lineJoin = "round";
  for (const [col, lw] of [["#2e2140", 6], ["#d9d4e2", 3]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    for (let i = 0; i <= L; i += 6) { const [px, py] = P(i); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.closePath(); ctx.stroke();
  }
  // the line, and the pads
  const [sx, sy] = P(0);
  ctx.fillStyle = "#fff"; ctx.fillRect(sx - 3, sy - 3, 6, 6);
  for (const p of track.pads || []) { const [px, py] = P(Math.floor(p.z / SEG)); ctx.fillStyle = "#ffb02e"; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, TAU); ctx.fill(); }
  const at = (d) => P(Math.floor((((d % track.LAP) + track.LAP) % track.LAP) / SEG));
  for (const c of cars) {
    const [px, py] = at(c.d);
    ctx.fillStyle = c.color || "#fff"; ctx.strokeStyle = "#2e2140"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill(); ctx.stroke();
  }
  const [mx, my] = at(me.d);
  ctx.fillStyle = me.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(mx, my, 5.5, 0, TAU); ctx.fill(); ctx.stroke();
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function Speedway(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;
  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;
  const { socket } = useSocket() || {};
  const track = useMemo(() => { const t = buildTrack(seed); t.shape = trackShape(t); return t; }, [seed]);

  // grid slots by join order (user id), the same on every phone
  const seated = useMemo(() => (players || []).filter((p) => !p.is_spectator)
    .map((p) => ({ id: Number(p.user_id), name: p.username })).sort((a, b) => a.id - b.id), [players]);
  const myId = Number(currentUser?.id);
  const mySlot = Math.max(0, seated.findIndex((p) => p.id === myId));
  const solo = seated.length <= 1;

  const me = useRef(null);
  if (me.current === null) me.current = { ...newCar(mySlot), color: COLOURS[mySlot % COLOURS.length], dust: [], steerShow: 0 };
  const bots = useRef(null);
  if (bots.current === null) bots.current = solo ? newBots(seed, 3, 1) : [];
  const remote = useRef(new Map());                   // user id -> { d, x, s, f, at }
  const input = useRef({ left: false, right: false, turbo: false, brake: false });
  // A landscape game: on a phone held upright GameFrame draws it turned, and
  // a touch's position is turned back before it's read.
  const rotated = useUprightTouch();
  const rot = useRef(rotated);
  rot.current = rotated;
  // Tilt: the phone is the wheel. Gravity across the phone's long side is how
  // far it's turned; which way round depends on which way it's held sideways.
  const tilt = useRef({ on: true, steer: 0, asked: false, seen: false });
  const [tiltOn, setTiltOn] = useState(true);
  useEffect(() => {
    if (isSpectator) return undefined;
    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null) return;
      tilt.current.seen = true;
      const v = (a.y / 4.5) * (a.x >= 0 ? 1 : -1);          // ~25 degrees is full lock
      tilt.current.steer = Math.abs(v) < 0.12 ? 0 : Math.max(-1, Math.min(1, v));
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [isSpectator]);
  // iPhones ask first, and only on a tap
  const askTilt = () => {
    if (tilt.current.asked) return;
    tilt.current.asked = true;
    try { if (typeof DeviceMotionEvent !== "undefined" && DeviceMotionEvent.requestPermission) DeviceMotionEvent.requestPermission().catch(() => {}); } catch { /* not this phone */ }
  };
  const shake = useRef(0);
  const canvasRef = useRef(null);
  const size = useRef({ w: 300, h: 400 });
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);
  const elapsedRef = useRef(0);
  useEffect(() => { elapsedRef.current = Math.max(0, durationSeconds - eng.timeLeft); }, [eng.timeLeft, durationSeconds]);

  const [hud, setHud] = useState({ place: 1, of: 1, lap: 1, speed: 0, count: START_S, since: -START_S, finished: null });
  const [msg, setMsg] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type, ms = 900) => {
    setMsg({ text, type });
    timers.current.push(setTimeout(() => setMsg(null), ms));
  };

  // everyone else's cars, from the room
  useEffect(() => {
    if (!socket) return undefined;
    const onPos = (m) => {
      const id = Number(m.user_id);
      if (id === myId) return;
      remote.current.set(id, { d: m.d, x: m.x, s: m.s, f: m.f, at: performance.now() });
    };
    socket.on("race:pos", onPos);
    return () => socket.off("race:pos", onPos);
  }, [socket, myId]);

  // keys: hold to steer, down to brake
  useEffect(() => {
    if (isSpectator) return undefined;
    const set = (e, v) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a") input.current.left = v;
      else if (k === "ArrowRight" || k === "d") input.current.right = v;
      else if (k === "ArrowDown" || k === "s") input.current.brake = v;
      else if (k === "ArrowUp" || k === "w" || k === " ") input.current.turbo = v;
      else return;
      e.preventDefault();
    };
    const dn = (e) => set(e, true), up = (e) => set(e, false);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [isSpectator]);

  // touch: hold either half of the road to steer that way
  const holds = useRef(new Map());
  const onDown = (e) => {
    if (isSpectator) return;
    askTilt();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    const box = gameRect(e.currentTarget, rot.current), at = toGame(e, rot.current);
    holds.current.set(e.pointerId, at.x - box.left < box.width / 2 ? "left" : "right");
  };
  const onUp = (e) => { holds.current.delete(e.pointerId); };

  useEffect(() => {
    if (isSpectator) return undefined;
    let raf, last = performance.now(), pushed = 0, lastHud = 0, sent = 0, skyOff = 0, wasLap = 1, said = -1;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = elapsedRef.current;
      const go = elapsed >= START_S;
      const car = me.current;
      // everyone else, carried forward from their last report
      const others = [];
      for (const [id, r] of remote.current) {
        const ahead = r.f === null ? (r.s * (now - r.at)) / 1000 : 0;
        const who = seated.find((p) => p.id === id);
        const slot = seated.findIndex((p) => p.id === id);
        others.push({ d: r.d + ahead, x: r.x, finishedAt: r.f, color: COLOURS[Math.max(0, slot) % COLOURS.length], name: who ? who.name : "" });
      }
      for (const b of bots.current) {
        driveBot(track, b, dt, go, [car, ...bots.current.filter((o) => o !== b)], elapsed);
        others.push(b);
      }
      if (!overRef.current) {
        const held = [...holds.current.values()];
        const left = input.current.left || held.includes("left"), right = input.current.right || held.includes("right");
        // a finger or a key wins; otherwise the tilt
        const steer = left || right ? (left ? -1 : 0) + (right ? 1 : 0) : tilt.current.on ? tilt.current.steer : 0;
        car.steerShow += (steer - (car.steerShow || 0)) * Math.min(1, dt * 10);
        car.braking = input.current.brake;
        const out = drive(track, car, { steer, turbo: input.current.turbo, brake: input.current.brake }, dt, go, others, elapsed);
        if (out.bumped) { flash("Bump!", "error", 600); shake.current = 10; }
        if (out.boosted) flash("⚡ Turbo! Hold the button", "success", 1100);
        // dust off the grass, from behind the wheels
        const { w: cw0, h: ch0 } = size.current;
        if (Math.abs(car.x) > 1 && car.speed > 500) {
          for (const side of [-1, 1]) car.dust.push({ x: cw0 / 2 + side * cw0 * 0.12 + (Math.random() - 0.5) * 10, y: ch0 * 0.94, r: 4 + Math.random() * 6, life: 0.5, max: 0.5 });
        }
        const target = raceScore(track, car, durationSeconds);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
        const lap = lapOf(track, car.d);
        if (lap !== wasLap && car.finishedAt === null) { flash(lap === LAPS ? "Final lap!" : `Lap ${lap}`, "info"); wasLap = lap; }
        if (socket && roomCode && now - sent > SEND_MS) {
          sent = now;
          socket.emit("race:pos", { code: roomCode, d: Math.round(car.d), x: Math.round(car.x * 1000) / 1000, s: Math.round(car.speed), f: car.finishedAt });
        }
      }
      skyOff += segAt(track, car.d).curve * (car.speed / MAX_SPEED) * dt * 0.02;
      for (const p of car.dust) { p.life -= dt; p.y -= 30 * dt; }
      car.dust = car.dust.filter((p) => p.life > 0).slice(-60);
      shake.current *= Math.pow(0.02, dt);
      const all = [car, ...others];
      const place = placeOf(car, all);
      if (car.finishedAt !== null && said < 0) { said = place; flash(`Finished ${PLACE[place] || place + "th"}!`, "success", 3000); }
      if (now - lastHud > 120) {
        lastHud = now;
        setHud({ place, of: all.length, lap: lapOf(track, car.d), speed: kmh(car), count: Math.max(0, START_S - elapsed), since: elapsed - START_S, finished: car.finishedAt, turbo: car.turbo, boosting: car.boosting });
      }
      const c = canvasRef.current;
      if (c) {
        const { w, h } = size.current, dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const ctx = c.getContext("2d");
        const sh = shake.current > 0.3 ? shake.current : 0;
        ctx.setTransform(dpr, 0, 0, dpr, (Math.random() - 0.5) * sh * dpr, (Math.random() - 0.5) * sh * dpr);
        render(ctx, w, h, track, car, others, now / 1000, skyOff);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, addScore, socket, roomCode, track, seated, durationSeconds]);

  const stats = [
    { label: "Place", value: `${PLACE[hud.place] || hud.place}/${hud.of}` },
    { label: "Lap", value: `${Math.min(hud.lap, LAPS)}/${LAPS}` },
    { label: "Speed", value: `${hud.speed} km/h` },
  ];
  const hold = (side, label, aria) => (
    <button className="press p-white sw-btn" aria-label={aria}
      onPointerDown={(e) => { e.preventDefault(); input.current[side] = true; }}
      onPointerUp={() => { input.current[side] = false; }} onPointerCancel={() => { input.current[side] = false; }}
      onPointerLeave={() => { input.current[side] = false; }}>{label}</button>
  );
  const controls = !isSpectator ? (
    <div className="sw-controls">
      <div className="sw-steer">{hold("left", "◀", "Steer left")}{hold("right", "▶", "Steer right")}</div>
      <div className="sw-right">
        <button className={`press sm sw-tilt${tiltOn ? " p-sun" : " p-white"}`} aria-pressed={tiltOn}
          onClick={() => { askTilt(); tilt.current.on = !tilt.current.on; setTiltOn(tilt.current.on); }}>📱 Tilt {tiltOn ? "on" : "off"}</button>
        {hold("turbo", "🔥 Turbo", "Turbo")}
      </div>
    </div>
  ) : null;
  const count = Math.ceil(hud.count);

  return (
    <>
      <GameFrame
        gameName="Speedway" badge="🏁 SPEEDWAY"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={isSpectator ? [{ label: "Score", value: Number(spectatorWatching?.score ?? 0).toLocaleString() }] : stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={Object.values(eng.opponents)}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
        controls={controls}
        landscape
      >
        {({ w, h }) => {
          if (isSpectator) {
            return <div className="muted">👀 Watching {spectatorWatching?.username} — {Number(spectatorWatching?.score ?? 0).toLocaleString()} pts</div>;
          }
          const cw = w, ch = h;
          size.current = { w: cw, h: ch };
          return (
            <div className="sw-pad" style={{ width: w, height: h }}
              onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={(e) => e.preventDefault()}>
              <div className="sw-stage" style={{ width: cw, height: ch }}>
                <canvas ref={canvasRef} className="sw-canvas" style={{ width: cw, height: ch }}
                  role="img" aria-label="Speedway: steer round the bends, three laps" />
                {hud.count > 0 && (
                  <div className="sw-lights" aria-hidden="true">
                    {[3, 2, 1].map((n) => <i key={n} className={count <= n ? "on" : ""} />)}
                  </div>
                )}
                {hud.count <= 0 && hud.since >= 0 && hud.since < 1.2 && (
                  <div className="sw-lights go" aria-hidden="true"><i className="on" /><i className="on" /><i className="on" /></div>
                )}
                {hud.count > 0 && <div className="sw-count">{count}</div>}
                {hud.count <= 0 && hud.since >= 0 && hud.since < 1.2 && <div className="sw-count go">GO!</div>}
              </div>

            </div>
          );
        }}
      </GameFrame>
      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={hud.finished !== null ? `Finished ${PLACE[hud.place] || hud.place}` : `Lap ${Math.min(hud.lap, LAPS)} of ${LAPS} · ${PLACE[hud.place] || hud.place} place`} />
      )}
    </>
  );
}
