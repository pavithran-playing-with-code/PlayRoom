// src/components/games/SlidePuzzle.jsx
// A sliding picture puzzle: one of PlayRoom's game pictures (the dino, the
// chick, the race car…) cut into tiles with one slot empty. Tap a tile next
// to the slot and it slides in. Put the picture back together to clear the
// board — the last piece drops in — and the next picture comes. Small corner
// numbers help. Levels 1–3 are 3 × 3, shuffled a little more each time;
// from level 4 it's 4 × 4. Fewer moves scores more.
//
// Boards are shuffled by making random legal moves from the solved state, so
// every board can always be solved. Everyone in a room gets the same boards.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import { seededRand, shuffleInPlace } from "./seededRand";
import { pictureFor, PICTURE_SLUGS } from "./gamePictures";

const SOLVED_MS = 1300;
const sideFor = (level) => (level >= 4 ? 4 : 3);
const shuffleFor = (level) => (level >= 4 ? 70 + Math.min(60, (level - 4) * 15) : 30 + level * 12);
const scoreFor = (moves, n) => (n === 4 ? Math.max(80, 600 - moves * 3) : Math.max(50, 300 - moves * 4));
// tile backgrounds, a different one per picture
const BACKS = ["#FFF1C9", "#D8F3FF", "#FFE0EF", "#E3F9D2", "#ECE4FF", "#FFE6D3"];

const solvedFor = (n) => [...Array(n * n - 1).keys()].map((i) => i + 1).concat(0);
const isSolved = (tiles) => tiles.every((t, i) => (i === tiles.length - 1 ? t === 0 : t === i + 1));
const neighbours = (i, N) => {
  const x = i % N, y = Math.floor(i / N);
  return [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < N && ny < N)
    .map(([nx, ny]) => ny * N + nx);
};

// Which picture each level shows, the same for everyone in the room.
function pictureOrder(seed) {
  return shuffleInPlace([...PICTURE_SLUGS], seededRand((Number(seed) || 1) * 977 + 3));
}

// Shuffle by sliding, never by shuffling the numbers: that way the board is
// always solvable (a random arrangement is only solvable half the time).
function makeBoard(seed, level) {
  const rand = seededRand((Number(seed) || 1) * 8191 + level * 31337 + 7);
  for (let i = 0; i < 6; i++) rand();
  const N = sideFor(level % 1000);
  const tiles = solvedFor(N);
  let gap = N * N - 1;
  let last = -1;
  for (let i = 0; i < shuffleFor(level % 1000); i++) {
    const cameFrom = last;                                       // don't undo the move just made
    const options = neighbours(gap, N).filter((n) => n !== cameFrom);
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
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null } = props;


  const [level, setLevel] = useState(1);
  const start = useMemo(() => makeBoard(seed, level), [seed, level]);
  const order = useMemo(() => pictureOrder(seed), [seed]);
  const slug = order[(level - 1) % order.length];
  const N = sideFor(level);
  const [tiles, setTiles] = useState(start);
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState(null);

  // Taps act on the ref, so two taps in one tick can't both slide the same tile.
  const live = useRef({ tiles: start, moves: 0, level: 1, busy: false });

  // Watching draws the same board the player is on: the tiles move rather than being rebuilt, so the arrangement itself has to travel.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ tiles: live.current.tiles, moves: live.current.moves, level: live.current.level }),
    apply: (st) => {
      live.current.tiles = st.tiles;
      live.current.moves = st.moves;
      live.current.level = st.level;
      setTiles(st.tiles);
      setMoves(st.moves);
      setLevel(st.level);
    },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd ,
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

  function slide(i) {
    if (eng.gameOver || isSpectator) return;
    const s = live.current;
    if (s.busy || s.tiles[i] === 0) return;
    const n = Math.round(Math.sqrt(s.tiles.length));
    const gap = s.tiles.indexOf(0);
    if (!neighbours(gap, n).includes(i)) return;     // not next to the gap: nothing happens

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
      const gain = scoreFor(s.moves, n);
      eng.addScore(gain);
      setDone(true);
      say(`🖼️ Picture done in ${s.moves} moves! +${gain}`, "success");
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
        { label: "Level", value: level },
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
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          const hint = 34;
          const side = Math.floor(Math.max(160, Math.min(w, h - hint, 440)));
          const gap = Math.round(side * (N === 4 ? 0.018 : 0.025));
          const cell = Math.floor((side - gap * (N - 1)) / N);
          const gapIndex = tiles.indexOf(0);
          const pic = pictureFor(slug);
          const back = BACKS[(level - 1) % BACKS.length];
          // the picture, zoomed to fill, on a background that says which way is up
          const art = (
            <>
              <defs>
                <linearGradient id="sp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor={back} /></linearGradient>
                <pattern id="sp-dots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.1" fill="rgba(46,33,64,.12)" /></pattern>
              </defs>
              <rect x="0" y="0" width="64" height="64" fill="url(#sp-sky)" />
              <rect x="0" y="0" width="64" height="64" fill="url(#sp-dots)" />
              {pic}
            </>
          );
          const Z0 = 3, ZW = 58;
          const piece = (t) => {
            const k = t - 1, x = k % N, y = Math.floor(k / N), u = ZW / N;
            return (
              <svg viewBox={`${Z0 + x * u} ${Z0 + y * u} ${u} ${u}`} width="100%" height="100%" aria-hidden="true" preserveAspectRatio="none">{art}</svg>
            );
          };
          return (
            <div style={{ textAlign: "center" }}>
              <div className={`sp-frame${done ? " done" : ""}`} style={{ width: side + 16 }}>
                <div className="sp-grid" style={{ gridTemplateColumns: `repeat(${N}, ${cell}px)`, gridAutoRows: `${cell}px`, gap: done ? 0 : gap }}>
                  {tiles.map((t, i) => {
                    if (t === 0) {
                      // solved: the last piece drops into the gap
                      return done ? <span key={`gap${i}`} className="sp-tile sp-pic sp-last">{piece(N * N)}</span> : <span key={`gap${i}`} className="sp-gap" />;
                    }
                    const canMove = neighbours(gapIndex, N).includes(i);
                    return (
                      <button key={t} type="button" className={`press sp-tile sp-pic${canMove ? " ready" : ""}${done ? " whole" : ""}`}
                        aria-label={`Piece ${t}${canMove ? ", can slide" : ""}`}
                        onClick={() => slide(i)}>
                        {piece(t)}
                        {!done && <span className="sp-num" style={{ fontSize: Math.max(10, Math.round(cell * 0.16)) }}>{t}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="muted sp-help">
                <span className="sp-goal" aria-label="The finished picture">
                  <svg viewBox={`${Z0} ${Z0} ${ZW} ${ZW}`} width="100%" height="100%" aria-hidden="true">{art}</svg>
                </span>
                Make this · {N}×{N} · tap a piece beside the gap
              </div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Pictures done: ${level - 1}`} />
      )}
    </>
  );
}
