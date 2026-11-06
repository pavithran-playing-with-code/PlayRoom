// src/components/games/DinoDash.jsx
// Dino Dash in a room. Drawn in 3D (three.js), so it loads only when a room
// opens it: this is the small part the registry holds; DinoDashInner.jsx is
// the rest.
import React, { Suspense, lazy } from "react";

const Inner = lazy(() => import("./DinoDashInner"));

export default function DinoDash(props) {
  return (
    <Suspense fallback={<div className="dino-pad"><div className="muted">Off to the desert…</div></div>}>
      <Inner {...props} />
    </Suspense>
  );
}
