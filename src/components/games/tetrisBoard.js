// src/components/games/tetrisBoard.js
// Block Drop's rules: the seven pieces, rotation with wall kicks, collision,
// line clears and scoring. No drawing and no React, so it can be tested alone.
import { seededRand } from "./seededRand";

export const COLS = 10;
export const ROWS = 18;

// Each piece lives in its own little square grid, so rotation is just turning
// that square. n is the size of the square.
export const PIECES = {
  I: { n: 4, color: "#4CC9F0", cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 2, color: "#FFC53D", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { n: 3, color: "#9B5DE5", cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, color: "#5DBB5A", cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, color: "#F2413F", cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, color: "#FF8FC7", cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, color: "#FF9233", cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};
export const TYPES = Object.keys(PIECES);

// Clockwise inside the piece's own square: (x, y) -> (n - 1 - y, x).
export function rotated(type, rot) {
  const { n, cells } = PIECES[type];
  let out = cells;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) out = out.map(([x, y]) => [n - 1 - y, x]);
  return out;
}

export const pieceCells = (p) => rotated(p.type, p.rot).map(([x, y]) => [p.x + x, p.y + y]);

export const emptyBoard = () => new Array(COLS * ROWS).fill(null);

export function collides(board, p) {
  return pieceCells(p).some(([x, y]) =>
    x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y * COLS + x]));
}

// A fresh piece, centred at the top.
export function spawn(type) {
  const { n } = PIECES[type];
  return { type, rot: 0, x: Math.floor((COLS - n) / 2), y: n === 4 ? -1 : 0 };
}

// Turn it, nudging sideways (and up, for the I piece against the floor) when
// the turn doesn't fit where it stands. Returns the new piece, or null.
export function tryRotate(board, p, dir = 1) {
  const turned = { ...p, rot: (p.rot + dir + 4) % 4 };
  for (const dx of [0, -1, 1, -2, 2]) {
    for (const dy of [0, -1]) {
      const kicked = { ...turned, x: turned.x + dx, y: turned.y + dy };
      if (!collides(board, kicked)) return kicked;
    }
  }
  return null;
}

export function moved(board, p, dx, dy) {
  const next = { ...p, x: p.x + dx, y: p.y + dy };
  return collides(board, next) ? null : next;
}

export function dropDistance(board, p) {
  let d = 0;
  while (!collides(board, { ...p, y: p.y + d + 1 })) d++;
  return d;
}

export function merge(board, p) {
  const next = board.slice();
  for (const [x, y] of pieceCells(p)) {
    if (y >= 0) next[y * COLS + x] = PIECES[p.type].color;
  }
  return next;
}

// Drop every full row out and shift what's above it down.
export function clearLines(board) {
  const kept = [];
  let cleared = 0;
  for (let y = 0; y < ROWS; y++) {
    const row = board.slice(y * COLS, y * COLS + COLS);
    if (row.every(Boolean)) cleared++;
    else kept.push(row);
  }
  while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(null));
  return { board: kept.flat(), cleared };
}

export const LINE_SCORE = [0, 100, 300, 500, 800];
export const scoreFor = (lines, level) => LINE_SCORE[lines] * level;
export const levelFor = (totalLines) => Math.floor(totalLines / 10) + 1;
// Falls faster every level, but never faster than a person can react. Matches
// here are 2-5 minutes, so the first level starts brisker than the arcade
// original, where a piece took the best part of ten seconds to land.
export const dropMs = (level) => Math.max(110, 560 - (level - 1) * 45);

// Pieces come in shuffled sets of all seven, the usual way, so you never get
// five S pieces in a row. Seeded, so a room gets the same pieces in the same order.
export function makeBag(seed) {
  const rand = seededRand((Number(seed) || 1) * 1543 + 29);
  for (let i = 0; i < 6; i++) rand();
  let bag = [];
  return {
    next() {
      if (!bag.length) {
        bag = [...TYPES];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      return bag.pop();
    },
  };
}
