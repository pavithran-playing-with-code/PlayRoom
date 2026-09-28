// src/components/games/blastBoard.js
// Block Blast's rules: an 8x8 grid, three pieces offered at a time, and a line
// clears when a whole row or column is full. Nothing falls — you choose where
// every piece goes, and the game ends when none of the three will fit.
//
// No drawing and no React here, so the rules can be tested on their own.
import { seededRand } from "./seededRand";

export const SIZE = 8;

// Shapes as [row, col] offsets from their top-left. Kept to pieces that read
// clearly at a phone's cell size — nothing longer than four, nothing hollow.
const SHAPES = [
  { k: "1",    cells: [[0, 0]] },
  { k: "2h",   cells: [[0, 0], [0, 1]] },
  { k: "2v",   cells: [[0, 0], [1, 0]] },
  { k: "3h",   cells: [[0, 0], [0, 1], [0, 2]] },
  { k: "3v",   cells: [[0, 0], [1, 0], [2, 0]] },
  { k: "4h",   cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { k: "4v",   cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { k: "sq2",  cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { k: "sq3",  cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]] },
  { k: "L1",   cells: [[0, 0], [1, 0], [1, 1]] },
  { k: "L2",   cells: [[0, 0], [0, 1], [1, 0]] },
  { k: "L3",   cells: [[0, 0], [0, 1], [1, 1]] },
  { k: "L4",   cells: [[0, 1], [1, 0], [1, 1]] },
  { k: "T",    cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { k: "S",    cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { k: "Z",    cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { k: "bigL", cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },
];

// One colour per shape, so the same piece always looks the same.
const COLOURS = ["#FFC53D", "#FF6B6B", "#3DD6C0", "#4CC9F0", "#9B5DE5",
                 "#B5E655", "#FF8FC7", "#FFA36C"];

export const PIECES = SHAPES.map((s, i) => ({
  ...s,
  colour: COLOURS[i % COLOURS.length],
  w: Math.max(...s.cells.map((c) => c[1])) + 1,
  h: Math.max(...s.cells.map((c) => c[0])) + 1,
  size: s.cells.length,
}));

export const emptyBoard = () => new Array(SIZE * SIZE).fill(null);
export const at = (board, r, c) => board[r * SIZE + c];

// Does this piece fit with its top-left at (r, c)?
export function canPlace(board, piece, r, c) {
  if (!piece) return false;
  for (const [dr, dc] of piece.cells) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE) return false;
    if (board[rr * SIZE + cc]) return false;
  }
  return true;
}

// Somewhere, anywhere on the board.
export function fitsAnywhere(board, piece) {
  if (!piece) return false;
  for (let r = 0; r <= SIZE - piece.h; r++) {
    for (let c = 0; c <= SIZE - piece.w; c++) {
      if (canPlace(board, piece, r, c)) return true;
    }
  }
  return false;
}

export const anyFits = (board, pieces) => pieces.some((p) => p && fitsAnywhere(board, p));

export function place(board, piece, r, c) {
  const next = board.slice();
  for (const [dr, dc] of piece.cells) next[(r + dr) * SIZE + (c + dc)] = piece.colour;
  return next;
}

// Full rows and columns go together, and they are worked out before any of
// them is emptied — otherwise clearing a row would stop the column that
// crossed it from counting.
export function clearLines(board) {
  const rows = [];
  const cols = [];
  for (let r = 0; r < SIZE; r++) {
    let full = true;
    for (let c = 0; c < SIZE; c++) if (!board[r * SIZE + c]) { full = false; break; }
    if (full) rows.push(r);
  }
  for (let c = 0; c < SIZE; c++) {
    let full = true;
    for (let r = 0; r < SIZE; r++) if (!board[r * SIZE + c]) { full = false; break; }
    if (full) cols.push(c);
  }
  if (!rows.length && !cols.length) return { board, rows, cols, cleared: 0 };

  const next = board.slice();
  for (const r of rows) for (let c = 0; c < SIZE; c++) next[r * SIZE + c] = null;
  for (const c of cols) for (let r = 0; r < SIZE; r++) next[r * SIZE + c] = null;
  return { board: next, rows, cols, cleared: rows.length + cols.length };
}

// A cell placed is worth a little; a line cleared is worth a lot, and clearing
// several at once is worth more again — that is the shot people play for.
export const PLACE_POINTS = 1;
export const LINE_POINTS = 60;
export const comboBonus = (lines) => (lines > 1 ? (lines - 1) * 50 : 0);
export const scoreForClear = (lines) => (lines ? LINE_POINTS * lines + comboBonus(lines) : 0);

// Three at a time, seeded, so everyone in a room is offered the same pieces in
// the same order. Deliberately not a shuffled bag: repeats are part of it.
export function makeDealer(seed) {
  const rand = seededRand((Number(seed) || 1) * 2801 + 17);
  for (let i = 0; i < 8; i++) rand();
  return {
    deal(n = 3) {
      const out = [];
      for (let i = 0; i < n; i++) out.push(PIECES[Math.floor(rand() * PIECES.length)]);
      return out;
    },
  };
}
