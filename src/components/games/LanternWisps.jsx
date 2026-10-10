// src/components/games/LanternWisps.jsx
// LANTERN WISPS — a night-forest survival game. Your lantern spirit's weapons
// fire by themselves; move, dash, gather gems, level up, pick upgrades, and
// hold out until dawn (when the room's clock runs out).
//
// The server runs the night (config/togetherWorld.js, rules in
// together/wispsCore.mjs): shadows, every player's weapons, gems, the team's
// XP, the cards, the bosses. This phone moves its own spirit at once, tells
// the server where it is, and draws — the forest, the dark, the lights cut
// into it. On your own or against friends, a forest each (the same one, from
// the room's seed); together, one forest and one XP bar for the side.
//
// A landscape game, full screen (GameFrame landscape + bare): held upright
// the frame is drawn turned, and every touch is turned back (toGame).
import React, { useCallback, useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import TogetherResults from "../together/TogetherResults";
import useTogether, { secondsLeft, smoothRows, rivals } from "../together/useTogether";
import { useUprightTouch, toGame } from "../horror/LandscapeGate";
import {
  WEAPONS, PASSIVES, WKEYS, PKEYS, ETYPE, NIGHT, START_S, DASH_SPEED, DASH_S, DASH_CD,
  speedOf, orbitOf, orbitAngle,
} from "../together/wispsCore.mjs";

const TAU = Math.PI * 2;
const REPORT_MS = 66;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
const DISPLAY = "Fredoka,'Arial Rounded MT Bold',sans-serif", BODY = "Nunito,'Trebuchet MS',sans-serif";
const COLS = [
  { body: "#ffd24a", glow: "#ffcf5a" }, { body: "#5be3ff", glow: "#5be3ff" },
  { body: "#ff8fc7", glow: "#ff8fc7" }, { body: "#9dff8a", glow: "#9dff8a" },
  { body: "#c9b8ff", glow: "#c9b8ff" }, { body: "#ff9a5a", glow: "#ff9a5a" },
];
const hash2 = (x, y, s) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ s; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const fmt = (s) => { s = Math.max(0, s); return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); };
// "10000" + "000000": weapon and charm levels, as the server sends them
const parseLoadout = (str) => {
  const WL = {}, PL = {};
  WKEYS.forEach((k, i) => { WL[k] = Number(str?.[i] || 0); });
  PKEYS.forEach((k, i) => { PL[k] = Number(str?.[WKEYS.length + i] || 0); });
  return { WL, PL };
};

// ── the icons (cards and the HUD) ────────────────────────────────────────────
export function drawIcon(g, kind, sz) {
  g.clearRect(0, 0, sz, sz);
  const c = sz / 2;
  g.save(); g.translate(c, c); const u = sz / 48; g.scale(u, u);
  const col = (WEAPONS[kind] || PASSIVES[kind]).col;
  g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round";
  const glow = g.createRadialGradient(0, 0, 2, 0, 0, 24); glow.addColorStop(0, col + "66"); glow.addColorStop(1, col + "00");
  g.fillStyle = glow; g.beginPath(); g.arc(0, 0, 24, 0, TAU); g.fill(); g.fillStyle = col;
  if (kind === "spark") { g.beginPath(); g.moveTo(-14, 10); g.lineTo(2, -2); g.lineTo(-4, -2); g.lineTo(14, -14); g.lineTo(0, 2); g.lineTo(6, 2); g.closePath(); g.fill(); }
  else if (kind === "orbit") { g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.globalAlpha = 0.5; g.stroke(); g.globalAlpha = 1; for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; g.beginPath(); g.arc(Math.cos(a) * 13, Math.sin(a) * 13, 4.5, 0, TAU); g.fill(); } }
  else if (kind === "nova") { g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.stroke(); g.globalAlpha = 0.5; g.beginPath(); g.arc(0, 0, 20, 0, TAU); g.stroke(); g.globalAlpha = 1; }
  else if (kind === "leaf") { g.beginPath(); g.moveTo(-14, 12); g.quadraticCurveTo(-16, -14, 14, -14); g.quadraticCurveTo(16, 14, -14, 12); g.fill(); g.strokeStyle = "#1a3a1a"; g.lineWidth = 2; g.beginPath(); g.moveTo(-12, 10); g.lineTo(8, -8); g.stroke(); }
  else if (kind === "bolt") { g.beginPath(); g.moveTo(4, -18); g.lineTo(-8, 2); g.lineTo(0, 2); g.lineTo(-4, 18); g.lineTo(10, -4); g.lineTo(2, -4); g.closePath(); g.fill(); }
  else if (kind === "speed") { g.beginPath(); g.moveTo(-14, -2); g.lineTo(10, -2); g.lineTo(14, 4); g.lineTo(14, 10); g.lineTo(-14, 10); g.closePath(); g.fill(); g.globalAlpha = 0.6; g.beginPath(); g.moveTo(-18, -8); g.lineTo(-6, -8); g.moveTo(-20, -14); g.lineTo(-10, -14); g.stroke(); g.globalAlpha = 1; }
  else if (kind === "vit") { g.beginPath(); g.moveTo(0, 14); g.bezierCurveTo(-24, -2, -12, -18, 0, -6); g.bezierCurveTo(12, -18, 24, -2, 0, 14); g.fill(); }
  else if (kind === "mag") { g.beginPath(); g.arc(0, 2, 12, Math.PI, 0); g.stroke(); g.fillRect(-15, 2, 7, 12); g.fillRect(8, 2, 7, 12); }
  else if (kind === "might") { for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); g.lineTo(Math.cos(a) * 17, Math.sin(a) * 17); g.stroke(); } g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); }
  else if (kind === "haste") { g.beginPath(); g.moveTo(0, -16); g.bezierCurveTo(14, -4, 14, 14, 0, 16); g.bezierCurveTo(-14, 14, -14, -4, 0, -16); g.fill(); g.fillStyle = "#fff3c0"; g.beginPath(); g.arc(0, 6, 5, 0, TAU); g.fill(); }
  else if (kind === "regen") { g.fillRect(-4, -14, 8, 28); g.fillRect(-14, -4, 28, 8); }
  g.restore();
}
const iconCache = {};
function icon(k) {
  if (!iconCache[k]) { const c = document.createElement("canvas"); c.width = c.height = 60; drawIcon(c.getContext("2d"), k, 60); iconCache[k] = c; }
  return iconCache[k];
}
function Icon({ kind, size = 48 }) {
  const ref = useRef(null);
  useEffect(() => { const c = ref.current; if (c) drawIcon(c.getContext("2d"), kind, size * 2); }, [kind, size]);
  return <canvas ref={ref} width={size * 2} height={size * 2} style={{ width: size, height: size }} aria-hidden="true" />;
}

