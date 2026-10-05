// src/components/games/PianoTiles.jsx
// Piano Tiles: four columns, one black tile in every row, rolling down. Tap
// the lowest black tile, then the next; hold a long tile until it has gone
// by. Every tile plays the next note of the song. Or the D F J K keys.
//
// Everyone in a room gets the same song and the same tiles (from the seed);
// the room's clock decides it. A miss or a tap on white costs the combo and a
// moment, never points. The rules are pianoSim.js; this file draws it, plays
// the notes and reads the fingers.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { newSong, step, tap, release, visible, score, COLS, VISIBLE } from "./pianoSim.js";
import { songFor, LEVELS } from "./pianoSongs.js";

const KEYS = { d: 0, f: 1, j: 2, k: 3 };
const SOUND_KEY = "piano.sound";

// The songs and their levels live in pianoSongs.js; the room's seed picks one
// (the one chosen in the lobby). Every tile carries its own note.

// Backgrounds that change every 50 tiles: [top, bottom].
const BGS = [["#FFF6E6", "#FFE6C4"], ["#E8FFF8", "#C4F1E6"], ["#F4EBFF", "#DCC8FA"],
  ["#E6F6FF", "#C2E6FA"], ["#FFEFE6", "#FFD3BA"], ["#FFEAF4", "#FFCCE3"]];
const NOTE_COLS = ["#9B5DE5", "#4CC9F0", "#FF8FC7", "#3DD6C0", "#FFA36C"];

// ── sound: a small piano made of oscillators ─────────────────────────────────
function makePiano() {
  let ctx = null, out = null;
  const ready = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = 0.45;
      const comp = ctx.createDynamicsCompressor();
      out.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const note = (midi, ring = 0.5) => {
    const c = ready();
    if (!c) return null;
    const f = 440 * 2 ** ((midi - 69) / 12), t = c.currentTime;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.55, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.18, t + 0.12);
    env.gain.exponentialRampToValueAtTime(0.0001, t + ring + 0.9);
    env.connect(out);
    const oscs = [[1, "triangle", 1], [2, "sine", 0.32], [3, "sine", 0.1], [0.5, "sine", 0.22]].map(([mul, type, amp]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.value = f * mul;
      g.gain.value = amp;
      o.connect(g);
      g.connect(env);
      o.start(t);
      o.stop(t + ring + 1);
      return o;
    });
    return {
      stop() {
        const n = c.currentTime;
        env.gain.cancelScheduledValues(n);
        env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), n);
        env.gain.exponentialRampToValueAtTime(0.0001, n + 0.18);
        oscs.forEach((o) => { try { o.stop(n + 0.2); } catch { /* already stopped */ } });
      },
    };
  };
  const buzz = () => {
    const c = ready();
    if (!c) return;
    const t = c.currentTime, env = c.createGain();
    env.gain.setValueAtTime(0.25, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    env.connect(out);
    [98, 104].forEach((f) => {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(env);
      o.start(t);
      o.stop(t + 0.4);
    });
  };
  return { note, buzz, close: () => { try { ctx && ctx.close(); } catch { /* gone */ } } };
}

