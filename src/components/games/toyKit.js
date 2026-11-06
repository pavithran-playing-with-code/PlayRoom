// src/components/games/toyKit.js
// The PlayRoom LOOK KIT for three.js games: everything drawn like a painted
// toy — cartoon (toon) shading in three soft steps, a thick ink outline round
// every shape (the theme's outlines), soft shadows, and the little life that
// makes a toy feel alive: a mover with a big head and big blinking eyes that
// squashes and stretches as it walks, dust puffs, sparkles, floating words.
// Moving Day is drawn with it; the other 3D games can be restyled with it.
import * as THREE from "three";

export const INK = 0x2e2140;

// three-step light: shadow, mid, lit — the cartoon look
let ramp = null;
function toonRamp() {
  if (ramp) return ramp;
  const data = new Uint8Array([92, 92, 92, 168, 168, 168, 236, 236, 236]);
  ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

const mats = new Map();
export function toon(color, extra = {}) {
  const key = `${color}|${JSON.stringify(extra)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...extra }));
  return mats.get(key);
}
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
export const flat = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

// A shape with its ink outline (an inverted shell, a hair bigger, drawn
// inside out). `line`: how thick, as a fraction of its size; 0 for none.
export function part(geo, color, { line = 0.07, shadow = true, receive = false, mat = null } = {}) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat || toon(color));
  m.castShadow = shadow;
  m.receiveShadow = receive;
  g.add(m);
  if (line > 0) {
    const o = new THREE.Mesh(geo, inkMat);
    o.scale.setScalar(1 + line);
    g.add(o);
    g.userData.outline = o;
  }
  g.userData.body = m;
  return g;
}
export const box = (w, h, d, color, o) => part(new THREE.BoxGeometry(w, h, d), color, o);
export const ball = (r, color, o) => part(new THREE.SphereGeometry(r, 18, 14), color, o);
export const can = (rt, rb, h, color, o) => part(new THREE.CylinderGeometry(rt, rb, h, 16), color, o);
export const cone = (r, h, color, o) => part(new THREE.ConeGeometry(r, h, 16), color, o);
export function at(obj, x, y, z, sx = 1, sy = sx, sz = sx) {
  obj.position.set(x, y, z);
  obj.scale.set(sx, sy, sz);
  return obj;
}

// ── a mover: big head, cap, big eyes, stubby arms and feet ───────────────────
// Faces +z. `skin` and `cap` colours; `look(t, state)` animates it.
export function mover(color, { skin = 0xffd9b8, seed = 1 } = {}) {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();              // squash and lean happen here
  root.add(bodyPivot);
  const body = at(ball(0.27, color), 0, 0.3, 0, 1, 1.05, 0.92);
  const belly = at(ball(0.16, 0xffffff, { line: 0, shadow: false }), 0, 0.27, 0.15, 1, 1.1, 0.5);
  const head = new THREE.Group();
  head.position.set(0, 0.68, 0.02);
  head.add(at(ball(0.26, skin), 0, 0, 0));
  // the cap and its brim
  const cap = at(ball(0.27, color), 0, 0.07, -0.01, 1, 0.72, 1);
  cap.userData.body.geometry = new THREE.SphereGeometry(0.27, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.userData.outline.geometry = cap.userData.body.geometry;
  const brim = at(can(0.2, 0.2, 0.035, color, { line: 0.12 }), 0, 0.07, 0.2, 1, 1, 0.75);
  head.add(cap, brim);
  // eyes: white, a dark pupil, a glint
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * 0.1, 0.0, 0.22);
    e.add(at(ball(0.07, 0xffffff, { line: 0.12, shadow: false }), 0, 0, 0));
    e.add(at(ball(0.042, INK, { line: 0, shadow: false }), 0, -0.005, 0.042));
    e.add(at(ball(0.014, 0xffffff, { line: 0, shadow: false }), 0.014, 0.018, 0.075));
    head.add(e);
    eyes.push(e);
  }
  for (const s of [-1, 1]) head.add(at(ball(0.04, 0xff9fb0, { line: 0, shadow: false }), s * 0.17, -0.08, 0.17, 1, 0.6, 0.4));
  const hands = [-1, 1].map((s) => { const h = at(ball(0.075, skin), s * 0.3, 0.3, 0.02); bodyPivot.add(h); return h; });
  const feet = [-1, 1].map((s) => { const f = at(ball(0.085, 0x5a4636), s * 0.12, 0.05, 0.02, 1, 0.6, 1.3); root.add(f); return f; });
  bodyPivot.add(body, belly, head);
  root.userData = { bodyPivot, head, eyes, hands, feet, seed, blinkAt: 1 + (seed % 7) * 0.37, walk: 0 };
  return root;
}

// Animate a mover: walking (0..1 of full speed), carrying (0 none, 1 small, 2 big), t in seconds.
export function animate(m, t, { walk = 0, carry = 0, lift = 0 }) {
  const u = m.userData;
  u.walk += (walk - u.walk) * 0.25;
  const w = u.walk;
  const ph = t * 13 + u.seed;
  const bob = Math.abs(Math.sin(ph)) * 0.07 * w;
  const breathe = Math.sin(t * 2.4 + u.seed) * 0.015 * (1 - w);
  u.bodyPivot.position.y = bob;
  // squash on each step, stretch between
  const sq = 1 + (Math.abs(Math.sin(ph)) - 0.5) * 0.12 * w + breathe;
  u.bodyPivot.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  u.bodyPivot.rotation.x = 0.16 * w + (carry === 2 ? 0.08 : 0);
  u.bodyPivot.rotation.z = Math.sin(ph) * 0.06 * w;
  u.feet[0].position.z = 0.02 + Math.sin(ph) * 0.12 * w;
  u.feet[1].position.z = 0.02 - Math.sin(ph) * 0.12 * w;
  u.feet[0].position.y = 0.05 + Math.max(0, Math.cos(ph)) * 0.05 * w;
  u.feet[1].position.y = 0.05 + Math.max(0, -Math.cos(ph)) * 0.05 * w;
  // arms: swing when empty, up and out front when carrying
  u.hands.forEach((h, i) => {
    const s = i ? 1 : -1;
    if (carry) { h.position.set(s * 0.24, 0.5 + lift, 0.26); }
    else { h.position.set(s * 0.3, 0.3 + Math.abs(Math.sin(ph)) * 0.02, 0.02 - Math.sin(ph) * s * 0.1 * w); }
  });
  // blink every few seconds
  const cyc = (t + u.blinkAt) % 3.6;
  const shut = cyc < 0.12 ? 0.12 : 1;
  for (const e of u.eyes) e.scale.y = shut;
  u.head.rotation.z = Math.sin(t * 1.3 + u.seed) * 0.04 * (1 - w);
}

// ── words that float up (+20, CRASH!, WOOF!) ─────────────────────────────────
const wordTex = new Map();
export function wordSprite(text, { color = "#ffc53d", size = 64 } = {}) {
  const key = `${text}|${color}|${size}`;
  let tex = wordTex.get(key);
  if (!tex) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    ctx.font = `800 ${size}px Fredoka, Nunito, sans-serif`;
    const w = Math.ceil(ctx.measureText(text).width) + size;
    c.width = w; c.height = Math.round(size * 1.6);
    ctx.font = `800 ${size}px Fredoka, Nunito, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.22; ctx.strokeStyle = "#2E2140";
    ctx.strokeText(text, w / 2, c.height / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, c.height / 2);
    tex = new THREE.CanvasTexture(c);
    tex.userData = { aspect: w / c.height };
    wordTex.set(key, tex);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  s.userData.aspect = tex.userData.aspect;
  return s;
}

// ── little effects: puffs, sparkles, shards, confetti ────────────────────────
export function effects(scene) {
  const live = [];
  const puffGeo = new THREE.SphereGeometry(1, 8, 6);
  const add = (mesh, life, step) => { scene.add(mesh); live.push({ mesh, life, age: 0, step }); };
  return {
    puff(x, z, { color = 0xffffff, size = 0.12, up = 0.6 } = {}) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
      m.position.set(x + (Math.random() - 0.5) * 0.15, 0.06, z + (Math.random() - 0.5) * 0.15);
      m.scale.setScalar(size);
      add(m, 0.55, (o, k, dt) => { o.position.y += up * dt; o.scale.setScalar(size * (1 + k * 1.6)); o.material.opacity = 0.8 * (1 - k); });
    },
    burst(x, y, z, { colors = [0xffc53d, 0xffffff, 0xff8fc7], n = 14, speed = 3, shape = "star" } = {}) {
      for (let i = 0; i < n; i++) {
        const geo = shape === "shard" ? new THREE.TetrahedronGeometry(0.07) : new THREE.OctahedronGeometry(0.06);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true }));
        m.position.set(x, y, z);
        const a = Math.random() * Math.PI * 2, v = speed * (0.5 + Math.random() * 0.6);
        const vel = new THREE.Vector3(Math.cos(a) * v * 0.5, 2 + Math.random() * speed, Math.sin(a) * v * 0.5);
        add(m, 0.9, (o, k, dt) => {
          vel.y -= 9 * dt;
          o.position.addScaledVector(vel, dt);
          if (o.position.y < 0.03) { o.position.y = 0.03; vel.multiplyScalar(0.4); vel.y = Math.abs(vel.y); }
          o.rotation.x += dt * 8; o.rotation.y += dt * 6;
          o.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3;
        });
      }
    },
    word(text, x, y, z, opts = {}) {
      const s = wordSprite(text, opts);
      const h = opts.height || 0.45;
      s.position.set(x, y, z);
      s.scale.set(h * s.userData.aspect, h, 1);
      add(s, opts.life || 1.1, (o, k, dt) => {
        o.position.y += dt * 0.9;
        const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : k < 0.25 ? 1.1 - (k - 0.15) : 1;
        o.scale.set(h * o.userData.aspect * pop, h * pop, 1);
        o.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3;
      });
    },
    tick(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const f = live[i];
        f.age += dt;
        const k = Math.min(1, f.age / f.life);
        f.step(f.mesh, k, dt);
        if (k >= 1) { scene.remove(f.mesh); if (f.mesh.material && !f.mesh.isSprite) f.mesh.material.dispose(); if (f.mesh.isSprite) f.mesh.material.dispose(); live.splice(i, 1); }
      }
    },
  };
}

