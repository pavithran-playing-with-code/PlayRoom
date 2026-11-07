// src/components/games/ArrowEscape.jsx
// A box of snakes: tap one and it slithers off the board along its own path
// — but only if nothing sits in front of its head (the arrows of the old look,
// with eyes and a flicking tongue). Clear a board to get the next, longer and
// twistier one. Boards are seeded, so everyone in a room plays the same
// sequence; most points when the clock runs out wins.
//
// The board rules live in arrowBoard.js. This file is taps, scoring and drawing.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import { seededRand } from "./seededRand";
import { COLS, ROWS, generateBoard, occupancy, blockerOf, rayCells, cellKey } from "./arrowBoard";

const CELL = 10;                         // SVG user units per grid cell
const W = COLS * CELL;
const H = ROWS * CELL;

const MISS = -8;                         // tapping an arrow that's boxed in
const pointsFor = (arrow) => 6 + 2 * arrow.cells.length;
const boardBonus = (level) => 40 + 10 * level;

// The widest frame that fits the board area: the SVG plus 10px padding and a
// 3px border each side, with the hint line above and the shadow below.
const frameWidth = (w, h) => Math.floor(Math.max(150, Math.min(w, 430, (h - 60) * COLS / ROWS + 26)));

// A separate deterministic stream per board, so board 3 is identical for
// everyone no matter how fast they reached it.
const boardFor = (seed, level) => generateBoard(seededRand(seed * 1009 + level * 7919 + 1), level);

// Faint grid dots, drawn once.
const DOTS = Array.from({ length: COLS * ROWS }, (_, i) => (
  <circle key={i} cx={((i % COLS) + 0.5) * CELL} cy={(Math.floor(i / COLS) + 0.5) * CELL} r={0.55} fill="var(--shade)" />
));

