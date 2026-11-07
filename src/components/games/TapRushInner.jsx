// src/components/games/TapRushInner.jsx
// Tap Rush: a whack-a-critter garden. A critter pops out of one of nine
// burrows — bop it fast for points. A grumpy bomb pops up now and then: leave
// it alone. From level 3 a golden critter sometimes shows: worth a lot more.
// The seeded sequence of burrows and critters keeps a head-to-head race fair;
// the reaction time is each player's own. Every 10 bops is a level, and the
// critters get quicker as you go.
//
// tapScene.js draws the garden in 3D (loaded lazily: TapRush.jsx is the
// wrapper); this file has the rules and the taps.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import { seededRand } from "./seededRand";
import { createTapScene } from "./tapScene";

const GRID = 9;          // 3×3
const HIT = 14;
const GOLD = 40;
const BOMB_PENALTY = -12;
const BASE_WINDOW = 1150; // ms a critter stays up (shrinks as you score)
const PER_LEVEL = 10;
const GOLD_FROM = 3;      // golden critters from this level
const levelFor = (hits) => 1 + Math.floor(hits / PER_LEVEL);
const SAYS = { 2: "Quicker critters!", 3: "Golden critters appear — +40!", 4: "Even quicker!", 5: "Super speed!" };

function buildSequence(seed, n = 800) {
  const rand = seededRand(seed);
  const seq = [];
  for (let i = 0; i < n; i++) {
    const pos = Math.floor(rand() * GRID), bomb = rand() < 0.18, gold = !bomb && rand() < 0.08;
    seq.push({ pos, bomb, gold });
  }
  return seq;
}

export default function TapRushInner(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null } = props;

  const seq = useMemo(() => buildSequence(seed), [seed]);

  // The step lives in a ref as well as state: two taps on the critter in the
  // same tick must score once, not twice.
  const stepRef = useRef(0);
  const hitsRef = useRef(0);
  const [step, setStep] = useState(0);
  const [hits, setHits] = useState(0);
  const [msg, setMsg] = useState(null);
  const missRef = useRef(null);
  const msgRef = useRef(null);
  useEffect(() => () => clearTimeout(msgRef.current), []);
  const say = (text, type, ms = 1400) => { setMsg({ text, type }); clearTimeout(msgRef.current); msgRef.current = setTimeout(() => setMsg(null), ms); };

  // Watching draws the same garden the player is in: the sequence is seeded,
  // so how far through it they are (and their bops, for the level) is the
  // whole picture.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ step: stepRef.current, hits: hitsRef.current }),
    apply: (st) => {
      stepRef.current = st.step;
      hitsRef.current = st.hits ?? 0;
      setStep(st.step);
      setHits(st.hits ?? 0);
    },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: spectate.extraState });

  const level = levelFor(hits);
  const active = seq[step % seq.length];
  const kindOf = (c, lv) => (c.bomb ? "bomb" : c.gold && lv >= GOLD_FROM ? "gold" : "mole");
  // Named windowMs, not `window` — that would shadow the global.
  const windowMs = Math.max(480, BASE_WINDOW - hits * 12); // gets faster

  // Auto-advance (a miss) if the player doesn't act in time.
  useEffect(() => {
    if (isSpectator || eng.gameOver) return undefined;
    missRef.current = setTimeout(() => {
      stepRef.current += 1;
      setStep(stepRef.current);
    }, windowMs);
    return () => clearTimeout(missRef.current);
  }, [step, isSpectator, eng.gameOver, windowMs]);

  // the 3D garden
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const size = useRef({ w: 0, h: 0, set: { w: 0, h: 0 } });
  const [broken, setBroken] = useState(false);
  const view = useRef(null);
  view.current = { active: eng.gameOver ? null : { pos: active.pos, kind: kindOf(active, level) } };
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    let sc;
    try { sc = createTapScene(c); } catch (e) { console.error("Tap Rush: couldn't start the 3D view", e); setBroken(true); return undefined; }
    sceneRef.current = sc;
    let raf, last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const { w, h, set } = size.current;
      if (w && h && (w !== set.w || h !== set.h)) { sc.resize(w, h); size.current.set = { w, h }; }
      sc.draw(view.current, dt, now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); sc.dispose(); sceneRef.current = null; };
  }, []);

  function tap(pos) {
    if (isSpectator || eng.gameOver) return;
    const cur = seq[stepRef.current % seq.length];
    if (pos !== cur.pos) return; // only the critter that's up counts
    eng.addMove();
    const kind = kindOf(cur, levelFor(hitsRef.current));
    if (kind === "bomb") {
      eng.addScore(BOMB_PENALTY);
      sceneRef.current?.hit(pos, "bomb");
      say(`💥 That was a bomb! ${BOMB_PENALTY}`, "error", 900);
    } else {
      const pts = kind === "gold" ? GOLD : HIT;
      eng.addScore(pts);
      sceneRef.current?.hit(pos, kind, pts);
      const lvBefore = levelFor(hitsRef.current);
      hitsRef.current += 1;
      setHits(hitsRef.current);
      const lv = levelFor(hitsRef.current);
      if (lv !== lvBefore) say(`⭐ Level ${lv}! ${SAYS[Math.min(5, lv)] || "Faster!"}`, "success", 1800);
    }
    stepRef.current += 1;
    setStep(stepRef.current);
  }

  const onDown = (e) => {
    if (isSpectator) return;
    const c = canvasRef.current, sc = sceneRef.current;
    if (!c || !sc) return;
    const r = c.getBoundingClientRect();
    const i = sc.pick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    if (i >= 0) tap(i);
  };

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }, { label: "Level", value: level }]
    : [{ label: "Score", value: eng.score.toLocaleString() }, { label: "Level", value: level }, { label: "Bops", value: hits }];

  return (
    <>
      <GameFrame
        gameName="Tap Rush" badge="⚡ TAP RUSH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          const side = Math.floor(Math.max(180, Math.min(w, h - 30, 520)));
          size.current.w = side; size.current.h = side;
          return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div className="muted eyebrow">Bop the critters · leave the 💣 alone</div>
              <div style={{ position: "relative", width: side, height: side }}>
                <canvas ref={canvasRef} className="tr3-canvas" style={{ width: side, height: side }} role="img"
                  aria-label="Tap Rush: a garden of nine burrows" onPointerDown={onDown} onContextMenu={(e) => e.preventDefault()} />
                {broken && <div className="muted" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>Couldn't start the 3D view on this phone.</div>}
              </div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && <GameOver eng={eng} me={currentUser} extra={`Level ${level} · ${hits} bops`} />}
    </>
  );
}