// ── sound: Web Audio only ────────────────────────────────────────────────────
function makeAudio() {
  let AC = null, master = null, muted = false, music = 0, lastShoot = 0, mood = { major: false, on: false };
  function tone(f, d, type, v, f2) {
    if (!AC || muted) return;
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v || 0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
  }
  const seq = (fs, gap, d, v) => fs.forEach((f, i) => setTimeout(() => tone(f, d, "triangle", v), i * gap));
  return {
    init() {
      if (!AC) {
        try {
          AC = new (window.AudioContext || window.webkitAudioContext)();
          master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
          const minor = [220, 261.6, 293.7, 329.6, 392, 440], major = [261.6, 293.7, 329.6, 392, 440, 523.3], pat = [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 5, 3, 2, 1, 2];
          let n = 0;
          music = setInterval(() => {
            if (!mood.on) return;
            const sc = mood.major ? major : minor, i = pat[n % pat.length];
            tone(sc[i], 0.7, "sine", 0.03); if (n % 4 === 0) tone(sc[i] / 2, 1.2, "triangle", 0.028); n++;
          }, 300);
        } catch { AC = null; }
      }
      if (AC && AC.state === "suspended") AC.resume();
    },
    mood,
    mute(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    close() { clearInterval(music); try { if (AC) AC.close(); } catch { /* gone */ } AC = null; },
    shoot() { const n = performance.now(); if (n - lastShoot < 90) return; lastShoot = n; tone(700, 0.07, "square", 0.025, 380); },
    hit() { tone(190, 0.06, "triangle", 0.035, 120); }, kill() { tone(320, 0.1, "sine", 0.05, 90); },
    gem(n) { tone(660 + Math.min(n, 10) * 50, 0.09, "triangle", 0.05); }, hurt() { tone(200, 0.3, "sawtooth", 0.12, 60); },
    nova() { tone(90, 0.4, "sine", 0.2, 40); }, bolt() { tone(1200, 0.2, "sawtooth", 0.06, 100); }, dash() { tone(300, 0.16, "sine", 0.06, 900); },
    level() { seq([523, 659, 784, 1046], 80, 0.3, 0.1); }, boss() { tone(70, 0.8, "sawtooth", 0.18, 40); }, heal() { tone(500, 0.25, "sine", 0.08, 900); },
    win() { seq([523, 659, 784, 1046, 1318, 1568], 140, 0.5, 0.12); }, lose() { seq([400, 330, 260, 190], 180, 0.4, 0.1); },
    beep(hi) { tone(hi ? 880 : 440, hi ? 0.4 : 0.15, "square", 0.08); },
  };
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function LanternWisps(props) {
  const { roomCode, currentUser, isSpectator = false, spectatorWatching = null, onGameEnd, durationSeconds = 300 } = props;
  const myId = Number(currentUser?.id);
  const hostRef = useRef(null), cvRef = useRef(null), darkRef = useRef(null);
  const size = useRef({ w: 300, h: 200 });
  const me = useRef(null);            // my spirit, moved here at once: { x, y, vx, vy, dashT, dashCd, face, bob, trail }
  const keys = useRef({});
  const joy = useRef({ x: 0, y: 0 });
  const dashBtn = useRef(false);
  const sentAt = useRef(0);
  const fx = useRef({ parts: [], texts: [], rings: [], bolts: [], shake: 0, flash: 0, banner: "", bannerT: 0, gemStreak: 0, gemT: 0 });
  const audio = useRef(null);
  if (!audio.current) audio.current = makeAudio();
  useEffect(() => { const a = audio.current; return () => a.close(); }, []);
  const [muted, setMuted] = useState(false);
  useEffect(() => { audio.current.mute(muted); }, [muted]);
  const [hud, setHud] = useState({ left: durationSeconds, cards: null, pickT: 0, alive: true, ph: "count", count: START_S, rivals: [], revive: 0 });
  const upright = useUprightTouch();
  const rot = useRef(upright); rot.current = upright;
  const coarse = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer:coarse)").matches;
  const [touchUi, setTouchUi] = useState(coarse);

  const nameOf = useCallback((id) => {
    if (id === myId) return "You";
    return tg.live.current?.players?.find((p) => Number(p.id) === Number(id))?.name || "Friend";
  }, [myId]); // eslint-disable-line react-hooks/exhaustive-deps
  const slotOf = (id) => {
    const L = tg.live.current;
    const ids = (L?.players || []).map((p) => Number(p.id)).sort((a, b) => a - b);
    return Math.max(0, ids.indexOf(Number(id))) % COLS.length;
  };
  const say = (text, s = 2.2) => { const f = fx.current; f.banner = text; f.bannerT = s; };
  const burst = (x, y, col, n, sp, life, sz) => {
    const P = fx.current.parts;
    for (let i = 0; i < n && P.length < 1000; i++) {
      const a = Math.random() * TAU, s = sp * (0.3 + Math.random() * 0.7);
      P.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), max: life, size: sz || 3, col });
    }
  };

  const fromServer = (v) => {
    const mine = v.p.find((p) => p[0] === myId);
    if (!mine || isSpectator) { me.current = null; return; }
    if (!me.current) me.current = { x: mine[1], y: mine[2], vx: 0, vy: 0, dashT: 0, dashCd: 0, face: 1, bob: 0, trail: 0, kx: 0, ky: 0 };
  };

  const tg = useTogether({
    roomCode, watchId: spectatorWatching?.user_id ?? null,
    onInit: (init) => fromServer(init.view),
    onTick: (v) => {
      const f = fx.current, A = audio.current;
      if (!me.current) fromServer(v);
      for (const e of v.e2 || []) {
        if (e.k === "hit") {
          if (f.texts.length < 80) f.texts.push({ x: e.x + (Math.random() - 0.5) * 16, y: e.y, vy: -50, life: 0.7, str: String(e.d), col: e.c ? "#ffe28a" : "#ffffff", size: e.c ? 19 : 13 });
          if (Math.random() < 0.3) A.hit();
        } else if (e.k === "kill") {
          burst(e.x, e.y, ["#a98bff", "#6a4fd0", "#ff6b6b"][e.t] || "#a98bff", e.b === 2 ? 40 : e.b ? 18 : 7, e.b === 2 ? 260 : 150, 0.5, e.b === 2 ? 5 : 3);
          if (Math.random() < 0.5) A.kill();
          if (e.b === 2) f.rings.push({ x: e.x, y: e.y, r: 10, max: 260, life: 0.6, t: 0, col: "#ffe28a" });
        } else if (e.k === "melt") burst(e.x, e.y, "#ffe28a", 6, 120, 0.6, 3);
        else if (e.k === "shoot") { if (e.p === myId) A.shoot(); }
        else if (e.k === "nova") {
          const pr = v.p.find((p) => p[0] === e.p);
          if (pr) f.rings.push({ x: pr[1], y: pr[2], r: 10, max: e.r, life: 0.45, t: 0, col: "#ffd27a", follow: e.p });
          if (e.p === myId) { A.nova(); f.shake = Math.max(f.shake, 3); }
        } else if (e.k === "bolt") {
          f.bolts.push({ x: e.x, y: e.y, life: 0.3, max: 0.3, seed: Math.random() * 100 });
          f.rings.push({ x: e.x, y: e.y, r: 6, max: e.r * 1.4, life: 0.3, t: 0, col: "#d8ccff" });
          burst(e.x, e.y, "#d8ccff", 8, 160, 0.4, 3); A.bolt();
        } else if (e.k === "gem") {
          if (e.p === myId) { f.gemStreak = f.gemT > 0 ? f.gemStreak + 1 : 1; f.gemT = 0.8; A.gem(f.gemStreak); }
        } else if (e.k === "hurt") {
          const pr = v.p.find((p) => p[0] === e.p);
          if (pr) {
            if (f.texts.length < 80) f.texts.push({ x: pr[1], y: pr[2] - 20, vy: -50, life: 0.7, str: "-" + e.d, col: "#ff6b8b", size: 16 });
            burst(pr[1], pr[2], "#ff6b8b", 10, 160, 0.5, 3);
          }
          if (e.p === myId && me.current) {
            me.current.kx += e.kx; me.current.ky += e.ky;           // knocked back
            f.shake = Math.max(f.shake, 9); f.flash = 0.3; f.hitStop = 0.05; A.hurt();
          }
        } else if (e.k === "down") {
          const pr = v.p.find((p) => p[0] === e.p);
          if (pr) burst(pr[1], pr[2], COLS[slotOf(e.p)].glow, 36, 240, 0.9, 4);
          const many = (v.p || []).length > 1;
          say(e.p === myId ? (many ? "You're down! A friend can stand by you to bring you back." : "The lantern flickers…") : `${nameOf(e.p)} is down! Stand by them for 3 s.`, 2.6);
          if (e.p === myId) { me.current = null; A.lose(); }
        } else if (e.k === "revive") {
          const pr = v.p.find((p) => p[0] === e.p);
          if (pr) burst(pr[1], pr[2], COLS[slotOf(e.p)].glow, 24, 180, 0.7, 4);
          say(e.p === myId ? "You're back!" : `${nameOf(e.p)} is back!`, 2); A.heal();
          if (e.p === myId) { me.current = null; fromServer(v); }
        } else if (e.k === "level") {
          for (const pr of v.p) if (pr[5]) { burst(pr[1], pr[2], "#ffe28a", 26, 220, 0.7, 3.5); f.rings.push({ x: pr[1], y: pr[2], r: 10, max: 230, life: 0.55, t: 0, col: "#ffe28a", follow: pr[0] }); }
          A.level();
        } else if (e.k === "heal") { A.heal(); const pr = v.p.find((p) => p[0] === e.p); if (pr) { f.texts.push({ x: pr[1], y: pr[2] - 24, vy: -50, life: 0.8, str: "+Health", col: "#ff9ab0", size: 15 }); burst(pr[1], pr[2], "#ff6b8b", 12, 120, 0.6, 3); } }
        else if (e.k === "boss") { A.boss(); f.shake = Math.max(f.shake, 10); say(e.n === 1 ? "Gloomaw, the giant shadow, appears!" : "The Moon Moth Queen is here!", 3); }
        else if (e.k === "bossdown") say(e.n === 1 ? "Gloomaw is gone!" : "The Moon Moth Queen fades!", 2.5);
        else if (e.k === "roar") f.rings.push({ x: e.x, y: e.y, r: 30, max: 160, life: 0.5, t: 0, col: "#7a5fe0" });
        else if (e.k === "elite") say("An elite shadow approaches!", 2);
        else if (e.k === "swarm") say("Swarm!", 2);
        else if (e.k === "start") { say("Night falls. Hold out until dawn!", 3); A.beep(true); A.mood.on = true; }
        else if (e.k === "dawn") { if (e.won) { A.win(); say("Dawn breaks!", 4); } }
        else if (e.k === "out") { say("The lantern went out", 4); }
      }
    },
    onSnap: (r) => { if (me.current) { me.current.x = r.x; me.current.y = r.y; } },
  });
  const tgLive = tg.live, tgReport = tg.report, tgSend = tg.send;

  // ── input ──────────────────────────────────────────────────────────────────
  const pick = useCallback((i) => { audio.current.init(); tgSend("pick", { i }); }, [tgSend]);
  useEffect(() => {
    if (isSpectator) return undefined;
    const down = (e) => {
      const c = e.code;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(c)) e.preventDefault();
      if (e.repeat) return;
      keys.current[c] = true;
      audio.current.init();
      if (c === "Digit1" || c === "Numpad1") pick(0);
      if (c === "Digit2" || c === "Numpad2") pick(1);
      if (c === "Digit3" || c === "Numpad3") pick(2);
      if (c === "KeyM") setMuted((m) => !m);
    };
    const up = (e) => { keys.current[e.code] = false; };
    const blur = () => { keys.current = {}; joy.current = { x: 0, y: 0 }; dashBtn.current = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [isSpectator, pick]);

  // the stick: its middle and the finger, both turned into the game's frame
  const knobRef = useRef(null), stickId = useRef(null), stickC = useRef({ x: 0, y: 0 });
  const stickMove = (e) => {
    const p = toGame(e, rot.current), c = stickC.current;
    let dx = p.x - c.x, dy = p.y - c.y;
    const l = Math.hypot(dx, dy), m = 46;
    if (l > m) { dx *= m / l; dy *= m / l; }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px,${dy}px)`;
    joy.current = { x: dx / m, y: dy / m };
  };
  const stickDown = (e) => {
    e.preventDefault(); e.stopPropagation(); audio.current.init();
    stickId.current = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
    const r = e.currentTarget.getBoundingClientRect();
    stickC.current = toGame({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }, rot.current);
    stickMove(e);
  };
  const stickUp = (e) => {
    if (e.pointerId !== stickId.current) return;
    stickId.current = null; joy.current = { x: 0, y: 0 };
    if (knobRef.current) knobRef.current.style.transform = "";
  };

  // ── the loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf, last = performance.now(), hudAt = 0, beeped = -1;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = Math.max(last, now);
      const L = tgLive.current, c = cvRef.current;
      if (!L || !L.view || !c) return;
      const v = L.view, f = fx.current, A = audio.current;
      const tNow = Math.max(0, (Date.now() - L.startLocal) / 1000);
      const dur = (L.duration || durationSeconds * 1000) / 1000;
      const nightT = Math.max(0, tNow - START_S) * (NIGHT / Math.max(1, dur - START_S));
      let dawn = clamp(nightT / 340, 0, 1); dawn = dawn * dawn * (3 - 2 * dawn);
      A.mood.major = dawn > 0.6;
      const mineRow = v.p.find((p) => p[0] === myId);
      const { WL: myWL, PL: myPL } = parseLoadout(mineRow?.[11]);
      if (v.ph === "count" && !isSpectator) { const n = Math.floor(tNow); if (n !== beeped && n < START_S) { beeped = n; A.beep(false); } }
      // ── my spirit, moved here ──
      const m = me.current;
      if (m && !isSpectator && mineRow && mineRow[5] && !L.over) {
        const k = keys.current;
        let ix = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + joy.current.x;
        let iy = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0) + joy.current.y;
        const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
        if (v.ph !== "play") { ix = 0; iy = 0; }
        const wantDash = !!(k.Space || k.ShiftLeft || k.ShiftRight || dashBtn.current);
        m.dashCd = Math.max(0, m.dashCd - dt);
        if (ix || iy) { m.dx = ix; m.dy = iy; if (Math.abs(ix) > 0.2) m.face = ix > 0 ? 1 : -1; }
        if (wantDash && m.dashCd <= 0 && m.dashT <= 0 && v.ph === "play" && (m.dx || m.dy)) {
          m.dashT = DASH_S; m.dashCd = DASH_CD; A.dash(); burst(m.x, m.y, COLS[slotOf(myId)].glow, 10, 120, 0.4, 3);
        }
        if (m.dashT > 0) {
          m.dashT -= dt; const l = Math.hypot(m.dx, m.dy) || 1;
          m.vx = (m.dx / l) * DASH_SPEED; m.vy = (m.dy / l) * DASH_SPEED;
          if (Math.random() < 0.8) f.parts.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 9, col: COLS[slotOf(myId)].glow });
        } else {
          const sp = speedOf(myPL), kk = Math.min(1, 14 * dt);
          m.vx += (ix * sp - m.vx) * kk; m.vy += (iy * sp - m.vy) * kk;
        }
        m.kx *= Math.exp(-8 * dt); m.ky *= Math.exp(-8 * dt);
        m.x += (m.vx + m.kx) * dt; m.y += (m.vy + m.ky) * dt;
        m.bob += dt * (Math.hypot(m.vx, m.vy) > 20 ? 12 : 3);
        m.trail -= dt;
        if (m.trail <= 0 && Math.hypot(m.vx, m.vy) > 30) { m.trail = 0.05; f.parts.push({ x: m.x, y: m.y + 8, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.45, max: 0.45, size: 4, col: COLS[slotOf(myId)].glow }); }
        const nowMs = Date.now();
        if (nowMs - sentAt.current >= REPORT_MS) {
          sentAt.current = nowMs;
          tgReport({ x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, d: m.dashT > 0 ? 1 : 0, f: m.face });
        }
      }
      // ── where everything is ──
      const P = smoothRows(L, "p", [1, 2], 200).map(({ row }) => row);
      const E = smoothRows(L, "e", [2, 3], 200).map(({ row }) => row);
      const B = smoothRows(L, "b", [2, 3], 200).map(({ row }) => row);
      const G = smoothRows(L, "g", [1, 2], 200).map(({ row }) => row);
      const watchId = isSpectator ? Number(spectatorWatching?.user_id) : myId;
      const focus = (m && !isSpectator) ? m : P.find((p) => p[0] === watchId) || P.find((p) => p[5]) || P[0];
      const fxx = focus ? (focus.x ?? focus[1]) : 0, fyy = focus ? (focus.y ?? focus[2]) : 0;
      // ── the effects ──
      for (const q of f.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.exp(-3 * dt); q.vy *= Math.exp(-3 * dt); q.life -= dt; }
      f.parts = f.parts.filter((q) => q.life > 0);
      for (const x of f.texts) { x.y += x.vy * dt; x.vy *= Math.exp(-3 * dt); x.life -= dt; }
      f.texts = f.texts.filter((x) => x.life > 0);
      for (const r of f.rings) {
        r.t += dt;
        if (r.follow != null) { const pr = r.follow === myId && m ? [0, m.x, m.y] : P.find((p) => p[0] === r.follow); if (pr) { r.x = pr[1]; r.y = pr[2]; } }
      }
      f.rings = f.rings.filter((r) => r.t < r.life);
      for (const b of f.bolts) b.life -= dt;
      f.bolts = f.bolts.filter((b) => b.life > 0);
      f.shake = Math.max(0, f.shake - dt * 30); f.flash = Math.max(0, f.flash - dt * 1.6); f.bannerT = Math.max(0, f.bannerT - dt); f.gemT -= dt;
      // ── drawing ──
      const W = size.current.w, H = size.current.h, DPR = Math.min(2, window.devicePixelRatio || 1);
      const S = clamp(Math.min(W, H) / 640, 0.62, 1.35);
      if (c.width !== Math.round(W * DPR) || c.height !== Math.round(H * DPR)) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
      const dk = darkRef.current || (darkRef.current = document.createElement("canvas"));
      if (dk.width !== c.width || dk.height !== c.height) { dk.width = c.width; dk.height = c.height; }
      const ctx = c.getContext("2d"), dctx = dk.getContext("2d");
      const camX = fxx, camY = fyy, T = tNow, seed = Number(L.world?.seed) | 0;
      const sx = f.shake ? (Math.random() - 0.5) * f.shake * 0.7 : 0, sy = f.shake ? (Math.random() - 0.5) * f.shake * 0.7 : 0;
      const setWorld = (g) => g.setTransform(DPR * S, 0, 0, DPR * S, (W * DPR) / 2 - camX * DPR * S + sx * DPR, (H * DPR) / 2 - camY * DPR * S + sy * DPR);
      const hw = W / S / 2 + 60, hh = H / S / 2 + 60;
      const inView = (x, y, pad = 40) => Math.abs(x - camX) < hw + pad && Math.abs(y - camY) < hh + pad;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#0a1030"; ctx.fillRect(0, 0, c.width, c.height);
      setWorld(ctx);
      // the ground: deep forest green to a sunny meadow by dawn
      ctx.fillStyle = `rgb(${Math.round(lerp(40, 92, dawn))},${Math.round(lerp(98, 168, dawn))},${Math.round(lerp(78, 92, dawn))})`;
      ctx.fillRect(camX - hw, camY - hh, hw * 2, hh * 2);
      const CS = 90;
      for (let cx = Math.floor((camX - hw) / CS); cx <= Math.floor((camX + hw) / CS); cx++) for (let cy = Math.floor((camY - hh) / CS); cy <= Math.floor((camY + hh) / CS); cy++) {
        const h = hash2(cx, cy, seed), h2 = hash2(cy, cx, seed + 7), px = cx * CS + h2 * CS * 0.8 + 10, py = cy * CS + hash2(cx + 9, cy - 3, seed) * CS * 0.8 + 10;
        if (h < 0.28) { ctx.fillStyle = "rgba(20,60,40,.16)"; ctx.beginPath(); ctx.ellipse(px, py, 34, 20, 0, 0, TAU); ctx.fill(); }
        else if (h < 0.4) { ctx.fillStyle = h2 < 0.5 ? "#e86f9a" : "#ffe066"; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(px + Math.cos(i * 1.9) * 9, py + Math.sin(i * 2.3) * 6, 2.4, 0, TAU); ctx.fill(); } }
        else if (h < 0.47) { ctx.fillStyle = "#d9d2c4"; ctx.beginPath(); ctx.ellipse(px, py + 10, 10, 4, 0, 0, TAU); ctx.fill(); ctx.fillRect(px - 2.5, py + 2, 5, 9); ctx.fillStyle = h2 < 0.5 ? "#ff6b8b" : "#7be0ff"; ctx.beginPath(); ctx.ellipse(px, py + 2, 10, 6, 0, Math.PI, TAU); ctx.fill(); }
        else if (h < 0.53) { ctx.fillStyle = "#6f7a86"; ctx.beginPath(); ctx.ellipse(px, py + 4, 13, 9, 0, 0, TAU); ctx.fill(); ctx.fillStyle = "#8a96a3"; ctx.beginPath(); ctx.ellipse(px - 3, py + 1, 8, 5, 0, 0, TAU); ctx.fill(); }
        else if (h < 0.58) { ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(px, py + 12, 16, 6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = "#2f7a48"; ctx.beginPath(); ctx.arc(px, py, 15, 0, TAU); ctx.fill(); ctx.fillStyle = "#3d9a5a"; ctx.beginPath(); ctx.arc(px - 4, py - 4, 10, 0, TAU); ctx.fill(); }
      }
      // gems and hearts
      for (const g of G) {
        if (!inView(g[1], g[2])) continue;
        const pul = 1 + Math.sin(T * 8 + g[1]) * 0.12, col = g[3] >= 8 ? "#d58cff" : g[3] >= 3 ? "#6dff9c" : "#6ad6ff";
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(g[1], g[2] - 6 * pul); ctx.lineTo(g[1] + 4.5 * pul, g[2]); ctx.lineTo(g[1], g[2] + 6 * pul); ctx.lineTo(g[1] - 4.5 * pul, g[2]); ctx.closePath(); ctx.fill();
      }
      for (const k of v.h) {
        if (!inView(k[1], k[2])) continue;
        const y = k[2] + Math.sin(T * 5) * 2; ctx.fillStyle = "#ff6b8b";
        ctx.beginPath(); ctx.moveTo(k[1], y + 8); ctx.bezierCurveTo(k[1] - 16, y - 4, k[1] - 7, y - 14, k[1], y - 5); ctx.bezierCurveTo(k[1] + 7, y - 14, k[1] + 16, y - 4, k[1], y + 8); ctx.fill();
      }
      // spirits (me from here, the others from the server) and shadows, back to front
      const people = P.map((p) => (p[0] === myId && m ? [p[0], m.x, m.y, ...p.slice(3)] : p));
      const list = [];
      for (const e of E) if (inView(e[2], e[3], 80)) list.push([e[3], 0, e]);
      for (const p of people) list.push([p[2], 1, p]);
      list.sort((a, b) => a[0] - b[0]);
      for (const it of list) { if (it[1]) drawPlayer(ctx, it[2], T, it[2][0] === myId ? m : null); else drawEnemy(ctx, it[2], T); }
      // fireflies (from the clock and each loadout: where the server hits with them)
      for (const p of people) {
        if (!p[5]) continue;
        const L2 = parseLoadout(p[11]).WL.orbit;
        if (!L2) continue;
        const { n: cnt, rad } = orbitOf(L2), a0 = orbitAngle(p[0], L2, Math.max(0, T));
        for (let i = 0; i < cnt; i++) {
          const a = a0 + (i / cnt) * TAU, x = p[1] + Math.cos(a) * rad, y = p[2] + Math.sin(a) * rad;
          for (let k = 1; k < 4; k++) { const aa = a - k * 0.12; ctx.fillStyle = `rgba(157,255,138,${0.25 - k * 0.06})`; ctx.beginPath(); ctx.arc(p[1] + Math.cos(aa) * rad, p[2] + Math.sin(aa) * rad, 7 - k, 0, TAU); ctx.fill(); }
          ctx.fillStyle = "#d6ffb0"; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); ctx.fillStyle = "#9dff8a"; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
        }
      }
      for (const b of B) {
        if (!inView(b[2], b[3])) continue;
        if (b[1] === 0) { ctx.fillStyle = "rgba(255,226,138,.45)"; ctx.beginPath(); ctx.arc(b[2], b[3], 8, 0, TAU); ctx.fill(); ctx.fillStyle = "#fff6c8"; ctx.beginPath(); ctx.arc(b[2], b[3], 4.5, 0, TAU); ctx.fill(); }
        else { ctx.save(); ctx.translate(b[2], b[3]); ctx.rotate(T * 14 + b[0]); ctx.fillStyle = "#7be07b"; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(0, -13, 14, 0); ctx.quadraticCurveTo(0, 13, -14, 0); ctx.fill(); ctx.strokeStyle = "#245a2c"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke(); ctx.restore(); }
      }
      for (const q of f.parts) { const a = clamp(q.life / q.max, 0, 1); ctx.fillStyle = q.col; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (0.4 + a * 0.6), 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (const r of f.rings) { const k = r.t / r.life, rr = lerp(r.r, r.max, 1 - (1 - k) * (1 - k)); ctx.strokeStyle = r.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, rr, 0, TAU); ctx.stroke(); ctx.globalAlpha = (1 - k) * 0.12; ctx.fillStyle = r.col; ctx.fill(); ctx.globalAlpha = 1; }
      for (const b of f.bolts) {
        const k = b.life / b.max; ctx.strokeStyle = `rgba(230,220,255,${k})`; ctx.lineWidth = 4; ctx.lineJoin = "round";
        ctx.beginPath(); let x = b.x, y = b.y - 420; ctx.moveTo(x, y);
        for (let i = 0; i < 7; i++) { x = b.x + Math.sin(b.seed + i * 7.3) * 20 * (i < 6 ? 1 : 0); y = b.y - 420 + (i + 1) * 60; ctx.lineTo(x, Math.min(y, b.y)); }
        ctx.stroke(); ctx.fillStyle = `rgba(255,255,255,${k * 0.6})`; ctx.beginPath(); ctx.arc(b.x, b.y, 28 * k, 0, TAU); ctx.fill();
      }
      // ── the dark, with the lights cut out of it ──
      const dark = lerp(0.74, 0, dawn);
      if (dark > 0.01) {
        dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.globalCompositeOperation = "source-over"; dctx.clearRect(0, 0, dk.width, dk.height);
        dctx.fillStyle = `rgba(5,9,34,${dark})`; dctx.fillRect(0, 0, dk.width, dk.height);
        dctx.globalCompositeOperation = "destination-out"; setWorld(dctx);
        const hole = (x, y, r, s) => { if (!inView(x, y, r)) return; const g = dctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(0,0,0,${s})`); g.addColorStop(0.55, `rgba(0,0,0,${s * 0.55})`); g.addColorStop(1, "rgba(0,0,0,0)"); dctx.fillStyle = g; dctx.fillRect(x - r, y - r, r * 2, r * 2); };
        for (const p of people) hole(p[1], p[2], p[5] ? 250 : 40, p[5] ? 1 : 0.7);
        for (const b of B) hole(b[2], b[3], b[1] ? 55 : 42, 0.9);
        for (const p of people) {
          const L2 = p[5] && parseLoadout(p[11]).WL.orbit;
          if (!L2) continue;
          const { n: cnt, rad } = orbitOf(L2), a0 = orbitAngle(p[0], L2, Math.max(0, T));
          for (let i = 0; i < cnt; i++) { const a = a0 + (i / cnt) * TAU; hole(p[1] + Math.cos(a) * rad, p[2] + Math.sin(a) * rad, 60, 0.9); }
        }
        for (const g of G) hole(g[1], g[2], 30, 0.8);
        for (const k of v.h) hole(k[1], k[2], 45, 0.9);
        for (const e of E) if (e[5] & 7) hole(e[2], e[3], e[5] & 6 ? 160 : 80, 0.7);
        for (const r of f.rings) hole(r.x, r.y, r.r + 40, 0.7 * (1 - r.t / r.life));
        for (const b of f.bolts) hole(b.x, b.y, 130, b.life / b.max);
        for (let cx = Math.floor((camX - hw) / CS); cx <= Math.floor((camX + hw) / CS); cx++) for (let cy = Math.floor((camY - hh) / CS); cy <= Math.floor((camY + hh) / CS); cy++) {
          const h = hash2(cx, cy, seed);
          if (h >= 0.4 && h < 0.47) { const h2 = hash2(cy, cx, seed + 7); hole(cx * CS + h2 * CS * 0.8 + 10, cy * CS + hash2(cx + 9, cy - 3, seed) * CS * 0.8 + 12, 70, 0.6); }   // glowing mushrooms
        }
        dctx.globalCompositeOperation = "source-over";
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(dk, 0, 0);
      }
      // eyes over the dark, so the shadows read at night (and still have eyes by day)
      setWorld(ctx);
      for (const e of E) { if (!inView(e[2], e[3])) continue; eyes(ctx, e); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (dawn > 0.5) { ctx.fillStyle = `rgba(255,196,120,${(dawn - 0.5) * 0.16})`; ctx.fillRect(0, 0, c.width, c.height); }
      if (f.flash > 0) { const g = ctx.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.3, c.width / 2, c.height / 2, c.height * 0.85); g.addColorStop(0, "rgba(255,60,90,0)"); g.addColorStop(1, `rgba(255,60,90,${f.flash})`); ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height); }
      // floating numbers and names
      setWorld(ctx); ctx.textAlign = "center";
      for (const x of f.texts) { ctx.globalAlpha = clamp(x.life / 0.3, 0, 1); ctx.font = `700 ${x.size}px ${BODY}`; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,16,48,.8)"; ctx.strokeText(x.str, x.x, x.y); ctx.fillStyle = x.col; ctx.fillText(x.str, x.x, x.y); }
      ctx.globalAlpha = 1;
      if (people.length > 1) for (const p of people) {
        if (p[0] === myId && !isSpectator) continue;
        ctx.font = `800 12px ${BODY}`; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,16,48,.85)"; ctx.fillStyle = COLS[slotOf(p[0])].body;
        ctx.strokeText(nameOf(p[0]), p[1], p[2] - 34); ctx.fillText(nameOf(p[0]), p[1], p[2] - 34);
        // their weapons, small
        const { WL } = parseLoadout(p[11]), ws = WKEYS.filter((k) => WL[k]);
        ws.forEach((k, i) => ctx.drawImage(icon(k), p[1] - (ws.length * 13) / 2 + i * 13, p[2] - 30, 12, 12));
        if (!p[5] && p[9] > 0) { ctx.strokeStyle = "#9dff8a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p[1], p[2], 22, -Math.PI / 2, -Math.PI / 2 + TAU * p[9] / 100); ctx.stroke(); }
      }
      hudDraw(ctx, { W, H, DPR, v, people, myWL, myPL, f, mineRow });
      // the HUD's React bits, now and then
      if (now - hudAt > 200) {
        hudAt = now;
        const cards = mineRow && v.o && v.o[myId] ? v.o[myId] : null;
        const nextHud = { left: secondsLeft(L), cards, pickT: mineRow ? mineRow[12] : 0, alive: !!(mineRow && mineRow[5]), ph: v.ph, count: v.ph === "count" ? START_S - Math.floor(tNow) : 0,
          rivals: rivals(L), revive: mineRow ? mineRow[9] : 0, many: v.p.length > 1 };
        setHud((h) => (JSON.stringify(h) === JSON.stringify(nextHud) ? h : nextHud));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tgLive, tgReport, myId, isSpectator, durationSeconds, nameOf]); // eslint-disable-line react-hooks/exhaustive-deps

  // the canvas HUD: XP along the top, health, kills, weapons, the boss, the banner
  function hudDraw(ctx, { W, H, DPR, v, people, myWL, myPL, f }) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.textBaseline = "alphabetic";
    const pad = 12;
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, 0, W, 8);
    ctx.fillStyle = "#6ad6ff"; ctx.fillRect(0, 0, W * clamp(v.xp / 1000, 0, 1), 8);
    // health, mine first
    const order = [...people].sort((a, b) => (a[0] === myId ? -1 : b[0] === myId ? 1 : a[0] - b[0])).slice(0, 4);
    order.forEach((p, i) => {
      const x = pad, y = 16 + i * 30, w = Math.min(140, W * 0.3), col = COLS[slotOf(p[0])];
      ctx.textAlign = "left"; ctx.font = `700 12px ${BODY}`; ctx.fillStyle = col.body; ctx.strokeStyle = "rgba(10,16,48,.7)"; ctx.lineWidth = 3;
      const label = (p[0] === myId ? "You" : nameOf(p[0])) + (p[5] ? "" : " (down)");
      ctx.strokeText(label, x, y + 9); ctx.fillText(label, x, y + 9);
      ctx.fillStyle = "rgba(0,0,0,.5)"; rr(ctx, x, y + 12, w, 9, 4.5); ctx.fill();
      ctx.fillStyle = p[3] / p[4] > 0.3 ? "#ff7a96" : "#ff3a5a"; rr(ctx, x, y + 12, Math.max(0, w * clamp(p[3] / p[4], 0, 1)), 9, 4.5); ctx.fill();
    });
    // level and kills, top right
    ctx.textAlign = "right"; ctx.font = `700 15px ${DISPLAY}`; ctx.fillStyle = "#fff6d6"; ctx.strokeStyle = "rgba(10,16,48,.7)"; ctx.lineWidth = 3;
    ctx.strokeText(`Level ${v.lv}`, W - pad, 26); ctx.fillText(`Level ${v.lv}`, W - pad, 26);
    ctx.font = `700 13px ${BODY}`;
    ctx.strokeText(`${v.k} banished`, W - pad, 44); ctx.fillText(`${v.k} banished`, W - pad, 44);
    // my weapons and charms
    if (!isSpectator) {
      let ix = pad; const iy = 16 + Math.min(4, order.length) * 30 + 2;
      for (const k of [...WKEYS, ...PKEYS]) {
        const lv = myWL[k] !== undefined ? myWL[k] : myPL[k];
        if (!lv) continue;
        ctx.drawImage(icon(k), ix, iy, 24, 24);
        ctx.fillStyle = "#fff"; ctx.font = `800 10px ${BODY}`; ctx.textAlign = "right"; ctx.strokeStyle = "rgba(10,16,48,.9)"; ctx.lineWidth = 3;
        ctx.strokeText(String(lv), ix + 24, iy + 24); ctx.fillText(String(lv), ix + 24, iy + 24); ix += 27;
      }
    }
    // the boss
    if (v.bs) {
      const bw = Math.min(320, W * 0.55), bx = W / 2 - bw / 2, by = 54;
      ctx.fillStyle = "rgba(0,0,0,.55)"; rr(ctx, bx, by, bw, 10, 5); ctx.fill();
      ctx.fillStyle = v.bs[0] === 1 ? "#a06bff" : "#ff6bc0"; rr(ctx, bx, by, Math.max(0, bw * clamp(v.bs[1] / 1000, 0, 1)), 10, 5); ctx.fill();
      ctx.textAlign = "center"; ctx.font = `700 12px ${BODY}`; ctx.fillStyle = "#fff"; ctx.fillText(v.bs[0] === 1 ? "Gloomaw" : "Moon Moth Queen", W / 2, by + 24);
    }
    if (f.bannerT > 0 && f.banner) {
      const a = clamp(Math.min(f.bannerT, 0.4) / 0.4, 0, 1);
      ctx.globalAlpha = a; ctx.textAlign = "center"; ctx.font = `700 ${W < 600 ? 20 : 30}px ${DISPLAY}`; ctx.fillStyle = "#fff6d6"; ctx.strokeStyle = "rgba(10,16,48,.85)"; ctx.lineWidth = 5;
      ctx.strokeText(f.banner, W / 2, H * 0.32); ctx.fillText(f.banner, W / 2, H * 0.32); ctx.globalAlpha = 1;
    }
  }

  // ── the screen ─────────────────────────────────────────────────────────────
  const press = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ } audio.current.init(); fn(); };
  return (
    <>
      <GameFrame
        gameName="Lantern Wisps" badge="🏮 LANTERN WISPS"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={[]}
        timer={{ value: hud.left, max: durationSeconds }}
        opponents={hud.rivals}
        onQuit={onGameEnd}
        landscape
        bare
        floatExtra={!isSpectator ? (
          <button type="button" className="gf-btn" aria-label={muted ? "Sound on" : "Sound off"} aria-pressed={muted}
            onClick={() => { audio.current.init(); setMuted((x) => !x); }}>{muted ? "✕ ♪" : "♪"}</button>
        ) : null}
      >
        {({ w, h }) => {
          size.current = { w, h };
          return (
            <div className={`lw-stage${touchUi ? " touch" : ""}`} ref={hostRef} style={{ width: w, height: h }}
              onPointerDown={(e) => { audio.current.init(); if (e.pointerType === "touch" && !touchUi) setTouchUi(true); }}
              onContextMenu={(e) => e.preventDefault()}>
              <canvas ref={cvRef} className="lw-canvas" role="img" aria-label="Lantern Wisps: the night forest from above" />
              {!tg.ready && <div className="lw-msg">{tg.gone ? "This night is over." : "Lighting the lanterns…"}</div>}
              {hud.ph === "count" && hud.count > 0 && <div className="lw-count">{hud.count}</div>}
              {!isSpectator && tg.ready && !hud.alive && !tg.over && (
                <div className="lw-down">
                  {hud.many ? <>💤 You're down — stand-by friends bring you back, or the next level-up does{hud.revive > 0 ? ` · ${hud.revive}%` : ""}</> : "💤 The lantern went out — the night ends with the clock"}
                </div>
              )}
              {hud.cards && !tg.over && (
                <div className="lw-cards" role="dialog" aria-label="Level up: pick an upgrade">
                  <div className="lw-cards-head"><b>Level up!</b><span>Pick one · you're shielded · {hud.pickT}s</span></div>
                  <div className="lw-cards-row">
                    {hud.cards.map(([k, lv], i) => {
                      const isW = !!WEAPONS[k], def = isW ? WEAPONS[k] : PASSIVES[k];
                      return (
                        <button key={k + i} type="button" className="lw-card" onClick={() => pick(i)} aria-label={`${def.name}: ${isW ? def.desc[Math.min(lv, 4)] : def.desc}`}>
                          <Icon kind={k} size={40} />
                          <b>{def.name}</b>
                          <i>{lv === 0 ? (isW ? "New weapon" : "New") : `Level ${lv} → ${lv + 1}`}</i>
                          <span>{isW ? def.desc[Math.min(lv, 4)] : def.desc}</span>
                          <kbd>{i + 1}</kbd>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {!isSpectator && touchUi && (
                <>
                  <div className="lw-stick" onPointerDown={stickDown} onPointerMove={(e) => { if (e.pointerId === stickId.current) stickMove(e); }}
                    onPointerUp={stickUp} onPointerCancel={stickUp} aria-label="Move">
                    <div className="lw-knob" ref={knobRef} />
                  </div>
                  <button type="button" className="lw-dash" aria-label="Dash"
                    onPointerDown={press(() => { dashBtn.current = true; })}
                    onPointerUp={() => { dashBtn.current = false; }} onPointerCancel={() => { dashBtn.current = false; }}>DASH</button>
                </>
              )}
            </div>
          );
        }}
      </GameFrame>
      {tg.over && !isSpectator && (
        <TogetherResults over={tg.over} me={currentUser} onExit={onGameEnd} icon="🏮"
          goalText={(s) => (s.sum?.dawn ? `Dawn broke — you made it through the night! Level ${s.sum.level}, ${s.sum.kills} shadows banished.` : `The lantern went out after ${fmt(s.sum?.lasted || 0)}. Level ${s.sum?.level ?? 1}, ${s.sum?.kills ?? 0} banished.`)}
          describe={(s) => `${s.sum?.dawn ? "🌅 saw dawn" : `lasted ${fmt(s.sum?.lasted || 0)}`} · level ${s.sum?.level ?? 1} · ${s.sum?.kills ?? 0} banished`} />
      )}
    </>
  );

  // ── drawing helpers that need the game's colours ──
  function drawPlayer(ctx, p, T, mine) {
    const col = COLS[slotOf(p[0])], alive = !!p[5];
    ctx.save(); ctx.translate(p[1], p[2]);
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(0, 15, 12, 5, 0, 0, TAU); ctx.fill();
    if (!alive) { ctx.globalAlpha = 0.4; ctx.translate(0, Math.sin(T * 3) * 3 - 8); }
    else if (p[6] && Math.floor(T * 20) % 2 === 0) ctx.globalAlpha = 0.55;
    const bob = mine ? Math.sin(mine.bob) * 2 : Math.sin(T * 6 + p[0]) * 1.5;
    ctx.translate(0, bob);
    if (mine && mine.dashCd > 0) { ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 19, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - mine.dashCd / DASH_CD)); ctx.stroke(); }
    const gr = ctx.createRadialGradient(-4, -5, 2, 0, 0, 15); gr.addColorStop(0, "#fffbe6"); gr.addColorStop(0.45, col.body); gr.addColorStop(1, shade(col.body));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
    ctx.fillStyle = "#5fcf6a"; ctx.beginPath(); ctx.moveTo(-3, -12); ctx.quadraticCurveTo(2, -26, 14, -22); ctx.quadraticCurveTo(8, -12, -3, -12); ctx.fill();
    const f = mine ? mine.face : p[8] || 1, blink = (T * 0.37 + p[0] * 0.13) % 3 < 0.08;
    ctx.fillStyle = "#1a1a30"; ctx.beginPath(); ctx.ellipse(-4 + f * 2, -1, 2.4, blink ? 0.5 : 3.2, 0, 0, TAU); ctx.ellipse(5 + f * 2, -1, 2.4, blink ? 0.5 : 3.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-3.4 + f * 2, -2.2, 0.9, 0, TAU); ctx.arc(5.6 + f * 2, -2.2, 0.9, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#1a1a30"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(f, 4, 3.2, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.strokeStyle = "#8a5a30"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f * 13, 2); ctx.lineTo(f * 18, -6); ctx.stroke();
    const lg = ctx.createRadialGradient(f * 18, -9, 1, f * 18, -9, 7); lg.addColorStop(0, "#fff"); lg.addColorStop(1, col.glow);
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(f * 18, -9, 5, 0, TAU); ctx.fill();
    // the card shield: a bubble while choosing
    if (alive && p[7]) { ctx.globalAlpha = 0.35 + Math.sin(T * 6) * 0.1; ctx.strokeStyle = "#ffe28a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.stroke(); ctx.globalAlpha = 0.1; ctx.fillStyle = "#ffe28a"; ctx.fill(); }
    ctx.restore();
  }
}

function shade(h) { const n = parseInt(h.slice(1), 16), r = ((n >> 16) & 255) * 0.62 | 0, g = ((n >> 8) & 255) * 0.62 | 0, b = (n & 255) * 0.62 | 0; return `rgb(${r},${g},${b})`; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); r = Math.min(r, w / 2, h / 2); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
// a shadow: [id, type, x, y, hp %, flags, angle×100]
const ECOL = ["#8b6bef", "#6a4fd0", "#ff6b6b"];
function radiusOf(e) { const base = [11, 18, 13][e[1]] || 11; return e[5] & 2 ? 46 : e[5] & 4 ? 34 : e[5] & 1 ? base * 1.5 : base; }
function drawEnemy(ctx, e, T) {
  const r = radiusOf(e), type = ETYPE[e[1]], fl = e[5] & 16, boss = e[5] & 6, elite = e[5] & 1;
  ctx.save(); ctx.translate(e[2], e[3]);
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(0, r * 0.8, r * 0.9, r * 0.35, 0, 0, TAU); ctx.fill();
  if (elite || boss) { ctx.strokeStyle = boss ? "#ffe28a" : "#ffcf5a"; ctx.globalAlpha = 0.55 + Math.sin(T * 6) * 0.2; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
  if (type === "moth") {
    const w = Math.sin(T * 22 + e[0]) * 0.5;
    ctx.fillStyle = fl ? "#fff" : ECOL[0];
    ctx.beginPath(); ctx.ellipse(-r * 0.9, -2, r * 0.9, r * (0.7 + w * 0.3), -0.4, 0, TAU); ctx.ellipse(r * 0.9, -2, r * 0.9, r * (0.7 - w * 0.3), 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = fl ? "#fff" : "#5a3fb8"; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r * 0.8, 0, 0, TAU); ctx.fill();
  } else if (type === "blob") {
    const sq = Math.sin(T * 5 + e[0]) * 0.07;
    ctx.fillStyle = fl ? "#fff" : e[5] & 2 ? "#5a2fb0" : ECOL[1]; ctx.beginPath(); ctx.ellipse(0, 0, r * (1 + sq), r * (0.92 - sq), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.4, r * 0.35, r * 0.18, -0.5, 0, TAU); ctx.fill();
  } else {
    const warn = e[5] & 8, a = e[6] / 100 + Math.PI / 2;
    ctx.rotate(a);
    ctx.fillStyle = fl ? "#fff" : warn ? (Math.floor(T * 20) % 2 ? "#fff3a0" : ECOL[2]) : e[5] & 4 ? "#d04fa0" : ECOL[2];
    ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(r, r * 0.2); ctx.lineTo(0, r * 0.9); ctx.lineTo(-r, r * 0.2); ctx.closePath(); ctx.fill();
    ctx.rotate(-a);
  }
  if (e[5] & 2) { ctx.fillStyle = "#ffe28a"; ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.85); ctx.lineTo(-r * 0.3, -r * 1.25); ctx.lineTo(0, -r * 0.95); ctx.lineTo(r * 0.3, -r * 1.25); ctx.lineTo(r * 0.5, -r * 0.85); ctx.closePath(); ctx.fill(); }
  if (e[4] < 100 && !boss) { ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(-r, -r - 8, r * 2, 3); ctx.fillStyle = "#ff8a8a"; ctx.fillRect(-r, -r - 8, r * 2 * clamp(e[4] / 100, 0, 1), 3); }
  ctx.restore();
}
function eyes(ctx, e) {
  const r = radiusOf(e), er = r * 0.2, boss = e[5] & 6;
  ctx.fillStyle = boss ? "#ff4050" : "#fffbe0";
  ctx.beginPath(); ctx.arc(e[2] - r * 0.32, e[3] - r * 0.1, er + 0.6, 0, TAU); ctx.arc(e[2] + r * 0.32, e[3] - r * 0.1, er + 0.6, 0, TAU); ctx.fill();
  ctx.fillStyle = "#1a1030";
  ctx.beginPath(); ctx.arc(e[2] - r * 0.32, e[3] - r * 0.1, er * 0.45, 0, TAU); ctx.arc(e[2] + r * 0.32, e[3] - r * 0.1, er * 0.45, 0, TAU); ctx.fill();
}
