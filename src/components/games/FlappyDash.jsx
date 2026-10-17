// src/components/games/FlappyDash.jsx
// Tap to flap. Gravity does the rest. Squeeze through the gaps between pipes;
// each one you clear is 10 points. A crash costs 10 and dazes the bird for a
// moment, then you carry on — the room's clock decides when the match ends,
// not your last mistake. Everyone in a room flies the same pipes.
//
// The rules live in flappySim.js. This file draws the bird and takes the taps.
//
// Stars sit between the pipes, off the straight line — steer for them. Pipes
// in a row pay x2 from 10 and x3 from 20; every 10th pipe is golden. The sky
// turns from day to sunset to night as you fly. Feathers on a flap, a burst
// on a crash, the run counted big in the sky, and sound for all of it.
//
// Together (a co-op room): your friends fly beside you, see-through. A crash
// knocks you down for a few seconds unless a friend flies through a ❤️ —
// then everyone who's down is back up (runTogether.js). The side's points
// add up.
//
// Watched (a spectator): the player's phone sends a small frame of its flight
// (useSpecStream) and the watcher flies the same seeded course from it,
// carrying the bird on at its speed between frames so it moves at 60 fps.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useRunTogether from "./useRunTogether";
import useSpecStream from "./useSpecStream";
import { DOWN_S, HEART_PTS, teamGoal, hearts, heartsBetween } from "./runTogether";
import { team } from "./coopTeam";
import sfx from "./sfx";
import {
  VIEW_W, VIEW_H, GROUND, BIRD_X, BIRD_RY, GAP, PIPE_W, CRASH_COST, SPEED, GRAVITY, SPACING, STAR_R,
  makeCourse, newBird, flap, step, isGolden, streakMult,
} from "./flappySim";

const INK = "#2E2140";
const BODY = "#FFD23F";        // warm yellow, so the bird pops off the blue sky
const BODY_LIGHT = "#FFF3C4";  // belly
const WING = "#F2A227";        // wing sits a shade deeper than the body
const WING_LIGHT = "#FFE79A";
const BEAK = "#FF8A3D";        // orange, or a yellow beak would vanish into the face
const BEAK_DARK = "#E2662A";
const CHEEK = "#FF8FC7";
const PIPE = "#5DBB5A";
const PIPE_DARK = "#3E9E4F";

function rrect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
const paint = (ctx, fill) => { ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); };

