// src/utils/lastPlay.js
// The last match you made — game and settings — kept on this phone only, for
// the Play page's "Play again" card and the tab bar's ▶. Never sent anywhere.
const KEY = "pr_last_play";

export function readLastPlay() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && typeof v.slug === "string" ? v : null;
  } catch { return null; }
}

export function saveLastPlay(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private window */ }
}
