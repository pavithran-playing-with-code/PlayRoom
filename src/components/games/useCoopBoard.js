// src/components/games/useCoopBoard.js
// A together board for a game: the move log (coopLog.js) wired to the
// server's ordering (config/coopBoard.js).
//
//   const cb = useCoopBoard({ on, roomCode, isSpectator, myId, rules, init });
//   cb.view      what to draw: the agreed board plus my moves on their way
//   cb.agreed    the board everybody agrees on (the score that's synced)
//   cb.send(a)   make a move — shown at once, put in order by the server
//   cb.ready     the moves made before this phone arrived have been played
//
// Off (`on` false), it does nothing and the game plays on its own.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSocket } from "../../utils/SocketContext";
import { newLog, take, hasGap, differs, restart, propose, drop, view } from "./coopLog";

let named = 0;

export default function useCoopBoard({ on, roomCode, isSpectator = false, myId, rules, init }) {
  const { socket } = useSocket() || {};
  const L = useRef(null);
  if (L.current === null) L.current = newLog(rules, init);
  const shown = useRef(init);
  const [, redraw] = useState(0);
  const [ready, setReady] = useState(false);
  const code = String(roomCode || "").toUpperCase();

  const refresh = useCallback(() => {
    shown.current = view(L.current);
    redraw((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!on || !socket || !code) return undefined;
    const hello = () => socket.emit("cb:hello", { code, from: L.current.n });
    // my moves the server hasn't answered: again (it ignores repeats)
    const resend = () => {
      if (isSpectator) return;
      for (const p of L.current.pending) socket.emit("cb:act", { code, a: p.a, c: p.c });
    };
    const startOver = () => { restart(L.current); socket.emit("cb:sync", { code, from: 0 }); };

    const onAct = (m) => {
      if (!m || m.code !== code) return;
      if (differs(L.current, m)) { startOver(); return; }
      take(L.current, m);
      if (hasGap(L.current)) socket.emit("cb:sync", { code, from: L.current.n });
      refresh();
    };
    const onLog = (m) => {
      if (!m || m.code !== code || !Array.isArray(m.acts)) return;
      if (m.acts.some((a) => differs(L.current, a))) { startOver(); return; }
      for (const a of m.acts) take(L.current, a);
      const total = Number(m.total) || 0;
      if (total < L.current.n) {
        // the server has fewer moves than we've played: it restarted
        if (total === 0 && !isSpectator) socket.emit("cb:restore", { code, acts: L.current.acts });
        else { startOver(); return; }
      }
      resend();
      setReady(true);
      refresh();
    };
    const onNack = (m) => {
      if (m && m.code === code && drop(L.current, m.c)) refresh();
    };

    socket.on("cb:act", onAct);
    socket.on("cb:log", onLog);
    socket.on("cb:nack", onNack);
    socket.on("connect", hello);
    hello();
    return () => {
      socket.off("cb:act", onAct);
      socket.off("cb:log", onLog);
      socket.off("cb:nack", onNack);
      socket.off("connect", hello);
    };
  }, [on, socket, code, isSpectator, refresh]);

  const send = useCallback((a) => {
    if (!on || isSpectator) return;
    const c = `${myId}.${Date.now().toString(36)}.${(named += 1)}`;
    propose(L.current, myId, a, c);
    refresh();
    if (socket) socket.emit("cb:act", { code, a, c });
  }, [on, isSpectator, myId, socket, code, refresh]);

  return { view: shown.current, agreed: L.current.agreed, send, ready };
}

// The little shows a board asks for (a pair found, a miss), each played once
// on this phone even though the board is worked out again and again. What
// happened before this phone caught up (a reload mid-match) isn't replayed.
// Played before the screen is painted, so a show that holds the old board up
// a moment (a cleared deck) never lets the new one flash through first.
export function useShows(ready, ev, play) {
  const seen = useRef(null);
  const playRef = useRef(play);
  useLayoutEffect(() => { playRef.current = play; });
  useLayoutEffect(() => {
    if (!ready || !ev) return;
    if (seen.current === null) { seen.current = new Set(ev.map((e) => e.id)); return; }
    for (const e of ev) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      playRef.current(e);
    }
  }, [ready, ev]);
}
