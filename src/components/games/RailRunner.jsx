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
//
// Together (a co-op room): your friends run beside you, see-through. A crash
// knocks you down for a few seconds unless a friend grabs a ❤️ — then
// everyone who's down is back up (runTogether.js). The side's points add up.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useRunTogether from "./useRunTogether";
import { DOWN_S, HEART_PTS, teamGoal, hearts, heartsBetween } from "./runTogether";
import { team } from "./coopTeam";
import { newRun, step, steer, jump, slide, sliding, score, LANE_W, LOW, HIGH, TRAIN, BASE_SPEED, MAX_SPEED, SAFE_S } from "./runnerSim.js";

const SWIPE_PX = 26;
const CAM_BACK = 5.2, CAM_H = 3.1;           // metres behind and above the runner
const FAR = 95;                              // how far down the line we draw
const TAU = Math.PI * 2;

// ── drawing ──────────────────────────────────────────────────────────────────
function makeView(W, H, s) {
  const pace = Math.max(0, (s.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED));
  const F = Math.min(W * 1.05, H * 0.95) * (1 - 0.12 * pace), HZ = H * 0.34;   // a wider view, faster
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

function drawScene(ctx, s, W, H, t, tg) {
  const v = makeView(W, H, s);
  const { P, HZ } = v;
  // sky and skyline
  const sky = ctx.createLinearGradient(0, 0, 0, HZ);
  sky.addColorStop(0, "#7cc8f2");
  sky.addColorStop(1, "#cdebfa");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HZ + 2);
  ctx.fillStyle = "rgba(255,255,255,.9)";
  for (let i = 0; i < 4; i++) {
    const cx = ((i * W * 0.41 - t * 9 - s.z * 0.05) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2, cy = HZ * (0.18 + (i % 2) * 0.2);
    for (const [ox, oy, r] of [[0, 0, 0.07], [0.07, -0.02, 0.055], [-0.07, 0.01, 0.05], [0.13, 0.01, 0.04]]) {
      ctx.beginPath(); ctx.arc(cx + ox * W, cy + oy * HZ, r * W, 0, TAU); ctx.fill();
    }
  }
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
      const w = fr.b[0] - fr.a[0], hh = fr.a[1] - fr.d[1];
      for (let r = 0; r < 3; r++) for (let q = 0; q < 2; q++) {
        const lit = ((k * 31 + r * 7 + q * 3 + (side > 0 ? 5 : 0)) % 5) === 0;
        ctx.fillStyle = lit ? "rgba(255,226,140,.9)" : "rgba(60,70,90,.35)";
        ctx.fillRect(fr.a[0] + w * (0.15 + q * 0.45), fr.d[1] + hh * (0.15 + r * 0.27), w * 0.3, hh * 0.15);
      }
      ctx.fillStyle = shade(col, 0.6);                    // a roof edge
      ctx.fillRect(fr.d[0] - w * 0.03, fr.d[1] - Math.max(1, hh * 0.03), w * 1.06, Math.max(2, hh * 0.04));
    } });
  }
  for (const row of s.rows) for (const o of row.items) {
    if (o.z + (o.len || 0) < zNear || o.z > zFar) continue;
    if (o.kind === "coin" && o.got) continue;
    if (o.hit) continue;                                    // what you crashed into bursts apart (see drawFx)
    things.push({ z: o.z, draw: () => drawItem(ctx, v, o, t) });
  }
  // together: hearts over the middle lane, and friends running beside you
  if (tg) {
    for (const at of tg.hearts) {
      if (at < zNear || at > zFar) continue;
      things.push({ z: at, draw: () => {
        const [hx, hy, dz] = P(0, 1.7 + Math.sin(t * 4 + at) * 0.12, at);
        ctx.font = `${Math.max(10, Math.round((0.9 * v.F) / dz))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("❤️", hx, hy);
      } });
    }
    for (const m of tg.mates) {
      if (m.d < zNear + 0.4 || m.d > zFar) continue;
      const ghost = { x: m.l, y: m.y, z: m.d, stunT: m.dn ? 1 : 0, safeT: 0, speed: m.v || BASE_SPEED, slideT: 0, landT: 0 };
      things.push({ z: m.d, draw: () => {
        ctx.save();
        ctx.globalAlpha = 0.45;
        drawRunner(ctx, v, ghost, t);
        ctx.restore();
        const [nx, ny, dz] = P(m.l * LANE_W, m.y + 2.3, m.d);
        ctx.font = `600 ${Math.max(9, Math.min(14, Math.round((0.5 * v.F) / dz)))}px Fredoka, Nunito, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = m.col;
        ctx.fillText(m.dn ? `💤 ${m.name}` : m.name, nx, ny);
      } });
    }
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
    // the windows down whichever side you can see
    const sx = v.camX < cx - 1.0 ? cx - 1.0 : v.camX > cx + 1.0 ? cx + 1.0 : null;
    if (sx !== null) {
      for (let wz = o.z + 1; wz < o.z + o.len - 1; wz += 2.2) {
        const q = [v.P(sx, 1.5, wz), v.P(sx, 1.5, wz + 1.4), v.P(sx, 2.3, wz + 1.4), v.P(sx, 2.3, wz)];
        poly(ctx, q, "rgba(29,43,58,.85)");
      }
    }
  }
}

