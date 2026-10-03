// src/components/together/useTogether.js
// A phone's end of a together game (config/togetherWorld.js): say hello, get
// the world, keep up with its ticks, send what you do, and hear how it ended.
//
// Everything that changes ~10 times a second lives in a ref (`live`), so a
// game's canvas loop reads it without React re-rendering for every tick:
//   live.current = { init, side, view, prev, viewAt, prevAt, sc, startLocal }
// The rare things — ready, over, gone — are state.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "../../utils/SocketContext";

export default function useTogether({ roomCode, watchId = null, onInit, onTick, onReply, onSnap }) {
  const { socket } = useSocket() || {};
  const live = useRef(null);
  const [ready, setReady] = useState(false);
  const [over, setOver] = useState(null);
  const [gone, setGone] = useState(false);
  const n = useRef(0);
  // the latest handlers, without re-subscribing the socket every render
  const cb = useRef({});
  cb.current = { onInit, onTick, onReply, onSnap };

  useEffect(() => {
    if (!socket || !roomCode) return undefined;
    const hello = () => socket.emit("tg:hello", { code: roomCode, watch: watchId });
    const onInitMsg = (init) => {
      if (init.code !== roomCode) return;
      const now = Date.now();
      live.current = { ...init, view: init.view, prev: init.view, viewAt: now, prevAt: now, sc: init.sc, startLocal: now - init.elapsed };
      if (init.over) setOver(init.over);
      cb.current.onInit?.(init);
      setReady(true);
    };
    const onTickMsg = (m) => {
      const L = live.current;
      if (!L || m.c !== roomCode || m.side !== L.side) return;
      const now = Date.now();
      L.prev = L.view; L.prevAt = L.viewAt;
      L.view = m.v; L.viewAt = now;
      L.sc = m.sc;
      // the server's clock wins, but never jumps the phone's backwards by more than a hair
      const start = now - m.t;
      if (Math.abs(start - L.startLocal) > 250) L.startLocal = start;
      cb.current.onTick?.(m.v);
    };
    const onOverMsg = (o) => { if (o.code === roomCode) { if (live.current) live.current.over = o; setOver(o); } };
    const onReplyMsg = (r) => { if (r.code === roomCode) cb.current.onReply?.(r); };
    const onSnapMsg = (r) => { if (r.code === roomCode) cb.current.onSnap?.(r); };
    const onGoneMsg = (g) => { if (g.code === roomCode && !live.current) setGone(true); };
    socket.on("tg:init", onInitMsg);
    socket.on("tg:tick", onTickMsg);
    socket.on("tg:over", onOverMsg);
    socket.on("tg:reply", onReplyMsg);
    socket.on("tg:snap", onSnapMsg);
    socket.on("tg:gone", onGoneMsg);
    socket.on("connect", hello);
    hello();
    const retry = setInterval(() => { if (!live.current) hello(); }, 3000);
    return () => {
      clearInterval(retry);
      socket.off("tg:init", onInitMsg);
      socket.off("tg:tick", onTickMsg);
      socket.off("tg:over", onOverMsg);
      socket.off("tg:reply", onReplyMsg);
      socket.off("tg:snap", onSnapMsg);
      socket.off("tg:gone", onGoneMsg);
      socket.off("connect", hello);
    };
  }, [socket, roomCode, watchId]);

  const send = useCallback((a, extra = {}) => {
    if (!socket || !roomCode) return 0;
    const id = ++n.current;
    socket.emit("tg:act", { code: roomCode, n: id, a, ...extra });
    return id;
  }, [socket, roomCode]);
  const report = useCallback((m) => { if (socket && roomCode) socket.emit("tg:me", { code: roomCode, ...m }); }, [socket, roomCode]);
  const watch = useCallback((side) => { if (socket && roomCode) socket.emit("tg:watch", { code: roomCode, side }); }, [socket, roomCode]);

  return { live, ready, over, gone, send, report, watch };
}

// Seconds left on the match clock.
export function secondsLeft(L) {
  if (!L) return 0;
  return Math.max(0, Math.ceil((L.duration - (Date.now() - L.startLocal)) / 1000));
}

// How far between the last two ticks we are, 0..1, for smooth movement.
export function blend(L, tickMs = 100) {
  if (!L || L.viewAt === L.prevAt) return 1;
  return Math.max(0, Math.min(1, (Date.now() - L.viewAt) / tickMs));
}

// The sides as GameFrame's opponents strip wants them: everyone but my side.
export function rivals(L) {
  if (!L || !L.sc) return [];
  return L.sc.filter(([k]) => k !== L.side).map(([k, score, out]) => {
    const s = L.sides.find((x) => x.key === k);
    const lead = L.players.find((p) => s && p.id === s.members[0]);
    return { user_id: lead ? lead.id : k, username: L.mode === "teams" ? `${s?.name} team` : lead?.name || k, avatar: lead?.avatar, score: out ? `${score} ✕` : score };
  });
}

export const myScore = (L) => (L && L.sc ? (L.sc.find(([k]) => k === L.side) || [0, 0])[1] : 0);
