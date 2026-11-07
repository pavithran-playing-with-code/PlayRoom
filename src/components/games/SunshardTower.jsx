// src/components/games/SunshardTower.jsx
// Sunshard Jump — the Sky Tree. A third-person 3D climb: a giant tree grows
// out of a meadow island up through the clouds, and a spiral of floating
// stones winds round it to the Sun Crown on its top. Below you the Gloom — a
// sea of storm cloud — rises, a little faster all the time. Jump, double-jump
// and glide up the spiral; grab the Sunshards on the stones that stick out
// (each one sinks your Gloom); reach the Crown and a new, taller tree grows.
//
//   Caught by the Gloom you lose a balloon and float back to your last flag,
//   the Gloom pushed back down under you. Out of balloons (three), the climb is
//   over — your best height stays — and a fresh one starts at the roots.
//   Points: 20 a metre of your best height, 150 a Sunshard, 5,000 the Crown
//   (towerWorld PTS); trees add up.
//
// Everyone in a room climbs the same tree (towerWorld.js, from the room's
// seed); each phone runs its own explorer (sunshardSim.js) and its own Gloom,
// from when its climb began, and tells the room where it is ~10 times a
// second (isl:pos, relayed by config/socket.js); everyone else is drawn from
// that, eased between reports, with their name over them. A slime stomped or
// a stone stepped on is told to the room (isl:ev), so friends share them.
//
//   Race (a normal room): highest wins — most Crowns, then best height.
//   Together (a co-op room): you're tied tail to tail in seat order (the
//   chain, sunshardSim tether); caught, you're pulled up beside a friend still
//   above the Gloom, no balloon lost (no friend: back to your flag). One of
//   you on the Crown is the Crown for all, and the side goes on to the next
//   tree together.
//
// Watching: the watched phone sends a small frame ~15 times a second while
// anyone watches (useSpecStream); the watcher builds the same tree and draws
// it from over their shoulder, the Gloom where theirs is.
//
// The drawing is sunshardScene.js (three.js r128, loaded when the game
// opens). A landscape game, full screen (GameFrame bare): held upright the
// whole frame is drawn turned, and every touch is turned back (toGame). On a
// phone the left half of the screen is the joystick, the right half the
// camera.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpecStream from "./useSpecStream";
import { useSocket } from "../../utils/SocketContext";
import { useUprightTouch, toGame } from "../horror/LandscapeGate";
import { team as teamOf, plural } from "./coopTeam";
import { clamp, TAU, LOOKS, TWISTS } from "./sunshardWorld.js";
import { buildTower, towerCode, gloomAt, bandAt, BANDS, SHARD_SINK, BALLOONS, PTS, climbPoints, startClimb, fallBack } from "./towerWorld.js";
import { newRun, step, pressJump, releaseJump, respawn, tether, tiedTo, ropeState, LEASH, HEARTS, killSlime, crumbleAt, watchStep } from "./sunshardSim.js";
import { MATE, createScene } from "./sunshardScene";
import { makeAudio } from "./sunshardAudio";

