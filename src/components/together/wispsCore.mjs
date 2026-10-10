// src/components/together/wispsCore.mjs
// LANTERN WISPS — the rules, run by the server (config/togetherWorld.js).
// A night-forest survival game: shadows come from every side, your lantern
// spirit's weapons fire by themselves, gems level the team up, and you hold
// out until dawn — which is when the room's clock runs out.
//
// One instance per side: on your own or against friends, a forest each (the
// same forest — the room's seed decides spawns and upgrade offers); together,
// one forest for the whole side, its XP and level shared, each player's
// upgrades their own.
//
// Each phone moves its own spirit and reports where it is (report); the
// server keeps the shadows, every player's weapons, gems and hearts, and
// sends a compact view ~10 times a second. Pure and seeded: no clock, no
// Math.random.
//
// The night is the room's clock, however long the host set it: n, the "night
// clock", runs 0..360 over it, and the swarms (2:00, 4:00 of the night), the
// bosses (3:00, 5:00) and the difficulty follow n.
import { seededRand } from "./rand.mjs";

export const GAME = "wisps";
export const TICK_MS = 100;
export const NIGHT = 360;                 // a night is six "night minutes", stretched to the room's clock
export const START_S = 3;                 // 3-2-1 before the first shadow
export const SPEED = 150, SPEED_UP = 0.08, DASH_SPEED = 560, DASH_S = 0.17, DASH_CD = 1.5;
export const HP = 100, PR = 11;           // a spirit's health, its radius for being touched
export const SPAWN_D = 760;               // just outside a phone's screen, in world units
export const MAXE = 200, MAXG = 260;
export const PICK_S = 10;                 // the level-up cards: pick within this, or one is picked for you
export const REVIVE_S = 3, REVIVE_R = 46;

export const WEAPONS = {
  spark: { name: "Spark Bolt", col: "#ffe28a", desc: ["Shoots glowing bolts at the nearest shadow.", "Stronger bolts that pierce through enemies.", "Fire two bolts at once.", "Bolts pierce even more.", "Fire three bolts and hit hard."] },
  orbit: { name: "Firefly Ring", col: "#9dff8a", desc: ["Two fireflies circle you and zap what they touch.", "Another firefly joins the ring.", "Fireflies spin faster and hit harder.", "Another firefly joins the ring.", "A full ring of fireflies."] },
  nova: { name: "Lantern Pulse", col: "#ffb85a", desc: ["A burst of light hurts and pushes enemies back.", "Bigger bursts, faster.", "Bigger bursts, more damage.", "Bursts come more often.", "A huge, fast, powerful pulse."] },
  leaf: { name: "Boomerang Leaf", col: "#7be07b", desc: ["A leaf flies out and returns, cutting through everything.", "The leaf flies farther and hits harder.", "Throw two leaves at once.", "Leaves return faster.", "Three leaves, sharp as knives."] },
  bolt: { name: "Moon Strike", col: "#c9b8ff", desc: ["Lightning from the sky hits a random shadow.", "Strikes more often.", "Two lightning strikes at a time.", "Bigger strikes, more damage.", "Three strikes at once."] },
};
export const PASSIVES = {
  speed: { name: "Swift Boots", col: "#5be3ff", desc: "Move 8% faster." },
  vit: { name: "Warm Heart", col: "#ff6b8b", desc: "+25 max health and heal 25." },
  mag: { name: "Gem Magnet", col: "#7fb2ff", desc: "Gems fly to you from farther away." },
  might: { name: "Bright Wick", col: "#ffd24a", desc: "All damage +12%." },
  haste: { name: "Quick Flame", col: "#ff9a5a", desc: "Weapons recharge 8% faster." },
  regen: { name: "Moss Charm", col: "#8affb0", desc: "Slowly heal over time." },
};
export const WKEYS = Object.keys(WEAPONS), PKEYS = Object.keys(PASSIVES), KINDS = [...WKEYS, ...PKEYS];
const ETYPES = {
  moth: { hp: 9, sp: 78, r: 11, dmg: 8, xp: 1 },
  blob: { hp: 42, sp: 46, r: 18, dmg: 13, xp: 3 },
  dasher: { hp: 24, sp: 62, r: 13, dmg: 14, xp: 2 },
};
export const ETYPE = ["moth", "blob", "dasher"];
export const xpFor = (l) => Math.round(3 + (l - 1) * 2.6 + Math.pow(l - 1, 1.3));
export const speedOf = (pl) => SPEED * (1 + SPEED_UP * pl.speed);
export const magnetOf = (pl) => 70 * (1 + 0.4 * pl.mag);
export const orbitOf = (L) => ({ n: L + 1, rad: 70 + 4 * L, spin: 2.6 + 0.3 * L });
// where a player's fireflies are: from the clock, so the phones draw them where the server hits with them
export const orbitAngle = (id, L, T) => (id % 2 ? Math.PI : 0) + (2.6 + 0.3 * L) * T;
const TAU = Math.PI * 2;
const hyp = Math.hypot;

