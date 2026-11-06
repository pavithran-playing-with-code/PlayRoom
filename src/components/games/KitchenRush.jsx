// src/components/games/KitchenRush.jsx
// Kitchen Rush in a room. Drawn in 3D (three.js), so it loads only when a
// room opens it: this is the small part the registry holds;
// KitchenRushInner.jsx is the rest.
import React, { Suspense, lazy } from "react";

const Inner = lazy(() => import("./KitchenRushInner"));

export default function KitchenRush(props) {
  return (
    <Suspense fallback={<div className="md-pad md-wait">Opening the kitchen…</div>}>
      <Inner {...props} />
    </Suspense>
  );
}
