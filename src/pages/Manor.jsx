// src/pages/Manor.jsx
// STATION 13, solo — a first-person horror page. No room, no login, no
// navbar; the dark door in the header leads here.
//
// The rules are components/horror/s13Sim.js (on s13Core.mjs), the pictures
// s13Scene.js (three.js, loaded when the page opens), the sound s13Audio.js.
// This file is input, the loop, the menus and the HUD. Play state lives in a
// ref and is ticked every frame; the HUD is mirrored into React state a few
// times a second.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { newRun, tick, interact, toggleLight, actionLabel, timeText } from "../components/horror/s13Sim";
import { NEED } from "../components/horror/s13Core.mjs";
import { createStation } from "../components/horror/s13Scene";
import { createS13Audio } from "../components/horror/s13Audio";
import { useSideways, goLandscape, toGame } from "../components/horror/LandscapeGate";

const HUD_MS = 120;
export const QN = ["Low", "Medium", "High"];
export const coarse = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer:coarse)").matches;
export const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* fine */ } },
};
// quality and the awareness cue, kept between visits (phones start on Low)
export const loadSettings = () => { const v = store.get("s13_set", null); return { q: v && v.q != null ? v.q : coarse ? 0 : 1, aw: !v || v.aw !== false }; };

// Look: mouse or thumb. Hiding, you can only peer out through the slits.
export function lookBy(P, dx, dy) {
  if (P.hid) { P.yaw -= dx * 0.002; P.pitch = Math.max(-0.4, Math.min(0.4, P.pitch - dy * 0.002)); return; }
  P.yaw -= dx * 0.0025; P.pitch = Math.max(-1.3, Math.min(1.3, P.pitch - dy * 0.0025));
}

