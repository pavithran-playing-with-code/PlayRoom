// src/components/MemoryGame.jsx
import React, { useState, useEffect, useRef } from "react";
import { api } from "../utils/api";

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

function GameOverOverlay({ score, pairs, won, onPlayAgain, onExit }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(10,5,20,0.93)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
      <div style={{ background:"var(--surface)", border:"1.5px solid var(--surface2)",
        borderRadius:20, padding:"40px 36px", textAlign:"center", maxWidth:360, width:"90%" }}>
        <div style={{ fontSize:"4rem", marginBottom:12 }}>{won ? "🏆" : "⏰"}</div>
        <h2 style={{ fontSize:"1.8rem", fontWeight:900, marginBottom:8 }}>{won ? "You Win!" : "Time's Up!"}</h2>
        <p style={{ color:"var(--muted)", marginBottom:24 }}>
          Score: <strong style={{ color:"var(--accent)" }}>{score.toLocaleString()}</strong>
          {" · "}Pairs: {pairs}/{TOTAL_PAIRS}
        </p>
        <button className="btn btn-primary btn-full" onClick={onPlayAgain} style={{ marginBottom:10 }}>
          🔄 Play Again
        </button>
        <button className="btn btn-outline btn-full" onClick={onExit}>← Back to Lobby</button>
      </div>
    </div>
  );
}

export default function MemoryGame({ roomCode, seed, players, currentUser, onGameEnd }) {
  const isOnline   = !!roomCode;
  const TIMER_INIT = 180;

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

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimerSec(t => {
        if (t <= 1) { clearInterval(timerRef.current); setGameOver(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    syncRef.current = setInterval(async () => {
      try { await api.patch(`/api/rooms/${roomCode}/score`, { score, pairs_matched: pairs, moves }); }
      catch { /* silent */ }
    }, 3000);
    return () => clearInterval(syncRef.current);
  }, [isOnline, roomCode, score, pairs, moves]);

  function clickCard(idx) {
    if (blocked || gameOver) return;
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

  function resetGame() {
    clearInterval(timerRef.current);
    setCards(buildCards(seed)); setFlipped([]); setScore(0); setPairs(0);
    setMoves(0); setTimerSec(TIMER_INIT); setBlocked(false); setGameOver(false); setWon(false);
    timerRef.current = setInterval(() => {
      setTimerSec(t => { if (t <= 1) { clearInterval(timerRef.current); setGameOver(true); return 0; } return t - 1; });
    }, 1000);
  }

  function fmt(sec) {
    return `${Math.floor(sec / 60).toString().padStart(2,"0")}:${(sec % 60).toString().padStart(2,"0")}`;
  }

  const ctrlBtn = { padding:"8px 18px", borderRadius:20, border:"1.5px solid var(--surface2)",
    background:"transparent", color:"var(--text)", cursor:"pointer", fontSize:"0.88rem", fontWeight:600 };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"#0f0820", overflow:"hidden" }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"10px 20px", background:"var(--surface)", borderBottom:"1px solid var(--surface2)",
        flexShrink:0, flexWrap:"wrap", gap:8 }}>
        <span style={{ fontSize:"1.2rem", fontWeight:900,
          background:"linear-gradient(90deg,var(--accent),var(--accent2))",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>
          PlayRoom · Memory 🃏
        </span>
        <div style={{ display:"flex", gap:20 }}>
          {[
            { v: score.toLocaleString(), l:"Score" },
            { v: `${pairs}/${TOTAL_PAIRS}`, l:"Pairs" },
            { v: fmt(timerSec), l:"Time", urgent: timerSec <= 30 },
            { v: moves, l:"Moves" },
          ].map(s => (
            <div key={s.l} style={{ textAlign:"center" }}>
              <div style={{ fontSize:"1.2rem", fontWeight:700, color: s.urgent ? "var(--red)" : "var(--accent)" }}>{s.v}</div>
              <div style={{ fontSize:"0.68rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:1 }}>{s.l}</div>
            </div>
          ))}
        </div>
        <button style={ctrlBtn} onClick={() => onGameEnd && onGameEnd(score, pairs, moves, won)}>🚪 Quit</button>
      </div>

      {/* Board */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:20, overflowY:"auto" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,auto)", gap:12 }}>
          {cards.map((card, idx) => (
            <div key={card.id} onClick={() => clickCard(idx)} style={{
              width:80, height:100, borderRadius:12, cursor: card.matched || card.flipped ? "default" : "pointer",
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:"2.2rem",
              transition:"all 0.2s", userSelect:"none",
              background: card.matched ? "rgba(78,203,113,0.18)" : card.flipped ? "var(--surface)" : "var(--surface2)",
              border: card.matched ? "2px solid var(--green)" : card.flipped ? "2px solid var(--accent)" : "2px solid var(--surface2)",
              transform: (card.flipped || card.matched) ? "scale(1.05)" : "scale(1)",
            }}>
              {(card.flipped || card.matched) ? card.emoji : "🎴"}
            </div>
          ))}
        </div>
      </div>

      {/* Game over */}
      {gameOver && (
        <GameOverOverlay
          score={score} pairs={pairs} won={won}
          onPlayAgain={resetGame}
          onExit={() => onGameEnd && onGameEnd(score, pairs, moves, won)}
        />
      )}
    </div>
  );
}
