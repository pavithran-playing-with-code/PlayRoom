// src/components/games/ColorDash.jsx
// Nine colour swatches, one target colour named at the top: tap the matching
// swatch before the 1.5-second round runs out. Right taps build a streak and
// earn more; a wrong tap costs 5 and breaks the streak; too slow just breaks
// the streak. Every round reshuffles.
//
// Every room plays the same sequence of rounds; the match clock is the room's.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { seededRand, shuffleInPlace } from "./seededRand";

// Nine colours far enough apart to tell at a glance: red, orange, yellow,
// green, teal, blue, indigo, purple, pink. (An earlier set had two greens
// that were almost the same colour, which made some rounds a coin toss.)
export const PALETTE = [
  { name: "Red",    hex: "#F2413F" },
  { name: "Orange", hex: "#FF9233" },
  { name: "Yellow", hex: "#FFD12E" },
  { name: "Green",  hex: "#4CAF3F" },
  { name: "Teal",   hex: "#17BFC0" },
  { name: "Blue",   hex: "#2F7BEF" },
  { name: "Indigo", hex: "#3B32A6" },
  { name: "Purple", hex: "#BC5CEE" },
  { name: "Pink",   hex: "#FF6FB5" },
];
const ROUND_MS = 1500;
const WRONG = -5;
const pointsFor = (streak) => 15 + streak;       // streak already includes this tap

// Round i for this room: the nine colours in a fresh order, and the target.
function makeRound(seed, i) {
  const rand = seededRand((Number(seed) || 1) * 2903 + i * 7717 + 3);
  for (let k = 0; k < 4; k++) rand();
  const order = shuffleInPlace(PALETTE.map((_, idx) => idx), rand);
  return { order, target: order[Math.floor(rand() * order.length)] };
}

export default function ColorDash(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });

  const [round, setRound] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [flash, setFlash] = useState(null);      // { kind, n }
  const [msg, setMsg] = useState(null);

  const live = useRef({ round: 0, streak: 0, best: 0 });
  const uid = useRef(0);
  const timers = useRef([]);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const current = makeRound(seed, round);

  function say(text, type, kind) {
    const n = ++uid.current;
    setMsg({ text, type });
    setFlash({ kind, n });
    later(() => { if (uid.current === n) { setMsg(null); setFlash(null); } }, 700);
  }

  function nextRound(s) {
    s.round += 1;
    setRound(s.round);
    setStreak(s.streak);
    setBest(s.best);
  }

  // The round clock. Restarts with every new round; if it runs out first, the
  // streak breaks (no points lost) and a new round starts.
  useEffect(() => {
    if (eng.gameOver || isSpectator) return undefined;
    const r = round;
    const t = setTimeout(() => {
      const s = live.current;
      if (s.round !== r) return;
      s.streak = 0;
      say("Too slow!", "info", "slow");
      nextRound(s);
    }, ROUND_MS);
    return () => clearTimeout(t);
  }, [round, eng.gameOver, isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps

  function tap(slot, forRound) {
    if (eng.gameOver || isSpectator) return;
    const s = live.current;
    if (forRound !== s.round) return;             // a second tap on a round that's already over
    const r = makeRound(seed, s.round);
    eng.addMove();
    if (r.order[slot] === r.target) {
      s.streak += 1;
      s.best = Math.max(s.best, s.streak);
      const gain = pointsFor(s.streak);
      eng.addScore(gain);
      say(s.streak > 1 ? `+${gain} · ${s.streak} in a row!` : `+${gain}`, "success", "good");
    } else {
      s.streak = 0;
      eng.addScore(WRONG);
      say(`That's ${PALETTE[r.order[slot]].name} (${WRONG})`, "error", "bad");
    }
    nextRound(s);
  }

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "Streak", value: `×${streak}` },
        { label: "Best", value: `×${best}` },
      ];
  const target = PALETTE[current.target];

  return (
    <>
      <GameFrame
        gameName="Color Dash" badge="🎨 COLOR DASH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        message={msg}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          if (isSpectator) {
            return (
              <div className="muted">
                👀 Watching {spectatorWatching?.username} — {Number(specScore).toLocaleString()} pts
              </div>
            );
          }
          const top = 96;                         // target card + round timer bar
          const side = Math.floor(Math.max(180, Math.min(w, h - top, 480)));
          const gap = Math.round(side * 0.04);
          const tile = Math.floor((side - gap * 2) / 3);
          return (
            <div style={{ width: side }}>
              <div className="pop cd-target" key={`t${round}`}>
                <span>Tap:</span>
                <strong>{target.name}</strong>
                <span className="cd-swatch" style={{ background: target.hex }} />
              </div>
              <div className="cd-bar" aria-hidden="true">
                {!eng.gameOver && <span key={`b${round}`} style={{ animationDuration: `${ROUND_MS}ms` }} />}
              </div>
              <div className={`cd-grid${flash ? ` ${flash.kind}` : ""}`}
                style={{ gridTemplateColumns: `repeat(3, ${tile}px)`, gridAutoRows: `${tile}px`, gap }}>
                {current.order.map((colorIdx, slot) => (
                  <button key={`${round}-${slot}`} type="button" className="press cd-tile"
                    style={{ background: PALETTE[colorIdx].hex }}
                    aria-label={PALETTE[colorIdx].name}
                    onClick={() => tap(slot, round)} />
                ))}
              </div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Best streak ×${best}`} />
      )}
    </>
  );
}
