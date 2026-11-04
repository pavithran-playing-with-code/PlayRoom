// src/utils/watchSync.js — keeping my copy of a video with everyone's.
// The server says where the video was at a moment on its clock
// (config/callWatch.js); this says where it is now, and how to get my player
// there without anyone noticing: a little faster or slower for a small gap,
// a jump for a big one. Pure, so scripts/check-watch.js can run it.

// Where the video is at `now` (server ms).
export function posAt(w, now) {
  if (!w) return 0;
  const p = w.playing ? w.pos + ((now - w.at) / 1000) * (w.rate || 1) : w.pos;
  return Math.max(0, Math.min(w.src.dur, p));
}

export const JUMP_S = 0.5;      // further off than this: jump there (a blink, better than seconds out of step)
export const NEAR_S = 0.12;     // closer than this: leave it be
export const NUDGE = 0.1;       // at most 10% faster or slower while catching up (the browser keeps the pitch)

export const JUMP_COARSE_S = 0.7;  // a player that can't play a touch faster (YouTube's): jump past this

// How to steer a player at `cur` toward `target` (seconds).
// { seek: a time to jump to, or null; rate: the playback rate to use }
// `fine`: the player takes any rate (a file); YouTube's only takes steps
// like 1.25, so it only ever jumps.
export function steer(cur, target, playing, fine = true) {
  const d = target - cur;
  if (!playing) return { seek: Math.abs(d) > 0.25 ? target : null, rate: 1 };
  if (!fine) return { seek: Math.abs(d) > JUMP_COARSE_S ? target : null, rate: 1 };
  if (Math.abs(d) > JUMP_S) return { seek: target, rate: 1 };
  if (Math.abs(d) < NEAR_S) return { seek: null, rate: 1 };
  // close the gap over ~2 s
  return { seek: null, rate: 1 + Math.max(-NUDGE, Math.min(NUDGE, d / 2)) };
}

// 1:05:09, or 4:07
export function clockOf(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
}

// 1.4 GB, 730 MB
export function sizeOf(b) {
  return b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e7 ? `${Math.round(b / 1e6)} MB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`;
}
