// src/components/games/BlockDrop.jsx
// Falling blocks, the way you remember them: move, turn, drop, clear lines.
// 10 columns by 18 rows, seven shapes, one colour each.
//
// Topping out doesn't end your match here — the room's clock does that — so a
// full board is swept away and you keep playing, with your score and lines
// intact. The end screen shows lines cleared and the level you reached.
//
// The rules live in tetrisBoard.js. This file is the screen and the controls.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import {
  COLS, ROWS, PIECES, emptyBoard, spawn, moved, tryRotate, collides,
  merge, clearLines, dropDistance, pieceCells, rotated, scoreFor, levelFor, dropMs, makeBag,
} from "./tetrisBoard";

const HARD_DROP_BONUS = 2;        // per row skipped

export default function BlockDrop(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;

  const bag = useMemo(() => makeBag(seed), [seed]);
  const live = useRef(null);
  if (live.current === null) {
    live.current = { board: emptyBoard(), piece: spawn(bag.next()), next: bag.next(), lines: 0, level: 1, topouts: 0 };
  }

  const [view, setView] = useState({ board: live.current.board, piece: live.current.piece, next: live.current.next });
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [topouts, setTopouts] = useState(0);
  const [msg, setMsg] = useState(null);
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);
  const timers = useRef([]);
  const uid = useRef(0);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const show = () => {
    const s = live.current;
    setView({ board: s.board, piece: s.piece, next: s.next });
  };
  function say(text, type) {
    const n = ++uid.current;
    setMsg({ text, type });
    timers.current.push(setTimeout(() => setMsg((m) => (uid.current === n ? null : m)), 1200));
  }

  // Put the piece down, clear any full rows, bring in the next one.
  function lock(s) {
    s.board = merge(s.board, s.piece);
    const { board, cleared } = clearLines(s.board);
    s.board = board;
    if (cleared) {
      s.lines += cleared;
      s.level = levelFor(s.lines);
      const gain = scoreFor(cleared, s.level);
      addScore(gain);
      setLines(s.lines);
      setLevel(s.level);
      say(cleared === 4 ? `Four lines! +${gain}` : `${cleared} line${cleared > 1 ? "s" : ""} +${gain}`, "success");
    }
    s.piece = spawn(s.next);
    s.next = bag.next();
    if (collides(s.board, s.piece)) {
      // Topped out. In a timed match that can't be the end, so the board is
      // swept and play carries on; the score and lines you earned stay.
      s.topouts += 1;
      s.board = emptyBoard();
      setTopouts(s.topouts);
      say("Board full — swept clean!", "error");
    }
  }

  function act(what) {
    if (overRef.current || isSpectator) return;
    const s = live.current;
    if (what === "left" || what === "right") {
      const m = moved(s.board, s.piece, what === "left" ? -1 : 1, 0);
      if (m) s.piece = m;
    } else if (what === "rotate") {
      const r = tryRotate(s.board, s.piece, 1);
      if (r) s.piece = r;
    } else if (what === "down") {
      const m = moved(s.board, s.piece, 0, 1);
      if (m) s.piece = m;
      else lock(s);
    } else if (what === "drop") {
      const d = dropDistance(s.board, s.piece);
      s.piece = { ...s.piece, y: s.piece.y + d };
      if (d) addScore(d * HARD_DROP_BONUS);
      lock(s);
    }
    show();
  }

  // Keyboard, rebound each render so it always sees the current state.
  useEffect(() => {
    if (isSpectator) return undefined;
    const keys = {
      ArrowLeft: "left", a: "left", A: "left",
      ArrowRight: "right", d: "right", D: "right",
      ArrowUp: "rotate", w: "rotate", W: "rotate",
      ArrowDown: "down", s: "down", S: "down",
      " ": "drop", Spacebar: "drop",
    };
    const onKey = (e) => {
      const what = keys[e.key];
      if (!what) return;
      e.preventDefault();
      if (e.repeat && what === "drop") return;     // holding space shouldn't slam piece after piece
      act(what);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Gravity: one row every dropMs(level), which shortens as the level goes up.
  useEffect(() => {
    if (isSpectator) return undefined;
    let raf;
    let last = performance.now();
    let waited = 0;
    const frame = (now) => {
      const dt = Math.min(200, now - last);        // a hidden tab mustn't dump a pile of rows
      last = now;
      if (!overRef.current) {
        waited += dt;
        const every = dropMs(live.current.level);
        while (waited >= every) {
          waited -= every;
          act("down");
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Lines", value: lines },
        { label: "Level", value: level },
      ];

  const hold = (what) => (e) => { e.preventDefault(); act(what); };
  const controls = !isSpectator ? (
    <>
      <button className="press p-sun bd-btn" onPointerDown={hold("drop")} aria-label="Hard drop">⤓</button>
      <button className="press p-white bd-btn" onPointerDown={hold("down")} aria-label="Soft drop">▼</button>
      <button className="press p-white bd-btn" onPointerDown={hold("left")} aria-label="Move left">◀</button>
      <button className="press p-white bd-btn" onPointerDown={hold("rotate")} aria-label="Rotate">⟳</button>
      <button className="press p-white bd-btn" onPointerDown={hold("right")} aria-label="Move right">▶</button>
    </>
  ) : null;

  return (
    <>
      <GameFrame
        gameName="Block Drop" badge="🧱 BLOCK DROP"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        message={msg}
        onQuit={eng.endMatch}
        controls={controls}
      >
        {({ w, h }) => {
          if (isSpectator) {
            return (
              <div className="muted">
                👀 Watching {spectatorWatching?.username} — {Number(specScore).toLocaleString()} pts
              </div>
            );
          }
          const frame = 14;
          // The next-piece box sits beside the board when there's room for it,
          // and above the board otherwise — where it costs height.
          const beside = w > 34 * COLS + 110;
          const nextH = beside ? 0 : 52;
          const cell = Math.floor(Math.max(12, Math.min(34,
            (w - frame - (beside ? 90 : 0)) / COLS, (h - frame - nextH) / ROWS)));
          const board = view.board.slice();
          // where this piece would land, so you can aim
          const ghostY = view.piece.y + dropDistance(view.board, view.piece);
          for (const [x, y] of pieceCells({ ...view.piece, y: ghostY })) {
            if (y >= 0 && !board[y * COLS + x]) board[y * COLS + x] = "ghost";
          }
          for (const [x, y] of pieceCells(view.piece)) {
            if (y >= 0) board[y * COLS + x] = PIECES[view.piece.type].color;
          }
          const nextCells = rotated(view.next, 0);
          const nw = Math.max(...nextCells.map(([x]) => x)) + 1;
          return (
            <div className={`bd-wrap${beside ? "" : " stacked"}`}>
              <div className="bd-frame" style={{ width: cell * COLS + frame }}>
                <div className="bd-grid" style={{ gridTemplateColumns: `repeat(${COLS}, ${cell}px)`, gridAutoRows: `${cell}px` }}>
                  {board.map((c, i) => (
                    <span key={i} className={`bd-cell${c === "ghost" ? " ghost" : ""}`}
                      style={{ background: c && c !== "ghost" ? c : undefined }} />
                  ))}
                </div>
              </div>
              <div className="bd-next" aria-label={`Next piece: ${view.next}`}>
                <span className="muted">Next</span>
                <span className="bd-mini" style={{ gridTemplateColumns: `repeat(${nw}, ${Math.round(cell * 0.6)}px)`,
                  gridAutoRows: `${Math.round(cell * 0.6)}px` }}>
                  {Array.from({ length: nw * 2 }).map((_, i) => {
                    const x = i % nw, y = Math.floor(i / nw);
                    const on = nextCells.some(([cx, cy]) => cx === x && cy === y);
                    return <span key={i} className="bd-cell" style={{ background: on ? PIECES[view.next].color : undefined }} />;
                  })}
                </span>
              </div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`Lines: ${lines} · Level ${level}${topouts ? ` · Boards topped out: ${topouts}` : ""}`} />
      )}
    </>
  );
}
