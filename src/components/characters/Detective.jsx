// src/components/characters/Detective.jsx
// The doorman on the auth pages. He reacts to what you're typing: leans in and
// raises his glass at the username, claps both paws over his eyes for a
// password (then can't resist peeking), shakes his head when you submit an
// empty field, and cheers you through the door on success.
//
// The poses are pure CSS — every `#det[data-mood="…"]` rule in index.css moves
// the named groups below. This file only draws him and owns the mood state.
import React, { useCallback, useEffect, useRef, useState } from "react";

/* What he says in each mood. `idle` depends on which form you're on. */
export const DETECTIVE_LINES = {
  idle:    <><strong>Halt.</strong> Name and password, please. Then you may pass. 🕵️</>,
  idleNew: <><strong>New face!</strong> Pick a name and a badge — I'll add you to the files. 🕵️</>,
  watch:   <><strong>Hmm…</strong> let me check that name against my records. 🔍</>,
  hide:    <><strong>Not looking!</strong> Your secret is safe with me. 🙈</>,
  peek:    <>…all right, maybe <strong>one</strong> eye. 👀</>,
  oops:    <><strong>Nope.</strong> That won't get you through this door.</>,
  cheer:   <><strong>Case closed.</strong> In you go! 🎉</>,
};

/**
 * Mood state machine, shared by Login and Register.
 *
 * `isNew` picks which idle line he falls back to. Returns the current mood, the
 * line to show, a `setMood(m, holdMs)` setter, and ready-made prop bundles to
 * spread onto the username field and every password field.
 */
export function useDetective(isNew = false) {
  const [mood, setMoodState] = useState("idle");
  const holdRef = useRef(null);
  const peekRef = useRef(null);
  const moodRef = useRef("idle");

  const setMood = useCallback((m, holdMs) => {
    moodRef.current = m;
    setMoodState(m);
    clearTimeout(holdRef.current);
    if (holdMs) {
      holdRef.current = setTimeout(() => {
        moodRef.current = "idle";
        setMoodState("idle");
      }, holdMs);
    }
  }, []);

  const stopPeeking = useCallback(() => clearInterval(peekRef.current), []);

  // Never leave a timer running after the page unmounts.
  useEffect(() => () => { clearTimeout(holdRef.current); clearInterval(peekRef.current); }, []);

  const nameProps = {
    onFocus: () => setMood("watch"),
    onInput: () => setMood("watch"),
    onBlur: (e) => {
      // Don't drop out of "hide" just because focus moved into a password field.
      if (document.activeElement?.type !== "password") setMood("idle");
      return e;
    },
  };

  const secretProps = {
    onFocus: () => {
      setMood("hide");
      stopPeeking();
      // He can't help himself.
      peekRef.current = setInterval(() => {
        if (moodRef.current !== "hide") return;
        setMood("peek");
        setTimeout(() => { if (moodRef.current === "peek") setMood("hide"); }, 620);
      }, 3200);
    },
    onBlur: () => { stopPeeking(); setMood("idle"); },
  };

  // "idle" is the only mood whose line depends on the form — every other mood
  // reads the same on both. (Don't collapse this into a `||` fallback:
  // DETECTIVE_LINES.idle is truthy, so the fallback would never fire and the
  // register page would greet you as a returning member.)
  const line = mood === "idle"
    ? DETECTIVE_LINES[isNew ? "idleNew" : "idle"]
    : DETECTIVE_LINES[mood];

  return { mood, line, setMood, stopPeeking, nameProps, secretProps };
}

export default function Detective({ mood = "idle", size = 300 }) {
  return (
    <div id="det" data-mood={mood}>
      <svg width={size} height={size * 1.12} viewBox="0 0 200 224" aria-hidden="true">
        <ellipse cx="100" cy="209" rx="58" ry="10" fill="var(--ink)" opacity=".16" />
        <g className="lean">
          <rect x="52" y="138" width="22" height="58" rx="11" fill="var(--ink)" />
          <rect x="126" y="138" width="22" height="58" rx="11" fill="var(--ink)" />

          {/* head */}
          <rect x="40" y="62" width="120" height="106" rx="34" fill="var(--sky)" stroke="var(--ink)" strokeWidth="6" />

          {/* deerstalker, lifted well above the eyes with a band to separate it —
              hugging the brow line made it read as a third eyebrow */}
          <g className="hat">
            <ellipse cx="100" cy="30" rx="42" ry="26" fill="var(--coral)" stroke="var(--ink)" strokeWidth="6" />
            <rect x="34" y="44" width="132" height="15" rx="7.5" fill="var(--ink)" />
            <ellipse cx="52" cy="52" rx="16" ry="11" fill="var(--coral)" stroke="var(--ink)" strokeWidth="6" />
            <ellipse cx="148" cy="52" rx="16" ry="11" fill="var(--coral)" stroke="var(--ink)" strokeWidth="6" />
            <circle cx="100" cy="10" r="8" fill="var(--sun)" stroke="var(--ink)" strokeWidth="5" />
          </g>

          {/* eyes: the only curved lines on the face */}
          <g className="eyesOpen">
            <circle className="eye" cx="82" cy="108" r="9" />
            <circle className="eye" cx="118" cy="108" r="9" />
            <circle className="pupil" cx="82" cy="108" r="5.6" fill="var(--ink)" />
            <circle className="pupil" cx="118" cy="108" r="5.6" fill="var(--ink)" />
            <circle className="shine" cx="84.6" cy="105.4" r="2.1" fill="#fff" />
            <circle className="shine" cx="120.6" cy="105.4" r="2.1" fill="#fff" />
          </g>
          <g className="eyesShut" opacity="0">
            <path d="M74 108 q8 8 16 0" stroke="var(--ink)" strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d="M110 108 q8 8 16 0" stroke="var(--ink)" strokeWidth="5" fill="none" strokeLinecap="round" />
          </g>

          <path className="mouth" d="M88 130 q12 11 24 0" stroke="var(--ink)" strokeWidth="6" fill="none" strokeLinecap="round" />

          {/* paws swing up AND inward, so they land on the eyes rather than beside them */}
          <g className="handL"><ellipse cx="42" cy="164" rx="20" ry="15" fill="var(--sky)" stroke="var(--ink)" strokeWidth="6" /></g>
          <g className="handR"><ellipse cx="158" cy="164" rx="20" ry="15" fill="var(--sky)" stroke="var(--ink)" strokeWidth="6" /></g>

          <g className="magnify">
            <line x1="150" y1="162" x2="176" y2="188" stroke="var(--ink)" strokeWidth="9" strokeLinecap="round" />
            <circle cx="140" cy="152" r="27" fill="#fff" fillOpacity=".85" stroke="var(--ink)" strokeWidth="6" />
            <path d="M126 144 q14 -10 28 0" stroke="var(--sky)" strokeWidth="5" fill="none" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </div>
  );
}
