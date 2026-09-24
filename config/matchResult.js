// config/matchResult.js — who won, decided from stored scores alone.
//
// No database and no Express here on purpose: this is the part that decides
// people's records, so it has to be testable on its own.
// Hard caps prevent a tampered client from posting absurd scores.
// Memory max ~5k, Mahjong max ~12k. 25k leaves headroom for future games.
const MAX_SCORE_PER_GAME = 25000;

// Pairs required to clear the board, for the games that HAVE a win condition.
// Games absent from this map are pure score-attack: there is nothing to
// "complete", so a solo run of one is recorded as `incomplete` rather than
// being scored as a win or a loss.
// Must match TOTAL_PAIRS in the game component — see src/components/MahjongGame.jsx.
const OBJECTIVE_PAIRS = { mahjong: 24, memory: 16 };

const cap = (n) => Math.max(0, Math.min(Number(n) || 0, MAX_SCORE_PER_GAME));

/**
 * Decide the outcome of a match from data the server already holds.
 *
 * Previously the client simply POSTed `won: true|false` and we believed it,
 * which is why every row in game_sessions says 'loss': no game ever managed to
 * report a win, and nothing stopped a modified client from claiming one.
 *
 * Rules:
 *   • 2+ seated players → highest score wins; a tie for top is a draw.
 *   • solo + objective game → win if the board was cleared, else loss.
 *   • solo + score-attack  → 'incomplete' (counts as played, not as win/loss).
 */
function decideResult({ seated, myUserId, myScore, gameSlug }) {
  if (seated.length > 1) {
    const best = Math.max(...seated.map(p => cap(p.score)));
    if (myScore < best) return "loss";
    const tiedAtTop = seated.filter(p => cap(p.score) === best).length;
    return tiedAtTop > 1 ? "draw" : "win";
  }
  const needed = OBJECTIVE_PAIRS[gameSlug];
  if (!needed) return "incomplete";
  const me = seated.find(p => Number(p.user_id) === Number(myUserId));
  return (Number(me?.pairs_matched) || 0) >= needed ? "win" : "loss";
}

// Everyone's outcome, decided together.
//
// In a team room the sides are ranked on the straight total of their members'
// scores and the whole winning side gets the win — one player carrying a weak
// team still wins it for them, which is the point of playing as a team. A
// bigger side has an advantage under a straight total, so the waiting room
// shows team sizes; that is a deliberate trade, not an oversight.
//
// Anyone who somehow reached the start without a side is scored as their own
// one-person team rather than being dropped from the reckoning.
function resultsFor(room, seated) {
  const out = new Map();

  if (room.mode === "teams" && seated.some(p => p.team != null)) {
    const sideOf = (p) => (p.team == null ? `solo:${p.user_id}` : `team:${p.team}`);
    const totals = new Map();
    for (const p of seated) totals.set(sideOf(p), (totals.get(sideOf(p)) || 0) + cap(p.score));
    const best = Math.max(...totals.values());
    const tiedAtTop = [...totals.values()].filter(v => v === best).length;
    for (const p of seated) {
      const mine = totals.get(sideOf(p));
      out.set(Number(p.user_id), mine < best ? "loss" : tiedAtTop > 1 ? "draw" : "win");
    }
    return out;
  }

  for (const p of seated) {
    out.set(Number(p.user_id), decideResult({
      seated, myUserId: Number(p.user_id), myScore: cap(p.score), gameSlug: room.game_slug,
    }));
  }
  return out;
}

module.exports = { MAX_SCORE_PER_GAME, OBJECTIVE_PAIRS, cap, decideResult, resultsFor };
