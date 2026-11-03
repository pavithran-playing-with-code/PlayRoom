// config/callWatch.js — watching a video together in a call.
//
// Nothing of the video passes through here or between the phones: everyone
// plays their own copy of the same file (full quality, no data), and this
// keeps the one thing they share — what's on, playing or paused, and where,
// as of a moment on the server's clock. Each phone works out the position
// now from that and steers its own player to it.
//
// Pure: no sockets, no clock of its own (`now` is passed in), so
// scripts/check-watch.js can drive it directly.

const DAY = 24 * 3600;

// What's being watched, cleaned up. A file is known by its name, size and
// length (the phones compare size to tell it's the same file).
function cleanSrc(s) {
  if (!s || typeof s !== "object") return null;
  if (s.kind === "file") {
    const name = typeof s.name === "string" ? s.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) : "";
    const size = Number(s.size), dur = Number(s.dur);
    if (!name || !Number.isSafeInteger(size) || size <= 0 || !(dur > 0 && dur < DAY)) return null;
    return { kind: "file", name, size, dur };
  }
  return null;
}

// Where the video is at `now` (server ms).
function posAt(w, now) {
  if (!w) return 0;
  const p = w.playing ? w.pos + (now - w.at) / 1000 : w.pos;
  return Math.max(0, Math.min(w.src.dur, p));
}

// One change from `uid`. Returns the new state, `null` for "nothing on"
// (closed), or `undefined` when the message is ignored.
function step(w, msg, uid, now) {
  const op = msg && msg.op;
  const at = (p) => Math.max(0, Math.min(w.src.dur, Number.isFinite(Number(p)) ? Number(p) : posAt(w, now)));
  if (op === "open") {
    const src = cleanSrc(msg.src);
    if (!src) return undefined;
    return { src, by: uid, playing: false, pos: 0, at: now, rev: (w ? w.rev : 0) + 1, ready: [uid] };
  }
  if (!w) return undefined;
  switch (op) {
    case "play": return { ...w, playing: true, pos: at(msg.pos), at: now, rev: w.rev + 1 };
    case "pause": return { ...w, playing: false, pos: at(msg.pos), at: now, rev: w.rev + 1 };
    case "seek": return { ...w, pos: at(msg.pos), at: now, rev: w.rev + 1 };
    case "ready": return w.ready.includes(uid) ? undefined : { ...w, ready: [...w.ready, uid], rev: w.rev + 1 };
    case "close": return null;
    default: return undefined;
  }
}

module.exports = { cleanSrc, posAt, step };
