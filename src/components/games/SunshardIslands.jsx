// src/components/games/SunshardIslands.jsx
// Sunshard Jump: a third-person 3D platformer, all jumping. Hop across
// floating islands, collect the 5 Sunshards (one at the end of each zone) and
// bring them to the Sky Temple. Each zone has its own sky. Slimes are beaten
// by landing on them. Falling never kills you — you're back at the last
// flag — so it stays fun.
//
// On a phone the screen is split: the left half is the joystick (it starts
// wherever your thumb lands), the right half turns the camera.
//
// Everyone in a room plays the same islands (sunshardWorld.js, from the
// room's seed). Each phone runs its own explorer (sunshardSim.js) and tells
// the room where it is ~10 times a second (isl:pos, relayed by
// config/socket.js); everyone else's explorer is drawn from that, eased
// between reports, in their own colour with their name over them. Explorers
// pass through each other.
//
//   Light the temple and a portal opens (3 s): it takes you up to Sunhaven
//   Isle (sunhavenWorld.js / sunhavenSim.js), floating over the temple — a
//   village, four sun shrines to light, each a new power (the sun pulse, the
//   air dash…), and the Shade Colossus in its tower. Beat it and, a moment
//   later, you're on a new sky island (the next in the room's seed, so
//   friends get the same one) — the islands add up.
//   Slimes and crumbling stones in the sky are shared: a stomp or a stone
//   stepped on is told to the room (isl:ev), and slimes wander by the match
//   clock. isl:pos says which stage you're on (sg); a friend is drawn only on
//   the same island and stage.
//
//   Race (a normal room): shards are your own, and so is your Sunhaven — the
//   others on it are ghosts. Most islands first, then whoever got furthest.
//   Together (a co-op room): one shard count for the side — any of you can
//   take a shard for everyone, the gate opens at five between you, and
//   whoever lights the temple opens the portal for the whole side at once
//   (isl:ev tp, at a moment on the match clock). On Sunhaven the side shares
//   one island: kills, hearts, shrines and the boss are told to the room, and
//   one phone — the host, the lowest seated id there — runs the creatures and
//   the boss and sends them ~8 times a second (isl:host); the rest ease
//   toward that and only decide what hurts their own explorer. The host
//   gone, the next takes over from the last snapshot. And you're tied tail to
//   tail in seat order (a conga line, sunshardSim.js tether), sky and isle: a
//   chain — you can't get further apart than its length, and it never snaps;
//   fall and you're put back beside the friend you're tied to.
//
// Watching (a spectator): the watched player's phone sends a small frame of
// its run ~15 times a second while anyone watches (useSpecStream) — the
// explorer, the camera, the shards, the gate, the stones mid-crumble, the
// slimes gone; on the isle the shrines, the boss and the creatures — and the
// watcher builds the same island from the seed (the isle too, when they get
// there) and draws it from over their shoulder, eased between frames.
//
// The drawing is sunshardScene.js (three.js r128, loaded only when this game
// opens). A landscape game, full screen (GameFrame bare): held upright the
// whole frame is drawn turned, and every touch is turned back (toGame).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpecStream from "./useSpecStream";
import { useSocket } from "../../utils/SocketContext";
import { useUprightTouch, toGame, gameRect } from "../horror/LandscapeGate";
import { team as teamOf, plural } from "./coopTeam";
import { buildWorld, levelCode, ZONES, SHARDS, clamp, TAU } from "./sunshardWorld.js";
import { newRun, step, pressJump, releaseJump, respawn, score, shardsHave, tether, tiedTo, ropeState, LEASH, killSlime, crumbleAt, watchStep } from "./sunshardSim.js";
import { buildWorld as buildIsle, ISLE_ZONES, SHRINES as ISLE_SHRINES, SHRINE_COLS, MAP_SIZE, zoneAt as isleZoneAt } from "./sunhavenWorld.js";
import * as SH from "./sunhavenSim.js";
import { MATE, createScene } from "./sunshardScene";

const START_S = 3;
// everyone's colour, by seat (user id order) — the same on every phone
const HUES = [0xff7a4d, ...MATE];
const SEND_MS = 100;
const PORTAL_S = 3.0;        // the temple lit → on Sunhaven Isle, in seconds
const ISLE_END_S = 6;        // Sunhaven saved → the next sky island
const ISLE_RISE = 62;        // how high over the temple the isle floats
const HOST_MS = 125;         // together: the host's snapshot, ~8 a second
const FRESH_MS = 2500;       // a friend quiet this long isn't counted
const MAX_PTS = 25000;       // the room's cap for one game
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
// island 0 is the room's seed; every next one follows from it, the same on every phone
const islandCode = (seed, round) => levelCode(seed) + (round ? "-" + round : "");
const hex = (c) => "#" + c.toString(16).padStart(6, "0");
const ZONE_HEX = ZONES.map((z) => hex(z.col));
const SHRINE_HEX = SHRINE_COLS.map(hex);
const POWERS = ["Sun Pulse unlocked", "Air Dash unlocked", "+1 heart", "Your pulse grows stronger"];
const fmt = (t) => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + String(s).padStart(2, "0"); };
const bits = (set) => [...set].reduce((m, i) => m | (1 << i), 0);
const fromBits = (m, n = SHARDS) => { const s = new Set(); for (let i = 0; i < n; i++) if (m & (1 << i)) s.add(i); return s; };
const isleOff = (W) => ({ x: W.temple.x, y: W.temple.y + ISLE_RISE, z: W.temple.z });
const wrapA = (d) => { while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

// ── sound: Web Audio only ────────────────────────────────────────────────────
function makeAudio() {
  let AC = null, master = null, muted = false, music = 0, playing = false;
  const init = () => {
    if (!AC) {
      try {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        master = AC.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(AC.destination);
        const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3], pat = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 7, 5, 4, 2, 3];
        let n = 0;
        music = setInterval(() => {
          if (!AC || muted || !playing) return;
          const i = pat[n % pat.length];
          tone(scale[i], 0.5, "sine", 0.035);
          if (n % 4 === 0) tone(scale[i] / 2, 0.9, "triangle", 0.03);
          n++;
        }, 260);
      } catch { AC = null; }
    }
    if (AC && AC.state === "suspended") AC.resume();
  };
  function tone(f, d, type, v, f2) {
    if (!AC) return;
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v || 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
  }
  const seq = (fs, gap, d, v) => fs.forEach((f, i) => setTimeout(() => tone(f, d, "triangle", v), i * gap));
  const sfx = {
    jump: () => tone(380, 0.16, "sine", 0.14, 640), dbl: () => tone(520, 0.2, "triangle", 0.14, 980), land: () => tone(130, 0.12, "sine", 0.18, 60),
    shard: () => seq([523, 659, 784, 1046, 1318], 90, 0.4, 0.14),
    hurt: () => tone(240, 0.3, "sawtooth", 0.14, 70), stomp: () => tone(320, 0.16, "square", 0.1, 140), spring: () => tone(260, 0.28, "sine", 0.16, 1000),
    flag: () => seq([660, 880], 110, 0.25, 0.12), crumble: () => tone(90, 0.3, "sawtooth", 0.08, 40),
    tie: () => seq([660, 990], 90, 0.2, 0.1), snap: () => tone(900, 0.25, "square", 0.09, 160),
    win: () => seq([523, 659, 784, 1046, 784, 1046, 1318], 150, 0.45, 0.15), beep: (hi) => tone(hi ? 880 : 440, hi ? 0.45 : 0.18, "square", 0.12),
    // Sunhaven Isle
    talk: () => tone(520, 0.06, "square", 0.06), pulse: () => { tone(300, 0.4, "sine", 0.18, 900); tone(600, 0.4, "triangle", 0.08, 1500); }, dash: () => tone(700, 0.15, "sawtooth", 0.07, 200),
    slam: () => tone(80, 0.5, "sawtooth", 0.22, 30), rain: () => tone(900, 0.4, "sine", 0.07, 120), stun: () => tone(400, 0.5, "triangle", 0.14, 800), boss: () => tone(70, 1.2, "sawtooth", 0.2, 40),
  };
  return {
    init, sfx,
    play(on) { playing = on; },
    mute(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    close() { clearInterval(music); try { if (AC) AC.close(); } catch { /* gone */ } AC = null; },
  };
}

// ── the isle's map: the ground once, then flags, shrines, friends and you ────
const toMap = (x, z, s) => [(x / MAP_SIZE + 0.5) * s, (z / MAP_SIZE + 0.5) * s];
function mapBaseOf(WI) {
  const c = document.createElement("canvas"), N = 220;
  c.width = c.height = N;
  const g = c.getContext("2d"), im = g.createImageData(N, N);
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const x = (px / N - 0.5) * MAP_SIZE, z = (py / N - 0.5) * MAP_SIZE, h = WI.H(x, z), zi = isleZoneAt(x, z, -1), o = (py * N + px) * 4;
    let col = h < -5 ? [150, 205, 255] : h < 0 ? [70, 150, 215] : h < 0.7 ? [225, 210, 150] : h > 18 ? [200, 210, 160] : h > 9 ? [120, 184, 90] : [114, 209, 90];
    if (zi === 3 && h > 0.7) col = [176, 110, 80];
    if (zi === 5 && h > 0.7) col = [140, 140, 165];
    im.data[o] = col[0]; im.data[o + 1] = col[1]; im.data[o + 2] = col[2]; im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}
function drawMap(c, base, WI, S2, found, mates, full) {
  if (!c || !base) return;
  const s = c.width, g = c.getContext("2d");
  g.clearRect(0, 0, s, s);
  g.save();
  if (!full) { g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, TAU); g.clip(); }
  g.drawImage(base, 0, 0, s, s);
  WI.flags.forEach((f) => { const [x, y] = toMap(f.x, f.z, s); g.fillStyle = found.has(f.i) ? "#fff" : "#999"; g.beginPath(); g.arc(x, y, full ? 6 : 3, 0, TAU); g.fill(); g.strokeStyle = "#333"; g.lineWidth = 1; g.stroke(); });
  WI.shrines.forEach((sh) => { const [x, y] = toMap(sh.x, sh.z, s), r = full ? 8 : 4; g.fillStyle = S2.shrines.has(sh.i) ? SHRINE_HEX[sh.i] : "#333"; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.7, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.7, y); g.fill(); g.strokeStyle = "#fff"; g.stroke(); });
  const o = SH.objective(S2, WI);
  if (o) { const [x, y] = toMap(o.x, o.z, s), p = 1 + Math.sin(performance.now() / 200) * 0.25; g.fillStyle = "#ffd24a"; g.strokeStyle = "#7a4a00"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, (full ? 9 : 5) * p, 0, TAU); g.fill(); g.stroke(); }
  for (const m of mates) { const [x, y] = toMap(m.x, m.z, s); g.fillStyle = hex(m.col); g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, full ? 5 : 3, 0, TAU); g.fill(); g.stroke(); }
  const [px, py] = toMap(S2.pl.x, S2.pl.z, s), r = full ? 9 : 5;
  g.translate(px, py); g.rotate(-S2.pl.face + Math.PI);
  g.fillStyle = "#ff3b3b"; g.strokeStyle = "#fff"; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, r); g.lineTo(r * 0.7, -r * 0.7); g.lineTo(-r * 0.7, -r * 0.7); g.closePath(); g.fill(); g.stroke();
  g.restore();
}
// what the HUD shows on the isle (the player's and the watcher's)
function isleHud(S2, WI, mh) {
  const P = S2.pl, o = SH.objective(S2, WI), B = S2.boss, side = SH.sideText(S2);
  return {
    sg: 1, hp: P.hp, mh, have: S2.shrines.size, haveSet: [...S2.shrines],
    compass: o ? `${o.name} · ${Math.round(Math.hypot(o.x - P.x, o.z - P.z))} m` : "Victory!",
    quest: SH.questText(S2) + (side ? "\n" + side : ""),
    boss: B.state === "cycle" || B.state === "intro" ? Math.max(0, B.hp / B.max) : null,
    dlg: S2.dlg ? { name: S2.dlg.name, line: S2.dlg.lines[S2.dlg.i] } : null,
  };
}

