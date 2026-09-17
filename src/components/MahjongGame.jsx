// src/components/MahjongGame.jsx
// Match pairs of free tiles (a tile is free when at least one side is open)
// and clear the board before the clock stops.
import React, { useCallback, useEffect, useRef, useState } from "react";
import GameFrame from "./games/GameFrame";
import GameOver from "./games/GameOver";
import useGameEngine from "./games/useGameEngine";
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
function TileFace({ tile, size }) {
  const style = CAT_STYLE[tile.cat] || CAT_STYLE.animals;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: "78%", aspectRatio: "1 / 1", borderRadius: "50%",
      background: style.tint,
      border: `${size < 40 ? 2 : 2.5}px solid var(--ink)`,
      fontSize: Math.max(11, Math.round(size * 0.44)), lineHeight: 1,
      userSelect: "none",
    }}>
      <span>{tile.e}</span>
    </div>
  );
}

// ── The board ────────────────────────────────────────────────────────────────
// Always 10 wide x 7 tall *in logic*, on every screen. Whether a tile is free
// depends on its neighbours, so the grid can't change with the window. The old
// board re-flowed to 7/10/14 columns by screen width: every resize moved tiles
// next to different neighbours, and a phone and a laptop in the same room were
// playing different games. A tall screen now shows the same board turned on
// its side. The free rule looks at all four sides, so turning the board
// changes nothing about which tiles are free.
const COLS = 10;
const ROWS = 7;
const TOTAL_PAIRS = 35;
const RATIO = 1.18;          // tile height / width
const MATCH = 100;           // plus the seconds left on the clock
const MISS = -10;
const HINT_COST = -20;
const SHUFFLE_COST = -50;

// Tile indexes in the order they're drawn.
const LANDSCAPE = Array.from({ length: COLS * ROWS }, (_, i) => i);
const PORTRAIT = [];
for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) PORTRAIT.push(r * COLS + c);

