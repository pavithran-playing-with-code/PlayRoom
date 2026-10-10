// src/components/games/railScene.js
// Rail Runner's world in 3D (three.js r128, loaded only when the game opens),
// in the "Sky Sprint" look: a sky path over floating islands — grass on both
// sides, red rails, lane lines — trees, cacti or neon crystals by theme,
// floating islands drifting past, clouds, and stars at night. The themes
// change as you run: Meadow Isles, Sunset Dunes, Neon Night.
//
// Only drawing: the rules stay in runnerSim.js. Its z runs forward; here the
// runner heads down -z, so a sim distance d sits at z = -d. Lanes are -1/0/1,
// drawn LANE apart. The scenery is cosmetic (Math.random is fine); everything
// you can hit or take comes from the sim, so it's the same for everyone.
//
// createRailScene(THREE) -> { canvas, resize(w, h), frame(state), fx, dispose }
//   frame({ s, t, dt, mates, hearts, crashed })
//     s: the run (runnerSim); mates: [{ id, d, l, y, dn, col }] (together);
//     hearts: [distance] still to grab
export const LANE = 3.2, CL = 36, THEME_M = 900;
export const THEMES = ["Meadow Isles", "Sunset Dunes", "Neon Night"];
const RAW = [
  { top: "#3a9be8", bot: "#cfeeff", fog: "#cfeeff", hs: "#ffffff", hg: "#6a9a5a", hi: 0.95, dc: "#fff3d6", di: 0.85, grass: "#5fd06a", path: "#eadbb8", rail: "#ff6a4d", st: 0 },
  { top: "#e8703a", bot: "#ffd9a0", fog: "#ffcf94", hs: "#fff0d8", hg: "#a07a50", hi: 0.95, dc: "#ffc880", di: 0.9, grass: "#e8c27a", path: "#b88f66", rail: "#5a2f22", st: 0 },
  { top: "#0a0820", bot: "#3a1a7a", fog: "#2a1466", hs: "#8f7aff", hg: "#1a1038", hi: 0.7, dc: "#a58bff", di: 0.55, grass: "#2f2470", path: "#4a3f94", rail: "#37f0ff", st: 1 },
];
const HX = (x) => [1, 3, 5].map((i) => parseInt(x.substr(i, 2), 16) / 255);
const KEYS = ["top", "bot", "fog", "hs", "hg", "dc", "grass", "path", "rail"];
const TH = RAW.map((t) => { const o = { hi: t.hi, di: t.di, st: t.st }; for (const k of KEYS) o[k] = HX(t[k]); return o; });
const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[(Math.random() * a.length) | 0], lerp = (a, b, t) => a + (b - a) * t;
export const themeAt = (d) => Math.floor(Math.max(0, d) / THEME_M) % 3;

// Each stretch of path is baked into a few meshes, one per material: drawn
// piece by piece it was ~40 objects a stretch, ~300 a frame, and a phone
// dropped frames — the run felt like dragging iron.
function bake(T, merge, group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position") g.deleteAttribute(k);
    g.applyMatrix4(o.matrixWorld);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  const out = new T.Group(), geos = [];
  for (const [mat, list] of byMat) {
    const merged = merge(list);
    for (const g of list) g.dispose();
    if (!merged) continue;
    merged.computeVertexNormals();                 // not indexed: a normal per face, so it stays low-poly flat
    geos.push(merged);
    out.add(new T.Mesh(merged, mat));
  }
  out.userData.geos = geos;
  return out;
}

