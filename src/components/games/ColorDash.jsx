// src/components/games/ColorDash.jsx
// Nine colour tiles and a card that says which to tap, before the bar runs
// out. The rounds (colorDashRules.js) get trickier as you go: the name with a
// swatch, then the name alone, then a colour word in another ink — tap the
// WORD or the INK, as the card says — then nine tiles of one colour with one a
// shade off. Every 10th round is a ★ fever round worth double. Right taps
// build a streak worth more; a wrong tap costs 5 and breaks it; too slow just
// breaks it. Either way the right tile is shown a moment before the next.
//
// Every room plays the same rounds; the match clock is the room's. Play state
// lives in a ref (two taps in one tick must not both count), mirrored into
// state to draw. Taps land on touch-down.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import sfx from "./sfx";
import { PALETTE, WRONG, KIND_START, makeRound, windowFor, pointsFor, tileHex } from "./colorDashRules.js";

export { PALETTE };

const REVEAL_MS = 450;               // a miss: how long the right tile is shown
const STREAK_STEP = 5;
const NOTES = [72, 74, 76, 79, 81, 84, 86, 88, 91];   // each colour sings its own note
const INTRO = { [KIND_START.nameOnly]: "No more swatch!", [KIND_START.stroop]: "Word or ink?", [KIND_START.odd]: "Odd one out!" };

