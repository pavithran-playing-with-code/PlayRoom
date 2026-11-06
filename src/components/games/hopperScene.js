// src/components/games/hopperScene.js
// ROAD HOPPER, drawn in 3D with the PlayRoom look kit: a toy-box countryside
// that scrolls on forever — meadows with round trees, pines and boulders,
// roads of chunky toy cars and lorries (with eyes), rivers of bobbing logs,
// railways with a flashing signal and a little steam train — and the chicks:
// a white hen with a red comb, flapping wings and a bandana in its player's
// colour, that squashes, hops, blinks and pecks. Crashes are cartoon ones:
// feathers and SPLAT!, a splash, an eagle swooping down.
//
// It only draws. RoadHopper.jsx runs the rules (hopperSim.js) and hands it,
// every frame, the course clock, the camera row and where each chick is.
import * as THREE from "three";
import { COLS, rowAt, thingsAt, trainAt } from "./hopperSim.js";
import { toon, part, at, effects, ring, sunnyLights, nameTag, INK } from "./toyKit";

export const CHICK_COLOURS = [0x4cc9f0, 0xff8fc7, 0x8fdb5c, 0xffa36c, 0x9b5de5, 0x3dd6c0, 0xffc53d, 0xff6b6b];
const CAR_COLOURS = [0xff6b6b, 0x4cc9f0, 0xffc53d, 0x9b5de5, 0x8fdb5c, 0xff9f43, 0xff8fc7, 0x3dd6c0];
export const LAST = ["", "car", "water", "edge", "train", "eagle"];
const X = (sq) => sq - COLS / 2;                 // squares (a chick's x is its square's left edge) → world
const Z = (row) => -row;
const TILT = 0.74;
const LOG_TOP = 0.15;

// shared shapes: a row is rebuilt every few seconds, so its shapes are reused
const GEO = new Map();
const geo = (k, f) => { if (!GEO.has(k)) GEO.set(k, f()); return GEO.get(k); };
const sph = (r) => geo(`s${r}`, () => new THREE.SphereGeometry(r, 16, 12));
const bx = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (a, b, h, n = 14) => geo(`c${a},${b},${h},${n}`, () => new THREE.CylinderGeometry(a, b, h, n));
const cn = (r, h) => geo(`k${r},${h}`, () => new THREE.ConeGeometry(r, h, 14));
const P = (g, color, o) => part(g, color, o);
const B = (w, h, d, c, o) => P(bx(w, h, d), c, o);
const S = (r, c, o) => P(sph(r), c, o);
const C = (a, b, h, c, o) => P(cyl(a, b, h), c, o);
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function eye(r = 0.06) {
  const e = new THREE.Group();
  e.add(S(r, 0xffffff, { line: 0.14, shadow: false }));
  e.add(at(S(r * 0.6, INK, { line: 0, shadow: false }), 0, -r * 0.08, r * 0.6));
  e.add(at(S(r * 0.2, 0xffffff, { line: 0, shadow: false }), r * 0.2, r * 0.25, r * 1.05));
  return e;
}

