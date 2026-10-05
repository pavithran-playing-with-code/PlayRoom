// src/components/games/KitchenRush.jsx
// KITCHEN RUSH — cook the orders before they run out. Solo, against friends
// (a kitchen each, the same orders), in teams, or together in one kitchen.
//
// The server runs the kitchen (config/togetherWorld.js, rules in
// together/kitchenCore.mjs): it decides what's on every counter, what's
// cooked, what was served and the score. This phone moves its own chef at
// once (and tells the server where it is), sends "use that counter", and
// draws what the server says, the other chefs eased between its ticks.
//
// Steer with the stick (or WASD / arrows); Use with the button, Space or E —
// or tap a counter you're next to.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import { useUprightTouch, toGame, gameRect } from "../horror/LandscapeGate";
import FloatStick from "../together/FloatStick";
import TogetherResults from "../together/TogetherResults";
import useTogether, { secondsLeft, smoothRows, rivals, myScore } from "../together/useTogether";
import {
  W, H, LAYOUT, CRATE, ING, RECIPES, SPEED, REACH, R, kindAt, facingTile, slide, unpackItem, tileIndex,
} from "../together/kitchenCore.mjs";

const REPORT_MS = 66;
const STICK_R = 44;
const CHEF_COLOURS = ["#4CC9F0", "#FF8FC7", "#8FDB5C", "#FFA36C"];
const WHY = {
  far: "Walk up to it first", chop: "Chop that on a board first", cook: "Cook that on the stove first",
  nochop: "That doesn't go on a board", nocook: "Only meat goes on the stove", busy: "Something's already there",
  hands: "Your hands are full", empty: "Nothing to do there", plate: "Bring it on a plate", full: "That's already on the plate",
};
const TAU = Math.PI * 2;

// ── drawing ──────────────────────────────────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}
function emoji(ctx, e, x, y, size) {
  ctx.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(e, x, y + size * 0.05);
}
function bar(ctx, x, y, w, p, col) {
  ctx.fillStyle = "rgba(46,33,64,.75)";
  rr(ctx, x - 1, y - 1, w + 2, 7, 3.5); ctx.fill();
  ctx.fillStyle = col;
  rr(ctx, x, y, Math.max(3, w * Math.min(1, p)), 5, 2.5); ctx.fill();
}

// one ingredient, a plate of them, or nothing
function drawItem(ctx, it, cx, cy, T) {
  if (!it) return;
  if (it.k === "plate") {
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#2E2140";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, T * 0.36, T * 0.3, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(46,33,64,.18)";
    ctx.beginPath(); ctx.ellipse(cx, cy, T * 0.25, T * 0.2, 0, 0, TAU); ctx.stroke();
    const n = it.on.length;
    it.on.forEach((k, i) => {
      const a = n === 1 ? 0 : (i / n) * TAU - Math.PI / 2, d = n === 1 ? 0 : T * 0.13;
      if (k === "meat") patty(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, T * 0.15, "cooked");
      else emoji(ctx, ING[k].icon, cx + Math.cos(a) * d, cy + Math.sin(a) * d, T * (n > 2 ? 0.26 : 0.32));
    });
    return;
  }
  if (it.k === "meat" && it.s !== "raw") { patty(ctx, cx, cy, T * 0.24, it.s); return; }
  if (it.s === "chopped") {
    // in pieces: three small ones
    for (const [dx, dy] of [[-0.13, 0.06], [0.13, 0.06], [0, -0.1]]) emoji(ctx, ING[it.k].icon, cx + dx * T, cy + dy * T, T * 0.3);
    return;
  }
  emoji(ctx, ING[it.k].icon, cx, cy, T * 0.52);
}
function patty(ctx, x, y, r, s) {
  ctx.fillStyle = s === "burnt" ? "#2A2326" : "#8A4B2A";
  ctx.strokeStyle = "#2E2140";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, TAU); ctx.fill(); ctx.stroke();
  if (s !== "burnt") {
    ctx.strokeStyle = "rgba(40,18,8,.55)";
    ctx.lineWidth = 1.5;
    for (const k of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.moveTo(x - r * 0.6, y + k * r * 0.8 - r * 0.15); ctx.lineTo(x + r * 0.6, y + k * r * 0.8 + r * 0.15); ctx.stroke(); }
  }
}

