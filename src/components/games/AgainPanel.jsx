// src/components/games/AgainPanel.jsx
// Play again, on every results card: who in the room is ready to go again,
// and the button. Tapping it says you're ready; when everyone still in the
// room is, the next match starts for all of you at once (Room.jsx, POST
// /api/rooms/:code/again). Tapping it again, while you wait, takes it back.
//
// `onPlay` is the card's own handler (it records the match, then calls the
// room's start()); the card keeps its own "busy"/error state.
import React, { useEffect } from "react";
import { usePlayAgain } from "./PlayAgain";

export default function AgainPanel({ me, onPlay, busy = false, leaving = false, className = "press p-coral lg full", dark = false }) {
  const ctx = usePlayAgain();
  const load = ctx && ctx.load;
  useEffect(() => { if (load) load(); }, [load]);
  if (!ctx) return null;
  const myId = Number(me?.id);
  const members = (ctx.again && ctx.again.members) || [];
  const mine = members.find((m) => m.id === myId);
  const waitingFor = members.filter((m) => !m.ready && m.id !== myId).map((m) => m.name);
  const ready = !!(mine && mine.ready);
  return (
    <div className={`again${dark ? " dark" : ""}`}>
      {members.length > 1 && (
        <ul className="again-list" aria-label="Who's ready to play again">
          {members.map((m) => (
            <li key={m.id} className={m.ready ? "on" : ""}>
              <span aria-hidden="true">{m.ready ? "✓" : "⏳"}</span>
              <b>{m.id === myId ? "You" : m.name}</b>
              <small>{m.ready ? "ready" : "not yet"}</small>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={className} disabled={busy || leaving}
        onClick={ready ? () => ctx.notReady && ctx.notReady() : onPlay}>
        {busy ? "Setting up…"
          : ready ? (waitingFor.length ? `✓ Ready — waiting for ${waitingFor.join(", ")}` : "✓ Ready — starting…")
          : "🔄 Play again"}
      </button>
      {ready && waitingFor.length > 0 && <p className="again-note">The next game starts the moment everyone's ready. Tap again to change your mind.</p>}
    </div>
  );
}
