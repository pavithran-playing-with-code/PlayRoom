// src/components/games/towerArt.js
// How Tower Guard looks: the map, every tower at every level, the monsters,
// the shots and the little bursts. Plain canvas calls, no React — the game
// (TowerGuard.jsx) decides what to draw where, this draws it.
//
// A tower is a plain badge — its icon on a stone base, its builder's colour
// round it — and its level shows as stars and a bronze, silver or gold rim.
// Shots are simple: an arrow, a lobbed ball and its burst, a frost beam.
import { W, H, TOWERS } from "../together/towerCore.mjs";

const TAU = Math.PI * 2;
const INK = "#2E2140";

export function emoji(ctx, e, x, y, size) {
  ctx.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(e, x, y + size * 0.05);
}
function rr(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
}
const shade = (ctx, cx, cy, rx, ry, a = 0.28) => { ctx.fillStyle = `rgba(30,40,20,${a})`; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill(); };

// ── the map ──────────────────────────────────────────────────────────────────
export function paintMap(map, T, seed) {
  const c = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = W * T * dpr; c.height = H * T * dpr;
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  let r = Math.abs(Number(seed) || 7) % 99991 + 11;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  // grass: soft checks, darker tufts, little flowers
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    ctx.fillStyle = (x + y) % 2 ? "#8FD266" : "#86C95D";
    ctx.fillRect(x * T, y * T, T, T);
  }
  for (let i = 0; i < 110; i++) {
    const x = rnd() * W * T, y = rnd() * H * T;
    ctx.strokeStyle = "rgba(50,110,35,.4)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2.5, y - 5); ctx.moveTo(x, y); ctx.lineTo(x + 2.5, y - 5); ctx.moveTo(x, y); ctx.lineTo(x, y - 6); ctx.stroke();
  }
  const petals = ["#FFFFFF", "#FFD6E8", "#FFE680", "#C9A3F5"];
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W * T, y = rnd() * H * T, p = petals[i % petals.length];
    for (let k = 0; k < 5; k++) { ctx.fillStyle = p; ctx.beginPath(); ctx.arc(x + Math.cos(k * 1.26) * 2.2, y + Math.sin(k * 1.26) * 2.2, 1.6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "#FFC53D"; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill();
  }
  // the road: an edge, sand, and cobbles set in it
  const pts = map.path.map(([x, y]) => [(x + 0.5) * T, (y + 0.5) * T]);
  const line = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(60,90,30,.35)"; ctx.lineWidth = T * 1.02; line(); ctx.stroke();
  ctx.strokeStyle = "#B88A55"; ctx.lineWidth = T * 0.9; line(); ctx.stroke();
  ctx.strokeStyle = "#E9CC93"; ctx.lineWidth = T * 0.74; line(); ctx.stroke();
  for (const k of map.road) {
    const tx = (k % W) * T, ty = Math.floor(k / W) * T;
    for (let i = 0; i < 4; i++) {
      const x = tx + T * (0.2 + rnd() * 0.6), y = ty + T * (0.2 + rnd() * 0.6);
      ctx.fillStyle = "rgba(180,140,90,.45)";
      ctx.beginPath(); ctx.ellipse(x, y, T * 0.07, T * 0.05, rnd() * 3, 0, TAU); ctx.fill();
    }
  }
  // rocks here and there off the road
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
    if (map.road.has(y * W + x) || map.trees.has(y * W + x)) continue;
    const px = (x + 0.2 + rnd() * 0.6) * T, py = (y + 0.3 + rnd() * 0.5) * T;
    shade(ctx, px, py + T * 0.06, T * 0.12, T * 0.04);
    ctx.fillStyle = "#A9A9B3"; ctx.beginPath(); ctx.ellipse(px, py, T * 0.11, T * 0.08, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#C9C9D1"; ctx.beginPath(); ctx.ellipse(px - T * 0.03, py - T * 0.025, T * 0.05, T * 0.03, 0, 0, TAU); ctx.fill();
  }
  // trees: a shadow, a trunk, two greens
  for (const k of map.trees) {
    const cx = (k % W + 0.5) * T, cy = (Math.floor(k / W) + 0.5) * T;
    shade(ctx, cx + T * 0.05, cy + T * 0.32, T * 0.32, T * 0.1, 0.3);
    ctx.fillStyle = "#7A4A2A"; ctx.fillRect(cx - T * 0.05, cy + T * 0.05, T * 0.1, T * 0.28);
    ctx.fillStyle = "#2F8F3E"; ctx.beginPath(); ctx.arc(cx, cy - T * 0.05, T * 0.34, 0, TAU); ctx.fill();
    ctx.fillStyle = "#45B055"; ctx.beginPath(); ctx.arc(cx - T * 0.08, cy - T * 0.13, T * 0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy - T * 0.05, T * 0.34, 0, TAU); ctx.stroke();
  }
  // the cave they come out of
  const [sx] = pts[0];
  ctx.fillStyle = "#5B5466"; ctx.beginPath(); ctx.arc(sx, 0, T * 0.75, 0, Math.PI); ctx.fill();
  ctx.fillStyle = "#1E1A26"; ctx.beginPath(); ctx.arc(sx, 0, T * 0.55, 0, Math.PI); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, 0, T * 0.75, 0, Math.PI); ctx.stroke();
  return c;
}

