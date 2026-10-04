// src/components/horror/manorRender.js
// Drawing NANA'S LULLABY: a column raycaster for the halls, billboard sprites
// for everything in them, a minimap, and the full-screen moments (the map you
// memorise at the start, the thing's face when it gets you).
//
// Reads the sim and never writes to it. The map is for finding your way:
// every room with its name, the doors, the relics, the way out, you, your
// friends, and the demons wherever they are — nothing else. Tap it for a big
// one. Each room has its own wall colour, so you can tell where you are.
//
// The same picture serves solo and online. What it reads from `s`:
//   P        the body whose eyes we look through (x, y, fa, jz, cr, light...)
//   G        the nearest ghost: the danger glow, the red arrow
//   ghosts   every ghost to draw (solo: just G)
//   others   other players, online: [{ x, y, color, name, lit, cr, jz }]
//   exitOpen whether the far gate is open to you (solo: all relics taken)
//   bodies   the scare: bodies dropping from the ceiling, [{ x, y, t }]
//   rooms    which ROOM_KINDS each room is (names and wall colours)
// and a relic may carry a `color` (whose it is) and `mine: false`. P.hiding
// ({ kind }) means we are looking out from under a table or bed, or through
// the slats of a wardrobe.
import { HURDLE, BEAM, DOOR, SPOT, ROOM_KINDS, roomAt, spotKind, litBody, los } from "./manorCore.mjs";
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
export const STICK_R = 36;            // the walk ring: full speed at its edge
export const SPRINT_PX = 56;           // push the stick this far out and you run
export const YAW_PER_PX = 0.006;       // right thumb, sideways: radians per pixel
export const PITCH_PER_PX = 0.0024;    // right thumb, up/down: screen heights per pixel
export const PITCH_MAX = 0.32;

// A right-thumb drag, applied to a body: turn, and look up or down.
export function lookBy(body, dx, dy) {
  body.fa += dx * YAW_PER_PX;
  body.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, (body.pitch || 0) - dy * PITCH_PER_PX));
}
const PLANE = 0.65;                    // camera plane: ~66° field of view

