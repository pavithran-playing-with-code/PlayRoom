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
// While you drag, the rows and columns the piece would fill glow. Cleared
// lines burst in their own colours; clear again within three placements and
// the combo grows, each line worth more; empty the whole board for a bonus.
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
  PLACE_POINTS, makeDealer, wouldClear, comboStep, clearPoints, isEmpty, ALL_CLEAR, COMBO_WINDOW,
} from "./blastBoard";
import sfx from "./sfx";

const SWEEP_MS = 1100;
// A tray piece's cell size: as big as fits the slot, the same in both directions.
const miniCell = (p) => Math.max(8, Math.min(16, Math.floor(54 / Math.max(p.w, p.h))));
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
    live.current = { board: emptyBoard(), tray: dealer.current.deal(), lines: 0, sweeps: 0, pick: null, combo: { combo: 0, since: 0 } };
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
  // the shows: blocks popping in, lines bursting, points, banners, the combo
  const [fx, setFx] = useState({ fresh: [], blasts: [], pops: [], banner: null, shake: 0, combo: 0, since: 0 });
  function banner(text, cls = "") {
    const id = ++uid.current;
    setFx((f) => ({ ...f, banner: { id, text, cls } }));
    later(() => setFx((f) => (f.banner && f.banner.id === id ? { ...f, banner: null } : f)), 1300);
  }
  function popAt(r, c, text, cls = "") {
    const id = ++uid.current;
    setFx((f) => ({ ...f, pops: [...f.pops.slice(-3), { id, r, c, text, cls }] }));
    later(() => setFx((f) => ({ ...f, pops: f.pops.filter((p) => p.id !== id) })), 900);
  }

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
      s.combo = { combo: 0, since: 0 };
      setSweeps(s.sweeps);
      sfx.whoosh();
      say("No room left — board swept!", "error");
    }
  }

  function drop(r, c) {
    if (overRef.current || isSpectator) return;
    const s = live.current;
    if (s.pick === null) return;                      // the help line says what to do
    const piece = s.tray[s.pick];
    if (!piece) return;
    if (!canPlace(s.board, piece, r, c)) { sfx.tone(150, 0.08, 0.05, "square", 110); say("It doesn't fit there", "error"); return; }

    s.board = place(s.board, piece, r, c);
    s.tray = s.tray.map((p, i) => (i === s.pick ? null : p));
    s.pick = null;
    eng.addMove();
    eng.addScore(piece.size * PLACE_POINTS);
    sfx.tone(180, 0.1, 0.12, "sine", 110);
    sfx.noise(0.04, 0.06, 1200, "lowpass");
    const fresh = piece.cells.map(([dr, dc]) => (r + dr) * SIZE + (c + dc));

    const { board: cleared, cleared: n, rows, cols } = clearLines(s.board);
    s.combo = comboStep(s.combo, n);
    let blasts = [];
    if (n) {
      // the lines burst in their own colours
      const gone = new Set();
      for (const rr of rows) for (let cc = 0; cc < SIZE; cc++) gone.add(rr * SIZE + cc);
      for (const cc of cols) for (let rr = 0; rr < SIZE; rr++) gone.add(rr * SIZE + cc);
      blasts = [...gone].map((i) => ({ i, colour: s.board[i] }));
      s.board = cleared;
      s.lines += n;
      const gain = clearPoints(n, s.combo.combo);
      eng.addScore(gain);
      setLines(s.lines);
      sfx.crack();
      sfx.chime(Math.min(6, n + s.combo.combo - 1));
      popAt(r, c, `+${gain}`, n > 1 ? "bb-pop-big" : "");
      if (isEmpty(s.board)) {
        eng.addScore(ALL_CLEAR);
        sfx.sparkle(); sfx.win();
        banner(`✨ All clear! +${ALL_CLEAR}`, "bb-banner-clear");
      } else if (s.combo.combo >= 2) banner(`Combo ×${s.combo.combo}!`, "bb-banner-combo");
      else if (n > 1) banner(`${n} lines!`, "bb-banner-lines");
      say(n > 1 ? `${n} lines at once! +${gain}` : `Line cleared! +${gain}`, "success");
    } else popAt(r, c, `+${piece.size * PLACE_POINTS}`, "bb-pop-small");
    const id = ++uid.current;
    setFx((f) => ({ ...f, fresh, blasts: n ? [{ id, cells: blasts }] : f.blasts, shake: n > 1 ? f.shake + 1 : f.shake, combo: s.combo.combo, since: s.combo.since }));
    if (n) later(() => setFx((f) => ({ ...f, blasts: f.blasts.filter((b) => b.id !== id) })), 520);

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
        t.combo = { combo: 0, since: 0 };
        setFx((f) => ({ ...f, combo: 0, since: 0 }));
        sfx.whoosh();
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
    if (s.pick !== null) sfx.tone(660, 0.05, 0.04, "triangle", 880);
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
      sfx.tone(660, 0.05, 0.04, "triangle", 880);
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
    if (at) { sfx.tone(150, 0.08, 0.05, "square", 110); say("It doesn't fit there", "error"); }
    live.current.pick = null;                           // back to the tray
    setPick(null);
    setHover(null);
  }

  // the last ten seconds tick; a beat under it, quicker with the combo
  const playing = !isSpectator && !eng.gameOver;
  const secs = Math.ceil(eng.timeLeft);
  useEffect(() => { if (playing && !eng.unlimited && secs > 0 && secs <= 10) sfx.tick(secs <= 3); }, [secs, playing, eng.unlimited]);
  const tempo = useRef(90);
  tempo.current = 88 + Math.min(fx.combo, 8) * 4;
  useEffect(() => { if (!playing) return undefined; const b = sfx.beat(() => tempo.current, 0.4); return () => b.stop(); }, [playing]);
  const ended = useRef(false);
  useEffect(() => {
    if (!eng.gameOver || isSpectator || ended.current) return;
    ended.current = true;
    if (eng.won || eng.rank === 1) sfx.win(); else sfx.lose();
  }, [eng.gameOver, eng.won, eng.rank, isSpectator]);

  const oppList = Object.values(eng.opponents);
  const stats = [
    { label: "Score", value: Number(isSpectator ? (spectatorWatching?.score ?? 0) : eng.score).toLocaleString() },
    { label: "Lines", value: lines },
    { label: "Combo", value: fx.combo > 1 ? `×${fx.combo}` : "—" },
  ];

  // Where the picked piece would land, so you can see before you commit.
  const ghost = new Set();
  let ghostOk = false;
  // and the rows and columns it would fill, which glow
  const lineSet = new Set();
  if (pick !== null && hover && tray[pick]) {
    ghostOk = canPlace(board, tray[pick], hover.r, hover.c);
    for (const [dr, dc] of tray[pick].cells) {
      const rr = hover.r + dr, cc = hover.c + dc;
      if (rr < SIZE && cc < SIZE) ghost.add(rr * SIZE + cc);
    }
    if (ghostOk) {
      const pv = wouldClear(board, tray[pick], hover.r, hover.c);
      for (const rr of pv.rows) for (let cc = 0; cc < SIZE; cc++) lineSet.add(rr * SIZE + cc);
      for (const cc of pv.cols) for (let rr = 0; rr < SIZE; rr++) lineSet.add(rr * SIZE + cc);
    }
  }
  const freshSet = new Set(fx.fresh);

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
        sound
      >
        {({ w, h }) => {
          const trayH = 128;
          const gap = 3;
          const cell = Math.floor(Math.max(18, Math.min(46,
            (Math.min(w, h - trayH) - gap * (SIZE - 1)) / SIZE)));
          const boardPx = cell * SIZE + gap * (SIZE - 1);
          geom.current = { cell, gap };
          return (
            <div className="bb-wrap">
              <div className={`bb-frame${fx.shake % 2 ? " bb-shakeA" : fx.shake ? " bb-shakeB" : ""}`} style={{ width: boardPx + 14 }}>
                <div className="bb-grid" ref={gridRef}
                  style={{ gridTemplateColumns: `repeat(${SIZE}, ${cell}px)`, gridAutoRows: `${cell}px`, gap }}>
                  {board.map((fill, i) => {
                    const r = Math.floor(i / SIZE), c = i % SIZE;
                    const isGhost = ghost.has(i) && !fill;
                    return (
                      <span key={i}
                        className={`bb-cell${fill ? " on" : ""}${isGhost ? (ghostOk ? " ghost" : " nope") : ""}${lineSet.has(i) ? " line" : ""}${fill && freshSet.has(i) ? " fresh" : ""}`}
                        style={fill ? { background: fill } : undefined}
                        onPointerEnter={() => pick !== null && !drag && setHover({ r, c })}
                        onPointerDown={() => { setHover({ r, c }); drop(r, c); }}
                      />
                    );
                  })}
                  {/* cleared lines bursting, in their own colours */}
                  {fx.blasts.map((b) => b.cells.map(({ i, colour }) => (
                    <span key={`${b.id}-${i}`} className="bb-blast"
                      style={{ left: (i % SIZE) * (cell + gap), top: Math.floor(i / SIZE) * (cell + gap), width: cell, height: cell, background: colour, animationDelay: `${((i % SIZE) + Math.floor(i / SIZE)) * 12}ms` }} />
                  )))}
                  {fx.pops.map((p) => (
                    <span key={p.id} className={`bb-pop ${p.cls}`} style={{ left: p.c * (cell + gap) + cell, top: p.r * (cell + gap) }}>{p.text}</span>
                  ))}
                </div>
                {fx.banner && <div key={fx.banner.id} className={`bb-banner ${fx.banner.cls}`}>{fx.banner.text}</div>}
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
                      // square cells, so a piece looks the shape it is on the
                      // board: a straight four is a thin line, not a fat block
                      <span className="bb-mini"
                        style={{ gridTemplateColumns: `repeat(${p.w}, ${miniCell(p)}px)`, gridAutoRows: `${miniCell(p)}px` }}>
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
              {!isSpectator && (
                <div className={`bb-combo${fx.combo > 1 ? " on" : ""}`} aria-label={`Combo ${fx.combo}`}>
                  <b>Combo ×{Math.max(1, fx.combo)}</b>
                  {/* how many placements are left to keep it going */}
                  {Array.from({ length: COMBO_WINDOW }).map((_, k) => <i key={k} className={fx.combo && k < COMBO_WINDOW - fx.since ? "lit" : ""} />)}
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
