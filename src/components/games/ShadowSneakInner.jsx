// src/components/games/ShadowSneakInner.jsx
// SHADOW SNEAK. A lighthouse in the middle of a dark maze sweeps its beam
// round; walls throw real shadows. Creep from your corner to the lighthouse,
// shadow to shadow, and switch it off — then a bigger maze with two beams,
// low walls you must duck behind, a third beam. A landscape game (GameFrame
// turns it on a phone held upright): the stick under your left thumb, Duck
// under your right.
//
// Caught in the light for a third of a second and you're spotted: back in
// your corner. The room's clock ends the match, not a lamp going out: every
// lamp is points, and the next maze is ready at once.
//
//   alone / against each other   everyone sneaks the same grounds from their
//       own corner, on their own (you see each other creeping); most points wins
//   together (mode "coop")       one ground for all of you. The lamp goes
//       out only when EVERYONE is at its door. Stand on a bell and the lamp
//       turns to stare at it for as long as you stay — your friends run
//       while it does. Anyone spotted makes it turn faster for a while.
//       Lamps put out together reach the goal: that's the win.
//
// The rules are sneakSim.js (pure; scripts/check-sneak.mjs has a bot beat
// every ground unseen); sneakScene.js draws them. Each phone runs its own
// sneaker and tells the room where it is (sn:pos, relayed by
// config/socket.js) and when it was spotted (sn:ev). Loaded lazily:
// ShadowSneak.jsx is the wrapper. A watcher draws the player's frames
// (useSpecStream).
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpecStream from "./useSpecStream";
import { useSocket } from "../../utils/SocketContext";
import FloatStick from "../together/FloatStick";
import { buildLevel, newRun, step, beamAngles, heated, progressPoints, offPoints, PTS } from "./sneakSim";
import { createSneakScene } from "./sneakScene";

const SEND_MS = 100;
const NEXT_MS = 1700;              // the lamp is out: this long to enjoy it, then the next ground
const FRESH_MS = 4000;             // a friend not heard from for this long isn't waited for
const STICK_R = 44;
const r2 = (v) => Math.round(v * 100) / 100;
// together: lamps to put out for the win — more with a longer clock
export const lampGoal = (secs) => (secs === 0 ? 3 : secs <= 150 ? 2 : 4);
const TWIST = { 1: "Two beams now!", 2: "Low walls: hold Duck to hide behind them", 3: "The biggest maze", 6: "Three beams!" };

