// src/pages/Hollow.jsx
// HOLLOW HOURS — a side-on horror adventure. Two ways in: this page alone
// (/hollow: a title, Continue, the chapter for one), and a PlayRoom room
// (components/games/HollowGame.jsx: the same view, started at once, with a
// friend if the room is together).
//
// Together, each phone runs its own run and they talk over the socket
// (components/hollow/hollowNet.mjs): every phone its kid (hh:kid, ~15 a
// second), the host — the lowest seat still here — the room too (hh:room,
// ~8 a second). A friend not heard from for FRESH_MS is left out (not
// waited for, not hunted) until they're heard again.
//
// The rules are components/hollow/hollowCore.mjs, the pictures
// hollowScene.js (three.js, loaded when the page opens), the kid
// hollowKid.js, the sound hollowAudio.js. This file is input, the loop, the
// menus and the HUD. Play state lives in a ref and is stepped every frame;
// the HUD is mirrored into React state a few times a second.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { newRun, step, hint, covered, ROOM_NAMES } from "../components/hollow/hollowCore.mjs";
import { cuckooAt } from "../components/hollow/hollowChapter.mjs";
import { createHollow } from "../components/hollow/hollowScene";
import { createHollowAudio } from "../components/hollow/hollowAudio";
import { useSideways, goLandscape, toGame } from "../components/horror/LandscapeGate";
import { kidMsg, onKid, roomMsg, onRoom, dropKid, pickHost, watchMsg, onWatch } from "../components/hollow/hollowNet.mjs";
import useSpecStream from "../components/games/useSpecStream";
import { useSocket } from "../utils/SocketContext";

const KID_MS = 66, ROOM_MS = 125, FRESH_MS = 5000;

const HUD_MS = 150;
const QN = ["Low", "Medium", "High"];
const coarse = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer:coarse)").matches;
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* fine */ } },
};
const loadQ = () => { const v = store.get("hh_q", null); return v == null ? (coarse ? 0 : 1) : v; };
// How tense the moment is, 0..1, for the score: the Keeper close, or after
// you; hanging, high up near an edge, a long fall; a little under furniture;
// almost nothing on the floor.
function tensionOf(S, under) {
  const P = S.P;
  if (S.done) return 0;
  const K = S.K;
  if (S.room.name === "gallery") {
    const q = cuckooAt(S.roomT);
    if (q.ph === "warn") return 0.7;
    if (q.ph === "out") return 0.85;
  }
  if (K) {
    if (K.st === "chase" || K.st === "grab") return 1;
    const d = Math.hypot(K.x - P.x, K.z - P.z);
    const k = K.st === "search" || K.st === "go" ? (d < 8 ? 0.8 : 0.55) : K.st === "listen" ? 0.65 : d < 7 ? 0.5 : 0;
    if (k) return Math.max(k, under ? 0.3 : 0);
  }
  if (P.st === "hang") return Math.min(0.8, 0.55 + P.stT * 0.04);
  if (P.st === "air" && P.airT > 0.35) return 0.8;
  if (P.st === "climb") return 0.45;
  if (P.st === "stun") return 0.5;
  if (P.y > 3.9) return P.teeter ? 0.65 : 0.3;
  if (under) return 0.3;
  return 0.06;
}
// what each room is called, on the card as you come in, and on Continue
const ROOM_TITLES = { nursery: "The Nursery", hall: "The Hall", workshop: "The Workshop", gallery: "The Gallery", stairwell: "The Stairwell", tower: "The Bell Tower" };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function Hollow() {
  return <HollowView />;
}

