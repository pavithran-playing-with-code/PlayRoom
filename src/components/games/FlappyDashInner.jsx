// src/components/games/FlappyDashInner.jsx
// Tap to flap. Gravity does the rest. Squeeze between the towers; each one you
// clear is 10 points. A crash costs 10 and dazes the bird for a moment, then
// you carry on — the room's clock decides when the match ends, not your last
// mistake. Everyone in a room flies the same course, and sees everyone else's
// bird flying it (fly:pos), a little way behind their own.
//
// The rules live in flappySim.js; flappyScene.js draws them in 3D. Loaded
// lazily: FlappyDash.jsx is the wrapper.
//
// Watched (a spectator): the player's phone sends a small frame of its flight
// (useSpecStream) and the watcher flies the same seeded course from it,
// carrying the bird on at its speed between frames so it moves at 60 fps.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpecStream from "./useSpecStream";
import { useSocket } from "../../utils/SocketContext";
import {
  VIEW_W, VIEW_H, GROUND, BIRD_RY, PIPE_W, CRASH_COST, SPEED, GRAVITY, SPACING,
  makeCourse, newBird, flap, step,
} from "./flappySim";
import { createFlappyScene } from "./flappyScene";

const SEND_MS = 100;
const FLOOR = VIEW_H - GROUND - BIRD_RY;

// Where a bird is now, from its last message: carried on at its own physics
// (scroll at SPEED, y under gravity) for the time since — a stalled stream
// holds rather than flying off.
function predict(f, at, now) {
  const t = Math.min(0.3, Math.max(0, (now - at) / 1000));
  const stun = Math.max(0, (f.sn || 0) - t);
  const mt = f.st ? Math.max(0, t - (f.sn || 0)) : 0;
  const vy = f.vy + GRAVITY * mt;
  const y = Math.min(FLOOR, Math.max(BIRD_RY, f.y + f.vy * mt + 0.5 * GRAVITY * mt * mt));
  return { x: f.x + SPEED * mt, y, vy: mt > 0 ? vy : f.vy, stun };
}

function Stage({ w, h, canvasRef, size, onDown, label = "Flappy Dash: tap to flap", children }) {
  let cssW = Math.min(w, (h * VIEW_W) / VIEW_H);
  let cssH = (cssW * VIEW_H) / VIEW_W;
  if (cssH > h) { cssH = h; cssW = (h * VIEW_W) / VIEW_H; }
  size.current.w = Math.round(cssW); size.current.h = Math.round(cssH);
  return (
    <div className="fl-pad" style={{ width: w, height: h, position: "relative" }} onPointerDown={onDown}
      onContextMenu={(e) => e.preventDefault()}>
      <div style={{ position: "relative", width: cssW, height: cssH }}>
        <canvas ref={canvasRef} className="fl-canvas" style={{ width: cssW, height: cssH }} role="img" aria-label={label} />
        {children}
      </div>
    </div>
  );
}

