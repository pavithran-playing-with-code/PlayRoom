// src/components/games/ColorDash.jsx
// Nine colour swatches, one target colour named at the top: tap the matching
// swatch before the 1.5-second round runs out. Right taps build a streak and
// earn more; a wrong tap costs 5 and breaks the streak; too slow just breaks
// the streak. Every round reshuffles.
//
// Levels: every LEVEL_HITS right taps is a level. 1: the name and a swatch.
// 2: the word alone. 3: the ink lies — the word is printed in another colour,
// and it's the word that counts. 4 and 5: the ink lies, and less time.
//
// Every room plays the same sequence of rounds; the match clock is the room's.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
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
const LEVEL_HITS = 8;
const LEVELS = [
  null,
  { ms: 1500, swatch: true, lie: false, says: "Match the colour" },
  { ms: 1500, swatch: false, lie: false, says: "Words only — read it!" },
  { ms: 1500, swatch: false, lie: true, says: "The ink lies! Tap what the word says" },
  { ms: 1250, swatch: false, lie: true, says: "Faster!" },
  { ms: 1050, swatch: false, lie: true, says: "Fastest!" },
];
const levelFor = (hits) => Math.min(LEVELS.length - 1, 1 + Math.floor(hits / LEVEL_HITS));
const WRONG = -5;
const pointsFor = (streak) => 15 + streak;       // streak already includes this tap

// Round i for this room: the nine colours in a fresh order, and the target.
function makeRound(seed, i) {
  const rand = seededRand((Number(seed) || 1) * 2903 + i * 7717 + 3);
  for (let k = 0; k < 4; k++) rand();
  const order = shuffleInPlace(PALETTE.map((_, idx) => idx), rand);
  const target = order[Math.floor(rand() * order.length)];
  // the colour the word is printed in, when the ink lies: never its own
  const ink = (target + 1 + Math.floor(rand() * (PALETTE.length - 1))) % PALETTE.length;
  return { order, target, ink };
}

export default function ColorDash(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null } = props;


  const [round, setRound] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [flash, setFlash] = useState(null);      // { kind, n }
  const [msg, setMsg] = useState(null);

  const [level, setLevel] = useState(1);
  const live = useRef({ round: 0, streak: 0, best: 0, hits: 0, level: 1 });

  // Watching draws the same board the player is on: the swatches come from the seed and the round number, so only the round and the streak travel.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ round: live.current.round, streak: live.current.streak, best: live.current.best, level: live.current.level }),
    apply: (st) => {
      live.current.level = st.level || 1;
      setLevel(st.level || 1);
      live.current.round = st.round;
      live.current.streak = st.streak;
      live.current.best = st.best ?? 0;
      setRound(st.round);
      setStreak(st.streak);
      setBest(st.best ?? 0);
    },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd ,
    extraState: spectate.extraState });

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
    }, LEVELS[live.current.level].ms);
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
      const gain = pointsFor(s.streak) + (s.level - 1) * 3;      // a harder level pays a little more
      eng.addScore(gain);
      s.hits += 1;
      const lv = levelFor(s.hits);
      if (lv !== s.level) {
        s.level = lv;
        setLevel(lv);
        say(`⭐ Level ${lv}! ${LEVELS[lv].says}`, "success", "good");
      } else say(s.streak > 1 ? `+${gain} · ${s.streak} in a row!` : `+${gain}`, "success", "good");
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
        { label: "Level", value: level },
        { label: "Streak", value: `×${streak}` },
      ];
  const target = PALETTE[current.target];
  const L = LEVELS[level] || LEVELS[1];
  const inkHex = L.lie ? PALETTE[current.ink].hex : "var(--ink)";

  return (
    <>
      <GameFrame
        gameName="Color Dash" badge="🎨 COLOR DASH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
      >
        {({ w, h }) => {
          const top = 96;                         // target card + round timer bar
          const side = Math.floor(Math.max(180, Math.min(w, h - top, 480)));
          const gap = Math.round(side * 0.04);
          const tile = Math.floor((side - gap * 2) / 3);
          return (
            <div style={{ width: side }}>
              {/* No key on the round here: keying it remounted the card every
                  round, which replayed its entry animation and made the card
                  blink out and back on every colour change. The name and the
                  swatch changing is the feedback; the card should sit still. */}
              <div className="pop cd-target">
                <span>Tap:</span>
                <strong className={L.lie ? "cd-lie" : ""} style={{ color: inkHex }}>{target.name}</strong>
                {L.swatch && <span className="cd-swatch" style={{ background: target.hex }} />}
              </div>
              <div className="cd-bar" aria-hidden="true">
                {!eng.gameOver && <span key={`b${round}`} style={{ animationDuration: `${L.ms}ms` }} />}
              </div>
              <div className={`cd-grid${flash ? ` ${flash.kind}` : ""}`}
                style={{ gridTemplateColumns: `repeat(3, ${tile}px)`, gridAutoRows: `${tile}px`, gap }}>
                {current.order.map((colorIdx, slot) => (
                  <button key={`${round}-${slot}`} type="button" className="press cd-tile cd-blob"
                    style={{ background: PALETTE[colorIdx].hex, "--d": `${(slot % 3) * 0.12 + Math.floor(slot / 3) * 0.08}s` }}
                    aria-label={PALETTE[colorIdx].name}
                    onClick={() => tap(slot, round)} />
                ))}
              </div>
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser} extra={`Level ${level} · Best streak ×${best}`} />
      )}
    </>
  );
}
