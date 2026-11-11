// src/components/games/ShadowSneak.jsx
// Shadow Sneak in a room. Drawn in 3D (three.js), so it loads only when a
// room opens it: this is the small part the registry holds;
// ShadowSneakInner.jsx is the rest.
import React, { Suspense, lazy } from "react";

const Inner = lazy(() => import("./ShadowSneakInner"));

export default function ShadowSneak(props) {
  return (
    <Suspense fallback={<div className="sn-pad"><div className="muted">The lamp is warming up…</div></div>}>
      <Inner {...props} />
    </Suspense>
  );
}
