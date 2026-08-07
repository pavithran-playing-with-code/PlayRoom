// src/components/characters/BuddyFace.jsx
// The one face every character in the cast wears — two ink eyes with a shine
// and a smile. Shared so the runner, the peeking buddy and the logo mascot read
// as the same family rather than five unrelated stickers.
//
// Ported unchanged from buddyFace(cx, cy, s) in playroom-v5.html.
import React from "react";

export default function BuddyFace({ cx, cy, s = 1 }) {
  return (
    <>
      <circle cx={cx - 5.5 * s} cy={cy} r={2.6 * s} fill="var(--ink)" />
      <circle cx={cx + 5.5 * s} cy={cy} r={2.6 * s} fill="var(--ink)" />
      <circle cx={cx - 4.6 * s} cy={cy - 1 * s} r={0.9 * s} fill="#fff" />
      <circle cx={cx + 6.4 * s} cy={cy - 1 * s} r={0.9 * s} fill="#fff" />
      <path
        d={`M${cx - 5 * s} ${cy + 6 * s} q${5 * s} ${4.4 * s} ${10 * s} 0`}
        stroke="var(--ink)" strokeWidth={2.6 * s} fill="none" strokeLinecap="round"
      />
    </>
  );
}
