// src/components/games/finalSync.js
// Called once, the moment a match ends.
//
// The server now decides who won by comparing the scores stored in
// room_players, so those scores have to be current before anyone asks. Two
// things get in the way:
//
//   1. The periodic sync runs every 2s, so a player's last few points may not
//      have been pushed yet. → we force one final PATCH.
//   2. Every client's clock expires at the same server-anchored instant, so
//      they all race to report. If we asked for the result immediately we might
//      read an opponent's score from up to a sync-interval ago. → we pause
//      briefly so their final PATCH lands first.
//
// The server's grace window on late score writes (CLOCK_GRACE_SECONDS in
// routes/rooms.js) is what makes step 1 legal after the deadline; SETTLE_MS
// must stay comfortably inside it.
import { api } from "../../utils/api";

export const SETTLE_MS = 1200;

export async function finalSync(roomCode, payload) {
  if (!roomCode) return;
  try {
    await api.patch(`/api/rooms/${roomCode}/score`, payload);
  } catch { /* the stored score stands */ }
  await new Promise((r) => setTimeout(r, SETTLE_MS));
}
