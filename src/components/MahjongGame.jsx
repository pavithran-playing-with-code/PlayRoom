// src/components/MahjongGame.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../utils/api";

// ── Tile definitions ─────────────────────────────────────────────────────────
const TILE_TYPES = [
  { e: "🀙", k: "c1" }, { e: "🀚", k: "c2" }, { e: "🀛", k: "c3" }, { e: "🀜", k: "c4" }, { e: "🀝", k: "c5" },
  { e: "🀞", k: "c6" }, { e: "🀟", k: "c7" }, { e: "🀠", k: "c8" }, { e: "🀡", k: "c9" },
  { e: "🀐", k: "b1" }, { e: "🀑", k: "b2" }, { e: "🀒", k: "b3" }, { e: "🀓", k: "b4" }, { e: "🀔", k: "b5" },
  { e: "🀕", k: "b6" }, { e: "🀖", k: "b7" }, { e: "🀗", k: "b8" }, { e: "🀘", k: "b9" },
  { e: "🀇", k: "m1" }, { e: "🀈", k: "m2" }, { e: "🀉", k: "m3" }, { e: "🀊", k: "m4" }, { e: "🀋", k: "m5" },
  { e: "🀌", k: "m6" }, { e: "🀍", k: "m7" }, { e: "🀎", k: "m8" }, { e: "🀏", k: "m9" },
  { e: "🀀", k: "h1" }, { e: "🀁", k: "h2" }, { e: "🀂", k: "h3" }, { e: "🀃", k: "h4" },
  { e: "🀄", k: "h5" }, { e: "🀅", k: "h6" }, { e: "🀆", k: "h7" }, { e: "🎴", k: "h8" },
];

const COLS = 8;
const TOTAL_PAIRS = 35;

