// scripts/check-tower.mjs — Tower Guard's rules, with no browser.
//
//   node scripts/check-tower.mjs
//
// Every map's road joins up from the top to the castle, with room to build
// beside it; the same seed brings the same map and waves; towers cost what
// they say, can't go on the road, upgrade and sell back; archers, cannons and
// frost do what they should; an undefended castle falls (and that side is
// out); and a player who builds sensibly holds a five-minute match — alone
// or with a friend, where the monsters are tougher and every kill pays both.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const t = await import(pathToFileURL(path.join(here, "..", "src", "components", "together", "towerCore.mjs")).href);

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const DT = 0.1;

// ── the maps ─────────────────────────────────────────────────────────────────
{
  let joined = true, room = true, axis = true;
  for (let seed = 0; seed < t.MAPS.length; seed++) {
    const map = t.mapFor(seed);
    for (let i = 1; i < map.path.length; i++) {
      const [ax, ay] = map.path[i - 1], [bx, by] = map.path[i];
      if (ax !== bx && ay !== by) axis = false;
    }
    // walk the road tile by tile
    for (let d = 0; d < map.len; d += 0.2) {
      const [x, y] = t.at(map, d);
      if (y >= 0 && !map.road.has(Math.floor(y) * t.W + Math.floor(x))) joined = false;
    }
    const [ex, ey] = t.at(map, map.len);
    if (Math.floor(ex) !== map.castle.x || Math.floor(ey) !== map.castle.y) joined = false;
    let spots = 0;
    for (let y = 0; y < t.H; y++) for (let x = 0; x < t.W; x++) {
      if (!t.buildable(map, x, y)) continue;
      for (let d = 0; d < map.len; d += 0.5) { const [px, py] = t.at(map, d); if (Math.hypot(px - x - 0.5, py - y - 0.5) <= 2.2) { spots++; break; } }
    }
    if (spots < 25) room = false;
  }
  check("every road is straight runs, joined from the top to the castle", joined && axis);
  check("…with plenty of grass in reach of it to build on", room);
  const a = t.mapFor(7), b = t.mapFor(7);
  check("the same seed, the same map (and trees)", a.name === b.name && [...a.trees].join() === [...b.trees].join());
  check("the same seed, the same waves", t.waveList(9, 4).join() === t.waveList(9, 4).join() && t.waveList(9, 4).join() !== t.waveList(10, 4).join());
  check("waves grow, and every fifth has a dragon", t.waveList(1, 6).length > t.waveList(1, 2).length && t.waveList(1, 5).includes("dragon") && !t.waveList(1, 4).includes("dragon"));
}

// ── the hands ────────────────────────────────────────────────────────────────
{
  const s = t.createSide(1, { players: [1, 2], durMs: 300000 });
  const road = [...s.map.road][3], rx = road % t.W, ry = Math.floor(road / t.W);
  check("no tower on the road", t.act(s, 1, { a: "build", x: rx, y: ry, kind: "archer" }).why === "spot");
  let spot = null;
  for (let y = 0; y < t.H && !spot; y++) for (let x = 0; x < t.W && !spot; x++) if (t.buildable(s.map, x, y)) spot = [x, y];
  check("a tower on the grass costs what it says", t.act(s, 1, { a: "build", x: spot[0], y: spot[1], kind: "archer" }).ok && s.purse.get(1) === t.START_COINS - 50);
  check("…and not two on one spot", t.act(s, 2, { a: "build", x: spot[0], y: spot[1], kind: "frost" }).why === "spot");
  check("can't build what you can't afford", t.act(s, 1, { a: "build", x: spot[0] + 1, y: spot[1], kind: "cannon" }).why === "coins" || !t.buildable(s.map, spot[0] + 1, spot[1]));
  s.purse.set(1, 1000);
  check("upgrading costs, and raises it a level", t.act(s, 1, { a: "up", x: spot[0], y: spot[1] }).ok && s.towers[0].level === 2 && s.purse.get(1) === 1000 - t.upgradeCost("archer", 1));
  t.act(s, 1, { a: "up", x: spot[0], y: spot[1] });
  check("…up to level three", t.act(s, 1, { a: "up", x: spot[0], y: spot[1] }).why === "max");
  check("someone else can't sell your tower", t.act(s, 2, { a: "sell", x: spot[0], y: spot[1] }).why === "notyours");
  const spent = s.towers[0].spent, before = s.purse.get(1);
  check("selling gives most of it back", t.act(s, 1, { a: "sell", x: spot[0], y: spot[1] }).ok && s.purse.get(1) === before + Math.round(spent * t.SELL_BACK) && !s.towers.length);
  check("a level-3 archer hits much harder", t.towerStats("archer", 3).dmg > t.towerStats("archer", 1).dmg * 2 && t.towerStats("archer", 3).range > t.towerStats("archer", 1).range);
}

