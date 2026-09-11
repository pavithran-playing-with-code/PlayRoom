// src/components/games/useGameEngine.js
// Shared engine for every PlayRoom game. Handles the time-boxed match model:
//   • countdown clock seeded from the room's duration (2–5 min)
//   • periodic score sync to the backend (online play)
//   • opponent score tracking via /poll
//   • game-over + winner determination ("most points wins; finishing early
//     banks a completion bonus, so first-to-finish naturally tops the board")
//
// A game component owns its own play logic and just calls addScore()/finish();
// the engine owns time, sync, and who-won.

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../utils/api";
import { finalSync } from "./finalSync";

export default function useGameEngine({
  roomCode,
  players = [],
  currentUser,
  durationSeconds = 120,
  startedAt = null,
  serverNow = null,
  isSpectator = false,
  spectatorWatching = null,
  onGameEnd,
}) {
  const isOnline = !!roomCode;

  // Remaining seconds. If the server told us when the match started, anchor to
  // it so latecomers/spectators see the correct remaining time; else full clock.
  const initialRemaining = (() => {
    if (startedAt && serverNow) {
      const elapsed = Math.floor((new Date(serverNow) - new Date(startedAt)) / 1000);
      return Math.max(0, durationSeconds - elapsed);
    }
    return durationSeconds;
  })();

  const [timeLeft, setTimeLeft] = useState(initialRemaining);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [finished, setFinished] = useState(false); // objective completed early
  const [opponents, setOpponents] = useState({});   // username -> {score, avatar}

  const timerRef = useRef(null);
  const syncRef = useRef(null);
  const liveRef = useRef({ score: 0, moves: 0 });
  useEffect(() => { liveRef.current = { score, moves }; }, [score, moves]);

  // ── Countdown (players only; spectators mirror the watched player) ──
  useEffect(() => {
    if (isSpectator) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timerRef.current); setGameOver(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isSpectator]);

  // ── Score sync + opponent poll (online players only) ──
  // Stops as soon as the match is over so we don't keep hammering a room the
  // server has already closed.
  useEffect(() => {
    if (!isOnline || isSpectator || gameOver) return;
    syncRef.current = setInterval(async () => {
      try {
        const s = liveRef.current;
        const put = await api.patch(`/api/rooms/${roomCode}/score`, { score: s.score, moves: s.moves });
        // The server owns the deadline. If it says the match is over, believe
        // it — our local countdown may be behind, paused, or tampered with.
        if (put.status === 409) { setGameOver(true); return; }

        const res = await api.get(`/api/rooms/${roomCode}/poll`);
        const data = await res.json();
        if (data.success) {
          if (data.status === "finished" || data.status === "abandoned") setGameOver(true);
          const opp = {};
          (data.players || []).forEach((p) => {
            if (p.user_id !== currentUser?.id && !p.is_spectator)
              opp[p.username] = { score: p.score, avatar: p.avatar, user_id: p.user_id };
          });
          setOpponents(opp);
        }
      } catch { /* silent */ }
    }, 2000);
    return () => clearInterval(syncRef.current);
  }, [isOnline, isSpectator, roomCode, currentUser, gameOver]);

  // ── Game API exposed to the specific game ──
  const addScore = useCallback((delta) => setScore((s) => Math.max(0, s + delta)), []);
  const addMove = useCallback(() => setMoves((m) => m + 1), []);

  // Call when the player completes the objective early (clears board, etc.).
  const finish = useCallback((bonus = 0) => {
    setScore((s) => s + bonus);
    setFinished(true);
    clearInterval(timerRef.current);
    setGameOver(true);
  }, []);

  // ── Outcome, for DISPLAY ONLY ──
  // The authoritative result is computed by the server in
  // POST /api/leaderboard/update from the stored scores; this is just what the
  // GameOver overlay shows while that request is in flight.
  const oppScores = Object.values(opponents).map((o) => Number(o.score) || 0);
  const maxOpp = oppScores.length ? Math.max(...oppScores) : -1;
  // Strictly greater: matching the top score is a draw, not a win. The old
  // `>=` handed both players a victory on a tie.
  const won = oppScores.length ? score > maxOpp : finished;
  const draw = oppScores.length > 0 && score === maxOpp;
  const rank = oppScores.length
    ? 1 + oppScores.filter((s) => s > score).length
    : 1;

  // Push our final score, give opponents a beat to push theirs, then hand off.
  // Room.jsx asks the server for the official result from here.
  const endingRef = useRef(false);
  const endMatch = useCallback(async () => {
    if (endingRef.current) return;      // double-click / quit-then-timeout
    endingRef.current = true;
    const s = liveRef.current;
    if (isOnline) await finalSync(roomCode, { score: s.score, moves: s.moves });
    onGameEnd && onGameEnd(s.score, 0, s.moves, won);
  }, [onGameEnd, won, isOnline, roomCode]);

  const fmt = (sec) =>
    `${Math.floor(sec / 60).toString().padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;

  return {
    isOnline,
    timeLeft, durationSeconds, fmt,
    score, setScore, addScore,
    moves, addMove,
    gameOver, finished, finish,
    opponents, oppScores, won, draw, rank,
    endMatch,
  };
}
