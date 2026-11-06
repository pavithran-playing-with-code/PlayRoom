// src/components/games/FlappyDash.jsx
// Flappy Dash in a room. Drawn in 3D (three.js), so it loads only when a room
// opens it: this is the small part the registry holds; FlappyDashInner.jsx is
// the rest.
import React, { Suspense, lazy } from "react";

const Inner = lazy(() => import("./FlappyDashInner"));

export default function FlappyDash(props) {
  return (
    <Suspense fallback={<div className="fl-pad"><div className="muted">Up into the sky…</div></div>}>
      <Inner {...props} />
    </Suspense>
  );
}
