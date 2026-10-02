// src/pages/Manor.jsx
// HOLLOW MANOR — a first-person horror page. Like WICK: no room, no login,
// no navbar; the second dark door in the header leads here.
//
// The rules are components/horror/manorSim.js, the pictures manorRender.js,
// the sound manorAudio.js. This file is input, the loop, and the HUD.
//
// Play state lives in a ref and is ticked every frame; the HUD is mirrored
// into React state a dozen times a second, which is plenty for two bars and
// a line of text, and immediately after any button press.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  newNight, tick, begin, jump, decoy, doAction, actionLabel, toggleLight, toggleRun, lit, timeText, roomName,
} from "../components/horror/manorSim";
import { drawManor, lookBy, mapRect, SPRINT_PX, STICK_R } from "../components/horror/manorRender";
import { createManorAudio } from "../components/horror/manorAudio";
import { useSideways, goLandscape, toGame } from "../components/horror/LandscapeGate";

const HUD_MS = 80;
const SHOW_CAUGHT_AFTER = 1.4;     // seconds of its face before the card

const hudOf = (s) => s && ({
  mode: s.mode, night: s.night, count: s.count, need: s.need, stam: s.P.stam, bat: s.P.bat,
  light: s.P.light, lit: lit(s), runOn: s.P.runOn, tired: s.P.stamCool > 0, crouch: s.P.crouch,
  decoys: s.decoys, msg: s.msg, use: actionLabel(s), hiding: !!s.P.hiding, room: roomName(s),
});

