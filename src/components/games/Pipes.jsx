// src/components/games/Pipes.jsx
// Pipes, in a garden: tap a tile to turn its pipe a quarter turn (right-click
// turns it back). Pipes joined up to the water tank fill with water — you can
// see it run — and every loose end is a flower pot: water reaches it and the
// flower blooms. Join every pipe with no loose ends and the whole garden is
// in flower; the next one is bigger. Every room gets the same boards; most
// points when the clock stops wins.
//
// Board rules live in pipesBoard.js. This file is taps, scoring and drawing.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import { DIRS, makeBoard, currentMasks, flow, isSolved, openings } from "./pipesBoard";

const INK = "#2E2140";
const WATER = "#5FB4F0";
const DRY = "#E9DFCF";
const PETALS = ["#FF6B6B", "#FF8FC7", "#FFC53D", "#9B5DE5", "#FFFFFF", "#FF9F43"];
const TILE = 100;              // SVG units per tile
const PIPE = 28;               // pipe width
const WALL = 6;                // outline thickness on each side
const solveBonus = (n) => 20 + 2 * n;
const CLEARED_MS = 900;        // a solved board, full of water, before the next

// Arm end points from a tile's centre, in the order of DIRS (N, E, S, W).
const ARM = [[0, -50], [50, 0], [0, 50], [-50, 0]];

