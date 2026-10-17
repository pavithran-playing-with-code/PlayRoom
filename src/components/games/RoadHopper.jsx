// src/components/games/RoadHopper.jsx
// Road Hopper — hop the chicken across roads, rivers and railways, as far as
// you can (in the spirit of Crossy Road). Tap to hop forward, swipe left,
// right or back; or the arrow keys. Everyone in a room hops the same course
// (the seed); the room's clock decides it, and your best row counts. The
// rules are hopperSim.js; this file draws them, blocky and a little 3D, and
// reads the thumbs.
//
// Quick new rows are a hot streak (x2, x3); a gem rides a log now and then.
// The seasons turn as you go — spring, autumn from row 50, snow from 100 —
// every 25 rows is called out; dust on a landing, a splash in the water,
// feathers off a car; and sound: hops that climb with the streak, a bell
// before a train, a honk, a splash, an eagle's cry.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpecStream, { specLerp } from "./useSpecStream";
import { newHopper, hop, step, score, rowAt, thingsAt, trainAt, gemOn, streakMult, COLS, HOP_S, GEM_PTS } from "./hopperSim.js";
import sfx from "./sfx";

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

// the seasons, by row: spring, autumn from 50, winter from 100
const SEASONS = [
  { grass: ["#8ED15A", "#83C64F"], leaf: ["#4FAE3E", "#3A8A2E", "#62C24E", "#46993A"] },
  { grass: ["#D9B25A", "#CFA64C"], leaf: ["#E8892E", "#B9651E", "#F2A33C", "#C97624"] },
  { grass: ["#EEF4FA", "#E2EAF2"], leaf: ["#5E9C7A", "#467A5E", "#F4F8FC", "#D5E0EA"] },
];
export const seasonOf = (n) => (n >= 100 ? 2 : n >= 50 ? 1 : 0);

function drawGem(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.8, cy - r * 0.2); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.8, cy - r * 0.2); ctx.closePath();
  ctx.fillStyle = "#6FE3F5"; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#1C7A9A"; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.beginPath(); ctx.moveTo(cx - r * 0.3, cy - r * 0.45); ctx.lineTo(cx, cy - r * 0.75); ctx.lineTo(cx + r * 0.1, cy - r * 0.35); ctx.closePath(); ctx.fill();
}

