// src/components/games/pipesBoard.js
// Pipes: the boards and the rules. No React here, so they can be tested alone.
//
// A board starts as one connected network of pipes with no loops (a tree grown
// out from the source in the middle), so there is always a way to join every
// pipe. Then every tile is turned a random number of quarter turns. The player
// turns them back.
//
// A tile's pipe is a 4-bit mask of the sides it opens onto.
import { seededRand } from "./seededRand";

export const N = 1, E = 2, S = 4, W = 8;
export const DIRS = [
  { bit: N, dx: 0, dy: -1, opp: S },
  { bit: E, dx: 1, dy: 0, opp: W },
  { bit: S, dx: 0, dy: 1, opp: N },
  { bit: W, dx: -1, dy: 0, opp: E },
];

// One quarter turn clockwise moves N→E→S→W→N.
export function rotateMask(mask, turns) {
  let m = mask;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
}

export const openings = (mask) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);

export function sizeFor(level) {
  const sizes = [[4, 4], [5, 5], [6, 6], [7, 7], [8, 8]];
  const [cols, rows] = sizes[Math.min(level, sizes.length) - 1];
  return { cols, rows };
}

// Which tiles the water reaches from the source, given the current masks.
// Water only crosses between two tiles when both open onto their shared side.
export function flow(masks, cols, rows, source) {
  const reached = new Set([source]);
  const queue = [source];
  while (queue.length) {
    const cell = queue.shift();
    const x = cell % cols, y = (cell - x) / cols;
    for (const d of DIRS) {
      if (!(masks[cell] & d.bit)) continue;
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const next = ny * cols + nx;
      if (!reached.has(next) && masks[next] & d.opp) { reached.add(next); queue.push(next); }
    }
  }
  return reached;
}

// Solved: water reaches every tile, and no pipe end is left open.
export function isSolved(masks, cols, rows, source) {
  for (let cell = 0; cell < masks.length; cell++) {
    const x = cell % cols, y = (cell - x) / cols;
    for (const d of DIRS) {
      if (!(masks[cell] & d.bit)) continue;
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return false;
      if (!(masks[ny * cols + nx] & d.opp)) return false;
    }
  }
  return flow(masks, cols, rows, source).size === masks.length;
}

export const currentMasks = (board, turns) => board.solution.map((m, i) => rotateMask(m, board.start[i] + turns[i]));

// Board `level` for this room: the same for everyone in it.
export function makeBoard(seed, level) {
  const rand = seededRand((Number(seed) || 1) * 3571 + level * 65537 + 11);
  for (let i = 0; i < 6; i++) rand();
  const { cols, rows } = sizeFor(level);
  const n = cols * rows;
  const source = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
  const solution = new Array(n).fill(0);
  const inTree = new Array(n).fill(false);
  inTree[source] = true;

  const freeNeighbours = (cell) => {
    const x = cell % cols, y = (cell - x) / cols;
    return DIRS.filter((d) => {
      const nx = x + d.dx, ny = y + d.dy;
      return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !inTree[ny * cols + nx];
    });
  };
  const link = (cell, d) => {
    const x = cell % cols, y = (cell - x) / cols;
    const next = (y + d.dy) * cols + x + d.dx;
    solution[cell] |= d.bit;
    solution[next] |= d.opp;
    inTree[next] = true;
    return next;
  };

  // Grow the network: half the time from the newest pipe (long winding
  // corridors), half from a random one (branches). No crossroads, so every
  // piece is worth turning.
  const active = [source];
  while (active.length) {
    const k = rand() < 0.5 ? active.length - 1 : Math.floor(rand() * active.length);
    const cell = active[k];
    const options = openings(solution[cell]) < 3 ? freeNeighbours(cell) : [];
    if (!options.length) { active.splice(k, 1); continue; }
    active.push(link(cell, options[Math.floor(rand() * options.length)]));
  }
  // Any tile the no-crossroads rule shut out joins the nearest pipe anyway.
  for (let placed = true; placed;) {
    placed = false;
    for (let cell = 0; cell < n; cell++) {
      if (inTree[cell]) continue;
      const x = cell % cols, y = (cell - x) / cols;
      const d = DIRS.find((dd) => {
        const nx = x + dd.dx, ny = y + dd.dy;
        return nx >= 0 && ny >= 0 && nx < cols && ny < rows && inTree[ny * cols + nx];
      });
      if (d) {
        const nb = (y + d.dy) * cols + x + d.dx;
        solution[cell] |= d.bit;
        solution[nb] |= d.opp;
        inTree[cell] = true;
        placed = true;
      }
    }
  }

  // Scramble. A board that happens to come out already solved gets one more turn.
  const start = solution.map(() => Math.floor(rand() * 4));
  const scrambled = solution.map((m, i) => rotateMask(m, start[i]));
  if (isSolved(scrambled, cols, rows, source)) {
    const i = solution.findIndex((m) => rotateMask(m, 1) !== m);
    start[i] += 1;
  }
  return { cols, rows, n, source, solution, start };
}