const START_S = 3;
const HUES = [0xff7a4d, ...MATE];       // everyone's colour, by seat (user id order)
const SEND_MS = 100;
const FRESH_MS = 2500;                  // a friend quiet this long isn't counted
const MAX_PTS = 25000;                  // the room's cap for one game
const NEXT_S = 5;                       // the Crown reached → the next tree
const AGAIN_S = 4;                      // out of balloons → a fresh climb
const r2 = (v) => Math.round(v * 100) / 100;
const hex = (c) => "#" + c.toString(16).padStart(6, "0");
const TEAM_NAMES = ["Red", "Yellow", "Blue", "Green"];
const TEAM_COLOURS = ["var(--coral)", "var(--sun)", "var(--sky)", "var(--mint)"];
const wrapA = (d) => { while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

export default function SunshardTower(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 0,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null, mode } = props;
  const coop = mode === "coop" && !!roomCode;
  const myId = Number(currentUser?.id);
  const { socket } = useSocket() || {};
  const [round, setRound] = useState(0);
  const roundRef = useRef(0);
  roundRef.current = round;
  const W = useMemo(() => buildTower(towerCode(seed, round), round), [seed, round]);
  const T = useMemo(() => teamOf(players, myId), [players, myId]);
  const seated = useMemo(() => (players || []).filter((p) => !p.is_spectator).map((p) => ({ id: Number(p.user_id), name: p.username })).sort((a, b) => a.id - b.id), [players]);
  const mySlot = Math.max(0, seated.findIndex((p) => p.id === myId));
  const seatedRef = useRef(seated);
  seatedRef.current = seated;

  // the climb lives in refs: the loop changes it every frame
  const run = useRef(null);
  const climb = useRef(null);                 // { t0, sink, balloons, maxY, over, overAt, crowned, crownAt, n }
  const freshClimb = (t0, n = 0) => ({ t0, sink: 0, balloons: BALLOONS, maxY: 0, over: false, overAt: 0, crowned: false, crownAt: 0, n });
  if (run.current === null || run.current.code !== W.code) {
    run.current = startClimb(newRun(W), W); run.current.code = W.code;
    climb.current = freshClimb(null);
  }
  const bank = useRef(0);                     // the Crowns behind you, in points
  const best = useRef(0);                     // this tree: the best climb's points
  const bestY = useRef(0);                    // this tree: the best height
  const crowns = useRef(0);
  const remotes = useRef(new Map());          // id -> { latest report, eased pose }
  const fresh = (r, now) => now - r.at < FRESH_MS;
  const livePts = () => climbPoints(climb.current.maxY, run.current.shards.size);
  const curScore = () => Math.min(MAX_PTS, bank.current + Math.max(best.current, climb.current.crowned ? 0 : livePts()));

  const eng = useGameEngine({
    roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: () => ({ pairs_matched: crowns.current ? 1 : 0 }),
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
  const elapsed = () => (performance.now() - anchor.current) / 1000;
  const live = (el) => !overRef.current && !isSpectator && el >= START_S && !climb.current.over;
  const doJump = useCallback(() => {
    audio.current.init();
    if (live(elapsed())) pressJump(run.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const relJump = () => releaseJump(run.current);

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
    };
    const up = (e) => { keys.current[e.code] = false; if (e.code === "Space") relJump(); };
    // leaving the app (or a system gesture) can swallow a finger's lift: let everything go
    const blur = () => { keys.current = {}; relJump(); stickUp(); drag.current = null; };
    const vis = () => { if (document.hidden) blur(); };
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
  // joystick (from wherever the thumb lands), the right half turns the camera.
  // A mouse drags the camera anywhere; the keys move.
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
  const size = useRef({ w: 300, h: 200 });
  const padDown = (e) => {
    audio.current.init();
    if (e.pointerType === "touch" && !touchUi) setTouchUi(true);
    if (e.target.closest && e.target.closest(".ss-btn, .gf-float")) return;
    const p = toGame(e, rot.current);
    if (e.pointerType !== "mouse" && p.x < size.current.w / 2) {
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
    const p = toGame(e, rot.current);
    cam.current.yaw -= (p.x - d.x) * 0.006;
    // a tower: you can look up the trunk, and down at the Gloom
    cam.current.pitch = clamp(cam.current.pitch + (p.y - d.y) * 0.004, -0.35, 1.3);
    d.x = p.x; d.y = p.y;
  };
  const padUp = (e) => {
    if (e.pointerId === stickId.current) stickUp();
    if (drag.current && drag.current.id === e.pointerId) drag.current = null;
  };

  // ── everyone else, from the room ───────────────────────────────────────────
  const toastRef = useRef(null);
  const momentsRef = useRef([]);             // friends' stomps, for a puff where the slime was
  useEffect(() => {
    if (!socket) return undefined;
    const onPos = (m) => {
      const id = Number(m.user_id);
      if (id === myId) return;
      const slot = seated.findIndex((p) => p.id === id);
      let r = remotes.current.get(id);
      if (!r) {
        r = { id, name: seated[slot]?.name || "Friend", col: HUES[(slot < 0 ? id : slot) % HUES.length], d: { x: m.x, y: m.y, z: m.z, face: m.f } };
        remotes.current.set(id, r);
      }
      if (r.fin == null && m.fin != null && (m.rd || 0) === roundRef.current && toastRef.current) {
        toastRef.current(coop ? `👑 ${r.name} reached the Sun Crown — for all of you!` : `👑 ${r.name} reached the Sun Crown!`, 3500);
      }
      // a new tree: they're somewhere else now, not on their way there
      if ((m.rd || 0) !== (r.rd || 0) || Math.hypot(m.x - r.d.x, m.y - r.d.y, m.z - r.d.z) > 25) Object.assign(r.d, { x: m.x, y: m.y, z: m.z, face: m.f });
      Object.assign(r, m, { at: performance.now() });
    };
    const onEv = (m) => {
      if (Number(m.user_id) === myId || (m.rd || 0) !== roundRef.current) return;
      if (m.k === "stomp") { if (killSlime(run.current, m.i)) momentsRef.current.push(m); }
      else if (m.k === "crumble") crumbleAt(run.current, W, m.i);
    };
    socket.on("isl:pos", onPos);
    socket.on("isl:ev", onEv);
    return () => { socket.off("isl:pos", onPos); socket.off("isl:ev", onEv); };
  }, [socket, myId, seated, coop, W]);

  // ── the HUD, and the moments ───────────────────────────────────────────────
  const [hud, setHud] = useState({ y: 0, best: 0, gloomBy: 99, balloons: BALLOONS, shards: 0, band: 0, compass: "", rank: [], count: START_S, meter: [], gloomK: 0, over: false, again: 0, crowned: false, next: 0, danger: 0 });
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

  // the race, best first: most Crowns, then the best height
  const ranked = (all) => all.sort((a, b) => b.rd - a.rd || b.p - a.p).slice(0, 5);
  const remoteRow = (r) => ({ id: r.id, name: r.name, col: r.col, rd: r.rd || 0, p: r.p || 0 });
  // the tower meter: everyone on this tree, as a share of the way up
  const meterOf = (me, myCol, now, except) => {
    const top = W.summit, list = [{ id: "me", k: clamp(me / top, 0, 1), col: myCol, me: true }];
    for (const r of remotes.current.values()) {
      if (r.id === except || (r.rd || 0) !== roundRef.current || !fresh(r, now)) continue;
      list.push({ id: r.id, k: clamp(r.y / top, 0, 1), col: hex(r.col) });
    }
    return list;
  };

  // ── watching: the player sends its climb, the watcher follows its tree ────
  const specSeen = useRef(false);
  const [specOn, setSpecOn] = useState(false);
  const watchId = spectatorWatching?.user_id;
  useEffect(() => { specSeen.current = false; setSpecOn(false); }, [watchId]);
  const sceneRef = useRef(null);
  const gloomNow = useRef(-12);
  const spec = useSpecStream({
    roomCode, isSpectator, myId, watchId,
    // ~300 bytes: the explorer, the camera, the Gloom, and what's changed on the tree
    frame: () => {
      if (!sceneRef.current) return null;
      const S = run.current, P = S.pl, c = cam.current, C = climb.current, cr = [];
      S.plats.forEach((q, i) => { if (q.state) cr.push(i, q.state); });
      const rp = coop ? tiedTo(seatedRef.current.map((p) => p.id), myId).reduce((m, id) => m | (ropeState(S, id) ? (id < myId ? 1 : 2) : 0), 0) : 0;
      return {
        rd: roundRef.current, x: r2(P.x), y: r2(P.y), z: r2(P.z), vx: r2(P.vx), vy: r2(P.vy), vz: r2(P.vz), f: r2(P.face),
        g: P.onG ? 1 : 0, gl: P.gliding ? 1 : 0, iv: P.inv > 0 ? 1 : 0, j: P.jumps, sq: r2(P.sq || 0),
        yw: r2(c.yaw), pt: r2(c.pitch), zn: S.zone, sl: [...S.shards], fl: [...S.flags],
        gy: r2(gloomNow.current), bl: C.balloons, my: Math.round(C.maxY), ov: C.over ? 1 : 0, cw: C.crowned ? 1 : 0,
        dead: S.slimes.filter((s) => !s.alive).map((s) => s.k), cr, rp, sc: curScore(),
      };
    },
    onFrame: (f) => {
      if (!specSeen.current) { specSeen.current = true; setSpecOn(true); }
      const rd = Number(f.rd) || 0;
      if (rd !== roundRef.current) setRound(rd);
    },
  });

  // ── the loop ───────────────────────────────────────────────────────────────
  const hostRef = useRef(null);
  useEffect(() => {
    if (!THREE || isSpectator || !hostRef.current) return undefined;
    let scene;
    try {
      scene = createScene(THREE, W, { color: HUES[mySlot % HUES.length] });
    } catch (e) { setNoGl(true); return undefined; }
    sceneRef.current = scene;
    window.__ss = () => ({ run: run.current, climb: climb.current, cam: cam.current, W, el: elapsed() });          // for tests
    const host = hostRef.current;
    host.insertBefore(scene.canvas, host.firstChild);
    scene.canvas.className = "ss-canvas";
    scene.resize(size.current.w, size.current.h);
    const A = audio.current, myHue = HUES[mySlot % HUES.length], tiedOnce = new Set();
    // the camera starts behind you, looking along the first jump
    {
      const S = run.current, f = W.plats[W.path[1]];
      cam.current.yaw = Math.atan2(-(f.x - S.pl.x), -(f.z - S.pl.z));
      cam.current.pitch = 0.42;
    }
    let raf, last = performance.now(), sent = 0, lastHud = 0, beeped = -1, sizeW = 0, sizeH = 0, started = round > 0, nextAt = 0, lastBand = -1, warned = 0;
    const here = (r) => (r.rd || 0) === round;
    const tell = (k, i) => { if (socket && roomCode) socket.emit("isl:ev", { code: roomCode, rd: round, k, i }); };
    const chain = () => seatedRef.current.map((p) => p.id);
    if (round > 0) { A.play(true); shout(`Tree ${round + 1}: ${LOOKS[W.look].name}`, W.twist ? TWISTS[W.twist] : "A taller tree — climb!"); }

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = now; return; }
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = Math.max(last, now);
      const el = (now - anchor.current) / 1000, go = el >= START_S;
      if (size.current.w !== sizeW || size.current.h !== sizeH) { sizeW = size.current.w; sizeH = size.current.h; scene.resize(sizeW, sizeH); }
      if (!go) { const n = Math.floor(el); if (n !== beeped && n >= 0) { beeped = n; A.sfx.beep(false); } }
      else if (!started) { started = true; A.sfx.beep(true); A.play(true); shout("Climb the Sky Tree!", "The Gloom is rising — go up!"); }
      const S = run.current, P = S.pl, C = climb.current, fx = scene.fx;
      if (go && C.t0 === null) C.t0 = round > 0 ? el : START_S;
      // where to go, turned to the camera
      const k = keys.current, c = cam.current;
      if (k.KeyQ) c.yaw += 1.9 * dt;
      if (k.KeyE) c.yaw -= 1.9 * dt;
      let ix = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + joy.current.x;
      let iz = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0) + joy.current.y;
      if (!go || overRef.current || C.over) { ix = 0; iz = 0; }
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      const inp = { mx: sy * iz + cy * ix, mz: cy * iz - sy * ix };
      // together: the friends tied to me, where they are now (gone quiet: not held)
      const ids = chain(), anchors = [];
      if (coop) for (const id of tiedTo(ids, myId)) {
        const r = remotes.current.get(id);
        if (r && here(r) && fresh(r, now)) anchors.push({ id, x: r.d.x, y: r.d.y, z: r.d.z, g: !!r.g });
      }
      // two steps a frame, on the match clock (so moving stones agree)
      const evs = [];
      for (let i = 0; i < 2; i++) {
        S.T = el - dt + (dt / 2) * i;
        const bx = P.x, bz = P.z;
        evs.push(...step(S, W, inp, dt / 2, null));
        if (anchors.length && go && !C.over) evs.push(...tether(S, W, anchors, bx, bz, dt / 2));
      }
      if (go && !C.over && fallBack(S, W)) { fx.burst(P.x, P.y + 0.5, P.z, 24, 0xffffff, 5, 3); A.sfx.pop(); say("Whoops! Back on your stone", 1400); }
      // the Gloom: mine, from when this climb began, less what I've sunk it by
      const gy = C.t0 === null ? gloomAt(0, round) : gloomAt(el - C.t0, round) - C.sink;
      gloomNow.current = gy;
      const tiedNew = [], tiedAgain = [];
      for (const e of evs) {
        if (e.k === "jump") { A.sfx.jump(); fx.burst(P.x, P.y + 0.1, P.z, 6, 0xffffff, 2, 0.5); }
        else if (e.k === "dbl") { A.sfx.dbl(); fx.ring(P.x, P.y + 0.1, P.z, 0xbff0ff, 2.8); }
        else if (e.k === "land") { A.sfx.land(); fx.burst(P.x, P.y + 0.1, P.z, 8, 0xdddddd, 2.6, 0.6); }
        else if (e.k === "shard") {
          A.sfx.shard(); fx.ring(e.x, e.y, e.z, e.col, 7); fx.burst(e.x, e.y, e.z, 50, e.col, 9, 5); fx.shake(0.3);
          C.sink += SHARD_SINK;
          shout(`Sunshard! +${PTS.shard}`, `The Gloom sinks ${SHARD_SINK} m`);
          sent = 0;
        }
        else if (e.k === "hurt") {
          // a slime only knocks you about here: no hearts on the tree
          A.sfx.hurt(); fx.shake(0.5); fx.burst(P.x, P.y + 0.6, P.z, 14, 0xff6a6a, 5, 2); setFlash((f) => f + 1);
          P.hp = HEARTS;
        }
        else if (e.k === "respawn") {
          // a long fall: the chain pulls you back up beside your friend, if they're standing somewhere
          const by = anchors.find((a) => a.g);
          if (by) {
            Object.assign(P, { x: by.x + 0.6, y: by.y + 0.4, z: by.z, vx: 0, vz: 0, vy: 0 });
            say(`🪢 Pulled back up beside ${remotes.current.get(by.id)?.name || "your friend"}`, 1800);
          } else say("Back to the last flag", 1800);
          fx.burst(P.x, P.y + 0.5, P.z, 24, 0xffffff, 5, 3);
        }
        else if (e.k === "stomp") { A.sfx.stomp(); fx.burst(e.x, e.y + 0.5, e.z, 22, 0x6fe08a, 5, 3); tell("stomp", e.i); }
        else if (e.k === "spring") { A.sfx.spring(); fx.ring(e.x, e.y + 0.6, e.z, 0xff9aa8, 3); fx.burst(P.x, P.y, P.z, 12, 0xff9aa8, 3, 2); }
        else if (e.k === "flag") { A.sfx.flag(); say("🚩 Checkpoint", 1500); const f = W.flags[e.f]; fx.burst(f.x, f.y + 2, f.z, 16, 0x9dff9d, 3, 2); }
        else if (e.k === "crumble") { A.sfx.crumble(); tell("crumble", e.i); }
        else if (e.k === "tie") {
          const who = remotes.current.get(e.id)?.name || "your friend";
          A.sfx.tie(); (tiedOnce.has(e.id) ? tiedAgain : tiedNew).push(who); tiedOnce.add(e.id);
          sent = 0;
        }
      }
      for (const m of momentsRef.current.splice(0)) { const sl = S.slimes[m.i]; if (sl) fx.burst(sl.x, sl.y + 0.5, sl.z, 22, 0x6fe08a, 5, 3); }
      if (tiedNew.length || tiedAgain.length) {
        const both = (l) => l.join(" and ");
        say(tiedNew.length ? `🪢 Tied tail to tail with ${both(tiedNew)}` : `🪢 Tied to ${both(tiedAgain)} again`, 2400);
      }
      // how high: only standing counts (a jump isn't a height)
      if (P.onG && !C.over && P.y > C.maxY) C.maxY = P.y;
      if (C.maxY > bestY.current) bestY.current = C.maxY;
      const band = bandAt(P.y);
      if (P.onG && band !== lastBand && go) {
        if (lastBand >= 0 && band > lastBand) shout(BANDS[band].name, `${Math.round(P.y)} m up`);
        lastBand = band;
      }

      // ── the Crown ─────────────────────────────────────────────────────────
      const onCrown = P.onG && P.gp === W.crown.p;
      const friendCrowned = coop && [...remotes.current.values()].some((r) => here(r) && r.fin != null && fresh(r, now));
      if (!C.crowned && go && !overRef.current && (onCrown || (friendCrowned && !C.over))) {
        C.crowned = true; C.crownAt = el;
        if (onCrown) C.maxY = Math.max(C.maxY, W.summit);
        bank.current = Math.min(MAX_PTS, bank.current + climbPoints(C.maxY, S.shards.size) + PTS.crown);
        best.current = 0;
        crowns.current++;
        A.sfx.win();
        for (let i = 0; i < 5; i++) timers.current.push(setTimeout(() => fx.burst(W.crown.x, W.crown.y + 4, W.crown.z, 50, [0xffe28a, 0x7fe3ff, 0xff7a4a, 0x6dff9c, 0xffffff][i], 9, 7), i * 220));
        shout("👑 The Sun Crown!", onCrown ? `+${PTS.crown.toLocaleString()} — a taller tree is growing…` : "Your team made it — on to the next tree…");
        nextAt = now + NEXT_S * 1000;
        sent = 0;
      }
      // a friend already on a later tree: on we go (together)
      if (coop && !nextAt && [...remotes.current.values()].some((r) => (r.rd || 0) > round && fresh(r, now))) nextAt = now + 800;
      if (nextAt && now >= nextAt && !overRef.current) { nextAt = Infinity; setRound((n) => n + 1); }

      // ── caught by the Gloom ───────────────────────────────────────────────
      if (go && !C.crowned && !C.over && !overRef.current && C.t0 !== null && P.y < gy + 0.3) {
        A.sfx.caught(); fx.shake(0.8); setFlash((f) => f + 1);
        fx.burst(P.x, gy + 0.5, P.z, 30, 0xb48cff, 6, 4);
        const by = anchors.find((a) => a.g && a.y > gy + 3);
        if (by) {
          // together: your friend hauls you up the chain — no balloon lost
          Object.assign(P, { x: by.x + 0.6, y: by.y + 0.4, z: by.z, vx: 0, vz: 0, vy: 0, onG: false, gp: null, inv: 1.5 });
          say(`🪢 ${remotes.current.get(by.id)?.name || "Your friend"} hauled you out of the Gloom!`, 2400);
          C.sink += Math.max(0, gy - (P.y - 9));
        } else {
          if (!coop) C.balloons--;
          if (C.balloons > 0) {
            respawn(S);
            P.inv = 1.5;
            C.sink += Math.max(0, gy - (S.ckpt.y - 10));
            A.sfx.pop();
            say(coop ? "🎈 Caught! Floated back to your flag" : `🎈 Caught! ${plural(C.balloons, "balloon")} left`, 2400);
            fx.burst(P.x, P.y + 1, P.z, 24, 0xff8fc7, 4, 3);
          } else {
            // out of balloons: the climb is over — the best stays, and a new one begins at the roots
            C.over = true; C.overAt = now + AGAIN_S * 1000;
            best.current = Math.max(best.current, climbPoints(C.maxY, S.shards.size));
            A.sfx.over();
            sent = 0;
          }
        }
      }
      if (C.over && now >= C.overAt && !overRef.current) {
        const n = C.n + 1;
        run.current = startClimb(newRun(W), W); run.current.code = W.code;
        climb.current = freshClimb(el, n);
        const f = W.plats[W.path[1]], S2 = run.current;
        cam.current.yaw = Math.atan2(-(f.x - S2.pl.x), -(f.z - S2.pl.z));
        shout(`Climb ${n + 1}`, "The Gloom starts low again — go!");
        A.sfx.beep(true);
        lastBand = -1;
        sent = 0;
        return;
      }
      // the Gloom close: the tune gets a heartbeat, the edges go purple
      const by = P.y - gy, danger = C.over || C.crowned || !go ? 0 : clamp(1 - (by - 2) / 10, 0, 1);
      A.tension(danger);
      if (danger > 0.7 && now - warned > 6000) { warned = now; A.sfx.thunder(); }

      // everyone else, eased toward where they said they were
      const rs = [];
      for (const r of remotes.current.values()) {
        if (!here(r)) continue;
        const age = Math.min(0.15, (now - r.at) / 1000), d = r.d, kk = Math.min(1, dt * 12);
        d.x += (r.x + r.vx * age - d.x) * kk; d.y += (r.y + (r.g ? 0 : r.vy * age) - d.y) * kk; d.z += (r.z + r.vz * age - d.z) * kk;
        d.face += wrapA(r.f - d.face) * kk;
        rs.push({ id: r.id, name: r.name, col: r.col, x: d.x, y: d.y, z: d.z, face: d.face, speed: Math.hypot(r.vx, r.vz), onG: !!r.g, vy: r.vy, vx: r.vx, vz: r.vz, gliding: !!r.gl, inv: !!r.iv });
      }
      const ropes = [];
      if (coop) {
        const isFresh = (id) => id === myId || (remotes.current.get(id) && here(remotes.current.get(id)) && fresh(remotes.current.get(id), now));
        for (let i = 0; i + 1 < ids.length; i++) {
          const a = ids[i], b = ids[i + 1];
          if (!isFresh(a) || !isFresh(b)) continue;
          const on = a === myId || b === myId ? !!ropeState(S, a === myId ? b : a) : !!(remotes.current.get(a).rp & 2);
          ropes.push({ a: a === myId ? "me" : a, b: b === myId ? "me" : b, on, len: LEASH,
            ca: a === myId ? myHue : remotes.current.get(a).col, cb: b === myId ? myHue : remotes.current.get(b).col });
        }
      }
      scene.frame({ S, team: null, remotes: rs, ropes, yaw: c.yaw, pitch: c.pitch, dt, T: el, gloom: gy });
      // the compass: the next stone up the spiral (from the one you last stood on)
      const at = Math.max(0, P.gp !== null ? W.path.indexOf(P.gp) : S._at || 0);
      if (P.gp !== null && at >= 0) S._at = at;
      const nx = W.plats[W.path[Math.min(W.path.length - 1, (S._at || 0) + 1)]];
      if (nx && arrowRef.current) {
        const q = S.plats[nx.i], fAng = Math.atan2(-Math.sin(c.yaw), -Math.cos(c.yaw)), dAng = Math.atan2(q.x - P.x, q.z - P.z);
        arrowRef.current.style.transform = `rotate(${(-(dAng - fAng) * 180) / Math.PI}deg)`;
      }
      // the room: where I am
      if (socket && roomCode && !overRef.current && now - sent > SEND_MS) {
        sent = now;
        socket.emit("isl:pos", { code: roomCode, rd: round, sg: 0, x: r2(P.x), y: r2(P.y), z: r2(P.z), f: r2(P.face), vx: r2(P.vx), vy: r2(P.vy), vz: r2(P.vz),
          g: P.onG ? 1 : 0, gl: P.gliding ? 1 : 0, iv: P.inv > 0 ? 1 : 0, hp: C.balloons,
          rp: coop ? tiedTo(ids, myId).reduce((m, id) => m | (ropeState(S, id) ? (id < myId ? 1 : 2) : 0), 0) : 0,
          sh: Math.min(31, S.shards.size), p: Math.round(bestY.current), fin: C.crowned ? Math.round((C.crownAt - START_S) * 10) / 10 : null });
      }
      if (now - lastHud > 120) {
        lastHud = now;
        if (!overRef.current) setScore(curScore());
        const left = Math.max(0, Math.round(W.summit - P.y));
        const me = { id: myId, name: "You", col: null, rd: round, p: Math.round(bestY.current), me: true };
        setHud({
          y: Math.max(0, Math.round(P.y)), best: Math.round(bestY.current), gloomBy: Math.round(by), balloons: C.balloons, shards: S.shards.size, band,
          compass: left > 2 ? `Crown ${left} m ↑` : "The Crown!", rank: ranked([me, ...[...remotes.current.values()].map(remoteRow)]),
          count: round === 0 && el < START_S + 1 ? el : null, meter: meterOf(P.y, hex(myHue), now, myId), gloomK: clamp(gy / W.summit, 0, 1),
          over: C.over, again: C.over ? Math.max(1, Math.ceil((C.overAt - now) / 1000)) : 0, crowned: C.crowned,
          next: nextAt && nextAt !== Infinity ? Math.max(1, Math.ceil((nextAt - now) / 1000)) : 0, danger, climbN: C.n,
        });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      A.play(false); A.tension(0);
      try { host.removeChild(scene.canvas); } catch { /* gone */ }
      scene.dispose();
      sceneRef.current = null;
      delete window.__ss;
    };
  }, [THREE, isSpectator, W, round, socket, roomCode, coop, myId, durationSeconds, setScore, say, shout, mySlot]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the watcher's loop: their tree, drawn from their frames ────────────────
  // The world runs here on the match clock (watchStep); the explorer and the
  // camera are eased toward the latest frame. Nothing is sent, and no sound.
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
    const S = run.current, fx = scene.fx, v = { yaw: 0, pitch: 0.42 };
    let raf, last = performance.now(), lastHud = 0, seenAt = 0, prev = null, snap = true, sizeW = 0, sizeH = 0, gy = -12;
    const here = (r) => (r.rd || 0) === round;
    const apply = (f) => {
      const had = S.shards.size;
      S.shards = new Set(Array.isArray(f.sl) ? f.sl : []);
      if (prev && S.shards.size > had) {
        const s = W.shards.find((x) => S.shards.has(x.i) && !(prev.sl || []).includes(x.i));
        if (s) { fx.ring(s.x, s.y, s.z, s.col, 7); fx.burst(s.x, s.y, s.z, 50, s.col, 9, 5); }
        shout("Sunshard!", `${wName}'s Gloom sinks`);
      }
      if (f.cw && prev && !prev.cw) {
        for (let i = 0; i < 5; i++) timers.current.push(setTimeout(() => fx.burst(W.crown.x, W.crown.y + 4, W.crown.z, 50, [0xffe28a, 0x7fe3ff, 0xff7a4a, 0x6dff9c, 0xffffff][i], 9, 7), i * 220));
        shout("👑 The Sun Crown!", `${wName} made it`);
      }
      S.zone = f.zn;
      if ((f.fl || []).length !== S.flags.size) S.flags = new Set(f.fl);
      for (const i of f.dead || []) killSlime(S, i);
      const cr = f.cr || [];
      for (let k = 0; k + 1 < cr.length; k += 2) {
        const q = S.plats[cr[k]];
        if (!q || q.state) continue;
        if (cr[k + 1] === 1) crumbleAt(S, W, cr[k]); else Object.assign(q, { state: 3, t: 0, solid: false });
      }
      if (prev) {
        if (f.bl < prev.bl) { fx.shake(0.6); fx.burst(f.x, f.y + 0.6, f.z, 24, 0xb48cff, 5, 3); setFlash((n) => n + 1); }
        if (Math.hypot(f.x - prev.x, f.y - prev.y, f.z - prev.z) > 8) { snap = true; fx.burst(f.x, f.y + 0.5, f.z, 24, 0xffffff, 5, 3); }
        else if (f.j > prev.j && !f.g) {
          if (f.j >= 2) fx.ring(f.x, f.y + 0.1, f.z, 0xbff0ff, 2.8); else fx.burst(f.x, f.y + 0.1, f.z, 6, 0xffffff, 2, 0.5);
        } else if (f.g && !prev.g && prev.vy < -7) fx.burst(f.x, f.y + 0.1, f.z, 8, 0xdddddd, 2.6, 0.6);
      }
      S.pl.jumps = f.j; S.pl.sq = f.sq;
      prev = f;
    };
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) { last = now; return; }
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = Math.max(last, now);
      const el = (now - anchor.current) / 1000;
      if (size.current.w !== sizeW || size.current.h !== sizeH) { sizeW = size.current.w; sizeH = size.current.h; scene.resize(sizeW, sizeH); }
      const L = spec.current;
      if (!L || !L.f || (Number(L.f.rd) || 0) !== round) return;
      const f = L.f;
      if (L.at !== seenAt) { seenAt = L.at; apply(f); }
      const P = S.pl;
      const age = Math.min(0.15, (now - L.at) / 1000);
      const tx = f.x + f.vx * age, ty = f.y + (f.g ? 0 : f.vy * age), tz = f.z + f.vz * age;
      if (snap) { snap = false; Object.assign(P, { x: tx, y: ty, z: tz, face: f.f }); v.yaw = f.yw; v.pitch = f.pt; gy = f.gy; }
      const k = Math.min(1, dt * 12), kc = Math.min(1, dt * 10);
      P.x += (tx - P.x) * k; P.y += (ty - P.y) * k; P.z += (tz - P.z) * k;
      P.face += wrapA(f.f - P.face) * k;
      Object.assign(P, { vx: f.vx, vy: f.vy, vz: f.vz, onG: !!f.g, gliding: !!f.gl, inv: f.iv ? 1 : 0, speed: Math.hypot(f.vx, f.vz) });
      v.yaw += wrapA(f.yw - v.yaw) * kc; v.pitch += (f.pt - v.pitch) * kc;
      gy += ((Number(f.gy) || 0) - gy) * kc;
      const rs = [];
      for (const r of remotes.current.values()) {
        if (r.id === wid || !here(r)) continue;
        const ag = Math.min(0.15, (now - r.at) / 1000), d = r.d;
        d.x += (r.x + r.vx * ag - d.x) * k; d.y += (r.y + (r.g ? 0 : r.vy * ag) - d.y) * k; d.z += (r.z + r.vz * ag - d.z) * k;
        d.face += wrapA(r.f - d.face) * k;
        rs.push({ id: r.id, name: r.name, col: r.col, x: d.x, y: d.y, z: d.z, face: d.face, speed: Math.hypot(r.vx, r.vz), onG: !!r.g, vy: r.vy, vx: r.vx, vz: r.vz, gliding: !!r.gl, inv: !!r.iv });
      }
      const ropes = [];
      if (coop) {
        const chain = seatedRef.current.map((p) => p.id), rem = (id) => remotes.current.get(id);
        const isFresh = (id) => id === wid || (rem(id) && here(rem(id)) && fresh(rem(id), now));
        for (let i = 0; i + 1 < chain.length; i++) {
          const a = chain[i], b = chain[i + 1];
          if (!isFresh(a) || !isFresh(b)) continue;
          const on = a === wid ? !!(f.rp & 2) : b === wid ? !!(f.rp & 1) : !!(rem(a).rp & 2);
          ropes.push({ a: a === wid ? "me" : a, b: b === wid ? "me" : b, on, len: LEASH,
            ca: a === wid ? wHue : rem(a).col, cb: b === wid ? wHue : rem(b).col });
        }
      }
      S.T = el - dt;
      watchStep(S, W, dt);
      for (const m of momentsRef.current.splice(0)) { const sl = S.slimes[m.i]; if (sl) fx.burst(sl.x, sl.y + 0.5, sl.z, 22, 0x6fe08a, 5, 3); }
      scene.frame({ S, team: null, remotes: rs, ropes, yaw: v.yaw, pitch: v.pitch, dt, T: el, gloom: gy });
      if (now - lastHud > 120) {
        lastHud = now;
        const me = { id: wid, name: wName, col: wHue, rd: round, p: f.my || 0, me: true };
        const by = P.y - gy;
        setHud({
          y: Math.max(0, Math.round(P.y)), best: f.my || 0, gloomBy: Math.round(by), balloons: f.bl ?? BALLOONS, shards: (f.sl || []).length, band: bandAt(P.y),
          compass: "", rank: ranked([me, ...[...remotes.current.values()].filter((r) => r.id !== wid).map(remoteRow)]),
          count: null, meter: meterOf(P.y, hex(wHue), now, wid), gloomK: clamp(gy / W.summit, 0, 1),
          over: !!f.ov, again: 0, crowned: !!f.cw, next: 0, danger: f.ov || f.cw ? 0 : clamp(1 - (by - 2) / 10, 0, 1), sc: f.sc,
        });
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
  const press = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ } fn(); };
  const mates = coop ? T.all(Object.fromEntries([[myId, hud.best || 0], ...[...remotes.current.values()].map((r) => [r.id, r.p || 0])])) : [];
  const who = isSpectator ? "their" : "your";

  return (
    <>
      <GameFrame
        gameName="Sunshard Jump" badge="🌳 SUNSHARD JUMP"
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
          const pad = isSpectator ? {} : { onPointerDown: padDown, onPointerMove: padMove, onPointerUp: padUp, onPointerCancel: padUp, onLostPointerCapture: padUp };
          return (
            <div className={`ss-stage${touchUi && !isSpectator ? " touch" : ""}`} ref={hostRef} style={{ width: w, height: h }}
              {...pad} onContextMenu={(e) => e.preventDefault()}>
              {!THREE && !noGl && <div className="ss-loading">Growing the Sky Tree…</div>}
              {isSpectator && THREE && !noGl && !specOn && <div className="ss-loading">Connecting to {spectatorWatching?.username || "their"}’s climb…</div>}
              {noGl && <div className="ss-loading">This game needs WebGL. Try another browser, or turn on hardware acceleration.</div>}
              <div className="st-gloomedge" style={{ opacity: hud.danger || 0 }} aria-hidden="true" />
              <div className="ss-hud">
                <div className="st-balloons" aria-label={coop ? "Tied together" : `${hud.balloons} balloons`}>
                  {coop ? <span className="st-team">🪢 Together</span>
                    : Array.from({ length: BALLOONS }, (_, i) => <i key={i} className={i < hud.balloons ? "" : "off"}>🎈</i>)}
                </div>
                <div className="ss-mid">
                  <div className="st-height"><b>{hud.y}</b><span>m</span><small>{BANDS[hud.band]?.name}</small></div>
                  <div className={`st-gloom${hud.gloomBy < 8 ? " near" : ""}`}>🌩️ Gloom {hud.gloomBy > 0 ? `${hud.gloomBy} m below` : "here!"}</div>
                  {!isSpectator && hud.compass && <div className="ss-compass"><span className="ss-arrow" ref={arrowRef}><b /></span><span>{hud.compass}</span></div>}
                </div>
                <div className="ss-stats">🌳 {round + 1} · ◆ {hud.shards}
                  <small>best {hud.best} m{crowns.current ? ` · 👑 ${crowns.current}` : ""}</small>
                </div>
                {eng.teams && eng.teams.length > 1 && (
                  // team against team: the sides' totals (the full-screen frame has no strip for them)
                  <div className="st-teams">
                    {eng.teams.map((t) => (
                      <div key={t.team} className={`teamscore${t.mine ? " mine" : ""}`} style={{ background: TEAM_COLOURS[(t.team - 1) % TEAM_COLOURS.length] }}>
                        {TEAM_NAMES[(t.team - 1) % TEAM_NAMES.length]}{t.mine ? " (you)" : ""} <b>{Number(t.total).toLocaleString()}</b>
                      </div>
                    ))}
                  </div>
                )}
                {hud.rank.length > 1 && !coop && (
                  <ol className="ss-rank" aria-label="The race">
                    {hud.rank.map((r, i) => (
                      <li key={r.id} className={r.me ? "me" : ""}>
                        <b>{i + 1}</b>
                        <span style={r.col != null ? { color: hex(r.col) } : undefined}>{r.name}</span>
                        <em>{r.rd ? `👑${r.rd} ` : ""}{r.p} m</em>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="st-meter" aria-hidden="true">
                  <i className="st-crown">👑</i>
                  <div className="st-track">
                    <div className="st-fill" style={{ height: `${Math.round(hud.gloomK * 100)}%` }} />
                    {hud.meter.map((m) => <span key={m.id} className={m.me ? "me" : ""} style={{ bottom: `${Math.round(m.k * 100)}%`, background: m.col }} />)}
                  </div>
                </div>
                {banner && <div key={banner.n} className="ss-banner">{banner.title}{banner.sub && <small>{banner.sub}</small>}</div>}
                {toast && <div className="ss-toast">{toast.text}</div>}
                <div key={flash} className={`ss-flash${flash ? " on" : ""}`} />
                {count !== null && count !== undefined && (
                  <div className="ss-count">{count >= START_S ? "GO!" : String(START_S - Math.floor(count))}</div>
                )}
                {hud.over && !eng.gameOver && (
                  <div className="ss-done">🌩️ The Gloom got {isSpectator ? "them" : "you"}!<small>Best {hud.best} m{hud.again ? ` · a new climb in ${hud.again}…` : ""}</small></div>
                )}
                {hud.crowned && !eng.gameOver && (
                  <div className="ss-done">👑 {coop ? `The Sun Crown — ${who} team did it!` : "The Sun Crown!"}{hud.next > 0 && <small>A taller tree in {hud.next}…</small>}</div>
                )}
              </div>
              {touchUi && !isSpectator && (
                <>
                  <div className="ss-stick" aria-hidden="true"><div className="ss-knob" ref={knobRef} /></div>
                  <button type="button" className="ss-btn ss-jump" aria-label="Jump (hold to glide)"
                    onPointerDown={press(doJump)} onPointerUp={relJump} onPointerCancel={relJump}
                    onLostPointerCapture={relJump}>JUMP</button>
                </>
              )}
            </div>
          );
        }}
      </GameFrame>
      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`${crowns.current ? `👑 ${plural(crowns.current, "Crown")} · ` : ""}best ${Math.round(bestY.current)} m`}
          together={coop ? { reached: crowns.current > 0, goal: "reach the Sun Crown", unit: "m", mates } : null} />
      )}
    </>
  );
}
