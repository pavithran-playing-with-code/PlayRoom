// src/components/games/dinoScene.js
// DINO DASH, drawn in 3D with the PlayRoom look kit: a toy desert seen from
// the side — dunes and mesas drifting by behind, round clouds, a sun that
// sinks as the levels go by (day, sunset, a starry night, then day again) —
// toy cacti with a flower or two, red birds flapping, and the dinos: round
// and green (friends in their own colours), spikes down the back, a tail that
// swings, legs that run, a jump that tucks, a duck that stretches out low.
//
// Only drawing: dinoSim.js has the rules. 40 sim units are a metre; x runs
// on with the course, y is up from the sand.
import * as THREE from "three";
import { VIEW_W, DINO_X } from "./dinoSim";
import { toon, part, at, effects, nameTag, INK } from "./toyKit";

export const DINO_COLOURS = [0x8fdb5c, 0x4cc9f0, 0xff8fc7, 0xffc53d, 0xffa36c, 0x9b5de5, 0x3dd6c0, 0xff6b6b];
const U = 40;
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const GEO = new Map();
const geo = (k, f) => { if (!GEO.has(k)) GEO.set(k, f()); return GEO.get(k); };
const sph = (r) => geo(`s${r}`, () => new THREE.SphereGeometry(r, 16, 12));
const cyl = (a, b, h) => geo(`c${a},${b},${h}`, () => new THREE.CylinderGeometry(a, b, h, 14));
const cn = (r, h) => geo(`k${r},${h}`, () => new THREE.ConeGeometry(r, h, 12));
const bx = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const P = (g, c, o) => part(g, c, o);
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

// the sky for each level, one after another, round and round
const SKIES = [
  { sky: 0xbfe6ff, fog: 0xe6f3ff, sand: 0xf4d58d, dune: 0xf0c47a, sun: 0xfff1c9, sunI: 1.0, hemi: 0.6, orb: 0xffd447, stars: 0 },     // day
  { sky: 0xffb38a, fog: 0xffc9a3, sand: 0xe9b27a, dune: 0xd98f63, sun: 0xffb27a, sunI: 0.85, hemi: 0.5, orb: 0xff7a4a, stars: 0 },    // sunset
  { sky: 0x2a2f5c, fog: 0x2f3566, sand: 0xa8a2c8, dune: 0x7a74a8, sun: 0xc9d4ff, sunI: 0.55, hemi: 0.45, orb: 0xf2f0ff, stars: 1 },   // night
];
export const SKY_NAMES = ["sunny day", "sunset", "starry night"];

function eye(r) {
  const e = new THREE.Group();
  e.add(P(sph(r), 0xffffff, { line: 0.14, shadow: false }));
  e.add(at(P(sph(r * 0.6), INK, { line: 0, shadow: false }), 0, 0, r * 0.55));
  e.add(at(P(sph(r * 0.22), 0xffffff, { line: 0, shadow: false }), r * 0.2, r * 0.25, r * 1.02));
  return e;
}