function PipeTile({ mask, deg, x, y, wet, isSource, i, bloomAll }) {
  const cx = x * TILE + 50, cy = y * TILE + 50;
  const arms = DIRS.map((d, k) => (mask & d.bit ? ARM[k] : null)).filter(Boolean);
  const pot = openings(mask) === 1 && !isSource;
  const fill = wet || isSource ? WATER : DRY;
  const petal = PETALS[i % PETALS.length];
  return (
    <g>
      <g style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${deg}deg)`, transition: "transform .14s ease-out" }}>
        {arms.map(([ax, ay], k) => (
          <line key={`o${k}`} x1={cx} y1={cy} x2={cx + ax} y2={cy + ay} stroke={INK} strokeWidth={PIPE + WALL * 2} />
        ))}
        <circle cx={cx} cy={cy} r={PIPE / 2 + WALL} fill={INK} />
        {arms.map(([ax, ay], k) => (
          <line key={`f${k}`} x1={cx} y1={cy} x2={cx + ax} y2={cy + ay} stroke={fill} strokeWidth={PIPE} />
        ))}
        <circle cx={cx} cy={cy} r={PIPE / 2} fill={fill} />
        {/* the water running through */}
        {(wet || isSource) && arms.map(([ax, ay], k) => (
          <line key={`w${k}`} className="pp-flow" x1={cx} y1={cy} x2={cx + ax} y2={cy + ay} stroke="rgba(255,255,255,.65)" strokeWidth={6} strokeDasharray="9 13" strokeLinecap="round" />
        ))}
        {/* pipe joints: little rings where it meets the next tile */}
        {arms.map(([ax, ay], k) => (
          <rect key={`j${k}`} x={cx + ax * 0.82 - (ay ? 18 : 4)} y={cy + ay * 0.82 - (ax ? 18 : 4)} width={ay ? 36 : 8} height={ax ? 36 : 8} rx={3}
            fill={wet || isSource ? "#3E8FD0" : "#C9B99F"} stroke={INK} strokeWidth={3} />
        ))}
      </g>
      {isSource && (
        // the water tank, standing upright whatever way its pipe points
        <g>
          <rect x={cx - 26} y={cy - 30} width={52} height={56} rx={12} fill="#4CC9F0" stroke={INK} strokeWidth={5} />
          <rect x={cx - 26} y={cy - 12} width={52} height={7} fill="#2F9FD0" />
          <ellipse cx={cx} cy={cy - 30} rx={26} ry={8} fill="#9FE0FF" stroke={INK} strokeWidth={5} />
          <path d={`M${cx - 6} ${cy + 6} q6 -10 12 0 a6 6 0 1 1 -12 0z`} fill="#FFFFFF" />
        </g>
      )}
      {pot && (
        // a flower pot: a sprout while it's dry, a flower once the water comes
        <g className={`pp-pot${wet || bloomAll ? " bloom" : ""}`} style={{ transformOrigin: `${cx}px ${cy + 10}px` }}>
          <path d={`M${cx - 20} ${cy + 2} h40 l-5 26 h-30z`} fill="#D9774A" stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
          <rect x={cx - 23} y={cy - 4} width={46} height={10} rx={4} fill="#E8915F" stroke={INK} strokeWidth={4.5} />
          {wet || bloomAll ? (
            <g className="pp-flower">
              <line x1={cx} y1={cy - 4} x2={cx} y2={cy - 22} stroke="#3F9E4A" strokeWidth={5} strokeLinecap="round" />
              {[0, 72, 144, 216, 288].map((a) => (
                <circle key={a} cx={cx + Math.cos((a * Math.PI) / 180) * 10} cy={cy - 30 + Math.sin((a * Math.PI) / 180) * 10} r={8.5} fill={petal} stroke={INK} strokeWidth={3} />
              ))}
              <circle cx={cx} cy={cy - 30} r={7} fill="#FFD447" stroke={INK} strokeWidth={3} />
            </g>
          ) : (
            <g>
              <line x1={cx} y1={cy - 4} x2={cx} y2={cy - 14} stroke="#5DBB5A" strokeWidth={4} strokeLinecap="round" />
              <ellipse cx={cx - 6} cy={cy - 15} rx={6} ry={3.5} fill="#8FDB5C" stroke={INK} strokeWidth={2.5} transform={`rotate(-30 ${cx - 6} ${cy - 15})`} />
              <ellipse cx={cx + 6} cy={cy - 15} rx={6} ry={3.5} fill="#8FDB5C" stroke={INK} strokeWidth={2.5} transform={`rotate(30 ${cx + 6} ${cy - 15})`} />
            </g>
          )}
        </g>
      )}
    </g>
  );
}

export default function Pipes(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null } = props;

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

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: spectate.extraState });

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
      say(`🌼 The garden's in bloom! +${bonus}`, "success");
      later(() => {
        s.level += 1;
        const nextBoard = makeBoard(seed, s.level);
        s.turns = nextBoard.solution.map(() => 0);
        s.best = 1;
        s.busy = false;
        setLevel(s.level);
        setTurns(s.turns);
        setSolved(false);
      }, CLEARED_MS);
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
        { label: "Level", value: level },
        { label: "Watered", value: `${wetSet.size}/${board.n}` },
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
          const { cols, rows } = board;
          const hint = 30, frame = 26;
          const cell = Math.floor(Math.max(28, Math.min(96, (w - frame) / cols, (h - hint - frame - 6) / rows)));
          return (
            <div style={{ textAlign: "center" }}>
              <div className={`pp-frame${solved ? " done" : ""}`} style={{ width: cols * cell + frame }}>
                <svg className="pp-board" viewBox={`0 0 ${cols * TILE} ${rows * TILE}`}
                  style={{ width: cols * cell, height: rows * cell }}
                  role="img" aria-label={`Pipes board ${level}: ${wetSet.size} of ${board.n} pipes connected`}>
                  {/* the lawn */}
                  {board.solution.map((_, i) => {
                    const x = i % cols, y = (i - x) / cols;
                    return <rect key={`g${i}`} x={x * TILE} y={y * TILE} width={TILE} height={TILE} fill={(x + y) % 2 ? "#A8DD7A" : "#9AD46C"} />;
                  })}
                  {board.solution.map((m, i) => {
                    const x = i % cols, y = (i - x) / cols;
                    return (
                      <PipeTile key={`${level}-${i}`} mask={m} deg={(board.start[i] + (turns[i] || 0)) * 90}
                        x={x} y={y} wet={wetSet.has(i)} isSource={i === board.source} i={i} bloomAll={solved} />
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
              <div className="muted pp-help">Tap to turn a pipe · get water from the tank to every flower pot</div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && <GameOver eng={eng} me={currentUser} extra={`Boards cleared: ${level - 1}`} />}
    </>
  );
}
