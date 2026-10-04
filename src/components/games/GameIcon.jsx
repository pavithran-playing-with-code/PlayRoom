// src/components/games/GameIcon.jsx
// A game's icon. Most are an emoji; a game with no emoji that looks like it
// (Carrom) gets a small drawing instead, sized by the font like an emoji is.
// Places that can only take text — a toast, a notification — use the emoji
// stored with the game (Carrom's is ⚫⚪, two coins).
import React from "react";

const CARROM = new Set(["⚫⚪", "🎯"]);       // 🎯 was its first icon; rows made then may still carry it

function CarromBoard() {
  return (
    <svg viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "-0.125em" }}>
      <rect x="1" y="1" width="30" height="30" rx="5" fill="#7A4A2A" stroke="#2E2140" strokeWidth="1.5" />
      <rect x="4" y="4" width="24" height="24" rx="1.5" fill="#F3D9A4" />
      {[[6.4, 6.4], [25.6, 6.4], [6.4, 25.6], [25.6, 25.6]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.3" fill="#1A1210" />)}
      <circle cx="16" cy="16" r="5.6" fill="none" stroke="#3B2416" strokeWidth=".8" />
      <circle cx="16" cy="16" r="1.9" fill="#E63946" stroke="#2E2140" strokeWidth=".5" />
      {[[0, "#FFF4D6"], [72, "#2B2730"], [144, "#FFF4D6"], [216, "#2B2730"], [288, "#FFF4D6"]].map(([a, c]) => {
        const r = (a * Math.PI) / 180;
        return <circle key={a} cx={16 + Math.cos(r) * 3.9} cy={16 + Math.sin(r) * 3.9} r="1.75" fill={c} stroke="#2E2140" strokeWidth=".5" />;
      })}
      <circle cx="16" cy="24.2" r="2.1" fill="#4CC9F0" stroke="#2E2140" strokeWidth=".6" />
    </svg>
  );
}

export default function GameIcon({ slug = null, icon = "🎮" }) {
  if (slug === "carrom" || CARROM.has(icon)) return <CarromBoard />;
  return <>{icon || "🎮"}</>;
}