// ── a dino: faces +x, about 1.15 tall ────────────────────────────────────────
function dino(colour) {
  const root = new THREE.Group();
  const body = new THREE.Group();          // bob, squash and the duck
  root.add(body);
  const dark = shade(colour, 0.78);
  body.add(at(P(sph(0.4), colour), 0, 0.62, 0, 1.15, 1, 0.9));
  body.add(at(P(sph(0.28), 0xeefad8, { line: 0, shadow: false }), 0.14, 0.52, 0, 1, 0.9, 0.85));
  // the tail, two cones swinging behind
  const tail = new THREE.Group();
  tail.position.set(-0.36, 0.62, 0);
  const t1 = at(P(cn(0.2, 0.62), colour, { line: 0.08 }), -0.26, 0.04, 0); t1.rotation.z = Math.PI / 2 + 0.25; tail.add(t1);
  body.add(tail);
  // spikes down the back
  for (let i = 0; i < 4; i++) { const sp = at(P(cn(0.07, 0.18), dark, { line: 0.12 }), -0.3 + i * 0.18, 0.98 - Math.abs(i - 1.2) * 0.06, 0); sp.rotation.z = 0.25; body.add(sp); }
  // the head on a neck, a snout, eyes, nostrils, a smile
  const head = new THREE.Group();
  head.position.set(0.36, 1.05, 0);
  head.add(at(P(sph(0.28), colour), 0.06, 0.04, 0, 1.15, 0.95, 0.95));
  head.add(at(P(sph(0.2), colour), 0.3, -0.04, 0, 1.1, 0.8, 0.9));
  const eyes = [-1, 1].map((s) => { const e = at(eye(0.085), 0.12, 0.14, s * 0.2); e.lookAt(e.position.x + 0.7, e.position.y, e.position.z + s * 0.6); head.add(e); return e; });
  for (const s of [-1, 1]) head.add(at(P(sph(0.025), INK, { line: 0, shadow: false }), 0.5, 0.02, s * 0.07));
  for (const s of [-1, 1]) head.add(at(P(sph(0.05), 0xff8fc7, { line: 0, shadow: false }), 0.24, -0.06, s * 0.24, 1, 0.6, 0.5));
  body.add(head);
  // tiny arms
  for (const s of [-1, 1]) { const a = at(P(cyl(0.04, 0.035, 0.18), colour, { line: 0.12 }), 0.32, 0.5, s * 0.22); a.rotation.z = -0.9; body.add(a); }
  // legs: a pivot at the hip, a thigh, a foot
  const legs = [-1, 1].map((s) => {
    const l = new THREE.Group();
    l.position.set(0.02, 0.42, s * 0.18);
    l.add(at(P(cyl(0.1, 0.08, 0.32), colour, { line: 0.1 }), 0, -0.16, 0));
    l.add(at(P(sph(0.09), dark, { line: 0.12 }), 0.06, -0.34, 0, 1.4, 0.6, 1));
    root.add(l);
    return l;
  });
  const stars = new THREE.Group();
  for (let i = 0; i < 3; i++) stars.add(new THREE.Mesh(geo("star", () => new THREE.OctahedronGeometry(0.08)), new THREE.MeshBasicMaterial({ color: 0xffd447 })));
  stars.position.set(0.45, 1.55, 0);
  root.add(stars);
  root.userData = { body, head, tail, legs, eyes, stars, duck: 0 };
  return root;
}

function poseDino(d, t, dt, { y, duck, stun, running, started }) {
  const u = d.userData;
  u.duck += ((duck && y <= 0 ? 1 : 0) - u.duck) * Math.min(1, dt * 18);
  const air = y > 0;
  const ph = t * 16;
  // running: legs swing, the body bobs; in the air: legs tucked, tail up
  u.legs.forEach((l, i) => { l.rotation.z = running && !air ? Math.sin(ph + i * Math.PI) * 0.8 : air ? (i ? 0.7 : 0.5) : 0; });
  const bob = running && !air ? Math.abs(Math.sin(ph)) * 0.05 : !started ? Math.sin(t * 3) * 0.02 : 0;
  // ducking: low and long, the head pushed forward
  u.body.scale.set(1 + u.duck * 0.3, 1 - u.duck * 0.42, 1);
  u.body.position.set(u.duck * 0.12, bob - u.duck * 0.2, 0);
  u.head.position.set(0.36 + u.duck * 0.18, 1.05 - u.duck * 0.12, 0);
  u.tail.rotation.z = (air ? 0.4 : 0) + Math.sin(t * (running ? 14 : 3)) * 0.12;
  u.stars.visible = stun > 0;
  u.stars.children.forEach((s, i) => { const a = t * 6 + (i * Math.PI * 2) / 3; s.position.set(Math.cos(a) * 0.3, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.3); });
  const blink = (t % 3.3) < 0.1;
  for (const e of u.eyes) e.scale.y = stun > 0 ? 0.2 : blink ? 0.15 : 1;
}