export default function ArrowEscape(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null } = props;


  // What's drawn.
  const [level, setLevel] = useState(1);
  const [arrows, setArrows] = useState(() => boardFor(seed, 1));
  const [leaving, setLeaving] = useState([]);   // still drawn while sliding out; already gone logically
  const [nudge, setNudge] = useState(null);      // { id, blocker, n } right after a blocked tap
  const [msg, setMsg] = useState(null);

  // What taps act on. Two taps can land in the same tick — two fingers on a
  // phone — and the second has to see the first one's result, not a render
  // that hasn't happened yet. Reading the rendered `arrows` there would
  // silently put the first arrow back on the board.
  const live = useRef({ arrows, level: 1, streak: 0 });

  // Watching draws the same board the player is on: arrows leave one at a time, so which are still on the board has to travel.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ level: live.current.level, arrows: live.current.arrows }),
    apply: (st) => {
      live.current.level = st.level;
      live.current.arrows = st.arrows || [];
      setLevel(st.level);
      setArrows(st.arrows || []);
    },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd ,
    extraState: spectate.extraState });


  const svgRef = useRef(null);
  const timers = useRef([]);
  const msgTimer = useRef(null);
  const uid = useRef(0);

  useEffect(() => () => { timers.current.forEach(clearTimeout); clearTimeout(msgTimer.current); }, []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  // Shown over the board rather than as a banner above it, so the board never
  // jumps under the player's finger mid-tap.
  function say(text, type) {
    setMsg({ text, type, n: ++uid.current });
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 1100);
  }

  function tap(e) {
    if (eng.gameOver || isSpectator) return;
    const box = svgRef.current.getBoundingClientRect();
    const c = Math.floor(((e.clientX - box.left) / box.width) * COLS);
    const r = Math.floor(((e.clientY - box.top) / box.height) * ROWS);
    const s = live.current;
    const occ = occupancy(s.arrows);
    const id = occ.get(cellKey(c, r));
    if (id == null) return;                    // empty paper, or between boards
    const arrow = s.arrows.find((a) => a.id === id);
    eng.addMove();

    const blocker = blockerOf(arrow, occ);
    if (blocker != null) {
      const n = ++uid.current;
      eng.addScore(MISS);
      s.streak = 0;
      setNudge({ id, blocker, n });
      later(() => setNudge((cur) => (cur && cur.n === n ? null : cur)), 520);
      say(`Blocked! ${MISS}`, "error");
      return;
    }

    // It leaves the board *now*, so the very next tap can use the space it
    // freed, and keeps being drawn for as long as the slide takes.
    const travel = rayCells(arrow.cells[arrow.cells.length - 1], arrow.dir).length + arrow.cells.length;
    const dur = Math.min(650, 160 + travel * 38);
    const ghost = { key: ++uid.current, arrow, travel, dur };
    setLeaving((g) => [...g, ghost]);
    later(() => setLeaving((g) => g.filter((x) => x !== ghost)), dur + 60);

    eng.addScore(pointsFor(arrow) + Math.min(10, s.streak));
    s.streak += 1;

    s.arrows = s.arrows.filter((a) => a.id !== id);
    setArrows(s.arrows);
    if (s.arrows.length === 0) {
      const bonus = boardBonus(s.level);
      eng.addScore(bonus);
      say(`🐍 All snakes out! +${bonus}`, "success");
      const next = s.level + 1;
      later(() => {
        s.level = next;
        s.arrows = boardFor(seed, next);
        setLevel(next);
        setArrows(s.arrows);
      }, dur + 300);
    }
  }

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Level", value: level },
        { label: "Snakes", value: arrows.length },
      ];

  return (
    <>
      <GameFrame
        gameName="Arrow Escape" badge="🏹 ARROW ESCAPE"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => (
          <div style={{ textAlign: "center" }}>
            <div className="muted eyebrow" style={{ textAlign: "center" }}>
              Tap a snake · it only slithers out if its way is clear
            </div>
            <div className="ae-frame" style={{ width: frameWidth(w, h) }}>
              {msg && (
                <div key={msg.n} className="ae-toast"
                  style={msg.type === "error"
                    ? { background: "var(--coral)", color: "#fff" }
                    : { background: "var(--lime)" }}>
                  {msg.text}
                </div>
              )}
              <svg ref={svgRef} className="ae-board" viewBox={`0 0 ${W} ${H}`} onPointerDown={tap}
                role="img" aria-label={`Arrow Escape, board ${level}, ${arrows.length} arrows left`}>
                {DOTS}
                {arrows.map((a) => {
                  const shaking = nudge && nudge.id === a.id;
                  const blocking = nudge && nudge.blocker === a.id;
                  // Keyed on the nudge too, so a second blocked tap restarts the animation.
                  return (
                    <ArrowShape key={`${level}-${a.id}${shaking || blocking ? `-${nudge.n}` : ""}`}
                      arrow={a} className={shaking ? "ae-shake" : blocking ? "ae-blocker" : ""} />
                  );
                })}
                {leaving.map((g) => (
                  <ArrowShape key={g.key} arrow={g.arrow} travel={g.travel} dur={g.dur} leaving />
                ))}
              </svg>
            </div>
          </div>
        )}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Boards cleared: ${level - 1}`} />
      )}
    </>
  );
}

const SNAKES = ["#8FDB5C", "#FFC53D", "#4CC9F0", "#FF8FC7", "#B48CFF", "#FF9F43", "#3DD6C0"];
const INK = "#2E2140";

function ArrowShape({ arrow, travel = 0, dur = 0, leaving = false, className = "" }) {
  const pts = arrow.cells.map((p) => [(p.c + 0.5) * CELL, (p.r + 0.5) * CELL]);
  const [hx, hy] = pts[pts.length - 1];
  const { dx, dy } = arrow.dir;

  // The body runs along the snake's cells and then straight on past its head,
  // but only a body-length dash of it is visible. Sliding that dash forward
  // makes the whole snake follow its own path out — bends and all.
  const bodyLen = (pts.length - 1) * CELL;
  const run = (travel + 1) * CELL;
  const d = `M${pts.map(([x, y]) => `${x} ${y}`).join(" L")} L${hx + dx * run} ${hy + dy * run}`;
  const dist = travel * CELL;
  const dash = `${bodyLen} ${bodyLen + run + 4 * CELL}`;
  const colour = SNAKES[(arrow.id * 3 + arrow.cells.length) % SNAKES.length];

  // the head: round, two eyes looking where it's going, a forked tongue
  const R = 0.36 * CELL, px = -dy, py = dx;           // across the head
  const eye = (side) => [hx + dx * 0.12 * CELL + px * side * 0.17 * CELL, hy + dy * 0.12 * CELL + py * side * 0.17 * CELL];
  const tx = hx + dx * 0.36 * CELL, ty = hy + dy * 0.36 * CELL;
  const tongue = `M${tx} ${ty} L${tx + dx * 0.22 * CELL} ${ty + dy * 0.22 * CELL} l${(dx - px) * 0.08 * CELL} ${(dy - py) * 0.08 * CELL} M${tx + dx * 0.22 * CELL} ${ty + dy * 0.22 * CELL} l${(dx + px) * 0.08 * CELL} ${(dy + py) * 0.08 * CELL}`;

  const style = leaving
    ? { "--to": `${-dist}px`, "--tx": `${dx * dist}px`, "--ty": `${dy * dist}px`, "--dur": `${dur}ms` }
    : undefined;

  return (
    <g className={`ae-snake${className ? ` ${className}` : ""}${leaving ? " ae-leaving" : ""}`} style={style}>
      <path className="ae-body" d={d} fill="none" stroke={INK} strokeWidth={0.62 * CELL}
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
      <path className="ae-body ae-skin" d={d} fill="none" stroke={colour} strokeWidth={0.46 * CELL}
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
      <g className="ae-head">
        <path className="ae-tongue" d={tongue} fill="none" stroke="#FF4D6D" strokeWidth={0.07 * CELL} strokeLinecap="round" />
        <circle cx={hx} cy={hy} r={R + 0.07 * CELL} fill={INK} />
        <circle className="ae-tri" cx={hx} cy={hy} r={R} fill={colour} />
        {[-1, 1].map((sd) => {
          const [ex, ey] = eye(sd);
          return (
            <g key={sd}>
              <circle cx={ex} cy={ey} r={0.12 * CELL} fill="#FFFFFF" stroke={INK} strokeWidth={0.04 * CELL} />
              <circle cx={ex + dx * 0.04 * CELL} cy={ey + dy * 0.04 * CELL} r={0.06 * CELL} fill={INK} />
            </g>
          );
        })}
      </g>
    </g>
  );
}
