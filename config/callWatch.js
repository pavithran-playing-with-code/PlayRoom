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
  if (s.kind === "yt") {
    // a YouTube video (routes/youtube.js found it): its id, and what to show
    const id = typeof s.id === "string" && /^[\w-]{11}$/.test(s.id) ? s.id : "";
    const title = typeof s.title === "string" ? s.title.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 150) : "";
    const ch = typeof s.ch === "string" ? s.ch.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) : "";
    const dur = Number(s.dur);
    if (!id || !(dur > 0 && dur < DAY)) return null;
    return { kind: "yt", id, name: title || "YouTube video", ch, dur };
  }
  return null;
}

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];   // YouTube's speeds

// Where the video is at `now` (server ms), at its speed.
function posAt(w, now) {
  if (!w) return 0;
  const p = w.playing ? w.pos + ((now - w.at) / 1000) * (w.rate || 1) : w.pos;
  return Math.max(0, Math.min(w.src.dur, p));
}

// One change from `uid`. Returns the new state, `null` for "nothing on"
// (closed), or `undefined` when the message is ignored.
//
// wait / go: someone's player got stuck (YouTube showing them an ad, or
// still loading) — everyone holds where they are until it plays, then goes
// on together. Any play, pause or seek ends a hold.
function step(w, msg, uid, now) {
  const op = msg && msg.op;
  const at = (p) => Math.max(0, Math.min(w.src.dur, Number.isFinite(Number(p)) ? Number(p) : posAt(w, now)));
  if (op === "open") {
    const src = cleanSrc(msg.src);
    if (!src) return undefined;
    return { src, by: uid, playing: false, pos: 0, at: now, rev: (w ? w.rev : 0) + 1, ready: [uid], hold: null };
  }
  if (!w) return undefined;
  switch (op) {
    case "play": return { ...w, playing: true, pos: at(msg.pos), at: now, rev: w.rev + 1, hold: null };
    case "pause": return { ...w, playing: false, pos: at(msg.pos), at: now, rev: w.rev + 1, hold: null };
    case "seek": return { ...w, pos: at(msg.pos), at: now, rev: w.rev + 1, hold: null };
    case "wait": return w.playing && !w.hold ? { ...w, playing: false, pos: at(msg.pos), at: now, rev: w.rev + 1, hold: uid } : undefined;
    case "go": return w.hold === uid ? { ...w, playing: true, pos: at(msg.pos), at: now, rev: w.rev + 1, hold: null } : undefined;
    case "rate": return RATES.includes(Number(msg.rate)) && Number(msg.rate) !== (w.rate || 1)
      ? { ...w, pos: at(msg.pos), at: now, rate: Number(msg.rate), rev: w.rev + 1 } : undefined;
    case "ready": return w.ready.includes(uid) ? undefined : { ...w, ready: [...w.ready, uid], rev: w.rev + 1 };
    case "close": return null;
    default: return undefined;
  }
}

module.exports = { cleanSrc, posAt, step, RATES };
