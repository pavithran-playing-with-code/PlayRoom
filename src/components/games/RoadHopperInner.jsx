// src/components/games/RoadHopperInner.jsx
// Road Hopper — hop your chick across roads, rivers and railways, as far as
// you can. Tap to hop forward, swipe left, right or back; or the arrow keys.
// Everyone in a room hops the same course (the seed) and sees everyone else's
// chick hopping it beside them (hop:pos); the room's clock decides it, and
// your best row counts. The rules are hopperSim.js; hopperScene.js draws them
// in 3D. Loaded lazily: RoadHopper.jsx is the wrapper.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpecStream, { specLerp } from "./useSpecStream";
import { useSocket } from "../../utils/SocketContext";
import { newHopper, hop, step, score, rowAt, HOP_S, START_COLS } from "./hopperSim.js";
import { createHopperScene, LAST } from "./hopperScene";

const SWIPE = 22;
const SEND_MS = 100;
const SAY = { car: "🚗 Splat! Look both ways", water: "💦 Splash! Only the logs are safe", edge: "🪵 Carried off the edge!", train: "🚂 Watch for the flashing light!", eagle: "🦅 Too slow — the eagle got you!" };
// which way a chick faces (the scene's chicks face +z; forward is -z)
const faceOf = (from, to) => (to[0] > from[0] ? Math.PI : to[0] < from[0] ? 0 : to[1] < from[1] ? -Math.PI / 2 : Math.PI / 2);

// where a chick is drawn this frame, from the rules' hopper
function chickOf(h, face) {
  const air = h.hop ? Math.min(1, h.hop.t / HOP_S) : -1;
  return {
    row: h.hop ? h.hop.from[0] + (h.hop.to[0] - h.hop.from[0]) * air : h.row,
    x: h.hop ? h.hop.from[1] + (h.hop.to[1] - h.hop.from[1]) * air : h.x,
    air, daze: h.daze, crashes: h.crashes, last: h.last, face,
  };
}

