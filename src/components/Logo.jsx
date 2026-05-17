// src/components/Logo.jsx
// Brand logo: three fanned tiles (mahjong/cards motif) + wordmark.
// Used in Navbar, Home hero, and the in-game headers so the brand
// is consistent everywhere.

import React from "react";

export default function Logo({ size = "md", showText = true, style = {} }) {
  const cfg = {
    sm: { icon: 26, font: "1.15rem", gap: 8,  spacing: "-0.5px" },
    md: { icon: 34, font: "1.4rem",  gap: 10, spacing: "-0.8px" },
    lg: { icon: 64, font: "3.2rem",  gap: 18, spacing: "-2px"   },
    xl: { icon: 88, font: "4.4rem",  gap: 22, spacing: "-3px"   },
  }[size] || {};

  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap: cfg.gap, ...style }}>
      <TileMark size={cfg.icon} />
      {showText && (
        <span style={{
          fontWeight: 900,
          fontSize: cfg.font,
          letterSpacing: cfg.spacing,
          background: "linear-gradient(135deg, var(--accent) 0%, var(--accent2) 65%, var(--blue) 110%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          lineHeight: 1,
        }}>
          PlayRoom
        </span>
      )}
    </span>
  );
}

// Three fanned tiles — gold, pink, blue. The dots on the gold tile hint at
// game pips so it reads as "playful" rather than generic.
function TileMark({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      aria-label="PlayRoom"
      style={{ flexShrink: 0, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))" }}
    >
      {/* back tile — blue, rotated left */}
      <g transform="rotate(-14 18 26)">
        <rect x="6"  y="13" width="18" height="24" rx="4"
              fill="var(--blue, #5b9cf6)" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
      </g>
      {/* middle tile — pink */}
      <g transform="rotate(-2 22 22)">
        <rect x="13" y="10" width="18" height="24" rx="4"
              fill="var(--accent2, #e85d9e)" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
      </g>
      {/* front tile — gold with two pips */}
      <g transform="rotate(10 28 18)">
        <rect x="20" y="6" width="18" height="24" rx="4"
              fill="var(--accent, #f7c948)" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
        <circle cx="25.5" cy="12.5" r="1.7" fill="#1a0a2e" opacity="0.85" />
        <circle cx="32.5" cy="23.5" r="1.7" fill="#1a0a2e" opacity="0.85" />
      </g>
    </svg>
  );
}