// ── drawing ──────────────────────────────────────────────────────────────────
function rounded(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function mix(a, b, k) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(",")})`;
}

function drawScene(ctx, s, W, H, fx, now, tune) {
  const rowH = H / VISIBLE, colW = W / COLS, pad = 3;

  // background, easing from one level's colours to the next
  const lv = Math.floor(fx.bg), k = fx.bg - lv;
  const a = BGS[lv % BGS.length], b = BGS[(lv + 1) % BGS.length];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mix(a[0], b[0], k));
  g.addColorStop(1, mix(a[1], b[1], k));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // the rows roll by: faint lines so the board feels like it moves
  ctx.strokeStyle = "rgba(46,33,64,.07)";
  ctx.lineWidth = 1;
  for (let r = Math.floor(s.pos); r <= s.pos + VISIBLE + 1; r++) {
    const y = Math.round(H - (r + 0.5 - s.pos) * rowH) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(46,33,64,.16)";
  for (let c = 1; c < COLS; c++) {
    const x = Math.round(c * colW) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // a column lights up under a finger
  for (const p of fx.press) {
    const al = Math.max(0, 1 - p.t / 0.3) * 0.18;
    ctx.fillStyle = `rgba(155,93,229,${al})`;
    ctx.fillRect(p.col * colW, 0, colW, H);
  }

  for (const t of visible(s)) {
    const x = t.col * colW + pad, w = colW - pad * 2;
    const y = H - (t.y + t.len - s.pos) * rowH + pad, h = t.len * rowH - pad * 2;
    const since = s.t - t.at;
    if (t.missed) {
      const blink = since < 0.8 ? 0.55 + 0.45 * Math.abs(Math.sin(since * 14)) : 0.5;
      ctx.fillStyle = `rgba(255,107,107,${blink})`;
      rounded(ctx, x, y, w, h, 12);
      ctx.fill();
      continue;
    }
    const holding = t.i === s.hold;
    if (t.done && !holding) {
      // played: the dark sinks away into a pale tile
      const q = Math.min(1, since / 0.22);
      ctx.fillStyle = "rgba(46,33,64,.10)";
      rounded(ctx, x, y, w, h, 12);
      ctx.fill();
      if (t.len > 1 && t.held > 0) {
        ctx.fillStyle = `rgba(155,93,229,${0.35 * (1 - q * 0.5)})`;
        rounded(ctx, x, y + h * (1 - t.held), w, h * t.held, 12);
        ctx.fill();
      }
      if (q < 1) {
        const sw = w * (1 - q), sh = h * (1 - q);
        ctx.fillStyle = `rgba(46,33,64,${0.9 * (1 - q)})`;
        rounded(ctx, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh, 12 * (1 - q));
        ctx.fill();
      }
      continue;
    }
    // a black key, lit from the top
    const kg = ctx.createLinearGradient(0, y, 0, y + h);
    kg.addColorStop(0, "#4A3868");
    kg.addColorStop(Math.min(0.5, 30 / h), "#2E2140");
    kg.addColorStop(1, "#160F22");
    ctx.fillStyle = kg;
    rounded(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.13)";
    rounded(ctx, x + 5, y + 4, w - 10, Math.min(10, h * 0.1), 5);
    ctx.fill();

    if (t.len > 1) {
      const cx = x + w / 2;
      // the track to hold along, and how far you've got
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx, y + h - rowH * 0.45); ctx.lineTo(cx, y + 18); ctx.stroke();
      if (holding) {
        const fh = h * t.held;
        const fg = ctx.createLinearGradient(0, y + h, 0, y + h - fh);
        fg.addColorStop(0, "#9B5DE5");
        fg.addColorStop(1, "#4CC9F0");
        ctx.fillStyle = fg;
        rounded(ctx, x, y + h - fh, w, fh, 12);
        ctx.fill();
        ctx.save();
        ctx.shadowColor = "#4CC9F0";
        ctx.shadowBlur = 22;
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath(); ctx.arc(cx, y + h - fh, 9 + Math.sin(now * 18) * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.strokeStyle = "rgba(255,255,255,.7)";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, y + h - rowH * 0.45, 11, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = "700 16px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("♫", cx, y + 16);
    }
    if (t.i === 0 && !s.started) {
      const cx = x + w / 2, cy = y + h / 2;
      const pulse = 1 + Math.sin(now * 5) * 0.06;
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${Math.round(Math.min(22, w * 0.24) * pulse)}px Fredoka, sans-serif`;
      ctx.fillText("START", cx, cy);
      ctx.textBaseline = "alphabetic";
    }
  }

  // a tap on white
  for (const wr of fx.wrong) {
    const al = Math.max(0, 1 - wr.t / 0.6);
    const yc = H - (wr.yRow - s.pos) * rowH;
    ctx.fillStyle = `rgba(255,107,107,${0.85 * al})`;
    rounded(ctx, wr.col * colW + pad, yc - rowH / 2 + pad, colW - pad * 2, rowH - pad * 2, 12);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${al})`;
    ctx.lineWidth = 4;
    const cx = wr.col * colW + colW / 2, d = Math.min(colW, rowH) * 0.16;
    ctx.beginPath(); ctx.moveTo(cx - d, yc - d); ctx.lineTo(cx + d, yc + d); ctx.moveTo(cx + d, yc - d); ctx.lineTo(cx - d, yc + d); ctx.stroke();
  }

  // ripples where a tile was played
  for (const r of fx.ripples) {
    const q = r.t / 0.45;
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - q)})`;
    ctx.lineWidth = 4 * (1 - q) + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, 8 + q * colW * 0.75, 0, Math.PI * 2); ctx.stroke();
  }

  // notes floating up
  ctx.textAlign = "center";
  for (const n of fx.notes) {
    const q = n.t / n.life;
    ctx.globalAlpha = 1 - q;
    ctx.fillStyle = n.c;
    ctx.font = `800 ${Math.round(n.size)}px Fredoka, sans-serif`;
    ctx.fillText(n.ch, n.x + Math.sin(n.t * 6 + n.ph) * 8, n.y - n.t * 110);
  }
  ctx.globalAlpha = 1;

  // the combo, big and soft over the top of the board
  if (s.combo >= 5) {
    const size = Math.round(Math.min(56, W * 0.15) * (1 + fx.pulse * 0.25));
    ctx.font = `800 ${size}px Fredoka, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#2E2140";
    ctx.fillStyle = "#FFC53D";
    ctx.globalAlpha = 0.92;
    ctx.strokeText(String(s.combo), W / 2, H * 0.15);
    ctx.fillText(String(s.combo), W / 2, H * 0.15);
    ctx.font = "800 13px Fredoka, sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeText("COMBO", W / 2, H * 0.15 + 18);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("COMBO", W / 2, H * 0.15 + 18);
    ctx.globalAlpha = 1;
  }

  // before the start: which song it is
  if (!s.started) {
    // on a card, so it reads over the black tiles too
    const cw = Math.min(W - 16, 340), cx0 = (W - cw) / 2, cy0 = H * 0.2 - 28;
    ctx.fillStyle = "rgba(255,250,240,.94)"; ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx0, cy0, cw, 82, 14) : ctx.rect(cx0, cy0, cw, 82); ctx.fill(); ctx.stroke();
    ctx.font = "800 18px Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#2E2140";
    ctx.fillText(`♪ ${tune.name} ♪`, W / 2, H * 0.2);
    ctx.font = "600 13px Nunito, sans-serif";
    ctx.fillStyle = "rgba(46,33,64,.65)";
    ctx.fillText("Tap the black tiles, lowest first", W / 2, H * 0.2 + 22);
    const lv = LEVELS[tune.level] || LEVELS.medium;
    ctx.font = "800 13px Nunito, sans-serif";
    ctx.fillStyle = tune.level === "hard" ? "#d62f3d" : tune.level === "easy" ? "#22783f" : "#2a7fb8";
    ctx.fillText(`${lv.label}${lv.double ? " · two at once? tap both" : ""}${lv.long > 0.1 ? " · hold the long ones" : ""}`, W / 2, H * 0.2 + 42);
  }

  // stood still after a mistake: the edges go red
  if (s.stunT > 0) {
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(255,107,107,0)");
    v.addColorStop(1, `rgba(255,107,107,${Math.min(0.45, s.stunT)})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function PianoTiles(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;
  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;
  const sim = useRef(null);
  if (sim.current === null) sim.current = newSong(seed);
  const tune = songFor(seed);
  const canvasRef = useRef(null);
  const size = useRef({ w: 300, h: 400 });
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);
  const [hud, setHud] = useState({ hits: 0, best: 0, misses: 0 });
  const [msg, setMsg] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type) => {
    setMsg({ text, type });
    timers.current.push(setTimeout(() => setMsg(null), 800));
  };

  const [sound, setSound] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; }
  });
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
    try { localStorage.setItem(SOUND_KEY, sound ? "on" : "off"); } catch { /* private window */ }
  }, [sound]);
  const piano = useRef(null);
  useEffect(() => () => { if (piano.current) piano.current.close(); }, []);
  const ringing = useRef(null);          // the note of the long tile being held
  const holder = useRef(null);           // the pointer (or key) holding it

  const fx = useRef({ ripples: [], notes: [], wrong: [], press: [], pulse: 0, bg: 0 });

  const stopRing = () => { if (ringing.current) { ringing.current.stop(); ringing.current = null; } };

  // One tap, from a finger or a key. `yUp` is how many rows up the screen.
  const press = (col, yUp, who) => {
    if (overRef.current || isSpectator) return;
    const s = sim.current;
    const yRow = yUp === null ? s.tiles[s.next].y + 0.5 : s.pos + yUp;
    const res = tap(s, col, yRow);
    const f = fx.current;
    const { w: W, h: H } = size.current, rowH = H / VISIBLE, colW = W / COLS;
    f.press.push({ col, t: 0 });
    if (res.kind === "hit") {
      if (!piano.current && soundRef.current) piano.current = makePiano();
      stopRing();
      const t = res.tile;
      const midi = t.midi ?? tune.notes[(s.hits - 1) % tune.notes.length];
      if (soundRef.current && piano.current) {
        const n = piano.current.note(midi, t.len > 1 ? t.len * 0.6 : 0.45);
        if (t.len > 1) ringing.current = n;
      }
      if (t.len > 1) holder.current = who;
      const cx = col * colW + colW / 2;
      const cy = Math.min(H - 10, H - (yRow - s.pos) * rowH);
      f.ripples.push({ x: cx, y: cy, t: 0 });
      f.notes.push({ x: cx, y: cy, t: 0, life: 0.9, ph: Math.random() * 6,
        ch: ["♪", "♫", "♩", "♬"][s.hits % 4], c: NOTE_COLS[s.hits % NOTE_COLS.length], size: 20 + Math.random() * 10 });
      f.pulse = 1;
      if (s.combo > 0 && s.combo % 25 === 0) flash(`${s.combo} in a row!`, "success");
    } else if (res.kind === "wrong") {
      stopRing();
      f.wrong.push({ col, yRow, t: 0 });
      if (soundRef.current && piano.current) piano.current.buzz();
      flash("Oops — that's white!", "error");
    }
  };
  const letGo = (who) => {
    if (holder.current === null || holder.current !== who) return;
    holder.current = null;
    stopRing();
    release(sim.current);
  };

  // fingers: every finger is its own tap, so two thumbs can play
  const onDown = (e) => {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    try { c.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    const r = c.getBoundingClientRect();
    const col = Math.max(0, Math.min(COLS - 1, Math.floor(((e.clientX - r.left) / r.width) * COLS)));
    const yUp = ((r.bottom - e.clientY) / r.height) * VISIBLE;
    press(col, yUp, `p${e.pointerId}`);
  };
  const onUp = (e) => letGo(`p${e.pointerId}`);

  useEffect(() => {
    if (isSpectator) return undefined;
    const down = (e) => {
      const col = KEYS[e.key?.toLowerCase()];
      if (col === undefined) return;
      e.preventDefault();
      if (e.repeat) return;
      press(col, null, `k${col}`);
    };
    const up = (e) => {
      const col = KEYS[e.key?.toLowerCase()];
      if (col !== undefined) letGo(`k${col}`);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  });

  useEffect(() => {
    if (isSpectator) return undefined;
    let raf, last = performance.now(), pushed = 0, lastHud = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = sim.current, f = fx.current;
      if (!overRef.current) {
        const out = step(s, dt);
        if (out.held) {
          // held to the end: a little burst of notes off the top
          stopRing();
          holder.current = null;
          const { w: W, h: H } = size.current, rowH = H / VISIBLE, colW = W / COLS;
          const cx = out.held.col * colW + colW / 2, cy = H - (out.held.y + out.held.len - s.pos) * rowH;
          for (let i = 0; i < 4; i++) {
            f.notes.push({ x: cx + (i - 1.5) * 14, y: Math.max(30, cy + 40), t: 0, life: 1.1, ph: i * 1.7,
              ch: ["♪", "♫"][i % 2], c: NOTE_COLS[(s.hits + i) % NOTE_COLS.length], size: 18 + i * 3 });
          }
        }
        if (out.missed) {
          stopRing();
          holder.current = null;
          if (soundRef.current && piano.current) piano.current.buzz();
          flash("Missed one!", "error");
        }
        const target = score(s);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
        if (now - lastHud > 150) { lastHud = now; setHud({ hits: s.hits, best: s.best, misses: s.misses + s.wrongs }); }
      } else if (ringing.current) {
        stopRing();
      }
      // effects age
      for (const r of f.ripples) r.t += dt;
      f.ripples = f.ripples.filter((r) => r.t < 0.45);
      for (const n of f.notes) n.t += dt;
      f.notes = f.notes.filter((n) => n.t < n.life).slice(-40);
      for (const w of f.wrong) w.t += dt;
      f.wrong = f.wrong.filter((w) => w.t < 0.6);
      for (const p of f.press) p.t += dt;
      f.press = f.press.filter((p) => p.t < 0.3);
      f.pulse = Math.max(0, f.pulse - dt * 6);
      const lvl = Math.floor(s.hits / 50);
      f.bg += Math.max(-dt, Math.min(dt, lvl - f.bg)) * 0.8;

      const c = canvasRef.current;
      if (c) {
        const { w, h } = size.current, dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const ctx = c.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScene(ctx, s, w, h, f, now / 1000, tune);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, addScore, tune]);

  const stats = [
    { label: "Score", value: Number(isSpectator ? (spectatorWatching?.score ?? 0) : eng.score).toLocaleString() },
    { label: "Tiles", value: hud.hits },
    { label: "Best combo", value: hud.best },
  ];
  const controls = !isSpectator ? (
    <button className="press p-white pt-btn" onClick={() => setSound((v) => !v)}
      aria-label={sound ? "Sound off" : "Sound on"} aria-pressed={sound}>
      {sound ? "🔊 Sound on" : "🔇 Sound off"}
    </button>
  ) : null;

  return (
    <>
      <GameFrame
        gameName="Piano Tiles" badge="🎹 PIANO TILES"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={Object.values(eng.opponents)}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
        controls={controls}
      >
        {({ w, h }) => {
          if (isSpectator) {
            return <div className="muted">👀 Watching {spectatorWatching?.username} — {Number(spectatorWatching?.score ?? 0).toLocaleString()} pts</div>;
          }
          const ch = Math.max(200, h - 24), cw = Math.min(w, Math.round(ch * 0.7));
          size.current = { w: cw, h: ch };
          return (
            <div className="pt-pad" style={{ width: w, height: h }} onContextMenu={(e) => e.preventDefault()}>
              <canvas ref={canvasRef} className="pt-canvas" style={{ width: cw, height: ch }}
                onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp}
                role="img" aria-label={`Piano Tiles: ${tune.name}. Tap the black tiles, lowest first`} />
              <div className="pt-help muted">Tap the black tiles · hold the long ones · keys D F J K</div>
            </div>
          );
        }}
      </GameFrame>
      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`Tiles: ${hud.hits} · Best combo: ${hud.best}${hud.misses ? ` · Slips: ${hud.misses}` : ""}`} />
      )}
    </>
  );
}
