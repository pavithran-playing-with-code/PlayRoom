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
const OBJECTIVE_PAIRS = { mahjong: 24, memory: 10 };

// Boards a together side has to clear for the match to be a win. Must match
// GOAL in src/components/games/coopBoards.js (scripts/check-coop.mjs proves it).
// Sunshard Islands: pairs_matched is 1 once the side has lit the temple.
const COOP_GOAL = { maze: 1, memory: 1, mahjong: 1, numbers: 5, pipes: 3, sunshard: 1 };
// Word Rush together: words solved as a side, more for a longer clock and a
// bigger side. = wordGoal in coopBoards.js.
const wordGoal = (secs, n) => Math.max(4, Math.round((3 * (Number(secs) || 120) * Math.max(1, n)) / 60));
// Running together: everyone's points added up, against PACE points a second
// for each player. = PACE / teamGoal in src/components/games/runTogether.js.
const COOP_PACE = { runner: 22, dino: 18, flappy: 2 };
const teamGoal = (slug, secs, n) => Math.round(((COOP_PACE[slug] || 0) * (Number(secs) || 120) * Math.max(1, n)) / 10) * 10;

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
// The server keeps this game's scores itself (config/manorWorld.js). A match
// runs the whole clock: getting out scores ESCAPE_POINTS and you go round
// again; every relic is RELIC 100. One round's relics (at most 9, a four-
// player co-op: MAX_RELIC_POINTS) never reach ESCAPE_POINTS, so a score of
// ESCAPE_POINTS or more means the side got out at least once.
//
// When the clock stops the highest score wins, a tie at the top is a draw —
// but nobody wins without getting out: a match where nobody escaped has no
// winner, however many relics were found. Sides are compared on their own
// score, not a sum over members: every member of a side carries the side's
// score, so summing would hand the win to the bigger team.
const ESCAPE_POINTS = 1000;
const MAX_RELIC_POINTS = 900;

function manorResults(room, seated) {
  const out = new Map();
  const sideOf = (p) => (room.mode === "coop" ? "all"
    : room.mode === "teams" && p.team != null ? `t${p.team}` : `p${p.user_id}`);
  const side = new Map();
  for (const p of seated) side.set(sideOf(p), Math.max(side.get(sideOf(p)) || 0, cap(p.score)));
  const escaped = [...side.values()].filter((v) => v >= ESCAPE_POINTS);
  const best = escaped.length ? Math.max(...escaped) : null;
  const tied = best === null ? 0 : escaped.filter((v) => v === best).length;
  for (const p of seated) {
    const mine = side.get(sideOf(p));
    out.set(Number(p.user_id), best === null || mine !== best ? "loss" : tied > 1 ? "draw" : "win");
  }
  return out;
}

// ── The games you play together ──────────────────────────────────────────────
// Kitchen Rush, Bomb Blast, Tower Guard and Carrom (config/togetherWorld.js) keep
// their own scores, one per side, carried by every member of the side; and
// pairs_matched is 1 once a side has reached its goal. With several sides the
// best score wins (a tie at the top is a draw). With one side — a solo run, or
// everybody together — there's nobody to beat: reaching the goal is the win.
const TOGETHER_GAMES = new Set(["kitchen", "bomb", "tower", "carrom"]);

function togetherResults(room, seated) {
  const out = new Map();
  const sideOf = (p) => (room.mode === "coop" ? "all"
    : room.mode === "teams" && p.team != null ? `t${p.team}` : `p${p.user_id}`);
  const score = new Map(), goal = new Map();
  for (const p of seated) {
    const k = sideOf(p);
    score.set(k, Math.max(score.get(k) || 0, cap(p.score)));
    goal.set(k, goal.get(k) || (Number(p.pairs_matched) || 0) >= 1);
  }
  if (score.size === 1) {
    for (const p of seated) out.set(Number(p.user_id), goal.get(sideOf(p)) ? "win" : "loss");
    return out;
  }
  const best = Math.max(...score.values());
  const tied = [...score.values()].filter((v) => v === best).length;
  for (const p of seated) {
    const mine = score.get(sideOf(p));
    out.set(Number(p.user_id), mine < best ? "loss" : tied > 1 ? "draw" : "win");
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
  if (TOGETHER_GAMES.has(room.game_slug)) return togetherResults(room, seated);
  const out = new Map();

  // Played together on one board (Maze Runner, and Memory, Mahjong, Number
  // Rush and Pipes — config/coopBoard.js): one side, one score, and
  // pairs_matched is the boards the side has cleared. Reaching the game's
  // goal is a win for everyone; short of it, a loss.
  if (room.mode === "coop" && COOP_PACE[room.game_slug]) {
    const total = seated.reduce((t, p) => t + cap(p.score), 0);
    const won = total >= teamGoal(room.game_slug, room.duration_seconds, seated.length);
    for (const p of seated) out.set(Number(p.user_id), won ? "win" : "loss");
    return out;
  }
  if (room.mode === "coop" && room.game_slug === "wordrush") {
    const won = seated.some((p) => (Number(p.pairs_matched) || 0) >= wordGoal(room.duration_seconds, seated.length));
    for (const p of seated) out.set(Number(p.user_id), won ? "win" : "loss");
    return out;
  }
  if (room.mode === "coop" && COOP_GOAL[room.game_slug]) {
    const won = seated.some((p) => (Number(p.pairs_matched) || 0) >= COOP_GOAL[room.game_slug]);
    for (const p of seated) out.set(Number(p.user_id), won ? "win" : "loss");
    return out;
  }

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

module.exports = { MAX_SCORE_PER_GAME, OBJECTIVE_PAIRS, COOP_GOAL, COOP_PACE, teamGoal, wordGoal, ESCAPE_POINTS, MAX_RELIC_POINTS, cap, decideResult, resultsFor, manorResults, togetherResults, TOGETHER_GAMES };
