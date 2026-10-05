// src/components/together/useTogether.js
// A phone's end of a together game (config/togetherWorld.js): say hello, get
// the world, keep up with its ticks, send what you do, and hear how it ended.
//
// Everything that changes ~10 times a second lives in a ref (`live`), so a
// game's canvas loop reads it without React re-rendering for every tick:
//   live.current = { init, side, view, prev, viewAt, prevAt, sc, startLocal, hist, off }
// `hist` keeps the last second of ticks by server time, for `between`.
// The rare things — ready, over, gone — are state.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "../../utils/SocketContext";

export default function useTogether({ roomCode, watchId = null, onInit, onTick, onReply, onSnap, onSecret }) {
  const { socket } = useSocket() || {};
  const live = useRef(null);
  const [ready, setReady] = useState(false);
  const [over, setOver] = useState(null);
  const [gone, setGone] = useState(false);
  const n = useRef(0);
  // the latest handlers, without re-subscribing the socket every render
  const cb = useRef({});
  cb.current = { onInit, onTick, onReply, onSnap, onSecret };

  useEffect(() => {
    if (!socket || !roomCode) return undefined;
    const hello = () => socket.emit("tg:hello", { code: roomCode, watch: watchId });
    const onInitMsg = (init) => {
      if (init.code !== roomCode) return;
      const now = Date.now();
      live.current = { ...init, view: init.view, prev: init.view, viewAt: now, prevAt: now, sc: init.sc, startLocal: now - init.elapsed, secret: init.secret || null,
        hist: [], off: 0 };
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
      // the history `between` draws from, and the server's clock as this phone
      // sees it: how late ticks usually land. It follows late ticks quickly and
      // early ones slowly, so one quick tick can't pull the drawing ahead of
      // the ticks that have actually arrived.
      if (!L.hist.length || m.t < L.hist[L.hist.length - 1].t) { L.hist = []; L.off = now - m.t; }   // the first, or a reconnect
      L.hist.push({ t: m.t, v: m.v });
      if (L.hist.length > 12) L.hist.shift();
      const off = now - m.t;
      L.off += (off - L.off) * (off > L.off ? 0.25 : 0.02);
      // the server's clock wins, but never jumps the phone's backwards by more than a hair
      const start = now - m.t;
      if (Math.abs(start - L.startLocal) > 250) L.startLocal = start;
      cb.current.onTick?.(m.v);
    };
    const onOverMsg = (o) => { if (o.code === roomCode) { if (live.current) live.current.over = o; setOver(o); } };
    const onReplyMsg = (r) => { if (r.code === roomCode) cb.current.onReply?.(r); };
    const onSnapMsg = (r) => { if (r.code === roomCode) cb.current.onSnap?.(r); };
    const onGoneMsg = (g) => { if (g.code === roomCode && !live.current) setGone(true); };
    // only for this phone: e.g. the bomb, to whoever is defusing it
    const onSecretMsg = (m) => {
      const L = live.current;
      if (!L || m.c !== roomCode || m.side !== L.side) return;
      L.secret = m.data;
      cb.current.onSecret?.(m.data);
    };
    socket.on("tg:secret", onSecretMsg);
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
      socket.off("tg:secret", onSecretMsg);
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

// Where the others are, smoothly: the two ticks either side of a moment a
// little in the past, and how far between them. Ticks reach a phone unevenly
// (two at once, then none for a while); easing from the last tick to the new
// one at each arrival made everyone else jump. Drawing a steady 130 ms behind
// the server always has a tick on both sides, so they glide.
export const SMOOTH_MS = 180;
export function between(L, delay = SMOOTH_MS) {
  const h = L && L.hist;
  if (!h || h.length < 2) return { a: L?.view, b: L?.view, k: 1 };
  const at = Date.now() - L.off - delay, last = h[h.length - 1];
  if (at >= last.t) return { a: last.v, b: last.v, k: 1 };
  if (at <= h[0].t) return { a: h[0].v, b: h[0].v, k: 1 };
  let i = h.length - 2;
  while (i > 0 && h[i].t > at) i--;
  return { a: h[i].v, b: h[i + 1].v, k: (at - h[i].t) / Math.max(1, h[i + 1].t - h[i].t) };
}

// The rows of `key` (e.g. "p": players) from the latest tick, with the columns
// in `cols` moved to where `between` says they are. A row that jumps further
// than `jump` between the two ticks (a new round) is put straight there.
export function smoothRows(L, key, cols, jump = 1.5) {
  const { a, b, k } = between(L);
  const A = new Map((a?.[key] || []).map((r) => [r[0], r])), B = new Map((b?.[key] || []).map((r) => [r[0], r]));
  return (L.view[key] || []).map((r) => {
    // everything else from the latest tick; only the position is eased
    const ra = A.get(r[0]), rb = B.get(r[0]);
    if (!ra || !rb) return { row: r, moving: false };
    const out = r.slice();
    let far = false, moved = 0;
    for (const c of cols) { const d = rb[c] - ra[c]; if (Math.abs(d) > jump) far = true; moved += Math.abs(d); }
    if (!far) for (const c of cols) out[c] = ra[c] + (rb[c] - ra[c]) * k;
    return { row: out, moving: moved > 0.01, dx: rb[cols[0]] - ra[cols[0]], dy: cols[1] != null ? rb[cols[1]] - ra[cols[1]] : 0 };
  });
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
