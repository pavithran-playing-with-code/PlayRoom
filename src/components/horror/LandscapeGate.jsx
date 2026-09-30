// src/components/horror/LandscapeGate.jsx
// Hollow Manor is first-person with a thumb on each side of the screen: it is
// a landscape game. On a phone or tablet held upright this covers the game
// and asks for the device to be turned.
//
// PlayRoom installed on a phone is locked to portrait (manifest.json says so),
// so turning the phone does nothing there: the page has to ask for landscape
// itself. An installed app may do that without a tap, so the game asks the
// moment it opens. In a browser tab it needs a tap, and full screen, so the
// first touch in the game does it. iPhone Safari lets no page lock
// orientation; there the only way is to turn the phone, and the card says so.
import React, { useEffect } from "react";
import useMedia from "../../utils/useMedia";

// A touch screen, held upright. A laptop with a touchscreen reports a fine
// pointer, so it is never asked to turn.
const UPRIGHT_TOUCH = "(orientation: portrait) and (pointer: coarse)";
export const useUprightTouch = () => useMedia(UPRIGHT_TOUCH);

const canLock = () => typeof window !== "undefined" && !!(window.screen?.orientation?.lock);

// Opened from the home-screen icon rather than a browser tab.
export const isInstalled = () => typeof window !== "undefined" && (
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches || window.navigator.standalone === true);

// Sideways. An installed app can lock straight away; a browser tab needs full
// screen first, which needs a tap. Quietly does nothing where not allowed.
export async function goLandscape() {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;
  if (!isInstalled()) {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    } catch { /* no tap to go on yet */ }
  }
  try { await window.screen.orientation.lock("landscape"); } catch { /* iOS, or needs the tap */ }
}

// For a game screen: sideways as it opens (installed app), or on the first
// touch (browser tab), and back to normal when it closes.
export function useAutoLandscape() {
  useEffect(() => {
    goLandscape();
    const onTouch = () => goLandscape();
    window.addEventListener("pointerdown", onTouch, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", onTouch, { capture: true });
      leaveLandscape();
    };
  }, []);
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
        {!lockable ? "Turn your phone — if it won't turn, switch off rotation lock."
          : isInstalled() ? "Tap it if the screen doesn't turn by itself." : "Or just turn your phone."}
      </p>
      {note && <p className="hm-turn-note">{note}</p>}
    </div>
  );
}
