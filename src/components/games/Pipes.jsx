// src/components/games/Pipes.jsx
// Pipes: tap a tile to turn its pipe a quarter turn (right-click turns it
// back). Pipes joined up to the source fill with water. Join every pipe with
// no loose ends to clear the board; the next one is bigger. Every room gets
// the same boards; most points when the clock stops wins.
//
// Board rules live in pipesBoard.js. This file is taps, scoring and drawing.
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
import { team, plural } from "./coopTeam";
import { DIRS, makeBoard, currentMasks, flow, isSolved, openings } from "./pipesBoard";

const INK = "#2E2140";
const WATER = "#7FA3E6";
const DRY = "#FFFFFF";
const TILE = 100;              // SVG units per tile
const PIPE = 28;               // pipe width
const WALL = 6;                // outline thickness on each side
const BULB = 25;               // the round end of a dead-end pipe
const solveBonus = (n) => 20 + 2 * n;
const CLEARED_MS = 900;        // a solved board, full of water, before the next
const TOUCH_MS = 600;          // together: how long a friend's turn flashes

// Arm end points from a tile's centre, in the order of DIRS (N, E, S, W).
const ARM = [[0, -50], [50, 0], [0, 50], [-50, 0]];

function PipeTile({ mask, deg, x, y, wet, isSource }) {
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
  const live = useRef({ level: 1, turns: board.solution.map(() => 0), best: 1, busy: false });

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
      const n = ++uid.current;
      setCleared({ b: e.b, turns: v.done ? v.done.turns : [], n });
      setTouches({});
      later(() => setCleared((x) => (x && x.n === n ? null : x)), CLEARED_MS);
      say(`All connected together! +${e.bonus}`, "success");
    }
  });

  function turn(cell, by) {
    if (eng.gameOver || isSpectator) return;
    if (coop) {
      if (cleared) return;
      cb.send({ t: "turn", b: v.b, i: cell, d: by });
      eng.addMove();
      return;
    }
    const s = live.current;
    if (s.busy) return;
    s.turns = s.turns.map((t, i) => (i === cell ? t + by : t));
    setTurns(s.turns);
    eng.addMove();

    const masks = currentMasks(board, s.turns);
    // A point for each tile the water reaches for the first time on this board
    // (turning pipes away and back again earns nothing).
    const wet = flow(masks, board.cols, board.rows, board.source).size;
    if (wet > s.best) { eng.addScore(wet - s.best); s.best = wet; }

    if (isSolved(masks, board.cols, board.rows, board.source)) {
      s.busy = true;
      const bonus = solveBonus(board.n);
      eng.addScore(bonus);
      setSolved(true);
      say(`All connected! +${bonus}`, "success");
      later(() => {
        s.level += 1;
        const nextBoard = makeBoard(seed, s.level);
        s.turns = nextBoard.solution.map(() => 0);
        s.best = 1;
        s.busy = false;
        setLevel(s.level);
        setTurns(s.turns);
        setSolved(false);
      }, 900);
    }
  }

  // What to draw: together, the side's board (or the one just solved)
  const showLevel = coop ? (cleared ? cleared.b : v.b) : level;
  const shownBoard = coop ? R.board(showLevel) : board;
  const shownTurns = coop ? (cleared ? cleared.turns : v.turns) : turns;
  const shownSolved = coop ? !!cleared : solved;
  const masks = currentMasks(shownBoard, shownTurns);
  const wetSet = flow(masks, shownBoard.cols, shownBoard.rows, shownBoard.source);

  const oppList = coop ? T.strip(v.by, (n) => plural(n, "turn")) : Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = coop
    ? [
        { label: "Score", value: v.score.toLocaleString() },
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
      >
        {({ w, h }) => {
          const { cols, rows } = shownBoard;
          const hint = 30, frame = 26;
          const cell = Math.floor(Math.max(28, Math.min(96, (w - frame) / cols, (h - hint - frame - 6) / rows)));
          return (
            <div style={{ textAlign: "center" }}>
              <div className={`pp-frame${shownSolved ? " done" : ""}`} style={{ width: cols * cell + frame }}>
                <svg className="pp-board" viewBox={`0 0 ${cols * TILE} ${rows * TILE}`}
                  style={{ width: cols * cell, height: rows * cell }}
                  role="img" aria-label={`Pipes board ${showLevel}: ${wetSet.size} of ${shownBoard.n} pipes connected`}>
                  {shownBoard.solution.map((m, i) => {
                    const x = i % cols, y = (i - x) / cols;
                    return (
                      <PipeTile key={`${showLevel}-${i}`} mask={m} deg={(shownBoard.start[i] + (shownTurns[i] || 0)) * 90}
                        x={x} y={y} wet={wetSet.has(i)} isSource={i === shownBoard.source} />
                    );
                  })}
                  {/* together: a pipe a friend just turned, ringed in their colour */}
                  {coop && Object.entries(touches).map(([i, t]) => {
                    const x = Number(i) % cols, y = (Number(i) - x) / cols;
                    return <rect key={`touch${i}`} className="pp-touch" x={x * TILE + 5} y={y * TILE + 5} width={TILE - 10} height={TILE - 10}
                      rx={18} fill="none" stroke={t.col} strokeWidth={9} />;
                  })}
                  {shownBoard.solution.map((_, i) => {
                    const x = i % cols, y = (i - x) / cols;
                    return (
                      <rect key={`hit${showLevel}-${i}`} data-cell={i} x={x * TILE} y={y * TILE} width={TILE} height={TILE}
                        fill="transparent" className="pp-hit"
                        onClick={() => turn(i, 1)}
                        onContextMenu={(e) => { e.preventDefault(); turn(i, -1); }} />
                    );
                  })}
                </svg>
              </div>
              <div className="muted pp-help">{coop ? "One board for all of you · anyone can turn any pipe" : "Tap to turn a pipe · join them all to the ● source"}</div>
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