// ── a side ───────────────────────────────────────────────────────────────────
function newPlayer(id, i, s) {
  const a = (i / Math.max(1, s.ids.length)) * TAU;
  return {
    id, x: s.ids.length > 1 ? Math.cos(a) * 40 : 0, y: s.ids.length > 1 ? Math.sin(a) * 40 : 0,
    hp: HP, maxhp: HP, alive: true, inv: 0, dash: false, face: 1, at: 0,
    WL: { spark: 1, orbit: 0, nova: 0, leaf: 0, bolt: 0 }, PL: { speed: 0, vit: 0, mag: 0, might: 0, haste: 0, regen: 0 },
    cd: { spark: 0.5, nova: 2, leaf: 1.5, bolt: 2 }, kills: 0,
    offers: null, pickT: 0, queue: 0, revive: 0, rand: seededRand((Number(s.seed) || 1) * 31 + id * 97 + 3),
  };
}

export function createSide(seed, { players, durMs, mode }) {
  const s = {
    seed: Number(seed) || 1, mode, dur: Math.max(30, (durMs || NIGHT * 1000) / 1000),
    T: 0, ph: "count", ids: players.map(Number), pl: [], en: [], bu: [], gm: [], hk: [], ev: [], uid: 1,
    xp: 0, level: 1, need: xpFor(1), kills: 0,
    R: seededRand((Number(seed) || 1) * 7 + 1), RC: seededRand((Number(seed) || 1) * 11 + 5),
    spawnT: 0.8, nextElite: 70, swarm1: false, swarm2: false, boss1: false, boss2: false, boss: null,
    dawn: false, over: false, deadAt: null, firstDown: {},
  };
  s.pl = s.ids.map((id, i) => newPlayer(id, i, s));
  return s;
}
const night = (s) => Math.max(0, s.T - START_S) * (NIGHT / Math.max(1, s.dur - START_S));
const alivePl = (s) => s.pl.filter((p) => p.alive);
// what happened this tick, for the phones' sounds and sparks. The damage
// numbers are many and the least important: they get a cap of their own, so
// they can't crowd out a level-up or a boss
const pushEv = (s, e) => {
  if (e.k === "hit") { if ((s.hits = (s.hits || 0) + 1) > 60) return; }
  if (s.ev.length < 200) s.ev.push(e);
};
const dmgMul = (p) => 1 + 0.12 * p.PL.might;
const cdMul = (p) => Math.pow(0.92, p.PL.haste);

