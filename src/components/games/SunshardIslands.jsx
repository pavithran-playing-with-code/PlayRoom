// src/components/games/SunshardIslands.jsx
// Sunshard Islands: a third-person 3D platformer. Hop across floating
// islands, collect the 5 Sunshards (one at the end of each zone) and bring
// them to the Sky Temple. Falling never kills you — you're back at the last
// flag — so it stays fun.
//
// Everyone in a room plays the same islands (sunshardWorld.js, from the
// room's seed). Each phone runs its own explorer (sunshardSim.js) and tells
// the room where it is ~10 times a second (isl:pos, relayed by
// config/socket.js); everyone else's explorer is drawn from that, eased
// between reports, in their own colour with their name over them. Explorers
// pass through each other.
//
//   Race (a normal room): shards and gems are your own. First to light the
//   temple wins; if the clock runs out first, whoever got furthest (score).
//   Together (a co-op room): one shard count for the side — any of you can
//   take a shard for everyone, the gate opens at five between you, and when
//   one of you gets home you all win. And you're tied tail to tail in seat
//   order (a conga line, sunshardSim.js tether): wander off and you tug each
//   other back; the rope snaps if one of you falls behind, and ties again
//   when you meet up.
//
// The drawing is sunshardScene.js (three.js r128, loaded only when this game
// opens). A landscape game, full screen (GameFrame bare): held upright the
// whole frame is drawn turned, and every touch is turned back (toGame).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { useSocket } from "../../utils/SocketContext";
import { useUprightTouch, toGame } from "../horror/LandscapeGate";
import { team as teamOf, plural } from "./coopTeam";
import { buildWorld, levelCode, ZONES, SHARDS, clamp } from "./sunshardWorld.js";
import { newRun, step, pressJump, releaseJump, spin, respawn, score, shardsHave, tether, tiedTo, ropeState, LEASH } from "./sunshardSim.js";
import { MATE, createScene } from "./sunshardScene";

const START_S = 3;
// everyone's colour, by seat (user id order) — the same on every phone
const HUES = [0xff7a4d, ...MATE];
const SEND_MS = 100;
const ZONE_HEX = ZONES.map((z) => "#" + z.col.toString(16).padStart(6, "0"));
const fmt = (t) => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + String(s).padStart(2, "0"); };
const bits = (set) => [...set].reduce((m, i) => m | (1 << i), 0);
const fromBits = (m) => { const s = new Set(); for (let i = 0; i < SHARDS; i++) if (m & (1 << i)) s.add(i); return s; };

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
    gem: (n) => tone(880 + Math.min(n, 8) * 70, 0.14, "triangle", 0.12),
    shard: () => seq([523, 659, 784, 1046, 1318], 90, 0.4, 0.14),
    hurt: () => tone(240, 0.3, "sawtooth", 0.14, 70), stomp: () => tone(320, 0.16, "square", 0.1, 140), spring: () => tone(260, 0.28, "sine", 0.16, 1000),
    spin: () => tone(220, 0.2, "sawtooth", 0.07, 110), flag: () => seq([660, 880], 110, 0.25, 0.12), crumble: () => tone(90, 0.3, "sawtooth", 0.08, 40),
    tie: () => seq([660, 990], 90, 0.2, 0.1), snap: () => tone(900, 0.25, "square", 0.09, 160),
    win: () => seq([523, 659, 784, 1046, 784, 1046, 1318], 150, 0.45, 0.15), beep: (hi) => tone(hi ? 880 : 440, hi ? 0.45 : 0.18, "square", 0.12),
  };
  return {
    init, sfx,
    play(on) { playing = on; },
    mute(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    close() { clearInterval(music); try { if (AC) AC.close(); } catch { /* gone */ } AC = null; },
  };
}