// ── the chick ────────────────────────────────────────────────────────────────
// Faces +z, about 0.95 tall.
function chick(colour, seed) {
  const root = new THREE.Group();
  const pivot = new THREE.Group();               // squash, stretch, wobble
  root.add(pivot);
  const body = new THREE.Group();
  pivot.add(body);
  body.add(at(S(0.3, 0xffffff), 0, 0.34, 0, 1, 0.95, 1.08));
  // the tail: three feathers swept up at the back
  [-1, 0, 1].forEach((s) => { const f = at(S(0.1, 0xf4f1ff), s * 0.08, 0.5 - Math.abs(s) * 0.04, -0.3, 0.7, 1.5, 0.7); f.rotation.x = -0.5; f.rotation.z = s * 0.3; body.add(f); });
  // the bandana and its knot
  body.add(at(C(0.2, 0.25, 0.08, colour, { line: 0.08 }), 0, 0.53, 0.02));
  body.add(at(S(0.06, colour, { line: 0.14 }), 0, 0.53, -0.24, 1, 0.8, 1));
  // the head
  const head = new THREE.Group();
  head.position.set(0, 0.68, 0.07);
  body.add(head);
  head.add(S(0.21, 0xffffff));
  [[-0.07, 0.2, -0.02, 0.06], [0, 0.23, 0.02, 0.07], [0.07, 0.2, 0.05, 0.055]].forEach(([x, y, z, r]) => head.add(at(S(r, 0xff4d4d, { line: 0.14 }), 0, y, z + x)));
  const beak = at(P(cn(0.07, 0.16), 0xffa21a, { line: 0.12 }), 0, -0.02, 0.24);
  beak.rotation.x = Math.PI / 2;
  head.add(beak);
  head.add(at(S(0.045, 0xff4d4d, { line: 0.14 }), 0, -0.11, 0.18, 0.8, 1.2, 0.8));      // the wattle
  const eyes = [-1, 1].map((s) => { const e = at(eye(0.06), s * 0.1, 0.05, 0.16); head.add(e); return e; });
  for (const s of [-1, 1]) head.add(at(S(0.04, 0xff9fb0, { line: 0, shadow: false }), s * 0.15, -0.05, 0.13, 1, 0.6, 0.5));
  // wings: a pivot at the shoulder
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(s * 0.26, 0.42, 0);
    const f = at(S(0.15, 0xf4f1ff), s * 0.04, -0.08, -0.02, 0.38, 0.85, 1.05);
    w.add(f);
    body.add(w);
    return w;
  });
  // legs and feet
  const feet = [-1, 1].map((s) => {
    const l = new THREE.Group();
    l.position.set(s * 0.1, 0.06, 0.02);
    l.add(at(C(0.022, 0.022, 0.12, 0xffa21a, { line: 0.2 }), 0, 0.05, 0));
    l.add(at(S(0.065, 0xffa21a, { line: 0.14 }), 0, -0.02, 0.05, 1, 0.4, 1.4));
    root.add(l);
    return l;
  });
  // dazed: little stars round the head
  const stars = new THREE.Group();
  for (let i = 0; i < 3; i++) stars.add(new THREE.Mesh(geo("star", () => new THREE.OctahedronGeometry(0.075)), new THREE.MeshBasicMaterial({ color: 0xffd447 })));
  stars.position.y = 1.08;
  root.add(stars);
  root.scale.setScalar(1.3);
  root.userData = { pivot, body, head, eyes, wings, feet, stars, seed, face: Math.PI, land: 0, pop: 1, wasAir: false };
  return root;
}

function poseChick(c, t, dt, { air, daze, face }) {
  const u = c.userData;
  u.still = air >= 0 ? 0 : (u.still || 0) + dt;
  if (u.still > 0.6 && daze <= 0) face = 0.3 * Math.sin(t * 0.5 + u.seed);   // standing about: look this way
  // turn the short way round
  let d = face - u.face;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  u.face += d * Math.min(1, dt * 22);
  c.rotation.y = u.face;
  air = air > 1 ? 1 : air;
  const inAir = air >= 0;
  if (u.wasAir && !inAir) u.land = 0.14;
  u.wasAir = inAir;
  u.land = Math.max(0, u.land - dt);
  u.pop = Math.min(1, u.pop + dt * 3.2);
  const k = inAir ? air : 0;
  const arc = Math.sin(Math.PI * k);
  let sy = 1, lift = 0;
  if (inAir) { sy = k < 0.2 ? 0.82 + k : 1 + arc * 0.22; lift = arc * 0.5; }
  else if (u.land > 0) sy = 1 - (u.land / 0.14) * 0.28;
  else sy = 1 + Math.sin(t * 2.6 + u.seed) * 0.02;
  // a peck now and then
  const pc = (t * 0.27 + u.seed * 0.13) % 1;
  const peck = !inAir && daze <= 0 && pc < 0.06 ? Math.sin((pc / 0.06) * Math.PI) : 0;
  const pop = u.pop < 1 ? 1 - Math.pow(1 - u.pop, 3) * 1 + Math.sin(u.pop * Math.PI) * 0.25 : 1;
  u.pivot.scale.set(pop / Math.sqrt(sy), pop * sy, pop / Math.sqrt(sy));
  u.pivot.position.y = lift;
  u.body.rotation.x = peck * 0.5 + (inAir ? -0.12 : 0);
  u.pivot.rotation.z = daze > 0 ? Math.sin(t * 9) * 0.16 : 0;
  u.head.rotation.y = !inAir && daze <= 0 && !peck ? Math.sin(t * 0.8 + u.seed) * 0.4 * (Math.sin(t * 0.31 + u.seed) > 0.3 ? 1 : 0) : 0;
  u.wings.forEach((w, i) => { const s = i ? 1 : -1; w.rotation.z = s * (inAir ? 0.3 + arc * 1.2 : daze > 0 ? 0.5 + Math.sin(t * 14) * 0.3 : 0.05 + Math.sin(t * 2.6 + u.seed) * 0.04); });
  u.feet.forEach((f, i) => { f.position.y = 0.06 + (inAir ? arc * 0.04 * (i ? 1 : -1) : 0); f.rotation.x = inAir ? -0.6 * arc : 0; });
  const cyc = (t + u.seed * 0.7) % 3.3;
  const shut = daze > 0 ? 0.35 : cyc < 0.11 ? 0.12 : 1;
  for (const e of u.eyes) e.scale.y = shut;
  u.stars.visible = daze > 0;
  u.stars.children.forEach((s, i) => { const a = t * 5 + (i * Math.PI * 2) / 3; s.position.set(Math.cos(a) * 0.3, Math.sin(a * 2) * 0.04, Math.sin(a) * 0.3); s.rotation.y = t * 4; });
}

