// src/components/games/NumberRush.jsx
// Tap 1, 2, 3… in order as fast as you can. Clear a grid and the next one is
// bigger and busier: more numbers, then coloured tiles, then tiles that trade
// places every few numbers, then tilted numbers. Every room gets the same
// grids in the same order; most points wins.
//
// On your own (numberRushRules.js): quick hits build a rush chain (×2, ×3),
// one ★ golden number on each grid pays more, and a grid cleared under par
// earns a speed bonus. Stuck for a few seconds, and the number you want glows.
//
// Together (a co-op room) it's one grid and one count for the whole side:
// whoever taps the next number moves everybody on, and each number done
// shows who got it, in their colour. The rules are coopBoards.js
// (numbersRules); the moves go through the server in one order
// (useCoopBoard), so every phone shows the same grid. The shuffles follow the
// side's count, so they agree too.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import useCoopBoard, { useShows } from "./useCoopBoard";
import { numbersRules, GOAL } from "./coopBoards";
import { team } from "./coopTeam";
import { makeBoard, MISS, shuffleStep, placesFor, SHUFFLE_FROM } from "./numberBoard";
import { tapOn, goldenOf, rushMult } from "./numberRushRules";
import sfx from "./sfx";

const CLEARED_MS = 800;    // a cleared grid, before the next
const HINT_MS = 4000;      // stuck this long: the number you want glows
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];      // each number a step up the scale
const noteFor = (num) => sfx.note(67 + PENTA[(num - 1) % PENTA.length]);
const INTRO = { 4: "Colours!", [SHUFFLE_FROM]: "Tiles shuffle!", 6: "Tilted!" };

