// src/components/games/Pipes.jsx
// Pipes: tap a tile to turn its pipe a quarter turn (right-click turns it
// back). Pipes joined up to the source fill with water. Join every pipe with
// no loose ends to clear the board; the next one is bigger. Every room gets
// the same boards; most points when the clock stops wins.
//
// Board rules live in pipesBoard.js. This file is taps, scoring and drawing.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { DIRS, makeBoard, currentMasks, flow, isSolved, openings } from "./pipesBoard";

const INK = "#2E2140";
const WATER = "#7FA3E6";
const DRY = "#FFFFFF";
const TILE = 100;              // SVG units per tile
const PIPE = 28;               // pipe width
const WALL = 6;                // outline thickness on each side
const BULB = 25;               // the round end of a dead-end pipe
const solveBonus = (n) => 20 + 2 * n;

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
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });

  const [level, setLevel] = useState(1);
  const board = useMemo(() => makeBoard(seed, level), [seed, level]);
  const [turns, setTurns] = useState(() => board.solution.map(() => 0));
  const [solved, setSolved] = useState(false);
  const [msg, setMsg] = useState(null);

  // Taps act on the ref: two taps in the same tick must both count.
  const live = useRef({ level: 1, turns: board.solution.map(() => 0), best: 1, busy: false });
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

  function turn(cell, by) {
    if (eng.gameOver || isSpectator) return;
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

  const masks = currentMasks(board, turns);
  const wetSet = flow(masks, board.cols, board.rows, board.source);

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
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
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          if (isSpectator) {
            return (
              <div className="muted">
                👀 Watching {spectatorWatching?.username} — {Number(specScore).toLocaleString()} pts
              </div>
            );
          }
          const { cols, rows } = board;
          const hint = 30, frame = 26;
          const cell = Math.floor(Math.max(28, Math.min(96, (w - frame) / cols, (h - hint - frame - 6) / rows)));
          return (
            <div style={{ textAlign: "center" }}>
              <div className={`pp-frame${solved ? " done" : ""}`} style={{ width: cols * cell + frame }}>
                <svg className="pp-board" viewBox={`0 0 ${cols * TILE} ${rows * TILE}`}
                  style={{ width: cols * cell, height: rows * cell }}
                  role="img" aria-label={`Pipes board ${level}: ${wetSet.size} of ${board.n} pipes connected`}>
                  {board.solution.map((m, i) => {
                    const x = i % cols, y = (i - x) / cols;
                    return (
                      <PipeTile key={`${level}-${i}`} mask={m} deg={(board.start[i] + turns[i]) * 90}
                        x={x} y={y} wet={wetSet.has(i)} isSource={i === board.source} />
                    );
                  })}
                  {board.solution.map((_, i) => {
                    const x = i % cols, y = (i - x) / cols;
                    return (
                      <rect key={`hit${level}-${i}`} data-cell={i} x={x * TILE} y={y * TILE} width={TILE} height={TILE}
                        fill="transparent" className="pp-hit"
                        onClick={() => turn(i, 1)}
                        onContextMenu={(e) => { e.preventDefault(); turn(i, -1); }} />
                    );
                  })}
                </svg>
              </div>
              <div className="muted pp-help">Tap to turn a pipe · join them all to the ● source</div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Boards cleared: ${level - 1}`} />
      )}
    </>
  );
}