// ── things on the rows ───────────────────────────────────────────────────────
function car(len, colour, n, i) {
  const g = new THREE.Group();
  const L = len - 0.14;
  const lorry = len > 1.5;
  const inner = new THREE.Group();
  g.add(inner);
  // wheels
  for (const x of lorry ? [-L / 2 + 0.25, 0, L / 2 - 0.25] : [-L / 2 + 0.2, L / 2 - 0.2]) for (const z of [-0.3, 0.3]) {
    const w = at(C(0.13, 0.13, 0.1, 0x2e2a36, { line: 0.1 }), x, 0.14, z);
    w.rotation.x = Math.PI / 2;
    g.add(w);
    w.add(at(P(cyl(0.06, 0.06, 0.11), 0xd8d2cc, { line: 0 }), 0, 0, 0));
  }
  if (lorry) {
    // a cargo box behind, the cab in front (+x)
    inner.add(at(B(L * 0.66, 0.62, 0.74, hash(n, i + 9) > 0.5 ? 0xfff6e6 : 0xe7f4ff), -L / 2 + L * 0.33, 0.55, 0));
    inner.add(at(B(L * 0.66 + 0.01, 0.1, 0.75, colour, { line: 0 }), -L / 2 + L * 0.33, 0.6, 0));
    inner.add(at(B(L * 0.32, 0.36, 0.7, colour), L / 2 - L * 0.16, 0.38, 0));
    inner.add(at(B(L * 0.28, 0.3, 0.64, colour), L / 2 - L * 0.17, 0.7, 0));
    inner.add(at(B(0.02, 0.18, 0.5, 0x9fd8ff, { line: 0.1 }), L / 2 - 0.02, 0.72, 0));
  } else {
    inner.add(at(B(L, 0.3, 0.72, colour), 0, 0.3, 0));
    inner.add(at(B(L * 0.55, 0.26, 0.64, colour), -0.04, 0.56, 0));
    inner.add(at(B(0.02, 0.17, 0.52, 0x9fd8ff, { line: 0.1 }), L * 0.275 - 0.03, 0.57, 0));
    inner.add(at(B(L * 0.5, 0.15, 0.66, 0x9fd8ff, { line: 0 }), -0.04, 0.57, 0));
  }
  // a face on the front: big eyes on the windscreen, headlights, a grille smile
  const fx = lorry ? L / 2 - 0.0 : L / 2 - L * 0.225;
  const ey = lorry ? 0.73 : 0.58;
  for (const z of [-0.13, 0.13]) { const e = at(eye(0.075), fx + 0.03, ey, z); e.rotation.y = Math.PI / 2; inner.add(e); }
  for (const z of [-0.26, 0.26]) inner.add(at(S(0.055, 0xfff3a6, { line: 0.14, shadow: false }), L / 2, 0.32, z));
  inner.add(at(B(0.02, 0.06, 0.24, INK, { line: 0 }), L / 2 + 0.005, 0.24, 0));
  g.userData = { inner };
  return g;
}

function log(len) {
  const g = new THREE.Group();
  const L = len - 0.1;
  const body = C(0.27, 0.27, L, 0xa0703f);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  for (const s of [-1, 1]) { const e = at(C(0.25, 0.25, 0.04, 0xe2b57e, { line: 0 }), s * (L / 2 + 0.005), 0, 0); e.rotation.z = Math.PI / 2; g.add(e); }
  // bark stripes and the odd knot
  for (let k = 1; k < L * 2; k++) { const st = at(B(0.03, 0.04, 0.55, 0x7a5230, { line: 0 }), -L / 2 + k * 0.5, 0.25, 0); g.add(st); }
  if (len >= 3) g.add(at(S(0.07, 0x7a5230, { line: 0.12 }), L * 0.2, 0.2, 0.16, 1, 0.6, 1));
  return g;
}