// The runner: cap, hoodie with a backpack, shorts, trainers; arms and legs
// pumping with the pace, a bob in the stride, squashed for a beat on landing,
// stretched out low in a slide, tucked in a jump, and stars round the head
// after a crash. Blinks while briefly untouchable.
function drawRunner(ctx, v, s, t) {
  if (s.safeT > 0 && s.stunT <= 0 && Math.floor(t * 12) % 2) return;
  const cx = s.x * LANE_W;
  const [x, yFoot, dz] = v.P(cx, s.y, s.z);
  const u = v.F / dz;                                     // pixels per metre here
  const slid = sliding(s), air = s.y > 0.05;
  const cyc = s.stunT > 0 ? 0 : t * (7 + s.speed * 0.5);
  const run = Math.sin(cyc);
  const squash = s.landT > 0 ? 1 - s.landT * 1.6 : 1;      // landing: squashed, then back
  const bob = air || slid ? 0 : Math.abs(Math.cos(cyc)) * u * 0.06;
  ctx.save();
  // shadow on the track, smaller the higher you are
  const [, ys] = v.P(cx, 0, s.z);
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.beginPath();
  ctx.ellipse(x, ys, u * 0.45 / (1 + s.y * 0.5), u * 0.12, 0, 0, TAU);
  ctx.fill();
  ctx.translate(x, yFoot - bob);
  ctx.scale(1 + (1 - squash) * 0.6, squash);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (slid) {
    // stretched out low, feet first
    ctx.rotate(-1.2);
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(-u * 0.22, -u * 0.95, u * 0.44, u * 0.62);
    ctx.fillStyle = "#3a3f8f";
    ctx.fillRect(-u * 0.2, -u * 0.38, u * 0.4, u * 0.2);
    ctx.strokeStyle = "#2e2140";
    ctx.lineWidth = u * 0.15;
    ctx.beginPath(); ctx.moveTo(-u * 0.08, -u * 0.2); ctx.lineTo(-u * 0.1, u * 0.18); ctx.moveTo(u * 0.08, -u * 0.2); ctx.lineTo(u * 0.12, u * 0.15); ctx.stroke();
    ctx.fillStyle = "#f2c49b";
    ctx.beginPath(); ctx.arc(0, -u * 1.1, u * 0.17, 0, TAU); ctx.fill();
    ctx.fillStyle = "#ffc53d";
    ctx.beginPath(); ctx.arc(0, -u * 1.14, u * 0.18, Math.PI, 0); ctx.fill();
    ctx.restore();
    return;
  }
  const H = u * 1.7;
  const hip = -H * 0.46, sh = -H * 0.8;
  const legA = air ? 0.9 : run * 0.75, legB = air ? -0.35 : -run * 0.75;
  // legs, bending at the knee, with trainers
  for (const [a, back] of [[legB, true], [legA, false]]) {
    const kx = Math.sin(a) * H * 0.24, ky = hip + Math.cos(a) * H * 0.24;
    const bend = air ? 0.5 : Math.max(0, -Math.sin(a + 0.6)) * 0.9;
    const fx = kx - Math.sin(bend) * H * 0.2, fy = ky + Math.cos(bend) * H * 0.22;
    ctx.strokeStyle = back ? "#241a33" : "#2e2140";
    ctx.lineWidth = u * 0.16;
    ctx.beginPath(); ctx.moveTo(0, hip); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = back ? "#d9d9d9" : "#ffffff";
    ctx.beginPath(); ctx.ellipse(fx + u * 0.04, fy + u * 0.03, u * 0.12, u * 0.06, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#e5484d";
    ctx.fillRect(fx - u * 0.06, fy + u * 0.03, u * 0.18, u * 0.025);
  }
  // back arm (behind the body)
  ctx.strokeStyle = "#e05252";
  ctx.lineWidth = u * 0.12;
  const armB = -run * 0.9;
  ctx.beginPath(); ctx.moveTo(0, sh + H * 0.03); ctx.lineTo(Math.sin(armB) * H * 0.16, sh + H * 0.17); ctx.lineTo(Math.sin(armB) * H * 0.16 + H * 0.07, sh + H * 0.3); ctx.stroke();
  // shorts, hoodie, backpack
  ctx.fillStyle = "#3a3f8f";
  ctx.fillRect(-u * 0.21, hip - u * 0.06, u * 0.42, u * 0.22);
  const hood = ctx.createLinearGradient(0, sh, 0, hip);
  hood.addColorStop(0, "#ff7b7b");
  hood.addColorStop(1, "#e65555");
  ctx.fillStyle = hood;
  ctx.beginPath();
  ctx.moveTo(-u * 0.25, hip + u * 0.02);
  ctx.lineTo(u * 0.25, hip + u * 0.02);
  ctx.lineTo(u * 0.23, sh);
  ctx.quadraticCurveTo(0, sh - u * 0.06, -u * 0.23, sh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#3d7fbf";                            // the backpack, seen from behind
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-u * 0.17, sh + u * 0.05, u * 0.34, u * 0.42, u * 0.06) : ctx.rect(-u * 0.17, sh + u * 0.05, u * 0.34, u * 0.42);
  ctx.fill();
  ctx.fillStyle = "#ffc53d";
  ctx.fillRect(-u * 0.1, sh + u * 0.2, u * 0.2, u * 0.05);
  // front arm
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = u * 0.12;
  const armA = run * 0.9;
  ctx.beginPath(); ctx.moveTo(0, sh + H * 0.03); ctx.lineTo(Math.sin(armA) * H * 0.16, sh + H * 0.17); ctx.lineTo(Math.sin(armA) * H * 0.16 - H * 0.06, sh + H * 0.3); ctx.stroke();
  // head and cap (backwards, seen from behind)
  const hy = sh - u * 0.2;
  ctx.fillStyle = "#4a3426";                            // hair at the neck
  ctx.beginPath(); ctx.arc(0, hy + u * 0.04, u * 0.17, 0, Math.PI); ctx.fill();
  ctx.fillStyle = "#f2c49b";
  ctx.beginPath(); ctx.arc(-u * 0.17, hy, u * 0.05, 0, TAU); ctx.arc(u * 0.17, hy, u * 0.05, 0, TAU); ctx.fill();   // ears
  ctx.fillStyle = "#ffc53d";
  ctx.beginPath(); ctx.arc(0, hy - u * 0.02, u * 0.18, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#e0a52a";
  ctx.fillRect(-u * 0.13, hy - u * 0.02, u * 0.26, u * 0.06);           // the peak, turned back
  // stars after a crash
  if (s.stunT > 0) {
    ctx.fillStyle = "#ffe066";
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + (i * TAU) / 3;
      const sx = Math.cos(a) * u * 0.3, sy = hy - u * 0.35 + Math.sin(a) * u * 0.08;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? u * 0.04 : u * 0.09, aa = (k * Math.PI) / 5;
        ctx.lineTo(sx + Math.cos(aa) * r, sy + Math.sin(aa) * r);
      }
      ctx.fill();
    }
  }
  ctx.restore();
}

