// src/components/MemoryGame.jsx
// Flip two cards; a matching pair stays face-up. Twenty big cards, not
// thirty-two small ones: on a phone the small ones were hard to tell apart
// and to hit. Everyone in a room gets the same seeded decks.
//
// On your own (memorySolo.js): pairs in a row build a combo worth more, the ★
// golden pair pays double, and a cleared deck pays a bonus and deals the next
// — new pictures, twelve pairs from deck 3. The room's clock ends the match,
// not the deck: a player who cleared early used to see a results screen
// calling them the winner while everyone else was still playing.
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
import { TOTAL_PAIRS } from "./games/memoryDeck";
import { newDeck, flip as flipCard } from "./games/memorySolo";
import sfx from "./games/sfx";

const PEEK_MS     = 800;   // how long a wrong pair stays face-up
const CLEARED_MS  = 1100;  // the deck just cleared, before the next one
const RATIO       = 1.2;   // card height / width

// The biggest cards that fit the board area: 4 wide on a phone, wider on a
// laptop, whichever gives larger cards. Twenty cards or twenty-four.
function layout(w, h, n) {
  const gap = Math.round(Math.max(6, Math.min(14, Math.min(w, h) * 0.02)));
  const room = h - 6;                       // the hard shadow under the last row
  const shapes = n > 20 ? [[4, 6], [6, 4]] : [[4, 5], [5, 4]];
  let best = { cols: 4, cw: 0 };
  for (const [cols, rows] of shapes) {
    const cw = Math.min((w - (cols - 1) * gap) / cols, (room - (rows - 1) * gap) / rows / RATIO);
    if (cw > best.cw) best = { cols, cw };
  }
  const cw = Math.max(26, Math.min(160, Math.floor(best.cw)));
  return { cols: best.cols, gap, cw, ch: Math.floor(cw * RATIO) };
}

const flipSound = () => { sfx.noise(0.05, 0.07, 2800, "bandpass", 0, 1600, 1.2); sfx.tone(520, 0.05, 0.03, "triangle", 700); };