// A round little yellow bird, drawn the way the app's other critters are:
// big eye, thick ink outline, simple shapes. Two passes — every shape in ink
// first (fat stroke plus fill, so they merge into one silhouette), then in
// colour on top — so the bird has one clean outline instead of one per part.
function drawBird(ctx, x, y, tilt, wing, dazed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // two little feathers sticking up off the head
  const tuft = () => {
    ctx.beginPath();
    ctx.moveTo(-1, -10); ctx.quadraticCurveTo(-5, -20, 3, -17);
    ctx.quadraticCurveTo(2, -22, 9, -16);
    ctx.quadraticCurveTo(6, -10, 0, -9);
    ctx.closePath();
  };
  const tailFeathers = () => {
    ctx.beginPath();
    ctx.moveTo(-10, -7);
    ctx.quadraticCurveTo(-22, -10, -27, -3);
    ctx.quadraticCurveTo(-21, 0, -25, 7);
    ctx.quadraticCurveTo(-17, 9, -9, 6);
    ctx.closePath();
  };
  const body = () => { ctx.beginPath(); ctx.ellipse(0, 0, 16.5, 14.5, 0, 0, Math.PI * 2); };
  const beak = () => {
    ctx.beginPath();
    ctx.moveTo(13, -5); ctx.lineTo(30, 0.5); ctx.lineTo(13, 6); ctx.closePath();
  };

  const parts = [[tailFeathers, WING], [tuft, WING], [body, BODY], [beak, BEAK]];
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  for (const [path] of parts) { path(); ctx.fill(); ctx.stroke(); }
  for (const [path, color] of parts) { path(); ctx.fillStyle = color; ctx.fill(); }

  // belly, the lower half of the beak, and a blush
  ctx.beginPath(); ctx.ellipse(3, 6, 11, 7.5, 0, 0, Math.PI * 2); ctx.fillStyle = BODY_LIGHT; ctx.fill();
  ctx.beginPath(); ctx.moveTo(13, 2); ctx.lineTo(27, 1); ctx.lineTo(13, 6); ctx.closePath();
  ctx.fillStyle = BEAK_DARK; ctx.fill();
  ctx.beginPath(); ctx.ellipse(3, 2, 4, 2.8, 0, 0, Math.PI * 2); ctx.fillStyle = CHEEK; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;

  // wing: a small feather that beats when you flap
  ctx.save();
  ctx.translate(-5, 1);
  ctx.rotate(wing);
  const feather = () => {
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.quadraticCurveTo(4, -6, 10, 2);
    ctx.quadraticCurveTo(2, 10, -7, 6);
    ctx.closePath();
  };
  ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 3.2;
  feather(); ctx.fill(); ctx.stroke();
  feather(); ctx.fillStyle = WING; ctx.fill();
  ctx.strokeStyle = WING_LIGHT; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(3, 0, 6, 3); ctx.stroke();
  ctx.restore();

  // the eye goes on last: big, forward, and the easiest thing to read
  const ex = 8.5, ey = -5;
  if (dazed) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ex - 4.5, ey - 4.5); ctx.lineTo(ex + 4.5, ey + 4.5);
    ctx.moveTo(ex + 4.5, ey - 4.5); ctx.lineTo(ex - 4.5, ey + 4.5);
    ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(ex, ey, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF"; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.beginPath(); ctx.arc(ex + 1.8, ey + 0.4, 3.2, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 0.5, ey - 1.6, 1.4, 0, Math.PI * 2); ctx.fillStyle = "#FFFFFF"; ctx.fill();
  }
  ctx.restore();
}

function drawPipe(ctx, left, gapY, gold) {
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  const topH = gapY - GAP / 2;
  const botY = gapY + GAP / 2;
  const lip = 16;
  const body = gold ? "#FFC53D" : PIPE, rim = gold ? "#E0A100" : PIPE_DARK;
  // shafts
  rrect(ctx, left, -20, PIPE_W, topH + 20 - lip, 6); paint(ctx, body);
  rrect(ctx, left, botY + lip, PIPE_W, VIEW_H - botY - lip, 6); paint(ctx, body);
  // lips
  rrect(ctx, left - 5, topH - lip, PIPE_W + 10, lip, 6); paint(ctx, rim);
  rrect(ctx, left - 5, botY, PIPE_W + 10, lip, 6); paint(ctx, rim);
  // a stripe of shine down each shaft
  ctx.fillStyle = "rgba(255,255,255,.28)";
  ctx.fillRect(left + 8, -20, 6, topH + 20 - lip - 4);
  ctx.fillRect(left + 8, botY + lip + 4, 6, VIEW_H - botY - lip);
}

// a five-pointed star
function drawStar(ctx, x, y, r, spin) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.lineJoin = "round";
  ctx.fillStyle = "#FFE27A"; ctx.fill(); ctx.stroke();
  ctx.restore();
}

// the sky over a flight: day, sunset, night, dawn, round again
const SKIES = [[0, ["#8FD3FF", "#DDF3FF"]], [0.4, ["#8FD3FF", "#DDF3FF"]], [0.5, ["#FF9E7A", "#FFD9A8"]],
  [0.6, ["#25204F", "#4A3F86"]], [0.86, ["#25204F", "#4A3F86"]], [0.94, ["#FFB4A2", "#FFE3C2"]], [1, ["#8FD3FF", "#DDF3FF"]]];
