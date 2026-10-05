// scripts/check-piano.mjs — Piano Tiles' rules, with no browser.
//
//   node scripts/check-piano.mjs
//
// Everyone with a seed gets the same song; the rows join up with one tile in
// each; a player who taps each tile in time plays a whole match without a
// miss; an idle one misses and stands still; a tap on white costs the combo
// but no points; long tiles pay for what was held; the speed climbs and stops.
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// the module imports "./seededRand.js": copy both somewhere Node can load them as ES modules
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "piano-"));
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "components", "games");
for (const f of ["pianoSim.js", "seededRand.js", "pianoSongs.js"]) fs.copyFileSync(path.join(src, f), path.join(dir, f.replace(".js", ".mjs")));
fs.writeFileSync(path.join(dir, "pianoSim.mjs"), fs.readFileSync(path.join(dir, "pianoSim.mjs"), "utf8").replace("./seededRand.js", "./seededRand.mjs").replace("./pianoSongs.js", "./pianoSongs.mjs"));
const m = await import(pathToFileURL(path.join(dir, "pianoSim.mjs")).href);
const songs = await import(pathToFileURL(path.join(dir, "pianoSongs.mjs")).href);

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const DT = 1 / 60;

// A player: taps the lowest tile once it is `at` rows up the screen, holds a
// long tile until it is done, and — if `hand` — taps a little off-centre.
function play(seed, seconds, { at = 0.8, hand = false } = {}) {
  const s = m.newSong(seed);
  let pts = 0, mono = true, r = 7;
  const jit = () => { r = (r * 16807) % 2147483647; return (r / 2147483647 - 0.5) * 0.4; };
  for (let t = 0; t < seconds; t += DT) {
    const tile = s.tiles[s.next];
    if (s.hold === null && tile.y - s.pos < at) m.tap(s, tile.col, tile.y + 0.5 + (hand ? jit() : 0));
    m.step(s, DT);
    if (m.score(s) < pts) mono = false;
    pts = m.score(s);
  }
  return { s, mono };
}

// Roll on until the lowest tile is near the bottom, then tap it.
function tapNext(s) {
  for (let g = 0; g < 2000 && s.started && s.tiles[s.next].y - s.pos > 0.8; g++) m.step(s, DT);
  const t = s.tiles[s.next];
  return m.tap(s, t.col, t.y + 0.5);
}

// ── the song ─────────────────────────────────────────────────────────────────
{
  let same = true, joined = true, one = true, three = false, longs = 0, firstLong = 99, twinsOk = true, twins = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const a = m.newSong(seed), b = m.newSong(seed);
    a.pos = 300; b.pos = 300; m.visible(a); m.visible(b);
    if (JSON.stringify(a.tiles.map((t) => [t.col, t.y, t.len])) !== JSON.stringify(b.tiles.map((t) => [t.col, t.y, t.len]))) same = false;
    // the tune's tiles (a chord's second tile sits beside one, in the same row)
    const tune = a.tiles.filter((t) => !t.twin);
    for (let k = 1; k < tune.length; k++) {
      if (Math.abs(tune[k].y - (tune[k - 1].y + tune[k - 1].len)) > 1e-9) joined = false;
      if (tune[k].col < 0 || tune[k].col >= m.COLS) one = false;
      if (k >= 2 && tune[k].col === tune[k - 1].col && tune[k].col === tune[k - 2].col) three = true;
      if (tune[k].len > 1) { longs++; firstLong = Math.min(firstLong, k); }
    }
    for (let k = 0; k < a.tiles.length; k++) {
      const t = a.tiles[k];
      if (t.twin && !(a.tiles[k - 1] && a.tiles[k - 1].y === t.y && a.tiles[k - 1].col !== t.col && a.tiles[k - 1].len === 1)) twinsOk = false;
      if (t.twin) twins++;
    }
  }
  check("the same seed deals the same song", same);
  check("the rows join up, one tune tile in each, inside the four columns", joined && one);
  check("never three in one column running", !three);
  check("a chord: a second tile in the same row, in another column", twinsOk && twins > 100, `${twins} chords`);
  check("long tiles turn up, but not in the first few", longs > 1000 && firstLong >= 8, `${longs} long tiles, first at ${firstLong}`);
  const c = m.newSong(1), d = m.newSong(2);
  c.pos = d.pos = 40; m.visible(c); m.visible(d);
  check("a different seed deals a different song", c.tiles.map((t) => t.col).join() !== d.tiles.map((t) => t.col).join());
}

