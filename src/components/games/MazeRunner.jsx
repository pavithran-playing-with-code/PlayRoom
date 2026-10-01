// src/components/games/MazeRunner.jsx
// Find the flag. Every maze has exactly one route to it — see mazeBoard.js for
// why that is guaranteed rather than hoped for.
//
// Solve one and a slightly bigger one appears. There is no losing a maze: the
// room's clock ends the match, and the score is how many you got through.
//
// Arrows, WASD, the arrow pad, or swipe anywhere on the board. A move rolls
// the ball to the end of the corridor — the next wall, turning or the flag.
// Points are per board cleared (see scoreForBoard): never taken away.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import { N, E, S, W, DIRS, makeMaze, isOpen, slide, scoreForBoard } from "./mazeBoard";

const EASE = 0.28;            // how much of the gap the token closes each frame
const SOLVED_MS = 700;
const SWIPE_MIN = 24;         // px before a drag counts as a direction

export default function MazeRunner(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null } = props;

  const [level, setLevel] = useState(1);
  const [pos, setPos] = useState({ r: 0, c: 0 });
  const [seen, setSeen] = useState(() => new Set(["0,0"]));
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(0);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState(null);
  const [roll, setRoll] = useState(1);   // squares in the last move, so a long roll takes a little longer

  // Moves act on the ref: two taps in one tick must each see the other.
  const live = useRef({ level: 1, r: 0, c: 0, moves: 0, solved: 0, busy: false, seen: ["0,0"] });
  const timers = useRef([]);
  const uid = useRef(0);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  // Watching draws the same maze: it is built from the seed and the level, so
  // only where they are and where they have been has to travel.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({
      level: live.current.level, r: live.current.r, c: live.current.c,
      moves: live.current.moves, solved: live.current.solved, seen: live.current.seen,
    }),
    apply: (st) => {
      live.current.level = st.level;
      live.current.r = st.r; live.current.c = st.c;
      live.current.moves = st.moves; live.current.solved = st.solved;
      live.current.seen = st.seen || [];
      setLevel(st.level);
      setPos({ r: st.r, c: st.c });
      setMoves(st.moves);
      setSolved(st.solved);
      setSeen(new Set(st.seen || []));
    },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: spectate.extraState });

  const maze = useMemo(() => makeMaze(seed, level), [seed, level]);

  function say(text, type) {
    const n = ++uid.current;
    setMsg({ text, type });
    later(() => setMsg((m) => (uid.current === n ? null : m)), 1200);
  }

  function step(dir) {
    if (eng.gameOver || isSpectator) return;
    const s = live.current;
    if (s.busy) return;
    const m = makeMaze(seed, s.level);
    // Roll to the end of the corridor (see slide() in mazeBoard.js).
    const path = slide(m, s.r, s.c, dir);
    if (!path.length) { say("Wall!", "error"); return; }

    const end = path[path.length - 1];
    s.r = end.r;
    s.c = end.c;
    s.moves += 1;                      // one swipe, one move, however far it rolls
    for (const p of path) {
      const key = `${p.r},${p.c}`;
      if (!s.seen.includes(key)) s.seen.push(key);
    }
    setRoll(path.length);
    setPos({ r: s.r, c: s.c });
    setMoves(s.moves);
    setSeen(new Set(s.seen));
    eng.addMove();

    if (s.r === m.goal.r && s.c === m.goal.c) {
      s.busy = true;
      const gain = scoreForBoard(m, s.level, s.moves);
      eng.addScore(gain);
      s.solved += 1;
      setSolved(s.solved);
      setDone(true);
      say(`Board ${s.level} cleared in ${s.moves} moves! +${gain}`, "success");
      later(() => {
        s.level += 1;
        s.r = 0; s.c = 0;
        s.moves = 0;
        s.seen = ["0,0"];
        s.busy = false;
        setLevel(s.level);
        setPos({ r: 0, c: 0 });
        setMoves(0);
        setSeen(new Set(["0,0"]));
        setDone(false);
      }, SOLVED_MS);
    }
  }

  const byBit = (bit) => DIRS.find((d) => d.bit === bit);

  useEffect(() => {
    if (isSpectator) return undefined;
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      const dir = (k === "arrowup" || k === "w") ? N
        : (k === "arrowright" || k === "d") ? E
        : (k === "arrowdown" || k === "s") ? S
        : (k === "arrowleft" || k === "a") ? W : null;
      if (!dir) return;
      e.preventDefault();
      step(byBit(dir));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });                       // rebound each render, so it always sees the current maze

  // Swipe anywhere on the board. The finger is held (pointer capture), so a
  // swipe that ends off the maze — up past its top edge, say — still counts;
  // it used to be lost when the finger lifted outside. A swipe moves as soon
  // as it has gone far enough, not when the finger lifts, and only once.
  const touch = useRef(null);
  const onDown = (e) => {
    touch.current = { x: e.clientX, y: e.clientY, id: e.pointerId, used: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
  };
  const onMove = (e) => {
    const t = touch.current;
    if (!t || t.used || e.pointerId !== t.id) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
    t.used = true;
    step(byBit(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? E : W) : (dy > 0 ? S : N)));
  };
  const onUp = (e) => {
    const t = touch.current;
    if (t && e.pointerId === t.id) touch.current = null;
  };

  const oppList = Object.values(eng.opponents);
  const stats = [
    { label: "Score", value: Number(isSpectator ? (spectatorWatching?.score ?? 0) : eng.score).toLocaleString() },
    { label: "Mazes", value: solved },
    { label: "Moves", value: moves },
  ];

  // An arrow pad: up on its own above, left-down-right beneath, like a
  // keyboard's arrow keys. Chevrons drawn as SVG, so they're crisp and the
  // same on every phone (the ▲◀ characters render differently everywhere).
  const pad = (bit, label, cls, path) => (
    <button key={label} className={`press mz-btn ${cls}`} aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); step(byBit(bit)); }}>
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
  const controls = !isSpectator ? (
    <div className="mz-pad">
      {pad(N, "Up", "mz-up", "M6 15l6-6 6 6")}
      {pad(W, "Left", "mz-left", "M15 6l-6 6 6 6")}
      {pad(S, "Down", "mz-down", "M6 9l6 6 6-6")}
      {pad(E, "Right", "mz-right", "M9 6l6 6-6 6")}
    </div>
  ) : null;

  return (
    <>
      <GameFrame
        gameName="Maze Runner" badge="🧭 MAZE RUNNER"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
        controls={controls}
      >
        {({ w, h }) => {
          const hint = 26;
          const side = Math.floor(Math.max(180, Math.min(w, h - hint, 460)));
          const cell = Math.floor(side / Math.max(maze.rows, maze.cols));
          const gw = cell * maze.cols, gh = cell * maze.rows;
          const wall = Math.max(2, Math.round(cell * 0.09));
          return (
            <div className="mz-swipe" style={{ width: w, height: h }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <div className={`mz-frame${done ? " done" : ""}`} style={{ width: gw + 12 }}>
                <div className="mz-grid" style={{ width: gw, height: gh }}>
                  {maze.cells.map((bits, i) => {
                    const r = Math.floor(i / maze.cols), c = i % maze.cols;
                    const isGoal = r === maze.goal.r && c === maze.goal.c;
                    const walked = seen.has(`${r},${c}`);
                    return (
                      <span key={i} className={`mz-cell${walked ? " walked" : ""}${isGoal ? " goal" : ""}`}
                        style={{
                          left: c * cell, top: r * cell, width: cell, height: cell,
                          borderTopWidth: isOpen(maze, r, c, N) ? 0 : wall,
                          borderRightWidth: isOpen(maze, r, c, E) ? 0 : wall,
                          borderBottomWidth: isOpen(maze, r, c, S) ? 0 : wall,
                          borderLeftWidth: isOpen(maze, r, c, W) ? 0 : wall,
                        }}>
                        {isGoal && <span className="mz-flag" style={{ fontSize: Math.round(cell * 0.6) }}>🚩</span>}
                      </span>
                    );
                  })}
                  {/* the token eases across rather than jumping */}
                  <span className="mz-token"
                    style={{
                      width: Math.round(cell * 0.52), height: Math.round(cell * 0.52),
                      transform: `translate(${pos.c * cell + cell * 0.24}px, ${pos.r * cell + cell * 0.24}px)`,
                      transitionDuration: `${Math.round(1000 * EASE * 0.6) + (roll - 1) * 45}ms`,
                    }} />
                </div>
              </div>
              <div className="muted mz-help">
                {maze.rows}×{maze.cols} · swipe or tap an arrow — the ball rolls to the next turning
              </div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Mazes solved: ${solved}`} />
      )}
    </>
  );
}
