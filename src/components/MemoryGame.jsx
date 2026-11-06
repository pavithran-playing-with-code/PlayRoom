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
import { buildCards, deckSeed, memLevel, memSays } from "./games/memoryDeck";

const PAIR_POINTS = 100;   // plus the seconds left on the clock
const MISS        = -5;
const CLEARED_MS  = 1100;  // a cleared deck, before the next one
const DECK_BONUS  = 300;   // for clearing a deck, x the level
const RATIO       = 1.2;   // card height / width

// The biggest cards that fit the board area: 4 wide x 5 tall on a phone,
// 5 wide x 4 tall on a laptop, whichever gives larger cards.
const SHAPES = { 16: [[4, 4]], 20: [[4, 5], [5, 4]], 24: [[4, 6], [6, 4]] };
function layout(w, h, n = 20) {
  const gap = Math.round(Math.max(6, Math.min(14, Math.min(w, h) * 0.02)));
  const room = h - 6;                       // the hard shadow under the last row
  let best = { cols: 4, cw: 0 };
  for (const [cols, rows] of SHAPES[n] || SHAPES[20]) {
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
  // pairs: this deck's; total: every deck's, which is what the server sees
  if (live.current === null) live.current = { cards: buildCards(seed, 1), open: [], pairs: 0, total: 0, deck: 1, peek: null };
  const [deck, setDeck] = useState(1);
  const [levelUp, setLevelUp] = useState(0);

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
          pairs_matched: live.current.total,
          game_state: JSON.stringify({ d: live.current.deck, matched: live.current.cards.filter((c) => c.matched).map((c) => c.id) }),
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
    const d = Number(spectatorState.d) || 1;
    if (d !== s.deck) { s.deck = d; s.cards = buildCards(deckSeed(seed, d), d); setDeck(d); }
    s.cards = s.cards.map((c) => ({ ...c, matched: matched.has(c.id), flipped: matched.has(c.id) }));
    setCards(s.cards);
  }, [coop, isSpectator, spectatorState, seed]);

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
      const pk = memLevel(cb.view.b).peek;
      const until = Date.now() + pk;
      setPeeks((p) => ({ ...p, [e.i]: until, [e.j]: until }));
      later(() => setPeeks((p) => {
        const n = { ...p };
        for (const k of [e.i, e.j]) if (n[k] <= Date.now()) delete n[k];
        return n;
      }), pk + 20);
      if (mine) say(`✗ Not a pair (-${MEM_MISS})`, "error");
    } else if (e.k === "clear") {
      const done = cb.view.done;
      setCleared({ deck: done ? done.deck : null });
      later(() => setCleared(null), CLEARED_MS);
      say(`🎉 Level ${e.b} cleared together! +${MEM_CLEAR}`, "success");
      showLevel(e.b + 1);
    }
  });

  function showLevel(n) {
    setLevelUp(n);
    later(() => setLevelUp((x) => (x === n ? 0 : x)), 2200);
  }

  // A cleared deck: a bonus, a moment to enjoy it, then the next level's deck,
  // seeded off its number so everyone who gets this far plays the same one.
  // (Clearing used to end the match on the spot, results and all, while
  // everyone else was still playing. The room's clock ends it.)
  function nextDeck() {
    const s = live.current;
    if (eng.gameOver || isSpectator) return;
    s.deck += 1;
    s.cards = buildCards(deckSeed(seed, s.deck), s.deck);
    s.open = [];
    s.pairs = 0;
    setCards(s.cards);
    setPairs(0);
    setDeck(s.deck);
    setCleared(null);
    showLevel(s.deck);
  }

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
    if (cleared) return;
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
          s.total += 1;
          eng.addScore(PAIR_POINTS + eng.timeLeft);
          if (s.pairs === s.cards.length / 2) {
            const bonus = DECK_BONUS * s.deck;
            eng.addScore(bonus);
            say(`🎉 Level ${s.deck} cleared! +${bonus}`, "success");
            setCleared({ deck: s.cards.map((c) => c.emoji) });
            later(nextDeck, CLEARED_MS);
          }
        } else {
          eng.addScore(MISS);
          s.peek = setTimeout(() => { hideMiss(); setCards(live.current.cards); }, memLevel(s.deck).peek);
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
        { label: "Team", value: v.score.toLocaleString() },
        { label: "Level", value: v.b },
        { label: "Pairs", value: `${v.pairs}/${v.deck.length / 2}` },
      ]
    : isSpectator
    ? [
        { label: "Score", value: (spectatorWatching?.score ?? 0).toLocaleString() },
        { label: "Level", value: deck },
        { label: "Pairs", value: spectatorWatching?.pairs_matched ?? 0 },
      ]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Level", value: deck },
        { label: "Pairs", value: `${pairs}/${cards.length / 2}` },
        { label: "Moves", value: eng.moves },
      ];

  return (
    <>
      <GameFrame
        gameName="Memory Match" badge="🃏 MEMORY"
        isSpectator={isSpectator} spectatorName={coop ? "the team" : spectatorWatching?.username}
        stats={coop && isSpectator ? [stats[0], stats[stats.length - 1]] : stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        // a team plays as one: its points only, not each player's
        opponents={coop ? [] : Object.values(eng.opponents)}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          const L = layout(w, h, shown.length);
          return (
            <div style={{ position: "relative" }}>
            {levelUp > 1 && (
              <div className="mj-level" key={levelUp}>
                <b>Level {levelUp}</b>
                <span>{memSays(levelUp)}</span>
              </div>
            )}
            <div className={`memgrid${cleared ? " mem-cleared" : ""}`} style={{
              gridTemplateColumns: `repeat(${L.cols}, ${L.cw}px)`,
              gridAutoRows: `${L.ch}px`,
              gap: L.gap,
            }}>
              {shown.map((card, idx) => {
                const face = card.face;
                const ring = card.by !== null ? T.colourOf(card.by) : null;
                return (
                  <button key={card.id} type="button" className={`memcard${card.peek ? " mem-peek" : ""}`}  /* not "peek": that's the home page's
                    hover preview (absolute, invisible) — a wrong pair vanished and the whole board shifted */ onClick={() => flip(idx)}
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
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (coop
        ? <GameOver eng={eng} me={currentUser} extra={plural(cb.agreed.boards, "deck") + " cleared"}
            together={{ reached: cb.agreed.boards >= GOAL.memory, goal: "clear the deck", unit: "pairs", mates: T.all(cb.agreed.by) }} />
        : <GameOver eng={eng} me={currentUser} extra={`Level ${deck} · Pairs: ${live.current.total}`} />)}
    </>
  );
}
