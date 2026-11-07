// src/components/games/SpeedMath.jsx
// Solve as many sums as you can before the clock runs out, on a classroom
// chalkboard: the sum in chalk, the answers on sticky notes. Every 8 right
// answers is a level, and the sums change with it:
//   1 adding small numbers   2 adding and taking away   3 times tables too
//   4 sharing (÷) and bigger numbers   5 the missing number (7 + ? = 15)
//   6+ two steps (3 × 4 + 5)
// Seeded per level, so everyone in a room who reaches a level gets the same
// sums in the same order → a fair head-to-head race.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import { seededRand, randInt, shuffleInPlace } from "./seededRand";

const CORRECT = 12;   // points per correct answer, plus the streak and the level
const WRONG = -6;     // penalty (clamped at 0 total)
const PER_LEVEL = 8;
const MAX_LEVEL = 6;
const levelFor = (right) => Math.min(MAX_LEVEL, 1 + Math.floor(right / PER_LEVEL));
const SAYS = { 2: "Adding and taking away", 3: "Times tables join in", 4: "Sharing (÷) and bigger numbers", 5: "Find the missing number!", 6: "Two steps at once!" };
const NOTES = ["#FFE27A", "#9FE6FF", "#FFB3D6", "#B9F28C"];

// One sum for a level.
function makeSum(rand, level) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  let text, answer;
  if (level === 1) { const a = randInt(rand, 1, 12), b = randInt(rand, 1, 9); text = `${a} + ${b}`; answer = a + b; }
  else if (level === 2) {
    if (rand() < 0.5) { const a = randInt(rand, 5, 40), b = randInt(rand, 2, 30); text = `${a} + ${b}`; answer = a + b; }
    else { const a = randInt(rand, 10, 50), b = randInt(rand, 1, a); text = `${a} − ${b}`; answer = a - b; }
  } else if (level === 3) {
    const op = pick(["+", "−", "×"]);
    if (op === "+") { const a = randInt(rand, 2, 49), b = randInt(rand, 2, 49); text = `${a} + ${b}`; answer = a + b; }
    else if (op === "−") { const a = randInt(rand, 10, 60), b = randInt(rand, 1, a); text = `${a} − ${b}`; answer = a - b; }
    else { const a = randInt(rand, 2, 12), b = randInt(rand, 2, 12); text = `${a} × ${b}`; answer = a * b; }
  } else if (level === 4) {
    const op = pick(["÷", "×", "+", "−"]);
    if (op === "÷") { const b = randInt(rand, 2, 12), q = randInt(rand, 2, 12); text = `${b * q} ÷ ${b}`; answer = q; }
    else if (op === "×") { const a = randInt(rand, 3, 15), b = randInt(rand, 3, 12); text = `${a} × ${b}`; answer = a * b; }
    else if (op === "+") { const a = randInt(rand, 40, 150), b = randInt(rand, 20, 99); text = `${a} + ${b}`; answer = a + b; }
    else { const a = randInt(rand, 60, 150), b = randInt(rand, 10, a - 5); text = `${a} − ${b}`; answer = a - b; }
  } else if (level === 5) {
    const op = pick(["+", "−", "×"]);
    if (op === "+") { const a = randInt(rand, 3, 40), x = randInt(rand, 2, 40); text = `${a} + ? = ${a + x}`; answer = x; }
    else if (op === "−") { const x = randInt(rand, 10, 60), b = randInt(rand, 1, x - 1); text = `? − ${b} = ${x - b}`; answer = x; }
    else { const a = randInt(rand, 2, 12), x = randInt(rand, 2, 12); text = `${a} × ? = ${a * x}`; answer = x; }
  } else {
    const a = randInt(rand, 2, 9), b = randInt(rand, 2, 9), c = randInt(rand, 1, 20);
    if (rand() < 0.5) { text = `${a} × ${b} + ${c}`; answer = a * b + c; }
    else { const t = a * b; const d = randInt(rand, 1, Math.min(t - 1, 20)); text = `${a} × ${b} − ${d}`; answer = t - d; }
  }
  // three plausible distractors near the answer
  const opts = new Set([answer]);
  const spread = Math.max(3, Math.round(Math.abs(answer) * 0.15));
  while (opts.size < 4) {
    const cand = answer + (randInt(rand, -spread, spread) || 1);
    if (cand >= 0) opts.add(cand);
  }
  return { text, answer, options: shuffleInPlace([...opts], rand) };
}

// The sums for a level, the same for everyone in the room.
function buildLevel(seed, level, n = 160) {
  const rand = seededRand((Number(seed) || 1) * 131 + level * 7919);
  return Array.from({ length: n }, () => makeSum(rand, level));
}