export default function NumberRush(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null, mode } = props;
  const coop = mode === "coop" && !!roomCode;
  const myId = Number(currentUser?.id);

  // Taps act on this, not on rendered state: two fast taps in one tick must
  // each see the other.
  const live = useRef({ level: 1, next: 1, chain: 0, lastHit: null, startedAt: performance.now(), busy: false });
  const [view, setView] = useState({ level: 1, next: 1, chain: 0 });
  const show = () => { const L = live.current; setView({ level: L.level, next: L.next, chain: L.chain }); };

  // Watching shows the same board the player is on: the grid comes from the
  // seed and the level, so the level and the next number is all that has to
  // travel.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ level: live.current.level, next: live.current.next, chain: live.current.chain }),
    apply: (st) => { Object.assign(live.current, { level: st.level || 1, next: st.next || 1, chain: st.chain || 0 }); show(); },
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
  const playing = !isSpectator && !eng.gameOver;

  // together: the side's score is everybody's
  const { setScore } = eng;
  useEffect(() => { if (coop && !isSpectator && cb.ready) setScore(cb.agreed.score); }, [coop, isSpectator, cb.ready, cb.agreed.score, setScore]);

  const timers = useRef(new Set());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms); timers.current.add(t); };
  const uid = useRef(0);
  const [miss, setMiss] = useState(null);           // { num, n } for the shake
  const [msg, setMsg] = useState(null);
  const [fx, setFx] = useState({ pops: [], banner: null, good: 0 });
  function say(text, type) {
    const n = ++uid.current;
    setMsg({ text, type });
    later(() => setMsg((m) => (uid.current === n ? null : m)), 1000);
  }
  function pop(num, text, cls = "") {
    const id = ++uid.current;
    setFx((f) => ({ ...f, pops: [...f.pops.slice(-4), { id, num, text, cls }] }));
    later(() => setFx((f) => ({ ...f, pops: f.pops.filter((p) => p.id !== id) })), 750);
  }
  function banner(text, cls = "") {
    const id = ++uid.current;
    setFx((f) => ({ ...f, banner: { id, text, cls } }));
    later(() => setFx((f) => (f.banner && f.banner.id === id ? { ...f, banner: null } : f)), 1200);
  }
  function shake(num) {
    const n = ++uid.current;
    setMiss({ num, n });
    later(() => setMiss((x) => (x && x.n === n ? null : x)), 380);
  }

  // a cleared grid stays a moment, all done, before the next
  const v = cb.view;
  const [cleared, setCleared] = useState(null);    // { b, hits }
  const level = coop ? (cleared ? cleared.b : v.b) : view.level;
  const board = useMemo(() => makeBoard(seed, level), [seed, level]);
  const showNext = coop ? (cleared ? board.n + 1 : v.next) : (cleared ? board.n + 1 : view.next);

  function announce(lv) {
    const b = makeBoard(seed, lv);
    banner(INTRO[lv] ? `Grid ${lv} · ${INTRO[lv]}` : `Grid ${lv} · ${b.cols}×${b.rows}`, INTRO[lv] ? "nr-banner-new" : "");
  }

  useShows(cb.ready, v.ev, (e) => {
    if (e.k === "miss" && e.u === myId) say(`Not ${e.n}. Find ${e.want} (${MISS})`, "error");
    else if (e.k === "clear") {
      const n = ++uid.current;
      setCleared({ b: e.b, hits: v.done ? v.done.hits : {}, n });
      sfx.sparkle(); sfx.chime(Math.min(6, e.b));
      later(() => { setCleared((x) => (x && x.n === n ? null : x)); announce(e.b + 1); }, CLEARED_MS);
      say(`Grid cleared together! +${e.bonus}`, "success");
    }
  });

  function tap(num, e) {
    if (e) e.preventDefault();
    if (!playing) return;
    if (coop) {
      if (cleared || num < v.next) return;
      cb.send({ t: "tap", b: v.b, n: num });
      eng.addMove();
      if (num === v.next) { sfx.tone(noteFor(num), 0.14, 0.09, "triangle"); setFx((f) => ({ ...f, good: f.good + 1 })); }
      else if (num > v.next + 1) { sfx.thud(); shake(num); }
      return;
    }
    const L = live.current;
    if (L.busy) return;
    const r = tapOn(seed, board, L, num, performance.now());
    if (!r) return;
    eng.addMove();
    eng.addScore(r.points);
    if (r.k === "miss") {
      sfx.thud();
      shake(num);
      pop(num, String(r.points), "nr-pop-bad");
      if (r.broke >= 5) banner("rush lost", "nr-banner-lost");
      show();
      return;
    }
    sfx.tone(noteFor(num), 0.14, 0.09, "triangle");
    sfx.tone(noteFor(num) * 2, 0.06, 0.025, "sine", null, 0.02);
    if (r.golden) sfx.sparkle();
    pop(num, `+${r.clear ? r.points - r.bonus - r.speed : r.points}`, r.golden ? "nr-pop-gold" : r.mult > 1 ? "nr-pop-rush" : "");
    setFx((f) => ({ ...f, good: f.good + 1 }));
    if (r.multUp) { sfx.chime(r.mult); banner(`Rush ×${r.mult}!`, "nr-banner-rush"); }
    if (r.clear) {
      L.busy = true;
      sfx.sparkle(); sfx.chime(Math.min(6, L.level + 1));
      say(`Grid cleared! +${r.bonus}${r.speed ? ` · speed +${r.speed}` : ""}`, "success");
      const n = ++uid.current;
      setCleared({ b: L.level, hits: null, n });
      later(() => {
        L.level += 1; L.next = 1; L.busy = false; L.startedAt = performance.now();
        setCleared((x) => (x && x.n === n ? null : x));
        show();
        announce(L.level);
      }, CLEARED_MS);
    }
    show();
  }

  // stuck a while: the number you want glows
  const [hint, setHint] = useState(false);
  useEffect(() => {
    setHint(false);
    if (!playing || cleared) return undefined;
    const t = setTimeout(() => setHint(true), HINT_MS);
    return () => clearTimeout(t);
  }, [showNext, level, playing, cleared]);

  // the shuffles: where each tile sits, and a little spin when they move
  const step = shuffleStep(level, Math.min(showNext, board.n));
  const places = useMemo(() => placesFor(seed, level, step, board.n), [seed, level, step, board.n]);
  const lastStep = useRef(0);
  useEffect(() => { if (step > lastStep.current && playing) sfx.whoosh(); lastStep.current = step; }, [step, playing]);
  const golden = coop ? null : goldenOf(seed, level, board.n);

  // the last ten seconds tick; a beat underneath, quicker with the rush
  const secs = Math.ceil(eng.timeLeft);
  useEffect(() => { if (playing && !eng.unlimited && secs > 0 && secs <= 10) sfx.tick(secs <= 3); }, [secs, playing, eng.unlimited]);
  const tempo = useRef(96);
  tempo.current = 90 + Math.min(level, 8) * 4 + (coop ? 0 : rushMult(view.chain) * 8);
  useEffect(() => { if (!playing) return undefined; const b = sfx.beat(() => tempo.current, 0.5); return () => b.stop(); }, [playing]);
  const ended = useRef(false);
  useEffect(() => {
    if (!eng.gameOver || isSpectator || ended.current) return;
    ended.current = true;
    const good = coop ? cb.agreed.boards >= GOAL.numbers : (eng.won || eng.rank === 1);
    if (good) sfx.win(); else sfx.lose();
  }, [eng.gameOver, eng.won, eng.rank, isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps

  // a team plays as one: its points only, not each player's
  const oppList = coop ? [] : Object.values(eng.opponents);
  // Together: who tapped each number done, by colour.
  const hits = coop ? (cleared ? cleared.hits : v.hits) : null;
  const mult = rushMult(view.chain);
  // Watching shows the watched player's numbers, not a blank of your own.
  const stats = coop
    ? [
        { label: "Team", value: v.score.toLocaleString() },
        { label: "Next", value: showNext > board.n ? "✓" : showNext },
        { label: "Goal", value: v.boards >= GOAL.numbers ? "✓" : `${v.boards}/${GOAL.numbers}` },
      ]
    : [
        { label: "Score", value: Number(isSpectator ? (spectatorWatching?.score ?? 0) : eng.score).toLocaleString() },
        { label: "Grid", value: level },
        { label: "Rush", value: view.chain ? `${view.chain}⚡${mult > 1 ? ` ×${mult}` : ""}` : "—" },
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
        sound
      >
        {({ w, h }) => {
          const { cols, rows } = board;
          const gap = Math.round(Math.max(6, Math.min(12, Math.min(w, h) * 0.018)));
          const extra = 104;                        // the "Find N" pill and the rush meter under the grid
          const cell = Math.floor(Math.max(34, Math.min(118,
            (w - gap * (cols - 1)) / cols,
            (h - extra - 8 - gap * (rows - 1)) / rows)));
          const toX2 = Math.min(1, view.chain / 5), toX3 = Math.min(1, Math.max(0, (view.chain - 5) / 7));
          return (
            <div className="nr-wrap">
              <div className={`nr-find${fx.good % 2 ? " nr-okA" : fx.good ? " nr-okB" : ""}`}>
                Find <strong key={`${level}-${showNext}`} className="nr-want">{showNext > board.n ? "✓" : showNext}</strong>
                {golden && showNext <= golden && <span className="nr-goldtag">★ {golden}</span>}
              </div>
              <div className={`nr-grid${cleared ? " nr-cleared" : ""}${step % 2 ? " nr-swapA" : step ? " nr-swapB" : ""}`}
                style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: `${cell}px`, gap }}>
                {board.cells.map((c, i) => {
                  const done = c.num < showNext;
                  const bad = miss && miss.num === c.num;
                  const by = done && hits && hits[c.num] !== undefined ? T.colourOf(hits[c.num]) : null;
                  const gold = c.num === golden && !done;
                  return (
                    <button key={`${level}-${c.num}`} type="button"
                      className={`press nr-cell${done ? " done" : ""}${bad ? " bad" : ""}${gold ? " gold" : ""}${hint && c.num === showNext ? " nr-hint" : ""}`}
                      style={{ order: places[i], background: done || bad || gold ? undefined : c.tint, fontSize: Math.round(cell * 0.38),
                        animationDelay: cleared ? `${(places[i] % cols + Math.floor(places[i] / cols)) * 30}ms` : undefined,
                        ...(by ? { boxShadow: `0 1px 0 var(--ink), inset 0 -${Math.max(5, Math.round(cell * 0.09))}px 0 ${by}` } : null) }}
                      aria-label={done ? `${c.num}, done` : `${c.num}`}
                      onPointerDown={(e) => tap(c.num, e)} onClick={(e) => e.preventDefault()}>
                      <span className="nr-num" style={{ transform: c.tilt ? `rotate(${c.tilt}deg)` : undefined }}>{c.num}</span>
                      {fx.pops.filter((p) => p.num === c.num).map((p) => <span key={p.id} className={`nr-pop ${p.cls}`}>{p.text}</span>)}
                    </button>
                  );
                })}
              </div>
              {coop
                ? <div className="muted nr-help">One grid for all of you — whoever taps the next number moves everyone on.</div>
                : <div className={`nr-meter${mult >= 3 ? " max" : mult > 1 ? " hot" : ""}`}>
                    <span className="nr-zap">⚡ ×{mult}</span>
                    <span className="nr-mbar"><i style={{ width: `${(mult >= 2 ? 0.5 + toX3 * 0.5 : toX2 * 0.5) * 100}%` }} /><b /></span>
                  </div>}
              {fx.banner && <div key={fx.banner.id} className={`nr-banner ${fx.banner.cls}`}>{fx.banner.text}</div>}
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (coop
        ? <GameOver eng={eng} me={currentUser} extra={`Grids cleared: ${cb.agreed.boards}`}
            together={{ reached: cb.agreed.boards >= GOAL.numbers, goal: `clear ${GOAL.numbers} grids`, unit: "numbers", mates: T.all(cb.agreed.by) }} />
        : <GameOver eng={eng} me={currentUser} extra={`Grids cleared: ${view.level - 1}`} />)}
    </>
  );
}
