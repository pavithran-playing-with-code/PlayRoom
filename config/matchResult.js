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

// ── Hollow Manor ─────────────────────────────────────────────────────────────
// The server keeps this game's scores itself (config/manorWorld.js), and
// they encode the result: 100 a relic, and getting out adds ESCAPE_BONUS plus
// PLACE_STEP for every place you beat. So "got out" is score >= ESCAPE_BONUS,
// and a higher escaped score got out earlier.
//
// Both steps must be bigger than the most relic points a side can hold (13
// relics in a four-player co-op: 1300). With smaller ones a side that got out
// second with more relics tied the side that got out first, and a co-op that
// took every relic and was then caught read as escaped.
//
// Nobody wins without getting out — a free-for-all where everyone is caught
// has no winner, however many relics they held. Sides are compared on their
// own score, not a sum over members: every member of a side carries the
// side's score, so summing would hand the win to the bigger team.
const ESCAPE_BONUS = 5000;
const PLACE_STEP = 2000;
const MAX_RELIC_POINTS = 1300;

function manorResults(room, seated) {
  const out = new Map();
  const sideOf = (p) => (room.mode === "coop" ? "all"
    : room.mode === "teams" && p.team != null ? `t${p.team}` : `p${p.user_id}`);
  const side = new Map();
  for (const p of seated) side.set(sideOf(p), Math.max(side.get(sideOf(p)) || 0, cap(p.score)));
  const escaped = [...side.values()].filter((v) => v >= ESCAPE_BONUS);
  const best = escaped.length ? Math.max(...escaped) : null;
  for (const p of seated) {
    const mine = side.get(sideOf(p));
    out.set(Number(p.user_id), best !== null && mine === best ? "win" : "loss");
  }
  return out;
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
  if (room.game_slug === "manor") return manorResults(room, seated);
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

module.exports = { MAX_SCORE_PER_GAME, OBJECTIVE_PAIRS, ESCAPE_BONUS, PLACE_STEP, MAX_RELIC_POINTS, cap, decideResult, resultsFor, manorResults };
