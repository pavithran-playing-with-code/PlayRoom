// src/components/games/jigsawBoard.js
// Missing Piece: the jigsaw geometry and the puzzles. No React in here.
//
// A picture is cut into a grid of jigsaw pieces. Every inside edge gets a tab
// that bulges one way or the other, with its own small wobble in position and
// size, so no two edges look quite alike. One piece is lifted out, and the
// player picks it from a few candidates: the real piece plus look-alikes that
// get sneakier as the levels go up.
import { seededRand, shuffleInPlace } from "./seededRand";

export const PIC_W = 400;
export const PIC_H = 500;

// How big each board is. Finer grids mean smaller, harder-to-read pieces.
export function gridFor(level) {
  if (level <= 2) return { cols: 4, rows: 5 };
  if (level <= 5) return { cols: 5, rows: 6 };
  return { cols: 6, rows: 7 };
}

const f = (n) => Math.round(n * 10) / 10;

function makeEdges(rand, cols, rows) {
  // s: which way the tab bulges. t: where along the edge it sits. k: its size.
  const edge = () => ({ s: rand() < 0.5 ? 1 : -1, t: 0.42 + rand() * 0.16, k: 0.9 + rand() * 0.22 });
  const h = []; // h[r][c]: the edge along the TOP of row r (exists for r >= 1)
  const v = []; // v[r][c]: the edge along the LEFT of column c (exists for c >= 1)
  for (let r = 0; r < rows; r++) {
    h.push([]); v.push([]);
    for (let c = 0; c < cols; c++) {
      h[r].push(r > 0 ? edge() : null);
      v[r].push(c > 0 ? edge() : null);
    }
  }
  return { h, v };
}

// One side of a piece, from p0 to p1 (the path is already at p0). A null edge
// is the flat border of the picture. Pieces are traced clockwise, and a shared
// edge is traced in opposite directions by its two pieces, so the second one
// reverses it (flip the bulge, mirror the position) to get the identical curve.
function side(p0, p1, e, reversed, U) {
  if (!e) return ` L${f(p1[0])} ${f(p1[1])}`;
  const s = reversed ? -e.s : e.s;
  const t = reversed ? 1 - e.t : e.t;
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const ux = (p1[0] - p0[0]) / L, uy = (p1[1] - p0[1]) / L;
  const nx = uy, ny = -ux;                 // points out of the piece (y runs down)
  const k = e.k * U;
  const P = (a, b) => {
    const x = t * L + a * k, y = s * b * k;
    return `${f(p0[0] + ux * x + nx * y)} ${f(p0[1] + uy * x + ny * y)}`;
  };
  return ` L${P(-0.12, 0)}`
    + ` C${P(-0.07, 0)} ${P(-0.05, 0.05)} ${P(-0.08, 0.1)}`     // into the neck
    + ` C${P(-0.17, 0.18)} ${P(-0.17, 0.32)} ${P(0, 0.32)}`     // round the head
    + ` C${P(0.17, 0.32)} ${P(0.17, 0.18)} ${P(0.08, 0.1)}`
    + ` C${P(0.05, 0.05)} ${P(0.07, 0)} ${P(0.12, 0)}`          // back out
    + ` L${f(p1[0])} ${f(p1[1])}`;
}

// The outline of piece (c, r). `flip` lists sides whose tab is turned the wrong
// way round: that's how the "right picture, wrong shape" decoys are made.
export function piecePath(P, c, r, flip = []) {
  const { cols, rows, cw, ch, U, edges } = P;
  const x0 = c * cw, y0 = r * ch, x1 = x0 + cw, y1 = y0 + ch;
  const pick = (e, name) => (e && flip.includes(name) ? { ...e, s: -e.s } : e);
  const top = pick(r > 0 ? edges.h[r][c] : null, "top");
  const right = pick(c < cols - 1 ? edges.v[r][c + 1] : null, "right");
  const bottom = pick(r < rows - 1 ? edges.h[r + 1][c] : null, "bottom");
  const left = pick(c > 0 ? edges.v[r][c] : null, "left");
  return `M${f(x0)} ${f(y0)}`
    + side([x0, y0], [x1, y0], top, false, U)
    + side([x1, y0], [x1, y1], right, false, U)
    + side([x1, y1], [x0, y1], bottom, true, U)
    + side([x0, y1], [x0, y0], left, true, U)
    + " Z";
}

