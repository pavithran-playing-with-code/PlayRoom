// src/components/games/TapRush.jsx
// A tile lights up — tap it fast for points. Occasional 💣 tiles must be
// avoided. Seeded position/type sequence keeps a head-to-head race fair; the
// reaction timing is each player's own. Points-in-time → highest score wins.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { seededRand } from "./seededRand";

const GRID = 9;          // 3×3
const HIT = 14;
const BOMB_PENALTY = -12;
const BASE_WINDOW = 1150; // ms a tile stays lit (shrinks as you score)

function buildSequence(seed, n = 800) {
  const rand = seededRand(seed);
  const seq = [];
  for (let i = 0; i < n; i++) {
    seq.push({ pos: Math.floor(rand() * GRID), bomb: rand() < 0.18 });
  }
  return seq;
}

export default function TapRush(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const seq = useMemo(() => buildSequence(seed), [seed]);

  const [step, setStep] = useState(0);
  const [hits, setHits] = useState(0);
  const [flash, setFlash] = useState(null); // {pos, kind}
  const missRef = useRef(null);

  const active = seq[step % seq.length];
  // Named windowMs, not `window` — that would shadow the global.
  const windowMs = Math.max(520, BASE_WINDOW - hits * 12); // gets faster

  // Auto-advance (miss) if the player doesn't act in time.
  useEffect(() => {
    if (isSpectator || eng.gameOver) return;
    clearTimeout(missRef.current);
    missRef.current = setTimeout(() => setStep((s) => s + 1), windowMs);
    return () => clearTimeout(missRef.current);
  }, [step, isSpectator, eng.gameOver, windowMs]);

  function tap(pos) {
    if (isSpectator || eng.gameOver) return;
    if (pos !== active.pos) return; // only the lit tile is tappable
    eng.addMove();
    if (active.bomb) {
      eng.addScore(BOMB_PENALTY);
      setFlash({ pos, kind: "bomb" });
    } else {
      eng.addScore(HIT);
      setHits((h) => h + 1);
      setFlash({ pos, kind: "hit" });
    }
    setTimeout(() => setFlash(null), 160);
    setStep((s) => s + 1);
  }

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [{ label: "Score", value: eng.score.toLocaleString() }, { label: "Hits", value: hits }];

  return (
    <>
      <GameFrame
        gameName="Tap Rush" badge="⚡ TAP RUSH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        onQuit={eng.endMatch}
      >
        <div style={{ textAlign: "center" }}>
          <div className="muted eyebrow" style={{ textAlign: "center" }}>Tap the star · avoid 💣</div>
          <div className="taprush-grid" style={{ width: "min(82vw, 380px)" }}>
            {Array.from({ length: GRID }).map((_, pos) => {
              const lit = !isSpectator && pos === active.pos;
              const isBomb = lit && active.bomb;
              const f = flash && flash.pos === pos ? flash.kind : null;

              // A lit tile pops UP off the page; a dead tile sits flush. The hard
              // shadow does the work a glow used to.
              let bg = "var(--paper2)";
              if (isBomb) bg = "var(--coral)";
              else if (lit) bg = "var(--sun)";
              if (f === "hit") bg = "var(--lime)";
              if (f === "bomb") bg = "var(--coral)";

              return (
                <button key={pos} onClick={() => tap(pos)} className="taptile"
                  style={{
                    background: bg,
                    transform: lit ? "translateY(-4px)" : "translateY(4px)",
                    boxShadow: lit ? "0 9px 0 var(--ink)" : "0 1px 0 var(--ink)",
                  }}>
                  {isBomb ? "💣" : lit ? "⭐" : ""}
                </button>
              );
            })}
          </div>
          {isSpectator && (
            <div className="muted" style={{ marginTop: 16 }}>
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