function train() {
  const g = new THREE.Group();
  const cols = [0x4cc9f0, 0xffc53d, 0x8fdb5c, 0xff8fc7, 0x9b5de5];
  // carriages from the back (x = 0) to the engine at the front (x = 12)
  for (let k = 0; k < 5; k++) {
    const x = k * 2 + 1;
    g.add(at(B(1.86, 0.6, 0.78, cols[k]), x, 0.5, 0));
    g.add(at(B(1.9, 0.08, 0.82, 0xfff6e6, { line: 0.1 }), x, 0.84, 0));
    for (const wx of [-0.5, 0.1]) for (const z of [-0.4, 0.4]) g.add(at(B(0.42, 0.22, 0.02, 0x9fd8ff, { line: 0.12, shadow: false }), x + wx + 0.2, 0.58, z));
    for (const wx of [-0.6, 0.6]) for (const z of [-0.32, 0.32]) { const w = at(C(0.13, 0.13, 0.08, 0x2e2a36, { line: 0.1 }), x + wx, 0.15, z); w.rotation.x = Math.PI / 2; g.add(w); }
  }
  // the engine: red boiler, a cab, a chimney, a face
  const e = 11;
  g.add(at(B(1.86, 0.42, 0.8, 0x3a3046), e, 0.32, 0));
  const boiler = at(C(0.32, 0.32, 1.1, 0xe84a4a), e + 0.35, 0.68, 0);
  boiler.rotation.z = Math.PI / 2;
  g.add(boiler);
  g.add(at(B(0.66, 0.78, 0.8, 0xe84a4a), e - 0.55, 0.78, 0));
  g.add(at(B(0.76, 0.08, 0.9, 0x3a3046, { line: 0.1 }), e - 0.55, 1.2, 0));
  g.add(at(C(0.1, 0.14, 0.34, 0x3a3046), e + 0.6, 1.08, 0));
  g.add(at(C(0.17, 0.12, 0.08, 0x3a3046), e + 0.6, 1.27, 0));
  const face = at(C(0.3, 0.3, 0.04, 0xfff6e6, { line: 0.1 }), e + 0.92, 0.68, 0);
  face.rotation.z = Math.PI / 2;
  g.add(face);
  for (const z of [-0.1, 0.1]) { const ey = at(eye(0.065), e + 0.95, 0.74, z); ey.rotation.y = Math.PI / 2; g.add(ey); }
  const smile = new THREE.Mesh(geo("smile", () => new THREE.TorusGeometry(0.08, 0.016, 6, 12, Math.PI)), toon(INK));
  smile.position.set(e + 0.95, 0.6, 0); smile.rotation.set(0, Math.PI / 2, Math.PI);
  g.add(smile);
  g.add(at(B(0.2, 0.18, 0.84, 0xffc53d), e + 0.95, 0.24, 0));          // the cow-catcher
  for (const wx of [-0.6, 0.0, 0.6]) for (const z of [-0.36, 0.36]) { const w = at(C(0.16, 0.16, 0.08, 0x2e2a36, { line: 0.1 }), e + wx, 0.17, z); w.rotation.x = Math.PI / 2; g.add(w); }
  return g;
}

function tree(n, c) {
  const g = new THREE.Group();
  const kind = Math.floor(hash(n, c) * 4);
  const sway = new THREE.Group();
  g.add(sway);
  if (kind === 0 || kind === 3) {
    g.add(at(C(0.09, 0.12, 0.42, 0x8a5a33, { line: 0.12 }), 0, 0.21, 0));
    const tall = kind === 3 ? 1.25 : 1;
    sway.add(at(S(0.37, kind === 3 ? 0x7fcf5a : 0x5cbf4a), 0, 0.68 * tall, 0, 1, 0.9 * tall, 1));
    sway.add(at(S(0.24, kind === 3 ? 0x96e06e : 0x72d35a), 0.06, 1.0 * tall, 0.06));
    if (kind === 0 && hash(c, n) > 0.55) for (const [x, y, z] of [[0.22, 0.75, 0.24], [-0.25, 0.62, 0.2], [0.05, 0.92, 0.3]]) sway.add(at(S(0.045, 0xff5a5a, { line: 0.14, shadow: false }), x, y, z));
  } else if (kind === 1) {
    g.add(at(C(0.08, 0.1, 0.3, 0x8a5a33, { line: 0.12 }), 0, 0.15, 0));
    sway.add(at(P(cn(0.42, 0.55), 0x3f9e5a), 0, 0.52, 0));
    sway.add(at(P(cn(0.33, 0.48), 0x48ad62), 0, 0.84, 0));
    sway.add(at(P(cn(0.22, 0.4), 0x55bd6e), 0, 1.12, 0));
  } else {
    g.add(at(S(0.36, 0x9d98ad), 0, 0.22, 0, 1.05, 0.72, 0.92));
    g.add(at(S(0.18, 0xb0abc0), 0.16, 0.2, 0.18, 1, 0.7, 1));
    g.add(at(S(0.16, 0x7fcf5a, { line: 0.1 }), -0.08, 0.44, -0.04, 1.3, 0.35, 1.1));
  }
  g.rotation.y = hash(c * 3, n) * Math.PI * 2;
  g.userData.sway = sway;
  return g;
}