// room (in a PlayRoom room): { roomCode, players, currentUser, mode, isSpectator,
// spectatorWatching, eng (the match engine), done (a ref: the chapter's won) }
export function HollowView({ room: RM = null }) {
  const navigate = useNavigate();
  const inRoom = !!(RM && RM.roomCode);
  const coop = inRoom && RM.mode === "coop" && !RM.isSpectator;
  const me = inRoom && RM.currentUser ? String(RM.currentUser.id) : "me";
  const { socket: liveSocket } = useSocket() || {};
  const socket = (RM && RM.socket) || liveSocket;          // a test can hand in its own
  const rmRef = useRef(RM);
  rmRef.current = RM;
  const net = useRef({ kidAt: 0, roomAt: 0, scoreAt: 0, ev: [], hev: [] });
  // watching (a spectator in the room): the watched player's phone sends a
  // snapshot ~15 a second; this phone draws the same room from it — no input, no sound
  const isSpec = inRoom && !!RM.isSpectator;
  const watched = useRef(null);
  useSpecStream({
    roomCode: inRoom ? RM.roomCode : null, isSpectator: isSpec, myId: inRoom && RM.currentUser ? RM.currentUser.id : null,
    watchId: isSpec && RM.spectatorWatching ? RM.spectatorWatching.user_id : null, hz: 15,
    frame: () => (sim.current && !isSpec ? watchMsg(sim.current) : null),
    onFrame: (w) => { watched.current = w; },
  });
  const rootRef = useRef(null);
  const hostRef = useRef(null);
  const sim = useRef(null);
  const scene = useRef(null);
  const three = useRef(null);
  const audio = useRef(null);
  const keys = useRef({});
  const stick = useRef(null);
  const btn = useRef({ grab: false, crouch: false });
  const queued = useRef({ jump: false, grab: false });
  const prevGrab = useRef(false);

  const [q, setQ] = useState(loadQ);
  const qRef = useRef(q);
  qRef.current = q;
  const [screen, setScreen] = useState("title");          // title | play | pause | done
  const [hud, setHud] = useState(null);
  const [best, setBest] = useState(() => store.get("hh_best", null));
  const [noGl, setNoGl] = useState(false);
  const [ready, setReady] = useState(false);
  // the furthest room reached, for Continue; and the name card as you enter a room
  const [saved, setSaved] = useState(() => store.get("hh_room", 0));
  const [card, setCard] = useState(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const [rotated, sideways] = useSideways();

  const sceneRoom = useRef(null);
  const [fade, setFade] = useState(0);
  const buildScene = useCallback((s) => {
    if (!three.current || !hostRef.current) return;
    sceneRoom.current = s.room;
    if (scene.current) { scene.current.dispose(); scene.current = null; }
    try { scene.current = createHollow(hostRef.current, three.current, { room: s.room, quality: qRef.current }); setNoGl(false); }
    catch (e) { console.error("Hollow Hours: the scene failed to build", e); setNoGl(true); }
  }, []);

  useEffect(() => {
    document.body.classList.add("in-game");
    const noMenu = (e) => e.preventDefault();
    document.addEventListener("contextmenu", noMenu);
    audio.current = createHollowAudio();
    let alive = true;
    import("three").then((m) => {
      if (!alive) return;
      three.current = m;
      const s = newRun();
      sim.current = s;
      buildScene(s);                    // the title's backdrop: the room, the kid asleep in it
      setReady(true);
    }).catch(() => { if (alive) setNoGl(true); });
    return () => {
      alive = false;
      document.body.classList.remove("in-game");
      document.removeEventListener("contextmenu", noMenu);
      audio.current.close();
      if (scene.current) scene.current.dispose();
    };
  }, [buildScene]);

  const start = useCallback((at = 0) => {
    goLandscape();
    audio.current.start();
    const s = newRun(undefined, { startAt: at, coop, me, host: coop ? false : true });
    if (coop) pickHost(s, null);
    sim.current = s;
    if (scene.current) scene.current.reset();
    keys.current = {}; stick.current = null; btn.current = { grab: false, crouch: false }; queued.current = { jump: false, grab: false };
    setScreen("play");
    setCard({ k: Date.now(), name: ROOM_TITLES[s.room.name] });
  }, [coop, me]);

  // in a room: straight in, no title (a spectator: to watching)
  useEffect(() => {
    if (!inRoom || !ready || screenRef.current !== "title") return;
    if (isSpec) { sim.current = newRun(undefined, { keeper: false }); setScreen("watch"); }
    else start(0);
  }, [inRoom, ready, start, isSpec]);

  // together: the friends' kids, and the host's room
  useEffect(() => {
    if (!coop || !socket) return undefined;
    const nameOf = (id) => { const p = (rmRef.current.players || []).find((o) => String(o.user_id) === id); return p ? p.username : "Friend"; };
    const kidIn = (m) => {
      const s = sim.current, id = String(m && m.user_id);
      if (!s || !m || id === me || !m.d) return;
      const f = onKid(s, id, m.d, nameOf(id));
      f.seenAt = performance.now();
      // their footsteps and thuds, heard and seen here too
      if (m.d.r === s.roomI) for (const e of m.d.ev || []) s.events.push({ ...e, fromFriend: true });
    };
    const roomIn = (m) => { const s = sim.current; if (s && m && m.d && String(m.user_id) !== me && !s.host) onRoom(s, m.d); };
    socket.on("hh:kid", kidIn); socket.on("hh:room", roomIn);
    return () => { socket.off("hh:kid", kidIn); socket.off("hh:room", roomIn); };
  }, [coop, socket, me]);

  // a window for tests: the run, and a way in
  useEffect(() => { window.__hollow = { sim: () => sim.current, start, screen: () => screenRef.current, sound: () => audio.current && audio.current.state() }; return () => { delete window.__hollow; }; }, [start]);

  const leave = useCallback(() => { if (rmRef.current && rmRef.current.eng) rmRef.current.eng.endMatch(); else navigate("/"); }, [navigate]);
  const pause = useCallback((v) => {
    if (!sim.current || sim.current.done) return;
    if (v && screenRef.current !== "play") return;
    setScreen(v ? "pause" : "play");
  }, []);

  const changeQ = () => { const n = (q + 1) % 3; setQ(n); store.set("hh_q", n); if (scene.current) scene.current.setQuality(n); };

  // the loop
  useEffect(() => {
    let raf, last = 0, lastHud = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - last) / 1000 || 0);
      last = ts;
      const sc = scene.current;
      let s = sim.current;
      if (!sc || !s) return;
      // watching: the room and the kid as the watched phone last said
      if (screenRef.current === "watch") {
        const w = watched.current;
        if (w && w.k) {
          if (w.k.r !== s.roomI && w.k.r >= 0) { s = newRun(undefined, { startAt: w.k.r, keeper: false }); sim.current = s; }
          onWatch(s, w);
          s.T += dt;
        }
      }
      const t = ts / 1000;
      if (screenRef.current === "title") {
        sc.title(s, dt, t);
        // the room plays on behind the title: its clock is wall time here
        audio.current.tick(dt, { cam: sc.camPos(), T: t, tension: 0, covered: false, box: s.room.box, wound: 1, room: s.room });
        return;
      }
      // together, the game goes on under the pause menu: a friend is still playing
      if (screenRef.current === "pause" && coop) step(s, {}, dt);
      if (screenRef.current === "play") {
        const k = keys.current, st = stick.current;
        let mx = (k.d || k.ArrowRight ? 1 : 0) - (k.a || k.ArrowLeft ? 1 : 0), mz = (k.w || k.ArrowUp ? 1 : 0) - (k.s || k.ArrowDown ? 1 : 0);
        if (st) { mx += st.x; mz -= st.y; }
        const grab = !!k.e || btn.current.grab;
        const I = {
          mx, mz, grab,
          jump: queued.current.jump,
          grabP: queued.current.grab || (grab && !prevGrab.current),
          crouch: btn.current.crouch || !!k.Control,
          walk: !!k.Shift,
        };
        queued.current.jump = false; queued.current.grab = false;
        prevGrab.current = grab;
        step(s, I, dt);
      }
      // into a new room: build it, and come up out of black
      if (s.room !== sceneRoom.current) {
        const moved = sceneRoom.current && s.room.name !== sceneRoom.current.name;
        buildScene(s); setFade((f) => f + 1);
        if (moved && screenRef.current === "play") {
          setCard({ k: ts, name: ROOM_TITLES[s.room.name] });
          if (!inRoom && s.roomI > store.get("hh_room", 0)) { store.set("hh_room", s.roomI); setSaved(s.roomI); }
        }
        return;
      }
      // together: who hosts, who's gone quiet, and what to tell the others
      if (coop && socket) {
        const now = performance.now(), N = net.current, R0 = rmRef.current;
        for (const f of s.friends) if (f.here && now - (f.seenAt || 0) > FRESH_MS) dropKid(s, f.id);
        pickHost(s, (R0.players || []).map((o) => String(o.user_id)));
        for (const e of s.events) { if (!e.fromHost && !e.fromFriend) N.ev.push(e); if (!e.fromFriend) N.hev.push(e); }
        if (now - N.kidAt > KID_MS || s.caught || s.out) { N.kidAt = now; socket.emit("hh:kid", { code: R0.roomCode, d: kidMsg(s, N.ev) }); N.ev = []; }
        if (s.host && now - N.roomAt > ROOM_MS) { N.roomAt = now; socket.emit("hh:room", { code: R0.roomCode, d: roomMsg(s, N.hev) }); N.hev = []; }
        if (!s.host) N.hev = [];
      }
      // in a room: how far you've got is the score; through the clock face, the chapter's won
      if (inRoom && rmRef.current.eng && ts - net.current.scoreAt > 1000) {
        net.current.scoreAt = ts;
        rmRef.current.eng.setScore(Math.min(25000, Math.max(0, s.roomI) * 1000 + (s.done ? 5000 : 0)));
        if (s.done) rmRef.current.done.current = true;
      }
      for (const e of s.events) { audio.current.play(e); sc.event(e); if (e.n === "respawn") setFade((f) => f + 1); }
      s.events.length = 0;
      const under = covered(s);
      audio.current.tick(dt, {
        cam: sc.camPos(), T: s.T, dragV: s.P.st === "drag" ? s.P.speed : 0,
        tension: screenRef.current === "play" ? tensionOf(s, under) : 0, covered: under,
        box: s.room.box, wound: screenRef.current === "pause" ? 0 : s.box.wound, room: s.room,
        K: screenRef.current === "pause" ? null : s.K,
      });
      sc.frame(s, screenRef.current === "pause" ? 0 : dt, t);
      if (s.done && s.doneT > 1.4 && screenRef.current === "play") {
        if (!inRoom) {
          const b = store.get("hh_best", null);
          if (!b || s.T < b) { store.set("hh_best", s.T); setBest(s.T); }
          store.set("hh_room", 0); setSaved(0);
        }
        setScreen("done");
      }
      if (ts - lastHud > HUD_MS) {
        lastHud = ts;
        const waitFor = s.out && !s.done ? s.friends.filter((f) => f.here && !((f.out && f.outRoom === s.roomI) || f.roomI > s.roomI)).map((f) => f.name) : [];
        setHud({ watching: screenRef.current === "watch" ? (rmRef.current && rmRef.current.spectatorWatching ? rmRef.current.spectatorWatching.username : "") : null,
          hint: hint(s), caught: !!s.caught, wait: waitFor.length ? waitFor.join(", ") : null, friends: s.friends.filter((f) => f.here).length, crouch: s.P.crouch, grab: btn.current.grab, hold: s.P.hold >= 0, st: s.P.st, stick: stick.current && { ...stick.current } });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [buildScene, coop, socket, inRoom]);

  useEffect(() => {
    const r = () => scene.current && scene.current.resize();
    window.addEventListener("resize", r);
    const ro = typeof ResizeObserver !== "undefined" && rootRef.current ? new ResizeObserver(r) : null;
    if (ro) ro.observe(rootRef.current);
    return () => { window.removeEventListener("resize", r); if (ro) ro.disconnect(); };
  }, []);

  // a phone put away, or the tab hidden: pause, and quiet
  useEffect(() => {
    const vis = () => { if (document.hidden) { if (!coop) pause(true); audio.current && audio.current.suspend(); } };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [pause, coop]);

  // keyboard, for a desk
  useEffect(() => {
    const down = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === " " || k.startsWith("Arrow")) e.preventDefault();
      if (k === "Escape" || k === "p") { if (screenRef.current === "play") pause(true); else if (screenRef.current === "pause") pause(false); return; }
      if (screenRef.current !== "play") return;
      if (e.repeat) return;
      keys.current[k] = true;
      if (k === " " || k === "k") queued.current.jump = true;
      if (k === "c") btn.current.crouch = !btn.current.crouch;
      // queued, so a tap quicker than a frame isn't lost on a slow phone
      if (k === "e") queued.current.grab = true;
    };
    const up = (e) => { keys.current[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; };
    const blur = () => { keys.current = {}; stick.current = null; btn.current.grab = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [pause]);

  // the left 45% is a stick wherever the thumb lands
  const onDown = (e) => {
    audio.current.start();
    if (screenRef.current !== "play" || e.pointerType === "mouse") return;
    const at = toGame(e, sideways.current), W = rootRef.current ? rootRef.current.clientWidth : window.innerWidth;
    if (at.x < W * 0.45 && !stick.current) {
      stick.current = { id: e.pointerId, ox: at.x, oy: at.y, x: 0, y: 0 };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
    }
  };
  const onMove = (e) => {
    const st = stick.current;
    if (!st || e.pointerId !== st.id) return;
    const at = toGame(e, sideways.current), dx = at.x - st.ox, dy = at.y - st.oy, l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / 46);
    st.x = dx / l * k; st.y = dy / l * k;
  };
  const onEnd = (e) => { if (stick.current && e.pointerId === stick.current.id) stick.current = null; };

  // buttons act on touch-down: a phone won't reliably make a click while the other thumb holds the stick
  const hold = (name, v) => (e) => {
    e.preventDefault(); e.stopPropagation();
    audio.current.start();
    if (screenRef.current !== "play") return;
    if (name === "jump") { if (v) queued.current.jump = true; return; }
    if (name === "crouch") { if (v) btn.current.crouch = !btn.current.crouch; return; }
    if (name === "grab") { if (v && !btn.current.grab) queued.current.grab = true; btn.current.grab = v; }
  };

  const h = hud;
  const playing = screen === "play" && h;

  return (
    <div className={`hh${rotated ? " hh-rot" : ""}`} ref={rootRef} data-no-fun onPointerDownCapture={() => audio.current && audio.current.start()}>
      <div className="hh-host" ref={hostRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} />
      <div className="hh-fx hh-vig" />
      <div className="hh-fx hh-grain" />
      {fade > 0 && <div key={fade} className="hh-fx hh-fade" />}
      {hud && hud.caught && <div className="hh-fx hh-caught" />}
      {card && screen === "play" && <div key={card.k} className="hh-card">{card.name}</div>}
      {hud && hud.wait && <div className="hh-wait">Through. Waiting for {hud.wait}…</div>}
      {screen === "watch" && <div className="hh-watching">{hud && hud.watching ? `Watching ${hud.watching}` : "Watching"}</div>}

      {playing && (
        <>
          <div className="hh-sub" style={{ opacity: h.hint ? 1 : 0 }}>{h.hint}</div>
          {h.stick && <div className="hh-stick" style={{ left: h.stick.ox - 46, top: h.stick.oy - 46 }}><i style={{ transform: `translate(${h.stick.x * 34}px,${h.stick.y * 34}px)` }} /></div>}
          <button type="button" className="hh-pause" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); pause(true); }} aria-label="Pause">II</button>
          {coarse && (
            <div className="hh-tb">
              <button type="button" className={`hh-crouch${h.crouch ? " on" : ""}`} onPointerDown={hold("crouch", true)}>CROUCH</button>
              <button type="button" className={`hh-grab${h.grab || h.st === "drag" ? " on" : ""}`}
                onPointerDown={hold("grab", true)} onPointerUp={hold("grab", false)} onPointerCancel={hold("grab", false)} onPointerLeave={hold("grab", false)}>
                {h.hold ? "THROW" : "GRAB"}
              </button>
              <button type="button" className="hh-jump" onPointerDown={hold("jump", true)}>JUMP</button>
            </div>
          )}
        </>
      )}

      {noGl && (
        <div className="hh-ov"><h1>HOLLOW HOURS</h1><p>This device couldn't start the 3D view (WebGL). Try another browser.</p><button onClick={() => navigate("/")}>← Leave</button></div>
      )}

      {screen === "title" && !noGl && !inRoom && (
        <div className="hh-ov hh-title">
          <button className="hh-leave" onClick={() => navigate("/")}>← Leave</button>
          <h1>HOLLOW HOURS</h1>
          <p className="hh-tag">Chapter 1 · The Clockworks</p>
          <p>You woke up somewhere in the Clockworks, very small, in a room built for someone very big. The clock on the wall is nearly at midnight. Find a way out.</p>
          <div className="hh-row">
            <button onClick={() => start(0)} disabled={!ready}>{ready ? (saved > 0 ? "Begin again" : "Begin") : "Loading…"}</button>
            {ready && saved > 0 && <button onClick={() => start(saved)}>Continue · {ROOM_TITLES[ROOM_NAMES[saved]]}</button>}
            <button onClick={changeQ}>Quality: {QN[q]}</button>
          </div>
          <p className="hh-small">
            {coarse
              ? "Left thumb moves · JUMP · hold GRAB to drag, tap it to pick up and throw · CROUCH to crawl"
              : "WASD / arrows move (W is into the room) · Space jump · hold E to grab and drag, tap E to pick up and throw · C crouch · Shift sneak · Esc pause"}
            <br />Best: {best ? mmss(best) : "none yet"}
          </p>
        </div>
      )}

      {screen === "pause" && (
        <div className="hh-ov">
          <h1 className="hh-h2">PAUSED</h1>
          <button onClick={() => pause(false)}>Resume</button>
          <button onClick={changeQ}>Quality: {QN[q]}</button>
          {inRoom ? <button onClick={leave}>Leave</button> : <button onClick={() => setScreen("title")}>Give up</button>}
        </div>
      )}

      {screen === "done" && (
        <div className="hh-ov">
          <h1 className="hh-h2">MIDNIGHT</h1>
          <p>
            You stepped out through the clock face into the cold and the moonlight, high above the sleeping town.
            Behind you, every clock in the house has stopped.
          </p>
          <p className="hh-tag">Chapter 1 · The Clockworks · the end</p>
          <p className="hh-small">
            {mmss(sim.current ? sim.current.T : 0)}
            {sim.current && sim.current.deaths ? ` · caught ${sim.current.deaths === 1 ? "once" : `${sim.current.deaths} times`}` : " · never caught"}
          </p>
          <div className="hh-row">
            {inRoom ? <button onClick={leave}>Leave</button> : (
              <>
                <button onClick={() => start(0)}>Again</button>
                <button onClick={() => setScreen("title")}>Back</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