export default function FlappyDashInner(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;
  const myId = Number(currentUser?.id);
  const watchId = spectatorWatching?.user_id;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;
  const { socket } = useSocket() || {};

  const course = useMemo(() => makeCourse(seed), [seed]);
  const sim = useRef(null);
  if (sim.current === null) sim.current = newBird();
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const size = useRef({ w: 0, h: 0, set: { w: 0, h: 0 } });
  const [broken, setBroken] = useState(false);
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);

  const [pipes, setPipes] = useState(0);
  const [best, setBest] = useState(0);
  const [banner, setBanner] = useState("idle");     // idle | ouch | ""

  // seats: colours and names, the same on every phone
  const seated = useMemo(() => (players || []).filter((p) => !p.is_spectator)
    .map((p) => ({ id: Number(p.user_id), name: p.username })).sort((a, b) => a.id - b.id), [players]);
  const seatedRef = useRef(seated);
  seatedRef.current = seated;
  const slotOf = (id) => Math.max(0, seatedRef.current.findIndex((p) => p.id === Number(id)));

  const tap = () => { if (!overRef.current && !isSpectator) flap(sim.current, performance.now()); };

  useEffect(() => {
    if (isSpectator) return undefined;
    const onKey = (e) => {
      if ([" ", "Spacebar", "ArrowUp", "w", "W"].includes(e.key)) { e.preventDefault(); if (!e.repeat) tap(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // rebinds each render so the handler always sees the current state

  // the 3D view
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    let sc;
    try { sc = createFlappyScene(c, course); } catch (e) { console.error("Flappy Dash: couldn't start the 3D view", e); setBroken(true); return undefined; }
    sceneRef.current = sc;
    size.current.set = { w: 0, h: 0 };
    return () => { sc.dispose(); sceneRef.current = null; };
  }, [course]);

  // everyone else's birds, from the room
  const remote = useRef(new Map());
  useEffect(() => {
    if (!socket) return undefined;
    const onPos = (m) => {
      const id = Number(m.user_id);
      if (id === myId || id === Number(watchId) || m.x === undefined) return;
      const now = performance.now();
      const o = remote.current.get(id) || { shown: null, ox: 0, oy: 0 };
      const p = predict(m, now, now);
      if (o.shown) { o.ox = o.shown.x - p.x; o.oy = o.shown.y - p.y; if (Math.abs(o.ox) > 40 || Math.abs(o.oy) > 70) { o.ox = 0; o.oy = 0; } }
      Object.assign(o, { f: m, at: now });
      remote.current.set(id, o);
    };
    socket.on("fly:pos", onPos);
    return () => socket.off("fly:pos", onPos);
  }, [socket, myId, watchId]);

  const render = (me, dt, now) => {
    const sc = sceneRef.current;
    if (!sc) return;
    const { w, h, set } = size.current;
    if (w && h && (w !== set.w || h !== set.h)) { sc.resize(w, h); size.current.set = { w, h }; }
    const birds = [];
    const ease = Math.exp(-dt / 0.08);
    for (const [id, o] of remote.current) {
      if (now - o.at > 10000) continue;
      const p = predict(o.f, o.at, now);
      o.ox *= ease; o.oy *= ease;
      const x = p.x + o.ox, y = p.y + o.oy;
      o.shown = { x, y };
      const slot = slotOf(id);
      birds.push({ id, me: false, slot, name: seatedRef.current[slot]?.name || "", x, y, vy: p.vy, started: !!o.f.st, stun: p.stun,
        flapAgo: (now - (o.at - (o.f.fa ?? 9999))) / 1000, crashes: o.f.k, pipes: o.f.pi });
    }
    birds.unshift({ ...me, me: true, name: birds.length ? (isSpectator ? spectatorWatching?.username || "" : "You") : "" });
    sc.draw({ sx: me.x, birds }, dt, now / 1000);
  };

  useEffect(() => {
    if (isSpectator) return undefined;
    let raf;
    let last = performance.now();
    let lastPush = 0, pushed = 0, sent = 0, sentKey = "", shownBanner = "idle";
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));   // a hidden tab mustn't teleport the bird
      last = now;
      const s = sim.current;
      if (!overRef.current) {
        const before = s.pipes;
        step(s, course, dt);
        if (s.pipes !== before) setPipes(s.pipes);
        // setBest with the same value is no change: the loop must not restart
        // on it, or the score it has already handed over is handed over again
        setBest(s.best);
        if (socket && roomCode) {
          const key = `${s.flapAt}|${s.crashes}|${s.started}`;
          if (key !== sentKey || now - sent > SEND_MS) {
            sentKey = key; sent = now;
            socket.emit("fly:pos", { code: roomCode, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, vy: Math.round(s.vy),
              st: s.started ? 1 : 0, sn: Math.round(s.stun * 100) / 100, fa: Math.min(9999, Math.round(now - s.flapAt)), k: s.crashes, pi: s.pipes });
          }
        }
      }
      if (now - lastPush > 100) {
        lastPush = now;
        const target = Math.floor(s.points);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
      }
      const b = !s.started ? "idle" : s.stun > 0 ? "ouch" : "";
      if (b !== shownBanner) { shownBanner = b; setBanner(b); }
      render({ id: myId, slot: slotOf(myId), x: s.x, y: s.y, vy: s.vy, started: s.started, stun: s.stun,
        flapAgo: (now - s.flapAt) / 1000, crashes: s.crashes, pipes: s.pipes }, dt, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, course, addScore, socket, roomCode]);

  // Being watched: a small picture of the flight, ~15 times a second. The
  // pipes come from the seed; only the ones a crash knocked off (`g`) and
  // where the bird is have to travel.
  const [specHud, setSpecHud] = useState(null);
  const hudKey = useRef("");
  const spec = useSpecStream({ roomCode, isSpectator, myId, watchId,
    frame: () => {
      const s = sim.current, list = course.list, g = [];
      for (let i = s.first; i < list.length && list[i].x - s.x <= VIEW_W + SPACING; i++) if (list[i].gone) g.push(i);
      return {
        x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, vy: Math.round(s.vy),
        st: s.started ? 1 : 0, sn: Math.round(s.stun * 100) / 100,
        fa: Math.min(9999, Math.round(performance.now() - s.flapAt)),
        fi: s.first, g, p: Math.floor(s.points), pi: s.pipes, r: s.run, b: s.best, k: s.crashes,
      };
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
  // bird's own physics. A new frame that disagrees with where the bird was
  // drawn is eased into over ~80ms; a big jump (a crash's hop) is taken at
  // once, as the player saw it.
  useEffect(() => {
    if (!isSpectator) return undefined;
    let raf;
    let last = performance.now();
    let seenAt = -1;
    let shown = null;
    let ox = 0, oy = 0;
    const s = newBird();
    let flapAt = -9999, crashes = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const L = spec.current;
      if (L && L.f) {
        const f = L.f;
        const p = predict(f, L.at, now);
        if (L.at !== seenAt) {
          seenAt = L.at;
          course.extend(f.x + VIEW_W + SPACING);
          const gone = new Set(f.g || []);
          for (let i = f.fi; i < course.list.length && course.list[i].x - f.x <= VIEW_W + SPACING; i++) {
            course.list[i].gone = gone.has(i);
          }
          if (s.first < f.fi || s.first > f.fi + 2) s.first = f.fi;
          if (shown) { ox = shown.x - p.x; oy = shown.y - p.y; }
          if (!shown || Math.abs(ox) > 40 || Math.abs(oy) > 70) { ox = 0; oy = 0; }
          flapAt = L.at - (f.fa ?? 9999);
          if (typeof f.k === "number") crashes = f.k;
        }
        const ease = Math.exp(-dt / 0.08);
        ox *= ease; oy *= ease;
        s.x = p.x + ox;
        s.y = p.y + oy;
        shown = { x: s.x, y: s.y };
        course.extend(s.x + VIEW_W + SPACING);
        const list = course.list;
        while (s.first < list.length && list[s.first].x - s.x + PIPE_W < -40) s.first++;
        render({ id: Number(watchId), slot: slotOf(watchId), x: s.x, y: s.y, vy: p.vy, started: !!f.st, stun: p.stun,
          flapAgo: (now - flapAt) / 1000, crashes, pipes: f.pi || 0 }, dt, now);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, spec, course, watchId]);

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
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

  const chip = (text, cls) => (
    <div style={{ position: "absolute", left: 0, right: 0, top: "14%", display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div className={`chip ${cls}`}>{text}</div>
    </div>
  );

  return (
    <>
      <GameFrame
        gameName="Flappy Dash" badge="🐤 FLAPPY DASH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        onQuit={eng.endMatch}
        controls={!isSpectator ? (
          <button className="press p-sun fl-btn" onPointerDown={(e) => { e.preventDefault(); tap(); }}
            onContextMenu={(e) => e.preventDefault()}>
            🐤 Flap <span className="dino-key">Space</span>
          </button>
        ) : null}
      >
        {({ w, h }) => (isSpectator ? (
          <Stage w={w} h={h} canvasRef={canvasRef} size={size}
            label={`Watching ${spectatorWatching?.username || "a player"} fly`}>
            {!specHud && chip(`Connecting to ${spectatorWatching?.username || "the player"}'s flight…`, "")}
            {broken && chip("Couldn't start the 3D view on this phone.", "")}
          </Stage>
        ) : (
          <Stage w={w} h={h} canvasRef={canvasRef} size={size} onDown={tap}>
            {broken && chip("Couldn't start the 3D view on this phone.", "")}
            {!broken && banner === "idle" && chip("Tap or press Space to flap!", "fl-chip")}
            {!broken && banner === "ouch" && chip(`Ouch! ${CRASH_COST}`, "fl-chip ouch")}
          </Stage>
        ))}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`Pipes cleared: ${pipes} · Best run: ${Math.max(best, sim.current.run)}`} />
      )}
    </>
  );
}