// ── obstacles ────────────────────────────────────────────────────────────────
function cactus(o, i) {
  const g = new THREE.Group();
  const h = o.h / U, tw = o.tw / U;
  for (let j = 0; j < o.n; j++) {
    const x = (j * (o.tw + 6) + o.tw / 2) / U;
    const col = j % 2 ? 0x4fae5a : 0x5dbb5a;
    g.add(at(P(cyl(tw / 2, tw / 2, h - tw / 2), col, { line: 0.06 }), x, (h - tw / 2) / 2, 0));
    g.add(at(P(sph(tw / 2), col, { line: 0.06 }), x, h - tw / 2, 0));
    // an arm, up and out
    const s = j % 2 ? 1 : -1, ay = h * (j % 2 ? 0.48 : 0.6);
    const arm = at(P(cyl(tw * 0.28, tw * 0.28, tw * 0.9), col, { line: 0.08 }), x + s * tw * 0.6, ay, 0);
    arm.rotation.z = Math.PI / 2; g.add(arm);
    g.add(at(P(cyl(tw * 0.28, tw * 0.28, tw * 0.9), col, { line: 0.08 }), x + s * tw * 1.0, ay + tw * 0.4, 0));
    g.add(at(P(sph(tw * 0.28), col, { line: 0.08 }), x + s * tw * 1.0, ay + tw * 0.85, 0));
    if (hash(i, j) > 0.6) g.add(at(P(sph(0.06), 0xff8fc7, { line: 0.15 }), x, h + 0.02, 0));
  }
  return g;
}

function bird() {
  const g = new THREE.Group();
  g.add(at(P(sph(0.26), 0xff6b6b), 0.5, 0.33, 0, 1.4, 0.8, 0.8));
  g.add(at(P(sph(0.17), 0xff6b6b), 0.2, 0.38, 0));
  const beak = at(P(cn(0.07, 0.22), 0xffc53d, { line: 0.12 }), 0.02, 0.36, 0); beak.rotation.z = Math.PI / 2; g.add(beak);
  for (const s of [-1, 1]) { const e = at(eye(0.05), 0.18, 0.44, s * 0.12); e.lookAt(e.position.x - 0.6, e.position.y, e.position.z + s * 0.6); g.add(e); }
  const tail = at(P(cn(0.1, 0.24), 0xff9a9a, { line: 0.1 }), 0.86, 0.36, 0); tail.rotation.z = -Math.PI / 2; g.add(tail);
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(0.5, 0.42, s * 0.16);
    w.add(at(P(bx(0.34, 0.04, 0.42), 0xff9a9a, { line: 0.08 }), 0, 0, s * 0.2));
    g.add(w);
    return w;
  });
  g.userData.wings = wings;
  return g;
}

function faded(obj) {
  obj.traverse((o) => {
    if (!o.material) return;
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.opacity = 0.3;
    o.material.depthWrite = false;
  });
}

// ── scenery chunks along the way ─────────────────────────────────────────────
const CHUNK = 14;
function chunk(i, mats) {
  const g = new THREE.Group();
  const x0 = i * CHUNK;
  const ground = new THREE.Mesh(bx(CHUNK + 0.3, 6, 30), mats.sand);
  ground.position.set(x0 + CHUNK / 2, -3, -6);
  ground.receiveShadow = true;
  g.add(ground);
  for (let k = 0; k < 10; k++) {
    const x = x0 + hash(i, k) * CHUNK, z = 1.4 + hash(k, i) * 2.5;
    g.add(at(new THREE.Mesh(sph(1), mats.pebble), x, 0, z, 0.08 + hash(i + 3, k) * 0.1, 0.05, 0.08));
  }
  for (let k = 0; k < 2; k++) {                     // dunes behind
    const x = x0 + hash(i, k + 20) * CHUNK, r = 3 + hash(k, i + 20) * 3;
    g.add(at(new THREE.Mesh(sph(1), mats.dune), x, -r * 0.45, -9 - k * 5, r * 1.8, r, r));
  }
  if (hash(i, 77) > 0.45) {                         // a mesa far off
    const x = x0 + hash(i, 78) * CHUNK, h = 2 + hash(i, 79) * 2.5;
    g.add(at(new THREE.Mesh(cyl(2.2, 2.6, h), mats.mesa), x, h / 2 - 0.2, -18));
  }
  for (let k = 0; k < 2; k++) {                     // far cacti
    const x = x0 + hash(i, k + 40) * CHUNK;
    g.add(at(P(cyl(0.12, 0.12, 1.1), 0x4fae5a, { line: 0.06 }), x, 0.55, -4.5 - hash(k, i + 40) * 2));
  }
  for (let k = 0; k < 2; k++) {                     // clouds
    const x = x0 + hash(i, k + 60) * CHUNK, y = 5 + hash(k, i + 60) * 3, z = -10 - hash(i + 2, k) * 5;
    for (const [dx, dy, r] of [[0, 0, 0.8], [0.8, 0.25, 1], [1.7, 0, 0.7]]) g.add(at(new THREE.Mesh(sph(1), mats.cloud), x + dx, y + dy, z, r, r * 0.75, r * 0.75));
  }
  return g;
}

