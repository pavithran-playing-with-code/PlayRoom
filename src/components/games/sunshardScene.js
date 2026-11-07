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
import { ZONES, PAL0, TAU, clamp, lerp, LOOKS, windAt, blinkLeft } from "./sunshardWorld.js";

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
];
// an island's look (LOOKS) laid over the sky zones and the ground colours
const mixHex = (a, b, k) => {
  const m = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
};
function lookThemes(L) {
  if (!L || L.sky === undefined) return THEMES;
  return THEMES.map((t) => ({
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
  // cartoon light in three soft steps — the PlayRoom look (toyKit's)
  const ramp = keep(new THREE.DataTexture(new Uint8Array([100, 100, 100, 172, 172, 172, 240, 240, 240]), 3, 1, THREE.RGBFormat));
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
  const TOON_OK = ["side", "transparent", "opacity", "emissive", "map", "vertexColors", "depthWrite", "blending", "fog"];
  const toonOpts = (o) => { const q = {}; for (const k of TOON_OK) if (o && o[k] !== undefined) q[k] = o[k]; return q; };
  const M = (c0, o) => { const c = tint ? mixHex(c0, LOOK.ground, LOOK.groundK) : c0; const k = c + (o ? JSON.stringify(o) : ""); return mats[k] || (mats[k] = keep(new THREE.MeshToonMaterial({ color: c, gradientMap: ramp, ...toonOpts(o) }))); };
  // an ink outline: the same shape a little bigger, drawn inside out
  const INKM = keep(new THREE.MeshBasicMaterial({ color: 0x2e2140, side: THREE.BackSide }));
  const inked = (m, k = 1.08) => { const o = new THREE.Mesh(m.geometry, INKM); o.scale.setScalar(k); m.add(o); return m; };
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
    if (p.kind === "pillar" || p.kind === "trunk") return null;
    const pal = p.zone < 0 ? PAL0 : ZONES[p.zone].pal;
    let topC = pal.top;
    if (p.kind === "crumble") topC = pal.crum;
    if (p.kind === "mover") topC = 0x5e8fd8;
    if (p.kind === "lift") topC = 0xb9b4c4;
    if (p.kind === "blink") topC = 0xb48cff;
    const g = new THREE.Group();
    const top = new THREE.Mesh(keep(new THREE.CylinderGeometry(p.r * 0.97, p.r, 0.5, 10)), M(topC));
    top.position.y = -0.25; top.castShadow = true; top.receiveShadow = true;
    const depth = W.tower ? p.r * 0.75 + 0.6 : p.r * 1.35 + 1.2;   // a tree's stones: shallow, so you can see up past them
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
  // ── the Sky Tree (a tower climb): the trunk, a vine winding up it, boughs
  // and leaves at each band, and the Sun Crown's beacon on top ───────────────
  let crownFx = null;
  if (W.trunk) {
    const Tr = W.trunk, h = Tr.y1 - Tr.y0, BARK = 0x8a5a3a;
    // bark: dark grooves running up, drawn once on a canvas
    const bc = document.createElement("canvas"); bc.width = 128; bc.height = 256;
    const bx = bc.getContext("2d");
    bx.fillStyle = "#b07a50"; bx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 22; i++) {
      const x0 = (i * 37) % 128, w = 3 + (i % 3) * 2;
      bx.strokeStyle = i % 2 ? "rgba(70,40,25,.55)" : "rgba(90,55,35,.4)"; bx.lineWidth = w;
      bx.beginPath(); bx.moveTo(x0, 0);
      for (let y = 0; y <= 256; y += 32) bx.lineTo(x0 + Math.sin(y * 0.05 + i) * 6, y);
      bx.stroke();
    }
    const btex = keep(new THREE.CanvasTexture(bc));
    btex.wrapS = btex.wrapT = THREE.RepeatWrapping; btex.repeat.set(4, Math.max(1, h / 14));
    const trunk = new THREE.Mesh(keep(new THREE.CylinderGeometry(Tr.r * 0.92, Tr.r * 1.08, h, 28, 1, true)), keep(new THREE.MeshToonMaterial({ color: 0xffffff, map: btex, gradientMap: ramp })));
    trunk.position.set(Tr.x, Tr.y0 + h / 2, Tr.z); trunk.castShadow = true; trunk.receiveShadow = true;
    inked(trunk, 1.03);
    world.add(trunk);
    // the roots, flaring out over the meadow
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.4, root = new THREE.Mesh(G("root", () => new THREE.ConeGeometry(1.3, 5.5, 7)), M(BARK));
      root.position.set(Tr.x + Math.cos(a) * (Tr.r + 0.6), 0.6, Tr.z + Math.sin(a) * (Tr.r + 0.6));
      root.rotation.set(Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15);
      inked(root, 1.06); world.add(root);
    }
    // a vine winding up the trunk, with leaves along it
    const pts = [];
    for (let y = Tr.y0 + 1; y < Tr.y1; y += 2) { const a = y * 0.11; pts.push(new THREE.Vector3(Tr.x + Math.cos(a) * (Tr.r * 0.97), y, Tr.z + Math.sin(a) * (Tr.r * 0.97))); }
    if (pts.length > 3) {
      const vine = new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 4, 0.28, 6, false)), M(0x3f9a4a));
      world.add(vine);
      const leafG = G("vleaf", () => new THREE.SphereGeometry(0.55, 8, 6));
      for (let k = 2; k < pts.length; k += 2) { const q = pts[k], lf = new THREE.Mesh(leafG, M(k % 4 ? 0x5ec85a : 0x7ad86a)); lf.position.copy(q); lf.position.y += 0.4; lf.scale.set(1, 0.5, 1.4); lf.rotation.y = k; world.add(lf); }
    }
    // boughs: a branch out of the trunk with a ball of leaves, now and then, in the band's colour
    const LEAF = [0x5ec85a, 0xe0b04a, 0xbfe6f0, 0xd4583a, 0xffe08a];
    for (let y = 12; y < Tr.y1 - 8; y += 11) {
      const a = y * 1.7, b = Math.min(4, Math.floor(y / 38));
      const br = new THREE.Mesh(G("bough", () => new THREE.CylinderGeometry(0.5, 0.9, 5, 8)), M(BARK));
      br.position.set(Tr.x + Math.cos(a) * (Tr.r + 1.6), y, Tr.z + Math.sin(a) * (Tr.r + 1.6));
      br.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); inked(br, 1.08); world.add(br);
      const ball = new THREE.Mesh(G("leafball", () => new THREE.IcosahedronGeometry(2.2, 1)), M(LEAF[b]));
      ball.position.set(Tr.x + Math.cos(a) * (Tr.r + 3.6), y + 1.6, Tr.z + Math.sin(a) * (Tr.r + 3.6)); ball.castShadow = true;
      inked(ball, 1.05); world.add(ball);
    }
    // the canopy under the Crown: a ring of big leaf balls
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, ball = new THREE.Mesh(G("canopy", () => new THREE.IcosahedronGeometry(3.4, 1)), M(i % 2 ? 0x6fd06a : 0x58b85a));
      ball.position.set(Tr.x + Math.cos(a) * 7.2, Tr.y1 - 3.2, Tr.z + Math.sin(a) * 7.2); ball.scale.y = 0.7;
      inked(ball, 1.04); world.add(ball);
    }
    // the Crown's beacon: a golden sun over it and a beam of light, seen from all the way down
    if (W.crown) {
      const C = W.crown, sunG = new THREE.Group();
      const disc = new THREE.Mesh(G("crownSun", () => new THREE.IcosahedronGeometry(1.6, 2)), BM(0xffd84a));
      const halo = new THREE.Mesh(G("crownHalo", () => new THREE.SphereGeometry(2.8, 16, 12)), BM(0xffe9a0, { ...ADD, opacity: 0.35 }));
      const ringA = new THREE.Mesh(G("crownRing", () => new THREE.TorusGeometry(3.4, 0.14, 6, 40)), BM(0xffd84a));
      sunG.add(disc, halo, ringA);
      sunG.position.set(C.x, C.y + 6, C.z);
      world.add(sunG);
      const beam = new THREE.Mesh(G("crownBeam", () => new THREE.CylinderGeometry(1.2, 2.6, 120, 16, 1, true)), BM(0xffe9a0, { ...ADD, opacity: 0.16, side: THREE.DoubleSide, fog: false }));
      beam.position.set(C.x, C.y + 66, C.z); world.add(beam);
      crownFx = { sunG, ringA, halo };
    }
  }

  // ── the Gloom: a sea of storm cloud rising from below (a tower climb) ─────
  // Two layers of slow-churning cloud and the odd flash of lightning inside.
  // Drawn only while frame() is given its height.
  const gloomU = { t: { value: 0 }, flash: { value: 0 } };
  const gloomMat = (dark, alpha) => keep(new THREE.ShaderMaterial({
    uniforms: { ...gloomU, dark: { value: dark }, alpha: { value: alpha } }, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: "varying vec2 vp;varying float vd;void main(){vec4 w=modelMatrix*vec4(position,1.);vp=w.xz;vec4 mv=viewMatrix*w;vd=-mv.z;gl_Position=projectionMatrix*mv;}",
    fragmentShader: [
      "uniform float t;uniform float flash;uniform float dark;uniform float alpha;varying vec2 vp;varying float vd;",
      "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
      "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}",
      "float fb(vec2 p){float v=0.,a=.5;for(int k=0;k<4;k++){v+=a*n(p);p*=2.03;a*=.5;}return v;}",
      "void main(){vec2 p=vp*.045;float c=fb(p+vec2(t*.05,t*.03)+fb(p*1.7-t*.04));",
      "vec3 deep=vec3(.13,.07,.22),mid=vec3(.36,.2,.52),hi=vec3(.72,.55,.9);",
      "vec3 col=mix(deep,mid,smoothstep(.3,.7,c));col=mix(col,hi,smoothstep(.62,.85,c)*.6);",
      "col*=1.-dark*.45;col+=vec3(.75,.7,1.)*flash*smoothstep(.35,.8,c);",
      "float fade=1.-smoothstep(220.,520.,vd);gl_FragColor=vec4(col,alpha*fade);}",
    ].join(""),
  }));
  const gloomTop = new THREE.Mesh(keep(new THREE.CircleGeometry(600, 48)), gloomMat(0, 0.94));
  const gloomLow = new THREE.Mesh(keep(new THREE.CircleGeometry(600, 48)), gloomMat(1, 1));
  gloomTop.rotation.x = gloomLow.rotation.x = -Math.PI / 2;
  gloomTop.renderOrder = 2; gloomLow.renderOrder = 1;
  gloomTop.visible = gloomLow.visible = false;
  scene.add(gloomTop, gloomLow);
  let flashT = 0, nextFlash = 2;
  function drawGloom(gy, P, T, dt) {
    const on = gy !== undefined && gy !== null;
    gloomTop.visible = gloomLow.visible = on;
    if (!on) return;
    gloomU.t.value = T;
    gloomTop.position.set(P.x, gy + Math.sin(T * 0.6) * 0.25, P.z);
    gloomLow.position.set(P.x, gy - 2.2, P.z);
    // lightning: a flash in the cloud now and then, more often when it's close
    const close = clamp(1 - (P.y - gy) / 25, 0, 1);
    nextFlash -= dt * (1 + close * 2);
    if (nextFlash <= 0) { flashT = 0.35; nextFlash = 1.5 + Math.random() * 4; if (close > 0.3) shake = Math.max(shake, 0.12 * close); }
    flashT = Math.max(0, flashT - dt);
    gloomU.flash.value = flashT > 0 ? (Math.sin(flashT * 60) > 0 ? 1 : 0.35) * (flashT / 0.35) : 0;
    // close: purple sparks rising round you
    if (close > 0 && Math.random() < dt * 30 * close) { const a = Math.random() * TAU, r = 1 + Math.random() * 7; emit(P.x + Math.cos(a) * r, gy + 0.3, P.z + Math.sin(a) * r, 0, 2 + Math.random() * 3, 0, 1.2, 0xb48cff); }
  }

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
  // A tree-climber kid: a woolly beanie in your colour with a fat pom-pom and
  // round goggles pushed up on it, a big round face, a puffy quilted jacket in
  // your colour, a coil of rope over one shoulder and another on the back (the
  // camera is behind, so the back carries the look), mittens, dark trousers and
  // chunky boots. A big leaf opens overhead to glide. Ink outlines, like every
  // PlayRoom character. Faces +z.
  function makeHero(color, name) {
    const hero = new THREE.Group();
    const bodyG = new THREE.Group(); hero.add(bodyG);
    const SKIN = 0xffd9b8, ROPE = 0xe0a95a;
    const dark = new THREE.Color(color).multiplyScalar(0.72).getHex(), light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55).getHex();
    const S = (k, r, ws = 16, hs = 12) => G(k, () => new THREE.SphereGeometry(r, ws, hs));
    const part = (geo, mat, x, y, z, sx = 1, sy = sx, sz = sx, line = 1.08, to = bodyG) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); if (line) inked(m, line); to.add(m); return m; };
    // trousers and the puffy jacket: quilted rings, a zip, a fat collar
    part(G("kpants", () => new THREE.CylinderGeometry(0.27, 0.3, 0.26, 14)), M(0x3c4a7a), 0, 0.3, 0, 1, 1, 1, 1.06);
    part(S("kcoat", 0.4), M(color), 0, 0.64, 0, 1, 0.98, 0.92);
    for (const y of [0.52, 0.74]) part(G("kquilt", () => new THREE.TorusGeometry(0.385, 0.035, 6, 20)), M(dark), 0, y, 0, 1, 1, 0.92, 0).rotation.x = Math.PI / 2;
    part(G("kzip", () => new THREE.BoxGeometry(0.05, 0.5, 0.03)), M(light), 0, 0.62, 0.37, 1, 1, 1, 0);
    part(G("kcollar", () => new THREE.TorusGeometry(0.22, 0.08, 8, 16)), M(light), 0, 0.93, 0, 1, 1, 1, 1.1).rotation.x = Math.PI / 2;
    // a rope over one shoulder, across the chest, and a coil on the back
    const sash = new THREE.Group(); sash.position.set(0, 0.66, 0); sash.rotation.z = 0.62; bodyG.add(sash);
    part(G("ksash", () => new THREE.TorusGeometry(0.42, 0.04, 6, 24)), M(ROPE), 0, 0, 0, 1, 1, 0.95, 0, sash).rotation.y = Math.PI / 2;
    for (let i = 0; i < 3; i++) part(G("kcoil", () => new THREE.TorusGeometry(0.2, 0.045, 6, 18)), M(ROPE), 0.02 * (i - 1), 0.68 + i * 0.03, -0.4 - i * 0.03, 1, 1, 1, i === 1 ? 1.1 : 0);
    part(G("kclip", () => new THREE.TorusGeometry(0.06, 0.018, 5, 10)), M(0xc0c8d8), 0.22, 0.48, 0.3, 1, 1.5, 1, 0);
    // the head: big and round, a fringe peeking out, the face toward +z
    part(S("khead", 0.4), M(SKIN), 0, 1.24, 0.02);
    for (const x of [-0.18, -0.06, 0.07, 0.19]) part(S("kfringe", 0.09, 8, 6), M(0x6b3e26), x, 1.42, 0.3, 1, 0.8, 0.7, 0);
    const eyes = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(S("xeye", 0.1, 12, 10), M(0xffffff)); e.position.set(sx * 0.15, 1.24, 0.35); inked(e, 1.14);
      const q = new THREE.Mesh(S("xpupil", 0.06, 10, 8), M(0x1a1a2a)); q.position.set(0, -0.01, 0.065); e.add(q);
      const gl = new THREE.Mesh(S("xglint", 0.02, 6, 5), M(0xffffff)); gl.position.set(0.022, 0.03, 0.11); e.add(gl);
      bodyG.add(e); eyes.push(e);
      part(S("xcheek", 0.065, 8, 6), M(0xff9ab0), sx * 0.26, 1.1, 0.32, 1, 0.6, 0.5, 0);
    }
    part(G("xsmile", () => new THREE.TorusGeometry(0.065, 0.018, 6, 12, Math.PI)), M(0x8a3a2a), 0, 1.1, 0.385, 1, 1, 1, 0).rotation.z = Math.PI;
    // the beanie: a woolly dome in your colour, a turned-up cuff, a fat pom-pom
    part(G("kbeanie", () => new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), M(color), 0, 1.4, 0.0, 1, 0.95, 1);
    part(G("kcuff", () => new THREE.CylinderGeometry(0.43, 0.43, 0.14, 18)), M(light), 0, 1.44, 0, 1, 1, 1, 1.05);
    part(S("kpom", 0.14, 10, 8), M(0xffffff), 0, 1.86, -0.04, 1, 1, 1, 1.1);
    // round goggles pushed up on the beanie
    part(G("kstrap", () => new THREE.TorusGeometry(0.43, 0.025, 5, 24)), M(0x2e2140), 0, 1.58, 0, 1, 1, 1, 0).rotation.x = Math.PI / 2 - 0.25;
    for (const sx of [-1, 1]) {
      const g = part(G("kgog", () => new THREE.CylinderGeometry(0.1, 0.1, 0.07, 14)), M(0x9fe6ff), sx * 0.13, 1.6, 0.36, 1, 1, 1, 1.18);
      g.rotation.x = Math.PI / 2 - 0.45;
    }
    const feet = [-1, 1].map((sx) => part(S("kboot", 0.16, 10, 8), M(0x6b4630), sx * 0.16, 0.12, 0.05, 1, 0.75, 1.4, 1.12));
    const arms = [-1, 1].map((sx) => part(S("kmitt", 0.12, 10, 8), M(light), sx * 0.46, 0.62, 0, 1, 1, 1, 1.12));
    // the glider: a big green leaf held overhead
    const glider = new THREE.Group(); glider.position.y = 2.25; glider.scale.setScalar(0.01); hero.add(glider);
    part(G("kleaf", () => new THREE.SphereGeometry(1, 14, 8)), M(0x5ec85a), 0, 0, 0, 1.25, 0.07, 0.62, 1.04, glider);
    part(G("kvein", () => new THREE.BoxGeometry(2.3, 0.05, 0.05)), M(0x3f9a4a), 0, 0.06, 0, 1, 1, 1, 0, glider);
    part(G("kstem", () => new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6)), M(0x3f9a4a), 0.25, -0.45, 0, 1, 1, 1, 0, glider);
    const scarf = [];
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
      tag.scale.set(2.6, 0.65, 1); tag.position.y = 2.35; hero.add(tag);
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
      h.arms[i].position.y = 0.62 + (air ? 0.25 : Math.sin(h.phase + (i ? Math.PI : 0)) * 0.05 * run);
      h.arms[i].position.x = s * (0.46 + (air ? 0.12 : 0));
      h.arms[i].position.z = air ? 0 : Math.sin(h.phase + (i ? 0 : Math.PI)) * 0.2 * run;
    }
    h.blink -= dt; if (h.blink < -0.12) h.blink = 2 + Math.random() * 3;
    const bl = h.blink < 0 ? 0.1 : 1; h.eyes.forEach((e) => { e.scale.y = bl; });
    h.gl += ((st.gliding ? 1 : 0) - h.gl) * Math.min(1, dt * 12);
    h.glider.scale.setScalar(Math.max(0.01, h.gl)); h.glider.rotation.y += dt * 2;
    h.bodyG.visible = !(st.inv && Math.floor(T * 18) % 2 === 0);
    // the scarf trails behind
    const f = st.face, ax = st.x - Math.sin(f) * 0.12, ay = st.y + 0.84, az = st.z - Math.cos(f) * 0.12;
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
    // looking up (pitch below 0): the camera swings further out behind you
    // and looks up past you — up the tree, at the stones to come
    const up = Math.max(0, -pitch);
    const pe = lerp(Math.max(pitch, 0), Math.max(pitch, 0.8), tmpK), cp = Math.cos(pe), dist = lerp(8.5 * (P.gliding ? 1.15 : 1) * (1 + up * 0.9), 6.5, tmpK);
    const tx = P.x, ty = P.y + 1.3, tz = P.z;
    let wx = tx + Math.sin(yaw) * cp * dist, wy = ty + Math.sin(pe) * dist + 0.3 + up * 1.5, wz = tz + Math.cos(yaw) * cp * dist;
    // the Sky Tree between you and the camera: the camera comes in, in front of the bark
    if (W.trunk && ty < W.trunk.y1 + 1) {
      const Tr = W.trunk, R = Tr.r + 0.9, ox = tx - Tr.x, oz = tz - Tr.z, dx = wx - tx, dz = wz - tz;
      const a = dx * dx + dz * dz, b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - R * R, disc = b * b - 4 * a * c;
      if (a > 1e-6 && disc > 0) {
        const s = (-b - Math.sqrt(disc)) / (2 * a);
        if (s > 0 && s < 1) { const k = Math.max(0.15, s); wx = tx + dx * k; wz = tz + dz * k; wy = ty + (wy - ty) * Math.max(k, 0.6); }
      }
    }
    if (!camInit) { camera.position.set(wx, wy, wz); camInit = true; }
    const k = 1 - Math.exp(-dt * 10);
    camera.position.x += (wx - camera.position.x) * k; camera.position.y += (wy - camera.position.y) * k; camera.position.z += (wz - camera.position.z) * k;
    shake = Math.max(0, shake - dt * 1.6);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.5; camera.position.y += (Math.random() - 0.5) * shake * 0.5; }
    camera.lookAt(tx, ty + up * 14, tz);
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
  function frame({ S, team, remotes = [], ropes = [], yaw, pitch, dt, T, gloom }) {
    const P = S.pl;
    drawGloom(gloom, P, T, dt);
    if (crownFx) { crownFx.sunG.rotation.y += dt * 0.6; crownFx.ringA.rotation.x = Math.sin(T * 0.7) * 0.5 + 1.2; crownFx.halo.scale.setScalar(1 + Math.sin(T * 2.2) * 0.08); }
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
