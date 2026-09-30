// src/components/games/WickGame.jsx
// WICK in a room. The same descent as the solo page — oil is your light,
// monsters move only when you do, a deadly step takes a second tap — played
// against the room's clock.
//
// Everyone plays the same floors: run n of a match is built from the room's
// seed and n, so your third run is everybody's third run. Points for every
// floor reached (more the deeper it is), for the key, for flasks and for
// burned shades. Being taken costs points and starts the next run; like
// every other game here, only the clock ends the match.
//
// The rules are horror/wickSim.js, the painting horror/wickPaint.js.
import React, { useCallback, useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import {
  COLS, ROWS, SHADE, CRAWLER, LUNGER, FLARE_COST, DIRS, newRun, makeFloor, act, preview, threats, warning,
} from "../horror/wickSim";
import {
  SCARE_MS, SWIPE_PX, MEET, CAUSE, KEYS, newAnim, displayOf, animateTurn, paint, paintScare,
} from "../horror/wickPaint";
import OilGauge from "../horror/WickOil";

// Scoring. A floor is worth more the deeper it is, so staying alive pays.
export const FLOOR_POINTS = (depth) => 30 + 20 * depth;
export const KEY_POINTS = 15;
export const FLASK_POINTS = 5;
export const BURN_POINTS = 10;
export const DEATH_COST = 40;
const NEXT_RUN_MS = SCARE_MS + 700;
const MSG_H = 58;

// Run n of this room, identical for everyone in it.
export const runSeed = (seed, run) => (Number(seed) || 1) * 131 + run * 7919 + 1;

// A spectator's snapshot: the whole run but the walls, which the seed and the
// depth rebuild.
const pack = (s) => ({
  seed: s.seed, depth: s.depth, oil: s.oil, turn: s.turn, floorTurn: s.floorTurn, dead: s.dead, dark: s.dark,
  burned: s.burned, exit: s.exit, key: s.key, flasks: s.flasks, monsters: s.monsters, player: s.player, hasKey: s.hasKey,
});
const unpack = (p) => ({ ...p, walls: makeFloor(p.seed, p.depth).walls });

export default function WickGame(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null, spectatorState = null } = props;

  // Play acts on the ref; the render reads a counter. Two taps in one tick
  // must each see the other's result.
  const live = useRef(null);
  if (live.current === null) live.current = { run: 0, s: newRun(runSeed(seed, 0)), best: 1 };
  const anim = useRef(newAnim());
  const pv = useRef(preview(live.current.s));
  const threat = useRef(threats(live.current.s));
  const armed = useRef(null);
  const met = useRef(new Set());
  const canvasRef = useRef(null);
  const scareRef = useRef(null);
  const box = useRef({ W: 300, H: 400, T: 40, ox: 0, oy: 0, dpr: 1 });
  const timers = useRef([]);
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);
  const [meeting, setMeeting] = useState(null);
  const [note, setNote] = useState(null);           // armed-step or new-run line
  const size = useRef({ w: 0, h: 0, fitted: "" });  // what the frame gives the board

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const settle = useCallback(() => {
    const s = live.current.s;
    pv.current = preview(s);
    threat.current = threats(s);
    armed.current = null;
  }, []);

  const introduce = useCallback((s) => {
    const kinds = [SHADE, CRAWLER, LUNGER].filter((k) => s.monsters.some((m) => m.kind === k) && !met.current.has(k));
    kinds.forEach((k) => met.current.add(k));
    setMeeting(kinds.length ? [MEET[kinds[kinds.length - 1]]] : null);
  }, []);

  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ run: live.current.run, s: pack(live.current.s) }),
    apply: (st) => {
      if (!st || !st.s) return;
      const fresh = st.run !== live.current.run || st.s.depth !== live.current.s.depth;
      live.current.run = st.run;
      live.current.s = unpack(st.s);
      if (fresh) { anim.current = newAnim(); anim.current.floor = { t0: performance.now(), depth: st.s.depth }; }
      settle();
      refresh();
    },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: spectate.extraState });

  useEffect(() => {
    anim.current.floor = { t0: performance.now(), depth: 1 };
    introduce(live.current.s);
  }, [introduce]);

  const doAction = useCallback((action) => {
    const L = live.current, s = L.s;
    if (isSpectator || eng.gameOver || s.dead) return;
    const p = pv.current && pv.current[action];
    if (!p || !p.ok) return;
    if (p.deadly && armed.current !== action) {
      armed.current = action;
      setNote(action === "wait" || action === "flare"
        ? "Staying here gets you killed. Tap again if you mean it."
        : "That step gets you killed. Tap it again if you mean it.");
      refresh();
      return;
    }
    setNote(null);
    const now = performance.now();
    const a = anim.current;
    const before = new Map(s.monsters.map((m) => [m.id, { x: m.x, y: m.y }]));
    const from = displayOf(a, "p", s.player, now);
    const ev = act(s, action);
    if (!ev) return;
    eng.addMove();

    let pts = 0;
    if (ev.picked.includes("key")) pts += KEY_POINTS;
    if (ev.picked.includes("flask")) pts += FLASK_POINTS;
    pts += ev.burned.length * BURN_POINTS;

    if (ev.descended) {
      pts += FLOOR_POINTS(s.depth);
      L.best = Math.max(L.best, s.depth);
      eng.addScore(pts);
      anim.current = newAnim();
      anim.current.floor = { t0: now, depth: s.depth };
      settle();
      introduce(s);
      refresh();
      return;
    }
    setMeeting(null);
    animateTurn(a, s, ev, action, before, from, now);
    if (pts) eng.addScore(pts);

    if (ev.dead) {
      eng.addScore(-DEATH_COST);
      // the face, then the next run — the same one everyone else gets
      timers.current.push(setTimeout(() => {
        const next = live.current.run + 1;
        live.current.run = next;
        live.current.s = newRun(runSeed(seed, next));
        anim.current = newAnim();
        anim.current.floor = { t0: performance.now(), depth: 1 };
        met.current = new Set();
        settle();
        introduce(live.current.s);
        setNote(`${CAUSE[ev.dead.kind][0].toLowerCase().replace(/^./, (c) => c.toUpperCase())}. −${DEATH_COST}. A fresh run, from the top.`);
        refresh();
      }, NEXT_RUN_MS));
    }
    settle();
    refresh();
  }, [isSpectator, eng, settle, introduce, seed]);

  // keyboard, for a desk
  useEffect(() => {
    const down = (e) => {
      const k = KEYS[e.key] || KEYS[e.key.toLowerCase?.()];
      if (!k) return;
      e.preventDefault();
      doAction(k);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [doAction]);

  // The board fills what the frame gives it, less the line of words below.
  // Checked every frame against the size GameFrame last handed over.
  function fit() {
    const { w, h } = size.current;
    const c = canvasRef.current;
    const key = `${w}x${h}`;
    if (!w || !h || !c || size.current.fitted === key) return;
    size.current.fitted = key;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const H = Math.max(120, h - MSG_H);
    const T = Math.floor(Math.min(w / COLS, H / ROWS));
    box.current = { W: w, H, T, ox: Math.floor((w - T * COLS) / 2), oy: Math.floor((H - T * ROWS) / 2), dpr };
    c.width = Math.round(w * dpr); c.height = Math.round(H * dpr);
    c.style.width = `${w}px`; c.style.height = `${H}px`;
  }

  useEffect(() => {
    let raf;
    const frame = (now) => {
      fit();
      paint(canvasRef.current, box.current, live.current.s, anim.current, pv.current, threat.current, armed.current, now,
        isSpectator ? "watch" : "play");
      paintScare(scareRef.current, anim.current, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator]);

  // Tap the tile next to you, or swipe anywhere on the board.
  const press = useRef(null);
  const onDown = (e) => { press.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
  const onUp = (e) => {
    const p0 = press.current;
    press.current = null;
    const s = live.current.s;
    if (!p0 || p0.id !== e.pointerId) return;
    const mx = e.clientX - p0.x, my = e.clientY - p0.y;
    if (Math.hypot(mx, my) >= SWIPE_PX) {
      return doAction(Math.abs(mx) > Math.abs(my) ? (mx > 0 ? "right" : "left") : (my > 0 ? "down" : "up"));
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const { T, ox, oy } = box.current;
    const dx = Math.floor((p0.x - rect.left - ox) / T) - s.player.x;
    const dy = Math.floor((p0.y - rect.top - oy) / T) - s.player.y;
    if (dx === 0 && dy === 0) return doAction("wait");
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    doAction(Object.keys(DIRS).find((k) => DIRS[k][0] === dx && DIRS[k][1] === dy));
  };

  const s = live.current.s;
  const warn = !s.dead ? warning(s) : null;
  const p = pv.current;
  const line = note || (warn && warn.level >= 2 ? warn.text : null);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }, { label: "Depth", value: s.depth }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Depth", value: s.depth },
        { label: "Oil", value: s.oil, urgent: s.oil < 5 },
      ];

  return (
    <>
      <canvas ref={scareRef} className="wk-scare" aria-hidden="true" />
      <GameFrame
        gameName="Wick" badge="🕯️ WICK"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={Object.values(eng.opponents)}
        teams={eng.teams}
        onQuit={eng.endMatch}
        controls={!isSpectator && (
          <div className="wk-foot wkg-foot">
            <button className={`wk-btn${p && p.wait.deadly ? " deadly" : ""}${armed.current === "wait" ? " armed" : ""}`}
              disabled={eng.gameOver || s.dead} onClick={() => doAction("wait")}>
              <b>WAIT</b><span>−1 oil</span>
            </button>
            <OilGauge oil={s.oil} dark={s.dark} />
            <button className={`wk-btn flare${p && p.flare.deadly ? " deadly" : ""}${armed.current === "flare" ? " armed" : ""}`}
              disabled={eng.gameOver || s.dead || !(p && p.flare.ok)} onClick={() => doAction("flare")}>
              <b>FLARE</b><span>−{FLARE_COST} oil</span>
            </button>
          </div>
        )}
      >
        {({ w, h }) => {
          size.current.w = w; size.current.h = h;
          return (
            <div className="wkg-board" style={{ width: w, height: h }}>
              <canvas ref={canvasRef} className="wkg-canvas"
                onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { press.current = null; }}
                role="img" aria-label={`Wick, depth ${s.depth}`} />
              <div className={`wk-msg wkg-msg lvl${note && armed.current ? 3 : warn ? warn.level : 0}`} aria-live="assertive">
                {line ? line
                  : meeting ? meeting.map(([name, text]) => <span key={name} className="wk-meet"><b>{name}</b> {text}</span>)
                  : warn && warn.text}
              </div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Deepest: ${Math.max(live.current.best, s.depth)}`} />
      )}
    </>
  );
}
