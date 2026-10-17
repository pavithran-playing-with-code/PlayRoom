// src/components/games/DodgeStorm.jsx
// An open arena and shards flying in from every edge. Move anywhere; surviving
// is the score, and skimming a shard without touching it pays a little extra.
//
// Drag anywhere, or hold the arrow keys. Being hit doesn't end the match — the
// room's clock does. A hit costs a few points and drops you into a fresh
// storm; everything you survived for before it stays on the board. Your score
// never goes back to zero.
//
// Pickups float in — a star, a shield, slow time — and from 30 s some shards
// hunt you for a while. The longer you live the more each second is worth
// (x2, x3), and quick grazes chain into close calls. Spiky shards that spin,
// a glowing core, the arena tinted by your multiplier, and sound.
//
// The rules live in stormSim.js. This file draws the arena and takes the input.
//
// A spectator draws the same arena from the player's frames (useSpecStream):
// the shards are sent as they are, not re-simulated — the storm is stepped by
// each phone's own frame times, so a copy would drift — and moved on by their
// velocity between frames.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpecStream from "./useSpecStream";
import {
  VIEW_W, VIEW_H, PLAYER_R, EASE, TRAIL, PICKUP_R, PICKUP_LIFE, newStorm, moveTo, nudge, step, totalScore, aliveMult,
} from "./stormSim";
import sfx from "./sfx";

const INK = "#2E2140";
const ARENA = "#241E3A";
const PLAYER = "#4CC9F0";
const SHARD = "#FF8FC7";
const RESTART_MS = 800;
const KEY_STEP = 7;
const HIT_COST = 10;               // a hit costs this; what you earned is kept
const SPEC_SHARDS = 40;            // most shards a spectator frame carries
const SPEC_AHEAD = 18;             // frames a watcher carries on past the last frame, at most
const SPEC_SMOOTH = 0.5;           // how much of a correction a watcher takes a frame
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

const grazeBurst = (bits, x, y) => {
  for (let i = 0; i < 6; i++) {
    bits.push({ x, y, vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3, r: 2, life: 16, max: 16, colour: "#B5E655" });
  }
};
const hitBurst = (bits, x, y) => {
  for (let i = 0; i < 48; i++) {
    bits.push({ x, y, vx: (Math.random() - 0.5) * 9,
      vy: (Math.random() - 0.5) * 9, r: 2 + Math.random() * 3, life: 38, max: 38,
      colour: ["#FF6B6B", "#FF8FC7", "#FFFFFF"][Math.floor(Math.random() * 3)] });
  }
};

// a star shape (for shards, and the star pickup)
function starPath(ctx, x, y, r, inner, points, rot) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points, rr = i % 2 ? r * inner : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}
const MULT_TINT = ["rgba(76,201,240,0)", "rgba(76,201,240,.12)", "rgba(255,111,181,.16)"];