function coin() {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const d = C(0.22, 0.22, 0.07, 0xffc53d, { line: 0.1 });
  d.rotation.x = Math.PI / 2;
  spin.add(d);
  const inner = at(C(0.15, 0.15, 0.075, 0xffe07a, { line: 0 }), 0, 0, 0);
  inner.rotation.x = Math.PI / 2;
  spin.add(inner);
  g.userData.spin = spin;
  return g;
}

// ── a row ────────────────────────────────────────────────────────────────────
const WIDE = 26;
const RIPPLE = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
function buildRow(n, r, next) {
  const g = new THREE.Group();
  g.position.z = Z(n);
  const o = { g, n, kind: r.kind, cars: [], logs: [], trees: [], ripples: [] };
  const ground = (col, y, h, wide = WIDE) => { const m = new THREE.Mesh(bx(wide, h, 1), toon(col)); m.position.y = y - h / 2; m.receiveShadow = true; g.add(m); return m; };
  if (r.kind === "grass") {
    ground(n < 0 ? 0x6fb04a : n % 2 ? 0x9ad65e : 0x90cf55, 0, 0.4, COLS);
    for (const s of [-1, 1]) { const m = ground(n < 0 ? 0x6fb04a : n % 2 ? 0x7cb84c : 0x74b046, -0.02, 0.4, (WIDE - COLS) / 2); m.position.x = s * (COLS / 2 + (WIDE - COLS) / 4); }
    for (const c of r.trees) {
      if (n < 0) {
        if (n === -1) {                               // a white picket fence along the start
          g.add(at(B(0.09, 0.5, 0.09, 0xfff6e6, { line: 0.12 }), X(c + 0.5), 0.25, -0.42));
          g.add(at(P(cn(0.065, 0.1), 0xfff6e6, { line: 0.12 }), X(c + 0.5), 0.55, -0.42));
          for (const y of [0.18, 0.38]) g.add(at(B(1, 0.07, 0.04, 0xfff6e6, { line: 0.1 }), X(c + 0.5), y, -0.42));
        } else if (hash(n, c) < 0.35) g.add(at(S(0.3, hash(c, n) < 0.5 ? 0x5cbf4a : 0x4fae3e), X(c + 0.5), 0.12, (hash(n * 3, c) - 0.5) * 0.4, 1.2, 0.8, 1));
        continue;
      }
      const t = at(tree(n, c), X(c + 0.5), 0, 0);
      g.add(t); o.trees.push(t);
    }
    // flowers and tufts, for looks only
    if (n >= -3) for (let c = -3; c < COLS + 3; c++) {
      if ((n >= 0 && r.trees.has(c)) || hash(n * 7, c) > 0.32) continue;
      const fx = X(c + 0.2 + hash(c, n * 5) * 0.6), fz = (hash(n, c * 9) - 0.5) * 0.7;
      if (hash(c, n) > 0.5) {
        const col = [0xffffff, 0xffd447, 0xff8fc7, 0xb9a6ff][Math.floor(hash(n, c * 3) * 4)];
        g.add(at(P(sph(0.05), col, { line: 0.2, shadow: false }), fx, 0.05, fz));
      } else g.add(at(P(cn(0.05, 0.14), 0x6cc04a, { line: 0, shadow: false }), fx, 0.06, fz));
    }
    if (r.coin >= 0) { o.coin = at(coin(), X(r.coin + 0.5), 0.42, 0); g.add(o.coin); }
  } else if (r.kind === "road") {
    ground(0x5d6170, -0.03, 0.37);
    if (next.kind === "road") for (let x = -12; x < 12; x += 1) { const m = new THREE.Mesh(bx(0.5, 0.02, 0.07), toon(0xf2f2f2)); m.position.set(x + 0.25, -0.02, -0.5); g.add(m); }
    else { const m = new THREE.Mesh(bx(WIDE, 0.06, 0.1), toon(0xc9c6d6)); m.position.set(0, 0.0, -0.46); g.add(m); }
    thingsAt(r, 0).forEach((t, i) => {
      const cr = car(t.x1 - t.x0, CAR_COLOURS[Math.floor(hash(n, i) * CAR_COLOURS.length)], n, i);
      if (r.dir < 0) cr.rotation.y = Math.PI;
      g.add(cr); o.cars.push(cr);
    });
  } else if (r.kind === "river") {
    const water = new THREE.Mesh(bx(WIDE, 0.3, 1.001), toon(0x4fb8f0));
    water.position.y = -0.38; water.receiveShadow = true; g.add(water);
    for (let k = 0; k < 7; k++) {
      const m = new THREE.Mesh(geo("rip", () => new THREE.CircleGeometry(1, 12)), RIPPLE);
      m.rotation.x = -Math.PI / 2; m.scale.set(0.28, 0.05, 1);
      m.position.set(0, -0.22, (hash(n, k) - 0.5) * 0.8);
      m.userData.x0 = hash(k, n) * WIDE;
      g.add(m); o.ripples.push(m);
    }
    thingsAt(r, 0).forEach((t) => { const l = log(t.x1 - t.x0); g.add(l); o.logs.push(l); });
  } else {
    ground(0xb9ab95, 0, 0.4);
    for (let x = -12; x < 12; x += 0.5) { const m = new THREE.Mesh(bx(0.18, 0.05, 0.8), toon(0x7a5b3e)); m.position.set(x, 0.02, 0); g.add(m); }
    for (const z of [-0.22, 0.22]) { const m = new THREE.Mesh(bx(WIDE, 0.07, 0.06), toon(0x9aa1ac)); m.position.set(0, 0.07, z); g.add(m); }
    // the signal: a post at the left edge, a lamp that flashes
    const post = at(C(0.04, 0.05, 1.1, 0x3a3046, { line: 0.12 }), X(0) + 0.12, 0.55, -0.44);
    g.add(post);
    const lamp = new THREE.Mesh(sph(0.11), new THREE.MeshBasicMaterial({ color: 0x5a1e22 }));
    lamp.position.set(X(0) + 0.12, 1.12, -0.38);
    g.add(lamp, at(S(0.15, 0x3a3046, { line: 0.1 }), X(0) + 0.12, 1.12, -0.46, 1, 1, 0.5));
    const warn = new THREE.Mesh(bx(WIDE, 0.01, 1), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0, depthWrite: false }));
    warn.position.y = 0.11;
    g.add(warn);
    const tr = train();
    tr.visible = false;
    g.add(tr);
    Object.assign(o, { lamp, warn, train: tr });
  }
  return o;
}

