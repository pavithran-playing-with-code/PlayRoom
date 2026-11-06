// src/components/games/flappyScene.js
// FLAPPY DASH, drawn in 3D with the PlayRoom look kit: a toy meadow seen from
// the side — rolling hills and puffy clouds drifting by behind, flowers in
// the grass — towers of stacked toy blocks to fly between, and the birds:
// round, fluffy, a tuft on the head, wings that beat on every flap, a nose
// that tips up as they climb and down as they drop. Friends' birds fly the
// same course a little way behind yours, each with its name.
//
// Only drawing: flappySim.js has the rules. Sim units are pixels in a
// VIEW_W × VIEW_H window with y down; here 40 px is a metre, x runs on with
// the scroll, y is up from the grass.
import * as THREE from "three";
import { VIEW_W, VIEW_H, GROUND, BIRD_X, PIPE_W } from "./flappySim";
import { toon, part, at, effects, sunnyLights, nameTag, INK } from "./toyKit";

export const BIRD_COLOURS = [0xffd23f, 0x4cc9f0, 0xff8fc7, 0x8fdb5c, 0xffa36c, 0x9b5de5, 0x3dd6c0, 0xff6b6b];
const U = 40;
const WX = (px) => px / U;
const WY = (py) => (VIEW_H - GROUND - py) / U;
const TOP = WY(-40);                           // above the window: towers reach past it
const TW = PIPE_W / U;                         // a tower's width
const BLOCK = 0.82;
const BLOCK_COLOURS = [0xff6b6b, 0x4cc9f0, 0xffc53d, 0x8fdb5c, 0x9b5de5, 0xff9f43];
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const GEO = new Map();
const geo = (k, f) => { if (!GEO.has(k)) GEO.set(k, f()); return GEO.get(k); };
const sph = (r) => geo(`s${r}`, () => new THREE.SphereGeometry(r, 18, 14));
const bx = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (a, b, h) => geo(`c${a},${b},${h}`, () => new THREE.CylinderGeometry(a, b, h, 16));
const cn = (r, h) => geo(`k${r},${h}`, () => new THREE.ConeGeometry(r, h, 14));
const P = (g, c, o) => part(g, c, o);
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

function eye(r) {
  const e = new THREE.Group();
  e.add(P(sph(r), 0xffffff, { line: 0.14, shadow: false }));
  e.add(at(P(sph(r * 0.6), INK, { line: 0, shadow: false }), 0, -r * 0.05, r * 0.55));
  e.add(at(P(sph(r * 0.22), 0xffffff, { line: 0, shadow: false }), r * 0.18, r * 0.25, r * 1.02));
  return e;
}

// ── a bird: faces +x ──────────────────────────────────────────────────────────
function bird(colour) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(at(P(sph(0.42), colour), 0, 0, 0, 1.05, 0.94, 0.94));
  body.add(at(P(sph(0.3), 0xfff3c4, { line: 0, shadow: false }), 0.12, -0.13, 0, 1, 0.8, 0.95));
  // the beak, top and bottom
  const beak = at(P(cn(0.11, 0.3), 0xff8a3d, { line: 0.12 }), 0.48, -0.02, 0);
  beak.rotation.z = -Math.PI / 2;
  body.add(beak);
  // eyes on both sides of the face, a little forward, and pink cheeks
  const eyes = [-1, 1].map((s) => { const e = at(eye(0.12), 0.24, 0.12, s * 0.27); e.lookAt(e.position.x + 0.6, e.position.y, e.position.z + s * 0.8); body.add(e); return e; });
  for (const s of [-1, 1]) body.add(at(P(sph(0.07), 0xff8fc7, { line: 0, shadow: false }), 0.28, -0.07, s * 0.33, 1, 0.6, 0.5));
  // a tuft on the head and the tail
  for (const [x, rz] of [[-0.02, 0.35], [0.08, -0.15]]) { const t = at(P(cn(0.07, 0.26), shade(colour, 0.85), { line: 0.12 }), x, 0.46, 0); t.rotation.z = rz; body.add(t); }
  for (const [y, rz] of [[0.08, 2.0], [-0.06, 1.75]]) { const t = at(P(cn(0.11, 0.34), shade(colour, 0.85), { line: 0.1 }), -0.48, y, 0); t.rotation.z = rz; body.add(t); }
  // wings: a pivot at the shoulder on each side
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(-0.05, 0.05, s * 0.38);
    w.add(at(P(sph(0.2), shade(colour, 0.85), { line: 0.1 }), -0.05, 0, s * 0.06, 1.2, 0.45, 0.9));
    body.add(w);
    return w;
  });
  for (const s of [-1, 1]) body.add(at(P(sph(0.06), 0xff8a3d, { line: 0.14 }), 0.02, -0.4, s * 0.12, 1.3, 0.6, 1));
  const stars = new THREE.Group();
  for (let i = 0; i < 3; i++) stars.add(new THREE.Mesh(geo("star", () => new THREE.OctahedronGeometry(0.08)), new THREE.MeshBasicMaterial({ color: 0xffd447 })));
  stars.position.y = 0.62;
  root.add(stars);
  root.userData = { body, eyes, wings, stars, squash: 0 };
  return root;
}

