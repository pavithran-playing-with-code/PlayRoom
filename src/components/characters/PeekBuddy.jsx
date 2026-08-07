// src/components/characters/PeekBuddy.jsx
// Pops up over the top edge of a game tile on hover, coloured to match that
// game. All the movement is the `.peek` / `.tile:hover .peek` rules in
// index.css — this component is just the drawing.
//
// Requires the parent to be a `.tile` (which is overflow:visible, with the
// coloured `.top` clipping its own ghost icon instead).
//
// Ported unchanged from PEEK(colour, size) in playroom-v5.html.
import React from "react";
import BuddyFace from "./BuddyFace";

export default function PeekBuddy({ colour = "var(--sun)", size = 60 }) {
  return (
    <svg className="peek" width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      <rect x="7" y="8" width="30" height="28" rx="11" fill={colour} stroke="var(--ink)" strokeWidth="3" />
      <BuddyFace cx={22} cy={21} s={1} />
      <path d="M11 30 q-5 4 -2 9" stroke="var(--ink)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M33 30 q5 4 2 9" stroke="var(--ink)" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