export default function Manor() {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const hostRef = useRef(null);
  const sim = useRef(null);
  const scene = useRef(null);
  const three = useRef(null);
  const audio = useRef(null);
  const keys = useRef({});
  const stick = useRef(null);
  const drag = useRef(null);
  const runOn = useRef(false);
  const lastMode = useRef("");

  const [set, setSet] = useState(loadSettings);
  const setRef = useRef(set);
  setRef.current = set;
  const [screen, setScreen] = useState("title");        // title | play | pause | dead | won
  const [hud, setHud] = useState(null);
  const [best, setBest] = useState(() => store.get("s13_best", null));
  const [noGl, setNoGl] = useState(false);
  const [ready, setReady] = useState(false);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  // A landscape game: if the screen stays upright, it draws itself sideways.
  const [rotated, sideways] = useSideways();

  const buildScene = useCallback((s) => {
    if (!three.current || !hostRef.current) return;
    if (scene.current) { scene.current.dispose(); scene.current = null; }
    try {
      scene.current = createStation(hostRef.current, three.current,
        { layout: s.st, items: s.items, lockers: s.lockers, quality: setRef.current.q, aware: setRef.current.aw });
    } catch (e) { setNoGl(true); }
  }, []);

  useEffect(() => {
    document.body.classList.add("in-game");
    const noMenu = (e) => e.preventDefault();
    document.addEventListener("contextmenu", noMenu);
    audio.current = createS13Audio();
    let alive = true;
    import("three").then((m) => {
      if (!alive) return;
      three.current = m;
      buildScene(newRun(1));             // the title's backdrop: a house to look round
      setReady(true);
    }).catch(() => { if (alive) setNoGl(true); });
    return () => {
      alive = false;
      document.body.classList.remove("in-game");
      document.removeEventListener("contextmenu", noMenu);
      audio.current.close();
      if (scene.current) scene.current.dispose();
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [buildScene]);

  const start = useCallback(() => {
    goLandscape();
    audio.current.start();
    const s = newRun(Math.floor(Math.random() * 1e9) + 1);
    sim.current = s;
    lastMode.current = "";
    buildScene(s);
    keys.current = {}; stick.current = null; drag.current = null; runOn.current = false;
    setScreen("play");
    if (!coarse && hostRef.current && hostRef.current.requestPointerLock) { try { const r = hostRef.current.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* fine */ } }
  }, [buildScene]);

  // a window for tests (the original's window.__game): the run, and a way in
  useEffect(() => { window.__s13 = { sim: () => sim.current, start, screen: () => screenRef.current }; return () => { delete window.__s13; }; }, [start]);

  const pause = useCallback((v) => {
    if (!sim.current || sim.current.mode !== "play") return;
    setScreen(v ? "pause" : "play");
    if (v && document.pointerLockElement) document.exitPointerLock();
  }, []);
  const toTitle = () => { sim.current = null; setScreen("title"); };

  const changeQ = () => { const q = (set.q + 1) % 3; const n = { ...set, q }; setSet(n); store.set("s13_set", n); if (scene.current) scene.current.setQuality(q); };
  const changeAw = () => { const n = { ...set, aw: !set.aw }; setSet(n); store.set("s13_set", n); if (scene.current) scene.current.setAware(n.aw); };

  // the loop
  useEffect(() => {
    let raf, last = 0, lastHud = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - last) / 1000 || 0);
      last = ts;
      const sc = scene.current, s = sim.current;
      if (!sc) return;
      const t = ts / 1000;
      if (screenRef.current === "title" || !s) { sc.title(t); return; }
      if (screenRef.current === "play" || s.mode === "dead") {
        const k = keys.current, st = stick.current;
        const ix = (k.d ? 1 : 0) - (k.a ? 1 : 0) + (st ? st.x : 0), iz = (k.w ? 1 : 0) - (k.s ? 1 : 0) - (st ? st.y : 0);
        tick(s, { ix, iz, run: !!k.Shift || runOn.current }, dt);
      }
      for (const e of s.events) { audio.current.play(e); if (e.name === "caught") sc.flash(); }
      s.events.length = 0;
      audio.current.tick(dt, s.P, [s.M], s.tlv, s.mode === "play" && screenRef.current === "play");
      sc.frame({ mode: s.mode, P: s.P, monsters: [s.M], lit: s.lit, ready: s.fuses >= NEED, itemsGot: s.items.map((i) => i.got), tlv: s.tlv, flick: s.flick, shake: s.shake, catcher: 0 }, dt, t);
      if (s.mode !== lastMode.current) {
        lastMode.current = s.mode;
        if (s.mode === "won") {
          const sec = Math.floor(s.time), b = store.get("s13_best", null);
          if (!b || sec < b) { store.set("s13_best", sec); setBest(sec); }
          if (document.pointerLockElement) document.exitPointerLock();
          setScreen("won");
        }
      }
      if (s.mode === "dead" && s.deadT > 1.6 && screenRef.current !== "dead") { if (document.pointerLockElement) document.exitPointerLock(); setScreen("dead"); }
      if (ts - lastHud > HUD_MS) {
        lastHud = ts;
        setHud({ fuses: s.fuses, area: s.area, bat: s.P.bat, stam: s.P.stam, msg: s.msg, use: actionLabel(s), fl: s.P.fl && s.P.bat > 0, run: runOn.current, stick: stick.current && { ...stick.current } });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const r = () => scene.current && scene.current.resize();
    window.addEventListener("resize", r);
    const ro = typeof ResizeObserver !== "undefined" && rootRef.current ? new ResizeObserver(r) : null;
    if (ro) ro.observe(rootRef.current);
    return () => { window.removeEventListener("resize", r); if (ro) ro.disconnect(); };
  }, []);

  // keyboard, for a desk
  useEffect(() => {
    const down = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === " ") e.preventDefault();
      if (k === "Escape" || k === "p") { if (screenRef.current === "play") pause(true); else if (screenRef.current === "pause") pause(false); return; }
      const s = sim.current;
      if (!s || screenRef.current !== "play") return;
      keys.current[k] = true;
      if (k === "f") toggleLight(s);
      if (k === "e") interact(s);
    };
    const up = (e) => { keys.current[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; };
    const blur = () => { keys.current = {}; stick.current = null; drag.current = null; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [pause]);

  // mouse look with the pointer locked (or dragged, if the lock is refused)
  useEffect(() => {
    const mm = (e) => {
      const s = sim.current;
      if (!s || screenRef.current !== "play") return;
      if (document.pointerLockElement === hostRef.current) lookBy(s.P, e.movementX, e.movementY);
      else if (drag.current && drag.current.id === "m") { lookBy(s.P, e.clientX - drag.current.x, e.clientY - drag.current.y); drag.current.x = e.clientX; drag.current.y = e.clientY; }
    };
    window.addEventListener("mousemove", mm);
    return () => window.removeEventListener("mousemove", mm);
  }, []);

  // thumbs: the left 45% moves (a stick wherever it lands), the rest looks
  const onDown = (e) => {
    const s = sim.current;
    audio.current.start();
    if (!s || screenRef.current !== "play") return;
    if (e.pointerType === "mouse") {
      if (document.pointerLockElement !== hostRef.current) {
        try { const r = hostRef.current.requestPointerLock && hostRef.current.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* fine */ }
        drag.current = { id: "m", x: e.clientX, y: e.clientY };
      }
      return;
    }
    const at = toGame(e, sideways.current), W = rootRef.current ? rootRef.current.clientWidth : window.innerWidth;
    if (at.x < W * 0.45) { if (!stick.current) stick.current = { id: e.pointerId, ox: at.x, oy: at.y, x: 0, y: 0 }; }
    else if (!drag.current) drag.current = { id: e.pointerId, x: at.x, y: at.y };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const onMove = (e) => {
    if (e.pointerType === "mouse") return;
    const s = sim.current, at = toGame(e, sideways.current), st = stick.current;
    if (st && e.pointerId === st.id) { const dx = at.x - st.ox, dy = at.y - st.oy, l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / 50); st.x = dx / l * k; st.y = dy / l * k; }
    const d = drag.current;
    if (d && d.id === e.pointerId && s) { lookBy(s.P, (at.x - d.x) * 1.4, (at.y - d.y) * 1.4); d.x = at.x; d.y = at.y; }
  };
  const onEnd = (e) => {
    if (stick.current && e.pointerId === stick.current.id) stick.current = null;
    if (drag.current && (drag.current.id === e.pointerId || (e.pointerType === "mouse" && drag.current.id === "m"))) drag.current = null;
  };
  // buttons act on touch-down: a phone won't reliably make a click while the other thumb holds the stick
  const press = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); audio.current.start(); if (sim.current && screenRef.current === "play") fn(sim.current); };

  const h = hud;
  const playing = screen === "play" && h;
  const bestText = best ? `${Math.floor(best / 60)}:${String(best % 60).padStart(2, "0")}` : "none";

  return (
    <div className={`s13${rotated ? " s13-rot" : ""}`} ref={rootRef} data-no-fun>
      <div className="s13-host" ref={hostRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} />

      {playing && (
        <>
          <div className="s13-obj">{h.fuses < NEED ? `Fuses ${h.fuses} / ${NEED}` : "Reach the elevator"}<br /><span>{h.area}</span></div>
          <S13Hud h={h} />
          {coarse && (
            <div className="s13-tb">
              <button type="button" className={`s13-use${h.use ? " on" : ""}`} onPointerDown={press(interact)}>USE</button>
              <button type="button" className={`s13-run${h.run ? " on" : ""}`} onPointerDown={press(() => { runOn.current = !runOn.current; })}>RUN</button>
              <button type="button" className={`s13-light${h.fl ? " on" : ""}`} onPointerDown={press(toggleLight)}>LIGHT</button>
              <button type="button" className="s13-pause" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); pause(true); }}>||</button>
            </div>
          )}
        </>
      )}

      {noGl && (
        <div className="s13-ov"><h1>STATION 13</h1><p>This device couldn't start the 3D view (WebGL). Try another browser.</p><button onClick={() => navigate("/")}>← Leave</button></div>
      )}

      {screen === "title" && !noGl && (
        <div className="s13-ov">
          <button className="s13-leave" onClick={() => navigate("/")}>← Leave</button>
          <h1>STATION 13</h1>
          <p>The power failed at 02:14. The last train never came. The hospital's lights are failing. Where the power holds, you can see. Everywhere else, you have only your torch. Find four fuses, restart the elevator, and do not be heard.</p>
          <div className="s13-row">
            <button onClick={start} disabled={!ready}>{ready ? "Enter" : "Loading…"}</button>
            <button onClick={changeQ}>Quality: {QN[set.q]}</button>
            <button onClick={changeAw}>Awareness cue: {set.aw ? "On" : "Off"}</button>
          </div>
          <p className="s13-small">
            WASD move · Mouse look · Shift run (loud) · F flashlight · E hide / use · Esc pause<br />
            Phone: left thumb moves, right thumb looks; RUN, LIGHT, USE on the right.<br />
            Best escape: {bestText}
          </p>
        </div>
      )}

      {screen === "pause" && (
        <div className="s13-ov">
          <h1 className="s13-h2">PAUSED</h1>
          <button onClick={() => pause(false)}>Resume</button>
          <button onClick={changeQ}>Quality: {QN[set.q]}</button>
          <button onClick={changeAw}>Awareness cue: {set.aw ? "On" : "Off"}</button>
          <button onClick={toTitle}>Abandon</button>
        </div>
      )}

      {screen === "dead" && (
        <div className="s13-ov s13-dead">
          <h1>YOU WERE FOUND</h1>
          <button onClick={start}>Try again</button>
          <button onClick={toTitle}>Back</button>
        </div>
      )}

      {screen === "won" && (
        <div className="s13-ov">
          <h1>ESCAPED</h1>
          <p>You made it out in {timeText(sim.current ? sim.current.time : 0)}. Behind the elevator doors, something keeps knocking.</p>
          <button onClick={toTitle}>Return</button>
        </div>
      )}

      {rotated && playing && <div className="s13-rothint" aria-hidden="true">↺ Turn your phone to the left</div>}
    </div>
  );
}

// The battery and stamina bars, the [E] prompt, the line at the bottom, and
// the stick under your thumb — the same in a room.
export function S13Hud({ h }) {
  const low = h.bat < 20;
  return (
    <>
      <div className="s13-hud">
        <div className="s13-bt"><i className={low ? "low" : ""} style={{ width: `${h.bat}%` }} /></div>
        <div className="s13-st" style={{ opacity: h.stam < 0.98 ? 1 : 0 }}><i style={{ width: `${h.stam * 100}%` }} /></div>
      </div>
      <div className="s13-pr">{h.use ? (coarse ? h.use : `[E] ${h.use}`) : ""}</div>
      <div className="s13-sub" style={{ opacity: h.msg ? 1 : 0 }}>{h.msg}</div>
      {h.stick && <div className="s13-stick" style={{ left: h.stick.ox - 50, top: h.stick.oy - 50 }}><i style={{ transform: `translate(${h.stick.x * 40}px,${h.stick.y * 40}px)` }} /></div>}
    </>
  );
}
