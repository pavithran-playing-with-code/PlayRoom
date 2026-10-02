// src/components/games/BlockDrop.jsx
// Block Blast: an 8x8 grid and three pieces at a time. Put a piece down where
// it fits; fill a whole row or column and it clears. Nothing falls — every
// piece goes exactly where you choose.
//
// Drag a piece from the tray onto the board and let go. While you drag, the
// piece floats a little above your finger — so the finger never covers the
// cells you're aiming at — and the board shows where it would land, green if
// it fits. The tray and the board don't scroll under a drag (touch-action),
// and the piece is held by pointer capture, so a drag that strays is still
// yours. Tapping a piece and then the board still works too.
//
// Running out of room doesn't end the match — the room's clock does — so a
// stuck board is swept and a fresh one dealt, with the score kept.
//
// The rules live in blastBoard.js. This file is the screen and the taps.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import {
  SIZE, PIECES, emptyBoard, canPlace, anyFits, place, clearLines,
  PLACE_POINTS, scoreForClear, makeDealer,
} from "./blastBoard";

const SWEEP_MS = 1100;
const DRAG_MIN = 8;            // px a finger moves before a press becomes a drag
const LIFT = 34;               // how far above the finger the dragged piece floats

export default function BlockDrop(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null } = props;

  const dealer = useRef(null);
  if (dealer.current === null) dealer.current = makeDealer(seed);

  const live = useRef(null);
  if (live.current === null) {
    live.current = { board: emptyBoard(), tray: dealer.current.deal(), lines: 0, sweeps: 0, pick: null };
  }

  const [board, setBoard] = useState(live.current.board);
  const [tray, setTray] = useState(live.current.tray);
  const [pick, setPick] = useState(null);          // index into the tray
  const [lines, setLines] = useState(0);
  const [sweeps, setSweeps] = useState(0);
  const [hover, setHover] = useState(null);        // { r, c } for the ghost
  const [msg, setMsg] = useState(null);
  const [drag, setDrag] = useState(null);          // { i, x, y } while a piece is being dragged
  const dragRef = useRef(null);                    // { i, id, sx, sy, moved }
  const gridRef = useRef(null);
  const geom = useRef({ cell: 30, gap: 3 });       // the board's cell size, from the last render
  const timers = useRef([]);
  const uid = useRef(0);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  // Watching draws the same board: the pieces are dealt from the seed, but
  // where they were put is a choice, so the grid itself travels.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({
      board: live.current.board,
      tray: live.current.tray.map((p) => (p ? p.k : null)),
      lines: live.current.lines,
    }),
    apply: (st) => {
      live.current.board = st.board || emptyBoard();
      live.current.tray = (st.tray || []).map((k) => (k ? PIECES.find((p) => p.k === k) : null));
      live.current.lines = st.lines || 0;
      setBoard(live.current.board);
      setTray(live.current.tray);
      setLines(live.current.lines);
      setPick(null);
    },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: spectate.extraState });

  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);

  function say(text, type) {
    const n = ++uid.current;
    setMsg({ text, type });
    later(() => setMsg((m) => (uid.current === n ? null : m)), 1300);
  }

  const show = () => {
    const s = live.current;
    setBoard(s.board);
    setTray(s.tray);
  };

  // Three used up, or nothing left that fits: deal again, and if the board is
  // genuinely stuck, sweep it. A timed match must never dead-end.
  function refill(s) {
    if (s.tray.some(Boolean)) return;
    s.tray = dealer.current.deal();
    if (!anyFits(s.board, s.tray)) {
      s.sweeps += 1;
      s.board = emptyBoard();
      setSweeps(s.sweeps);
      say("No room left — board swept!", "error");
    }
  }

  function drop(r, c) {
    if (overRef.current || isSpectator) return;
    const s = live.current;
    if (s.pick === null) { say("Pick a piece first", "info"); return; }
    const piece = s.tray[s.pick];
    if (!piece) return;
    if (!canPlace(s.board, piece, r, c)) { say("It doesn't fit there", "error"); return; }

    s.board = place(s.board, piece, r, c);
    s.tray = s.tray.map((p, i) => (i === s.pick ? null : p));
    s.pick = null;
    eng.addMove();
    eng.addScore(piece.size * PLACE_POINTS);

    const { board: cleared, cleared: n } = clearLines(s.board);
    if (n) {
      s.board = cleared;
      s.lines += n;
      const gain = scoreForClear(n);
      eng.addScore(gain);
      setLines(s.lines);
      say(n > 1 ? `${n} lines at once! +${gain}` : `Line cleared! +${gain}`, "success");
    }

    refill(s);
    setPick(null);
    setHover(null);
    show();

    // Stuck with pieces still in the tray: sweep after a beat so the player
    // sees why, rather than the board just emptying under them.
    if (!anyFits(s.board, s.tray)) {
      later(() => {
        const t = live.current;
        if (overRef.current || anyFits(t.board, t.tray)) return;
        t.sweeps += 1;
        t.board = emptyBoard();
        setSweeps(t.sweeps);
        say("Nothing fits — board swept!", "error");
        show();
      }, SWEEP_MS);
    }
  }

  function choose(i) {
    if (overRef.current || isSpectator) return;
    const s = live.current;
    if (!s.tray[i]) return;
    s.pick = s.pick === i ? null : i;
    setPick(s.pick);
    setHover(null);
  }

  // ── dragging a piece ───────────────────────────────────────────────────────
  // Where would the dragged piece land? Its top-left cell is under the
  // floating piece's top-left corner, rounded to the nearest cell.
  function targetFor(i, x, y) {
    const piece = live.current.tray[i];
    const grid = gridRef.current;
    if (!piece || !grid) return null;
    const { cell, gap } = geom.current, step = cell + gap;
    const pw = piece.w * step - gap, ph = piece.h * step - gap;
    const left = x - pw / 2, top = y - LIFT - ph;
    const rect = grid.getBoundingClientRect();
    const r = Math.round((top - rect.top) / step), c = Math.round((left - rect.left) / step);
    if (r < -1 || c < -1 || r > SIZE || c > SIZE) return null;   // nowhere near the board
    return { r, c };
  }

  function dragStart(i, e) {
    if (overRef.current || isSpectator || !live.current.tray[i]) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    dragRef.current = { i, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
  }
  function dragMove(e) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_MIN) return;
    if (!d.moved) {
      d.moved = true;
      live.current.pick = d.i;
      setPick(d.i);
    }
    setDrag({ i: d.i, x: e.clientX, y: e.clientY });
    setHover(targetFor(d.i, e.clientX, e.clientY));
  }
  function dragEnd(e) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.id) return;
    dragRef.current = null;
    setDrag(null);
    if (!d.moved) { choose(d.i); return; }               // a tap: pick it, then tap the board
    const at = e.type === "pointercancel" ? null : targetFor(d.i, e.clientX, e.clientY);
    const piece = live.current.tray[d.i];
    if (at && piece && canPlace(live.current.board, piece, at.r, at.c)) { drop(at.r, at.c); return; }
    if (at) say("It doesn't fit there", "error");
    live.current.pick = null;                           // back to the tray
    setPick(null);
    setHover(null);
  }

  const oppList = Object.values(eng.opponents);
  const stats = [
    { label: "Score", value: Number(isSpectator ? (spectatorWatching?.score ?? 0) : eng.score).toLocaleString() },
    { label: "Lines", value: lines },
    ...(sweeps ? [{ label: "Sweeps", value: sweeps }] : []),
  ];

  // Where the picked piece would land, so you can see before you commit.
  const ghost = new Set();
  let ghostOk = false;
  if (pick !== null && hover && tray[pick]) {
    ghostOk = canPlace(board, tray[pick], hover.r, hover.c);
    for (const [dr, dc] of tray[pick].cells) {
      const rr = hover.r + dr, cc = hover.c + dc;
      if (rr < SIZE && cc < SIZE) ghost.add(rr * SIZE + cc);
    }
  }

  return (
    <>
      <GameFrame
        gameName="Block Blast" badge="🧱 BLOCK BLAST"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          const trayH = 96;
          const gap = 3;
          const cell = Math.floor(Math.max(18, Math.min(46,
            (Math.min(w, h - trayH) - gap * (SIZE - 1)) / SIZE)));
          const boardPx = cell * SIZE + gap * (SIZE - 1);
          geom.current = { cell, gap };
          return (
            <div className="bb-wrap">
              <div className="bb-frame" style={{ width: boardPx + 14 }}>
                <div className="bb-grid" ref={gridRef}
                  style={{ gridTemplateColumns: `repeat(${SIZE}, ${cell}px)`, gridAutoRows: `${cell}px`, gap }}>
                  {board.map((fill, i) => {
                    const r = Math.floor(i / SIZE), c = i % SIZE;
                    const isGhost = ghost.has(i) && !fill;
                    return (
                      <span key={i}
                        className={`bb-cell${fill ? " on" : ""}${isGhost ? (ghostOk ? " ghost" : " nope") : ""}`}
                        style={fill ? { background: fill } : undefined}
                        onPointerEnter={() => pick !== null && !drag && setHover({ r, c })}
                        onPointerDown={() => { setHover({ r, c }); drop(r, c); }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* the three on offer */}
              <div className="bb-tray" aria-label="Pieces to place">
                {tray.map((p, i) => (
                  <button key={i} type="button"
                    className={`bb-slot${pick === i ? " picked" : ""}${p ? "" : " used"}${drag && drag.i === i ? " dragging" : ""}`}
                    onPointerDown={(e) => dragStart(i, e)} onPointerMove={dragMove}
                    onPointerUp={dragEnd} onPointerCancel={dragEnd}
                    disabled={!p || isSpectator}
                    aria-pressed={pick === i}
                    aria-label={p ? `Piece ${i + 1}, ${p.size} blocks` : "Used"}>
                    {p && (
                      <span className="bb-mini"
                        style={{ gridTemplateColumns: `repeat(${p.w}, 1fr)`, gridAutoRows: "1fr" }}>
                        {Array.from({ length: p.w * p.h }).map((_, k) => {
                          const rr = Math.floor(k / p.w), cc = k % p.w;
                          const on = p.cells.some(([a, b]) => a === rr && b === cc);
                          return <span key={k} style={{ background: on ? p.colour : "transparent" }} />;
                        })}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {!isSpectator && (
                <div className="muted bb-help">
                  {drag ? "Let go where it fits" : pick === null ? "Drag a piece onto the board" : "Now tap where it goes — or drag it"}
                </div>
              )}

              {/* the piece in your hand, floating above your finger */}
              {drag && tray[drag.i] && createPortal(
                <div className="bb-float" style={{
                  left: drag.x - (tray[drag.i].w * (cell + gap) - gap) / 2,
                  top: drag.y - LIFT - (tray[drag.i].h * (cell + gap) - gap),
                  gridTemplateColumns: `repeat(${tray[drag.i].w}, ${cell}px)`, gridAutoRows: `${cell}px`, gap,
                }}>
                  {Array.from({ length: tray[drag.i].w * tray[drag.i].h }).map((_, k) => {
                    const p = tray[drag.i], rr = Math.floor(k / p.w), cc = k % p.w;
                    const on = p.cells.some(([a, b]) => a === rr && b === cc);
                    return <span key={k} className={on ? "on" : ""} style={on ? { background: p.colour } : undefined} />;
                  })}
                </div>, document.body)}
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`Lines cleared: ${lines}${sweeps ? ` · Boards swept: ${sweeps}` : ""}`} />
      )}
    </>
  );
}