// A name in a rounded pill of the player's colour, always facing you.
export function nameTag(text, colour) {
  const c = document.createElement("canvas");
  const x = c.getContext("2d");
  x.font = "800 40px Fredoka, Nunito, sans-serif";
  const w = Math.ceil(x.measureText(text).width) + 36;
  c.width = w; c.height = 64;
  x.font = "800 40px Fredoka, Nunito, sans-serif";
  x.fillStyle = "#" + colour.toString(16).padStart(6, "0");
  x.strokeStyle = "#2E2140"; x.lineWidth = 6;
  x.beginPath(); x.roundRect ? x.roundRect(3, 3, w - 6, 58, 28) : x.rect(3, 3, w - 6, 58); x.fill(); x.stroke();
  x.fillStyle = "#2E2140"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, w / 2, 34);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 9;
  s.scale.set((0.3 * w) / 64, 0.3, 1);
  return s;
}

// A soft round shadow-ish ring under someone (the "that's you" ring).
export function ring(color = 0xffffff, r = 0.42) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

// Lights for a sunny diorama: sky and ground fill, one warm sun with soft shadows over `size`.
export function sunnyLights(scene, { cx = 0, cz = 0, size = 12, indoor = false } = {}) {
  // indoors: softer, whiter light — the sunny warmth turns a room yellow
  scene.add(new THREE.HemisphereLight(0xdcefff, indoor ? 0x9a8a7a : 0x8f7458, indoor ? 0.5 : 0.55));
  const sun = new THREE.DirectionalLight(indoor ? 0xfff7ec : 0xffe9c4, indoor ? 0.72 : 0.95);
  sun.position.set(cx - 6, 14, cz + 8);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const c = sun.shadow.camera;
  c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 1; c.far = 40;
  sun.shadow.bias = -0.0008;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  return sun;
}