function drawTile(ctx, ch, x, y, T, t, it) {
  const px = x * T, py = y * T, kind = kindAt(x, y);
  // the counter itself: a wooden top with a front edge
  ctx.fillStyle = "#B98D63";
  ctx.fillRect(px, py, T, T);
  ctx.fillStyle = "#E2BE92";
  ctx.fillRect(px + 1, py + 1, T - 2, T * 0.8);
  ctx.strokeStyle = "rgba(46,33,64,.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
  const cx = px + T / 2, cy = py + T * 0.42;
  if (kind === "crate") {
    ctx.fillStyle = "#C9853F";
    rr(ctx, px + T * 0.12, py + T * 0.1, T * 0.76, T * 0.64, 6); ctx.fill();
    ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(46,33,64,.3)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px + T * 0.12, py + T * 0.32); ctx.lineTo(px + T * 0.88, py + T * 0.32); ctx.stroke();
    emoji(ctx, ING[CRATE[ch]].icon, cx, cy + T * 0.04, T * 0.5);
  } else if (kind === "board") {
    ctx.fillStyle = "#F3D7A6";
    rr(ctx, px + T * 0.12, py + T * 0.12, T * 0.76, T * 0.6, 7); ctx.fill();
    ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2; ctx.stroke();
    if (!it) { ctx.globalAlpha = 0.55; emoji(ctx, "🔪", cx, cy, T * 0.36); ctx.globalAlpha = 1; }
  } else if (kind === "stove") {
    ctx.fillStyle = "#4A4458";
    rr(ctx, px + T * 0.08, py + T * 0.08, T * 0.84, T * 0.68, 7); ctx.fill();
    ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2; ctx.stroke();
    const hot = it && it.k === "meat" && it.s !== "burnt";
    ctx.strokeStyle = hot ? `rgba(255,${120 + Math.sin(t * 9) * 40},60,.95)` : "#77708A";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, T * 0.26, 0, TAU); ctx.stroke();
  } else if (kind === "plates") {
    for (let i = 2; i >= 0; i--) {
      ctx.fillStyle = "#FFFFFF"; ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, cy + i * 3 - 3, T * 0.32, T * 0.24, 0, 0, TAU); ctx.fill(); ctx.stroke();
    }
  } else if (kind === "window") {
    ctx.fillStyle = "#FFF6E6";
    ctx.fillRect(px + 1, py + T * 0.28, T - 2, T * 0.52);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "#FFFFFF" : "#FF6B6B"; ctx.fillRect(px + (i * T) / 4, py, T / 4, T * 0.26); }
    ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, T - 2, T * 0.26);
    if (x === LAYOUT[0].lastIndexOf("W")) {
      // one sign across the whole window
      ctx.font = `800 ${Math.round(T * 0.3)}px Fredoka,sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#2E2140";
      ctx.fillText("SERVE", px, py + T * 0.56);
    }
  } else if (kind === "bin") {
    emoji(ctx, "🗑️", cx, cy, T * 0.58);
  }
  if (it) {
    drawItem(ctx, it, cx, cy, T);
    if (kind === "board" && it.s === "raw" && it.p > 0) bar(ctx, px + T * 0.14, py + T * 0.8, T * 0.72, it.p, "#8FDB5C");
    if (kind === "stove" && it.k === "meat") {
      if (it.s === "raw") bar(ctx, px + T * 0.14, py + T * 0.8, T * 0.72, it.p, "#FFC53D");
      else if (it.s === "cooked" && it.p > 0.35) {
        // about to burn: a red warning that blinks faster as it gets close
        if (Math.sin(t * (8 + it.p * 16)) > 0) { ctx.fillStyle = "#FF6B6B"; ctx.beginPath(); ctx.arc(px + T * 0.84, py + T * 0.16, T * 0.12, 0, TAU); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = `800 ${Math.round(T * 0.18)}px Fredoka,sans-serif`; ctx.fillText("!", px + T * 0.84, py + T * 0.17); }
      }
      if (it.s === "burnt") {
        for (let i = 0; i < 3; i++) {
          const k = ((t * 0.6 + i / 3) % 1);
          ctx.fillStyle = `rgba(70,70,80,${0.5 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(cx + Math.sin(t * 2 + i) * 6, cy - k * T * 0.8, T * (0.1 + k * 0.15), 0, TAU); ctx.fill();
        }
      }
    }
  }
}