function seededRand(seed) {
  let s = (seed || 42) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function buildTiles(seed) {
  const rand = seededRand(seed);
  const types = TILE_TYPES.slice(0, TOTAL_PAIRS).filter(Boolean);
  let raw = [];
  types.forEach(t => {
    raw.push({ ...t, matched: false });
    raw.push({ ...t, matched: false });
  });
  for (let i = raw.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [raw[i], raw[j]] = [raw[j], raw[i]];
  }
  return raw;
}

function isFree(tiles, idx) {
  const tile = tiles[idx];
  if (!tile || tile.matched) return false;
  const col = idx % COLS;
  const leftTile = col > 0 ? tiles[idx - 1] : null;
  const rightTile = col < COLS - 1 ? tiles[idx + 1] : null;
  const hasLeft = leftTile != null && !leftTile.matched;
  const hasRight = rightTile != null && !rightTile.matched;
  return !(hasLeft && hasRight);
}

// ── GameOver overlay ─────────────────────────────────────────────────────────
function GameOverOverlay({ score, pairs, won, onPlayAgain, onExit }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,5,20,0.93)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200
    }}>
      <div style={{
        background: "var(--surface)", border: "1.5px solid var(--surface2)",
        borderRadius: 20, padding: "40px 36px", textAlign: "center", maxWidth: 380, width: "90%"
      }}>
        <div style={{ fontSize: "4rem", marginBottom: 12 }}>{won ? "🏆" : "⏰"}</div>
        <h2 style={{ fontSize: "1.8rem", fontWeight: 900, marginBottom: 8 }}>{won ? "You Win!" : "Time's Up!"}</h2>
        <p style={{ color: "var(--muted)", marginBottom: 24 }}>
          Score: <strong style={{ color: "var(--accent)" }}>{score.toLocaleString()}</strong>
          {" · "}Pairs: {pairs}/{TOTAL_PAIRS}
        </p>
        <button className="btn btn-primary btn-full" onClick={onPlayAgain} style={{ marginBottom: 10 }}>
          🔄 Play Again
        </button>
        <button className="btn btn-outline btn-full" onClick={onExit}>← Back to Lobby</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MahjongGame({ roomCode, seed, players, currentUser, onGameEnd }) {
  const isOnline = !!roomCode;
  const TIMER_INIT = isOnline ? 300 : 600;

  const [tiles, setTiles] = useState(() => buildTiles(seed));
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [pairs, setPairs] = useState(0);
  const [moves, setMoves] = useState(0);
  const [timerSec, setTimerSec] = useState(TIMER_INIT);
  const [hintIdx, setHintIdx] = useState([]);
  const [lastPair, setLastPair] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [msg, setMsg] = useState(null);
  const [oppData, setOppData] = useState({});

  const timerRef = useRef(null);
  const syncRef = useRef(null);
  const msgRef = useRef(null);

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimerSec(t => {
        if (t <= 1) { clearInterval(timerRef.current); setGameOver(true); setWon(false); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Online sync
  useEffect(() => {
    if (!isOnline) return;
    syncRef.current = setInterval(async () => {
      try {
        await api.patch(`/api/rooms/${roomCode}/score`, { score, pairs_matched: pairs, moves });
        const res = await api.get(`/api/rooms/${roomCode}/poll`);
        const data = await res.json();
        if (data.success) {
          const opp = {};
          (data.players || []).forEach(p => {
            if (p.user_id !== currentUser?.id) opp[p.username] = { score: p.score, avatar: p.avatar };
          });
          setOppData(opp);
        }
      } catch { /* silent */ }
    }, 3000);
    return () => clearInterval(syncRef.current);
  }, [isOnline, roomCode, score, pairs, moves, currentUser]);

  const showMsg = useCallback((text, type = "info") => {
    setMsg({ text, type });
    clearTimeout(msgRef.current);
    msgRef.current = setTimeout(() => setMsg(null), 2200);
  }, []);

  function fmt(sec) {
    return `${Math.floor(sec / 60).toString().padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;
  }

  function clickTile(idx) {
    if (gameOver) return;
    const tile = tiles[idx];
    if (tile.matched) return;
    if (!isFree(tiles, idx)) { showMsg("Tile is blocked!", "error"); return; }
    setHintIdx([]);

    if (selected === null) {
      setSelected(idx);
    } else if (selected === idx) {
      setSelected(null);
    } else {
      const t1 = tiles[selected];
      if (t1.k === tile.k) {
        // Match!
        const gain = 100 + Math.max(0, timerSec);
        const next = tiles.map((t, i) =>
          (i === selected || i === idx) ? { ...t, matched: true } : t
        );
        setTiles(next);
        setScore(s => s + gain);
        setMoves(m => m + 1);
        setLastPair([selected, idx]);
        setSelected(null);
        setPairs(p => {
          const np = p + 1;
          if (np === TOTAL_PAIRS) { clearInterval(timerRef.current); setWon(true); setGameOver(true); }
          return np;
        });
        showMsg(`✓ Match! +${gain}`, "success");
      } else {
        setScore(s => Math.max(0, s - 10));
        setMoves(m => m + 1);
        setSelected(null);
        showMsg("✗ Not a match!", "error");
      }
    }
  }

  function hint() {
    const free = tiles.map((t, i) => (!t.matched && isFree(tiles, i) ? i : -1)).filter(i => i !== -1);
    for (let a = 0; a < free.length; a++) {
      for (let b = a + 1; b < free.length; b++) {
        if (tiles[free[a]].k === tiles[free[b]].k) {
          setHintIdx([free[a], free[b]]);
          setScore(s => Math.max(0, s - 20));
          showMsg("Hint shown! (−20 pts)", "info");
          return;
        }
      }
    }
    showMsg("No free matches — try shuffling!", "error");
  }

  function shuffle() {
    const freeIdx = tiles.map((t, i) => (!t.matched && isFree(tiles, i) ? i : -1)).filter(i => i !== -1);
    const copy = freeIdx.map(i => ({ ...tiles[i] }));
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    setTiles(prev => {
      const next = [...prev];
      freeIdx.forEach((idx, i) => { next[idx] = copy[i]; });
      return next;
    });
    setScore(s => Math.max(0, s - 50));
    showMsg("🔀 Shuffled! (−50 pts)", "info");
  }

  function undo() {
    if (!lastPair) { showMsg("Nothing to undo!", "error"); return; }
    const [a, b] = lastPair;
    setTiles(prev => prev.map((t, i) => (i === a || i === b) ? { ...t, matched: false } : t));
    setPairs(p => p - 1);
    setScore(s => Math.max(0, s - 50));
    setMoves(m => m + 1);
    setLastPair(null);
    showMsg("↩ Undone! (−50 pts)", "info");
  }

  function resetGame() {
    clearInterval(timerRef.current);
    setTiles(buildTiles(seed));
    setSelected(null); setScore(0); setPairs(0); setMoves(0);
    setTimerSec(TIMER_INIT); setGameOver(false); setWon(false);
    setLastPair(null); setHintIdx([]);
    timerRef.current = setInterval(() => {
      setTimerSec(t => {
        if (t <= 1) { clearInterval(timerRef.current); setGameOver(true); return 0; }
        return t - 1;
      });
    }, 1000);
  }

  const opponents = isOnline
    ? (players || []).filter(p => p.user_id !== currentUser?.id)
    : [];

  const msgColors = { success: "var(--green)", error: "var(--red)", info: "var(--blue)" };
  const ctrlBtn = {
    padding: "8px 18px", borderRadius: 20, border: "1.5px solid var(--surface2)",
    background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: "0.88rem", fontWeight: 600, transition: "all 0.15s"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f0820", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", background: "var(--surface)", borderBottom: "1px solid var(--surface2)",
        flexShrink: 0, flexWrap: "wrap", gap: 8
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            fontSize: "1.2rem", fontWeight: 900,
            background: "linear-gradient(90deg,var(--accent),var(--accent2))",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text"
          }}>
            PlayRoom 🎮
          </span>
          <span style={{
            background: "var(--surface2)", borderRadius: 20, padding: "3px 12px",
            fontSize: "0.75rem", color: "var(--muted)"
          }}>
            {isOnline ? "ONLINE" : "OFFLINE"} · MAHJONG
          </span>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            { v: score.toLocaleString(), l: "Score" },
            { v: `${pairs}/${TOTAL_PAIRS}`, l: "Pairs" },
            { v: fmt(timerSec), l: "Time", urgent: timerSec <= 30 },
            { v: moves, l: "Moves" },
          ].map(s => (
            <div key={s.l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: s.urgent ? "var(--red)" : "var(--accent)" }}>
                {s.v}
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
        <button style={ctrlBtn} onClick={() => onGameEnd && onGameEnd(score, pairs, moves, won)}>🚪 Quit</button>
      </div>

      {/* ── Opponents bar (online) ── */}
      {opponents.length > 0 && (
        <div style={{
          display: "flex", gap: 10, padding: "8px 16px", background: "#120a25",
          borderBottom: "1px solid var(--surface2)", flexShrink: 0, flexWrap: "wrap"
        }}>
          {opponents.map(p => (
            <div key={p.user_id} style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "var(--surface)", borderRadius: 10, padding: "8px 14px", flex: 1, minWidth: 140
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg,var(--blue),var(--accent2))",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem"
              }}>
                {p.avatar}
              </div>
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 600 }}>{p.username}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                  {(oppData[p.username]?.score ?? p.score ?? 0).toLocaleString()} pts
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Message banner ── */}
      {msg && (
        <div style={{
          padding: "7px 16px", textAlign: "center", flexShrink: 0,
          background: `${msgColors[msg.type]}22`, color: msgColors[msg.type],
          fontSize: "0.92rem", fontWeight: 600
        }}>
          {msg.text}
        </div>
      )}

      {/* ── Board ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS},auto)`, gap: 4 }}>
          {tiles.map((tile, idx) => {
            const free = !tile.matched && isFree(tiles, idx);
            const isSel = selected === idx;
            const isHint = hintIdx.includes(idx);

            let bg = "#fff8e7";
            let border = "2px solid #c8a84b";
            let transform = "translateY(0)";
            let shadow = "0 4px 0 #8b6914";
            let opacity = 1;
            let cursor = "pointer";

            if (tile.matched) {
              bg = "#b8f0c8"; border = "2px solid #4ecb71";
              opacity = 0.45; shadow = "none"; cursor = "default";
            } else if (isSel) {
              bg = "#ffe066"; border = "2px solid #e8a900";
              transform = "translateY(-6px)";
              shadow = "0 10px 0 #8b6914, 0 0 16px rgba(247,201,72,0.4)";
            } else if (isHint) {
              bg = "#ffd1ec"; border = "2px solid var(--accent2)";
            } else if (!free) {
              opacity = 0.65; cursor = "not-allowed";
            }

            return (
              <div key={idx} onClick={() => clickTile(idx)} style={{
                width: 52, height: 68, background: bg, border, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.55rem", cursor, transition: "all 0.12s",
                boxShadow: shadow, transform, opacity, userSelect: "none", flexShrink: 0,
              }}>
                {tile.e}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{
        display: "flex", gap: 10, padding: "10px 16px", background: "var(--surface)",
        borderTop: "1px solid var(--surface2)", justifyContent: "center", flexWrap: "wrap", flexShrink: 0
      }}>
        <button style={ctrlBtn} onClick={hint}>💡 Hint</button>
        <button style={ctrlBtn} onClick={shuffle}>🔀 Shuffle</button>
        <button style={ctrlBtn} onClick={undo}>↩ Undo</button>
      </div>

      {/* ── Game over overlay ── */}
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