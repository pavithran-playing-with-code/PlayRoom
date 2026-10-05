// src/pages/Manor.jsx
// NANA'S LULLABY — a first-person horror page. No room, no login,
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
  newNight, tick, begin, doAction, actionLabel, toggleRun, toggleLight, timeText, roomName, listening,
} from "../components/horror/manorSim";
import { drawManor, lookBy, mapRect, SPRINT_PX, STICK_R, METRES_PER_TILE } from "../components/horror/manorRender";
import { createManorAudio } from "../components/horror/manorAudio";
import { useSideways, goLandscape, toGame } from "../components/horror/LandscapeGate";

const HUD_MS = 80;
const SHOW_CAUGHT_AFTER = 1.4;     // seconds of its face before the card

// The nearest key you haven't found: which room, how far. And Nana: how far.
const toward = (s) => {
  const P = s.P, m = (d) => Math.round(d * METRES_PER_TILE);
  const left = s.relics.filter((r) => !r.got).sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y));
  const k = left[0];
  const door = { x: s.exitT.x + 0.5, y: s.exitT.y + 0.5 };
  const nana = Math.hypot(s.G.x - P.x, s.G.y - P.y);
  return {
    goal: k ? `Next key: ${roomName(s, k.x, k.y)} · ${m(Math.hypot(k.x - P.x, k.y - P.y))} m` : `The front door is open · ${m(Math.hypot(door.x - P.x, door.y - P.y))} m`,
    open: !k, nana: m(nana), near: nana < 4, close: nana < 3,
  };
};
const hudOf = (s) => s && ({
  ...toward(s),
  mode: s.mode, night: s.night, count: s.count, need: s.need, stam: s.P.stam,
  runOn: s.P.runOn, tired: s.P.stamCool > 0,
  light: s.P.light, msg: s.msg, use: actionLabel(s), hiding: !!s.P.hiding, room: roomName(s),
  silent: s.mode === "play" && !s.P.entering && listening(s),
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
    const noMenu = (e) => e.preventDefault();          // a long press is a held button, not a copy menu
    document.addEventListener("contextmenu", noMenu);
    audio.current = createManorAudio();
    return () => {
      document.body.classList.remove("in-game");
      document.removeEventListener("contextmenu", noMenu);
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
      // her lullaby: louder the nearer she is; nothing at all while she listens
      const near = Math.max(0, 1 - Math.hypot(s.P.x - s.G.x, s.P.y - s.G.y) / 18);
      audio.current.humming(s.mode === "play" && !s.P.entering && !listening(s), near);

      if (!shown.current && (s.mode === "won" || (s.mode === "dead" && s.deadT > SHOW_CAUGHT_AFTER))) {
        shown.current = true;
        const t = timeText(s.tm);
        if (s.mode === "won") {
          night.current++;
          setOver({
            win: true, title: "You got out", again: `Night ${night.current}`,
            text: `The front door clicks shut behind you, and the humming fades. Time in Nana's house: ${t}. Next night the house is bigger, and she is quicker.`,
          });
        } else {
          setOver({
            win: false, title: "Nana found you", again: "Try again",
            text: `"There you are, dear." Keys found: ${s.count} of ${s.need}. Time: ${t}.`,
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
      if (k === "r") toggleRun(s);
      if (k === "e") doAction(s);
      if (k === "f") toggleLight(s);
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
        <div className="hm-keys">{"●".repeat(hud?.count || 0)}{"○".repeat(Math.max(0, (hud?.need || 3) - (hud?.count || 0)))} <span>keys · night {hud?.night}</span></div>
        <div className="hm-bar stam"><i style={{ width: `${(hud?.stam ?? 1) * 100}%` }} /></div>
        <div className="hm-room">{hud?.room}</div>
        <div className={`hm-goal${hud?.open ? " open" : ""}`}>{hud?.goal}</div>
        <div className={`hm-nanad${hud?.near ? " near" : ""}`}>Nana: {hud?.nana} m away</div>
      </div>

      {/* hidden: how it's going */}
      <div className={`hm-hidetext${playing && hud.hiding ? "" : " off"}`}>
        {hud?.close ? "Hold still… she's right outside." : "Hidden and safe. Press Use to come out."}
      </div>

      {/* while she hums you may move; when it stops, she listens */}
      <div className={`hm-humming${playing ? "" : " off"}`} aria-hidden="true">{hud?.silent ? "🤫 Nana has gone quiet…" : "♪ Nana is humming…"}</div>

      <div className="hm-msg" style={{ opacity: playing && hud.msg ? 1 : 0 }} aria-live="polite">{playing ? hud.msg : ""}</div>

      {/* One button, on the right: Use — doors, hiding, a room's light switch;
          lit when there's something in front of you. Running is the stick
          pushed out past its ring. */}
      <div className={`hm-pad${playing ? "" : " off"}`}>
        <button className={`hm-use${hud?.use ? " on" : ""}`} onPointerDown={press(doAction)}>{hud?.use || "Use"}</button>
      </div>

      {screen === "menu" && (
        <div className="hm-ov hm-nana">
          <button className="hm-leave" onClick={() => navigate("/")}>← Leave</button>
          <h1>Nana's Lullaby</h1>
          <p>Sweet old Nana Elowen never left her house. She hums a lullaby as she walks the halls, and she does not like visitors.</p>
          <p>Find the three keys to unlock the front door. While you hear her humming, you are safe to move. <b>When the humming stops, she is listening. Freeze.</b></p>
          <button className="hm-go" onClick={newGame}>Enter the house</button>
          <p className="hm-small">
            Move: WASD. Look: drag the mouse or use the left and right arrows. Run: Shift or R. Use (open doors,
            hide in beds, wardrobes and under tables, a room's light switch): E. A light switched on stays on — until she walks into that room.<br />
            On a phone: left thumb moves (push it out past the ring to run), right thumb looks, and the buttons are on the right.
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
