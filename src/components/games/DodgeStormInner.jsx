// src/components/games/DodgeStormInner.jsx
// An open arena and shards flying in from every edge. Move anywhere; surviving
// is the score, and skimming a shard without touching it pays a little extra.
//
// Point anywhere on the arena (drag), or hold the arrow keys. Being hit doesn't
// end the match — the room's clock does. A hit costs a few points and drops
// you into a fresh storm; everything you survived for before it stays on the
// board. Your score never goes back to zero. Friends dodge their own storms in
// the same arena, drawn as ghosts (storm:pos).
//
// The rules live in stormSim.js; stormScene.js draws them in 3D. Loaded
// lazily: DodgeStorm.jsx is the wrapper.
//
// A spectator draws the same arena from the player's frames (useSpecStream):
// the shards are sent as they are, not re-simulated — the storm is stepped by
// each phone's own frame times, so a copy would drift — and moved on by their
// velocity between frames.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpecStream from "./useSpecStream";
import { useSocket } from "../../utils/SocketContext";
import { VIEW_W, VIEW_H, EASE, newStorm, moveTo, nudge, step, totalScore } from "./stormSim";
import { createStormScene } from "./stormScene";

const RESTART_MS = 800;
const KEY_STEP = 7;
const HIT_COST = 10;               // a hit costs this; what you earned is kept
const SPEC_SHARDS = 40;            // most shards a spectator frame carries
const SPEC_AHEAD = 18;             // frames a watcher carries on past the last frame, at most
const SPEC_SMOOTH = 0.5;           // how much of a correction a watcher takes a frame
const SEND_MS = 100;
const JOY_R = 40;                  // how far the knob travels from the middle, px
const JOY_DEAD = 0.14;             // a little dead spot in the middle
// How far ahead of the runner a full push aims: the speed you picked. A push
// is eased in (squared-ish), so a small one creeps and only the edge runs.
const SPEEDS = [{ key: "slow", label: "🐢 Slow", lead: 12 }, { key: "normal", label: "🐇 Normal", lead: 19 }, { key: "fast", label: "🚀 Fast", lead: 28 }];
const SPEED_KEY = "pr_storm_speed";
const loadSpeed = () => { try { const k = localStorage.getItem(SPEED_KEY); const i = SPEEDS.findIndex((x) => x.key === k); return i >= 0 ? i : 1; } catch { return 1; } };

