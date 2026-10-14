// src/components/games/useSpecStream.js
// Watching a real-time game (a car, a runner, a song) as it happens.
//
// useSpectate (beside this) carries a board on every move, which is right for
// a puzzle but far too coarse for something that moves every frame: a
// spectator of Speedway saw only the points. This is the fast lane:
//
//   • the watcher asks for one player's frames every 2s (room:frame-want);
//   • that player's phone, while anyone has asked in the last few seconds,
//     sends a small picture of its game `hz` times a second (room:frame) —
//     nobody watching, nothing sent;
//   • config/socket.js relays both, volatile: a slow watcher drops frames
//     rather than queueing them, so it never falls behind.
//
// A game wires it once, for both sides:
//
//   const spec = useSpecStream({ roomCode, isSpectator, myId,
//     watchId: spectatorWatching?.user_id,
//     frame: () => ({ x: live.current.x, … }),     // player: what to send (small: < 6 KB as JSON)
//     onFrame: (f) => { … },                      // watcher: optional, on each frame
//   });
//   // watcher: spec.current is { f, at, prev, prevAt } — the latest frame, when
//   // it came (performance.now()), and the one before, to ease between them.
//
// The watcher draws the game's own scene from the frame (the world itself
// comes from the room's seed, like everyone else's), with input refused.
import { useEffect, useRef } from "react";
import { useSocket } from "../../utils/SocketContext";

const WANT_EVERY_MS = 2000;     // a watcher repeats its ask this often
const WANT_TTL_MS = 6000;       // a player stops sending this long after the last ask

export default function useSpecStream({ roomCode, isSpectator, myId, watchId, hz = 15, frame, onFrame }) {
  const { socket } = useSocket() || {};
  const frameRef = useRef(frame);
  const onRef = useRef(onFrame);
  frameRef.current = frame;
  onRef.current = onFrame;
  const latest = useRef(null);

  // the watcher: ask for frames, and keep the latest two
  useEffect(() => {
    if (!socket || !roomCode || !isSpectator || watchId == null) return undefined;
    const target = Number(watchId);
    latest.current = null;
    const want = () => socket.emit("room:frame-want", { code: roomCode, target });
    want();
    const timer = setInterval(want, WANT_EVERY_MS);
    const on = (m) => {
      if (!m || Number(m.user_id) !== target) return;
      let f;
      try { f = JSON.parse(m.f); } catch { return; }
      const now = performance.now(), last = latest.current;
      latest.current = { f, at: now, prev: last ? last.f : null, prevAt: last ? last.at : null };
      if (onRef.current) { try { onRef.current(f); } catch { /* one bad frame is not worth a crash */ } }
    };
    socket.on("room:frame", on);
    return () => { clearInterval(timer); socket.off("room:frame", on); };
  }, [socket, roomCode, isSpectator, watchId]);

  // the player: send while somebody is watching
  useEffect(() => {
    if (!socket || !roomCode || isSpectator) return undefined;
    let wantedAt = 0;
    const me = Number(myId);
    const onWant = (m) => { if (m && Number(m.target) === me) wantedAt = Date.now(); };
    socket.on("room:frame-want", onWant);
    const timer = setInterval(() => {
      if (!wantedAt || Date.now() - wantedAt > WANT_TTL_MS || !frameRef.current) return;
      let f;
      try { f = frameRef.current(); } catch { return; }
      if (f == null) return;
      const s = JSON.stringify(f);
      if (s.length <= 6000) socket.emit("room:frame", { code: roomCode, f: s });
    }, Math.max(33, Math.round(1000 / hz)));
    return () => { clearInterval(timer); socket.off("room:frame-want", onWant); };
  }, [socket, roomCode, isSpectator, myId, hz]);

  return latest;
}

// Ease a number between the last two frames: `k` past the newest, as a
// fraction of the gap between them (0 = the newer frame, up to 1 = one gap on).
// Lets a watcher draw at 60 fps from 15 frames a second.
export function specLerp(spec, pick, now = performance.now()) {
  const L = spec && spec.current;
  if (!L) return null;
  const b = pick(L.f);
  if (L.prev == null || L.prevAt == null || typeof b !== "number") return b;
  const a = pick(L.prev);
  if (typeof a !== "number") return b;
  const gap = Math.max(1, L.at - L.prevAt), k = Math.min(1, (now - L.at) / gap);
  return b + (b - a) * k;          // carry on the way it was going, a gap at most
}
