// src/components/games/sunshardScene.js
// Sunshard Jump: the 3D scene (three.js r128). It draws the level that
// sunshardWorld.js made and the run that sunshardSim.js keeps — it decides
// nothing. Low-poly and flat-shaded: Phong with flatShading and no specular,
// 10-sided cylinders and cones, soft shadows from one sun that follows you.
//
// createScene(THREE, W, opts) -> { canvas, resize, frame, fx, dispose }
//   frame({ S, team, remotes, ropes, yaw, pitch, dt, T })  draw one frame
//     ropes: [{ a, b, on, len, ca, cb }] — together, tail to tail ("me" or an
//     id at each end); tied, it sags with slack and goes straight when taut;
//     snapped, a short tail dangles from each of you
//   fx.burst / fx.ring                               effects, from the events
//   createIsle(WI, off)                              the second stage, Sunhaven
//                                                    Isle, built when it's needed
import { ZONES, PAL0, TAU, clamp, lerp, LOOKS, windAt, blinkLeft } from "./sunshardWorld.js";
import { zoneAt, EMBER, LAKE, MAP_SIZE } from "./sunhavenWorld.js";

const BEAM_H = 140;
// Each zone has its own sky, as Rail Runner's stretches do: reach the next
// zone and the whole look eases over to it (the hub shares the first's).
//   top / bot: the sky's top and horizon (the fog takes the horizon);
//   hemi / sun: light strengths; sunC: the sun's colour; stars: 0..1
const THEMES = [
  { top: 0x3d9bff, bot: 0xbfe8ff, hemi: 0.8, sun: 0.95, sunC: 0xfff1d6, stars: 0, near: 45, far: 190 },   // Meadow Hop: a clear morning
  { top: 0xf0884a, bot: 0xffd9a0, hemi: 0.75, sun: 0.9, sunC: 0xffc27a, stars: 0, near: 40, far: 180 },   // Sandy Steps: a hot sunset
  { top: 0x7fb6e8, bot: 0xeef8ff, hemi: 0.9, sun: 0.7, sunC: 0xe8f4ff, stars: 0, near: 30, far: 150 },    // Frost Ridge: a pale, misty cold
  { top: 0x3a1430, bot: 0xd2553a, hemi: 0.55, sun: 0.75, sunC: 0xff8a5a, stars: 0.25, near: 35, far: 170 }, // Ember Cliffs: a red dusk
  { top: 0x0e1240, bot: 0x5a4a9a, hemi: 0.5, sun: 0.55, sunC: 0xffd89a, stars: 1, near: 50, far: 220 },  // Sky Temple: night, and stars
  // Sunhaven Isle's zones (stage two, ISLE_SKY + zone): the village, the cliffs, the lake, the ember ruins, the hollow, the tower
  { top: 0x3d9bff, bot: 0xbfe8ff, hemi: 0.85, sun: 1.0, sunC: 0xfff1d6, stars: 0, near: 70, far: 300 },
  { top: 0x5aa8ff, bot: 0xe6f2ff, hemi: 0.9, sun: 0.95, sunC: 0xffffff, stars: 0, near: 70, far: 300 },
  { top: 0x3fb8d8, bot: 0xc4f0f4, hemi: 0.9, sun: 0.85, sunC: 0xdffaff, stars: 0, near: 60, far: 260 },
  { top: 0xf0884a, bot: 0xffd9a0, hemi: 0.75, sun: 0.9, sunC: 0xffb070, stars: 0, near: 55, far: 240 },
  { top: 0x3f9e6e, bot: 0xc6ecc8, hemi: 0.8, sun: 0.8, sunC: 0xeaffd0, stars: 0, near: 55, far: 240 },
  { top: 0x2a1a5a, bot: 0x9a88c8, hemi: 0.6, sun: 0.7, sunC: 0xc9b4ff, stars: 0.6, near: 55, far: 250 },
];
const ISLE_SKY = 5;
// an island's look (LOOKS) laid over the sky zones and the ground colours
const mixHex = (a, b, k) => {
  const m = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
};
function lookThemes(L) {
  if (!L || L.sky === undefined) return THEMES;
  return THEMES.map((t, i) => (i >= ISLE_SKY ? t : {
    ...t, top: mixHex(t.top, L.sky, L.skyK), bot: mixHex(t.bot, L.sky, L.skyK * 0.75),
    hemi: t.hemi * L.light, sun: t.sun * L.light, stars: Math.max(t.stars, L.stars),
  }));
}
export const MATE = [0x37c8e6, 0xa678ff, 0x62d36c, 0xff8fc7, 0xffd24a, 0xf4efe6, 0xff9f43];

