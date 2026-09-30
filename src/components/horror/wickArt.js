// src/components/horror/wickArt.js
// How the things in WICK look. Plain canvas calls, no React.
//
// Each kind is told apart by silhouette, not detail, because a tile is ~50px:
//   shade    pale, hooded, floating — a face with long black eyes
//   crawler  low and black, legs out to the tile edges, a cluster of red eyes
//   lunger   twice as tall as a tile, thin, arms to its knees
// In the dark they fade, but their eyes never do: you always know where they are.
const TAU = Math.PI * 2;

export function drawShade(ctx, cx, cy, s, { lit, t, look = [0, 0], phase = 0, alpha = 1 }) {
  const bob = Math.sin(t / 430 + phase) * s * 0.04;
  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.globalAlpha = alpha * (lit ? 0.95 : 0.5);

  const g = ctx.createLinearGradient(0, -s * 0.35, 0, s * 0.44);
  g.addColorStop(0, "#E6E4F0");
  g.addColorStop(1, "rgba(150,150,185,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-s * 0.19, -s * 0.2);
  ctx.quadraticCurveTo(-s * 0.38, s * 0.1, -s * 0.3, s * 0.44);
  for (let i = 1; i <= 4; i++) {
    const x = -s * 0.3 + i * s * 0.15;
    ctx.lineTo(x, s * 0.44 - (i % 2 ? s * 0.09 : 0) + Math.sin(t / 190 + i + phase) * s * 0.025);
  }
  ctx.quadraticCurveTo(s * 0.38, s * 0.1, s * 0.19, -s * 0.2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#F2F0F8";
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.18, s * 0.19, s * 0.23, 0, 0, TAU);
  ctx.fill();

  // The face turns to follow you.
  const lx = look[0] * s * 0.035, ly = look[1] * s * 0.025;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#07060B";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * s * 0.075 + lx, -s * 0.21 + ly, s * 0.038, s * 0.075, side * -0.18, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(lx, -s * 0.045 + ly, s * 0.04, s * 0.075 + Math.sin(t / 300 + phase) * s * 0.01, 0, 0, TAU);
  ctx.fill();
  if (!lit) {
    // eyes that stay visible in the dark
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "#C8D2FF";
    ctx.shadowBlur = s * 0.25;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * s * 0.075 + lx, -s * 0.2 + ly, s * 0.022, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawCrawler(ctx, cx, cy, s, { lit, t, ready, stunned, look = [0, 1], alpha = 1 }) {
  ctx.save();
  ctx.translate(cx, cy + s * 0.08);
  ctx.globalAlpha = alpha;
  const twitch = ready && !stunned ? 1 : 0.25;

  // legs, four a side, reaching for the tile edges
  ctx.strokeStyle = lit ? "#4B3440" : "#2E2029";
  ctx.lineWidth = Math.max(1.5, s * 0.045);
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const j = Math.sin(t / 55 + i * 1.7 + side) * s * 0.035 * twitch;
      const ay = -s * 0.1 + i * s * 0.07;
      ctx.beginPath();
      ctx.moveTo(side * s * 0.1, ay);
      ctx.quadraticCurveTo(side * s * 0.34, ay - s * 0.2 + j, side * s * 0.44, ay + s * 0.12 + i * s * 0.03 + j);
      ctx.stroke();
    }
  }
  // body
  ctx.fillStyle = lit ? "#2A1A22" : "#150D12";
  ctx.strokeStyle = lit ? "#6A4252" : "#3A2430";
  ctx.lineWidth = Math.max(1.5, s * 0.03);
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.17, s * 0.21, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // a cluster of red eyes, facing you; brighter on the turn it will move
  const ex = look[0] * s * 0.06, ey = look[1] * s * 0.06 - s * 0.03;
  ctx.fillStyle = stunned ? "#6B4B55" : ready ? "#FF3140" : "#B0202C";
  ctx.shadowColor = "#FF2030";
  ctx.shadowBlur = stunned ? 0 : ready ? s * 0.3 : s * 0.12;
  const eyes = [[-0.07, -0.02, 0.03], [0.07, -0.02, 0.03], [-0.03, -0.07, 0.022], [0.03, -0.07, 0.022], [-0.1, -0.08, 0.016], [0.1, -0.08, 0.016]];
  for (const [x, y, r] of eyes) {
    ctx.beginPath();
    ctx.arc(ex + x * s, ey + y * s, r * s, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// Feet at the bottom of its tile; it stands well above the one behind.
export function drawLunger(ctx, cx, cy, s, { lit, t, aim, rest, stunned, alpha = 1 }) {
  ctx.save();
  const lean = aim ? 0.1 : 0;
  const tall = rest ? 1.2 : 1.55;
  ctx.translate(cx, cy + s * 0.42);
  ctx.globalAlpha = alpha;
  if (aim) ctx.rotate((aim.dx || 0) * lean);
  const sway = Math.sin(t / 700) * s * 0.02;
  const top = -tall * s;

  // body: a long thin wedge
  ctx.fillStyle = lit ? "#1B1720" : "#0C0A10";
  ctx.strokeStyle = lit ? "#77708A" : "#3A3548";
  ctx.lineWidth = Math.max(1.5, s * 0.035);
  ctx.beginPath();
  ctx.moveTo(-s * 0.13, 0);
  ctx.lineTo(-s * 0.09 + sway, top + s * 0.34);
  ctx.lineTo(s * 0.09 + sway, top + s * 0.34);
  ctx.lineTo(s * 0.13, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // arms to the knees, fingers splayed
  ctx.strokeStyle = lit ? "#8A839C" : "#403A50";
  ctx.lineWidth = Math.max(1.2, s * 0.03);
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const reach = aim ? s * 0.08 : 0;
    const hx = side * (s * 0.22 + reach), hy = -s * 0.25 + (rest ? s * 0.08 : 0);
    ctx.beginPath();
    ctx.moveTo(side * s * 0.09 + sway, top + s * 0.4);
    ctx.quadraticCurveTo(side * s * 0.24, top + s * 0.8, hx, hy);
    ctx.stroke();
    for (let f = -1; f <= 1; f++) {
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + side * s * 0.03 + f * s * 0.03, hy + s * 0.1);
      ctx.stroke();
    }
  }

  // head: a pale, too-long mask
  const hx = sway + (aim ? (aim.dx || 0) * s * 0.05 : 0);
  const hy = top + s * 0.18 + (rest ? s * 0.06 : 0) + (aim ? (aim.dy || 0) * s * 0.04 : 0);
  ctx.fillStyle = lit ? "#D9D4E2" : "#6E687C";
  ctx.beginPath();
  ctx.ellipse(hx, hy, s * 0.11, s * 0.17, rest ? 0.35 : 0, 0, TAU);
  ctx.fill();

  if (aim && !stunned) {
    // one wide eye, open only while it is aimed at you
    const pulse = 0.85 + Math.sin(t / 70) * 0.15;
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "#FF2A3A";
    ctx.shadowBlur = s * 0.45 * pulse;
    ctx.beginPath();
    ctx.arc(hx, hy - s * 0.02, s * 0.075, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#D0101E";
    ctx.beginPath();
    ctx.arc(hx + (aim.dx || 0) * s * 0.03, hy - s * 0.02 + (aim.dy || 0) * s * 0.03, s * 0.035, 0, TAU);
    ctx.fill();
  } else {
    // two slits
    ctx.strokeStyle = "#0A080E";
    ctx.lineWidth = Math.max(1.2, s * 0.025);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + side * s * 0.03, hy - s * 0.03);
      ctx.lineTo(hx + side * s * 0.075, hy - s * 0.045);
      ctx.stroke();
    }
    if (!lit) {
      ctx.fillStyle = "#BFB8D0";
      ctx.shadowColor = "#BFB8D0";
      ctx.shadowBlur = s * 0.15;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(hx + side * s * 0.055, hy - s * 0.04, s * 0.012, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

export function drawPlayer(ctx, cx, cy, s, { t, oil }) {
  ctx.save();
  ctx.translate(cx, cy);
  // cloak
  ctx.fillStyle = "#2B2433";
  ctx.strokeStyle = "#E7B26A";
  ctx.lineWidth = Math.max(1.5, s * 0.035);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.34);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.28, -s * 0.2, s * 0.02);
  ctx.lineTo(-s * 0.24, s * 0.36);
  ctx.lineTo(s * 0.18, s * 0.36);
  ctx.lineTo(s * 0.16, s * 0.02);
  ctx.quadraticCurveTo(s * 0.18, -s * 0.28, 0, -s * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // hood opening
  ctx.fillStyle = "#0B090E";
  ctx.beginPath();
  ctx.ellipse(-s * 0.01, -s * 0.16, s * 0.085, s * 0.1, 0, 0, TAU);
  ctx.fill();

  // lantern, held out to the right
  const lx = s * 0.22, ly = s * 0.08;
  ctx.strokeStyle = "#8A6A40";
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath();
  ctx.moveTo(s * 0.12, -s * 0.02);
  ctx.lineTo(lx, ly - s * 0.1);
  ctx.stroke();
  ctx.fillStyle = "#3A2C1C";
  ctx.fillRect(lx - s * 0.07, ly - s * 0.1, s * 0.14, s * 0.2);
  if (oil > 0) {
    const f = flicker(t, oil);
    ctx.fillStyle = `rgba(255,${190 + Math.round(40 * f)},110,1)`;
    ctx.shadowColor = "#FFB040";
    ctx.shadowBlur = s * 0.5 * f;
    ctx.beginPath();
    ctx.ellipse(lx, ly, s * 0.04, s * 0.07 * f, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// Steady when the lantern is full, ragged when it is nearly dry.
export function flicker(t, oil) {
  const calm = Math.sin(t / 110) * 0.04 + Math.sin(t / 47) * 0.03;
  if (oil >= 5) return 1 + calm;
  const ragged = (Math.sin(t / 23) * Math.sin(t / 61) > 0.55 ? -0.35 : 0) + Math.sin(t / 31) * 0.1;
  return Math.max(0.35, 1 + calm + ragged);
}

export function drawKey(ctx, cx, cy, s, t) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.6);
  ctx.strokeStyle = "#FFD36B";
  ctx.fillStyle = "#FFD36B";
  ctx.shadowColor = "#FFC23A";
  ctx.shadowBlur = s * (0.25 + Math.sin(t / 260) * 0.1);
  ctx.lineWidth = Math.max(2, s * 0.06);
  ctx.beginPath();
  ctx.arc(-s * 0.14, 0, s * 0.1, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.04, 0);
  ctx.lineTo(s * 0.22, 0);
  ctx.moveTo(s * 0.14, 0);
  ctx.lineTo(s * 0.14, s * 0.08);
  ctx.moveTo(s * 0.21, 0);
  ctx.lineTo(s * 0.21, s * 0.1);
  ctx.stroke();
  ctx.restore();
}

export function drawFlask(ctx, cx, cy, s, t) {
  ctx.save();
  ctx.translate(cx, cy + s * 0.04);
  ctx.fillStyle = "#3A2A18";
  ctx.strokeStyle = "#C88A3A";
  ctx.lineWidth = Math.max(1.5, s * 0.035);
  ctx.beginPath();
  ctx.moveTo(-s * 0.05, -s * 0.24);
  ctx.lineTo(s * 0.05, -s * 0.24);
  ctx.lineTo(s * 0.05, -s * 0.12);
  ctx.quadraticCurveTo(s * 0.2, -s * 0.06, s * 0.18, s * 0.12);
  ctx.quadraticCurveTo(s * 0.16, s * 0.22, 0, s * 0.22);
  ctx.quadraticCurveTo(-s * 0.16, s * 0.22, -s * 0.18, s * 0.12);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.06, -s * 0.05, -s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#FFB54A";
  ctx.shadowColor = "#FFA030";
  ctx.shadowBlur = s * (0.3 + Math.sin(t / 340) * 0.1);
  ctx.beginPath();
  ctx.moveTo(-s * 0.15, s * 0.06);
  ctx.quadraticCurveTo(0, s * 0.02, s * 0.15, s * 0.06);
  ctx.quadraticCurveTo(s * 0.14, s * 0.19, 0, s * 0.19);
  ctx.quadraticCurveTo(-s * 0.14, s * 0.19, -s * 0.15, s * 0.06);
  ctx.fill();
  ctx.restore();
}

// The way down: a black hole in the floor with steps, lit from below once
// you hold the key.
export function drawStairs(ctx, x0, y0, s, open, t) {
  ctx.save();
  const p = s * 0.12;
  ctx.fillStyle = "#010102";
  ctx.fillRect(x0 + p, y0 + p, s - 2 * p, s - 2 * p);
  for (let i = 0; i < 4; i++) {
    const inset = p + i * s * 0.07;
    ctx.strokeStyle = open ? `rgba(150,255,190,${0.55 - i * 0.12})` : `rgba(120,110,140,${0.4 - i * 0.08})`;
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.strokeRect(x0 + inset, y0 + inset, s - 2 * inset, s - 2 * inset);
  }
  if (open) {
    ctx.shadowColor = "#7DFFB0";
    ctx.shadowBlur = s * (0.4 + Math.sin(t / 300) * 0.15);
    ctx.strokeStyle = "#9CFFC4";
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.strokeRect(x0 + p, y0 + p, s - 2 * p, s - 2 * p);
  } else {
    // chained shut
    ctx.strokeStyle = "#6E6680";
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(x0 + p, y0 + p);
    ctx.lineTo(x0 + s - p, y0 + s - p);
    ctx.moveTo(x0 + s - p, y0 + p);
    ctx.lineTo(x0 + p, y0 + s - p);
    ctx.stroke();
  }
  ctx.restore();
}

// ── the moment it gets you ───────────────────────────────────────────────────
// Full screen, for about a second. `k` runs 0 → 1 over the scare.
export function drawScare(ctx, W, H, kind, t, k) {
  // It rushes at you: a hard white frame, then the face, cutting to black
  // for a frame now and then as if the light is failing.
  const jx = (Math.random() - 0.5) * 16 * (1 - k * 0.6);
  const jy = (Math.random() - 0.5) * 16 * (1 - k * 0.6);
  ctx.save();
  ctx.fillStyle = k < 0.06 ? "#FFFFFF" : "#000000";
  ctx.fillRect(0, 0, W, H);
  if (k < 0.06 || (k < 0.45 && Math.random() < 0.12)) { ctx.restore(); return; }
  ctx.translate(W / 2 + jx, H * 0.46 + jy);
  const zoom = 0.78 + (1 - Math.pow(1 - Math.min(1, k * 2.2), 3)) * 0.42;
  const S = Math.min(W, H * 0.7) * zoom;
  ctx.scale(S, S);

  if (kind === "shade") {
    // a long, gaunt mask, lit from below
    const g = ctx.createRadialGradient(0, 0.18, 0.02, 0, 0, 0.7);
    g.addColorStop(0, "#E9E5EE");
    g.addColorStop(0.55, "#9C97A8");
    g.addColorStop(1, "#1A1820");
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU;
      const wob = 1 + Math.sin(a * 5 + 1.3) * 0.025 + Math.sin(a * 11) * 0.012;
      const x = Math.cos(a) * 0.34 * wob * (Math.sin(a) > 0 ? 0.82 : 1);   // narrower at the chin
      const y = Math.sin(a) * 0.62 * wob;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // sunken sockets, drooping outward
    ctx.fillStyle = "#000";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 0.03, -0.2);
      ctx.quadraticCurveTo(side * 0.14, -0.33, side * 0.25, -0.16);
      ctx.quadraticCurveTo(side * 0.2, 0.02, side * 0.1, 0.0);
      ctx.quadraticCurveTo(side * 0.02, -0.06, side * 0.03, -0.2);
      ctx.fill();
      // what runs out of them
      ctx.strokeStyle = "rgba(0,0,0,.85)";
      ctx.lineCap = "round";
      for (const [dx, len, w] of [[0.1, 0.22, 0.014], [0.16, 0.13, 0.009], [0.2, 0.3, 0.007]]) {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(side * dx, -0.02);
        ctx.lineTo(side * (dx + 0.01), -0.02 + len * (0.6 + k * 0.4));
        ctx.stroke();
      }
    }
    // pinprick pupils, both on you
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "#FFFFFF";
    ctx.shadowBlur = 18;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * 0.135, -0.13, 0.012, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // the mouth keeps opening
    const open = 0.2 + k * 0.16 + Math.sin(t / 40) * 0.01;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(-0.05, 0.16);
    ctx.quadraticCurveTo(0, 0.12, 0.05, 0.16);
    ctx.quadraticCurveTo(0.09, 0.16 + open * 0.6, 0.02, 0.16 + open);
    ctx.lineTo(-0.02, 0.16 + open);
    ctx.quadraticCurveTo(-0.09, 0.16 + open * 0.6, -0.05, 0.16);
    ctx.fill();
  } else if (kind === "crawler") {
    ctx.strokeStyle = "#2A1820";
    ctx.lineWidth = 0.035;
    ctx.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.2, Math.sin(a) * 0.2);
      ctx.quadraticCurveTo(Math.cos(a + 0.4) * 0.6, Math.sin(a + 0.4) * 0.6, Math.cos(a) * 0.95, Math.sin(a) * 0.95);
      ctx.stroke();
    }
    ctx.fillStyle = "#140A0F";
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.3, 0.26, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#FF2233";
    ctx.shadowColor = "#FF0015";
    ctx.shadowBlur = 40;
    const eyes = [[-0.1, -0.05, 0.055], [0.1, -0.05, 0.055], [-0.04, -0.14, 0.04], [0.04, -0.14, 0.04], [-0.18, -0.12, 0.03], [0.18, -0.12, 0.03], [0, 0.03, 0.03], [-0.14, 0.05, 0.022], [0.14, 0.05, 0.022]];
    for (const [x, y, r] of eyes) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#C9B8A8";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 0.05, 0.14);
      ctx.quadraticCurveTo(side * 0.12, 0.26, side * 0.02, 0.34 + k * 0.04);
      ctx.lineTo(side * 0.03, 0.2);
      ctx.fill();
    }
  } else if (kind === "lunger") {
    // the too-long mask, leaning in, with the one eye that opens to aim
    const g = ctx.createLinearGradient(0, -0.6, 0, 0.7);
    g.addColorStop(0, "#3A3444");
    g.addColorStop(0.35, "#D8D3E0");
    g.addColorStop(1, "#15121A");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0.05, 0.28, 0.66, 0, 0, TAU);
    ctx.fill();
    // a thin mouth, far too low
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(-0.12, 0.44);
    ctx.quadraticCurveTo(0, 0.47 + k * 0.05, 0.12, 0.44);
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "#FF1E30";
    ctx.shadowBlur = 60;
    ctx.beginPath();
    ctx.arc(0, -0.08, 0.2, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(200,20,30,.7)";
    ctx.lineWidth = 0.008;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.19, -0.08 + Math.sin(a) * 0.19);
      ctx.lineTo(Math.cos(a + 0.2) * 0.1, -0.08 + Math.sin(a + 0.2) * 0.1);
      ctx.stroke();
    }
    ctx.fillStyle = "#C0101C";
    ctx.beginPath();
    ctx.arc(0, -0.08, 0.09 - k * 0.03, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(0, -0.08, 0.04 - k * 0.015, 0, TAU);
    ctx.fill();
  } else {
    // the dark: eyes opening everywhere, more every instant
    const n = Math.floor(6 + k * 40);
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "#C8D2FF";
    ctx.shadowBlur = 16;
    for (let i = 0; i < n; i++) {
      const x = Math.sin(i * 12.9898) * 0.5, y = Math.sin(i * 78.233) * 0.7;
      const r = 0.008 + (i % 3) * 0.004;
      ctx.beginPath();
      ctx.arc(x - r * 2.2, y, r, 0, TAU);
      ctx.arc(x + r * 2.2, y, r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
  // red wash
  ctx.fillStyle = `rgba(150,0,12,${0.25 + Math.sin(t / 60) * 0.08})`;
  ctx.fillRect(0, 0, W, H);
}
