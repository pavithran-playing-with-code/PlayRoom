// src/components/characters/Runner.jsx
// The mascot who strolls back and forth behind the navbar, stopping to hop,
// backflip and shimmy. All the movement lives in the `.actor` / `stroll`
// keyframes in index.css — this component is only the drawing.
//
// Must be rendered inside `.runstrip` (the absolutely-positioned, overflow
// hidden strip that spans the nav), otherwise he has nothing to walk on.
import React from "react";
import BuddyFace from "./BuddyFace";

export default function Runner({ height = 40 }) {
  return (
    <span className="actor" aria-hidden="true">
      <span style={{ display: "inline-block", position: "relative" }}>
        <svg width={height * 0.95} height={height} viewBox="0 0 46 52">
          <g className="legA"><rect x="14" y="34" width="7" height="15" rx="3.5" fill="var(--ink)" /></g>
          <g className="legB"><rect x="25" y="34" width="7" height="15" rx="3.5" fill="var(--ink)" /></g>
          <g className="armA"><rect x="3" y="18" width="6.5" height="15" rx="3.2" fill="var(--ink)" /></g>
          <g className="armB"><rect x="36" y="18" width="6.5" height="15" rx="3.2" fill="var(--ink)" /></g>
          <rect x="8" y="8" width="30" height="29" rx="11" fill="var(--coral)" stroke="var(--ink)" strokeWidth="3" />
          <BuddyFace cx={23} cy={21} s={1} />
          <path d="M12 9 q11 -7 22 0" stroke="var(--ink)" strokeWidth="3" fill="var(--sun)" />
        </svg>
        {/* sparkle that puffs on each flip */}
        <span className="oops" style={{ position: "absolute", top: 2, right: -16, fontSize: "1rem" }}>✨</span>
      </span>
    </span>
  );
}
