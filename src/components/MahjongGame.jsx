// src/components/MahjongGame.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../utils/api";
import GameFrame from "./games/GameFrame";
import GameOver from "./games/GameOver";
import { confetti } from "./ui/FunLayer";

// ── Tile definitions ─────────────────────────────────────────────────────────
// PICTURE TILES, not numbers.
//
// The old set used the Unicode mahjong glyphs (🀙🀚🀛…), which render as
// near-invisible hairline outlines, so each tile had to be redrawn as a
// coloured numeral + tiny suit mark. That made three different tiles all look
// like a "2" — 2-dots, 2-bamboo, 2-characters — and none of them match each
// other. Players spent the whole game squinting at digits.
//
// Now every tile is a distinct, instantly recognisable picture. Two tiles match
// when they show the SAME PICTURE — no numbers, no suits, nothing to decode.
// 35 pictures × 2 = the same 70-tile board.
// Each category owns one toy-palette colour, so same-category tiles are easy to
// scan for even before you focus on the picture itself.
const TILE_CATEGORIES = [
  { id: "animals", label: "Animals", tint: "var(--sun)",
    items: ["🐶","🐱","🐼","🦊","🐸","🐵","🦁","🐯"] },
  { id: "sea",     label: "Sea",     tint: "var(--sky)",
    items: ["🐳","🐬","🐟","🐙","🦀","🦈","🐠"] },
  { id: "food",    label: "Food",    tint: "var(--coral)",
    items: ["🍕","🍔","🍩","🍦","🍓","🍉","🍫","🍪"] },
  { id: "nature",  label: "Nature",  tint: "var(--mint)",
    items: ["🌸","🌵","🍄","🌈","🌻","🍀"] },
  { id: "fun",     label: "Fun",     tint: "var(--bubble)",
    items: ["🚀","⭐","🌙","⚡","🎈","🎁"] },
];

// Flattened catalogue: { e: emoji, k: unique key, cat }. 35 entries.
const TILE_TYPES = TILE_CATEGORIES.flatMap((c) =>
  c.items.map((e, i) => ({ e, k: `${c.id}${i}`, cat: c.id }))
);

const CAT_STYLE = Object.fromEntries(TILE_CATEGORIES.map((c) => [c.id, c]));

// Big picture on a category-coloured, ink-outlined disc — the same "physical
// object" treatment every other control gets.
function TileFace({ tile }) {
  const style = CAT_STYLE[tile.cat] || CAT_STYLE.animals;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: "76%", aspectRatio: "1 / 1", borderRadius: "50%",
      background: style.tint,
      border: "2.5px solid var(--ink)",
      fontSize: "clamp(1.1rem, 3.6vw, 2rem)", lineHeight: 1,
      userSelect: "none",
    }}>
      <span>{tile.e}</span>
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

// A tile is playable when it has at least one OPEN side — you could slide it
// out that way. Board edges count as open.
//
// This used to check left/right only, which on a 14-wide grid meant just the
// two ends of each row were ever free (10 of 70 tiles) — the board deadlocked
// almost immediately. Checking all four sides frees the whole perimeter and
// opens up more with every pair cleared, which is what makes the game playable.
function isFree(tiles, idx, cols) {
  const tile = tiles[idx];
  if (!tile || tile.matched) return false;

  const rows = Math.ceil(tiles.length / cols);
  const row = Math.floor(idx / cols);
  const col = idx % cols;

  // Is the neighbour at (r,c) present and still on the board?
  const occupied = (r, c) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return false; // off-board = open
    const t = tiles[r * cols + c];
    return t != null && !t.matched;
  };

  return !occupied(row, col - 1) || !occupied(row, col + 1)
      || !occupied(row - 1, col) || !occupied(row + 1, col);
}

// True when at least one pair of same-kind free tiles exists.
function hasAvailableMatch(tileArr, cols) {
  const free = [];
  for (let i = 0; i < tileArr.length; i++) {
    if (!tileArr[i].matched && isFree(tileArr, i, cols)) free.push(i);
  }
  for (let a = 0; a < free.length; a++) {
    for (let b = a + 1; b < free.length; b++) {
      if (tileArr[free[a]].k === tileArr[free[b]].k) return true;
    }
  }
  return false;
}

