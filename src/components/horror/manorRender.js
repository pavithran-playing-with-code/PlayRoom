// src/components/horror/manorRender.js
// Drawing HOLLOW MANOR: a column raycaster for the halls, billboard sprites
// for everything in them, a minimap, and the full-screen moments (the map you
// memorise at the start, the thing's face when it gets you).
//
// Reads the sim; the only thing it writes is `s.expl`, the tiles you have
// actually seen, which the minimap draws. (The original page meant to do the
// same but its marking code was never called, so its map stayed blank.)
//
// The same picture serves solo and online. What it reads from `s`:
//   P        the body whose eyes we look through (x, y, fa, jz, cr, light...)
//   G        the nearest ghost: the danger glow, the red arrow
//   ghosts   every ghost to draw (solo: just G)
//   others   other players, online: [{ x, y, color, name, lit, cr, jz }]
//   exitOpen whether the far gate is open to you (solo: all relics taken)
// and a relic may carry a `color` (whose it is) and `mine: false`.
import { HURDLE, BEAM, litBody } from "./manorCore.mjs";
import { dangerOf } from "./manorSim.js";

const GOLD = "255,220,160";
const rgbOf = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
const ghostsOf = (s) => s.ghosts || [s.G];
const exitOpen = (s) => (s.exitOpen !== undefined ? s.exitOpen : s.count >= s.need);

const TAU = Math.PI * 2;

// Thumb controls, shared by the solo page and the room game.
export const SPRINT_PX = 76;           // push the stick this far out and you run
export const YAW_PER_PX = 0.006;       // right thumb, sideways: radians per pixel
export const PITCH_PER_PX = 0.0024;    // right thumb, up/down: screen heights per pixel
export const PITCH_MAX = 0.32;

// A right-thumb drag, applied to a body: turn, and look up or down.
export function lookBy(body, dx, dy) {
  body.fa += dx * YAW_PER_PX;
  body.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, (body.pitch || 0) - dy * PITCH_PER_PX));
}
const PLANE = 0.65;                    // camera plane: ~66° field of view

