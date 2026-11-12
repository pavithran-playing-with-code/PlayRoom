// src/components/games/GamePoster.jsx
// A game's icon (gamePosters.js), filling the box it is put in — the Play
// page's tiles, the start sheet, "Play again". The box clips it (overflow
// hidden, its own rounded corners). A game with no icon yet falls back to its
// emoji icon.
//
// The finish every icon shares is here: a sunburst of the game's colour, the
// thick dark outline round the hero (the gp-ol filter: the hero's own shape
// grown by a line's width and painted ink, once more a little lower so it
// sits heavy), and a soft light across the top.
import React from "react";
import { POSTERS } from "./gamePosters";
import GameIcon from "./GameIcon";

const RAYS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

export default function GamePoster({ slug, icon }) {
  const p = POSTERS[slug];
  if (!p) return <GameIcon icon={icon} slug={slug} />;
  const bg = `gp-bg-${slug}`;
  return (
    <svg className="game-poster" viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={bg} cx="0.5" cy="0.5" r="0.72">
          <stop offset="0" stopColor={p.bg[0]} /><stop offset="1" stopColor={p.bg[1]} />
        </radialGradient>
        <filter id="gp-ol" x="-25%" y="-25%" width="150%" height="160%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="fat" />
          <feOffset in="fat" dy="2.2" result="low" />
          <feMerge result="shape"><feMergeNode in="fat" /><feMergeNode in="low" /></feMerge>
          <feFlood floodColor="#1B1230" result="ink" />
          <feComposite in="ink" in2="shape" operator="in" result="line" />
          <feMerge><feMergeNode in="line" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="gp-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" /><stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        {p.defs}
      </defs>
      <rect width="64" height="64" fill={`url(#${bg})`} />
      {RAYS.map((a) => <path key={a} d="M32 32L26-20h12z" fill="#FFFFFF" opacity=".13" transform={`rotate(${a} 32 32)`} />)}
      {p.back}
      <g filter="url(#gp-ol)">{p.art}</g>
      <rect width="64" height="64" fill="url(#gp-top)" />
    </svg>
  );
}
