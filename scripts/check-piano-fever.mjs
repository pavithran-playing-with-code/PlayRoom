// scripts/check-piano-fever.mjs — Piano Tiles' fever and golden tiles (src/components/games/pianoSim.js).
//
//   node scripts/check-piano-fever.mjs
//
// Every 30th single tile is golden (+20); fifty in a row is FEVER and every
// tile pays double until a slip.
import * as m from "../src/components/games/pianoSim.js";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

// play perfectly: always the next tile, in its middle
function play(seed, n) {
  const s = m.newSong(seed), log = [];
  for (let k = 0; k < n; k++) {
    const t = s.tiles[s.next];
    const before = s.points, combo = s.combo + 1;
    const r = m.tap(s, t.col, t.y + 0.5);
    if (r.kind !== "hit") { log.push({ k, kind: r.kind }); continue; }
    m.release(s);
    log.push({ k, gold: r.gold, fever: r.fever, start: r.feverStart, got: s.points - before, combo, len: t.len });
    s.pos = Math.max(s.pos, t.y);                     // keep up with the song
  }
  return { s, log };
}
const { s, log } = play(3, 120);
ok("perfect play hits every tile", log.every((e) => e.kind === undefined), `${log.filter((e) => e.kind).length} not hit`);
const golds = log.filter((e) => e.gold);
ok("golden tiles turn up (every 30th single tile)", golds.length >= 2, `${golds.length}`);
ok("a golden tile pays +20 more", golds.every((e) => e.got === m.tilePoints(e.combo) * (e.fever ? 2 : 1) + m.GOLD_PTS));
const start = log.find((e) => e.start);
ok("fever starts at fifty in a row", !!start && start.combo === m.FEVER_AT);
const inFever = log.filter((e) => e.fever && !e.gold && e.len === 1);
ok("…and pays double while it lasts", inFever.length > 10 && inFever.every((e) => e.got === 2 * m.tilePoints(e.combo)));
// a slip ends it
const t = s.tiles[s.next];
const wrongCol = (t.col + 1) % m.COLS;
const twin = s.tiles[s.next + 1] && s.tiles[s.next + 1].y === t.y ? s.tiles[s.next + 1].col : -1;
const col = [0, 1, 2, 3].find((c) => c !== t.col && c !== twin);
m.tap(s, col, t.y + 0.5);
ok("a tap on white ends the fever", s.combo === 0 && !m.fever(s.combo), `combo ${s.combo} (${wrongCol})`);

// tapping far faster than the song scrolls (keys judge the next tile): it must never run out of tiles
{
  const q = m.newSong(5);
  let crashed = null;
  try { for (let k = 0; k < 300; k++) { const t = m.ensureNext(q); m.tap(q, t.col, t.y + 0.5); m.release(q); m.step(q, 0.001); } } catch (e) { crashed = e.message; }
  ok("taps far ahead of the scroll never run out of tiles", !crashed && q.hits >= 300, crashed || `${q.hits} hit`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