export default function ColorDash(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null } = props;

  const live = useRef({ round: 0, streak: 0, best: 0, lock: false });
  const [view, setView] = useState({ round: 0, streak: 0, best: 0 });
  const show = () => { const L = live.current; setView({ round: L.round, streak: L.streak, best: L.best }); };

  // a miss: { chosen (slot or null if too slow), answer }
  const [reveal, setReveal] = useState(null);
  const [fx, setFx] = useState({ bursts: [], pops: [], banner: null, good: 0 });
  const fxId = useRef(0);
  const timers = useRef(new Set());
  const later = (fn, ms) => { const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms); timers.current.add(t); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function burst(slot, hex, text, cls) {
    const id = ++fxId.current;
    setFx((f) => ({ ...f, bursts: [...f.bursts.slice(-3), { id, slot, hex }], pops: [...f.pops.slice(-3), { id, slot, text, cls }] }));
    later(() => setFx((f) => ({ ...f, bursts: f.bursts.filter((b) => b.id !== id), pops: f.pops.filter((p) => p.id !== id) })), 800);
  }
  function banner(text, cls) {
    const id = ++fxId.current;
    setFx((f) => ({ ...f, banner: { id, text, cls } }));
    later(() => setFx((f) => (f.banner && f.banner.id === id ? { ...f, banner: null } : f)), 1100);
  }

  // Watching draws the same board the player is on: the tiles come from the
  // seed and the round number, so only the round and the streak travel.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ round: live.current.round, streak: live.current.streak, best: live.current.best }),
    apply: (st) => { Object.assign(live.current, { round: st.round || 0, streak: st.streak || 0, best: st.best ?? 0 }); show(); },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: spectate.extraState });
  const playing = !isSpectator && !eng.gameOver;

  const current = makeRound(seed, view.round);

  // on to the next round, announcing what's new about it
  function advance() {
    const L = live.current;
    L.round += 1;
    const next = makeRound(seed, L.round);
    if (INTRO[L.round]) { sfx.chime(2); banner(INTRO[L.round], "cd-banner-new"); }
    else if (next.fever) { sfx.sparkle(); banner("★ Fever ×2", "cd-banner-fever"); }
    show();
  }

  // a miss: the right tile rings a moment, taps refused, then the next round
  function miss(chosen) {
    const L = live.current, r = makeRound(seed, L.round);
    const broke = L.streak >= STREAK_STEP;
    L.streak = 0; L.lock = true;
    setReveal({ chosen, answer: r.answer });
    show();
    if (broke) banner("streak lost", "cd-banner-lost");
    later(() => { L.lock = false; setReveal(null); advance(); }, REVEAL_MS);
  }

  // The round clock: restarts with every round; run out and the streak breaks.
  useEffect(() => {
    if (!playing) return undefined;
    const r = view.round;
    const t = setTimeout(() => {
      const L = live.current;
      if (L.round !== r || L.lock) return;
      sfx.whoosh();
      burst(current.answer, null, "too slow", "cd-pop-slow");
      miss(null);
    }, windowFor(current));
    return () => clearTimeout(t);
  }, [view.round, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  function tap(slot, forRound, e) {
    if (e) e.preventDefault();
    if (!playing) return;
    const L = live.current;
    if (forRound !== L.round || L.lock) return;       // a second tap on a round that's over
    const r = makeRound(seed, L.round);
    eng.addMove();
    if (slot === r.answer) {
      L.streak += 1;
      L.best = Math.max(L.best, L.streak);
      const gain = pointsFor(r, L.streak);
      eng.addScore(gain);
      sfx.tone(sfx.note(NOTES[r.target]), 0.16, 0.1, "triangle");
      sfx.tone(sfx.note(NOTES[r.target] + 12), 0.08, 0.03, "sine", null, 0.03);
      if (r.fever) sfx.sparkle();
      burst(slot, tileHex(r, slot), `+${gain}`, r.fever ? "cd-pop-fever" : "");
      setFx((f) => ({ ...f, good: f.good + 1 }));
      const milestone = L.streak % STREAK_STEP === 0;
      if (milestone) sfx.chime(L.streak / STREAK_STEP);
      advance();
      if (milestone && !INTRO[L.round] && !makeRound(seed, L.round).fever) banner(`${L.streak} in a row!`, "cd-banner-streak");
    } else {
      eng.addScore(WRONG);
      sfx.thud();
      burst(slot, null, String(WRONG), "cd-pop-bad");
      miss(slot);
    }
  }

  // the last ten seconds tick; a beat underneath, quicker as the rounds get quicker
  const secs = Math.ceil(eng.timeLeft);
  useEffect(() => { if (playing && !eng.unlimited && secs > 0 && secs <= 10) sfx.tick(secs <= 3); }, [secs, playing, eng.unlimited]);
  const tempo = useRef(96);
  tempo.current = 92 + Math.min(view.round, 60) * 0.5 + (current.fever ? 12 : 0);
  useEffect(() => { if (!playing) return undefined; const b = sfx.beat(() => tempo.current, 0.55); return () => b.stop(); }, [playing]);
  const ended = useRef(false);
  useEffect(() => {
    if (!eng.gameOver || isSpectator || ended.current) return;
    ended.current = true;
    if (eng.won || eng.rank === 1) sfx.win(); else sfx.lose();
  }, [eng.gameOver, eng.won, eng.rank, isSpectator]);

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }, { label: "Streak", value: `${view.streak}🔥` }]
    : [{ label: "Score", value: eng.score.toLocaleString() }, { label: "Streak", value: view.streak ? `${view.streak}🔥` : "—" }];
  const toNext = view.streak % STREAK_STEP;
  const hot = view.streak >= STREAK_STEP * 2;

  // what the card says, by the kind of round
  function card() {
    const c = current;
    if (c.kind === "stroop") {
      return (<>
        <span className={`cd-rule cd-rule-${c.rule}`}>Tap the {c.rule === "word" ? "WORD" : "INK"}</span>
        <strong className="cd-word" style={{ color: PALETTE[c.ink].hex }}>{PALETTE[c.word].name.toUpperCase()}</strong>
      </>);
    }
    if (c.kind === "odd") return (<><span>Find the</span><strong>odd one out</strong></>);
    return (<>
      <span>Tap:</span>
      <strong>{PALETTE[c.target].name}</strong>
      {c.kind === "name" && <span className="cd-swatch" style={{ background: PALETTE[c.target].hex }} />}
    </>);
  }

  return (
    <>
      <GameFrame
        gameName="Color Dash" badge="🎨 COLOR DASH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        onQuit={eng.endMatch}
        sound
      >
        {({ w, h }) => {
          const top = 76 + 36, meter = 46;          // card + round bar; streak meter
          const side = Math.floor(Math.max(180, Math.min(w, h - top - meter, 480)));
          const gap = Math.round(side * 0.04);
          const tile = Math.floor((side - gap * 2 - 12) / 3);
          return (
            <div className="cd-wrap" style={{ width: side }}>
              {/* No key on the round here: keying it remounted the card every
                  round, which replayed its entry animation and made the card
                  blink out and back on every colour change. Only the words
                  inside are keyed, and they pop in from full opacity. */}
              <div className={`pop cd-target${current.fever ? " cd-fever" : ""}${fx.good % 2 ? " cd-goodA" : fx.good ? " cd-goodB" : ""}${reveal ? " cd-miss" : ""}`}>
                <span key={view.round} className={`cd-say cd-k-${current.kind}`}>{card()}</span>
                {current.fever && <span className="cd-fevertag">★ ×2</span>}
              </div>
              <div className={`cd-bar${current.fever ? " fever" : ""}`} aria-hidden="true">
                {!eng.gameOver && !reveal && <span key={`b${view.round}`} style={{ animationDuration: `${windowFor(current)}ms` }} />}
              </div>
              <div className={`cd-grid${reveal ? " bad" : ""}`}
                style={{ gridTemplateColumns: `repeat(3, ${tile}px)`, gridAutoRows: `${tile}px`, gap }}>
                {current.order.map((colorIdx, slot) => {
                  const st = reveal ? (slot === reveal.answer ? " cd-right" : slot === reveal.chosen ? " cd-no" : " cd-dim") : "";
                  const hex = tileHex(current, slot);
                  return (
                    <button key={slot} type="button" className={`press cd-tile${st}`}
                      style={{ background: hex }}
                      aria-label={current.kind === "odd" ? `tile ${slot + 1}` : PALETTE[colorIdx].name}
                      onPointerDown={(e) => tap(slot, view.round, e)} onClick={(e) => e.preventDefault()}>
                      {fx.bursts.filter((b) => b.slot === slot && b.hex).map((b) => (
                        <span key={b.id} className="cd-burst">{Array.from({ length: 10 }).map((_, i) => <i key={i} style={{ "--a": `${i * 36}deg`, background: b.hex }} />)}</span>
                      ))}
                      {fx.pops.filter((p) => p.slot === slot).map((p) => <span key={p.id} className={`cd-pop ${p.cls}`}>{p.text}</span>)}
                    </button>
                  );
                })}
              </div>
              <div className={`cd-meter${hot ? " hot" : ""}`}>
                <span className="cd-flame">🔥 {view.streak}</span>
                <span className="cd-mbar"><i style={{ width: `${hot ? 100 : (toNext / STREAK_STEP) * 100}%` }} /></span>
                <span className="cd-best">best {view.best}</span>
              </div>
              {fx.banner && <div key={fx.banner.id} className={`cd-banner ${fx.banner.cls}`}>{fx.banner.text}</div>}
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Best streak ×${view.best}`} />
      )}
    </>
  );
}