// A thumb stick under the arena, so a thumb never covers the runner. It
// writes the push (-1..1 each way) into `joy.current`; the loop steers by it.
// A free thumb stick: the whole strip under the arena. Put your thumb down
// anywhere in it and the ring appears right there; slide to steer; lift and
// it's gone (a faint ring in the middle shows where). It writes the push
// (-1..1 each way) into `joy.current`; the loop steers by it.
function Joystick({ joy }) {
  const zone = useRef(null), id = useRef(null), origin = useRef(null);
  const [at, setAt] = useState(null);           // where the ring is, inside the strip
  const knob = useRef(null);
  const set = (e) => {
    let dx = e.clientX - origin.current.x, dy = e.clientY - origin.current.y;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
    joy.current = { x: dx / JOY_R, y: dy / JOY_R };
    if (knob.current) knob.current.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px)`;
  };
  const down = (e) => {
    e.preventDefault();
    if (id.current !== null) return;            // one thumb steers
    id.current = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
    const r = zone.current.getBoundingClientRect();
    origin.current = { x: e.clientX, y: e.clientY };
    setAt({ x: e.clientX - r.left, y: e.clientY - r.top });
    joy.current = { x: 0, y: 0 };
  };
  const move = (e) => { if (id.current === e.pointerId && origin.current) set(e); };
  const up = (e) => {
    if (id.current !== e.pointerId) return;
    id.current = null; joy.current = null; origin.current = null;
    setAt(null);
  };
  return (
    <div className="ds-zone" ref={zone} role="application" aria-label="Steer: put your thumb anywhere here"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}>
      {at ? (
        <div className="ds-joy live" style={{ left: at.x, top: at.y }}>
          <div className="ds-joy-knob" ref={knob} />
        </div>
      ) : (
        <>
          <div className="ds-joy idle" aria-hidden="true"><div className="ds-joy-knob" /></div>
          <div className="ds-zone-help muted">Thumb anywhere here to steer</div>
        </>
      )}
    </div>
  );
}
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

function Stage({ w, h, canvasRef, size, onPoint, label, children }) {
  let cssW = Math.min(w, (h * VIEW_W) / VIEW_H);
  let cssH = (cssW * VIEW_H) / VIEW_W;
  if (cssH > h) { cssH = h; cssW = (h * VIEW_W) / VIEW_H; }
  size.current.w = Math.round(cssW); size.current.h = Math.round(cssH);
  const handle = (e) => {
    if (!onPoint) return;
    if (e.buttons === 0 && e.type === "pointermove") return;   // only while held
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return;
    onPoint((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
  };
  return (
    <div className="ds-pad" style={{ width: w, height: h }}
      onPointerDown={handle} onPointerMove={handle}
      onContextMenu={(e) => e.preventDefault()}>
      <div style={{ position: "relative", width: cssW, height: cssH }}>
        <canvas ref={canvasRef} className="ds-canvas" style={{ width: cssW, height: cssH }} role="img" aria-label={label} />
        {children}
      </div>
    </div>
  );
}

export default function DodgeStormInner(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;
  const myId = Number(currentUser?.id);
  const watchId = spectatorWatching?.user_id;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;
  const { socket } = useSocket() || {};

  const runRef = useRef(0);
  const sim = useRef(null);
  if (sim.current === null) sim.current = newStorm(seed);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const size = useRef({ w: 0, h: 0, set: { w: 0, h: 0 } });
  const [broken, setBroken] = useState(false);
  const keys = useRef({});
  const joy = useRef(null);
  const [speed, setSpeed] = useState(loadSpeed);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const nextSpeed = () => setSpeed((v) => { const n = (v + 1) % SPEEDS.length; try { localStorage.setItem(SPEED_KEY, SPEEDS[n].key); } catch { /* fine */ } return n; });
  // Every finished run's score, kept aside, so a hit never takes away what was won.
  const banked = useRef(0);
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);

  const [survived, setSurvived] = useState(0);   // this run
  const [longest, setLongest] = useState(0);     // the best of them
  const [hits, setHits] = useState(0);
  const [msg, setMsg] = useState(null);
  const timers = useRef([]);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

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
    try { sc = createStormScene(c); } catch (e) { console.error("Dodge Storm: couldn't start the 3D view", e); setBroken(true); return undefined; }
    sceneRef.current = sc;
    size.current.set = { w: 0, h: 0 };
    return () => { sc.dispose(); sceneRef.current = null; };
  }, []);

  // ── Being watched. Counters the frame carries, so the watcher can tell a
  // new graze or hit from one it has already drawn.
  const grazed = useRef(0);
  const hitCount = useRef(0);
  const shardIds = useRef(new WeakMap());
  const nextShard = useRef(1);
  const idOf = (p) => {
    let id = shardIds.current.get(p);
    if (id == null) { id = nextShard.current++; shardIds.current.set(p, id); }
    return id;
  };
  const sendFrame = () => {
    const s = sim.current;
    const sh = [];
    for (const p of s.shards) {
      if (sh.length >= SPEC_SHARDS) break;
      sh.push([idOf(p), r1(p.x), r1(p.y), r2(p.vx), r2(p.vy), r1(p.r)]);
    }
    return {
      x: r1(s.x), y: r1(s.y), tx: r1(s.tx), ty: r1(s.ty), h: s.hit ? 1 : 0,
      n: runRef.current, g: grazed.current, hi: hitCount.current,
      sc: banked.current + totalScore(s), al: Math.floor(s.frame / 60), sh,
    };
  };

  // The watcher's side: the newest frame, and what is on its screen now.
  const shown = useRef(null);       // { x, y, shards: Map(id → {x, y, r}) }
  const [watched, setWatched] = useState(null);   // { sc, al, hi } for the HUD
  const onFrame = (f) => {
    const was = spec.current && spec.current.prev;
    if (was) {
      if (f.h && !was.h) setMsg({ text: "Hit!", type: "error" });
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
  useEffect(() => {
    shown.current = null;
    setWatched(null);
    setMsg(null);
  }, [watchId]);

  // everyone else's runners, from the room
  const remote = useRef(new Map());
  useEffect(() => {
    if (!socket) return undefined;
    const onPos = (m) => {
      const id = Number(m.user_id);
      if (id === myId || id === Number(watchId) || m.x === undefined) return;
      const o = remote.current.get(id) || { x: m.x, y: m.y };
      Object.assign(o, { tx: m.x, ty: m.y, h: m.h, n: m.n, g: m.g, at: performance.now() });
      remote.current.set(id, o);
    };
    socket.on("storm:pos", onPos);
    return () => socket.off("storm:pos", onPos);
  }, [socket, myId, watchId]);

  const render = (me, shards, dt, now) => {
    const sc = sceneRef.current;
    if (!sc) return;
    const { w, h, set } = size.current;
    if (w && h && (w !== set.w || h !== set.h)) { sc.resize(w, h); size.current.set = { w, h }; }
    const runners = [];
    for (const [id, o] of remote.current) {
      if (now - o.at > 10000) continue;
      o.x += (o.tx - o.x) * Math.min(1, dt * 12);
      o.y += (o.ty - o.y) * Math.min(1, dt * 12);
      const slot = slotOf(id);
      runners.push({ id, me: false, slot, name: seatedRef.current[slot]?.name || "", x: o.x, y: o.y, hit: !!o.h, run: o.n, grazes: o.g });
    }
    runners.unshift({ ...me, me: true, name: runners.length ? (isSpectator ? spectatorWatching?.username || "" : "You") : "" });
    sc.draw({ shards, runners }, dt, now / 1000);
  };

  const onPoint = (u, v) => {
    if (overRef.current || isSpectator) return;
    const p = sceneRef.current?.toSim(u, v);
    if (p) moveTo(sim.current, p.x, p.y);
  };

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
    let pushed = 0, sent = 0, sentKey = "";
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
        const j = joy.current;
        const mag = j ? Math.min(1, Math.hypot(j.x, j.y)) : 0;
        if (mag > JOY_DEAD) {
          const k = Math.pow((mag - JOY_DEAD) / (1 - JOY_DEAD), 1.7) * SPEEDS[speedRef.current].lead;
          moveTo(s, s.x + (j.x / mag) * k, s.y + (j.y / mag) * k);
        }

        const out = step(s, dt);
        if (out.grazes) grazed.current += out.grazes;
        if (out.hit) {
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
      const cur = sim.current;
      if (socket && roomCode && !overRef.current) {
        const key = `${cur.hit}|${runRef.current}|${grazed.current}`;
        if (key !== sentKey || now - sent > SEND_MS) {
          sentKey = key; sent = now;
          socket.emit("storm:pos", { code: roomCode, x: r1(cur.x), y: r1(cur.y), h: cur.hit ? 1 : 0, n: runRef.current, g: grazed.current });
        }
      }
      // the run counter flips at the hit; the new storm comes a moment later
      render({ id: myId, slot: slotOf(myId), x: cur.x, y: cur.y, hit: cur.hit, run: cur.hit ? runRef.current - 1 : runRef.current, grazes: grazed.current },
        cur.shards.map((p) => ({ id: idOf(p), x: p.x, y: p.y, r: p.r })), dt / 60, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, addScore, seed, socket, roomCode]);

  useEffect(() => {
    if (!isSpectator) return undefined;
    let raf, last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const L = spec.current;
      if (L && L.f) {
        const f = L.f;
        const e = Math.min(SPEC_AHEAD, Math.max(0, (now - L.at) / (1000 / 60)));
        // where the player is by now: still closing on their target, as the sim does
        const close = Math.pow(1 - EASE, e);
        const px = f.tx + (f.x - f.tx) * close;
        const py = f.ty + (f.y - f.ty) * close;
        let v = shown.current;
        if (!v) v = shown.current = { x: px, y: py, shards: new Map() };
        v.x += (px - v.x) * SPEC_SMOOTH;
        v.y += (py - v.y) * SPEC_SMOOTH;
        // shards fly straight, so carrying them on by their velocity is exact
        // until the next frame; a known one eases there, a new one appears
        const next = new Map();
        for (const [id, x, y, vx, vy, r] of f.sh || []) {
          const tx = x + vx * e, ty = y + vy * e;
          const old = v.shards.get(id);
          next.set(id, old
            ? { id, x: old.x + (tx - old.x) * SPEC_SMOOTH, y: old.y + (ty - old.y) * SPEC_SMOOTH, r }
            : { id, x: tx, y: ty, r });
        }
        v.shards = next;
        render({ id: Number(watchId), slot: slotOf(watchId), x: v.x, y: v.y, hit: !!f.h, run: f.h ? f.n - 1 : f.n, grazes: f.g },
          [...v.shards.values()], dt, now);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, spec, watchId]);

  const oppList = Object.values(eng.opponents);
  const shownScore = isSpectator ? (watched ? watched.sc : (spectatorWatching?.score ?? 0)) : eng.score;
  const shownAlive = isSpectator ? (watched ? watched.al : 0) : survived;
  const shownHits = isSpectator ? (watched ? watched.hi : 0) : hits;
  const stats = [
    { label: "Score", value: Number(shownScore).toLocaleString() },
    { label: "Alive", value: `${shownAlive}s` },
    ...(shownHits ? [{ label: "Hits", value: shownHits }] : []),
  ];
  const note = (text) => (
    <div className="muted" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", padding: 16, pointerEvents: "none", color: "#e8e0ff" }}>{text}</div>
  );

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
        controls={!isSpectator ? <Joystick joy={joy} /> : null}
      >
        {({ w, h }) => (
          <Stage w={w} h={h} canvasRef={canvasRef} size={size} onPoint={isSpectator ? null : onPoint}
            label={isSpectator ? `Dodge Storm: watching ${spectatorWatching?.username || "a player"}` : "Dodge Storm: keep away from the shards"}>
            {broken && note("Couldn't start the 3D view on this phone.")}
            {!isSpectator && (
              <button type="button" className="ds-speed" onPointerDown={(e) => e.stopPropagation()} onClick={nextSpeed}
                aria-label={`Speed: ${SPEEDS[speed].label}. Tap to change`}>
                {SPEEDS[speed].label}
              </button>
            )}
            {isSpectator && !watched && !broken && note(`Connecting to ${spectatorWatching?.username ? `${spectatorWatching.username}'s` : "the"} storm…`)}
          </Stage>
        )}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`Longest run: ${longest}s${hits ? ` · Hits: ${hits}` : ""}`} />
      )}
    </>
  );
}