function drawChef(ctx, p, T, t, col, me, name) {
  const x = p.x * T, y = p.y * T, r = R * T;
  // shadow
  ctx.fillStyle = "rgba(46,33,64,.18)";
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 0.95, r * 0.4, 0, 0, TAU); ctx.fill();
  if (me) {
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y + r * 0.2, r * 1.35, 0, TAU); ctx.stroke();
  }
  const bob = p.moving ? Math.sin(t * 14) * r * 0.08 : 0;
  // body
  ctx.fillStyle = col;
  ctx.strokeStyle = "#2E2140";
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y + bob, r, 0, TAU); ctx.fill(); ctx.stroke();
  // apron
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath(); ctx.arc(x, y + bob + r * 0.25, r * 0.55, 0, Math.PI); ctx.fill();
  // eyes, looking where they face
  const ex = p.fx * r * 0.32, ey = p.fy * r * 0.25;
  ctx.fillStyle = "#2E2140";
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + ex + s * r * 0.3, y + bob + ey - r * 0.15, r * 0.11, 0, TAU); ctx.fill(); }
  // the hat
  const hy = y + bob - r * 0.95;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(x - r * 0.35, hy, r * 0.33, 0, TAU); ctx.arc(x + r * 0.35, hy, r * 0.33, 0, TAU); ctx.arc(x, hy - r * 0.2, r * 0.4, 0, TAU);
  ctx.fill();
  ctx.fillRect(x - r * 0.55, hy, r * 1.1, r * 0.4);
  ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2;
  ctx.strokeRect(x - r * 0.55, hy + r * 0.1, r * 1.1, r * 0.3);
  // chopping: the knife going
  if (p.chop) emoji(ctx, "🔪", x + p.fx * r * 1.1, y + p.fy * r * 1.1 + Math.sin(t * 30) * 3, T * 0.32);
  // what they're carrying, held out in front at hand height (never over the face)
  if (p.hold) drawItem(ctx, p.hold, x + p.fx * r * 1.05, y + r * 0.45 + Math.max(0, p.fy) * r * 0.55, T * 0.72);
  if (name) {
    ctx.font = `800 ${Math.max(10, Math.round(T * 0.24))}px Fredoka,sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.lineWidth = 3; ctx.strokeStyle = "#FFFFFF"; ctx.strokeText(name, x, hy - r * 0.55);
    ctx.fillStyle = "#2E2140"; ctx.fillText(name, x, hy - r * 0.55);
  }
}

// The four order tickets: along the top, or (sideways, `down`) in a column
// down the left of the kitchen.
function drawOrders(ctx, orders, bw, bh, t, flash, down = false) {
  const n = 4, gap = 6;
  const w = down ? bw - gap * 2 : (bw - gap * (n + 1)) / n;
  const tall = down ? (bh - gap * (n + 1)) / n : bh - 12;
  for (let i = 0; i < n; i++) {
    const x = down ? gap : gap + i * (w + gap), y = down ? gap + i * (tall + gap) : 6, h = tall;
    const o = orders[i];
    if (!o) {
      ctx.strokeStyle = "rgba(46,33,64,.18)"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
      rr(ctx, x, y, w, h, 12); ctx.stroke(); ctx.setLineDash([]);
      continue;
    }
    const [id, r, left, life] = o;
    const rec = RECIPES[r], k = Math.max(0, left / life);
    const pop = flash.get(id);
    const shake = pop && pop.kind === "new" ? Math.max(0, 1 - (t - pop.at) * 3) : 0;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(1 + shake * 0.12, 1 + shake * 0.12);
    ctx.translate(-(x + w / 2), -(y + h / 2));
    ctx.fillStyle = k < 0.25 && Math.sin(t * 10) > 0 ? "#FFD3D3" : "#FFFFFF";
    rr(ctx, x, y, w, h, 12); ctx.fill();
    ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2.5; ctx.stroke();
    emoji(ctx, rec.icon, x + w * 0.5, y + h * 0.3, Math.min(w * 0.36, h * 0.38));
    if (r === "cheese") emoji(ctx, "🧀", x + w * 0.74, y + h * 0.2, h * 0.2);
    // what goes in it
    const parts = rec.parts, pw = Math.min(16, (w - 8) / parts.length);
    parts.forEach((pt, j) => emoji(ctx, ING[pt].icon, x + w / 2 + (j - (parts.length - 1) / 2) * pw, y + h * 0.66, pw * 0.95));
    // time left
    const col = k > 0.5 ? "#8FDB5C" : k > 0.25 ? "#FFC53D" : "#FF6B6B";
    ctx.fillStyle = "rgba(46,33,64,.15)"; rr(ctx, x + 6, y + h - 10, w - 12, 5, 2.5); ctx.fill();
    ctx.fillStyle = col; rr(ctx, x + 6, y + h - 10, Math.max(4, (w - 12) * k), 5, 2.5); ctx.fill();
    ctx.restore();
  }
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function KitchenRush(props) {
  const { roomCode, currentUser, isSpectator = false, spectatorWatching = null, onGameEnd, durationSeconds = 120 } = props;
  const myId = Number(currentUser?.id);
  const me = useRef(null);                       // my chef, moved here at once
  const fx = useRef({ pops: [], flash: new Map(), ring: null });
  const canvasRef = useRef(null);
  // the canvas: cw x ch; the kitchen starts at (ox, oy); the orders take the
  // top strip, or (side) a column down the left
  const size = useRef({ cw: 360, ch: 424, T: 40, ox: 0, oy: 64, side: false });
  const keys = useRef({});
  const stick = useRef(null);
  const sentAt = useRef(0);
  const [msg, setMsg] = useState(null);
  const [hud, setHud] = useState({ left: durationSeconds, score: 0, stars: 0, served: 0, rivals: [] });
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type = "info", ms = 900) => {
    setMsg({ text, type });
    timers.current.push(setTimeout(() => setMsg(null), ms));
  };

  const tg = useTogether({
    roomCode, watchId: spectatorWatching?.user_id ?? null,
    onInit: (init) => {
      const mine = init.view.p.find((p) => p[0] === myId);
      me.current = mine && init.role === "player" ? { x: mine[1], y: mine[2], fx: mine[3], fy: mine[4], moving: false } : null;
    },
    onTick: (v) => {
      const now = performance.now() / 1000;
      const f = fx.current;
      for (const e of v.e || []) {
        if (e.type === "served") {
          f.pops.push({ text: `+${e.pts}`, x: 4.5, y: 0.6, at: now, good: true });
          if (e.id === myId) flash(`${RECIPES[e.r].icon} Served! +${e.pts}`, "success");
        } else if (e.type === "wrong") {
          f.pops.push({ text: "✕", x: 4.5, y: 0.6, at: now, good: false });
          if (e.id === myId) flash("Nobody ordered that!", "error");
        } else if (e.type === "expired") flash(`${RECIPES[e.r].icon} An order ran out`, "error");
        else if (e.type === "burnt") flash("🔥 Something's burning!", "error");
        else if (e.type === "chopped") f.pops.push({ text: "✨", x: e.x + 0.5, y: e.y + 0.3, at: now, good: true });
        else if (e.type === "order") { /* the card pops in */ }
      }
      for (const o of v.o) if (!f.flash.has(o[0])) f.flash.set(o[0], { kind: "new", at: now });
    },
    onReply: (r) => { if (!r.ok && r.why && WHY[r.why]) flash(WHY[r.why], "info", 1100); },
    onSnap: (r) => { if (me.current) { me.current.x = r.x; me.current.y = r.y; } },
  });

  // ── using a counter ────────────────────────────────────────────────────────
  const applyAt = (t) => {
    if (!t) { flash("Face a counter to use it", "info"); return; }
    fx.current.ring = { x: t.x, y: t.y, at: performance.now() / 1000 };
    tg.send("use", { x: t.x, y: t.y });
  };
  const pressUse = () => {
    const m = me.current;
    if (!m || tg.over) return;
    applyAt(facingTile(m.x, m.y, m.fx, m.fy));
  };

  useEffect(() => {
    if (isSpectator) return undefined;
    const down = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k.toLowerCase())) { keys.current[k.toLowerCase()] = true; e.preventDefault(); }
      if ((k === " " || k === "e" || k === "Enter") && !e.repeat) { e.preventDefault(); pressUse(); }
    };
    const up = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  });

  // A landscape game: on a phone held upright GameFrame draws it turned a
  // quarter, and every pointer position is turned back before it's read.
  const rotated = useUprightTouch();
  const rot = useRef(rotated);
  rot.current = rotated;

  // tap a counter on the board: use it if it's in reach
  const onBoardTap = (e) => {
    const m = me.current, c = canvasRef.current;
    if (!m || !c || isSpectator) return;
    const r = gameRect(c, rot.current), at = toGame(e, rot.current);
    const { T, ox, oy, cw } = size.current;
    // inside the border, in drawing units
    const k = cw / (c.clientWidth || cw);
    const px = (at.x - r.left - c.clientLeft) * k, py = (at.y - r.top - c.clientTop) * k;
    const tx = Math.floor((px - ox) / T), ty = Math.floor((py - oy) / T);
    if (ty < 0 || kindAt(tx, ty) === "floor" || kindAt(tx, ty) === "wall") return;
    if (Math.hypot(tx + 0.5 - m.x, ty + 0.5 - m.y) > REACH) { flash(WHY.far, "info"); return; }
    const dx = tx + 0.5 - m.x, dy = ty + 0.5 - m.y, l = Math.hypot(dx, dy) || 1;
    m.fx = dx / l; m.fy = dy / l;
    applyAt({ x: tx, y: ty });
  };

  // the stick: wherever your left thumb lands (FloatStick)
  const knobRef = useRef(null);

  const { live: tgLive, report: tgReport } = tg;
  // ── the loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf, last = performance.now(), lastHud = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      const L = tgLive.current;
      const m = me.current;
      // move my chef
      if (m && L && !L.over) {
        let ix = 0, iy = 0;
        const k = keys.current;
        if (k.a || k.arrowleft) ix--;
        if (k.d || k.arrowright) ix++;
        if (k.w || k.arrowup) iy--;
        if (k.s || k.arrowdown) iy++;
        const st = stick.current;
        if (st) {
          const dx = st.x - st.ox, dy = st.y - st.oy, l = Math.hypot(dx, dy);
          if (l > 6) { ix = (dx / l) * Math.min(1, l / STICK_R); iy = (dy / l) * Math.min(1, l / STICK_R); }
          if (knobRef.current) { const c = Math.min(l, STICK_R) / (l || 1); knobRef.current.style.transform = `translate(${dx * c}px, ${dy * c}px)`; }
        } else if (knobRef.current) knobRef.current.style.transform = "";
        const l = Math.hypot(ix, iy);
        m.moving = l > 0.05;
        if (m.moving) {
          if (l > 1) { ix /= l; iy /= l; }
          [m.x, m.y] = slide(m.x, m.y, ix * SPEED * dt, iy * SPEED * dt);
          const fl = Math.hypot(ix, iy);
          m.fx = ix / fl; m.fy = iy / fl;
        }
        const now = Date.now();
        if (now - sentAt.current >= (m.moving ? REPORT_MS : 300)) {
          sentAt.current = now;
          tgReport({ x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100, fx: Math.round(m.fx * 100) / 100, fy: Math.round(m.fy * 100) / 100 });
        }
      }
      const c = canvasRef.current;
      if (c && L) {
        const { cw, ch, T, ox, oy, side } = size.current;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
        const ctx = c.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const t = ts / 1000;
        ctx.fillStyle = "#FFF6E6";
        ctx.fillRect(0, 0, cw, ch);
        drawOrders(ctx, L.view.o, side ? ox : cw, side ? ch : oy, t, fx.current.flash, side);
        ctx.save();
        ctx.translate(ox, oy);
        // floor
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (kindAt(x, y) !== "floor") continue;
          ctx.fillStyle = (x + y) % 2 ? "#F4E3C8" : "#ECD6B6";
          ctx.fillRect(x * T, y * T, T, T);
        }
        // counters and what's on them
        const items = new Map(L.view.i.map(([i, a]) => [i, unpackItem(a)]));
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const chr = LAYOUT[y][x];
          if (chr === ".") continue;
          drawTile(ctx, chr, x, y, T, t, items.get(tileIndex(x, y)));
        }
        // the counter I'm facing
        if (m && !L.over) {
          const ft = facingTile(m.x, m.y, m.fx, m.fy);
          if (ft && Math.hypot(ft.x + 0.5 - m.x, ft.y + 0.5 - m.y) <= REACH) {
            ctx.strokeStyle = `rgba(255,255,255,${0.65 + Math.sin(t * 6) * 0.3})`;
            ctx.lineWidth = 3;
            rr(ctx, ft.x * T + 2, ft.y * T + 2, T - 4, T - 4, 8); ctx.stroke();
          }
        }
        const ring = fx.current.ring;
        if (ring && t - ring.at < 0.3) {
          ctx.strokeStyle = `rgba(155,93,229,${1 - (t - ring.at) / 0.3})`;
          ctx.lineWidth = 4;
          rr(ctx, ring.x * T, ring.y * T, T, T, 8); ctx.stroke();
        }
        // the chefs: others eased between ticks, me where I am
        const chefs = smoothRows(L, "p", [1, 2]).map(({ row: p, moving }, i) => {
          const mine = m && p[0] === myId;
          return {
            id: p[0], i,
            x: mine ? m.x : p[1], y: mine ? m.y : p[2],
            fx: mine ? m.fx : p[3], fy: mine ? m.fy : p[4], hold: unpackItem(p[5]), chop: !!p[6], left: !!p[7],
            moving: mine ? m.moving : moving,
          };
        }).filter((p) => !p.left).sort((a, b) => a.y - b.y);
        const names = L.view.p.length > 1;
        for (const p of chefs) {
          const pl = L.players.find((x) => x.id === p.id);
          drawChef(ctx, p, T, t, CHEF_COLOURS[p.i % 4], p.id === myId && !!m, names ? (p.id === myId ? "You" : pl?.name) : null);
        }
        // pops
        const now = performance.now() / 1000;
        fx.current.pops = fx.current.pops.filter((p) => now - p.at < 1.1);
        for (const p of fx.current.pops) {
          const q = (now - p.at) / 1.1;
          ctx.globalAlpha = 1 - q;
          ctx.font = `800 ${Math.round(T * 0.5)}px Fredoka,sans-serif`;
          ctx.textAlign = "center";
          ctx.lineWidth = 4; ctx.strokeStyle = "#2E2140";
          ctx.fillStyle = p.good ? "#FFC53D" : "#FF6B6B";
          ctx.strokeText(p.text, p.x * T, p.y * T + T - q * T * 1.2);
          ctx.fillText(p.text, p.x * T, p.y * T + T - q * T * 1.2);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
      if (ts - lastHud > 200 && L) {
        lastHud = ts;
        setHud({ left: secondsLeft(L), score: myScore(L), stars: L.view.st, served: L.view.sv, line: L.world?.line, rivals: rivals(L) });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tgLive, tgReport, myId]);

  const starText = "⭐".repeat(hud.stars || 0) + "☆".repeat(3 - (hud.stars || 0));
  const stats = [
    { label: "Score", value: Number(hud.score).toLocaleString() },
    { label: "Stars", value: starText },
    { label: "Served", value: hud.served },
  ];
  const controls = !isSpectator ? (
    <div className="kr-controls">
      <FloatStick stick={stick} knobRef={knobRef} label="Move" />
      <button className="press p-sun kr-use" onPointerDown={(e) => { e.preventDefault(); pressUse(); }} aria-label="Use">🖐️ Use</button>
    </div>
  ) : null;

  const L = tg.live.current;
  return (
    <>
      <GameFrame
        gameName="Kitchen Rush" badge="🍳 KITCHEN RUSH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: hud.left, max: durationSeconds }}
        opponents={hud.rivals}
        message={msg}
        onQuit={onGameEnd}
        controls={controls}
        landscape
      >
        {({ w, h }) => {
          // a wide space (sideways): the orders in a column beside the kitchen,
          // so it gets the whole height; otherwise along the top
          const side = w > h * 1.25;
          const T = side ? Math.max(22, Math.floor(Math.min(h / H, w / (W + 2.3))))
            : Math.max(22, Math.floor(Math.min(w / W, (h - 74) / H)));
          const ow = side ? Math.round(T * 2.3) : 0, oh = side ? 0 : Math.max(58, Math.min(76, Math.round(T * 1.6)));
          const cw = ow + T * W, ch = oh + T * H;
          size.current = { cw, ch, T, ox: ow, oy: oh, side };
          return (
            <div className="kr-pad" style={{ width: w, height: h }} onContextMenu={(e) => e.preventDefault()}>
              {!tg.ready && <div className="muted">{tg.gone ? "This kitchen has closed." : "Opening the kitchen…"}</div>}
              <canvas ref={canvasRef} className="kr-canvas" onPointerDown={onBoardTap}
                style={{ width: cw, height: ch, display: tg.ready ? "block" : "none" }}
                role="img" aria-label="Kitchen Rush: the kitchen from above, orders along the top" />
              {isSpectator && L && L.sides.length > 1 && (
                <div className="kr-watch">
                  {L.sides.map((s) => (
                    <button key={s.key} className={`press sm ${s.key === L.side ? "p-sun" : "p-white"}`} onClick={() => tg.watch(s.key)}>
                      {L.mode === "teams" ? `${s.name} team` : s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }}
      </GameFrame>
      {tg.over && !isSpectator && (
        <TogetherResults over={tg.over} me={currentUser} onExit={onGameEnd} icon="🍳"
          goalText={(s) => (s.goal ? `${"⭐".repeat(s.sum?.stars || 1)} — ${s.sum?.served ?? 0} orders served.` : `One star needs ${s.sum?.line?.[0] ?? "?"} points — ${s.sum?.served ?? 0} orders served.`)}
          describe={(s) => `${"⭐".repeat(s.sum?.stars || 0)}${s.sum?.stars ? " · " : ""}${s.sum?.served ?? 0} served${s.sum?.missed ? ` · ${s.sum.missed} missed` : ""}`} />
      )}
    </>
  );
}
