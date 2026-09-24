// src/components/games/useGameEngine.js
// Shared engine for every PlayRoom game. It owns the time-boxed match model:
//   • the clock: a deadline anchored to the server's start time, so everyone
//     in a room sees the same time left, and a phone in a pocket or a
//     throttled background tab can't make it drift
//   • score sync to the backend every 2s (online play), plus any extra state
//     a game wants stored (Memory and Mahjong send their pairs and board)
//   • opponents' live scores, and the server's word on when the match is over
//   • one final sync the moment the match ends, so the stored score is current
//
// A game owns its play logic and calls addScore()/addMove()/finish(); the
// engine owns time, sync and who-won.

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../utils/api";
import { useSocket } from "../../utils/SocketContext";
import { finalSync } from "./finalSync";

const SYNC_MS = 2000;

function opponentsFrom(list, myId) {
  const out = {};
  (list || []).forEach((p) => {
    const id = Number(p.user_id);
    if (!Number.isFinite(id) || id === myId || p.is_spectator) return;
    out[id] = { user_id: id, username: p.username, avatar: p.avatar, score: Number(p.score) || 0 };
  });
  return out;
}

export default function useGameEngine({
  roomCode,
  players = [],
  currentUser,
  durationSeconds = 120,
  startedAt = null,
  serverNow = null,
  isSpectator = false,
  onGameEnd,
  extraState = null,          // () => ({ pairs_matched, game_state, … }) merged into every sync
}) {
  const isOnline = !!roomCode;
  const myId = Number(currentUser?.id);

  // When the match ends, in local wall-clock ms. If the server told us when it
  // started, the time already gone is taken off, so a late joiner or a reload
  // mid-match sees the real time left instead of a fresh full clock.
  const [deadline] = useState(() => {
    let remaining = durationSeconds;
    if (startedAt && serverNow) {
      const elapsed = (new Date(serverNow).getTime() - new Date(startedAt).getTime()) / 1000;
      if (Number.isFinite(elapsed)) remaining = Math.max(0, Math.min(durationSeconds, durationSeconds - elapsed));
    }
    return Date.now() + remaining * 1000;
  });
  const secondsLeft = useCallback(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)), [deadline]);

  const [timeLeft, setTimeLeft] = useState(secondsLeft);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [finished, setFinished] = useState(false); // objective completed early
  const [closed, setClosed] = useState(false);     // room shut mid-match (host left)
  // Seeded from the room's seat list so the opponent strip is there from the
  // first frame, instead of popping in (and shrinking the board) 2s later.
  const [opponents, setOpponents] = useState(() => (isOnline ? opponentsFrom(players, myId) : {}));

  const live = useRef({ score: 0, moves: 0 });
  useEffect(() => { live.current = { score, moves }; }, [score, moves]);
  const extraRef = useRef(extraState);
  useEffect(() => { extraRef.current = extraState; });
  const overRef = useRef(false);
  useEffect(() => { overRef.current = gameOver; }, [gameOver]);

  const payload = useCallback(() => ({
    score: live.current.score,
    moves: live.current.moves,
    ...(extraRef.current ? extraRef.current() : {}),
  }), []);

  // ── Clock ── recomputed from the deadline on every tick, never counted down.
  // Spectators see it too; only players get sent to the results screen by it.
  useEffect(() => {
    if (gameOver) return undefined;
    const tick = () => {
      const s = secondsLeft();
      setTimeLeft(s);
      if (s <= 0 && !isSpectator) setGameOver(true);
    };
    tick();
    const t = setInterval(tick, 500);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [gameOver, isSpectator, secondsLeft]);

  // ── Score sync + opponent poll (online players only) ──
  // Scores stop being written once the match is over, but the poll keeps
  // going, so the results screen's standings fill in as others finish.
  // A self-scheduling timeout rather than setInterval, so a slow network can't
  // stack requests on top of each other.
  useEffect(() => {
    if (!isOnline || isSpectator) return undefined;
    let alive = true;
    let timer;
    const loop = async () => {
      try {
        if (!overRef.current) {
          const put = await api.patch(`/api/rooms/${roomCode}/score`, payload());
          // The server owns the deadline. If it says the match is over, believe it.
          if (put.status === 409) setGameOver(true);
        }
        const res = await api.get(`/api/rooms/${roomCode}/poll`);
        const data = await res.json();
        if (alive && data.success) {
          if (data.status === "abandoned") { setClosed(true); setGameOver(true); }
          else if (data.status === "finished") setGameOver(true);
          setOpponents(opponentsFrom(data.players, myId));
        }
      } catch { /* network blip: the next round retries */ }
      if (alive) timer = setTimeout(loop, SYNC_MS);
    };
    timer = setTimeout(loop, SYNC_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [isOnline, isSpectator, roomCode, myId, payload]);

  // ── Opponents' scores, live ──
  // The poll above is the fallback. Each player's own sync broadcasts to the
  // room, so a score lands here as soon as it is written rather than waiting
  // for this client's next poll — two polls apart, an opponent's number could
  // be four seconds behind, which reads as wrong rather than late.
  //
  // Room.jsx owns the room:join, and it stays mounted while the game renders,
  // so this only has to listen.
  const socket = useSocket();
  useEffect(() => {
    if (!socket || !isOnline || !roomCode) return undefined;
    const onScore = (p) => {
      const id = Number(p?.user_id);
      if (!Number.isFinite(id) || id === myId) return;
      setOpponents((prev) => {
        const had = prev[id];
        if (!had) return prev;                    // not a seat we're showing
        const score = Number(p.score) || 0;
        if (had.score === score) return prev;     // no change, no re-render
        return { ...prev, [id]: { ...had, score } };
      });
    };
    socket.on("room:score", onScore);
    return () => socket.off("room:score", onScore);
  }, [socket, isOnline, roomCode, myId]);

  // ── The moment the match ends, push the final numbers once ──
  // The server decides the result from stored scores, so they must be current.
  const finalRef = useRef(null);
  useEffect(() => {
    if (!gameOver || !isOnline || isSpectator || finalRef.current) return;
    finalRef.current = finalSync(roomCode, payload());
  }, [gameOver, isOnline, isSpectator, roomCode, payload]);

  // ── Game API exposed to the specific game ──
  const addScore = useCallback((delta) => setScore((s) => Math.max(0, s + delta)), []);
  const addMove = useCallback(() => setMoves((m) => m + 1), []);

  // Call when the player completes the objective early (clears the board…).
  const finish = useCallback((bonus = 0) => {
    if (overRef.current) return;
    overRef.current = true;
    if (bonus) setScore((s) => s + bonus);
    setFinished(true);
    setGameOver(true);
  }, []);

  // ── Outcome, for DISPLAY ONLY ──
  // The authoritative result is computed by the server in
  // POST /api/leaderboard/update from the stored scores.
  const oppScores = Object.values(opponents).map((o) => Number(o.score) || 0);
  const maxOpp = oppScores.length ? Math.max(...oppScores) : -1;
  // Strictly greater: matching the top score is a draw, not a win.
  const won = oppScores.length ? score > maxOpp : finished;
  const draw = oppScores.length > 0 && score === maxOpp;
  const rank = oppScores.length ? 1 + oppScores.filter((s) => s > score).length : 1;
  const wonRef = useRef(won);
  useEffect(() => { wonRef.current = won; }, [won]);

  // Leave: make sure the final score has landed, then hand off. Room.jsx asks
  // the server for the official result from there.
  const endingRef = useRef(false);
  const endMatch = useCallback(async () => {
    if (endingRef.current) return;      // double-click / quit-then-timeout
    endingRef.current = true;
    const p = payload();
    if (isOnline && !isSpectator) {
      if (!finalRef.current) finalRef.current = finalSync(roomCode, p);
      await finalRef.current;
    }
    onGameEnd && onGameEnd(p.score, p.pairs_matched || 0, p.moves, wonRef.current);
  }, [isOnline, isSpectator, roomCode, payload, onGameEnd]);

  const fmt = (sec) =>
    `${Math.floor(sec / 60).toString().padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;

  return {
    isOnline,
    timeLeft, durationSeconds, fmt,
    score, setScore, addScore,
    moves, addMove,
    gameOver, finished, closed, finish,
    opponents, oppScores, won, draw, rank,
    endMatch,
  };
}
