// src/components/games/WordRush.jsx
// Unscramble as many words as possible before time runs out. Tap the letters
// in order (or type them on a keyboard); a finished word checks itself.
// Seeded word order + seeded scramble → fair race. Highest score wins.
//
// The pile grows harder (wordRushRules.js): four letters, then five, six and
// seven. On your own a longer word, a streak and a quick solve all pay more,
// and every 8th word is ★ golden. 💡 Hint places the next right letter.
//
// Letter tiles, not a text box: on a phone a text box brings up the keyboard,
// which covers half the game and makes the page scroll.
//
// Together (a co-op room): one pile of words for the side. Each of you has
// your own word; solve it or give it up and the next one nobody has had is
// yours. Which word is whose goes through the server in one order
// (useCoopBoard, coopBoards.js: wordRules), so two people never get the same
// one. The letters you tap are your own business and never leave the phone.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import useCoopBoard from "./useCoopBoard";
import { wordRules, wordGoal, WORD_SOLVE } from "./coopBoards";
import { team, plural } from "./coopTeam";
import sfx from "./sfx";
import { buildRound, accepts, levelOf, LEVEL_NAMES, LEVEL_AT, isGolden, pointsFor, hintFor, HINT, SKIP, STREAK_MAX } from "./wordRushRules.js";

export { accepts };

const WRONG_MS = 450;   // how long a wrong word stays up before it clears
const REVEAL_MS = 1300; // long enough to read the answer you paid for
const GOOD_MS = 380;    // a solved word, green, before the next

