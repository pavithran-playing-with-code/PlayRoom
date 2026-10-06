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

function drawScene(ctx, s, W, H, fx, now, tune) {
  const rowH = H / VISIBLE, colW = W / COLS;

  // The board as the original has it: white, thin grey lines, the rows
  // rolling down; sharp black tiles edge to edge; played ones turn pale grey;
  // the count of tiles played big and red at the top.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#E3E3E3";
  ctx.lineWidth = 1;
  for (let r = Math.floor(s.pos); r <= s.pos + VISIBLE + 1; r++) {
    const y = Math.round(H - (r - s.pos) * rowH) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.strokeStyle = "#CFCFCF";
  for (let c = 1; c < COLS; c++) {
    const x = Math.round(c * colW) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  const cell = (col, top, h) => [Math.round(col * colW) + 1, Math.round(top) + 1, Math.round(colW) - 1, Math.round(h) - 1];

  for (const t of visible(s)) {
    const top = H - (t.y + t.len - s.pos) * rowH, h = t.len * rowH;
    const [x, y, w, hh] = cell(t.col, top, h);
    const since = s.t - t.at;
    if (t.missed) {
      // the one you missed, blinking red
      const on = since > 0.9 || Math.floor(since * 8) % 2 === 0;
      ctx.fillStyle = on ? "#F2484E" : "#111111";
      ctx.fillRect(x, y, w, hh);
      continue;
    }
    const holding = t.i === s.hold;
    if (t.done && !holding) {
      // played: pale grey, and the blue of a long one held fades with it
      const q = Math.min(1, since / 0.12);
      const grey = Math.round(17 + (226 - 17) * q);
      ctx.fillStyle = `rgb(${grey},${grey},${grey})`;
      ctx.fillRect(x, y, w, hh);
      if (t.len > 1 && t.held > 0) {
        ctx.fillStyle = "rgba(86,178,245,.35)";
        ctx.fillRect(x, y + hh * (1 - t.held), w, hh * t.held);
      }
      continue;
    }
    ctx.fillStyle = "#111111";
    ctx.fillRect(x, y, w, hh);
    if (t.len > 1) {
      // a long tile: a dot at the bottom and a line up it; held, it fills
      // with blue from the bottom and the dot rides the top of the blue
      const cx = x + w / 2, fh = holding ? hh * t.held : 0;
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx, y + hh - rowH * 0.5); ctx.lineTo(cx, y + rowH * 0.25); ctx.stroke();
      if (holding) {
        const fg = ctx.createLinearGradient(0, y + hh, 0, y + hh - fh);
        fg.addColorStop(0, "#1E88E5"); fg.addColorStop(1, "#7FD3FF");
        ctx.fillStyle = fg;
        ctx.fillRect(x, y + hh - fh, w, fh);
      }
      ctx.save();
      if (holding) { ctx.shadowColor = "#7FD3FF"; ctx.shadowBlur = 18; }
      ctx.fillStyle = holding ? "#FFFFFF" : "rgba(255,255,255,.75)";
      ctx.beginPath(); ctx.arc(cx, holding ? y + hh - fh : y + hh - rowH * 0.5, holding ? 9 : 7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (t.twin || (s.tiles[t.i + 1] && s.tiles[t.i + 1].twin && s.tiles[t.i + 1].y === t.y)) {
      // a chord: both its tiles marked, so you know to tap both
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.fillRect(x, y + hh - 6, w, 3);
    }
    if (t.i === 0 && !s.started) {
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.round(Math.min(24, w * 0.24) * (1 + Math.sin(now * 5) * 0.05))}px system-ui, -apple-system, sans-serif`;
      ctx.fillText("START", x + w / 2, y + hh / 2);
      ctx.textBaseline = "alphabetic";
    }
  }

  // a tap on white: that square blinks red
  for (const wr of fx.wrong) {
    if (wr.t > 0.9) continue;
    const on = Math.floor(wr.t * 8) % 2 === 0;
    if (!on) continue;
    const [x, y, w, hh] = cell(wr.col, H - (Math.floor(wr.yRow) + 1 - s.pos) * rowH, rowH);
    ctx.fillStyle = "#F2484E";
    ctx.fillRect(x, y, w, hh);
  }

  // the count of tiles played, big and red, as the original shows it
  if (s.started) {
    ctx.font = `600 ${Math.round(Math.min(64, W * 0.17))}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.fillStyle = "#F2484E";
    ctx.strokeText(String(s.hits), W / 2, H * 0.12);
    ctx.fillText(String(s.hits), W / 2, H * 0.12);
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
            <div className="pt-pad" data-no-fun style={{ width: w, height: h }} onContextMenu={(e) => e.preventDefault()}>
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