export default function RoadHopperInner(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;
  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;
  const { socket } = useSocket() || {};
  const myId = Number(currentUser?.id);
  const watchId = isSpectator && spectatorWatching ? Number(spectatorWatching.user_id) : null;
  // colours and start squares by seat (join order), the same on every phone
  const seated = useMemo(() => (players || []).filter((p) => !p.is_spectator)
    .map((p) => ({ id: Number(p.user_id), name: p.username })).sort((a, b) => a.id - b.id), [players]);
  const sim = useRef(null);              // a watcher keeps the watched player's chick in it
  if (sim.current === null) {
    const slot = Math.max(0, seated.findIndex((p) => p.id === myId));
    sim.current = newHopper(seed, START_COLS[slot % START_COLS.length]);
  }
  const camRef = useRef(-3);             // the eased camera, for anyone watching
  const faceRef = useRef(Math.PI);
  const seatedRef = useRef(seated);
  seatedRef.current = seated;
  const slotOf = (id) => Math.max(0, seatedRef.current.findIndex((p) => p.id === id));

  // live spectating: the chick, the camera and the course clock, ~15×/s. The
  // traffic is the seed's and runs on h.t, so the clock is all a watcher needs
  // for it; coins taken only near the camera.
  const spec = useSpecStream({
    roomCode, isSpectator, myId: currentUser?.id, watchId: spectatorWatching?.user_id,
    frame: () => {
      const h = sim.current, r3 = (v) => Math.round(v * 1000) / 1000, lo = Math.floor(h.cam) - 6;
      return {
        t: r3(h.t), r: h.row, x: r3(h.x), d: r3(h.daze), m: r3(camRef.current), fc: r3(faceRef.current),
        hp: h.hop ? [h.hop.from[0], r3(h.hop.from[1]), h.hop.to[0], h.hop.to[1], r3(h.hop.t)] : 0,
        b: h.best, c: h.coins, k: h.crashes, l: h.last,
        tk: [...h.taken].filter((n) => n >= lo && n < lo + 50),
      };
    },
  });
  const [seen, setSeen] = useState(false);   // the watcher: has a frame come yet
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [broken, setBroken] = useState(false);
  const size = useRef({ w: 300, h: 400, set: { w: 0, h: 0 } });
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);
  const [hud, setHud] = useState({ best: 0, coins: 0, crashes: 0 });
  const [msg, setMsg] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type, ms = 1400) => { setMsg({ text, type }); timers.current.push(setTimeout(() => setMsg(null), ms)); };

  // the 3D view
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    let sc;
    try { sc = createHopperScene(c, sim.current.course); } catch (e) { console.error("Road Hopper: couldn't start the 3D view", e); setBroken(true); return undefined; }
    sceneRef.current = sc;
    size.current.set = { w: 0, h: 0 };
    return () => { sc.dispose(); sceneRef.current = null; };
  }, []);

  // everyone else's chicks, from the room: each hop is played out here
  const remote = useRef(new Map());
  useEffect(() => {
    if (!socket) return undefined;
    const onPos = (m) => {
      const id = Number(m.user_id);
      if (id === myId || id === watchId || m.r === undefined) return;
      const now = performance.now();
      const course = sim.current.course;
      let f = remote.current.get(id);
      if (!f) {
        f = { row: m.r, x: m.x, hop: null, face: Math.PI, tr: m.r, tx: m.x, at: now };
        remote.current.set(id, f);
      } else if (m.k !== f.k) {
        f.row = m.r; f.x = m.x; f.hop = null;                       // crashed: put back
      } else {
        const r = rowAt(course, f.tr);
        const drift = r.kind === "river" && f.d <= 0 ? r.dir * r.speed * Math.min(1, (now - f.at) / 1000) : 0;
        if (m.r !== f.tr || Math.abs(m.x - (f.tx + drift)) > 0.6) {
          const from = [f.row, f.x], to = [m.r, m.x];
          f.hop = { from, to, t: 0 };
          f.face = faceOf(from, to);
        }
      }
      Object.assign(f, { tr: m.r, tx: m.x, at: now, d: m.d, k: m.k, l: LAST[m.l] || "", heard: now });
    };
    socket.on("hop:pos", onPos);
    return () => socket.off("hop:pos", onPos);
  }, [socket, myId, watchId]);

  const friendChicks = (dt, now) => {
    const out = [];
    const course = sim.current.course;
    for (const [id, f] of remote.current) {
      if (now - f.heard > 10000) continue;
      let air = -1;
      if (f.hop) {
        f.hop.t += dt;
        air = Math.min(1, f.hop.t / HOP_S);
        f.row = f.hop.from[0] + (f.hop.to[0] - f.hop.from[0]) * air;
        f.x = f.hop.from[1] + (f.hop.to[1] - f.hop.from[1]) * air;
        if (air >= 1) { f.hop = null; air = -1; }
      } else {
        const r = rowAt(course, f.tr);
        const drift = r.kind === "river" && f.d <= 0 ? r.dir * r.speed * Math.min(1, (now - f.at) / 1000) : 0;
        f.x += (f.tx + drift - f.x) * Math.min(1, dt * 12);
        f.row = f.tr;
      }
      f.d = Math.max(0, f.d - dt);
      const slot = slotOf(id);
      out.push({ id, me: false, slot, name: seatedRef.current[slot]?.name || "", row: f.row, x: f.x, air, daze: f.d, face: f.face, crashes: f.k, last: f.l });
    }
    return out;
  };

  const render = (h, cam, dt, now, meId) => {
    const sc = sceneRef.current;
    if (!sc) return;
    const { w, h: hh, set } = size.current;
    if (w !== set.w || hh !== set.h) { sc.resize(w, hh); size.current.set = { w, h: hh }; }
    const friends = friendChicks(dt, now);
    const me = { id: meId, me: true, slot: slotOf(meId), name: friends.length ? (isSpectator ? spectatorWatching?.username || "" : "You") : "", ...chickOf(h, faceRef.current) };
    sc.draw({ t: h.t, cam, taken: h.taken, chicks: [me, ...friends] }, dt, now / 1000);
  };

  const go = (dir) => {
    if (overRef.current || isSpectator) return;
    const h = sim.current;
    if (hop(h, dir)) faceRef.current = faceOf(h.hop.from, h.hop.to);
  };

  // keys
  useEffect(() => {
    if (isSpectator) return undefined;
    const map = { ArrowUp: "up", w: "up", " ": "up", ArrowDown: "down", s: "down", ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right" };
    const dn = (e) => { const d = map[e.key]; if (d) { e.preventDefault(); if (!e.repeat) go(d); } };
    window.addEventListener("keydown", dn);
    return () => window.removeEventListener("keydown", dn);
  });

  // thumbs: a tap hops forward, a swipe hops that way
  const touch = useRef(null);
  const onDown = (e) => { touch.current = { x: e.clientX, y: e.clientY, used: false }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ } };
  const onMove = (e) => {
    const t = touch.current;
    if (!t || t.used) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) return;
    t.used = true;
    go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  };
  const onUp = () => { const t = touch.current; touch.current = null; if (t && !t.used) go("up"); };

  useEffect(() => {
    if (isSpectator) return undefined;
    let raf, last = performance.now(), pushed = 0, lastHud = 0, cam = -3, sent = 0, sentKey = "";
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));   // never backwards: the first frame can be stamped early
      last = Math.max(last, now);
      const h = sim.current;
      if (!overRef.current) {
        const out = step(h, dt);
        if (out.crashed) flash(SAY[out.crashed] || "Ouch!", "error");
        if (out.coin) flash("🪙 +25", "success", 700);
        const target = score(h);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
        // tell the room where I am: at once when I hop or crash, else ~10×/s
        if (socket && roomCode) {
          const r = h.hop ? h.hop.to[0] : h.row, x = h.hop ? h.hop.to[1] : h.x;
          const key = `${r},${Math.round(x)},${h.crashes}`;
          if (key !== sentKey || now - sent > SEND_MS) {
            sentKey = key; sent = now;
            socket.emit("hop:pos", { code: roomCode, r, x: Math.round(x * 100) / 100, d: Math.round(h.daze * 10) / 10, l: Math.max(0, LAST.indexOf(h.last)), k: h.crashes, p: h.best });
          }
        }
      }
      // the camera: keeps the chick a little way up, eases along
      const want = Math.max(h.cam - 3, (h.hop ? h.hop.to[0] : h.row) - 3);
      cam += (want - cam) * Math.min(1, dt * 6);
      camRef.current = cam;
      render(h, cam, dt, now, myId);
      if (now - lastHud > 150) { lastHud = now; setHud({ best: h.best, coins: h.coins, crashes: h.crashes }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, addScore, socket, roomCode]);

  // the watcher: the same scene, from the frames. A clock of its own eases onto
  // the player's (the frame's t, carried on since it came), so the traffic
  // moves every frame; the chick is put where that clock says — mid-hop, or
  // riding its log — so nothing waits for the next frame.
  useEffect(() => {
    if (!isSpectator) return undefined;
    setSeen(false);
    let raf, last = performance.now(), cam = null, wt = null, at = null, k0 = null, c0 = null, lastHud = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = Math.max(last, now);
      const L = spec.current, h = sim.current;
      if (L && L.f) {
        const f = L.f;
        if (at !== L.at) {
          at = L.at;
          h.taken = new Set(f.tk || []);
          h.best = f.b; h.coins = f.c; h.crashes = f.k; h.last = f.l;
          if (typeof f.fc === "number") faceRef.current = f.fc;
          if (k0 === null) setSeen(true);
          else if (f.k > k0) flash(SAY[f.l] || "Ouch!", "error");
          else if (f.c > c0) flash("🪙 +25", "success", 700);
          k0 = f.k; c0 = f.c;
        }
        const target = f.t + Math.min(1, (now - L.at) / 1000);
        if (wt === null || Math.abs(target - wt) > 0.5) wt = target;
        else { wt += dt; wt += (target - wt) * Math.min(1, dt * 3); }
        const e = Math.max(-0.3, Math.min(0.3, wt - f.t));
        h.t = wt; h.row = f.r; h.x = f.x; h.hop = null;
        h.daze = Math.max(0, f.d - Math.max(0, e));
        if (f.hp) {
          const ht = Math.max(0, f.hp[4] + e);
          if (ht < HOP_S) h.hop = { from: [f.hp[0], f.hp[1]], to: [f.hp[2], f.hp[3]], t: ht };
          else { h.row = f.hp[2]; h.x = f.hp[3]; }
        } else if (f.d <= 0) {
          const r = rowAt(h.course, f.r);
          if (r.kind === "river") h.x = f.x + r.dir * r.speed * e;      // riding a log
        }
        const want = specLerp(spec, (g) => g.m, now);
        cam = cam === null ? want : cam + (want - cam) * Math.min(1, dt * 10);
        render(h, cam, dt, now, watchId);
        if (now - lastHud > 150) { lastHud = now; setHud({ best: h.best, coins: h.coins, crashes: h.crashes }); }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, spectatorWatching?.user_id]);

  const stats = isSpectator
    ? [
        { label: "Score", value: (seen ? score(sim.current) : Number(spectatorWatching?.score ?? 0)).toLocaleString() },
        { label: "Rows", value: hud.best },
        { label: "Coins", value: `🪙 ${hud.coins}` },
      ]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Rows", value: hud.best },
        { label: "Coins", value: `🪙 ${hud.coins}` },
      ];

  return (
    <>
      <GameFrame
        gameName="Road Hopper" badge="🐔 ROAD HOPPER"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={Object.values(eng.opponents)}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          const cw = Math.round(Math.min(w, h * 0.74)), ch = Math.round(h - 22);
          size.current.w = cw; size.current.h = ch;
          const canvas = (
            <div style={{ position: "relative", width: cw, height: ch }}>
              <canvas ref={canvasRef} className="rh-canvas" style={{ width: cw, height: ch }} role="img"
                aria-label={isSpectator ? `Road Hopper: watching ${spectatorWatching?.username || "a player"}` : "Road Hopper: tap to hop forward, swipe to hop sideways or back"} />
              {broken && <div className="rh-note muted">Couldn't start the 3D view on this phone.</div>}
              {isSpectator && !seen && !broken && <div className="rh-note muted">Connecting to {spectatorWatching?.username || "the player"}'s game…</div>}
            </div>
          );
          if (isSpectator) return (
            <div className="rh-pad" style={{ width: w, height: h }}>
              {canvas}
              <div className="rh-help muted">👀 Watching {spectatorWatching?.username}</div>
            </div>
          );
          return (
            <div className="rh-pad" data-no-fun style={{ width: w, height: h }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { touch.current = null; }}
              onContextMenu={(e) => e.preventDefault()}>
              {canvas}
              <div className="rh-help muted">Tap to hop · swipe ◀ ▶ ▼</div>
            </div>
          );
        }}
      </GameFrame>
      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`${hud.best} rows · 🪙 ${hud.coins}`} />
      )}
    </>
  );
}