// Redistribute EVERY remaining tile across every remaining position, and keep
// trying until the result actually has a legal move.
//
// The old version shuffled only the free tiles into the free positions — the
// same multiset of kinds landing back in the same open slots, so the board was
// provably just as stuck afterwards. Returns the original array (identity) when
// it can't produce a playable board, so callers can detect the no-op.
function reshuffle(tiles, cols, maxTries = 40) {
  const slots = [];
  for (let i = 0; i < tiles.length; i++) if (!tiles[i].matched) slots.push(i);
  if (slots.length < 2) return tiles;

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const pool = slots.map(i => tiles[i]);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const next = [...tiles];
    slots.forEach((idx, k) => { next[idx] = pool[k]; });
    if (hasAvailableMatch(next, cols)) return next;
  }
  return tiles;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MahjongGame({ roomCode, seed, players, currentUser, onGameEnd, durationSeconds, isSpectator = false, spectatorState = null, spectatorWatching = null }) {
  const isOnline = !!roomCode;
  // Every match is time-boxed by the room's duration (2–5 min); fall back to a
  // generous solo clock when played outside a room.
  const TIMER_INIT = durationSeconds || (isOnline ? 300 : 600);

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

  // Helpers declared here (above the auto-shuffle effect) so they're
  // initialized before any effect that depends on them — avoids TDZ.
  const showMsg = useCallback((text, type = "info") => {
    setMsg({ text, type });
    clearTimeout(msgRef.current);
    msgRef.current = setTimeout(() => setMsg(null), 2200);
  }, []);

  // Rescue a deadlocked board. reshuffle() only ever returns a board that has a
  // legal move, so a single pass is enough — no retry budget, and no way to
  // land in the old "shuffled 5 times, still stuck" dead end.
  useEffect(() => {
    if (gameOver || isSpectator) return;
    if (selected !== null) return;            // wait for current selection
    if (pairs >= TOTAL_PAIRS) return;
    // Debounce so we don't fire during the mid-click transient state.
    const t = setTimeout(() => {
      if (hasAvailableMatch(tiles, cols)) return;
      const next = reshuffle(tiles, cols);
      if (next === tiles) { showMsg("⚠️ No moves left on the board.", "error"); return; }
      setTiles(next);
      showMsg("⚡ No matches — board reshuffled!", "info");
    }, 400);
    return () => clearTimeout(t);
  }, [tiles, cols, gameOver, isSpectator, selected, pairs, showMsg]);

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

  function clickTile(idx, ev) {
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
        setSelected(null);
        // Little pop of the matched picture, right where you tapped.
        const r = ev?.currentTarget?.getBoundingClientRect?.();
        confetti(r ? r.left + r.width / 2 : undefined, r ? r.top + r.height / 2 : undefined,
          { count: 16, emojis: [tile.e, "✨"] });

        setPairs(p => {
          const np = p + 1;
          if (np === TOTAL_PAIRS) {
            clearInterval(timerRef.current); setWon(true); setGameOver(true);
            confetti(window.innerWidth / 2, window.innerHeight / 2, { count: 200 });
          }
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
    showMsg("No free matches — auto-shuffling…", "error");
    doShuffle(true);  // auto-shuffle so the player isn't stuck
  }

  // Redistribute every remaining tile. `auto=true` skips the score penalty
  // (used when the player is deadlocked through no fault of theirs).
  function doShuffle(auto = false) {
    const next = reshuffle(tiles, cols);
    if (next === tiles) { showMsg("Nothing left to shuffle!", "error"); return; }
    setTiles(next);
    setSelected(null);
    if (!auto) {
      setScore(s => Math.max(0, s - 50));
      showMsg("🔀 Shuffled! (−50 pts)", "info");
    }
  }
  function shuffle() { doShuffle(false); }

  function resetGame() {
    clearInterval(timerRef.current);
    setTiles(buildTiles(seed));
    setSelected(null); setScore(0); setPairs(0); setMoves(0);
    setTimerSec(TIMER_INIT); setGameOver(false); setWon(false);
    setHintIdx([]);
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

  const quit = () => onGameEnd && onGameEnd(score, pairs, moves, won);

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
        gameName="Mahjong Solitaire" badge="🀄 MAHJONG"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={isSpectator ? null : { value: timerSec, max: TIMER_INIT }}
        opponents={opponents.map(p => ({
          ...p,
          score: oppData[p.username]?.score ?? p.score ?? 0,
        }))}
        message={msg}
        onQuit={quit}
        controls={!isSpectator ? (
          <>
            <button className="press p-white sm" onClick={hint}>💡 Hint</button>
            <button className="press p-white sm" onClick={shuffle}>🔀 Shuffle</button>
          </>
        ) : null}
      >
        <div style={{
          display: "grid",
          // Derive tile WIDTH from both budgets and take the smaller, so the
          // board can never overflow either axis. (The previous version sized
          // from height first and let width fall out of an aspect ratio, which
          // pushed the right-hand columns off-screen on wide-but-short windows.)
          "--rows": String(Math.ceil(70 / cols)),
          "--cols": String(cols),
          "--gap": "clamp(5px, 0.8vw, 10px)",
          // Horizontal budget: viewport minus felt padding minus all the gaps.
          "--fit-w": "calc((min(100vw, 1500px) - 64px - (var(--cols) - 1) * var(--gap)) / var(--cols))",
          // Vertical budget: viewport minus chrome (header + opponents bar +
          // controls + felt padding), converted to a width via the aspect ratio.
          "--fit-h": "calc(((100dvh - 260px) - (var(--rows) - 1) * var(--gap)) / var(--rows) / 1.18)",
          "--tile-w": "max(34px, min(var(--fit-w), var(--fit-h), 88px))",
          gridTemplateColumns: "repeat(var(--cols), var(--tile-w))",
          gridAutoRows: "calc(var(--tile-w) * 1.18)",
          gap: "var(--gap)",
          maxWidth: "100%",
        }}>
          {tiles.map((tile, idx) => {
            const free = !tile.matched && isFree(tiles, idx, cols);
            const isSel = selected === idx;
            const isHint = hintIdx.includes(idx);

            // Every tile is a physical object: white card stock, ink outline,
            // hard shadow. State is carried by how far it sits off the table —
            // a selected tile lifts, a blocked one sits flat and greys out.
            let bg = "#fff";
            let transform = "translateY(0)";
            let shadow = "0 5px 0 var(--ink)";
            let opacity = 1;
            let cursor = "pointer";
            let filter = "none";

            if (tile.matched) {
              bg = "var(--lime)";
              opacity = 0.5; shadow = "0 1px 0 var(--ink)"; cursor = "default";
            } else if (isSel) {
              bg = "var(--sun)";
              transform = "translateY(-8px)";
              shadow = "0 13px 0 var(--ink)";
            } else if (isHint) {
              bg = "var(--bubble)";
              transform = "translateY(-4px)";
              shadow = "0 9px 0 var(--ink)";
            } else if (!free) {
              opacity = 0.7; cursor = "not-allowed";
              filter = "grayscale(45%)";
              shadow = "0 2px 0 var(--ink)";
            }

            return (
              <div key={idx} onClick={(ev) => clickTile(idx, ev)} style={{
                position: "relative",
                width: "100%", height: "100%",
                background: bg,
                border: "3px solid var(--ink)",
                borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor, transition: "transform 0.12s, box-shadow 0.12s, opacity 0.12s",
                boxShadow: shadow,
                transform, opacity, filter,
                userSelect: "none",
              }}>
                <TileFace tile={tile} />
              </div>
            );
          })}
        </div>
      </GameFrame>

      {gameOver && !isSpectator && (
        <GameOver
          score={score} won={won} finished={won}
          extra={`Pairs: ${pairs}/${TOTAL_PAIRS}`}
          onPlayAgain={resetGame}
          onExit={quit}
        />
      )}
    </>
  );
}