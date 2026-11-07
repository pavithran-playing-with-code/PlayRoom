// src/components/games/railScene.js
// Rail Runner's world in 3D (three.js r128, loaded only when the game opens),
// in the "Sky Sprint" look: a railway over floating islands — a gravel bed
// with a real track in each lane (sleepers and steel rails), kerbs and lamp
// posts along it, grass on both sides — trees, cacti or neon crystals by
// theme, floating islands drifting past, clouds, a sun (a moon at night) and
// stars. The themes change as you run: Meadow Isles, Sunset Dunes, Neon Night.
//
// Only drawing: the rules stay in runnerSim.js. Its z runs forward; here the
// runner heads down -z, so a sim distance d sits at z = -d. Lanes are -1/0/1,
// drawn LANE apart. The scenery is cosmetic (Math.random is fine); everything
// you can hit or take comes from the sim, so it's the same for everyone.
//
// createRailScene(THREE) -> { canvas, resize(w, h), frame(state), fx, dispose }
//   frame({ s, t, dt, crashed })   s: the run (runnerSim)
export const LANE = 3.2, CL = 36, THEME_M = 900;
export const THEMES = ["Meadow Isles", "Sunset Dunes", "Neon Night"];
const RAW = [
  { top: "#2f8fe6", bot: "#d4f0ff", fog: "#cfeeff", hs: "#ffffff", hg: "#6a9a5a", hi: 0.9, dc: "#fff3d6", di: 0.9, grass: "#58c765", path: "#6c675f", rail: "#ff6a4d", slp: "#7a5536", steel: "#d8dde6", sun: "#fff4c4", sz: 1, st: 0 },
  { top: "#d9582e", bot: "#ffd49a", fog: "#ffcf94", hs: "#fff0d8", hg: "#a07a50", hi: 0.9, dc: "#ffc070", di: 0.95, grass: "#e3b96c", path: "#8a6446", rail: "#6a3424", slp: "#5a3a22", steel: "#f0caa0", sun: "#ffb46a", sz: 1.6, st: 0 },
  { top: "#0a0820", bot: "#3a1a7a", fog: "#2a1466", hs: "#8f7aff", hg: "#1a1038", hi: 0.7, dc: "#a58bff", di: 0.55, grass: "#2f2470", path: "#2e2758", rail: "#37f0ff", slp: "#1c1640", steel: "#5ff4ff", sun: "#dcd4ff", sz: 0.6, st: 1 },
];
const HX = (x) => [1, 3, 5].map((i) => parseInt(x.substr(i, 2), 16) / 255);
const KEYS = ["top", "bot", "fog", "hs", "hg", "dc", "grass", "path", "rail", "slp", "steel", "sun"];
const TH = RAW.map((t) => { const o = { hi: t.hi, di: t.di, st: t.st, sz: t.sz }; for (const k of KEYS) o[k] = HX(t[k]); return o; });
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
  // cartoon light, in three soft steps — the PlayRoom look (toyKit's), built
  // here on the three.js this scene is handed
  const ramp = keep(new T.DataTexture(new Uint8Array([96, 96, 96, 170, 170, 170, 238, 238, 238]), 3, 1, T.RGBFormat));
  ramp.minFilter = ramp.magFilter = T.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
  const TOON_KEYS = ["emissive", "map", "transparent", "opacity", "side"];
  const toonOf = (c, o) => { const q = { color: c, gradientMap: ramp }; for (const k of TOON_KEYS) if (o && o[k] !== undefined) q[k] = o[k]; return keep(new T.MeshToonMaterial(q)); };
  const mk = (c, o) => toonOf(c, o);
  const INK = keep(new T.MeshBasicMaterial({ color: 0x2e2140, side: T.BackSide }));
  // an ink outline: the same shape a little bigger, drawn inside out
  const ink = (m, k = 1.07) => { const o = new T.Mesh(m.geometry, INK); o.position.copy(m.position); o.rotation.copy(m.rotation); o.scale.copy(m.scale).multiplyScalar(k); return o; };
  const cvs = (w, h, f) => { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d"), w, h); return keep(new T.CanvasTexture(c)); };
  const G = (g) => keep(g);
  const cur = { ...Object.fromEntries(KEYS.map((k) => [k, [...TH[0][k]]])), hi: TH[0].hi, di: TH[0].di, st: 0, sz: 1 };

  // ── sky, clouds, stars ──
  // the scenery: Lambert (lit per corner, not per pixel) — cheap on a phone, and flat faces keep it low-poly
  const mkL = (c, o) => toonOf(c, o);
  const mGrass = mkL(0x58c765), mPath = mkL(0x6c675f), mRail = mkL(0xff6a4d), mSlp = mkL(0x7a5536);
  const mSteel = mk(0xd8dde6, { shininess: 90, specular: 0xffffff }), mPole = mkL(0x3a4150), mLampHd = mkL(0xfff2b0, { emissive: 0xc8a040 });
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
  // the sun (by night a moon): a glow far ahead, beside the path
  const sun = new T.Sprite(keep(new T.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, fog: false })));
  scene.add(sun);
  function applyTheme(i, dt) {
    const t = TH[i], k = Math.min(1, dt * 0.7);
    for (const p of KEYS) for (let j = 0; j < 3; j++) cur[p][j] += (t[p][j] - cur[p][j]) * k;
    cur.hi += (t.hi - cur.hi) * k; cur.di += (t.di - cur.di) * k; cur.st += (t.st - cur.st) * k; cur.sz += (t.sz - cur.sz) * k;
    skyMat.uniforms.top.value.setRGB(...cur.top); skyMat.uniforms.bot.value.setRGB(...cur.bot); scene.fog.color.setRGB(...cur.fog);
    hemi.color.setRGB(...cur.hs); hemi.groundColor.setRGB(...cur.hg); hemi.intensity = cur.hi; dir.color.setRGB(...cur.dc); dir.intensity = cur.di;
    mGrass.color.setRGB(...cur.grass); mPath.color.setRGB(...cur.path); mRail.color.setRGB(...cur.rail); mSlp.color.setRGB(...cur.slp); stars.material.opacity = cur.st;
    mSteel.color.setRGB(...cur.steel); mSteel.emissive.setRGB(cur.steel[0] * cur.st * 0.5, cur.steel[1] * cur.st * 0.5, cur.steel[2] * cur.st * 0.5);
    sun.material.color.setRGB(...cur.sun); sun.scale.setScalar(150 * cur.sz);
    for (const c of clouds) c.material.color.setRGB(lerp(cur.bot[0], 1, 0.5) * (1 - cur.st * 0.7), lerp(cur.bot[1], 1, 0.5) * (1 - cur.st * 0.7), lerp(cur.bot[2], 1, 0.5) * (1 - cur.st * 0.4));
  }

  // ── the path, and what grows by it ──
  const gPath = G(new T.BoxGeometry(LANE * 3 + 0.4, 0.8, CL)), gSide = G(new T.BoxGeometry(14, 2.4, CL)), gRail = G(new T.BoxGeometry(0.35, 0.55, CL));
  // a track in each lane: sleepers every SLP m, two steel rails; lamp posts along the kerbs
  const SLP = 1.5, gSleeper = G(new T.BoxGeometry(2.2, 0.12, 0.42)), gSteel = G(new T.BoxGeometry(0.13, 0.16, CL));
  const gPole = G(new T.CylinderGeometry(0.09, 0.12, 4.4, 6)), gArmP = G(new T.BoxGeometry(1.1, 0.1, 0.1)), gLampHd = G(new T.BoxGeometry(0.5, 0.16, 0.3));
  const stripe = cvs(64, 64, (g) => { g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#ff4d4d"; for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 16, 64); g.lineTo(i + 80, 0); g.lineTo(i + 64, 0); g.fill(); } });
  const mStripe = mk(0xffffff, { map: stripe }), mDark = mk(0x2a3140);
  const mGold = mk(0xffcc33, { emissive: 0xa86e00, shininess: 100, specular: 0xffffdd });
  // the train cars: a few liveries, each a body, a lighter roof, a stripe, a
  // band of windows down both sides and a painted face (windscreen, a
  // destination board, headlights) toward you
  const LIVERY = [[0xe8433a, 0xffffff, "#e8433a", "#ffffff"], [0x2f6fe0, 0xffd23d, "#2f6fe0", "#ffd23d"], [0x18a37a, 0xffffff, "#18a37a", "#ffffff"], [0x7a4fe0, 0x37f0ff, "#7a4fe0", "#37f0ff"]];
  const mGlass = mk(0x1a2433, { shininess: 120, specular: 0x88aacc }), mUnderT = mk(0x22262e), mHead = keep(new T.MeshBasicMaterial({ color: 0xfff6c0 }));
  const liveries = LIVERY.map(([body, stripeC, css, cssStripe]) => ({
    body: mk(body, { shininess: 40, specular: 0x333333 }),
    roof: mk(new T.Color(body).lerp(new T.Color(0xffffff), 0.35).getHex()),
    stripe: mk(stripeC),
    face: keep(new T.MeshPhongMaterial({ flatShading: true, map: cvs(256, 288, (g, w, h) => {
      g.fillStyle = css; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(0, 0, w, 14);                    // the roof's edge
      g.fillStyle = "#11161f"; g.fillRect(36, 26, 184, 30);                               // the destination board
      g.fillStyle = "#ffb43a"; g.font = "800 22px Nunito, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("EXPRESS", 128, 42);
      g.fillStyle = "#cfefff"; g.strokeStyle = "#2e2140"; g.lineWidth = 6;                  // the windscreen, and a face in it
      g.beginPath(); g.moveTo(26, 72); g.lineTo(230, 72); g.lineTo(220, 150); g.lineTo(36, 150); g.closePath(); g.fill(); g.stroke();
      for (const ex of [88, 168]) {
        g.fillStyle = "#ffffff"; g.beginPath(); g.arc(ex, 108, 26, 0, 6.3); g.fill(); g.stroke();
        g.fillStyle = "#2e2140"; g.beginPath(); g.arc(ex + 3, 112, 13, 0, 6.3); g.fill();
        g.fillStyle = "#ffffff"; g.beginPath(); g.arc(ex + 8, 105, 5, 0, 6.3); g.fill();
      }
      g.strokeStyle = "#2e2140"; g.lineWidth = 7; g.lineCap = "round"; g.beginPath(); g.arc(128, 140, 22, 0.25, Math.PI - 0.25); g.stroke();
      g.fillStyle = cssStripe; g.fillRect(0, 176, w, 26);                                 // the stripe, round the front
      g.fillStyle = "#11161f"; g.fillRect(96, 214, 64, 40);                                // the coupler
      for (const x of [52, 204]) { g.fillStyle = "#fff6c0"; g.beginPath(); g.arc(x, 232, 17, 0, 6.3); g.fill(); g.fillStyle = "#ffffff"; g.beginPath(); g.arc(x, 232, 8, 0, 6.3); g.fill(); }
    }) })),
  }));
  const mBoard = mk(0xffffff, { map: stripe }), mWarn = keep(new T.MeshBasicMaterial({ color: 0xffa020 })), mRed = keep(new T.MeshBasicMaterial({ color: 0xff3b3b }));
  const gLow = G(new T.BoxGeometry(2.7, 0.95, 0.9)), gHighBar = G(new T.BoxGeometry(2.9, 0.7, 0.5)), gPost = G(new T.BoxGeometry(0.3, 3.2, 0.3)), gCoin = G(new T.CylinderGeometry(0.42, 0.42, 0.12, 14).rotateX(Math.PI / 2));
  // a car's parts, each 1 long and stretched to the car's length
  const gTrain = G(new T.BoxGeometry(2.7, 2.9, 1)), gTrainTop = G(new T.BoxGeometry(2.45, 0.3, 1)), gBand = G(new T.BoxGeometry(2.74, 0.3, 1)), gWin = G(new T.BoxGeometry(2.76, 0.7, 1)), gChassis = G(new T.BoxGeometry(2.3, 0.5, 1));
  const gFace = G(new T.PlaneGeometry(2.7, 2.9)), gLamp = G(new T.SphereGeometry(0.16, 8, 6)), gLegB = G(new T.BoxGeometry(0.16, 0.5, 0.16));
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
      mesh(gRail, mRail, -LANE * 1.5 - 0.1, 0.28, 0), mesh(gRail, mRail, LANE * 1.5 + 0.1, 0.28, 0));
    for (const lx of [-LANE, 0, LANE]) {
      g.add(mesh(gSteel, mSteel, lx - 0.72, 0.14, 0), mesh(gSteel, mSteel, lx + 0.72, 0.14, 0));
      for (let z = -CL / 2 + SLP / 2; z < CL / 2; z += SLP) g.add(mesh(gSleeper, mSlp, lx, 0.04, z));
    }
    for (const sd of [-1, 1]) for (const z of [-CL / 4, CL / 4]) {
      const x = sd * (LANE * 1.5 + 0.9);
      g.add(mesh(gPole, mPole, x, 2.2, z), mesh(gArmP, mPole, x - sd * 0.5, 4.35, z), mesh(gLampHd, mLampHd, x - sd * 0.95, 4.27, z));
    }
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

  // ── the runner ──
  // A big-headed kid in a hoodie and a backwards cap in your colour. The
  // camera is behind, so the back — the cap's peak, the hood — carries the
  // look. Legs swing from the hip and arms from the
  // shoulder (poseHero).
  function mkHero(colour) {
    const g = new T.Group(), inner = new T.Group(); g.add(inner);
    const DARK = 0x2e2140;
    const col = mk(colour), colDk = mk(new T.Color(colour).multiplyScalar(0.7).getHex());
    const S = (r) => G(new T.SphereGeometry(r, 16, 12));
    const add = (m, line = 1.07, to = inner) => { to.add(m); if (line) to.add(ink(m, line)); return m; };
    const eyes = (y, z, spread = 0.14) => { for (const sx of [-1, 1]) add(mesh(S(0.055), mk(DARK), sx * spread, y, z), 0); };
    const legLen = 0.42;
    const fur = mk(0xffd9b8), limb = mk(0x3c3550), hand = fur, foot = mk(0xffffff);
    add(mesh(S(0.48), col, 0, 1.02, 0, 1, 1.08, 0.95));
    add(mesh(G(new T.BoxGeometry(0.38, 0.18, 0.06)), colDk, 0, 0.92, -0.42), 0);
    add(mesh(S(0.44), fur, 0, 1.82, 0));
    add(mesh(G(new T.SphereGeometry(0.46, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), col, 0, 1.86, 0, 1, 0.8, 1));
    add(mesh(G(new T.BoxGeometry(0.4, 0.05, 0.3)), col, 0, 1.86, 0.48), 1.15);            // the peak, at the back
    add(mesh(S(0.05), mk(0xffffff), 0, 2.23, 0), 0);
    for (const sx of [-1, 1]) add(mesh(S(0.1), mk(0x3b2a20), sx * 0.36, 1.8, 0.1, 0.6, 1, 1), 0);
    eyes(1.84, -0.4, 0.15);
    add(mesh(G(new T.TorusGeometry(0.06, 0.015, 4, 8, Math.PI)), mk(0x9a3a2a), 0, 1.7, -0.41), 0).rotation.z = Math.PI;
    const legs = [], arms = [];
    for (const sx of [-1, 1]) {
      const p = new T.Group(); p.position.set(sx * 0.2, 0.64, 0);
      const leg = mesh(G(new T.CylinderGeometry(0.12, 0.11, legLen, 10)), limb, 0, -legLen / 2, 0);
      const shoe = mesh(S(0.16), foot, 0, -legLen - 0.06, -0.06, 1, 0.7, 1.35);
      p.add(leg, ink(leg), shoe, ink(shoe));
      inner.add(p); legs.push(p);
      const ar = new T.Group(); ar.position.set(sx * 0.5, 1.3, 0);
      const sleeve = mesh(G(new T.CylinderGeometry(0.1, 0.09, 0.4, 10)), col, 0, -0.19, 0);
      const paw = mesh(S(0.11), hand, 0, -0.42, 0);
      ar.add(sleeve, ink(sleeve), paw, ink(paw, 1.12));
      inner.add(ar); arms.push(ar);
    }
    const sh = new T.Mesh(G(new T.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2)), keep(new T.MeshBasicMaterial({ map: glow, color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })));
    sh.position.y = 0.03;
    scene.add(g, sh);
    return { g, inner, legs, arms, sh, phase: Math.random() * 6 };
  }
  const hero = mkHero(0xff7a3d);
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
    if (o.kind === "low") {
      m.add(ink(mesh(gLow, mBoard, 0, 0.7, 0, 1, 0.5, 0.5), 1.08));
      // a barrier: a striped board on two legs, a warning lamp at each end (as tall as before: 0.95)
      m.add(mesh(gLow, mBoard, 0, 0.7, 0, 1, 0.5, 0.5), mesh(gLegB, mDark, -1.1, 0.25, 0), mesh(gLegB, mDark, 1.1, 0.25, 0),
        mesh(gLamp, mWarn, -1.2, 1.05, 0, 0.7), mesh(gLamp, mWarn, 1.2, 1.05, 0, 0.7));
    } else if (o.kind === "high") m.add(ink(mesh(gHighBar, mStripe, 0, 1.65, 0), 1.1), mesh(gPost, mDark, -1.4, 1.6, 0), mesh(gPost, mDark, 1.4, 1.6, 0), mesh(gHighBar, mStripe, 0, 1.65, 0),
      mesh(gLamp, mRed, -1.4, 3.25, 0), mesh(gLamp, mRed, 1.4, 3.25, 0));
    else if (o.kind === "train") {
      // a train car in one of the liveries (by where it is, so it's the same on every phone)
      const len = o.len, L = liveries[Math.abs(Math.round(o.z)) % liveries.length], mid = -len / 2;
      const body = mesh(gTrain, L.body, 0, 2.0, mid, 1, 1, len);
      m.add(ink(body, 1.04));
      m.add(mesh(gChassis, mUnderT, 0, 0.3, mid, 1, 1, len - 0.6),
        body,
        mesh(gTrainTop, L.roof, 0, 3.6, mid, 1, 1, len - 0.3),
        mesh(gBand, L.stripe, 0, 1.4, mid, 1, 1, len - 0.1),
        mesh(gWin, mGlass, 0, 2.55, mid, 1, 1, len - 1.4));
      const f = new T.Mesh(gFace, L.face); f.position.set(0, 2.0, 0.01); m.add(f);
      for (const sx of [-0.85, 0.85]) m.add(mesh(gLamp, mHead, sx, 0.95, 0.05));
    }
    scene.add(m);
    return m;
  }
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

  // friends: a runner each in their colour, see-through, a name over them
  const ghosts = new Map();
  function nameSprite(text, colour) {
    const c = document.createElement("canvas"), x = c.getContext("2d");
    x.font = "800 40px Fredoka, Nunito, sans-serif";
    const w = Math.ceil(x.measureText(text).width) + 36;
    c.width = w; c.height = 64;
    x.font = "800 40px Fredoka, Nunito, sans-serif";
    x.fillStyle = "#" + new T.Color(colour).getHexString(); x.strokeStyle = "#2E2140"; x.lineWidth = 6;
    x.beginPath(); if (x.roundRect) x.roundRect(3, 3, w - 6, 58, 28); else x.rect(3, 3, w - 6, 58); x.fill(); x.stroke();
    x.fillStyle = "#2E2140"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, w / 2, 34);
    const tex = new T.CanvasTexture(c);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set((0.55 * w) / 64, 0.55, 1);
    return sp;
  }
  function ghost(id, colour, name) {
    let gh = ghosts.get(id);
    if (gh) return gh;
    gh = mkHero(colour);
    gh.g.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } });
    gh.tag = nameSprite(name || "Friend", colour);
    scene.add(gh.tag);
    ghosts.set(id, gh);
    return gh;
  }
  function drawOthers(others, myZ, t, dt) {
    const here = new Set();
    for (const o of others || []) {
      here.add(o.id);
      const gh = ghost(o.id, o.colour, o.name);
      const show = o.z > myZ - 12 && o.z < myZ + 160;
      gh.g.visible = show; gh.sh.visible = show; gh.tag.visible = show;
      if (!show) continue;
      gh.g.position.z = -o.z;
      poseHero(gh, { x: o.x * LANE, y: o.y, grounded: o.y <= 0.001, sliding: !!o.sl, stun: !!o.st, safe: false, speed: o.v || 14, dt, t });
      gh.tag.position.set(o.x * LANE, o.y * JUMP_LOOK + 2.75, -o.z);
    }
    for (const [id, gh] of ghosts) if (!here.has(id)) { scene.remove(gh.g, gh.sh, gh.tag); ghosts.delete(id); }
  }

  function frame({ s, t, dt, crashed = false, others = null }) {
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
    // you
    hero.g.position.z = pz;
    poseHero(hero, { x: px, y: py, grounded, sliding, stun: s.stunT > 0, safe: s.safeT > 0 && s.stunT <= 0, speed: s.speed, dt, t });
    hero.g.rotation.z = s.stunT > 0 ? 0 : -(s.lane * LANE - px) * 0.05;
    if (grounded && s.stunT <= 0 && Math.random() < dt * 14) emit(px + rnd(-0.3, 0.3), 0.1, pz + 0.4, rnd(-1, 1), rnd(0.5, 1.8), rnd(1, 3), 0.45, 0.8, 0.75, 0.6);
    if (prevY > 0.05 && grounded) burst(px, 0.1, pz, 6, 0.8, 0.8, 0.7, 2.5);
    prevY = py;
    if (crashed) { shake = 0.8; burst(px, 1, pz, 26, 1, 0.55, 0.2, 8); }
    drawOthers(others, s.z, t, dt);
    // the world around
    updP(dt);
    shake = Math.max(0, shake - dt * 1.6);
    applyTheme(th, dt);
    for (const c of clouds) { c.position.x += dt * 3; if (c.position.x > 600) c.position.x = -600; c.position.z = pz + c.userData.dz; }
    const sx = (Math.random() * 2 - 1) * shake * 0.5, sy = (Math.random() * 2 - 1) * shake * 0.4;
    // A soft camera. Locked to the runner, the whole world lurched sideways
    // at every lane change and rose with every jump — heavy. Now it drifts a
    // little after you, so you see the runner glide across a steady path.
    // Further back and higher than it was: on an upright phone the runner sat
    // at the screen's edge in an outside lane, under half a screen of sky.
    const portrait = cam.aspect < 1;
    camX += (px * (portrait ? 0.5 : 0.3) - camX) * Math.min(1, dt * 5);
    cam.position.set(camX + sx, (portrait ? 5.6 : 4.6) + sy, pz + (portrait ? 9.4 : 7.8));
    cam.lookAt(camX * 0.8, portrait ? 0.8 : 1.3, pz - 14);
    const fov = (portrait ? 72 : 62) + Math.max(0, Math.min(1, (s.speed - 14) / 16)) * 7;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
    sky.position.copy(cam.position); stars.position.copy(cam.position);
    sun.position.set(cam.position.x + 140, cam.position.y + 150 - cur.st * 40, cam.position.z - 700);
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
