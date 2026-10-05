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
//
// Against friends, everyone runs the same mazes (the room's seed) on their
// own. Together (a co-op room), everyone is in ONE maze: the flag is a locked
// door, somebody has to fetch the key first, then whoever reaches the door
// takes you all through to the next. Each phone moves its own ball and tells
// the room (maze:pos: which maze, where, key taken, door reached); every
// message says what that phone knows, so one that missed something catches
// up from the next. Everyone scores the same for each door.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "../../utils/SocketContext";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import { N, E, S, W, DIRS, makeMaze, isOpen, slide, scoreForBoard, keyCell, BOARD_BASE, BOARD_STEP } from "./mazeBoard";

const MATE_COLOURS = ["#4CC9F0", "#FF6B6B", "#8FDB5C", "#FF8FC7", "#FFC53D", "#C77DFF"];
// together, a door is worth the same to everyone: no bonus for one phone's moves
const doorPoints = (level) => BOARD_BASE + BOARD_STEP * (Math.max(1, level) - 1);

const EASE = 0.28;            // how much of the gap the token closes each frame
const SOLVED_MS = 700;
const SWIPE_MIN = 24;         // px before a drag counts as a direction

export default function MazeRunner(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null, mode } = props;
  const coop = mode === "coop" && !!roomCode;
  const { socket } = useSocket() || {};
  const myId = Number(currentUser?.id);

  const [level, setLevel] = useState(1);
  const [pos, setPos] = useState({ r: 0, c: 0 });
  const [seen, setSeen] = useState(() => new Set(["0,0"]));
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(0);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState(null);
  const [roll, setRoll] = useState(1);   // squares in the last move, so a long roll takes a little longer

  // Moves act on the ref: two taps in one tick must each see the other.
  const live = useRef({ level: 1, r: 0, c: 0, moves: 0, solved: 0, busy: false, seen: ["0,0"], key: false });
  // together: the others, as they last said — { lv, r, c, k, done } by user id
  const mates = useRef(new Map());
  const [, redraw] = useState(0);
  const [hasKey, setHasKey] = useState(false);
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
      moves: live.current.moves, solved: live.current.solved, seen: live.current.seen, key: live.current.key,
    }),
    apply: (st) => {
      live.current.level = st.level;
      live.current.r = st.r; live.current.c = st.c;
      live.current.moves = st.moves; live.current.solved = st.solved;
      live.current.seen = st.seen || [];
      live.current.key = !!st.key;
      setHasKey(!!st.key);
      setLevel(st.level);
      setPos({ r: st.r, c: st.c });
      setMoves(st.moves);
      setSolved(st.solved);
      setSeen(new Set(st.seen || []));
    },
  });

  // doors gone through travel as pairs_matched: together, one is a win
  const spectateState = spectate.extraState;
  const extraState = useCallback(() => ({ ...spectateState(), pairs_matched: live.current.solved }), [spectateState]);
  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState });

  const maze = useMemo(() => makeMaze(seed, level), [seed, level]);
  const keyAt = useMemo(() => (coop ? keyCell(maze) : null), [coop, maze]);
  const seats = (players || []).filter((p) => !p.is_spectator).map((p) => Number(p.user_id)).sort((a, b) => a - b);
  const colourOf = (id) => MATE_COLOURS[Math.max(0, seats.indexOf(Number(id))) % MATE_COLOURS.length];
  const nameOf = (id) => (players || []).find((p) => Number(p.user_id) === Number(id))?.username || "Someone";

  // together: tell the room where I am and what I know
  const tell = useCallback(() => {
    if (!coop || !socket || isSpectator) return;
    const s = live.current;
    socket.emit("maze:pos", { code: roomCode, lv: s.level, r: s.r, c: s.c, k: s.key ? 1 : 0, done: s.busy ? 1 : 0 });
  }, [coop, socket, isSpectator, roomCode]);

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

    // together: rolling over the key takes it, and the door opens for everyone
    if (coop && !s.key) {
      const k = keyCell(m);
      if (path.some((p) => p.r === k.r && p.c === k.c)) {
        s.key = true;
        setHasKey(true);
        say("🗝️ Got the key — the door is open!", "success");
      }
    }

    if (s.r === m.goal.r && s.c === m.goal.c) {
      if (coop && !s.key) { say("🔒 The door's locked — someone has to find the 🗝️", "error"); tell(); return; }
      clearBoard(coop ? doorPoints(s.level) : scoreForBoard(m, s.level, s.moves), null);
    }
    tell();
  }

  // A board done: by me (who: null) or, together, by somebody else.
  function clearBoard(gain, who) {
    const s = live.current;
    if (s.busy) return;
    s.busy = true;
    eng.addScore(gain);
    s.solved += 1;
    setSolved(s.solved);
    setDone(true);
    say(coop ? `${who ? `🚪 ${who} opened the door!` : "🚪 Through the door!"} +${gain}` : `Board ${s.level} cleared in ${s.moves} moves! +${gain}`, "success");
    tell();
    later(() => nextBoard(s.level + 1), SOLVED_MS);
  }
  function nextBoard(lv) {
    const s = live.current;
    s.level = lv;
    s.r = 0; s.c = 0;
    s.moves = 0;
    s.seen = ["0,0"];
    s.busy = false;
    s.key = false;
    setHasKey(false);
    setLevel(s.level);
    setPos({ r: 0, c: 0 });
    setMoves(0);
    setSeen(new Set(["0,0"]));
    setDone(false);
    tell();
  }

  // together: hear the others
  useEffect(() => {
    if (!coop || !socket) return undefined;
    const onPos = (m) => {
      if (Number(m.user_id) === myId) return;
      mates.current.set(Number(m.user_id), m);
      const s = live.current;
      if (!isSpectator && !s.busy) {
        if (m.lv > s.level) {
          // they're further on: we missed a door — take its points and catch up
          for (let lv = s.level; lv < m.lv; lv++) { eng.addScore(doorPoints(lv)); s.solved += 1; }
          setSolved(s.solved);
          nextBoard(m.lv);
        } else if (m.lv === s.level) {
          if (m.k && !s.key) {
            s.key = true; setHasKey(true);
            const m0 = makeMaze(seed, s.level);
            // already waiting at the door: straight through
            if (s.r === m0.goal.r && s.c === m0.goal.c) clearBoard(doorPoints(s.level), null);
            else say(`🗝️ ${nameOf(m.user_id)} found the key — the door is open!`, "success");
          }
          if (m.done) clearBoard(doorPoints(s.level), nameOf(m.user_id));
        }
      }
      redraw((n) => n + 1);
    };
    socket.on("maze:pos", onPos);
    // and say where I am now and then, for anyone who has just come in
    const beat = setInterval(tell, 2000);
    tell();
    return () => { socket.off("maze:pos", onPos); clearInterval(beat); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coop, socket, myId, isSpectator, tell]);

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
    { label: coop ? "Doors" : "Mazes", value: solved },
    coop ? { label: "Key", value: hasKey ? "🗝️" : "—" } : { label: "Moves", value: moves },
  ];
  const others = coop ? [...mates.current.values()].filter((m) => m.lv === level && Number(m.user_id) !== myId) : [];

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
                        {isGoal && <span className={`mz-flag${coop ? (hasKey ? " open" : " locked") : ""}`} style={{ fontSize: Math.round(cell * 0.6) }}>{coop ? "🚪" : "🚩"}</span>}
                        {coop && !hasKey && keyAt && keyAt.r === r && keyAt.c === c && <span className="mz-key" style={{ fontSize: Math.round(cell * 0.62) }}>🗝️</span>}
                      </span>
                    );
                  })}
                  {/* together: everyone else's ball, in their colour */}
                  {others.map((m) => (
                    <span key={m.user_id} className="mz-token mz-mate" title={nameOf(m.user_id)}
                      style={{
                        width: Math.round(cell * 0.44), height: Math.round(cell * 0.44), background: colourOf(m.user_id),
                        transform: `translate(${m.c * cell + cell * 0.28}px, ${m.r * cell + cell * 0.28}px)`,
                      }} />
                  ))}
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
                {coop
                  ? (hasKey ? "The door is open — get anyone to the 🚪" : "Find the 🗝️ — then the 🚪 opens for everyone")
                  : <>{maze.rows}×{maze.cols} · swipe or tap an arrow — the ball rolls to the next turning</>}
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