export default function Manor() {
  const navigate = useNavigate();
  const sim = useRef(null);
  const audio = useRef(null);
  const night = useRef(1);
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const view = useRef({ W: 390, H: 844, dpr: 1, safeTop: 0 });
  const keys = useRef({});
  const stick = useRef(null);
  const look = useRef(null);
  const shown = useRef(false);

  const [screen, setScreen] = useState("menu");        // menu | game | over
  const [hud, setHud] = useState(null);
  const [over, setOver] = useState(null);              // { win, title, text, again }
  const syncHud = useCallback(() => setHud(hudOf(sim.current)), []);

  // A landscape game: if the screen stays upright, it draws itself sideways.
  const [rotated, sideways] = useSideways();
  useEffect(() => { stick.current = null; look.current = null; }, [rotated]);

  useEffect(() => {
    document.body.classList.add("in-game");
    audio.current = createManorAudio();
    return () => {
      document.body.classList.remove("in-game");
      audio.current.close();                            // or the drone follows you out
    };
  }, []);

  const newGame = useCallback(() => {
    goLandscape();                                      // a tap, so the browser allows it
    audio.current.start();
    sim.current = newNight(Math.floor(Math.random() * 1e9) + 1, night.current);
    stick.current = null;
    look.current = null;
    view.current.bigMap = false;
    shown.current = false;
    setOver(null);
    setScreen("game");
    syncHud();
  }, [syncHud]);

  // size the canvas to the screen
  useEffect(() => {
    const fit = () => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // the game's own box: the screen, or the screen turned a quarter
      const box = rootRef.current;
      const W = box ? box.clientWidth : window.innerWidth, H = box ? box.clientHeight : window.innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      const safeTop = rootRef.current ? parseFloat(getComputedStyle(rootRef.current).paddingTop) || 0 : 0;
      view.current = { W, H, dpr, safeTop, bigMap: view.current.bigMap };
    };
    fit();
    window.addEventListener("resize", fit);
    // turning the phone (or being drawn turned) changes the box, not always the window
    const ro = typeof ResizeObserver !== "undefined" && rootRef.current ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(rootRef.current);
    return () => { window.removeEventListener("resize", fit); if (ro) ro.disconnect(); };
  }, []);

  // the loop
  useEffect(() => {
    let raf, last = 0, lastHud = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - last) / 1000 || 0);
      last = ts;
      const s = sim.current;
      if (!s || screen === "menu") return;

      const k = keys.current;
      let ix = 0, iy = 0;
      if (k.a) ix--;
      if (k.d) ix++;
      if (k.w || k.ArrowUp) iy--;
      if (k.s || k.ArrowDown) iy++;
      const st = stick.current;
      if (st) {
        const dx = st.x - st.ox, dy = st.y - st.oy, l = Math.hypot(dx, dy);
        if (l > 8) { ix = dx / Math.max(l, 1) * Math.min(1, l / STICK_R); iy = dy / Math.max(l, 1) * Math.min(1, l / STICK_R); }
        st.run = l > SPRINT_PX;                          // pushed past the ring: sprint
      }
      const turn = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
      tick(s, { ix, iy, turn, shift: !!k.Shift || !!(st && st.run) }, dt);

      for (const ev of s.events) audio.current.play(ev);
      s.events.length = 0;

      if (!shown.current && (s.mode === "won" || (s.mode === "dead" && s.deadT > SHOW_CAUGHT_AFTER))) {
        shown.current = true;
        const t = timeText(s.tm);
        if (s.mode === "won") {
          night.current++;
          setOver({
            win: true, title: "You escaped", again: `Enter night ${night.current}`,
            text: `You slip out through the far gate. Time in the manor: ${t}. The next night has a bigger manor, more relics and a faster ghost.`,
          });
        } else {
          setOver({
            win: false, title: "Caught", again: "Try again",
            text: `It found you in the dark. Relics taken: ${s.count} of ${s.need}. Time: ${t}.`,
          });
        }
        setScreen("over");
      }

      const c = canvasRef.current;
      if (c) drawManor(c.getContext("2d"), s, view.current, ts / 1000, stick.current);
      if (ts - lastHud > HUD_MS) { lastHud = ts; syncHud(); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [screen, syncHud]);

  // keyboard, for a desk
  useEffect(() => {
    const down = (e) => {
      const s = sim.current;
      if (screen !== "game" || !s) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) e.preventDefault();
      if (s.mode === "intro") { begin(s); return; }
      keys.current[k] = true;
      if (k === "f") toggleLight(s);
      if (k === " ") jump(s);
      if (k === "r") toggleRun(s);
      if (k === "e") doAction(s);
      if (k === "q") decoy(s);
      syncHud();
    };
    const up = (e) => { keys.current[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; };
    const blur = () => { keys.current = {}; stick.current = null; look.current = null; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [screen, syncHud]);

  // Left thumb moves (a joystick wherever it lands), right thumb looks.
  const onDown = (e) => {
    const s = sim.current;
    if (!s) return;
    if (s.mode === "intro") { begin(s); syncHud(); return; }
    const c = canvasRef.current;
    const at = toGame(e, sideways.current);
    // the map: tap it for the big one, tap again (anywhere) to close it
    const v = view.current, m = mapRect(v);
    if (v.bigMap) { v.bigMap = false; return; }
    if (at.x >= m.x0 - 6 && at.y <= m.y0 + m.size + 18 && at.y >= m.y0 - 6) { v.bigMap = true; return; }
    if (e.pointerType === "mouse" || at.x >= view.current.W * 0.5) {
      if (!look.current) { look.current = { id: e.pointerId, lx: at.x, ly: at.y }; c.setPointerCapture(e.pointerId); }
    } else if (!stick.current) {
      stick.current = { id: e.pointerId, ox: at.x, oy: at.y, x: at.x, y: at.y };
      c.setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e) => {
    const st = stick.current, lk = look.current, s = sim.current;
    const at = toGame(e, sideways.current);
    if (st && e.pointerId === st.id) { st.x = at.x; st.y = at.y; }
    if (lk && e.pointerId === lk.id && s && s.mode === "play") { lookBy(s.P, at.x - lk.lx, at.y - lk.ly); lk.lx = at.x; lk.ly = at.y; }
  };
  const onEnd = (e) => {
    if (stick.current && e.pointerId === stick.current.id) stick.current = null;
    if (look.current && e.pointerId === look.current.id) look.current = null;
  };

  // Buttons act on touch-down, not click: a phone does not reliably turn a
  // tap into a click while the other thumb is holding the joystick, and
  // jumping a barricade mid-run is exactly that.
  const press = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (sim.current) { fn(sim.current); syncHud(); }
  };

  const playing = screen === "game" && hud && hud.mode === "play";

  return (
    <div className={`hm${rotated ? " hm-rot" : ""}`} ref={rootRef} data-no-fun>
      <canvas ref={canvasRef} className="hm-cv"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} />

      {rotated && screen === "game" && <div className="hm-rothint" aria-hidden="true">↺ Turn your phone to the left</div>}

      <div className={`hm-hud${playing ? "" : " off"}`}>
        <div>Night {hud?.night} &nbsp;·&nbsp; Relics {hud?.count} / {hud?.need}</div>
        <div className="hm-room">📍 {hud?.room}</div>
        <div className="hm-bar stam"><i style={{ width: `${(hud?.stam ?? 1) * 100}%` }} /></div>
        <div className="hm-bar bat"><i style={{ width: `${(hud?.bat ?? 1) * 100}%` }} /></div>
      </div>

      <div className="hm-msg" style={{ opacity: playing && hud.msg ? 1 : 0 }} aria-live="polite">{playing ? hud.msg : ""}</div>

      {/* Under the right thumb: jump, Use beside it (doors, hiding spots — lit
          when there is something in front of you to use), and the light
          below. Running is the stick pushed out. */}
      <div className={`hm-pad${playing ? "" : " off"}`}>
        <button className={`hm-use${hud?.use ? " on" : ""}`} onPointerDown={press(doAction)}>{hud?.use || "Use"}</button>
        <button className="hm-jump" onPointerDown={press(jump)}>Jump</button>
        <button className={`hm-light${hud?.light && hud?.bat > 0 ? " on" : ""}`} onPointerDown={press(toggleLight)}>
          {hud?.bat <= 0 ? "No power" : hud?.light ? "Light on" : "Light off"}
        </button>
      </div>
      {/* The music box lures the ghost to where you stand: used now and then,
          so it lives small, under the map. */}
      <button className={`hm-music${playing ? "" : " off"}`} style={{ opacity: hud?.decoys ? 1 : 0.45 }}
        onPointerDown={press(decoy)} title="Music box: lures the ghost to where you stand">♪ Music box · {hud?.decoys}</button>

      {screen === "menu" && (
        <div className="hm-ov">
          <button className="hm-leave" onClick={() => navigate("/")}>← Leave</button>
          <h1>Hollow Manor 3D</h1>
          <p>Relics are scattered through the rooms of the manor. Something old lives here, and it listens.</p>
          <p>Every room has a name on the map — tap the map to see it big. Hide under a table or a bed, or in a
            wardrobe, and it cannot catch you.</p>
          <p>First person now: look around, listen for its footsteps. You enter through one gate, which slams shut behind you. Take all the relics, grab batteries so your light does not die, then leave through the far gate. A red arrow shows where the ghost is when it is near.</p>
          <button className="hm-go" onClick={newGame}>Enter the manor</button>
          <p className="hm-small">
            Move: WASD. Turn: drag the mouse or use the left and right arrows. Each night gets bigger and harder.
            On a phone, left thumb moves (push it out to run) and right thumb looks. Run: Shift. Use (doors,
            hiding spots): E. Music box: Q. Light: F. Jump: Space.<br />
            Doors creak when you open them; shut one behind you and it has to stop to open it. Music box lures
            the ghost to a spot: two uses. Light on lets you see far but the ghost spots you from farther.
          </p>
        </div>
      )}

      {screen === "over" && over && (
        <div className="hm-ov">
          <button className="hm-leave" onClick={() => navigate("/")}>← Leave</button>
          <h1>{over.title}</h1>
          <p>{over.text}</p>
          <button className="hm-go" onClick={newGame}>{over.again}</button>
        </div>
      )}
    </div>
  );
}
