// src/components/games/tapScene.js
// TAP RUSH, drawn as a toy garden in 3D with the look kit: nine burrows in a
// patch of grass, fences and flowers round it, and the critters that pop up —
// a round little mole with big eyes and a pink nose (bop it), a golden one
// (bop it for a bonus), and a grumpy bomb with a fizzing fuse (leave it!).
// A bop squashes the critter flat under stars; a bomb goes off in a puff.
//
// Only drawing: TapRush.jsx has the rules. `pick(u, v)` says which burrow a
// tap on the canvas landed on.
import * as THREE from "three";
import { part, at, effects, sunnyLights, INK } from "./toyKit";

const GEO = new Map();
const geo = (k, f) => { if (!GEO.has(k)) GEO.set(k, f()); return GEO.get(k); };
const sph = (r) => geo(`s${r}`, () => new THREE.SphereGeometry(r, 18, 14));
const S = (r, c, o) => part(sph(r), c, o);
const SP = 1.7;                                  // burrow spacing
export const HOLES = Array.from({ length: 9 }, (_, i) => ({ x: ((i % 3) - 1) * SP, z: (Math.floor(i / 3) - 1) * SP }));

function eye(r) {
  const e = new THREE.Group();
  e.add(S(r, 0xffffff, { line: 0.14, shadow: false }));
  e.add(at(S(r * 0.6, INK, { line: 0, shadow: false }), 0, -r * 0.05, r * 0.55));
  e.add(at(S(r * 0.22, 0xffffff, { line: 0, shadow: false }), r * 0.2, r * 0.25, r * 1.02));
  return e;
}

// a mole, facing +z (the camera); `gold` for the bonus one
function mole(gold) {
  const g = new THREE.Group();
  const fur = gold ? 0xffc53d : 0x9a6a4a, belly = gold ? 0xfff1b0 : 0xd9b08c;
  g.add(at(S(0.5, fur), 0, 0.45, 0, 1, 1.15, 0.95));
  g.add(at(S(0.32, belly, { line: 0, shadow: false }), 0, 0.32, 0.26, 1, 1.1, 0.6));
  const eyes = [-1, 1].map((s) => { const e = at(eye(0.12), s * 0.17, 0.72, 0.36); g.add(e); return e; });
  g.add(at(S(0.1, 0xff8fc7, { line: 0.14 }), 0, 0.56, 0.47));                    // the nose
  for (const s of [-1, 1]) g.add(at(S(0.07, 0xff9fb0, { line: 0, shadow: false }), s * 0.3, 0.55, 0.36, 1, 0.6, 0.5));
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) { const w = at(part(geo("whisk", () => new THREE.CylinderGeometry(0.008, 0.008, 0.28, 4)), INK, { line: 0 }), s * 0.2, 0.55 + k * 0.04, 0.44); w.rotation.z = Math.PI / 2 + k * 0.2 * s; g.add(w); }
  for (const s of [-1, 1]) g.add(at(S(0.13, belly, { line: 0.1 }), s * 0.34, 0.3, 0.38, 1.2, 0.7, 0.8));   // paws on the rim
  if (gold) { const c = at(part(geo("crown", () => new THREE.CylinderGeometry(0.2, 0.24, 0.16, 5)), 0xffd447, { line: 0.12 }), 0, 1.05, 0); g.add(c); }
  g.userData.eyes = eyes;
  return g;
}

// the bomb critter: black, a grumpy face, a fizzing fuse
function bomb() {
  const g = new THREE.Group();
  g.add(at(S(0.5, 0x2e2a36), 0, 0.5, 0));
  g.add(at(S(0.12, 0x6a6475, { line: 0, shadow: false }), -0.2, 0.75, 0.33, 1, 0.7, 0.5));      // a shine
  g.add(at(part(geo("cap", () => new THREE.CylinderGeometry(0.13, 0.15, 0.14, 12)), 0x6a6475, { line: 0.12 }), 0, 1.02, 0));
  const fuse = at(part(geo("fuse", () => new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6)), 0xc9a36b, { line: 0.15 }), 0.08, 1.2, 0);
  fuse.rotation.z = -0.4; g.add(fuse);
  const spark = new THREE.Mesh(geo("spark", () => new THREE.OctahedronGeometry(0.09)), new THREE.MeshBasicMaterial({ color: 0xffd447 }));
  spark.position.set(0.15, 1.36, 0); g.add(spark);
  const eyes = [-1, 1].map((s) => { const e = at(eye(0.1), s * 0.17, 0.58, 0.42); g.add(e); return e; });
  for (const s of [-1, 1]) { const b = at(part(geo("brow", () => new THREE.BoxGeometry(0.2, 0.04, 0.04)), 0xff6b6b, { line: 0 }), s * 0.17, 0.74, 0.46); b.rotation.z = s * 0.45; g.add(b); }
  const frown = new THREE.Mesh(geo("frown", () => new THREE.TorusGeometry(0.1, 0.02, 6, 12, Math.PI)), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  frown.position.set(0, 0.36, 0.47); g.add(frown);
  g.userData = { eyes, spark };
  return g;
}

