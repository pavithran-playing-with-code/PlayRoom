// src/components/games/HollowGameInner.jsx
// Hollow Hours in a room: the match engine (score sync, the end of the
// match, results) around the game's own view (pages/Hollow.jsx, HollowView).
// The match has no clock; it's won once the players come out through the
// clock face (pairs_matched 1 — config/matchResult.js, COOP_GOAL / OBJECTIVE_PAIRS),
// and it ends when they leave.
import React, { useRef } from "react";
import useGameEngine from "./useGameEngine";
import { HollowView } from "../../pages/Hollow";

export default function HollowGameInner({ roomCode, seed, players, currentUser, mode, durationSeconds = 0, startedAt, serverNow,
  onGameEnd, isSpectator = false, spectatorWatching = null }) {
  const done = useRef(false);
  const eng = useGameEngine({
    roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: () => ({ pairs_matched: done.current ? 1 : 0 }),
  });
  void seed;
  return <HollowView room={{ roomCode, players, currentUser, mode, isSpectator, spectatorWatching, eng, done }} />;
}