function poseBird(b, t, dt, { vy, started, stun, flapAgo }) {
  const u = b.userData;
  const tilt = started ? Math.max(-0.45, Math.min(0.9, vy / 620)) : Math.sin(t * 3) * 0.06;
  u.body.rotation.z = -tilt;
  const f = flapAgo < 0.2 ? 1 - flapAgo / 0.2 : 0;
  // a flap: wings snap down from high, the body stretches; hovering, they flutter
  const beat = !started ? Math.sin(t * 22) * 0.5 : f > 0 ? Math.cos(f * Math.PI) * 1.1 : Math.sin(t * 6) * 0.12 - 0.15;
  u.wings.forEach((w, i) => { const s = i ? 1 : -1; w.rotation.x = s * (0.35 + beat); });
  const st = 1 + f * 0.12;
  u.body.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
  u.body.position.y = !started ? Math.sin(t * 3) * 0.12 : 0;
  u.stars.visible = stun > 0;
  u.stars.children.forEach((s, i) => { const a = t * 6 + (i * Math.PI * 2) / 3; s.position.set(Math.cos(a) * 0.38, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.38); s.rotation.y = t * 4; });
  const blink = (t % 3.1) < 0.1;
  for (const e of u.eyes) e.scale.y = stun > 0 ? 0.25 : blink ? 0.15 : 1;
}

// ── a tower of toy blocks, from y0 up to y1, its cap at the gap ──────────────
// the cap's stripe shows the level: red, orange, yellow, green, blue, purple…
const LEVEL_STRIPES = [0xff6b6b, 0xff9f43, 0xffc53d, 0x8fdb5c, 0x4cc9f0, 0x9b5de5];
function tower(n, y0, y1, capAtTop, level = 1) {
  const g = new THREE.Group();
  const h = y1 - y0;
  const count = Math.ceil(h / BLOCK);
  for (let i = 0; i < count; i++) {
    const bh = Math.min(BLOCK, h - i * BLOCK);
    if (bh <= 0.02) break;
    const col = BLOCK_COLOURS[Math.floor(hash(n, i) * BLOCK_COLOURS.length)];
    const y = capAtTop ? y0 + i * BLOCK + bh / 2 : y1 - i * BLOCK - bh / 2;
    g.add(at(P(bx(TW - 0.06, bh - 0.04, TW - 0.06), col, { line: 0.04 }), 0, y, 0));
  }
  // the cap: a wider block at the gap, with studs on top of the lower tower
  const capY = capAtTop ? y1 - 0.2 : y0 + 0.2;
  g.add(at(P(bx(TW + 0.3, 0.42, TW + 0.3), 0xfff6e6, { line: 0.05 }), 0, capY, 0));
  g.add(at(P(bx(TW + 0.32, 0.1, TW + 0.32), LEVEL_STRIPES[(level - 1) % LEVEL_STRIPES.length], { line: 0 }), 0, capY, 0));
  if (capAtTop) for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) g.add(at(P(cyl(0.13, 0.13, 0.12), 0xfff6e6, { line: 0.1 }), x, y1 + 0.06, z));
  return g;
}