// ── the eagle ────────────────────────────────────────────────────────────────
function eagle() {
  const g = new THREE.Group();
  g.add(at(S(0.4, 0x7a4a2a), 0, 0, 0, 0.9, 0.75, 1.4));
  g.add(at(S(0.25, 0xffffff), 0, 0.15, 0.5));
  const beak = at(P(cn(0.08, 0.22), 0xffc53d, { line: 0.12 }), 0, 0.1, 0.78);
  beak.rotation.x = Math.PI / 2 + 0.4;
  g.add(beak);
  for (const s of [-1, 1]) { const e = at(eye(0.055), s * 0.11, 0.22, 0.68); g.add(e); g.add(at(B(0.12, 0.025, 0.03, INK, { line: 0 }), s * 0.11, 0.3, 0.72)); }
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(s * 0.25, 0.1, 0);
    w.add(at(B(1.1, 0.06, 0.55, 0x6a3e22), s * 0.55, 0, 0));
    w.add(at(B(0.5, 0.05, 0.4, 0x4e2c18), s * 1.2, 0, -0.05));
    g.add(w);
    return w;
  });
  g.add(at(B(0.4, 0.05, 0.4, 0xffffff), 0, 0, -0.65));
  for (const s of [-1, 1]) g.add(at(S(0.07, 0xffc53d, { line: 0.14 }), s * 0.12, -0.3, 0.1));
  g.userData.wings = wings;
  g.visible = false;
  return g;
}