// Every piece outline except the hole, for the faint cut lines on the board.
export function outlinePaths(puzzle) {
  const out = [];
  for (let r = 0; r < puzzle.rows; r++) {
    for (let c = 0; c < puzzle.cols; c++) {
      if (c !== puzzle.hole.c || r !== puzzle.hole.r) out.push(piecePath(puzzle, c, r));
    }
  }
  return out;
}

// Puzzle `level` for this room. Seeded by (room seed, level), so everyone in a
// room gets the same puzzle N no matter how fast they reached it.
export function makePuzzle(seed, level) {
  const rand = seededRand((Number(seed) || 1) * 7919 + level * 104729 + 17);
  for (let i = 0; i < 6; i++) rand();      // the first draws of close seeds are too alike
  const { cols, rows } = gridFor(level);
  const cw = PIC_W / cols, ch = PIC_H / rows;
  const P = { cols, rows, cw, ch, U: Math.min(cw, ch), edges: makeEdges(rand, cols, rows) };

  // Early boards may take a border piece (flat edges are a helpful clue).
  // After that the gap is always inside the picture, and usually near the
  // middle where the critter is, so there's detail to compare, not plain sky.
  let hc, hr;
  if (level < 3) {
    hc = Math.floor(rand() * cols);
    hr = Math.floor(rand() * rows);
  } else {
    const inner = [];
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) inner.push([c, r]);
    const middle = inner.filter(([c, r]) => Math.hypot((c + 0.5) * cw - PIC_W / 2, (r + 0.5) * ch - 265) <= 170);
    const pool = middle.length && rand() < 0.7 ? middle : inner;
    [hc, hr] = pool[Math.floor(rand() * pool.length)];
  }

  const piece = (c, r) => ({
    c, r, cx: (c + 0.5) * cw, cy: (r + 0.5) * ch, dx: 0, dy: 0, rot: 0, path: piecePath(P, c, r),
  });
  const hole = piece(hc, hr);

  const used = new Set([`${hc},${hr}`]);
  const cells = (test) => {
    const list = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!used.has(`${c},${r}`) && test(Math.abs(c - hc) + Math.abs(r - hr))) list.push([c, r]);
    }
    return list;
  };
  const take = (list) => {
    const [c, r] = list[Math.floor(rand() * list.length)];
    used.add(`${c},${r}`);
    return piece(c, r);
  };
  const innerSides = ["top", "right", "bottom", "left"].filter((s) =>
    (s === "top" && hr > 0) || (s === "right" && hc < cols - 1) ||
    (s === "bottom" && hr < rows - 1) || (s === "left" && hc > 0));

  const decoy = {
    // a piece from somewhere else in the picture
    far: () => take(cells((d) => d >= 2)),
    // the piece right next to the gap: similar colours, different everything
    near: () => {
      const list = cells((d) => d === 1);
      return list.length ? take(list) : decoy.far();
    },
    // exactly the right picture, but a tab or two turned the wrong way
    tabs: () => {
      const flip = shuffleInPlace([...innerSides], rand).slice(0, level >= 7 ? 1 : Math.min(2, innerSides.length));
      return { ...hole, path: piecePath(P, hc, hr, flip) };
    },
    // exactly the right shape, but the picture inside is slid off a little
    shift: () => {
      const amount = level >= 7 ? 0.3 : 0.45;
      const across = rand() < 0.5;
      const sign = rand() < 0.5 ? -1 : 1;
      return { ...hole, dx: across ? sign * amount * cw : 0, dy: across ? 0 : sign * amount * ch };
    },
  };

  const kinds = level <= 2 ? ["far", "far"] : level <= 4 ? ["near", "tabs"] : ["near", "tabs", "shift"];
  const options = [{ ...hole, correct: true }, ...kinds.map((kind) => ({ ...decoy[kind](), correct: false }))];
  // From level 5 every piece, the right one included, arrives turned.
  if (level >= 5) options.forEach((o) => { o.rot = [0, 90, 180, 270][Math.floor(rand() * 4)]; });
  shuffleInPlace(options, rand);

  return {
    ...P,
    level,
    hole,
    options,
    // one view size for every option, so the pieces keep their true relative size
    box: Math.max(cw, ch) + 0.76 * P.U,
    sceneSeed: 1 + Math.floor(rand() * 2147483000),
  };
}
