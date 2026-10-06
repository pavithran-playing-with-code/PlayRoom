// src/components/games/runTogether.js
// Running together: Rail Runner, Dino Dash and Flappy Dash in a co-op room.
// No React, so scripts/check-coop.mjs can check it.
//
// Everyone runs the same course and sees the others running beside them
// (run:pos, relayed by config/socket.js; useRunTogether.js). Together, a
// crash knocks you DOWN for DOWN_S seconds instead of a moment — unless a
// friend grabs a ❤️ first, which brings back everybody who's down. The
// hearts are laid along the course from the seed, the same for everyone.
//
// The side's score is everyone's added up, and the match is a win when it
// reaches the team goal: PACE points a second for each player. The server
// works out the same goal (config/matchResult.js: COOP_PACE) — keep them equal.
import { seededRand } from "./seededRand.js";

export const DOWN_S = 5;                       // down this long, if nobody helps
export const PACE = { runner: 22, dino: 18, flappy: 2 };      // do-nothing ≈ 13 / 6 / 0, flawless ≈ 42 / 57 / 6
export const HEART_PTS = { runner: 25, dino: 25, flappy: 10 };
export const teamGoal = (slug, secs, n) => Math.round(((PACE[slug] || 0) * secs * Math.max(1, n)) / 10) * 10;

// Where the hearts are, in the game's own distance: metres (Rail Runner),
// course units (Dino Dash), or which pipe they float in (Flappy Dash).
const LAYOUT = {
  runner: { first: 160, gap: 240, wobble: 80 },
  dino: { first: 2200, gap: 3200, wobble: 900 },
  flappy: { first: 5, gap: 7, wobble: 3 },
};
export function hearts(seed, slug) {
  const L = LAYOUT[slug];
  const rand = seededRand((Number(seed) || 1) * 613 + 71);
  const list = [];
  let at = L.first;
  return (k) => {
    while (list.length <= k) {
      list.push(slug === "flappy" ? Math.round(at) : at);
      at += L.gap + rand() * L.wobble;
    }
    return list[k];
  };
}

// The hearts from `from` up to distance `to`: [{ k, at }]
export function heartsBetween(heartAt, from, to) {
  const out = [];
  for (let k = 0; k < 10000; k++) {
    const at = heartAt(k);
    if (at > to) break;
    if (at >= from) out.push({ k, at });
  }
  return out;
}
