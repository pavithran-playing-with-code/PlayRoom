// src/components/games/SpeedMath.jsx
// Solve as many sums as you can before the clock runs out. The sums are
// seeded (speedMathRules.js) so everyone in a room gets the same ones, level
// by level: + and − first, then times tables, ÷, then two-step sums and
// missing numbers. Right answers in a row build a streak (×1.5, ×2), a quick
// answer earns a bonus, a ★ gold sum pays double; a wrong one costs points,
// breaks the streak and shows you the right answer.
//
// Play state lives in a ref (two taps in one tick must not both be marked
// against one sum), mirrored into state to draw. Answers land on touch-down;
// on a computer, keys 1–4 pick them.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import sfx from "./sfx";
import { buildProblems, answerOn, levelOf, streakMult, LEVEL_NAMES, QUICK_MS, STREAK_STEP } from "./speedMathRules.js";

const REVEAL_MS = 650;      // a wrong answer: how long the right one is shown before the next sum

export default function SpeedMath(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null } = props;

  const problems = useMemo(() => buildProblems(seed), [seed]);

  const live = useRef({ idx: 0, streak: 0, right: 0, best: 0, shownAt: 0, lock: false });
  const [view, setView] = useState({ idx: 0, streak: 0, right: 0, best: 0 });
  const show = () => { const L = live.current; setView({ idx: L.idx, streak: L.streak, right: L.right, best: L.best }); };

  // a wrong answer: the sum stays up a moment, your pick in red, the right one in green
  const [reveal, setReveal] = useState(null);         // { idx, chosen, answer }
  const [fx, setFx] = useState({ pops: [], banner: null, good: 0, bad: 0 });
  const fxId = useRef(0);
  const timers = useRef(new Set());
  const later = (fn, ms) => { const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms); timers.current.add(t); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function pop(text, cls) {
    const id = ++fxId.current;
    setFx((f) => ({ ...f, pops: [...f.pops.slice(-4), { id, text, cls }] }));
    later(() => setFx((f) => ({ ...f, pops: f.pops.filter((p) => p.id !== id) })), 900);
  }
  function banner(text, cls) {
    const id = ++fxId.current;
    setFx((f) => ({ ...f, banner: { id, text, cls } }));
    later(() => setFx((f) => (f.banner && f.banner.id === id ? { ...f, banner: null } : f)), 1200);
  }

  // Watching draws the same board the player is on: the sums are seeded, so
  // which one they're on (and their streak) is the whole board.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ idx: live.current.idx, streak: live.current.streak, right: live.current.right, best: live.current.best }),
    apply: (st) => { Object.assign(live.current, { idx: st.idx || 0, streak: st.streak || 0, right: st.right || 0, best: st.best || 0 }); show(); },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: spectate.extraState });
  const playing = !isSpectator && !eng.gameOver;

  // the clock for the quick bonus starts when a sum appears
  useEffect(() => { live.current.shownAt = performance.now(); }, [view.idx]);

  function answer(choice, at, e) {
    if (e) e.preventDefault();
    if (!playing || live.current.lock) return;
    const L = live.current;
    const r = answerOn(problems, L, at, choice, performance.now() - L.shownAt);
    if (!r) return;
    eng.addMove();
    eng.addScore(r.points);
    if (r.right) {
      sfx.blip(1 + Math.min(L.streak, 16) * 0.04);
      if (r.gold) sfx.sparkle();
      if (r.quick) sfx.tone(1568, 0.12, 0.05, "sine", null, 0.06);
      pop(`+${r.points}${r.quick ? " quick!" : ""}`, r.gold ? "sm-pop-gold" : r.quick ? "sm-pop-quick" : "sm-pop");
      setFx((f) => ({ ...f, good: f.good + 1 }));
      if (r.levelUp) { sfx.chime(r.level); banner(`Level ${r.level} · ${LEVEL_NAMES[r.level - 1]}`, "sm-banner-level"); }
      else if (r.multUp) { sfx.chime(1); banner(`×${streakMult(L.streak)} streak!`, "sm-banner-streak"); }
      show();
    } else {
      sfx.thud();
      pop(String(r.points), "sm-pop-bad");
      setFx((f) => ({ ...f, bad: f.bad + 1 }));
      if (r.streakBroke) banner("streak lost", "sm-banner-lost");
      // hold the sum up a moment with the right answer showing; then the next
      L.lock = true;
      setReveal({ idx: at, chosen: choice, answer: r.answer });
      later(() => { L.lock = false; setReveal(null); show(); if (r.levelUp) { sfx.chime(r.level); banner(`Level ${r.level} · ${LEVEL_NAMES[r.level - 1]}`, "sm-banner-level"); } }, REVEAL_MS);
    }
  }

  // keys 1–4 on a computer
  const shown = reveal ? reveal.idx : view.idx;
  const problem = problems[shown % problems.length];
  const keyRef = useRef(null);
  keyRef.current = (k) => { const i = "1234".indexOf(k); if (i >= 0 && !reveal) answer(problem.options[i], view.idx); };
  useEffect(() => {
    const down = (e) => { if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return; if (keyRef.current) keyRef.current(e.key); };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  // the last ten seconds tick; a beat underneath, quicker as the levels climb
  const secs = Math.ceil(eng.timeLeft);
  useEffect(() => { if (playing && !eng.unlimited && secs > 0 && secs <= 10) sfx.tick(secs <= 3); }, [secs, playing, eng.unlimited]);
  const tempo = useRef(96);
  tempo.current = 88 + levelOf(view.idx) * 9 + Math.min(view.streak, 15);
  useEffect(() => { if (!playing) return undefined; const b = sfx.beat(() => tempo.current, 0.6); return () => b.stop(); }, [playing]);
  const ended = useRef(false);
  useEffect(() => {
    if (!eng.gameOver || isSpectator || ended.current) return;
    ended.current = true;
    if (eng.won || eng.rank === 1) sfx.win(); else sfx.lose();
  }, [eng.gameOver, eng.won, eng.rank, isSpectator]);

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const mult = streakMult(view.streak);
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }, { label: "Streak", value: `${view.streak}🔥` }]
    : [{ label: "Score", value: eng.score.toLocaleString() }, { label: "Streak", value: view.streak ? `${view.streak}🔥${mult > 1 ? ` ×${mult}` : ""}` : "—" }];
  const level = levelOf(shown);
  const toNext = view.streak % STREAK_STEP, atMax = mult >= 2;

  return (
    <>
      <GameFrame
        gameName="Speed Math" badge="➗ SPEED MATH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        onQuit={eng.endMatch}
        sound
      >
        {({ w, h }) => {
          // The sum on top, a 2 × 2 grid of answers under it, a streak meter
          // below, all scaled to the height that's left.
          const W = Math.min(w, 480);
          const gap = Math.round(Math.max(8, Math.min(16, h * 0.025)));
          const head = 30, meter = 40;
          const panelH = Math.round(Math.max(70, Math.min(170, h * 0.3)));
          const btnH = Math.round(Math.max(44, Math.min(96, (h - head - panelH - meter - gap * 3 - 16) / 2)));
          const probFont = Math.round(Math.max(22, Math.min(56, panelH * 0.4, W / (problem.text.length > 9 ? 9 : 6.5))));
          const optFont = Math.round(Math.max(18, Math.min(32, btnH * 0.42)));
          return (
            <div className="sm-wrap" style={{ width: W }}>
              <div className="sm-head">
                <span className={`sm-level sm-l${level}`}>Level {level} · {LEVEL_NAMES[level - 1]}</span>
                {problem.gold && <span className="sm-goldtag">★ double</span>}
              </div>
              <div className={`pop display sm-panel${problem.gold ? " sm-gold" : ""}${fx.good % 2 ? " sm-goodA" : fx.good ? " sm-goodB" : ""}${reveal ? " sm-wrong" : ""}`}
                style={{ height: panelH, marginBottom: gap, fontSize: probFont }}>
                {/* the sum flips in: only this text is rebuilt per sum, not the panel */}
                <span key={shown} className="sm-sum">{problem.text}</span>
                {/* the quick bonus: answer before this bar runs out */}
                {playing && !reveal && <span key={`q${shown}`} className="sm-quick" style={{ animationDuration: `${QUICK_MS}ms` }} />}
                {fx.pops.map((p) => <span key={p.id} className={`sm-pop ${p.cls}`}>{p.text}</span>)}
              </div>
              {/* The options show while watching too — the buttons simply
                  refuse the tap, so a watcher sees the sum being answered. */}
              <div className="sm-opts" style={{ gap }}>
                {problem.options.map((opt, i) => {
                  const st = reveal ? (opt === reveal.answer ? " sm-right" : opt === reveal.chosen ? " sm-chosen" : " sm-dim") : "";
                  return (
                    <button key={`${shown}-${i}`} className={`press p-white sm-opt${st}`}
                      onPointerDown={(e) => answer(opt, view.idx, e)} onClick={(e) => e.preventDefault()}
                      style={{ height: btnH, padding: 0, fontSize: optFont, animationDelay: `${i * 35}ms` }}>
                      {opt}
                      {!isSpectator && <span className="sm-key">{i + 1}</span>}
                    </button>
                  );
                })}
              </div>
              <div className={`sm-meter${atMax ? " max" : ""}`}>
                <span className="sm-flame">🔥 ×{mult}</span>
                <span className="sm-bar"><i style={{ width: `${atMax ? 100 : (toNext / STREAK_STEP) * 100}%` }} /></span>
                <span className="sm-best">best {view.best}</span>
              </div>
              {fx.banner && <div key={fx.banner.id} className={`sm-banner ${fx.banner.cls}`}>{fx.banner.text}</div>}
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && <GameOver eng={eng} me={currentUser} />}
    </>
  );
}