// ── shadows ──────────────────────────────────────────────────────────────────
function spawnEnemy(s, type, elite, x, y) {
  const T = ETYPES[type], n = night(s), f = 1 + n / 110;
  if (x === undefined) {
    const al = alivePl(s), p = al[Math.floor(s.R() * al.length)] || s.pl[0], a = s.R() * TAU;
    x = p.x + Math.cos(a) * SPAWN_D; y = p.y + Math.sin(a) * SPAWN_D;
  }
  const e = {
    id: s.uid++, type, x, y, vx: 0, vy: 0, kx: 0, ky: 0, hp: T.hp * f * (elite ? 5 : 1), r: T.r * (elite ? 1.5 : 1),
    sp: T.sp * (0.85 + s.R() * 0.3) * (1 + n / 1500), dmg: T.dmg * (elite ? 1.5 : 1) * (1 + n / 600), xp: T.xp * (elite ? 6 : 1),
    elite: !!elite, boss: 0, t: s.R() * 4, st: 0, st2: 0, st3: 2, hitT: {}, dead: false,
  };
  e.maxhp = e.hp;
  s.en.push(e);
  return e;
}
function spawnBoss(s, which) {
  const al = alivePl(s), p = al[0] || s.pl[0], a = s.R() * TAU, n = night(s);
  const e = spawnEnemy(s, which === 1 ? "blob" : "dasher", false, p.x + Math.cos(a) * (SPAWN_D + 60), p.y + Math.sin(a) * (SPAWN_D + 60));
  e.boss = which; e.hp = e.maxhp = (which === 1 ? 900 : 1700) * (1 + n / 400) * (0.75 + 0.25 * s.pl.length);
  e.r = which === 1 ? 46 : 34; e.sp = which === 1 ? 40 : 78; e.dmg = which === 1 ? 20 : 24; e.xp = 0;
  s.boss = e;
  pushEv(s, { k: "boss", n: which });
}
function ring(s, count, x, y, dist) {
  const p = alivePl(s)[0] || s.pl[0], cx = x === undefined ? p.x : x, cy = y === undefined ? p.y : y, d = dist || SPAWN_D - 40;
  for (let i = 0; i < count && s.en.length < MAXE + 60; i++) { const a = (i / count) * TAU; spawnEnemy(s, "moth", false, cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
}
function hitEnemy(s, e, dmg, kx, ky, by, crit) {
  if (e.dead) return;
  const c = crit === undefined ? s.RC() < 0.1 : crit;
  const d = dmg * dmgMul(by) * (c ? 2 : 1);
  e.hp -= d;
  e.kx += kx * (e.boss ? 0.15 : 1); e.ky += ky * (e.boss ? 0.15 : 1);
  e.flash = 0.1;
  pushEv(s, { k: "hit", x: Math.round(e.x), y: Math.round(e.y - e.r), d: Math.max(1, Math.round(d)), c: c ? 1 : 0 });
  if (e.hp <= 0) killEnemy(s, e, by);
}
function killEnemy(s, e, by) {
  if (e.dead) return;
  e.dead = true; s.kills++;
  if (by) by.kills++;
  pushEv(s, { k: "kill", x: Math.round(e.x), y: Math.round(e.y), t: ETYPE.indexOf(e.type), b: e.boss ? 2 : e.elite ? 1 : 0 });
  if (e.boss) {
    for (let i = 0; i < 14; i++) s.gm.push({ id: s.uid++, x: e.x + (s.R() - 0.5) * 80, y: e.y + (s.R() - 0.5) * 80, v: 8, vx: (s.R() - 0.5) * 160, vy: (s.R() - 0.5) * 160, mag: false });
    s.hk.push({ id: s.uid++, x: e.x, y: e.y });
    pushEv(s, { k: "bossdown", n: e.boss });
    if (s.boss === e) s.boss = null;
  } else {
    const v = e.elite ? 10 : e.xp >= 3 ? 3 : 1;
    if (s.gm.length < MAXG) s.gm.push({ id: s.uid++, x: e.x, y: e.y, v, vx: (s.R() - 0.5) * 60, vy: (s.R() - 0.5) * 60, mag: false });
    else { const g = s.gm[Math.floor(s.R() * s.gm.length)]; g.v += v; }     // too many: a nearby gem grows instead
    if (e.elite || s.R() < 0.012) s.hk.push({ id: s.uid++, x: e.x, y: e.y });
  }
}

// a spatial grid of the shadows (56-unit cells), rebuilt every step
function buildGrid(s) {
  const g = new Map();
  for (const e of s.en) {
    if (e.dead) continue;
    const k = Math.floor(e.x / 56) * 7919 + Math.floor(e.y / 56);
    let a = g.get(k); if (!a) { a = []; g.set(k, a); } a.push(e);
  }
  s.grid = g;
}
function near(s, x, y, r, fn) {
  const x0 = Math.floor((x - r) / 56), x1 = Math.floor((x + r) / 56), y0 = Math.floor((y - r) / 56), y1 = Math.floor((y + r) / 56);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const a = s.grid.get(cx * 7919 + cy);
    if (a) for (const e of a) if (!e.dead) fn(e);
  }
}
function nearestEnemy(s, x, y, max) {
  let best = null, bd = max * max;
  for (const e of s.en) { if (e.dead) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}
function nearestAlive(s, x, y) {
  let best = null, bd = Infinity;
  for (const p of s.pl) { if (!p.alive) continue; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}

// ── weapons (each player's own loadout) ─────────────────────────────────────
function fire(s, p, dt) {
  const cm = cdMul(p), W = p.WL;
  if (W.spark) {
    p.cd.spark -= dt;
    if (p.cd.spark <= 0) {
      const tg = nearestEnemy(s, p.x, p.y, 520);
      if (tg) {
        const L = W.spark, n = L >= 5 ? 3 : L >= 3 ? 2 : 1, base = Math.atan2(tg.y - p.y, tg.x - p.x);
        p.cd.spark = Math.max(0.16, 0.62 - 0.07 * L) * cm;
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.16;
          s.bu.push({ id: s.uid++, k: 0, x: p.x, y: p.y, vx: Math.cos(a) * 540, vy: Math.sin(a) * 540, dmg: 10 + 3 * L, pierce: 1 + Math.floor(L / 2), life: 1, r: 6, hit: [], by: p });
        }
        pushEv(s, { k: "shoot", p: p.id });
      } else p.cd.spark = 0.1;
    }
  }
  if (W.nova) {
    p.cd.nova -= dt;
    if (p.cd.nova <= 0) {
      const L = W.nova, rad = 110 + 24 * L;
      p.cd.nova = Math.max(1.6, 4.4 - 0.45 * L) * cm;
      pushEv(s, { k: "nova", p: p.id, r: rad });
      for (const e of s.en) {
        if (e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = hyp(dx, dy) || 1;
        if (d < rad + e.r) hitEnemy(s, e, 12 + 5 * L, (dx / d) * 300, (dy / d) * 300, p, false);
      }
    }
  }
  if (W.leaf) {
    p.cd.leaf -= dt;
    if (p.cd.leaf <= 0) {
      const L = W.leaf, tg = nearestEnemy(s, p.x, p.y, 600);
      p.cd.leaf = Math.max(0.9, 1.9 - 0.18 * L) * cm;
      const n = L >= 5 ? 3 : L >= 3 ? 2 : 1, base = tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : (p.face > 0 ? 0 : Math.PI);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.5;
        s.bu.push({ id: s.uid++, k: 1, x: p.x, y: p.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, dmg: 14 + 4 * L, life: 4, t: 0, out: 0.45 + 0.04 * L, r: 14, by: p, hitT: {} });
      }
    }
  }
  if (W.bolt) {
    p.cd.bolt -= dt;
    if (p.cd.bolt <= 0) {
      const cand = s.en.filter((e) => !e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 420 * 420);
      if (cand.length) {
        const L = W.bolt, n = L >= 5 ? 3 : L >= 3 ? 2 : 1, rad = 48 + (L >= 4 ? 24 : 0);
        p.cd.bolt = Math.max(0.9, 2.7 - 0.32 * L) * cm;
        for (let i = 0; i < n && cand.length; i++) {
          const e = cand.splice(Math.floor(s.RC() * cand.length), 1)[0];
          pushEv(s, { k: "bolt", x: Math.round(e.x), y: Math.round(e.y), r: rad });
          for (const o of s.en) {
            if (o.dead) continue;
            const dx = o.x - e.x, dy = o.y - e.y, d = hyp(dx, dy);
            if (d < rad + o.r) hitEnemy(s, o, 22 + 8 * L, (dx / (d || 1)) * 140, (dy / (d || 1)) * 140, p, false);
          }
        }
      } else p.cd.bolt = 0.2;
    }
  }
}

// ── levels and the cards ─────────────────────────────────────────────────────
function offersFor(p) {
  const pool = [];
  for (const k of WKEYS) if (p.WL[k] < 5) pool.push([k, p.WL[k]]);
  for (const k of PKEYS) if (p.PL[k] < 5) pool.push([k, p.PL[k]]);
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(p.rand() * pool.length), 1)[0]);
  if (!out.length) out.push(["vit", 5]);
  return out;
}
function nextCards(s, p) {
  if (p.offers || p.queue <= 0 || !p.alive) return;
  p.offers = offersFor(p); p.pickT = PICK_S;
}
function apply(s, p, i) {
  const o = p.offers && p.offers[i];
  if (!o) return false;
  const [k] = o;
  if (p.WL[k] !== undefined) p.WL[k] = Math.min(5, p.WL[k] + 1);
  else {
    p.PL[k] = Math.min(5, p.PL[k] + 1);
    if (k === "vit") { p.maxhp += 25; p.hp = Math.min(p.maxhp, p.hp + 25); }
  }
  p.offers = null; p.queue = Math.max(0, p.queue - 1);
  p.inv = Math.max(p.inv, 0.6);                    // a moment to get going again
  pushEv(s, { k: "pick", p: p.id, w: k });
  nextCards(s, p);
  return true;
}
function addXp(s, v) {
  s.xp += v;
  while (s.xp >= s.need) {
    s.xp -= s.need; s.level++; s.need = xpFor(s.level);
    pushEv(s, { k: "level", lv: s.level });
    for (const p of s.pl) {
      if (!p.alive) revive(s, p, 0.5);             // a fallen friend comes back on the team's level-up
      p.queue++;
      nextCards(s, p);
    }
  }
}
function revive(s, p, frac) {
  p.alive = true; p.hp = Math.max(1, p.maxhp * frac); p.inv = 2; p.revive = 0;
  pushEv(s, { k: "revive", p: p.id });
}

