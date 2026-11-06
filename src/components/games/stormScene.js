// src/components/games/stormScene.js
// DODGE STORM, drawn in 3D with the PlayRoom look kit: a floating stone arena
// in a night-time storm — clouds rolling below, lightning flashing far off —
// glowing crystal shards spinning in from every edge, and you: a little toy
// runner (the kit's mover) who turns and scampers where you point, sparkles
// when a shard skims past, and is knocked flat when one hits. Friends are
// there too, as ghosts with their names: each of you dodges your own storm.
//
// Only drawing: stormSim.js has the rules. Sim units are pixels in a VIEW_W ×
// VIEW_H arena with y down; here 40 px is a metre, x across, y toward you.
import * as THREE from "three";
import { VIEW_W, VIEW_H } from "./stormSim";
import { toon, part, at, mover, animate, effects, nameTag } from "./toyKit";

export const RUNNER_COLOURS = [0x4cc9f0, 0xff8fc7, 0x8fdb5c, 0xffa36c, 0x9b5de5, 0x3dd6c0, 0xffc53d, 0xff6b6b];
const U = 40;
const X = (x) => (x - VIEW_W / 2) / U;
const Z = (y) => (y - VIEW_H / 2) / U;
const AW = VIEW_W / U, AD = VIEW_H / U;
const TILT = 0.8;

const GEO = new Map();
const geo = (k, f) => { if (!GEO.has(k)) GEO.set(k, f()); return GEO.get(k); };

let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

