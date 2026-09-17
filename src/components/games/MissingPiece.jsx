// src/components/games/MissingPiece.jsx
// A picture with one jigsaw piece missing: tap the piece that fills the gap.
// Every puzzle comes from the room seed, so everyone in a room gets the same
// pictures and the same decoys in the same order. Most points when the clock
// stops wins.
//
// The puzzle maths lives in jigsawBoard.js and the art in jigsawScene.jsx.
// This file is taps, scoring and layout.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { makePuzzle, outlinePaths, PIC_W, PIC_H } from "./jigsawBoard";
import { buildScene } from "./jigsawScene";

const LETTERS = "ABCD";
const WRONG = -8;
const SOLVED_MS = 800;               // how long the filled-in picture shows before the next one
const pointsFor = (level, streak) => 20 + 2 * Math.min(level, 10) + Math.min(10, streak * 2);

// Where the pieces go: under the picture or beside it, in one line or two.
// Every arrangement is tried in the space GameFrame measured, and the one with
// the best mix of picture size and piece size wins. Pieces count for more,
// because they're what you have to study.
function layout(w, h, n) {
  const gap = 12;
  const eyebrow = 26;
  const frame = 20;                  // wood padding + border around the picture
  const ratio = PIC_H / PIC_W;
  const MAX = 150, MIN = 56;
  let best = null;

  for (const side of [false, true]) {
    for (const perLine of side ? [1, 2] : [n, 2]) {
      const lines = Math.ceil(n / perLine);
      let opt, pic;
      if (side) {
        opt = Math.min(MAX, (h - 8 - gap * (lines - 1)) / lines);
        pic = Math.min(w - frame - gap - 10 - (perLine * opt + gap * (perLine - 1)), (h - eyebrow - frame - 8) / ratio);
      } else {
        opt = Math.min(MAX, (w - gap * (perLine - 1)) / perLine);
        pic = Math.min(w - frame, (h - eyebrow - frame - gap - 8 - (lines * opt + gap * (lines - 1))) / ratio);
      }
      if (opt < MIN || pic < 100) continue;
      const score = pic + 1.5 * opt;
      if (!best || score > best.score) best = { side, perLine, opt: Math.floor(opt), pic: Math.floor(pic), gap, score };
    }
  }
  return best || { side: false, perLine: n, opt: MIN, pic: 100, gap };
}

function Piece({ option, box, scene, clipId }) {
  const { cx, cy, rot, dx, dy, path } = option;
  return (
    <svg className="pz-piece" viewBox={`${cx - box / 2} ${cy - box / 2} ${box} ${box}`} aria-hidden="true">
      <defs><clipPath id={clipId}><path d={path} /></clipPath></defs>
      <g transform={`rotate(${rot} ${cx} ${cy})`}>
        <g clipPath={`url(#${clipId})`}>
          <g transform={`translate(${dx} ${dy})`}>{scene}</g>
        </g>
        <path d={path} className="pz-edge" />
      </g>
    </svg>
  );
}

export default function MissingPiece(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });

  const [level, setLevel] = useState(1);
  const [tried, setTried] = useState([]);       // options already picked wrongly
  const [solved, setSolved] = useState(false);
  const [shake, setShake] = useState(null);     // { i, n }
  const [msg, setMsg] = useState(null);

  // What taps act on. Two taps can land in the same tick, and the second must
  // see the first: a right answer locks the puzzle until the next one appears.
  const live = useRef({ level: 1, streak: 0, busy: false, tried: [] });
  const timers = useRef([]);
  const uid = useRef(0);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const puzzle = useMemo(() => makePuzzle(seed, level), [seed, level]);
  const scene = useMemo(() => buildScene(puzzle.sceneSeed, level), [puzzle, level]);
  const outlines = useMemo(() => outlinePaths(puzzle), [puzzle]);

  function say(text, type) {
    const n = ++uid.current;
    setMsg({ text, type });
    later(() => setMsg((m) => (uid.current === n ? null : m)), 1100);
  }

  function pick(i) {
    if (eng.gameOver || isSpectator) return;
    const s = live.current;
    if (s.busy || s.tried.includes(i)) return;
    eng.addMove();

    if (puzzle.options[i].correct) {
      s.busy = true;
      const gain = pointsFor(s.level, s.streak);
      s.streak += 1;
      eng.addScore(gain);
      setSolved(true);
      say(s.streak > 1 ? `🧩 +${gain} · ${s.streak} in a row!` : `🧩 It fits! +${gain}`, "success");
      later(() => {
        s.level += 1;
        s.tried = [];
        s.busy = false;
        setLevel(s.level);
        setTried([]);
        setSolved(false);
      }, SOLVED_MS);
    } else {
      s.streak = 0;
      s.tried = [...s.tried, i];
      eng.addScore(WRONG);
      setTried(s.tried);
      const n = ++uid.current;
      setShake({ i, n });
      later(() => setShake((x) => (x && x.n === n ? null : x)), 450);
      say(`Doesn't fit (${WRONG})`, "error");
    }
  }

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Puzzle", value: level },
        { label: "Streak", value: `${live.current.streak}🔥` },
      ];

  const holeClip = `pz${level}-hole`;

  return (
    <>
      <GameFrame
        gameName="Missing Piece" badge="🧩 MISSING PIECE"
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
          const L = layout(w, h, puzzle.options.length);
          return (
            <div className={`pz-wrap${L.side ? " side" : ""}`} style={{ gap: L.gap }}>
              <div>
                <div className="muted eyebrow" style={{ textAlign: "center" }}>Which piece fills the gap?</div>
                <div className="pz-frame" style={{ width: L.pic + 20 }}>
                  <svg className="pz-board" viewBox={`0 0 ${PIC_W} ${PIC_H}`} role="img"
                    aria-label={`Puzzle ${level}: a picture with one piece missing`}>
                    <defs><clipPath id={holeClip}><path d={puzzle.hole.path} /></clipPath></defs>
                    {scene}
                    <g className="pz-lines">
                      {outlines.map((d, i) => <path key={i} d={d} />)}
                    </g>
                    {solved ? (
                      <g key={`done${level}`} className="pz-fill">
                        <g clipPath={`url(#${holeClip})`}>{scene}</g>
                        <path d={puzzle.hole.path} className="pz-done" />
                      </g>
                    ) : (
                      <path d={puzzle.hole.path} className="pz-hole" />
                    )}
                  </svg>
                </div>
              </div>

              <div className="pz-opts" style={{ gap: L.gap, width: L.perLine * L.opt + (L.perLine - 1) * L.gap }}>
                {puzzle.options.map((o, i) => {
                  const wrong = tried.includes(i);
                  const right = solved && o.correct;
                  return (
                    <button key={`${level}-${i}`} type="button"
                      className={`press p-white pz-opt${right ? " pz-right" : ""}${shake && shake.i === i ? " pz-shake" : ""}`}
                      style={{ width: L.opt, height: L.opt }}
                      disabled={wrong}
                      aria-label={`Piece ${LETTERS[i]}${wrong ? ", doesn't fit" : ""}`}
                      onClick={() => pick(i)}>
                      <span className="pz-letter">{wrong ? "✗" : LETTERS[i]}</span>
                      <Piece option={o} box={puzzle.box} scene={scene} clipId={`pz${level}-o${i}`} />
                    </button>
                  );
                })}
              </div>
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
