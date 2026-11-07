// src/components/games/TapRush.jsx
// Tap Rush in a room. Drawn in 3D (three.js), so it loads only when a room
// opens it: this is the small part the registry holds; TapRushInner.jsx is
// the rest.
import React, { Suspense, lazy } from "react";

const Inner = lazy(() => import("./TapRushInner"));

export default function TapRush(props) {
  return (
    <Suspense fallback={<div style={{ display: "grid", placeItems: "center", height: "100%" }}><div className="muted">Into the garden…</div></div>}>
      <Inner {...props} />
    </Suspense>
  );
}