// ── one step ─────────────────────────────────────────────────────────────────
export function step(s, dt) {
  if (s.over) return;
  // two half-steps: a bolt crosses 54 units a tick, more than a moth is wide
  const h = Math.min(0.25, dt) / 2;
  for (let i = 0; i < 2; i++) sub(s, h);
}
function sub(s, dt) {
  s.T += dt;
  if (s.T < START_S) { s.ph = "count"; return; }
  if (s.ph === "count") { s.ph = "play"; pushEv(s, { k: "start" }); }
  if (s.ph !== "play") return;
  const n = night(s);
  // dawn: the room's clock is about out — the shadows melt
  if (s.T >= s.dur - 0.25) {
    s.ph = "dawn"; s.dawn = alivePl(s).length > 0; s.over = true;
    for (const e of s.en) if (!e.dead) { e.dead = true; pushEv(s, { k: "melt", x: Math.round(e.x), y: Math.round(e.y) }); }
    pushEv(s, { k: "dawn", won: s.dawn ? 1 : 0 });
    return;
  }
  // players: health back, shields, revives, cards, weapons
  for (const p of s.pl) {
    p.inv = Math.max(0, p.inv - dt);
    if (p.offers) {
      p.pickT -= dt;
      if (p.pickT <= 0) apply(s, p, Math.floor(p.rand() * p.offers.length));   // too slow: one is picked
    }
    if (!p.alive) {
      // a friend standing by your ghost for a few seconds brings you back
      const helper = s.pl.find((q) => q.alive && hyp(q.x - p.x, q.y - p.y) < REVIVE_R);
      p.revive = helper ? p.revive + dt : Math.max(0, p.revive - dt * 2);
      if (p.revive >= REVIVE_S) revive(s, p, 0.5);
      continue;
    }
    if (p.PL.regen && p.hp < p.maxhp) p.hp = Math.min(p.maxhp, p.hp + 0.5 * p.PL.regen * dt);
    fire(s, p, dt);
  }
  // the director
  s.spawnT -= dt;
  if (s.spawnT <= 0) {
    s.spawnT = Math.max(0.2, 1.0 - n * 0.0019);
    const cnt = 1 + Math.floor(n / 90) + (alivePl(s).length - 1);
    if (s.en.length < MAXE) {
      for (let i = 0; i < cnt; i++) {
        const wB = n > 35 ? 0.3 + n / 700 : 0, wD = n > 85 ? 0.25 + n / 800 : 0, r = s.R() * (1 + wB + wD);
        spawnEnemy(s, r < 1 ? "moth" : r < 1 + wB ? "blob" : "dasher", false);
      }
    }
  }
  if (n >= s.nextElite) { s.nextElite += 55; spawnEnemy(s, s.R() < 0.5 ? "blob" : "dasher", true); pushEv(s, { k: "elite" }); }
  if (n >= 120 && !s.swarm1) { s.swarm1 = true; ring(s, 36); pushEv(s, { k: "swarm" }); }
  if (n >= 240 && !s.swarm2) { s.swarm2 = true; ring(s, 50); pushEv(s, { k: "swarm" }); }
  if (n >= 180 && !s.boss1) { s.boss1 = true; spawnBoss(s, 1); }
  if (n >= 300 && !s.boss2) { s.boss2 = true; spawnBoss(s, 2); }
  buildGrid(s);
  // the shadows
  for (const e of s.en) {
    if (e.dead) continue;
    const tg = nearestAlive(s, e.x, e.y);
    e.t += dt; e.flash = Math.max(0, (e.flash || 0) - dt);
    if (!tg) continue;
    const dx = tg.x - e.x, dy = tg.y - e.y, d = hyp(dx, dy) || 1;
    let sp = e.sp;
    if (e.type === "dasher") {
      e.st2 -= dt;
      if (e.st === 0 && e.st2 <= 0 && d < 320) { e.st = 1; e.st2 = 0.55; }
      else if (e.st === 1) { sp = 8; if (e.st2 <= 0) { e.st = 2; e.st2 = 0.45; e.ax = dx / d; e.ay = dy / d; } }
      else if (e.st === 2) { sp = e.boss ? 420 : 360; e.vx = e.ax * sp; e.vy = e.ay * sp; if (e.st2 <= 0) { e.st = 0; e.st2 = e.boss ? 1.6 : 2.4 + s.R(); } }
    }
    if (e.boss === 1) { e.st3 -= dt; if (e.st3 <= 0) { e.st3 = 3.2; for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; spawnEnemy(s, "moth", false, e.x + Math.cos(a) * (e.r + 20), e.y + Math.sin(a) * (e.r + 20)); } pushEv(s, { k: "roar", x: Math.round(e.x), y: Math.round(e.y) }); } }
    if (e.boss === 2) { e.st3 -= dt; if (e.st3 <= 0) { e.st3 = 3.4; ring(s, 14, e.x, e.y, 160); pushEv(s, { k: "roar", x: Math.round(e.x), y: Math.round(e.y) }); } }
    if (!(e.type === "dasher" && e.st === 2)) {
      e.vx = (dx / d) * sp; e.vy = (dy / d) * sp;
      if (e.type === "moth") { e.vx += Math.cos(e.t * 5 + e.id) * 26; e.vy += Math.sin(e.t * 4 + e.id) * 26; }
    }
    e.kx *= Math.exp(-7 * dt); e.ky *= Math.exp(-7 * dt);
    e.x += (e.vx + e.kx) * dt; e.y += (e.vy + e.ky) * dt;
    // don't stack up
    let m = 0;
    near(s, e.x, e.y, e.r + 14, (o) => {
      if (o === e || m > 5) return;
      const ox = e.x - o.x, oy = e.y - o.y, od = hyp(ox, oy), mm = e.r + o.r - 2;
      if (od < mm && od > 0.01) { m++; const push = (mm - od) * 0.5 * Math.min(1, dt * 14); e.x += (ox / od) * push; e.y += (oy / od) * push; }
    });
    // touching a spirit
    for (const p of s.pl) {
      if (!p.alive) continue;
      const pd = hyp(p.x - e.x, p.y - e.y);
      if (pd >= e.r + PR) continue;
      const l = pd || 1;
      if (p.offers) { e.kx -= ((p.x - e.x) / l) * 260; e.ky -= ((p.y - e.y) / l) * 260; continue; }   // the card shield pushes them off
      if (p.inv > 0 || p.dash) continue;
      p.hp -= e.dmg; p.inv = 0.9;
      e.kx -= ((p.x - e.x) / l) * 180; e.ky -= ((p.y - e.y) / l) * 180;
      pushEv(s, { k: "hurt", p: p.id, d: Math.round(e.dmg), kx: Math.round(((p.x - e.x) / l) * 260), ky: Math.round(((p.y - e.y) / l) * 260) });
      if (p.hp <= 0) {
        p.hp = 0; p.alive = false; p.offers = null; p.revive = 0;
        if (s.firstDown[p.id] === undefined) s.firstDown[p.id] = s.T;
        pushEv(s, { k: "down", p: p.id });
      }
    }
  }
  // fireflies
  for (const p of s.pl) {
    if (!p.alive || !p.WL.orbit) continue;
    const L = p.WL.orbit, { n: cnt, rad } = orbitOf(L), a0 = orbitAngle(p.id, L, s.T);
    for (let i = 0; i < cnt; i++) {
      const a = a0 + (i / cnt) * TAU, ox = p.x + Math.cos(a) * rad, oy = p.y + Math.sin(a) * rad;
      near(s, ox, oy, 16, (e) => {
        if (hyp(e.x - ox, e.y - oy) >= e.r + 9) return;
        const key = p.id + "_" + i;
        if ((e.hitT[key] || 0) <= s.T) { e.hitT[key] = s.T + 0.4; hitEnemy(s, e, 6 + 2 * L, Math.cos(a) * 90, Math.sin(a) * 90, p); }
      });
    }
  }
  // bolts and leaves
  for (const b of s.bu) {
    if (b.k === 0) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life <= 0) b.dead = true;
      near(s, b.x, b.y, b.r + 22, (e) => {
        if (b.dead || b.hit.includes(e.id) || hyp(e.x - b.x, e.y - b.y) >= e.r + b.r) return;
        b.hit.push(e.id); hitEnemy(s, e, b.dmg, b.vx * 0.2, b.vy * 0.2, b.by);
        if (--b.pierce <= 0) b.dead = true;
      });
    } else {
      b.t += dt;
      const o = b.by;
      if (b.t > b.out) {
        if (o && o.alive) { const dx = o.x - b.x, dy = o.y - b.y, d = hyp(dx, dy) || 1, sp = Math.min(560, 300 + b.t * 320); b.vx = (dx / d) * sp; b.vy = (dy / d) * sp; if (d < 20) b.dead = true; }
        else if (b.t > b.out + 1.2) b.dead = true;
      } else { b.vx *= Math.exp(-2.4 * dt); b.vy *= Math.exp(-2.4 * dt); }
      b.x += b.vx * dt; b.y += b.vy * dt; if (b.t > b.life) b.dead = true;
      near(s, b.x, b.y, b.r + 24, (e) => {
        if (hyp(e.x - b.x, e.y - b.y) >= e.r + b.r) return;
        if ((b.hitT[e.id] || 0) <= s.T) { b.hitT[e.id] = s.T + 0.35; hitEnemy(s, e, b.dmg, b.vx * 0.25, b.vy * 0.25, b.by); }
      });
    }
  }
  // gems fly to the nearest spirit inside its magnet, faster the closer
  for (const g of s.gm) {
    const p = nearestAlive(s, g.x, g.y);
    if (!p) continue;
    const dx = p.x - g.x, dy = p.y - g.y, d = hyp(dx, dy) || 1;
    if (d < magnetOf(p.PL)) g.mag = true;
    if (g.mag) { const sp = 240 + Math.max(0, 400 - d) * 1.4; g.vx = (dx / d) * sp; g.vy = (dy / d) * sp; }
    else { g.vx *= Math.exp(-4 * dt); g.vy *= Math.exp(-4 * dt); }
    g.x += g.vx * dt; g.y += g.vy * dt;
    if (d < 16) { g.dead = true; pushEv(s, { k: "gem", p: p.id, v: g.v }); addXp(s, g.v); }
  }
  for (const k of s.hk) {
    const p = nearestAlive(s, k.x, k.y);
    if (!p) continue;
    const d = hyp(p.x - k.x, p.y - k.y) || 1;
    if (d < 90) { k.x += ((p.x - k.x) / d) * 220 * dt; k.y += ((p.y - k.y) / d) * 220 * dt; }
    if (d < 20) { k.dead = true; for (const q of s.pl) if (q.alive) q.hp = Math.min(q.maxhp, q.hp + q.maxhp * 0.3); pushEv(s, { k: "heal", p: p.id }); }
  }
  if (s.en.some((e) => e.dead)) s.en = s.en.filter((e) => !e.dead);
  if (s.en.length > MAXE + 60) s.en.splice(0, s.en.length - MAXE - 60);
  s.bu = s.bu.filter((b) => !b.dead); s.gm = s.gm.filter((g) => !g.dead); s.hk = s.hk.filter((k) => !k.dead);
  // nobody left standing: the lantern went out
  if (!alivePl(s).length) {
    s.ph = "out"; s.over = true; s.deadAt = s.T;
    pushEv(s, { k: "out" });
  }
}