// The cave's eyes blink; drawn live over the map.
export function caveEyes(ctx, map, T, t) {
  const sx = (map.path[0][0] + 0.5) * T;
  if (Math.sin(t * 1.3) > 0.92) return;                   // a blink
  ctx.fillStyle = "#FF5A5F";
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(sx + d * T * 0.13, T * 0.2, T * 0.045, 0, TAU); ctx.fill(); }
}

// The castle, the worse for wear as lives go.
export function castle(ctx, map, T, t, lives, max) {
  const cx = (map.castle.x + 0.5) * T, by = (map.castle.y + 0.95) * T, w = T * 1.15, h = T * 0.95;
  shade(ctx, cx, by, w * 0.6, T * 0.14, 0.32);
  const wall = "#D8D3E6", dark = "#A79FBF";
  ctx.fillStyle = wall; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  rr(ctx, cx - w / 2, by - h * 0.62, w, h * 0.62, 4); ctx.fill(); ctx.stroke();
  for (const side of [-1, 1]) {
    const tx = cx + side * w * 0.42;
    ctx.fillStyle = wall; rr(ctx, tx - T * 0.17, by - h, T * 0.34, h, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#E85D75"; ctx.beginPath(); ctx.moveTo(tx - T * 0.21, by - h); ctx.lineTo(tx, by - h - T * 0.32); ctx.lineTo(tx + T * 0.21, by - h); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // battlements
  ctx.fillStyle = dark;
  for (let i = -2; i <= 2; i++) ctx.fillRect(cx + i * T * 0.12 - T * 0.04, by - h * 0.62 - T * 0.08, T * 0.08, T * 0.08);
  // the gate
  ctx.fillStyle = "#5B3A6E"; ctx.beginPath(); ctx.moveTo(cx - T * 0.13, by); ctx.lineTo(cx - T * 0.13, by - T * 0.22); ctx.arc(cx, by - T * 0.22, T * 0.13, Math.PI, 0); ctx.lineTo(cx + T * 0.13, by); ctx.closePath(); ctx.fill(); ctx.stroke();
  // the flag
  const fx = cx, fy = by - h * 0.62 - T * 0.1;
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - T * 0.5); ctx.stroke();
  ctx.fillStyle = lives / max > 0.35 ? "#FFC53D" : "#FF6B6B";
  ctx.beginPath(); ctx.moveTo(fx, fy - T * 0.5);
  for (let k = 0; k <= 6; k++) ctx.lineTo(fx + (k / 6) * T * 0.36, fy - T * 0.5 + Math.sin(t * 6 + k) * T * 0.025 + (k / 6) * T * 0.05);
  ctx.lineTo(fx + T * 0.36, fy - T * 0.3); ctx.lineTo(fx, fy - T * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
  // damage: cracks, then smoke
  const hurt = 1 - lives / max;
  if (hurt > 0.25) { ctx.strokeStyle = "rgba(46,33,64,.6)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - w * 0.3, by - h * 0.5); ctx.lineTo(cx - w * 0.2, by - h * 0.35); ctx.lineTo(cx - w * 0.27, by - h * 0.2); ctx.stroke(); }
  if (hurt > 0.5) {
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.5 + i / 4) % 1;
      ctx.fillStyle = `rgba(90,90,100,${0.45 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(cx + w * 0.35 + Math.sin(t + i) * 4, by - h - k * T * 0.9, T * (0.08 + k * 0.14), 0, TAU); ctx.fill();
    }
  }
}

// level stars under a tower
function stars(ctx, cx, y, n, T) {
  for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * T * 0.2, r = T * 0.085;
    ctx.fillStyle = "#FFC53D"; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rad = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

function snowflake(ctx, x, y, r) {
  ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1.2;
  for (let k = 0; k < 3; k++) { const a = (k * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke(); }
}

// One tower: kind, level 1–3, the way it last shot, the builder's colour.
// `pop` (0..1) is a level-up / build bounce.
export function drawTower(ctx, kind, level, cx, cy, T, t, aim, colour, pop = 0) {
  const def = TOWERS[kind], s = 1 + pop * 0.25, y = cy + T * 0.1;
  ctx.save();
  ctx.translate(cx, y); ctx.scale(s, s);
  shade(ctx, 0, T * 0.3, T * 0.36, T * 0.12, 0.25);
  // the base: stone, its rim bronze, silver or gold by level, the builder's colour inside it
  ctx.fillStyle = "#D9D2C5"; ctx.strokeStyle = LEVEL_RIM[level - 1] || INK; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(0, T * 0.06, T * 0.38, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = colour; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, T * 0.06, T * 0.3, 0, TAU); ctx.stroke();
  // the barrel, pointing where it last shot
  ctx.save(); ctx.rotate(aim || -Math.PI / 2);
  ctx.fillStyle = def.colour; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.fillRect(0, -T * 0.07, T * 0.36, T * 0.14); ctx.strokeRect(0, -T * 0.07, T * 0.36, T * 0.14);
  ctx.restore();
  ctx.fillStyle = def.colour; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, T * 0.25, 0, TAU); ctx.fill(); ctx.stroke();
  emoji(ctx, def.icon, 0, 0, T * 0.38);
  ctx.restore();
  stars(ctx, cx, y + T * 0.42, level, T);
}
const LEVEL_RIM = ["#B07A45", "#AEB6C2", "#FFC53D"];

// ── monsters ─────────────────────────────────────────────────────────────────
export function drawMonster(ctx, kind, x, y, T, t, id, hp, slowed, flash) {
  const bob = Math.sin(t * 8 + id) * T * 0.04;
  shade(ctx, x, y + T * 0.24, T * (kind === "dragon" ? 0.4 : 0.24), T * 0.08, 0.28);
  ctx.save();
  if (kind === "slime") {
    const sq = 1 + Math.sin(t * 9 + id) * 0.09;
    const g = ctx.createRadialGradient(x - T * 0.08, y - T * 0.05, T * 0.02, x, y + T * 0.05, T * 0.3);
    g.addColorStop(0, slowed ? "#D6F3FF" : "#B8F2A0"); g.addColorStop(1, slowed ? "#6FB7E0" : "#4FB33D");
    ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y + T * 0.08, T * 0.25 * sq, (T * 0.21) / sq, 0, Math.PI, 0);
    ctx.quadraticCurveTo(x + T * 0.25 * sq, y + T * 0.16, x, y + T * 0.15); ctx.quadraticCurveTo(x - T * 0.25 * sq, y + T * 0.16, x - T * 0.25 * sq, y + T * 0.08);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.ellipse(x - T * 0.1, y - T * 0.04, T * 0.05, T * 0.03, -0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = INK;
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(x + d * T * 0.08, y + T * 0.02, T * 0.035, 0, TAU); ctx.fill(); }
  } else if (kind === "bat") {
    const flap = Math.sin(t * 22 + id) * 0.6, by = y - T * 0.12 + bob;
    ctx.fillStyle = slowed ? "#6F8FB0" : "#5B3A6E"; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x, by);
      ctx.quadraticCurveTo(x + d * T * 0.2, by - T * (0.18 + flap * 0.12), x + d * T * 0.34, by - T * flap * 0.1);
      ctx.lineTo(x + d * T * 0.24, by + T * 0.05); ctx.lineTo(x + d * T * 0.14, by + T * 0.01); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(x, by, T * 0.1, T * 0.12, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - T * 0.07, by - T * 0.08); ctx.lineTo(x - T * 0.04, by - T * 0.17); ctx.lineTo(x - T * 0.01, by - T * 0.09);
    ctx.moveTo(x + T * 0.07, by - T * 0.08); ctx.lineTo(x + T * 0.04, by - T * 0.17); ctx.lineTo(x + T * 0.01, by - T * 0.09); ctx.fill();
    ctx.fillStyle = "#FF4D4D"; for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(x + d * T * 0.035, by - T * 0.02, T * 0.022, 0, TAU); ctx.fill(); }
  } else if (kind === "ogre") {
    const step = Math.sin(t * 7 + id) * T * 0.03, oy = y + bob * 0.5;
    ctx.fillStyle = slowed ? "#9CC6C9" : "#8DA35A"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    // feet, body, belly
    ctx.beginPath(); ctx.ellipse(x - T * 0.1, oy + T * 0.22 + step, T * 0.07, T * 0.04, 0, 0, TAU); ctx.ellipse(x + T * 0.1, oy + T * 0.22 - step, T * 0.07, T * 0.04, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, oy + T * 0.05, T * 0.22, T * 0.2, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#C9B98A"; ctx.beginPath(); ctx.ellipse(x, oy + T * 0.09, T * 0.12, T * 0.1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#8A5A33"; ctx.fillRect(x - T * 0.22, oy + T * 0.1, T * 0.44, T * 0.06);
    // head with tusks
    ctx.fillStyle = slowed ? "#9CC6C9" : "#8DA35A";
    ctx.beginPath(); ctx.arc(x, oy - T * 0.17, T * 0.12, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#FFFFFF"; for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + d * T * 0.05, oy - T * 0.12); ctx.lineTo(x + d * T * 0.07, oy - T * 0.2); ctx.lineTo(x + d * T * 0.02, oy - T * 0.13); ctx.fill(); }
    ctx.fillStyle = INK; for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(x + d * T * 0.045, oy - T * 0.2, T * 0.02, 0, TAU); ctx.fill(); }
    // the club
    ctx.save(); ctx.translate(x + T * 0.22, oy); ctx.rotate(-0.6 + Math.sin(t * 5 + id) * 0.25);
    ctx.fillStyle = "#7A4A2A"; ctx.fillRect(-T * 0.025, -T * 0.25, T * 0.05, T * 0.25);
    ctx.beginPath(); ctx.ellipse(0, -T * 0.28, T * 0.06, T * 0.09, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  } else {
    // the dragon: big, with a red glow
    const g = ctx.createRadialGradient(x, y, T * 0.1, x, y, T * 0.7);
    g.addColorStop(0, "rgba(255,90,60,.35)"); g.addColorStop(1, "rgba(255,90,60,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, T * 0.7, 0, TAU); ctx.fill();
    if (slowed) { ctx.fillStyle = "rgba(143,216,245,.5)"; ctx.beginPath(); ctx.arc(x, y, T * 0.5, 0, TAU); ctx.fill(); }
    emoji(ctx, "🐉", x, y + bob, T * 0.95);
  }
  // hit: a white flash
  if (flash > 0) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = Math.min(1, flash) * 0.7;
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x - T * 0.5, y - T * 0.6, T, T * 1.1);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();
  if (slowed) snowflake(ctx, x + T * 0.2, y - T * 0.3, T * 0.06);
  if (hp < 100) {
    const w = kind === "dragon" ? T * 0.8 : T * 0.5, yy = y - T * (kind === "dragon" ? 0.6 : 0.42);
    ctx.fillStyle = "rgba(46,33,64,.85)"; rr(ctx, x - w / 2 - 1, yy - 1, w + 2, 6, 3); ctx.fill();
    ctx.fillStyle = hp > 50 ? "#8FDB5C" : hp > 25 ? "#FFC53D" : "#FF6B6B"; rr(ctx, x - w / 2, yy, Math.max(2, (w * hp) / 100), 4, 2); ctx.fill();
  }
}

// ── shots ────────────────────────────────────────────────────────────────────
// q: 0..1 through the shot's life.
export function drawShot(ctx, kind, level, x0, y0, x1, y1, q, T) {
  if (kind === "archer") {
    const k = Math.min(1, q * 2), hx = x0 + (x1 - x0) * k, hy = y0 + (y1 - y0) * k;
    ctx.strokeStyle = `rgba(90,60,30,${1 - q})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(hx - (x1 - x0) * 0.12, hy - (y1 - y0) * 0.12); ctx.lineTo(hx, hy); ctx.stroke();
  } else if (kind === "cannon") {
    if (q < 0.5) {
      const k = q * 2, hx = x0 + (x1 - x0) * k, hy = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * T * 0.6;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(hx, hy, T * 0.08, 0, TAU); ctx.fill();
    } else {
      const k = (q - 0.5) * 2;
      ctx.fillStyle = `rgba(255,163,108,${0.7 * (1 - k)})`; ctx.beginPath(); ctx.arc(x1, y1, T * (0.3 + 0.7 * k), 0, TAU); ctx.fill();
    }
  } else {
    ctx.strokeStyle = `rgba(143,216,245,${1 - q})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
}

// What a tower does, as little chips: for the shop and the upgrade sheet.
export function statChips(kind, st) {
  const t = TOWERS[kind];
  const out = [`⚔️ ${Math.round(st.dmg)}`, `📏 ${st.range.toFixed(1)}`, `⚡ ${st.rate.toFixed(1)}/s`];
  if (t.splash) out.push("💥 area");
  if (t.slow) out.push(`❄️ slows`);
  return out;
}
export function statLine(kind, st) {
  const t = TOWERS[kind];
  const bits = [`⚔️ ${Math.round(st.dmg)}`, `📏 ${st.range.toFixed(1)}`, `⚡ ${st.rate.toFixed(1)}/s`];
  if (t.splash) bits.push("💥 area");
  if (t.slow) bits.push(`❄️ −${Math.round(t.slow * 100)}%`);
  return bits.join(" · ");
}
