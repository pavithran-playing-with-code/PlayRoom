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

// Custom tile art — the Unicode mahjong glyphs render as nearly-invisible
// outlines at small sizes, so we draw our own: big colored numeral + suit
// icon, color-coded by suit family.
const SUIT_STYLE = {
  c: { color: "#1f6dd2", icon: "●",  label: "Circles"    },
  b: { color: "#0a8d3d", icon: "🎋", label: "Bamboo"     },
  m: { color: "#c92a2a", icon: "萬", label: "Characters" },
  h: { color: "#a37b00", icon: "★",  label: "Honors"     },
};
const HONOR_FACE = {
  h1: { glyph: "E",  sub: "East"   },
  h2: { glyph: "S",  sub: "South"  },
  h3: { glyph: "W",  sub: "West"   },
  h4: { glyph: "N",  sub: "North"  },
  h5: { glyph: "中", sub: "Red"    },
  h6: { glyph: "發", sub: "Green"  },
  h7: { glyph: "白", sub: "White"  },
  h8: { glyph: "🌸", sub: "Flower" },
};

function TileFace({ tileKey, dim }) {
  const suit  = tileKey[0];
  const num   = tileKey.slice(1);
  const style = SUIT_STYLE[suit];
  const color = dim ? "#5b7a4f" : style.color;
  // Fluid font sizes scale with viewport so big-screen tiles aren't tiny.
  const bigF   = "clamp(1.05rem, 4.2vw, 2rem)";
  const honorF = "clamp(1.0rem,  3.8vw, 1.85rem)";
  const subF   = "clamp(0.45rem, 1.2vw, 0.7rem)";
  const iconF  = "clamp(0.65rem, 1.7vw, 1.05rem)";

  if (suit === "h") {
    const face = HONOR_FACE[tileKey];
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", lineHeight:1, gap:2 }}>
        <span style={{ fontSize: honorF, fontWeight:900, color }}>
          {face.glyph}
        </span>
        <span style={{ fontSize:subF, color, opacity:0.75, textTransform:"uppercase", letterSpacing:1 }}>
          {face.sub}
        </span>
      </div>
    );
  }
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", lineHeight:1, gap:3 }}>
      <span style={{ fontSize:bigF, fontWeight:900, color, fontFamily:"system-ui,sans-serif" }}>{num}</span>
      <span style={{ fontSize:iconF, color, opacity:0.85 }}>
        {style.icon}
      </span>
    </div>
  );
}

// 70 tiles total. We pick a column count to match the viewport so the
// board uses horizontal space on desktop and stays portrait on mobile.
// 70 factors cleanly into 7 / 10 / 14 — all give complete rows.
function pickColsForViewport() {
  if (typeof window === "undefined") return 10;
  const w = window.innerWidth;
  if (w < 600)  return 7;   // mobile portrait  → 10 rows
  if (w < 1000) return 10;  // tablet / narrow  → 7 rows
  return 14;                // desktop laptop+  → 5 rows
}

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