// ── songs and levels ─────────────────────────────────────────────────────────
{
  const S = songs.SONGS;
  check("seven songs, each with a level", S.length === 7 && S.every((x) => songs.LEVELS[x.level] && x.notes.length >= 20));
  // the server picks a seed that lands on the song chosen in the lobby
  const rooms = fs.readFileSync(path.join(src, "..", "..", "..", "routes", "rooms.js"), "utf8");
  const n = Number((rooms.match(/PIANO_SONGS = (\d+)/) || [])[1]);
  check("the server knows how many songs there are", n === S.length, `server ${n}, songs ${S.length}`);
  // the tiles follow the tune: each plays its note, and a higher note sits further right
  const tw = m.newSong(7, S[0]);
  tw.pos = 40; m.visible(tw);
  const tune = tw.tiles.filter((t) => !t.twin).slice(0, S[0].notes.length);
  check("each tile carries the next note of the song", tune.every((t, k) => t.midi === S[0].notes[k]));
  let rises = 0, falls = 0;
  for (let k = 1; k < tune.length; k++) {
    if (tune[k].midi > tune[k - 1].midi && tune[k].col < tune[k - 1].col) falls++;
    if (tune[k].midi > tune[k - 1].midi) rises++;
  }
  check("…and a note going up never jumps left", falls === 0 && rises > 3, `${rises} rises`);
  // easy is slower and plain; hard is fast, with long tiles and chords
  const easy = m.newSong(3, S.find((x) => x.level === "easy")), hard = m.newSong(3, S.find((x) => x.level === "hard"));
  easy.pos = hard.pos = 300; m.visible(easy); m.visible(hard);
  check("an easy song: slower, no chords", easy.base < hard.base && easy.max < hard.max && !easy.tiles.some((t) => t.twin));
  check("a hard song: chords and more long tiles", hard.tiles.some((t) => t.twin) && hard.tiles.filter((t) => t.len > 1).length > easy.tiles.filter((t) => t.len > 1).length);
  // a chord, either order
  for (const order of [0, 1]) {
    const c = m.newSong(5, S.find((x) => x.level === "hard"));
    c.pos = 200; m.visible(c); c.pos = 0;
    let k = c.tiles.findIndex((t) => t.twin) - 1;
    // play up to the chord
    for (let i = 0; i < k; i++) { const t = c.tiles[c.next]; m.tap(c, t.col, t.y + 0.5); }
    const first = c.tiles[c.next], second = c.tiles[c.next + 1];
    const a1 = order ? second : first, a2 = order ? first : second;
    const r1 = m.tap(c, a1.col, a1.y + 0.5), r2 = m.tap(c, a2.col, a2.y + 0.5);
    check(order ? "a chord played right to left: both tiles count" : "a chord played left to right: both tiles count", r1.kind === "hit" && r2.kind === "hit" && c.wrongs === 0, `${r1.kind} ${r2.kind}`);
  }
}

// ── starting ─────────────────────────────────────────────────────────────────
{
  const s = m.newSong(5);
  for (let i = 0; i < 300; i++) m.step(s, DT);
  check("nothing moves before the first tap", s.pos === 0 && s.misses === 0);
  const t0 = s.tiles[0];
  const off = m.tap(s, (t0.col + 1) % 4, t0.y + 0.5);
  check("a tap on white before the start costs nothing", off.kind === "none" && s.wrongs === 0 && s.stunT === 0);
  const hit = m.tap(s, t0.col, t0.y + 0.5);
  check("the first tile starts the song", hit.kind === "hit" && s.started && s.points === 10);
  m.step(s, 0.5);
  check("…and it rolls", s.pos > 1);
}