// a shard: a spiky crystal, glowing, with a dark spot on the floor below it
function shard(r) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  spin.add(part(geo("ico", () => new THREE.IcosahedronGeometry(1, 0)), 0xff8fc7, { line: 0.12 }));
  spin.add(at(part(geo("oct", () => new THREE.OctahedronGeometry(1, 0)), 0xffd1ea, { line: 0 }), 0, 0, 0, 0.55, 1.5, 0.55));
  spin.scale.setScalar(r);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xff5fb0, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(r * 5);
  g.add(s);
  const sh = new THREE.Mesh(geo("disc", () => new THREE.CircleGeometry(1, 20)), new THREE.MeshBasicMaterial({ color: 0x120c24, transparent: true, opacity: 0.45, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.scale.setScalar(r * 0.9);
  sh.position.y = -0.48;
  g.add(sh);
  g.userData = { spin, ph: Math.random() * 6 };
  return g;
}

// a friend's runner, see-through
function ghostly(obj) {
  obj.traverse((o) => {
    if (!o.material) return;
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.opacity = 0.42;
    o.material.depthWrite = false;
    o.castShadow = false;
  });
  return obj;
}

function arena(scene) {
  const g = new THREE.Group();
  // the stone slab, its tiles and a glowing rim
  g.add(at(part(new THREE.BoxGeometry(AW + 0.6, 1.2, AD + 0.6), 0x3a2f5c, { line: 0.012, receive: true }), 0, -0.6, 0));
  const tiles = new THREE.Group();
  for (let i = 0; i < 8; i++) for (let j = 0; j < 11; j++) {
    const m = new THREE.Mesh(geo("tile", () => new THREE.BoxGeometry(0.96, 0.06, 0.96)), toon((i + j) % 2 ? 0x4b3f78 : 0x55488a));
    m.position.set(-AW / 2 + 0.5 + i, 0.0, -AD / 2 + 0.5 + j);
    m.receiveShadow = true;
    tiles.add(m);
  }
  g.add(tiles);
  const rimM = new THREE.MeshBasicMaterial({ color: 0x4cc9f0 });
  for (const [w, d, x, z] of [[AW + 0.6, 0.08, 0, -AD / 2 - 0.3], [AW + 0.6, 0.08, 0, AD / 2 + 0.3], [0.08, AD + 0.6, -AW / 2 - 0.3, 0], [0.08, AD + 0.6, AW / 2 + 0.3, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), rimM);
    m.position.set(x, 0.04, z);
    g.add(m);
  }
  // rocks hanging under the slab
  for (let k = 0; k < 7; k++) {
    const r = 0.8 + (k % 3) * 0.4;
    const m = part(geo("rock", () => new THREE.DodecahedronGeometry(1, 0)), 0x2e2549, { line: 0.03 });
    at(m, (k - 3) * 1.1, -1.6 - r * 1.1 - (k % 2) * 0.5, ((k * 37) % 9) - 4.5, r, r * 1.1, r);
    g.add(m);
  }
  // storm clouds rolling far below and round about
  const clouds = new THREE.Group();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, d = 9 + (k % 4) * 2.2;
    const m = new THREE.Mesh(geo("cloud", () => new THREE.SphereGeometry(1, 14, 10)), toon(k % 3 ? 0x2a2348 : 0x342b58));
    at(m, Math.cos(a) * d, -5 - (k % 3) * 1.5, Math.sin(a) * d, 3 + (k % 3), 1.4, 2.6);
    clouds.add(m);
  }
  g.add(clouds);
  // stars over the storm
  const pts = [];
  for (let k = 0; k < 260; k++) {
    const a = (k * 2.399) % (Math.PI * 2), e = 0.15 + ((k * 0.618) % 1) * 1.2, d = 40;
    pts.push(Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d - 4, Math.sin(a) * Math.cos(e) * d - 10);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xe8e0ff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
  scene.add(g);
  return { clouds, rimM };
}

export function createStormScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const SKY = new THREE.Color(0x150f2a);
  scene.background = SKY.clone();
  scene.fog = new THREE.Fog(0x150f2a, 18, 34);
  const camera = new THREE.PerspectiveCamera(36, VIEW_W / VIEW_H, 0.1, 80);
  const hemi = new THREE.HemisphereLight(0xb9a8ff, 0x1a1030, 0.75);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xe8e0ff, 0.75);
  moon.position.set(-4, 12, 5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -7, right: 7, top: 8, bottom: -8, near: 1, far: 30 });
  moon.shadow.bias = -0.0008;
  scene.add(moon, moon.target);
  const flashL = new THREE.PointLight(0xcfc4ff, 0, 60);
  flashL.position.set(6, 6, -12);
  scene.add(flashL);
  const { clouds, rimM } = arena(scene);
  const fx = effects(scene);
  const shards = new Map();          // id -> mesh
  const runners = new Map();         // id -> { m, tag, tagText, x, z, face, hit, run, g }
  const base = new THREE.Vector3();
  let shake = 0, bolt = 3, boltT = 0;

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // the whole arena fits, seen from above and in front
    const v = new THREE.Vector3();
    const pts = [[-AW / 2 - 0.3, -AD / 2 - 0.3], [AW / 2 + 0.3, -AD / 2 - 0.3], [-AW / 2 - 0.3, AD / 2 + 0.3], [AW / 2 + 0.3, AD / 2 + 0.3]];
    let cz = 0.4, d = 20;
    const place = () => { camera.position.set(0, Math.sin(TILT) * d, cz + Math.cos(TILT) * d); camera.lookAt(0, 0, cz); camera.updateMatrixWorld(); camera.updateProjectionMatrix(); };
    for (let pass = 0; pass < 3; pass++) {
      let lo = 4, hi = 60;
      for (let i = 0; i < 26; i++) {
        d = (lo + hi) / 2; place();
        const ok = pts.every(([x, z]) => { v.set(x, 0, z).project(camera); return Math.abs(v.x) <= 0.98 && Math.abs(v.y) <= 0.98; });
        if (ok) hi = d; else lo = d;
      }
      d = hi; place();
      const ys = pts.map(([x, z]) => v.set(x, 0, z).project(camera).y);
      cz -= ((Math.max(...ys) + Math.min(...ys)) / 2) * 2;
    }
    place();
    base.copy(camera.position);
  }

  // where a finger on the screen lands on the arena, in sim units
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3(), ndc = new THREE.Vector2();
  function toSim(u, v) {
    ndc.set(u * 2 - 1, -(v * 2 - 1));
    camera.position.copy(base);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hitP)) return null;
    return { x: hitP.x * U + VIEW_W / 2, y: hitP.z * U + VIEW_H / 2 };
  }

  // st: { shards: [{ id, x, y, r }], runners: [{ id, me, slot, name, x, y, hit, run, grazes }] }
  function draw(st, dt0, now) {
    const dt = Math.max(0, Math.min(0.1, dt0 || 0));
    // the storm: lightning far off now and then, the clouds turning
    bolt -= dt;
    if (bolt <= 0) { bolt = 3 + Math.random() * 5; boltT = 0.35; flashL.position.set((Math.random() - 0.5) * 30, 4 + Math.random() * 6, -14 - Math.random() * 6); }
    boltT = Math.max(0, boltT - dt);
    const fl = boltT > 0 ? (Math.sin(boltT * 60) > 0 ? 1 : 0.3) * (boltT / 0.35) : 0;
    flashL.intensity = fl * 3;
    scene.background.copy(SKY).lerp(new THREE.Color(0x4a3f80), fl * 0.6);
    clouds.rotation.y = now * 0.02;
    rimM.color.setHSL(0.53 + Math.sin(now * 0.8) * 0.04, 0.85, 0.6);
    // shards
    const seen = new Set();
    for (const p of st.shards) {
      seen.add(p.id);
      let m = shards.get(p.id);
      if (!m) { m = shard(p.r / U); scene.add(m); shards.set(p.id, m); }
      m.position.set(X(p.x), 0.5, Z(p.y));
      const u = m.userData;
      u.spin.rotation.set(now * 3 + u.ph, now * 2.2 + u.ph, 0);
    }
    for (const [id, m] of shards) if (!seen.has(id)) { scene.remove(m); m.children.forEach((c) => { if (c.isSprite || c.material?.opacity < 1) c.material.dispose(); }); shards.delete(id); }
    // runners
    const here = new Set();
    for (const r of st.runners) {
      here.add(r.id);
      let o = runners.get(r.id);
      const colour = RUNNER_COLOURS[r.slot % RUNNER_COLOURS.length];
      if (!o) {
        const m = mover(colour, { seed: r.slot * 3 + 1 });
        m.scale.setScalar(0.95);
        if (!r.me) ghostly(m);
        scene.add(m);
        o = { m, tag: null, tagText: "", x: X(r.x), z: Z(r.y), face: 0, hit: r.hit, run: r.run, grazes: r.grazes, fall: 0 };
        runners.set(r.id, o);
      }
      if (r.name !== o.tagText) {
        if (o.tag) { scene.remove(o.tag); o.tag.material.map.dispose(); o.tag.material.dispose(); }
        o.tag = r.name ? nameTag(r.name, colour) : null;
        if (o.tag) { o.tag.scale.multiplyScalar(0.85); scene.add(o.tag); }
        o.tagText = r.name;
      }
      const x = X(r.x), z = Z(r.y);
      const vx = (x - o.x) / Math.max(dt, 1e-3), vz = (z - o.z) / Math.max(dt, 1e-3), sp = Math.hypot(vx, vz);
      if (sp > 0.3 && !r.hit) {
        const want = Math.atan2(vx, vz);
        let d = want - o.face;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        o.face += d * Math.min(1, dt * 14);
      }
      if (r.hit && !o.hit) {
        fx.burst(x, 0.5, z, { colors: [0xff6b6b, 0xff8fc7, 0xffffff], n: 22, speed: 3.5, shape: "shard" });
        if (r.me) { fx.word("OUCH!", x, 1.2, z, { color: "#ff8fc7", height: 0.6 }); shake = 1; }
      }
      if (r.run !== o.run) { o.m.userData.pop = 0; for (let i = 0; i < 4; i++) fx.puff(x, z, { color: 0xd9ccff, size: 0.16 }); }
      if (r.grazes > o.grazes && !r.hit) { fx.burst(x, 0.5, z, { colors: [0xb5e655, 0xffffff, 0x8fdb5c], n: 7, speed: 1.6 }); if (r.me) fx.word("close!", x, 1.15, z, { color: "#b5e655", height: 0.38, life: 0.7 }); }
      o.hit = r.hit; o.run = r.run; o.grazes = r.grazes;
      o.x = x; o.z = z;
      // knocked flat when hit; up again (with a pop) in the fresh storm
      o.fall += ((r.hit ? 1 : 0) - o.fall) * Math.min(1, dt * 10);
      const u = o.m.userData;
      u.pop = Math.min(1, (u.pop ?? 1) + dt * 3);
      const pop = u.pop < 1 ? Math.sin(u.pop * Math.PI * 0.5) * (1 + Math.sin(u.pop * Math.PI) * 0.25) : 1;
      o.m.position.set(x, 0.03, z);
      o.m.rotation.set(-o.fall * Math.PI / 2, o.face, 0, "YXZ");
      o.m.scale.setScalar(0.95 * pop);
      animate(o.m, now, { walk: r.hit ? 0 : Math.min(1, sp / 4) });
      if (r.hit) for (const e of u.eyes) e.scale.y = 0.2;
      if (o.tag) o.tag.position.set(x, 1.3, z);
    }
    for (const [id, o] of runners) if (!here.has(id)) { scene.remove(o.m); if (o.tag) scene.remove(o.tag); runners.delete(id); }
    camera.position.copy(base);
    if (shake > 0) { shake = Math.max(0, shake - dt * 2.5); camera.position.x += (Math.random() - 0.5) * shake * 0.25; camera.position.y += (Math.random() - 0.5) * shake * 0.25; }
    fx.tick(dt);
    renderer.render(scene, camera);
  }

  return {
    resize,
    draw,
    toSim,
    dispose() {
      renderer.dispose();
      for (const o of runners.values()) if (o.tag) { o.tag.material.map.dispose(); o.tag.material.dispose(); }
      for (const g of GEO.values()) g.dispose();
      GEO.clear();
    },
  };
}
