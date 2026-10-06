// src/components/MahjongGame.jsx
// Mahjong solitaire, the real thing: a stack of big ivory tiles in three
// layers on green felt. Match two free tiles with the same picture — free
// means nothing on top and its left or right side open — and clear the board
// before the clock stops. The board itself (where tiles sit, which are free,
// a deal that can always be cleared) is games/mahjongBoard.js.
//
// Together (a co-op room) it's one stack for the whole side: each of you
// picks a tile, lifted and ringed in your colour, and a free tile with the
// same picture as anybody's pick takes the pair. The rules are coopBoards.js
// (mahjongRules); the moves go through the server in one order
// (useCoopBoard), so every phone shows the same stack.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./games/GameFrame";
import GameOver from "./games/GameOver";
import useGameEngine from "./games/useGameEngine";
import useCoopBoard, { useShows } from "./games/useCoopBoard";
import { mahjongRules, GOAL, MJ_MATCH, MJ_MISS, MJ_HINT, MJ_SHUFFLE } from "./games/coopBoards";
import { team, plural } from "./games/coopTeam";
import { confetti } from "./ui/FunLayer";
import { SLOTS, DRAW_ORDER, TOTAL_PAIRS, BOARD_W, BOARD_H, deal, isFree, findPair, reshuffle } from "./games/mahjongBoard";

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
// 24 pictures × 2 = a 48-tile board.
// Each category owns one toy-palette colour, so same-category tiles are easy to
// scan for even before you focus on the picture itself.
//
// Every picture here has to be telling apart from every other one at about 40
// pixels on a phone, which ruled out a lot of the old set: two fish (🐟 and 🐠)
// side by side on the same blue, a whale and a dolphin that are both a blue
// blob at that size, a lion and a tiger that are both a round orange cat face,
// and a biscuit and a chocolate bar that are both a brown rectangle. One fish,
// one big sea animal, one orange cat — silhouettes that differ, not details.
const TILE_CATEGORIES = [
  { id: "animals", label: "Animals", tint: "var(--sun)",
    items: ["🐶","🐱","🐼","🦊","🐸"] },
  { id: "sea",     label: "Sea",     tint: "var(--sky)",
    items: ["🐳","🐟","🐙","🦀"] },
  { id: "food",    label: "Food",    tint: "var(--coral)",
    items: ["🍕","🍔","🍩","🍦","🍓"] },
  { id: "nature",  label: "Nature",  tint: "var(--mint)",
    items: ["🌸","🌵","🍄","🌈","🌻"] },
  { id: "fun",     label: "Fun",     tint: "var(--bubble)",
    items: ["🚀","⭐","🌙","🎈","🎁"] },
];

// Flattened catalogue: { e: emoji, k: unique key, cat }. 24 entries.
const TILE_TYPES = TILE_CATEGORIES.flatMap((c) =>
  c.items.map((e, i) => ({ e, k: `${c.id}${i}`, cat: c.id }))
);

// ── The board ────────────────────────────────────────────────────────────────
// NOTE: OBJECTIVE_PAIRS.mahjong in config/matchResult.js must match
// TOTAL_PAIRS (24), or a solo clear stops counting as a win.
const RATIO = 1.3;           // tile height / width
const MATCH = 100;           // plus the seconds left on the clock
const CLEAR_BONUS = 400;     // for clearing a whole board, x the board number
const NEXT_BOARD_MS = 1400;  // long enough to enjoy having cleared it
const MISS = -10;
const HINT_COST = -20;
const SHUFFLE_COST = -50;

const buildTiles = (seed) => deal(seed, TILE_TYPES);
const matchedIndices = (tiles) => tiles.map((t, i) => (t.matched ? i : -1)).filter((i) => i >= 0);