function seededRand(seed) {
  let s = (seed || 42) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function buildTiles(seed) {
  const rand = seededRand(seed);
  const raw = [];
  TILE_TYPES.slice(0, TOTAL_PAIRS).forEach((t) => {
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
function isFree(tiles, idx) {
  const tile = tiles[idx];
  if (!tile || tile.matched) return false;
  const r = Math.floor(idx / COLS);
  const c = idx % COLS;
  const taken = (rr, cc) =>
    rr >= 0 && cc >= 0 && rr < ROWS && cc < COLS && !tiles[rr * COLS + cc].matched;
  return !taken(r, c - 1) || !taken(r, c + 1) || !taken(r - 1, c) || !taken(r + 1, c);
}

// Two free tiles showing the same picture, or null.
function findPair(tiles) {
  const free = [];
  for (let i = 0; i < tiles.length; i++) if (isFree(tiles, i)) free.push(i);
  for (let a = 0; a < free.length; a++) {
    for (let b = a + 1; b < free.length; b++) {
      if (tiles[free[a]].k === tiles[free[b]].k) return [free[a], free[b]];
    }
  }
  return null;
}

// Redistribute EVERY remaining tile across every remaining position, and keep
// trying until the result actually has a legal move. Returns the original
// array (identity) when it can't produce a playable board.
function reshuffle(tiles, maxTries = 40) {
  const slots = [];
  for (let i = 0; i < tiles.length; i++) if (!tiles[i].matched) slots.push(i);
  if (slots.length < 2) return tiles;

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const pool = slots.map((i) => tiles[i]);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const next = [...tiles];
    slots.forEach((idx, k) => { next[idx] = pool[k]; });
    if (findPair(next)) return next;
  }
  return tiles;
}

const matchedIndices = (tiles) => tiles.map((t, i) => (t.matched ? i : -1)).filter((i) => i >= 0);

// The biggest tiles that fit the board area, lying down or standing up.
function layout(w, h) {
  const gap = Math.round(Math.max(3, Math.min(10, Math.min(w, h) * 0.012)));
  const room = h - 10;                    // a lifted tile's shadow
  const fit = (cols, rows) =>
    Math.min((w - (cols - 1) * gap) / cols, (room - (rows - 1) * gap) / rows / RATIO);
  const land = fit(COLS, ROWS);
  const port = fit(ROWS, COLS);
  const portrait = port > land;
  const tw = Math.max(22, Math.min(88, Math.floor(portrait ? port : land)));
  return { portrait, cols: portrait ? ROWS : COLS, gap, tw, th: Math.floor(tw * RATIO) };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MahjongGame({
  roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 300, startedAt, serverNow,
  isSpectator = false, spectatorState = null, spectatorWatching = null,
}) {
  // The board lives in a ref as well as state: two taps in the same tick must
  // each see the other's result (see MemoryGame.jsx for the bug this avoids).
  const live = useRef(null);
  if (live.current === null) live.current = { tiles: buildTiles(seed), selected: null, pairs: 0 };

  const [tiles, setTiles] = useState(() => live.current.tiles);
  const [selected, setSelected] = useState(null);
  const [pairs, setPairs] = useState(0);
  const [hintIdx, setHintIdx] = useState([]);
  const [msg, setMsg] = useState(null);
  const msgTimer = useRef(null);

  const eng = useGameEngine({
    roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: () => ({
      pairs_matched: live.current.pairs,
      game_state: JSON.stringify({ matched: matchedIndices(live.current.tiles) }),
    }),
  });

  const showMsg = useCallback((text, type = "info") => {
    setMsg({ text, type });
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 2000);
  }, []);
  useEffect(() => () => clearTimeout(msgTimer.current), []);

  // Spectator: rebuild tile.matched from the watched player's state.
  useEffect(() => {
    if (!isSpectator || !spectatorState) return;
    const matched = new Set((spectatorState.matched || []).map(Number));
    const s = live.current;
    s.tiles = s.tiles.map((t, i) => ({ ...t, matched: matched.has(i) }));
    setTiles(s.tiles);
  }, [isSpectator, spectatorState]);

  function applyShuffle(next) {
    const s = live.current;
    s.tiles = next;
    s.selected = null;
    setTiles(next);
    setSelected(null);
    setHintIdx([]);
  }

  // Rescue a deadlocked board. reshuffle() only ever returns a board with a
  // legal move, so one pass is enough.
  useEffect(() => {
    if (eng.gameOver || isSpectator || pairs >= TOTAL_PAIRS) return undefined;
    const t = setTimeout(() => {
      const s = live.current;
      if (findPair(s.tiles)) return;
      const next = reshuffle(s.tiles);
      if (next === s.tiles) { showMsg("⚠️ No moves left on the board.", "error"); return; }
      applyShuffle(next);
      showMsg("⚡ No pairs left, so the board was reshuffled", "info");
    }, 400);
    return () => clearTimeout(t);
  }, [tiles, eng.gameOver, isSpectator, pairs, showMsg]);

  function clickTile(idx, ev) {
    if (isSpectator || eng.gameOver) return;
    const s = live.current;
    const tile = s.tiles[idx];
    if (!tile || tile.matched) return;
    if (!isFree(s.tiles, idx)) { showMsg("Boxed in! Pick a tile with an open side", "error"); return; }
    setHintIdx([]);

    if (s.selected === null || s.selected === idx) {
      s.selected = s.selected === idx ? null : idx;
    } else if (s.tiles[s.selected].k === tile.k) {
      const a = s.selected;
      const gain = MATCH + eng.timeLeft;
      s.tiles = s.tiles.map((t, i) => (i === a || i === idx ? { ...t, matched: true } : t));
      s.selected = null;
      s.pairs += 1;
      setTiles(s.tiles);
      setPairs(s.pairs);
      eng.addMove();
      eng.addScore(gain);
      // Little pop of the matched picture, right where you tapped.
      const r = ev?.currentTarget?.getBoundingClientRect?.();
      confetti(r ? r.left + r.width / 2 : undefined, r ? r.top + r.height / 2 : undefined,
        { count: 16, emojis: [tile.e, "✨"] });
      if (s.pairs === TOTAL_PAIRS) eng.finish();
      else showMsg(`✓ Match! +${gain}`, "success");
    } else {
      s.selected = null;
      eng.addMove();
      eng.addScore(MISS);
      showMsg(`✗ Not a match (${MISS})`, "error");
    }
    setSelected(s.selected);
  }

  function hint() {
    if (isSpectator || eng.gameOver) return;
    const pair = findPair(live.current.tiles);
    if (pair) {
      setHintIdx(pair);
      eng.addScore(HINT_COST);
      showMsg(`💡 Here's a pair (${HINT_COST})`, "info");
      return;
    }
    const next = reshuffle(live.current.tiles);
    if (next === live.current.tiles) { showMsg("Nothing left to shuffle!", "error"); return; }
    applyShuffle(next);
    showMsg("⚡ No free pairs, so the board was reshuffled", "info");
  }

  function shuffle() {
    if (isSpectator || eng.gameOver) return;
    const next = reshuffle(live.current.tiles);
    if (next === live.current.tiles) { showMsg("Nothing left to shuffle!", "error"); return; }
    applyShuffle(next);
    eng.addScore(SHUFFLE_COST);
    showMsg(`🔀 Shuffled (${SHUFFLE_COST})`, "info");
  }

  const stats = isSpectator
    ? [
        { label: "Score", value: (spectatorWatching?.score ?? 0).toLocaleString() },
        { label: "Pairs", value: `${spectatorWatching?.pairs_matched ?? 0}/${TOTAL_PAIRS}` },
        { label: "Moves", value: spectatorWatching?.moves ?? 0 },
      ]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Pairs", value: `${pairs}/${TOTAL_PAIRS}` },
        { label: "Moves", value: eng.moves },
      ];

  return (
    <>
      <GameFrame
        gameName="Mahjong Solitaire" badge="🀄 MAHJONG"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={Object.values(eng.opponents)}
        message={msg}
        onQuit={eng.endMatch}
        controls={!isSpectator ? (
          <>
            <button className="press p-white sm" onClick={hint}>💡 Hint</button>
            <button className="press p-white sm" onClick={shuffle}>🔀 Shuffle</button>
          </>
        ) : null}
      >
        {({ w, h }) => {
          const L = layout(w, h);
          const order = L.portrait ? PORTRAIT : LANDSCAPE;
          const lift = Math.max(4, Math.round(L.tw * 0.12));
          return (
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${L.cols}, ${L.tw}px)`,
              gridAutoRows: `${L.th}px`,
              gap: L.gap,
              touchAction: "manipulation",
            }}>
              {order.map((idx) => {
                const tile = tiles[idx];
                const free = !tile.matched && isFree(tiles, idx);
                const isSel = selected === idx;
                const isHint = hintIdx.includes(idx);

                // Every tile is a physical object: white card stock, ink outline,
                // hard shadow. State is carried by how far it sits off the table —
                // a selected tile lifts, a blocked one sits flat and greys out.
                let bg = "#fff";
                let transform = "translateY(0)";
                let shadow = `0 ${Math.round(lift * 0.7)}px 0 var(--ink)`;
                let opacity = 1;
                let cursor = "pointer";
                let filter = "none";

                if (tile.matched) {
                  bg = "var(--lime)";
                  opacity = 0.5; shadow = "0 1px 0 var(--ink)"; cursor = "default";
                } else if (isSel) {
                  bg = "var(--sun)";
                  transform = `translateY(-${lift}px)`;
                  shadow = `0 ${lift + 4}px 0 var(--ink)`;
                } else if (isHint) {
                  bg = "var(--bubble)";
                  transform = `translateY(-${Math.round(lift / 2)}px)`;
                  shadow = `0 ${Math.round(lift / 2) + 4}px 0 var(--ink)`;
                } else if (!free) {
                  opacity = 0.7; cursor = "not-allowed";
                  filter = "grayscale(45%)";
                  shadow = "0 2px 0 var(--ink)";
                }

                return (
                  <button key={idx} type="button" onClick={(ev) => clickTile(idx, ev)}
                    aria-label={tile.matched ? "Cleared" : `${tile.e}${free ? "" : " (blocked)"}`}
                    style={{
                      position: "relative", width: "100%", height: "100%", padding: 0,
                      background: bg,
                      border: `${L.tw < 40 ? 2 : 3}px solid var(--ink)`,
                      borderRadius: Math.max(6, Math.round(L.tw * 0.18)),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor, transition: "transform 0.12s, box-shadow 0.12s, opacity 0.12s",
                      boxShadow: shadow, transform, opacity, filter,
                      userSelect: "none", WebkitTapHighlightColor: "transparent",
                    }}>
                    <TileFace tile={tile} size={L.tw} />
                  </button>
                );
              })}
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Pairs: ${pairs}/${TOTAL_PAIRS}`} />
      )}
    </>
  );
}