// ── scenery, in chunks along the way ─────────────────────────────────────────
const CHUNK = 12;
function chunk(i) {
  const g = new THREE.Group();
  const x0 = i * CHUNK;
  // the ground: grass on a slab of earth, a little wider than the view
  g.add(at(new THREE.Mesh(bx(CHUNK + 0.02, 0.5, 30), toon(0x8fd35a)), x0 + CHUNK / 2, -0.25, -3));
  g.add(at(new THREE.Mesh(bx(CHUNK + 0.02, 0.3, 0.3), toon(0x6fb848)), x0 + CHUNK / 2, -0.05, 1.6));        // a darker edge of turf
  g.add(at(new THREE.Mesh(bx(CHUNK + 0.02, 6, 30), toon(0xc98f55)), x0 + CHUNK / 2, -3.5, -3));
  g.children.forEach((m) => { m.receiveShadow = true; });
  for (let k = 0; k < 14; k++) {
    const x = x0 + hash(i, k) * CHUNK, z = -2.6 + hash(k, i) * 5;
    if (Math.abs(z) < 0.9) continue;
    if (hash(i * 3, k) > 0.5) g.add(at(P(sph(0.07), [0xffffff, 0xffd447, 0xff8fc7, 0xb9a6ff][k % 4], { line: 0.2, shadow: false }), x, 0.06, z));
    else g.add(at(P(cn(0.06, 0.18), 0x6cc04a, { line: 0, shadow: false }), x, 0.08, z));
  }
  // round trees and bushes behind
  for (let k = 0; k < 3; k++) {
    const x = x0 + (k + hash(i, k + 7)) * (CHUNK / 3), z = -4 - hash(k, i + 3) * 3;
    g.add(at(P(cyl(0.12, 0.16, 1.2), 0x8a5a33, { line: 0.1 }), x, 0.6, z));
    g.add(at(P(sph(0.8), hash(i, k) > 0.5 ? 0x5cbf4a : 0x72d35a), x, 1.6, z, 1, 0.9, 1));
    g.add(at(P(sph(0.5), 0x7fdc62), x + 0.25, 2.2, z + 0.2));
  }
  // hills far back
  for (let k = 0; k < 2; k++) {
    const x = x0 + hash(i, k + 20) * CHUNK, r = 5 + hash(k, i + 20) * 4;
    const m = new THREE.Mesh(sph(1), toon(k ? 0x9ee07a : 0xb5ea8c));
    at(m, x, -r * 0.35, -16 - k * 4, r * 1.6, r, r);
    g.add(m);
  }
  // clouds
  for (let k = 0; k < 2; k++) {
    const x = x0 + hash(i, k + 40) * CHUNK, y = 7 + hash(k, i + 40) * 5, z = -8 - hash(i + 1, k) * 6;
    for (const [dx, dy, r] of [[0, 0, 0.9], [0.9, 0.3, 1.1], [1.9, 0, 0.8], [0.9, -0.2, 0.9]]) {
      const c = new THREE.Mesh(sph(1), toon(0xffffff));
      at(c, x + dx, y + dy, z, r, r * 0.8, r * 0.8);
      g.add(c);
    }
  }
  return g;
}

