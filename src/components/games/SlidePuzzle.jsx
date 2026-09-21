// src/components/games/SlidePuzzle.jsx
// The old sliding tile puzzle, kept to 3×3: numbers 1–8 and one empty slot.
// Tap a tile next to the slot and it slides in. Get them back in order to
// clear the board, then a fresh one appears. Fewer moves scores more.
//
// Boards are shuffled by making random legal moves from the solved state, so
// every board can always be solved. Everyone in a room gets the same boards.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { seededRand } from "./seededRand";

const N = 3;                       // 3 x 3: eight tiles and a gap
const SIZE = N * N;
const SHUFFLE_MOVES = 56;
const SOLVED_MS = 900;
const scoreFor = (moves) => Math.max(50, 300 - moves * 4);

const solved = () => [...Array(SIZE - 1).keys()].map((i) => i + 1).concat(0);
const isSolved = (tiles) => tiles.every((t, i) => t === solved()[i]);
const neighbours = (i) => {
  const x = i % N, y = Math.floor(i / N);
  return [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < N && ny < N)
    .map(([nx, ny]) => ny * N + nx);
};

// Shuffle by sliding, never by shuffling the numbers: that way the board is
// always solvable (a random arrangement is only solvable half the time).
function makeBoard(seed, level) {
  const rand = seededRand((Number(seed) || 1) * 8191 + level * 31337 + 7);
  for (let i = 0; i < 6; i++) rand();
  const tiles = solved();
  let gap = SIZE - 1;
  let last = -1;
  for (let i = 0; i < SHUFFLE_MOVES; i++) {
    const cameFrom = last;                                       // don't undo the move just made
    const options = neighbours(gap).filter((n) => n !== cameFrom);
    const pick = options[Math.floor(rand() * options.length)];
    tiles[gap] = tiles[pick];
    tiles[pick] = 0;
    last = gap;
    gap = pick;
  }
  // A shuffle that lands back on the solved board would be a free point.
  if (isSolved(tiles)) return makeBoard(seed, level + 1000);
  return tiles;
}

export default function SlidePuzzle(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });

  const [level, setLevel] = useState(1);
  const start = useMemo(() => makeBoard(seed, level), [seed, level]);
  const [tiles, setTiles] = useState(start);
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState(null);

  // Taps act on the ref, so two taps in one tick can't both slide the same tile.
  const live = useRef({ tiles: start, moves: 0, level: 1, busy: false });
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

  function slide(i) {
    if (eng.gameOver || isSpectator) return;
    const s = live.current;
    if (s.busy || s.tiles[i] === 0) return;
    const gap = s.tiles.indexOf(0);
    if (!neighbours(gap).includes(i)) return;        // not next to the gap: nothing happens

    const next = s.tiles.slice();
    next[gap] = next[i];
    next[i] = 0;
    s.tiles = next;
    s.moves += 1;
    setTiles(next);
    setMoves(s.moves);
    eng.addMove();

    if (isSolved(next)) {
      s.busy = true;
      const gain = scoreFor(s.moves);
      eng.addScore(gain);
      setDone(true);
      say(`Solved in ${s.moves} moves! +${gain}`, "success");
      later(() => {
        s.level += 1;
        s.moves = 0;
        s.busy = false;
        setLevel(s.level);
        setMoves(0);
        setDone(false);
      }, SOLVED_MS);
    }
  }

  // A new board arrives with the level.
  useEffect(() => {
    live.current.tiles = start;
    setTiles(start);
  }, [start]);

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Board", value: level },
        { label: "Moves", value: moves },
      ];

  return (
    <>
      <GameFrame
        gameName="Slide Puzzle" badge="🔀 SLIDE PUZZLE"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
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
          const hint = 34;
          const side = Math.floor(Math.max(160, Math.min(w, h - hint, 440)));
          const gap = Math.round(side * 0.025);
          const cell = Math.floor((side - gap * (N - 1)) / N);
          const gapIndex = tiles.indexOf(0);
          return (
            <div style={{ textAlign: "center" }}>
              <div className={`sp-frame${done ? " done" : ""}`} style={{ width: side + 16 }}>
                <div className="sp-grid" style={{ gridTemplateColumns: `repeat(${N}, ${cell}px)`, gridAutoRows: `${cell}px`, gap }}>
                  {tiles.map((t, i) => {
                    if (t === 0) return <span key={`gap${i}`} className="sp-gap" />;
                    const canMove = neighbours(gapIndex).includes(i);
                    return (
                      <button key={t} type="button" className={`press sp-tile${canMove ? " ready" : ""}`}
                        style={{ fontSize: Math.round(cell * 0.42) }}
                        aria-label={`Tile ${t}${canMove ? ", can slide" : ""}`}
                        onClick={() => slide(i)}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="muted sp-help">Put 1–8 back in order · tap a tile beside the gap</div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Puzzles solved: ${level - 1}`} />
      )}
    </>
  );
}
