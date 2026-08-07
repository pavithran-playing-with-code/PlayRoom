// src/components/Logo.jsx
// Brand mark: three fanned tiles with a face on the front one, so the logo is
// part of the same cast as the runner and the peeking buddies rather than a
// generic icon. Used in the Navbar, the auth pages and the in-game header.
import React from "react";

const SIZES = {
  sm: { icon: 30, font: "1.15rem", gap: 8 },
  md: { icon: 46, font: "1.6rem", gap: 11 },
  lg: { icon: 64, font: "2.4rem", gap: 14 },
  xl: { icon: 88, font: "3.4rem", gap: 18 },
};

export default function Logo({ size = "md", showText = true, style = {} }) {
  const cfg = SIZES[size] || SIZES.md;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: cfg.gap, ...style }}>
      <TileMark size={cfg.icon} />
      {showText && (
        <span
          className="display"
          style={{
            fontSize: cfg.font,
            lineHeight: 1,
            color: "var(--ink)",
            // hard offset shadow, the same trick every pressable uses
            textShadow: "0 3px 0 var(--sun)",
          }}
        >
          PlayRoom
        </span>
      )}
    </span>
  );
}

// Mint tile behind, coral tile beside it, and a marigold tile in front wearing
// the cast's face.
function TileMark({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label="PlayRoom" style={{ flexShrink: 0 }}>
      <g transform="rotate(-13 17 28)">
        <rect x="5" y="15" width="18" height="25" rx="6" fill="var(--mint)" stroke="var(--ink)" strokeWidth="3" />
      </g>
      <g transform="rotate(9 30 20)">
        <rect x="24" y="9" width="18" height="25" rx="6" fill="var(--coral)" stroke="var(--ink)" strokeWidth="3" />
      </g>
      <g transform="rotate(-2 24 24)">
        <rect x="14" y="11" width="20" height="27" rx="7" fill="var(--sun)" stroke="var(--ink)" strokeWidth="3" />
        <circle cx="20.5" cy="21" r="2.4" fill="var(--ink)" />
        <circle cx="27.5" cy="21" r="2.4" fill="var(--ink)" />
        <path d="M20 28.5q4 3.6 8 0" stroke="var(--ink)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