function drawScene(ctx, W, H, h, camRow, now, fx) {
  const S = W / COLS;
  const Y = (row) => H - (row - camRow + 1) * S;          // the top edge of a row on the screen
  const first = Math.floor(camRow) - 2, last = Math.ceil(camRow + H / S) + 2;
  // the ground, far rows first
  for (let n = last; n >= first; n--) {
    const r = rowAt(h.course, n), y = Y(n);
    if (r.kind === "grass") {
      ctx.fillStyle = SEASONS[seasonOf(n)].grass[n % 2]; ctx.fillRect(0, y, W, S + 1);
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
        const lf = SEASONS[seasonOf(n)].leaf;
        block(ctx, x + S * 0.38, y + S * 0.55, S * 0.24, S * 0.22, 0.5, "#8A5A33", "#6B4423", S);
        block(ctx, x + S * 0.12, y + S * 0.18, S * 0.76, S * 0.6, 1.1, lf[0], lf[1], S);
        block(ctx, x + S * 0.24, y + S * 0.22, S * 0.5, S * 0.4, 1.6, lf[2], lf[3], S);
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
      const gem = h.gemTaken && h.gemTaken.has(n) ? -1 : gemOn(h, n);
      thingsAt(r, h.t).forEach((c, li) => {
        const x = c.x0 * S, w = (c.x1 - c.x0) * S - S * 0.06;
        block(ctx, x, y + S * 0.22, w, S * 0.56, 0.22, "#A0703F", "#7A5230", S);
        ctx.strokeStyle = "rgba(90,60,30,.6)"; ctx.lineWidth = 1.5;
        for (let k = 1; k < (c.x1 - c.x0) * 2; k++) { ctx.beginPath(); ctx.moveTo(x + k * S * 0.5, y + S * 0.12); ctx.lineTo(x + k * S * 0.5 + S * 0.08, y + S * 0.62); ctx.stroke(); }
        ctx.fillStyle = "#C79A62"; ctx.beginPath(); ctx.ellipse(x + w, y + S * 0.38, S * 0.08, S * 0.24, 0, 0, Math.PI * 2); ctx.fill();
        if (li === gem) drawGem(ctx, x + w / 2, y + S * 0.18 + Math.sin(now * 4) * S * 0.04, S * 0.2);
      });
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
  // dust, splashes and feathers (in squares and rows, like everything else)
  if (fx) {
    for (const p of fx.parts) {
      const life = Math.max(0, p.life / p.max);
      ctx.globalAlpha = life;
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc((p.x + 0.5) * S, Y(p.row) + S * 0.55 - p.up * S, S * p.r * (0.5 + 0.5 * life), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // the hot streak, in the corner
    if (h.streak > 1) {
      const mult = streakMult(h.streak);
      ctx.font = `700 ${Math.round(S * 0.42)}px Fredoka, Nunito, sans-serif`;
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      const text = `🔥 ${h.streak}${mult > 1 ? ` · ×${mult}` : ""}`;
      ctx.lineWidth = 4; ctx.strokeStyle = "#2E2140"; ctx.strokeText(text, 8, 8);
      ctx.fillStyle = mult >= 3 ? "#FF8A3D" : mult >= 2 ? "#FFD23F" : "#FFFFFF"; ctx.fillText(text, 8, 8);
    }
    if (fx.banner && now - fx.banner.at < 1.4) {
      const t = (now - fx.banner.at) / 1.4;
      ctx.globalAlpha = t > 0.75 ? (1 - t) / 0.25 : 1;
      ctx.font = `700 ${Math.round(S * 0.5)}px Fredoka, Nunito, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const bw = ctx.measureText(fx.banner.text).width + S * 0.8, by = H * 0.3 - t * 10;
      ctx.fillStyle = fx.banner.fill; ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(W / 2 - bw / 2, by - S * 0.42, bw, S * 0.84, S * 0.42) : ctx.rect(W / 2 - bw / 2, by - S * 0.42, bw, S * 0.84);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#2E2140"; ctx.fillText(fx.banner.text, W / 2, by + 1);
      ctx.globalAlpha = 1;
    }
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
  const sim = useRef(null);              // a watcher keeps the watched player's chicken in it
  if (sim.current === null) sim.current = newHopper(seed);
  const camRef = useRef(-3);             // the eased camera, for anyone watching

  // live spectating: the chicken, the camera and the course clock, ~15×/s. The
  // traffic is the seed's and runs on h.t, so the clock is all a watcher needs
  // for it; coins taken only near the camera.
  const spec = useSpecStream({
    roomCode, isSpectator, myId: currentUser?.id, watchId: spectatorWatching?.user_id,
    frame: () => {
      const h = sim.current, r3 = (v) => Math.round(v * 1000) / 1000, lo = Math.floor(h.cam) - 6;
      return {
        t: r3(h.t), r: h.row, x: r3(h.x), d: r3(h.daze), m: r3(camRef.current),
        hp: h.hop ? [h.hop.from[0], r3(h.hop.from[1]), h.hop.to[0], h.hop.to[1], r3(h.hop.t)] : 0,
        b: h.best, c: h.coins, k: h.crashes, l: h.last,
        tk: [...h.taken].filter((n) => n >= lo && n < lo + 50),
        bo: h.bonus, sk: h.streak, gm: h.gems, gt: [...h.gemTaken].filter((n) => n >= lo && n < lo + 50),
      };
    },
  });
  const [seen, setSeen] = useState(false);   // the watcher: has a frame come yet
  const canvasRef = useRef(null);
  const size = useRef({ w: 300, h: 400 });
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);
  const [hud, setHud] = useState({ best: 0, coins: 0, crashes: 0 });
  const [msg, setMsg] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type, ms = 1400) => { setMsg({ text, type }); timers.current.push(setTimeout(() => setMsg(null), ms)); };

  const go = (dir) => {
    if (overRef.current || isSpectator) return;
    const h = sim.current;
    if (hop(h, dir)) sfx.tone(sfx.note(67 + Math.min(14, h.streak)), 0.07, 0.06, "triangle", null);
  };
  const fxRef = useRef({ parts: [], banner: null });
  const tempoRef = useRef(90);
  const playing = !isSpectator && !eng.gameOver;
  useEffect(() => { if (!playing) return undefined; const b = sfx.beat(() => tempoRef.current, 0.4); return () => b.stop(); }, [playing]);
  const secs = Math.ceil(eng.timeLeft);
  useEffect(() => { if (playing && !eng.unlimited && secs > 0 && secs <= 10) sfx.tick(secs <= 3); }, [secs, playing, eng.unlimited]);
  const ended = useRef(false);
  useEffect(() => {
    if (!eng.gameOver || isSpectator || ended.current) return;
    ended.current = true;
    if (eng.won || eng.rank === 1) sfx.win(); else sfx.lose();
  }, [eng.gameOver, eng.won, eng.rank, isSpectator]);

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
    const F = fxRef.current, rung = new Set();
    // cosmetic only: a puff of n bits at a square, flying up and out
    const puff = (x, row, n, col, spread, up, r = 0.07) => {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; F.parts.push({ x, row, vx: Math.cos(a) * spread, vr: Math.sin(a) * spread * 0.4, up: 0, vu: up * (0.5 + Math.random() * 0.5), life: 0.5, max: 0.5, col, r }); }
    };
    let mile = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));   // never backwards: the first frame can be stamped early
      last = Math.max(last, now);
      const h = sim.current;
      if (!overRef.current) {
        const out = step(h, dt);
        if (out.crashed) {
          flash(SAY[out.crashed] || "Ouch!", "error");
          const w = out.crashed, at = h.x;
          if (w === "car") { sfx.tone(392, 0.12, 0.06, "square"); sfx.tone(330, 0.16, 0.06, "square", null, 0.12); sfx.thud(); }
          else if (w === "water" || w === "edge") sfx.noise(0.45, 0.2, 900, "lowpass", 0, 300);
          else if (w === "train") { sfx.crack(); sfx.thud(); }
          else if (w === "eagle") { sfx.tone(1400, 0.35, 0.06, "sawtooth", 700); sfx.whoosh(); }
          puff(at, h.row, 10, w === "water" || w === "edge" ? "#BFE8FF" : "#FFFFFF", 2.4, 1.6, 0.09);
        }
        if (out.landed && !out.crashed) puff(h.x, h.row, 4, "rgba(200,190,160,.8)", 1.4, 0.5, 0.06);
        if (out.coin) { flash("🪙 +25", "success", 700); sfx.tone(sfx.note(88), 0.1, 0.07, "square"); sfx.tone(sfx.note(93), 0.14, 0.06, "square", null, 0.07); }
        if (out.gem) { flash(`💎 +${GEM_PTS}`, "success", 900); sfx.sparkle(); puff(h.x, h.row, 8, "#6FE3F5", 2, 1.4); }
        if (out.multUp) { sfx.chime(streakMult(out.streak) + 2); F.banner = { text: `🔥 Hot streak ×${streakMult(out.streak)}!`, fill: "#FFB347", at: now / 1000 }; }
        if (out.row) {
          const m = Math.floor(h.best / 25);
          if (m > mile) {
            mile = m;
            const season = h.best === 50 ? "🍂 Autumn" : h.best === 100 ? "❄️ Winter" : null;
            sfx.chime(Math.min(6, m + 1));
            F.banner = { text: season ? `${season} · ${h.best} rows` : `🏁 ${h.best} rows!`, fill: season ? "#C9B8FF" : "#B5E655", at: now / 1000 };
          }
        }
        // a bell before a train, on a line near you
        for (let n = h.row - 1; n <= h.row + 3; n++) {
          const r = rowAt(h.course, n);
          if (r.kind !== "rail") continue;
          const tr = trainAt(r, h.t), key = `${n}@${Math.floor((h.t - r.offset) / r.period)}`;
          if (tr.warn && !rung.has(key)) { rung.add(key); sfx.tone(1250, 0.08, 0.05, "square"); sfx.tone(1250, 0.08, 0.05, "square", null, 0.18); }
        }
        const target = score(h);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
      }
      for (const p of F.parts) { p.life -= dt; p.x += p.vx * dt; p.row += p.vr * dt; p.up = Math.max(0, p.up + p.vu * dt); p.vu -= 6 * dt; }
      if (F.parts.length) F.parts = F.parts.filter((p) => p.life > 0);
      tempoRef.current = 88 + streakMult(h.streak) * 10;
      // the camera: keeps the chicken a third of the way up, eases along
      const want = Math.max(h.cam - 3, (h.hop ? h.hop.to[0] : h.row) - 3);
      cam += (want - cam) * Math.min(1, dt * 6);
      camRef.current = cam;
      const c = canvasRef.current;
      if (c) {
        const { w, h: hh } = size.current, dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); }
        const ctx = c.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScene(ctx, w, hh, h, cam, now / 1000, F);
      }
      if (now - lastHud > 150) { lastHud = now; setHud({ best: h.best, coins: h.coins, crashes: h.crashes, gems: h.gems }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, addScore]);

  // the watcher: the same scene, from the frames. A clock of its own eases onto
  // the player's (the frame's t, carried on since it came), so the traffic
  // moves every frame; the chicken is put where that clock says — mid-hop, or
  // riding its log — so nothing waits for the next frame.
  useEffect(() => {
    if (!isSpectator) return undefined;
    setSeen(false);
    let raf, last = performance.now(), cam = null, wt = null, at = null, k0 = null, c0 = null, lastHud = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = Math.max(last, now);
      const L = spec.current, h = sim.current;
      if (L && L.f) {
        const f = L.f;
        if (at !== L.at) {
          at = L.at;
          h.taken = new Set(f.tk || []);
          h.best = f.b; h.coins = f.c; h.crashes = f.k; h.last = f.l;
          h.bonus = f.bo || 0; h.streak = f.sk || 0; h.gems = f.gm || 0; h.gemTaken = new Set(f.gt || []);
          if (k0 === null) setSeen(true);
          else if (f.k > k0) flash(SAY[f.l] || "Ouch!", "error");
          else if (f.c > c0) flash("🪙 +25", "success", 700);
          k0 = f.k; c0 = f.c;
        }
        const target = f.t + Math.min(1, (now - L.at) / 1000);
        if (wt === null || Math.abs(target - wt) > 0.5) wt = target;
        else { wt += dt; wt += (target - wt) * Math.min(1, dt * 3); }
        const e = Math.max(-0.3, Math.min(0.3, wt - f.t));
        h.t = wt; h.row = f.r; h.x = f.x; h.hop = null;
        h.daze = Math.max(0, f.d - Math.max(0, e));
        if (f.hp) {
          const ht = Math.max(0, f.hp[4] + e);
          if (ht < HOP_S) h.hop = { from: [f.hp[0], f.hp[1]], to: [f.hp[2], f.hp[3]], t: ht };
          else { h.row = f.hp[2]; h.x = f.hp[3]; }
        } else if (f.d <= 0) {
          const r = rowAt(h.course, f.r);
          if (r.kind === "river") h.x = f.x + r.dir * r.speed * e;      // riding a log
        }
        const want = specLerp(spec, (g) => g.m, now);
        cam = cam === null ? want : cam + (want - cam) * Math.min(1, dt * 10);
        const c = canvasRef.current;
        if (c) {
          const { w, h: hh } = size.current, dpr = Math.min(2, window.devicePixelRatio || 1);
          if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); }
          const ctx = c.getContext("2d");
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawScene(ctx, w, hh, h, cam, now / 1000, { parts: [], banner: null });
        }
        if (now - lastHud > 150) { lastHud = now; setHud({ best: h.best, coins: h.coins, crashes: h.crashes, gems: h.gems }); }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, spectatorWatching?.user_id]);

  const stats = isSpectator
    ? [
        { label: "Score", value: (seen ? score(sim.current) : Number(spectatorWatching?.score ?? 0)).toLocaleString() },
        { label: "Rows", value: hud.best },
        { label: "Coins", value: `🪙 ${hud.coins}` },
      ]
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
        sound
      >
        {({ w, h }) => {
          const cw = Math.min(w, Math.round(h * 0.68)), ch = h - 22;
          size.current = { w: cw, h: ch };
          if (isSpectator) return (
            <div className="rh-pad" style={{ width: w, height: h }}>
              <div style={{ position: "relative", width: cw, height: ch }}>
                <canvas ref={canvasRef} className="rh-canvas" style={{ width: cw, height: ch }} role="img"
                  aria-label={`Road Hopper: watching ${spectatorWatching?.username || "a player"}`} />
                {!seen && (
                  <div className="muted" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 16 }}>
                    Connecting to {spectatorWatching?.username || "the player"}'s game…
                  </div>
                )}
              </div>
              <div className="rh-help muted">👀 Watching {spectatorWatching?.username}</div>
            </div>
          );
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
        <GameOver eng={eng} me={currentUser} extra={`${hud.best} rows · 🪙 ${hud.coins}${hud.gems ? ` · 💎 ${hud.gems}` : ""}`} />
      )}
    </>
  );
}