// Effects drawn over everything: coins flying up to the counter with a
// sparkle, "+10"s floating off the runner, dust kicked up, speed lines.
function drawFx(ctx, fx, W, H, s, t) {
  const pace = Math.max(0, (s.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED));
  if (pace > 0.35) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.5, (pace - 0.35) * 0.9)})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1, yy = H * (0.3 + ((i * 0.137) % 0.6)), ph = (t * 3 + i * 0.29) % 1;
      const x0 = side > 0 ? W * (0.85 + ph * 0.15) : W * (0.15 - ph * 0.15);
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + side * W * 0.08, yy + H * 0.02); ctx.stroke();
    }
  }
  for (const b of fx.bits) {
    ctx.globalAlpha = b.life / b.max;
    ctx.fillStyle = b.c;
    ctx.fillRect(b.x - 4, b.y - 4, 8, 8);
    ctx.globalAlpha = 1;
  }
  for (const p of fx.dust) {
    ctx.fillStyle = `rgba(160,140,110,${0.5 * (p.life / p.max)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.8 - p.life / p.max), 0, TAU); ctx.fill();
  }
  // the coin counter, top right: it pulses when a coin lands in it
  const tx = W - 34, ty = 26, pulse = 1 + fx.bump * 0.35;
  ctx.fillStyle = "rgba(46,33,64,.55)";
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(W - 96, 10, 86, 32, 16) : ctx.rect(W - 96, 10, 86, 32); ctx.fill();
  ctx.fillStyle = "#ffc53d";
  ctx.strokeStyle = "#b8860b";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(W - 78, ty, 10 * pulse, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(16 * pulse)}px Fredoka, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(String(s.coins), W - 62, ty + 1);
  ctx.textBaseline = "alphabetic";
  // flying coins
  for (const c of fx.coins) {
    const k = Math.min(1, c.t / c.dur), e = 1 - Math.pow(1 - k, 3);
    const x = c.x + (tx - 44 - c.x) * e, y = c.y + (ty - c.y) * e - Math.sin(k * Math.PI) * 60;
    const r = c.r * (1 - 0.55 * e), sq = Math.abs(Math.cos(c.t * 14));
    ctx.fillStyle = "#ffc53d";
    ctx.strokeStyle = "#b8860b";
    ctx.lineWidth = Math.max(1, r * 0.2);
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(1, r * (0.3 + 0.7 * sq)), r, 0, 0, TAU); ctx.fill(); ctx.stroke();
    if (c.t < 0.18) {                                  // the sparkle where it was taken
      const sr = c.r * (1 + c.t * 9);
      ctx.strokeStyle = `rgba(255,240,170,${1 - c.t / 0.18})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6;
        ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * sr * 0.5, c.y + Math.sin(a) * sr * 0.5); ctx.lineTo(c.x + Math.cos(a) * sr, c.y + Math.sin(a) * sr); ctx.stroke();
      }
    }
  }
  for (const p of fx.pops) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / 0.8);
    ctx.fillStyle = "#ffe066";
    ctx.strokeStyle = "#2e2140";
    ctx.lineWidth = 3;
    ctx.font = "900 20px Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.strokeText(p.text, p.x, p.y - p.t * 60);
    ctx.fillText(p.text, p.x, p.y - p.t * 60);
    ctx.globalAlpha = 1;
  }
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function RailRunner(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null, mode } = props;
  const coop = mode === "coop" && !!roomCode;
  const myId = Number(currentUser?.id);
  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;
  const sim = useRef(null);
  if (sim.current === null) sim.current = newRun(seed);

  // together: friends beside you, hearts to save each other
  const T = useMemo(() => team(players, myId), [players, myId]);
  const Tref = useRef(T);
  Tref.current = T;
  const heartAt = useMemo(() => hearts(seed, "runner"), [seed]);
  const tg = useRef({ down: false, h: 0, got: new Set(), bonus: 0 });
  const [down, setDown] = useState(false);
  const { tell, mates } = useRunTogether({ on: coop, roomCode, isSpectator, myId, onRevive: (id) => {
    const s = sim.current;
    if (!tg.current.down) return;
    s.stunT = 0;
    s.safeT = SAFE_S;
    s.speed = BASE_SPEED;
    tg.current.down = false;
    setDown(false);
    sayRef.current(`❤️ ${Tref.current.nameOf(id)} saved you!`, "success");
  } });
  const sayRef = useRef(null);
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
  const say = useCallback((text, type) => {
    const m = { text, type };
    setMsg(m);
    timers.current.push(setTimeout(() => setMsg((x) => (x === m ? null : x)), 1400));
  }, []);
  sayRef.current = say;

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
    let raf, last = performance.now(), pushed = 0, lastHud = 0, prevY = 0, dustT = 0;
    const fx = { coins: [], pops: [], dust: [], bits: [], bump: 0 };
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));   // never backwards: the first frame can be stamped early
      last = Math.max(last, now);
      const s = sim.current;
      if (!overRef.current) {
        const z0 = s.z;
        const out = step(s, dt);
        const T0 = tg.current;
        if (coop) {
          if (out.crashed) {
            s.stunT = DOWN_S;
            s.safeT = DOWN_S + SAFE_S;
            T0.down = true;
            setDown(true);
          } else if (T0.down && s.stunT <= 0) { T0.down = false; setDown(false); }
          // a heart passed while on your feet is yours: everybody down gets up
          if (!T0.down && s.stunT <= 0) {
            for (const { k } of heartsBetween(heartAt, z0, s.z)) {
              if (T0.got.has(k)) continue;
              T0.got.add(k);
              T0.h += 1;
              T0.bonus += HEART_PTS.runner;
              const anyDown = mates().some((m) => m.dn);
              say(anyDown ? "❤️ You saved your friends!" : `❤️ +${HEART_PTS.runner}`, "success");
            }
          }
          tell({ d: s.z, v: s.speed, y: s.y, l: s.x, dn: T0.down, h: T0.h });
        }
        if (out.crashed && !coop) {
          flash("Ouch! Keep running!", "error");
        }
        if (out.crashed) {
          // whatever you hit bursts into pieces and is gone, so it doesn't fill the screen
          const { w: W1, h: H1 } = size.current, v1 = makeView(W1, H1, s);
          const [bx, by] = v1.P(s.x * LANE_W, 1.0, s.z + 0.8);
          for (let i = 0; i < 18; i++) {
            const a = Math.random() * TAU, sp = 80 + Math.random() * 160;
            fx.bits.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 0.7, max: 0.7, c: ["#ff6b6b", "#ffc53d", "#4cc9f0", "#ffffff"][i % 4] });
          }
        }
        // every coin taken flies up to the counter, with a +10 off the runner
        const { w: W0, h: H0 } = size.current, v = makeView(W0, H0, s);
        for (const g of out.got) {
          const [gx, gy, gdz] = v.P(g.lane * LANE_W, g.y, g.z);
          fx.coins.push({ x: gx, y: gy, r: Math.max(6, (0.32 * v.F) / gdz), t: 0, dur: 0.55 });
          const [rx, ry] = v.P(s.x * LANE_W, s.y + 2.1, s.z);
          fx.pops.push({ x: rx + (Math.random() - 0.5) * 20, y: ry, text: "+10", t: 0 });
        }
        // landing: a squash and a puff of dust
        if (prevY > 0.05 && s.y === 0) {
          s.landT = 0.18;
          const [lx, ly] = v.P(s.x * LANE_W, 0, s.z);
          for (let i = 0; i < 6; i++) fx.dust.push({ x: lx + (Math.random() - 0.5) * 40, y: ly, r: 4 + Math.random() * 5, life: 0.45, max: 0.45 });
        }
        prevY = s.y;
        dustT -= dt;
        if (dustT <= 0 && s.y === 0 && s.stunT <= 0) {
          dustT = 0.09;
          const [lx, ly] = v.P(s.x * LANE_W, 0, s.z - 0.2);
          fx.dust.push({ x: lx + (Math.random() - 0.5) * 14, y: ly, r: 2 + Math.random() * 3, life: 0.35, max: 0.35 });
        }
        const target = score(s) + tg.current.bonus;
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
        if (now - lastHud > 150) { lastHud = now; setHud({ dist: Math.floor(s.z), coins: s.coins, crashes: s.crashes }); }
      }
      // effects age
      s.landT = Math.max(0, (s.landT || 0) - dt);
      for (const c of fx.coins) { c.t += dt; if (c.t >= c.dur && !c.done) { c.done = true; fx.bump = 1; } }
      fx.coins = fx.coins.filter((c) => c.t < c.dur);
      for (const p of fx.pops) p.t += dt;
      fx.pops = fx.pops.filter((p) => p.t < 0.8);
      for (const p of fx.dust) { p.life -= dt; p.y -= 18 * dt; }
      for (const b of fx.bits) { b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 500 * dt; }
      fx.bits = fx.bits.filter((b) => b.life > 0);
      fx.dust = fx.dust.filter((p) => p.life > 0).slice(-80);
      fx.bump = Math.max(0, fx.bump - dt * 5);
      const c = canvasRef.current;
      if (c) {
        const { w, h } = size.current, dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const ctx = c.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const T1 = tg.current;
        const extra = coop ? {
          hearts: heartsBetween(heartAt, s.z - 6, s.z + FAR).filter((x) => !T1.got.has(x.k)).map((x) => x.at),
          mates: mates().map((m) => ({ ...m, col: Tref.current.colourOf(m.id), name: Tref.current.nameOf(m.id) })),
        } : null;
        drawScene(ctx, s, w, h, now / 1000, extra);
        drawFx(ctx, fx, w, h, s, now / 1000);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, addScore, coop, heartAt, tell, mates, say]);

  // together: the side's points, against the team goal
  const oppList = Object.values(eng.opponents);
  const seats = (players || []).filter((p) => !p.is_spectator);
  const goal = teamGoal("runner", durationSeconds, seats.length);
  const teamTotal = eng.score + oppList.reduce((t, o) => t + (Number(o.score) || 0), 0);
  const scores = { [myId]: eng.score };
  for (const o of oppList) scores[o.user_id] = Number(o.score) || 0;
  const stats = coop
    ? [{ label: "Team", value: teamTotal.toLocaleString() },
       { label: "Goal", value: teamTotal >= goal ? "✓" : goal.toLocaleString() },
       { label: "You", value: eng.score.toLocaleString() }]
    : [
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
        opponents={coop ? T.strip(scores, (n) => `${n.toLocaleString()} pts`) : oppList}
        teams={eng.teams}
        message={down ? { text: "💤 Down — a friend's ❤️ gets you up", type: "info" } : msg}
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
        <GameOver eng={eng} me={currentUser}
          extra={coop ? `Team: ${teamTotal.toLocaleString()} pts` : `Distance: ${hud.dist}m · Coins: ${hud.coins}${hud.crashes ? ` · Crashes: ${hud.crashes}` : ""}`}
          together={coop ? { reached: teamTotal >= goal, goal: `${goal.toLocaleString()} points`, unit: "pts", mates: T.all(scores) } : null} />
      )}
    </>
  );
}