export default function ShadowSneakInner(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null, mode } = props;
  const myId = Number(currentUser?.id);
  const watchId = spectatorWatching?.user_id;
  const coop = mode === "coop" && !!roomCode;
  const goal = lampGoal(durationSeconds);
  const { socket } = useSocket() || {};

  const offs = useRef(0);                         // lamps put out
  const eng = useGameEngine({
    roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: () => ({ pairs_matched: coop && offs.current >= goal ? 1 : 0 }),
  });
  const { setScore } = eng;
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);

  // the match clock: the lamp's angle comes from it, so every phone sees the same sweep
  const anchor = useRef(null);
  if (anchor.current === null) {
    let gone = 0;
    if (startedAt && serverNow) { const g = (new Date(serverNow).getTime() - new Date(startedAt).getTime()) / 1000; if (Number.isFinite(g)) gone = Math.max(0, Math.min(g, durationSeconds || Infinity)); }
    anchor.current = performance.now() - gone * 1000;
  }

  // seats: a colour and a corner each, the same on every phone
  const seated = useMemo(() => (players || []).filter((p) => !p.is_spectator)
    .map((p) => ({ id: Number(p.user_id), name: p.username })).sort((a, b) => a.id - b.id), [players]);
  const seatedRef = useRef(seated);
  seatedRef.current = seated;
  const slotOf = (id) => Math.max(0, seatedRef.current.findIndex((p) => p.id === Number(id)));
  const nameOf = (id) => seatedRef.current.find((p) => p.id === Number(id))?.name || "A friend";

  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const size = useRef({ w: 0, h: 0, set: { w: 0, h: 0 } });
  const [broken, setBroken] = useState(false);
  const live = useRef(null);                      // { level, W, S, bank, nextAt, spots }
  // for tests: each sneaker's run, by player id
  useEffect(() => { const all = (window.__sn = window.__sn || {}); all[myId] = live; return () => { delete all[myId]; }; }, [myId]);
  const stick = useRef(null), knobRef = useRef(null), duck = useRef(false), keys = useRef({});
  const [ducking, setDucking] = useState(false);
  const press = (on) => (e) => { e.preventDefault(); duck.current = on; setDucking(on); };
  const remotes = useRef(new Map());              // id -> { x, z, f, dk, dn, in, lv, bl, at }
  const [hud, setHud] = useState({ level: 0, spots: 0, offs: 0, in: false, wait: "", bell: false, held: false, hot: false, dir: 0, far: 0, seen: 0 });
  const [msg, setMsg] = useState(null);
  const msgT = useRef(null);
  const say = (text, type = "info", ms = 2600) => { setMsg({ text, type }); clearTimeout(msgT.current); msgT.current = setTimeout(() => setMsg(null), ms); };
  const sayRef = useRef(say);
  sayRef.current = say;
  useEffect(() => () => clearTimeout(msgT.current), []);

  const startLevel = (level, T, bank) => {
    const W = buildLevel(seed, level, { coop });
    const S = newRun(W, slotOf(myId), T);
    live.current = { level, W, S, bank, nextAt: 0, spots: live.current ? live.current.spots : 0 };
    if (sceneRef.current) sceneRef.current.setLevel(W);
    if (level > 0) sayRef.current(`Lamp ${level + 1}${TWIST[level] ? ` — ${TWIST[level]}` : ""}`, "info", 3000);
    else sayRef.current(coop ? "Reach the lighthouse together — stay out of its beam" : "Sneak to the lighthouse — stay out of its beam", "info", 4000);
  };

  // the 3D view
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    let sc;
    try { sc = createSneakScene(c); } catch (e) { console.error("Shadow Sneak: couldn't start the 3D view", e); setBroken(true); return undefined; }
    sceneRef.current = sc;
    size.current.set = { w: 0, h: 0 };
    if (live.current) sc.setLevel(live.current.W);
    return () => { sc.dispose(); sceneRef.current = null; };
  }, []);

  // friends: where they are, and when one is spotted (together: the lamp speeds up)
  useEffect(() => {
    if (!socket) return undefined;
    const onPos = (m) => {
      const id = Number(m.user_id);
      if (id === myId || m.x === undefined) return;
      remotes.current.set(id, { ...m, id, at: performance.now() });
    };
    const onEv = (m) => {
      const L = live.current;
      if (!coop || !L || Number(m.user_id) === myId || m.k !== "spot" || m.lv !== L.level) return;
      L.S.heats.push(Number(m.t) || 0);
      sayRef.current(`🔥 ${nameOf(m.user_id)} was spotted — the lamp speeds up!`, "error", 2600);
    };
    socket.on("sn:pos", onPos); socket.on("sn:ev", onEv);
    return () => { socket.off("sn:pos", onPos); socket.off("sn:ev", onEv); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, myId, coop]);

  // being watched: a small picture of my game
  const sendFrame = () => {
    const L = live.current;
    if (!L) return null;
    const S = L.S;
    return { lv: L.level, x: r2(S.x), z: r2(S.z), f: r2(S.face), dk: S.duck ? 1 : 0, dn: S.down > 0 ? 1 : 0, in: S.in ? 1 : 0,
      sn: r2(S.seen), gr: S.grace > 0 ? 1 : 0, mv: r2(S.moving), b0: r2(S.b0), ht: heated((performance.now() - anchor.current) / 1000, S.heats) ? 1 : 0,
      of: L.nextAt ? 1 : 0, sc: eng.score, sp: L.spots, n: offs.current };
  };
  const [watched, setWatched] = useState(null);
  const spec = useSpecStream({ roomCode, isSpectator, myId: currentUser?.id, watchId, frame: sendFrame,
    onFrame: (f) => setWatched((v) => (v && v.sc === f.sc && v.sp === f.sp && v.lv === f.lv && v.n === f.n ? v : { sc: f.sc, sp: f.sp, lv: f.lv, n: f.n })) });
  useEffect(() => { setWatched(null); }, [watchId]);

  useEffect(() => {
    if (isSpectator) return undefined;
    const down = (e) => { keys.current[e.key.toLowerCase()] = true; if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) e.preventDefault(); };
    const up = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [isSpectator]);

  const fit = () => {
    const sc = sceneRef.current, { w, h, set } = size.current;
    if (sc && w && h && (w !== set.w || h !== set.h)) { sc.resize(w, h); size.current.set = { w, h }; }
  };
  const others = (level, now) => {
    const out = [];
    for (const r of remotes.current.values()) {
      if (now - r.at > FRESH_MS || r.lv !== level || r.id === Number(watchId)) continue;
      const slot = slotOf(r.id);
      out.push({ id: r.id, slot, name: seatedRef.current[slot]?.name || "", x: r.x, z: r.z, face: r.f, duck: !!r.dk, down: r.dn ? 1 : 0, in: !!r.in });
    }
    return out;
  };

  // ── playing ──
  useEffect(() => {
    if (isSpectator) return undefined;
    if (!live.current) startLevel(0, (performance.now() - anchor.current) / 1000, 0);
    let raf, last = performance.now(), sent = 0, sentKey = "", pushed = -1, lastHud = 0;
    const tell = (k, extra) => { if (socket && roomCode) socket.emit("sn:ev", { code: roomCode, k, ...extra }); };
    const frame = (now) => {
      // real time, whatever the frame rate: a slow phone takes several small steps a frame
      const dt = Math.min(0.3, Math.max(0, (now - last) / 1000));
      last = now;
      const T = (now - anchor.current) / 1000;
      let L = live.current;
      const S = L.S, W = L.W, sc = sceneRef.current;
      const mates = coop ? [...remotes.current.values()].filter((r) => now - r.at < FRESH_MS) : [];
      if (!overRef.current) {
        // together: a friend already on a later ground — on we go
        const ahead = mates.reduce((m, r) => Math.max(m, r.lv || 0), L.level);
        if (ahead > L.level && !L.nextAt) {
          startLevel(ahead, T, L.bank + progressPoints(S));
          raf = requestAnimationFrame(frame);
          return;
        }
        const k = keys.current, st = stick.current;
        let mx = 0, mz = 0;
        if (k.arrowleft || k.a) mx -= 1;
        if (k.arrowright || k.d) mx += 1;
        if (k.arrowup || k.w) mz -= 1;
        if (k.arrowdown || k.s) mz += 1;
        if (st) {
          const dx = st.x - st.ox, dy = st.y - st.oy, l = Math.hypot(dx, dy);
          if (l > 6) { mx = (dx / l) * Math.min(1, l / STICK_R); mz = (dy / l) * Math.min(1, l / STICK_R); }
          if (knobRef.current) { const c = Math.min(l, STICK_R) / (l || 1); knobRef.current.style.transform = `translate(${dx * c}px, ${dy * c}px)`; }
        } else if (knobRef.current) knobRef.current.style.transform = "";
        const here = mates.filter((r) => r.lv === L.level);
        const rung = here.reduce((m, r) => (r.bl >= 0 && (m < 0 || r.bl < m) ? r.bl : m), -1);
        const evs = [];
        if (!L.nextAt) for (let left = dt; left > 1e-4;) {
          const h = Math.min(left, 1 / 30);
          left -= h;
          evs.push(...step(S, W, { mx, mz, duck: duck.current || k.shift || k[" "] }, h, T - left, rung));
        }
        for (const e of evs) {
          if (e.k === "bell") { sc?.cheer("bell", S.x, S.z); sayRef.current("🔔 The lamp is staring at you — friends, run!", "info", 2600); }
          else if (e.k === "spotted") {
            L.spots++; L.bank -= PTS.spotted;
            if (coop) { S.heats.push(T); tell("spot", { lv: L.level, t: r2(T) }); }
          }
          else if (e.k === "in" && coop && here.some((r) => !r.in)) sayRef.current("You're at the door — the lamp goes out when everyone is", "info", 3000);
        }
        // the lamp goes out: mine at once; together, when everyone here is at the door
        if (S.in && !L.nextAt && (!coop || here.every((r) => r.in))) {
          L.bank += progressPoints(S) + offPoints(S);
          L.nextAt = now + NEXT_MS;
          offs.current += 1;
          sc?.cheer("off");
          sayRef.current(coop && offs.current === goal ? "💡 Lights out — that's the goal! Keep going" : `💡 Lights out! +${offPoints(S)}`, "success", 1800);
        }
        if (L.nextAt && now >= L.nextAt) { startLevel(L.level + 1, T, L.bank); L = live.current; }
        const total = Math.max(0, L.bank + (L.nextAt ? 0 : progressPoints(L.S)));
        if (total !== pushed) { pushed = total; setScore(total); }
      }
      // tell the room
      const C = live.current, P = C.S;
      if (socket && roomCode && !overRef.current) {
        const key = `${C.level}|${P.duck}|${P.down > 0}|${P.in}|${P.bell}`;
        if (key !== sentKey || now - sent > SEND_MS) {
          sentKey = key; sent = now;
          socket.emit("sn:pos", { code: roomCode, x: r2(P.x), z: r2(P.z), f: r2(P.face), dk: P.duck ? 1 : 0, dn: P.down > 0 ? 1 : 0, in: P.in ? 1 : 0, lv: C.level, bl: P.bell });
        }
      }
      // draw
      fit();
      const rungNow = [...new Set([P.bell, ...mates.filter((r) => r.lv === C.level).map((r) => r.bl)].filter((b) => b >= 0))];
      const hot = heated(T, P.heats);
      sceneRef.current?.draw({
        me: { id: myId, slot: slotOf(myId), name: "", x: P.x, z: P.z, face: P.face, duck: P.duck, moving: P.moving, seen: P.seen, down: P.down, grace: P.grace, in: P.in },
        others: others(C.level, now), beams: beamAngles(C.W, P), heat: hot, off: !!C.nextAt, rung: rungNow,
      }, dt, now / 1000);
      if (now - lastHud > 120) {
        lastHud = now;
        const dx = C.W.c + 0.5 - P.x, dz = C.W.c + 0.5 - P.z;
        const waitFor = coop && P.in && !C.nextAt ? mates.filter((r) => r.lv === C.level && !r.in).map((r) => nameOf(r.id)).join(", ") : "";
        const next = { level: C.level, spots: C.spots, offs: offs.current, in: P.in, wait: waitFor, bell: P.bell >= 0, held: !!P.held, hot,
          dir: Math.round((Math.atan2(dx, -dz) * 180) / Math.PI / 5) * 5, far: Math.round(Math.hypot(dx, dz)), seen: P.seen > 0.05 && P.down <= 0 ? 1 : 0 };
        setHud((h) => (Object.keys(next).every((q) => h[q] === next[q]) ? h : next));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, socket, roomCode, coop, seed, setScore, goal]);

  // ── watching ──
  useEffect(() => {
    if (!isSpectator) return undefined;
    let raf, last = performance.now(), W = null, lv = -1;
    const shown = { x: 0, z: 0, b0: 0, set: false };
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const Lf = spec.current, f = Lf && Lf.f;
      if (f && sceneRef.current) {
        if (f.lv !== lv) { lv = f.lv; W = buildLevel(seed, lv, { coop }); sceneRef.current.setLevel(W); shown.set = false; }
        if (!shown.set) { shown.x = f.x; shown.z = f.z; shown.b0 = f.b0; shown.set = true; }
        shown.x += (f.x - shown.x) * Math.min(1, dt * 12); shown.z += (f.z - shown.z) * Math.min(1, dt * 12);
        let d = f.b0 - shown.b0; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        shown.b0 += d * Math.min(1, dt * 12);
        fit();
        sceneRef.current.draw({
          me: { id: Number(watchId), slot: slotOf(watchId), name: "", x: shown.x, z: shown.z, face: f.f, duck: !!f.dk, moving: f.mv, seen: f.sn, down: f.dn ? 1 : 0, grace: f.gr ? 1 : 0, in: !!f.in },
          others: others(lv, now), beams: beamAngles(W, { b0: shown.b0 }), heat: !!f.ht, off: !!f.of, rung: [],
        }, dt, now / 1000);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, spec, watchId, seed, coop]);

  const oppList = Object.values(eng.opponents);
  // together it's one team: its points, not each player's
  const teamScore = eng.score + oppList.reduce((n, o) => n + (Number(o.score) || 0), 0);
  const shownScore = isSpectator ? (watched ? watched.sc : (spectatorWatching?.score ?? 0)) : coop ? teamScore : eng.score;
  const lampNo = (isSpectator ? (watched ? watched.lv : 0) : hud.level) + 1;
  const spots = isSpectator ? (watched ? watched.sp : 0) : hud.spots;
  const out = isSpectator ? (watched ? watched.n : 0) : hud.offs;
  const stats = [
    { label: coop && !isSpectator ? "Team" : "Score", value: Number(shownScore).toLocaleString() },
    coop ? { label: "Lamps out", value: `${out}/${goal}` } : { label: "Lamp", value: lampNo },
    ...(spots ? [{ label: "Spotted", value: spots }] : []),
  ];
  const note = (text) => (
    <div className="muted" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", padding: 16, pointerEvents: "none", color: "#e8e0ff" }}>{text}</div>
  );

  return (
    <>
      <GameFrame
        gameName="Shadow Sneak" badge="🔦 SHADOW SNEAK"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={coop ? [] : oppList}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
        controls={!isSpectator ? (
          <div className="kr-controls md-controls">
            <FloatStick stick={stick} knobRef={knobRef} label="Move" />
            <div className="md-btns">
              <button type="button" className={`press ${ducking ? "p-mint" : "p-sun"} kr-use sn-duck`} aria-pressed={ducking} aria-label="Duck (hold)"
                onPointerDown={press(true)} onPointerUp={press(false)} onPointerCancel={press(false)} onPointerLeave={press(false)}>
                Duck
              </button>
            </div>
          </div>
        ) : null}
        landscape
      >
        {({ w, h }) => {
          size.current.w = Math.max(1, Math.round(w)); size.current.h = Math.max(1, Math.round(h));
          return (
            <div className="sn-pad" style={{ width: w, height: h }} onContextMenu={(e) => e.preventDefault()}>
              <div className={`sn-stage${hud.seen ? " seen" : ""}`} style={{ width: w, height: h }}>
                <canvas ref={canvasRef} className="sn-canvas" style={{ width: w, height: h }} role="img"
                  aria-label={isSpectator ? `Shadow Sneak: watching ${spectatorWatching?.username || "a player"}` : "Shadow Sneak: reach the lighthouse without being caught in its beam"} />
                {broken && note("Couldn't start the 3D view on this phone.")}
                {isSpectator && !watched && !broken && note(`Connecting to ${spectatorWatching?.username ? `${spectatorWatching.username}'s` : "the"} game…`)}
                {!isSpectator && !hud.in && (
                  <div className="sn-compass" aria-label={`The lighthouse is ${hud.far} metres away`}>
                    <i style={{ transform: `rotate(${hud.dir}deg)` }} aria-hidden="true">↑</i>{hud.far} m
                  </div>
                )}
                {!isSpectator && hud.hot && <div className="sn-chip hot">🔥 The lamp is turning faster</div>}
                {!isSpectator && hud.bell && <div className="sn-chip bell">🔔 It's staring at you — stay while they run</div>}
                {!isSpectator && !hud.bell && hud.held && <div className="sn-chip bell">🔔 A friend is holding the lamp — go!</div>}
                {!isSpectator && hud.in && hud.wait && <div className="sn-wait">At the door. Waiting for {hud.wait}…</div>}
              </div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`Lamps put out: ${hud.offs}${coop ? ` of ${goal}` : ""}${hud.spots ? ` · Spotted: ${hud.spots}` : ""}`} />
      )}
    </>
  );
}
