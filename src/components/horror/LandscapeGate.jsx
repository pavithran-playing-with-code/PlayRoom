// src/components/horror/LandscapeGate.jsx
// Hollow Manor is first-person with a thumb on each side of the screen: it is
// a landscape game, whatever the phone thinks.
//
// Two layers, because neither works everywhere:
//
//   1. Ask the phone to turn the screen (screen.orientation.lock). Chrome on
//      Android allows it in full screen, which a tab enters on the first
//      touch; an installed app may be allowed straight away. iPhone Safari
//      never allows it.
//   2. Whatever the phone says, if the screen is still upright, the game
//      draws itself turned a quarter (.hm-rot), so you just turn the phone
//      and it's sideways. This is what makes it work in the installed app
//      (manifest.json locks that to portrait, and the lock did not always
//      take), with rotation lock on, and on an iPhone.
//
// While drawn sideways, a touch's screen position has to be turned the same
// way before the game reads it — see toGame().
import { useEffect, useRef } from "react";
import useMedia from "../../utils/useMedia";

// A touch screen, held upright. A laptop with a touchscreen reports a fine
// pointer, so it is never turned.
const UPRIGHT_TOUCH = "(orientation: portrait) and (pointer: coarse)";
export const useUprightTouch = () => useMedia(UPRIGHT_TOUCH);

export const isInstalled = () => typeof window !== "undefined" && (
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches || window.navigator.standalone === true);

// Ask for sideways. A browser tab needs full screen first, which needs a
// tap. Quietly does nothing where not allowed — the drawn-sideways fallback
// covers that.
export async function goLandscape() {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;
  if (!isInstalled()) {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    } catch { /* no tap to go on yet */ }
  }
  try { await window.screen.orientation.lock("landscape"); } catch { /* not allowed here */ }
}

// Back to normal when the game closes: the rest of PlayRoom is portrait.
export function leaveLandscape() {
  try { window.screen?.orientation?.unlock?.(); } catch { /* nothing to undo */ }
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch { /* already out */ }
}

// For a game screen: ask to turn as it opens and on the first touch, and
// report whether the game must draw itself sideways (`.hm-rot` on the root).
// Returns [rotated, rotatedRef] — the ref for event handlers.
export function useSideways() {
  const rotated = useUprightTouch();
  const ref = useRef(rotated);
  ref.current = rotated;
  useEffect(() => {
    goLandscape();
    const onTouch = () => goLandscape();
    window.addEventListener("pointerdown", onTouch, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", onTouch, { capture: true });
      leaveLandscape();
    };
  }, []);
  return [rotated, ref];
}

// A pointer's position in the game's own frame. Drawn sideways, the game is
// turned 90° clockwise about the screen's top-right corner, so its x runs
// down the screen and its y runs right to left.
export function toGame(e, rotated) {
  if (!rotated) return { x: e.clientX, y: e.clientY };
  return { x: e.clientY, y: window.innerWidth - e.clientX };
}
