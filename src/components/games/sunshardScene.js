// src/components/games/sunshardScene.js
// Sunshard Islands: the 3D scene (three.js r128). It draws the level that
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
import { ZONES, PAL0, TAU, clamp, lerp } from "./sunshardWorld.js";

const BEAM_H = 140;
const SKY = [{ t: 0, top: 0x3d9bff, bot: 0xbfe8ff }, { t: 0.3, top: 0x5a9cf5, bot: 0xffe6c4 }, { t: 0.62, top: 0x7a5ab8, bot: 0xffa77a }, { t: 1, top: 0x1a1a4a, bot: 0x6a4a8a }];
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
  function setSky(p) {
    let i = 0;
    while (i < SKY.length - 2 && p > SKY[i + 1].t) i++;
    const a = SKY[i], b = SKY[i + 1], k = clamp((p - a.t) / (b.t - a.t), 0, 1);
    skyU.top.value.setHex(a.top).lerp(_c1.setHex(b.top), k);
    skyU.bot.value.setHex(a.bot).lerp(_c2.setHex(b.bot), k);
    scene.fog.color.copy(skyU.bot.value);
    stars.material.opacity = clamp((p - 0.55) / 0.4, 0, 1);
    hemi.intensity = 0.8 - p * 0.25; sun.intensity = 0.95 - p * 0.4;
    sun.color.setHex(p < 0.5 ? 0xfff1d6 : 0xffc89a);
  }

  // ── materials ──────────────────────────────────────────────────────────────
  const mats = {};
  const M = (c, o) => { const k = c + (o ? JSON.stringify(o) : ""); return mats[k] || (mats[k] = keep(new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 0, specular: 0x000000, ...(o || {}) }))); };
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
    const g = new THREE.Group();
    const top = new THREE.Mesh(keep(new THREE.CylinderGeometry(p.r * 0.97, p.r, 0.5, 10)), M(topC));
    top.position.y = -0.25; top.castShadow = true; top.receiveShadow = true;
    const depth = p.r * 1.35 + 1.2;
    const base = new THREE.Mesh(keep(new THREE.ConeGeometry(p.r, depth, 10)), M(pal.side));
    base.rotation.x = Math.PI; base.position.y = -0.5 - depth / 2; base.receiveShadow = true;
    g.add(top, base);
    if (p.kind === "mover") { const t = new THREE.Mesh(keep(new THREE.TorusGeometry(p.r * 0.86, 0.08, 6, 20)), BM(0x7ff0ff)); t.rotation.x = Math.PI / 2; t.position.y = 0.03; g.add(t); }
    if (p.kind === "crumble") for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(keep(new THREE.BoxGeometry(0.1, 0.04, p.r * 0.9)), M(0x5a3a22)); c.position.set(0, 0.02, 0); c.rotation.y = i * 0.8 + p.rot * 0.3; g.add(c); }
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
  // gems: the level's, plus a pool for the ones slimes drop
  const gemGeo = G("gem", () => new THREE.OctahedronGeometry(0.3, 0)), gemMat = M(0xffd24a, { emissive: 0x9a6a00 });
  const gemMesh = W.gems.map((g) => { const m = new THREE.Mesh(gemGeo, gemMat); m.position.set(g.x, g.y, g.z); world.add(m); return m; });
  const dropMesh = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(gemGeo, gemMat); m.visible = false; world.add(m); return m; });
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
    if (st.atk) h.hero.rotation.y += 26 * dt; else h.hero.rotation.y = st.face;
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
  function cameraFollow(P, yaw, pitch, dt) {
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
    setSky(clamp(P.y / W.topY, 0, 1));
  }

  // ── one frame ──────────────────────────────────────────────────────────────
  function frame({ S, team, remotes = [], ropes = [], yaw, pitch, dt, T }) {
    const P = S.pl;
    // platforms
    for (let i = 0; i < W.plats.length; i++) {
      const m = platMesh[i]; if (!m) continue;
      const q = S.plats[i];
      m.visible = q.state !== 3;
      if (q.state === 0 && m.scale.x < 1) m.scale.setScalar(Math.min(1, m.scale.x + dt * 4));
      m.position.set(q.x + (q.state === 1 ? (Math.random() - 0.5) * 0.12 : 0), q.y, q.z + (q.state === 1 ? (Math.random() - 0.5) * 0.12 : 0));
    }
    // gems
    for (let i = 0; i < W.gems.length; i++) {
      const m = gemMesh[i]; m.visible = !S.gems[i];
      if (m.visible) { m.rotation.y += dt * 2.2; m.position.y = W.gems[i].y + Math.sin(T * 2.4 + i) * 0.12; }
    }
    S.extraGems.forEach((g, k) => { const m = dropMesh[k]; if (!m) return; m.visible = !g.got; if (m.visible) { m.position.set(g.x, g.y + Math.sin(T * 2.4 + k) * 0.12, g.z); m.rotation.y += dt * 2.2; } });
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
    // dust under running feet, wind in the vents
    if (P.onG && P.speed > 3.5 && Math.random() < dt * 14) emit(P.x - P.vx * 0.05, P.y + 0.05, P.z - P.vz * 0.05, (Math.random() - 0.5) * 0.8, 0.6, (Math.random() - 0.5) * 0.8, 0.4, 0xd8d2c0);
    for (const l of W.lifts) if (Math.hypot(P.x - l.x, P.z - l.z) < l.r && P.y > l.y0 - 0.3 && P.y < l.y0 + l.h && Math.random() < dt * 20) emit(l.x + (Math.random() - 0.5) * 2, P.y - 0.4, l.z + (Math.random() - 0.5) * 2, 0, 3, 0, 0.5, 0xcfeaff);
    for (const q of S.plats) if (q.state === 1 && Math.random() < 0.4) emit(q.x + (Math.random() - 0.5) * 2, q.y, q.z + (Math.random() - 0.5) * 2, 0, 1, 0, 0.6, 0xd8b080);
    // you
    pose(H, { x: P.x, y: P.y, z: P.z, face: P.face, speed: P.speed, onG: P.onG, vy: P.vy, vx: P.vx, vz: P.vz, gliding: P.gliding, atk: P.atk > 0, inv: P.inv > 0, sq: P.sq }, dt, T, S.plats);
    // everyone else
    const seen = new Set();
    for (const r of remotes) {
      seen.add(r.id);
      let h = mates.get(r.id);
      if (!h) { h = makeHero(r.col, r.name); mates.set(r.id, h); }
      pose(h, r, dt, T, null);
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
    updParticles(dt); updRings(dt);
    cameraFollow(P, yaw, pitch, dt);
    renderer.render(scene, camera);
  }

  return {
    canvas,
    resize(w, h) { renderer.setSize(Math.max(1, w), Math.max(1, h), false); camera.aspect = Math.max(1, w) / Math.max(1, h); camera.updateProjectionMatrix(); },
    frame,
    fx: { burst, ring, emit, shake(a) { shake = Math.max(shake, a); } },
    dispose() {
      for (const d of disposables) { try { d.dispose(); } catch { /* fine */ } }
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* fine */ }
    },
  };
}
