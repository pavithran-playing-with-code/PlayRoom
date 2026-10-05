// src/components/games/useSpectate.js
// One mechanism so every game can be watched, instead of twelve bespoke ones.
//
// The idea: a game already keeps its truth in a `live` ref and mirrors it into
// React state to render (see CLAUDE.md). So a watcher does not need a special
// screen — it needs the player's state. Send a small snapshot of it, apply the
// incoming one, and the game's ordinary render draws the board it is drawing on
// the other phone.
//
// A game wires it in two lines:
//
//   const spectate = useSpectate({
//     isSpectator, spectatorState,
//     snapshot: () => ({ level: live.current.level, next: live.current.next }),
//     apply: (s) => { live.current.level = s.level; setLevel(s.level); … },
//   });
//   const eng = useGameEngine({ …, extraState: spectate.extraState });
//
// and then drops its "👀 Watching — N pts" stub so the real board renders.
// Input is already refused while spectating: every game guards its handlers on
// isSpectator, which is what keeps a watcher from playing the board they are
// looking at.
//
// What to put in a snapshot: only what cannot be derived. Boards, decks and
// piece order all come from the room's seed, so a level number is usually
// enough to rebuild a whole grid. Keep it small — it rides the socket on every
// move, and the server drops anything over 8KB.
import { useCallback, useEffect, useRef } from "react";

export default function useSpectate({ isSpectator, spectatorState, snapshot, apply }) {
  const snapRef = useRef(snapshot);
  const applyRef = useRef(apply);
  useEffect(() => { snapRef.current = snapshot; applyRef.current = apply; });

  // Handed to the engine, which sends it with every sync and every live push.
  // It is a new function whenever the snapshot changes, and the engine pushes
  // on a new one: a letter picked in Word Rush moves no score and no move
  // count, so before this a watcher saw only finished words, never the
  // letters going in.
  let snapKey = "";
  if (!isSpectator) { try { const s = snapshot ? snapshot() : null; snapKey = s ? JSON.stringify(s) : ""; } catch { snapKey = ""; } }
  const extraState = useCallback(() => {
    if (isSpectator) return {};
    try {
      const s = snapRef.current ? snapRef.current() : null;
      return s ? { game_state: JSON.stringify(s) } : {};
    } catch { return {}; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, snapKey]);

  // Watching: adopt whatever the player last sent. Applying the same snapshot
  // twice must be harmless, because the poll and the live socket both deliver
  // it and they overlap.
  const lastRef = useRef(null);
  useEffect(() => {
    if (!isSpectator || !spectatorState) return;
    const raw = typeof spectatorState === "string" ? spectatorState : JSON.stringify(spectatorState);
    if (raw === lastRef.current) return;           // nothing new, don't re-render
    lastRef.current = raw;
    let parsed = spectatorState;
    if (typeof spectatorState === "string") {
      try { parsed = JSON.parse(spectatorState); } catch { return; }
    }
    try { applyRef.current && applyRef.current(parsed); } catch { /* a bad frame is not worth a crash */ }
  }, [isSpectator, spectatorState]);

  return { extraState };
}
