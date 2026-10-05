// src/components/games/HowTo.jsx
// A game's "how to play" card (the words are in howToRules.js): in the lobby, in
// the waiting room, and behind the ? in a game's top bar.
import React from "react";
import { howToFor } from "./howToRules";

export default function HowTo({ game, title = true, className = "" }) {
  const h = howToFor(game);
  if (!h) return null;
  return (
    <div className={`howto ${className}`}>
      {title && <div className="howto-t">📖 How to play {h.name}</div>}
      <p className="howto-goal">🎯 {h.goal}</p>
      <ol className="howto-steps">
        {h.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      {h.tip && <p className="howto-tip">{h.tip}</p>}
    </div>
  );
}
