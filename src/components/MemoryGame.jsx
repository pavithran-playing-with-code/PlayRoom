// src/components/MemoryGame.jsx
// Flip two cards; a matching pair stays face-up. Clear all 10 pairs before the
// clock runs out. Twenty big cards, not thirty-two small ones: on a phone the
// small ones were hard to tell apart and to hit. Everyone in a room gets the same seeded deck.
//
// The board lives in a ref, not in React state. Two taps can land in the same
// tick (two fingers on a phone, or a quick double-tap), and each one has to
// see what the one before it did. The old version read rendered state there,
// so a third card could flip while two were already face-up: cards got
// stranded face-up, the pair count never reached 16, and the game never ended.
//
// Together (a co-op room) it's one deck for the whole side: each of you has
// one card up at a time, in your colour, and turning over the twin of
// anybody's card makes the pair. The rules are coopBoards.js (memoryRules);
// the moves go through the server in one order (useCoopBoard), so every
// phone shows the same deck. A cleared deck deals the next; the clock ends it.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./games/GameFrame";
import GameOver from "./games/GameOver";
import useGameEngine from "./games/useGameEngine";
import useCoopBoard, { useShows } from "./games/useCoopBoard";
import { memoryRules, GOAL, MEM_PAIR, MEM_MISS, MEM_CLEAR } from "./games/coopBoards";
import { team, plural } from "./games/coopTeam";
import { buildCards, TOTAL_PAIRS } from "./games/memoryDeck";

const PAIR_POINTS = 100;   // plus the seconds left on the clock
const MISS        = -5;
const PEEK_MS     = 800;   // how long a wrong pair stays face-up
const CLEARED_MS  = 1100;  // together: the cleared deck, before the next one
const RATIO       = 1.2;   // card height / width

// The biggest cards that fit the board area: 4 wide x 5 tall on a phone,
// 5 wide x 4 tall on a laptop, whichever gives larger cards.
function layout(w, h) {
  const gap = Math.round(Math.max(6, Math.min(14, Math.min(w, h) * 0.02)));
  const room = h - 6;                       // the hard shadow under the last row
  let best = { cols: 4, cw: 0 };
  for (const [cols, rows] of [[4, 5], [5, 4]]) {
    const cw = Math.min((w - (cols - 1) * gap) / cols, (room - (rows - 1) * gap) / rows / RATIO);
    if (cw > best.cw) best = { cols, cw };
  }
  const cw = Math.max(26, Math.min(160, Math.floor(best.cw)));
  return { cols: best.cols, gap, cw, ch: Math.floor(cw * RATIO) };
}