function drawItem(ctx, it, t) {
  const fade = Math.min(1, it.life / 90), pulse = 1 + Math.sin(t / 140 + it.x) * 0.1, r = PICKUP_R * pulse;
  ctx.globalAlpha = fade;
  ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.beginPath(); ctx.arc(it.x, it.y, r + 7, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
  if (it.kind === "star") { starPath(ctx, it.x, it.y, r, 0.48, 5, -Math.PI / 2 + t / 900); ctx.fillStyle = "#FFD23F"; ctx.fill(); ctx.stroke(); }
  else if (it.kind === "shield") {
    ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, Math.PI * 2); ctx.fillStyle = "#4CC9F0"; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(it.x, it.y, r * 0.55, 0, Math.PI * 2); ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, Math.PI * 2); ctx.fillStyle = "#B5E655"; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(it.x, it.y - r * 0.6); ctx.moveTo(it.x, it.y); ctx.lineTo(it.x + r * 0.45, it.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function draw(ctx, s, k, particles, shake, hud = null) {
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  const t = performance.now();
  const mult = aliveMult(s.frame || 0);

  ctx.fillStyle = ARENA;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // the arena takes on your multiplier's colour, and slow time turns it icy
  ctx.fillStyle = MULT_TINT[mult - 1]; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (s.slow > 0) { ctx.fillStyle = "rgba(160,220,255,.12)"; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }

  // a faint grid, so movement has something to read against — it breathes with the beat
  ctx.strokeStyle = `rgba(255,255,255,${0.05 + 0.03 * Math.max(0, Math.sin(t / 260))})`;
  ctx.lineWidth = 1;
  for (let x = 40; x < VIEW_W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, VIEW_H); ctx.stroke(); }
  for (let y = 40; y < VIEW_H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VIEW_W, y); ctx.stroke(); }
  for (const it of s.items || []) drawItem(ctx, it, t);

  // the trail, oldest faintest
  s.trail.forEach((t, i) => {
    const a = (i + 1) / s.trail.length;
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = PLAYER;
    ctx.beginPath(); ctx.arc(t.x, t.y, PLAYER_R * (0.4 + a * 0.6), 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;

  for (const p of s.shards) {
    // a spiky shard, spinning; a hunter is purple, with a glow
    const hunter = p.seek > 0;
    if (hunter) { ctx.fillStyle = "rgba(166,120,255,.25)"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2); ctx.fill(); }
    starPath(ctx, p.x, p.y, p.r * 1.25, 0.55, 6, (p.spin || 0) + t / 300);
    ctx.fillStyle = hunter ? "#A678FF" : SHARD; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.colour;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (!s.hit) {
    // a glowing core; a shield is a ring round it
    const g = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, PLAYER_R * 2.6);
    g.addColorStop(0, "rgba(76,201,240,.55)"); g.addColorStop(1, "rgba(76,201,240,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, PLAYER_R * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s.x, s.y, PLAYER_R, 0, Math.PI * 2);
    ctx.fillStyle = PLAYER; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(s.x - 3, s.y - 3, 3, 0, Math.PI * 2); ctx.fill();
    if (s.shield) {
      ctx.strokeStyle = `rgba(160,235,255,${0.6 + 0.3 * Math.sin(t / 120)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, PLAYER_R + 8, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // the multiplier and slow time, in the corner; texts floating up
  ctx.font = "700 16px Fredoka, Nunito, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
  if (mult > 1) { ctx.fillStyle = mult >= 3 ? "#FF8FC7" : "#4CC9F0"; ctx.fillText(`×${mult} alive bonus`, 10, 10); }
  if (s.slow > 0) { ctx.fillStyle = "#B5E655"; ctx.fillText("⏱️", 10, 28); ctx.fillRect(32, 35, (s.slow / 240) * 80, 5); }
  if (hud) {
    ctx.textAlign = "center";
    for (const tx of hud.texts) {
      const life = tx.life / tx.max;
      ctx.globalAlpha = Math.min(1, life * 2);
      ctx.font = `700 ${tx.size || 16}px Fredoka, Nunito, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(tx.text, tx.x, tx.y - (1 - life) * 26);
      ctx.fillStyle = tx.col; ctx.fillText(tx.text, tx.x, tx.y - (1 - life) * 26);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function Stage({ w, h, canvasRef, view, onPoint }) {
  let cssW = Math.min(w, (h * VIEW_W) / VIEW_H);
  let cssH = (cssW * VIEW_H) / VIEW_W;
  if (cssH > h) { cssH = h; cssW = (h * VIEW_W) / VIEW_H; }
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  const pw = Math.max(1, Math.round(cssW * dpr));
  const ph = Math.max(1, Math.round(cssH * dpr));
  useEffect(() => { view.current = pw / VIEW_W; }, [view, pw]);
  const handle = (e) => {
    if (e.buttons === 0 && e.type === "pointermove") return;   // only while held
    const box = e.currentTarget.getBoundingClientRect();
    onPoint(((e.clientX - box.left) / box.width) * VIEW_W,
            ((e.clientY - box.top) / box.height) * VIEW_H);
  };
  return (
    <div className="ds-pad" style={{ width: w, height: h }}
      onPointerDown={handle} onPointerMove={handle}
      onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} width={pw} height={ph} className="ds-canvas"
        style={{ width: cssW, height: cssH }} role="img" aria-label="Dodge Storm: keep away from the shards" />
    </div>
  );
}

export default function DodgeStorm(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;

  const runRef = useRef(0);
  const sim = useRef(null);
  if (sim.current === null) sim.current = newStorm(seed);
  const canvasRef = useRef(null);
  const view = useRef(1);
  const bits = useRef([]);
  const shake = useRef(0);
  const keys = useRef({});
  // Every finished run's score, kept aside, so a hit never takes away what was won.
  const banked = useRef(0);
  const hudRef = useRef({ texts: [], chain: 0, chainAt: 0 });
  const tempoRef = useRef(92);
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);

  const [survived, setSurvived] = useState(0);   // this run
  const [longest, setLongest] = useState(0);     // the best of them
  const [hits, setHits] = useState(0);
  const [msg, setMsg] = useState(null);
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
  const timers = useRef([]);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  // ── Being watched. Counters the frame carries, so the watcher can tell a
  // new graze or hit from one it has already drawn.
  const grazed = useRef(0);
  const hitCount = useRef(0);
  const shardIds = useRef(new WeakMap());
  const nextShard = useRef(1);
  const sendFrame = () => {
    const s = sim.current;
    const sh = [];
    for (const p of s.shards) {
      if (sh.length >= SPEC_SHARDS) break;
      let id = shardIds.current.get(p);
      if (id == null) { id = nextShard.current++; shardIds.current.set(p, id); }
      sh.push([id, r1(p.x), r1(p.y), r2(p.vx), r2(p.vy), r1(p.r), p.seek > 0 ? 1 : 0]);
    }
    return {
      x: r1(s.x), y: r1(s.y), tx: r1(s.tx), ty: r1(s.ty), h: s.hit ? 1 : 0,
      n: runRef.current, g: grazed.current, hi: hitCount.current,
      sc: banked.current + totalScore(s), al: Math.floor(s.frame / 60), sh,
      it: (s.items || []).map((i) => [i.kind[0], r1(i.x), r1(i.y), Math.round(i.life)]), sd: s.shield ? 1 : 0, sw: Math.round(s.slow || 0), fr: Math.round(s.frame),
    };
  };

  // The watcher's side: the newest frame, and what is on its screen now.
  const shown = useRef(null);       // { x, y, trail, shards: Map(id → {x, y, r}) }
  const [watched, setWatched] = useState(null);   // { sc, al, hi } for the HUD
  const onFrame = (f) => {
    const was = spec.current && spec.current.prev;
    if (was) {
      if (f.g > was.g && !f.h) grazeBurst(bits.current, f.x, f.y);
      if (f.h && !was.h) {
        hitBurst(bits.current, f.x, f.y);
        shake.current = 18;
        setMsg({ text: "Hit!", type: "error" });
      }
      if (f.n !== was.n) {
        shown.current = null;       // a fresh storm: start the picture over
        setMsg({ text: "Again!", type: "info" });
        timers.current.push(setTimeout(() => setMsg(null), 600));
      }
    }
    setWatched((v) => (v && v.sc === f.sc && v.al === f.al && v.hi === f.hi ? v : { sc: f.sc, al: f.al, hi: f.hi }));
  };
  const spec = useSpecStream({ roomCode, isSpectator, myId: currentUser?.id,
    watchId: spectatorWatching?.user_id, frame: sendFrame, onFrame });

  // A different player watched: nothing on screen until their first frame.
  const watchId = spectatorWatching?.user_id;
  useEffect(() => {
    shown.current = null;
    bits.current = [];
    setWatched(null);
    setMsg(null);
  }, [watchId]);

  useEffect(() => {
    if (!isSpectator) return undefined;
    let raf;
    const frame = (now) => {
      const L = spec.current;
      if (L && L.f) {
        const f = L.f;
        const e = Math.min(SPEC_AHEAD, Math.max(0, (now - L.at) / (1000 / 60)));
        // where the player is by now: still closing on their target, as the sim does
        const close = Math.pow(1 - EASE, e);
        const px = f.tx + (f.x - f.tx) * close;
        const py = f.ty + (f.y - f.ty) * close;
        let v = shown.current;
        if (!v) v = shown.current = { x: px, y: py, trail: [], shards: new Map() };
        v.x += (px - v.x) * SPEC_SMOOTH;
        v.y += (py - v.y) * SPEC_SMOOTH;
        if (!f.h) {
          v.trail.push({ x: v.x, y: v.y });
          while (v.trail.length > TRAIL) v.trail.shift();
        }
        // shards fly straight, so carrying them on by their velocity is exact
        // until the next frame; a known one eases there, a new one appears
        const next = new Map();
        for (const [id, x, y, vx, vy, r, sk] of f.sh || []) {
          const tx = x + vx * e, ty = y + vy * e;
          const old = v.shards.get(id);
          next.set(id, old
            ? { x: old.x + (tx - old.x) * SPEC_SMOOTH, y: old.y + (ty - old.y) * SPEC_SMOOTH, r, seek: sk, spin: id }
            : { x: tx, y: ty, r, seek: sk, spin: id });
        }
        v.shards = next;
        for (const p of bits.current) { p.x += p.vx; p.y += p.vy; p.life -= 1; }
        bits.current = bits.current.filter((p) => p.life > 0);
        shake.current *= 0.85;
        const c = canvasRef.current;
        if (c) {
          const KIND = { s: "star", h: "shield" };
          draw(c.getContext("2d"), { x: v.x, y: v.y, hit: !!f.h, trail: v.trail, shards: [...v.shards.values()],
            items: (f.it || []).map(([k, x, y, life]) => ({ kind: KIND[k] || "slow", x, y, life: Math.min(PICKUP_LIFE, life) })),
            shield: !!f.sd, slow: f.sw || 0, frame: f.fr || 0 },
            view.current, bits.current, shake.current);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, spec]);

  const onPoint = (x, y) => { if (!overRef.current && !isSpectator) moveTo(sim.current, x, y); };

  useEffect(() => {
    if (isSpectator) return undefined;
    const down = (e) => { keys.current[e.key.toLowerCase()] = true; };
    const up = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [isSpectator]);

  useEffect(() => {
    if (isSpectator) return undefined;
    let raf;
    let last = performance.now();
    let pushed = 0;
    const frame = (now) => {
      const dt = Math.min(3, Math.max(0, (now - last) / (1000 / 60)));
      last = now;
      const s = sim.current;
      const k = keys.current;

      if (!overRef.current && !s.hit) {
        let dx = 0, dy = 0;
        if (k.arrowleft || k.a) dx -= KEY_STEP;
        if (k.arrowright || k.d) dx += KEY_STEP;
        if (k.arrowup || k.w) dy -= KEY_STEP;
        if (k.arrowdown || k.s) dy += KEY_STEP;
        if (dx || dy) nudge(s, dx * dt, dy * dt);

        const multWas = aliveMult(s.frame);
        const out = step(s, dt);
        const H = hudRef.current, t0 = performance.now();
        const say = (text, col, size) => H.texts.push({ text, col, size, x: Math.max(50, Math.min(VIEW_W - 50, s.x)), y: Math.max(40, s.y - 24), life: 50, max: 50 });
        if (out.grazes) {
          grazed.current += out.grazes;
          grazeBurst(bits.current, s.x, s.y);
          H.chain = t0 - H.chainAt < 1200 ? H.chain + out.grazes : out.grazes;
          H.chainAt = t0;
          sfx.noise(0.08, 0.06, 2400 + Math.min(6, H.chain) * 300, "bandpass", 0, 5200, 4);
          if (H.chain >= 2) say(`Close call ×${H.chain}!`, "#B5E655");
        }
        for (const p of out.picked || []) {
          if (p === "star") { sfx.sparkle(); say("+15 ⭐", "#FFD23F", 18); }
          else if (p === "shield") { sfx.chime(3); say("🛡️ Shield!", "#4CC9F0", 18); }
          else { sfx.tone(300, 0.4, 0.07, "sine", 120); say("⏱️ Slow time!", "#B5E655", 18); }
          for (let i = 0; i < 10; i++) bits.current.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, r: 2.5, life: 24, max: 24, colour: p === "star" ? "#FFD23F" : p === "shield" ? "#4CC9F0" : "#B5E655" });
        }
        if (out.shieldPop) { sfx.crack(); shake.current = 8; say("🛡️ Saved!", "#4CC9F0", 18); }
        if (aliveMult(s.frame) > multWas) { sfx.chime(aliveMult(s.frame) + 2); say(`×${aliveMult(s.frame)} — keep going!`, aliveMult(s.frame) >= 3 ? "#FF8FC7" : "#4CC9F0", 20); }
        tempoRef.current = 92 + aliveMult(s.frame) * 12;
        if (out.hit) {
          hitBurst(bits.current, s.x, s.y);
          shake.current = 18;
          sfx.boom();
          hitCount.current += 1;
          setHits((n) => n + 1);
          setMsg({ text: "Hit!", type: "error" });
          const run = ++runRef.current;
          timers.current.push(setTimeout(() => {
            if (overRef.current || runRef.current !== run) return;
            // Banked here rather than at the hit.
            banked.current = Math.max(0, banked.current + totalScore(sim.current) - HIT_COST);
            sim.current = newStorm((Number(seed) || 1) + run * 613);
            setMsg({ text: "Again!", type: "info" });
            timers.current.push(setTimeout(() => setMsg(null), 600));
          }, RESTART_MS));
        }
        const target = banked.current + totalScore(s);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
        const alive = Math.floor(s.frame / 60);
        setSurvived((v) => (alive !== v ? alive : v));
        setLongest((v) => (alive > v ? alive : v));
      }

      for (const p of bits.current) { p.x += p.vx; p.y += p.vy; p.life -= 1; }
      bits.current = bits.current.filter((p) => p.life > 0);
      shake.current *= 0.85;
      const H = hudRef.current;
      for (const tx of H.texts) tx.life -= dt;
      if (H.texts.length) H.texts = H.texts.filter((tx) => tx.life > 0);

      const c = canvasRef.current;
      if (c) draw(c.getContext("2d"), sim.current, view.current, bits.current, shake.current, H);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, addScore, seed]);

  const oppList = Object.values(eng.opponents);
  const shownScore = isSpectator ? (watched ? watched.sc : (spectatorWatching?.score ?? 0)) : eng.score;
  const shownAlive = isSpectator ? (watched ? watched.al : 0) : survived;
  const shownHits = isSpectator ? (watched ? watched.hi : 0) : hits;
  const stats = [
    { label: "Score", value: Number(shownScore).toLocaleString() },
    { label: "Alive", value: `${shownAlive}s` },
    ...(shownHits ? [{ label: "Hits", value: shownHits }] : []),
  ];

  return (
    <>
      <GameFrame
        gameName="Dodge Storm" badge="⚡ DODGE STORM"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
        sound
      >
        {({ w, h }) => {
          if (isSpectator) {
            return (
              <div style={{ position: "relative", width: w, height: h }}>
                <Stage w={w} h={h} canvasRef={canvasRef} view={view} onPoint={onPoint} />
                {!watched && (
                  <div className="muted" style={{ position: "absolute", inset: 0, display: "grid",
                    placeItems: "center", textAlign: "center", padding: 16, pointerEvents: "none" }}>
                    Connecting to {spectatorWatching?.username ? `${spectatorWatching.username}'s` : "the"} storm…
                  </div>
                )}
              </div>
            );
          }
          return <Stage w={w} h={h} canvasRef={canvasRef} view={view} onPoint={onPoint} />;
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`Longest run: ${longest}s${hits ? ` · Hits: ${hits}` : ""}`} />
      )}
    </>
  );
}
