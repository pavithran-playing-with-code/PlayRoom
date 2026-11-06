// src/components/games/RoadHopper.jsx
// Road Hopper in a room. Drawn in 3D (three.js), so it loads only when a room
// opens it: this is the small part the registry holds; RoadHopperInner.jsx is
// the rest.
import React, { Suspense, lazy } from "react";

const Inner = lazy(() => import("./RoadHopperInner"));

export default function RoadHopper(props) {
  return (
    <Suspense fallback={<div className="rh-pad"><div className="muted">Off to the meadow…</div></div>}>
      <Inner {...props} />
    </Suspense>
  );
}
