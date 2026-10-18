// src/components/games/mazeBoard.js
// Maze Runner's mazes. A perfect maze: every cell reachable, and exactly one
// route between any two of them.
//
// Built with an iterative randomized depth-first search (a recursive
// backtracker with an explicit stack, so a big grid can't blow the call
// stack). It carves exactly rows*cols - 1 passages, which is a spanning tree —
// and a spanning tree is precisely what "one unique path" means. Nothing extra
// is opened afterwards: one more passage would close a loop and there would
// suddenly be two ways round.
//
// Seeded, so everyone in a room runs the same maze.
import { seededRand } from "./seededRand.js";

// Walls as bits, so a cell is one number.
export const N = 1, E = 2, S = 4, W = 8;
export const OPPOSITE = { [N]: S, [E]: W, [S]: N, [W]: E };
export const DIRS = [
  { bit: N, dr: -1, dc: 0 },
  { bit: E, dr: 0, dc: 1 },
  { bit: S, dr: 1, dc: 0 },
  { bit: W, dr: 0, dc: -1 },
];

// Grows a cell each maze, alternating width and height, and stops before the
// cells get too small to see on a phone (15 across is 24 px a cell at 390).
export const MIN_SIZE = 7;
export const MAX_SIZE = 15;
export function sizeFor(level) {
  const grow = Math.max(0, level - 1);
  const cols = Math.min(MAX_SIZE, MIN_SIZE + Math.ceil(grow / 2));
  const rows = Math.min(MAX_SIZE, MIN_SIZE + Math.floor(grow / 2));
  return { rows, cols };
}

export const idx = (maze, r, c) => r * maze.cols + c;
export const inside = (maze, r, c) => r >= 0 && c >= 0 && r < maze.rows && c < maze.cols;
// A wall bit set means that side is CLOSED.
export const isOpen = (maze, r, c, bit) => (maze.cells[idx(maze, r, c)] & bit) === 0;

export function canMove(maze, r, c, dir) {
  if (!inside(maze, r, c)) return false;
  if (!isOpen(maze, r, c, dir.bit)) return false;
  return inside(maze, r + dir.dr, c + dir.dc);
}

// One move: the ball rolls on down the corridor until something makes it
// stop — a wall ahead, a turning off to either side, or the flag. So a long
// straight is one swipe, and you can never roll past a turning you might
// have wanted. Returns the cells it passes through, in order (empty if the
// way is walled).
export function slide(maze, r, c, dir) {
  const path = [];
  const sides = DIRS.filter((d) => d.bit !== dir.bit && d.bit !== OPPOSITE[dir.bit]);
  while (canMove(maze, r, c, dir)) {
    r += dir.dr; c += dir.dc;
    path.push({ r, c });
    if (r === maze.goal.r && c === maze.goal.c) break;
    const at = { r, c };
    if (sides.some((d) => canMove(maze, at.r, at.c, d))) break;   // a turning: stop and choose
  }
  return path;
}

export function makeMaze(seed, level) {
  const { rows, cols } = sizeFor(level);
  const rand = seededRand((Number(seed) || 1) * 3301 + level * 7919 + 11);
  for (let i = 0; i < 6; i++) rand();

  const maze = { rows, cols, cells: new Array(rows * cols).fill(N | E | S | W) };
  const seen = new Array(rows * cols).fill(false);
  const stack = [{ r: 0, c: 0 }];
  seen[0] = true;
  let carved = 0;

  while (stack.length) {
    const { r, c } = stack[stack.length - 1];
    // unvisited neighbours, in a random order
    const options = [];
    for (const d of DIRS) {
      const nr = r + d.dr, nc = c + d.dc;
      if (inside(maze, nr, nc) && !seen[nr * cols + nc]) options.push(d);
    }
    if (!options.length) { stack.pop(); continue; }
    const d = options[Math.floor(rand() * options.length)];
    const nr = r + d.dr, nc = c + d.dc;
    // open both sides of the same wall
    maze.cells[r * cols + c] &= ~d.bit;
    maze.cells[nr * cols + nc] &= ~OPPOSITE[d.bit];
    seen[nr * cols + nc] = true;
    carved += 1;
    stack.push({ r: nr, c: nc });
  }

  maze.carved = carved;                 // rows*cols - 1 in a perfect maze
  maze.start = { r: 0, c: 0 };
  maze.goal = { r: rows - 1, c: cols - 1 };
  return maze;
}

// Breadth-first from the start. Used by the tests to prove every cell is
// reachable, and to score a run against the shortest route.
export function distances(maze, from = maze.start) {
  const dist = new Array(maze.rows * maze.cols).fill(-1);
  dist[idx(maze, from.r, from.c)] = 0;
  let frontier = [from];
  while (frontier.length) {
    const next = [];
    for (const cell of frontier) {
      const here = dist[idx(maze, cell.r, cell.c)];
      for (const d of DIRS) {
        if (!canMove(maze, cell.r, cell.c, d)) continue;
        const nr = cell.r + d.dr, nc = cell.c + d.dc;
        if (dist[nr * maze.cols + nc] !== -1) continue;
        dist[nr * maze.cols + nc] = here + 1;
        next.push({ r: nr, c: nc });
      }
    }
    frontier = next;
  }
  return dist;
}

export const shortestPath = (maze) => distances(maze)[idx(maze, maze.goal.r, maze.goal.c)];

// Together: the door (the goal) is locked, and the key is the cell as far
// as it can be from both the start and the door — a trip of its own. The
// same maze gives the same key for everyone; ties go to the first cell.
export function keyCell(maze) {
  const a = distances(maze, maze.start), b = distances(maze, maze.goal);
  let best = -1, at = 0;
  for (let i = 0; i < a.length; i++) {
    const v = Math.min(a[i], b[i]);
    if (v > best) { best = v; at = i; }
  }
  return { r: Math.floor(at / maze.cols), c: at % maze.cols };
}

// The fewest moves (rolls) that get from the start to the flag.
export function fewestRolls(maze) {
  const key = (r, c) => r * maze.cols + c;
  const dist = new Map([[key(maze.start.r, maze.start.c), 0]]);
  const q = [maze.start];
  for (let h = 0; h < q.length; h++) {
    const { r, c } = q[h];
    if (r === maze.goal.r && c === maze.goal.c) return dist.get(key(r, c));
    for (const d of DIRS) {
      const p = slide(maze, r, c, d);
      if (!p.length) continue;
      const e = p[p.length - 1];
      if (dist.has(key(e.r, e.c))) continue;
      dist.set(key(e.r, e.c), dist.get(key(r, c)) + 1);
      q.push(e);
    }
  }
  return Infinity;
}

// Points come from boards cleared, and nothing ever takes them away: a board
// is worth BOARD_BASE, more for each bigger board after it, plus a small
// bonus for clearing it in few moves that shrinks to nothing — never below.
// Bumping a wall isn't a move and costs nothing.
export const BOARD_BASE = 100;
export const BOARD_STEP = 20;          // board 2 is worth 120, board 3 140…
export const QUICK_BONUS = 20;         // in the fewest moves possible
export const BONUS_PER_EXTRA = 4;      // gone after five extra moves
export function scoreForBoard(maze, level, moves) {
  const extra = Math.max(0, moves - fewestRolls(maze));
  return BOARD_BASE + BOARD_STEP * (Math.max(1, level) - 1) + Math.max(0, QUICK_BONUS - BONUS_PER_EXTRA * extra);
}
