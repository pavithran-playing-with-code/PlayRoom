// src/components/games/NumberRush.jsx
// Tap 1, 2, 3… in order as fast as you can. Clear a grid and the next one is
// bigger and busier: more numbers, then coloured tiles, then tilted numbers.
// Every room gets the same grids in the same order; most points wins.
//
// Together (a co-op room) it's one grid and one count for the whole side:
// whoever taps the next number moves everybody on, and each number done
// shows who got it, in their colour. The rules are coopBoards.js
// (numbersRules); the moves go through the server in one order
// (useCoopBoard), so every phone shows the same grid.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import useCoopBoard, { useShows } from "./useCoopBoard";
import { numbersRules, GOAL } from "./coopBoards";
import { team, plural } from "./coopTeam";
import { makeBoard, HIT, MISS, clearBonus } from "./numberBoard";

const CLEARED_MS = 650;    // a cleared grid, before the next

export default function NumberRush(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null, mode } = props;
  const coop = mode === "coop" && !!roomCode;
  const myId = Number(currentUser?.id);

  const [level, setLevel] = useState(1);
  const [next, setNext] = useState(1);
  const [miss, setMiss] = useState(null);        // { num, n } for the shake
  const [msg, setMsg] = useState(null);

  // Taps act on this, not on rendered state: two fast taps in one tick must
  // each see the other.
  const live = useRef({ level: 1, next: 1, busy: false });

  // Watching shows the same board the player is on: the grid comes from the
  // seed and the level, so the level and the next number is all that has to
  // travel.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ level: live.current.level, next: live.current.next }),
    apply: (st) => {
      live.current.level = st.level;
      live.current.next = st.next;
      setLevel(st.level);
      setNext(st.next);
    },
  });

  // together: one grid for the side
  const R = useMemo(() => numbersRules(seed), [seed]);
  const cb = useCoopBoard({ on: coop, roomCode, isSpectator, myId, rules: R.rules, init: R.init });
  const T = useMemo(() => team(players, myId), [players, myId]);
  const agreedRef = useRef(cb.agreed);
  agreedRef.current = cb.agreed;
  const soloState = spectate.extraState;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: coop ? () => ({ pairs_matched: agreedRef.current.boards }) : soloState });

  // together: the side's score is everybody's
  const { setScore } = eng;
  useEffect(() => { if (coop && !isSpectator && cb.ready) setScore(cb.agreed.score); }, [coop, isSpectator, cb.ready, cb.agreed.score, setScore]);

  const timers = useRef([]);
  const uid = useRef(0);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  // together: a cleared grid stays a moment, all done, before the next
  const v = cb.view;
  const [cleared, setCleared] = useState(null);    // { b, hits }
  const showLevel = coop ? (cleared ? cleared.b : v.b) : level;
  const board = useMemo(() => makeBoard(seed, showLevel), [seed, showLevel]);

  function say(text, type) {
    const n = ++uid.current;
    setMsg({ text, type });
    later(() => setMsg((m) => (uid.current === n ? null : m)), 1000);
  }

  useShows(cb.ready, v.ev, (e) => {
    if (e.k === "miss" && e.u === myId) say(`Not ${e.n}. Find ${e.want} (${MISS})`, "error");
    else if (e.k === "clear") {
      const n = ++uid.current;
      setCleared({ b: e.b, hits: v.done ? v.done.hits : {}, n });
      later(() => setCleared((x) => (x && x.n === n ? null : x)), CLEARED_MS);
      say(`Grid cleared together! +${e.bonus}`, "success");
    }
  });

  function tap(num) {
    if (eng.gameOver || isSpectator) return;
    if (coop) {
      if (cleared || num < v.next) return;
      cb.send({ t: "tap", b: v.b, n: num });
      eng.addMove();
      if (num > v.next + 1) {
        const n = ++uid.current;
        setMiss({ num, n });
        later(() => setMiss((x) => (x && x.n === n ? null : x)), 380);
      }
      return;
    }
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

  const oppList = coop ? T.strip(v.by, (n) => plural(n, "number")) : Object.values(eng.opponents);
  // Together: the side's count; who tapped each number done, by colour.
  const showNext = coop ? (cleared ? board.n + 1 : v.next) : next;
  const hits = coop ? (cleared ? cleared.hits : v.hits) : null;
  // Watching shows the watched player's numbers, not a blank of your own.
  const stats = coop
    ? [
        { label: "Score", value: v.score.toLocaleString() },
        { label: "Next", value: showNext > board.n ? "✓" : showNext },
        { label: "Goal", value: v.boards >= GOAL.numbers ? "✓" : `${v.boards}/${GOAL.numbers}` },
      ]
    : [
        { label: "Score", value: Number(isSpectator ? (spectatorWatching?.score ?? 0) : eng.score).toLocaleString() },
        { label: "Level", value: level },
        { label: "Next", value: next > board.n ? "✓" : next },
      ];

  return (
    <>
      <GameFrame
        gameName="Number Rush" badge="🔢 NUMBER RUSH"
        isSpectator={isSpectator} spectatorName={coop ? "the team" : spectatorWatching?.username}
        stats={coop && isSpectator ? [stats[0], stats[stats.length - 1]] : stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          const { cols, rows } = board;
          const gap = Math.round(Math.max(6, Math.min(12, Math.min(w, h) * 0.018)));
          const hint = 58;                          // the "Find N" pill and the line under the grid
          const cell = Math.floor(Math.max(34, Math.min(118,
            (w - gap * (cols - 1)) / cols,
            (h - hint - 8 - gap * (rows - 1)) / rows)));
          return (
            <div style={{ textAlign: "center" }}>
              <div className="nr-find">Find <strong>{showNext > board.n ? "✓" : showNext}</strong></div>
              <div className="nr-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: `${cell}px`, gap }}>
                {board.cells.map((c) => {
                  const done = c.num < showNext;
                  const bad = miss && miss.num === c.num;
                  const by = done && hits && hits[c.num] !== undefined ? T.colourOf(hits[c.num]) : null;
                  return (
                    <button key={`${showLevel}-${c.num}`} type="button"
                      className={`press nr-cell${done ? " done" : ""}${bad ? " bad" : ""}`}
                      style={{ background: done || bad ? undefined : c.tint, fontSize: Math.round(cell * 0.38),
                        ...(by ? { boxShadow: `0 1px 0 var(--ink), inset 0 -${Math.max(5, Math.round(cell * 0.09))}px 0 ${by}` } : null) }}
                      aria-label={done ? `${c.num}, done` : `${c.num}`}
                      onClick={() => tap(c.num)}>
                      <span style={{ display: "inline-block", transform: c.tilt ? `rotate(${c.tilt}deg)` : undefined }}>{c.num}</span>
                    </button>
                  );
                })}
              </div>
              <div className="muted nr-help">{coop
                ? "One grid for all of you — whoever taps the next number moves everyone on."
                : "Tap 1, 2, 3… in order. Clear a grid to start the next, harder one."}</div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (coop
        ? <GameOver eng={eng} me={currentUser} extra={`Grids cleared: ${cb.agreed.boards}`}
            together={{ reached: cb.agreed.boards >= GOAL.numbers, goal: `clear ${GOAL.numbers} grids`, unit: "numbers", mates: T.all(cb.agreed.by) }} />
        : <GameOver eng={eng} me={currentUser} extra={`Grids cleared: ${level - 1}`} />)}
    </>
  );
}