// The biggest tiles that fit: five across, six down, and each layer up sits a
// little up and to the left, so the stack shows its height.
function layout(w, h) {
  const pad = 10;
  const cols = BOARD_W / 2, rows = BOARD_H / 2;
  const tw = Math.max(30, Math.min(96, Math.floor(Math.min((w - pad * 2) / (cols + 0.35), (h - pad * 2) / (rows * RATIO + 0.35)))));
  const th = Math.round(tw * RATIO), d = Math.max(3, Math.round(tw * 0.09));
  const bw = cols * tw + d * 2, bh = rows * th + d * 2;
  return { tw, th, d, bw, bh, ox: Math.round((w - bw) / 2) + d * 2, oy: Math.round((h - bh) / 2) + d * 2 };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MahjongGame({
  roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 300, startedAt, serverNow,
  isSpectator = false, spectatorState = null, spectatorWatching = null, mode,
}) {
  const coop = mode === "coop" && !!roomCode;
  const myId = Number(currentUser?.id);
  // The board lives in a ref as well as state: two taps in the same tick must
  // each see the other's result (see MemoryGame.jsx for the bug this avoids).
  const live = useRef(null);
  if (live.current === null) {
    // `pairs` is this board; `total` is every board, and that is what the
    // server sees — clearing one board still counts as completing the objective.
    live.current = { tiles: buildTiles(seed), selected: null, pairs: 0, total: 0, board: 1 };
  }

  const [tiles, setTiles] = useState(() => live.current.tiles);
  const [selected, setSelected] = useState(null);
  const [pairs, setPairs] = useState(0);
  const [board, setBoard] = useState(1);
  const boardTimer = useRef(null);
  useEffect(() => () => clearTimeout(boardTimer.current), []);
  const [hintIdx, setHintIdx] = useState([]);
  const [msg, setMsg] = useState(null);
  const msgTimer = useRef(null);

  // together: one stack for the side
  const R = useMemo(() => mahjongRules(seed, TILE_TYPES), [seed]);
  const cb = useCoopBoard({ on: coop, roomCode, isSpectator, myId, rules: R.rules, init: R.init });
  const T = useMemo(() => team(players, myId), [players, myId]);
  const agreedRef = useRef(cb.agreed);
  agreedRef.current = cb.agreed;

  const eng = useGameEngine({
    roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: () => (coop
      ? { pairs_matched: agreedRef.current.boards }
      : {
          pairs_matched: live.current.total,
          game_state: JSON.stringify({ matched: matchedIndices(live.current.tiles) }),
        }),
  });

  // together: the side's score is everybody's
  const { setScore } = eng;
  useEffect(() => { if (coop && !isSpectator && cb.ready) setScore(cb.agreed.score); }, [coop, isSpectator, cb.ready, cb.agreed.score, setScore]);

  const showMsg = useCallback((text, type = "info") => {
    setMsg({ text, type });
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 2000);
  }, []);
  useEffect(() => () => clearTimeout(msgTimer.current), []);

  // Spectator: rebuild tile.matched from the watched player's state.
  useEffect(() => {
    if (coop || !isSpectator || !spectatorState) return;
    const matched = new Set((spectatorState.matched || []).map(Number));
    const s = live.current;
    s.tiles = s.tiles.map((t, i) => ({ ...t, matched: matched.has(i) }));
    setTiles(s.tiles);
  }, [coop, isSpectator, spectatorState]);

  // A fresh board, seeded off the board number so everyone in the room who
  // gets this far plays the same one.
  function nextBoard() {
    const s = live.current;
    if (eng.gameOver || isSpectator) return;
    s.board += 1;
    s.pairs = 0;
    s.tiles = buildTiles((Number(seed) || 1) + s.board * 7919);
    s.selected = null;
    setTiles(s.tiles);
    setPairs(0);
    setBoard(s.board);
    setSelected(null);
    setHintIdx([]);
    showMsg(`🀄 Board ${s.board} — go!`, "info");
  }

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
    if (coop || eng.gameOver || isSpectator || pairs >= TOTAL_PAIRS) return undefined;
    const t = setTimeout(() => {
      const s = live.current;
      if (findPair(s.tiles)) return;
      const next = reshuffle(s.tiles);
      if (next === s.tiles) { showMsg("⚠️ No moves left on the board.", "error"); return; }
      applyShuffle(next);
      showMsg("⚡ No pairs left, so the board was reshuffled", "info");
    }, 400);
    return () => clearTimeout(t);
  }, [coop, tiles, eng.gameOver, isSpectator, pairs, showMsg]);

  // ── together: the little shows ────────────────────────────────────────────
  // A cleared stack stays empty a moment, the next one dealt after it.
  const [cleared, setCleared] = useState(false);
  const lastTap = useRef(null);               // where my last tap was, for the confetti
  const v = cb.view;
  useEffect(() => { setHintIdx([]); }, [v.b]);
  useShows(cb.ready, v.ev, (e) => {
    const mine = e.u === myId;
    if (e.k === "pair") {
      if (mine) {
        const r = lastTap.current;
        confetti(r ? r.x : undefined, r ? r.y : undefined, { count: 16, emojis: [e.e, "✨"] });
        showMsg(e.with && e.with !== myId ? `✓ Match with ${T.nameOf(e.with)}'s tile! +${MJ_MATCH}` : `✓ Match! +${MJ_MATCH}`, "success");
      } else showMsg(e.with === myId ? `🎉 ${T.nameOf(e.u)} took your tile's pair!` : `🎉 ${T.nameOf(e.u)} took a pair`, "success");
      setHintIdx([]);
    } else if (e.k === "miss") {
      if (mine) showMsg(`✗ Not a match (-${MJ_MISS})`, "error");
    } else if (e.k === "stuck") {
      showMsg("⚡ No pairs left, so the stack was shuffled", "info");
      setHintIdx([]);
    } else if (e.k === "shuffle") {
      showMsg(mine ? `🔀 Shuffled (-${MJ_SHUFFLE})` : `🔀 ${T.nameOf(e.u)} shuffled the stack`, "info");
      setHintIdx([]);
    } else if (e.k === "clear") {
      setCleared(true);
      clearTimeout(boardTimer.current);
      boardTimer.current = setTimeout(() => setCleared(false), NEXT_BOARD_MS);
      confetti(undefined, undefined, { count: 60, emojis: ["🀄", "🎉", "✨"] });
      showMsg("🎉 Stack cleared together!", "success");
    }
  });

  function clickTile(idx, ev) {
    if (isSpectator || eng.gameOver) return;
    if (coop) {
      if (cleared) return;
      const t = v.tiles[idx];
      if (!t || t.matched) return;
      if (!isFree(v.tiles, idx)) { showMsg("Stuck — a free tile has nothing on top and an open side", "error"); return; }
      const r = ev?.currentTarget?.getBoundingClientRect?.();
      lastTap.current = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
      setHintIdx([]);
      cb.send({ t: "tap", b: v.b, i: idx });
      eng.addMove();
      return;
    }
    const s = live.current;
    const tile = s.tiles[idx];
    if (!tile || tile.matched) return;
    if (!isFree(s.tiles, idx)) { showMsg("Stuck — a free tile has nothing on top and an open side", "error"); return; }
    setHintIdx([]);

    if (s.selected === null || s.selected === idx) {
      s.selected = s.selected === idx ? null : idx;
    } else if (s.tiles[s.selected].k === tile.k) {
      const a = s.selected;
      const gain = MATCH + eng.timeLeft;
      s.tiles = s.tiles.map((t, i) => (i === a || i === idx ? { ...t, matched: true } : t));
      s.selected = null;
      s.pairs += 1;
      s.total += 1;
      setTiles(s.tiles);
      setPairs(s.pairs);
      eng.addMove();
      eng.addScore(gain);
      // Little pop of the matched picture, right where you tapped.
      const r = ev?.currentTarget?.getBoundingClientRect?.();
      confetti(r ? r.left + r.width / 2 : undefined, r ? r.top + r.height / 2 : undefined,
        { count: 16, emojis: [tile.e, "✨"] });
      if (s.pairs === TOTAL_PAIRS) {
        // Clearing the board used to end the match on the spot, which dropped
        // you on a results screen declaring you the winner while everyone else
        // was still playing — and froze your score there, so a genuinely
        // faster player could still be overtaken. The room's clock ends the
        // match; clearing just earns a bonus and a fresh board.
        const bonus = CLEAR_BONUS * s.board + eng.timeLeft;
        eng.addScore(bonus);
        showMsg(`🎉 Board ${s.board} cleared! +${bonus}`, "success");
        clearTimeout(boardTimer.current);
        boardTimer.current = setTimeout(nextBoard, NEXT_BOARD_MS);
      } else showMsg(`✓ Match! +${gain}`, "success");
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
    if (coop) {
      if (cleared) return;
      const pr = findPair(v.tiles);
      if (!pr) return;
      setHintIdx(pr);
      cb.send({ t: "hint", b: v.b });
      showMsg(`💡 Here's a pair (-${MJ_HINT})`, "info");
      return;
    }
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
    if (coop) {
      if (cleared) return;
      cb.send({ t: "shuf", b: v.b, r: 1 + Math.floor(Math.random() * 2e9) });
      return;
    }
    const next = reshuffle(live.current.tiles);
    if (next === live.current.tiles) { showMsg("Nothing left to shuffle!", "error"); return; }
    applyShuffle(next);
    eng.addScore(SHUFFLE_COST);
    showMsg(`🔀 Shuffled (${SHUFFLE_COST})`, "info");
  }

  // What to draw: on your own, your stack; together, the side's — every
  // pick lifted, ringed in its picker's colour (mine in yellow, as always).
  const drawTiles = coop ? (cleared ? [] : v.tiles) : tiles;
  const picks = {};
  if (coop) for (const [u, i] of Object.entries(v.sel)) if (Number(u) !== myId) picks[i] = Number(u);
  const mySel = coop ? (v.sel[String(myId)] ?? null) : selected;

  const stats = coop
    ? [
        { label: "Score", value: v.score.toLocaleString() },
        { label: "Pairs", value: `${v.pairs}/${TOTAL_PAIRS}` },
        { label: "Goal", value: v.boards >= GOAL.mahjong ? "✓" : `${v.boards}/${GOAL.mahjong}` },
      ]
    : isSpectator
    ? [
        { label: "Score", value: (spectatorWatching?.score ?? 0).toLocaleString() },
        { label: "Pairs", value: `${spectatorWatching?.pairs_matched ?? 0}/${TOTAL_PAIRS}` },
        { label: "Moves", value: spectatorWatching?.moves ?? 0 },
      ]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Pairs", value: `${pairs}/${TOTAL_PAIRS}` },
        ...(board > 1 ? [{ label: "Board", value: board }] : [{ label: "Moves", value: eng.moves }]),
      ];

  return (
    <>
      <GameFrame
        gameName="Mahjong Solitaire" badge="🀄 MAHJONG"
        isSpectator={isSpectator} spectatorName={coop ? "the team" : spectatorWatching?.username}
        stats={coop && isSpectator ? [stats[0], stats[stats.length - 1]] : stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={coop ? T.strip(v.by, (n) => plural(n, "pair")) : Object.values(eng.opponents)}
        teams={eng.teams}
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
          const lift = Math.max(4, Math.round(L.tw * 0.12));
          return (
            <div className="mj-felt" style={{ width: w, height: h }}>
              {DRAW_ORDER.map((idx) => {
                const tile = drawTiles[idx];
                if (!tile || tile.matched) return null;
                const at = SLOTS[idx];
                const free = isFree(drawTiles, idx);
                const isSel = mySel === idx, isHint = hintIdx.includes(idx);
                const mate = picks[idx] !== undefined ? T.colourOf(picks[idx]) : null;
                const up = isSel || mate ? lift : isHint ? Math.round(lift / 2) : 0;
                return (
                  <button key={idx} type="button" onClick={(ev) => clickTile(idx, ev)}
                    className={`mj-tile${isSel ? " sel" : ""}${isHint ? " hint" : ""}${free ? "" : " stuck"}`}
                    aria-label={`${tile.e}${free ? "" : " (stuck)"}`}
                    style={{
                      left: L.ox + (at.x / 2) * L.tw - at.z * L.d,
                      top: L.oy + (at.y / 2) * L.th - at.z * L.d - up,
                      width: L.tw, height: L.th, fontSize: Math.round(L.tw * 0.6),
                      borderRadius: Math.max(6, Math.round(L.tw * 0.14)),
                      boxShadow: `${L.d}px ${L.d}px 0 #c9b385, ${L.d}px ${L.d}px 0 2px var(--ink)${isSel ? ", 0 0 0 4px var(--sun)" : mate ? `, 0 0 0 4px ${mate}` : ""}`,
                    }}>
                    <span>{tile.e}</span>
                  </button>
                );
              })}
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (coop
        ? <GameOver eng={eng} me={currentUser} extra={plural(cb.agreed.boards, "stack") + " cleared"}
            together={{ reached: cb.agreed.boards >= GOAL.mahjong, goal: "clear the stack", unit: "pairs", mates: T.all(cb.agreed.by) }} />
        : <GameOver eng={eng} me={currentUser}
            extra={`Pairs matched: ${live.current.total}${board > 1 ? ` · Boards cleared: ${board - 1}` : ""}`} />)}
    </>
  );
}