// ── from the phones ──────────────────────────────────────────────────────────
// Where my spirit is (the phone moves it): believed if it could have got there.
export function report(s, pid, m, nowMs) {
  const p = s.pl.find((q) => q.id === Number(pid));
  if (!p || !p.alive || s.over) return null;
  const x = Number(m.x), y = Number(m.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const since = p.at ? Math.min(1, (nowMs - p.at) / 1000) : 1;
  p.at = nowMs;
  p.dash = !!m.d;
  if (m.f === 1 || m.f === -1) p.face = m.f;
  if (s.ph === "count") return { x: p.x, y: p.y };              // nobody moves before the 3-2-1
  // a dash is the fastest a spirit goes; further than that, three times
  // running, and the phone is put back where the server has it
  if (hyp(x - p.x, y - p.y) > DASH_SPEED * since + 40) {
    p.off = (p.off || 0) + 1;
    if (p.off < 3) return null;
    p.off = 0;
    return { x: p.x, y: p.y };
  }
  p.x = x; p.y = y; p.off = 0;
  return null;
}
// a card picked
export function act(s, pid, m) {
  const p = s.pl.find((q) => q.id === Number(pid));
  if (!p) return { ok: false, why: "not-here" };
  if (m.a === "pick") return { ok: apply(s, p, Number(m.i)) };
  return { ok: false, why: "unknown" };
}
export function removePlayer(s, pid) {
  const p = s.pl.find((q) => q.id === Number(pid));
  if (p && p.alive) { p.alive = false; p.offers = null; p.left = true; pushEv(s, { k: "left", p: p.id }); }
  if (!alivePl(s).length && !s.over) { s.ph = "out"; s.over = true; s.deadAt = s.T; }
}

// ── the score ────────────────────────────────────────────────────────────────
// Banishing, levelling and lasting the night: 10 a shadow, 50 a level, 4 a
// second survived (by the side's longest-standing spirit), and 3000 for
// seeing dawn.
const lasted = (s) => Math.max(0, (s.deadAt ?? s.T) - START_S);
export const score = (s) => Math.min(25000, Math.round(s.kills * 10 + (s.level - 1) * 50 + lasted(s) * 4 + (s.dawn ? 3000 : 0)));
export const goal = (s) => !!s.dawn;
export const done = (s) => !!s.over;

// ── what the phones see ──────────────────────────────────────────────────────
const r1 = (v) => Math.round(v);
const loadout = (p) => WKEYS.map((k) => p.WL[k]).join("") + PKEYS.map((k) => p.PL[k]).join("");
export function view(s, peek = false) {
  const v = {
    t: Math.round(s.T * 100) / 100, ph: s.ph, lv: s.level, xp: Math.round((s.xp / s.need) * 1000), k: s.kills,
    // [id, x, y, hp, maxhp, alive, inv?, cards open?, face, revive 0..100, kills, loadout, pick seconds]
    p: s.pl.map((p) => [p.id, r1(p.x), r1(p.y), Math.ceil(p.hp), p.maxhp, p.alive ? 1 : 0, p.inv > 0 ? 1 : 0, p.offers ? 1 : 0, p.face,
      Math.round((p.revive / REVIVE_S) * 100), p.kills, loadout(p), p.offers ? Math.ceil(p.pickT) : 0]),
    // [id, type, x, y, hp %, flags (1 elite, 2 boss 1, 4 boss 2, 8 about to dash, 16 hit), angle×100]
    e: s.en.map((e) => [e.id, ETYPE.indexOf(e.type), r1(e.x), r1(e.y), Math.max(0, Math.round((e.hp / e.maxhp) * 100)),
      (e.elite ? 1 : 0) | (e.boss === 1 ? 2 : 0) | (e.boss === 2 ? 4 : 0) | (e.st === 1 ? 8 : 0) | (e.flash > 0 ? 16 : 0), Math.round(Math.atan2(e.vy, e.vx) * 100)]),
    // [id, kind (0 bolt, 1 leaf), x, y]
    b: s.bu.map((b) => [b.id, b.k, r1(b.x), r1(b.y)]),
    g: s.gm.map((g) => [g.id, r1(g.x), r1(g.y), g.v]),
    h: s.hk.map((k) => [k.id, r1(k.x), r1(k.y)]),
    bs: s.boss && !s.boss.dead ? [s.boss.boss, Math.round((s.boss.hp / s.boss.maxhp) * 1000)] : null,
    // each player's cards, while they're open
    o: Object.fromEntries(s.pl.filter((p) => p.offers).map((p) => [p.id, p.offers])),
    e2: s.ev,
  };
  if (!peek) { s.ev = []; s.hits = 0; }
  return v;
}
export function init(s) { return { seed: s.seed, dur: s.dur, start: START_S }; }
export function summary(s) {
  return { kills: s.kills, level: s.level, lasted: Math.round(lasted(s)), dawn: s.dawn, each: s.pl.map((p) => ({ id: p.id, kills: p.kills })) };
}
