// src/components/games/SlidePuzzle.jsx
// The sliding tile puzzle: get the numbers back in order with the gap at the
// end. Tap any tile in the gap's row or column and the whole line slides
// (or swipe); the tiles glide rather than jump. Two 3×3 boards, then 4×4, and
// every second board is a picture cut into tiles. A tile in its own place
// wears a tick; a finished row chimes. Fewer moves and a quicker solve score
// more. The rules are slideRules.js; everyone in a room gets the same boards.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import sfx from "./sfx";
import { makeBoard, slideFrom, swipe, isSolved, rowsDone, scoreFor, sizeFor, isPicture } from "./slideRules.js";

const SOLVED_MS = 1300;      // a solved board, before the next
const SWIPE_PX = 24;

export default function SlidePuzzle(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null } = props;

  // Taps act on the ref, so two taps in one tick can't both slide the same tile.
  const live = useRef(null);
  if (live.current === null) live.current = { level: 1, tiles: makeBoard(seed, 1).tiles, moves: 0, busy: false, began: performance.now(), rows: 0, solved: 0 };
  const [view, setView] = useState(() => ({ level: 1, tiles: live.current.tiles, moves: 0 }));
  const show = () => { const L = live.current; setView({ level: L.level, tiles: L.tiles, moves: L.moves }); };
  const board = useMemo(() => makeBoard(seed, view.level), [seed, view.level]);
  const n = board.n;

  // Watching draws the same board the player is on: the tiles move rather
  // than being rebuilt, so the arrangement itself has to travel.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ tiles: live.current.tiles, moves: live.current.moves, level: live.current.level }),
    apply: (st) => { Object.assign(live.current, { tiles: st.tiles, moves: st.moves || 0, level: st.level || 1 }); show(); },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: spectate.extraState });
  const playing = !isSpectator && !eng.gameOver;

  const timers = useRef(new Set());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms); timers.current.add(t); };
  const uid = useRef(0);
  const [fx, setFx] = useState({ banner: null, done: null, nudge: 0 });
  function banner(text, cls = "") {
    const id = ++uid.current;
    setFx((f) => ({ ...f, banner: { id, text, cls } }));
    later(() => setFx((f) => (f.banner && f.banner.id === id ? { ...f, banner: null } : f)), 1300);
  }

  function apply(r) {
    if (!r) { setFx((f) => ({ ...f, nudge: f.nudge + 1 })); sfx.tone(140, 0.07, 0.04, "sine", 110); return; }
    const L = live.current;
    L.tiles = r.tiles;
    L.moves += r.moved;
    eng.addMove();
    sfx.tone(260 + r.moved * 35, 0.07, 0.09, "triangle", 190);
    sfx.noise(0.03, 0.05, 3200, "bandpass");
    if (isSolved(r.tiles)) {
      L.busy = true;
      const sc = scoreFor(n, L.moves, (performance.now() - L.began) / 1000);
      eng.addScore(sc.total);
      L.solved += 1;
      sfx.sparkle(); sfx.chime(5);
      setFx((f) => ({ ...f, banner: null, done: { moves: L.moves, ...sc } }));
      later(() => {
        L.level += 1; L.moves = 0; L.rows = 0; L.busy = false; L.began = performance.now();
        L.tiles = makeBoard(seed, L.level).tiles;
        setFx((f) => ({ ...f, done: null }));
        show();
        const lv = L.level;
        banner(`Board ${lv} · ${sizeFor(lv)}×${sizeFor(lv)}${isPicture(lv) ? " picture" : ""}`, sizeFor(lv) > sizeFor(lv - 1) ? "sp-banner-new" : "");
      }, SOLVED_MS);
    } else {
      const rows = rowsDone(r.tiles, n);
      if (rows > L.rows) { sfx.chime(rows); banner(`Row ${rows} ✓`, "sp-banner-row"); }
      L.rows = rows;
    }
    show();
  }

  // Tap or swipe on the board: worked out from where the finger went down and came up.
  const press = useRef(null);
  const geo = useRef({ cell: 0, gap: 0 });
  function down(e) {
    if (!playing || live.current.busy) return;
    const rect = e.currentTarget.getBoundingClientRect();
    press.current = { x: e.clientX, y: e.clientY, rx: e.clientX - rect.left, ry: e.clientY - rect.top };
  }
  function up(e) {
    const p = press.current;
    press.current = null;
    if (!p || !playing || live.current.busy) return;
    const L = live.current, dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_PX) {
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
      apply(swipe(L.tiles, n, dir));
      return;
    }
    const { cell, gap } = geo.current;
    const col = Math.floor(p.rx / (cell + gap)), row = Math.floor(p.ry / (cell + gap));
    if (col < 0 || row < 0 || col >= n || row >= n) return;
    apply(slideFrom(L.tiles, n, row * n + col));
  }

  // the last ten seconds tick; a soft beat under it
  const secs = Math.ceil(eng.timeLeft);
  useEffect(() => { if (playing && !eng.unlimited && secs > 0 && secs <= 10) sfx.tick(secs <= 3); }, [secs, playing, eng.unlimited]);
  useEffect(() => { if (!playing) return undefined; const b = sfx.beat(() => 84, 0.3); return () => b.stop(); }, [playing]);
  const ended = useRef(false);
  useEffect(() => {
    if (!eng.gameOver || isSpectator || ended.current) return;
    ended.current = true;
    if (eng.won || eng.rank === 1) sfx.win(); else sfx.lose();
  }, [eng.gameOver, eng.won, eng.rank, isSpectator]);

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }, { label: "Board", value: view.level }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Board", value: view.level },
        { label: "Moves", value: view.moves },
      ];
  const tiles = view.tiles.length === n * n ? view.tiles : board.tiles;     // a watcher's snapshot from another size, briefly
  const done = !!fx.done;

  return (
    <>
      <GameFrame
        gameName="Slide Puzzle" badge="🔀 SLIDE PUZZLE"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        onQuit={eng.endMatch}
        sound
      >
        {({ w, h }) => {
          const hint = 40;
          const side = Math.floor(Math.max(160, Math.min(w - 16, h - hint - 16, 460)));
          const gap = Math.round(side * 0.022);
          const cell = (side - gap * (n - 1)) / n;
          geo.current = { cell, gap };
          const at = (i) => `translate(${(i % n) * (cell + gap)}px, ${Math.floor(i / n) * (cell + gap)}px)`;
          const pic = board.picture;
          const g = tiles.indexOf(0);
          const ready = (i) => i % n === g % n || Math.floor(i / n) === Math.floor(g / n);
          return (
            <div className="sp-wrap">
              <div className={`sp-frame${done ? " done" : ""}${fx.nudge % 2 ? " sp-nudgeA" : fx.nudge ? " sp-nudgeB" : ""}`} style={{ width: side + 16 }}>
                <div className="sp-board" style={{ width: side, height: side }}
                  onPointerDown={down} onPointerUp={up} onPointerCancel={() => { press.current = null; }}>
                  {Array.from({ length: n * n - 1 }, (_, k) => k + 1).map((t) => {
                    const i = tiles.indexOf(t);
                    const home = i === t - 1;
                    const hx = (t - 1) % n, hy = Math.floor((t - 1) / n);
                    return (
                      <div key={`${view.level}-${t}`} className={`sp-tile${home ? " home" : ""}${pic ? " pic" : ""}${playing && ready(i) ? " ready" : ""}`}
                        role="button" aria-label={`Tile ${t}${home ? ", in place" : ""}`}
                        style={{ width: cell, height: cell, transform: at(i), fontSize: Math.round(cell * (n > 3 ? 0.4 : 0.42)),
                          animationDelay: done ? `${(hx + hy) * 45}ms` : undefined,
                          ...(pic ? { background: `linear-gradient(135deg, hsl(${board.hue} 85% 78%), hsl(${(board.hue + 50) % 360} 80% 62%))`,
                            backgroundSize: `${side}px ${side}px`, backgroundPosition: `${-hx * (cell + gap)}px ${-hy * (cell + gap)}px` } : null) }}>
                        {pic
                          ? <>
                              <span className="sp-pic" style={{ width: side, height: side, left: -hx * (cell + gap), top: -hy * (cell + gap), fontSize: side * 0.78 }}>{pic}</span>
                              <span className="sp-no">{t}</span>
                            </>
                          : <span className="sp-num">{t}</span>}
                      </div>
                    );
                  })}
                  {done && <div className="sp-solved">
                    <b>Solved!</b>
                    <span>{fx.done.moves} moves · +{fx.done.pts}{fx.done.fast ? ` · fast +${fx.done.fast}` : ""}</span>
                  </div>}
                </div>
              </div>
              <div className="muted sp-help">{n}×{n} · tap a tile in the gap's row or column, or swipe</div>
              {fx.banner && <div key={fx.banner.id} className={`sp-banner ${fx.banner.cls}`}>{fx.banner.text}</div>}
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Puzzles solved: ${view.level - 1}`} />
      )}
    </>
  );
}
