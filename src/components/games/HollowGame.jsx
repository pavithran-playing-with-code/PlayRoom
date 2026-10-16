// src/components/games/HollowGame.jsx
// Hollow Hours in a room. The game itself is big (three.js, the rooms, the
// sound), so it loads only when a room opens it: this is the small part the
// registry holds; HollowGameInner.jsx is the rest.
import React, { Suspense, lazy } from "react";

const Inner = lazy(() => import("./HollowGameInner"));

export default function HollowGame(props) {
  return (
    <Suspense fallback={<div className="hh" />}>
      <Inner {...props} />
    </Suspense>
  );
}
