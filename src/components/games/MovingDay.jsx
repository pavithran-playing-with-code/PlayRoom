// src/components/games/MovingDay.jsx
// Moving Day in a room. The game is drawn in 3D (three.js), so it loads only
// when a room opens it: this is the small part the registry holds;
// MovingDayInner.jsx is the rest.
import React, { Suspense, lazy } from "react";

const Inner = lazy(() => import("./MovingDayInner"));

export default function MovingDay(props) {
  return (
    <Suspense fallback={<div className="md-pad md-wait">Opening the house…</div>}>
      <Inner {...props} />
    </Suspense>
  );
}