export function createScene(THREE, W, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(opts.maxDpr || 1.75, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcdeeff, 45, 190);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 700);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  // ── lights and sky ─────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xdff0ff, 0x7a6a58, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.95);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const skyU = { top: { value: new THREE.Color(0x4aa8ff) }, bot: { value: new THREE.Color(0xcdeeff) } };
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(500, 16, 12)), keep(new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: "varying float h;void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "uniform vec3 top;uniform vec3 bot;varying float h;void main(){gl_FragColor=vec4(mix(bot,top,smoothstep(-.05,.65,h)),1.);}",
  })));
  sky.renderOrder = -10;
  scene.add(sky);
  const starG = keep(new THREE.BufferGeometry()), sp = [];
  for (let i = 0; i < 320; i++) { const a = Math.random() * TAU, y = 0.08 + Math.random() * 0.92, r = Math.sqrt(1 - y * y); sp.push(Math.cos(a) * r * 450, y * 450, Math.sin(a) * r * 450); }
  starG.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starG, keep(new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false })));
  scene.add(stars);
  const _c1 = new THREE.Color(), _c2 = new THREE.Color();
  const LOOK = LOOKS[W.look || 0], SKIES = lookThemes(LOOK);
  let skyAt = null;
  function setSky(zone, dt) {
    const th = SKIES[clamp(zone, 0, SKIES.length - 1)];
    const k = skyAt === null ? 1 : 1 - Math.exp(-dt * 1.6);        // about two seconds to turn over
    skyAt = zone;
    skyU.top.value.lerp(_c1.setHex(th.top), k);
    skyU.bot.value.lerp(_c2.setHex(th.bot), k);
    scene.fog.color.copy(skyU.bot.value);
    scene.fog.near += (th.near - scene.fog.near) * k; scene.fog.far += (th.far - scene.fog.far) * k;
    stars.material.opacity += (th.stars - stars.material.opacity) * k;
    hemi.intensity += (th.hemi - hemi.intensity) * k; sun.intensity += (th.sun - sun.intensity) * k;
    sun.color.lerp(_c1.setHex(th.sunC), k);
  }

  // ── materials ──────────────────────────────────────────────────────────────
  const mats = {};
  // while the level is built, its colours take the island's look (tint); the explorers keep theirs
  let tint = LOOK.ground !== undefined;
  const M = (c0, o) => { const c = tint ? mixHex(c0, LOOK.ground, LOOK.groundK) : c0; const k = c + (o ? JSON.stringify(o) : ""); return mats[k] || (mats[k] = keep(new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 0, specular: 0x000000, ...(o || {}) }))); };
  const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const BM = (c, o) => keep(new THREE.MeshBasicMaterial({ color: c, ...(o || {}) }));
  const geos = {};
  const G = (k, make) => geos[k] || (geos[k] = keep(make()));

  // ── particles (pooled) and rings ───────────────────────────────────────────
  const PN = 500, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pBase = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN);
  let pHead = 0;
  const pGeo = keep(new THREE.BufferGeometry());
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const pts = new THREE.Points(pGeo, keep(new THREE.PointsMaterial({ size: 0.34, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  pts.frustumCulled = false;
  scene.add(pts);
  for (let i = 0; i < PN; i++) pPos[i * 3 + 1] = -999;
  const emit = (x, y, z, vx, vy, vz, life, hex) => {
    const i = pHead; pHead = (pHead + 1) % PN;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z; pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    pLife[i] = pMax[i] = life;
    pBase[i * 3] = ((hex >> 16) & 255) / 255; pBase[i * 3 + 1] = ((hex >> 8) & 255) / 255; pBase[i * 3 + 2] = (hex & 255) / 255;
  };
  const burst = (x, y, z, n, hex, spd, up) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = spd * (0.3 + Math.random() * 0.7); emit(x, y, z, Math.cos(a) * s, (up || 0) + Math.random() * spd * 0.6, Math.sin(a) * s, 0.5 + Math.random() * 0.4, hex); } };
  function updParticles(dt) {
    for (let i = 0; i < PN; i++) {
      if (pLife[i] <= 0) { pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; continue; }
      pLife[i] -= dt; pVel[i * 3 + 1] -= 7 * dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      const f = Math.max(0, pLife[i] / pMax[i]);
      pCol[i * 3] = pBase[i * 3] * f; pCol[i * 3 + 1] = pBase[i * 3 + 1] * f; pCol[i * 3 + 2] = pBase[i * 3 + 2] * f;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(G("ring", () => new THREE.RingGeometry(0.3, 0.46, 24)), BM(0xffffff, { side: THREE.DoubleSide, opacity: 0, ...ADD }));
    m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); rings.push({ m, t: 0, d: 0.45, big: 3.5 });
  }
  const ring = (x, y, z, hex, big) => { const r = rings.find((q) => !q.m.visible) || rings[0]; r.m.visible = true; r.t = 0; r.big = big || 3.5; r.m.position.set(x, y + 0.05, z); r.m.material.color.setHex(hex); };
  function updRings(dt) { for (const r of rings) { if (!r.m.visible) continue; r.t += dt; const k = r.t / r.d; if (k >= 1) { r.m.visible = false; continue; } r.m.scale.setScalar(1 + k * r.big); r.m.material.opacity = 0.8 * (1 - k); } }

  // ── the level ──────────────────────────────────────────────────────────────
  const world = new THREE.Group();
  scene.add(world);
  const platMesh = W.plats.map((p) => {
    if (p.kind === "pillar") return null;
    const pal = p.zone < 0 ? PAL0 : ZONES[p.zone].pal;
    let topC = pal.top;
    if (p.kind === "crumble") topC = pal.crum;
    if (p.kind === "mover") topC = 0x5e8fd8;
    if (p.kind === "lift") topC = 0xb9b4c4;
    if (p.kind === "blink") topC = 0xb48cff;
    const g = new THREE.Group();
    const top = new THREE.Mesh(keep(new THREE.CylinderGeometry(p.r * 0.97, p.r, 0.5, 10)), M(topC));
    top.position.y = -0.25; top.castShadow = true; top.receiveShadow = true;
    const depth = p.r * 1.35 + 1.2;
    const base = new THREE.Mesh(keep(new THREE.ConeGeometry(p.r, depth, 10)), M(pal.side));
    base.rotation.x = Math.PI; base.position.y = -0.5 - depth / 2; base.receiveShadow = true;
    g.add(top, base);
    if (p.kind === "mover") { const t = new THREE.Mesh(keep(new THREE.TorusGeometry(p.r * 0.86, 0.08, 6, 20)), BM(0x7ff0ff)); t.rotation.x = Math.PI / 2; t.position.y = 0.03; g.add(t); }
    if (p.kind === "crumble") for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(keep(new THREE.BoxGeometry(0.1, 0.04, p.r * 0.9)), M(0x5a3a22)); c.position.set(0, 0.02, 0); c.rotation.y = i * 0.8 + p.rot * 0.3; g.add(c); }
    if (p.kind === "blink") { const t = new THREE.Mesh(keep(new THREE.TorusGeometry(p.r * 0.8, 0.07, 6, 20)), BM(0xe2d0ff)); t.rotation.x = Math.PI / 2; t.position.y = 0.03; g.add(t); }
    if (p.kind === "lift") { const r2 = new THREE.Mesh(G("liftRing", () => new THREE.TorusGeometry(1.5, 0.12, 6, 16)), M(0x8a86a0)); r2.rotation.x = Math.PI / 2; r2.position.y = 0.05; g.add(r2); }
    g.position.set(p.x, p.y, p.z); g.rotation.y = p.rot;
    world.add(g);
    return g;
  });
  // trees and the like, per zone
  for (const t of W.trees) {
    const g = new THREE.Group(), v = t.v, zi = t.zi;
    if (zi <= 0) {
      const tr = new THREE.Mesh(G("trunk", () => new THREE.CylinderGeometry(0.14, 0.2, 1.1, 6)), M(0x7a4e2c)); tr.position.y = 0.55; g.add(tr);
      if (v[0] < 0.5) { const a = new THREE.Mesh(G("blob", () => new THREE.IcosahedronGeometry(0.95, 0)), M(v[1] < 0.5 ? 0x4fbf55 : 0x63cf5a)); a.position.y = 1.7; a.castShadow = true; g.add(a); }
      else for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(G("pine" + i, () => new THREE.ConeGeometry(0.95 - i * 0.22, 1.1, 7)), M(0x3fae52)); c.position.y = 1.1 + i * 0.7; c.castShadow = true; g.add(c); }
    } else if (zi === 1) {
      const b = new THREE.Mesh(G("cactus", () => new THREE.CylinderGeometry(0.22, 0.26, 1.7, 7)), M(0x4fa860)); b.position.y = 0.85; b.castShadow = true; g.add(b);
      for (const sd of [-1, 1]) {
        const a = new THREE.Mesh(G("carm", () => new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6)), M(0x4fa860)); a.position.set(sd * 0.4, 1.0, 0); a.rotation.z = sd * 0.4; g.add(a);
        const u = new THREE.Mesh(G("cup", () => new THREE.CylinderGeometry(0.12, 0.12, 0.5, 6)), M(0x4fa860)); u.position.set(sd * 0.55, 1.45, 0); g.add(u);
      }
    } else if (zi === 2) {
      for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(G("ice" + i, () => new THREE.ConeGeometry(0.85 - i * 0.22, 1.2, 7)), M(i % 2 ? 0xeaf6ff : 0x9ad0e8)); c.position.y = 0.7 + i * 0.75; c.castShadow = true; g.add(c); }
    } else if (zi === 3) {
      for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(G("cry", () => new THREE.OctahedronGeometry(0.45, 0)), M(0xff8a3a, { emissive: 0xc03a10 })); c.scale.set(0.7 + v[i] * 0.6, 2.2 * (0.7 + v[i] * 0.6), 0.7 + v[i] * 0.6); c.position.set((v[i + 1] - 0.5) * 0.8, 0.5, (v[i + 2] - 0.5) * 0.8); c.rotation.z = (v[i + 3] - 0.5) * 0.5; g.add(c); }
      const r = new THREE.Mesh(G("rock", () => new THREE.DodecahedronGeometry(0.6, 0)), M(0x4a3038)); r.position.y = 0.3; g.add(r);
    } else {
      const tall = v[0] < 0.5;
      const c = new THREE.Mesh(G(tall ? "col2" : "col1", () => new THREE.CylinderGeometry(0.35, 0.4, tall ? 2.2 : 1.2, 8)), M(0xf3ead7)); c.position.y = tall ? 1.1 : 0.6; c.castShadow = true; g.add(c);
      if (tall) { const cap = new THREE.Mesh(G("ccap", () => new THREE.BoxGeometry(1, 0.2, 1)), M(0xd8c8a8)); cap.position.y = 2.3; g.add(cap); }
    }
    g.scale.setScalar(t.s); g.position.set(t.x, t.y, t.z); g.rotation.y = t.rot;
    world.add(g);
  }
  const FL = [0xff7aa8, 0xffe066, 0xffffff, 0xb48cff];
  for (const f of W.flowers) {
    const g = new THREE.Group();
    const s = new THREE.Mesh(G("stem", () => new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4)), M(0x3a9a44)); s.position.y = 0.15;
    const h = new THREE.Mesh(G("bud", () => new THREE.SphereGeometry(0.14, 7, 5)), M(FL[f.c])); h.position.y = 0.32;
    g.add(s, h); g.position.set(f.x, 0, f.z); world.add(g);
  }
  // flags
  const flagMesh = W.flags.map((f) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(G("pole", () => new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6)), M(0xdddddd)); pole.position.y = 1.2; g.add(pole);
    const cloth = new THREE.Mesh(G("cloth", () => new THREE.PlaneGeometry(0.9, 0.55)), M(0x8a96a8, { side: THREE.DoubleSide })); cloth.position.set(0.45, 2.0, 0); g.add(cloth);
    g.position.set(f.x, f.y, f.z); world.add(g);
    return { g, cloth, ph: f.ox };
  });
  // bounce mushrooms
  const springMesh = W.springs.map((s) => {
    const p = W.plats[s.p], g = new THREE.Group();
    const st = new THREE.Mesh(G("stalk", () => new THREE.CylinderGeometry(0.25, 0.3, 0.5, 8)), M(0xf6efe0)); st.position.y = 0.25; g.add(st);
    const cap = new THREE.Mesh(G("mcap", () => new THREE.SphereGeometry(0.95, 10, 6, 0, TAU, 0, Math.PI / 2)), M(0xff4b5c)); cap.position.y = 0.5; cap.castShadow = true; g.add(cap);
    for (let i = 0; i < 5; i++) { const d = new THREE.Mesh(G("dot", () => new THREE.SphereGeometry(0.11, 6, 5)), M(0xffffff)); const a = (i / 5) * TAU; d.position.set(Math.cos(a) * 0.5, 0.5 + 0.62, Math.sin(a) * 0.5); d.scale.y = 0.5; g.add(d); }
    g.position.set(p.x, p.y, p.z); world.add(g);
    return g;
  });
  // wind vents
  const liftFx = W.lifts.map((l) => {
    const col = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.5, 1.5, l.h, 14, 1, true)), BM(0xcfeaff, { side: THREE.DoubleSide, opacity: 0.16, ...ADD }));
    col.position.set(l.x, l.y0 + l.h / 2, l.z); world.add(col);
    const rg = [];
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(G("lring", () => new THREE.TorusGeometry(1.3, 0.05, 6, 18)), BM(0xffffff, { opacity: 0.5, ...ADD })); r.rotation.x = Math.PI / 2; world.add(r); rg.push(r); }
    return { l, rg };
  });
  // the shards and their beams
  const shardMesh = W.shards.map((s) => {
    const g = new THREE.Group();
    const c = new THREE.Mesh(G("shard", () => new THREE.OctahedronGeometry(0.7, 0)), M(s.col, { emissive: s.col, emissiveIntensity: 0.7 })); c.scale.y = 1.6; g.add(c);
    const halo = new THREE.Mesh(G("halo", () => new THREE.SphereGeometry(1.5, 12, 10)), BM(s.col, { opacity: 0.16, ...ADD })); g.add(halo);
    g.position.set(s.x, s.y, s.z); world.add(g);
    const beam = new THREE.Mesh(G("beam", () => new THREE.CylinderGeometry(0.4, 0.4, BEAM_H, 10, 1, true)), BM(s.col, { side: THREE.DoubleSide, opacity: 0.28, fog: false, ...ADD }));
    beam.position.set(s.x, s.y + BEAM_H / 2, s.z); world.add(beam);
    return { g, c, halo, beam, s };
  });
  // the temple: twelve pillars, one golden gate, a glowing dais
  let gate = null, orb = null, templeBeam = null;
  for (const pl of W.pillars) {
    const col = new THREE.Mesh(G("pillar", () => new THREE.CylinderGeometry(0.6, 0.7, 4.2, 8)), pl.gate ? M(0xffc83d, { emissive: 0x7a4a00 }) : M(0xf3ead7));
    col.position.set(pl.x, pl.y0 + 2.1, pl.z); col.castShadow = true; col.receiveShadow = true; world.add(col);
    const cap = new THREE.Mesh(G("pcap", () => new THREE.BoxGeometry(1.5, 0.35, 1.5)), M(0xd8c8a8)); cap.position.set(pl.x, pl.y0 + 4.35, pl.z); cap.castShadow = true; world.add(cap);
    if (pl.gate) gate = { col, cap, y0: pl.y0, x: pl.x, z: pl.z };
  }
  if (W.temple) {
    const T0 = W.temple;
    const dais = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.5, 1.7, 0.3, 16)), M(0xffe28a, { emissive: 0x8a6a10 })); dais.position.set(T0.x, T0.y + 0.15, T0.z); world.add(dais);
    orb = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.5, 1)), BM(0xffe9a0, { opacity: 0, ...ADD })); orb.position.set(T0.x, T0.y + 1.6, T0.z); world.add(orb);
    templeBeam = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.9, 0.9, BEAM_H, 12, 1, true)), BM(0xffe28a, { side: THREE.DoubleSide, opacity: 0.3, fog: false, ...ADD }));
    templeBeam.position.set(T0.x, T0.y + BEAM_H / 2, T0.z); templeBeam.visible = false; world.add(templeBeam);
  }
  // clouds
  const cloudMesh = W.clouds.map((c) => {
    const g = new THREE.Group();
    for (let k = 0; k < c.n; k++) {
      const s = new THREE.Mesh(G("cloud", () => new THREE.IcosahedronGeometry(4.5, 0)), M(0xffffff, { emissive: 0x8a94a8, transparent: true, opacity: 0.92 }));
      const sc = (3 + c.v[k * 3] * 3) / 4.5;
      s.scale.set(sc, sc * 0.6, sc);
      s.position.set(k * 3.4 - c.n * 1.7, c.v[k * 3 + 1] * 1.2, (c.v[k * 3 + 2] - 0.5) * 3);
      g.add(s);
    }
    g.position.set(c.x, c.y, c.z); world.add(g);
    return { g, sp: c.sp };
  });
  // slimes: a pool, drawn from this player's run
  const slimeMesh = W.slimes.map(() => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(G("slime", () => new THREE.SphereGeometry(0.55, 10, 8)), M(0x6fe08a, { emissive: 0x1a5a2a })); b.position.y = 0.45; b.scale.y = 0.85; b.castShadow = true; g.add(b);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(G("seye", () => new THREE.SphereGeometry(0.14, 8, 6)), M(0xffffff)); e.position.set(s * 0.2, 0.62, 0.43); g.add(e);
      const q = new THREE.Mesh(G("spup", () => new THREE.SphereGeometry(0.07, 6, 5)), M(0x111111)); q.position.set(s * 0.2, 0.62, 0.55); g.add(q);
    }
    world.add(g);
    return g;
  });

  tint = false;

  // ── explorers ──────────────────────────────────────────────────────────────
  function makeHero(color, name) {
    const hero = new THREE.Group();
    const bodyG = new THREE.Group(); hero.add(bodyG);
    const body = new THREE.Mesh(G("body", () => new THREE.SphereGeometry(0.5, 14, 10)), M(color)); body.position.y = 0.56; body.scale.set(1, 1.04, 0.95); bodyG.add(body);
    const belly = new THREE.Mesh(G("belly", () => new THREE.SphereGeometry(0.34, 10, 8)), M(0xffe6c8)); belly.position.set(0, 0.5, 0.28); belly.scale.set(1, 1.1, 0.6); bodyG.add(belly);
    const eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(G("eye", () => new THREE.SphereGeometry(0.12, 8, 6)), M(0xffffff)); e.position.set(s * 0.2, 0.8, 0.4);
      const q = new THREE.Mesh(G("pupil", () => new THREE.SphereGeometry(0.065, 6, 5)), M(0x1a1a2a)); q.position.set(0, 0, 0.1); e.add(q);
      bodyG.add(e); eyes.push(e);
      const ch = new THREE.Mesh(G("cheek", () => new THREE.SphereGeometry(0.07, 6, 5)), M(0xff9ab0)); ch.position.set(s * 0.3, 0.66, 0.4); ch.scale.z = 0.5; bodyG.add(ch);
    }
    const hat = new THREE.Mesh(G("hat", () => new THREE.ConeGeometry(0.3, 0.5, 8)), M(0xffd24a)); hat.position.set(0, 1.18, 0); hat.rotation.z = 0.15; bodyG.add(hat);
    const pom = new THREE.Mesh(G("pom", () => new THREE.SphereGeometry(0.1, 6, 5)), M(0xffffff)); pom.position.set(0.06, 1.46, 0); bodyG.add(pom);
    const pack = new THREE.Mesh(G("pack", () => new THREE.BoxGeometry(0.5, 0.55, 0.3)), M(0x8b5e3c)); pack.position.set(0, 0.55, -0.45); bodyG.add(pack);
    const dark = new THREE.Color(color).multiplyScalar(0.78).getHex();
    const feet = [-1, 1].map((s) => { const f = new THREE.Mesh(G("foot", () => new THREE.SphereGeometry(0.17, 8, 6)), M(dark)); f.position.set(s * 0.2, 0.12, 0.05); f.scale.set(1, 0.7, 1.3); bodyG.add(f); return f; });
    const arms = [-1, 1].map((s) => { const a = new THREE.Mesh(G("arm", () => new THREE.SphereGeometry(0.13, 8, 6)), M(color)); a.position.set(s * 0.52, 0.55, 0); bodyG.add(a); return a; });
    const glider = new THREE.Mesh(G("glider", () => new THREE.ConeGeometry(1.1, 0.5, 7, 1, true)), M(0x62d36c, { side: THREE.DoubleSide })); glider.position.y = 2.0; glider.scale.setScalar(0.01); hero.add(glider);
    const scarf = [];
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(G("scarf" + i, () => new THREE.SphereGeometry(0.16 - i * 0.02, 6, 5)), M(i % 2 ? 0xffd24a : 0xff4b5c)); scene.add(s); scarf.push(s); }
    const blob = new THREE.Mesh(G("shadow", () => new THREE.CircleGeometry(0.55, 16)), keep(new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.3, depthWrite: false })));
    blob.rotation.x = -Math.PI / 2; scene.add(blob);
    hero.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    let tag = null;
    if (name) {
      const c = document.createElement("canvas"); c.width = 256; c.height = 64;
      const g = c.getContext("2d");
      g.font = "800 34px Nunito, 'Trebuchet MS', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 7; g.strokeStyle = "rgba(10,20,40,.85)"; g.strokeText(name.slice(0, 14), 128, 34);
      g.fillStyle = "#" + new THREE.Color(color).getHexString(); g.fillText(name.slice(0, 14), 128, 34);
      const tex = keep(new THREE.CanvasTexture(c));
      tag = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })));
      tag.scale.set(2.6, 0.65, 1); tag.position.y = 2.15; hero.add(tag);
    }
    scene.add(hero);
    return { hero, bodyG, eyes, feet, arms, glider, scarf, blob, tag, phase: 0, sq: 0, gl: 0, blink: 2, face: 0, tilt: 0 };
  }
  const H = makeHero(opts.color || 0xff7a4d, null);
  const mates = new Map();                  // id -> hero

  function groundUnder(x, y, z, platsLive) {
    let gy = -1e9;
    for (let i = 0; i < W.plats.length; i++) {
      const p = W.plats[i], q = platsLive ? platsLive[i] : p;
      if ((platsLive && !q.solid) || q.y > y + 0.3) continue;
      if (Math.hypot(x - q.x, z - q.z) < p.r && q.y > gy) gy = q.y;
    }
    return gy;
  }
  // one explorer, posed from where it is and what it's doing
  function pose(h, st, dt, T, platsLive) {
    h.hero.position.set(st.x, st.y, st.z);
    h.face = st.face;
    h.sq = st.sq !== undefined ? st.sq : h.sq + (0 - h.sq) * Math.min(1, dt * 9);
    h.hero.rotation.y = st.face;
    h.phase += st.speed * dt * 1.6;
    const run = st.onG ? Math.min(1, st.speed / 6) : 0;
    h.bodyG.position.y = Math.abs(Math.sin(h.phase)) * 0.1 * run;
    h.bodyG.rotation.x = lerp(h.bodyG.rotation.x, st.onG ? 0.12 * run + (st.speed > 1 ? 0.05 : 0) : st.vy > 0 ? -0.1 : 0.12, Math.min(1, dt * 10));
    h.bodyG.scale.set(1 + h.sq * 0.25, 1 - h.sq * 0.32, 1 + h.sq * 0.25);
    h.feet[0].position.z = 0.05 + Math.sin(h.phase) * 0.28 * run; h.feet[1].position.z = 0.05 - Math.sin(h.phase) * 0.28 * run;
    h.feet[0].position.y = 0.12 + Math.max(0, Math.cos(h.phase)) * 0.12 * run; h.feet[1].position.y = 0.12 + Math.max(0, -Math.cos(h.phase)) * 0.12 * run;
    const air = !st.onG;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      h.arms[i].position.y = 0.55 + (air ? 0.25 : Math.sin(h.phase + (i ? Math.PI : 0)) * 0.05 * run);
      h.arms[i].position.x = s * (0.52 + (air ? 0.12 : 0));
      h.arms[i].position.z = air ? 0 : Math.sin(h.phase + (i ? 0 : Math.PI)) * 0.2 * run;
    }
    h.blink -= dt; if (h.blink < -0.12) h.blink = 2 + Math.random() * 3;
    const bl = h.blink < 0 ? 0.1 : 1; h.eyes.forEach((e) => { e.scale.y = bl; });
    h.gl += ((st.gliding ? 1 : 0) - h.gl) * Math.min(1, dt * 12);
    h.glider.scale.setScalar(Math.max(0.01, h.gl)); h.glider.rotation.y += dt * 2;
    h.bodyG.visible = !(st.inv && Math.floor(T * 18) % 2 === 0);
    // the scarf trails behind
    const f = st.face, ax = st.x - Math.sin(f) * 0.12, ay = st.y + 0.85, az = st.z - Math.cos(f) * 0.12;
    let px = ax, py = ay, pz = az;
    for (let i = 0; i < h.scarf.length; i++) {
      const s = h.scarf[i];
      const tx = px - st.vx * 0.05 - Math.sin(f) * 0.18, ty = py - 0.1 - (air ? 0.04 : 0.02), tz = pz - st.vz * 0.05 - Math.cos(f) * 0.18;
      if (!s.userData.init) { s.position.set(tx, ty, tz); s.userData.init = 1; }
      const k = Math.min(1, dt * (22 - i * 2));
      s.position.x += (tx - s.position.x) * k; s.position.y += (ty - s.position.y) * k; s.position.z += (tz - s.position.z) * k;
      px = s.position.x; py = s.position.y; pz = s.position.z;
    }
    const gy = groundUnder(st.x, st.y, st.z, platsLive);
    if (gy > -1e8) {
      const hgt = st.y - gy, s = 1 - clamp(hgt / 14, 0, 0.6);
      h.blob.visible = true; h.blob.position.set(st.x, gy + 0.04, st.z); h.blob.scale.setScalar(s); h.blob.material.opacity = 0.32 * s;
    } else h.blob.visible = false;
  }
  function dropHero(h) {
    scene.remove(h.hero); scene.remove(h.blob);
    for (const s of h.scarf) scene.remove(s);
  }

  // ── ropes, tail to tail ────────────────────────────────────────────────────
  const BEADS = 22, ropeMesh = new Map();
  const tailAt = (h) => ({ x: h.hero.position.x - Math.sin(h.face) * 0.5, y: h.hero.position.y + 0.32, z: h.hero.position.z - Math.cos(h.face) * 0.5 });
  function makeRope(ca, cb) {
    const beads = [];
    for (let i = 0; i < BEADS; i++) {
      const b = new THREE.Mesh(G("bead", () => new THREE.SphereGeometry(0.1, 6, 5)), M(i < BEADS / 2 ? ca : cb));
      scene.add(b); beads.push(b);
    }
    return { beads };
  }
  function drawRope(R, ha, hb, rp, T) {
    const A = tailAt(ha), B = tailAt(hb);
    const d = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
    if (rp.on) {
      // a rope of rp.len: the slack hangs down in the middle; taut, it's straight and hums
      // ...but no lower than the grass under you two: slack lies on the ground
      const sag = Math.max(0, Math.min(2.4, Math.sqrt(Math.max(0, rp.len * rp.len - d * d)) * 0.32, (A.y + B.y) / 2 - Math.min(A.y, B.y) + 0.2));
      const taut = d > rp.len - 0.4;
      for (let i = 0; i < BEADS; i++) {
        const t = (i + 0.5) / BEADS, m = 4 * t * (1 - t), b = R.beads[i];
        b.visible = true;
        b.position.set(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t - sag * m + (taut ? Math.sin(T * 45 + i * 1.7) * 0.05 * m : 0), A.z + (B.z - A.z) * t);
        b.scale.setScalar(taut ? 1.15 : 1);
      }
    } else {
      // snapped: a short tail hangs off each of you, swaying
      const half = BEADS / 2;
      for (let i = 0; i < BEADS; i++) {
        const b = R.beads[i], end = i < half ? ha : hb, j = i < half ? i : i - half;
        if (j > 6) { b.visible = false; continue; }
        const at = i < half ? A : B, f = end.face, sw = Math.sin(T * 4 + j * 0.6 + (i < half ? 0 : 2)) * 0.05 * j;
        b.visible = true; b.scale.setScalar(1);
        b.position.set(at.x - Math.sin(f) * 0.2 * j + Math.cos(f) * sw, at.y - 0.09 * Math.pow(j, 1.25), at.z - Math.cos(f) * 0.2 * j - Math.sin(f) * sw);
      }
    }
  }
  function dropRope(R) { for (const b of R.beads) scene.remove(b); }

  // ── camera ─────────────────────────────────────────────────────────────────
  let camInit = false, tmpK = 0, shake = 0;
  function cameraFollow(P, yaw, pitch, dt, zone) {
    const inTemple = W.temple && Math.hypot(P.x - W.temple.x, P.z - W.temple.z) < 5.4 && Math.abs(P.y - W.temple.y) < 3.5;
    tmpK += ((inTemple ? 1 : 0) - tmpK) * Math.min(1, dt * 4);
    const pe = lerp(pitch, Math.max(pitch, 0.8), tmpK), cp = Math.cos(pe), dist = lerp(8.5 * (P.gliding ? 1.15 : 1), 6.5, tmpK);
    const tx = P.x, ty = P.y + 1.3, tz = P.z;
    const wx = tx + Math.sin(yaw) * cp * dist, wy = ty + Math.sin(pe) * dist + 0.3, wz = tz + Math.cos(yaw) * cp * dist;
    if (!camInit) { camera.position.set(wx, wy, wz); camInit = true; }
    const k = 1 - Math.exp(-dt * 10);
    camera.position.x += (wx - camera.position.x) * k; camera.position.y += (wy - camera.position.y) * k; camera.position.z += (wz - camera.position.z) * k;
    shake = Math.max(0, shake - dt * 1.6);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.5; camera.position.y += (Math.random() - 0.5) * shake * 0.5; }
    camera.lookAt(tx, ty, tz);
    const fov = 55 + clamp(P.speed - 6, 0, 4) * 0.8 + (P.gliding ? 4 : 0);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
    sun.position.set(P.x + 22, P.y + 38, P.z + 14); sun.target.position.set(P.x, P.y, P.z); sun.target.updateMatrixWorld();
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    setSky(zone, dt);
  }

  // everyone else, and the ropes between us. off: drawn lifted by it (the
  // isle), where their own shadow isn't worked out
  function drawMates(remotes, ropes, dt, T, off) {
    const seen = new Set();
    for (const r of remotes) {
      seen.add(r.id);
      let h = mates.get(r.id);
      if (!h) { h = makeHero(r.col, r.name); mates.set(r.id, h); }
      if (off) { pose(h, { ...r, x: r.x + off.x, y: r.y + off.y, z: r.z + off.z }, dt, T, null); h.blob.visible = false; }
      else pose(h, r, dt, T, null);
    }
    for (const [id, h] of mates) if (!seen.has(id)) { dropHero(h); mates.delete(id); }
    const used = new Set();
    for (const rp of ropes) {
      const ha = rp.a === "me" ? H : mates.get(rp.a), hb = rp.b === "me" ? H : mates.get(rp.b);
      if (!ha || !hb) continue;
      const key = rp.a + "~" + rp.b;
      used.add(key);
      let R = ropeMesh.get(key);
      if (!R) { R = makeRope(rp.ca, rp.cb); ropeMesh.set(key, R); }
      drawRope(R, ha, hb, rp, T);
    }
    for (const [k, R] of ropeMesh) if (!used.has(k)) { dropRope(R); ropeMesh.delete(k); }
  }

  // ── one frame ──────────────────────────────────────────────────────────────
  function frame({ S, team, remotes = [], ropes = [], yaw, pitch, dt, T }) {
    const P = S.pl;
    // platforms
    for (let i = 0; i < W.plats.length; i++) {
      const m = platMesh[i]; if (!m) continue;
      const q = S.plats[i];
      m.visible = q.state !== 3;
      // a blinking stone: gone while it's gone, flickering in its last half second
      if (W.plats[i].kind === "blink") { const left = blinkLeft(W.plats[i], S.T); m.visible = left > 0 && (left > 0.6 || Math.floor(left * 12) % 2 === 0); }
      if (q.state === 0 && m.scale.x < 1) m.scale.setScalar(Math.min(1, m.scale.x + dt * 4));
      m.position.set(q.x + (q.state === 1 ? (Math.random() - 0.5) * 0.12 : 0), q.y, q.z + (q.state === 1 ? (Math.random() - 0.5) * 0.12 : 0));
    }
    // shards: gone once yours (or, together, the team's)
    const have = team ? new Set([...S.shards, ...team]) : S.shards;
    for (const sm of shardMesh) {
      const on = !have.has(sm.s.i);
      sm.g.visible = on; sm.beam.visible = on;
      if (on) { sm.c.rotation.y += dt * 1.2; sm.g.position.y = sm.s.y + Math.sin(T * 1.6) * 0.25; sm.halo.scale.setScalar(1 + Math.sin(T * 3) * 0.08); }
    }
    // springs, flags, vents, clouds, slimes
    springMesh.forEach((g, k) => { const sq = S.springs[k] || 0; g.scale.set(1 + sq * 0.25, 1 - sq * 0.45, 1 + sq * 0.25); });
    flagMesh.forEach((f, k) => {
      const on = S.flags.has(k);
      f.cloth.material = M(on ? 0x62d36c : 0x8a96a8, { side: THREE.DoubleSide });
      f.cloth.rotation.y = Math.sin(T * 3 + f.ph) * 0.35; f.cloth.position.y = on ? 2.1 : 1.4;
    });
    for (const lf of liftFx) lf.rg.forEach((r, i) => { const k = (T * 0.7 + i / 3) % 1; r.position.set(lf.l.x, lf.l.y0 + k * lf.l.h, lf.l.z); r.material.opacity = 0.5 * (1 - k); r.scale.setScalar(0.8 + k * 0.3); });
    for (const c of cloudMesh) { c.g.position.x += c.sp * dt; if (c.g.position.x > 280) c.g.position.x = -280; }
    S.slimes.forEach((s, k) => {
      const g = slimeMesh[k]; g.visible = s.alive; if (!s.alive) return;
      g.position.set(s.x, s.y, s.z); g.rotation.y = s.dir;
      const q = Math.sin(s.t * 5); g.scale.set(1 + (q < 0 ? -q * 0.12 : 0), 1 + (q > 0 ? q * 0.1 : -q * 0.18), 1 + (q < 0 ? -q * 0.12 : 0));
    });
    // the gate sinks; the temple glows
    if (gate) {
      const k = S.gateOpen ? S.gateT : 0;
      gate.col.position.y = gate.y0 + 2.1 - k * 4.4; gate.cap.position.y = gate.y0 + 4.35 - k * 0.2;
      if (S.gateOpen && k < 1 && Math.random() < 0.5) emit(gate.x + (Math.random() - 0.5), gate.y0 + 0.2, gate.z + (Math.random() - 0.5), 0, 2, 0, 0.7, 0xffe28a);
    }
    if (orb) {
      orb.material.opacity = S.gateOpen ? 0.35 + Math.sin(T * 3) * 0.1 : 0; orb.rotation.y += dt;
      templeBeam.visible = S.gateOpen;
      if (S.gateOpen && Math.random() < dt * 25) { const a = Math.random() * TAU; emit(W.temple.x + Math.cos(a) * 1.2, W.temple.y + 0.2, W.temple.z + Math.sin(a) * 1.2, 0, 3.5, 0, 1, 0xffe28a); }
    }
    // a gust: streaks blowing past you
    const gust = windAt(W, S.T);
    if (gust && Math.random() < dt * 40) { const a = Math.random() * TAU, r = 2 + Math.random() * 6; emit(P.x + Math.cos(a) * r - gust[0] * 3, P.y + Math.random() * 4, P.z + Math.sin(a) * r - gust[1] * 3, gust[0] * 7, 0.6, gust[1] * 7, 0.7, 0xeef6ff); }
    // dust under running feet, wind in the vents
    if (P.onG && P.speed > 3.5 && Math.random() < dt * 14) emit(P.x - P.vx * 0.05, P.y + 0.05, P.z - P.vz * 0.05, (Math.random() - 0.5) * 0.8, 0.6, (Math.random() - 0.5) * 0.8, 0.4, 0xd8d2c0);
    for (const l of W.lifts) if (Math.hypot(P.x - l.x, P.z - l.z) < l.r && P.y > l.y0 - 0.3 && P.y < l.y0 + l.h && Math.random() < dt * 20) emit(l.x + (Math.random() - 0.5) * 2, P.y - 0.4, l.z + (Math.random() - 0.5) * 2, 0, 3, 0, 0.5, 0xcfeaff);
    for (const q of S.plats) if (q.state === 1 && Math.random() < 0.4) emit(q.x + (Math.random() - 0.5) * 2, q.y, q.z + (Math.random() - 0.5) * 2, 0, 1, 0, 0.6, 0xd8b080);
    // you
    pose(H, { x: P.x, y: P.y, z: P.z, face: P.face, speed: P.speed, onG: P.onG, vy: P.vy, vx: P.vx, vz: P.vz, gliding: P.gliding, inv: P.inv > 0, sq: P.sq }, dt, T, S.plats);
    drawMates(remotes, ropes, dt, T, null);
    updParticles(dt); updRings(dt);
    cameraFollow(P, yaw, pitch, dt, S.zone);
    renderer.render(scene, camera);
  }

  // ── Sunhaven Isle: the stage after the temple ──────────────────────────────
  // A second island, drawn with the same lights, sky, shadows, fx and explorer
  // as the sky hop. It floats high over the temple (off), so from its rim you
  // look down at the way you came. WI is the island's own world (sunhavenWorld,
  // local coordinates). Built only when asked — at the portal — because its
  // ground is a big mesh; everything goes through keep(), so dispose() takes it.
  //   createIsle(WI, off) -> { show(on), frame({ S, remotes, ropes, yaw, pitch, dt, T }), off }
  //     S: an island run (sunhavenSim); remotes in the island's coordinates
  function createIsle(WI, off, K = { zoneAt, EMBER, LAKE }) {
    const G0 = new THREE.Group(); G0.position.set(off.x, off.y, off.z); G0.visible = false; scene.add(G0);
    const A = (m, x, y, z, p) => { m.position.set(x, y, z); (p || G0).add(m); return m; };
    const SPH = (r, c, o) => new THREE.Mesh(G("is_s" + r, () => new THREE.SphereGeometry(r, 10, 8)), M(c, o));
    // ground: a vertex-coloured height map that takes the sun's shadow
    {
      const N = 150, SZ = MAP_SIZE, g = keep(new THREE.PlaneGeometry(SZ, SZ, N, N)); g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), h = WI.H(x, z); pos.setY(i, h);
        const zi = K.zoneAt(x, z, 0);
        if (h < -2.5) c.setHex(0x8f7a64);
        else if (h < 0.1) c.setHex(0xe8d49a);
        else if (h < 0.7) c.setHex(0xd9d08a);
        else if (zi === 3 && Math.hypot(x - K.EMBER.x, z - K.EMBER.z) < 30) c.setHex(h > 9 ? 0xb8704c : 0xa06c4a);
        else if (zi === 5) c.setHex(0x8e8ea6);
        else if (zi === 0 && Math.hypot(x, z) < 11) c.setHex(0xe0cfa0);
        else if (h > 18) c.setHex(0xc8d8a0);
        else if (h > 9) c.setHex(0x7ec45a);
        else c.setHex(0x72d15a);
        c.multiplyScalar(0.93 + ((((Math.sin(x * 12.9898 + z * 78.233) * 43758.5) % 1) + 1) % 1) * 0.12);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
      const t = new THREE.Mesh(g, keep(new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0, specular: 0x000000 })));
      t.receiveShadow = true; G0.add(t);
      const lk = new THREE.Mesh(keep(new THREE.CircleGeometry(23, 36)), keep(new THREE.MeshPhongMaterial({ color: 0x4fb8e8, transparent: true, opacity: 0.82, shininess: 40, flatShading: true })));
      lk.rotation.x = -Math.PI / 2; A(lk, K.LAKE.x, -0.25, K.LAKE.z);
    }
    const inst = (geo, list, f, shadow) => {
      const im = keep(new THREE.InstancedMesh(geo, keep(new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 0, specular: 0x000000 })), Math.max(1, list.length)));
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
      list.forEach((o, i) => { const r = f(o); e.set(0, r.rot || 0, 0); q.setFromEuler(e); s.set(r.sx, r.sy, r.sz); p.set(r.x, r.y, r.z); m.compose(p, q, s); im.setMatrixAt(i, m); c.setHex(r.c); im.setColorAt(i, c); });
      if (!list.length) im.count = 0;
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.castShadow = !!shadow; G0.add(im); return im;
    };
    const trunkG = keep(new THREE.CylinderGeometry(0.22, 0.34, 1, 6)); trunkG.translate(0, 0.5, 0);
    const coneG = keep(new THREE.ConeGeometry(1, 1, 8)); coneG.translate(0, 0.5, 0);
    const ballG = keep(new THREE.IcosahedronGeometry(1, 0));
    inst(trunkG, WI.trees, (t) => ({ x: t.x, y: t.y, z: t.z, sx: t.s, sy: 3.4 * t.s, sz: t.s, c: t.ember ? 0x5a4234 : 0x8b5e3c, rot: t.rot }), true);
    inst(ballG, WI.trees.filter((t) => t.round), (t) => ({ x: t.x, y: t.y + 4.0 * t.s, z: t.z, sx: 1.7 * t.s, sy: 1.5 * t.s, sz: 1.7 * t.s, c: t.ember ? 0xa0623a : [0x4fc05a, 0x5ecf62, 0x45b04f][(t.v * 3) | 0], rot: t.rot }), true);
    inst(coneG, WI.trees.filter((t) => !t.round), (t) => ({ x: t.x, y: t.y + 2.2 * t.s, z: t.z, sx: 1.5 * t.s, sy: 3.6 * t.s, sz: 1.5 * t.s, c: t.ember ? 0x8a5232 : [0x2f9a52, 0x3aa85c, 0x2a8a4a][(t.v * 3) | 0], rot: t.rot }), true);
    inst(keep(new THREE.DodecahedronGeometry(1, 0)), WI.rocks, (r) => ({ x: r.x, y: r.y + 0.3 * r.s, z: r.z, sx: r.s, sy: r.s * 0.7, sz: r.s, c: r.ember ? 0x7a5248 : 0xa8a8b4, rot: r.rot }), true);
    const petal = [0xff8fc7, 0xffd24a, 0xffffff, 0xa678ff];
    inst(keep(new THREE.IcosahedronGeometry(0.2, 0)), WI.flowers, (f) => ({ x: f.x, y: f.y + 0.4, z: f.z, sx: 1, sy: 1, sz: 1, c: petal[f.c] }));
    inst(keep(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 3)), WI.flowers, (f) => ({ x: f.x, y: f.y + 0.2, z: f.z, sx: 1, sy: 1, sz: 1, c: 0x3d8a3a }));
    // houses and the fountain
    WI.houses.forEach((h) => {
      const g = new THREE.Group();
      const w = A(new THREE.Mesh(G("is_hw", () => new THREE.BoxGeometry(5, 3.4, 4.4)), M(h.wall)), 0, 1.7, 0, g); w.castShadow = true;
      const roof = A(new THREE.Mesh(G("is_hr", () => new THREE.ConeGeometry(4.2, 2.4, 4)), M(h.roof)), 0, 4.6, 0, g); roof.rotation.y = Math.PI / 4; roof.castShadow = true;
      A(new THREE.Mesh(G("is_hd", () => new THREE.BoxGeometry(1, 1.8, 0.2)), M(0x7a4a2a)), 0, 0.9, 2.25, g);
      A(new THREE.Mesh(G("is_hwi", () => new THREE.BoxGeometry(0.9, 0.9, 0.2)), M(0xbfe8ff, { emissive: 0x2a5a7a })), -1.5, 2.2, 2.25, g);
      g.position.set(h.x, h.y, h.z); g.rotation.y = h.rot; G0.add(g);
    });
    {
      const f = WI.fountain, g = new THREE.Group();
      A(new THREE.Mesh(G("is_f1", () => new THREE.CylinderGeometry(2.4, 2.6, 0.8, 10)), M(0xe2ddd0)), 0, 0.4, 0, g).castShadow = true;
      A(new THREE.Mesh(G("is_f2", () => new THREE.CylinderGeometry(2.0, 2.0, 0.2, 10)), M(0x6fd0ff, { emissive: 0x1a4a6a })), 0, 0.75, 0, g);
      A(new THREE.Mesh(G("is_f3", () => new THREE.CylinderGeometry(0.35, 0.5, 2.2, 8)), M(0xe2ddd0)), 0, 1.6, 0, g);
      A(SPH(0.6, 0xffe28a, { emissive: 0x6a5010 }), 0, 3, 0, g);
      g.position.set(f.x, f.y, f.z); G0.add(g);
    }
    // stepping stones and the wind vent, in the same stone as the sky hop
    const isPlat = [], platFx = [];
    WI.plats.forEach((p) => {
      const g = new THREE.Group();
      const color = p.kind === "crumble" ? 0xb98a5e : p.kind === "lift" ? 0x9ad8e8 : p.pad ? 0x62d36c : 0xd8c9a8;
      A(new THREE.Mesh(G("is_p" + p.r + p.th, () => new THREE.CylinderGeometry(p.r, p.r * 0.9, p.th, 10)), M(color)), 0, -p.th / 2, 0, g).castShadow = true;
      if (!p.pad && p.kind !== "lift") A(new THREE.Mesh(G("is_pt" + p.r, () => new THREE.CylinderGeometry(p.r * 0.97, p.r * 0.97, 0.14, 10)), M(0x72d15a)), 0, -0.05, 0, g);
      if (p.kind === "spring") { const cap = A(new THREE.Mesh(G("is_cap", () => new THREE.SphereGeometry(0.85, 10, 6, 0, TAU, 0, Math.PI / 2)), M(0xe8453b)), 0, 0, 0, g); platFx.push({ p, cap }); }
      if (p.kind === "lift") A(new THREE.Mesh(G("is_beam", () => new THREE.CylinderGeometry(1.5, 1.5, 9, 10, 1, true)), BM(0xbff4ff, { transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })), 0, 4.5, 0, g);
      g.position.set(p.x, p.y, p.z); G0.add(g); isPlat.push(g);
    });
    // checkpoints
    const isFlag = WI.flags.map((f) => {
      const g = new THREE.Group();
      A(new THREE.Mesh(G("is_fp", () => new THREE.CylinderGeometry(0.08, 0.1, 3, 6)), M(0xdddddd)), 0, 1.5, 0, g);
      const cloth = A(new THREE.Mesh(G("is_fc", () => new THREE.BoxGeometry(1.2, 0.8, 0.06)), M(0x8a96a8, { side: THREE.DoubleSide })), 0.62, 2.5, 0, g);
      g.position.set(f.x, f.y, f.z); G0.add(g); return cloth;
    });
    // the four sun shrines
    const shrineMesh = WI.shrines.map((s) => {
      const g = new THREE.Group();
      A(new THREE.Mesh(G("is_sb", () => new THREE.CylinderGeometry(1.1, 1.3, 0.5, 8)), M(0xc4c0b4)), 0, 0.25, 0, g).castShadow = true;
      A(new THREE.Mesh(G("is_sc", () => new THREE.CylinderGeometry(0.45, 0.6, 1.1, 8)), M(0xe2ddd0)), 0, 1.05, 0, g).castShadow = true;
      const gem = A(new THREE.Mesh(G("is_sg", () => new THREE.OctahedronGeometry(0.55, 0)), M(0x666677)), 0, 2.2, 0, g);
      const beam = A(new THREE.Mesh(G("is_sbm", () => new THREE.CylinderGeometry(0.5, 0.9, 60, 8, 1, true)), BM(s.col, { opacity: 0.28, side: THREE.DoubleSide, ...ADD })), 0, 30, 0, g); beam.visible = false;
      g.position.set(s.x, s.y, s.z); G0.add(g); return { gem, beam, s };
    });
    // creatures: a mesh each, made when first seen (the boss's wisps come and go)
    const slimeMesh = new Map(), wispMesh = new Map();
    const slimeFor = (s) => {
      let m = slimeMesh.get(s);
      if (!m) {
        m = new THREE.Group();
        const b = A(new THREE.Mesh(G("is_sl", () => new THREE.SphereGeometry(0.62, 10, 8)), M(0x6fe08a, { emissive: 0x104a20 })), 0, 0.45, 0, m); b.castShadow = true;
        A(SPH(0.08, 0x111111), -0.2, 0.6, 0.5, m); A(SPH(0.08, 0x111111), 0.2, 0.6, 0.5, m);
        G0.add(m); slimeMesh.set(s, m);
      }
      return m;
    };
    const wispFor = (w) => { let m = wispMesh.get(w); if (!m) { m = new THREE.Mesh(G("is_wi", () => new THREE.IcosahedronGeometry(0.5, 1)), M(0xff9a4a, { emissive: 0xa04010 })); G0.add(m); wispMesh.set(w, m); } return m; };
    // heart pickups
    const heartM = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group(), hm = M(0xff5a6e, { emissive: 0x801020 });
      A(SPH(0.22, 0xff5a6e, { emissive: 0x801020 }), -0.15, 0.1, 0, g); A(SPH(0.22, 0xff5a6e, { emissive: 0x801020 }), 0.15, 0.1, 0, g);
      const t = A(new THREE.Mesh(G("is_ht", () => new THREE.ConeGeometry(0.34, 0.5, 6)), hm), 0, -0.18, 0, g); t.rotation.x = Math.PI;
      g.visible = false; G0.add(g); heartM.push(g);
    }
    // the shade tower yard
    const AR = WI.arena, pillarMesh = [];
    WI.pillars.forEach((p) => {
      const m = new THREE.Mesh(G("is_pl" + (p.gate ? 1 : 0), () => new THREE.BoxGeometry(1.3, p.gate ? 9 : 7, 1.3)), M(p.gate ? 0xffd24a : 0x9a92b8, p.gate ? { emissive: 0x6a4a00 } : undefined));
      m.castShadow = true; A(m, p.x, p.y0 + (p.gate ? 4.5 : 3.5), p.z); pillarMesh.push(m);
    });
    const boss = new THREE.Group();
    {
      const bm = M(0x3a3050), bm2 = M(0x4a4068);
      A(new THREE.Mesh(G("is_b1", () => new THREE.BoxGeometry(4.2, 4.0, 3.2)), bm), 0, 3.0, 0, boss).castShadow = true;
      A(new THREE.Mesh(G("is_b2", () => new THREE.BoxGeometry(2.4, 2.0, 2.4)), bm2), 0, 6.0, 0, boss).castShadow = true;
      A(new THREE.Mesh(G("is_b3", () => new THREE.BoxGeometry(1.4, 4, 1.4)), bm), -3.1, 3.2, 0.3, boss);
      A(new THREE.Mesh(G("is_b3", () => new THREE.BoxGeometry(1.4, 4, 1.4)), bm), 3.1, 3.2, 0.3, boss);
      A(SPH(0.28, 0xff3a3a, { emissive: 0xff2020 }), -0.55, 6.2, 1.25, boss); A(SPH(0.28, 0xff3a3a, { emissive: 0xff2020 }), 0.55, 6.2, 1.25, boss);
    }
    const crystal = A(new THREE.Mesh(G("is_cr", () => new THREE.OctahedronGeometry(0.9, 0)), M(0x66448a, { emissive: 0x220a44 })), 0, 3.3, 1.8, boss);
    A(boss, AR.x, AR.y, AR.z);
    const flat = (r0, col, op) => { const m = new THREE.Mesh(keep(new THREE.RingGeometry(r0, 1, 40)), BM(col, { transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; G0.add(m); return m; };
    const ringM = flat(0.92, 0xff4a6a, 0.85), teleM = flat(0, 0xff3a5a, 0.35);
    const orbD = [0, 1, 2, 3].map(() => flat(0, 0xff3a5a, 0.35));
    const orbB = [0, 1, 2, 3].map(() => { const m = SPH(0.7, 0xc060ff, { emissive: 0x6020a0 }); m.visible = false; G0.add(m); return m; });
    // the people of Sunhaven wear the explorer's look
    let npcHero = null;
    const NPC_COL = { sol: 0xf4efe6, pip: 0xff8fc7, brindle: 0xc08a5a };
    function show(on) {
      G0.visible = on;
      if (!on) return;
      if (!npcHero) npcHero = WI.npcs.map((n) => { const h = makeHero(NPC_COL[n.id] || 0xffffff, n.name); h.hero.scale.setScalar(n.s); if (h.tag) h.tag.position.y = 2.15 / n.s; return h; });
      camInit = false;
      // the sky hop's clouds that drift through this island go away
      for (const c of cloudMesh) { const d = Math.hypot(c.g.position.x - off.x, c.g.position.z - off.z); c.g.visible = !(d < 130 && Math.abs(c.g.position.y - off.y) < 60); }
    }
    const camP = { zoom: 0 };
    function frameIsle({ S: S2, remotes = [], ropes = [], yaw, pitch, dt, T }) {
      const P = S2.pl, B = S2.boss;
      P.sq *= Math.max(0, 1 - dt * 9);
      // you, with the explorer's own animation
      pose(H, { x: P.x + off.x, y: P.y + off.y, z: P.z + off.z, face: P.face, speed: P.speed, onG: P.onG, vy: P.vy, vx: P.vx, vz: P.vz, gliding: P.gliding, inv: P.inv > 0, sq: P.sq }, dt, T, null);
      H.blob.visible = false;
      if (P.onG && P.speed > 3.5 && Math.random() < dt * 14) emit(P.x + off.x - P.vx * 0.05, P.y + off.y + 0.05, P.z + off.z - P.vz * 0.05, (Math.random() - 0.5) * 0.8, 0.6, (Math.random() - 0.5) * 0.8, 0.4, 0xd8d2c0);
      for (const l of WI.lifts) if (Math.hypot(P.x - l.x, P.z - l.z) < l.r && Math.random() < dt * 20) emit(l.x + off.x + (Math.random() - 0.5) * 2, P.y + off.y - 0.4, l.z + off.z + (Math.random() - 0.5) * 2, 0, 3, 0, 0.5, 0xcfeaff);
      // the stones
      S2.plats.forEach((q, i) => { const g = isPlat[i]; g.visible = q.state !== 3; g.position.set(q.x + (q.shake ? Math.sin(T * 60) * 0.06 : 0), q.y, q.z); });
      platFx.forEach((f) => { const k = WI.springs.findIndex((s) => s.p === f.p.i), v = k >= 0 ? S2.springs[k] || 0 : 0; f.cap.scale.set(1 + v * 0.25, 1 - v * 0.45, 1 + v * 0.25); });
      isFlag.forEach((c, i) => { const on = S2.flags.has(i); c.material = M(on ? 0x62d36c : 0x8a96a8, { side: THREE.DoubleSide }); c.rotation.y = Math.sin(T * 3 + i) * 0.35; c.position.y = on ? 2.1 : 1.4; });
      shrineMesh.forEach((s, i) => { const lit = S2.shrines.has(i); s.gem.rotation.y = T * (lit ? 2 : 0.6); s.gem.position.y = 2.2 + Math.sin(T * 2 + i) * 0.15; s.gem.material = M(lit ? s.s.col : 0x666677, lit ? { emissive: s.s.col } : undefined); s.beam.visible = lit; });
      npcHero.forEach((h, i) => { const n = WI.npcs[i]; pose(h, { x: n.x + off.x, y: n.y + off.y, z: n.z + off.z, face: Math.atan2(P.x - n.x, P.z - n.z), speed: 0, onG: true, vy: 0, vx: 0, vz: 0, gliding: false, inv: false, sq: 0 }, dt, T, null); h.blob.visible = false; });
      S2.slimes.forEach((s) => { const m = slimeFor(s); m.visible = s.alive; if (!s.alive) return; const hop = Math.max(0, Math.sin(s.t * 5)); m.position.set(s.x, s.y - hop * 0.5, s.z); m.rotation.y = s.dir; m.scale.set(1 + (1 - hop) * 0.15, 0.8 + hop * 0.3, 1 + (1 - hop) * 0.15); });
      S2.wisps.forEach((w) => { const m = wispFor(w); m.visible = w.alive; if (!w.alive) return; m.position.set(w.x, w.y, w.z); m.scale.setScalar(1 + Math.sin(w.t * 8) * 0.12 + (w.st === 1 ? 0.25 : 0)); m.material = M(w.boss ? 0xc060ff : w.st === 1 ? 0xff5a3a : 0xff9a4a, { emissive: w.boss ? 0xa020c0 : w.st === 1 ? 0xff4010 : 0xa04010 }); });
      heartM.forEach((g, i) => { const q = S2.pickups[i]; g.visible = !!q; if (q) { g.position.set(q.x, q.y + Math.sin(T * 3 + i) * 0.15, q.z); g.rotation.y = T * 2.5; } });
      // the yard: the gate sinks, the colossus wakes, its attacks are drawn on the ground
      pillarMesh[0].position.y = WI.pillars[0].y0 + 4.5 - S2.gateT * 9.2;
      if (S2.gateOpen && S2.gateT < 1 && Math.random() < 0.5) emit(WI.pillars[0].x + off.x + (Math.random() - 0.5), WI.pillars[0].y0 + off.y + 0.2, WI.pillars[0].z + off.z + (Math.random() - 0.5), 0, 2, 0, 0.7, 0xffe28a);
      boss.visible = B.state !== "dead"; boss.rotation.y = B.face || 0;
      crystal.material = M(B.stunned ? 0xfff2a0 : 0x66448a, { emissive: B.stunned ? 0xffe060 : 0x220a44 }); crystal.rotation.y = T * 2;
      boss.position.y = AR.y + (B.state === "sleep" ? -0.5 : 0); boss.scale.y = B.state === "sleep" ? 0.88 : 1; boss.rotation.z = B.stunned ? Math.sin(T * 4) * 0.06 : 0;
      ringM.visible = B.state === "cycle" && B.sub === 1 && B.orbs.length === 0 && B.ringR > 0 && B.ringR < AR.r + 1;
      if (ringM.visible) { ringM.position.set(AR.x, AR.y + 0.2, AR.z); ringM.scale.setScalar(B.ringR); }
      const tele = B.state === "cycle" && B.sub === 0 && B.orbs.length === 0 && B.tele > 0;
      teleM.visible = tele; if (tele) { teleM.position.set(AR.x, AR.y + 0.15, AR.z); teleM.scale.setScalar(2 + B.tele * (AR.r - 2)); teleM.material.opacity = 0.15 + B.tele * 0.25; }
      for (let k = 0; k < 4; k++) {
        const o = B.orbs[k], on = !!o && B.state === "cycle" && B.sub === 0;
        orbD[k].visible = on; orbB[k].visible = on;
        if (on) { orbD[k].position.set(o.x, AR.y + 0.15, o.z); orbD[k].scale.setScalar(1.7); orbD[k].material.opacity = 0.2 + B.tele * 0.4; orbB[k].position.set(o.x, AR.y + 1 + (1 - B.tele) * 14, o.z); }
      }
      // friends on the island, and the ropes between us
      drawMates(remotes, ropes, dt, T, off);
      for (const c of cloudMesh) { c.g.position.x += c.sp * dt; if (c.g.position.x > 280) c.g.position.x = -280; }
      updParticles(dt); updRings(dt);
      // the camera: behind you, never inside the hill, wider in the tower yard
      const inYard = Math.hypot(P.x - AR.x, P.z - AR.z) < AR.r + 2 && B.state !== "dead" && S2.gateOpen;
      camP.zoom += ((inYard ? 1 : 0) - camP.zoom) * Math.min(1, dt * 2);
      const pe = clamp(pitch + camP.zoom * 0.25, -0.6, 1.4), cp = Math.cos(pe), dist = (8.5 + camP.zoom * 6) * (P.gliding ? 1.15 : 1);
      const tx = P.x + off.x, ty = P.y + off.y + 1.3, tz = P.z + off.z;
      const wx = tx + Math.sin(yaw) * cp * dist, wz = tz + Math.cos(yaw) * cp * dist;
      let wy = ty + Math.sin(pe) * dist + 0.3;
      const gh = WI.H(wx - off.x, wz - off.z) + off.y + 1.1;
      if (wy < gh) wy = gh;
      if (!camInit) { camera.position.set(wx, wy, wz); camInit = true; }
      const k = 1 - Math.exp(-dt * 10);
      camera.position.x += (wx - camera.position.x) * k; camera.position.y += (wy - camera.position.y) * k; camera.position.z += (wz - camera.position.z) * k;
      shake = Math.max(0, shake - dt * 1.6);
      if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.5; camera.position.y += (Math.random() - 0.5) * shake * 0.5; }
      // looking up: tilt toward the sky
      camera.lookAt(tx, ty + Math.max(0, -pe) * dist * 1.3, tz);
      const fov = 55 + clamp(P.speed - 6, 0, 4) * 0.8 + (P.gliding ? 4 : 0);
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
      sun.position.set(tx + 22, ty + 38, tz + 14); sun.target.position.set(tx, ty, tz); sun.target.updateMatrixWorld();
      sky.position.copy(camera.position); stars.position.copy(camera.position);
      setSky(ISLE_SKY + (S2.zone || 0), dt);
      renderer.render(scene, camera);
    }
    return { show, frame: frameIsle, off };
  }

  return {
    canvas,
    resize(w, h) { renderer.setSize(Math.max(1, w), Math.max(1, h), false); camera.aspect = Math.max(1, w) / Math.max(1, h); camera.updateProjectionMatrix(); },
    frame,
    createIsle,
    fx: { burst, ring, emit, shake(a) { shake = Math.max(shake, a); } },
    dispose() {
      for (const d of disposables) { try { d.dispose(); } catch { /* fine */ } }
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* fine */ }
    },
  };
}