export default function SunshardIslands(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 300,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null, mode } = props;
  const coop = mode === "coop" && !!roomCode;
  const myId = Number(currentUser?.id);
  const { socket } = useSocket() || {};
  const [round, setRound] = useState(0);
  const roundRef = useRef(0);
  roundRef.current = round;
  const W = useMemo(() => buildWorld(islandCode(seed, round)), [seed, round]);
  const bank = useRef(0);                     // the points of the islands behind you
  const litOnce = useRef(false);              // any island lit: the room's goal
  const savedN = useRef(0);                   // Sunhavens saved
  const T = useMemo(() => teamOf(players, myId), [players, myId]);
  const seated = useMemo(() => (players || []).filter((p) => !p.is_spectator).map((p) => ({ id: Number(p.user_id), name: p.username })).sort((a, b) => a.id - b.id), [players]);
  const mySlot = Math.max(0, seated.findIndex((p) => p.id === myId));
  const seatedRef = useRef(seated);
  seatedRef.current = seated;

  // the run lives in a ref: the loop changes it every frame
  const run = useRef(null);
  if (run.current === null || run.current.code !== W.code) { run.current = newRun(W); run.current.code = W.code; }
  // this round's stage: the sky hop (sg 0) — then the portal — then Sunhaven
  // Isle (sg 1, its run S2). Kept across a rebuilt scene (a reconnect).
  const stg = useRef({ rd: -1 });
  const stage = () => {
    if (stg.current.rd !== roundRef.current) stg.current = { rd: roundRef.current, sg: 0, S2: null, WI: null, portal: 0, from: 0, flashed: false, banked: false, doneAt: 0 };
    return stg.current;
  };
  // the isle's world, built when it's first needed
  const isleWorlds = useRef(new Map());
  const isleWorld = (rd) => {
    const code = "sunhaven-" + islandCode(seed, rd);
    let w = isleWorlds.current.get(code);
    if (!w) { w = buildIsle(code); isleWorlds.current = new Map([[code, w]]); }
    return w;
  };
  const remotes = useRef(new Map());          // id -> { latest report, eased pose }
  const teamDoneRef = useRef(false);
  const fresh = (r, now) => now - r.at < FRESH_MS;
  const agreedTeam = () => {
    // together: the side's shards — mine plus every friend's still in the sky
    if (!coop) return null;
    const s = new Set(run.current.shards);
    for (const r of remotes.current.values()) if ((r.rd || 0) === roundRef.current && !r.sg) for (const i of fromBits(r.sh)) s.add(i);
    return s;
  };
  // the score right now: the islands behind, plus this one (sky, or isle)
  const curScore = () => {
    const st = stage();
    if (st.gone) return bank.current;            // banked, and on the way to the next island
    if (st.sg === 1 && st.S2) return Math.min(MAX_PTS, bank.current + SH.score(st.S2));
    if (st.banked) return bank.current;
    return Math.min(MAX_PTS, bank.current + score(run.current, W, agreedTeam()));
  };

  const eng = useGameEngine({
    roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: () => ({ pairs_matched: litOnce.current || teamDoneRef.current || run.current.finished ? 1 : 0 }),
  });
  const { setScore } = eng;
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);
  const anchor = useRef(null);
  if (anchor.current === null) {
    let gone = 0;
    if (startedAt && serverNow) { const g = (new Date(serverNow).getTime() - new Date(startedAt).getTime()) / 1000; if (Number.isFinite(g)) gone = clamp(g, 0, durationSeconds || Infinity); }
    anchor.current = performance.now() - gone * 1000;
  }

  // ── three.js, loaded when the game opens ───────────────────────────────────
  const [THREE, setThree] = useState(null);
  const [noGl, setNoGl] = useState(false);
  useEffect(() => {
    let alive = true;
    import("three").then((m) => { if (alive) setThree(m); }).catch(() => { if (alive) setNoGl(true); });
    return () => { alive = false; };
  }, []);

  const audio = useRef(null);
  if (audio.current === null) audio.current = makeAudio();
  useEffect(() => { const a = audio.current; return () => a.close(); }, []);
  const [muted, setMuted] = useState(false);
  useEffect(() => { audio.current.mute(muted); }, [muted]);

  // ── input ──────────────────────────────────────────────────────────────────
  const keys = useRef({});
  const joy = useRef({ x: 0, y: 0 });
  const cam = useRef({ yaw: 0, pitch: 0.42 });
  const upright = useUprightTouch();
  const rot = useRef(upright);
  rot.current = upright;
  const coarse = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer:coarse)").matches;
  const [touchUi, setTouchUi] = useState(coarse);
  const live = (elapsedNow) => !overRef.current && !isSpectator && elapsedNow >= START_S;
  const elapsed = () => (performance.now() - anchor.current) / 1000;
  const onIsle = () => { const st = stage(); return st.sg === 1 && st.S2 ? st : null; };
  const actQ = useRef([]);                    // my taps' moments on the isle, for the loop to show
  const doJump = useCallback(() => {
    audio.current.init();
    if (!live(elapsed())) return;
    const st = onIsle();
    if (st) SH.pressJump(st.S2); else pressJump(run.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const relJump = () => { releaseJump(run.current); const st = onIsle(); if (st) SH.releaseJump(st.S2); };
  // the isle's two buttons: ACTION (talk, light, pulse, next line) and DASH
  const doAction = () => { audio.current.init(); const st = onIsle(); if (st && live(elapsed())) actQ.current.push(...SH.pressAction(st.S2, st.WI)); };
  const doDash = () => { audio.current.init(); const st = onIsle(); if (st && live(elapsed())) actQ.current.push(...SH.pressDash(st.S2)); };

  useEffect(() => {
    if (isSpectator) return undefined;
    const dn = (e) => {
      const c = e.code;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(c)) e.preventDefault();
      if (e.repeat) return;
      keys.current[c] = true;
      audio.current.init();
      if (c === "Space") doJump();
      if (c === "KeyM") setMuted((m) => !m);
      if (c === "KeyF" || c === "Enter") doAction();
      if (c === "ShiftLeft" || c === "ShiftRight") doDash();
      if (c === "KeyR" && live(elapsed())) {
        const st = onIsle();
        if (st) { st.S2.ev = []; SH.respawn(st.S2, st.WI, false); actQ.current.push(...st.S2.ev); } else respawn(run.current);
      }
    };
    const up = (e) => { keys.current[e.code] = false; if (e.code === "Space") relJump(); };
    // leaving the app (or a system gesture) can swallow a finger's lift: let everything go
    const blur = () => { keys.current = {}; relJump(); stickUp(); drag.current = null; };
    const vis = () => { if (document.hidden) blur(); };
    // the last finger off the glass: nothing can still be held
    const touchEnd = (e) => { if (!e.touches || !e.touches.length) { relJump(); stickUp(); drag.current = null; } };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    window.addEventListener("touchend", touchEnd, { passive: true }); window.addEventListener("touchcancel", touchEnd, { passive: true });
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur);
      window.removeEventListener("touchend", touchEnd); window.removeEventListener("touchcancel", touchEnd);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [isSpectator, doJump]); // eslint-disable-line react-hooks/exhaustive-deps

  // The screen, split in two for thumbs: a touch on the left half is the
  // joystick — measured from wherever the thumb landed, so it needn't find
  // the ring — and a touch on the right half turns the camera. A mouse drags
  // the camera anywhere (the keys move). On the isle, while someone's talking,
  // a tap anywhere is the next line.
  const knobRef = useRef(null), stickId = useRef(null), stickC = useRef({ x: 0, y: 0 });
  const stickMove = (p) => {
    const c = stickC.current;
    let dx = p.x - c.x, dy = p.y - c.y;
    const l = Math.hypot(dx, dy), m = 46;
    if (l > m) { dx *= m / l; dy *= m / l; }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px,${dy}px)`;
    joy.current = { x: dx / m, y: dy / m };
  };
  const stickUp = () => {
    stickId.current = null; joy.current = { x: 0, y: 0 };
    if (knobRef.current) knobRef.current.style.transform = "";
  };
  const drag = useRef(null);
  const padDown = (e) => {
    audio.current.init();
    if (e.pointerType === "touch" && !touchUi) setTouchUi(true);
    if (e.target.closest && e.target.closest(".ss-btn, .gf-float, .ss-mmap, .ss-bigmap")) return;
    const st = onIsle();
    if (st && st.S2.dlg) { e.preventDefault(); doAction(); return; }
    const p = toGame(e, rot.current);
    if (e.pointerType !== "mouse" && p.x < size.current.w / 2) {
      // one thumb on the stick: a new one on this side takes it over. The old one
      // can only still be down if its lift was lost (iPhone, a system swipe) —
      // which used to leave the stick dead until the game was restarted
      e.preventDefault();
      stickId.current = e.pointerId; stickC.current = p; stickMove(p);
    } else {
      drag.current = { id: e.pointerId, x: p.x, y: p.y };
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const padMove = (e) => {
    if (e.pointerId === stickId.current) { stickMove(toGame(e, rot.current)); return; }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = toGame(e, rot.current), isle = !!onIsle();
    cam.current.yaw -= (p.x - d.x) * 0.006;
    // on the isle you can look up at the sky, and down from its rim
    cam.current.pitch = clamp(cam.current.pitch + (p.y - d.y) * 0.004, isle ? -0.6 : -0.05, isle ? 1.4 : 1.3);
    d.x = p.x; d.y = p.y;
  };
  const padUp = (e) => {
    if (e.pointerId === stickId.current) stickUp();
    if (drag.current && drag.current.id === e.pointerId) drag.current = null;
  };

  // ── everyone else, from the room ───────────────────────────────────────────
  const toastRef = useRef(null);
  const momentsRef = useRef([]);             // friends' stomps, for a puff where the slime was
  const tpAt = useRef(0);                    // together: when the portal takes us (match clock)
  const isleQ = useRef([]);                  // together: friends' moments on the isle
  const hostQ = useRef(null);                // together: the host's latest snapshot
  useEffect(() => {
    if (!socket) return undefined;
    const onPos = (m) => {
      const id = Number(m.user_id);
      if (id === myId) return;
      const slot = seated.findIndex((p) => p.id === id);
      let r = remotes.current.get(id);
      if (!r) {
        r = { id, name: seated[slot]?.name || "Friend", col: HUES[(slot < 0 ? id : slot) % HUES.length], d: { x: m.x, y: m.y, z: m.z, face: m.f, sq: 0 } };
        remotes.current.set(id, r);
      }
      if (r.fin == null && m.fin != null && (m.rd || 0) === roundRef.current) {
        const who = r.name;
        if (toastRef.current) toastRef.current(coop ? `🏆 ${who} lit the temple — a portal opens!` : `🏁 ${who} lit the temple!`, 3500);
      }
      // a new island or stage: they're somewhere else now, not on their way there
      if ((m.rd || 0) !== (r.rd || 0) || (m.sg || 0) !== (r.sg || 0)) Object.assign(r.d, { x: m.x, y: m.y, z: m.z, face: m.f });
      Object.assign(r, m, { at: performance.now() });
    };
    // a friend's moment on my island: a slime they stomped, a stone they
    // stepped on; together, the portal opening and what happens on the isle
    const onEv = (m) => {
      if (Number(m.user_id) === myId || (m.rd || 0) !== roundRef.current) return;
      if (m.k === "stomp") { if (killSlime(run.current, m.i)) momentsRef.current.push(m); }
      else if (m.k === "crumble") crumbleAt(run.current, W, m.i);
      else if (m.k === "tp") { if (coop && !tpAt.current) tpAt.current = Number(m.at) || 0; }
      else if (coop) isleQ.current.push(m);
    };
    const onHost = (m) => {
      if (!coop || Number(m.user_id) === myId || (Number(m.rd) || 0) !== roundRef.current) return;
      hostQ.current = m;
    };
    socket.on("isl:pos", onPos);
    socket.on("isl:ev", onEv);
    socket.on("isl:host", onHost);
    return () => { socket.off("isl:pos", onPos); socket.off("isl:ev", onEv); socket.off("isl:host", onHost); };
  }, [socket, myId, seated, coop, W]);
  useEffect(() => { tpAt.current = 0; isleQ.current = []; hostQ.current = null; }, [round]);

  // ── the HUD, and the moments ───────────────────────────────────────────────
  const [hud, setHud] = useState({ sg: 0, hp: 3, mh: 3, have: 0, haveSet: [], compass: "", raceT: 0, rank: [], count: START_S, finished: false, teamDone: false });
  const [banner, setBanner] = useState(null);
  const [toast, setToast] = useState(null);
  const [flash, setFlash] = useState(0);
  const [bigMap, setBigMap] = useState(false);
  const [mapNote, setMapNote] = useState("");
  const arrowRef = useRef(null);
  const tpvRef = useRef(null), tpfRef = useRef(null);
  const mmRef = useRef(null), bigRef = useRef(null), mapBase = useRef(null);
  const bigOpen = useRef(false);
  bigOpen.current = bigMap;
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const say = useCallback((text, ms = 3000) => {
    const t = { text, n: Math.random() };
    setToast(t);
    timers.current.push(setTimeout(() => setToast((x) => (x === t ? null : x)), ms));
  }, []);
  toastRef.current = say;
  const shout = useCallback((title, sub) => {
    const b = { title, sub, n: Math.random() };
    setBanner(b);
    timers.current.push(setTimeout(() => setBanner((x) => (x === b ? null : x)), 2500));
  }, []);
  // the portal's swirl and its white flash (plain classes: no re-render mid-swirl)
  const portalFx = (on, white) => {
    if (tpvRef.current) tpvRef.current.classList.toggle("on", on);
    const f = tpfRef.current;
    if (f) { f.style.transition = white ? "opacity .35s ease-in" : "opacity 1.4s"; f.style.opacity = white ? "1" : "0"; }
  };
  useEffect(() => { setBigMap(false); portalFx(false, false); }, [round]); // eslint-disable-line react-hooks/exhaustive-deps
  // the isle's friends, for the map: mine colour by seat, on this isle
  const mapMates = (now, except) => [...remotes.current.values()]
    .filter((r) => r.id !== except && (r.rd || 0) === roundRef.current && r.sg === 1 && fresh(r, now)).map((r) => ({ x: r.x, z: r.z, col: r.col }));
  const foundFlags = (S2, now) => {
    // the flags found between us (together), for the map and for travel
    const f = new Set(S2.flags);
    if (coop) for (const r of remotes.current.values()) if ((r.rd || 0) === roundRef.current && r.sg === 1 && fresh(r, now)) for (const i of fromBits(r.fm || 0, 8)) f.add(i);
    return f;
  };
  const paintMaps = (S2, WI, now, except) => {
    if (!mapBase.current || mapBase.current.code !== WI.code) mapBase.current = { code: WI.code, c: mapBaseOf(WI) };
    const found = foundFlags(S2, now), mates = mapMates(now, except);
    drawMap(mmRef.current, mapBase.current.c, WI, S2, found, mates, false);
    if (bigOpen.current) drawMap(bigRef.current, mapBase.current.c, WI, S2, found, mates, true);
  };
  // the big map: tap a flag you've found (or a friend has) to go there
  const bigDown = (e) => {
    e.stopPropagation();
    const c = bigRef.current, st = onIsle();
    if (!c || e.target !== c || !st || isSpectator) { setBigMap(false); return; }
    const r = gameRect(c, rot.current), p = toGame(e, rot.current);
    const mx = ((p.x - r.left) / r.width) * c.width, my = ((p.y - r.top) / r.height) * c.height;
    const found = foundFlags(st.S2, performance.now());
    let best = null, bd = 22;
    for (const f of st.WI.flags) { if (!found.has(f.i)) continue; const [x, y] = toMap(f.x, f.z, c.width), d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = f; } }
    if (!best) { setMapNote("Pick a white flag you've already found"); return; }
    const B = st.S2.boss;
    if (B.state === "cycle" || B.state === "intro") { setMapNote("No travelling during the boss fight"); return; }
    Object.assign(st.S2.pl, { x: best.x + 1.2, z: best.z, y: best.y, vx: 0, vz: 0, vy: 0, onG: true, gp: null });
    st.S2.ckpt = { x: best.x, y: best.y, z: best.z };
    setBigMap(false); say("Travelled to " + best.name, 2000); audio.current.sfx.flag();
  };

  // ── watching: the player sends its run, the watcher follows its island ─────
  const nextRef = useRef(0);                  // the loop's nextAt: when the next island comes
  const specSeen = useRef(false);
  const [specOn, setSpecOn] = useState(false);
  const watchId = spectatorWatching?.user_id;
  useEffect(() => { specSeen.current = false; setSpecOn(false); }, [watchId]);
  const spec = useSpecStream({
    roomCode, isSpectator, myId, watchId,
    // ~300 bytes in the sky, ~1 KB on the isle: the explorer, the camera, and
    // what's changed on the island
    frame: () => {
      if (!sceneRef.current) return null;
      const S = run.current, c = cam.current, team = agreedTeam(), n = nextRef.current, st = stage();
      const rp = coop ? tiedTo(seatedRef.current.map((p) => p.id), myId).reduce((m, id) => m | (ropeState(st.sg === 1 && st.S2 ? st.S2 : S, id) ? (id < myId ? 1 : 2) : 0), 0) : 0;
      const nx = n && n !== Infinity ? Math.max(1, Math.ceil((n - performance.now()) / 1000)) : 0;
      if (st.sg === 1 && st.S2) {
        const S2 = st.S2, P = S2.pl, B = S2.boss, cr = [];
        S2.plats.forEach((q, i) => { if (q.state) cr.push(i, q.state); });
        return {
          rd: roundRef.current, sg: 1, x: r2(P.x), y: r2(P.y), z: r2(P.z), vx: r2(P.vx), vy: r2(P.vy), vz: r2(P.vz), f: r2(P.face),
          g: P.onG ? 1 : 0, gl: P.gliding ? 1 : 0, iv: P.inv > 0 ? 1 : 0, j: P.jumps, sq: r2(P.sq || 0), hp: P.hp, mh: SH.maxHp(S2),
          yw: r2(c.yaw), pt: r2(c.pitch), zn: S2.zone, sh: bits(S2.shrines), fl: bits(S2.flags), q: S2.quest, pq: S2.pipQ, pk: S2.pipK,
          b: [SH.BOSS_STATES.indexOf(B.state), B.sub, B.hp, B.stunned ? 1 : 0, r2(B.tele), r1(B.ringR), r2(B.face), B.idx, ...B.orbs.flatMap((o) => [r1(o.x), r1(o.z)])],
          s: S2.slimes.filter((q) => q.alive).flatMap((q) => [q.i, r1(q.x), r1(q.z), r1(q.y)]),
          w: S2.wisps.filter((q) => q.alive).flatMap((q) => [q.i, r1(q.x), r1(q.y), r1(q.z), q.st, q.boss ? 1 : 0]),
          pu: S2.pickups.slice(0, 12).flatMap((q) => [r1(q.x), r1(q.y), r1(q.z)]),
          cr, rp, td: teamDoneRef.current ? 1 : 0, sc: curScore(), nx: st.doneAt ? Math.max(1, Math.ceil((st.doneAt - performance.now()) / 1000)) : nx,
        };
      }
      const P = S.pl, cr = [];
      S.plats.forEach((q, i) => { if (q.state) cr.push(i, q.state); });
      return {
        rd: roundRef.current, sg: 0, x: r2(P.x), y: r2(P.y), z: r2(P.z), vx: r2(P.vx), vy: r2(P.vy), vz: r2(P.vz), f: r2(P.face),
        g: P.onG ? 1 : 0, gl: P.gliding ? 1 : 0, iv: P.inv > 0 ? 1 : 0, j: P.jumps, sq: r2(P.sq || 0), hp: P.hp,
        yw: r2(c.yaw), pt: r2(c.pitch), zn: S.zone, sh: bits(S.shards), tm: team ? bits(team) : 0, fl: [...S.flags],
        go: S.gateOpen ? 1 : 0, gt: r2(S.gateT), fin: S.finished ? 1 : 0, td: teamDoneRef.current ? 1 : 0, p: S.maxPath,
        dead: S.slimes.filter((s) => !s.alive).map((s) => s.k), cr, rp, sc: curScore(),
        nx, tp: st.portal ? 1 : 0,
      };
    },
    // the watcher: on to whichever island they're on
    onFrame: (f) => {
      if (!specSeen.current) { specSeen.current = true; setSpecOn(true); }
      const rd = Number(f.rd) || 0;
      if (rd !== roundRef.current) setRound(rd);
    },
  });

  // the race, best first: most islands, then further along the stages; in
  // the sky, home first by time, then shards, then how far along; on the
  // isle, the most shrines
  const ranked = (all) => all.sort((a, b) => b.rd - a.rd || (b.sg || 0) - (a.sg || 0)
    || (a.sg ? b.sh - a.sh : ((a.fin != null) !== (b.fin != null) ? (a.fin != null ? -1 : 1) : a.fin != null ? a.fin - b.fin : b.sh - a.sh || b.p - a.p))).slice(0, 5);
  const remoteRow = (r) => ({ id: r.id, name: r.name, col: r.col, rd: r.rd || 0, sg: r.sg || 0, sh: fromBits(r.sh || 0).size, p: r.p, fin: r.fin });

  // ── the loop ───────────────────────────────────────────────────────────────
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const size = useRef({ w: 300, h: 200 });
  useEffect(() => {
    if (!THREE || isSpectator || !hostRef.current) return undefined;
    let scene;
    try {
      scene = createScene(THREE, W, { color: HUES[mySlot % HUES.length] });
    } catch (e) { setNoGl(true); return undefined; }
    sceneRef.current = scene;
    window.__ss = () => ({ run: run.current, cam: cam.current, W, isle: stg.current });          // for tests, like Station 13's __s13
    const host = hostRef.current;
    host.insertBefore(scene.canvas, host.firstChild);
    scene.canvas.className = "ss-canvas";
    scene.resize(size.current.w, size.current.h);
    const S = run.current, A = audio.current, st = stage(), off = isleOff(W);
    // the camera starts behind you, looking at the first shard
    if (st.sg === 0) {
      const s0 = W.shards[0];
      cam.current.yaw = Math.atan2(-(s0.x - S.pl.x), -(s0.z - S.pl.z));
      cam.current.pitch = clamp(cam.current.pitch, -0.05, 1.3);
    }
    const myHue = HUES[mySlot % HUES.length], tiedOnce = new Set();
    let raf, last = performance.now(), sent = 0, hostSent = 0, lastHud = 0, beeped = -1, sizeW = 0, sizeH = 0, started = round > 0, nextAt = 0, tick = 0;
    let isle = null;
    const here = (r) => (r.rd || 0) === round && !r.sg;      // a friend in the sky on this island (not one behind or ahead)
    const hereIsle = (r) => (r.rd || 0) === round && r.sg === 1;
    const tell = (k, i, more) => { if (socket && roomCode) socket.emit("isl:ev", { code: roomCode, rd: round, k, i, ...more }); };
    const chain = () => seatedRef.current.map((p) => p.id);
    const ensureIsle = () => { if (!isle) { isle = scene.createIsle(st.WI, off); isle.show(true); } };
    if (st.sg === 1 && st.S2) ensureIsle();
    if (round > 0 && st.sg === 0) { A.play(true); shout(`Island ${round + 1}`, "A new island — find the 5 Sunshards"); }
    else if (st.sg === 1) A.play(true);
    // the islands behind: this one's points go in the bank (once), and on we go
    const bankSky = () => { if (!st.banked) { st.banked = true; bank.current = Math.min(MAX_PTS, bank.current + score(S, W, agreedTeam())); } };
    const advance = () => {
      if (st.sg === 1 && st.S2) bank.current = Math.min(MAX_PTS, bank.current + SH.score(st.S2));
      else bankSky();
      st.gone = true;
      setRound((n) => n + 1);
    };

    // ── the portal: the temple lit, then up to Sunhaven Isle ────────────────
    // 0 s: the temple opens a portal. 0–2.6 s: rings spiral up round you, the
    // sky swirls, the world shakes harder. 2.6 s: a white flash. 3 s: you're
    // on the isle. `at` is on the match clock, so a side goes together.
    const beginPortal = (at, el) => {
      if (st.sg !== 0 || st.portal) return;
      if (!S.finished) { S.finished = true; S.finishLeft = Math.max(0, (durationSeconds || 300) - el); }
      litOnce.current = true;
      bankSky();
      st.portal = Math.max(at, el + 0.8);
      st.from = st.portal - PORTAL_S;
      portalFx(true, false);
      sent = 0;
    };
    const portalStep = (el, dt) => {
      const t = el - st.from, k = clamp(t / 2.6, 0, 1), P = S.pl, fx = scene.fx, cols = [0xffe28a, 0x7fe3ff, 0xff9ae6, 0xffffff];
      tick += dt;
      if (t > 0 && t < 2.7 && tick > 0.09) {
        tick = 0;
        const a = t * 9;
        for (let i = 0; i < 2; i++) {
          const h = k * 5 + i * 0.6, rad = 2.6 * (1 - k * 0.7);
          fx.ring(P.x, P.y + h, P.z, cols[(i + Math.floor(t * 6)) % 4], 4.5 - k * 3);
          fx.burst(P.x + Math.cos(a + i * 3.1) * rad, P.y + 0.4 + h, P.z + Math.sin(a + i * 3.1) * rad, 4, cols[(i + 1) % 4], 1.5 + k * 4, 2 + k * 5);
        }
        fx.shake(0.15 + k * 0.5);
        if (Math.random() < 0.35) A.sfx.spring();
      }
      if (t >= 2.6 && !st.flashed) { st.flashed = true; portalFx(true, true); }
      if (el >= st.portal) enterIsle(el);
    };
    const enterIsle = (el) => {
      st.WI = isleWorld(round);
      const S2 = SH.newRun(st.WI);
      S2.team = coop; S2.t0 = el; S2.T = el;
      if (coop) {
        // together: side by side at the village start, by seat
        const n = seatedRef.current.length, P = S2.pl;
        P.x = st.WI.start.x + (mySlot - (n - 1) / 2) * 1.2; P.y = st.WI.H(P.x, P.z);
      }
      st.S2 = S2; st.sg = 1;
      ensureIsle();
      cam.current.yaw = 0; cam.current.pitch = 0.42;
      portalFx(false, false);
      const fx = scene.fx, P = S2.pl, cols = [0xffe28a, 0x7fe3ff, 0xffffff];
      [0, 1, 2].forEach((i) => timers.current.push(setTimeout(() => {
        fx.ring(P.x + off.x, P.y + off.y + 0.1 + i * 0.4, P.z + off.z, cols[i], 6 + i * 3);
        fx.burst(P.x + off.x, P.y + off.y + 1, P.z + off.z, 24, cols[i], 7, 5);
      }, 200 + i * 220)));
      A.sfx.win(); shout("Sunhaven Isle", "Look down: that is the way you came");
      sent = 0;
    };

    // ── the isle: one frame ─────────────────────────────────────────────────
    const isleEvents = (evs, anchors, now) => {
      const S2 = st.S2, P = S2.pl, fx = scene.fx, o = off;
      const at = (x, y, z) => [x + o.x, y + o.y, z + o.z];
      const tiedNew = [], tiedAgain = [];
      for (const e of evs) {
        switch (e.k) {
          case "jump": A.sfx.jump(); fx.burst(...at(P.x, P.y + 0.1, P.z), 6, 0xffffff, 2, 0.5); break;
          case "dbl": A.sfx.dbl(); fx.ring(...at(P.x, P.y + 0.1, P.z), 0xbff0ff, 2.8); break;
          case "land": A.sfx.land(); fx.burst(...at(P.x, P.y + 0.1, P.z), 8, 0xdddddd, 2.6, 0.6); break;
          case "spring": A.sfx.spring(); fx.ring(...at(e.x, e.y + 0.6, e.z), 0xff9aa8, 3); break;
          case "stomp": A.sfx.stomp(); fx.burst(...at(e.x, e.y + 0.5, e.z), 22, 0x6fe08a, 5, 3); break;
          case "kill":
            A.sfx.stomp(); fx.burst(...at(e.x, e.y + 0.5, e.z), 16, e.t === "slime" ? 0x6fe08a : 0xff9a4a, 4, 4);
            if (coop && e.how !== "friend") tell("kill", e.i, { t: e.t });
            break;
          case "hurt": A.sfx.hurt(); fx.shake(0.5); fx.burst(...at(P.x, P.y + 0.6, P.z), 14, 0xff6a6a, 5, 2); setFlash((f) => f + 1); break;
          case "pulse": A.sfx.pulse(); fx.ring(...at(e.x, e.y + 0.2, e.z), 0xffe28a, e.r * 2.2); fx.burst(...at(e.x, e.y + 0.5, e.z), 14, 0xffe28a, 6, 2); break;
          case "dash": A.sfx.dash(); fx.burst(...at(e.x, e.y + 0.6, e.z), 8, 0xc08aff, 2, 1); break;
          case "talk": case "talkNext": A.sfx.talk(); break;
          case "shrine":
            A.sfx.shard(); fx.ring(...at(e.x, e.y + 1, e.z), e.col, 7); fx.burst(...at(e.x, e.y + 2, e.z), 50, e.col, 9, 5); fx.shake(0.4);
            shout(e.friend ? "A friend lit a shrine!" : "Shrine lit!", `${POWERS[e.count - 1] || ""}${e.count === 1 ? (touchUi ? ": tap PULSE" : ": press F") : e.count === 2 ? (touchUi ? ": tap DASH" : ": press Shift") : ""}`);
            if (coop && !e.friend) tell("shrine", e.i);
            sent = 0;
            break;
          case "gate": timers.current.push(setTimeout(() => shout("The tower gate opens!", "Go north"), 1400)); break;
          case "quest": say("New quest: light the sun shrines", 3500); break;
          case "boots": shout("Sun Boots!", "You run faster"); break;
          case "pipq": say("Side quest: pop 4 slimes for Pip", 3500); break;
          case "charm": shout("Lucky charm!", "+1 heart"); break;
          case "heal":
            A.sfx.flag(); fx.burst(...at(e.x, e.y, e.z), 8, 0xff5a6e, 3, 3);
            if (coop) tell("heart", 0, { id: e.id });
            break;
          case "flag": A.sfx.flag(); say("Checkpoint saved", 1800); sent = 0; break;
          case "zone": shout(ISLE_ZONES[e.zone].name, "Sunhaven Isle"); break;
          case "crumble": A.sfx.crumble(); break;
          case "splash": A.sfx.land(); fx.burst(...at(e.x, 0, e.z), 18, 0xbfe8ff, 4, 4); break;
          case "respawn": {
            // tied: the chain pulls you back up beside your friend, if they're standing somewhere
            const by = anchors.find((a) => a.g);
            if (by) {
              Object.assign(P, { x: by.x + 0.6, y: by.y + 0.4, z: by.z, vx: 0, vz: 0, vy: 0 });
              say(`🪢 Pulled back up beside ${remotes.current.get(by.id)?.name || "your friend"}`, 1800);
            } else say(e.ko ? "Oops! Back to the last flag." : "Back to the last flag", 1800);
            fx.burst(...at(P.x, P.y + 0.5, P.z), 24, 0xffffff, 5, 3);
            break;
          }
          case "bossIntro": A.sfx.boss(); shout("Shade Colossus", "Jump the rings, dodge the orbs"); break;
          case "slam": A.sfx.slam(); fx.shake(0.6); break;
          case "rain": A.sfx.rain(); break;
          case "stun": A.sfx.stun(); say("It is dizzy! Use your sun pulse!", 3000); break;
          case "bossHitAsk": A.sfx.stomp(); fx.burst(...at(e.x, e.y + 6, e.z), 24, 0xffe28a, 6, 5); tell("bossHit", 0); break;
          case "bossHit": A.sfx.stomp(); fx.burst(...at(S2.boss.x, S2.boss.y + 6, S2.boss.z), 24, 0xffe28a, 6, 5); break;
          case "bossDead": {
            A.sfx.win();
            for (let i = 0; i < 5; i++) timers.current.push(setTimeout(() => fx.burst(...at(e.x, e.y + 4, e.z), 50, [0xffe28a, 0x7fe3ff, 0xff7a4a, 0x6dff9c, 0xffffff][i], 9, 7), i * 220));
            shout("Sunhaven is saved!", coop ? "Your team beat the Shade Colossus" : "The Shade Colossus is gone");
            if (coop && !e.friend) tell("bossDead", 0);
            if (!st.doneAt) { st.doneAt = now + ISLE_END_S * 1000; savedN.current++; }
            sent = 0;
            break;
          }
          case "tie": case "snap": {
            const who = remotes.current.get(e.id)?.name || "your friend";
            A.sfx.tie(); (tiedOnce.has(e.id) ? tiedAgain : tiedNew).push(who); tiedOnce.add(e.id);
            sent = 0;
            break;
          }
          default: break;
        }
      }
      if (tiedNew.length || tiedAgain.length) {
        const both = (l) => l.join(" and ");
        say(tiedNew.length ? `🪢 Tied tail to tail with ${both(tiedNew)}` : `🪢 Tied to ${both(tiedAgain)} again`, 2400);
      }
    };
    const isleFrame = (now, dt, el) => {
      const S2 = st.S2, WI = st.WI, P = S2.pl, k = keys.current, c = cam.current;
      if (k.KeyQ) c.yaw += 1.9 * dt;
      if (k.KeyE) c.yaw -= 1.9 * dt;
      let ix = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + joy.current.x;
      let iz = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0) + joy.current.y;
      if (overRef.current) { ix = 0; iz = 0; }
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), inp = { mx: sy * iz + cy * ix, mz: cy * iz - sy * ix };
      // together: who's here, who's tied to me, and who runs the creatures (the lowest id)
      const mates = coop ? [...remotes.current.values()].filter((r) => hereIsle(r) && fresh(r, now) && seatedRef.current.some((p) => p.id === r.id)) : [];
      const amHost = !coop || mates.every((r) => r.id > myId);
      S2.ai = amHost;
      const anchors = [];
      if (coop) for (const id of tiedTo(chain(), myId)) { const r = mates.find((q) => q.id === id); if (r) anchors.push({ id, x: r.d.x, y: r.d.y, z: r.d.z, g: !!r.g }); }
      const others = amHost ? mates.map((r) => ({ x: r.d.x, y: r.d.y, z: r.d.z })) : [];
      const evs = actQ.current.splice(0);
      // the host's word, and friends' moments, before this step
      const hs = hostQ.current;
      hostQ.current = null;
      if (hs && !amHost && !mates.some((r) => r.id < Number(hs.user_id))) evs.push(...SH.applyHost(S2, WI, hs));
      for (const m of isleQ.current.splice(0)) evs.push(...SH.applyEvent(S2, WI, m));
      // a shrine a friend lit that I missed hearing about: their report has it
      if (coop) for (const r of mates) for (const i of fromBits(r.sh || 0, ISLE_SHRINES)) if (!S2.shrines.has(i)) evs.push(...SH.applyEvent(S2, WI, { k: "shrine", i }));
      for (let i = 0; i < 2; i++) {
        S2.T = el - dt + (dt / 2) * i;
        const bx = P.x, bz = P.z;
        evs.push(...SH.step(S2, WI, inp, dt / 2, others));
        if (anchors.length && !overRef.current) evs.push(...tether(S2, WI, anchors, bx, bz, dt / 2));
      }
      isleEvents(evs, anchors, now);
      // the host: the creatures and the boss for everyone else
      if (coop && amHost && mates.length && socket && roomCode && now - hostSent > HOST_MS) {
        hostSent = now;
        socket.emit("isl:host", { code: roomCode, rd: round, ...SH.hostSnap(S2) });
      }
      // Sunhaven saved: a moment for the end card, then the next sky island
      if (coop && !nextAt && [...remotes.current.values()].some((r) => (r.rd || 0) > round && fresh(r, now))) nextAt = now + 800;
      nextRef.current = nextAt;
      if (!overRef.current && ((st.doneAt && now >= st.doneAt) || (nextAt && now >= nextAt)) && nextAt !== Infinity) { nextAt = Infinity; advance(); }
      // friends here, eased toward where they said they were
      const rs = [], kk = Math.min(1, dt * 12);
      for (const r of remotes.current.values()) {
        if (!hereIsle(r)) continue;
        const age = Math.min(0.15, (now - r.at) / 1000), d = r.d;
        d.x += (r.x + r.vx * age - d.x) * kk; d.y += (r.y + (r.g ? 0 : r.vy * age) - d.y) * kk; d.z += (r.z + r.vz * age - d.z) * kk;
        d.face += wrapA(r.f - d.face) * kk;
        rs.push({ id: r.id, name: r.name, col: r.col, x: d.x, y: d.y, z: d.z, face: d.face, speed: Math.hypot(r.vx, r.vz), onG: !!r.g, vy: r.vy, vx: r.vx, vz: r.vz, gliding: !!r.gl, inv: !!r.iv });
      }
      const ropes = [];
      if (coop) {
        const ids = chain(), isFresh = (id) => id === myId || mates.some((r) => r.id === id);
        for (let i = 0; i + 1 < ids.length; i++) {
          const a = ids[i], b = ids[i + 1];
          if (!isFresh(a) || !isFresh(b)) continue;
          const on = a === myId || b === myId ? !!ropeState(S2, a === myId ? b : a) : !!(remotes.current.get(a).rp & 2);
          ropes.push({ a: a === myId ? "me" : a, b: b === myId ? "me" : b, on, len: LEASH,
            ca: a === myId ? myHue : remotes.current.get(a).col, cb: b === myId ? myHue : remotes.current.get(b).col });
        }
      }
      isle.frame({ S: S2, remotes: rs, ropes, yaw: c.yaw, pitch: c.pitch, dt, T: el });
      const o = SH.objective(S2, WI);
      if (o && arrowRef.current) {
        const fAng = Math.atan2(-Math.sin(c.yaw), -Math.cos(c.yaw)), dAng = Math.atan2(o.x - P.x, o.z - P.z);
        arrowRef.current.style.transform = `rotate(${(-(dAng - fAng) * 180) / Math.PI}deg)`;
      }
      if (socket && roomCode && !overRef.current && now - sent > SEND_MS) {
        sent = now;
        socket.emit("isl:pos", { code: roomCode, rd: round, sg: 1, x: r2(P.x), y: r2(P.y), z: r2(P.z), f: r2(P.face), vx: r2(P.vx), vy: r2(P.vy), vz: r2(P.vz),
          g: P.onG ? 1 : 0, gl: P.gliding ? 1 : 0, iv: P.inv > 0 ? 1 : 0, hp: P.hp,
          rp: coop ? tiedTo(chain(), myId).reduce((m, id) => m | (ropeState(S2, id) ? (id < myId ? 1 : 2) : 0), 0) : 0,
          sh: bits(S2.shrines), fm: bits(S2.flags), p: S.maxPath, fin: S.homeIn != null ? Math.round(S.homeIn * 10) / 10 : null });
      }
      if (now - lastHud > 100) {
        lastHud = now;
        if (!overRef.current) setScore(curScore());
        paintMaps(S2, WI, now, myId);
        const talk = S2.dlg || S2.nearNpc || S2.nearShrine;
        const me = { id: myId, name: "You", col: null, rd: round, sg: 1, sh: S2.shrines.size, p: S.maxPath, fin: null, me: true };
        setHud({ ...isleHud(S2, WI, SH.maxHp(S2)), raceT: Math.max(0, el - START_S), rank: ranked([me, ...[...remotes.current.values()].map(remoteRow)]),
          count: null, teamDone: teamDoneRef.current, mine: S2.shrines.size, done: S2.boss.state === "dead",
          next: st.doneAt ? Math.max(1, Math.ceil((st.doneAt - now) / 1000)) : nextAt && nextAt !== Infinity ? Math.max(1, Math.ceil((nextAt - now) / 1000)) : 0,
          isleT: Math.max(0, (S2.boss.state === "dead" ? S2.finishT : S2.T) - S2.t0), pts: SH.score(S2),
          act: S2.dlg ? "NEXT" : S2.nearNpc ? "TALK" : S2.nearShrine ? "LIGHT" : SH.hasPulse(S2) ? "PULSE" : "—",
          actTalk: !!talk, actCd: !talk && (!SH.hasPulse(S2) || P.pulseCd > 0), dash: SH.hasDash(S2), dashCd: P.dashCd > 0 });
      }
    };

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = now; return; }
      // the first frame is stamped from before the scene was built, so it can come
      // out negative — seconds of it on a slow phone, which ran the physics
      // backwards and threw you off the hub at the start
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = Math.max(last, now);
      const el = (now - anchor.current) / 1000, go = el >= START_S;
      if (size.current.w !== sizeW || size.current.h !== sizeH) { sizeW = size.current.w; sizeH = size.current.h; scene.resize(sizeW, sizeH); }
      if (st.sg === 1 && st.S2) { isleFrame(now, dt, el); return; }
      if (!go) { const n = Math.floor(el); if (n !== beeped && n >= 0) { beeped = n; A.sfx.beep(false); } }
      else if (!started) { started = true; A.sfx.beep(true); A.play(true); shout("Sunshard Jump", "Follow the golden arrow"); }
      // where to go, turned to the camera
      const k = keys.current, c = cam.current;
      if (k.KeyQ) c.yaw += 1.9 * dt;
      if (k.KeyE) c.yaw -= 1.9 * dt;
      let ix = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + joy.current.x;
      let iz = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0) + joy.current.y;
      if (!go || overRef.current) { ix = 0; iz = 0; }
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      const inp = { mx: sy * iz + cy * ix, mz: cy * iz - sy * ix };
      const team = agreedTeam();
      // two steps a frame, on the match clock (so moving platforms agree)
      const evs = [];
      const ids = chain();
      // together: the friends tied to me, where they are now (gone quiet: not held)
      const anchors = [];
      if (coop) for (const id of tiedTo(ids, myId)) {
        const r = remotes.current.get(id);
        if (r && here(r) && fresh(r, now)) anchors.push({ id, x: r.d.x, y: r.d.y, z: r.d.z, g: !!r.g });
      }
      for (let i = 0; i < 2; i++) {
        S.T = el - dt + (dt / 2) * i;
        const bx = S.pl.x, bz = S.pl.z;
        evs.push(...step(S, W, inp, dt / 2, team));
        if (anchors.length && go) evs.push(...tether(S, W, anchors, bx, bz, dt / 2));
      }
      const fx = scene.fx, P = S.pl;
      const tiedNew = [], tiedAgain = [];       // tied to two at once: one toast
      for (const e of evs) {
        if (e.k === "jump") { A.sfx.jump(); fx.burst(P.x, P.y + 0.1, P.z, 6, 0xffffff, 2, 0.5); }
        else if (e.k === "dbl") { A.sfx.dbl(); fx.ring(P.x, P.y + 0.1, P.z, 0xbff0ff, 2.8); }
        else if (e.k === "land") { A.sfx.land(); fx.burst(P.x, P.y + 0.1, P.z, 8, 0xdddddd, 2.6, 0.6); }
        else if (e.k === "shard") {
          A.sfx.shard(); fx.ring(e.x, e.y, e.z, e.col, 7); fx.burst(e.x, e.y, e.z, 50, e.col, 9, 5); fx.shake(0.4);
          shout(`Sunshard ${e.count} / ${SHARDS}`, e.count < SHARDS ? `Next: ${ZONES[Math.min(e.count, SHARDS - 1)].name}` : "The temple gate is open!");
          sent = 0;                                          // tell the room at once
        } else if (e.k === "gate") say("Enter the glowing temple circle", 5000);
        else if (e.k === "hurt") { A.sfx.hurt(); fx.shake(0.5); fx.burst(P.x, P.y + 0.6, P.z, 14, 0xff6a6a, 5, 2); setFlash((f) => f + 1); }
        else if (e.k === "respawn") {
          // tied: the chain pulls you back up beside your friend, if they're standing somewhere
          const by = anchors.find((a) => a.g);
          if (by) {
            Object.assign(P, { x: by.x + 0.6, y: by.y + 0.4, z: by.z, vx: 0, vz: 0, vy: 0 });
            say(`🪢 Pulled back up beside ${remotes.current.get(by.id)?.name || "your friend"}`, 1800);
          } else say(e.ko ? "Oops! Back to the last flag." : "Back to the last flag", 1800);
          fx.burst(P.x, P.y + 0.5, P.z, 24, 0xffffff, 5, 3);
        }
        else if (e.k === "stomp") { A.sfx.stomp(); fx.burst(e.x, e.y + 0.5, e.z, 22, 0x6fe08a, 5, 3); tell("stomp", e.i); }
        else if (e.k === "spring") { A.sfx.spring(); fx.ring(e.x, e.y + 0.6, e.z, 0xff9aa8, 3); fx.burst(P.x, P.y, P.z, 12, 0xff9aa8, 3, 2); }
        else if (e.k === "flag") { A.sfx.flag(); say("Checkpoint saved", 1800); const f = W.flags[e.f]; fx.burst(f.x, f.y + 2, f.z, 16, 0x9dff9d, 3, 2); }
        else if (e.k === "zone") shout(e.zone < 0 ? "Sky Meadow" : ZONES[e.zone].name, e.zone < 0 ? "Your journey starts here" : `Zone ${e.zone + 1} of ${SHARDS}`);
        else if (e.k === "crumble") { A.sfx.crumble(); tell("crumble", e.i); }
        else if (e.k === "tie" || e.k === "snap") {
          const who = remotes.current.get(e.id)?.name || "your friend";
          if (e.k === "snap") { A.sfx.snap(); fx.burst(P.x, P.y + 0.5, P.z, 10, 0xffe28a, 4, 2); say(`💥 Snap! Get back to ${who} to tie up again`, 2600); }
          else { A.sfx.tie(); (tiedOnce.has(e.id) ? tiedAgain : tiedNew).push(who); tiedOnce.add(e.id); }
          sent = 0;
        }
        else if (e.k === "win") {
          S.finishLeft = Math.max(0, (durationSeconds || 300) - el);     // no time limit: the bonus as for five minutes
          S.homeIn = el - START_S;
          A.sfx.win();
          for (let i = 0; i < 5; i++) timers.current.push(setTimeout(() => fx.burst(W.temple.x, W.temple.y + 1.5, W.temple.z, 40, [0xffe28a, 0x7fe3ff, 0xff7a4a, 0x6dff9c, 0xffffff][i], 8, 6), i * 220));
          shout("Temple lit!", coop ? "Your team did it! A portal opens…" : `Home in ${fmt(el - START_S)} — a portal opens…`);
          try {
            const key = "sunshard-best-" + W.code, b = Number(localStorage.getItem(key)) || 0, t = el - START_S;
            if (!b || t < b) localStorage.setItem(key, String(t));
          } catch { /* private */ }
          // the portal, for the whole side at the same moment on the match clock
          if (coop) tell("tp", 0, { at: r2(el + PORTAL_S) });
          beginPortal(el + PORTAL_S, el);
        }
      }
      // friends' stomps: the slime goes with a puff here too
      for (const m of momentsRef.current.splice(0)) { const sl = S.slimes[m.i]; if (sl) fx.burst(sl.x, sl.y + 0.5, sl.z, 22, 0x6fe08a, 5, 3); }
      if (tiedNew.length || tiedAgain.length) {
        const both = (l) => l.join(" and ");
        say(tiedNew.length ? `🪢 Tied tail to tail with ${both(tiedNew)}` : `🪢 Tied to ${both(tiedAgain)} again`, 2400);
      }
      // together: somebody home means everybody home — and through the portal together
      const teamDone = S.finished || (coop && [...remotes.current.values()].some((r) => (r.rd || 0) === round && r.fin != null));
      teamDoneRef.current = teamDone;
      if (teamDone) litOnce.current = true;
      if (coop && !st.portal) {
        if (tpAt.current) beginPortal(tpAt.current, el);
        else if ([...remotes.current.values()].some((r) => hereIsle(r) && fresh(r, now))) beginPortal(el + 0.8, el);    // missed it: catch up
        else if (teamDone) beginPortal(el + PORTAL_S, el);
      }
      if (st.portal) portalStep(el, dt);
      if (st.sg === 1) return;
      // a friend already on a later island: on we go
      if (coop && !nextAt && !st.portal && [...remotes.current.values()].some((r) => (r.rd || 0) > round && fresh(r, now))) nextAt = now + 800;
      nextRef.current = nextAt;
      if (nextAt && now >= nextAt && !overRef.current) { nextAt = Infinity; advance(); }
      // everyone else, eased toward where they said they were
      const rs = [];
      for (const r of remotes.current.values()) {
        if (!here(r)) continue;
        const age = Math.min(0.15, (now - r.at) / 1000), d = r.d, kk = Math.min(1, dt * 12);
        d.x += (r.x + r.vx * age - d.x) * kk; d.y += (r.y + (r.g ? 0 : r.vy * age) - d.y) * kk; d.z += (r.z + r.vz * age - d.z) * kk;
        d.face += wrapA(r.f - d.face) * kk;
        rs.push({ id: r.id, name: r.name, col: r.col, x: d.x, y: d.y, z: d.z, face: d.face, speed: Math.hypot(r.vx, r.vz), onG: !!r.g, vy: r.vy, vx: r.vx, vz: r.vz, gliding: !!r.gl, inv: !!r.iv });
      }
      // the ropes, tail to tail down the line: mine from my run, a friend's
      // to the next friend from what that friend says (rp: prev / next tied)
      const ropes = [];
      if (coop) {
        const isFresh = (id) => id === myId || (remotes.current.get(id) && here(remotes.current.get(id)) && fresh(remotes.current.get(id), now));
        for (let i = 0; i + 1 < ids.length; i++) {
          const a = ids[i], b = ids[i + 1];
          if (!isFresh(a) || !isFresh(b)) continue;
          let on;
          if (a === myId || b === myId) on = !!ropeState(S, a === myId ? b : a);
          else on = !!(remotes.current.get(a).rp & 2);
          ropes.push({ a: a === myId ? "me" : a, b: b === myId ? "me" : b, on, len: LEASH,
            ca: a === myId ? myHue : remotes.current.get(a).col, cb: b === myId ? myHue : remotes.current.get(b).col });
        }
      }
      scene.frame({ S, team, remotes: rs, ropes, yaw: c.yaw, pitch: c.pitch, dt, T: el });
      // the compass: the next shard, or the temple
      const have = shardsHave(S, team);
      const next = have.size < SHARDS ? W.shards.find((s) => !have.has(s.i)) : W.temple;
      if (next && arrowRef.current) {
        const dx = next.x - P.x, dz = next.z - P.z;
        const fAng = Math.atan2(-Math.sin(c.yaw), -Math.cos(c.yaw)), dAng = Math.atan2(dx, dz);
        arrowRef.current.style.transform = `rotate(${(-(dAng - fAng) * 180) / Math.PI}deg)`;
      }
      // the room: where I am
      if (socket && roomCode && !overRef.current && now - sent > SEND_MS) {
        sent = now;
        socket.emit("isl:pos", { code: roomCode, rd: round, sg: 0, x: r2(P.x), y: r2(P.y), z: r2(P.z), f: r2(P.face), vx: r2(P.vx), vy: r2(P.vy), vz: r2(P.vz),
          g: P.onG ? 1 : 0, gl: P.gliding ? 1 : 0, iv: P.inv > 0 ? 1 : 0, hp: P.hp,
          rp: coop ? tiedTo(ids, myId).reduce((m, id) => m | (ropeState(S, id) ? (id < myId ? 1 : 2) : 0), 0) : 0,
          sh: bits(S.shards), p: S.maxPath, fin: S.homeIn != null ? Math.round(S.homeIn * 10) / 10 : null });
      }
      if (now - lastHud > 120) {
        lastHud = now;
        if (!overRef.current) setScore(curScore());
        const dist = next ? Math.round(Math.hypot(next.x - P.x, next.z - P.z)) : 0;
        const dy = next ? Math.round((have.size < SHARDS ? next.y : next.y + 1) - P.y) : 0;
        const compass = next ? `${have.size < SHARDS ? `Sunshard ${next.i + 1}` : "Sky Temple"} · ${dist} m${Math.abs(dy) > 3 ? (dy > 0 ? " ↑" : " ↓") : ""}` : "";
        const me = { id: myId, name: "You", col: null, rd: round, sg: 0, sh: S.shards.size, p: S.maxPath, fin: S.finished ? el : null, me: true };
        setHud({ sg: 0, hp: P.hp, mh: 3, have: have.size, haveSet: [...have], compass, raceT: Math.max(0, el - START_S), rank: ranked([me, ...[...remotes.current.values()].map(remoteRow)]),
          count: round === 0 && el < START_S + 1 ? el : null, finished: S.finished, teamDone, mine: S.shards.size, portal: !!st.portal,
          next: nextAt && nextAt !== Infinity ? Math.max(1, Math.ceil((nextAt - now) / 1000)) : 0 });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      A.play(false);
      try { host.removeChild(scene.canvas); } catch { /* gone */ }
      scene.dispose();
      sceneRef.current = null;
      delete window.__ss;
    };
  }, [THREE, isSpectator, W, round, socket, roomCode, coop, myId, durationSeconds, setScore, say, shout, mySlot]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the watcher's loop: their island, drawn from their frames ──────────────
  // The world runs here on the match clock (watchStep); the explorer and the
  // camera are eased toward the latest frame, carried on by its speed for the
  // moment since. On the isle the creatures and the boss come in the frame
  // too, eased the same way. Nothing is sent, and no sound.
  useEffect(() => {
    if (!THREE || !isSpectator || !hostRef.current) return undefined;
    const wid = Number(watchId), wSlot = Math.max(0, seated.findIndex((p) => p.id === wid)), wHue = HUES[wSlot % HUES.length];
    const wName = seated.find((p) => p.id === wid)?.name || spectatorWatching?.username || "Player";
    let scene;
    try {
      scene = createScene(THREE, W, { color: wHue });
    } catch (e) { setNoGl(true); return undefined; }
    sceneRef.current = scene;
    const host = hostRef.current;
    host.insertBefore(scene.canvas, host.firstChild);
    scene.canvas.className = "ss-canvas";
    scene.resize(size.current.w, size.current.h);
    const S = run.current, fx = scene.fx, v = { yaw: 0, pitch: 0.42 }, off = isleOff(W);
    let raf, last = performance.now(), lastHud = 0, seenAt = 0, prev = null, prevI = null, snap = true, sizeW = 0, sizeH = 0;
    let isle = null, WI = null, S2 = null;
    const here = (r) => (r.rd || 0) === round && !r.sg;
    const hereIsle = (r) => (r.rd || 0) === round && r.sg === 1;
    const teamOfFrame = (f) => (coop ? fromBits(f.tm) : null);
    // a new frame: the run's state as theirs, and their moments as effects
    const apply = (f) => {
      const had = prev ? shardsHave({ shards: fromBits(prev.sh) }, teamOfFrame(prev)) : null;
      S.shards = fromBits(f.sh);
      const have = shardsHave(S, teamOfFrame(f));
      if (had && have.size > had.size) {
        const s = W.shards.find((x) => have.has(x.i) && !had.has(x.i));
        if (s) { fx.ring(s.x, s.y, s.z, s.col, 7); fx.burst(s.x, s.y, s.z, 50, s.col, 9, 5); }
        shout(`Sunshard ${have.size} / ${SHARDS}`, have.size < SHARDS ? `Next: ${ZONES[Math.min(have.size, SHARDS - 1)].name}` : "The temple gate is open!");
      }
      S.gateOpen = !!f.go;
      if (Math.abs(S.gateT - f.gt) > 0.2) S.gateT = f.gt;
      if (f.fin && prev && !prev.fin && W.temple) {
        for (let i = 0; i < 5; i++) timers.current.push(setTimeout(() => fx.burst(W.temple.x, W.temple.y + 1.5, W.temple.z, 40, [0xffe28a, 0x7fe3ff, 0xff7a4a, 0x6dff9c, 0xffffff][i], 8, 6), i * 220));
        shout("Temple lit!", `${wName} did it — a portal opens…`);
      }
      S.finished = !!f.fin;
      S.zone = f.zn;
      if ((f.fl || []).length !== S.flags.size) S.flags = new Set(f.fl);
      for (const i of f.dead || []) killSlime(S, i);
      // a stone mid-crumble that isn't here yet: crumbling, or (fallen) gone till it grows back
      const cr = f.cr || [];
      for (let k = 0; k + 1 < cr.length; k += 2) {
        const q = S.plats[cr[k]];
        if (!q || q.state) continue;
        if (cr[k + 1] === 1) crumbleAt(S, W, cr[k]); else Object.assign(q, { state: 3, t: 0, solid: false });
      }
      if (prev) {
        if (f.hp < prev.hp) { fx.shake(0.5); fx.burst(f.x, f.y + 0.6, f.z, 14, 0xff6a6a, 5, 2); setFlash((n) => n + 1); }
        if (Math.hypot(f.x - prev.x, f.y - prev.y, f.z - prev.z) > 8) { snap = true; fx.burst(f.x, f.y + 0.5, f.z, 24, 0xffffff, 5, 3); }
        else if (f.j > prev.j && !f.g) {
          if (f.j >= 2) fx.ring(f.x, f.y + 0.1, f.z, 0xbff0ff, 2.8); else fx.burst(f.x, f.y + 0.1, f.z, 6, 0xffffff, 2, 0.5);
        } else if (f.g && !prev.g && prev.vy < -7) fx.burst(f.x, f.y + 0.1, f.z, 8, 0xdddddd, 2.6, 0.6);
      }
      S.pl.hp = f.hp; S.pl.jumps = f.j; S.pl.sq = f.sq;
      portalFx(!!f.tp, false);
      prev = f;
    };
    // the isle: the island's state as theirs; creatures and boss become targets
    const at = (x, y, z) => [x + off.x, y + off.y, z + off.z];
    const applyIsle = (f) => {
      const P = S2.pl, num = (x) => Number(x) || 0;
      const had = S2.shrines.size;
      S2.shrines = fromBits(num(f.sh), ISLE_SHRINES);
      if (prevI && S2.shrines.size > had) {
        const sh = WI.shrines.find((x) => S2.shrines.has(x.i) && !fromBits(num(prevI.sh), ISLE_SHRINES).has(x.i));
        if (sh) { fx.ring(...at(sh.x, sh.y + 1, sh.z), sh.col, 7); fx.burst(...at(sh.x, sh.y + 2, sh.z), 50, sh.col, 9, 5); }
        shout("Shrine lit!", `${S2.shrines.size} / ${ISLE_SHRINES}`);
      }
      if (S2.shrines.size >= ISLE_SHRINES) S2.gateOpen = true;
      S2.flags = fromBits(num(f.fl), 8); S2.zone = num(f.zn); S2.quest = num(f.q); S2.pipQ = num(f.pq); S2.pipK = num(f.pk);
      const b = Array.isArray(f.b) ? f.b : [], B = S2.boss, bst = SH.BOSS_STATES[num(b[0])] || "sleep";
      if (bst === "dead" && B.state !== "dead" && prevI) {
        for (let i = 0; i < 5; i++) timers.current.push(setTimeout(() => fx.burst(...at(B.x, B.y + 4, B.z), 50, [0xffe28a, 0x7fe3ff, 0xff7a4a, 0x6dff9c, 0xffffff][i], 9, 7), i * 220));
        shout("Sunhaven is saved!", `${wName} beat the Shade Colossus`);
      }
      Object.assign(B, { state: bst, sub: num(b[1]), hp: num(b[2]), stunned: !!b[3], tele: num(b[4]), ringR: num(b[5]), nface: num(b[6]), idx: num(b[7]), orbs: [] });
      for (let k = 8; k + 1 < b.length && B.orbs.length < 4; k += 2) B.orbs.push({ x: num(b[k]), z: num(b[k + 1]) });
      // creatures: the ones in the frame are alive, heading where it says
      const sl = Array.isArray(f.s) ? f.s : [], alive = new Set();
      for (let k = 0; k + 3 < sl.length; k += 4) {
        const s = S2.slimes[num(sl[k])];
        if (!s) continue;
        alive.add(s.i);
        Object.assign(s, { nx: num(sl[k + 1]), nz: num(sl[k + 2]), ny: num(sl[k + 3]) });
        if (!s.alive || s.x === undefined) Object.assign(s, { alive: true, x: s.nx, z: s.nz, y: s.ny });
      }
      for (const s of S2.slimes) if (s.alive && !alive.has(s.i)) { s.alive = false; if (prevI) fx.burst(...at(s.x, s.y + 0.5, s.z), 16, 0x6fe08a, 4, 4); }
      const wl = Array.isArray(f.w) ? f.w : [], wAlive = new Set();
      for (let k = 0; k + 5 < wl.length; k += 6) {
        const i = num(wl[k]);
        let w = S2.wisps.find((q) => q.i === i);
        if (!w) { w = { i, x: num(wl[k + 1]), y: num(wl[k + 2]), z: num(wl[k + 3]), ph: (i * 2.399) % 6, t: 0, alive: true, st: 0, boss: !!wl[k + 5] }; S2.wisps.push(w); }
        wAlive.add(i);
        Object.assign(w, { alive: true, nx: num(wl[k + 1]), ny: num(wl[k + 2]), nz: num(wl[k + 3]), st: num(wl[k + 4]) });
      }
      for (const w of S2.wisps) if (w.alive && !wAlive.has(w.i)) { w.alive = false; if (prevI) fx.burst(...at(w.x, w.y, w.z), 16, 0xff9a4a, 4, 4); }
      const pu = Array.isArray(f.pu) ? f.pu : [];
      S2.pickups = [];
      for (let k = 0; k + 2 < pu.length; k += 3) S2.pickups.push({ x: num(pu[k]), y: num(pu[k + 1]), z: num(pu[k + 2]), t: 0 });
      // the lily pads mid-crumble
      const cr = Array.isArray(f.cr) ? f.cr : [], crumbling = new Map();
      for (let k = 0; k + 1 < cr.length; k += 2) crumbling.set(num(cr[k]), num(cr[k + 1]));
      S2.plats.forEach((q, i) => { const s = crumbling.get(i) || 0; q.shake = s === 1 ? 1 : 0; q.state = s >= 2 ? 3 : 0; });
      if (prevI) {
        if (f.hp < prevI.hp) { fx.shake(0.5); fx.burst(...at(f.x, f.y + 0.6, f.z), 14, 0xff6a6a, 5, 2); setFlash((n) => n + 1); }
        if (Math.hypot(f.x - prevI.x, f.y - prevI.y, f.z - prevI.z) > 8) { snap = true; fx.burst(...at(f.x, f.y + 0.5, f.z), 24, 0xffffff, 5, 3); }
        else if (f.j > prevI.j && !f.g) {
          if (f.j >= 2) fx.ring(...at(f.x, f.y + 0.1, f.z), 0xbff0ff, 2.8); else fx.burst(...at(f.x, f.y + 0.1, f.z), 6, 0xffffff, 2, 0.5);
        }
      }
      P.hp = f.hp; P.jumps = f.j; P.sq = f.sq;
      prevI = f;
    };
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) { last = now; return; }
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = Math.max(last, now);
      const el = (now - anchor.current) / 1000;
      if (size.current.w !== sizeW || size.current.h !== sizeH) { sizeW = size.current.w; sizeH = size.current.h; scene.resize(sizeW, sizeH); }
      const L = spec.current;
      // nothing yet — or their next island is on its way (onFrame moves us there)
      if (!L || !L.f || (Number(L.f.rd) || 0) !== round) return;
      const f = L.f, onI = f.sg === 1;
      if (onI && !isle) {
        // through the portal: build their isle, here too
        WI = isleWorld(round); S2 = SH.newRun(WI); S2.ai = false;
        isle = scene.createIsle(WI, off); isle.show(true);
        portalFx(false, false); snap = true;
        shout("Sunhaven Isle", `${wName} is through the portal`);
      }
      if (L.at !== seenAt) { seenAt = L.at; if (onI) applyIsle(f); else apply(f); }
      const P = onI ? S2.pl : S.pl;
      // the explorer: toward the frame, carried on by its speed (0.15 s at most)
      const age = Math.min(0.15, (now - L.at) / 1000);
      const tx = f.x + f.vx * age, ty = f.y + (f.g ? 0 : f.vy * age), tz = f.z + f.vz * age;
      if (snap) { snap = false; Object.assign(P, { x: tx, y: ty, z: tz, face: f.f }); v.yaw = f.yw; v.pitch = f.pt; }
      const k = Math.min(1, dt * 12), kc = Math.min(1, dt * 10);
      P.x += (tx - P.x) * k; P.y += (ty - P.y) * k; P.z += (tz - P.z) * k;
      P.face += wrapA(f.f - P.face) * k;
      Object.assign(P, { vx: f.vx, vy: f.vy, vz: f.vz, onG: !!f.g, gliding: !!f.gl, inv: f.iv ? 1 : 0, speed: Math.hypot(f.vx, f.vz) });
      v.yaw += wrapA(f.yw - v.yaw) * kc; v.pitch += (f.pt - v.pitch) * kc;
      // everyone else here (never the one watched: that's the explorer)
      const rs = [], isHere = onI ? hereIsle : here;
      for (const r of remotes.current.values()) {
        if (r.id === wid || !isHere(r)) continue;
        const ag = Math.min(0.15, (now - r.at) / 1000), d = r.d;
        d.x += (r.x + r.vx * ag - d.x) * k; d.y += (r.y + (r.g ? 0 : r.vy * ag) - d.y) * k; d.z += (r.z + r.vz * ag - d.z) * k;
        d.face += wrapA(r.f - d.face) * k;
        rs.push({ id: r.id, name: r.name, col: r.col, x: d.x, y: d.y, z: d.z, face: d.face, speed: Math.hypot(r.vx, r.vz), onG: !!r.g, vy: r.vy, vx: r.vx, vz: r.vz, gliding: !!r.gl, inv: !!r.iv });
      }
      // the ropes as they see them: theirs from the frame, the rest from the room
      const ropes = [];
      if (coop) {
        const chain = seatedRef.current.map((p) => p.id), rem = (id) => remotes.current.get(id);
        const isFresh = (id) => id === wid || (rem(id) && isHere(rem(id)) && fresh(rem(id), now));
        for (let i = 0; i + 1 < chain.length; i++) {
          const a = chain[i], b = chain[i + 1];
          if (!isFresh(a) || !isFresh(b)) continue;
          const on = a === wid ? !!(f.rp & 2) : b === wid ? !!(f.rp & 1) : !!(rem(a).rp & 2);
          ropes.push({ a: a === wid ? "me" : a, b: b === wid ? "me" : b, on, len: LEASH,
            ca: a === wid ? wHue : rem(a).col, cb: b === wid ? wHue : rem(b).col });
        }
      }
      if (onI) {
        // the creatures and the boss, eased toward the frame
        S2.T = el;
        if (S2.gateOpen) S2.gateT = Math.min(1, S2.gateT + dt * 0.5);
        for (const s of S2.slimes) if (s.alive && s.nx !== undefined) { s.t = el + s.ph; s.x += (s.nx - s.x) * kc; s.z += (s.nz - s.z) * kc; s.y += (s.ny - s.y) * kc; if (Math.hypot(s.nx - s.x, s.nz - s.z) > 0.02) s.dir = Math.atan2(s.nx - s.x, s.nz - s.z); }
        for (const w of S2.wisps) if (w.alive && w.nx !== undefined) { w.t = el + (w.ph || 0); w.x += (w.nx - w.x) * kc; w.y += (w.ny - w.y) * kc; w.z += (w.nz - w.z) * kc; }
        const B = S2.boss;
        if (B.nface !== undefined) B.face += wrapA(B.nface - B.face) * kc;
        isle.frame({ S: S2, remotes: rs, ropes, yaw: v.yaw, pitch: v.pitch, dt, T: el });
        const o = SH.objective(S2, WI);
        if (o && arrowRef.current) {
          const fAng = Math.atan2(-Math.sin(v.yaw), -Math.cos(v.yaw)), dAng = Math.atan2(o.x - P.x, o.z - P.z);
          arrowRef.current.style.transform = `rotate(${(-(dAng - fAng) * 180) / Math.PI}deg)`;
        }
        if (now - lastHud > 120) {
          lastHud = now;
          paintMaps(S2, WI, now, wid);
          const me = { id: wid, name: wName, col: wHue, rd: round, sg: 1, sh: S2.shrines.size, p: 0, fin: null, me: true };
          setHud({ ...isleHud(S2, WI, Number(f.mh) || 3), raceT: Math.max(0, el - START_S), rank: ranked([me, ...[...remotes.current.values()].filter((r) => r.id !== wid).map(remoteRow)]),
            count: null, teamDone: !!f.td, mine: S2.shrines.size, done: S2.boss.state === "dead", next: f.nx || 0, sc: f.sc, isleT: 0 });
        }
        return;
      }
      S.T = el - dt;
      watchStep(S, W, dt);
      const team = teamOfFrame(f);
      // stomps on this island
      for (const m of momentsRef.current.splice(0)) { const sl = S.slimes[m.i]; if (sl) fx.burst(sl.x, sl.y + 0.5, sl.z, 22, 0x6fe08a, 5, 3); }
      scene.frame({ S, team, remotes: rs, ropes, yaw: v.yaw, pitch: v.pitch, dt, T: el });
      // the compass, as theirs
      const have = shardsHave(S, team);
      const next = have.size < SHARDS ? W.shards.find((s) => !have.has(s.i)) : W.temple;
      if (next && arrowRef.current) {
        const fAng = Math.atan2(-Math.sin(v.yaw), -Math.cos(v.yaw)), dAng = Math.atan2(next.x - P.x, next.z - P.z);
        arrowRef.current.style.transform = `rotate(${(-(dAng - fAng) * 180) / Math.PI}deg)`;
      }
      if (now - lastHud > 120) {
        lastHud = now;
        const dist = next ? Math.round(Math.hypot(next.x - P.x, next.z - P.z)) : 0;
        const dy = next ? Math.round((have.size < SHARDS ? next.y : next.y + 1) - P.y) : 0;
        const compass = next ? `${have.size < SHARDS ? `Sunshard ${next.i + 1}` : "Sky Temple"} · ${dist} m${Math.abs(dy) > 3 ? (dy > 0 ? " ↑" : " ↓") : ""}` : "";
        const wr = remotes.current.get(wid);
        const me = { id: wid, name: wName, col: wHue, rd: round, sg: 0, sh: S.shards.size, p: f.p || 0, fin: f.fin ? (wr && wr.fin != null ? wr.fin : 0) : null, me: true };
        setHud({ sg: 0, hp: f.hp, mh: 3, have: have.size, haveSet: [...have], compass, raceT: Math.max(0, el - START_S), rank: ranked([me, ...[...remotes.current.values()].filter((r) => r.id !== wid).map(remoteRow)]),
          count: round === 0 && el < START_S + 1 ? el : null, finished: !!f.fin, teamDone: !!f.td, mine: S.shards.size, next: f.nx || 0, sc: f.sc, portal: !!f.tp });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      try { host.removeChild(scene.canvas); } catch { /* gone */ }
      scene.dispose();
      sceneRef.current = null;
    };
  }, [THREE, isSpectator, W, round, coop, watchId, seated, shout]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the screen ─────────────────────────────────────────────────────────────
  const count = hud.count;
  const best = isSpectator ? 0 : (() => { try { return Number(localStorage.getItem("sunshard-best-" + W.code)) || 0; } catch { return 0; } })();
  const press = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ } fn(); };
  const mates = coop ? T.all(Object.fromEntries([[myId, hud.mine || 0], ...[...remotes.current.values()].map((r) => [r.id, fromBits(r.sh || 0).size])])) : [];
  const isleOn = hud.sg === 1;
  const hearts = isleOn ? hud.mh || 3 : 3;

  return (
    <>
      <GameFrame
        gameName="Sunshard Jump" badge="🏝️ SUNSHARD JUMP"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={isSpectator ? [{ label: "Score", value: Number(hud.sc ?? spectatorWatching?.score ?? 0).toLocaleString() }] : []}
        timer={durationSeconds ? { value: eng.timeLeft, max: durationSeconds } : null}
        opponents={Object.values(eng.opponents)}
        teams={eng.teams}
        onQuit={eng.endMatch}
        landscape
        bare
        floatExtra={!isSpectator ? (
          <button type="button" className="gf-btn" aria-label={muted ? "Sound on" : "Sound off"} aria-pressed={muted}
            onClick={() => { audio.current.init(); setMuted((m) => !m); }}>{muted ? "✕ ♪" : "♪"}</button>
        ) : null}
      >
        {({ w, h }) => {
          size.current = { w, h };
          // a watcher's hands do nothing: no pad, no stick, no jump
          const pad = isSpectator ? {} : { onPointerDown: padDown, onPointerMove: padMove, onPointerUp: padUp, onPointerCancel: padUp, onLostPointerCapture: padUp };
          const bigS = Math.max(160, Math.min(300, h - 70));
          return (
            <div className={`ss-stage${touchUi && !isSpectator ? " touch" : ""}${isleOn ? " isle" : ""}`} ref={hostRef} style={{ width: w, height: h }}
              {...pad} onContextMenu={(e) => e.preventDefault()}>
              {!THREE && !noGl && <div className="ss-loading">Loading the islands…</div>}
              {isSpectator && THREE && !noGl && !specOn && <div className="ss-loading">Connecting to {spectatorWatching?.username || "their"}’s island…</div>}
              {noGl && <div className="ss-loading">This game needs WebGL. Try another browser, or turn on hardware acceleration.</div>}
              <div className="ss-hud">
                <div className="ss-hearts" aria-label={`${hud.hp} hearts`}>{Array.from({ length: hearts }, (_, i) => <i key={i} className={i < hud.hp ? "" : "off"}>♥</i>)}</div>
                <div className="ss-mid">
                  {isleOn ? (
                    <div className="ss-shards" aria-label={`${hud.have} of ${ISLE_SHRINES} shrines lit`}>
                      {SHRINE_HEX.map((c, i) => <i key={i} className={hud.haveSet.includes(i) ? "on" : ""} style={{ "--c": c }} />)}
                    </div>
                  ) : (
                    <div className="ss-shards" aria-label={`${hud.have} of ${SHARDS} Sunshards`}>
                      {ZONES.map((z, i) => <i key={i} className={hud.haveSet.includes(i) ? "on" : ""} style={{ "--c": ZONE_HEX[i] }} />)}
                    </div>
                  )}
                  <div className="ss-compass"><span className="ss-arrow" ref={arrowRef}><b /></span><span>{hud.compass}</span></div>
                </div>
                <div className="ss-stats">🏝️ {round + 1}{isleOn ? " ☀" : ""}
                  <small>{isleOn ? `${fmt(hud.isleT || 0)}${!coop && !isSpectator ? ` · ${(hud.pts || 0).toLocaleString()} pts` : ""}` : `${fmt(hud.raceT)}${best ? ` · best ${fmt(best)}` : ""}`}</small>
                </div>
                {hud.rank.length > 1 && !coop && (
                  <ol className="ss-rank" aria-label="The race">
                    {hud.rank.map((r, i) => (
                      <li key={r.id} className={r.me ? "me" : ""}>
                        <b>{i + 1}</b>
                        <span style={r.col != null ? { color: hex(r.col) } : undefined}>{r.name}</span>
                        <em>{r.rd ? `🏝️${r.rd + 1} ` : ""}{r.sg ? `☀${r.sh}` : r.fin != null ? "🏁" : `◆${r.sh}`}</em>
                      </li>
                    ))}
                  </ol>
                )}
                {isleOn && hud.quest && <div className="ss-quest">{hud.quest}</div>}
                {isleOn && hud.boss != null && (
                  <div className="ss-boss">Shade Colossus<div><i style={{ width: `${Math.round(hud.boss * 100)}%` }} /></div></div>
                )}
                {isleOn && hud.dlg && !isSpectator && (
                  <div className="ss-dlg"><b>{hud.dlg.name}</b><span>{hud.dlg.line}</span><em>tap to continue ▸</em></div>
                )}
                {banner && <div key={banner.n} className="ss-banner">{banner.title}{banner.sub && <small>{banner.sub}</small>}</div>}
                {toast && <div className="ss-toast">{toast.text}</div>}
                <div key={flash} className={`ss-flash${flash ? " on" : ""}`} />
                {count !== null && count !== undefined && (
                  <div className="ss-count">{count >= START_S ? "GO!" : String(START_S - Math.floor(count))}</div>
                )}
                {!isleOn && hud.portal && !eng.gameOver && (
                  <div className="ss-done">{coop ? `🏆 The temple is lit — ${isSpectator ? "their" : "your"} team did it!` : "🏁 Temple lit!"}<small>A portal to Sunhaven Isle is opening…</small></div>
                )}
                {!isleOn && !hud.portal && hud.next > 0 && !eng.gameOver && (
                  <div className="ss-done">🏝️ Your friends are on the next island<small>Off you go in {hud.next}…</small></div>
                )}
                {isleOn && hud.done && !eng.gameOver && (
                  <div className="ss-done">{coop ? `🏆 Sunhaven saved — ${isSpectator ? "their" : "your"} team did it!` : "🏆 Sunhaven saved!"}{hud.next > 0 && <small>Next island in {hud.next}…</small>}</div>
                )}
              </div>
              {isleOn && (
                <canvas className="ss-mmap" ref={mmRef} width={100} height={100} aria-label="Map"
                  onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); if (!isSpectator) { setMapNote("Tap a white flag to travel there · tap outside to close"); setBigMap(true); } }} />
              )}
              {isleOn && bigMap && !isSpectator && (
                <div className="ss-bigmap" onPointerDown={bigDown}>
                  <div><canvas ref={bigRef} width={300} height={300} style={{ width: bigS, height: bigS }} /><small>{mapNote}</small></div>
                </div>
              )}
              {touchUi && !isSpectator && (
                <>
                  <div className="ss-stick" aria-hidden="true"><div className="ss-knob" ref={knobRef} /></div>
                  <button type="button" className="ss-btn ss-jump" aria-label="Jump (hold to glide)"
                    onPointerDown={press(doJump)} onPointerUp={relJump} onPointerCancel={relJump}
                    onLostPointerCapture={relJump}>JUMP</button>
                  {isleOn && (
                    <button type="button" className={`ss-btn ss-act${hud.actTalk ? " talk" : ""}${hud.actCd ? " cd" : ""}`} aria-label="Talk, light or sun pulse"
                      onPointerDown={press(doAction)}>{hud.act || "—"}</button>
                  )}
                  {isleOn && hud.dash && (
                    <button type="button" className={`ss-btn ss-dash${hud.dashCd ? " cd" : ""}`} aria-label="Air dash" onPointerDown={press(doDash)}>DASH</button>
                  )}
                </>
              )}
              <div className="ss-tpv" ref={tpvRef} aria-hidden="true"><i /><b /></div>
              <div className="ss-tpf" ref={tpfRef} aria-hidden="true" />
            </div>
          );
        }}
      </GameFrame>
      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`${round ? `${plural(round, "island")} lit · ` : ""}${savedN.current ? `Sunhaven saved${savedN.current > 1 ? ` ×${savedN.current}` : ""} · ` : ""}${run.current.finished ? `Home in ${fmt(run.current.homeIn || 0)}` : `${plural(hud.sg ? 0 : hud.have, "shard")}`}${best ? ` · best ${fmt(best)}` : ""}`}
          together={coop ? { reached: teamDoneRef.current, goal: savedN.current ? "Sunhaven saved" : "light the Sky Temple", unit: "shards", mates } : null} />
      )}
    </>
  );
}