const DAY_LEN = 9000;                    // scrolled px round the whole day: sunset about a minute in
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, f) => `rgb(${hex(a).map((v, j) => Math.round(v + (hex(b)[j] - v) * f)).join(",")})`;
function skyAt(x) {
  const t = (((x % DAY_LEN) + DAY_LEN) % DAY_LEN) / DAY_LEN;
  let i = 0;
  while (i < SKIES.length - 2 && t > SKIES[i + 1][0]) i++;
  const [t0, a] = SKIES[i], [t1, b] = SKIES[i + 1], f = (t - t0) / Math.max(1e-6, t1 - t0);
  const night = t < 0.5 || t > 0.94 ? 0 : t < 0.6 ? (t - 0.5) / 0.1 : t <= 0.86 ? 1 : 1 - (t - 0.86) / 0.08;
  return { top: mix(a[0], b[0], f), bottom: mix(a[1], b[1], f), night };
}
const STARFIELD = Array.from({ length: 30 }, (_, i) => [(i * 97) % VIEW_W, 10 + ((i * 61) % 260), 0.8 + (i % 3) * 0.5]);

function draw(ctx, s, course, k, now, tg, idle = "Tap or press Space to flap!", fx = null) {
  ctx.setTransform(k, 0, 0, k, 0, 0);
  // sky, turning with the distance flown
  const tint = skyAt(s.x);
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, tint.top);
  sky.addColorStop(1, tint.bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (tint.night > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.9 * tint.night})`;
    for (const [sx, sy, r] of STARFIELD) { ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); }
  }
  // clouds drifting by
  ctx.fillStyle = tint.night > 0.5 ? "rgba(255,255,255,.55)" : "#FFFFFF";
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 140 - s.x * 0.25) % (VIEW_W + 160) + VIEW_W + 160) % (VIEW_W + 160) - 80;
    const cy = 46 + ((i * 53) % 130);
    for (const [dx, dy, r] of [[0, 0, 15], [16, -7, 18], [33, 0, 14]]) {
      ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  // pipes
  for (let i = s.first; i < course.list.length; i++) {
    const p = course.list[i];
    const left = p.x - s.x;
    if (left > VIEW_W) break;
    if (!p.gone) drawPipe(ctx, left, p.gapY, isGolden(i));
  }
  // stars to grab
  for (const st of course.stars || []) {
    const x = BIRD_X + (st.x - s.x);
    if (x < -20) continue;
    if (x > VIEW_W + 20) break;
    if (!st.taken) drawStar(ctx, x, st.y + Math.sin(now / 260 + st.x) * 3, STAR_R, Math.sin(now / 400 + st.x) * 0.3);
  }
  // ground
  const gy = VIEW_H - GROUND;
  ctx.fillStyle = "#F4D58D";
  ctx.fillRect(0, gy, VIEW_W, GROUND);
  ctx.fillStyle = "#E4BE6E";
  for (let i = 0; i < 12; i++) {
    const gx = ((i * 46 - s.x) % (VIEW_W + 46) + VIEW_W + 46) % (VIEW_W + 46) - 23;
    ctx.fillRect(gx, gy + 12, 22, 6);
  }
  if (tint.night > 0) { ctx.fillStyle = `rgba(28,24,70,${0.4 * tint.night})`; ctx.fillRect(0, gy, VIEW_W, GROUND); }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(VIEW_W, gy); ctx.stroke();

  // together: hearts in the gaps, and friends flying beside you
  if (tg) {
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const i of tg.hearts) {
      const p = course.list[i];
      if (!p || p.gone) continue;
      const x = p.x - s.x + PIPE_W / 2;
      if (x < -20 || x > VIEW_W + 20) continue;
      ctx.fillText("❤️", x, p.gapY + Math.sin(now / 240 + i) * 4);
    }
    for (const m of tg.mates) {
      const x = BIRD_X + (m.d - s.x);
      if (x < -30 || x > VIEW_W + 30) continue;
      ctx.save();
      ctx.globalAlpha = 0.42;
      drawBird(ctx, x, m.y, 0, 0, m.dn);
      ctx.restore();
      ctx.font = "600 11px Fredoka, Nunito, sans-serif";
      ctx.fillStyle = m.col;
      ctx.fillText(m.dn ? `💤 ${m.name}` : m.name, x, m.y - 24);
    }
  }
  // the run, big in the sky (the classic way)
  if (s.started && s.run > 0) {
    ctx.font = "700 46px Fredoka, Nunito, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.lineJoin = "round";
    ctx.strokeText(String(s.run), VIEW_W / 2, 24);
    ctx.fillStyle = streakMult(s.run) >= 3 ? "#FF8A3D" : streakMult(s.run) >= 2 ? "#FFD23F" : "#FFFFFF";
    ctx.fillText(String(s.run), VIEW_W / 2, 24);
    if (streakMult(s.run) > 1) {
      ctx.font = "700 15px Fredoka, Nunito, sans-serif";
      ctx.lineWidth = 4; ctx.strokeText(`×${streakMult(s.run)}`, VIEW_W / 2, 74);
      ctx.fillText(`×${streakMult(s.run)}`, VIEW_W / 2, 74);
    }
  }
  // the bird: nose up while rising, nose down while falling
  const tilt = Math.max(-0.45, Math.min(0.9, s.vy / 620));
  const since = now - s.flapAt;
  const wing = since < 180 ? -1.1 * (1 - since / 180) : 0;
  drawBird(ctx, BIRD_X, s.y, s.started ? tilt : 0, wing, s.stun > 0);
  // feathers and sparkles, and points floating up
  if (fx) {
    for (const p of fx.parts) {
      const life = Math.max(0, p.life / p.max);
      ctx.save();
      ctx.globalAlpha = life;
      ctx.translate(BIRD_X + (p.wx - s.x), p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      if (p.kind === "feather") { ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.6, 0, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(0, 0, p.r * (0.5 + 0.5 * life), 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    ctx.font = "700 18px Fredoka, Nunito, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 4; ctx.strokeStyle = INK;
    for (const t of fx.texts) {
      const life = Math.max(0, t.life / t.max);
      ctx.globalAlpha = Math.min(1, life * 2);
      const ty = t.y - (1 - life) * 34;
      ctx.strokeText(t.text, BIRD_X + (t.wx - s.x), ty);
      ctx.fillStyle = t.col;
      ctx.fillText(t.text, BIRD_X + (t.wx - s.x), ty);
    }
    ctx.globalAlpha = 1;
    if (fx.banner && now - fx.banner.at < 1300) {
      const f = (now - fx.banner.at) / 1300;
      ctx.save();
      ctx.globalAlpha = f > 0.75 ? (1 - f) / 0.25 : 1;
      ctx.font = "600 18px Fredoka, Nunito, sans-serif";
      const w = ctx.measureText(fx.banner.text).width + 30;
      ctx.lineWidth = 3; ctx.strokeStyle = INK;
      rrect(ctx, VIEW_W / 2 - w / 2, 128 - f * 10, w, 36, 18); paint(ctx, fx.banner.fill);
      ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(fx.banner.text, VIEW_W / 2, 147 - f * 10);
      ctx.restore();
    }
  }

  if (!s.started || s.stun > 0) {
    const down = tg && tg.down;
    const text = !s.started ? idle : down ? `💤 Down ${Math.ceil(s.stun)}s — wait for a ❤️` : `Ouch! ${CRASH_COST}`;
    ctx.font = "600 17px Fredoka, Nunito, sans-serif";
    const w = ctx.measureText(text).width + 28;
    ctx.lineWidth = 3;
    rrect(ctx, VIEW_W / 2 - w / 2, 78, w, 34, 17);
    paint(ctx, !s.started ? "#FFC53D" : down ? "#C9B8FF" : "#FF8A8A");
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, VIEW_W / 2, 96);
  }
}

function Stage({ w, h, canvasRef, view, onDown, label = "Flappy Dash: tap to flap", children }) {
  let cssW = Math.min(w, (h * VIEW_W) / VIEW_H);
  let cssH = (cssW * VIEW_H) / VIEW_W;
  if (cssH > h) { cssH = h; cssW = (h * VIEW_W) / VIEW_H; }
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  const pw = Math.max(1, Math.round(cssW * dpr));
  const ph = Math.max(1, Math.round(cssH * dpr));
  useEffect(() => { view.current = pw / VIEW_W; }, [view, pw]);
  return (
    <div className="fl-pad" style={{ width: w, height: h, position: "relative" }} onPointerDown={onDown}
      onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} width={pw} height={ph} className="fl-canvas"
        style={{ width: cssW, height: cssH }} role="img" aria-label={label} />
      {children}
    </div>
  );
}

export default function FlappyDash(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null, mode } = props;
  const coop = mode === "coop" && !!roomCode;
  const myId = Number(currentUser?.id);

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;

  // together: friends beside you, hearts to save each other
  const T = useMemo(() => team(players, myId), [players, myId]);
  const Tref = useRef(T);
  Tref.current = T;
  const heartAt = useMemo(() => hearts(seed, "flappy"), [seed]);
  const tg = useRef({ down: false, h: 0, got: new Set() });
  const [msg, setMsg] = useState(null);
  const msgTimer = useRef(null);
  useEffect(() => () => clearTimeout(msgTimer.current), []);
  const say = useCallback((text, type) => {
    setMsg({ text, type });
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 1400);
  }, []);
  const { tell, mates } = useRunTogether({ on: coop, roomCode, isSpectator, myId, onRevive: (id) => {
    const s = sim.current;
    if (!tg.current.down || s.stun <= 0) return;
    s.stun = 0;
    tg.current.down = false;
    say(`❤️ ${Tref.current.nameOf(id)} saved you!`, "success");
  } });

  const course = useMemo(() => makeCourse(seed), [seed]);
  const sim = useRef(null);
  if (sim.current === null) sim.current = newBird();
  const canvasRef = useRef(null);
  const view = useRef(1);
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);

  const [pipes, setPipes] = useState(0);
  const [best, setBest] = useState(0);

  const fxRef = useRef({ parts: [], texts: [], banner: null });
  const tap = () => {
    if (overRef.current || isSpectator) return;
    const s = sim.current;
    const was = s.stun;
    flap(s, performance.now());
    if (was > 0) return;
    // a chirp, and a feather or two
    sfx.tone(520, 0.08, 0.06, "triangle", 880);
    sfx.noise(0.06, 0.04, 2600, "bandpass", 0, 1200, 2);
    const F = fxRef.current;
    for (let i = 0; i < 2; i++) F.parts.push({ kind: "feather", wx: s.x - 6, y: s.y + 4, vx: -40 - Math.random() * 40, vy: 30 + Math.random() * 40, rot: Math.random() * 3, vr: 4, life: 0.7, max: 0.7, col: "#FFE79A", r: 3 });
  };

  // a beat under the flight, quicker on a long streak; the last ten seconds tick
  const playing = !isSpectator && !eng.gameOver;
  const tempoRef = useRef(92);
  useEffect(() => { if (!playing) return undefined; const b = sfx.beat(() => tempoRef.current, 0.4); return () => b.stop(); }, [playing]);
  const secs = Math.ceil(eng.timeLeft);
  useEffect(() => { if (playing && !eng.unlimited && secs > 0 && secs <= 10) sfx.tick(secs <= 3); }, [secs, playing, eng.unlimited]);
  const ended = useRef(false);
  useEffect(() => {
    if (!eng.gameOver || isSpectator || ended.current) return;
    ended.current = true;
    if (eng.won || eng.rank === 1) sfx.win(); else sfx.lose();
  }, [eng.gameOver, eng.won, eng.rank, isSpectator]);

  useEffect(() => {
    if (isSpectator) return undefined;
    const onKey = (e) => {
      if ([" ", "Spacebar", "ArrowUp", "w", "W"].includes(e.key)) { e.preventDefault(); if (!e.repeat) tap(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // rebinds each render so the handler always sees the current state

  useEffect(() => {
    if (isSpectator) return undefined;
    let raf;
    let last = performance.now();
    let lastPush = 0;
    let pushed = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));   // a hidden tab mustn't teleport the bird
      last = now;
      const s = sim.current;
      const F = fxRef.current;
      if (!overRef.current) {
        const before = s.pipes;
        const crashed = step(s, course, dt) === "crash";
        if (s.pipes !== before) setPipes(s.pipes);
        // setBest with the same value is no change: the loop must not restart
        // on it, or the score it has already handed over is handed over again
        setBest(s.best);
        if (coop && crashed) { s.stun = DOWN_S; tg.current.down = true; }
        if (crashed) {
          sfx.thud(); sfx.crack();
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;            // cosmetic only
            F.parts.push({ kind: "feather", wx: s.x, y: s.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, rot: a, vr: 6, life: 0.9, max: 0.9, col: i % 2 ? "#FFD23F" : "#FFF3C4", r: 3 });
          }
        }
        for (const e of s.events) {
          if (e.k === "pass") {
            sfx.tone(sfx.note(76 + Math.min(12, s.run % 13)), 0.1, 0.07, "square");
            if (e.golden) sfx.sparkle();
            F.texts.push({ text: `+${e.pts}`, wx: s.x + 6, y: s.y - 26, life: 0.8, max: 0.8, col: e.golden ? "#FFD23F" : e.mult > 1 ? "#FFB347" : "#FFFFFF" });
            if (e.up) { sfx.chime(e.mult + 2); F.banner = { text: `🔥 Streak ×${e.mult}!`, fill: "#FFB347", at: now }; }
            else if (e.golden) F.banner = { text: "★ Golden pipe ×2", fill: "#FFE27A", at: now };
          } else if (e.k === "star") {
            sfx.sparkle();
            F.texts.push({ text: "+5 ⭐", wx: e.x, y: e.y - 14, life: 0.8, max: 0.8, col: "#FFE27A" });
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; F.parts.push({ kind: "dot", wx: e.x, y: e.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, rot: 0, vr: 0, life: 0.45, max: 0.45, col: "#FFE27A", r: 4 }); }
          }
        }
        s.events.length = 0;
      }
      for (const p of F.parts) { p.life -= dt; p.wx += p.vx * dt; p.y += p.vy * dt; p.vy += (p.kind === "feather" ? 60 : 0) * dt; p.rot += p.vr * dt; }
      for (const t of F.texts) t.life -= dt;
      if (F.parts.length) F.parts = F.parts.filter((p) => p.life > 0);
      if (F.texts.length) F.texts = F.texts.filter((t) => t.life > 0);
      tempoRef.current = 88 + streakMult(s.run) * 10;
      const T0 = tg.current;
      if (coop) {
        if (T0.down && s.stun <= 0) T0.down = false;
        // a heart flown through (its pipe passed, not crashed past) is yours
        if (!T0.down) {
          for (const { k, at } of heartsBetween(heartAt, Math.max(0, s.first - 2), s.first + 3)) {
            const p = course.list[at];
            if (T0.got.has(k) || !p || !p.passed || p.gone) continue;
            T0.got.add(k);
            T0.h += 1;
            s.points += HEART_PTS.flappy;
            const anyDown = mates().some((m) => m.dn);
            say(anyDown ? "❤️ You saved your friends!" : `❤️ +${HEART_PTS.flappy}`, "success");
          }
        }
        tell({ d: s.x, v: s.stun > 0 || !s.started ? 0 : SPEED, y: s.y, l: 0, dn: T0.down, h: T0.h });
      }
      if (now - lastPush > 100) {
        lastPush = now;
        const target = Math.floor(s.points);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
      }
      const c = canvasRef.current;
      if (c) {
        const extra = coop ? {
          down: T0.down,
          hearts: heartsBetween(heartAt, s.first, s.first + 4).filter((x) => !T0.got.has(x.k)).map((x) => x.at),
          mates: mates().map((m) => ({ ...m, col: Tref.current.colourOf(m.id), name: Tref.current.nameOf(m.id) })),
        } : null;
        draw(c.getContext("2d"), s, course, view.current, now, extra, undefined, F);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, course, addScore, coop, heartAt, tell, mates, say]);

  // Being watched: a small picture of the flight, ~15 times a second. The
  // pipes come from the seed; only the ones a crash knocked off (`g`) and
  // where the bird is have to travel.
  const watchId = spectatorWatching?.user_id;
  const [specHud, setSpecHud] = useState(null);
  const hudKey = useRef("");
  const spec = useSpecStream({ roomCode, isSpectator, myId, watchId,
    frame: () => {
      const s = sim.current, list = course.list, g = [];
      for (let i = s.first; i < list.length && list[i].x - s.x <= VIEW_W + SPACING; i++) if (list[i].gone) g.push(i);
      const f = {
        x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, vy: Math.round(s.vy),
        st: s.started ? 1 : 0, sn: Math.round(s.stun * 100) / 100,
        fa: Math.min(9999, Math.round(performance.now() - s.flapAt)),
        fi: s.first, g, p: Math.floor(s.points), pi: s.pipes, r: s.run, b: s.best,
        // stars grabbed in the stretch ahead and just behind (by their x)
        sg: (course.stars || []).filter((st) => st.taken && st.x > s.x - 40 && st.x < s.x + VIEW_W + SPACING).map((st) => Math.round(st.x)),
      };
      if (coop) {
        f.dn = tg.current.down ? 1 : 0;
        f.hs = heartsBetween(heartAt, s.first, s.first + 4).filter((x) => !tg.current.got.has(x.k)).map((x) => x.at);
      }
      return f;
    },
    onFrame: (f) => {
      const key = `${f.p}|${f.pi}|${f.r}|${f.b}`;
      if (key === hudKey.current) return;
      hudKey.current = key;
      setSpecHud({ points: f.p, pipes: f.pi, run: f.r, best: f.b });
    },
  });
  useEffect(() => { hudKey.current = ""; setSpecHud(null); }, [watchId]);

  // Watching: the same scene, drawn from the latest frame carried on at the
  // bird's own physics (scroll at SPEED, y under gravity) for the time since
  // it came. A new frame that disagrees with where the bird was drawn is
  // eased into over ~80ms; a big jump (a crash's hop) is taken at once, as the
  // player saw it.
  useEffect(() => {
    if (!isSpectator) return undefined;
    let raf;
    let last = performance.now();
    let seenAt = -1;
    let shown = null;                 // where the bird was drawn last frame
    let ox = 0, oy = 0;               // correction still to ease out
    const s = newBird();
    const floor = VIEW_H - GROUND - BIRD_RY;
    const predict = (L, now) => {
      const f = L.f;
      const t = Math.min(0.3, Math.max(0, (now - L.at) / 1000));   // a stalled stream holds, it doesn't fly off
      const stun = Math.max(0, (f.sn || 0) - t);
      const mt = f.st ? Math.max(0, t - (f.sn || 0)) : 0;           // time spent flying, after any daze
      const vy = f.vy + GRAVITY * mt;
      const y = Math.min(floor, Math.max(BIRD_RY, f.y + f.vy * mt + 0.5 * GRAVITY * mt * mt));
      return { x: f.x + SPEED * mt, y, vy: mt > 0 ? vy : f.vy, stun };
    };
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const L = spec.current;
      if (L && L.f) {
        const f = L.f;
        const p = predict(L, now);
        if (L.at !== seenAt) {
          seenAt = L.at;
          // the pipes a crash knocked off, in the stretch ahead
          course.extend(f.x + VIEW_W + SPACING);
          const gone = new Set(f.g || []);
          for (let i = f.fi; i < course.list.length && course.list[i].x - f.x <= VIEW_W + SPACING; i++) {
            course.list[i].gone = gone.has(i);
          }
          const took = new Set(f.sg || []);
          for (const st of course.stars || []) if (st.x > f.x - 40 && st.x < f.x + VIEW_W + SPACING) st.taken = took.has(Math.round(st.x));
          s.run = f.r || 0;
          if (s.first < f.fi || s.first > f.fi + 2) s.first = f.fi;
          if (shown) { ox = shown.x - p.x; oy = shown.y - p.y; }
          if (!shown || Math.abs(ox) > 40 || Math.abs(oy) > 70) { ox = 0; oy = 0; }
          s.flapAt = L.at - (f.fa ?? 9999);
        }
        const ease = Math.exp(-dt / 0.08);
        ox *= ease; oy *= ease;
        s.x = p.x + ox;
        s.y = p.y + oy;
        s.vy = p.vy;
        s.stun = p.stun;
        s.started = !!f.st;
        shown = { x: s.x, y: s.y };
        course.extend(s.x + VIEW_W + SPACING);
        const list = course.list;
        while (s.first < list.length && list[s.first].x - s.x + PIPE_W < -40) s.first++;
      }
      const c = canvasRef.current;
      if (c) {
        const extra = coop && L && L.f ? {
          down: !!L.f.dn,
          hearts: L.f.hs || [],
          mates: mates().filter((m) => m.id !== Number(watchId))
            .map((m) => ({ ...m, col: Tref.current.colourOf(m.id), name: Tref.current.nameOf(m.id) })),
        } : null;
        const who = spectatorWatching?.username || "them";
        draw(c.getContext("2d"), s, course, view.current, now, extra, `Waiting for ${who} to flap…`);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, spec, course, coop, mates, watchId, spectatorWatching?.username]);

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  // together: the side's points, against the team goal
  const seats = (players || []).filter((p) => !p.is_spectator);
  const goal = teamGoal("flappy", durationSeconds || Math.max(60, eng.elapsed), seats.length);   // no time limit: paced on the time played
  const teamTotal = eng.score + oppList.reduce((t, o) => t + (Number(o.score) || 0), 0);
  const scores = { [myId]: eng.score };
  for (const o of oppList) scores[o.user_id] = Number(o.score) || 0;
  const stats = coop
    ? [{ label: "Team", value: teamTotal.toLocaleString() },
       { label: "Goal", value: teamTotal >= goal ? "✓" : goal.toLocaleString() }]
    : isSpectator
    ? [
        { label: "Score", value: Number(specHud ? specHud.points : specScore).toLocaleString() },
        { label: "Pipes", value: specHud ? specHud.pipes : 0 },
        { label: "Best run", value: specHud ? Math.max(specHud.best, specHud.run) : 0 },
      ]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Pipes", value: pipes },
        { label: "Best run", value: Math.max(best, sim.current.run) },
      ];

  return (
    <>
      <GameFrame
        gameName="Flappy Dash" badge="🐤 FLAPPY DASH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={coop ? [] : oppList}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
        sound
        controls={!isSpectator ? (
          <button className="press p-sun fl-btn" onPointerDown={(e) => { e.preventDefault(); tap(); }}
            onContextMenu={(e) => e.preventDefault()}>
            🐤 Flap <span className="dino-key">Space</span>
          </button>
        ) : null}
      >
        {({ w, h }) => (isSpectator ? (
          <Stage w={w} h={h} canvasRef={canvasRef} view={view}
            label={`Watching ${spectatorWatching?.username || "a player"} fly`}>
            {!specHud && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div className="chip">Connecting to {spectatorWatching?.username || "the player"}'s flight…</div>
              </div>
            )}
          </Stage>
        ) : (
          <Stage w={w} h={h} canvasRef={canvasRef} view={view} onDown={tap} />
        ))}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={coop ? `Team: ${teamTotal.toLocaleString()} pts` : `Pipes cleared: ${pipes} · ⭐ ${sim.current.stars} · Best run: ${Math.max(best, sim.current.run)}`}
          together={coop ? { reached: teamTotal >= goal, goal: `${goal.toLocaleString()} points`, unit: "pts", mates: T.all(scores) } : null} />
      )}
    </>
  );
}