export default function SunshardIslands(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 300,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null, mode } = props;
  const coop = mode === "coop" && !!roomCode;
  const myId = Number(currentUser?.id);
  const { socket } = useSocket() || {};
  const W = useMemo(() => buildWorld(levelCode(seed)), [seed]);
  const T = useMemo(() => teamOf(players, myId), [players, myId]);
  const seated = useMemo(() => (players || []).filter((p) => !p.is_spectator).map((p) => ({ id: Number(p.user_id), name: p.username })).sort((a, b) => a.id - b.id), [players]);
  const mySlot = Math.max(0, seated.findIndex((p) => p.id === myId));
  const seatedRef = useRef(seated);
  seatedRef.current = seated;

  // the run lives in a ref: the loop changes it every frame
  const run = useRef(null);
  if (run.current === null) run.current = newRun(W);
  const remotes = useRef(new Map());          // id -> { latest report, eased pose }
  const teamDoneRef = useRef(false);
  const agreedTeam = () => {
    // together: the side's shards — mine plus every friend's
    if (!coop) return null;
    const s = new Set(run.current.shards);
    for (const r of remotes.current.values()) for (const i of fromBits(r.sh)) s.add(i);
    return s;
  };

  const eng = useGameEngine({
    roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: () => ({ pairs_matched: coop ? (teamDoneRef.current ? 1 : 0) : (run.current.finished ? 1 : 0) }),
  });
  const { setScore } = eng;
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);
  const anchor = useRef(null);
  if (anchor.current === null) {
    let gone = 0;
    if (startedAt && serverNow) { const g = (new Date(serverNow).getTime() - new Date(startedAt).getTime()) / 1000; if (Number.isFinite(g)) gone = clamp(g, 0, durationSeconds); }
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
  const doJump = useCallback(() => { audio.current.init(); if (live(elapsed())) pressJump(run.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const doSpin = useCallback(() => {
    audio.current.init();
    if (!live(elapsed())) return;
    if (spin(run.current)) { audio.current.sfx.spin(); const P = run.current.pl; sceneRef.current && sceneRef.current.fx.ring(P.x, P.y + 0.4, P.z, 0xffe28a, 3.6); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isSpectator) return undefined;
    const dn = (e) => {
      const c = e.code;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(c)) e.preventDefault();
      if (e.repeat) return;
      keys.current[c] = true;
      audio.current.init();
      if (c === "Space") doJump();
      if (c === "KeyF" || c === "KeyK" || c === "KeyJ") doSpin();
      if (c === "KeyM") setMuted((m) => !m);
      if (c === "KeyR" && live(elapsed())) { respawn(run.current); }
    };
    const up = (e) => { keys.current[e.code] = false; if (e.code === "Space") releaseJump(run.current); };
    const blur = () => { keys.current = {}; releaseJump(run.current); joy.current = { x: 0, y: 0 }; };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [isSpectator, doJump, doSpin]); // eslint-disable-line react-hooks/exhaustive-deps

  // the joystick: its middle and the finger, both turned into the game's frame
  const stickRef = useRef(null), knobRef = useRef(null), stickId = useRef(null), stickC = useRef({ x: 0, y: 0 });
  const stickMove = (e) => {
    const p = toGame(e, rot.current), c = stickC.current;
    let dx = p.x - c.x, dy = p.y - c.y;
    const l = Math.hypot(dx, dy), m = 46;
    if (l > m) { dx *= m / l; dy *= m / l; }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px,${dy}px)`;
    joy.current = { x: dx / m, y: dy / m };
  };
  const stickDown = (e) => {
    e.preventDefault(); e.stopPropagation();
    audio.current.init();
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
  // drag anywhere else: turn the camera
  const drag = useRef(null);
  const padDown = (e) => {
    audio.current.init();
    if (e.pointerType === "touch" && !touchUi) setTouchUi(true);
    if (e.target.closest && e.target.closest(".ss-btn, .ss-stick, .gf-float")) return;
    const p = toGame(e, rot.current);
    drag.current = { id: e.pointerId, x: p.x, y: p.y };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const padMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = toGame(e, rot.current);
    cam.current.yaw -= (p.x - d.x) * 0.006;
    cam.current.pitch = clamp(cam.current.pitch + (p.y - d.y) * 0.004, -0.05, 1.3);
    d.x = p.x; d.y = p.y;
  };
  const padUp = (e) => { if (drag.current && drag.current.id === e.pointerId) drag.current = null; };

  // ── everyone else, from the room ───────────────────────────────────────────
  const toastRef = useRef(null);
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
      if (r.fin == null && m.fin != null) {
        const who = r.name;
        if (toastRef.current) toastRef.current(coop ? `🏆 ${who} lit the temple — you all win!` : `🏁 ${who} lit the temple!`, 3500);
      }
      Object.assign(r, m, { at: performance.now() });
    };
    socket.on("isl:pos", onPos);
    return () => socket.off("isl:pos", onPos);
  }, [socket, myId, seated, coop]);

  // ── the HUD, and the moments ───────────────────────────────────────────────
  const [hud, setHud] = useState({ hp: 3, have: 0, haveSet: [], gems: 0, compass: "", raceT: 0, rank: [], count: START_S, finished: false, teamDone: false });
  const [banner, setBanner] = useState(null);
  const [toast, setToast] = useState(null);
  const [flash, setFlash] = useState(0);
  const arrowRef = useRef(null);
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
    const host = hostRef.current;
    host.insertBefore(scene.canvas, host.firstChild);
    scene.canvas.className = "ss-canvas";
    scene.resize(size.current.w, size.current.h);
    const S = run.current, A = audio.current;
    // the camera starts behind you, looking at the first shard
    const s0 = W.shards[0];
    cam.current.yaw = Math.atan2(-(s0.x - S.pl.x), -(s0.z - S.pl.z));
    const myHue = HUES[mySlot % HUES.length], tiedOnce = new Set();
    let raf, last = performance.now(), sent = 0, lastHud = 0, beeped = -1, gemStreak = 0, gemT = 0, sizeW = 0, sizeH = 0, started = false;
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
      if (!go) { const n = Math.floor(el); if (n !== beeped && n >= 0) { beeped = n; A.sfx.beep(false); } }
      else if (!started) { started = true; A.sfx.beep(true); A.play(true); shout("Sunshard Islands", "Follow the golden arrow"); }
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
      const chain = seatedRef.current.map((p) => p.id);
      // together: the friends tied to me, where they are now (gone quiet: not held)
      const anchors = [];
      if (coop) for (const id of tiedTo(chain, myId)) {
        const r = remotes.current.get(id);
        if (r && now - r.at < 2500) anchors.push({ id, x: r.d.x, y: r.d.y, z: r.d.z });
      }
      for (let i = 0; i < 2; i++) {
        S.T = el - dt + (dt / 2) * i;
        const bx = S.pl.x, bz = S.pl.z;
        evs.push(...step(S, W, inp, dt / 2, team));
        if (anchors.length && go) evs.push(...tether(S, W, anchors, bx, bz, dt / 2));
      }
      const fx = scene.fx, P = S.pl;
      gemT -= dt; if (gemT <= 0) gemStreak = 0;
      const tiedNew = [], tiedAgain = [];       // tied to two at once: one toast
      for (const e of evs) {
        if (e.k === "jump") { A.sfx.jump(); fx.burst(P.x, P.y + 0.1, P.z, 6, 0xffffff, 2, 0.5); }
        else if (e.k === "dbl") { A.sfx.dbl(); fx.ring(P.x, P.y + 0.1, P.z, 0xbff0ff, 2.8); }
        else if (e.k === "land") { A.sfx.land(); fx.burst(P.x, P.y + 0.1, P.z, 8, 0xdddddd, 2.6, 0.6); }
        else if (e.k === "gem") { gemStreak++; gemT = 1.2; A.sfx.gem(gemStreak); fx.burst(e.x, e.y, e.z, 6, 0xffe066, 2.4, 1); }
        else if (e.k === "shard") {
          A.sfx.shard(); fx.ring(e.x, e.y, e.z, e.col, 7); fx.burst(e.x, e.y, e.z, 50, e.col, 9, 5); fx.shake(0.4);
          shout(`Sunshard ${e.count} / ${SHARDS}`, e.count < SHARDS ? `Next: ${ZONES[Math.min(e.count, SHARDS - 1)].name}` : "The temple gate is open!");
          sent = 0;                                          // tell the room at once
        } else if (e.k === "gate") say("Enter the glowing temple circle", 5000);
        else if (e.k === "hurt") { A.sfx.hurt(); fx.shake(0.5); fx.burst(P.x, P.y + 0.6, P.z, 14, 0xff6a6a, 5, 2); setFlash((f) => f + 1); }
        else if (e.k === "respawn") { say(e.ko ? "Oops! Back to the last flag." : "Back to the last flag", 1800); fx.burst(P.x, P.y + 0.5, P.z, 24, 0xffffff, 5, 3); }
        else if (e.k === "stomp") { A.sfx.stomp(); fx.burst(e.x, e.y + 0.5, e.z, 22, 0x6fe08a, 5, 3); }
        else if (e.k === "spring") { A.sfx.spring(); fx.ring(e.x, e.y + 0.6, e.z, 0xff9aa8, 3); fx.burst(P.x, P.y, P.z, 12, 0xff9aa8, 3, 2); }
        else if (e.k === "flag") { A.sfx.flag(); say("Checkpoint saved", 1800); const f = W.flags[e.f]; fx.burst(f.x, f.y + 2, f.z, 16, 0x9dff9d, 3, 2); }
        else if (e.k === "zone") shout(e.zone < 0 ? "Sky Meadow" : ZONES[e.zone].name, e.zone < 0 ? "Your journey starts here" : `Zone ${e.zone + 1} of ${SHARDS}`);
        else if (e.k === "crumble") A.sfx.crumble();
        else if (e.k === "tie" || e.k === "snap") {
          const who = remotes.current.get(e.id)?.name || "your friend";
          if (e.k === "snap") { A.sfx.snap(); fx.burst(P.x, P.y + 0.5, P.z, 10, 0xffe28a, 4, 2); say(`💥 Snap! Get back to ${who} to tie up again`, 2600); }
          else { A.sfx.tie(); (tiedOnce.has(e.id) ? tiedAgain : tiedNew).push(who); tiedOnce.add(e.id); }
          sent = 0;
        }
        else if (e.k === "win") {
          S.finishLeft = Math.max(0, durationSeconds - el);
          A.sfx.win();
          for (let i = 0; i < 5; i++) timers.current.push(setTimeout(() => fx.burst(W.temple.x, W.temple.y + 1.5, W.temple.z, 40, [0xffe28a, 0x7fe3ff, 0xff7a4a, 0x6dff9c, 0xffffff][i], 8, 6), i * 220));
          shout("Temple lit!", coop ? "Your team did it!" : `Home in ${fmt(el - START_S)}`);
          try {
            const key = "sunshard-best-" + W.code, b = Number(localStorage.getItem(key)) || 0, t = el - START_S;
            if (!b || t < b) localStorage.setItem(key, String(t));
          } catch { /* private */ }
          sent = 0;
        }
      }
      if (tiedNew.length || tiedAgain.length) {
        const both = (l) => l.join(" and ");
        say(tiedNew.length ? `🪢 Tied tail to tail with ${both(tiedNew)}` : `🪢 Tied to ${both(tiedAgain)} again`, 2400);
      }
      // together: somebody home means everybody home
      const teamDone = S.finished || (coop && [...remotes.current.values()].some((r) => r.fin != null));
      teamDoneRef.current = teamDone;
      // everyone else, eased toward where they said they were
      const rs = [];
      for (const r of remotes.current.values()) {
        const age = Math.min(0.15, (now - r.at) / 1000), d = r.d, kk = Math.min(1, dt * 12);
        d.x += (r.x + r.vx * age - d.x) * kk; d.y += (r.y + (r.g ? 0 : r.vy * age) - d.y) * kk; d.z += (r.z + r.vz * age - d.z) * kk;
        let df = r.f - d.face; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2; d.face += df * kk;
        rs.push({ id: r.id, name: r.name, col: r.col, x: d.x, y: d.y, z: d.z, face: d.face, speed: Math.hypot(r.vx, r.vz), onG: !!r.g, vy: r.vy, vx: r.vx, vz: r.vz, gliding: !!r.gl, atk: !!r.a, inv: !!r.iv });
      }
      // the ropes, tail to tail down the line: mine from my run, a friend's
      // to the next friend from what that friend says (rp: prev / next tied)
      const ropes = [];
      if (coop) {
        const fresh = (id) => id === myId || (remotes.current.get(id) && now - remotes.current.get(id).at < 2500);
        for (let i = 0; i + 1 < chain.length; i++) {
          const a = chain[i], b = chain[i + 1];
          if (!fresh(a) || !fresh(b)) continue;
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
        const r1 = (v) => Math.round(v * 100) / 100;
        socket.emit("isl:pos", { code: roomCode, x: r1(P.x), y: r1(P.y), z: r1(P.z), f: r1(P.face), vx: r1(P.vx), vy: r1(P.vy), vz: r1(P.vz),
          g: P.onG ? 1 : 0, gl: P.gliding ? 1 : 0, a: P.atk > 0 ? 1 : 0, iv: P.inv > 0 ? 1 : 0, hp: P.hp,
          rp: coop ? tiedTo(chain, myId).reduce((m, id) => m | (ropeState(S, id) ? (id < myId ? 1 : 2) : 0), 0) : 0,
          sh: bits(S.shards), gm: S.gemCount, p: S.maxPath, fin: S.finished ? Math.round((el - START_S) * 10) / 10 : null });
      }
      if (now - lastHud > 120) {
        lastHud = now;
        if (!overRef.current) setScore(score(S, W, team));
        const dist = next ? Math.round(Math.hypot(next.x - P.x, next.z - P.z)) : 0;
        const dy = next ? Math.round((have.size < SHARDS ? next.y : next.y + 1) - P.y) : 0;
        const compass = next ? `${have.size < SHARDS ? `Sunshard ${next.i + 1}` : "Sky Temple"} · ${dist} m${Math.abs(dy) > 3 ? (dy > 0 ? " ↑" : " ↓") : ""}` : "";
        // the ranking (race): home first, by time; then shards, then how far along
        const me = { id: myId, name: "You", col: null, sh: S.shards.size, p: S.maxPath, fin: S.finished ? el : null, me: true };
        const all = [me, ...[...remotes.current.values()].map((r) => ({ id: r.id, name: r.name, col: r.col, sh: fromBits(r.sh).size, p: r.p, fin: r.fin }))];
        all.sort((a, b) => (a.fin != null) !== (b.fin != null) ? (a.fin != null ? -1 : 1) : a.fin != null ? a.fin - b.fin : b.sh - a.sh || b.p - a.p);
        setHud({ hp: P.hp, have: have.size, haveSet: [...have], gems: S.gemCount, compass, raceT: Math.max(0, el - START_S), rank: all.slice(0, 5),
          count: el < START_S + 1 ? el : null, finished: S.finished, teamDone, mine: S.shards.size });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      A.play(false);
      try { host.removeChild(scene.canvas); } catch { /* gone */ }
      scene.dispose();
      sceneRef.current = null;
    };
  }, [THREE, isSpectator, W, socket, roomCode, coop, myId, durationSeconds, setScore, say, shout, mySlot]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the screen ─────────────────────────────────────────────────────────────
  const count = hud.count;
  const best = (() => { try { return Number(localStorage.getItem("sunshard-best-" + W.code)) || 0; } catch { return 0; } })();
  const press = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ } fn(); };
  const mates = coop ? T.all(Object.fromEntries([[myId, hud.mine || 0], ...[...remotes.current.values()].map((r) => [r.id, fromBits(r.sh).size])])) : [];

  return (
    <>
      <GameFrame
        gameName="Sunshard Islands" badge="🏝️ SUNSHARD ISLANDS"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={isSpectator ? [{ label: "Score", value: Number(spectatorWatching?.score ?? 0).toLocaleString() }] : []}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
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
          if (isSpectator) return <div className="muted">👀 Watching {spectatorWatching?.username} — {Number(spectatorWatching?.score ?? 0).toLocaleString()} pts</div>;
          size.current = { w, h };
          return (
            <div className={`ss-stage${touchUi ? " touch" : ""}`} ref={hostRef} style={{ width: w, height: h }}
              onPointerDown={padDown} onPointerMove={padMove} onPointerUp={padUp} onPointerCancel={padUp} onContextMenu={(e) => e.preventDefault()}>
              {!THREE && !noGl && <div className="ss-loading">Loading the islands…</div>}
              {noGl && <div className="ss-loading">This game needs WebGL. Try another browser, or turn on hardware acceleration.</div>}
              <div className="ss-hud">
                <div className="ss-hearts" aria-label={`${hud.hp} hearts`}>{[0, 1, 2].map((i) => <i key={i} className={i < hud.hp ? "" : "off"}>♥</i>)}</div>
                <div className="ss-mid">
                  <div className="ss-shards" aria-label={`${hud.have} of ${SHARDS} Sunshards`}>
                    {ZONES.map((z, i) => <i key={i} className={hud.haveSet.includes(i) ? "on" : ""} style={{ "--c": ZONE_HEX[i] }} />)}
                  </div>
                  <div className="ss-compass"><span className="ss-arrow" ref={arrowRef}><b /></span><span>{hud.compass}</span></div>
                </div>
                <div className="ss-stats"><div><span className="ss-gemn">{hud.gems}</span> gems</div><small>{fmt(hud.raceT)}{best ? ` · best ${fmt(best)}` : ""}</small></div>
                {hud.rank.length > 1 && (
                  <ol className="ss-rank" aria-label={coop ? "Your team" : "The race"}>
                    {hud.rank.map((r, i) => (
                      <li key={r.id} className={r.me ? "me" : ""}>
                        <b>{coop ? "•" : i + 1}</b>
                        <span style={r.col != null ? { color: "#" + r.col.toString(16).padStart(6, "0") } : undefined}>{r.name}</span>
                        <em>{r.fin != null ? "🏁" : `◆${r.sh}`}</em>
                      </li>
                    ))}
                  </ol>
                )}
                {banner && <div key={banner.n} className="ss-banner">{banner.title}{banner.sub && <small>{banner.sub}</small>}</div>}
                {toast && <div className="ss-toast">{toast.text}</div>}
                <div key={flash} className={`ss-flash${flash ? " on" : ""}`} />
                {count !== null && (
                  <div className="ss-count">{count >= START_S ? "GO!" : String(START_S - Math.floor(count))}</div>
                )}
                {(hud.finished || hud.teamDone) && !eng.gameOver && (
                  <div className="ss-done">{coop ? "🏆 The temple is lit — your team did it!" : "🏁 Home! Waiting for the clock…"}</div>
                )}
              </div>
              {touchUi && (
                <>
                  <div className="ss-stick" ref={stickRef} onPointerDown={stickDown} onPointerMove={(e) => { if (e.pointerId === stickId.current) stickMove(e); }}
                    onPointerUp={stickUp} onPointerCancel={stickUp} aria-label="Move">
                    <div className="ss-knob" ref={knobRef} />
                  </div>
                  <button type="button" className="ss-btn ss-spin" aria-label="Spin attack" onPointerDown={press(doSpin)}>SPIN</button>
                  <button type="button" className="ss-btn ss-jump" aria-label="Jump (hold to glide)"
                    onPointerDown={press(doJump)} onPointerUp={() => releaseJump(run.current)} onPointerCancel={() => releaseJump(run.current)}>JUMP</button>
                </>
              )}
            </div>
          );
        }}
      </GameFrame>
      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`${run.current.finished ? `Home in ${fmt((durationSeconds - (run.current.finishLeft || 0)) - START_S)}` : `${plural(hud.have, "shard")}`} · ${run.current.gemCount} / ${W.gems.length} gems${best ? ` · best ${fmt(best)}` : ""}`}
          together={coop ? { reached: teamDoneRef.current, goal: "light the Sky Temple", unit: "shards", mates } : null} />
      )}
    </>
  );
}
