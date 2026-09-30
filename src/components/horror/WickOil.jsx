// src/components/horror/WickOil.jsx
import React from "react";
import { MAX_OIL, BRIGHT_AT, DIM_AT, radiusFor } from "./wickSim";

// The oil left, with the two points where the light shrinks marked on it —
// the most important thing to watch after the monsters themselves.
export default function OilGauge({ oil, dark }) {
  const pct = (n) => `${(n / MAX_OIL) * 100}%`;
  const r = radiusFor(oil);
  return (
    <div className={`wk-oil r${r}`} aria-label={`Oil ${oil}`}>
      <div className="wk-oil-bar">
        <span className="wk-oil-fill" style={{ width: pct(oil) }} />
        <i style={{ left: pct(DIM_AT) }} />
        <i style={{ left: pct(BRIGHT_AT) }} />
      </div>
      <div className="wk-oil-label">
        <b>{oil}</b> OIL · {r === 2 ? "bright" : r === 1 ? "dim" : r === 0 ? "guttering" : `dark ${dark}`}
      </div>
    </div>
  );
}
