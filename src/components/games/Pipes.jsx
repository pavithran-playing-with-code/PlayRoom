// src/components/games/Pipes.jsx
// Pipes: tap a tile to turn its pipe a quarter turn (right-click turns it
// back). Pipes joined up to the source fill with water. Join every pipe with
// no loose ends to clear the board; the next one is bigger. Every room gets
// the same boards; most points when the clock stops wins.
//
// Board rules live in pipesBoard.js, the bonuses and the hint in
// pipesScore.js. This file is taps, scoring and drawing. Water runs through
// the joined pipes; a newly joined one splashes. Solve in the fewest turns
// and it's Perfect; quickly, and there's a speed bonus; 💡 Hint puts one
// wrong pipe right for a few points.
//
// Together (a co-op room) it's one board for the whole side: anyone turns
// any pipe, and a pipe a friend turns flashes in their colour. The rules are
// coopBoards.js (pipesRules); the moves go through the server in one order
// (useCoopBoard), so every phone shows the same board.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import useCoopBoard, { useShows } from "./useCoopBoard";
import { pipesRules, GOAL } from "./coopBoards";
import { team } from "./coopTeam";
import { DIRS, makeBoard, currentMasks, flow, isSolved, openings } from "./pipesBoard";
import { HINT, turnsLeft, hintFor, solveScore } from "./pipesScore";
import sfx from "./sfx";

const INK = "#2E2140";
const WATER = "#7FA3E6";
const DRY = "#FFFFFF";
const TILE = 100;              // SVG units per tile
const PIPE = 28;               // pipe width
const WALL = 6;                // outline thickness on each side
const BULB = 25;               // the round end of a dead-end pipe
const CLEARED_MS = 900;        // a solved board, full of water, before the next
const TOUCH_MS = 600;          // together: how long a friend's turn flashes

// Arm end points from a tile's centre, in the order of DIRS (N, E, S, W).
const ARM = [[0, -50], [50, 0], [0, 50], [-50, 0]];