export function drawGhost(ctx, x, y, s, angry) {
  ctx.save();
  ctx.translate(x, y);
  const gr = ctx.createRadialGradient(0, -s * 0.1, s * 0.05, 0, 0, s * 0.7);
  gr.addColorStop(0, "#f3efe4");
  gr.addColorStop(1, "#8f8895");
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(0, -s * 0.1, s * 0.4, Math.PI, 0);
  const w = 6;
  for (let i = 0; i <= w; i++) ctx.lineTo(s * 0.4 - i * (s * 0.8 / w), s * 0.45 + (i % 2 ? s * 0.1 : 0));
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = "#c81e3a";
  ctx.shadowBlur = angry ? s * 0.25 : 0;
  ctx.fillStyle = angry ? "#e0203f" : "#0a0a0a";
  ctx.beginPath();
  ctx.ellipse(-s * 0.15, -s * 0.12, s * 0.07, s * 0.11, 0, 0, TAU);
  ctx.ellipse(s * 0.15, -s * 0.12, s * 0.07, s * 0.11, 0, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.16, s * 0.09, s * (angry ? 0.17 : 0.12), 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// The map: all of it while you memorise, only what you have seen after.
function mini(ctx, s, x0, y0, size, all, t) {
  const { N, g, expl, relics, cells, obst, exitT, P } = s;
  const c = size / N;
  ctx.fillStyle = "rgba(0,0,0,.7)";
  ctx.fillRect(x0 - 5, y0 - 5, size + 10, size + 10);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (all || expl[y][x]) {
        ctx.fillStyle = g[y][x] ? "#2b2119" : "#7c6849";
        ctx.fillRect(x0 + x * c, y0 + y * c, c + 0.5, c + 0.5);
      }
    }
  }
  const bl = 0.6 + 0.4 * Math.sin(t * 5);
  for (const r of relics) {
    if (r.got) continue;
    ctx.fillStyle = `rgba(${r.color ? rgbOf(r.color) : GOLD},${r.mine === false ? 0.45 : bl})`;
    ctx.beginPath();
    ctx.arc(x0 + r.x * c, y0 + r.y * c, c * (r.mine === false ? 0.6 : 0.9), 0, TAU);
    ctx.fill();
  }
  for (const q of cells) {
    if (q.got) continue;
    ctx.fillStyle = "#8fe3a8";
    ctx.fillRect(x0 + q.x * c - c * 0.5, y0 + q.y * c - c * 0.5, c, c);
  }
  for (const k in obst) {
    const ox = +k % N, oy = (+k / N) | 0;
    if (all || expl[oy][ox]) {
      ctx.fillStyle = obst[k] === HURDLE ? "#e8a13a" : "#a86bd6";
      ctx.fillRect(x0 + ox * c, y0 + oy * c, c, c);
    }
  }
  ctx.fillStyle = exitOpen(s) ? "#5fd68a" : "#a33";
  ctx.fillRect(x0 + exitT.x * c - c * 0.3, y0 + exitT.y * c - c * 0.3, c * 1.6, c * 1.6);
  for (const G of ghostsOf(s)) {
    if (all || Math.hypot(P.x - G.x, P.y - G.y) >= 14) continue;
    ctx.fillStyle = "#e0203f";
    ctx.beginPath();
    ctx.arc(x0 + G.x * c, y0 + G.y * c, c * 1.1, 0, TAU);
    ctx.fill();
  }
  // everyone else, in their colours
  for (const o of s.others || []) {
    ctx.fillStyle = o.color;
    ctx.beginPath();
    ctx.arc(x0 + o.x * c, y0 + o.y * c, c * 0.8, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x0 + P.x * c, y0 + P.y * c, c * 0.9, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0 + P.x * c, y0 + P.y * c);
  ctx.lineTo(x0 + (P.x + Math.cos(P.fa) * 3) * c, y0 + (P.y + Math.sin(P.fa) * 3) * c);
  ctx.stroke();
}

// DDA ray from the player. Marks each floor tile it crosses, and the wall it
// hits, as seen — as far as the light (or the dark) lets you see.
function cast(s, rx, ry, seeTo) {
  const { g, N, P, expl } = s;
  let mx = P.x | 0, my = P.y | 0;
  const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
  let sx, sy, sdx, sdy;
  if (rx < 0) { sx = -1; sdx = (P.x - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - P.x) * ddx; }
  if (ry < 0) { sy = -1; sdy = (P.y - my) * ddy; } else { sy = 1; sdy = (my + 1 - P.y) * ddy; }
  let side = 0, n = 0;
  if (mx >= 0 && my >= 0 && mx < N && my < N) expl[my][mx] = 1;
  while (n++ < 64) {
    if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
    if (mx < 0 || my < 0 || mx >= N || my >= N) break;
    const dist = side ? sdy - ddy : sdx - ddx;
    if (dist <= seeTo) expl[my][mx] = 1;
    if (g[my][mx]) break;
  }
  const pd = side ? sdy - ddy : sdx - ddx, wx = side ? P.x + pd * rx : P.y + pd * ry;
  return { d: Math.max(0.05, pd), side, mx, my, u: wx - Math.floor(wx) };
}

function scene(ctx, s, W, H, t) {
  const { P, exitT } = s;
  const dx = Math.cos(P.fa), dy = Math.sin(P.fa), plx = -dy * PLANE, ply = dx * PLANE;
  const cw = Math.max(2, Math.ceil(W / 360)), cols = Math.ceil(W / cw), zb = new Float32Array(cols);
  const mv = P.noiseR > 0 && !P.entering;
  // P.pitch: looking up (positive) or down, as a share of the screen height
  const hz = H / 2 + (P.pitch || 0) * H + (mv ? Math.sin(s.tm * (P.noiseR > 5 ? 14 : 9)) * (P.noiseR > 5 ? 6 : 3) : 0) +
    (P.shake > 0 ? (Math.random() - 0.5) * P.shake * 24 : 0);
  const eye = 0.5 + P.jz - P.cr * 0.26, L = litBody(P);
  const fl = 0.92 + Math.sin(t * 7) * 0.05 + (Math.random() < 0.02 ? -0.25 * Math.random() : 0);
  const seeTo = L ? 7.5 : 2.2;

  ctx.fillStyle = "#050507";
  ctx.fillRect(0, 0, W, hz);
  const fg = ctx.createLinearGradient(0, hz, 0, H);
  fg.addColorStop(0, "#000");
  fg.addColorStop(1, L ? "#241a11" : "#0d0906");
  ctx.fillStyle = fg;
  ctx.fillRect(0, hz, W, H - hz);

  for (let i = 0; i < cols; i++) {
    const cam = 2 * (i + 0.5) / cols - 1, h = cast(s, dx + plx * cam, dy + ply * cam, seeTo), pd = h.d;
    zb[i] = pd;
    let b = 0.03 + Math.max(0, 1 - pd / 2.2) * (L ? 0.32 : 0.18) +
      (L ? Math.pow(Math.max(0, 1 - pd / 7.5), 1.4) * (1 - Math.abs(cam) * 0.45) * fl : 0);
    let col = [96, 74, 56];
    const isEx = h.mx === exitT.x && h.my === exitT.y, isEn = h.mx === 0 && h.my === 1;
    const sealed = isEn || (isEx && !exitOpen(s));
    if (isEx) { col = exitOpen(s) ? [70, 230, 130] : [200, 40, 50]; b += 0.35 * Math.max(0, 1 - pd / 14); }
    else if (isEn) col = [220, 190, 120];
    else if (((h.mx * 7 + h.my * 13) & 3) === 0) col = [86, 66, 64];
    if (h.side) b *= 0.72;
    if (!isEx && !isEn && (h.u * 3 % 1) < 0.05) b *= 0.55;
    if (sealed && (h.u * 5 % 1) < 0.35) b *= 0.25;
    b = Math.min(1, b);
    const lh = H / pd, ds = hz - lh * (1 - eye);
    ctx.fillStyle = `rgb(${(col[0] * b) | 0},${(col[1] * b) | 0},${(col[2] * b) | 0})`;
    ctx.fillRect(i * cw, ds, cw + 1, lh);
    if (!isEx && !isEn) {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      for (let k = 1; k < 4; k++) ctx.fillRect(i * cw, ds + lh * k / 4, cw + 1, Math.max(1, lh * 0.015));
    }
  }

  // sprites, far to near, clipped column by column against the walls
  const inv = 1 / (plx * dy - dx * ply), sp = [];
  for (const r of s.relics) if (!r.got) sp.push({ x: r.x, y: r.y, k: "r", color: r.color, mine: r.mine });
  for (const q of s.pulses) sp.push({ x: q.x, y: q.y, k: "m" });
  for (const q of s.puffs) sp.push({ x: q.x, y: q.y, k: "p", t: q.t });
  for (const k in s.obst) sp.push({ x: (+k % s.N) + 0.5, y: ((+k / s.N) | 0) + 0.5, k: s.obst[k] });
  for (const c of s.cells) if (!c.got) sp.push({ x: c.x, y: c.y, k: "b" });
  for (const G of ghostsOf(s)) sp.push({ x: G.x, y: G.y, k: "g", G });
  for (const o of s.others || []) sp.push({ x: o.x, y: o.y, k: "o", o });
  for (const o of sp) {
    const rx = o.x - P.x, ry = o.y - P.y;
    o.tx = inv * (dy * rx - dx * ry);
    o.ty = inv * (-ply * rx + plx * ry);
  }
  sp.sort((a, b) => b.ty - a.ty);
  for (const o of sp) {
    if (o.ty < 0.2 || o.ty > 18) continue;
    const ob = o.k === HURDLE || o.k === BEAM, scr = W / 2 * (1 + o.tx / o.ty), u = H / o.ty;
    const size = (ob || o.k === "p") ? u : u * (o.k === "g" ? 1 : o.k === "r" ? 0.32 : 0.3);
    const cy = hz + (eye - (o.k === "g" ? 0.5 : o.k === "r" || o.k === "b" ? 0.45 : 0.2)) * u;
    const x0 = Math.max(0, Math.floor((scr - size / 2) / cw)), x1 = Math.min(cols - 1, Math.floor((scr + size / 2) / cw));
    ctx.save();
    ctx.beginPath();
    let vis = false;
    for (let i = x0; i <= x1; i++) if (zb[i] > o.ty) { ctx.rect(i * cw, 0, cw, H); vis = true; }
    if (!vis) { ctx.restore(); continue; }
    ctx.clip();
    if (o.k === "g") {
      const cam = o.tx / o.ty / PLANE;
      const gb = (L ? Math.pow(Math.max(0, 1 - o.ty / 7.5), 1.2) * (1 - Math.abs(cam) * 0.45) : 0) + Math.max(0, 1 - o.ty / 2.2) * 0.3;
      ctx.globalAlpha = Math.min(1, gb * 1.5 + 0.04) * (0.85 + 0.15 * Math.sin(t * 9));
      drawGhost(ctx, scr, cy + Math.sin(t * 3) * size * 0.03, size * 1.15, o.G.st === "hunt");
      ctx.globalAlpha = 1;
      // its eyes, which you can always see
      ctx.fillStyle = `rgba(224,32,63,${0.5 + 0.4 * Math.sin(t * 10)})`;
      ctx.beginPath();
      ctx.arc(scr - size * 0.17, cy - size * 0.14, size * 0.045, 0, TAU);
      ctx.arc(scr + size * 0.17, cy - size * 0.14, size * 0.045, 0, TAU);
      ctx.fill();
    } else if (o.k === "r") {
      const by = cy + Math.sin(t * 2.5 + o.x) * size * 0.15;
      const gr = ctx.createRadialGradient(scr, by, 1, scr, by, size * 1.6);
      const rc = o.color ? rgbOf(o.color) : GOLD;
      ctx.globalAlpha = o.mine === false ? 0.5 : 1;     // someone else's: dimmer
      gr.addColorStop(0, `rgba(${rc},.9)`);
      gr.addColorStop(1, `rgba(${rc},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(scr - size * 2, by - size * 2, size * 4, size * 4);
      ctx.fillStyle = o.color ? `rgb(${rc})` : "#fff3d0";
      ctx.beginPath();
      ctx.moveTo(scr, by - size * 0.6);
      ctx.lineTo(scr + size * 0.35, by);
      ctx.lineTo(scr, by + size * 0.6);
      ctx.lineTo(scr - size * 0.35, by);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (o.k === "o") {
      drawPlayer(ctx, o.o, scr, hz, eye, u, L, o.ty, t);
    } else if (o.k === "b") {
      const by = cy + Math.sin(t * 2 + o.y) * size * 0.1;
      ctx.fillStyle = "rgba(143,227,168,.25)";
      ctx.beginPath();
      ctx.arc(scr, by, size * 1.1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#8fe3a8";
      ctx.fillRect(scr - size * 0.2, by - size * 0.35, size * 0.4, size * 0.7);
      ctx.fillStyle = "#e9e3d3";
      ctx.fillRect(scr - size * 0.1, by - size * 0.5, size * 0.2, size * 0.15);
    } else if (o.k === "p") {
      const age = 1 - o.t / 0.9;
      for (let i = 0; i < 8; i++) {
        const a = i * 0.785 + o.x, r = u * (0.15 + age * 0.45);
        ctx.fillStyle = `rgba(180,170,155,${0.5 * (1 - age)})`;
        ctx.beginPath();
        ctx.arc(scr + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5 - age * u * 0.2, u * (0.08 + age * 0.1), 0, TAU);
        ctx.fill();
      }
    } else if (ob) {
      drawObstacle(ctx, s, o, scr, u, hz, eye, L, t);
    } else {
      ctx.fillStyle = "#ffdca0";
      ctx.font = `${size * 1.6}px Georgia`;
      ctx.textAlign = "center";
      ctx.fillText("♪", scr, cy);
    }
    ctx.restore();
  }

  // the edges bleed red as it gets close
  const dg = dangerOf(s);
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(${(dg * 90) | 0},0,4,${0.7 + dg * 0.25})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawObstacle(ctx, s, o, scr, u, hz, eye, L, t) {
  const cm = o.tx / o.ty / PLANE;
  const br = Math.min(1, (L ? Math.pow(Math.max(0, 1 - o.ty / 7.5), 1.2) * (1 - Math.abs(cm) * 0.45) : 0) * 1.3 + Math.max(0, 1 - o.ty / 2.2) * 0.3 + 0.06);
  const x = scr - u / 2;
  const pulse = Math.max(0, 1 - o.ty / 6) * (0.4 + 0.3 * Math.sin(t * 4));
  const gd = Math.hypot(o.x - s.G.x, o.y - s.G.y), rat = Math.max(0, 1 - gd / 6) * u * 0.012 * Math.sin(t * 40);
  if (o.k === HURDLE) {
    const top = hz + (eye - 0.3) * u, ph = 0.3 * u / 3;
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `rgb(${(232 * br) | 0},${((k % 2 ? 110 : 161) * br) | 0},${(58 * br) | 0})`;
      ctx.fillRect(x + rat * (k % 2 ? 1 : -1), top + k * ph, u, ph * 0.8);
    }
    ctx.fillStyle = `rgb(${(70 * br) | 0},${(45 * br) | 0},${(25 * br) | 0})`;
    ctx.fillRect(x, top, u * 0.08, 0.3 * u);
    ctx.fillRect(x + u * 0.92, top, u * 0.08, 0.3 * u);
    if (pulse > 0.02) {
      ctx.save();
      ctx.shadowColor = "#e8a13a";
      ctx.shadowBlur = 14;
      ctx.strokeStyle = `rgba(232,161,58,${pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, top, u, 0.3 * u);
      ctx.restore();
    }
  } else {
    drawBeam(ctx, o, x, u, hz, eye, br, pulse, rat, t);
  }
}

// The low beam: a rafter that came down and wedged across the corridor at
// head height, one end lower than the other. Heavy dark timber, iron straps,
// cobwebs underneath, dust sifting off it. Same height as the rule it draws
// (0.32–0.62 of the wall), so what you see is exactly what you must duck.
// A torn purple rag and the purple pulse keep the minimap's "crouch" colour.
function drawBeam(ctx, o, x, u, hz, eye, br, pulse, rat, t) {
  const rgb = (r, g, b, k = 1) => `rgb(${(r * br * k) | 0},${(g * br * k) | 0},${(b * br * k) | 0})`;
  const h = 0.3 * u;
  const creak = Math.sin(t * 0.9 + o.x * 3) * u * 0.004 + rat * 0.5;
  const tilt = u * 0.045 * (((o.x | 0) + (o.y | 0)) % 2 ? 1 : -1);   // which end sagged
  const L = x, R = x + u;
  const yL = hz + (eye - 0.62) * u - tilt / 2 + creak, yR = yL + tilt - creak * 2;
  const at = (f) => yL + (yR - yL) * f;                   // top edge at fraction f

  // the shadow it throws on the wall behind, so it sits in the corridor
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath();
  ctx.moveTo(L, yL + h); ctx.lineTo(R, yR + h); ctx.lineTo(R, yR + h * 1.35); ctx.lineTo(L, yL + h * 1.35);
  ctx.fill();

  // the timber: lit along the top, dark underneath
  const g = ctx.createLinearGradient(0, Math.min(yL, yR), 0, Math.max(yL, yR) + h);
  g.addColorStop(0, rgb(128, 88, 54));
  g.addColorStop(0.18, rgb(104, 70, 42));
  g.addColorStop(1, rgb(46, 30, 20));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(L, yL); ctx.lineTo(R, yR); ctx.lineTo(R, yR + h); ctx.lineTo(L, yL + h);
  ctx.closePath();
  ctx.fill();
  // bevelled top edge
  ctx.fillStyle = rgb(160, 116, 74);
  ctx.beginPath();
  ctx.moveTo(L, yL); ctx.lineTo(R, yR); ctx.lineTo(R, yR + h * 0.08); ctx.lineTo(L, yL + h * 0.08);
  ctx.fill();

  // grain, and a couple of knots
  ctx.strokeStyle = rgb(40, 26, 16, 0.9);
  ctx.lineWidth = Math.max(1, u * 0.006);
  for (let k = 1; k <= 4; k++) {
    const f = k / 5;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const fx = i / 12, px = L + u * fx;
      const py = at(fx) + h * f + Math.sin(fx * 9 + k * 2.1 + o.y) * h * 0.035;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  ctx.fillStyle = rgb(34, 22, 14);
  for (const [fx, fy, r] of [[0.33, 0.45, 0.05], [0.68, 0.62, 0.035]]) {
    ctx.beginPath();
    ctx.ellipse(L + u * fx, at(fx) + h * fy, u * r, h * r * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // iron straps with rivets
  // straps and rag sit toward the middle: up close the corridor walls hide the ends
  for (const fx of [0.3, 0.72]) {
    const sx = L + u * fx, sy = at(fx);
    ctx.fillStyle = rgb(52, 50, 56);
    ctx.fillRect(sx - u * 0.03, sy - h * 0.04, u * 0.06, h * 1.08);
    ctx.fillStyle = rgb(120, 112, 118);
    for (const fy of [0.18, 0.82]) {
      ctx.beginPath();
      ctx.arc(sx, sy + h * fy, Math.max(1, u * 0.009), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // cobweb: a few loose strands sagging between points on the underside
  ctx.strokeStyle = `rgba(215,212,225,${0.3 * br})`;
  ctx.lineWidth = Math.max(0.8, u * 0.0028);
  for (const [a, b, sag] of [[0.08, 0.3, 0.5], [0.14, 0.26, 0.3], [0.6, 0.92, 0.45], [0.66, 0.84, 0.25], [0.18, 0.36, 0.2]]) {
    const ax = L + u * a, bx = L + u * b, ay = at(a) + h, by = at(b) + h;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + h * sag + Math.sin(t * 0.8 + a * 9) * h * 0.03, bx, by);
    ctx.stroke();
  }
  // and threads hanging loose, stirring
  for (const fx of [0.46, 0.53, 0.58]) {
    const sx = L + u * fx, sy = at(fx) + h, len = h * (0.35 + 0.25 * Math.sin(fx * 13));
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + Math.sin(t * 1.3 + fx * 7) * u * 0.02, sy + len * 0.6, sx + Math.sin(t * 1.1 + fx * 5) * u * 0.012, sy + len);
    ctx.stroke();
  }

  // a torn rag, the minimap's purple
  const rx = L + u * 0.4, ry = at(0.4) + h * 0.9, sway = Math.sin(t * 1.4 + o.y) * u * 0.015;
  ctx.fillStyle = rgb(112, 62, 150);
  ctx.beginPath();
  ctx.moveTo(rx - u * 0.035, ry);
  ctx.lineTo(rx + u * 0.035, ry);
  ctx.lineTo(rx + u * 0.03 + sway, ry + h * 0.55);
  ctx.lineTo(rx + u * 0.01 + sway, ry + h * 0.42);
  ctx.lineTo(rx - u * 0.01 + sway, ry + h * 0.7);
  ctx.lineTo(rx - u * 0.03 + sway, ry + h * 0.48);
  ctx.closePath();
  ctx.fill();

  // dust sifting down off it
  for (let i = 0; i < 4; i++) {
    const f = (t * 0.35 + i * 0.27 + o.x * 0.1) % 1, fx = 0.2 + ((i * 0.37 + o.y * 0.13) % 0.6);
    ctx.fillStyle = `rgba(190,175,150,${0.5 * (1 - f) * br})`;
    ctx.fillRect(L + u * fx, at(fx) + h + f * u * 0.35, Math.max(1, u * 0.006), Math.max(1, u * 0.006));
  }

  if (pulse > 0.02) {
    ctx.save();
    ctx.shadowColor = "#a86bd6";
    ctx.shadowBlur = 14;
    ctx.strokeStyle = `rgba(168,107,214,${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(L, yL); ctx.lineTo(R, yR); ctx.lineTo(R, yR + h); ctx.lineTo(L, yL + h);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// Another player in the halls: a dark cloaked shape with their colour on the
// lantern and their name over their head, so you can tell who is who.
function drawPlayer(ctx, p, scr, hz, eye, u, L, dist, t) {
  const rc = rgbOf(p.color);
  const br = Math.min(1, (L ? Math.pow(Math.max(0, 1 - dist / 7.5), 1.2) : 0) + Math.max(0, 1 - dist / 2.2) * 0.4 + 0.12);
  const crouch = p.cr > 0.5 ? 0.72 : 1;
  const foot = hz + eye * u - (p.jz || 0) * u, h = u * 0.62 * crouch, w = u * 0.26;
  const top = foot - h;
  if (p.lit) {
    // their lantern's glow first, so the body stands in it
    const gl = ctx.createRadialGradient(scr + w * 0.5, foot - h * 0.45, 1, scr + w * 0.5, foot - h * 0.45, u * 0.6);
    gl.addColorStop(0, `rgba(${rc},.55)`);
    gl.addColorStop(1, `rgba(${rc},0)`);
    ctx.fillStyle = gl;
    ctx.fillRect(scr - u, foot - h - u * 0.4, u * 2, h + u * 0.8);
  }
  ctx.fillStyle = `rgba(${(40 * br) | 0},${(34 * br) | 0},${(48 * br) | 0},.96)`;
  ctx.beginPath();
  ctx.moveTo(scr, top);
  ctx.quadraticCurveTo(scr - w * 0.6, top + h * 0.1, scr - w * 0.55, top + h * 0.5);
  ctx.lineTo(scr - w * 0.7, foot);
  ctx.lineTo(scr + w * 0.7, foot);
  ctx.lineTo(scr + w * 0.55, top + h * 0.5);
  ctx.quadraticCurveTo(scr + w * 0.6, top + h * 0.1, scr, top);
  ctx.fill();
  ctx.strokeStyle = `rgba(${rc},${0.5 + br * 0.5})`;
  ctx.lineWidth = Math.max(1.5, u * 0.012);
  ctx.stroke();
  ctx.fillStyle = p.lit ? `rgb(${rc})` : `rgba(${rc},.35)`;
  ctx.beginPath();
  ctx.arc(scr + w * 0.62, foot - h * 0.42, Math.max(2, u * 0.035), 0, TAU);
  ctx.fill();
  const fs = Math.max(10, Math.min(18, u * 0.09));
  ctx.font = `${fs}px Georgia`;
  ctx.textAlign = "center";
  ctx.fillStyle = `rgba(${rc},${Math.min(1, 0.4 + br)})`;
  ctx.fillText(p.name || "", scr, top - fs * 0.5);
}

function arrow(ctx, W, H, s, ang, radius, size, color) {
  ctx.save();
  ctx.translate(W / 2 + Math.sin(ang - s.P.fa) * radius, H / 2 - Math.cos(ang - s.P.fa) * radius);
  ctx.rotate(ang - s.P.fa - Math.PI / 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.7, -size * 0.7);
  ctx.lineTo(-size * 0.3, 0);
  ctx.lineTo(-size * 0.7, size * 0.7);
  ctx.fill();
  ctx.restore();
}

// view: { W, H, dpr, safeTop }; stick: the move thumb, if down.
export function drawManor(ctx, s, view, t, stick) {
  const { W, H, dpr, safeTop } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (!s) return;

  if (s.mode === "intro") {
    // The map plus a line above and two below, all inside the screen — a
    // phone on its side is only ~360px tall.
    const size = Math.max(120, Math.min(W * 0.74, H - 124));
    const x0 = (W - size) / 2, y0 = (H - size - 100) / 2 + 36;
    mini(ctx, s, x0, y0, size, true, t);
    ctx.fillStyle = "#e9e3d3";
    ctx.textAlign = "center";
    ctx.font = `italic ${Math.max(15, Math.min(22, W / 22))}px Georgia`;
    ctx.fillText("Memorize the halls. Gold marks the relics.", W / 2, y0 - 14);
    ctx.fillStyle = "#a39a88";
    ctx.font = "14px Georgia";
    ctx.fillText(`The dark falls in ${Math.ceil(s.introT)}s. Tap or press any key to start now.`, W / 2, y0 + size + 24);
    ctx.fillText("Orange squares: jump over. Purple squares: crouch under.", W / 2, y0 + size + 44);
    return;
  }
  if (s.mode === "dead") {
    const k = Math.min(1, s.deadT / 0.5), size = Math.min(W, H) * (0.7 + k * 0.9), sh = (1 - Math.min(1, s.deadT)) * 18;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    drawGhost(ctx, W / 2, H / 2, size, true);
    ctx.restore();
    ctx.fillStyle = `rgba(200,30,58,${Math.max(0, 0.8 - s.deadT * 1.2)})`;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  scene(ctx, s, W, H, t);

  // where to go: the nearest relic, then the gate
  const { P, G } = s;
  const tg = s.relics.filter((r) => !r.got && r.mine !== false).sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y))[0];
  const tx = tg ? tg.x : s.exitT.x + 0.5, ty = tg ? tg.y : s.exitT.y + 0.5;
  arrow(ctx, W, H, s, Math.atan2(ty - P.y, tx - P.x), Math.min(W, H) * 0.3, 12, "rgba(255,220,160,.45)");

  // where it is, when it is near: redder and bigger the closer it gets
  const d = G ? Math.hypot(P.x - G.x, P.y - G.y) : Infinity;
  if (d < 14) {
    const k = 1 - d / 14;
    arrow(ctx, W, H, s, Math.atan2(G.y - P.y, G.x - P.x), Math.min(W, H) * 0.36, 8 + k * 16, `rgba(224,32,63,${0.35 + k * 0.6})`);
  }

  const ms = Math.min(130, Math.min(W, H) * 0.3);
  mini(ctx, s, W - ms - 14, 16 + safeTop, ms, false, t);

  if (stick) {
    // the walk ring, and outside it the run ring: push past to sprint
    const sdx = stick.x - stick.ox, sdy = stick.y - stick.oy, a = Math.atan2(sdy, sdx);
    const run = Math.hypot(sdx, sdy) > SPRINT_PX, l = Math.min(SPRINT_PX + 8, Math.hypot(sdx, sdy));
    ctx.strokeStyle = "rgba(233,227,211,.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(stick.ox, stick.oy, 50, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = run ? "rgba(255,220,160,.8)" : "rgba(233,227,211,.18)";
    ctx.beginPath();
    ctx.arc(stick.ox, stick.oy, SPRINT_PX, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = run ? "rgba(255,220,160,.9)" : "rgba(233,227,211,.3)";
    ctx.font = "11px Georgia";
    ctx.textAlign = "center";
    ctx.fillText(run ? "RUNNING" : "push out to run", stick.ox, stick.oy - SPRINT_PX - 8);
    ctx.fillStyle = run ? "rgba(255,220,160,.55)" : "rgba(233,227,211,.35)";
    ctx.beginPath();
    ctx.arc(stick.ox + Math.cos(a) * l, stick.oy + Math.sin(a) * l, 20, 0, TAU);
    ctx.fill();
  }
}