export function createRailScene(T, merge) {
  // a phone: a little less sharp (it's small) and no edge smoothing at high
  // density — 3D that drops frames makes the run feel heavy
  const phone = !!(window.matchMedia && window.matchMedia("(pointer:coarse)").matches);
  const dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.3 : 1.75);
  const renderer = new T.WebGLRenderer({ antialias: !phone || dpr < 1.5, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  const canvas = renderer.domElement;
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(65, 1, 0.1, 1500);
  scene.fog = new T.Fog(0xcfeeff, 60, 250); scene.add(cam);
  const hemi = new T.HemisphereLight(0xffffff, 0x6a9a5a, 0.95), dir = new T.DirectionalLight(0xfff3d6, 0.85);
  scene.add(hemi, dir, dir.target);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const mk = (c, o) => keep(new T.MeshPhongMaterial(Object.assign({ color: c, flatShading: true, shininess: 10, specular: 0x111111 }, o || {})));
  const cvs = (w, h, f) => { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d"), w, h); return keep(new T.CanvasTexture(c)); };
  const G = (g) => keep(g);
  const cur = { ...Object.fromEntries(KEYS.map((k) => [k, [...TH[0][k]]])), hi: 0.95, di: 0.85, st: 0 };

  // ── sky, clouds, stars ──
  // the scenery: Lambert (lit per corner, not per pixel) — cheap on a phone, and flat faces keep it low-poly
  const mkL = (c, o) => keep(new T.MeshLambertMaterial(Object.assign({ color: c }, o || {})));
  const mGrass = mkL(0x5fd06a), mPath = mkL(0xeadbb8), mRail = mkL(0xff6a4d), mLine = mkL(0xffffff, { transparent: true, opacity: 0.5 });
  const skyMat = keep(new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new T.Color() }, bot: { value: new T.Color() } },
    vertexShader: "varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "uniform vec3 top,bot;varying vec3 v;void main(){float h=clamp(normalize(v).y*1.6+.1,0.,1.);gl_FragColor=vec4(mix(bot,top,pow(h,.7)),1.);}",
  }));
  const sky = new T.Mesh(G(new T.SphereGeometry(1000, 16, 12)), skyMat); sky.frustumCulled = false; scene.add(sky);
  const glow = cvs(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.3, "rgba(255,255,255,.75)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const c = new T.Sprite(keep(new T.SpriteMaterial({ map: glow, transparent: true, opacity: 0.85, depthWrite: false, fog: false })));
    c.position.set(rnd(-500, 500), rnd(-60, 120), rnd(-800, -100)); c.scale.set(rnd(140, 300), rnd(50, 90), 1); c.userData.dz = c.position.z;
    clouds.push(c); scene.add(c);
  }
  const stg = G(new T.BufferGeometry()), sa = new Float32Array(600);
  for (let i = 0; i < 200; i++) { const a = rnd(0, 6.28), e = rnd(0.05, 1.4), r = 900; sa[i * 3] = Math.cos(a) * Math.cos(e) * r; sa[i * 3 + 1] = Math.sin(e) * r; sa[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
  stg.setAttribute("position", new T.BufferAttribute(sa, 3));
  const stars = new T.Points(stg, keep(new T.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })));
  stars.frustumCulled = false; scene.add(stars);
  function applyTheme(i, dt) {
    const t = TH[i], k = Math.min(1, dt * 0.7);
    for (const p of KEYS) for (let j = 0; j < 3; j++) cur[p][j] += (t[p][j] - cur[p][j]) * k;
    cur.hi += (t.hi - cur.hi) * k; cur.di += (t.di - cur.di) * k; cur.st += (t.st - cur.st) * k;
    skyMat.uniforms.top.value.setRGB(...cur.top); skyMat.uniforms.bot.value.setRGB(...cur.bot); scene.fog.color.setRGB(...cur.fog);
    hemi.color.setRGB(...cur.hs); hemi.groundColor.setRGB(...cur.hg); hemi.intensity = cur.hi; dir.color.setRGB(...cur.dc); dir.intensity = cur.di;
    mGrass.color.setRGB(...cur.grass); mPath.color.setRGB(...cur.path); mRail.color.setRGB(...cur.rail); stars.material.opacity = cur.st;
    for (const c of clouds) c.material.color.setRGB(lerp(cur.bot[0], 1, 0.5) * (1 - cur.st * 0.7), lerp(cur.bot[1], 1, 0.5) * (1 - cur.st * 0.7), lerp(cur.bot[2], 1, 0.5) * (1 - cur.st * 0.4));
  }

  // ── the path, and what grows by it ──
  const gPath = G(new T.BoxGeometry(LANE * 3 + 0.4, 0.8, CL)), gSide = G(new T.BoxGeometry(14, 2.4, CL)), gRail = G(new T.BoxGeometry(0.35, 0.55, CL)), gLine = G(new T.BoxGeometry(0.1, 0.02, CL));
  const stripe = cvs(64, 64, (g) => { g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#ff4d4d"; for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 16, 64); g.lineTo(i + 80, 0); g.lineTo(i + 64, 0); g.fill(); } });
  const chev = cvs(128, 128, (g) => { g.fillStyle = "#2a1a5a"; g.fillRect(0, 0, 128, 128); g.lineWidth = 14; g.strokeStyle = "#ffc83d"; for (let y = -20; y < 150; y += 44) { g.beginPath(); g.moveTo(10, y + 40); g.lineTo(64, y); g.lineTo(118, y + 40); g.stroke(); } });
  const mStripe = mk(0xffffff, { map: stripe }), mChev = keep(new T.MeshPhongMaterial({ map: chev, flatShading: true })), mWall = mk(0x6a3fd0), mWallTop = mk(0x8a5ff0), mDark = mk(0x2a3140);
  const mGold = mk(0xffc83d, { emissive: 0x8a5a00, shininess: 80, specular: 0xffffcc }), mHeart = mk(0xff5d73, { emissive: 0x8a1030, shininess: 60 });
  const gLow = G(new T.BoxGeometry(2.7, 0.95, 0.9)), gHighBar = G(new T.BoxGeometry(2.9, 0.7, 0.5)), gPost = G(new T.BoxGeometry(0.3, 3.2, 0.3)), gCoin = G(new T.CylinderGeometry(0.42, 0.42, 0.12, 14).rotateX(Math.PI / 2));
  const gTrain = G(new T.BoxGeometry(2.7, 3.4, 1)), gTrainTop = G(new T.BoxGeometry(2.4, 0.25, 1));   // a car: stretched to its length
  const gWallF = G(new T.PlaneGeometry(2.5, 2.3)), gLamp = G(new T.SphereGeometry(0.18, 6, 5)), mLamp = keep(new T.MeshBasicMaterial({ color: 0xff3b3b }));
  const heartShape = new T.Shape(); heartShape.moveTo(0, -0.5); heartShape.bezierCurveTo(-0.9, 0.1, -0.5, 0.75, 0, 0.35); heartShape.bezierCurveTo(0.5, 0.75, 0.9, 0.1, 0, -0.5);
  const gHeart = G(new T.ExtrudeGeometry(heartShape, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }));
  const gTrunk = G(new T.CylinderGeometry(0.25, 0.35, 1.6, 6)), gCone = G(new T.ConeGeometry(1.7, 3.4, 7)), gSph = G(new T.SphereGeometry(1.7, 7, 5)), gRock = G(new T.IcosahedronGeometry(1.2, 0));
  const gCact = G(new T.CylinderGeometry(0.4, 0.45, 3.4, 8)), gArm = G(new T.CylinderGeometry(0.25, 0.25, 1.1, 6)), gCry = G(new T.OctahedronGeometry(1, 0));
  const gIsl = G(new T.ConeGeometry(5, 7, 7).rotateX(Math.PI)), gIslTop = G(new T.CylinderGeometry(5, 5, 0.8, 7));
  const mTrunk = mkL(0x6b4a2e), mPine = [mkL(0x1b7a46), mkL(0x2f9a58), mkL(0x3fae4a)], mCact = mkL(0x4f9a4a), mSand = [mkL(0xc98b52), mkL(0xb5764a)], mRock = mkL(0x8d8e99), mUnder = mkL(0x6a5648);
  const mCry = [0x37f0ff, 0xff4fd8, 0xa58bff].map((c, i) => mkL(c, { emissive: [0x1296b0, 0xa01e8a, 0x5a3fc0][i] }));
  const mesh = (g, m, x, y, z, sx, sy, sz) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); if (sx) o.scale.set(sx, sy || sx, sz || sx); return o; };
  let pine = mPine[0];             // one green a stretch (each extra material is another draw)
  function decor(th, x, z, grp) {
    const s = rnd(0.8, 1.7), r = Math.random();
    if (th === 0) {
      if (r < 0.55) { grp.add(mesh(gTrunk, mTrunk, x, 0.8 * s - 0.2, z, s)); grp.add(mesh(gCone, pine, x, 2.4 * s, z, s)); grp.add(mesh(gCone, pine, x, 3.7 * s, z, s * 0.7)); }
      else if (r < 0.85) { grp.add(mesh(gTrunk, mTrunk, x, 0.8 * s - 0.2, z, s)); grp.add(mesh(gSph, pine, x, 2.8 * s, z, s, s * 0.85, s)); }
      else grp.add(mesh(gRock, mRock, x, 0.4 * s, z, s, s * 0.6, s));
    } else if (th === 1) {
      if (r < 0.55) { const c = new T.Group(); c.add(mesh(gCact, mCact, 0, 1.4, 0, 1), mesh(gArm, mCact, 0.7, 1.9, 0, 1), mesh(gArm, mCact, -0.7, 1.4, 0, 1)); c.position.set(x, -0.2, z); c.scale.setScalar(s); grp.add(c); }
      else grp.add(mesh(gRock, pick(mSand), x, 0.5 * s, z, s * 1.3, s * 0.8, s * 1.1));
    } else if (r < 0.7) grp.add(mesh(gCry, pick(mCry), x, 1.6 * s, z, 0.6 * s, 2 * s, 0.6 * s));
    else grp.add(mesh(gRock, mRock, x, 0.4 * s, z, s, s * 0.6, s));
  }
  let chunks = [], lastChunkZ = CL;
  function mkChunk(zc, th) {
    const g = new T.Group();
    pine = pick(mPine);
    g.add(mesh(gPath, mPath, 0, -0.4, 0), mesh(gSide, mGrass, -LANE * 1.5 - 7.4, -1.45, 0), mesh(gSide, mGrass, LANE * 1.5 + 7.4, -1.45, 0),
      mesh(gRail, mRail, -LANE * 1.5 - 0.1, 0.28, 0), mesh(gRail, mRail, LANE * 1.5 + 0.1, 0.28, 0), mesh(gLine, mLine, -LANE / 2, 0.02, 0), mesh(gLine, mLine, LANE / 2, 0.02, 0));
    for (let i = 0; i < (phone ? 5 : 8); i++) { const z = rnd(-CL / 2, CL / 2); decor(th, -(LANE * 1.5 + rnd(1.8, 12)), z, g); decor(th, LANE * 1.5 + rnd(1.8, 12), z + rnd(-2, 2), g); }
    for (const sd of [-1, 1]) if (Math.random() < 0.7) {
      const I = new T.Group();
      I.add(mesh(gIsl, mUnder, 0, -3.4, 0), mesh(gIslTop, mGrass, 0, 0.2, 0));
      I.position.set(sd * rnd(26, 48), rnd(-7, 2), rnd(-CL / 2, CL / 2)); I.scale.setScalar(rnd(0.6, 1.2));
      if (th === 0) I.add(mesh(gTrunk, mTrunk, 0, 1.4, 0), mesh(gCone, pine, 0, 3.4, 0));
      else if (th === 1) I.add(mesh(gCact, mCact, 0, 2.2, 0, 0.8));
      else I.add(mesh(gCry, pick(mCry), 0, 3, 0, 1, 3, 1));
      g.add(I);
    }
    const baked = bake(T, merge, g);
    baked.position.z = zc;
    scene.add(baked); chunks.push({ g: baked, z: zc });
  }
  const dropChunk = (c) => { scene.remove(c.g); for (const geo of c.g.userData.geos || []) geo.dispose(); };

  // ── the runner (and friends, see-through) ──
  function mkHero(colour, ghost) {
    const g = new T.Group(), inner = new T.Group(); g.add(inner);
    const M = (c, o) => mk(c, Object.assign({ shininess: 40 }, ghost ? { transparent: true, opacity: 0.45, depthWrite: false } : {}, o || {}));
    const body = mesh(G(new T.SphereGeometry(0.5, 16, 12)), M(colour), 0, 0.95, 0, 1, 1.1, 0.95);
    const belly = mesh(G(new T.SphereGeometry(0.36, 12, 10)), M(0xffe2c4), 0, 0.85, -0.22, 0.95, 1, 0.55);
    const visor = mesh(G(new T.SphereGeometry(0.3, 12, 10)), M(0x10203a, { shininess: 120, specular: 0xaabbcc }), 0, 1.22, -0.3, 1.15, 0.75, 0.6);
    const shine = mesh(G(new T.SphereGeometry(0.07, 8, 6)), keep(new T.MeshBasicMaterial({ color: 0xffffff, transparent: !!ghost, opacity: ghost ? 0.5 : 1 })), 0.12, 1.3, -0.55);
    const ant = mesh(G(new T.CylinderGeometry(0.03, 0.03, 0.35, 5)), M(0x2a3140), 0, 1.72, 0), tip = mesh(G(new T.SphereGeometry(0.09, 8, 6)), keep(new T.MeshBasicMaterial({ color: 0xffe14a })), 0, 1.93, 0);
    const pack = mesh(G(new T.BoxGeometry(0.55, 0.65, 0.3)), M(0x37c8e6), 0, 1.0, 0.47);
    inner.add(body, belly, visor, shine, ant, tip, pack);
    const legs = [], arms = [];
    for (const sx of [-1, 1]) {
      const p = new T.Group(); p.position.set(sx * 0.2, 0.5, 0);
      p.add(mesh(G(new T.CylinderGeometry(0.11, 0.11, 0.5, 8)), M(0x10203a), 0, -0.22, 0), mesh(G(new T.SphereGeometry(0.17, 8, 6)), M(0x37c8e6), 0, -0.46, -0.06, 1, 0.6, 1.5));
      inner.add(p); legs.push(p);
      const a = new T.Group(); a.position.set(sx * 0.56, 1.08, 0);
      a.add(mesh(G(new T.CylinderGeometry(0.09, 0.09, 0.45, 8)), M(colour), 0, -0.2, 0), mesh(G(new T.SphereGeometry(0.12, 8, 6)), M(0xffe2c4), 0, -0.45, 0));
      inner.add(a); arms.push(a);
    }
    const sh = new T.Mesh(G(new T.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2)), keep(new T.MeshBasicMaterial({ map: glow, color: 0x000000, transparent: true, opacity: ghost ? 0.2 : 0.45, depthWrite: false })));
    sh.position.y = 0.03;
    scene.add(g, sh);
    return { g, inner, legs, arms, sh, phase: Math.random() * 6 };
  }
  const hero = mkHero(0xff7a3d, false);
  // A jump is drawn higher than the rules' 1.3 m (JUMP_LOOK): next to a 2 m
  // runner the real height looked like a small, slow hop. What you clear or
  // hit is still the rules', unchanged.
  const JUMP_LOOK = 1.6;
  function poseHero(h, { x, y, grounded, sliding, stun, safe, speed, dt, t }) {
    const vy = y * JUMP_LOOK;
    h.g.position.set(x, vy, h.g.position.z); h.sh.position.set(x, 0.05, h.g.position.z); h.sh.scale.setScalar(Math.max(0.3, 1 - vy * 0.12));
    h.phase += dt * (8 + speed * 0.28);
    const k = Math.min(1, dt * 26);
    if (stun) {
      // a crash: a tumble forward, arms out
      h.inner.rotation.x = lerp(h.inner.rotation.x, 0.9 + Math.sin(t * 14) * 0.15, k);
      h.inner.position.y = lerp(h.inner.position.y, 0, k);
      for (const a of h.arms) a.rotation.x = -2.2; for (const l of h.legs) l.rotation.x = 0.4;
    } else {
      h.inner.rotation.x = lerp(h.inner.rotation.x, sliding ? 1.25 : grounded ? 0 : -0.15, k);
      h.inner.position.y = lerp(h.inner.position.y, sliding ? 0.05 : grounded ? Math.abs(Math.sin(h.phase)) * 0.1 : 0, k);
      const a = grounded ? Math.sin(h.phase) * 0.95 : -0.7, b = grounded ? -Math.sin(h.phase) * 0.95 : 0.3;
      h.legs[0].rotation.x = sliding ? -1 : a; h.legs[1].rotation.x = sliding ? -1 : b;
      h.arms[0].rotation.x = grounded ? -a * 0.8 : -2.4; h.arms[1].rotation.x = grounded ? -b * 0.8 : -2.4;
    }
    h.g.visible = safe ? Math.sin(t * 40) > 0 : true;
  }
  const mates = new Map();
  // a name over a friend
  function nameTag(name, colour) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 64;
    const g = c.getContext("2d");
    g.font = "800 34px Nunito, 'Trebuchet MS', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 7; g.strokeStyle = "rgba(16,32,58,.85)"; g.strokeText(name.slice(0, 14), 128, 34);
    g.fillStyle = colour; g.fillText(name.slice(0, 14), 128, 34);
    const sp = new T.Sprite(keep(new T.SpriteMaterial({ map: keep(new T.CanvasTexture(c)), transparent: true, depthWrite: false, fog: false })));
    sp.scale.set(2.6, 0.65, 1); sp.position.y = 2.5;
    return sp;
  }

  // ── particles ──
  const MAXP = 260, pg = G(new T.BufferGeometry()), pp = new Float32Array(MAXP * 3).fill(-999), pc = new Float32Array(MAXP * 3), pd = [];
  for (let i = 0; i < MAXP; i++) pd.push({ l: 0 });
  pg.setAttribute("position", new T.BufferAttribute(pp, 3)); pg.setAttribute("color", new T.BufferAttribute(pc, 3));
  const pts = new T.Points(pg, keep(new T.PointsMaterial({ size: 0.55, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
  pts.frustumCulled = false; scene.add(pts);
  let pi = 0;
  function emit(x, y, z, vx, vy, vz, l, r, g, b) { const q = pd[pi]; pi = (pi + 1) % MAXP; Object.assign(q, { x, y, z, vx, vy, vz, l, m: l, r, g, b }); }
  function updP(dt) {
    for (let i = 0; i < MAXP; i++) {
      const q = pd[i];
      if (q.l > 0) {
        q.l -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vy -= 6 * dt;
        const f = Math.max(0, q.l / q.m);
        pp[i * 3] = q.x; pp[i * 3 + 1] = q.y; pp[i * 3 + 2] = q.z; pc[i * 3] = q.r * f; pc[i * 3 + 1] = q.g * f; pc[i * 3 + 2] = q.b * f;
      } else pp[i * 3 + 1] = -999;
    }
    pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
  }
  const burst = (x, y, z, n, r, g, b, sp) => { for (let i = 0; i < n; i++) emit(x, y, z, rnd(-sp, sp), rnd(0, sp), rnd(-sp, sp), rnd(0.4, 0.9), r, g, b); };

  // ── what's on the course: one mesh per sim item ──
  const items = new Map();       // sim item -> mesh
  function itemMesh(o) {
    const m = new T.Group();
    if (o.kind === "low") m.add(mesh(gLow, mStripe, 0, 0.475, 0));
    else if (o.kind === "high") m.add(mesh(gPost, mDark, -1.4, 1.6, 0), mesh(gPost, mDark, 1.4, 1.6, 0), mesh(gHighBar, mStripe, 0, 1.65, 0));
    else if (o.kind === "train") {
      // a train car: a long purple block, a chevron face toward you, lamps on top
      const len = o.len;
      m.add(mesh(gTrain, mWall, 0, 1.7, -len / 2, 1, 1, len));
      m.add(mesh(gTrainTop, mWallTop, 0, 3.5, -len / 2, 1, 1, len - 0.4));
      const f = new T.Mesh(gWallF, mChev); f.position.set(0, 1.7, 0.02); m.add(f);
      for (const sx of [-0.9, 0.9]) m.add(mesh(gLamp, mLamp, sx, 3.55, -0.2));
    }
    scene.add(m);
    return m;
  }
  const hearts = new Map();      // distance -> mesh
  // all the coins in one draw (one coin shape, placed many times): drawn one
  // by one, the coins alone were ~60 draws a frame
  const MAXC = 160, coinMesh = new T.InstancedMesh(gCoin, mGold, MAXC);
  coinMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); coinMesh.frustumCulled = false; coinMesh.count = 0;
  scene.add(coinMesh);
  const cm = new T.Object3D();
  let coinsWere = new Map();     // coin -> where it was drawn last frame (for the sparkle when it's taken)

  // ── camera ──
  let shake = 0, prevY = 0, camX = 0;
  function resize(w, h) { renderer.setSize(Math.max(1, w), Math.max(1, h), false); cam.aspect = Math.max(1, w) / Math.max(1, h); cam.updateProjectionMatrix(); }

  function frame({ s, t, dt, mates: friends = [], hearts: hs = [], crashed = false }) {
    const pz = -s.z, px = s.x * LANE, py = s.y, grounded = s.y <= 0.001, sliding = s.slideT > 0 && s.y < 0.3;
    const th = themeAt(s.z);
    // the path ahead, and nothing behind
    while (lastChunkZ > pz - 250) { lastChunkZ -= CL; mkChunk(lastChunkZ, themeAt(-lastChunkZ)); }
    for (let i = chunks.length - 1; i >= 0; i--) if (chunks[i].z > pz + CL * 1.5) { dropChunk(chunks[i]); chunks.splice(i, 1); }
    // the course, from the sim
    const seen = new Set(), coinsNow = new Map();
    let nc = 0;
    for (const row of s.rows) for (const o of row.items) {
      if (o.kind === "coin") {
        if (o.got || nc >= MAXC || o.z > s.z + 200 || o.z < s.z - 12) continue;
        const x = o.lane * LANE, y = (o.y || 0.6) + 0.35, z = -o.z;
        cm.position.set(x, y, z); cm.rotation.set(0, t * 5 + o.z, 0); cm.updateMatrix();
        coinMesh.setMatrixAt(nc++, cm.matrix);
        coinsNow.set(o, [x, y, z]);
        continue;
      }
      if (o.hit) { const m = items.get(o); if (m) { burst(m.position.x, 1.2, m.position.z, 22, 1, 0.55, 0.3, 7); scene.remove(m); items.delete(o); } continue; }
      if (o.z > s.z + 200 || (o.z + (o.len || 0)) < s.z - 12) continue;
      let m = items.get(o);
      if (!m) { m = itemMesh(o); items.set(o, m); }
      seen.add(o);
      m.position.set(o.lane * LANE, 0, -o.z);
    }
    for (const [o, m] of items) if (!seen.has(o)) { scene.remove(m); items.delete(o); }
    coinMesh.count = nc; coinMesh.instanceMatrix.needsUpdate = true;
    for (const [o, at] of coinsWere) if (o.got && !coinsNow.has(o)) burst(at[0], at[1], at[2], 4, 1, 0.85, 0.2, 2.5);   // taken: a sparkle
    coinsWere = coinsNow;
    // hearts (together)
    const hseen = new Set();
    for (const at of hs) {
      hseen.add(at);
      let m = hearts.get(at);
      if (!m) { m = new T.Group(); m.add(mesh(gHeart, mHeart, 0, 0, -0.12)); scene.add(m); hearts.set(at, m); }
      m.position.set(0, 1.5 + Math.sin(t * 3 + at) * 0.15, -at); m.rotation.y = t * 2.5;
    }
    for (const [at, m] of hearts) if (!hseen.has(at)) { burst(m.position.x, m.position.y, m.position.z, 14, 1, 0.4, 0.5, 5); scene.remove(m); hearts.delete(at); }
    // you
    hero.g.position.z = pz;
    poseHero(hero, { x: px, y: py, grounded, sliding, stun: s.stunT > 0, safe: s.safeT > 0 && s.stunT <= 0, speed: s.speed, dt, t });
    hero.g.rotation.z = s.stunT > 0 ? 0 : -(s.lane * LANE - px) * 0.05;
    if (grounded && s.stunT <= 0 && Math.random() < dt * 14) emit(px + rnd(-0.3, 0.3), 0.1, pz + 0.4, rnd(-1, 1), rnd(0.5, 1.8), rnd(1, 3), 0.45, 0.8, 0.75, 0.6);
    if (prevY > 0.05 && grounded) burst(px, 0.1, pz, 6, 0.8, 0.8, 0.7, 2.5);
    prevY = py;
    if (crashed) { shake = 0.8; burst(px, 1, pz, 26, 1, 0.55, 0.2, 8); }
    // friends, see-through, beside you
    const fseen = new Set();
    for (const f of friends) {
      fseen.add(f.id);
      let h = mates.get(f.id);
      if (!h) { h = mkHero(new T.Color(f.col || "#4cc9f0").getHex(), true); h.g.add(nameTag(f.name || "Friend", f.col || "#4cc9f0")); mates.set(f.id, h); }
      h.g.position.z = -f.d;
      poseHero(h, { x: f.l * LANE, y: f.y, grounded: f.y <= 0.01, sliding: false, stun: !!f.dn, safe: false, speed: f.v || s.speed, dt, t });
    }
    for (const [id, h] of mates) if (!fseen.has(id)) { scene.remove(h.g, h.sh); mates.delete(id); }
    // the world around
    updP(dt);
    shake = Math.max(0, shake - dt * 1.6);
    applyTheme(th, dt);
    for (const c of clouds) { c.position.x += dt * 3; if (c.position.x > 600) c.position.x = -600; c.position.z = pz + c.userData.dz; }
    const sx = (Math.random() * 2 - 1) * shake * 0.5, sy = (Math.random() * 2 - 1) * shake * 0.4;
    // A soft camera. Locked to the runner, the whole world lurched sideways
    // at every lane change and rose with every jump — heavy. Now it drifts a
    // little after you, so you see the runner glide across a steady path.
    camX += (px * 0.3 - camX) * Math.min(1, dt * 5);
    cam.position.set(camX + sx, 4.3 + sy, pz + 7.4);
    cam.lookAt(camX * 0.8, 1.5, pz - 12);
    const portrait = cam.aspect < 1;
    const fov = (portrait ? 78 : 64) + Math.max(0, Math.min(1, (s.speed - 14) / 16)) * 7;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
    sky.position.copy(cam.position); stars.position.copy(cam.position);
    dir.position.set(px - 20, 50, pz + 30); dir.target.position.set(px, 0, pz); dir.target.updateMatrixWorld();
    renderer.render(scene, cam);
  }

  // the path is laid ahead before the first frame
  for (let z = CL; z > -300; z -= CL) mkChunk(z, 0);
  lastChunkZ = -300 + CL;

  return {
    canvas, resize, frame,
    fx: { burst, shake(a) { shake = Math.max(shake, a); } },
    dispose() {
      for (const d of disposables) { try { d.dispose(); } catch { /* fine */ } }
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* fine */ }
    },
  };
}