function garden(scene) {
  const g = new THREE.Group();
  g.add(at(part(new THREE.CylinderGeometry(3.9, 4.1, 0.6, 40), 0x8fd35a, { line: 0.01, receive: true }), 0, -0.3, 0));
  g.add(at(part(new THREE.CylinderGeometry(4.12, 4.3, 0.9, 40), 0xc98f55, { line: 0.01 }), 0, -0.95, 0));
  // the burrows: a ring of earth with a dark hole
  for (const h of HOLES) {
    const mound = at(part(geo("mound", () => new THREE.TorusGeometry(0.56, 0.16, 10, 24)), 0xa0703f, { line: 0.08 }), h.x, 0.02, h.z);
    mound.rotation.x = -Math.PI / 2;
    g.add(mound);
    const hole = new THREE.Mesh(geo("hole", () => new THREE.CircleGeometry(0.52, 24)), new THREE.MeshBasicMaterial({ color: 0x2a1a12 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(h.x, 0.03, h.z);
    g.add(hole);
  }
  // flowers and a little fence at the back
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, r = 3.4 + (k % 2) * 0.3;
    g.add(at(S(0.09, [0xffffff, 0xffd447, 0xff8fc7, 0xb9a6ff][k % 4], { line: 0.2, shadow: false }), Math.cos(a) * r, 0.08, Math.sin(a) * r));
  }
  for (let k = -3; k <= 3; k++) {
    g.add(at(part(geo("post", () => new THREE.BoxGeometry(0.14, 0.7, 0.14)), 0xfff6e6, { line: 0.12 }), k * 0.9, 0.35, -3.5));
  }
  for (const y of [0.22, 0.5]) g.add(at(part(geo("rail", () => new THREE.BoxGeometry(5.6, 0.08, 0.06)), 0xfff6e6, { line: 0.1 }), 0, y, -3.5));
  scene.add(g);
}

export function createTapScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe6ff);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
  sunnyLights(scene, { size: 6 });
  const fx = effects(scene);
  garden(scene);
  // one critter of each kind per burrow, hidden below the ground until it pops
  const pop = HOLES.map((h) => {
    const kinds = { mole: mole(false), gold: mole(true), bomb: bomb() };
    for (const k of Object.values(kinds)) { k.position.set(h.x, -1.4, h.z); k.visible = false; scene.add(k); }
    return { kinds, up: 0, want: 0, kind: null, bonk: 0 };
  });
  const v = new THREE.Vector3();

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const d = 10.8 / Math.min(1, camera.aspect * 1.05);
    camera.position.set(0, d * 0.72, d * 0.74);
    camera.lookAt(0, 0.2, 0.1);
    camera.updateProjectionMatrix();
  }

  // which burrow a tap at (u, v) — 0..1 across and down the canvas — is on
  function pick(u, w) {
    let best = -1, bd = 0.16;
    HOLES.forEach((h, i) => {
      v.set(h.x, 0.5, h.z).project(camera);
      const d = Math.hypot((v.x + 1) / 2 - u, (1 - v.y) / 2 - w);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  // st: { active: { pos, kind } | null } — the critter that's up now
  function draw(st, dt0, now) {
    const dt = Math.max(0, Math.min(0.1, dt0 || 0));
    pop.forEach((p, i) => {
      const up = st.active && st.active.pos === i ? st.active.kind : null;
      if (up && up !== p.kind && p.bonk <= 0) { p.kind = up; p.up = 0; }
      p.want = up && p.bonk <= 0 ? 1 : 0;
      p.up += (p.want - p.up) * Math.min(1, dt * (p.want ? 16 : 10));
      p.bonk = Math.max(0, p.bonk - dt);
      for (const [k, obj] of Object.entries(p.kinds)) {
        const on = k === p.kind && (p.up > 0.02 || p.bonk > 0);
        obj.visible = on;
        if (!on) continue;
        const sq = p.bonk > 0 ? 0.35 + (1 - p.bonk / 0.35) * 0.1 : 1;
        obj.position.y = -1.25 + p.up * 1.25 - (p.bonk > 0 ? 0.25 : 0);
        obj.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        obj.rotation.z = Math.sin(now * 6 + i) * 0.05 * p.up;
        const blink = (now + i * 0.7) % 2.6 < 0.1;
        for (const e of obj.userData.eyes) e.scale.y = p.bonk > 0 ? 0.15 : blink ? 0.15 : 1;
        if (obj.userData.spark) obj.userData.spark.scale.setScalar(0.7 + Math.abs(Math.sin(now * 25)) * 0.6);
      }
    });
    fx.tick(dt);
    renderer.render(scene, camera);
  }

  // a tap's result, shown at burrow i: "hit" | "gold" | "bomb"
  function hit(i, kind, pts) {
    const h = HOLES[i], p = pop[i];
    if (kind === "bomb") {
      fx.burst(h.x, 0.6, h.z, { colors: [0xff6b6b, 0xffd447, 0x2e2a36], n: 22, speed: 3.6, shape: "shard" });
      for (let k = 0; k < 4; k++) fx.puff(h.x, h.z, { color: 0x6a6475, size: 0.3, up: 1 });
      fx.word("BOOM!", h.x, 1.6, h.z + 0.4, { color: "#ff6b6b", height: 0.7 });
      p.up = 0; p.bonk = 0; p.kind = null;
      return;
    }
    p.bonk = 0.35;
    fx.burst(h.x, 0.9, h.z, { colors: kind === "gold" ? [0xffd447, 0xffffff, 0xffc53d] : [0xffd447, 0xffffff, 0xff8fc7], n: kind === "gold" ? 18 : 9, speed: 2.2 });
    fx.word(`+${pts}`, h.x, 1.5, h.z + 0.4, { color: kind === "gold" ? "#ffd447" : "#8fdb5c", height: 0.55, life: 0.8 });
  }

  return {
    resize,
    draw,
    pick,
    hit,
    dispose() {
      renderer.dispose();
      for (const g of GEO.values()) g.dispose();
      GEO.clear();
    },
  };
}