function PipeTile({ mask, deg, x, y, wet, isSource, splash }) {
  const cx = x * TILE + 50, cy = y * TILE + 50;
  const arms = DIRS.map((d, k) => (mask & d.bit ? ARM[k] : null)).filter(Boolean);
  const dead = openings(mask) === 1 || isSource;
  const fill = wet || isSource ? WATER : DRY;
  return (
    <g style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${deg}deg)`, transition: "transform .14s ease-out" }}>
      {arms.map(([ax, ay], k) => (
        <line key={`o${k}`} x1={cx} y1={cy} x2={cx + ax} y2={cy + ay} stroke={INK} strokeWidth={PIPE + WALL * 2} />
      ))}
      <circle cx={cx} cy={cy} r={dead ? BULB + WALL : PIPE / 2 + WALL} fill={INK} />
      {arms.map(([ax, ay], k) => (
        <line key={`f${k}`} x1={cx} y1={cy} x2={cx + ax} y2={cy + ay} stroke={fill} strokeWidth={PIPE} />
      ))}
      <circle cx={cx} cy={cy} r={dead ? BULB : PIPE / 2} fill={fill} />
      {/* running water: light dashes moving outward along every wet arm */}
      {(wet || isSource) && arms.map(([ax, ay], k) => (
        <line key={`w${k}`} className="pp-flow" x1={cx} y1={cy} x2={cx + ax} y2={cy + ay} stroke="#DCE8FF" strokeWidth={PIPE * 0.32} strokeLinecap="round" />
      ))}
      {splash && <circle key={splash} className="pp-splash" cx={cx} cy={cy} r={34} fill="none" stroke={WATER} strokeWidth={8} />}
      {isSource && <circle cx={cx} cy={cy} r={10} fill={INK} />}
    </g>
  );
}

export default function Pipes(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null, mode } = props;
  const coop = mode === "coop" && !!roomCode;
  const myId = Number(currentUser?.id);

  const [level, setLevel] = useState(1);
  const board = useMemo(() => makeBoard(seed, level), [seed, level]);
  const [turns, setTurns] = useState(() => board.solution.map(() => 0));
  const [solved, setSolved] = useState(false);
  const [msg, setMsg] = useState(null);

  // Taps act on the ref: two taps in the same tick must both count.
  const live = useRef({ level: 1, turns: board.solution.map(() => 0), best: 1, busy: false, used: 0, par: turnsLeft(board, board.solution.map(() => 0)), began: performance.now(), wet: new Set([board.source]) });

  // Watching draws the same board the player is on: the pipe layout is seeded; how far each one has been turned is what changes.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ level: live.current.level, turns: live.current.turns }),
    apply: (st) => {
      live.current.level = st.level;
      live.current.turns = st.turns || [];
      setLevel(st.level);
      setTurns(st.turns || []);
    },
  });

  // together: one board for the side
  const R = useMemo(() => pipesRules(seed), [seed]);
  const cb = useCoopBoard({ on: coop, roomCode, isSpectator, myId, rules: R.rules, init: R.init });
  const T = useMemo(() => team(players, myId), [players, myId]);
  const agreedRef = useRef(cb.agreed);
  agreedRef.current = cb.agreed;
  const soloState = spectate.extraState;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: coop ? () => ({ pairs_matched: agreedRef.current.boards }) : soloState });

  // together: the side's score is everybody's
  const { setScore } = eng;
  useEffect(() => { if (coop && !isSpectator && cb.ready) setScore(cb.agreed.score); }, [coop, isSpectator, cb.ready, cb.agreed.score, setScore]);

  const timers = useRef([]);
  const uid = useRef(0);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  function say(text, type) {
    const n = ++uid.current;
    setMsg({ text, type });
    later(() => setMsg((m) => (uid.current === n ? null : m)), 1200);
  }
  const [fx, setFx] = useState({ splash: {}, banner: null, hint: null });
  function banner(text, cls = "") {
    const id = ++uid.current;
    setFx((f) => ({ ...f, banner: { id, text, cls } }));
    later(() => setFx((f) => (f.banner && f.banner.id === id ? { ...f, banner: null } : f)), 1300);
  }
  // newly wet tiles splash, and the water gurgles — higher the more is joined
  function splashNew(prev, now, n) {
    const fresh = [...now].filter((c) => !prev.has(c));
    if (!fresh.length) return;
    const id = ++uid.current;
    setFx((f) => ({ ...f, splash: { ...f.splash, ...Object.fromEntries(fresh.map((c) => [c, id])) } }));
    later(() => setFx((f) => { const s = { ...f.splash }; for (const c of fresh) if (s[c] === id) delete s[c]; return { ...f, splash: s }; }), 520);
    const p = Math.min(1, now.size / n);
    sfx.tone(320 + p * 520, 0.12, 0.07, "sine", 520 + p * 700);
    sfx.noise(0.08, 0.04, 900 + p * 1200, "bandpass", 0, 2200, 3);
  }

  // together: a solved board stays a moment, full of water; a friend's
  // turn flashes in their colour
  const v = cb.view;
  const [cleared, setCleared] = useState(null);     // { b, turns }
  const [touches, setTouches] = useState({});       // cell → { col, n }
  useShows(cb.ready, v.ev, (e) => {
    if (e.k === "turn" && e.u !== myId) {
      const n = ++uid.current;
      setTouches((t) => ({ ...t, [e.i]: { col: T.colourOf(e.u), n } }));
      later(() => setTouches((t) => {
        if (!t[e.i] || t[e.i].n !== n) return t;
        const x = { ...t };
        delete x[e.i];
        return x;
      }), TOUCH_MS);
    } else if (e.k === "clear") {
      sfx.sparkle(); sfx.chime(5);
      const n = ++uid.current;
      setCleared({ b: e.b, turns: v.done ? v.done.turns : [], n });
      setTouches({});
      later(() => setCleared((x) => (x && x.n === n ? null : x)), CLEARED_MS);
      say(`All connected together! +${e.bonus}`, "success");
    }
  });

  function turn(cell, by) {
    if (eng.gameOver || isSpectator) return;
    sfx.tone(by > 0 ? 540 : 440, 0.05, 0.05, "triangle", by > 0 ? 680 : 360);
    if (coop) {
      if (cleared) return;
      cb.send({ t: "turn", b: v.b, i: cell, d: by });
      eng.addMove();
      return;
    }
    const s = live.current;
    if (s.busy) return;
    s.turns = s.turns.map((t, i) => (i === cell ? t + by : t));
    s.used += 1;
    setTurns(s.turns);
    setFx((f) => (f.hint ? { ...f, hint: null } : f));
    eng.addMove();

    const masks = currentMasks(board, s.turns);
    // A point for each tile the water reaches for the first time on this board
    // (turning pipes away and back again earns nothing).
    const wetNow = flow(masks, board.cols, board.rows, board.source);
    splashNew(s.wet, wetNow, board.n);
    s.wet = wetNow;
    const wet = wetNow.size;
    if (wet > s.best) { eng.addScore(wet - s.best); s.best = wet; }

    if (isSolved(masks, board.cols, board.rows, board.source)) {
      s.busy = true;
      const sc = solveScore(board, s.used, s.par, (performance.now() - s.began) / 1000);
      eng.addScore(sc.total);
      setSolved(true);
      sfx.whoosh(); sfx.sparkle(); sfx.chime(sc.perfect ? 6 : 4);
      say(`All connected! +${sc.bonus}${sc.perfect ? ` · perfect +${sc.perfect}` : ""}${sc.fast ? ` · fast +${sc.fast}` : ""}`, "success");
      if (sc.perfect) banner("✨ Perfect!", "pp-banner-perfect");
      later(() => {
        s.level += 1;
        const nextBoard = makeBoard(seed, s.level);
        s.turns = nextBoard.solution.map(() => 0);
        s.best = 1;
        s.used = 0;
        s.par = turnsLeft(nextBoard, s.turns);
        s.began = performance.now();
        s.wet = new Set([nextBoard.source]);
        s.busy = false;
        setLevel(s.level);
        setTurns(s.turns);
        setSolved(false);
        if (nextBoard.cols !== board.cols) banner(`Board ${s.level} · ${nextBoard.cols}×${nextBoard.rows}`, "pp-banner-new");
      }, 1100);
    }
  }

  // 💡 one wrong pipe, put right (it glows first, then turns)
  function hint() {
    if (eng.gameOver || isSpectator || coop) return;
    const s = live.current;
    if (s.busy) return;
    const h = hintFor(board, s.turns, s.wet);
    if (!h) return;
    eng.addScore(HINT);
    s.par += 1;                 // a hinted turn isn't the player's own: it doesn't spoil Perfect
    sfx.sparkle();
    setFx((f) => ({ ...f, hint: h.cell }));
    later(() => turn(h.cell, h.by), 260);
  }

  // the last ten seconds tick; a soft beat under it
  const playing = !isSpectator && !eng.gameOver;
  const secs = Math.ceil(eng.timeLeft);
  useEffect(() => { if (playing && !eng.unlimited && secs > 0 && secs <= 10) sfx.tick(secs <= 3); }, [secs, playing, eng.unlimited]);
  useEffect(() => { if (!playing) return undefined; const b = sfx.beat(() => 82, 0.3); return () => b.stop(); }, [playing]);
  const ended = useRef(false);
  useEffect(() => {
    if (!eng.gameOver || isSpectator || ended.current) return;
    ended.current = true;
    const good = coop ? cb.agreed.boards >= GOAL.pipes : (eng.won || eng.rank === 1);
    if (good) sfx.win(); else sfx.lose();
  }, [eng.gameOver, eng.won, eng.rank, isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps

  // What to draw: together, the side's board (or the one just solved)
  const showLevel = coop ? (cleared ? cleared.b : v.b) : level;
  const shownBoard = coop ? R.board(showLevel) : board;
  const shownTurns = coop ? (cleared ? cleared.turns : v.turns) : turns;
  const shownSolved = coop ? !!cleared : solved;
  const masks = currentMasks(shownBoard, shownTurns);
  const wetSet = flow(masks, shownBoard.cols, shownBoard.rows, shownBoard.source);

  // a team plays as one: its points only, not each player's
  const oppList = coop ? [] : Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = coop
    ? [
        { label: "Team", value: v.score.toLocaleString() },
        { label: "Linked", value: `${wetSet.size}/${shownBoard.n}` },
        { label: "Goal", value: v.boards >= GOAL.pipes ? "✓" : `${v.boards}/${GOAL.pipes}` },
      ]
    : isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Board", value: level },
        { label: "Linked", value: `${wetSet.size}/${board.n}` },
      ];

  return (
    <>
      <GameFrame
        gameName="Pipes" badge="🚰 PIPES"
        isSpectator={isSpectator} spectatorName={coop ? "the team" : spectatorWatching?.username}
        stats={coop && isSpectator ? [stats[0], stats[stats.length - 1]] : stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
        sound
        controls={!isSpectator && !coop ? (
          <button className="press p-white sm" onClick={hint} disabled={solved}>💡 Hint ({HINT})</button>
        ) : null}
      >
        {({ w, h }) => {
          const { cols, rows } = shownBoard;
          const hint = 30, frame = 26;
          const cell = Math.floor(Math.max(28, Math.min(96, (w - frame) / cols, (h - hint - frame - 6) / rows)));
          return (
            <div className="pp-wrap">
              <div className={`pp-frame${shownSolved ? " done" : ""}`} style={{ width: cols * cell + frame }}>
                <svg className="pp-board" viewBox={`0 0 ${cols * TILE} ${rows * TILE}`}
                  style={{ width: cols * cell, height: rows * cell }}
                  role="img" aria-label={`Pipes board ${showLevel}: ${wetSet.size} of ${shownBoard.n} pipes connected`}>
                  {shownBoard.solution.map((m, i) => {
                    const x = i % cols, y = (i - x) / cols;
                    return (
                      <PipeTile key={`${showLevel}-${i}`} mask={m} deg={(shownBoard.start[i] + (shownTurns[i] || 0)) * 90}
                        x={x} y={y} wet={wetSet.has(i)} isSource={i === shownBoard.source} splash={fx.splash[i]} />
                    );
                  })}
                  {/* together: a pipe a friend just turned, ringed in their colour */}
                  {coop && Object.entries(touches).map(([i, t]) => {
                    const x = Number(i) % cols, y = (Number(i) - x) / cols;
                    return <rect key={`touch${i}`} className="pp-touch" x={x * TILE + 5} y={y * TILE + 5} width={TILE - 10} height={TILE - 10}
                      rx={18} fill="none" stroke={t.col} strokeWidth={9} />;
                  })}
                  {fx.hint != null && (() => {
                    const x = fx.hint % cols, y = (fx.hint - x) / cols;
                    return <rect className="pp-hintring" x={x * TILE + 4} y={y * TILE + 4} width={TILE - 8} height={TILE - 8} rx={18} fill="none" stroke="#ff8a3d" strokeWidth={9} />;
                  })()}
                  {shownBoard.solution.map((_, i) => {
                    const x = i % cols, y = (i - x) / cols;
                    return (
                      <rect key={`hit${showLevel}-${i}`} data-cell={i} x={x * TILE} y={y * TILE} width={TILE} height={TILE}
                        fill="transparent" className="pp-hit"
                        onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); turn(i, 1); } }}
                        onContextMenu={(e) => { e.preventDefault(); turn(i, -1); }} />
                    );
                  })}
                </svg>
              </div>
              <div className="muted pp-help">{coop ? "One board for all of you · anyone can turn any pipe" : "Tap to turn a pipe · join them all to the ● source"}</div>
              {fx.banner && <div key={fx.banner.id} className={`pp-banner ${fx.banner.cls}`}>{fx.banner.text}</div>}
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (coop
        ? <GameOver eng={eng} me={currentUser} extra={`Boards cleared: ${cb.agreed.boards}`}
            together={{ reached: cb.agreed.boards >= GOAL.pipes, goal: `join ${GOAL.pipes} boards`, unit: "turns", mates: T.all(cb.agreed.by) }} />
        : <GameOver eng={eng} me={currentUser} extra={`Boards cleared: ${level - 1}`} />)}
    </>
  );
}
