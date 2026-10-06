// src/components/games/coopLog.js
// One board for everybody: the move log behind the together boards (Memory,
// Mahjong, Number Rush, Pipes). No React, so scripts/check-coop.mjs plays it.
//
// The server (config/coopBoard.js) puts every move from every phone into one
// order and numbers it. Each phone plays that numbered list through the
// game's rules — the same pure function everywhere — so every phone ends up
// with the same board, even when two people tap at the same moment: the
// server's order decides who got there first, and the rules turn the late
// tap into nothing.
//
// Waiting for the server would make every tap feel late, so my own moves are
// played at once, on top of the agreed board (`pending`), and dropped from
// that pile when they come back numbered. If somebody beat me to it, my move
// is played again on top of theirs and quietly comes to nothing — the board
// never jumps back and forth.
//
// rules: (state, { u, a, c }) => state. Must not change the state it is
// given (it is replayed), and must ignore anything it doesn't understand.

export function newLog(rules, init) {
  return { rules, init, agreed: init, n: 0, acts: [], held: new Map(), pending: [] };
}

// A numbered move from the server: { s, u, a, c }. Out of order ones wait
// until the gap before them is filled; ones already played are ignored.
// True when the board changed.
export function take(L, act) {
  if (!act || !Number.isInteger(act.s) || act.s < L.n) return false;
  L.held.set(act.s, act);
  let moved = false;
  while (L.held.has(L.n)) {
    const x = L.held.get(L.n);
    L.held.delete(L.n);
    try { L.agreed = L.rules(L.agreed, x); } catch { /* a move the rules can't read: skip it */ }
    L.acts.push(x);
    L.n += 1;
    if (x.c) L.pending = L.pending.filter((p) => p.c !== x.c);
    moved = true;
  }
  return moved;
}

// Something is missing before what we hold: ask for it again.
export const hasGap = (L) => L.held.size > 0;

// A numbered move that doesn't match the one we played under that number:
// the server's list isn't ours any more (it restarted, and got its moves back
// from a phone that had fewer). Start again from the server's.
export const differs = (L, act) =>
  !!act && Number.isInteger(act.s) && act.s < L.n && !!L.acts[act.s] && L.acts[act.s].c !== act.c;

// Back to the start, keeping my unanswered moves (they go again).
export function restart(L) {
  L.agreed = L.init;
  L.n = 0;
  L.acts = [];
  L.held = new Map();
}

// My move, played straight away.
export function propose(L, u, a, c) {
  L.pending.push({ u, a, c });
}

// The server turned it down: forget it.
export function drop(L, c) {
  const before = L.pending.length;
  L.pending = L.pending.filter((p) => p.c !== c);
  return L.pending.length !== before;
}

// What to draw: the agreed board with my unanswered moves on top.
export function view(L) {
  let s = L.agreed;
  for (const p of L.pending) {
    try { s = L.rules(s, p); } catch { /* ignore */ }
  }
  return s;
}
