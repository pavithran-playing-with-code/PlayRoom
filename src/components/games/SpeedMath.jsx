// src/components/games/SpeedMath.jsx
// Solve as many problems as you can before the clock runs out. Seeded so all
// players in a room get the same problem sequence → fair head-to-head race.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { seededRand, randInt, shuffleInPlace } from "./seededRand";

const CORRECT = 12;   // points per correct answer
const WRONG = -6;     // penalty (clamped at 0 total)

// Deterministically build N problems from the seed.
function buildProblems(seed, n = 300) {
  const rand = seededRand(seed);
  const ops = ["+", "-", "×"];
  const out = [];
  for (let i = 0; i < n; i++) {
    const op = ops[Math.floor(rand() * ops.length)];
    let a, b, answer;
    if (op === "+") { a = randInt(rand, 2, 49); b = randInt(rand, 2, 49); answer = a + b; }
    else if (op === "-") { a = randInt(rand, 10, 60); b = randInt(rand, 1, a); answer = a - b; }
    else { a = randInt(rand, 2, 12); b = randInt(rand, 2, 12); answer = a * b; }

    // Three plausible distractors near the answer.
    const opts = new Set([answer]);
    while (opts.size < 4) {
      const delta = randInt(rand, -6, 6) || 1;
      const cand = answer + delta;
      if (cand >= 0) opts.add(cand);
    }
    out.push({ text: `${a} ${op} ${b}`, answer, options: shuffleInPlace([...opts], rand) });
  }
  return out;
}

export default function SpeedMath(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const problems = useMemo(() => buildProblems(seed), [seed]);

  // Which problem is up lives in a ref too: two taps in the same tick must not
  // both be marked against one problem.
  const live = useRef({ idx: 0, streak: 0 });
  const [idx, setIdx] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState(null); // 'good' | 'bad'
  const flashTimer = useRef(null);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const oppList = Object.values(eng.opponents);
  const problem = problems[idx % problems.length];

  function answer(opt, at) {
    if (eng.gameOver || isSpectator) return;
    const s = live.current;
    if (at !== s.idx) return;                 // a tap aimed at the previous problem
    const p = problems[s.idx % problems.length];
    eng.addMove();
    if (opt === p.answer) {
      eng.addScore(CORRECT + Math.min(8, s.streak * 2)); // streak reward
      s.streak += 1;
      setFlash("good");
    } else {
      eng.addScore(WRONG);
      s.streak = 0;
      setFlash("bad");
    }
    setStreak(s.streak);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 180);
    s.idx += 1;
    setIdx(s.idx);
  }

  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
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
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          // Problem panel on top, always a 2 x 2 grid of answers under it,
          // everything scaled to the height that's left.
          const W = Math.min(w, 480);
          const gap = Math.round(Math.max(8, Math.min(16, h * 0.025)));
          const eyebrow = 26;
          const panelH = Math.round(Math.max(64, Math.min(170, h * 0.32)));
          const btnH = Math.round(Math.max(44, Math.min(96, (h - eyebrow - panelH - gap * 2 - 12) / 2)));
          const probFont = Math.round(Math.max(22, Math.min(56, panelH * 0.42, W / 6.5)));
          const optFont = Math.round(Math.max(18, Math.min(30, btnH * 0.42)));
          return (
            <div style={{ width: W, textAlign: "center" }}>
              <div className="muted eyebrow" style={{ textAlign: "center" }}>Solve it!</div>
              <div
                className="pop display"
                style={{
                  height: panelH, display: "grid", placeItems: "center", marginBottom: gap,
                  fontSize: probFont, lineHeight: 1,
                  // lime on a right answer, coral on a wrong one — the panel itself
                  // is the feedback, so no extra banner is needed
                  background: flash === "good" ? "var(--lime)" : flash === "bad" ? "var(--coral)" : "var(--sun)",
                  transform: flash === "good" ? "scale(1.03)" : flash === "bad" ? "translateX(-5px)" : "none",
                  transition: "transform .12s ease, background .12s ease",
                }}
              >
                {problem.text}
              </div>
              {!isSpectator ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap }}>
                  {problem.options.map((opt, i) => (
                    <button key={`${idx}-${i}`} onClick={() => answer(opt, idx)} className="press p-white"
                      style={{ height: btnH, padding: 0, fontSize: optFont }}>
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="muted">
                  👀 Watching {spectatorWatching?.username} — {Number(specScore).toLocaleString()} pts
                </div>
              )}
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && <GameOver eng={eng} me={currentUser} />}
    </>
  );
}
