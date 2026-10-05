// src/components/together/FloatStick.jsx
// A thumb stick that sits wherever your left thumb lands — like Nana's house.
// It's a wide patch over the bottom left of a landscape game: touch anywhere
// in it and the ring appears under your thumb; slide to steer; let go and
// it's gone (a faint ring shows where to put your thumb).
//
// It writes `stick.current = { id, ox, oy, x, y }` (where the thumb came
// down and where it is now, in the game's own frame) for the game's loop to
// read, and the game moves `knobRef` — the same as a fixed stick did.
// Drawn sideways (GameFrame landscape on an upright phone), positions are
// turned back first.
import React, { useRef, useState } from "react";
import { useUprightTouch, toGame, gameRect } from "../horror/LandscapeGate";

export default function FloatStick({ stick, knobRef, label = "Move" }) {
  const rotated = useUprightTouch();
  const rot = useRef(rotated);
  rot.current = rotated;
  const zone = useRef(null);
  const [at, setAt] = useState(null);           // where the ring is, inside the patch

  const down = (e) => {
    e.preventDefault();
    if (stick.current) return;                  // one thumb steers
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
    const r = gameRect(zone.current, rot.current), p = toGame(e, rot.current);
    stick.current = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    setAt({ x: p.x - r.left, y: p.y - r.top });
  };
  const move = (e) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId) return;
    const p = toGame(e, rot.current);
    s.x = p.x; s.y = p.y;
  };
  const up = (e) => {
    if (!stick.current || stick.current.id !== e.pointerId) return;
    stick.current = null;
    setAt(null);
  };

  return (
    <div className="fstick-zone" ref={zone} role="application" aria-label={label}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {at ? (
        <div className="fstick" style={{ left: at.x, top: at.y }}>
          <div className="fstick-knob" ref={knobRef} />
        </div>
      ) : (
        <div className="fstick idle" aria-hidden="true"><div className="fstick-knob" /></div>
      )}
    </div>
  );
}
