// src/components/games/WordRush.jsx
// Unscramble as many words as possible before time runs out. Seeded word order
// + seeded scramble → fair race. Points-in-time → highest score wins.
import React, { useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { seededRand, shuffleInPlace } from "./seededRand";

const WORDS = [
  "apple","river","stone","cloud","tiger","plant","music","dance","light","ocean",
  "happy","green","sugar","table","chair","bread","dream","smile","earth","glass",
  "honey","jolly","lemon","mango","night","piano","queen","robot","snake","train",
  "voice","water","zebra","brave","charm","dwarf","eagle","flame","grape","heart",
  "ivory","koala","maple","noble","olive","pearl","quilt","raven","shore","trust",
];
const CORRECT = 16;
const SKIP = -4;

function buildRound(seed) {
  const rand = seededRand(seed);
  const order = shuffleInPlace([...WORDS], rand);
  return order.map((w) => {
    let scrambled = shuffleInPlace(w.split(""), rand).join("");
    if (scrambled === w) scrambled = w.split("").reverse().join(""); // never show the answer
    return { word: w, scrambled };
  });
}

export default function WordRush(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const round = useMemo(() => buildRound(seed), [seed]);

  const [idx, setIdx] = useState(0);
  const [guess, setGuess] = useState("");
  const [solved, setSolved] = useState(0);
  const [flash, setFlash] = useState(null);
  const inputRef = useRef(null);

  const cur = round[idx % round.length];

  function next(scoreDelta, kind) {
    eng.addScore(scoreDelta);
    eng.addMove();
    setFlash(kind);
    setTimeout(() => setFlash(null), 200);
    setGuess("");
    setIdx((i) => i + 1);
    inputRef.current?.focus();
  }

  function submit(e) {
    e?.preventDefault();
    if (eng.gameOver || isSpectator) return;
    if (guess.trim().toLowerCase() === cur.word) { setSolved((s) => s + 1); next(CORRECT, "good"); }
    else { setFlash("bad"); setTimeout(() => setFlash(null), 200); }
  }

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [{ label: "Score", value: eng.score.toLocaleString() }, { label: "Solved", value: solved }];

  return (
    <>
      <GameFrame
        gameName="Word Rush" badge="🔤 WORD RUSH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        onQuit={eng.endMatch}
        controls={!isSpectator ? (
          <button className="press p-white sm" onClick={() => next(SKIP, "skip")}>⏭ Skip (−4)</button>
        ) : null}
      >
        <div style={{ width: "100%", maxWidth: 460, textAlign: "center" }}>
          <div className="muted eyebrow" style={{ textAlign: "center" }}>Unscramble</div>
          <div className="code" style={{ flexWrap: "wrap", justifyContent: "center", marginBottom: 28 }}>
            {cur.scrambled.toUpperCase().split("").map((ch, i) => (
              <span key={i} style={{ background: flash === "good" ? "var(--lime)" : "#fff" }}>{ch}</span>
            ))}
          </div>
          {!isSpectator ? (
            <form onSubmit={submit} className="inline">
              <input ref={inputRef} autoFocus value={guess} onChange={(e) => setGuess(e.target.value)}
                placeholder="Type the word…" maxLength={20}
                className="ui-field"
                style={{
                  textAlign: "center", fontSize: "1.1rem", flex: "1 1 180px",
                  // the field itself flinches on a wrong guess
                  borderColor: flash === "bad" ? "var(--coral)" : undefined,
                  boxShadow: flash === "bad" ? "0 4px 0 var(--coral)" : undefined,
                }} />
              <button type="submit" className="press p-sun">Go</button>
            </form>
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