export default function MemoryGame({
  roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 180, startedAt, serverNow,
  isSpectator = false, spectatorState = null, spectatorWatching = null, mode,
}) {
  const coop = mode === "coop" && !!roomCode;
  const myId = Number(currentUser?.id);

  // on your own: the deck (memorySolo's state) and the timer that turns a wrong pair back over
  const live = useRef(null);
  if (live.current === null) live.current = { ...newDeck(seed, 1), peek: null };
  const snap = () => { const s = live.current; return { d: s.d, cards: s.cards, golden: s.golden, matched: [...s.matched], open: [...s.open], pairs: s.pairs, size: s.size, total: s.total, combo: s.combo, best: s.best }; };
  const [solo, setSolo] = useState(snap);
  const [wrong, setWrong] = useState(null);           // the wrong pair showing: [a, b]

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
          game_state: JSON.stringify({ d: live.current.d, matched: live.current.matched.flatMap((m, i) => (m ? [i] : [])) }),
        }),
  });
  const playing = !isSpectator && !eng.gameOver;

  // together: the side's score is everybody's
  const { setScore } = eng;
  useEffect(() => { if (coop && !isSpectator && cb.ready) setScore(cb.agreed.score); }, [coop, isSpectator, cb.ready, cb.agreed.score, setScore]);

  useEffect(() => {
    const s = live.current;
    return () => clearTimeout(s.peek);
  }, []);

  // Spectator: the watched player's deck and what's matched on it.
  useEffect(() => {
    if (coop || !isSpectator || !spectatorState) return;
    const d = Number(spectatorState.d) || 1;
    const s = live.current;
    if (s.d !== d) Object.assign(s, newDeck(seed, d));
    const m = new Set((spectatorState.matched || []).map(Number));
    s.matched = s.cards.map((_, i) => m.has(i));
    s.open = [];
    setSolo(snap());
  }, [coop, isSpectator, spectatorState, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the little shows ──────────────────────────────────────────────────────
  const [msg, setMsg] = useState(null);
  const [fx, setFx] = useState({ pops: [], banner: null });
  const fxId = useRef(0);
  const [peeks, setPeeks] = useState({});           // together: card → until (a wrong pair, showing)
  const [cleared, setCleared] = useState(null);     // { deck } the deck just cleared
  const timers = useRef(new Set());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms); timers.current.add(t); };
  const say = (text, type) => {
    const m = { text, type };
    setMsg(m);
    later(() => setMsg((x) => (x === m ? null : x)), 1300);
  };
  function pop(i, text, cls = "") {
    const id = ++fxId.current;
    setFx((f) => ({ ...f, pops: [...f.pops.slice(-3), { id, i, text, cls }] }));
    later(() => setFx((f) => ({ ...f, pops: f.pops.filter((p) => p.id !== id) })), 900);
  }
  function banner(text, cls = "") {
    const id = ++fxId.current;
    setFx((f) => ({ ...f, banner: { id, text, cls } }));
    later(() => setFx((f) => (f.banner && f.banner.id === id ? { ...f, banner: null } : f)), 1300);
  }

  useShows(cb.ready, cb.view.ev, (e) => {
    const mine = e.u === myId;
    if (e.k === "pair") {
      sfx.chime(2); if (e.gold) sfx.sparkle();
      pop(e.i, `+${e.gold ? MEM_PAIR * 2 : MEM_PAIR}`, e.gold ? "mm-pop-gold" : "");
      if (mine) say(e.with && e.with !== myId ? `✓ Pair with ${T.nameOf(e.with)}'s card!` : "✓ Pair!", "success");
      else say(e.with === myId ? `🎉 ${T.nameOf(e.u)} matched your card!` : `🎉 ${T.nameOf(e.u)} found a pair`, "success");
    } else if (e.k === "miss") {
      const until = Date.now() + PEEK_MS;
      setPeeks((p) => ({ ...p, [e.i]: until, [e.j]: until }));
      later(() => setPeeks((p) => {
        const n = { ...p };
        for (const k of [e.i, e.j]) if (n[k] <= Date.now()) delete n[k];
        return n;
      }), PEEK_MS + 20);
      if (mine) { sfx.thud(); pop(e.i, `-${MEM_MISS}`, "mm-pop-bad"); }
    } else if (e.k === "clear") {
      const done = cb.view.done;
      setCleared({ deck: done ? done.deck : null });
      later(() => setCleared(null), CLEARED_MS);
      sfx.sparkle(); sfx.chime(5);
      banner(`Deck cleared! +${MEM_CLEAR}`, "mm-banner-clear");
    }
  });

  function flip(idx, e) {
    if (e) e.preventDefault();
    if (!playing || cleared) return;
    if (coop) {
      const v = cb.view;
      if (v.matched.includes(idx) || Object.values(v.open).includes(idx)) return;
      flipSound();
      cb.send({ t: "flip", b: v.b, i: idx });
      eng.addMove();
      return;
    }
    const s = live.current;
    const before = s.cards;
    const r = flipCard(seed, s, idx);
    if (!r) return;
    clearTimeout(s.peek);
    setWrong(null);
    if (r.k === "open") flipSound();
    else {
      eng.addMove();
      eng.addScore(r.points);
      if (r.k === "miss") {
        flipSound(); sfx.thud();
        pop(r.b, String(r.points), "mm-pop-bad");
        if (r.broke >= 3) banner("combo lost", "mm-banner-lost");
        setWrong([r.a, r.b]);
        // the wrong pair shows a moment, then goes back down (a tap skips the wait)
        s.peek = setTimeout(() => { if (s.open.length === 2) s.open = []; setWrong(null); setSolo(snap()); }, PEEK_MS);
      } else {
        sfx.blip(1 + Math.min(r.combo, 8) * 0.07);
        if (r.golden) sfx.sparkle();
        pop(r.b, `+${r.points}${r.lucky ? " lucky!" : ""}`, r.golden ? "mm-pop-gold" : r.lucky ? "mm-pop-lucky" : "");
        if (r.clear) {
          sfx.chime(5);
          setCleared({ deck: before });
          later(() => setCleared(null), CLEARED_MS);
          banner(`Deck ${r.next}${r.next === 3 ? " · 12 pairs" : " · new pictures"}`, "mm-banner-clear");
        } else if (r.golden) banner("★ Golden pair ×2", "mm-banner-gold");
        else if (r.combo >= 3) { sfx.chime(Math.min(6, r.combo - 1)); banner(`${r.combo} in a row!`, "mm-banner-combo"); }
      }
    }
    setSolo(snap());
  }

  // the last ten seconds tick; a soft beat under it, a little quicker each deck
  const secs = Math.ceil(eng.timeLeft);
  useEffect(() => { if (playing && !eng.unlimited && secs > 0 && secs <= 10) sfx.tick(secs <= 3); }, [secs, playing, eng.unlimited]);
  const tempo = useRef(80);
  tempo.current = 80 + Math.min(6, (coop ? cb.view.b : solo.d) - 1) * 5;
  useEffect(() => { if (!playing) return undefined; const b = sfx.beat(() => tempo.current, 0.35); return () => b.stop(); }, [playing]);
  const ended = useRef(false);
  const alone = !coop && Object.keys(eng.opponents).length === 0;
  useEffect(() => {
    if (!eng.gameOver || isSpectator || ended.current) return;
    ended.current = true;
    const good = coop ? cb.agreed.boards >= GOAL.memory : alone ? live.current.total >= TOTAL_PAIRS : (eng.won || eng.rank === 1);
    if (good) sfx.win(); else sfx.lose();
  }, [eng.gameOver, eng.won, eng.rank, isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps

  // What to draw: on your own, the deck; together, the side's deck — every
  // card face-up that is matched, somebody's (in their colour) or a wrong
  // pair still showing. Cards are keyed by place, so a new deal doesn't
  // rebuild them (that would replay their entry and flicker) — they flip.
  const v = cb.view;
  const owner = {};
  if (coop) for (const [u, i] of Object.entries(v.open)) owner[i] = Number(u);
  const gold = coop ? v.gold : solo.golden;
  const shown = cleared && cleared.deck
    ? cleared.deck.map((emoji) => ({ emoji, matched: true, face: true, by: null }))
    : !coop
      ? solo.cards.map((emoji, i) => {
          const up = solo.open.includes(i);
          return { emoji, matched: solo.matched[i], face: solo.matched[i] || up, by: null, peek: !!wrong && wrong.includes(i) && up };
        })
      : v.deck.map((emoji, id) => {
          const matched = v.matched.includes(id);
          const by = owner[id] ?? null;
          return { emoji, matched, face: matched || by !== null || !!peeks[id], by, peek: !!peeks[id] && !matched && by === null };
        });

  const stats = coop
    ? [
        { label: "Team", value: v.score.toLocaleString() },
        { label: "Pairs", value: `${v.pairs}/${v.deck.length / 2}` },
        { label: "Goal", value: v.boards >= GOAL.memory ? "✓" : `${v.boards}/${GOAL.memory}` },
      ]
    : isSpectator
    ? [
        { label: "Score", value: (spectatorWatching?.score ?? 0).toLocaleString() },
        { label: "Pairs", value: `${solo.pairs}/${solo.size}` },
        { label: "Deck", value: solo.d },
      ]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Pairs", value: `${solo.pairs}/${solo.size}` },
        { label: "Combo", value: solo.combo ? `${solo.combo}🔥` : "—" },
      ];

  // On your own, clearing a deck counts as clearing the board, though the match played on.
  const shownEng = alone && solo.total >= TOTAL_PAIRS ? { ...eng, finished: true, won: true } : eng;

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
        sound
      >
        {({ w, h }) => {
          const L = layout(w, h, shown.length);
          return (
            <div className="mm-wrap">
              <div className={`memgrid${cleared ? " mem-cleared" : ""}`} style={{
                gridTemplateColumns: `repeat(${L.cols}, ${L.cw}px)`,
                gridAutoRows: `${L.ch}px`,
                gap: L.gap,
              }}>
                {shown.map((card, idx) => {
                  const face = card.face;
                  const ring = card.by !== null ? T.colourOf(card.by) : null;
                  const isGold = face && !cleared && gold && card.emoji === gold;    // not on the deck just cleared: gold is the next deck's
                  return (
                    <button key={idx} type="button"
                      /* not "peek": that's the home page's hover preview (absolute,
                         invisible) — a wrong pair vanished and the whole board shifted */
                      className={`memcard${face ? " up" : ""}${card.matched ? " got" : ""}${card.peek ? " mem-peek" : ""}${isGold ? " gold" : ""}`}
                      onPointerDown={(e) => flip(idx, e)} onClick={(e) => e.preventDefault()}
                      aria-label={face ? card.emoji : "Face-down card"}
                      style={{ fontSize: Math.round(L.cw * 0.5), cursor: face || isSpectator ? "default" : "pointer" }}>
                      <span className="mm-in">
                        <span className="mm-face mm-back" />
                        <span className="mm-face mm-front" style={ring ? { boxShadow: `0 5px 0 var(--ink), inset 0 0 0 5px ${ring}` } : undefined}>
                          {card.emoji}
                          {isGold && <i className="mm-star">★</i>}
                        </span>
                      </span>
                      {fx.pops.filter((p) => p.i === idx).map((p) => <span key={p.id} className={`mm-pop ${p.cls}`}>{p.text}</span>)}
                    </button>
                  );
                })}
              </div>
              {fx.banner && <div key={fx.banner.id} className={`mm-banner ${fx.banner.cls}`}>{fx.banner.text}</div>}
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (coop
        ? <GameOver eng={eng} me={currentUser} extra={plural(cb.agreed.boards, "deck") + " cleared"}
            together={{ reached: cb.agreed.boards >= GOAL.memory, goal: "clear the deck", unit: "pairs", mates: T.all(cb.agreed.by) }} />
        : <GameOver eng={shownEng} me={currentUser} extra={`${plural(solo.total, "pair")} · ${plural(solo.d - 1, "deck")} cleared · best combo ${solo.best}`} />)}
    </>
  );
}
