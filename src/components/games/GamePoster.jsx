// src/components/games/GamePoster.jsx
// A game's icon, filling the box it is put in — the Play page's tiles, the
// start sheet, "Play again". The box clips it (overflow hidden, its own
// rounded corners).
//
// The style is "Flat": a drawing of one object (public/game-icons/<slug>.svg,
// Microsoft's Fluent Emoji, MIT — see the README beside them) on one solid
// colour with slanted stripes, and a hard ink shadow under the drawing like
// the rest of PlayRoom. To give a game an icon: put its drawing in that
// folder under its slug and add its colour to POSTERS. A game with none, or
// whose drawing fails to load, shows its little picture (GameIcon).
import React, { useState } from "react";
import GameIcon from "./GameIcon";

// slug → the tile's colour
const POSTERS = {
  mahjong: "#FFE27A", memory: "#FF9A8A", speedmath: "#9AF5D0", reaction: "#8AD4FF",
  wordrush: "#D6F56B", arrows: "#FFB3E0", dino: "#A6F7A0", numbers: "#B8ECFF",
  colors: "#FF9AC7", pipes: "#9AE8F5", flappy: "#FFF59A", slide: "#C2CBE8",
  blocks: "#FFC27A", racer: "#C6CFE8", runner: "#FFB09A", speedway: "#8AD4FF",
  storm: "#E0A8FF", maze: "#A6F7A0", typing: "#B8ECFF", piano: "#FFB3E0",
  kitchen: "#FFD6A8", moving: "#FFE27A", sunshard: "#A8E4FF", emberfall: "#FF9A8A",
  hollow: "#C9A8FF", sneak: "#A9B3D9", movie: "#FF9A8A",
};
export const hasPoster = (slug) => !!POSTERS[slug];

const STRIPES = [-66.8, -50.1, -33.4, -16.7, 0, 16.7, 33.4, 50.1];

export default function GamePoster({ slug, icon }) {
  const [broken, setBroken] = useState(false);
  const col = POSTERS[slug];
  if (!col || broken) return <GameIcon icon={icon} slug={slug} />;
  return (
    <svg className="game-poster" viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        {/* the drawing's own shape, in ink, a little down and to the right */}
        <filter id="gp-flat" x="-10%" y="-10%" width="125%" height="125%" colorInterpolationFilters="sRGB">
          <feOffset in="SourceAlpha" dx="2.1" dy="2.6" result="low" />
          <feFlood floodColor="#1B1230" result="ink" />
          <feComposite in="ink" in2="low" operator="in" result="shadow" />
          <feMerge><feMergeNode in="shadow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width="64" height="64" fill={col} />
      {STRIPES.map((x) => <path key={x} d={`M${x} 64L${x + 64} 0h8.35L${x + 8.35} 64z`} fill="#FFFFFF" opacity=".16" />)}
      <image href={`${process.env.PUBLIC_URL}/game-icons/${slug}.svg`} x="8.3" y="7.7" width="47.4" height="47.4"
        filter="url(#gp-flat)" onError={() => setBroken(true)} />
    </svg>
  );
}
