// src/components/MemoryGame.jsx
// Flip two cards; a matching pair stays face-up. Clear all 16 pairs before the
// clock runs out. Everyone in a room gets the same seeded deck.
//
// The board lives in a ref, not in React state. Two taps can land in the same
// tick (two fingers on a phone, or a quick double-tap), and each one has to
// see what the one before it did. The old version read rendered state there,
// so a third card could flip while two were already face-up: cards got
// stranded face-up, the pair count never reached 16, and the game never ended.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./games/GameFrame";
import GameOver from "./games/GameOver";
import useGameEngine from "./games/useGameEngine";

const EMOJIS      = ["🎮","🀄","🃏","🧩","🎯","🎲","🏆","⚡","🔥","🌟","🐉","🦊","🎪","🎨","🎵","🎸"];
const TOTAL_PAIRS = EMOJIS.length;
const PAIR_POINTS = 100;   // plus the seconds left on the clock
const MISS        = -5;
const PEEK_MS     = 800;   // how long a wrong pair stays face-up
const RATIO       = 1.2;   // card height / width

function seededRand(seed) {
  let s = (seed || 99) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function buildCards(seed) {
  const rand = seededRand(seed);
  const deck = [...EMOJIS, ...EMOJIS].map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// The biggest cards that fit the board area: 4 wide x 8 tall on a phone,
// 8 wide x 4 tall on a laptop, whichever gives larger cards.
function layout(w, h) {
  const gap = Math.round(Math.max(6, Math.min(14, Math.min(w, h) * 0.02)));
  const room = h - 6;                       // the hard shadow under the last row
  let best = { cols: 4, cw: 0 };
  for (const [cols, rows] of [[4, 8], [8, 4]]) {
    const cw = Math.min((w - (cols - 1) * gap) / cols, (room - (rows - 1) * gap) / rows / RATIO);
    if (cw > best.cw) best = { cols, cw };
  }
  const cw = Math.max(26, Math.min(112, Math.floor(best.cw)));
  return { cols: best.cols, gap, cw, ch: Math.floor(cw * RATIO) };
}

export default function MemoryGame({
  roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 180, startedAt, serverNow,
  isSpectator = false, spectatorState = null, spectatorWatching = null,
}) {
  // cards: the deck. open: indexes face-up but not matched (0, 1 or 2).
  // peek: the timer that turns a wrong pair back over.
  const live = useRef(null);
  if (live.current === null) live.current = { cards: buildCards(seed), open: [], pairs: 0, peek: null };

  const [cards, setCards] = useState(() => live.current.cards);
  const [pairs, setPairs] = useState(0);

  const eng = useGameEngine({
    roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: () => ({
      pairs_matched: live.current.pairs,
      game_state: JSON.stringify({ matched: live.current.cards.filter((c) => c.matched).map((c) => c.id) }),
    }),
  });

  useEffect(() => {
    const s = live.current;
    return () => clearTimeout(s.peek);
  }, []);

  // Spectator: mirror the watched player's matched set.
  useEffect(() => {
    if (!isSpectator || !spectatorState) return;
    const matched = new Set((spectatorState.matched || []).map(Number));
    const s = live.current;
    s.cards = s.cards.map((c) => ({ ...c, matched: matched.has(c.id), flipped: matched.has(c.id) }));
    setCards(s.cards);
  }, [isSpectator, spectatorState]);

  // Turn a wrong pair back face-down.
  function hideMiss() {
    const s = live.current;
    clearTimeout(s.peek);
    s.peek = null;
    if (s.open.length !== 2) return;
    const [a, b] = s.open;
    s.cards = s.cards.map((c, i) => ((i === a || i === b) && !c.matched ? { ...c, flipped: false } : c));
    s.open = [];
  }

  function flip(idx) {
    if (isSpectator || eng.gameOver) return;
    const s = live.current;
    // Tapping on while a wrong pair is showing skips the wait instead of being ignored.
    if (s.open.length === 2) hideMiss();

    const card = s.cards[idx];
    if (card && !card.flipped && !card.matched) {
      s.cards = s.cards.map((c, i) => (i === idx ? { ...c, flipped: true } : c));
      s.open = [...s.open, idx];

      if (s.open.length === 2) {
        const [a, b] = s.open;
        eng.addMove();
        if (s.cards[a].emoji === s.cards[b].emoji) {
          s.cards = s.cards.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c));
          s.open = [];
          s.pairs += 1;
          setPairs(s.pairs);
          eng.addScore(PAIR_POINTS + eng.timeLeft);
          if (s.pairs === TOTAL_PAIRS) eng.finish();
        } else {
          eng.addScore(MISS);
          s.peek = setTimeout(() => { hideMiss(); setCards(live.current.cards); }, PEEK_MS);
        }
      }
    }
    setCards(s.cards);
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
        gameName="Memory Match" badge="🃏 MEMORY"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={Object.values(eng.opponents)}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          const L = layout(w, h);
          return (
            <div className="memgrid" style={{
              gridTemplateColumns: `repeat(${L.cols}, ${L.cw}px)`,
              gridAutoRows: `${L.ch}px`,
              gap: L.gap,
            }}>
              {cards.map((card, idx) => {
                const face = card.flipped || card.matched;
                return (
                  <button key={card.id} type="button" className="memcard" onClick={() => flip(idx)}
                    aria-label={face ? card.emoji : "Face-down card"}
                    style={{
                      fontSize: Math.round(L.cw * 0.5),
                      cursor: face || isSpectator ? "default" : "pointer",
                      // matched cards go lime and settle flat; a face-up card lifts.
                      background: card.matched ? "var(--lime)" : face ? "#fff" : "var(--sun)",
                      boxShadow: card.matched ? "0 2px 0 var(--ink)" : "0 5px 0 var(--ink)",
                      transform: face ? "translateY(-2px)" : "translateY(0)",
                    }}>
                    {face ? card.emoji : "🎴"}
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