export default function SpeedMath(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null } = props;

  const levels = useMemo(() => Array.from({ length: MAX_LEVEL + 1 }, (_, l) => (l ? buildLevel(seed, l) : null)), [seed]);

  // Where we are lives in a ref too: two taps in the same tick must not both
  // be marked against one sum. `at` counts sums within the level.
  const live = useRef({ level: 1, at: 0, right: 0, streak: 0, best: 0 });

  const [level, setLevel] = useState(1);
  const [at, setAt] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState(null); // 'good' | 'bad'
  const [levelUp, setLevelUp] = useState(0);
  const flashTimer = useRef(null);
  const lvTimer = useRef(null);
  useEffect(() => () => { clearTimeout(flashTimer.current); clearTimeout(lvTimer.current); }, []);

  // Watching draws the same board the player is on: the sums are seeded, so
  // the level and how far through it they are is the whole board.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ level: live.current.level, at: live.current.at, streak: live.current.streak, right: live.current.right }),
    apply: (st) => {
      Object.assign(live.current, { level: st.level || 1, at: st.at || 0, streak: st.streak || 0, right: st.right || 0 });
      setLevel(st.level || 1);
      setAt(st.at || 0);
      setStreak(st.streak || 0);
    },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: spectate.extraState });

  const oppList = Object.values(eng.opponents);
  const list = levels[level];
  const sum = list[at % list.length];

  function answer(opt, forLevel, forAt) {
    if (eng.gameOver || isSpectator) return;
    const s = live.current;
    if (forLevel !== s.level || forAt !== s.at) return;     // a tap aimed at the previous sum
    const p = levels[s.level][s.at % levels[s.level].length];
    eng.addMove();
    if (opt === p.answer) {
      eng.addScore(CORRECT + Math.min(8, s.streak * 2) + (s.level - 1) * 2);
      s.streak += 1;
      s.best = Math.max(s.best, s.streak);
      s.right += 1;
      setFlash("good");
    } else {
      eng.addScore(WRONG);
      s.streak = 0;
      setFlash("bad");
    }
    setStreak(s.streak);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 220);
    const lv = levelFor(s.right);
    if (lv !== s.level) {
      s.level = lv; s.at = 0;
      setLevel(lv); setAt(0);
      setLevelUp(lv);
      clearTimeout(lvTimer.current);
      lvTimer.current = setTimeout(() => setLevelUp(0), 2000);
    } else {
      s.at += 1;
      setAt(s.at);
    }
  }

  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }, { label: "Level", value: level }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Level", value: level },
        { label: "Streak", value: `${streak}🔥` },
      ];

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
      >
        {({ w, h }) => {
          // The chalkboard on top, a 2 × 2 of sticky notes under it, scaled to the height.
          const W = Math.min(w, 480);
          const gap = Math.round(Math.max(10, Math.min(18, h * 0.028)));
          const panelH = Math.round(Math.max(78, Math.min(190, h * 0.36)));
          const btnH = Math.round(Math.max(48, Math.min(100, (h - panelH - gap * 2 - 20) / 2)));
          const long = sum.text.length > 9;
          const probFont = Math.round(Math.max(22, Math.min(long ? 40 : 56, panelH * 0.38, W / (long ? 9 : 6.5))));
          const optFont = Math.round(Math.max(20, Math.min(34, btnH * 0.42)));
          return (
            <div className="sm-wrap" style={{ width: W }}>
              <div className={`sm-board${flash ? ` ${flash}` : ""}`} style={{ height: panelH }}>
                <span className="sm-level">Level {level}</span>
                {streak >= 3 && <span className="sm-flame" key={streak}>{"🔥".repeat(Math.min(3, Math.floor(streak / 3)))} {streak}</span>}
                <span className="sm-sum" style={{ fontSize: probFont }}>{sum.text.includes("?") ? sum.text : `${sum.text} = ?`}</span>
                {flash === "good" && <span className="sm-tick">✓</span>}
                {levelUp > 1 && (
                  <div className="sm-lvlup" key={`l${levelUp}`}>
                    <b>Level {levelUp}!</b>
                    <span>{SAYS[levelUp]}</span>
                  </div>
                )}
              </div>
              <div className="sm-ledge" aria-hidden="true"><i /><i /><i /></div>
              {/* The notes show while watching too — they simply refuse the tap. */}
              <div className="sm-notes" style={{ gap }}>
                {sum.options.map((opt, i) => (
                  <button key={i} onClick={() => answer(opt, level, at)} className="sm-note"
                    style={{ height: btnH, fontSize: optFont, background: NOTES[i], "--tilt": `${[-2, 1.5, 2, -1.5][i]}deg` }}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && <GameOver eng={eng} me={currentUser} extra={`Level ${level} · ${live.current.right} right · best streak ${live.current.best}🔥`} />}
    </>
  );
}