export function createFlappyScene(canvas, course) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fdcff);
  scene.fog = new THREE.Fog(0xbfe7ff, 22, 48);
  const camera = new THREE.PerspectiveCamera(38, VIEW_W / VIEW_H, 0.1, 120);
  const sun = sunnyLights(scene, { size: 9 });
  const fx = effects(scene);
  const towers = new Map();           // pipe index -> group
  const chunks = new Map();
  const birds = new Map();            // id -> { b, tag, tagText, k, pipes, x, y }
  let dist = 20;

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // the window's height, VIEW_H, fits the screen at the birds' plane
    const hh = (VIEW_H / U) / 2 + 0.15;
    dist = hh / Math.tan((camera.fov * Math.PI) / 360);
    camera.updateProjectionMatrix();
  }

  function towersAround(sx) {
    const lo = sx - 120, hi = sx + VIEW_W + 260;
    for (const [i, g] of towers) { const p = course.list[i]; if (!p || p.x < lo || p.x > hi) { scene.remove(g); towers.delete(i); } }
    for (let i = 0; i < course.list.length; i++) {
      const p = course.list[i];
      if (p.x < lo) continue;
      if (p.x > hi) break;
      if (!towers.has(i)) {
        const g = new THREE.Group();
        g.add(tower(i, 0, WY(p.gapY + p.gap / 2), true, p.level));
        g.add(tower(i + 999, WY(p.gapY - p.gap / 2), TOP, false, p.level));
        g.position.x = WX(p.x + PIPE_W / 2);
        scene.add(g);
        towers.set(i, g);
      }
      towers.get(i).visible = !p.gone;
    }
  }

  function chunksAround(cx) {
    const lo = Math.floor((cx - 22) / CHUNK), hi = Math.floor((cx + 30) / CHUNK);
    for (const [i, g] of chunks) if (i < lo || i > hi) { scene.remove(g); chunks.delete(i); }
    for (let i = lo; i <= hi; i++) if (!chunks.has(i)) { const g = chunk(i); scene.add(g); chunks.set(i, g); }
  }

  // st: { sx (my scroll), birds: [{ id, me, slot, name, x, y, vy, started, stun, flapAgo, crashes, pipes }] }
  function draw(st, dt0, now) {
    const dt = Math.max(0, Math.min(0.1, dt0 || 0));
    const cx = WX(st.sx + VIEW_W / 2), cy = (WY(VIEW_H) + WY(0)) / 2;
    towersAround(st.sx);
    chunksAround(cx);
    camera.position.set(cx + 2.2, cy + 0.6, dist);
    camera.lookAt(cx + 0.25, cy, 0);
    sun.position.set(cx - 6, 16, 10);
    sun.target.position.set(cx, 0, 0);
    const seen = new Set();
    for (const s of st.birds) {
      seen.add(s.id);
      let o = birds.get(s.id);
      const colour = BIRD_COLOURS[s.slot % BIRD_COLOURS.length];
      if (!o) {
        const b = bird(colour);
        scene.add(b);
        o = { b, tag: null, tagText: "", k: s.crashes, pipes: s.pipes, x: 0, y: 0 };
        birds.set(s.id, o);
      }
      if (s.name !== o.tagText) {
        if (o.tag) { scene.remove(o.tag); o.tag.material.map.dispose(); o.tag.material.dispose(); }
        o.tag = s.name ? nameTag(s.name, colour) : null;
        if (o.tag) scene.add(o.tag);
        o.tagText = s.name;
      }
      const x = WX(s.x + BIRD_X), y = WY(s.y), z = s.me ? 0 : -1.1 - (s.slot % 3) * 0.7;
      if (s.crashes > o.k) {
        fx.burst(o.x, o.y, o.z || 0, { colors: [colour, 0xffffff, 0xfff3c4], n: 16, speed: 3, shape: "shard" });
        if (s.me) fx.word("BONK!", o.x, o.y + 0.8, 0.5, { color: "#ff8fc7", height: 0.7 });
      }
      if (s.me && s.pipes > o.pipes) { fx.word("+10", x, y + 0.8, 0.4, { color: "#ffc53d", height: 0.5, life: 0.8 }); fx.burst(x + 0.2, y, 0.3, { n: 6, speed: 1.6 }); }
      o.k = s.crashes; o.pipes = s.pipes;
      o.b.position.set(x, y, z);
      o.x = x; o.y = y; o.z = z;
      poseBird(o.b, now, dt, s);
      if (o.tag) o.tag.position.set(x, y + 0.85, z);
    }
    for (const [id, o] of birds) if (!seen.has(id)) { scene.remove(o.b); if (o.tag) scene.remove(o.tag); birds.delete(id); }
    fx.tick(dt);
    renderer.render(scene, camera);
  }

  return {
    resize,
    draw,
    dispose() {
      renderer.dispose();
      for (const o of birds.values()) if (o.tag) { o.tag.material.map.dispose(); o.tag.material.dispose(); }
      for (const g of GEO.values()) g.dispose();
      GEO.clear();
    },
  };
}
