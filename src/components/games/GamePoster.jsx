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

export default function GamePoster({ slug, icon }) {
  const [broken, setBroken] = useState(false);
  const col = POSTERS[slug];
  if (!col || broken) return <GameIcon icon={icon} slug={slug} />;
  // A plain <img>, shadowed in CSS (.game-poster.flat in index.css): inside an
  // SVG filter the drawing can be rasterised small and come out soft.
  return (
    <span className="game-poster flat" style={{ backgroundColor: col }} aria-hidden="true">
      <img src={`${process.env.PUBLIC_URL}/game-icons/${slug}.svg`} alt="" draggable="false" onError={() => setBroken(true)} />
    </span>
  );
}