// ── the scene ────────────────────────────────────────────────────────────────
export function createHopperScene(canvas, course) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const SKY = 0xc8ecd0;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 20, 34);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
  const sun = sunnyLights(scene, { size: 13 });
  const fx = effects(scene);
  const eg = eagle();
  scene.add(eg);
  let swoop = null, shake = 0;
  const rows = new Map();
  const chicks = new Map();          // id -> { c, ring, tag, k, x, z, onRiver }
  const off = new THREE.Vector3();   // the camera, relative to the camera row
  let ahead = 24;                    // rows to build in front

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const look = new THREE.Vector3(0, 0, Z(5));
    const v = new THREE.Vector3();
    let lo = 3, hi = 60;
    const place = (d) => { camera.position.set(0, Math.sin(TILT) * d, look.z + Math.cos(TILT) * d); camera.lookAt(look); camera.updateMatrixWorld(); camera.updateProjectionMatrix(); };
    for (let i = 0; i < 28; i++) {
      const d = (lo + hi) / 2;
      place(d);
      // the play strip across the chick's row fits; the row below the camera row shows
      const fits = [[-COLS / 2 - 0.05, Z(3)], [COLS / 2 + 0.05, Z(3)]].every(([x, z]) => Math.abs(v.set(x, 0, z).project(camera).x) <= 0.99)
        && v.set(0, 0, Z(0.6)).project(camera).y >= -1;
      if (fits) hi = d; else lo = d;
    }
    place(hi);
    off.copy(camera.position);
    // how far up the screen reaches
    ahead = 10;
    for (let r = 6; r < 60; r++) { if (v.set(0, 0, Z(r)).project(camera).y > 1.02) break; ahead = r + 2; }
    const far = camera.position.distanceTo(new THREE.Vector3(0, 0, Z(ahead)));
    scene.fog.near = far - 6; scene.fog.far = far + 2;
  }

  function ensureRows(cam) {
    const lo = Math.floor(cam) - 4, hi = Math.ceil(cam) + ahead;
    for (const [n, o] of rows) if (n < lo - 1 || n > hi + 1) {
      scene.remove(o.g); rows.delete(n);
      if (o.lamp) { o.lamp.material.dispose(); o.warn.material.dispose(); }
    }
    for (let n = lo; n <= hi; n++) if (!rows.has(n)) { const o = buildRow(n, rowAt(course, n), rowAt(course, n + 1)); rows.set(n, o); scene.add(o.g); }
  }

  function crashAt(what, x, z, y) {
    if (what === "water" || what === "edge") {
      fx.burst(x, 0.1, z, { colors: [0x4fb8f0, 0xffffff, 0x9fe0ff], n: 18, speed: 3.4 });
      for (let i = 0; i < 4; i++) fx.puff(x, z, { color: 0xffffff, size: 0.16, up: 0.4 });
      fx.word("SPLASH!", x, 1.1, z, { color: "#9fe0ff", height: 0.5 });
    } else if (what === "eagle") {
      swoop = { x, z, t: 0 };
      eg.visible = true;
      fx.word("SNATCHED!", x, 1.4, z, { color: "#ffc53d", height: 0.5 });
    } else {
      fx.burst(x, y + 0.4, z, { colors: [0xffffff, 0xf4f1ff, 0xffa21a], n: 16, speed: 3, shape: "shard" });
      for (let i = 0; i < 3; i++) fx.puff(x, z, { color: 0xffffff, size: 0.18 });
      fx.word(what === "train" ? "TOOT!" : "SPLAT!", x, 1.2, z, { color: what === "train" ? "#ff8fc7" : "#ffc53d", height: 0.55 });
    }
  }

  // state: { t (course clock), cam, taken (Set), chicks: [{ id, me, slot, name, row, x, air, daze, face, crashes, last }] }
  function draw(st, dt0, now) {
    const dt = Math.max(0, Math.min(0.1, dt0 || 0));   // never backwards, never a leap
    const { t, cam } = st;
    ensureRows(cam);
    camera.position.set(off.x, off.y, off.z + Z(cam));
    if (shake > 0) { shake = Math.max(0, shake - dt * 2.5); camera.position.x += (Math.random() - 0.5) * shake * 0.25; camera.position.y += (Math.random() - 0.5) * shake * 0.25; }
    sun.position.set(-6, 14, Z(cam + 6) + 8);
    sun.target.position.set(0, 0, Z(cam + 6));
    for (const o of rows.values()) {
      const r = rowAt(course, o.n);
      if (o.kind === "road") {
        thingsAt(r, t).forEach((th, i) => { const cr = o.cars[i]; if (!cr) return; cr.position.x = X((th.x0 + th.x1) / 2); cr.userData.inner.position.y = Math.abs(Math.sin(now * 16 + i * 2 + o.n)) * 0.025; });
      } else if (o.kind === "river") {
        thingsAt(r, t).forEach((th, i) => { const l = o.logs[i]; if (!l) return; l.position.set(X((th.x0 + th.x1) / 2), -0.12 + Math.sin(now * 2.2 + i + o.n) * 0.025, 0); l.rotation.x = Math.sin(now * 1.7 + i) * 0.03; });
        o.ripples.forEach((m) => { let x = (m.userData.x0 + r.dir * r.speed * t * 0.6) % WIDE; if (x < 0) x += WIDE; m.position.x = x - WIDE / 2; });
      } else if (o.kind === "rail") {
        const tr = trainAt(r, t);
        const lit = (tr.warn || tr.on) && Math.floor(now * 6) % 2 === 0;
        o.lamp.material.color.setHex(lit ? 0xff3b3b : 0x5a1e22);
        o.warn.material.opacity = lit ? 0.22 : 0;
        o.train.visible = tr.on;
        if (tr.on) {
          o.train.rotation.y = r.dir > 0 ? 0 : Math.PI;
          o.train.position.x = r.dir > 0 ? X(tr.x) : X(tr.x + 12);
          if (Math.floor(now * 8) !== Math.floor((now - dt) * 8)) { const fx0 = r.dir > 0 ? X(tr.x + 11.6) : X(tr.x + 0.4); if (fx0 > -6 && fx0 < 6) fx.puff(fx0, Z(o.n), { color: 0xffffff, size: 0.2, up: 2.4 }); }
        }
      } else {
        if (o.coin) {
          o.coin.visible = !st.taken.has(o.n);
          o.coin.userData.spin.rotation.y = now * 3;
          o.coin.position.y = 0.42 + Math.sin(now * 3 + o.n) * 0.05;
        }
        for (const tr of o.trees) tr.userData.sway.rotation.z = Math.sin(now * 1.4 + o.n + tr.position.x) * 0.03;
      }
    }
    // the chicks
    const seen = new Set();
    for (const s of st.chicks) {
      seen.add(s.id);
      let ch = chicks.get(s.id);
      const colour = CHICK_COLOURS[s.slot % CHICK_COLOURS.length];
      if (!ch) {
        const c = chick(colour, (s.slot + 1) * 3.1);
        scene.add(c);
        const rg = ring(s.me ? 0xffffff : colour, 0.42);
        scene.add(rg);
        ch = { c, ring: rg, tag: null, tagText: "", k: s.crashes, x: 0, z: 0, y: 0 };
        chicks.set(s.id, ch);
      }
      if (s.name !== ch.tagText) {
        if (ch.tag) { scene.remove(ch.tag); ch.tag.material.map.dispose(); ch.tag.material.dispose(); }
        ch.tag = s.name ? nameTag(s.name, colour) : null;
        if (ch.tag) scene.add(ch.tag);
        ch.tagText = s.name;
      }
      if (s.crashes > ch.k) { crashAt(s.last, ch.x, ch.z, ch.y); ch.c.userData.pop = 0; if (s.me) shake = 1; }
      ch.k = s.crashes;
      const r = rowAt(course, Math.round(s.row));
      const base = s.air < 0 && r.kind === "river" ? LOG_TOP : 0;
      const x = X(s.x + 0.5), z = Z(s.row);
      ch.c.position.set(x, base, z);
      if (ch.wasAir && s.air < 0) { fx.puff(x - 0.15, z + 0.1, { size: 0.09 }); fx.puff(x + 0.15, z + 0.1, { size: 0.09 }); }
      ch.wasAir = s.air >= 0;
      ch.x = x; ch.z = z; ch.y = base;
      poseChick(ch.c, now, dt, { air: s.air, daze: s.daze, face: s.face });
      ch.ring.position.set(x, base + 0.03, z);
      ch.ring.visible = s.air < 0;
      if (ch.tag) ch.tag.position.set(x, base + 1.65 + (s.air >= 0 ? Math.sin(Math.PI * s.air) * 0.5 : 0), z);
    }
    for (const [id, ch] of chicks) if (!seen.has(id)) { scene.remove(ch.c, ch.ring); if (ch.tag) scene.remove(ch.tag); chicks.delete(id); }
    // the eagle's swoop: in from behind, down to the spot, and away with you
    if (swoop) {
      swoop.t += dt;
      const k = Math.min(1, swoop.t / 1.1);
      const x = swoop.x + (k - 0.5) * -9, z = swoop.z + 2.5 - k * 5;
      const y = 0.9 + Math.pow((k - 0.5) * 2, 2) * 5;
      eg.position.set(x, y, z);
      eg.rotation.order = "YXZ";
      eg.rotation.set((0.5 - k) * 1.2, Math.atan2(-9, -5), 0);
      eg.userData.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(now * 16) * 0.5; });
      if (k >= 1) { swoop = null; eg.visible = false; }
    }
    fx.tick(dt);
    renderer.render(scene, camera);
  }

  return {
    resize,
    draw,
    dispose() {
      renderer.dispose();
      for (const ch of chicks.values()) if (ch.tag) { ch.tag.material.map.dispose(); ch.tag.material.dispose(); }
      for (const g of GEO.values()) g.dispose();
      GEO.clear();
    },
  };
}
