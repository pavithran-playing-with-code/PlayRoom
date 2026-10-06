// src/components/games/useRunTogether.js
// Running together (runTogether.js): where everyone else is, and the hearts
// that bring you back.
//
//   const rt = useRunTogether({ on, roomCode, isSpectator, myId, onRevive });
//   rt.tell({ d, v, y, l, dn, h })  where I am — call it every frame, it
//                                   sends ~8 times a second
//   rt.mates()                      the others: [{ id, d, y, l, dn }], their
//                                   distance carried on at their speed since
//                                   they last said, so they glide, not jump
//
// Every message carries how many hearts that runner has grabbed (h). When a
// friend's count goes up, everyone who's down gets up (onRevive(id)). A lost
// message doesn't matter: the next one still carries the higher count.
import { useCallback, useEffect, useRef } from "react";
import { useSocket } from "../../utils/SocketContext";

const SEND_MS = 120;
const STALE_MS = 4000;      // not heard from for this long: not drawn

export default function useRunTogether({ on, roomCode, isSpectator = false, myId, onRevive }) {
  const { socket } = useSocket() || {};
  const mates = useRef(new Map());
  const reviveRef = useRef(onRevive);
  useEffect(() => { reviveRef.current = onRevive; });
  const lastSent = useRef(0);

  useEffect(() => {
    if (!on || !socket || !roomCode) return undefined;
    const onPos = (m) => {
      const id = Number(m && m.user_id);
      if (!id || id === myId) return;
      const had = mates.current.get(id);
      mates.current.set(id, { id, d: m.d, v: m.v, y: m.y, l: m.l, dn: !!m.dn, h: m.h, at: performance.now() });
      if (had && m.h > had.h && reviveRef.current) reviveRef.current(id);
    };
    socket.on("run:pos", onPos);
    return () => socket.off("run:pos", onPos);
  }, [on, socket, roomCode, myId]);

  const tell = useCallback((me) => {
    if (!on || !socket || isSpectator) return;
    const now = performance.now();
    if (now - lastSent.current < SEND_MS) return;
    lastSent.current = now;
    socket.emit("run:pos", { code: roomCode, ...me, dn: me.dn ? 1 : 0 });
  }, [on, socket, isSpectator, roomCode]);

  const list = useCallback(() => {
    const now = performance.now(), out = [];
    for (const m of mates.current.values()) {
      if (now - m.at > STALE_MS) continue;
      const ahead = m.dn ? 0 : Math.min(0.5, (now - m.at) / 1000) * (m.v || 0);
      out.push({ ...m, d: m.d + ahead });
    }
    return out;
  }, []);

  return { tell, mates: list };
}
