// src/components/games/arrowBoard.js
// Pure board logic for Arrow Escape. No React and no randomness of its own —
// the caller passes a seeded `rand` — so every player in a room gets the
// identical board, and the generator can be tested outside the browser.

export const COLS = 7;
export const ROWS = 9;

export const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

const inside = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
export const cellKey = (c, r) => r * COLS + c;

/** Cells the head crosses on its way off the board, nearest first. */
export function rayCells(head, dir) {
  const out = [];
  for (let c = head.c + dir.dx, r = head.r + dir.dy; inside(c, r); c += dir.dx, r += dir.dy) {
    out.push({ c, r });
  }
  return out;
}

/** cellKey -> arrow id, for every arrow still on the board. */
export function occupancy(arrows) {
  const occ = new Map();
  for (const a of arrows) for (const p of a.cells) occ.set(cellKey(p.c, p.r), a.id);
  return occ;
}

/** Id of the first arrow in this one's way, or null if it can slide out. */
export function blockerOf(arrow, occ) {
  const head = arrow.cells[arrow.cells.length - 1];
  for (const p of rayCells(head, arrow.dir)) {
    const id = occ.get(cellKey(p.c, p.r));
    if (id != null && id !== arrow.id) return id;
  }
  return null;
}

/**
 * Build a board that is always solvable.
 *
 * Arrows are placed one at a time, and a new arrow is only accepted if its
 * escape ray is empty at the moment it's placed. Reverse the placement order
 * and you have a valid clearing order: by the time an arrow's turn comes,
 * everything placed after it — the only things that can be in its path — has
 * already left.
 *
 * Removing an arrow only ever frees cells, so an arrow that can leave stays
 * able to leave. Players can clear in any order and never reach a dead end.
 */
export function generateBoard(rand, level = 1) {
  const target = Math.min(0.9, 0.64 + 0.05 * level) * COLS * ROWS;
  const maxLen = Math.min(7, 3 + level);        // longer, twistier arrows on later boards
  const occ = new Set();
  const arrows = [];
  let filled = 0;

  const pick = (n) => Math.floor(rand() * n);
  const shuffle = (list) => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = pick(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const free = (c, r) => inside(c, r) && !occ.has(cellKey(c, r));

  function tryPlace(head, dir) {
    if (!free(head.c, head.r)) return false;
    const ray = rayCells(head, dir);
    if (ray.some((p) => occ.has(cellKey(p.c, p.r)))) return false;

    // The neck sits directly behind the head, so the last segment — and so
    // the arrowhead — points along `dir`.
    const neck = { c: head.c - dir.dx, r: head.r - dir.dy };
    if (!free(neck.c, neck.r)) return false;

    // An arrow's own body must never lie in its own path.
    const inPath = new Set(ray.map((p) => cellKey(p.c, p.r)));
    const used = new Set([cellKey(head.c, head.r), cellKey(neck.c, neck.r)]);
    const body = [head, neck];                       // grows head -> tail
    const want = 2 + pick(maxLen - 1);               // 2..maxLen cells
    const canGrow = (p) => free(p.c, p.r) && !used.has(cellKey(p.c, p.r)) && !inPath.has(cellKey(p.c, p.r));
    let tail = neck;
    while (body.length < want) {
      const from = tail;
      const next = shuffle(DIRS).map((d) => ({ c: from.c + d.dx, r: from.r + d.dy })).find(canGrow);
      if (!next) break;
      body.push(next);
      used.add(cellKey(next.c, next.r));
      tail = next;
    }

    const cells = body.reverse();                    // tail -> head
    for (const p of cells) occ.add(cellKey(p.c, p.r));
    arrows.push({ id: arrows.length, cells, dir, tone: arrows.length % 2 });
    filled += cells.length;
    return true;
  }

  // Random throws first, for variety…
  for (let misses = 0; filled < target && misses < 300; ) {
    if (tryPlace({ c: pick(COLS), r: pick(ROWS) }, DIRS[pick(4)])) misses = 0;
    else misses++;
  }
  // …then a sweep over every cell and direction to pack the gaps.
  if (filled < target) {
    const spots = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const d of DIRS) spots.push([{ c, r }, d]);
    for (const [head, dir] of shuffle(spots)) {
      if (filled >= target) break;
      tryPlace(head, dir);
    }
  }
  return arrows;
}

/** Greedy clear — used by tests to prove a board can be finished. */
export function isSolvable(arrows) {
  let left = arrows.slice();
  while (left.length) {
    const occ = occupancy(left);
    const next = left.find((a) => blockerOf(a, occ) == null);
    if (!next) return false;
    left = left.filter((a) => a !== next);
  }
  return true;
}