// ── a good player ────────────────────────────────────────────────────────────
{
  let worst = 0, minHits = 1e9, allMono = true, holds = 0, holdFull = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { s, mono } = play(seed, 180, { hand: true });
    worst = Math.max(worst, s.misses + s.wrongs);
    minHits = Math.min(minHits, s.hits);
    allMono = allMono && mono;
    for (const t of s.tiles) if (t.len > 1 && t.done && t.i !== s.hold) { holds++; if (t.held >= 0.999) holdFull++; }
  }
  check("a player who taps each tile in time plays three minutes clean", worst === 0, `worst ${worst} misses`);
  check("…hitting hundreds of tiles", minHits > 500, `fewest ${minHits}`);
  check("…holding every long tile to the end", holds > 50 && holdFull === holds, `${holdFull}/${holds}`);
  check("the score never goes down", allMono);
  const { s } = play(3, 180);
  check("the speed climbs to the top and stops there", s.speed === m.MAX_SPEED);
}

// ── missing ──────────────────────────────────────────────────────────────────
{
  const s = m.newSong(9);
  for (let i = 0; i < 21; i++) { if (s.hold !== null) m.release(s); tapNext(s); }
  if (s.hold !== null) m.release(s);
  const before = { pts: s.points, speed: s.speed, combo: s.combo };
  let missed = null;
  for (let i = 0; i < 600 && !missed; i++) missed = m.step(s, DT).missed;
  check("an idle player misses the next tile", !!missed && missed.missed && s.misses === 1);
  check("…losing the combo and some speed, never points", s.combo === 0 && s.speed < before.speed && s.points === before.pts);
  check("…rolled back so the missed tile shows", missed.y - s.pos > 0.5 && missed.y - s.pos < m.VISIBLE);
  const pos = s.pos;
  m.step(s, m.STUN_MISS * 0.9);
  check("…and stood still a moment", s.pos === pos);
  m.step(s, m.STUN_MISS * 0.2); m.step(s, 0.1);
  check("…then it rolls again", s.pos > pos);
  let more = 0;
  for (let i = 0; i < 60 * 20; i++) if (m.step(s, DT).missed) more++;
  check("an idle player keeps missing, one tile at a time", more > 5 && s.next === 22 + more - 1 + 1, `${more} more`);
}

// ── a tap on white ───────────────────────────────────────────────────────────
{
  const s = m.newSong(11);
  for (let i = 0; i < 12; i++) { if (s.hold !== null) m.release(s); tapNext(s); }
  if (s.hold !== null) m.release(s);
  const t = s.tiles[s.next], pts = s.points;
  // a column with no black at that height
  const white = [0, 1, 2, 3].find((c) => !s.tiles.some((u) => u.col === c && t.y + 0.5 >= u.y - m.SLOP && t.y + 0.5 <= u.y + u.len + m.SLOP));
  const w = m.tap(s, white, t.y + 0.5);
  check("a tap on white is wrong", w.kind === "wrong" && s.wrongs === 1);
  check("…costs the combo and no points", s.combo === 0 && s.points === pts);
  check("…and taps don't count while you stand still", m.tap(s, t.col, t.y + 0.5).kind === "none" && s.next === 12);
  m.step(s, m.STUN_WRONG + 0.01);
  check("…until the moment has passed", m.tap(s, t.col, t.y + 0.5).kind === "hit");
  const after = s.tiles[s.next + 1];
  check("a black tile further up does nothing", m.tap(s, after.col, after.y + 0.5).kind === "early" || after.col === s.tiles[s.next].col);
  const prev = s.tiles[s.next - 1];
  check("a second tap on the tile just played does nothing", m.tap(s, prev.col, prev.y + 0.5).kind !== "wrong");
}

// ── long tiles ───────────────────────────────────────────────────────────────
{
  // play up to the first long tile, tap it, then let go halfway
  const s = m.newSong(4);
  while (s.tiles[s.next].len === 1) { if (s.hold !== null) m.release(s); tapNext(s); }
  const k = s.next;
  const long = s.tiles[k];
  while (long.y - s.pos > 0.8) m.step(s, DT);
  const p0 = s.points;
  m.tap(s, long.col, long.y + 0.5);
  check("a long tile is held once tapped", s.hold === k, `len ${long.len}`);
  while (long.held < 0.5) m.step(s, DT);
  m.release(s);
  const got = s.points - p0 - m.tilePoints(s.combo);
  check("letting go early pays for what was held", got > 0 && got < m.HOLD_PTS * (long.len - 1), `${got} of ${m.HOLD_PTS * (long.len - 1)}`);
  check("…and the tile isn't a miss", s.misses === 0 && s.hold === null);
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