// ── a chef: the most detailed PlayRoom character ─────────────────────────────
// White jacket, an apron and neckerchief in the player's colour, a tall puffy
// hat with a coloured band, trousers and shoes, real arms and legs, and a face
// that shows how it's going: eyebrows and a mouth for happy, busy, worried.
// Faces +z, about 1.35 tall. Animate with `chefPose`.
const SKINS = [0xffd9b8, 0xf2c29b, 0xd9a07a, 0xb07a52, 0xffe2c8, 0x8d5a3a];
const HAIRS = [0x3b2a20, 0x6b4226, 0x1f1a17, 0xc98f3e, 0x8a3b2a, 0x2e2140];
export function chef(color, { seed = 1 } = {}) {
  const skin = SKINS[seed % SKINS.length], hair = HAIRS[(seed * 7) % HAIRS.length];
  const root = new THREE.Group();
  const hips = new THREE.Group();            // everything above the legs bobs and leans here
  hips.position.y = 0.36;
  root.add(hips);
  // legs: a pivot at the hip, trouser, shoe
  const legs = [-1, 1].map((s) => {
    const l = new THREE.Group();
    l.position.set(s * 0.11, 0.36, 0);
    l.add(at(can(0.075, 0.07, 0.26, 0x3c3550, { line: 0.1 }), 0, -0.15, 0));
    l.add(at(ball(0.085, 0x5a3a2a, { line: 0.12 }), 0, -0.3, 0.04, 1, 0.65, 1.4));
    root.add(l);
    return l;
  });
  // the body: jacket, apron, buttons, neckerchief
  hips.add(at(ball(0.3, 0xffffff), 0, 0.22, 0, 1, 1.05, 0.9));
  hips.add(at(ball(0.24, color, { line: 0.05 }), 0, 0.12, 0.13, 1.05, 1.05, 0.55));
  hips.add(at(box(0.16, 0.08, 0.04, color, { line: 0.1 }), 0, 0.02, 0.27));           // the apron's pocket
  for (const y of [0.32, 0.42]) for (const s of [-1, 1]) hips.add(at(ball(0.022, 0xd8d2cc, { line: 0, shadow: false }), s * 0.07, y, 0.25));
  hips.add(at(ball(0.11, color, { line: 0.1 }), 0, 0.5, 0.11, 1.6, 0.7, 0.9));         // the neckerchief
  // arms: a pivot at the shoulder; a white sleeve, a hand
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Group();
    a.position.set(s * 0.3, 0.46, 0.0);
    a.add(at(can(0.075, 0.065, 0.28, 0xffffff, { line: 0.1 }), 0, -0.14, 0));
    a.add(at(can(0.07, 0.07, 0.04, color, { line: 0 }), 0, -0.27, 0));              // a coloured cuff
    const hand = at(ball(0.065, skin, { line: 0.12 }), 0, -0.33, 0);
    a.add(hand);
    hips.add(a);
    a.userData.hand = hand;
    return a;
  });
  // the head
  const head = new THREE.Group();
  head.position.set(0, 0.78, 0.02);
  hips.add(head);
  head.add(at(ball(0.27, skin), 0, 0, 0));
  for (const s of [-1, 1]) head.add(at(ball(0.06, skin, { line: 0.12 }), s * 0.26, -0.01, -0.02, 0.6, 1, 1));
  for (const s of [-1, 1]) for (const k of [0, 1]) head.add(at(ball(0.07, hair, { line: 0.1 }), s * (0.2 + k * 0.04), 0.1 - k * 0.07, -0.08 - k * 0.04));
  head.add(at(ball(0.05, 0xf3a07a, { line: 0.12, shadow: false }), 0, -0.04, 0.27));   // nose
  for (const s of [-1, 1]) head.add(at(ball(0.045, 0xff9fb0, { line: 0, shadow: false }), s * 0.17, -0.08, 0.2, 1, 0.6, 0.4));
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Group();
    e.position.set(s * 0.1, 0.04, 0.22);
    e.add(at(ball(0.065, 0xffffff, { line: 0.12, shadow: false }), 0, 0, 0));
    e.add(at(ball(0.04, INK, { line: 0, shadow: false }), 0, -0.006, 0.038));
    e.add(at(ball(0.013, 0xffffff, { line: 0, shadow: false }), 0.013, 0.016, 0.068));
    head.add(e);
    return e;
  });
  const brows = [-1, 1].map((s) => {
    const b = at(box(0.1, 0.022, 0.02, hair, { line: 0, shadow: false }), s * 0.1, 0.14, 0.24);
    head.add(b);
    return b;
  });
  // a mustache for some chefs
  if (seed % 3 === 0) for (const s of [-1, 1]) head.add(at(ball(0.05, hair, { line: 0.1, shadow: false }), s * 0.045, -0.1, 0.25, 1.3, 0.55, 0.6));
  // the mouth: a smile, a worried line, or an "o"
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 14, Math.PI), new THREE.MeshBasicMaterial({ color: INK }));
  smile.position.set(0, -0.12, 0.245); smile.rotation.z = Math.PI;
  const oh = at(ball(0.03, 0x7a2a3a, { line: 0.15, shadow: false }), 0, -0.13, 0.25, 1, 1.2, 0.5);
  head.add(smile, oh);
  // the hat: a band with a coloured stripe, a tall puffy top
  const hat = new THREE.Group();
  hat.position.set(0, 0.2, -0.01);
  hat.add(at(can(0.22, 0.21, 0.16, 0xffffff, { line: 0.08 }), 0, 0.06, 0));
  hat.add(at(can(0.222, 0.222, 0.035, color, { line: 0 }), 0, 0.03, 0));
  for (const [x, y, z, r] of [[0, 0.3, 0, 0.21], [-0.13, 0.24, 0.02, 0.15], [0.13, 0.24, 0.02, 0.15], [0, 0.24, -0.12, 0.15], [0, 0.26, 0.12, 0.14]]) hat.add(at(ball(r, 0xffffff), x, y, z));
  head.add(hat);
  root.userData = { hips, legs, arms, head, eyes, brows, smile, oh, hat, seed, walk: 0, blinkAt: 0.7 + (seed % 7) * 0.41, cheer: 0 };
  return root;
}

