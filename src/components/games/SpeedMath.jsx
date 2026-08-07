// src/components/games/SpeedMath.jsx
// Solve as many problems as you can before the clock runs out. Seeded so all
// players in a room get the same problem sequence → fair head-to-head race.
import React, { useMemo, useState } from "react";
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

  const [idx, setIdx] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState(null); // 'good' | 'bad'

  const oppList = Object.values(eng.opponents);
  const problem = problems[idx % problems.length];

  function answer(opt) {
    if (eng.gameOver || isSpectator) return;
    eng.addMove();
    if (opt === problem.answer) {
      const bonus = Math.min(8, streak * 2); // streak reward
      eng.addScore(CORRECT + bonus);
      setStreak((s) => s + 1);
      setFlash("good");
    } else {
      eng.addScore(WRONG);
      setStreak(0);
      setFlash("bad");
    }
    setTimeout(() => setFlash(null), 180);
    setIdx((i) => i + 1);
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
        opponents={oppList.map((o) => ({ ...o }))}
        onQuit={eng.endMatch}
      >
        <div style={{ width: "100%", maxWidth: 460, textAlign: "center" }}>
          <div className="muted eyebrow" style={{ textAlign: "center" }}>Solve it!</div>
          <div
            className="pop display"
            style={{
              padding: "40px 24px", marginBottom: 28, fontSize: "3.2rem",
              // mint on a right answer, coral on a wrong one — the panel itself
              // is the feedback, so no extra banner is needed
              background: flash === "good" ? "var(--lime)" : flash === "bad" ? "var(--coral)" : "var(--sun)",
              transform: flash === "good" ? "scale(1.03)" : flash === "bad" ? "translateX(-5px)" : "none",
              transition: "transform .12s ease, background .12s ease",
            }}
          >
            {problem.text}
          </div>
          {!isSpectator ? (
            <div className="grid g2">
              {problem.options.map((opt, i) => (
                <button key={i} onClick={() => answer(opt)} className="press p-white"
                  style={{ padding: "20px 8px", fontSize: "1.7rem" }}>
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
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver
          score={eng.score} won={eng.won} rank={eng.rank} isOnline={eng.isOnline}
          me={currentUser} opponents={oppList}
          onExit={eng.endMatch}
        />
      )}
    </>
  );
}