// Nana Elowen. Small and bent, in a faded rose nightgown and a knitted
// shawl; grey hair pinned in a bun, wisps loose; round spectacles that
// catch the light. Walking and humming, her hands are folded and her eyes
// are shut in a sweet, terrible smile. When she comes for you (`angry`) her
// eyes open wide behind the glass, her mouth falls open, and her thin arms
// reach out. Now and then her head ticks to one side. `s` is her height on
// screen; (x, y) her middle.
export function drawGhost(ctx, x, y, s, angry, t = 0) {
  ctx.save();
  const ph = (t * 0.5) % 1, tick = ph < 0.06 ? Math.sin(ph * 90) * 0.12 : 0;
  const sway = Math.sin(t * 1.6) * s * 0.012;
  ctx.translate(x + sway, y + s * 0.04);
  const aura = ctx.createRadialGradient(0, -s * 0.1, s * 0.05, 0, -s * 0.1, s * 0.75);
  aura.addColorStop(0, angry ? "rgba(170,10,30,.35)" : "rgba(150,140,170,.18)");
  aura.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = aura;
  ctx.fillRect(-s, -s, s * 2, s * 1.8);

  // the nightgown: faded lavender, a little ragged at the hem, tiny flowers
  const gg = ctx.createLinearGradient(0, -s * 0.25, 0, s * 0.52);
  gg.addColorStop(0, "#d4c4e2");
  gg.addColorStop(1, "#7a688f");
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.moveTo(-s * 0.12, -s * 0.22);
  ctx.lineTo(s * 0.12, -s * 0.22);
  ctx.lineTo(s * 0.21, s * 0.48);
  for (let k = 0; k <= 8; k++) ctx.lineTo(s * 0.21 - (k * s * 0.42) / 8, s * (0.48 + (k % 2 ? 0.035 : 0)) + Math.sin(t * 2 + k) * s * 0.008);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(240,215,220,.35)";
  for (const [fx, fy] of [[-0.08, 0.05], [0.06, 0.12], [-0.03, 0.25], [0.11, 0.33], [-0.13, 0.38], [0.02, 0.42]]) {
    ctx.beginPath(); ctx.arc(s * fx, s * fy, s * 0.012, 0, TAU); ctx.fill();
  }
  // slippers
  ctx.fillStyle = "#5a4a4e";
  ctx.beginPath(); ctx.ellipse(-s * 0.07, s * 0.53, s * 0.05, s * 0.018, 0, 0, TAU); ctx.ellipse(s * 0.07, s * 0.53, s * 0.05, s * 0.018, 0, 0, TAU); ctx.fill();

  // arms: folded at her waist while she hums; reaching for you when she hunts
  ctx.strokeStyle = "#cfc6b8";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, s * 0.028);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.14, -s * 0.18);
    if (angry) ctx.quadraticCurveTo(side * s * 0.26, -s * 0.05, side * s * 0.2, -s * 0.2 + Math.sin(t * 6 + side) * s * 0.02);
    else ctx.quadraticCurveTo(side * s * 0.2, s * 0.02, side * s * 0.03, s * 0.06);
    ctx.stroke();
  }
  if (angry) {
    ctx.strokeStyle = "#2a1a1a"; ctx.lineWidth = Math.max(1, s * 0.008);
    for (const side of [-1, 1]) for (let f = -1; f <= 1; f++) {
      const hx = side * s * 0.2, hy = -s * 0.2;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + side * s * 0.035, hy - s * 0.035 + f * s * 0.02); ctx.stroke();
    }
  }

  // the shawl: knitted, plum, fringed
  ctx.fillStyle = "#5d4872";
  ctx.beginPath();
  ctx.moveTo(-s * 0.17, -s * 0.24);
  ctx.quadraticCurveTo(0, -s * 0.31, s * 0.17, -s * 0.24);
  ctx.lineTo(s * 0.06, -s * 0.02);
  ctx.lineTo(-s * 0.06, -s * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(40,45,35,.45)"; ctx.lineWidth = Math.max(0.8, s * 0.004);
  for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * s * 0.025, -s * 0.27); ctx.lineTo(k * s * 0.012, -s * 0.03); ctx.stroke(); }
  ctx.strokeStyle = "#5d4872";
  for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * s * 0.02, -s * 0.02); ctx.lineTo(k * s * 0.022, s * 0.03); ctx.stroke(); }
  // a knitting needle in one hand; in the other, her lantern, swinging, and its warm light
  ctx.strokeStyle = "#b9b4c0"; ctx.lineWidth = Math.max(1, s * 0.008);
  ctx.beginPath(); ctx.moveTo(s * 0.17, -s * 0.14); ctx.lineTo(s * 0.27, -s * 0.36); ctx.stroke();
  const swing = Math.sin(t * 2.2) * 0.12, lx = -s * 0.2 + Math.sin(swing) * s * 0.04, ly = s * 0.02;
  ctx.strokeStyle = "#3a2a18"; ctx.lineWidth = Math.max(1, s * 0.006);
  ctx.beginPath(); ctx.moveTo(-s * 0.19, -s * 0.06); ctx.lineTo(lx, ly - s * 0.05); ctx.stroke();
  ctx.fillStyle = "#3a2a18"; ctx.fillRect(lx - s * 0.035, ly - s * 0.05, s * 0.07, s * 0.09);
  ctx.fillStyle = `rgba(255,179,71,${0.85 + 0.15 * Math.sin(t * 11)})`; ctx.fillRect(lx - s * 0.025, ly - s * 0.035, s * 0.05, s * 0.06);
  const lg = ctx.createRadialGradient(lx, ly, 1, lx, ly, s * 0.7);
  lg.addColorStop(0, angry ? "rgba(255,90,60,.55)" : "rgba(255,170,70,.55)"); lg.addColorStop(1, "rgba(255,150,40,0)");
  ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = lg; ctx.fillRect(lx - s * 0.8, ly - s * 0.8, s * 1.6, s * 1.6); ctx.globalCompositeOperation = "source-over";

  // the head, bowed forward, ticking now and then
  ctx.save();
  ctx.translate(0, -s * 0.33);
  ctx.rotate(tick + (angry ? 0.05 : 0.12));
  // hair: grey, a bun on top, loose wisps
  ctx.fillStyle = "#a9a39b";
  ctx.beginPath(); ctx.ellipse(0, -s * 0.03, s * 0.085, s * 0.08, 0, Math.PI, 0); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -s * 0.105, s * 0.04, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(200,195,186,.8)"; ctx.lineWidth = Math.max(0.8, s * 0.004);
  for (const [wx, wl] of [[-0.08, 0.09], [0.075, 0.08], [-0.06, 0.06], [0.05, 0.1]]) {
    ctx.beginPath(); ctx.moveTo(s * wx, -s * 0.03); ctx.quadraticCurveTo(s * wx * 1.3 + Math.sin(t * 2 + wx * 20) * s * 0.01, s * 0.02, s * wx * 1.1, -s * 0.03 + s * wl); ctx.stroke();
  }
  // the face: pale, lined
  const fg = ctx.createRadialGradient(0, s * 0.01, s * 0.01, 0, s * 0.01, s * 0.09);
  fg.addColorStop(0, "#e8dccb");
  fg.addColorStop(1, "#a99a88");
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.ellipse(0, s * 0.015, s * 0.068, s * 0.085, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(90,70,60,.45)"; ctx.lineWidth = Math.max(0.7, s * 0.003);
  for (const ly of [-0.035, -0.025]) { ctx.beginPath(); ctx.moveTo(-s * 0.035, s * ly); ctx.quadraticCurveTo(0, s * (ly - 0.006), s * 0.035, s * ly); ctx.stroke(); }
  // eyes: shut and smiling while she hums; wide open when she hunts
  for (const side of [-1, 1]) {
    const ex = side * s * 0.027, ey = s * 0.0;
    if (angry) {
      ctx.fillStyle = "#f4efe6"; ctx.beginPath(); ctx.ellipse(ex, ey, s * 0.017, s * 0.014, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#120808"; ctx.beginPath(); ctx.arc(ex, ey, s * 0.004, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = "#3a2a24"; ctx.lineWidth = Math.max(0.8, s * 0.004);
      ctx.beginPath(); ctx.arc(ex, ey - s * 0.004, s * 0.012, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
  }
  // spectacles
  ctx.strokeStyle = "#8a7a55"; ctx.lineWidth = Math.max(0.8, s * 0.005);
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * s * 0.027, 0, s * 0.022, 0, TAU); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(-s * 0.006, -s * 0.002); ctx.lineTo(s * 0.006, -s * 0.002); ctx.stroke();
  // the mouth: a thin, sweet smile — or open, dark, a few teeth
  if (angry) {
    ctx.fillStyle = "#140608";
    ctx.beginPath(); ctx.ellipse(0, s * 0.052, s * 0.022, s * 0.03, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#d9cdb4";
    for (const tx of [-0.01, 0.004, 0.013]) { ctx.beginPath(); ctx.moveTo(s * tx, s * 0.025); ctx.lineTo(s * (tx + 0.005), s * 0.025); ctx.lineTo(s * (tx + 0.0025), s * 0.037); ctx.fill(); }
  } else {
    ctx.strokeStyle = "#5a3a34"; ctx.lineWidth = Math.max(0.8, s * 0.004);
    ctx.beginPath(); ctx.arc(0, s * 0.03, s * 0.022, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
  ghostEyes(ctx, x + sway, y + s * 0.04, s, angry, t, tick + (angry ? 0.05 : 0.12));
}

// Nana's face, filling the screen when she has you: her bun and grey hair,
// lined skin, the spectacles, the eyes red behind them, the mouth wide open.
export function nanaFace(ctx, cx, cy, s, t, W, H) {
  ctx.save();
  ctx.translate(cx, cy);
  const bg = ctx.createRadialGradient(0, 0, s * 0.1, 0, 0, s * 1.1);
  bg.addColorStop(0, "#401018"); bg.addColorStop(1, "#000");
  ctx.fillStyle = bg; ctx.fillRect(-W, -H, W * 2, H * 2);
  ctx.fillStyle = "#bcb7c2";
  ctx.beginPath(); ctx.ellipse(0, -s * 0.1, s * 0.42, s * 0.5, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -s * 0.6, s * 0.15, 0, TAU); ctx.fill();
  const fg = ctx.createRadialGradient(0, 0, s * 0.05, 0, 0, s * 0.45);
  fg.addColorStop(0, "#ece4ea"); fg.addColorStop(1, "#a79dac");
  ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.3, s * 0.4, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(60,45,70,.45)"; ctx.lineWidth = s * 0.008;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, -s * 0.2 - i * s * 0.03, s * 0.18, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(k * s * 0.2, s * 0.05); ctx.quadraticCurveTo(k * s * 0.17, s * 0.18, k * s * 0.1, s * 0.28); ctx.stroke(); }
  ctx.fillStyle = "#fff";
  for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * s * 0.13, -s * 0.08, s * 0.08, s * 0.06, 0, 0, TAU); ctx.fill(); }
  ctx.shadowColor = "#f02040"; ctx.shadowBlur = s * 0.08; ctx.fillStyle = "#ff2a44";
  for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(k * s * 0.13, -s * 0.08, s * 0.03, 0, TAU); ctx.fill(); }
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#2a2430"; ctx.lineWidth = s * 0.02;
  for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(k * s * 0.13, -s * 0.08, s * 0.095, 0, TAU); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(-s * 0.035, -s * 0.08); ctx.lineTo(s * 0.035, -s * 0.08); ctx.stroke();
  const mo = 1 + 0.18 * Math.sin(t * 35);
  ctx.fillStyle = "#050203"; ctx.beginPath(); ctx.ellipse(0, s * 0.2, s * 0.13, s * 0.13 * mo, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#e8e0cc";
  for (let i = -2; i <= 2; i++) ctx.fillRect(i * s * 0.04 - s * 0.015, s * 0.2 - s * 0.13 * mo, s * 0.03, s * 0.04);
  ctx.restore();
}
// Film grain over everything.
function grain(ctx, W, H, n, a) {
  for (let i = 0; i < n; i++) {
    const v = (Math.random() * 255) | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${a})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 1 + Math.random() * 2);
  }
}

// The light on her spectacles: the first thing you see of her in the dark,
// and red when she is coming for you.
export function ghostEyes(ctx, x, y, s, angry, t = 0, tilt = 0.12) {
  const glow = 0.65 + 0.35 * Math.sin(t * 3);
  ctx.save();
  ctx.translate(x, y - s * 0.33);
  ctx.rotate(tilt);
  ctx.shadowColor = angry ? "#ff1030" : "#fff2cc";
  ctx.shadowBlur = s * (angry ? 0.06 : 0.035);
  ctx.fillStyle = angry ? `rgba(255,40,50,${glow})` : `rgba(255,245,215,${glow * 0.8})`;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * s * 0.027 + s * 0.008, -s * 0.008, s * 0.007, s * 0.004, -0.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// Where the small map sits, and how big: shared with the pages, which open
// the big map when you tap it.
export function mapRect(view) {
  const { W, H, safeTop = 0 } = view;
  const size = Math.min(170, Math.min(W, H) * 0.42);
  return { x0: W - size - 14, y0: 16 + safeTop, size };
}

const roomOf = (s, k) => ROOM_KINDS[(s.rooms && s.rooms[k]) || 0];

// What you collect is a key: drawn as one in a badge of its owner's colour,
// on the map and on its distance marker.
export const RELIC_ICONS = ["🗝️"];
export const relicIcon = (i) => RELIC_ICONS[((i % RELIC_ICONS.length) + RELIC_ICONS.length) % RELIC_ICONS.length];

function relicBadge(ctx, x, y, rad, icon, color, alpha = 1, glow = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(20,12,8,.85)";
  ctx.lineWidth = Math.max(1, rad * 0.18);
  ctx.stroke();
  ctx.font = `${Math.round(rad * 1.35)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, x, y + rad * 0.06);
  ctx.restore();
}

// The map: rooms (each faintly its own colour, with its name), doors, the
// relics, the way out, you, your friends and the demons. Nothing else — no
// furniture, no barricades, no batteries.
function mini(ctx, s, x0, y0, size, intro, t, big = false) {
  const { N, g, relics, exitT, P } = s;
  const c = size / N, RN = (N - 1) / 8;
  ctx.fillStyle = big ? "rgba(5,4,8,.92)" : "rgba(0,0,0,.72)";
  ctx.fillRect(x0 - 5, y0 - 5, size + 10, size + 10);
  // floors, tinted by room
  for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
    const [r, gg, b] = roomOf(s, j * RN + i)[2];
    ctx.fillStyle = `rgb(${(110 + r * 0.25) | 0},${(92 + gg * 0.25) | 0},${(66 + b * 0.25) | 0})`;
    ctx.fillRect(x0 + (1 + i * 8) * c, y0 + (1 + j * 8) * c, 7 * c + 0.5, 7 * c + 0.5);
  }
  // walls; open doorways show as floor; shut doors as a bar in the wall
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = g[y][x];
      if (v === 0 || v === SPOT) {
        if (x % 8 === 0 || y % 8 === 0) { ctx.fillStyle = "#8a7552"; ctx.fillRect(x0 + x * c, y0 + y * c, c + 0.5, c + 0.5); }
        continue;
      }
      // furniture blocks inside a room are left off: only the room's walls
      if (v === 1 && x % 8 && y % 8) continue;
      ctx.fillStyle = "#2b2119";
      ctx.fillRect(x0 + x * c, y0 + y * c, c + 0.5, c + 0.5);
      if (v === DOOR) {
        const along = !g[y][x - 1] || !g[y][x + 1] ? "v" : "h";
        const th = Math.max(1.5, c * 0.5);
        ctx.fillStyle = "#c08848";
        if (along === "v") ctx.fillRect(x0 + x * c + (c - th) / 2, y0 + y * c, th, c + 0.5);
        else ctx.fillRect(x0 + x * c, y0 + y * c + (c - th) / 2, c + 0.5, th);
      }
    }
  }
  // room names
  const fs = Math.max(7, Math.min(big ? 16 : 10, 7 * c * 0.2));
  ctx.font = `bold ${fs}px Georgia`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
    const name = roomOf(s, j * RN + i)[big ? 0 : 1];
    const cx = x0 + (4.5 + i * 8) * c, cy = y0 + (4.5 + j * 8) * c;
    ctx.fillStyle = "rgba(30,20,12,.55)";
    ctx.fillText(name, cx, cy, 7 * c - 2);
  }
  ctx.textBaseline = "alphabetic";

  // the relics: each its own object in a badge; yours bob gently, others'
  // sit smaller and faded
  const rad = Math.max(big ? 11 : 6.5, c * (big ? 1.3 : 1.15));
  relics.forEach((r, i) => {
    if (r.got) return;
    const theirs = r.mine === false;
    const bob = theirs ? 0 : Math.sin(t * 3 + i) * rad * 0.15;
    relicBadge(ctx, x0 + r.x * c, y0 + r.y * c + bob, theirs ? rad * 0.75 : rad, relicIcon(i),
      r.color || "#ffdca0", theirs ? 0.5 : 1, theirs ? 0 : 6 + 4 * Math.sin(t * 4 + i));
  });
  // the way out
  ctx.fillStyle = exitOpen(s) ? "#5fd68a" : "#a33";
  ctx.fillRect(x0 + exitT.x * c - c * 0.3, y0 + exitT.y * c - c * 0.3, c * 1.6, c * 1.6);
  // the demons, always, pulsing red (not on the map you memorise: it hasn't moved yet)
  if (!intro) {
    const pulse = 0.75 + 0.25 * Math.sin(t * 8);
    for (const G of ghostsOf(s)) {
      if (G.x < 0) continue;                         // the stand-in before the first update
      // red with a white ring: no player dot has a ring, so it can't be
      // mistaken for a friend in red
      const gx = x0 + G.x * c, gy = y0 + G.y * c, gr = Math.max(3.5, c * 1.5);
      ctx.save();
      ctx.shadowColor = "#ff2040";
      ctx.shadowBlur = 8;
      ctx.fillStyle = `rgba(230,30,60,${pulse})`;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(gx, gy, gr + 1.5, 0, TAU);
      ctx.stroke();
    }
  }
  // everyone else, in their colours
  for (const o of s.others || []) {
    ctx.fillStyle = o.color;
    ctx.strokeStyle = "rgba(0,0,0,.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x0 + o.x * c, y0 + o.y * c, Math.max(2.5, c * 1.1), 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  // you, with the way you're facing
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x0 + P.x * c, y0 + P.y * c, Math.max(3, c * 1.1), 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0 + P.x * c, y0 + P.y * c);
  ctx.lineTo(x0 + (P.x + Math.cos(P.fa) * 3) * c, y0 + (P.y + Math.sin(P.fa) * 3) * c);
  ctx.stroke();
  if (!big && !intro) {
    ctx.fillStyle = "rgba(233,227,211,.55)";
    ctx.font = "9px Georgia";
    ctx.textAlign = "right";
    ctx.fillText("tap for big map", x0 + size, y0 + size + 14);
  }
}

// DDA ray from the player to the first wall.
function cast(s, rx, ry) {
  const { g, N, P } = s;
  let mx = P.x | 0, my = P.y | 0;
  const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
  let sx, sy, sdx, sdy;
  if (rx < 0) { sx = -1; sdx = (P.x - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - P.x) * ddx; }
  if (ry < 0) { sy = -1; sdy = (P.y - my) * ddy; } else { sy = 1; sdy = (my + 1 - P.y) * ddy; }
  let side = 0, n = 0;
  while (n++ < 64) {
    if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
    if (mx < 0 || my < 0 || mx >= N || my >= N) break;
    if (g[my][mx] && g[my][mx] !== SPOT) break;
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
  // hidden under a table or bed you're low on the floor
  const low = P.hiding && P.hiding.kind !== "wardrobe";
  const eye = low ? 0.14 : 0.5 + P.jz - P.cr * 0.26, L = litBody(P);
  const here = s.rooms ? roomOf(s, roomAt(s.N, P.x, P.y))[2] : [60, 44, 30];
  const fl = 0.92 + Math.sin(t * 7) * 0.05 + (Math.random() < 0.02 ? -0.25 * Math.random() : 0);

  ctx.fillStyle = "#050507";
  ctx.fillRect(0, 0, W, hz);
  const fg = ctx.createLinearGradient(0, hz, 0, H);
  fg.addColorStop(0, "#000");
  fg.addColorStop(1, L ? `rgb(${(here[0] * 0.3) | 0},${(here[1] * 0.3) | 0},${(here[2] * 0.3) | 0})` : "#0d0906");
  ctx.fillStyle = fg;
  ctx.fillRect(0, hz, W, H - hz);

  for (let i = 0; i < cols; i++) {
    const cam = 2 * (i + 0.5) / cols - 1, h = cast(s, dx + plx * cam, dy + ply * cam), pd = h.d;
    zb[i] = pd;
    let b = 0.03 + Math.max(0, 1 - pd / 2.2) * (L ? 0.32 : 0.18) +
      (L ? Math.pow(Math.max(0, 1 - pd / 7.5), 1.4) * (1 - Math.abs(cam) * 0.45) * fl : 0);
    // each room its own colour: the room on our side of the wall we hit
    let col = s.rooms ? roomOf(s, roomAt(s.N, P.x + (dx + plx * cam) * (pd - 0.02), P.y + (dy + ply * cam) * (pd - 0.02)))[2] : [96, 74, 56];
    const isEx = h.mx === exitT.x && h.my === exitT.y, isEn = h.mx === 0 && h.my === 1;
    const sealed = isEn;
    const tv = h.my >= 0 && h.my < s.N && h.mx >= 0 && h.mx < s.N ? s.g[h.my][h.mx] : 1;
    const plain = !isEx && !isEn && tv !== DOOR;
    // the front door: dark and locked, or warm light round it once unlocked
    if (isEx) { col = exitOpen(s) ? [30, 100, 52] : [70, 46, 34]; b = Math.max(b, 0.35) + 0.25 * Math.max(0, 1 - pd / 14); }
    else if (isEn) col = [220, 190, 120];
    else if (tv === DOOR) col = [130, 84, 44];
    else if (((h.mx * 7 + h.my * 13) & 3) === 0) col = col.map((v) => v * 0.88);
    if (h.side) b *= 0.72;
    if (plain && (h.u * 3 % 1) < 0.05) b *= 0.55;
    if (sealed && (h.u * 5 % 1) < 0.35) b *= 0.25;
    b = Math.min(1, b);
    const lh = H / pd, ds = hz - lh * (1 - eye);
    ctx.fillStyle = `rgb(${(col[0] * b) | 0},${(col[1] * b) | 0},${(col[2] * b) | 0})`;
    ctx.fillRect(i * cw, ds, cw + 1, lh);
    if (isEx) {
      // the front door: planks, and down the middle a light for every lock — red, then green
      const open = exitOpen(s), kn = Math.min(5, s.keysNeed ?? s.need ?? 3), kg = s.keysGot ?? s.count ?? 0;
      ctx.fillStyle = "rgba(0,0,0,.35)";
      for (let k = 0; k < 5; k++) ctx.fillRect(i * cw, ds + lh * (0.08 + k * 0.19), cw + 1, lh * 0.03);
      if (h.u < 0.07 || h.u > 0.93) { ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(i * cw, ds, cw + 1, lh); }
      if (h.u > 0.4 && h.u < 0.6) {
        for (let k = 0; k < kn; k++) {
          const got = kg > k, mb = Math.max(b, 0.55);
          ctx.fillStyle = got ? `rgb(${(90 * mb) | 0},${(255 * mb) | 0},${(140 * mb) | 0})` : `rgb(${(170 * Math.max(b, 0.35)) | 0},25,30)`;
          ctx.fillRect(i * cw, ds + lh * (0.25 + (k * 0.5) / kn), cw + 1, lh * (0.3 / kn));
        }
      }
      if (open) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(60,255,130,${0.22 * (0.75 + 0.25 * Math.sin(t * 4))})`;
        ctx.fillRect(i * cw, ds, cw + 1, lh);
        ctx.globalCompositeOperation = "source-over";
      }
    } else if (tv === DOOR && !isEn) {
      // a door: dark jambs at the edges, two sunk panels, a brass handle
      ctx.fillStyle = "rgba(0,0,0,.45)";
      if (h.u < 0.07 || h.u > 0.93) ctx.fillRect(i * cw, ds, cw + 1, lh);
      else {
        if ((h.u > 0.18 && h.u < 0.21) || (h.u > 0.62 && h.u < 0.65)) {
          ctx.fillRect(i * cw, ds + lh * 0.1, cw + 1, lh * 0.33);
          ctx.fillRect(i * cw, ds + lh * 0.55, cw + 1, lh * 0.35);
        } else if (h.u > 0.21 && h.u < 0.62) {
          for (const f of [0.1, 0.42, 0.55, 0.88]) ctx.fillRect(i * cw, ds + lh * f, cw + 1, Math.max(1, lh * 0.02));
        }
        if (h.u > 0.74 && h.u < 0.84) {
          ctx.fillStyle = `rgb(${(240 * b) | 0},${(200 * b) | 0},${(90 * b) | 0})`;
          ctx.fillRect(i * cw, ds + lh * 0.5, cw + 1, lh * 0.07);
        }
      }
    } else if (plain) {
      // wallpaper above, darker panelling below, a rail between
      ctx.fillStyle = "rgba(0,0,0,.24)";
      ctx.fillRect(i * cw, ds + lh * 0.62, cw + 1, lh * 0.38);
      if ((h.u * 7 % 1) < 0.14) { ctx.fillStyle = "rgba(0,0,0,.08)"; ctx.fillRect(i * cw, ds, cw + 1, lh * 0.6); }
      ctx.fillStyle = "rgba(0,0,0,.4)";
      ctx.fillRect(i * cw, ds + lh * 0.6, cw + 1, Math.max(1, lh * 0.025));
      ctx.fillRect(i * cw, ds + lh * 0.97, cw + 1, Math.max(1, lh * 0.03));
      const wallId = h.mx * 31 + h.my * 17;
      if (wallId % 5 === 0 && h.u > 0.3 && h.u < 0.7) {
        // a painting in a dark frame
        ctx.fillStyle = `rgb(${(40 * b) | 0},${(26 * b) | 0},${(12 * b) | 0})`; ctx.fillRect(i * cw, ds + lh * 0.14, cw + 1, lh * 0.34);
        if (h.u > 0.34 && h.u < 0.66) { ctx.fillStyle = `rgb(${(80 * b) | 0},${(90 * b) | 0},${(70 * b) | 0})`; ctx.fillRect(i * cw, ds + lh * 0.18, cw + 1, lh * 0.26); }
        if (h.u > 0.45 && h.u < 0.55) { ctx.fillStyle = `rgb(${(200 * b) | 0},${(190 * b) | 0},${(170 * b) | 0})`; ctx.fillRect(i * cw, ds + lh * 0.24, cw + 1, lh * 0.08); }
      } else if ((h.mx * 13 + h.my * 7) % 9 === 0 && h.u > 0.47 && h.u < 0.53) {
        // a candle sconce: brass, a flame, a warm pool of light round it
        const mb = Math.max(b, 0.5);
        ctx.fillStyle = `rgb(${(180 * mb) | 0},${(140 * mb) | 0},${(60 * mb) | 0})`; ctx.fillRect(i * cw, ds + lh * 0.3, cw + 1, lh * 0.05);
        ctx.fillStyle = "rgba(255,210,100,.95)"; ctx.fillRect(i * cw, ds + lh * (0.22 + Math.sin(t * 13 + h.mx) * 0.01), cw + 1, lh * 0.08);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(255,170,60,.12)"; ctx.fillRect(i * cw - cw * 6, ds + lh * 0.1, cw * 13, lh * 0.4);
        ctx.globalCompositeOperation = "source-over";
      }
    }
  }

  // sprites, far to near, clipped column by column against the walls
  const inv = 1 / (plx * dy - dx * ply), sp = [];
  for (const r of s.relics) if (!r.got) sp.push({ x: r.x, y: r.y, k: "r", color: r.color, mine: r.mine });
  for (const q of s.pulses) sp.push({ x: q.x, y: q.y, k: "m" });
  for (const q of s.puffs) sp.push({ x: q.x, y: q.y, k: "p", t: q.t });
  for (const q of s.bodies || []) sp.push({ x: q.x, y: q.y, k: "bd", t: q.t });
  for (const [x, y] of spotsOf(s)) {
    if (Math.abs(x + 0.5 - P.x) < 12 && Math.abs(y + 0.5 - P.y) < 12) sp.push({ x: x + 0.5, y: y + 0.5, k: "f", kind: spotKind(x, y) });
  }
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
    const size = (ob || o.k === "p" || o.k === "f") ? u : o.k === "o" ? u * 1.6 : u * (o.k === "g" ? 1 : o.k === "r" ? 0.32 : o.k === "bd" ? 0.6 : 0.3);
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
      const gy = cy + Math.sin(t * 3) * size * 0.03, hunting = o.G.st === "hunt";
      ctx.globalAlpha = Math.min(1, gb * 1.5 + 0.04) * (0.85 + 0.15 * Math.sin(t * 9));
      drawGhost(ctx, scr, gy, size * 1.15, hunting, t);
      ctx.globalAlpha = 1;
      ghostEyes(ctx, scr, gy, size * 1.15, hunting, t);       // its eyes, which you can always see
    } else if (o.k === "r") {
      const by = cy + Math.sin(t * 2.5 + o.x) * size * 0.15;
      const gr = ctx.createRadialGradient(scr, by, 1, scr, by, size * 1.6);
      const rc = o.color ? rgbOf(o.color) : GOLD;
      ctx.globalAlpha = o.mine === false ? 0.5 : 1;     // someone else's: dimmer
      gr.addColorStop(0, `rgba(${rc},.9)`);
      gr.addColorStop(1, `rgba(${rc},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(scr - size * 2, by - size * 2, size * 4, size * 4);
      drawKey(ctx, scr, by, size * 1.3, o.color ? `rgb(${rc})` : "#ffd66b", t + o.x);
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
    } else if (o.k === "f") {
      drawFurniture(ctx, o, scr, u, hz, eye, L, t);
    } else if (o.k === "bd") {
      // it drops on a rope, swings, and lies there
      const fall = Math.min(1, o.t / 0.35), by = hz + (eye - (0.95 - fall * 0.85)) * u;
      const b2 = Math.min(1, 0.15 + Math.max(0, 1 - o.ty / 6));
      ctx.strokeStyle = `rgba(150,150,150,${1 - fall})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(scr, 0);
      ctx.lineTo(scr, by - u * 0.3);
      ctx.stroke();
      ctx.fillStyle = `rgb(${(70 * b2) | 0},${(52 * b2) | 0},${(56 * b2) | 0})`;
      if (fall < 1) {
        ctx.fillRect(scr - u * 0.1, by - u * 0.25, u * 0.2, u * 0.5);
        ctx.beginPath();
        ctx.arc(scr, by - u * 0.32, u * 0.09, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(scr, by + u * 0.08, u * 0.3, u * 0.08, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(scr + u * 0.3, by + u * 0.05, u * 0.08, 0, TAU);
        ctx.fill();
      }
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

// The hiding spots, from all the tiles marked SPOT (cached per house).
const spotCache = new WeakMap();
function spotsOf(s) {
  if (s.spots) return s.spots;
  let list = spotCache.get(s.g);
  if (!list) {
    list = [];
    s.g.forEach((row, y) => row.forEach((v, x) => { if (v === SPOT) list.push([x, y]); }));
    spotCache.set(s.g, list);
  }
  return list;
}

// Furniture you can hide in. Billboards like everything else; heights are in
// wall units, so they sit on the floor at the right size.
function drawFurniture(ctx, o, scr, u, hz, eye, L, t) {
  const cm = o.tx / o.ty / PLANE;
  const br = Math.min(1, (L ? Math.pow(Math.max(0, 1 - o.ty / 7.5), 1.2) * (1 - Math.abs(cm) * 0.45) : 0) * 1.25 + Math.max(0, 1 - o.ty / 2.2) * 0.3 + 0.07);
  const C = (r, g, b, a = 1) => `rgba(${(r * br) | 0},${(g * br) | 0},${(b * br) | 0},${a})`;
  const foot = hz + eye * u, F = (h) => foot - h * u;              // h: height above the floor
  ctx.fillStyle = `rgba(0,0,0,${0.35 * Math.min(1, br + 0.3)})`;  // its shadow on the floor
  ctx.beginPath(); ctx.ellipse(scr, F(0), 0.46 * u, 0.06 * u, 0, 0, TAU); ctx.fill();
  if (o.kind === "bed") {
    // legs, the dark under it (where you hide), the frame, sheet, a striped quilt, pillow, posts
    ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(scr - 0.44 * u, F(0.3), 0.88 * u, 0.16 * u);
    ctx.fillStyle = C(60, 38, 20); ctx.fillRect(scr - 0.44 * u, F(0.14), 0.06 * u, 0.14 * u); ctx.fillRect(scr + 0.38 * u, F(0.14), 0.06 * u, 0.14 * u);
    ctx.fillStyle = C(78, 50, 28); ctx.fillRect(scr - 0.46 * u, F(0.3), 0.92 * u, 0.17 * u);
    ctx.fillStyle = C(226, 220, 206); ctx.fillRect(scr - 0.44 * u, F(0.4), 0.88 * u, 0.1 * u);
    ctx.fillStyle = C(72, 96, 168); ctx.fillRect(scr - 0.44 * u, F(0.5), 0.66 * u, 0.18 * u);
    ctx.fillStyle = C(102, 128, 200); for (let q = 0; q < 6; q++) ctx.fillRect(scr - 0.44 * u + q * 0.11 * u, F(0.5), 0.05 * u, 0.18 * u);
    ctx.fillStyle = C(150, 60, 70); ctx.fillRect(scr - 0.44 * u, F(0.5), 0.66 * u, 0.02 * u);   // a ribbon of trim
    ctx.fillStyle = C(236, 232, 240); ctx.beginPath(); ctx.ellipse(scr + 0.3 * u, F(0.5), 0.13 * u, 0.06 * u, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C(70, 44, 24); ctx.fillRect(scr + 0.36 * u, F(0.7), 0.1 * u, 0.7 * u); ctx.beginPath(); ctx.arc(scr + 0.41 * u, F(0.7), 0.05 * u, Math.PI, 0); ctx.fill();
    ctx.fillStyle = C(98, 62, 34); ctx.fillRect(scr + 0.38 * u, F(0.62), 0.06 * u, 0.4 * u);
    ctx.fillStyle = C(70, 44, 24); ctx.fillRect(scr - 0.46 * u, F(0.46), 0.05 * u, 0.34 * u);
  } else if (o.kind === "wardrobe") {
    // feet, the body, a crown and a skirting, two panelled doors, an oval mirror, brass knobs
    ctx.fillStyle = C(52, 32, 18); ctx.fillRect(scr - 0.32 * u, F(0.06), 0.08 * u, 0.06 * u); ctx.fillRect(scr + 0.24 * u, F(0.06), 0.08 * u, 0.06 * u);
    ctx.fillStyle = C(98, 64, 38); ctx.fillRect(scr - 0.34 * u, F(1), 0.68 * u, 0.94 * u);
    ctx.fillStyle = C(66, 42, 24); ctx.fillRect(scr - 0.38 * u, F(1.06), 0.76 * u, 0.07 * u); ctx.fillRect(scr - 0.37 * u, F(0.1), 0.74 * u, 0.04 * u);
    for (const k of [-1, 1]) {
      const d0 = k < 0 ? scr - 0.31 * u : scr + 0.02 * u;
      ctx.fillStyle = C(112, 74, 44); ctx.fillRect(d0, F(0.92), 0.29 * u, 0.78 * u);
      ctx.strokeStyle = C(60, 38, 20); ctx.lineWidth = Math.max(1, u * 0.012); ctx.strokeRect(d0 + 0.025 * u, F(0.89), 0.24 * u, 0.72 * u);
    }
    ctx.fillStyle = C(120, 150, 170); ctx.beginPath(); ctx.ellipse(scr - 0.165 * u, F(0.55), 0.09 * u, 0.2 * u, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = C(200, 170, 90); ctx.lineWidth = Math.max(1, u * 0.015); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * br})`; ctx.beginPath(); ctx.moveTo(scr - 0.2 * u, F(0.65)); ctx.lineTo(scr - 0.15 * u, F(0.45)); ctx.stroke();
    ctx.fillStyle = C(235, 195, 95); ctx.beginPath(); ctx.arc(scr - 0.03 * u, F(0.5), 0.016 * u, 0, TAU); ctx.arc(scr + 0.05 * u, F(0.5), 0.016 * u, 0, TAU); ctx.fill();
  } else {
    // a table under a fringed cloth with a red band; a lit candle, a teapot, two cups
    ctx.fillStyle = C(208, 200, 178);
    ctx.beginPath(); ctx.moveTo(scr - 0.4 * u, F(0.46)); ctx.lineTo(scr + 0.4 * u, F(0.46)); ctx.lineTo(scr + 0.47 * u, F(0.04));
    for (let q = 0; q <= 7; q++) ctx.lineTo(scr + 0.47 * u - q * 0.1343 * u, F(0.04) + (q % 2 ? 0.03 * u : 0));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = C(150, 40, 48); ctx.fillRect(scr - 0.44 * u, F(0.2), 0.88 * u, 0.045 * u);
    ctx.fillStyle = C(180, 150, 90); ctx.fillRect(scr - 0.44 * u, F(0.14), 0.88 * u, 0.015 * u);
    ctx.fillStyle = C(236, 230, 212); ctx.beginPath(); ctx.ellipse(scr, F(0.46), 0.4 * u, 0.05 * u, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C(190, 150, 70); ctx.fillRect(scr - 0.13 * u, F(0.5), 0.07 * u, 0.03 * u);
    ctx.fillStyle = C(240, 232, 210); ctx.fillRect(scr - 0.115 * u, F(0.62), 0.04 * u, 0.11 * u);
    // the teapot and its cups
    ctx.fillStyle = C(60, 110, 120); ctx.beginPath(); ctx.ellipse(scr + 0.16 * u, F(0.52), 0.045 * u, 0.06 * u, 0, 0, TAU); ctx.fill(); ctx.fillRect(scr + 0.145 * u, F(0.6), 0.03 * u, 0.05 * u);
    ctx.strokeStyle = C(60, 110, 120); ctx.lineWidth = Math.max(1, u * 0.01); ctx.beginPath(); ctx.moveTo(scr + 0.2 * u, F(0.53)); ctx.lineTo(scr + 0.25 * u, F(0.57)); ctx.stroke();
    ctx.fillStyle = C(236, 230, 220); for (const cx of [0.3, -0.28]) { ctx.fillRect(scr + cx * u, F(0.5), 0.05 * u, 0.04 * u); }
    // the candle's flame, and its warm light — lit even when your own light is off
    const fk = 1 + 0.2 * Math.sin(t * 14 + o.x * 3), fx = scr - 0.095 * u, fyy = F(0.74);
    ctx.fillStyle = "rgba(255,205,90,.95)"; ctx.beginPath(); ctx.ellipse(fx, fyy, 0.011 * u, 0.026 * u * fk, 0, 0, TAU); ctx.fill();
    const gl = ctx.createRadialGradient(fx, fyy, 1, fx, fyy, 0.35 * u);
    gl.addColorStop(0, "rgba(255,180,70,.5)"); gl.addColorStop(1, "rgba(255,150,40,0)");
    ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = gl; ctx.fillRect(fx - 0.4 * u, fyy - 0.4 * u, 0.8 * u, 0.8 * u); ctx.globalCompositeOperation = "source-over";
  }
}

// A key, floating and turning slowly: a ring bow, a shaft, two teeth.
function drawKey(ctx, x, y, size, color, t) {
  const turn = Math.cos(t * 1.6);                      // a slow spin: it narrows edge-on
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5);
  ctx.scale(Math.max(0.25, Math.abs(turn)), 1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.09);
  ctx.lineCap = "round";
  ctx.beginPath();                                     // the bow
  ctx.arc(0, -size * 0.28, size * 0.17, 0, TAU);
  ctx.stroke();
  ctx.beginPath();                                     // the shaft
  ctx.moveTo(0, -size * 0.11);
  ctx.lineTo(0, size * 0.42);
  ctx.stroke();
  ctx.fillRect(0, size * 0.22, size * 0.16, size * 0.07);   // the teeth
  ctx.fillRect(0, size * 0.34, size * 0.22, size * 0.08);
  ctx.fillStyle = "rgba(255,255,255,.55)";             // a glint
  ctx.beginPath();
  ctx.arc(-size * 0.06, -size * 0.34, size * 0.035, 0, TAU);
  ctx.fill();
  ctx.restore();
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

// Another player in the halls: a person. Head with a beanie in their colour,
// a jacket in their colour over dark trousers, arms, legs that step as they
// walk, a lantern in one hand when their torch is on — and their name above
// them, so you can tell who is who.
function drawPlayer(ctx, p, scr, hz, eye, u, L, dist, t) {
  const rc = rgbOf(p.color);
  const br = Math.min(1, (L ? Math.pow(Math.max(0, 1 - dist / 7.5), 1.2) : 0) + Math.max(0, 1 - dist / 2.2) * 0.4 + 0.18);
  const shade = (r, g, b) => `rgb(${(r * br) | 0},${(g * br) | 0},${(b * br) | 0})`;
  const [cr, cg, cb] = rc.split(",").map(Number);
  const crouch = p.cr > 0.5 ? 0.72 : 1;
  const foot = hz + eye * u - (p.jz || 0) * u;
  const H = u * 0.68 * crouch;                            // their height on screen
  const walk = p.moving ? Math.sin(t * 9 + (p.x + p.y) * 3) : 0;
  const lw = Math.max(1.5, H * 0.07);

  if (p.lit) {                                           // the lantern's glow first
    const gx = scr + H * 0.2, gy = foot - H * 0.42, gr = H * 0.55;
    const gl = ctx.createRadialGradient(gx, gy, 1, gx, gy, gr);
    gl.addColorStop(0, `rgba(${rc},.32)`);
    gl.addColorStop(1, `rgba(${rc},0)`);
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, TAU);
    ctx.fill();
  }
  ctx.lineCap = "round";
  // legs, stepping
  ctx.strokeStyle = shade(46, 42, 56);
  ctx.lineWidth = lw * 1.2;
  const hipY = foot - H * 0.42;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(scr + side * H * 0.05, hipY);
    ctx.lineTo(scr + side * H * 0.07 + walk * side * H * 0.08, foot - lw * 0.5);
    ctx.stroke();
  }
  // the jacket: their colour
  ctx.fillStyle = shade(cr, cg, cb);
  const shY = foot - H * 0.78;
  ctx.beginPath();
  ctx.moveTo(scr - H * 0.13, shY);
  ctx.quadraticCurveTo(scr, shY - H * 0.04, scr + H * 0.13, shY);
  ctx.lineTo(scr + H * 0.12, hipY + H * 0.02);
  ctx.lineTo(scr - H * 0.12, hipY + H * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.55)";
  ctx.lineWidth = Math.max(1, lw * 0.35);
  ctx.stroke();
  ctx.beginPath();                                       // the zip
  ctx.moveTo(scr, shY + H * 0.02);
  ctx.lineTo(scr, hipY);
  ctx.stroke();
  // arms: one swinging, one holding the lantern out
  ctx.strokeStyle = shade(cr * 0.85, cg * 0.85, cb * 0.85);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(scr - H * 0.13, shY + H * 0.03);
  ctx.lineTo(scr - H * 0.17 - walk * H * 0.05, hipY - H * 0.02);
  ctx.stroke();
  const handX = scr + H * 0.21, handY = shY + H * 0.24;
  ctx.beginPath();
  ctx.moveTo(scr + H * 0.13, shY + H * 0.03);
  ctx.lineTo(handX, handY);
  ctx.stroke();
  // the lantern
  ctx.fillStyle = shade(40, 32, 26);
  ctx.fillRect(handX - H * 0.035, handY, H * 0.07, H * 0.1);
  ctx.fillStyle = p.lit ? `rgb(${rc})` : `rgba(${rc},.25)`;
  ctx.fillRect(handX - H * 0.022, handY + H * 0.018, H * 0.044, H * 0.064);
  // the head: face, and a beanie in their colour
  const headY = shY - H * 0.12, hr = H * 0.085;
  ctx.fillStyle = shade(222, 186, 158);
  ctx.beginPath();
  ctx.arc(scr, headY, hr, 0, TAU);
  ctx.fill();
  ctx.fillStyle = shade(cr * 0.75, cg * 0.75, cb * 0.75);
  ctx.beginPath();
  ctx.arc(scr, headY - hr * 0.1, hr * 1.05, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(scr - hr * 1.08, headY - hr * 0.2, hr * 2.16, hr * 0.3);
  ctx.fillStyle = "rgba(20,14,12,.8)";                   // eyes
  ctx.beginPath();
  ctx.arc(scr - hr * 0.35, headY + hr * 0.25, Math.max(0.8, hr * 0.12), 0, TAU);
  ctx.arc(scr + hr * 0.35, headY + hr * 0.25, Math.max(0.8, hr * 0.12), 0, TAU);
  ctx.fill();
  // name
  const fs = Math.max(10, Math.min(18, u * 0.09));
  ctx.font = `bold ${fs}px Georgia`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,.8)";
  // the name tag carries the distance too, so there's no separate marker
  const tag = `${p.name || ""} · ${metres(dist)}`;
  ctx.strokeText(tag, scr, headY - hr - fs * 0.6);
  ctx.fillStyle = `rgb(${rc})`;
  ctx.fillText(tag, scr, headY - hr - fs * 0.6);
}

// The view from a hiding spot. Under a table: the dark underside above, the
// hem of the cloth hanging across the top of the view, a leg either side.
// Under a bed: slats and mattress above, bare boards around. In a wardrobe:
// dark, but for the slits between the slats.
function hidingOverlay(ctx, W, H, kind, t) {
  ctx.save();
  if (kind === "wardrobe") {
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    for (let k = 0; k < 4; k++) ctx.rect(W * 0.12, H * 0.36 + k * H * 0.07, W * 0.76, H * 0.028);
    ctx.clip("evenodd");
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return;
  }
  const top = H * 0.4;
  const under = ctx.createLinearGradient(0, 0, 0, top);
  under.addColorStop(0, "#050403");
  under.addColorStop(1, kind === "bed" ? "#1d1714" : "#17110c");
  ctx.fillStyle = under;
  ctx.fillRect(0, 0, W, top);
  if (kind === "bed") {
    ctx.fillStyle = "rgba(0,0,0,.6)";                              // slats
    for (let k = 1; k < 7; k++) ctx.fillRect(0, (top * k) / 7, W, Math.max(2, H * 0.012));
  } else {
    ctx.strokeStyle = "rgba(0,0,0,.5)";                            // planks
    ctx.lineWidth = 2;
    for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo((W * k) / 6, 0); ctx.lineTo((W * k) / 6 + W * 0.04, top); ctx.stroke(); }
  }
  // the hem: cloth for a table, a hanging blanket for a bed, swaying a little
  const sway = Math.sin(t * 1.3) * H * 0.006;
  ctx.fillStyle = kind === "bed" ? "#3c1219" : "#5f554b";
  ctx.beginPath();
  ctx.moveTo(0, top - H * 0.02);
  const n = 14;
  for (let i = 0; i <= n; i++) ctx.lineTo((W * i) / n, top + (i % 2 ? H * 0.05 : H * 0.085) + sway);
  ctx.lineTo(W, top - H * 0.02);
  ctx.closePath();
  ctx.fill();
  // a leg on each side
  ctx.fillStyle = "#0c0906";
  ctx.fillRect(0, 0, W * 0.07, H);
  ctx.fillRect(W * 0.93, 0, W * 0.07, H);
  // and the dark closing in from the edges
  const vg = ctx.createRadialGradient(W / 2, H * 0.7, H * 0.2, W / 2, H * 0.7, W * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,.75)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ── markers, as in a shooter ─────────────────────────────────────────────────
// Every relic you still need, every friend still inside, and the way out once
// it's open, each with how far it is — through walls. In front of you, a
// marker floats over the thing itself; anywhere else it waits at the edge of
// the screen with an arrow showing which way to turn.
export const METRES_PER_TILE = 2;
const metres = (d) => `${Math.max(1, Math.round(d * METRES_PER_TILE))} m`;

function markers(ctx, s, W, H, t) {
  const { P } = s;
  const dx = Math.cos(P.fa), dy = Math.sin(P.fa), plx = -dy * PLANE, ply = dx * PLANE;
  const inv = 1 / (plx * dy - dx * ply);
  const hz = H / 2 + (P.pitch || 0) * H;
  const list = [];
  const left = s.relics.filter((r) => !r.got && r.mine !== false);
  let nearest = null;
  for (const r of left) if (!nearest || Math.hypot(r.x - P.x, r.y - P.y) < Math.hypot(nearest.x - P.x, nearest.y - P.y)) nearest = r;
  s.relics.forEach((r, i) => {
    if (r.got || r.mine === false) return;
    list.push({ x: r.x, y: r.y, kind: "relic", icon: relicIcon(i), color: r.color || "#ffdca0", label: "", main: r === nearest });
  });
  if (exitOpen(s)) list.push({ x: s.exitT.x + 0.5, y: s.exitT.y + 0.5, kind: "exit", color: "#f0c478", label: "Front door", main: !left.length });
  // a friend in plain sight wears their distance on their name tag instead
  for (const o of s.others || []) {
    const inSight = Math.hypot(o.x - P.x, o.y - P.y) < 9 && los(s.g, P.x, P.y, o.x, o.y);
    list.push({ x: o.x, y: o.y, kind: "friend", color: o.color, label: o.name || "", main: true, inSight });
  }

  const mr = mapRect({ W, H, safeTop: 0 });
  const edgeL = 46, edgeR = mr.x0 - 34;               // clear of the HUD's bars and the map
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const m of list) {
    const rx = m.x - P.x, ry = m.y - P.y;
    m.d = Math.hypot(rx, ry);
    m.tx = inv * (dy * rx - dx * ry);
    m.ty = inv * (-ply * rx + plx * ry);
    m.ahead = m.ty > 0.3 && Math.abs(m.tx / m.ty) < 0.92;
    if (m.ahead && m.inSight) m.skip = true;
    // in view but out past where the edge stacks sit: join the stack instead,
    // so the two never sit on top of each other
    if (m.ahead) {
      const sx = W / 2 * (1 + m.tx / m.ty);
      if (sx < edgeL + 20 || sx > edgeR - 20) m.ahead = false;
    }
    const a = Math.atan2(ry, rx) - P.fa;
    m.side = m.ahead ? 0 : Math.atan2(Math.sin(a), Math.cos(a)) < 0 ? -1 : 1;
  }
  // at each edge only the three nearest (friends first), so the stack stays
  // between the HUD and the buttons; far ones first, so near ones draw on top
  for (const sd of [-1, 1]) {
    const edge = list.filter((m) => m.side === sd).sort((a, b) => (a.kind === "friend" ? -1 : 0) - (b.kind === "friend" ? -1 : 0) || a.d - b.d);
    edge.slice(3).forEach((m) => { m.skip = true; });
    edge.slice(0, 3).forEach((m, k) => { m.slot = k; });
  }
  list.sort((a, b) => b.d - a.d);
  for (const m of list) {
    if (m.skip) continue;
    const { tx, ty, ahead } = m;
    const size = m.main ? 1 : 0.78;
    const alpha = m.main ? 1 : 0.7;
    let x, y;
    const side = m.side;
    if (ahead) {
      x = W / 2 * (1 + tx / ty);
      y = hz - Math.max(34, Math.min(H * 0.32, (H / ty) * 0.18 + 30));
    } else {
      // at the edge on the side to turn to
      x = side < 0 ? edgeL : edgeR;
      // the left stack starts under the readout (keys, room, next key, Nana)
      y = (side < 0 ? Math.max(H * 0.3, 150) : H * 0.3) + m.slot * 38;
    }
    ctx.globalAlpha = alpha;
    // the pin: a diamond for a relic, a door for the way out, a ring for a friend
    const r = 8 * size;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,.75)";
    ctx.fillStyle = m.color;
    ctx.beginPath();
    if (m.kind === "relic") {
      relicBadge(ctx, x, y, r * 1.35, m.icon, m.color, alpha, m.main ? 12 + 4 * Math.sin(t * 5) : 0);
    } else if (m.kind === "exit") {
      ctx.rect(x - r * 0.8, y - r * 1.2, r * 1.6, r * 2.4);
    } else {
      ctx.arc(x, y, r, 0, TAU);
    }
    if (m.kind !== "relic") { ctx.fill(); ctx.stroke(); }
    if (m.kind === "friend") {                        // a dot in the middle: it's a person
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, TAU); ctx.fill();
    }
    // the turn arrow, off screen
    if (side) {
      const ax = x + side * (r + 9);
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.moveTo(ax + side * 7, y); ctx.lineTo(ax - side * 2, y - 6); ctx.lineTo(ax - side * 2, y + 6); ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // name and distance, outlined so they read on any wall
    const text = m.label ? `${m.label} · ${metres(m.d)}` : metres(m.d);
    ctx.font = `bold ${Math.round(12 * size + 1)}px Georgia`;
    const tyy = y + r * 1.3 + 10;
    // at an edge the words grow away from it, never under the map or off screen
    ctx.textAlign = side < 0 ? "left" : side > 0 ? "right" : "center";
    const txx = side < 0 ? x - r - 2 : side > 0 ? x + r + 2 : x;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.strokeText(text, txx, tyy);
    ctx.fillStyle = m.kind === "relic" ? "#fff3d0" : m.color;
    ctx.fillText(text, txx, tyy);
  }
  ctx.restore();
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
  const { W, H, dpr } = view;
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
    ctx.fillText("Memorize the halls. Gold marks the keys.", W / 2, y0 - 14);
    ctx.fillStyle = "#a39a88";
    ctx.font = "14px Georgia";
    ctx.fillText(`The dark falls in ${Math.ceil(s.introT)}s. Tap or press any key to start now.`, W / 2, y0 + size + 24);
    ctx.fillText("Gold: keys · Brown bars: doors · Red: the front door (it unlocks when you have all three)", W / 2, y0 + size + 44);
    return;
  }
  if (s.mode === "dead") {
    // her face, right up against yours
    const k = Math.min(1, s.deadT / 0.4), size = Math.min(W, H) * (0.9 + k * 0.8), sh = (1 - Math.min(1, s.deadT)) * 20;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    nanaFace(ctx, W / 2, H / 2, size, t, W, H);
    ctx.restore();
    ctx.fillStyle = `rgba(200,30,58,${Math.max(0, 0.7 - s.deadT)})`;
    ctx.fillRect(0, 0, W, H);
    grain(ctx, W, H, 400, 0.4);
    return;
  }

  scene(ctx, s, W, H, t);
  if (s.P.hiding) hidingOverlay(ctx, W, H, s.P.hiding.kind || "wardrobe", t);

  // where everything is, and how far: relics, friends, the way out
  const { P, G } = s;
  markers(ctx, s, W, H, t);

  // where it is, when it is near: redder and bigger the closer it gets
  const d = G ? Math.hypot(P.x - G.x, P.y - G.y) : Infinity;
  // (not when she's plainly in front of you: the arrow would sit on her face)
  const rel = G ? Math.atan2(G.y - P.y, G.x - P.x) - P.fa : 0;
  const inView = G && Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel))) < 0.55 && los(s.g, P.x, P.y, G.x, G.y);
  if (d < 14 && !inView) {
    const k = 1 - d / 14;
    arrow(ctx, W, H, s, Math.atan2(G.y - P.y, G.x - P.x), Math.min(W, H) * 0.36, 8 + k * 16, `rgba(224,32,63,${0.35 + k * 0.6})`);
  }

  const mr = mapRect(view);
  mini(ctx, s, mr.x0, mr.y0, mr.size, false, t);
  if (view.bigMap) {
    // the whole house, big, over the game (which carries on underneath)
    const bs = Math.min(W - 40, H - 56);
    mini(ctx, s, (W - bs) / 2, (H - bs) / 2 + 8, bs, false, t, true);
    ctx.fillStyle = "#e9e3d3";
    ctx.font = "italic 14px Georgia";
    ctx.textAlign = "center";
    ctx.fillText("Tap anywhere to close the map", W / 2, (H - bs) / 2 - 6);
  }

  if (stick) {
    // the walk ring, and outside it the run ring: push past to sprint
    const sdx = stick.x - stick.ox, sdy = stick.y - stick.oy, a = Math.atan2(sdy, sdx);
    const run = Math.hypot(sdx, sdy) > SPRINT_PX, l = Math.min(SPRINT_PX + 8, Math.hypot(sdx, sdy));
    ctx.strokeStyle = "rgba(233,227,211,.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(stick.ox, stick.oy, STICK_R, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = run ? "rgba(255,220,160,.8)" : "rgba(233,227,211,.18)";
    ctx.beginPath();
    ctx.arc(stick.ox, stick.oy, SPRINT_PX, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = run ? "rgba(255,220,160,.9)" : "rgba(233,227,211,.3)";
    ctx.font = "10px Georgia";
    ctx.textAlign = "center";
    ctx.fillText(run ? "RUNNING" : "push out to run", stick.ox, stick.oy - SPRINT_PX - 8);
    ctx.fillStyle = run ? "rgba(255,220,160,.55)" : "rgba(233,227,211,.35)";
    ctx.beginPath();
    ctx.arc(stick.ox + Math.cos(a) * l, stick.oy + Math.sin(a) * l, 15, 0, TAU);
    ctx.fill();
  }
}
