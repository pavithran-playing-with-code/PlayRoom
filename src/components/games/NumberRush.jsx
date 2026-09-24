// src/components/games/NumberRush.jsx
// Tap 1, 2, 3… in order as fast as you can. Clear a grid and the next one is
// bigger and busier: more numbers, then coloured tiles, then tilted numbers.
// Every room gets the same grids in the same order; most points wins.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { seededRand, shuffleInPlace } from "./seededRand";

const HIT = 3;
const MISS = -2;
const clearBonus = (level) => 10 + 5 * level;
const TINTS = ["var(--sun)", "var(--mint)", "var(--sky)", "var(--bubble)", "var(--lime)", "var(--peach)"];

// Grid size per level: 3×3, 4×4, 4×5, 5×5, 5×6, then 6×6 from level 6 on.
function gridFor(level) {
  const sizes = [[3, 3], [4, 4], [5, 4], [5, 5], [5, 6], [6, 6]];
  const [cols, rows] = sizes[Math.min(level, sizes.length) - 1];
  return { cols, rows, n: cols * rows };
}

function makeBoard(seed, level) {
  const rand = seededRand((Number(seed) || 1) * 6151 + level * 92821 + 5);
  for (let i = 0; i < 6; i++) rand();
  const { cols, rows, n } = gridFor(level);
  const numbers = shuffleInPlace(Array.from({ length: n }, (_, i) => i + 1), rand);
  const cells = numbers.map((num) => ({
    num,
    // from level 4 the tiles are colourful, so the numbers stop jumping out
    tint: level >= 4 ? TINTS[Math.floor(rand() * TINTS.length)] : "#FFFFFF",
    // from level 6 the numbers are tilted, too
    tilt: level >= 6 ? Math.round((rand() * 2 - 1) * 16) : 0,
  }));
  return { cols, rows, n, cells };
}

export default function NumberRush(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });

  const [level, setLevel] = useState(1);
  const [next, setNext] = useState(1);
  const [miss, setMiss] = useState(null);        // { num, n } for the shake
  const [msg, setMsg] = useState(null);

  // Taps act on this, not on rendered state: two fast taps in one tick must
  // each see the other.
  const live = useRef({ level: 1, next: 1, busy: false });
  const timers = useRef([]);
  const uid = useRef(0);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const board = useMemo(() => makeBoard(seed, level), [seed, level]);

  function say(text, type) {
    const n = ++uid.current;
    setMsg({ text, type });
    later(() => setMsg((m) => (uid.current === n ? null : m)), 1000);
  }

  function tap(num) {
    if (eng.gameOver || isSpectator) return;
    const s = live.current;
    if (s.busy || num < s.next) return;          // already cleared: nothing happens
    eng.addMove();
    if (num === s.next) {
      eng.addScore(HIT);
      s.next += 1;
      setNext(s.next);
      if (s.next > board.n) {
        s.busy = true;
        const bonus = clearBonus(s.level);
        eng.addScore(bonus);
        say(`Grid cleared! +${bonus}`, "success");
        later(() => {
          s.level += 1;
          s.next = 1;
          s.busy = false;
          setLevel(s.level);
          setNext(1);
        }, 650);
      }
    } else {
      eng.addScore(MISS);
      const n = ++uid.current;
      setMiss({ num, n });
      later(() => setMiss((x) => (x && x.n === n ? null : x)), 380);
      say(`Not ${num}. Find ${s.next} (${MISS})`, "error");
    }
  }

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Level", value: level },
        { label: "Next", value: next > board.n ? "✓" : next },
      ];

  return (
    <>
      <GameFrame
        gameName="Number Rush" badge="🔢 NUMBER RUSH"
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
          const gap = Math.round(Math.max(6, Math.min(12, Math.min(w, h) * 0.018)));
          const hint = 58;                          // the "Find N" pill and the line under the grid
          const cell = Math.floor(Math.max(34, Math.min(118,
            (w - gap * (cols - 1)) / cols,
            (h - hint - 8 - gap * (rows - 1)) / rows)));
          return (
            <div style={{ textAlign: "center" }}>
              <div className="nr-find">Find <strong>{next > board.n ? "✓" : next}</strong></div>
              <div className="nr-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: `${cell}px`, gap }}>
                {board.cells.map((c) => {
                  const done = c.num < next;
                  const bad = miss && miss.num === c.num;
                  return (
                    <button key={`${level}-${c.num}`} type="button"
                      className={`press nr-cell${done ? " done" : ""}${bad ? " bad" : ""}`}
                      style={{ background: done || bad ? undefined : c.tint, fontSize: Math.round(cell * 0.38) }}
                      aria-label={done ? `${c.num}, done` : `${c.num}`}
                      onClick={() => tap(c.num)}>
                      <span style={{ display: "inline-block", transform: c.tilt ? `rotate(${c.tilt}deg)` : undefined }}>{c.num}</span>
                    </button>
                  );
                })}
              </div>
              <div className="muted nr-help">Tap 1, 2, 3… in order. Clear a grid to start the next, harder one.</div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Grids cleared: ${level - 1}`} />
      )}
    </>
  );
}
