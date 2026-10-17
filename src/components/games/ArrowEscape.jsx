// src/components/games/ArrowEscape.jsx
// Tap an arrow and it slides off the board along its own path — but only if
// nothing sits in front of its head. Clear a board to get the next, longer and
// twistier one. Boards are seeded, so everyone in a room plays the same
// sequence; most points when the clock runs out wins.
//
// Arrows out in a row build a streak; from board 2 a ★ golden arrow pays
// extra; from board 3 a 💣 bomb arrow takes every arrow touching it with it.
// Stuck a while, and an arrow that can leave glows.
//
// The board rules live in arrowBoard.js, the scoring and specials in
// arrowRules.js. This file is taps, sound and drawing.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import sfx from "./sfx";
import { COLS, ROWS, occupancy, rayCells, cellKey } from "./arrowBoard";
import { boardFor, tapArrow, freeArrow, STREAK_MAX } from "./arrowRules";

const CELL = 10;                         // SVG user units per grid cell
const W = COLS * CELL;
const H = ROWS * CELL;
const HINT_MS = 6000;
const STREAK_STEP = 5;

// The widest frame that fits the board area: the SVG plus 10px padding and a
// 3px border each side, with the hint line above, the streak meter below.
const frameWidth = (w, h) => Math.floor(Math.max(150, Math.min(w, 430, (h - 104) * COLS / ROWS + 26)));
const pct = (c, r) => ({ left: `${((c + 0.5) / COLS) * 100}%`, top: `${((r + 0.5) / ROWS) * 100}%` });

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
  const [streak, setStreak] = useState(0);
  const [leaving, setLeaving] = useState([]);   // still drawn while sliding out (or blasted); already gone logically
  const [nudge, setNudge] = useState(null);      // { id, blocker, n } right after a blocked tap
  const [fx, setFx] = useState({ pops: [], puffs: [], banner: null, boom: 0 });

  // What taps act on. Two taps can land in the same tick — two fingers on a
  // phone — and the second has to see the first one's result, not a render
  // that hasn't happened yet. Reading the rendered `arrows` there would
  // silently put the first arrow back on the board.
  const live = useRef(null);
  if (live.current === null) live.current = { arrows, level: 1, streak: 0, total: arrows.length, began: performance.now(), busy: false };

  // Watching draws the same board the player is on: arrows leave one at a
  // time, so which are still on the board has to travel.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ level: live.current.level, arrows: live.current.arrows, streak: live.current.streak }),
    apply: (st) => {
      Object.assign(live.current, { level: st.level, arrows: st.arrows || [], streak: st.streak || 0 });
      setLevel(st.level);
      setArrows(st.arrows || []);
      setStreak(st.streak || 0);
    },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: spectate.extraState });
  const playing = !isSpectator && !eng.gameOver;

  const svgRef = useRef(null);
  const timers = useRef(new Set());
  const uid = useRef(0);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms); timers.current.add(t); };
  function pop(c, r, text, cls = "") {
    const id = ++uid.current;
    setFx((f) => ({ ...f, pops: [...f.pops.slice(-4), { id, c, r, text, cls }] }));
    later(() => setFx((f) => ({ ...f, pops: f.pops.filter((p) => p.id !== id) })), 850);
  }
  function puff(c, r, colour) {
    const id = ++uid.current;
    setFx((f) => ({ ...f, puffs: [...f.puffs.slice(-5), { id, c, r, colour }] }));
    later(() => setFx((f) => ({ ...f, puffs: f.puffs.filter((p) => p.id !== id) })), 700);
  }
  function banner(text, cls = "") {
    const id = ++uid.current;
    setFx((f) => ({ ...f, banner: { id, text, cls } }));
    later(() => setFx((f) => (f.banner && f.banner.id === id ? { ...f, banner: null } : f)), 1300);
  }
  const ghost = (arrow, cls, dur, travel = 0) => {
    const g = { key: ++uid.current, arrow, travel, dur, cls };
    setLeaving((list) => [...list, g]);
    later(() => setLeaving((list) => list.filter((x) => x !== g)), dur + 60);
  };

  function tap(e) {
    if (!playing || live.current.busy) return;
    const box = svgRef.current.getBoundingClientRect();
    const c = Math.floor(((e.clientX - box.left) / box.width) * COLS);
    const r = Math.floor(((e.clientY - box.top) / box.height) * ROWS);
    const s = live.current;
    const id = occupancy(s.arrows).get(cellKey(c, r));
    if (id == null) return;                    // empty paper, or between boards
    eng.addMove();
    const res = tapArrow(s, id, performance.now());
    eng.addScore(res.points);
    setStreak(s.streak);
    setHint(null);

    if (res.k === "blocked") {
      const n = ++uid.current;
      sfx.thud(); sfx.tone(180, 0.08, 0.06, "square", 120);
      setNudge({ id, blocker: res.blocker, n });
      later(() => setNudge((cur) => (cur && cur.n === n ? null : cur)), 520);
      pop(c, r, String(res.points), "ae-pop-bad");
      if (res.broke >= STREAK_STEP) banner("streak lost", "ae-banner-lost");
      return;
    }

    // It leaves the board *now*, so the very next tap can use the space it
    // freed, and keeps being drawn for as long as the slide takes.
    const arrow = res.arrow, head = arrow.cells[arrow.cells.length - 1];
    const ray = rayCells(head, arrow.dir);
    const travel = ray.length + arrow.cells.length;
    const dur = Math.min(650, 160 + travel * 38);
    ghost(arrow, "", dur, travel);
    const exit = ray.length ? ray[ray.length - 1] : head;
    later(() => puff(exit.c + arrow.dir.dx * 0.5, exit.r + arrow.dir.dy * 0.5, arrow.colour), Math.round(dur * 0.55));
    sfx.whoosh();
    sfx.tone(sfx.note(76 + Math.min(12, s.streak)), 0.1, 0.06, "triangle");
    pop(head.c, head.r, `+${res.clear ? res.points - res.bonus - res.speed : res.points}`, res.golden ? "ae-pop-gold" : res.bomb ? "ae-pop-bomb" : "");
    if (res.golden) { sfx.sparkle(); banner("★ Golden arrow!", "ae-banner-gold"); }
    if (res.bomb) {
      sfx.boom();
      setFx((f) => ({ ...f, boom: f.boom + 1 }));
      for (const a of res.blasted) ghost(a, "ae-blasted", 450);
      banner(res.blasted.length ? `💥 Boom! ${res.blasted.length} more gone` : "💥 Boom!", "ae-banner-bomb");
    } else if (s.streak % STREAK_STEP === 0) { sfx.chime(Math.min(6, s.streak / STREAK_STEP)); banner(`${s.streak} in a row!`, "ae-banner-streak"); }

    setArrows(s.arrows);
    if (res.clear) {
      s.busy = true;
      sfx.sparkle(); sfx.chime(5);
      banner(`Board ${s.level} cleared! +${res.bonus}${res.speed ? ` · fast +${res.speed}` : ""}`, "ae-banner-clear");
      const next = s.level + 1;
      later(() => {
        s.level = next;
        s.arrows = boardFor(seed, next);
        s.total = s.arrows.length; s.began = performance.now(); s.busy = false;
        setLevel(next);
        setArrows(s.arrows);
        if (next === 2) banner("New: ★ golden arrows", "ae-banner-new");
        else if (next === 3) banner("New: 💣 bomb arrows", "ae-banner-new");
      }, dur + 700);
    }
  }

  // stuck a while: an arrow that can leave glows
  const [hint, setHint] = useState(null);
  useEffect(() => {
    if (!playing || !arrows.length) return undefined;
    const t = setTimeout(() => setHint(freeArrow(live.current.arrows)), HINT_MS);
    return () => clearTimeout(t);
  }, [arrows, playing]);

  // the last ten seconds tick; a beat underneath
  const secs = Math.ceil(eng.timeLeft);
  useEffect(() => { if (playing && !eng.unlimited && secs > 0 && secs <= 10) sfx.tick(secs <= 3); }, [secs, playing, eng.unlimited]);
  const tempo = useRef(90);
  tempo.current = 88 + Math.min(level, 8) * 3 + Math.min(streak, STREAK_MAX);
  useEffect(() => { if (!playing) return undefined; const b = sfx.beat(() => tempo.current, 0.45); return () => b.stop(); }, [playing]);
  const ended = useRef(false);
  useEffect(() => {
    if (!eng.gameOver || isSpectator || ended.current) return;
    ended.current = true;
    if (eng.won || eng.rank === 1) sfx.win(); else sfx.lose();
  }, [eng.gameOver, eng.won, eng.rank, isSpectator]);

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }, { label: "Board", value: level }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Board", value: level },
        { label: "Left", value: arrows.length },
      ];
  const hot = streak >= STREAK_MAX;

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
        sound
      >
        {({ w, h }) => {
          const fw = frameWidth(w, h);
          return (
            <div className="ae-wrap" style={{ width: fw }}>
              <div className="muted eyebrow" style={{ textAlign: "center" }}>
                Tap an arrow · it only leaves if its path is clear
              </div>
              <div className={`ae-frame${fx.boom % 2 ? " ae-boomA" : fx.boom ? " ae-boomB" : ""}`} style={{ width: fw }}>
                <div className="ae-stage">
                  <svg ref={svgRef} className="ae-board" viewBox={`0 0 ${W} ${H}`} onPointerDown={tap}
                    role="img" aria-label={`Arrow Escape, board ${level}, ${arrows.length} arrows left`}>
                    {DOTS}
                    {arrows.map((a) => {
                      const shaking = nudge && nudge.id === a.id;
                      const blocking = nudge && nudge.blocker === a.id;
                      // Keyed on the nudge too, so a second blocked tap restarts the animation.
                      return (
                        <ArrowShape key={`${level}-${a.id}${shaking || blocking ? `-${nudge.n}` : ""}`}
                          arrow={a} className={`${shaking ? "ae-shake" : blocking ? "ae-blocker" : ""}${hint === a.id ? " ae-hint" : ""}`} />
                      );
                    })}
                    {leaving.map((g) => (
                      <ArrowShape key={g.key} arrow={g.arrow} travel={g.travel} dur={g.dur} leaving={!g.cls} className={g.cls} />
                    ))}
                  </svg>
                  {fx.puffs.map((p) => (
                    <span key={p.id} className="ae-puff" style={pct(p.c, p.r)}>
                      {Array.from({ length: 6 }).map((_, i) => <i key={i} style={{ "--a": `${i * 60}deg`, background: p.colour }} />)}
                    </span>
                  ))}
                  {fx.pops.map((p) => <span key={p.id} className={`ae-pop ${p.cls}`} style={pct(p.c, p.r)}>{p.text}</span>)}
                </div>
                {fx.banner && <div key={fx.banner.id} className={`ae-banner ${fx.banner.cls}`}>{fx.banner.text}</div>}
              </div>
              <div className={`ae-meter${hot ? " hot" : ""}`}>
                <span className="ae-flame">🔥 {streak}</span>
                <span className="ae-mbar"><i style={{ width: `${Math.min(1, streak / STREAK_MAX) * 100}%` }} /></span>
                <span className="ae-best">+{Math.min(STREAK_MAX, streak)} a tap</span>
              </div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Boards cleared: ${level - 1}`} />
      )}
    </>
  );
}

function ArrowShape({ arrow, travel = 0, dur = 0, leaving = false, className = "" }) {
  const pts = arrow.cells.map((p) => [(p.c + 0.5) * CELL, (p.r + 0.5) * CELL]);
  const [hx, hy] = pts[pts.length - 1];
  const [tx, ty] = pts[0];
  const { dx, dy } = arrow.dir;

  // The line runs along the arrow's cells and then straight on past its head,
  // but only a body-length dash of it is visible. Sliding that dash forward
  // makes the whole arrow follow its own path out — bends and all.
  const bodyLen = (pts.length - 1) * CELL;
  const run = (travel + 1) * CELL;
  const d = `M${pts.map(([x, y]) => `${x} ${y}`).join(" L")} L${hx + dx * run} ${hy + dy * run}`;
  const dist = travel * CELL;

  const color = arrow.kind === "gold" ? "#E0A100" : arrow.colour || (arrow.tone ? "var(--coral)" : "var(--ink)");
  const tip = 0.4 * CELL, back = 0.02 * CELL, half = 0.3 * CELL;
  const headPts = [
    [hx + dx * tip, hy + dy * tip],
    [hx - dx * back - dy * half, hy - dy * back + dx * half],
    [hx - dx * back + dy * half, hy - dy * back - dx * half],
  ].map((p) => p.join(",")).join(" ");

  const style = leaving
    ? { "--to": `${-dist}px`, "--tx": `${dx * dist}px`, "--ty": `${dy * dist}px`, "--dur": `${dur}ms` }
    : undefined;

  return (
    <g className={`ae-arrow${arrow.kind ? ` ae-${arrow.kind}` : ""} ${className}${leaving ? " ae-leaving" : ""}`} style={style}>
      <path className="ae-body" d={d} fill="none" stroke={color} strokeWidth={0.26 * CELL}
        strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={`${bodyLen} ${bodyLen + run + 4 * CELL}`} />
      <g className="ae-head"><polygon className="ae-tri" points={headPts} fill={color} /></g>
      {!leaving && arrow.kind && (
        <text className="ae-badge" x={tx} y={ty + 2.4} textAnchor="middle" fontSize={6.4}>{arrow.kind === "gold" ? "★" : "💣"}</text>
      )}
    </g>
  );
}
