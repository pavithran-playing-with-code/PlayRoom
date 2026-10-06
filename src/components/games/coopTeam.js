// src/components/games/coopTeam.js
// The side on a together board: everyone's colour (the same on every phone —
// by seat, in user id order), the strip of teammates over the board, and the
// "who did what" list on the results.
export const MATE_COLOURS = ["#4CC9F0", "#FF6B6B", "#8FDB5C", "#C77DFF", "#FFC53D", "#FF8FC7"];

export function team(players, myId) {
  const seated = (players || []).filter((p) => !p.is_spectator);
  const ids = seated.map((p) => Number(p.user_id)).sort((a, b) => a - b);
  const colourOf = (id) => MATE_COLOURS[Math.max(0, ids.indexOf(Number(id))) % MATE_COLOURS.length];
  const nameOf = (id) => (Number(id) === myId ? "You"
    : seated.find((p) => Number(p.user_id) === Number(id))?.username || "Someone");
  const count = (by, id) => Number(by?.[String(id)]) || 0;
  // over the board: the others, each with what they've done
  const strip = (by, label) => seated
    .filter((p) => Number(p.user_id) !== myId)
    .map((p) => ({ user_id: Number(p.user_id), username: p.username, avatar: p.avatar,
      col: colourOf(p.user_id), label: label(count(by, p.user_id)) }));
  // on the results: everyone, me too
  const all = (by) => seated.map((p) => ({ user_id: Number(p.user_id), username: p.username, avatar: p.avatar,
    n: count(by, p.user_id), col: colourOf(p.user_id), you: Number(p.user_id) === myId }));
  return { colourOf, nameOf, strip, all };
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