// Pose a chef for this frame.
//   walk 0..1 · carry (holding something) · chop · cook (at a stove) ·
//   mood "happy" | "worried" | null · cheer (seconds of celebrating left)
export function chefPose(c, t, dt, { walk = 0, carry = false, chop = false, cook = false, mood = null, cheer = 0 } = {}) {
  const u = c.userData;
  u.walk += (walk - u.walk) * Math.min(1, dt * 10);
  const w = u.walk, ph = t * 11 + u.seed;
  const sw = Math.sin(ph);
  // legs and the body's bob and lean
  u.legs[0].rotation.x = sw * 0.7 * w;
  u.legs[1].rotation.x = -sw * 0.7 * w;
  const jump = cheer > 0 ? Math.max(0, Math.sin(Math.min(1, (0.6 - (cheer % 0.6)) / 0.6) * Math.PI)) * 0.3 : 0;
  u.hips.position.y = 0.36 + Math.abs(sw) * 0.05 * w + jump + Math.sin(t * 2.2 + u.seed) * 0.008;
  root(c).position.y = 0;
  u.hips.rotation.x = 0.12 * w + (chop ? 0.12 : 0);
  u.hips.rotation.z = sw * 0.05 * w + (mood === "worried" ? Math.sin(t * 30) * 0.03 : 0);
  // arms
  const [L, R] = u.arms;
  if (cheer > 0) {
    L.rotation.set(-2.7, 0, -0.35); R.rotation.set(-2.7, 0, 0.35);
  } else if (chop) {
    L.rotation.set(-1.2, 0, 0.25);
    R.rotation.set(-1.5 + Math.sin(t * 22) * 0.6, 0, -0.15);
  } else if (cook) {
    L.rotation.set(-1.1, 0, 0.2);
    R.rotation.set(-1.25 + Math.sin(t * 6) * 0.2, 0.2, -0.1);
  } else if (carry) {
    L.rotation.set(-1.35, 0, 0.32); R.rotation.set(-1.35, 0, -0.32);
  } else {
    L.rotation.set(-sw * 0.6 * w, 0, 0.08); R.rotation.set(sw * 0.6 * w, 0, -0.08);
  }
  // the face: eyebrows and mouth for the mood; a look round when idle
  const happy = mood === "happy" || cheer > 0, worried = mood === "worried";
  u.brows[0].rotation.z = worried ? -0.45 : happy ? 0.15 : 0;
  u.brows[1].rotation.z = worried ? 0.45 : happy ? -0.15 : 0;
  u.brows.forEach((b) => { b.position.y = worried ? 0.16 : happy ? 0.155 : 0.14; });
  u.smile.visible = !worried && !(chop && Math.sin(t * 3) > 0.6);
  u.smile.rotation.z = Math.PI;
  u.smile.scale.set(happy ? 1.25 : 1, happy ? 1.3 : 0.8, 1);
  u.oh.visible = worried || (chop && Math.sin(t * 3) > 0.6);
  u.head.rotation.y = w < 0.1 && !chop && !cook ? Math.sin(t * 0.7 + u.seed) * 0.35 : 0;
  u.head.rotation.x = chop || cook ? 0.25 : 0;
  // blink
  const cyc = (t + u.blinkAt) % 3.4;
  for (const e of u.eyes) e.scale.y = cyc < 0.11 ? 0.1 : happy ? 0.75 : 1;
  // the hat wobbles a little
  u.hat.rotation.z = Math.sin(ph * 0.5) * 0.06 * w + (cheer > 0 ? Math.sin(t * 20) * 0.08 : 0);
}
const root = (c) => c;
