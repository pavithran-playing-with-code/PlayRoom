// src/components/games/DinoDashInner.jsx
// Dino Dash: jump the cacti, duck the birds. A crash doesn't end your match:
// you're knocked back to your level's speed and lose a few points, then run
// on until the clock stops. Every room runs the same course, and everyone's
// dino is on it (dino:pos), a little way behind yours. Every LEVEL_LEN of the
// course is a level: faster, and the sky turns from day to sunset to night.
//
// Rules live in dinoSim.js; dinoScene.js draws them in 3D. Loaded lazily:
// DinoDash.jsx is the wrapper.
//
// Watching: the player's phone sends its runner ~15 times a second while a
// friend watches (useSpecStream); the watcher builds the same course from the
// seed and draws the run from those frames, carried on at the runner's speed
// between them so it scrolls smoothly.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpecStream from "./useSpecStream";
import { useSocket } from "../../utils/SocketContext";
import {
  VIEW_W, CRASH_COST, UNITS_PER_METRE, GRAVITY,
  makeCourse, newRunner, jump, releaseJump, setDuck, step, speedAfter, levelAt,
} from "./dinoSim";
import { createDinoScene, SKY_NAMES } from "./dinoScene";

const SEND_MS = 100;

// The canvas, sized to the board area: a wide strip, VIEW_W of course across.
function Stage({ w, h, canvasRef, size, onDown, onUp, children }) {
  const WH = Math.round(Math.min(380, Math.max(200, (VIEW_W * h) / Math.max(1, w))));
  let cssW = w;
  let cssH = (w * WH) / VIEW_W;
  if (cssH > h) { cssH = h; cssW = (h * VIEW_W) / WH; }
  size.current.w = Math.round(cssW); size.current.h = Math.round(cssH);
  return (
    <div className="dino-pad" style={{ width: w, height: h, position: "relative" }}
      onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}>
      <div style={{ position: "relative", width: cssW, height: cssH }}>
        <canvas ref={canvasRef} className="dino-canvas" style={{ width: cssW, height: cssH }} aria-label="Dino Dash: tap to jump" role="img" />
        {children}
      </div>
    </div>
  );
}

// where a runner is by now, from its last message
function predict(f, at, now) {
  const t = Math.min(0.35, Math.max(0, (now - at) / 1000));
  const v = t < 0.35 ? f.v || 0 : 0;
  let y = 0;
  if (f.y > 0 || f.vy > 0) y = Math.max(0, f.y + f.vy * t - (GRAVITY * (f.du ? 3 : 1) * t * t) / 2);
  return { x: f.x + v * t, y, stun: Math.max(0, (f.sn || 0) - t) };
}

