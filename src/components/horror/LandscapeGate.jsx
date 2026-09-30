// src/components/horror/LandscapeGate.jsx
// Hollow Manor is first-person with a thumb on each side of the screen: it is
// a landscape game. On a phone or tablet held upright this covers the game
// and asks for the device to be turned.
//
// Where the browser allows it (Chrome on Android), one tap goes full screen
// and locks the screen sideways, so the player doesn't have to fight their
// auto-rotate setting. iPhone Safari lets no page lock orientation, so there
// the only way is to turn the phone — the card says so, and mentions the
// rotation lock, which is the usual reason turning it does nothing.
import React, { useEffect } from "react";
import useMedia from "../../utils/useMedia";

// A touch screen, held upright. A laptop with a touchscreen reports a fine
// pointer, so it is never asked to turn.
const UPRIGHT_TOUCH = "(orientation: portrait) and (pointer: coarse)";
export const useUprightTouch = () => useMedia(UPRIGHT_TOUCH);

const canLock = () => typeof window !== "undefined" && !!(window.screen?.orientation?.lock);

// Full screen, then sideways. Must be called from a tap (browsers refuse
// both otherwise). Quietly does nothing where either isn't allowed.
export async function goLandscape() {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
  } catch { /* not allowed here */ }
  try { await window.screen.orientation.lock("landscape"); } catch { /* iOS, or not full screen */ }
}

// Back to normal when the game closes: the rest of PlayRoom is portrait.
export function leaveLandscape() {
  try { window.screen?.orientation?.unlock?.(); } catch { /* nothing to undo */ }
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch { /* already out */ }
}

export function useLandscapeCleanup() {
  useEffect(() => leaveLandscape, []);
}

export default function LandscapeGate({ note = null }) {
  const upright = useUprightTouch();
  if (!upright) return null;
  const lockable = canLock();
  return (
    <div className="hm-turn" role="dialog" aria-label="Turn your device sideways">
      <div className="hm-turn-phone" aria-hidden="true"><span /></div>
      <h2>Turn it sideways</h2>
      <p>Hollow Manor is played in landscape: left thumb to walk, right thumb to look.</p>
      {lockable && <button className="hm-go" onClick={goLandscape}>Play in landscape</button>}
      <p className="hm-turn-small">
        {lockable ? "Or just turn your phone." : "Turn your phone — if it won't turn, switch off rotation lock."}
      </p>
      {note && <p className="hm-turn-note">{note}</p>}
    </div>
  );
}