// ── the towers ───────────────────────────────────────────────────────────────
{
  const s = t.createSide(1, { players: [1], durMs: 300000 });
  s.wave = 1;
  // three slimes bunched up, a cannon beside them
  for (const d of [4, 4.2, 4.4]) s.monsters.push({ id: ++s.mid, kind: "slime", d, hp: 60, max: 60, speed: 0, slowT: 0, slow: 0 });
  const [mx, my] = t.at(s.map, 4.2);
  let cx = null, cy = null;
  for (let y = 0; y < t.H && cx === null; y++) for (let x = 0; x < t.W && cx === null; x++) if (t.buildable(s.map, x, y) && Math.hypot(x + 0.5 - mx, y + 0.5 - my) < 1.6) { cx = x; cy = y; }
  s.towers.push({ x: cx, y: cy, kind: "cannon", level: 1, owner: 1, spent: 80, cool: 0, aim: 0 });
  t.step(s, DT);
  check("a cannon hits everything bunched together", s.monsters.every((m) => m.hp === 60 - 24));
  s.towers = [{ x: cx, y: cy, kind: "frost", level: 1, owner: 1, spent: 60, cool: 0, aim: 0 }];
  s.monsters.forEach((m) => { m.speed = 1; });
  t.step(s, DT);
  check("frost slows what it hits", s.monsters.some((m) => m.slow > 0));
  const s2 = t.createSide(1, { players: [1, 2], durMs: 300000 });
  s2.wave = 1;
  s2.monsters.push({ id: 1, kind: "slime", d: 4, hp: 5, max: 30, speed: 0, slowT: 0, slow: 0 });
  const [qx, qy] = t.at(s2.map, 4);
  let ax = null, ay = null;
  for (let y = 0; y < t.H && ax === null; y++) for (let x = 0; x < t.W && ax === null; x++) if (t.buildable(s2.map, x, y) && Math.hypot(x + 0.5 - qx, y + 0.5 - qy) < 2) { ax = x; ay = y; }
  s2.towers.push({ x: ax, y: ay, kind: "archer", level: 1, owner: 1, spent: 50, cool: 0, aim: 0 });
  t.step(s2, DT);
  check("a kill pays everyone on the side", s2.kills === 1 && s2.purse.get(1) === t.START_COINS + 6 && s2.purse.get(2) === t.START_COINS + 6);
}

// ── whole matches ────────────────────────────────────────────────────────────
function coverage(map, x, y, range) {
  let n = 0;
  for (let d = 0; d < map.len; d += 0.25) { const [px, py] = t.at(map, d); if (Math.hypot(px - x - 0.5, py - y - 0.5) <= range) n++; }
  return n;
}
function play(seed, players, secs, smart = true) {
  const s = t.createSide(seed, { players, durMs: secs * 1000 });
  const spots = [];
  for (let y = 0; y < t.H; y++) for (let x = 0; x < t.W; x++) if (t.buildable(s.map, x, y)) spots.push({ x, y, c: coverage(s.map, x, y, 2.4) });
  spots.sort((a, b) => b.c - a.c);
  let built = 0, mono = true, last = 0;
  for (let time = 0; time < secs; time += DT) {
    t.step(s, DT);
    if (s.score < last) mono = false;
    last = s.score;
    if (!smart || Math.round(s.t * 10) % 10) continue;          // a player thinks once a second
    for (const id of players) {
      const coins = s.purse.get(id);
      const kind = built % 4 === 2 ? "cannon" : built % 4 === 3 ? "frost" : "archer";
      const free = spots.find((p) => !s.towers.some((T) => T.x === p.x && T.y === p.y));
      if (s.towers.length < 8 && free && coins >= t.TOWERS[kind].cost) { if (t.act(s, id, { a: "build", x: free.x, y: free.y, kind }).ok) built++; continue; }
      const low = [...s.towers].filter((T) => T.level < t.MAX_LEVEL).sort((a, b) => a.level - b.level)[0];
      if (low && coins >= t.upgradeCost(low.kind, low.level)) { t.act(s, id, { a: "up", x: low.x, y: low.y }); continue; }
      if (free && coins >= t.TOWERS[kind].cost) { if (t.act(s, id, { a: "build", x: free.x, y: free.y, kind }).ok) built++; }
    }
    if (t.done(s)) break;
  }
  return { s, mono };
}
{
  let fallen = 0, waves = 0, monoAll = true;
  for (let seed = 1; seed <= 12; seed++) { const r = play(seed, [1], 300); if (r.s.fallen) fallen++; waves += r.s.waves; monoAll = monoAll && r.mono; }
  check("a player who builds sensibly holds a five-minute match", fallen === 0, `${fallen}/12 fell · ${(waves / 12).toFixed(1)} waves seen off`);
  check("the score never goes down", monoAll);
  let fallen2 = 0;
  for (let seed = 1; seed <= 12; seed++) if (play(seed, [1, 2], 300).s.fallen) fallen2++;
  check("…and two friends together hold it too (tougher monsters, two purses)", fallen2 === 0, `${fallen2}/12 fell`);
  const idle = play(3, [1], 300, false).s;
  check("an undefended castle falls, and that side is out", idle.fallen && t.done(idle) && !t.goal(idle) && idle.lives === 0, `fell in wave ${idle.wave}`);
  const s = play(4, [1], 300).s;
  check("a castle still standing at the end is the goal", t.goal(s) && s.score > 500, `${s.score} points, wave ${s.wave}`);
  // a long match gets hard: an idle-ish player (one archer) loses eventually
  const weak = t.createSide(5, { players: [1], durMs: 600000 });
  let sp = null;
  for (let y = 0; y < t.H && !sp; y++) for (let x = 0; x < t.W && !sp; x++) if (t.buildable(weak.map, x, y) && coverage(weak.map, x, y, 2.6) > 10) sp = [x, y];
  t.act(weak, 1, { a: "build", x: sp[0], y: sp[1], kind: "archer" });
  for (let time = 0; time < 600 && !weak.fallen; time += DT) t.step(weak, DT);
  check("one lonely archer doesn't hold out forever", weak.fallen, `fell in wave ${weak.wave}`);
  const v = JSON.stringify(t.view(play(6, [1, 2], 120).s));
  check("what travels stays small", v.length < 4000, `${v.length} bytes`);
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
