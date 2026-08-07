// src/components/ui/Badge.jsx
// A hard-outlined pill. Tones are the toy palette; the older semantic names
// (green/pink/red) are kept as aliases so call sites don't all have to change.
import React from "react";

const TONES = {
  neutral: "",            // plain white chip
  sun: "c-sun",
  coral: "c-coral",
  mint: "c-mint",
  grape: "c-grape",
  sky: "c-sky",
  lime: "c-lime",

  // aliases kept for existing call sites
  accent: "c-sun",
  violet: "c-grape",
  green: "c-lime",
  pink: "c-coral",
  red: "c-coral",
  blue: "c-sky",
};

export default function Badge({ tone = "neutral", className = "", style, children }) {
  return (
    <span className={`chip ${TONES[tone] ?? ""} ${className}`} style={style}>
      {children}
    </span>
  );
}