export default function WordRush(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null, mode } = props;
  const coop = mode === "coop" && !!roomCode;
  const myId = Number(currentUser?.id);

  const round = useMemo(() => buildRound(seed), [seed]);

  // idx: which word. picked: indexes into its scrambled letters, in tap order.
  // Held in a ref so two taps in the same tick each see the other.
  const live = useRef({ idx: 0, picked: [], lock: false, streak: 0, shownAt: performance.now() });

  // Watching draws the same board the player is on: the word list is seeded,
  // so the word index and the letters picked so far are the whole board.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ idx: live.current.idx, picked: live.current.picked, streak: live.current.streak }),
    apply: (st) => {
      live.current.idx = st.idx;
      live.current.picked = st.picked || [];
      live.current.streak = st.streak || 0;
      setIdx(st.idx);
      setPicked(st.picked || []);
      setStreak(st.streak || 0);
    },
  });

  // together: whose word is whose, for the side
  const R = useMemo(() => wordRules(), []);
  const cb = useCoopBoard({ on: coop, roomCode, isSpectator, myId, rules: R.rules, init: R.init });
  const T = useMemo(() => team(players, myId), [players, myId]);
  const agreedRef = useRef(cb.agreed);
  agreedRef.current = cb.agreed;
  const seatCount = (players || []).filter((p) => !p.is_spectator).length;
  const soloState = spectate.extraState;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: coop ? () => ({ pairs_matched: agreedRef.current.solved }) : soloState });
  // the together goal; with no time limit it grows with the time played (as the server's does)
  const goal = wordGoal(durationSeconds || Math.max(60, eng.elapsed), seatCount);

  // together: the side's score is everybody's
  const { setScore } = eng;
  useEffect(() => { if (coop && !isSpectator && cb.ready) setScore(cb.agreed.score); }, [coop, isSpectator, cb.ready, cb.agreed.score, setScore]);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState([]);
  const [solved, setSolved] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState(null);   // 'good' | 'bad' | 'skip'
  const [revealed, setRevealed] = useState(null);   // the answer, while it's being shown
  const [hinted, setHinted] = useState(null);       // a slot to take back, or a tile to tap: { back } | { tile }
  const [fx, setFx] = useState({ pops: [], banner: null });
  const timers = useRef(new Set());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms); timers.current.add(t); };
  const uid = useRef(0);
  function pop(text, cls = "") {
    const id = ++uid.current;
    setFx((f) => ({ ...f, pops: [...f.pops.slice(-3), { id, text, cls }] }));
    later(() => setFx((f) => ({ ...f, pops: f.pops.filter((p) => p.id !== id) })), 900);
  }
  function banner(text, cls = "") {
    const id = ++uid.current;
    setFx((f) => ({ ...f, banner: { id, text, cls } }));
    later(() => setFx((f) => (f.banner && f.banner.id === id ? { ...f, banner: null } : f)), 1300);
  }

  // together: my word is the one the server agrees is mine — not a guess,
  // so it never changes under my fingers. Until then, ask for one.
  const mine = coop ? cb.agreed.taken[String(myId)] : undefined;
  const asked = useRef(false);
  useEffect(() => {
    if (!coop || isSpectator || !cb.ready || mine !== undefined || asked.current) return;
    asked.current = true;
    cb.send({ t: "take" });
  }, [coop, isSpectator, cb.ready, mine, cb]);
  // a new word of mine: fresh letters
  useEffect(() => {
    if (!coop || mine === undefined) return;
    const s = live.current;
    s.idx = mine;
    s.picked = [];
    s.lock = false;
    s.shownAt = performance.now();
    setIdx(mine);
    setPicked([]);
    setRevealed(null);
    setHinted(null);
  }, [coop, mine]);

  const cur = round[idx % round.length];
  const waiting = coop && mine === undefined;
  const canPlay = !eng.gameOver && !isSpectator && !waiting;

  function nextWord(delta, kind) {
    const s = live.current;
    setHinted(null);
    if (coop) {
      // the server hands out the next word; until it does, the letters wait
      cb.send({ t: kind === "good" ? "solve" : "skip", i: s.idx });
      eng.addMove();
      s.lock = true;
      setFlash(kind);
      later(() => setFlash((f) => (f === kind ? null : f)), 220);
      return;
    }
    eng.addScore(delta);
    eng.addMove();
    s.idx += 1;
    s.picked = [];
    s.lock = false;
    s.shownAt = performance.now();
    setIdx(s.idx);
    setPicked([]);
    setFlash(null);
    if (LEVEL_AT.includes(s.idx) && s.idx > 0) { sfx.chime(levelOf(s.idx)); banner(`Level ${levelOf(s.idx)} · ${LEVEL_NAMES[levelOf(s.idx) - 1]}`, "wr-banner-level"); }
    else if (isGolden(s.idx)) banner("★ Golden word ×2", "wr-banner-gold");
  }

  function pick(i, e) {
    if (e) e.preventDefault();
    if (!canPlay) return;
    const s = live.current;
    const word = round[s.idx % round.length];
    if (s.lock || s.picked.includes(i) || i >= word.scrambled.length) return;
    s.picked = [...s.picked, i];
    setPicked(s.picked);
    setHinted(null);
    sfx.tone(sfx.note(67 + s.picked.length * 2), 0.07, 0.06, "triangle");
    if (s.picked.length < word.word.length) return;

    const guess = s.picked.map((j) => word.scrambled[j]).join("");
    if (accepts(word.word, guess)) {
      setSolved((n) => n + 1);
      s.lock = true;
      setFlash("good");
      if (coop) {
        sfx.chime(2);
        pop(`+${WORD_SOLVE}`);
        later(() => nextWord(0, "good"), GOOD_MS);
        return;
      }
      const golden = isGolden(s.idx);
      const r = pointsFor(word.word, s.streak, performance.now() - s.shownAt, golden);
      s.streak += 1;
      setStreak(s.streak);
      sfx.chime(Math.min(6, 1 + Math.floor(s.streak / 3)));
      if (golden) sfx.sparkle();
      pop(`+${r.pts}${r.quick ? " quick!" : ""}`, golden ? "wr-pop-gold" : r.quick ? "wr-pop-quick" : "");
      if (s.streak > 0 && s.streak % 5 === 0) banner(`${s.streak} in a row!`, "wr-banner-streak");
      later(() => nextWord(r.pts, "good"), GOOD_MS);
    } else {
      // Show it's wrong for a moment, then hand the letters back.
      s.lock = true;
      setFlash("bad");
      sfx.thud();
      const at = s.idx;
      later(() => {
        if (s.idx !== at) return;             // skipped meanwhile
        s.picked = [];
        s.lock = false;
        setPicked([]);
        setFlash(null);
      }, WRONG_MS);
    }
  }

  // Tap a letter in the answer row to take it back.
  function unpick(k) {
    const s = live.current;
    if (!canPlay || s.lock || k < 0 || k >= s.picked.length) return;
    s.picked = s.picked.filter((_, x) => x !== k);
    setPicked(s.picked);
    setHinted(null);
    sfx.tone(330, 0.05, 0.04, "sine", 260);
  }
  const undo = () => unpick(live.current.picked.length - 1);

  // A hint: the next right letter glows (or the first wrong one you placed).
  // On your own it costs a little; tapping it is still up to you.
  function hint() {
    const s = live.current;
    if (!canPlay || s.lock) return;
    const h = hintFor(round[s.idx % round.length], s.picked);
    if (!h) return;
    setHinted(h);
    sfx.sparkle();
    if (!coop) { eng.addScore(HINT); pop(String(HINT), "wr-pop-bad"); }
    if (s.streak) { s.streak = 0; setStreak(0); }
  }

  // Giving up costs the same as it always did, but you get told the answer.
  // Skipping silently taught you nothing and just felt like a punishment.
  function giveUp() {
    const s = live.current;
    if (!canPlay || s.lock) return;
    s.lock = true;
    const at = s.idx;
    setRevealed(round[s.idx % round.length].word);
    setFlash("skip");
    sfx.whoosh();
    if (s.streak >= 5) banner("streak lost", "wr-banner-lost");
    s.streak = 0;
    setStreak(0);
    later(() => {
      if (s.idx !== at) return;              // the round moved on without us
      setRevealed(null);
      nextWord(SKIP, "skip");
    }, REVEAL_MS);
  }

  // A physical keyboard works too: a letter picks the first unused tile with
  // that letter, Backspace takes the last one back.
  useEffect(() => {
    if (!canPlay) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Backspace") { e.preventDefault(); undo(); return; }
      if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) return;
      const s = live.current;
      const word = round[s.idx % round.length];
      const ch = e.key.toLowerCase();
      const j = word.scrambled.split("").findIndex((c, x) => c === ch && !s.picked.includes(x));
      if (j >= 0) pick(j);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // the last ten seconds tick; a soft beat under it
  const playing = !isSpectator && !eng.gameOver;
  const secs = Math.ceil(eng.timeLeft);
  useEffect(() => { if (playing && !eng.unlimited && secs > 0 && secs <= 10) sfx.tick(secs <= 3); }, [secs, playing, eng.unlimited]);
  const tempo = useRef(86);
  tempo.current = 84 + levelOf(idx) * 4 + Math.min(streak, STREAK_MAX);
  useEffect(() => { if (!playing) return undefined; const b = sfx.beat(() => tempo.current, 0.35); return () => b.stop(); }, [playing]);
  const ended = useRef(false);
  useEffect(() => {
    if (!eng.gameOver || isSpectator || ended.current) return;
    ended.current = true;
    const good = coop ? cb.agreed.solved >= goal : (eng.won || eng.rank === 1);
    if (good) sfx.win(); else sfx.lose();
  }, [eng.gameOver, eng.won, eng.rank, isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = cb.view;
  // a team plays as one: its points only, not each player's
  const oppList = coop ? [] : Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = coop
    ? [{ label: "Team", value: v.score.toLocaleString() },
       { label: "Words", value: v.solved >= goal ? "✓" : `${v.solved}/${goal}` }]
    : isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }, { label: "Streak", value: streak || "—" }]
    : [{ label: "Score", value: eng.score.toLocaleString() }, { label: "Solved", value: solved }, { label: "Streak", value: streak ? `${streak}🔥` : "—" }];
  const golden = !coop && isGolden(idx);
  const level = levelOf(idx);

  return (
    <>
      <GameFrame
        gameName="Word Rush" badge="🔤 WORD RUSH"
        isSpectator={isSpectator} spectatorName={coop ? "the team" : spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        onQuit={eng.endMatch}
        sound
        controls={!isSpectator ? (
          <>
            <button className="press p-white sm" onClick={undo} disabled={!picked.length || !canPlay}>⌫ Undo</button>
            <button className="press p-white sm" onClick={hint} disabled={!canPlay || !!revealed || flash === "good"}>💡 Hint{coop ? "" : ` (${HINT})`}</button>
            <button className="press p-white sm" onClick={giveUp} disabled={!canPlay || !!revealed}>👀 Answer ({SKIP})</button>
          </>
        ) : null}
      >
        {({ w, h }) => {
          if (coop && isSpectator) return <div className="muted">👀 The team has solved {plural(v.solved, "word")} of {goal}.</div>;
          if (waiting) return <div className="muted">Getting your first word…</div>;
          const n = cur.word.length;
          const W = Math.min(w, 460);
          const gap = n > 6 ? 6 : 8;
          const tile = Math.floor(Math.max(34, Math.min(66, (W - (n - 1) * gap) / n, (h - 110) / 3)));
          const tall = Math.round(tile * 1.1);
          return (
            <div className="wr-wrap" style={{ width: W }}>
              <div className="wr-head">
                <span className={`wr-level wr-l${level}`}>{coop ? "Your word — friends have their own" : `Level ${level} · ${LEVEL_NAMES[level - 1]}`}</span>
                {golden && <span className="wr-goldtag">★ double</span>}
              </div>

              {/* the answer you're building — tap a letter to take it back */}
              <div className={`wr-row wr-answer${flash === "good" ? " good" : flash === "bad" ? " bad" : ""}${golden ? " gold" : ""}`}
                style={{ gap, marginBottom: Math.round(tile * 0.45) }}>
                {Array.from({ length: n }).map((_, k) => {
                  const j = picked[k];
                  // While the answer is on show it fills every slot, whatever
                  // the player had picked so far.
                  const letter = revealed ? revealed[k] : (j != null ? cur.scrambled[j] : "");
                  const filled = !!letter;
                  return (
                    <button key={k} type="button"
                      className={`wr-slot${filled ? " filled" : ""}${revealed ? " shown" : ""}${hinted && hinted.back === k ? " wr-hintback" : ""}`}
                      onClick={() => unpick(k)} disabled={!filled || !canPlay || !!revealed}
                      aria-label={filled ? `Remove ${letter}` : "Empty"}
                      style={{ width: tile, height: tall, fontSize: Math.round(tile * 0.5), animationDelay: flash === "good" ? `${k * 40}ms` : undefined }}>
                      {filled && <span key={`${idx}-${k}-${letter}`} className="wr-in">{letter.toUpperCase()}</span>}
                    </button>
                  );
                })}
                {fx.pops.map((p) => <span key={p.id} className={`wr-pop ${p.cls}`}>{p.text}</span>)}
              </div>

              {/* the scrambled letters */}
              <div className="wr-row" style={{ gap }}>
                {cur.scrambled.split("").map((ch, i) => (
                  <button key={`${idx}-${i}`} type="button"
                    className={`press p-sun wr-tile${hinted && hinted.tile === i ? " wr-hint" : ""}`}
                    onPointerDown={(e) => pick(i, e)} onClick={(e) => e.preventDefault()}
                    disabled={picked.includes(i) || !canPlay}
                    style={{ width: tile, height: tall, padding: 0, fontSize: Math.round(tile * 0.5), animationDelay: `${i * 35}ms` }}>
                    {ch.toUpperCase()}
                  </button>
                ))}
              </div>

              {!coop && !isSpectator && (
                <div className={`wr-meter${streak >= STREAK_MAX ? " hot" : ""}`}>
                  <span className="wr-flame">🔥 {streak}</span>
                  <span className="wr-mbar"><i style={{ width: `${Math.min(1, streak / STREAK_MAX) * 100}%` }} /></span>
                  <span className="wr-best">+{Math.min(STREAK_MAX, streak)} a word</span>
                </div>
              )}
              {fx.banner && <div key={fx.banner.id} className={`wr-banner ${fx.banner.cls}`}>{fx.banner.text}</div>}
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (coop
        ? <GameOver eng={eng} me={currentUser} extra={`Words solved: ${cb.agreed.solved}`}
            together={{ reached: cb.agreed.solved >= goal, goal: `solve ${goal} words`, unit: "words", mates: T.all(cb.agreed.by) }} />
        : <GameOver eng={eng} me={currentUser} extra={`${plural(solved, "word")} solved`} />)}
    </>
  );
}