export function createDinoScene(canvas, course) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const s0 = SKIES[0];
  scene.background = new THREE.Color(s0.sky);
  scene.fog = new THREE.Fog(s0.fog, 20, 46);
  const camera = new THREE.PerspectiveCamera(32, 2, 0.1, 140);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb08a5a, s0.hemi);
  const sun = new THREE.DirectionalLight(s0.sun, s0.sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 8, bottom: -6, near: 1, far: 50 });
  sun.shadow.bias = -0.0008;
  scene.add(hemi, sun, sun.target);
  const mats = { sand: toon(s0.sand).clone(), dune: toon(s0.dune).clone(), mesa: toon(0xd98f63).clone(), pebble: toon(0xc9a36b), cloud: toon(0xffffff).clone() };
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 18), new THREE.MeshBasicMaterial({ color: s0.orb, fog: false }));
  scene.add(orb);
  const starPts = [];
  for (let k = 0; k < 220; k++) starPts.push(((k * 37) % 120) - 50, 4 + ((k * 0.618) % 1) * 14, -30 - (k % 7));
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPts, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
  scene.add(stars);
  const fx = effects(scene);
  const obs = new Map();         // obstacle index -> group
  const chunks = new Map();
  const dinos = new Map();       // id -> { d, tag, tagText, k, x, y, puffAt }
  let off = new THREE.Vector3(), look = new THREE.Vector3(), skyK = 0, skyFrom = 0, skyTo = 0;
  const cA = new THREE.Color(), cB = new THREE.Color();

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // VIEW_W of course fits across, the dino near the left; a little from above and in front
    const width = VIEW_W / U + 0.4;
    const dist = (width / 2) / Math.tan((camera.fov * Math.PI) / 360) / camera.aspect;
    off.set(1.2, 1.9 + dist * 0.12, dist);
    look.set(0, 1.4 + (h / w > 0.5 ? 0.8 : 0), 0);
    camera.updateProjectionMatrix();
  }

  function obstaclesAround(sx) {
    const lo = sx - 200, hi = sx + VIEW_W + 300;
    for (const [i, g] of obs) { const o = course.list[i]; if (!o || o.x + o.w < lo || o.x > hi) { scene.remove(g); obs.delete(i); } }
    for (let i = 0; i < course.list.length; i++) {
      const o = course.list[i];
      if (o.x + o.w < lo) continue;
      if (o.x > hi) break;
      if (!obs.has(i)) {
        const g = o.kind === "cactus" ? cactus(o, i) : bird();
        g.position.set(o.x / U, o.lift / U, 0);
        g.userData.kind = o.kind;
        scene.add(g);
        obs.set(i, g);
      }
    }
  }

  function chunksAround(cx) {
    const lo = Math.floor((cx - 26) / CHUNK), hi = Math.floor((cx + 34) / CHUNK);
    for (const [i, g] of chunks) if (i < lo || i > hi) { scene.remove(g); chunks.delete(i); }
    for (let i = lo; i <= hi; i++) if (!chunks.has(i)) { const g = chunk(i, mats); scene.add(g); chunks.set(i, g); }
  }

  function setSky(level, dt) {
    const want = (level - 1) % SKIES.length;
    if (want !== skyTo) { skyFrom = skyTo; skyTo = want; skyK = 0; }
    skyK = Math.min(1, skyK + dt / 2.5);
    const A = SKIES[skyFrom], B = SKIES[skyTo], k = skyK;
    const mix = (a, b, out) => out.set(a).lerp(cB.set(b), k);
    mix(A.sky, B.sky, scene.background);
    mix(A.fog, B.fog, scene.fog.color);
    mix(A.sand, B.sand, mats.sand.color);
    mix(A.dune, B.dune, mats.dune.color);
    mats.mesa.color.copy(mats.dune.color).multiplyScalar(0.82);
    mix(A.sun, B.sun, sun.color);
    mix(A.orb, B.orb, orb.material.color);
    const night = A.stars * (1 - k) + B.stars * k;
    mats.cloud.color.set(0xffffff).lerp(cA.set(0x8a8fc0), night);
    sun.intensity = A.sunI + (B.sunI - A.sunI) * k;
    hemi.intensity = A.hemi + (B.hemi - A.hemi) * k;
    stars.material.opacity = A.stars + (B.stars - A.stars) * k;
    return { A, B, k };
  }

  // st: { sx (my distance), level, hit (Set), dinos: [{ id, me, slot, name, x, y, duck, stun, running, started, crashes }] }
  function draw(st, dt0, now) {
    const dt = Math.max(0, Math.min(0.1, dt0 || 0));
    const cx = (st.sx + DINO_X) / U;
    obstaclesAround(st.sx);
    chunksAround(cx);
    const { k } = setSky(st.level, dt);
    const camX = (st.sx + VIEW_W / 2) / U;
    camera.position.set(camX + off.x, off.y, off.z);
    camera.lookAt(camX + 0.6, look.y, 0);
    sun.position.set(camX - 8, 14, 10);
    sun.target.position.set(camX, 0, 0);
    // the sun (or moon) sinks a little each level, and rises again with the day
    const sky = (st.level - 1) % SKIES.length;
    const orbY = [9, 4.5, 8][sky] * k + [9, 4.5, 8][skyFrom] * (1 - k);
    orb.position.set(camX + 7, orbY, -40);
    stars.position.x = camX;
    // obstacles: birds flap, and the ones you crashed into fade
    for (const [i, g] of obs) {
      if (st.hit.has(i) && !g.userData.faded) { faded(g); g.userData.faded = true; }
      if (g.userData.kind === "bird") g.userData.wings.forEach((w, j) => { w.rotation.x = (j ? 1 : -1) * Math.sin(now * 14) * 0.7; });
    }
    // the dinos
    const seen = new Set();
    for (const s of st.dinos) {
      seen.add(s.id);
      let o = dinos.get(s.id);
      const colour = DINO_COLOURS[s.slot % DINO_COLOURS.length];
      if (!o) {
        const d = dino(colour);
        scene.add(d);
        o = { d, tag: null, tagText: "", k: s.crashes, x: 0, y: 0, z: 0, puffAt: 0 };
        dinos.set(s.id, o);
      }
      if (s.name !== o.tagText) {
        if (o.tag) { scene.remove(o.tag); o.tag.material.map.dispose(); o.tag.material.dispose(); }
        o.tag = s.name ? nameTag(s.name, colour) : null;
        if (o.tag) scene.add(o.tag);
        o.tagText = s.name;
      }
      const x = (s.x + DINO_X) / U + 0.55, y = s.y / U, z = s.me ? 0 : -1.2 - (s.slot % 3) * 0.8;
      if (s.crashes > o.k) {
        fx.burst(x + 0.4, y + 0.8, z, { colors: [colour, 0xffffff, 0xffc53d], n: 16, speed: 3, shape: "shard" });
        if (s.me) fx.word("OOF!", x + 0.4, y + 1.9, z + 0.4, { color: "#ff8fc7", height: 0.7 });
      }
      o.k = s.crashes;
      if (s.running && y <= 0 && now - o.puffAt > 0.14) { o.puffAt = now; fx.puff(x - 0.2, z + 0.1, { color: 0xf4e2b8, size: 0.09, up: 0.4 }); }
      if (o.y > 0 && y <= 0) for (let q = 0; q < 3; q++) fx.puff(x, z, { color: 0xf4e2b8, size: 0.14 });
      o.d.position.set(x, y, z);
      o.x = x; o.y = y; o.z = z;
      poseDino(o.d, now, dt, s);
      if (o.tag) o.tag.position.set(x + 0.3, y + 1.85, z);
    }
    for (const [id, o] of dinos) if (!seen.has(id)) { scene.remove(o.d); if (o.tag) scene.remove(o.tag); dinos.delete(id); }
    fx.tick(dt);
    renderer.render(scene, camera);
  }

  return {
    resize,
    draw,
    dispose() {
      renderer.dispose();
      for (const o of dinos.values()) if (o.tag) { o.tag.material.map.dispose(); o.tag.material.dispose(); }
      for (const g of GEO.values()) g.dispose();
      GEO.clear();
    },
  };
}