export default function MemoryGame({
  roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 180, startedAt, serverNow,
  isSpectator = false, spectatorState = null, spectatorWatching = null, mode,
}) {
  const coop = mode === "coop" && !!roomCode;
  const myId = Number(currentUser?.id);

  // cards: the deck. open: indexes face-up but not matched (0, 1 or 2).
  // peek: the timer that turns a wrong pair back over.
  const live = useRef(null);
  if (live.current === null) live.current = { cards: buildCards(seed), open: [], pairs: 0, peek: null };

  const [cards, setCards] = useState(() => live.current.cards);
  const [pairs, setPairs] = useState(0);

  // together: one deck for the side
  const R = useMemo(() => memoryRules(seed), [seed]);
  const cb = useCoopBoard({ on: coop, roomCode, isSpectator, myId, rules: R.rules, init: R.init });
  const T = useMemo(() => team(players, myId), [players, myId]);
  const agreedRef = useRef(cb.agreed);
  agreedRef.current = cb.agreed;

  const eng = useGameEngine({
    roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: () => (coop
      ? { pairs_matched: agreedRef.current.boards }
      : {
          pairs_matched: live.current.pairs,
          game_state: JSON.stringify({ matched: live.current.cards.filter((c) => c.matched).map((c) => c.id) }),
        }),
  });

  // together: the side's score is everybody's
  const { setScore } = eng;
  useEffect(() => { if (coop && !isSpectator && cb.ready) setScore(cb.agreed.score); }, [coop, isSpectator, cb.ready, cb.agreed.score, setScore]);

  useEffect(() => {
    const s = live.current;
    return () => clearTimeout(s.peek);
  }, []);

  // Spectator: mirror the watched player's matched set.
  useEffect(() => {
    if (coop || !isSpectator || !spectatorState) return;
    const matched = new Set((spectatorState.matched || []).map(Number));
    const s = live.current;
    s.cards = s.cards.map((c) => ({ ...c, matched: matched.has(c.id), flipped: matched.has(c.id) }));
    setCards(s.cards);
  }, [coop, isSpectator, spectatorState]);

  // ── together: the little shows ────────────────────────────────────────────
  const [msg, setMsg] = useState(null);
  const [peeks, setPeeks] = useState({});           // card → until (a wrong pair, showing)
  const [cleared, setCleared] = useState(null);     // { deck, until } the deck just cleared
  const timers = useRef([]);
  useEffect(() => { const t = timers.current; return () => t.forEach(clearTimeout); }, []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  const say = (text, type) => {
    const m = { text, type };
    setMsg(m);
    later(() => setMsg((x) => (x === m ? null : x)), 1300);
  };
  useShows(cb.ready, cb.view.ev, (e) => {
    const mine = e.u === myId;
    if (e.k === "pair") {
      if (mine) say(e.with && e.with !== myId ? `✓ Pair with ${T.nameOf(e.with)}'s card! +${MEM_PAIR}` : `✓ Pair! +${MEM_PAIR}`, "success");
      else say(e.with === myId ? `🎉 ${T.nameOf(e.u)} matched your card!` : `🎉 ${T.nameOf(e.u)} found a pair`, "success");
    } else if (e.k === "miss") {
      const until = Date.now() + PEEK_MS;
      setPeeks((p) => ({ ...p, [e.i]: until, [e.j]: until }));
      later(() => setPeeks((p) => {
        const n = { ...p };
        for (const k of [e.i, e.j]) if (n[k] <= Date.now()) delete n[k];
        return n;
      }), PEEK_MS + 20);
      if (mine) say(`✗ Not a pair (-${MEM_MISS})`, "error");
    } else if (e.k === "clear") {
      const done = cb.view.done;
      setCleared({ deck: done ? done.deck : null });
      later(() => setCleared(null), CLEARED_MS);
      say(`🎉 Deck cleared together! +${MEM_CLEAR}`, "success");
    }
  });

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
    if (coop) {
      const v = cb.view;
      if (cleared || v.matched.includes(idx) || Object.values(v.open).includes(idx)) return;
      cb.send({ t: "flip", b: v.b, i: idx });
      eng.addMove();
      return;
    }
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

  // What to draw: on your own, the deck; together, the side's deck — every
  // card face-up that is matched, somebody's (in their colour) or a wrong
  // pair still showing. Card ids stay put from deck to deck, so a new deal
  // doesn't rebuild the cards (that would replay their entry and flicker).
  const v = cb.view;
  const owner = {};
  if (coop) for (const [u, i] of Object.entries(v.open)) owner[i] = Number(u);
  const shown = !coop ? cards.map((c) => ({ ...c, face: c.flipped || c.matched, by: null }))
    : cleared && cleared.deck
      ? cleared.deck.map((emoji, id) => ({ id, emoji, matched: true, face: true, by: null }))
      : v.deck.map((emoji, id) => {
          const matched = v.matched.includes(id);
          const by = owner[id] ?? null;
          return { id, emoji, matched, face: matched || by !== null || !!peeks[id], by, peek: !!peeks[id] && !matched && by === null };
        });

  const stats = coop
    ? [
        { label: "Score", value: v.score.toLocaleString() },
        { label: "Pairs", value: `${v.pairs}/${TOTAL_PAIRS}` },
        { label: "Goal", value: v.boards >= GOAL.memory ? "✓" : `${v.boards}/${GOAL.memory}` },
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
        { label: "Moves", value: eng.moves },
      ];

  return (
    <>
      <GameFrame
        gameName="Memory Match" badge="🃏 MEMORY"
        isSpectator={isSpectator} spectatorName={coop ? "the team" : spectatorWatching?.username}
        stats={coop && isSpectator ? [stats[0], stats[stats.length - 1]] : stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={coop ? T.strip(v.by, (n) => plural(n, "pair")) : Object.values(eng.opponents)}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          const L = layout(w, h);
          return (
            <div className={`memgrid${cleared ? " mem-cleared" : ""}`} style={{
              gridTemplateColumns: `repeat(${L.cols}, ${L.cw}px)`,
              gridAutoRows: `${L.ch}px`,
              gap: L.gap,
            }}>
              {shown.map((card, idx) => {
                const face = card.face;
                const ring = card.by !== null ? T.colourOf(card.by) : null;
                return (
                  <button key={card.id} type="button" className={`memcard${card.peek ? " peek" : ""}`} onClick={() => flip(idx)}
                    aria-label={face ? card.emoji : "Face-down card"}
                    style={{
                      fontSize: Math.round(L.cw * 0.5),
                      cursor: face || isSpectator ? "default" : "pointer",
                      // matched cards go lime and settle flat; a face-up card lifts.
                      // Together, a card somebody has up wears their colour.
                      background: card.matched ? "var(--lime)" : card.peek ? "#FFE3E3" : face ? "#fff" : "var(--sun)",
                      boxShadow: card.matched ? "0 2px 0 var(--ink)"
                        : ring ? `0 5px 0 var(--ink), inset 0 0 0 5px ${ring}` : "0 5px 0 var(--ink)",
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

      {eng.gameOver && !isSpectator && (coop
        ? <GameOver eng={eng} me={currentUser} extra={plural(cb.agreed.boards, "deck") + " cleared"}
            together={{ reached: cb.agreed.boards >= GOAL.memory, goal: "clear the deck", unit: "pairs", mates: T.all(cb.agreed.by) }} />
        : <GameOver eng={eng} me={currentUser} extra={`Pairs: ${pairs}/${TOTAL_PAIRS}`} />)}
    </>
  );
}
