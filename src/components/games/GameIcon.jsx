// src/components/games/GameIcon.jsx
// A game's icon: the emoji stored with the game.
import React from "react";

export default function GameIcon({ icon = "🎮" }) {
  return <>{icon || "🎮"}</>;
}
