// src/components/MemoryGame.jsx
import React, { useState, useEffect, useRef } from "react";
import { api } from "../utils/api";
import GameFrame from "./games/GameFrame";
import GameOver from "./games/GameOver";
import { finalSync } from "./games/finalSync";

const EMOJIS     = ["🎮","🀄","🃏","🧩","🎯","🎲","🏆","⚡","🔥","🌟","🐉","🦊","🎪","🎨","🎵","🎸"];
const TOTAL_PAIRS = 16;

function seededRand(seed) {
  let s = (seed || 99) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function buildCards(seed) {
  const rand = seededRand(seed);
  let deck   = [...EMOJIS, ...EMOJIS].map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export default function MemoryGame({ roomCode, seed, players, currentUser, onGameEnd, durationSeconds, isSpectator = false, spectatorState = null, spectatorWatching = null }) {
  const isOnline   = !!roomCode;
  // Time-boxed by the room duration (2–5 min); default 180s for solo play.
  const TIMER_INIT = durationSeconds || 180;

  // 4 cols on phones, 8 on bigger screens. Memory has no spatial adjacency
  // rule so reflowing mid-game is fully safe.
  const pickMemCols = () => (typeof window !== "undefined" && window.innerWidth < 600) ? 4 : 8;
  const [memCols, setMemCols] = useState(pickMemCols);
  useEffect(() => {
    const onResize = () => {
      const next = pickMemCols();
      setMemCols(c => (c === next ? c : next));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const [cards,    setCards]    = useState(() => buildCards(seed));
  const [flipped,  setFlipped]  = useState([]);
  const [score,    setScore]    = useState(0);
  const [pairs,    setPairs]    = useState(0);
  const [moves,    setMoves]    = useState(0);
  const [timerSec, setTimerSec] = useState(TIMER_INIT);
  const [blocked,  setBlocked]  = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [won,      setWon]      = useState(false);

  const timerRef = useRef(null);
  const syncRef  = useRef(null);
  // Latest live values for the sync interval — avoids stale closures.
  const stateRef = useRef({ score, pairs, moves, cards });
  useEffect(() => { stateRef.current = { score, pairs, moves, cards }; }, [score, pairs, moves, cards]);

  // Spectator: rebuild cards each render to match the watched player's matched set.
  useEffect(() => {
    if (!isSpectator || !spectatorState) return;
    const matched = new Set((spectatorState.matched || []).map(Number));
    setCards(prev => prev.map(c => ({ ...c, matched: matched.has(c.id), flipped: matched.has(c.id) })));
  }, [isSpectator, spectatorState]);

  useEffect(() => {
    // Players run the countdown; spectators don't (they piggyback on the player).
    if (isSpectator) return;
    timerRef.current = setInterval(() => {
      setTimerSec(t => {
        if (t <= 1) { clearInterval(timerRef.current); setGameOver(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isSpectator]);

  useEffect(() => {
    if (!isOnline || isSpectator) return;
    syncRef.current = setInterval(() => {
      const s = stateRef.current;
      const matchedIds = s.cards.filter(c => c.matched).map(c => c.id);
      api.patch(`/api/rooms/${roomCode}/score`, {
        score: s.score, pairs_matched: s.pairs, moves: s.moves,
        game_state: JSON.stringify({ matched: matchedIds }),
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(syncRef.current);
  }, [isOnline, isSpectator, roomCode]);

  function clickCard(idx) {
    if (isSpectator || blocked || gameOver) return;
    const card = cards[idx];
    if (card.flipped || card.matched) return;

    const newFlipped = [...flipped, idx];
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, flipped: true } : c));
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setBlocked(true);
      setMoves(m => m + 1);
      const [a, b] = newFlipped;

      // We need the latest cards state — use functional update
      setCards(prev => {
        if (prev[a].emoji === prev[b].emoji) {
          const next = prev.map((c, i) => (i === a || i === b) ? { ...c, matched: true } : c);
          // Side effects after match
          setTimeout(() => {
            setScore(s => s + 100 + Math.max(0, timerSec));
            setPairs(p => {
              const np = p + 1;
              if (np === TOTAL_PAIRS) { clearInterval(timerRef.current); setWon(true); setGameOver(true); }
              return np;
            });
            setFlipped([]);
            setBlocked(false);
          }, 500);
          return next;
        } else {
          // No match — flip back after delay
          setTimeout(() => {
            setCards(c => c.map((cd, i) => (i === a || i === b) ? { ...cd, flipped: false } : cd));
            setScore(s => Math.max(0, s - 5));
            setFlipped([]);
            setBlocked(false);
          }, 900);
          return prev;
        }
      });
    }
  }

  // No resetGame / "Play Again" any more — see the note in MahjongGame.jsx.
  // One session is recorded per (room, user), so a replay in the same room
  // could never score.

  // Push the final score before handing off — the server decides the outcome
  // from what's stored, so it has to be current. See games/finalSync.js.
  const quittingRef = useRef(false);
  async function quit() {
    if (quittingRef.current) return;
    quittingRef.current = true;
    clearInterval(syncRef.current);
    if (isOnline) {
      const matchedIds = cards.filter(c => c.matched).map(c => c.id);
      await finalSync(roomCode, {
        score, pairs_matched: pairs, moves,
        game_state: JSON.stringify({ matched: matchedIds }),
      });
    }
    onGameEnd && onGameEnd(score, pairs, moves, won);
  }

  const stats = isSpectator
    ? [
        { label: "Score", value: (spectatorWatching?.score ?? 0).toLocaleString() },
        { label: "Pairs", value: `${spectatorWatching?.pairs_matched ?? 0}/${TOTAL_PAIRS}` },
        { label: "Moves", value: spectatorWatching?.moves ?? 0 },
      ]
    : [
        { label: "Score", value: score.toLocaleString() },
        { label: "Pairs", value: `${pairs}/${TOTAL_PAIRS}` },
        { label: "Moves", value: moves },
      ];

  return (
    <>
      <GameFrame
        gameName="Memory Match" badge="🃏 MEMORY"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={isSpectator ? null : { value: timerSec, max: TIMER_INIT }}
        onQuit={quit}
      >
        {/* 4 cols on phones, 8 on tablet/desktop so the board uses the width */}
        <div style={{
          display: "grid",
          "--mem-cols": String(memCols),
          gridTemplateColumns: "repeat(var(--mem-cols), clamp(48px, calc((100vw - 48px) / var(--mem-cols) - 12px), 104px))",
          gridAutoRows: "clamp(60px, calc((100vw - 48px) / var(--mem-cols) * 1.2), 126px)",
          gap: "clamp(7px, 1vw, 14px)",
          maxWidth: "100%",
        }}>
          {cards.map((card, idx) => {
            const face = card.flipped || card.matched;
            return (
              <div key={card.id} onClick={() => clickCard(idx)} className="memcard"
                style={{
                  cursor: face ? "default" : "pointer",
                  // matched cards go lime and settle flat; a face-up card lifts.
                  background: card.matched ? "var(--lime)" : face ? "#fff" : "var(--sun)",
                  boxShadow: card.matched ? "0 2px 0 var(--ink)" : "0 5px 0 var(--ink)",
                  transform: face ? "translateY(-2px)" : "translateY(0)",
                }}>
                {face ? card.emoji : "🎴"}
              </div>
            );
          })}
        </div>
      </GameFrame>

      {gameOver && !isSpectator && (
        <GameOver
          score={score} won={won} finished={won}
          extra={`Pairs: ${pairs}/${TOTAL_PAIRS}`}
          onExit={quit}
        />
      )}
    </>
  );
}
