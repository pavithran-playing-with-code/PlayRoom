// src/components/games/racerSim.js
// Turbo Racer's rules: three lanes, traffic coming the other way, coins worth
// grabbing, and a road that keeps speeding up. No drawing and no React, so the
// rules can be exercised from a plain Node script.
//
// Everyone in a room gets the same traffic in the same order, from the room's
// seed — otherwise it is not a race, it is two people playing alone.
import { seededRand } from "./seededRand";

export const VIEW_W = 300;
export const VIEW_H = 440;
export const LANES = 3;
export const ROAD_X = 24;                     // verge either side
export const ROAD_W = VIEW_W - ROAD_X * 2;
export const LANE_W = ROAD_W / LANES;
export const CAR_W = 34;
export const CAR_H = 56;
export const CAR_Y = VIEW_H - 92;             // the player sits near the bottom

export const BASE_SPEED = 3.4;
export const SPEED_GAIN = 0.00035;            // creeps up every frame, no cap
export const SPAWN_START = 60;                // frames between spawns
export const SPAWN_FLOOR = 26;
export const COIN_CHANCE = 0.15;
export const COIN_POINTS = 25;
export const PASS_POINTS = 5;                 // for a car you got past
export const DISTANCE_DIVISOR = 8;

export const TRAFFIC_COLOURS = ["#FF6B6B", "#4CC9F0", "#B5E655", "#9B5DE5"];

export const laneCentre = (lane) => ROAD_X + LANE_W * lane + LANE_W / 2;

export function newRace(seed) {
  const rand = seededRand((Number(seed) || 1) * 7717 + 13);
  for (let i = 0; i < 6; i++) rand();
  return {
    rand,
    lane: 1,                    // the lane being steered to
    x: laneCentre(1),           // where the car actually is, easing across
    tilt: 0,
    frame: 0,
    distance: 0,
    speed: BASE_SPEED,
    things: [],                 // { kind: "car"|"coin", lane, y, colour, scored }
    nextSpawn: 20,
    points: 0,                  // coins and passes, on top of distance
    crashed: false,
  };
}

export const steer = (s, dir) => {
  if (s.crashed) return;
  s.lane = Math.max(0, Math.min(LANES - 1, s.lane + dir));
};
export const steerTo = (s, lane) => {
  if (s.crashed) return;
  s.lane = Math.max(0, Math.min(LANES - 1, Math.round(lane)));
};

export const distanceScore = (s) => Math.floor(s.distance / DISTANCE_DIVISOR);
export const totalScore = (s) => distanceScore(s) + s.points;

const overlaps = (s, t) => {
  if (t.lane !== s.lane) return false;
  const half = t.kind === "coin" ? 14 : CAR_H / 2;
  return Math.abs(t.y - CAR_Y) < half + CAR_H / 2 - 10;
};

// One frame. `dtFrames` is how many 60ths of a second have passed, so a slow
// phone runs the same race as a fast one rather than a slower one.
export function step(s, dtFrames = 1) {
  if (s.crashed) return { crashed: false, coins: 0, passed: 0 };
  const d = Math.max(0, Math.min(3, dtFrames));
  s.frame += d;
  s.speed += SPEED_GAIN * d * 60;
  s.distance += s.speed * d;

  // the car slides toward its lane rather than snapping to it
  const target = laneCentre(s.lane);
  const dx = target - s.x;
  s.x += dx * Math.min(1, 0.2 * d);
  s.tilt = Math.max(-0.35, Math.min(0.35, dx / 90));

  s.nextSpawn -= d;
  if (s.nextSpawn <= 0) {
    const gap = Math.max(SPAWN_FLOOR, SPAWN_START - s.speed * 4);
    s.nextSpawn = gap;
    const lane = Math.floor(s.rand() * LANES);
    const coin = s.rand() < COIN_CHANCE;
    s.things.push({
      kind: coin ? "coin" : "car",
      lane,
      y: -60,
      colour: TRAFFIC_COLOURS[Math.floor(s.rand() * TRAFFIC_COLOURS.length)],
      scored: false,
    });
  }

  let coins = 0;
  let passed = 0;
  let crashed = false;
  for (const t of s.things) {
    t.y += s.speed * d;
    if (t.scored) continue;
    if (overlaps(s, t)) {
      if (t.kind === "coin") { t.scored = true; t.gone = true; coins += 1; s.points += COIN_POINTS; }
      else { crashed = true; }
    } else if (t.y > CAR_Y + CAR_H && t.kind === "car") {
      // went by in another lane — a near thing is worth something
      t.scored = true;
      passed += 1;
      s.points += PASS_POINTS;
    }
  }
  s.things = s.things.filter((t) => !t.gone && t.y < VIEW_H + 80);

  if (crashed) s.crashed = true;
  return { crashed, coins, passed };
}
