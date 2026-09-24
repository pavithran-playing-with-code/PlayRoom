// src/components/games/WordRush.jsx
// Unscramble as many words as possible before time runs out. Tap the letters
// in order (or type them on a keyboard); a finished word checks itself.
// Seeded word order + seeded scramble → fair race. Highest score wins.
//
// Letter tiles, not a text box: on a phone a text box brings up the keyboard,
// which covers half the game and makes the page scroll.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { seededRand, shuffleInPlace } from "./seededRand";

const WORDS = [
  "apple","river","stone","cloud","tiger","plant","music","dance","light","ocean",
  "happy","green","sugar","table","chair","bread","dream","smile","earth","glass",
  "honey","jolly","lemon","mango","night","piano","queen","robot","snake","train",
  "voice","water","zebra","brave","charm","dwarf","eagle","flame","grape","heart",
  "ivory","koala","maple","noble","olive","pearl","quilt","raven","shore","trust",
];
const CORRECT = 16;
const SKIP = -4;
const WRONG_MS = 450;   // how long a wrong word stays up before it clears
const REVEAL_MS = 1300; // long enough to read the answer you paid for

function buildRound(seed) {
  const rand = seededRand(seed);
  const order = shuffleInPlace([...WORDS], rand);
  return order.map((w) => {
    let scrambled = shuffleInPlace(w.split(""), rand).join("");
    if (scrambled === w) scrambled = w.split("").reverse().join(""); // never show the answer
    return { word: w, scrambled };
  });
}

export default function WordRush(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const round = useMemo(() => buildRound(seed), [seed]);

  // idx: which word. picked: indexes into its scrambled letters, in tap order.
  // Held in a ref so two taps in the same tick each see the other.
  const live = useRef({ idx: 0, picked: [], lock: false });
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState([]);
  const [solved, setSolved] = useState(0);
  const [flash, setFlash] = useState(null);   // 'good' | 'bad' | 'skip'
  const [revealed, setRevealed] = useState(null);   // the answer, while it's being shown
  const timers = useRef([]);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const cur = round[idx % round.length];
  const canPlay = !eng.gameOver && !isSpectator;

  function nextWord(delta, kind) {
    const s = live.current;
    eng.addScore(delta);
    eng.addMove();
    s.idx += 1;
    s.picked = [];
    s.lock = false;
    setIdx(s.idx);
    setPicked([]);
    setFlash(kind);
    later(() => setFlash((f) => (f === kind ? null : f)), 220);
  }

  function pick(i) {
    if (!canPlay) return;
    const s = live.current;
    const word = round[s.idx % round.length];
    if (s.lock || s.picked.includes(i) || i >= word.scrambled.length) return;
    s.picked = [...s.picked, i];
    setPicked(s.picked);
    if (s.picked.length < word.word.length) return;

    const guess = s.picked.map((j) => word.scrambled[j]).join("");
    if (guess === word.word) {
      setSolved((n) => n + 1);
      nextWord(CORRECT, "good");
    } else {
      // Show it's wrong for a moment, then hand the letters back.
      s.lock = true;
      setFlash("bad");
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
  }
  const undo = () => unpick(live.current.picked.length - 1);

  // Giving up costs the same as it always did, but you get told the answer.
  // Skipping silently taught you nothing and just felt like a punishment.
  function giveUp() {
    const s = live.current;
    if (!canPlay || s.lock) return;
    s.lock = true;
    const at = s.idx;
    setRevealed(round[s.idx % round.length].word);
    setFlash("skip");
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

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [{ label: "Score", value: eng.score.toLocaleString() }, { label: "Solved", value: solved }];

  const slotFill = revealed ? "var(--sky, #BDE3FF)"
    : flash === "good" ? "var(--lime)"
    : flash === "bad" ? "var(--coral)" : "#fff";

  return (
    <>
      <GameFrame
        gameName="Word Rush" badge="🔤 WORD RUSH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        onQuit={eng.endMatch}
        controls={!isSpectator ? (
          <>
            <button className="press p-white sm" onClick={undo} disabled={!picked.length || !canPlay}>⌫ Undo</button>
            <button className="press p-white sm" onClick={giveUp} disabled={!canPlay || !!revealed}>💡 Show answer ({SKIP})</button>
          </>
        ) : null}
      >
        {({ w, h }) => {
          if (isSpectator) {
            return (
              <div className="muted">
                👀 Watching {spectatorWatching?.username} — {Number(specScore).toLocaleString()} pts
              </div>
            );
          }
          const n = cur.word.length;
          const W = Math.min(w, 460);
          const gap = 8;
          const tile = Math.floor(Math.max(34, Math.min(66, (W - (n - 1) * gap) / n, (h - 70) / 3)));
          const tall = Math.round(tile * 1.1);
          return (
            <div style={{ width: W, textAlign: "center" }}>
              <div className="muted eyebrow" style={{ textAlign: "center" }}>Tap the letters in order</div>

              {/* the answer you're building — tap a letter to take it back */}
              <div className="wr-row" style={{ gap, marginBottom: Math.round(tile * 0.45) }}>
                {Array.from({ length: n }).map((_, k) => {
                  const j = picked[k];
                  // While the answer is on show it fills every slot, whatever
                  // the player had picked so far.
                  const letter = revealed ? revealed[k] : (j != null ? cur.scrambled[j] : "");
                  const filled = !!letter;
                  return (
                    <button key={k} type="button" className={`wr-slot${filled ? " filled" : ""}`}
                      onClick={() => unpick(k)} disabled={!filled || !canPlay || !!revealed}
                      aria-label={filled ? `Remove ${letter}` : "Empty"}
                      style={{ width: tile, height: tall, fontSize: Math.round(tile * 0.5),
                        background: filled || flash === "good" ? slotFill : "transparent" }}>
                      {filled ? letter.toUpperCase() : ""}
                    </button>
                  );
                })}
              </div>

              {/* the scrambled letters */}
              <div className="wr-row" style={{ gap }}>
                {cur.scrambled.split("").map((ch, i) => (
                  <button key={`${idx}-${i}`} type="button" className="press p-sun wr-tile"
                    onClick={() => pick(i)} disabled={picked.includes(i) || !canPlay}
                    style={{ width: tile, height: tall, padding: 0, fontSize: Math.round(tile * 0.5) }}>
                    {ch.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && <GameOver eng={eng} me={currentUser} />}
    </>
  );
}
