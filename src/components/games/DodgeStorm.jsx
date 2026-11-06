// src/components/games/DodgeStorm.jsx
// Dodge Storm in a room. Drawn in 3D (three.js), so it loads only when a room
// opens it: this is the small part the registry holds; DodgeStormInner.jsx is
// the rest.
import React, { Suspense, lazy } from "react";

const Inner = lazy(() => import("./DodgeStormInner"));

export default function DodgeStorm(props) {
  return (
    <Suspense fallback={<div className="ds-pad"><div className="muted">The storm is gathering…</div></div>}>
      <Inner {...props} />
    </Suspense>
  );
}
