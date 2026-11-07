// src/components/games/MazeRunner.jsx
// Maze Runner in a room. Drawn in 3D (three.js), so it loads only when a room
// opens it: this is the small part the registry holds; MazeRunnerInner.jsx is
// the rest.
import React, { Suspense, lazy } from "react";

const Inner = lazy(() => import("./MazeRunnerInner"));

export default function MazeRunner(props) {
  return (
    <Suspense fallback={<div className="mz-swipe"><div className="muted">Setting out the maze…</div></div>}>
      <Inner {...props} />
    </Suspense>
  );
}