function isFree(tiles, idx, cols) {
  const tile = tiles[idx];
  if (!tile || tile.matched) return false;
  const col = idx % cols;
  const leftTile = col > 0 ? tiles[idx - 1] : null;
  const rightTile = col < cols - 1 ? tiles[idx + 1] : null;
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
export default function MahjongGame({ roomCode, seed, players, currentUser, onGameEnd, isSpectator = false, spectatorState = null, spectatorWatching = null }) {
  const isOnline = !!roomCode;
  const TIMER_INIT = isOnline ? 300 : 600;

  // Column count tracks viewport class (mobile/tablet/desktop).
  // Reacts to resize so DevTools / orientation changes reflow the board.
  // Note: changing COLS mid-game shifts which tiles are spatially adjacent,
  // so a tile's "free/blocked" status can change — acceptable trade-off.
  const [cols, setCols] = useState(() => pickColsForViewport());
  useEffect(() => {
    const onResize = () => {
      const next = pickColsForViewport();
      setCols(c => (c === next ? c : next));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

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
  const stateRef = useRef({ score, pairs, moves, tiles });
  useEffect(() => { stateRef.current = { score, pairs, moves, tiles }; }, [score, pairs, moves, tiles]);

  // Spectator: rebuild tile.matched from the watched player's state.
  useEffect(() => {
    if (!isSpectator || !spectatorState) return;
    const matched = new Set((spectatorState.matched || []).map(Number));
    setTiles(prev => prev.map((t, i) => ({ ...t, matched: matched.has(i) })));
  }, [isSpectator, spectatorState]);

  // Timer (player only)
  useEffect(() => {
    if (isSpectator) return;
    timerRef.current = setInterval(() => {
      setTimerSec(t => {
        if (t <= 1) { clearInterval(timerRef.current); setGameOver(true); setWon(false); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isSpectator]);

  // Online sync (player only)
  useEffect(() => {
    if (!isOnline || isSpectator) return;
    syncRef.current = setInterval(async () => {
      try {
        const s = stateRef.current;
        const matchedIdx = s.tiles.map((t, i) => t.matched ? i : -1).filter(i => i >= 0);
        await api.patch(`/api/rooms/${roomCode}/score`, {
          score: s.score, pairs_matched: s.pairs, moves: s.moves,
          game_state: JSON.stringify({ matched: matchedIdx }),
        });
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
    }, 2000);
    return () => clearInterval(syncRef.current);
  }, [isOnline, isSpectator, roomCode, currentUser]);

  const showMsg = useCallback((text, type = "info") => {
    setMsg({ text, type });
    clearTimeout(msgRef.current);
    msgRef.current = setTimeout(() => setMsg(null), 2200);
  }, []);

  function fmt(sec) {
    return `${Math.floor(sec / 60).toString().padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;
  }

  function clickTile(idx) {
    if (isSpectator || gameOver) return;
    const tile = tiles[idx];
    if (tile.matched) return;
    if (!isFree(tiles, idx, cols)) { showMsg("Tile is blocked!", "error"); return; }
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
    const free = tiles.map((t, i) => (!t.matched && isFree(tiles, i, cols) ? i : -1)).filter(i => i !== -1);
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
    const freeIdx = tiles.map((t, i) => (!t.matched && isFree(tiles, i, cols) ? i : -1)).filter(i => i !== -1);
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

  // Robust filter: coerce both ids to numbers, and bail entirely if we don't
  // know our own id yet (otherwise the player sees themselves as their own
  // opponent — that's the "Pavithran 0 pts" strip bug).
  const myId = Number(currentUser?.id);
  const opponents = (isOnline && Number.isFinite(myId))
    ? (players || []).filter(p => Number(p.user_id) !== myId)
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
        padding: "8px clamp(12px,2vw,20px)", background: "var(--surface)", borderBottom: "1px solid var(--surface2)",
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
            {isSpectator ? `👀 WATCHING ${spectatorWatching?.username || ""}` : (isOnline ? "ONLINE" : "OFFLINE") + " · MAHJONG"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {(isSpectator ? [
            { v: (spectatorWatching?.score ?? 0).toLocaleString(), l: "Score" },
            { v: `${spectatorWatching?.pairs_matched ?? 0}/${TOTAL_PAIRS}`, l: "Pairs" },
            { v: spectatorWatching?.moves ?? 0, l: "Moves" },
          ] : [
            { v: score.toLocaleString(), l: "Score" },
            { v: `${pairs}/${TOTAL_PAIRS}`, l: "Pairs" },
            { v: fmt(timerSec), l: "Time", urgent: timerSec <= 30 },
            { v: moves, l: "Moves" },
          ]).map(s => (
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
        <button style={ctrlBtn} onClick={() => onGameEnd && onGameEnd(score, pairs, moves, won)}>
          {isSpectator ? "← Leave" : "🚪 Quit"}
        </button>
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

      {/* ── Board (felt-table vibe to make the cream tiles pop) ── */}
      <div style={{
        flex: 1, minHeight: 0, overflow: "hidden",
        // Vertical padding stays meaningful on mobile (tile calc reserves
        // for it); horizontal grows on larger screens.
        padding: "clamp(20px, 3vw, 36px) clamp(12px, 3vw, 32px)",
        display: "flex", justifyContent: "center", alignItems: "center",
        background: "radial-gradient(ellipse at center, #1f5a3a 0%, #143928 55%, #0a1f17 100%)",
      }}>
        <div style={{
          display: "grid",
          // Tile height is the limiting dimension; width follows the aspect ratio.
          // We pick the smaller of (height-fit) and (width-fit) so the whole
          // board fits the available viewport without scrolling.
          "--rows": String(Math.ceil(70 / cols)),
          "--cols": String(cols),
          // Reserved chrome height: header (~50) + optional opponents bar
          // (~62) + controls (~52) + felt padding top+bottom (~64) + safety.
          // Caps lowered slightly so smaller screens always leave breathing room
          // between the tiles and the felt edges.
          "--tile-h": `min(
            clamp(32px, calc((100dvh - 280px) / var(--rows) - 8px), 78px),
            clamp(44px, calc((100vw - 80px) / var(--cols) * 1.32 - 10px), 100px)
          )`,
          gridTemplateColumns: `repeat(${cols}, calc(var(--tile-h) * 0.78))`,
          gridAutoRows: "var(--tile-h)",
          gap: "clamp(5px, 0.8vw, 10px)",
          maxWidth: "100%",
        }}>
          {tiles.map((tile, idx) => {
            const free = !tile.matched && isFree(tiles, idx, cols);
            const isSel = selected === idx;
            const isHint = hintIdx.includes(idx);

            // Layered, dimensional tile look — gradient face + colored side
            // for a "physical" stack feel, plus high-contrast states.
            let bg          = "linear-gradient(180deg,#fffaeb 0%, #f3e3b8 100%)";
            let border      = "1.5px solid #b8923a";
            let transform   = "translateY(0)";
            let shadow      = "0 5px 0 #8b6914, 0 6px 12px rgba(0,0,0,0.35)";
            let opacity     = 1;
            let cursor      = "pointer";
            let filter      = "none";
            let extraGlow   = null;
            const dimFace   = false;

            if (tile.matched) {
              bg = "linear-gradient(180deg,#d9f8e1 0%, #b4ecc4 100%)";
              border = "1.5px solid #4ecb71";
              opacity = 0.55; shadow = "0 1px 0 #2f8a4a"; cursor = "default";
            } else if (isSel) {
              bg = "linear-gradient(180deg,#fff4b8 0%, #ffd84d 100%)";
              border = "2px solid #e8a900";
              transform = "translateY(-8px)";
              shadow = "0 13px 0 #8b6914, 0 0 22px rgba(255,213,80,0.55)";
            } else if (isHint) {
              bg = "linear-gradient(180deg,#ffe0f0 0%, #ffb1d8 100%)";
              border = "2px solid var(--accent2,#ff6dba)";
              extraGlow = "0 0 14px rgba(255,109,186,0.55)";
            } else if (!free) {
              opacity = 0.82; cursor = "not-allowed";
              filter = "grayscale(35%)";
              shadow = "0 3px 0 #8b6914, 0 3px 6px rgba(0,0,0,0.25)";
            }

            return (
              <div key={idx} onClick={() => clickTile(idx)} style={{
                position:"relative",
                width: "100%", height: "100%",
                background: bg, border, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor, transition: "transform 0.12s, box-shadow 0.12s, opacity 0.12s",
                boxShadow: extraGlow ? `${shadow}, ${extraGlow}` : shadow,
                transform, opacity, filter,
                userSelect: "none",
              }}>
                <TileFace tileKey={tile.k} dim={dimFace} />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{
        display: "flex", gap: 10, padding: "8px 16px", background: "var(--surface)",
        borderTop: "1px solid var(--surface2)", justifyContent: "center", flexWrap: "wrap", flexShrink: 0
      }}>
        {!isSpectator && <button style={ctrlBtn} onClick={hint}>💡 Hint</button>}
        {!isSpectator && <button style={ctrlBtn} onClick={shuffle}>🔀 Shuffle</button>}
        {!isSpectator && <button style={ctrlBtn} onClick={undo}>↩ Undo</button>}
      </div>

      {/* ── Game over overlay ── */}
      {gameOver && !isSpectator && (
        <GameOverOverlay
          score={score} pairs={pairs} won={won}
          onPlayAgain={resetGame}
          onExit={() => onGameEnd && onGameEnd(score, pairs, moves, won)}
        />
      )}
    </div>
  );
}