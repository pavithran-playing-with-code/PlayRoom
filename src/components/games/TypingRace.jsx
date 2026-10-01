// src/components/games/TypingRace.jsx
// Typing Race. A stream of words, the same for everyone in the room; type
// each one and press space. Right scores by its length plus your streak,
// wrong scores nothing and breaks the streak. Most points when the clock
// stops wins. The words live in typingBoard.js.
//
// On a phone this is the one game that wants the keyboard: a real text box
// sits over the words, so a tap anywhere on them brings the keyboard up, and
// the game asks for focus the moment it starts. Phones that only open the
// keyboard for a tap (iPhone, some Androids) get a big "tap to type" prompt.
// The words sit at the top of the board, where the keyboard can't cover them.
import React, { useCallback, useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import { wordStream, pointsFor, check, clean, wpm, accuracy } from "./typingBoard";

const PER_LINE = 6;          // words shown per line
const LINES = 3;             // lines on screen: where you are, and what's next
const KEEP = 40;             // results remembered behind you (for drawing, and spectators)

export default function TypingRace(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null, spectatorState = null } = props;

  const [words] = useState(() => wordStream(seed));
  // Typing acts on the ref: two keystrokes in one tick must each see the other.
  const live = useRef({ i: 0, typed: "", streak: 0, right: 0, wrong: 0, chars: 0, res: {} });
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);
  const [focused, setFocused] = useState(false);
  const [flash, setFlash] = useState(null);        // { ok, pts, n } after each word
  const inputRef = useRef(null);
  const uid = useRef(0);

  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => {
      const s = live.current;
      return { i: s.i, typed: s.typed, streak: s.streak, right: s.right, wrong: s.wrong, chars: s.chars, res: s.res };
    },
    apply: (st) => { Object.assign(live.current, st, { res: st.res || {} }); refresh(); },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: spectate.extraState });

  // Ask for the keyboard as the match starts, and whenever the player taps
  // the board. preventScroll: a phone otherwise scrolls the page to the box.
  const focusBox = useCallback(() => {
    if (isSpectator || eng.gameOver) return;
    try { inputRef.current?.focus({ preventScroll: true }); } catch { inputRef.current?.focus(); }
  }, [isSpectator, eng.gameOver]);
  useEffect(() => {
    const t = setTimeout(focusBox, 60);
    return () => clearTimeout(t);
  }, [focusBox]);
  // When the clock stops, put the keyboard away so the results are in view.
  useEffect(() => { if (eng.gameOver) inputRef.current?.blur(); }, [eng.gameOver]);

  function commit(raw) {
    const s = live.current;
    const typed = clean(raw);
    if (!typed) return;                           // a double space is not a word
    const word = words[s.i];
    const right = typed === word;
    const n = ++uid.current;
    if (right) {
      const pts = pointsFor(word, s.streak);
      s.streak += 1;
      s.right += 1;
      s.chars += word.length + 1;                 // the space counts, as in any WPM test
      eng.addScore(pts);
      setFlash({ ok: true, pts, n });
    } else {
      s.streak = 0;
      s.wrong += 1;
      setFlash({ ok: false, pts: 0, n });
    }
    s.res[s.i] = right;
    for (const k of Object.keys(s.res)) if (Number(k) < s.i - KEEP) delete s.res[k];
    s.i += 1;
    eng.addMove();
  }

  function onChange(e) {
    if (isSpectator || eng.gameOver) return;
    const s = live.current;
    let v = e.target.value;
    // A space (or several words pasted / typed fast) finishes words one by one.
    let cut = v.search(/\s/);
    while (cut !== -1) {
      commit(v.slice(0, cut));
      v = v.slice(cut + 1).replace(/^\s+/, "");
      cut = v.search(/\s/);
    }
    s.typed = v;
    refresh();
  }

  function onKeyDown(e) {
    if (e.key === "Enter") {                      // phone keyboards' "next" key
      e.preventDefault();
      if (isSpectator || eng.gameOver) return;
      commit(live.current.typed);
      live.current.typed = "";
      refresh();
    }
  }

  const s = live.current;
  const start = Math.floor(s.i / PER_LINE) * PER_LINE;    // whole lines, so words don't shuffle about
  const shown = words.slice(start, start + PER_LINE * LINES);
  const elapsed = Math.max(0, durationSeconds - eng.timeLeft);
  const now = check(words[s.i] || "", clean(s.typed));
  const stats = isSpectator
    ? [{ label: "Score", value: Number(spectatorWatching?.score ?? 0).toLocaleString() },
       { label: "Words", value: s.right }]
    : [
        { label: "Score", value: eng.score.toLocaleString() },
        { label: "WPM", value: wpm(s.chars, elapsed) },
        { label: "Accuracy", value: `${accuracy(s.right, s.wrong)}%` },
      ];

  return (
    <>
      <GameFrame
        gameName="Typing Race" badge="⌨️ TYPING RACE"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={Object.values(eng.opponents)}
        teams={eng.teams}
        onQuit={eng.endMatch}
      >
        {({ w }) => (
          <div className="ty-wrap" style={{ width: Math.min(w, 640) }} onPointerDown={() => { if (!focused) focusBox(); }}>
            <div className={`ty-box${now.bad ? " bad" : ""}${focused || isSpectator ? "" : " asleep"}`}>
              <div className="ty-words" aria-hidden="true">
                {shown.map((word, k) => {
                  const idx = start + k;
                  if (idx < s.i) {
                    return <span key={idx} className={`ty-w ${s.res[idx] ? "done" : "miss"}`}>{word}</span>;
                  }
                  if (idx === s.i) {
                    return (
                      <span key={idx} className="ty-w cur">
                        {now.letters.map((st, j) => (
                          <React.Fragment key={j}>
                            {j === clean(s.typed).length && !isSpectator && focused && <span className="ty-caret" />}
                            <span className={`ty-l ${st}`}>{word[j]}</span>
                          </React.Fragment>
                        ))}
                        {now.extra > 0 && <span className="ty-l extra">{clean(s.typed).slice(word.length)}</span>}
                        {clean(s.typed).length >= word.length && !isSpectator && focused && <span className="ty-caret" />}
                      </span>
                    );
                  }
                  return <span key={idx} className="ty-w next">{word}</span>;
                })}
              </div>
              {!isSpectator && (
                <input ref={inputRef} className="ty-input" value={s.typed}
                  onChange={onChange} onKeyDown={onKeyDown}
                  onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                  disabled={eng.gameOver}
                  autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  inputMode="text" enterKeyHint="next" aria-label={`Type the word: ${words[s.i]}`} />
              )}
              {!focused && !isSpectator && !eng.gameOver && (
                <div className="ty-wake">⌨️ Tap here to type</div>
              )}
            </div>
            <div className="ty-under">
              {flash ? (
                <span key={flash.n} className={`ty-flash ${flash.ok ? "ok" : "bad"}`}>
                  {flash.ok ? `+${flash.pts}` : "missed"}
                </span>
              ) : <span className="muted">{isSpectator ? "" : "Type the word, then space"}</span>}
              {s.streak > 1 && <span className="chip c-sun ty-streak">🔥 {s.streak} in a row</span>}
            </div>
          </div>
        )}
      </GameFrame>

      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`${s.right} words · ${wpm(s.chars, elapsed)} WPM · ${accuracy(s.right, s.wrong)}% accurate`} />
      )}
    </>
  );
}