export default function DinoDashInner(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;
  const myId = Number(currentUser?.id);

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;
  const { socket } = useSocket() || {};

  const course = useMemo(() => makeCourse(seed), [seed]);
  const sim = useRef(null);
  if (sim.current === null) sim.current = newRunner();
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const size = useRef({ w: 0, h: 0, set: { w: 0, h: 0 } });
  const [broken, setBroken] = useState(false);
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);

  const [crashes, setCrashes] = useState(0);
  const [best, setBest] = useState(0);
  const [level, setLevel] = useState(1);
  const [levelUp, setLevelUp] = useState(0);
  const [banner, setBanner] = useState("idle");
  const lvTimer = useRef(null);
  useEffect(() => () => clearTimeout(lvTimer.current), []);

  // seats: colours and names, the same on every phone
  const seated = useMemo(() => (players || []).filter((p) => !p.is_spectator)
    .map((p) => ({ id: Number(p.user_id), name: p.username })).sort((a, b) => a.id - b.id), [players]);
  const seatedRef = useRef(seated);
  seatedRef.current = seated;
  const slotOf = (id) => Math.max(0, seatedRef.current.findIndex((p) => p.id === Number(id)));

  // the 3D view
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    let sc;
    try { sc = createDinoScene(c, course); } catch (e) { console.error("Dino Dash: couldn't start the 3D view", e); setBroken(true); return undefined; }
    sceneRef.current = sc;
    size.current.set = { w: 0, h: 0 };
    return () => { sc.dispose(); sceneRef.current = null; };
  }, [course]);

  // Watching. The player sends its runner while someone watches; the watcher
  // keeps the latest frames (spec) and, a few times a second, the HUD's numbers.
  const watchId = spectatorWatching?.user_id;
  const [specHud, setSpecHud] = useState(null);
  const hudAt = useRef(0);
  const spec = useSpecStream({ roomCode, isSpectator, myId, watchId,
    frame: () => {
      const s = sim.current;
      const r1 = (n) => Math.round(n * 10) / 10;
      const hit = [];
      for (const i of s.hit) if (i >= s.first) hit.push(i);
      return {
        x: r1(s.x), r: r1(s.run), y: r1(s.y), vy: Math.round(s.vy),
        du: s.duck ? 1 : 0, st: s.started ? 1 : 0, sn: Math.round(s.stun * 100) / 100,
        v: s.stun > 0 || !s.started || overRef.current ? 0 : Math.round(speedAfter(s.run, s.x)),
        p: Math.floor(s.points), cr: s.crashes, b: Math.round(s.best), fi: s.first, hit,
      };
    },
    onFrame: (f) => {
      const now = performance.now();
      if (specHud && specHud.id === watchId && now - hudAt.current < 300) return;
      hudAt.current = now;
      setSpecHud({ id: watchId, p: f.p, cr: f.cr, b: f.b, lv: levelAt(f.x) });
    },
  });
  const hud = specHud && specHud.id === watchId ? specHud : null;

  // everyone else's dinos, from the room
  const remote = useRef(new Map());
  useEffect(() => {
    if (!socket) return undefined;
    const onPos = (m) => {
      const id = Number(m.user_id);
      if (id === myId || id === Number(watchId) || m.x === undefined) return;
      const now = performance.now();
      const o = remote.current.get(id) || { sx: null };
      Object.assign(o, { f: m, at: now });
      remote.current.set(id, o);
    };
    socket.on("dino:pos", onPos);
    return () => socket.off("dino:pos", onPos);
  }, [socket, myId, watchId]);

  const render = (me, hit, dt, now) => {
    const sc = sceneRef.current;
    if (!sc) return;
    const { w, h, set } = size.current;
    if (w && h && (w !== set.w || h !== set.h)) { sc.resize(w, h); size.current.set = { w, h }; }
    const dinos = [];
    for (const [id, o] of remote.current) {
      if (now - o.at > 10000) continue;
      const p = predict(o.f, o.at, now);
      o.sx = o.sx === null || Math.abs(p.x - o.sx) > 400 ? p.x : o.sx + (p.x - o.sx) * Math.min(1, dt * 10);
      const slot = slotOf(id);
      dinos.push({ id, me: false, slot, name: seatedRef.current[slot]?.name || "", x: o.sx, y: p.y, duck: !!o.f.du, stun: p.stun,
        running: !!o.f.st && p.stun <= 0, started: !!o.f.st, crashes: o.f.k });
    }
    dinos.unshift({ ...me, me: true, name: dinos.length ? (isSpectator ? spectatorWatching?.username || "" : "You") : "" });
    sc.draw({ sx: me.x, level: levelAt(me.x), hit, dinos }, dt, now / 1000);
  };

  const canPlay = () => !overRef.current && !isSpectator;
  const press = useCallback(() => { if (canPlay()) jump(sim.current); }, [isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps
  const release = useCallback(() => releaseJump(sim.current), []);
  const duck = useCallback((on) => { if (canPlay() || !on) setDuck(sim.current, on); }, [isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Space / ↑ / W jump (hold for higher), ↓ / S duck.
  useEffect(() => {
    if (isSpectator) return undefined;
    const JUMP = [" ", "Spacebar", "ArrowUp", "w", "W"];
    const DUCK = ["ArrowDown", "s", "S"];
    const down = (e) => {
      if (JUMP.includes(e.key)) { e.preventDefault(); if (!e.repeat) press(); }
      else if (DUCK.includes(e.key)) { e.preventDefault(); duck(true); }
    };
    const up = (e) => {
      if (JUMP.includes(e.key)) release();
      else if (DUCK.includes(e.key)) duck(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [isSpectator, press, release, duck]);

  // The game loop. Runs outside React; the score is handed to the engine ten
  // times a second rather than every frame.
  useEffect(() => {
    if (isSpectator) return undefined;
    let raf;
    let last = performance.now();
    let lastPush = 0, pushed = 0, sent = 0, sentKey = "", lv = 1, shownBanner = "idle";
    const autoStart = setTimeout(() => { sim.current.started = true; }, 3000);
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));   // a hidden tab mustn't teleport the dino
      last = now;
      const s = sim.current;
      if (!overRef.current && step(s, course, dt) === "crash") {
        setCrashes(s.crashes);
        setBest(s.best);
      }
      const L = levelAt(s.x);
      if (L !== lv) {
        lv = L; setLevel(L); setLevelUp(L);
        clearTimeout(lvTimer.current);
        lvTimer.current = setTimeout(() => setLevelUp(0), 2200);
      }
      const b = !s.started ? "idle" : s.stun > 0 ? "oops" : "";
      if (b !== shownBanner) { shownBanner = b; setBanner(b); }
      if (now - lastPush > 100) {
        lastPush = now;
        const target = Math.floor(s.points);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
      }
      if (socket && roomCode && !overRef.current) {
        const key = `${s.vy > 0 ? 1 : 0}|${s.duck}|${s.crashes}|${s.started}`;
        if (key !== sentKey || now - sent > SEND_MS) {
          sentKey = key; sent = now;
          socket.emit("dino:pos", { code: roomCode, x: Math.round(s.x), y: Math.round(s.y * 10) / 10, vy: Math.round(s.vy), du: s.duck ? 1 : 0,
            st: s.started ? 1 : 0, sn: Math.round(s.stun * 100) / 100, v: s.stun > 0 || !s.started ? 0 : Math.round(speedAfter(s.run, s.x)), k: s.crashes });
        }
      }
      render({ id: myId, slot: slotOf(myId), x: s.x, y: s.y, duck: s.duck, stun: s.stun,
        running: s.started && s.stun <= 0, started: s.started, crashes: s.crashes }, s.hit, dt, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); clearTimeout(autoStart); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, course, addScore, socket, roomCode]);

  // The watcher's loop: the watched run, drawn from its frames. Distance runs
  // on at the frame's speed and is eased onto where the frames say; a jump
  // carries on under gravity. Nothing here touches the player's sim.
  useEffect(() => {
    if (!isSpectator) return undefined;
    let raf;
    let last = performance.now();
    let lastL = null;
    let shown = false;
    const s = newRunner();
    s.started = true;
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const L = spec.current;
      if (L) {
        const f = L.f;
        if (L !== lastL) {
          lastL = L;
          s.hit = new Set(f.hit || []);
          s.first = f.fi || 0;
        }
        const t = Math.min(0.35, Math.max(0, (now - L.at) / 1000));   // frames stopped: stop too
        const v = t < 0.35 ? f.v || 0 : 0;
        const goalX = f.x + v * t;
        let goalY = 0;
        if (f.y > 0 || f.vy > 0) goalY = Math.max(0, f.y + f.vy * t - (GRAVITY * (f.du ? 3 : 1) * t * t) / 2);
        if (!shown || Math.abs(goalX - s.x) > 400) { s.x = goalX; s.y = goalY; shown = true; }
        else {
          const ahead = s.x + v * dt;
          s.x = ahead + (goalX - ahead) * Math.min(1, dt * 8);
          s.y = s.y <= 0 || goalY <= 0 ? goalY : s.y + (goalY - s.y) * Math.min(1, dt * 18);
        }
        s.duck = !!f.du;
        s.started = !!f.st;
        s.stun = Math.max(0, (f.sn || 0) - t);
        s.crashes = f.cr || 0;
        course.extend(s.x + VIEW_W + 400);
        render({ id: Number(watchId), slot: slotOf(watchId), x: s.x, y: s.y, duck: s.duck, stun: s.stun,
          running: s.started && s.stun <= 0 && v > 0, started: s.started, crashes: s.crashes }, s.hit, dt, now);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, spec, watchId, course]);

  const oppList = Object.values(eng.opponents);
  const specScore = hud ? hud.p : spectatorWatching?.score ?? 0;
  const bestRun = Math.max(best, sim.current.run);
  const stats = isSpectator
    ? [
        { label: "Score", value: Number(specScore).toLocaleString() },
        ...(hud ? [{ label: "Level", value: hud.lv }, { label: "Crashes", value: hud.cr }] : []),
      ]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Level", value: level },
        { label: "Best run", value: `${Math.floor(best / UNITS_PER_METRE)}m` },
      ];

  // One big jump button. Everything can be jumped — a robot cleared 1,566
  // obstacles across 30 courses without ducking once, the middle birds
  // included — so phones get no duck button; ↓ still ducks on a keyboard.
  const controls = !isSpectator ? (
    <>
      <button className="press p-sun dino-btn dino-jump" onPointerDown={(e) => { e.preventDefault(); press(); }}
        onPointerUp={release} onPointerLeave={release} onPointerCancel={release} onContextMenu={(e) => e.preventDefault()}>
        ⬆ Jump <span className="dino-key">Space</span>
      </button>
    </>
  ) : null;

  const chip = (text, cls = "") => (
    <div style={{ position: "absolute", left: 0, right: 0, top: "10%", display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div className={`chip fl-chip ${cls}`}>{text}</div>
    </div>
  );

  return (
    <>
      <GameFrame
        gameName="Dino Dash" badge="🦖 DINO DASH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        onQuit={eng.endMatch}
        controls={controls}
      >
        {({ w, h }) => (isSpectator ? (
          <Stage w={w} h={h} canvasRef={canvasRef} size={size}>
            {!hud && !broken && chip(`Connecting to ${spectatorWatching?.username || "the player"}'s run…`)}
            {broken && chip("Couldn't start the 3D view on this phone.")}
          </Stage>
        ) : (
          <Stage w={w} h={h} canvasRef={canvasRef} size={size}
            onDown={(e) => { if (e.pointerType !== "mouse" || e.button === 0) press(); }}
            onUp={release}>
            {broken && chip("Couldn't start the 3D view on this phone.")}
            {!broken && banner === "idle" && chip("Tap or press Space to jump!")}
            {!broken && banner === "oops" && chip(`Oops! −${CRASH_COST}`, "ouch")}
            {!broken && banner === "" && levelUp > 1 && chip(`⭐ Level ${levelUp} — faster! ${SKY_NAMES[(levelUp - 1) % SKY_NAMES.length]}`, "lvl")}
          </Stage>
        ))}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`Level ${level} · Best run: ${Math.floor(bestRun / UNITS_PER_METRE)} m · Crashes: ${crashes}`} />
      )}
    </>
  );
}
