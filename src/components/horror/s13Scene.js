// src/components/horror/s13Scene.js
// Drawing STATION 13 with three.js (r128, loaded lazily by the pages): the
// hospital from a layout (s13Core.genStation), lit by a light map — a lit
// zone is softly lit with darker corners, an unlit one is black but for
// your torch — its furniture, its dead, the elevator, the monster(s), your
// friends online, and the awareness effects: flicker, mist, breath, wet
// footprints ahead of it, a silhouette at the edge of the beam, the pulsing
// heart and the arc toward it.
//
// Reads the game and never changes it. createStation(host, THREE, layout)
// puts its canvas and its overlays into `host`; frame(view, dt, t) draws.
const cl = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createStation(host, THREE, opts) {
  const { layout, items: itemList, lockers, quality = 1, aware = true } = opts;
  const { g, zn, doors, furn, deco, bl, exitT } = layout;
  const N = g.length, S = 3, HH = 25;
  // the per-house look: the same on every phone
  let seedLook = (layout.look || 1) % 2147483647 || 1;
  const R = () => { seedLook = (seedLook * 16807) % 2147483647; return (seedLook - 1) / 2147483646; };
  const FR = Math.random;                                       // flicker and jitter: cosmetic
  const rnd = (a) => a[(R() * a.length) | 0];

  // ── the canvas and the overlays ──
  const cv = document.createElement("canvas"); cv.className = "s13-gl";
  const nzC = document.createElement("canvas"); nzC.className = "s13-nz"; nzC.width = nzC.height = 256;
  const mk = (cls, html) => { const e = document.createElement("div"); e.className = cls; if (html) e.innerHTML = html; return e; };
  const vig = mk("s13-fx s13-vig"), dgO = mk("s13-fx s13-dg"), brO = mk("s13-fx s13-br"), slit = mk("s13-fx s13-slit"), flash = mk("s13-fx s13-flash");
  const aw = mk("s13-aw", "&#9829;"), rip = mk("s13-rip", "<i></i>");
  slit.style.display = "none";
  host.prepend(cv, nzC, vig, dgO, brO, slit, flash, aw, rip);
  { const c = nzC.getContext("2d"), d = c.createImageData(256, 256); for (let i = 0; i < d.data.length; i += 4) { const v = FR() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } c.putImageData(d, 0, 0); }

  const rd = new THREE.WebGLRenderer({ canvas: cv, antialias: quality > 0 });
  rd.outputEncoding = THREE.sRGBEncoding; rd.toneMapping = THREE.ACESFilmicToneMapping; rd.toneMappingExposure = 1.1; rd.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(72, 1, 0.05, 60);
  cam.rotation.order = "YXZ"; scene.fog = new THREE.FogExp2(0x020304, 0.05); scene.background = new THREE.Color(0x020304); scene.add(cam);
  scene.add(new THREE.HemisphereLight(0x506070, 0x151515, 0.14));
  const spot = new THREE.SpotLight(0xfff2d8, 2.6, 26, 0.5, 0.55, 1.5); spot.shadow.bias = -0.001; spot.shadow.camera.near = 0.2; scene.add(spot, spot.target);
  const halo = new THREE.PointLight(0x4a5a6a, 0.35, 7, 2); scene.add(halo);
  const elL = new THREE.PointLight(0xff2a2a, 0.8, 9, 2); scene.add(elL);
  let Q = quality;
  function applyQ() {
    rd.setPixelRatio(Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][Q]));
    rd.shadowMap.enabled = Q > 0; spot.castShadow = Q > 0;
    if (spot.shadow.map) { spot.shadow.map.dispose(); spot.shadow.map = null; }
    spot.shadow.mapSize.set(Q > 1 ? 1024 : 512, Q > 1 ? 1024 : 512);
    resize();
  }
  function resize() {
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    cam.aspect = w / h; cam.updateProjectionMatrix(); rd.setSize(w, h, false);
    cv.style.width = "100%"; cv.style.height = "100%";
  }

  // ── textures, all drawn here ──
  function ctex(w, h, fn) { const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
  const wallT = ctex(512, 512, (c, w, h) => {
    c.fillStyle = "#d9d6c8"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 45; i++) { const x = R() * w, y = R() * h, r = 60 + R() * 140, gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(110,100,80," + (0.03 + R() * 0.07) + ")"); gr.addColorStop(1, "rgba(110,100,80,0)"); c.fillStyle = gr; c.fillRect(0, 0, w, h); }
    for (let i = 0; i < 7; i++) { const x = R() * w, gr = c.createLinearGradient(0, 0, 0, h * 0.7); gr.addColorStop(0, "rgba(70,55,35,.28)"); gr.addColorStop(1, "rgba(70,55,35,0)"); c.fillStyle = gr; c.fillRect(x, 0, 3 + R() * 8, h * 0.7); }
    const wy = h * 0.6; c.fillStyle = "#6f9a8e"; c.fillRect(0, wy, w, h - wy);
    const pg = c.createLinearGradient(0, wy, 0, h); pg.addColorStop(0, "rgba(255,255,255,.12)"); pg.addColorStop(1, "rgba(0,0,0,.2)"); c.fillStyle = pg; c.fillRect(0, wy, w, h - wy);
    c.fillStyle = "#efece0"; c.fillRect(0, wy - 8, w, 16); c.fillStyle = "rgba(0,0,0,.3)"; c.fillRect(0, wy + 8, w, 6); c.fillStyle = "rgba(255,255,255,.5)"; c.fillRect(0, wy - 8, w, 2);
    c.fillStyle = "#2e3a38"; c.fillRect(0, h - 30, w, 30); c.fillStyle = "rgba(255,255,255,.15)"; c.fillRect(0, h - 30, w, 3);
    let g2 = c.createLinearGradient(0, 0, 0, 90); g2.addColorStop(0, "rgba(0,0,0,.4)"); g2.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g2; c.fillRect(0, 0, w, 90);
    g2 = c.createLinearGradient(0, wy + 10, 0, wy + 60); g2.addColorStop(0, "rgba(0,0,0,.18)"); g2.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g2; c.fillRect(0, wy + 10, w, 50);
    for (let i = 0; i < 3500; i++) { c.fillStyle = "rgba(0,0,0," + R() * 0.05 + ")"; c.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); }
    for (let i = 0; i < 10; i++) { c.strokeStyle = "rgba(0,0,0,.15)"; c.lineWidth = 1; c.beginPath(); let x = R() * w, y = R() * wy; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 20; y += R() * 18; c.lineTo(x, y); } c.stroke(); }
  });
  const floorT = ctex(512, 512, (c, w, h) => {
    const n = 6, t = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const l = 176 + (((R() - 0.5) * 14) | 0); c.fillStyle = "rgb(" + (l - 2) + "," + (l + 2) + "," + (l - 4) + ")"; c.fillRect(i * t, j * t, t, t); }
    for (let i = 0; i < 40; i++) { const x = R() * w, y = R() * h, r = 30 + R() * 90, gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(40,35,25," + (0.05 + R() * 0.1) + ")"); gr.addColorStop(1, "rgba(40,35,25,0)"); c.fillStyle = gr; c.fillRect(0, 0, w, h); }
    for (let i = 0; i < 260; i++) { c.strokeStyle = "rgba(0,0,0," + R() * 0.07 + ")"; c.lineWidth = 1 + R() * 2; c.beginPath(); const x = R() * w, y = R() * h, a = R() * 6; c.moveTo(x, y); c.lineTo(x + Math.cos(a) * (8 + R() * 30), y + Math.sin(a) * (8 + R() * 30)); c.stroke(); }
    c.fillStyle = "rgba(30,30,28,.75)"; for (let i = 0; i <= n; i++) { c.fillRect(i * t - 1, 0, 2, h); c.fillRect(0, i * t - 1, w, 2); }
    for (let i = 0; i < 2500; i++) { c.fillStyle = "rgba(0,0,0," + R() * 0.05 + ")"; c.fillRect(R() * w, R() * h, 1, 1); }
  });
  const ceilT = ctex(512, 512, (c, w, h) => {
    c.fillStyle = "#e6e4dc"; c.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { c.fillStyle = "rgba(60,55,45," + R() * 0.18 + ")"; c.fillRect(R() * w, R() * h, 1 + R() * 1.5, 1 + R() * 1.5); }
    for (let i = 0; i < 8; i++) { const x = R() * w, y = R() * h, r = 30 + R() * 70, gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(120,95,50," + (0.08 + R() * 0.12) + ")"); gr.addColorStop(1, "rgba(120,95,50,0)"); c.fillStyle = gr; c.fillRect(0, 0, w, h); }
    c.fillStyle = "#55584f"; c.fillRect(0, 0, w, 5); c.fillRect(0, h / 2 - 3, w, 6); c.fillRect(0, h - 5, w, 5); c.fillRect(0, 0, 5, h); c.fillRect(w / 2 - 3, 0, 6, h); c.fillRect(w - 5, 0, 5, h);
  });
  const glowT = ctex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
  const bloodT = ctex(128, 128, (c) => { for (let i = 0; i < 14; i++) { c.fillStyle = "rgba(90,0,0," + (0.3 + R() * 0.5) + ")"; c.beginPath(); c.arc(64 + (R() - 0.5) * 60, 64 + (R() - 0.5) * 60, 4 + R() * 22, 0, 7); c.fill(); } });
  bloodT.wrapS = bloodT.wrapT = THREE.ClampToEdgeWrapping;
  const fpT = ctex(128, 128, (c) => { c.fillStyle = "rgba(70,0,0,.9)"; [[40, 34], [86, 82]].forEach(([x, y]) => { c.beginPath(); c.ellipse(x, y, 14, 26, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(x, y + 34, 11, 12, 0, 0, 7); c.fill(); }); });
  fpT.wrapS = fpT.wrapT = THREE.ClampToEdgeWrapping;

  const boxG = new THREE.BoxGeometry(S, S * 1.15, S);
  const wallM = new THREE.MeshStandardMaterial({ map: wallT, bumpMap: wallT, bumpScale: 0.3, roughness: 1, color: 0xffffff });
  const floorM = new THREE.MeshStandardMaterial({ map: floorT, roughness: 1, metalness: 0 });
  const ceilM = new THREE.MeshStandardMaterial({ map: ceilT, roughness: 0.9 });
  const fixM = new THREE.MeshBasicMaterial({ color: 0xcfe0d0 });
  function rbox(w, h, d, r, sg) {
    const gg = new THREE.BoxGeometry(w, h, d, sg, sg, sg), p = gg.attributes.position, nn = gg.attributes.normal, hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); c.set(cl(v.x, -hx, hx), cl(v.y, -hy, hy), cl(v.z, -hz, hz)); const n = v.clone().sub(c).normalize(); v.copy(c).addScaledVector(n, r); p.setXYZ(i, v.x, v.y, v.z); nn.setXYZ(i, n.x, n.y, n.z); }
    return gg;
  }
  const rbG = rbox(S, S * 1.15, S, S * 0.05, 4), HM = new THREE.MeshStandardMaterial({ color: 0x777a78, roughness: 0.5, metalness: 0.6 }), blk = new THREE.MeshBasicMaterial({ color: 0 });
  // the light map: lit zones glow, with soft dark corners
  const LM = { value: null }, LS = { value: new THREE.Vector2(N * S, N * S) }, LE = { value: 0.85 };
  function lmPatch(m) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uLM = LM; sh.uniforms.uSz = LS; sh.uniforms.uLE = LE;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvec4 wp4=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nwp4=instanceMatrix*wp4;\n#endif\nvWP=(modelMatrix*wp4).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;uniform sampler2D uLM;uniform vec2 uSz;uniform float uLE;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*texture2D(uLM,vWP.xz/uSz).r*uLE;");
    };
  }
  [wallM, floorM, ceilM].forEach(lmPatch);
  wallM.roughnessMap = ctex(512, 512, (c, w, h) => { c.fillStyle = "rgb(205,205,205)"; c.fillRect(0, 0, w, h); c.fillStyle = "rgb(125,125,125)"; c.fillRect(0, h * 0.6, w, h * 0.4); for (let i = 0; i < 50; i++) { c.fillStyle = "rgba(" + (R() < 0.5 ? "255,255,255" : "0,0,0") + ",.12)"; c.beginPath(); c.arc(R() * w, R() * h, 10 + R() * 40, 0, 7); c.fill(); } });
  floorM.roughnessMap = ctex(512, 512, (c, w, h) => { c.fillStyle = "rgb(175,175,175)"; c.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { c.strokeStyle = "rgba(255,255,255,.12)"; c.beginPath(); const x = R() * w, y = R() * h; c.moveTo(x, y); c.lineTo(x + R() * 30 - 15, y + R() * 30 - 15); c.stroke(); } for (let i = 0; i < 16; i++) { const x = R() * w, y = R() * h, r = 25 + R() * 70, gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgb(15,15,15)"); gr.addColorStop(0.7, "rgb(55,55,55)"); gr.addColorStop(1, "rgba(175,175,175,0)"); c.fillStyle = gr; c.fillRect(x - r, y - r, 2 * r, 2 * r); } });
  floorM.bumpMap = floorT; floorM.bumpScale = 0.6;
  const lmC = document.createElement("canvas"); lmC.width = lmC.height = N * 4;
  const lmT = new THREE.CanvasTexture(lmC); lmT.flipY = false; lmT.minFilter = lmT.magFilter = THREE.LinearFilter; lmT.generateMipmaps = false; LM.value = lmT;
  let litKey = "";
  function refreshLM(lit) {
    const K = 4, W2 = N * K, c = lmC.getContext("2d"), d = c.createImageData(W2, W2);
    const on = (x, y) => x >= 0 && y >= 0 && x < N && y < N && g[y][x] !== 1 && lit.has(zn[y][x]) ? 1 : 0;
    const sol = (x, y) => x < 0 || y < 0 || x >= N || y >= N || g[y][x] === 1;
    for (let py = 0; py < W2; py++) for (let px = 0; px < W2; px++) {
      const x = (px / K) | 0, y = (py / K) | 0, u = (px % K + 0.5) / K, v = (py % K + 0.5) / K;
      let val;
      if (g[y][x] !== 1) {
        val = lit.has(zn[y][x]) ? 1 : 0;
        if (val) { let pr = 0; if (sol(x - 1, y)) pr = Math.max(pr, 1 - u); if (sol(x + 1, y)) pr = Math.max(pr, u); if (sol(x, y - 1)) pr = Math.max(pr, 1 - v); if (sol(x, y + 1)) pr = Math.max(pr, v); val = 1 - 0.5 * pr * pr * pr; }
      } else { val = 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (on(x + a, y + b)) val = 1; }
      const i = (py * W2 + px) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = val * 255; d.data[i + 3] = 255;
    }
    c.putImageData(d, 0, 0); lmT.needsUpdate = true;
  }

  // ── the monster(s) ──
  const SG = new THREE.SphereGeometry(1, 12, 10), CG = (a, b, l) => new THREE.CylinderGeometry(b, a, l, 8, 1);
  const dk = new THREE.MeshStandardMaterial({ color: 0x15110f, roughness: 0.35, metalness: 0.1 }), flm = new THREE.MeshStandardMaterial({ color: 0x2c2622, roughness: 0.5 }), mouM = new THREE.MeshBasicMaterial({ color: 0x000000 });
  function makeMonster() {
    const mon = new THREE.Group(), rig = { arms: [], legs: [] }, eyeM = new THREE.MeshBasicMaterial({ color: 0xff1010 });
    const ms = (gg, m, x, y, z, sx, sy, sz, p) => { const o = new THREE.Mesh(gg, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; (p || mon).add(o); return o; };
    const torso = new THREE.Group(); torso.position.y = 2.05; mon.add(torso); rig.torso = torso;
    ms(SG, dk, 0, 0.4, 0, 0.34, 0.5, 0.2, torso); for (let i = 0; i < 5; i++) ms(SG, flm, 0, 0.15 + i * 0.12, 0.1, 0.3 - i * 0.015, 0.02, 0.16, torso);
    ms(SG, dk, 0, -0.12, 0, 0.24, 0.3, 0.17, torso); ms(SG, dk, 0, -0.45, 0, 0.26, 0.18, 0.18, torso);
    ms(CG(0.07, 0.05, 0.4), flm, 0, 0.88, 0.1, 1, 1, 1, torso).rotation.x = 0.45;
    const hd = new THREE.Group(); hd.position.set(0, 1.15, 0.28); torso.add(hd); rig.head = hd;
    ms(SG, flm, 0, 0, 0, 0.14, 0.2, 0.15, hd); ms(SG, dk, 0, -0.17, 0.04, 0.1, 0.09, 0.11, hd); [-1, 1].forEach((q) => ms(SG, eyeM, q * 0.06, 0.05, 0.125, 0.032, 0.022, 0.02, hd)); ms(SG, mouM, 0, -0.11, 0.13, 0.05, 0.015, 0.02, hd);
    [-1, 1].forEach((q) => {
      const sh = new THREE.Group(); sh.position.set(q * 0.4, 0.72, 0); torso.add(sh); ms(SG, dk, 0, 0, 0, 0.09, 0.09, 0.09, sh); ms(CG(0.065, 0.045, 0.72), flm, 0, -0.36, 0, 1, 1, 1, sh);
      const el = new THREE.Group(); el.position.y = -0.72; sh.add(el); ms(CG(0.045, 0.032, 0.78), flm, 0, -0.39, 0, 1, 1, 1, el);
      const hn = new THREE.Group(); hn.position.y = -0.8; el.add(hn); ms(SG, dk, 0, -0.06, 0, 0.045, 0.08, 0.025, hn);
      for (let i = 0; i < 4; i++) { const f = ms(CG(0.012, 0.006, 0.3), dk, (i - 1.5) * 0.025, -0.22, 0, 1, 1, 1, hn); f.rotation.z = (i - 1.5) * 0.12; f.rotation.x = 0.15; }
      rig.arms.push({ s: sh, e: el });
    });
    [-1, 1].forEach((q) => {
      const h = new THREE.Group(); h.position.set(q * 0.14, 1.62, 0); mon.add(h); ms(CG(0.09, 0.06, 0.8), dk, 0, -0.4, 0, 1, 1, 1, h);
      const k = new THREE.Group(); k.position.y = -0.8; h.add(k); ms(CG(0.06, 0.04, 0.8), dk, 0, -0.4, 0, 1, 1, 1, k); ms(SG, dk, 0, -0.82, 0.08, 0.05, 0.04, 0.14, k); rig.legs.push({ h, k });
    });
    mon.visible = false; scene.add(mon);
    return { mon, rig, eyeM };
  }
  const mons = [];
  function monAnim(m, M, t) {
    const { rig } = m, mv = M.moving, sw = mv ? Math.sin(t * (M.st === "chase" ? 9 : 4.2)) : 0, rs2 = (M.wd > 0 || M.nt > 0) ? 1 : 0;
    rig.torso.rotation.x = 0.22 + (M.st === "chase" ? 0.12 : 0) + Math.sin(t * 1.7) * 0.02; rig.torso.scale.set(1 + Math.sin(t * 1.9) * 0.015, 1 + Math.sin(t * 1.9) * 0.02, 1);
    m.mon.position.y = Math.abs(sw) * 0.05;
    rig.legs.forEach((l, i) => { const q = i ? 1 : -1; l.h.rotation.x = sw * 0.7 * q; l.k.rotation.x = Math.max(0, -sw * q) * 0.9 + 0.1; });
    rig.arms.forEach((a, i) => { const q = i ? 1 : -1; a.s.rotation.x = rs2 ? -1.9 + Math.sin(t * 14) * 0.08 : -sw * 0.5 * q + 0.15; a.s.rotation.z = q * (rs2 ? 0.5 : 0.12); a.e.rotation.x = rs2 ? -0.4 : -0.35 - Math.abs(sw) * 0.3; });
    const tw = Math.sin(t * 23) > 0.96 ? (FR() - 0.5) * 0.5 : 0;
    rig.head.rotation.set(0.2 + Math.sin(t * 0.8) * 0.05, rig.head.rotation.y * 0.9 + tw, Math.sin(t * 1.3) * 0.04 + tw * 0.3);
  }

  // ── your friends (online) ──
  // A survivor: a jacket in their side's colour with a backpack, jeans and
  // boots, a face and hair, and the flashlight held out in the right hand
  // when it's on. Legs and arms swing as they walk (from how far they moved
  // since the last frame). Over their head, their name and how far off they
  // are in metres, seen through walls so you can find each other.
  const friendFigs = new Map();
  function tagDraw(f, name, color, metres) {
    const c = f.tagC, g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = 7; g.strokeStyle = "rgba(0,0,0,.85)";
    g.font = "bold 40px sans-serif"; g.strokeText(name, 160, 34); g.fillStyle = color; g.fillText(name, 160, 34);
    if (metres != null) { g.font = "bold 32px sans-serif"; const m = `${metres} m`; g.strokeText(m, 160, 86); g.fillStyle = "#f2efe6"; g.fillText(m, 160, 86); }
    f.tag.material.map.needsUpdate = true;
  }
  function friendFig(o) {
    let f = friendFigs.get(o.id);
    if (f) return f;
    const gr = new THREE.Group(), col = new THREE.Color(o.color || "#4cc9f0");
    const mat = (c, r = 0.7) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: r }); lmPatch(m); return m; };
    const jacket = mat(col, 0.6), jacketDk = mat(col.clone().multiplyScalar(0.62), 0.6), skin = mat(0xd9b294), jeans = mat(0x2b3446, 0.85),
      boot = mat(0x2a221c), hairM = mat(0x2b1d14, 0.9), pack = mat(0x3a4038), dark = mat(0x15171a, 0.4), steel = mat(0x8c939a, 0.35);
    const add = (geo, m, x, y, z, parent = gr, sx = 1, sy = 1, sz = 1) => { const o3 = new THREE.Mesh(geo, m); o3.position.set(x, y, z); o3.scale.set(sx, sy, sz); parent.add(o3); return o3; };
    // the torso: a jacket, a darker collar and hem, a zip down the front
    add(new THREE.CylinderGeometry(0.22, 0.25, 0.62, 12), jacket, 0, 1.22, 0, gr, 1, 1, 0.72);
    add(new THREE.CylinderGeometry(0.15, 0.2, 0.08, 12), jacketDk, 0, 1.55, 0, gr, 1, 1, 0.8);
    add(new THREE.CylinderGeometry(0.255, 0.255, 0.07, 12), jacketDk, 0, 0.93, 0, gr, 1, 1, 0.74);
    add(new THREE.BoxGeometry(0.02, 0.55, 0.01), steel, 0, 1.22, -0.185);
    // a backpack with a flap and two straps
    add(new THREE.BoxGeometry(0.34, 0.42, 0.15), pack, 0, 1.22, 0.24);
    add(new THREE.BoxGeometry(0.35, 0.12, 0.16), dark, 0, 1.38, 0.245);
    for (const sx of [-0.11, 0.11]) add(new THREE.BoxGeometry(0.045, 0.5, 0.03), dark, sx, 1.24, -0.175);
    // the head: neck, face, hair, eyes and brows
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skin, 0, 1.62, 0);
    add(new THREE.SphereGeometry(0.125, 16, 12), skin, 0, 1.76, 0, gr, 1, 1.12, 1);
    add(new THREE.SphereGeometry(0.132, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 1.79, 0.012, gr, 1, 1.1, 1.02);
    for (const sx of [-0.045, 0.045]) { add(new THREE.SphereGeometry(0.017, 6, 5), dark, sx, 1.775, -0.115); add(new THREE.BoxGeometry(0.045, 0.01, 0.01), hairM, sx, 1.81, -0.118); }
    // legs from the hip: jeans and a boot
    const legs = [-1, 1].map((sx) => {
      const l = new THREE.Group(); l.position.set(sx * 0.11, 0.92, 0); gr.add(l);
      add(new THREE.CylinderGeometry(0.085, 0.075, 0.82, 8), jeans, 0, -0.42, 0, l);
      add(new THREE.BoxGeometry(0.13, 0.1, 0.24), boot, 0, -0.86, -0.04, l);
      return l;
    });
    // arms from the shoulder: a sleeve, a cuff, a hand; the right holds the flashlight
    const arms = [-1, 1].map((sx) => {
      const a = new THREE.Group(); a.position.set(sx * 0.27, 1.47, 0); gr.add(a);
      add(new THREE.CylinderGeometry(0.06, 0.055, 0.5, 8), jacket, 0, -0.25, 0, a);
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8), jacketDk, 0, -0.5, 0, a);
      add(new THREE.SphereGeometry(0.055, 8, 6), skin, 0, -0.56, 0, a);
      return a;
    });
    const lamp = new THREE.Group(); lamp.position.set(0, -0.6, -0.04); arms[1].add(lamp);
    add(new THREE.CylinderGeometry(0.03, 0.035, 0.2, 8), dark, 0, 0, -0.06, lamp).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.045, 0.035, 0.05, 8), steel, 0, 0, -0.17, lamp).rotation.x = Math.PI / 2;
    const torch = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xfff2d0, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    torch.scale.set(0.7, 0.7, 1); torch.position.set(0, 0, -0.22); lamp.add(torch);
    gr.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    // the name, and how far
    const tagC = document.createElement("canvas"); tagC.width = 320; tagC.height = 120;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tagC), depthTest: false, transparent: true }));
    tag.scale.set(1.6, 0.6, 1); tag.position.y = 2.35; tag.renderOrder = 5; gr.add(tag);
    scene.add(gr);
    f = { gr, torch, legs, arms, tag, tagC, shown: null, px: o.x, py: o.y, spd: 0, ph: 0 };
    friendFigs.set(o.id, f);
    return f;
  }
  // one friend, this frame: where, which way, walking or not, light, and how far from you
  function friendPose(f, o, P, dt) {
    const moved = Math.hypot(o.x - f.px, o.y - f.py) * S;
    f.px = o.x; f.py = o.y;
    const v = dt > 0 ? Math.min(6, moved / dt) : 0;
    f.spd += (v - f.spd) * Math.min(1, dt * 8);
    const k = Math.min(1, f.spd / 3);
    f.ph += dt * (4 + f.spd * 2.2);
    const sw = Math.sin(f.ph) * 0.65 * k;
    f.legs[0].rotation.x = sw; f.legs[1].rotation.x = -sw;
    f.arms[0].rotation.x = -sw * 0.8;
    // the light arm points the flashlight ahead; otherwise it swings too
    f.arms[1].rotation.x += ((o.lit ? -1.25 : sw * 0.8) - f.arms[1].rotation.x) * Math.min(1, dt * 10);
    f.gr.position.set(o.x * S, Math.abs(Math.sin(f.ph)) * 0.03 * k, o.y * S);
    f.gr.rotation.y = o.yaw || 0;
    f.torch.visible = !!o.lit;
    const metres = Math.round(Math.hypot(o.x - P.x, o.y - P.y) * S);
    const key = `${o.name}|${metres}`;
    if (key !== f.shown) { f.shown = key; tagDraw(f, o.name || "", o.color || "#fff", metres); }
  }


  // ── the building ──
  let lvl, fixMs = [], elev = null, doorM, itemMeshes = [];
  const HV = [], HN = [], HC = [], UP = new THREE.Vector3(0, 1, 0), QI = new THREE.Quaternion(), sphB = new THREE.SphereGeometry(1, 8, 6), sphH = new THREE.SphereGeometry(1, 12, 9);
  const mx = (p, q, s, W) => W.clone().multiply(new THREE.Matrix4().compose(p, q, s));
  function hadd(base, M, col) {
    const gg = base.clone().toNonIndexed(); gg.applyMatrix4(M);
    const p = gg.attributes.position.array, n = gg.attributes.normal.array, c = new THREE.Color(col), k = 0.9 + R() * 0.2;
    for (let i = 0; i < p.length; i++) { HV.push(p[i]); HN.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) HC.push(c.r * k, c.g * k, c.b * k);
  }
  // a human figure, merged into one mesh: lying on the floor, under a sheet, or slumped on a seat
  function hum(cx, cz, a, y0, kind, t) {
    const W = new THREE.Matrix4().compose(new THREE.Vector3(cx, y0, cz), new THREE.Quaternion().setFromAxisAngle(UP, a), new THREE.Vector3(1, 1, 1)), V = (x, y, z) => new THREE.Vector3(x, y, z), sh = kind === "sheet", gr = sh ? 1.16 : 1, SC = 0xd9d6cc, tt = t % 4;
    const sk = new THREE.Color(rnd([0xc8b4a0, 0xb69f8a, 0x9a8678, 0xd2bfae])).lerp(new THREE.Color(0x8a9a9a), 0.25), clr = [0x9fb3c8, 0xe6e6e6, 0x24304a, 0x5f9a94][tt], pt = [0x9fb3c8, 0x2a3342, 0x1c2438, 0x5f9a94][tt], C = (c) => (sh ? SC : c);
    const ell = (p, rx, ry, rz, c, q, B) => hadd(B || sphB, mx(p, q || QI, V(rx, ry, rz), W), C(c));
    const limb = (A, B, ra, rb, c, sx, sz) => { const d = B.clone().sub(A), l = d.length() || 0.01; hadd(new THREE.CylinderGeometry(rb, ra, 1, 8, 1), mx(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), V(sx || 1, l, sz || 1), W), C(c)); };
    let J;
    if (kind === "seat") J = { hd: V(0, 1.35, -0.02), ch: V(0, 1.1, -0.12), pv: V(0, 0.52, 0.05), sl: V(-0.2, 1.12, -0.12), sr: V(0.2, 1.12, -0.12), el: V(-0.24, 0.85, -0.05), er: V(0.24, 0.85, -0.02), wl: V(-0.24, 0.6, 0.12), wr: V(0.2, 0.62, 0.38), hl: V(-0.09, 0.52, 0.05), hr: V(0.09, 0.52, 0.05), kl: V(-0.1, 0.5, 0.5), kr: V(0.1, 0.5, 0.5), al: V(-0.1, 0.08, 0.55), ar: V(0.1, 0.08, 0.55) };
    else {
      const y = 0.1, pr = !sh && R() < 0.4, sl = V(-0.2, y, -0.62), sr = V(0.2, y, -0.62), hl = V(-0.09, y - 0.02, 0.04), hr = V(0.09, y - 0.02, 0.04);
      const arm = (Sh, sd) => { const al = sh ? 0.08 : 0.15 + R() * 1.1, be = al + (sh ? 0 : (R() - 0.4) * 1.2), el = Sh.clone().add(V(sd * Math.sin(al) * 0.3, -0.02, Math.cos(al) * 0.3)), wr = el.clone().add(V(sd * Math.sin(be) * 0.27, -0.04, Math.cos(be) * 0.27)); return [el, wr]; };
      const leg = (Hp, sd) => { const g1 = sh ? 0.04 : 0.05 + R() * 0.3, d1 = g1 + (sh ? 0 : (R() - 0.3) * 0.5), kn = Hp.clone().add(V(sd * Math.sin(g1) * 0.45, -0.01, Math.cos(g1) * 0.45)), an = kn.clone().add(V(sd * Math.sin(d1) * 0.42, 0.04, Math.cos(d1) * 0.42)); return [kn, an]; };
      const [el, wl] = arm(sl, -1), [er, wr] = arm(sr, 1), [kl, al] = leg(hl, -1), [kr, ar] = leg(hr, 1);
      J = { hd: V(0, y + 0.01, -0.86), ch: V(0, y + 0.02, -0.5), pv: V(0, y, -0.02), sl, sr, el, er, wl, wr, hl, hr, kl, kr, al, ar, pr };
    }
    const mid = J.sl.clone().add(J.sr).multiplyScalar(0.5), sA = tt === 0 || tt === 3 ? sk : clr, sL = tt === 0 ? sk : pt;
    limb(mid, J.pv, 0.15 * gr, 0.12 * gr, clr, 1.35, 0.78);
    if (!sh) for (let i = 0; i < 3; i++) ell(mid.clone().lerp(J.pv, 0.2 + i * 0.25).add(V((R() - 0.5) * 0.1, 0.09, 0)), 0.15, 0.012, 0.03, new THREE.Color(clr).multiplyScalar(0.65).getHex());
    ell(mid, 0.2 * gr, 0.1 * gr, 0.1 * gr, clr); ell(J.pv, 0.17 * gr, 0.1 * gr, 0.13 * gr, pt);
    [J.sl, J.sr].forEach((p) => ell(p, 0.065 * gr, 0.06 * gr, 0.065 * gr, clr));
    limb(mid.clone().lerp(J.hd, 0.3), mid.clone().lerp(J.hd, 0.8), 0.045, 0.04, sk);
    limb(J.sl, J.el, 0.05 * gr, 0.04 * gr, clr); limb(J.sr, J.er, 0.05 * gr, 0.04 * gr, clr); limb(J.el, J.wl, 0.04 * gr, 0.032 * gr, sA); limb(J.er, J.wr, 0.04 * gr, 0.032 * gr, sA);
    limb(J.hl, J.kl, 0.085 * gr, 0.06 * gr, tt === 0 ? clr : pt); limb(J.hr, J.kr, 0.085 * gr, 0.06 * gr, tt === 0 ? clr : pt); limb(J.kl, J.al, 0.06 * gr, 0.042 * gr, sL); limb(J.kr, J.ar, 0.06 * gr, 0.042 * gr, sL);
    [J.kl, J.kr].forEach((p) => ell(p, 0.062 * gr, 0.058 * gr, 0.062 * gr, sL));
    [J.al, J.ar].forEach((p) => ell(p.clone().add(V(0, sh ? 0.03 : 0, 0.07)), sh ? 0.09 : 0.045, sh ? 0.07 : 0.04, 0.11, tt ? 0x1a1a1a : sk));
    if (!sh) {
      [J.wl, J.wr].forEach((p) => ell(p, 0.04, 0.028, 0.06, sk));
      [J.wl, J.wr].forEach((p, si) => { for (let i = 0; i < 4; i++) limb(p.clone().add(V((i - 1.5) * 0.012, 0, 0.05)), p.clone().add(V((i - 1.5) * 0.02 + (si ? 0.01 : -0.01), -0.005, 0.13 + R() * 0.02)), 0.009, 0.006, sk); });
      const fw = kind === "seat" ? V(0, -0.4, 0.9).normalize() : (J.pr ? V(0, -1, 0) : V(0, 1, 0)), up = kind === "seat" ? V(0, 1, 0.3).normalize() : V(0, 0, -1);
      fw.applyAxisAngle(up, (R() - 0.5) * 1.4);
      const zz = fw.clone().normalize(), yy = up.clone().sub(zz.clone().multiplyScalar(up.dot(zz))).normalize(), xx = yy.clone().cross(zz), q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, yy, zz));
      const hp = (a2, b, c) => J.hd.clone().addScaledVector(xx, a2).addScaledVector(yy, b).addScaledVector(zz, c), hair = rnd([0x2a1a10, 0x555555, 0x1a1a1a, 0x6a4a2a]);
      ell(hp(0, 0.02, 0), 0.1, 0.12, 0.11, sk, q, sphH); ell(hp(0, -0.07, 0.025), 0.08, 0.07, 0.09, sk, q, sphH); ell(hp(0, 0.07, -0.025), 0.105, 0.095, 0.115, hair, q, sphH);
      [-1, 1].forEach((s2) => { ell(hp(s2 * 0.1, 0, 0), 0.02, 0.04, 0.03, sk, q); ell(hp(s2 * 0.045, 0.03, 0.1), 0.03, 0.018, 0.02, 0x3a2a2a, q); });
      ell(hp(0, -0.01, 0.115), 0.018, 0.03, 0.03, sk, q); ell(hp(0, -0.065, 0.1), 0.035, 0.015, 0.02, 0x2a0a0a, q); ell(hp(0, -0.095, 0.09), 0.02, 0.03, 0.012, 0x5a0808, q);
      if (kind === "floor" && !J.pr) { ell(J.ch.clone().add(V((R() - 0.5) * 0.12, 0.1, R() * 0.15)), 0.07, 0.012, 0.09, 0x5a0808); if (R() < 0.5) ell(J.pv.clone().add(V(0.06, 0.1, -0.05)), 0.06, 0.012, 0.07, 0x5a0808); }
    } else hadd(sphB, mx(J.ch.clone().add(V(0.04, 0.11, 0.05)), QI, V(0.08, 0.013, 0.1), W), 0x6a0a0a);
  }
  const isCor = (z) => /^(ring|hall[WE]|cross)/.test(z);
  function wallCands() {
    const c = [];
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      if (g[y][x] !== 0 || !isCor(zn[y][x])) continue;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g[y + b][x + a] === 1 && !doors.some((d) => Math.hypot(d.x - (x + a), d.y - (y + b)) < 2.5) && !(x + a === exitT.x && y + b === exitT.y)) c.push([x, y, a, b]);
    }
    // the same shuffle on every phone
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
    return c;
  }
  function dmapL(sx, sy) {
    const d = new Int16Array(N * N).fill(-1), q = [sx + sy * N]; d[q[0]] = 0;
    for (let i = 0; i < q.length; i++) { const c = q[i], x = c % N, y = (c / N) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, ny = y + b; if (nx >= 0 && ny >= 0 && nx < N && ny < N && !g[ny][nx] && d[nx + ny * N] < 0) { d[nx + ny * N] = d[c] + 1; q.push(nx + ny * N); } } }
    return d;
  }
  function stex(lines) { return ctex(256, 160, (c, w, h) => { c.fillStyle = "#0f5a3a"; c.fillRect(0, 0, w, h); c.strokeStyle = "#e8fff0"; c.lineWidth = 5; c.strokeRect(6, 6, w - 12, h - 12); c.fillStyle = "#fff"; c.font = "bold 30px Arial,sans-serif"; c.textBaseline = "middle"; lines.forEach((l, i) => { c.textAlign = "left"; c.fillText(l[0], 22, 38 + i * 42); c.textAlign = "right"; c.fillText(l[1], w - 22, 38 + i * 42); }); }); }
  function ptex(t) { return ctex(256, 64, (c, w, h) => { c.fillStyle = "#14305a"; c.fillRect(0, 0, w, h); c.strokeStyle = "#cfe"; c.lineWidth = 4; c.strokeRect(4, 4, w - 8, h - 8); c.fillStyle = "#fff"; c.font = "bold 32px Arial,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(t, w / 2, 34); }); }
  function board(tex, w, h, wx, wy, n, y, em) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: em || 0.3, roughness: 0.6 }));
    m.position.set((wx + 0.5 + n[0] * 0.5) * S + n[0] * 0.02, y, (wy + 0.5 + n[1] * 0.5) * S + n[1] * 0.02); m.rotation.y = Math.atan2(n[0], n[1]); lvl.add(m);
  }
  function drawDisp(c, st) {
    const x = c.getContext("2d"); x.fillStyle = "#050805"; x.fillRect(0, 0, 256, 96); x.textAlign = "center"; x.textBaseline = "middle";
    x.font = 'bold 34px "Courier New",monospace'; x.fillStyle = st ? "#4dff8a" : "#ff3b3b"; x.fillText(st ? "▲  READY" : "NO POWER", 128, 40);
    x.font = "16px Arial"; x.fillStyle = st ? "#9fffc0" : "#a33"; x.fillText(st ? "DOORS OPENING" : "OUT OF SERVICE", 128, 76);
  }

  function build() {
    lvl = new THREE.Group(); scene.add(lvl); fixMs = [];
    const m4 = new THREE.Matrix4();
    const cs = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (g[y][x] === 1 && !(x === exitT.x && y === exitT.y)) { let v = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const yy = y + b, xx = x + a; if (yy >= 0 && yy < N && xx >= 0 && xx < N && g[yy][xx] !== 1) v = 1; } if (v) cs.push([x, y]); }
    const im = new THREE.InstancedMesh(boxG, wallM, cs.length); im.frustumCulled = false; im.castShadow = im.receiveShadow = true;
    cs.forEach(([x, y], i) => { m4.setPosition((x + 0.5) * S, S * 0.575, (y + 0.5) * S); im.setMatrixAt(i, m4); }); lvl.add(im);
    floorT.repeat.set(N * S / 6, HH * S / 6); ceilT.repeat.set(N * S / 6, HH * S / 6);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(N * S, HH * S), floorM); fl.rotation.x = -Math.PI / 2; fl.position.set(N * S / 2, 0, HH * S / 2); fl.receiveShadow = true;
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(N * S, HH * S), ceilM); ce.rotation.x = Math.PI / 2; ce.position.set(N * S / 2, S * 1.15, HH * S / 2); lvl.add(fl, ce);
    // the elevator: frame, two sliding doors, display, call panel, hazard strip, lit cabin
    {
      const EX = (exitT.x + 0.5) * S, EZ = (exitT.y + 0.5) * S, FX = exitT.x * S;
      const mtT = ctex(256, 256, (c, w, h) => { c.fillStyle = "#9a9ea2"; c.fillRect(0, 0, w, h); for (let i = 0; i < w; i++) { c.fillStyle = "rgba(" + (R() < 0.5 ? "255,255,255" : "0,0,0") + "," + R() * 0.13 + ")"; c.fillRect(i, 0, 1, h); } for (let i = 0; i < 25; i++) { c.strokeStyle = "rgba(0,0,0," + R() * 0.18 + ")"; c.beginPath(); const x = R() * w, y = R() * h; c.moveTo(x, y); c.lineTo(x + R() * 40 - 20, y + R() * 40 - 20); c.stroke(); } });
      const mt = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.28, metalness: 0.9, map: mtT, bumpMap: mtT, bumpScale: 0.3 }); lmPatch(mt);
      const cab = new THREE.Mesh(boxG, new THREE.MeshStandardMaterial({ color: 0x8a8e92, roughness: 0.4, metalness: 0.8, map: mtT, side: THREE.BackSide })); cab.position.set(EX, S * 0.575, EZ); lvl.add(cab);
      const rail = new THREE.Mesh(rbox(0.08, 0.08, 2.4, 0.03, 2), HM); rail.position.set(EX + 1.35, 1.05, EZ); lvl.add(rail);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2), new THREE.MeshBasicMaterial({ color: 0xfff2d0 })); strip.position.set(EX, 3.3, EZ); lvl.add(strip);
      const flr = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.8 })); flr.rotation.x = -Math.PI / 2; flr.position.set(EX, 0.02, EZ); lvl.add(flr);
      [-1, 1].forEach((q) => { const j = new THREE.Mesh(rbox(0.2, 3.45, 0.75, 0.04, 2), mt); j.position.set(FX + 0.1, 1.72, EZ + q * 1.125); lvl.add(j); });
      const hd = new THREE.Mesh(rbox(0.2, 0.6, 3, 0.04, 2), mt); hd.position.set(FX + 0.1, 3.15, EZ); lvl.add(hd);
      const mkD = (q) => { const d = new THREE.Mesh(rbox(0.1, 2.9, 0.8, 0.02, 2), mt); d.position.set(FX + 0.3, 1.45, EZ + q * 0.4); d.castShadow = true; lvl.add(d); return d; }, dl = mkD(-1), dr = mkD(1);
      const dc = document.createElement("canvas"); dc.width = 256; dc.height = 96; const dt = new THREE.CanvasTexture(dc); dt.encoding = THREE.sRGBEncoding;
      const disp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshBasicMaterial({ map: dt })); disp.rotation.y = -Math.PI / 2; disp.position.set(FX - 0.003, 3.1, EZ); lvl.add(disp);
      const pl = new THREE.Mesh(rbox(0.08, 1.1, 0.45, 0.02, 2), mt); pl.position.set(FX - 0.04, 1.3, EZ - S); lvl.add(pl);
      doorM = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff1010, emissiveIntensity: 0.9 })); doorM.position.set(FX - 0.1, 1.5, EZ - S); lvl.add(doorM);
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16).rotateZ(Math.PI / 2), HM); b2.position.set(FX - 0.1, 1.2, EZ - S); lvl.add(b2);
      const hz = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 2.9), new THREE.MeshStandardMaterial({ map: ctex(64, 64, (c) => { for (let i = -2; i < 8; i++) { c.fillStyle = i % 2 ? "#e8c020" : "#151515"; c.beginPath(); c.moveTo(0, i * 10); c.lineTo(64, i * 10 - 20); c.lineTo(64, i * 10 - 10); c.lineTo(0, i * 10 + 10); c.fill(); } }), roughness: 0.6 }));
      hz.rotation.x = -Math.PI / 2; hz.rotation.z = Math.PI / 2; hz.position.set(FX - 0.35, 0.025, EZ); lvl.add(hz);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2222 })); lamp.position.set(FX - 0.1, 3.42, EZ + 0.9); lvl.add(lamp);
      board(ptex("ELEVATOR"), 1.6, 0.4, exitT.x, exitT.y + 1, [-1, 0], 2.2, 0.6);
      elL.position.set(EX - 0.4, 2.6, EZ);
      elev = { dl, dr, z: EZ, dc, dt, lamp, open: 0, state: -1 };
    }
    // ceiling tubes
    for (let y = 2; y < 23; y++) for (let x = 2; x < 31; x++) {
      if (g[y][x] === 1 || x % 3 || y % 3 || !zn[y][x]) continue;
      const m = fixM.clone(); m.color.setScalar(0.8);
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8).rotateZ(Math.PI / 2), m); f.position.set((x + 0.5) * S, S * 1.15 - 0.07, (y + 0.5) * S); lvl.add(f);
      const hs = new THREE.Mesh(rbox(1.7, 0.07, 0.5, 0.02, 2), HM); hs.position.set(f.position.x, S * 1.15 - 0.03, f.position.z); lvl.add(hs);
      const gs = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0x9fffd0, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })); gs.scale.set(3, 3, 1); gs.position.copy(f.position); gs.position.y -= 0.3; lvl.add(gs);
      fixMs.push({ m, b: R() < 0.25, k: R() * 9, s: gs, z: zn[y][x], x: x + 0.5, y: y + 0.5 });
    }
    // furniture, props and the dead
    HV.length = HN.length = HC.length = 0;
    const parts = [], Qn = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), V2 = new THREE.Vector3(), BL = 0x6b0a0a, monitors = [];
    const P_ = (x, y, z, w, h, d, c, ry, rx, rz) => parts.push([x, y, z, w, h, d, c, ry || 0, rx || 0, rz || 0]);
    const TT = (cx, cz, a) => (lx, ly, lz, w, h, d, c, dy, rx, rz) => P_(cx + lx * Math.cos(a) + lz * Math.sin(a), ly, cz - lx * Math.sin(a) + lz * Math.cos(a), w, h, d, c, a + (dy || 0), rx, rz);
    furn.forEach(({ x, y, k, s, r, sd, t }) => {
      const cx = (x + 0.5) * S, cz = (y + 0.5) * S, e = TT(cx, cz, r || 0);
      if (k === "bed") {
        const tl = s === "broken" ? 0.16 : 0;
        [[-0.7, -1.1], [0.7, -1.1], [-0.7, 1.1], [0.7, 1.1]].forEach(([a, b]) => e(a, 0.15, b, 0.08, 0.3, 0.08, 0x888c90));
        e(0, 0.36, 0, 1.5, 0.12, 2.3, 0xd8dde0, 0, 0, tl); e(0, 0.65, -1.15, 1.5, 0.6, 0.08, 0xb9bec2); e(0, 0.55, 1.15, 1.5, 0.35, 0.08, 0xb9bec2); e(-0.78, 0.64, 0.1, 0.05, 0.28, 1.6, 0xaab0b5); e(0.78, 0.64, 0.1, 0.05, 0.28, 1.6, 0xaab0b5);
        e(0, 0.52 + tl * 0.5, 0, 1.35, 0.18, 2.1, s === "messy" || s === "bloody" ? 0xd8d0b0 : 0xcfe0e6, 0, 0, tl); e(0, 0.66, -0.8, 0.8, 0.12, 0.45, 0xffffff, s === "messy" ? 0.4 : 0);
        if (s === "neat") e(0, 0.64, 0.4, 1.38, 0.1, 1.2, 0x7fb4c8); else if (s === "messy") e(0.2, 0.62, 0.5, 1.3, 0.1, 1.1, 0x7fb4c8, 0.5, 0, 0.1); else if (s === "bloody") { e(0, 0.64, 0.4, 1.38, 0.1, 1.2, 0x9a2a2a); e(0.1, 0.7, 0.5, 0.6, 0.02, 0.7, BL); } else if (s === "body") hum(cx, cz, 0, 0.6, "sheet", 0);
        e(sd * 1.2, 0.9, 0.8, 0.04, 1.8, 0.04, 0xcccccc); e(sd * 1.2, 0.02, 0.8, 0.5, 0.04, 0.5, 0x555555); e(sd * 1.2, 1.6, 0.8, 0.22, 0.36, 0.1, 0x9ac8e8); e(sd * 1.25, 0.3, -0.95, 0.6, 0.6, 0.6, 0xb0a58a); e(sd * 1.25, 0.62, -0.95, 0.64, 0.04, 0.64, 0xd8d0c0);
        if (R() < 0.6) e(sd * 1.45, 1.1, -0.2, 0.04, 2, 1.5, 0xb8d8c8, 0, 0, (R() - 0.5) * 0.12);
        if (zn[y][x] === "icu") { e(sd * 1.25, 0.8, -0.95, 0.06, 0.9, 0.06, 0x333333); e(sd * 1.25, 1.25, -0.95, 0.5, 0.35, 0.25, 0x111111); monitors.push([cx + sd * 1.25, 1.25, cz - 0.95 + 0.14]); }
      } else if (k === "shelf") { const fa = s === "fallen"; e(0, fa ? 0.8 : 1.1, 0, 0.9, 2.2, 2.8, 0x8a7a5a, 0, 0, fa ? 0.5 : 0); for (let i = 0; i < 5; i++) e((R() - 0.5) * 0.1 + (fa ? 0.9 : 0), fa ? 0.1 : 0.5 + (i % 3) * 0.6, -1.1 + i * 0.55, 0.3, 0.35, 0.25, [0xff6b9d, 0x60b4ff, 0x60d6a0, 0xffc43d][i % 4], R() * 3); }
      else if (k === "drawer") { e(0, 0.9, 0, 0.9, 1.8, 2.8, 0x9aa3a8); for (let i = 0; i < 3; i++) e(sd * 0.46, 0.5 + i * 0.55, 0, 0.06, 0.08, 0.5, 0x222222); if (s === "open") { P_(cx + sd * 1.2, 1.0, cz, 1.9, 0.08, 0.8, 0xb8bcc0); hum(cx + sd * 1.2, cz, sd * Math.PI / 2, 1.04, "sheet", 0); } }
      else if (k === "table") { e(0, 0.85, 0, 1.5, 0.15, 2.8, 0xcfd8dc); e(0, 0.4, 0, 0.3, 0.8, 0.3, 0x777777); if (s === "body") hum(cx, cz, 0, 0.93, "sheet", 0); if (y === 16) { e(0.6, 2.4, 0, 0.9, 0.1, 0.9, 0xf2f2e8); e(0.6, 3, 0, 0.05, 1.2, 0.05, 0x999999); e(1.3, 0.7, 0.5, 0.5, 0.05, 0.7, 0xb8bcc0); } }
      else if (k === "bench") { if (s === "broken") { e(0, 0.3, 0, 2.8, 0.12, 0.8, 0x5a4a3a, 0, 0, 1.2); e(0.4, 0.15, 0.6, 2.5, 0.4, 0.12, 0x333333, 0.4); } else { e(0, 0.4, 0, 2.8, 0.12, 0.8, 0x5a4a3a); e(0, 0.2, 0, 2.5, 0.4, 0.12, 0x333333); e(0, 0.8, -0.4, 2.8, 0.6, 0.1, 0x5a4a3a); if (s === "body") hum(cx, cz, 0, 0, "seat", (R() * 4) | 0); } }
      else if (k === "gurney") { e(0, 0.95, 0, 0.8, 0.1, 2, 0xdde2e5); e(0, 0.55, 0, 0.06, 0.8, 1.8, 0x999999); [[-0.35, -0.8], [0.35, -0.8], [-0.35, 0.8], [0.35, 0.8]].forEach(([a, b]) => e(a, 0.1, b, 0.1, 0.2, 0.1, 0x222222)); e(0, 1.04, 0, 0.7, 0.08, 1.8, 0x9fb3c8); if (s === "body") hum(cx, cz, r || 0, 1.08, "sheet", 0); else e(0.1, 1.09, 0.2, 0.4, 0.02, 0.5, BL); }
      else if (k === "wheel") { const tp = s === "tip"; e(0, tp ? 0.3 : 0.5, 0, 0.5, 0.08, 0.5, 0x333844, 0, 0, tp ? 1.5 : 0); e(tp ? 0.5 : 0, tp ? 0.25 : 0.85, -0.25, 0.5, 0.7, 0.06, 0x333844, 0, 0, tp ? 1.5 : 0); e(-0.3, 0.3, 0.1, 0.06, 0.6, 0.6, 0x111111); e(0.3, 0.3, 0.1, 0.06, 0.6, 0.6, 0x111111); }
      else if (k === "cart") { e(0, 0.5, 0, 0.8, 0.9, 0.55, 0xb5bcc2); for (let i = 0; i < 3; i++) e(0, 0.3 + i * 0.3, 0.28, 0.7, 0.22, 0.03, [0xe0e0e0, 0xcc4444, 0x4488cc][i]); e(0, 1, 0, 0.9, 0.05, 0.65, 0x888888); e(0.2, 1.08, 0, 0.2, 0.12, 0.15, 0xeeeeee, 0.5); }
      else if (k === "trash") { const tp = s === "tip"; e(0, tp ? 0.2 : 0.3, 0, 0.4, 0.6, 0.4, 0x55605a, 0, 0, tp ? 1.5 : 0); if (tp) for (let i = 0; i < 5; i++) e(0.4 + R() * 0.8, 0.05, (R() - 0.5) * 0.8, 0.2, 0.1, 0.2, 0xddd8cc, R() * 3); }
      else if (k === "vend") { e(0, 1, 0, 1.2, 2, 0.9, 0x2a4a8a); e(0, 1.2, 0.46, 0.9, 1.2, 0.04, 0xffd070); e(0, 0.2, 0.46, 0.7, 0.2, 0.04, 0x111111); }
      else if (k === "counter") { e(0, 0.5, 0, 2.9, 1, 0.8, 0x6a5a4a); e(0, 1.03, 0, 3, 0.08, 0.95, 0xcfcfc8); if (x === 6) e(0.3, 1.25, -0.1, 0.5, 0.4, 0.05, 0x111111); }
      else if (k === "plant") { e(0, 0.2, 0, 0.5, 0.4, 0.5, 0x7a4a3a); for (let i = 0; i < 4; i++) e((R() - 0.5) * 0.3, 0.8, (R() - 0.5) * 0.3, 0.05, 0.9, 0.05, 0x5a4a2a, 0, (R() - 0.5) * 0.8, (R() - 0.5) * 0.8); e(0.2, 1.2, 0.1, 0.3, 0.05, 0.2, 0x6a5a2a, 0.6); }
      else if (k === "body") hum(cx, cz, r || 0, 0, "floor", t || 0);
    });
    deco.forEach((d) => {
      const wx = d.x * S, wz = d.y * S;
      if (d.k === "paper") P_(wx, 0.012, wz, 0.35, 0.012, 0.25, 0xe8e6dc, d.r);
      else if (d.k === "print") { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: fpT, transparent: true, depthWrite: false, opacity: 0.7 })); m.rotation.x = -Math.PI / 2; m.rotation.z = d.r; m.position.set(wx, 0.028, wz); lvl.add(m); }
      else if (d.k === "glass") P_(wx, 0.01, wz, 0.1, 0.012, 0.06, 0xaaccdd, d.r);
      else if (d.k === "pill") P_(wx, 0.01, wz, 0.05, 0.02, 0.05, [0xffffff, 0xff6b6b, 0xffd34d][(d.r * 10) % 3 | 0], d.r);
      else if (d.k === "ctile") { P_(wx, 0.04, wz, 1.2, 0.05, 1.2, 0xe0ddd0, d.r, 0.05, 0.05); P_(wx + 0.7, 0.015, wz + 0.3, 0.3, 0.02, 0.3, 0xc8c4b8, d.r); }
      else if (d.k === "htile") P_(wx, S * 1.15 - 0.6, wz, 1.2, 0.05, 1.2, 0xe0ddd0, d.r, 0.7, 0.1);
      else if (d.k === "chair") { P_(wx, 0.3, wz, 0.5, 0.06, 0.5, 0x3a4a5a, d.r, 0, 1.3); P_(wx + 0.25, 0.28, wz, 0.5, 0.05, 0.5, 0x3a4a5a, d.r, 0, 0.1); P_(wx - 0.1, 0.1, wz + 0.2, 0.04, 0.5, 0.04, 0x888888, d.r, 0, 1.2); }
      else if (d.k === "ivfall") { P_(wx, 0.04, wz, 0.04, 1.8, 0.04, 0xcccccc, d.r, Math.PI / 2); P_(wx, 0.03, wz + 0.8, 0.5, 0.04, 0.5, 0x555555, d.r); P_(wx + 0.1, 0.1, wz - 0.7, 0.22, 0.3, 0.1, 0x9ac8e8, d.r); }
      else if (d.k === "cable") P_(wx, S * 1.15 - 0.5, wz, 0.03, 1, 0.03, 0x1a1a1a, 0, (R() - 0.5) * 0.3);
    });
    const wc = wallCands();
    for (let i = 0; i < 8 && i < wc.length; i++) { const [x, y, a, b] = wc[i]; P_((x + 0.5 + a * 0.5) * S - a * 0.14, 1.1, (y + 0.5 + b * 0.5) * S - b * 0.14, 0.2, 0.5, 0.2, 0xcc2222); P_((x + 0.5 + a * 0.5) * S - a * 0.14, 1.4, (y + 0.5 + b * 0.5) * S - b * 0.14, 0.1, 0.08, 0.1, 0x111111); }
    for (let i = 8; i < 18 && i < wc.length; i++) { const [x, y, a, b] = wc[i], m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: bloodT, transparent: true, depthWrite: false, opacity: 0.85, color: 0x777777 })); m.position.set((x + 0.5 + a * 0.5) * S - a * 0.02, 1 + R() * 0.7, (y + 0.5 + b * 0.5) * S - b * 0.02); m.rotation.y = Math.atan2(-a, -b); lvl.add(m); }
    monitors.forEach((p) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.25), new THREE.MeshBasicMaterial({ color: R() < 0.35 ? 0xff2a2a : 0x33ff77 })); m.position.set(p[0], p[1], p[2]); lvl.add(m); });
    bl.forEach(([x, y, sz, an, sx]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshBasicMaterial({ map: bloodT, transparent: true, depthWrite: false, opacity: 0.9, color: 0x888888 })); m.rotation.x = -Math.PI / 2; m.rotation.z = an; m.scale.x = sx; m.position.set(x * S, 0.025, y * S); lvl.add(m); });
    if (HV.length) {
      const hg = new THREE.BufferGeometry(); hg.setAttribute("position", new THREE.Float32BufferAttribute(HV, 3)); hg.setAttribute("normal", new THREE.Float32BufferAttribute(HN, 3)); hg.setAttribute("color", new THREE.Float32BufferAttribute(HC, 3));
      const hmt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }); lmPatch(hmt);
      const hms = new THREE.Mesh(hg, hmt); hms.castShadow = hms.receiveShadow = true; hms.frustumCulled = false; lvl.add(hms);
    }
    if (parts.length) {
      const fm = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.2 }); lmPatch(fm);
      const fi = new THREE.InstancedMesh(rbG, fm, parts.length), cc = new THREE.Color(); fi.frustumCulled = false; fi.castShadow = fi.receiveShadow = true;
      parts.forEach((p, i) => { E.set(p[8], p[7], p[9], "YXZ"); Qn.setFromEuler(E); m4.compose(V.set(p[0], p[1], p[2]), Qn, V2.set(p[3] / S, p[4] / (S * 1.15), p[5] / S)); fi.setMatrixAt(i, m4); cc.set(p[6]); fi.setColorAt(i, cc); });
      lvl.add(fi);
    }
    // name plates over the doors, and green direction signs whose arrows follow the real shortest way
    doors.forEach((d) => { const n = d.n, rx = n[1], ry = -n[0]; let tx = d.x - rx, ty = d.y - ry; if (g[ty][tx] !== 1) { tx = d.x + rx; ty = d.y + ry; } if (g[ty][tx] === 1) board(ptex(d.nm), 1.8, 0.45, tx, ty, n, 2.3, 0.35); });
    const DS = [["ICU", 20, 7], ["WARD A", 6, 7], ["WARD B", 11, 7], ["PHARMACY", 25, 7], ["MAIN HALL", 9, 16], ["SURGERY", 20, 16], ["MORGUE", 25, 16], ["ELEVATOR", 30, 11]];
    const dms = DS.map((d) => dmapL(d[1], d[2])), sg = [];
    for (const [x, y, a, b] of wallCands()) {
      if (sg.length >= 16) break;
      if (sg.some((q) => Math.abs(q[0] - x) + Math.abs(q[1] - y) < 7)) continue;
      sg.push([x, y]);
      const n = [-a, -b], rx = n[1], ry = -n[0];
      const order = DS.map((d, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const lines = order.slice(0, 3).map((i) => { const dm = dms[i], L = dm[(x - rx) + (y - ry) * N], Rt = dm[(x + rx) + (y + ry) * N]; let ar; if (L < 0 && Rt < 0) ar = "↑"; else ar = (Rt >= 0 && (L < 0 || Rt < L)) ? "→" : "←"; return [DS[i][0], ar]; });
      board(stex(lines), 1.7, 1.05, x + a, y + b, n, 1.9, 0.3);
    }
    // fuses and batteries
    itemMeshes = itemList.map((it) => {
      const o = new THREE.Group(); o.position.set(it.x * S, 0.9, it.y * S);
      const mine = it.mine !== false, col = it.t === "f" ? new THREE.Color(it.color || "#cca030") : new THREE.Color(0x33aa44);
      if (it.t === "f") o.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: col, emissive: mine ? 0x44ff66 : col, emissiveIntensity: mine ? 0.8 : 0.35 })));
      else o.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x33aa44, emissive: 0x22ff44, emissiveIntensity: 0.6 })));
      const gs = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: it.t === "f" ? (mine ? 0x66ff88 : col) : 0x44ff66, transparent: true, opacity: mine ? 0.7 : 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      gs.scale.set(1.6, 1.6, 1); o.add(gs); lvl.add(o);
      return o;
    });
    // lockers
    const lm = new THREE.MeshStandardMaterial({ color: 0x56685d, roughness: 0.45, metalness: 0.6, map: wallT, bumpMap: wallT, bumpScale: 0.5 }); lmPatch(lm);
    const lkG = rbox(0.95, 2.3, 0.95, 0.05, 3), ldG = rbox(0.8, 2, 0.04, 0.02, 2), lhG = rbox(0.04, 0.28, 0.06, 0.02, 2), hmat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.9, roughness: 0.3 });
    lockers.forEach((l) => {
      const g2 = new THREE.Group(); g2.position.set((l.x - l.nx * 0.33) * S, 1.15, (l.y - l.ny * 0.33) * S); g2.rotation.y = Math.atan2(l.nx, l.ny);
      const o = new THREE.Mesh(lkG, lm); o.castShadow = o.receiveShadow = true; g2.add(o);
      const d = new THREE.Mesh(ldG, lm); d.position.z = 0.49; g2.add(d);
      const h = new THREE.Mesh(lhG, hmat); h.position.set(0.25, 0, 0.53); g2.add(h);
      for (let i = 0; i < 4; i++) { const s2 = new THREE.Mesh(boxG, blk); s2.scale.set(0.5 / S, 0.04 / (S * 1.15), 0.02 / S); s2.position.set(0, 0.75 - i * 0.1, 0.52); g2.add(s2); }
      lvl.add(g2);
    });
    const ckT = ctex(128, 128, (c) => { c.strokeStyle = "rgba(15,12,10,.85)"; c.lineWidth = 2; for (let k = 0; k < 3; k++) { c.beginPath(); let x = 64, y = 10; c.moveTo(x, y); for (let i = 0; i < 9; i++) { x += (R() - 0.5) * 26; y += 10 + R() * 8; c.lineTo(x, y); } c.stroke(); } });
    ckT.wrapS = ckT.wrapT = THREE.ClampToEdgeWrapping;
    for (let i = 18; i < 26 && i < wc.length; i++) { const [x, y, a, b] = wc[i], m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: ckT, transparent: true, depthWrite: false, opacity: 0.8 })); m.position.set((x + 0.5 + a * 0.5) * S - a * 0.02, 1.5 + R() * 0.6, (y + 0.5 + b * 0.5) * S - b * 0.02); m.rotation.y = Math.atan2(-a, -b); lvl.add(m); }
  }

  // ── the awareness effects ──
  const PRN = [];
  for (let i = 0; i < 28; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: fpT, transparent: true, depthWrite: false, opacity: 0 })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); PRN.push({ m, age: 99 }); }
  let prI = 0, mI = 0;
  const printAt = (x, y, a) => { const p = PRN[prI++ % PRN.length]; p.age = 0; p.m.visible = true; p.m.position.set(x * S, 0.03, y * S); p.m.rotation.z = a; };
  const MN = 60, mP = new Float32Array(MN * 3).fill(-99), mC = new Float32Array(MN * 3), mV = new Float32Array(MN * 3), mL = new Float32Array(MN);
  const mGeo = new THREE.BufferGeometry(); mGeo.setAttribute("position", new THREE.BufferAttribute(mP, 3)); mGeo.setAttribute("color", new THREE.BufferAttribute(mC, 3));
  const mist = new THREE.Points(mGeo, new THREE.PointsMaterial({ size: 1.5, map: glowT, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); mist.frustumCulled = false; scene.add(mist);
  const puff = (x, y, z, vx, vz) => { const i = mI++ % MN; mP.set([x, y, z], i * 3); mV.set([vx, 0.25, vz], i * 3); mL[i] = 1.6; };
  function mistUpd(dt) {
    for (let i = 0; i < MN; i++) { if (mL[i] <= 0) continue; mL[i] -= dt; for (let a = 0; a < 3; a++) mP[i * 3 + a] += mV[i * 3 + a] * dt; const k = Math.max(0, mL[i] / 1.6) * 0.2; mC.set([k, k, k * 1.05], i * 3); if (mL[i] <= 0) mP[i * 3 + 1] = -99; }
    mGeo.attributes.position.needsUpdate = mGeo.attributes.color.needsUpdate = true;
  }
  const silT = ctex(64, 128, (c) => { c.fillStyle = "#000"; c.beginPath(); c.ellipse(32, 18, 10, 13, 0, 0, 7); c.fill(); c.fillRect(22, 30, 20, 52); c.fillRect(14, 30, 8, 56); c.fillRect(42, 30, 8, 56); c.fillRect(24, 80, 6, 46); c.fillRect(34, 80, 6, 46); });
  silT.wrapS = silT.wrapT = THREE.ClampToEdgeWrapping;
  const shd = new THREE.Sprite(new THREE.SpriteMaterial({ map: silT, color: 0x0a0a0c, transparent: true, opacity: 0, depthWrite: false, fog: false })); shd.scale.set(1.2, 2.4, 1); scene.add(shd);
  const coneG = new THREE.ConeGeometry(3.4, 15, 24, 1, true); coneG.rotateX(Math.PI / 2); coneG.translate(0, 0, -7.5);
  const coneM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { u: { value: 0.05 } },
    vertexShader: "varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "varying vec3 p;uniform float u;void main(){float d=clamp(-p.z/15.,0.,1.);gl_FragColor=vec4(vec3(1.,.95,.8)*u*(1.-d)*(.3+d),1.);}" });
  const beam = new THREE.Group(), cone = new THREE.Mesh(coneG, coneM); cone.frustumCulled = false; beam.add(cone); scene.add(beam);
  const fwS = new THREE.Vector3(0, 0, -1);
  let prT = 0, mrt = 0, bnT = 0, shT = 12, shL = 0, AW = aware, flashT = 0, deadT = 0;

  build();
  applyQ();

  // one frame. view: { mode ("play" | "dead" | "won" | "title" | "watch"), P { x, y, yaw, pitch, fl, bat,
  //   hid, moving, run, bob, tired, stam }, monsters [M], others [{ id, x, y, yaw, color, name, lit, hid }],
  //   lit (Set), ready (elevator open for you), items' got flags (itemsGot), tlv, flick, shake, catcher (index) }
  function frame(view, dt, t) {
    const { P, monsters = [], others = [] } = view, play = view.mode === "play";
    const key = [...(view.lit || [])].sort().join(",");
    if (key !== litKey) { litKey = key; refreshLM(view.lit || new Set()); }
    if (view.itemsGot) view.itemsGot.forEach((got, i) => { if (itemMeshes[i]) itemMeshes[i].visible = !got; });
    while (mons.length < monsters.length) mons.push(makeMonster());
    // the nearest monster: the danger glow and the awareness effects
    let near = null, nd = Infinity;
    monsters.forEach((M) => { if (M.st === "sleep") return; const d = Math.hypot(P.x - M.x, P.y - M.y); if (d < nd) { nd = d; near = M; } });
    const dg = play && near ? Math.max(0, 1 - nd / 9) * (near.st === "chase" ? 1 : 0.55) : 0;
    const TLV = view.tlv || 0;
    const shake = (view.shake || 0) + (view.mode === "dead" ? 1 : 0), flick = view.flick || 0;
    const bobY = P.moving ? Math.sin(P.bob || 0) * 0.06 : 0;
    cam.position.set(P.x * S, 1.7 + bobY - (P.hid ? 0.1 : 0), P.y * S);
    cam.position.x += (FR() - 0.5) * (shake + dg * 0.04) * 0.15; cam.position.y += (FR() - 0.5) * (shake + dg * 0.04) * 0.15;
    cam.rotation.set((P.pitch || 0) + (P.moving ? Math.sin((P.bob || 0) * 0.5) * 0.008 : 0), P.yaw, 0);
    const fw = new THREE.Vector3(-Math.sin(P.yaw) * Math.cos(P.pitch || 0), Math.sin(P.pitch || 0), -Math.cos(P.yaw) * Math.cos(P.pitch || 0));
    fwS.lerp(fw, Math.min(1, dt * 9)); spot.position.copy(cam.position); spot.target.position.copy(cam.position).add(fwS);
    const torch = P.fl && P.bat > 0;
    let fi = torch ? 2.6 : 0;
    if (torch && (P.bat < 20 || flick > 0 || (dg > 0.5 && FR() < dg * 0.25) || (TLV >= 2 && FR() < 0.04 * TLV))) fi *= FR() < 0.5 ? 0.15 : 0.7;
    spot.intensity = fi; halo.position.copy(cam.position); halo.intensity = torch ? 0.35 : 0.12;
    const lit = view.lit || new Set();
    fixMs.forEach((f) => {
      const close = monsters.some((M) => M.st !== "sleep" && Math.hypot(f.x - M.x, f.y - M.y) < 7);
      const on = lit.has(f.z) ? (f.b ? (Math.sin(t * (7 + f.k) + f.k) > 0.2 ? 1 : 0.2) : (flick > 0 && FR() < 0.5 ? 0.1 : (close && FR() < 0.45 ? 0.1 : 1))) : 0;
      f.m.color.setScalar(0.85 * on); f.s.material.opacity = 0.3 * on;
    });
    LE.value = 0.85 * (flick > 0 && FR() < 0.4 ? 0.35 : (dg > 0.5 && FR() < 0.08 ? 0.4 : 1));
    monsters.forEach((M, i) => {
      const m = mons[i];
      m.mon.visible = M.st !== "sleep";
      m.mon.position.set(M.x * S, 0, M.y * S);
      m.mon.rotation.y = view.mode === "dead" && view.catcher === i ? Math.atan2(P.x - M.x, P.y - M.y) : Math.atan2(M.vx || 0, M.vy || 1);
      monAnim(m, M, t);
      m.eyeM.color.setHex(M.st === "chase" ? 0xff0000 : 0xaa1010);
    });
    for (let i = monsters.length; i < mons.length; i++) mons[i].mon.visible = false;
    if (view.mode === "dead") { deadT += dt; const m = mons[view.catcher || 0]; if (m) m.mon.scale.setScalar(1 + deadT * 0.15); }
    else { deadT = 0; mons.forEach((m) => m.mon.scale.setScalar(1)); }
    // your friends
    const seen = new Set();
    others.forEach((o) => {
      seen.add(o.id);
      const f = friendFig(o);
      f.gr.visible = !o.hid;
      friendPose(f, o, P, dt);
    });
    for (const [id, f] of friendFigs) if (!seen.has(id)) f.gr.visible = false;
    // the elevator: shut and red without the power; open and green once you have it and are near
    if (elev) {
      const st = view.ready ? 1 : 0, tg = st && play && Math.hypot(P.x - (exitT.x + 0.5), P.y - (exitT.y + 0.5)) < 7 ? 1 : 0;
      elev.open += (tg - elev.open) * Math.min(1, dt * 3);
      elev.dl.position.z = elev.z - (0.4 + 0.7 * elev.open); elev.dr.position.z = elev.z + (0.4 + 0.7 * elev.open);
      if (st !== elev.state) { elev.state = st; drawDisp(elev.dc, st); elev.dt.needsUpdate = true; doorM.material.emissive.set(st ? 0x22ff66 : 0xff1010); }
      elL.color.set(st ? 0x7dffb0 : 0xff2a2a); elL.intensity = st ? 1.3 : 0.45 + 0.35 * Math.max(0, Math.sin(t * 4));
      elev.lamp.material.color.set(st ? 0x22ff66 : (Math.sin(t * 4) > 0 ? 0xff2222 : 0x330808));
    }
    // footprints ahead of it, mist round it, your breath, a shape at the edge of the beam
    mistUpd(dt);
    PRN.forEach((p) => { if (!p.m.visible) return; p.age += dt; const a = Math.min(1, p.age * 2) * (1 - p.age / 22); if (a <= 0) { p.m.visible = false; return; } p.m.material.opacity = a * 0.85; });
    if (near && play) {
      prT -= dt; if (near.moving && TLV >= 1 && prT <= 0) { prT = 1.1; const a = Math.atan2(near.vy, near.vx), ax = near.x + Math.cos(a) * 2.4, ay = near.y + Math.sin(a) * 2.4; if (g[ay | 0] && g[ay | 0][ax | 0] === 0) printAt(ax, ay, Math.atan2(-near.vy, near.vx) - Math.PI / 2); }
      mrt -= dt; if (TLV >= 2 && mrt <= 0) { mrt = 0.22; puff(near.x * S + (FR() - 0.5), 1 + FR() * 0.8, near.y * S + (FR() - 0.5), (FR() - 0.5) * 0.3, (FR() - 0.5) * 0.3); }
      bnT -= dt; if (TLV >= 3 && bnT <= 0) { bnT = 1.7; puff(P.x * S - Math.sin(P.yaw) * 0.4, 1.55, P.y * S - Math.cos(P.yaw) * 0.4, -Math.sin(P.yaw) * 0.5, -Math.cos(P.yaw) * 0.5); }
      shT -= dt; if (TLV >= 2 && shT <= 0) { shT = 7 + FR() * 6; shL = 0.8; const a = P.yaw + (FR() < 0.5 ? -1 : 1) * (0.7 + FR() * 0.3), dd = 6 + FR() * 3; shd.position.set(P.x * S - Math.sin(a) * dd, 1.3, P.y * S - Math.cos(a) * dd); }
    }
    shL = Math.max(0, shL - dt); shd.material.opacity = Math.min(0.6, shL * 1.2);
    // the overlays: the heart and the arc toward it, the red edge, the vignette, breathlessness, the slit of a locker
    if (play && AW && TLV >= 1 && near) {
      const pul = Math.max(0, Math.sin(t * (2.4 + TLV * 1.5)));
      aw.style.opacity = ((0.18 + TLV * 0.14) * (0.5 + 0.5 * pul)).toFixed(2); aw.style.transform = "translateX(-50%) scale(" + (1 + pul * 0.25).toFixed(2) + ")";
      if (TLV >= 2) {
        const fx = -Math.sin(P.yaw), fy = -Math.cos(P.yaw), rx = Math.cos(P.yaw), ry = -Math.sin(P.yaw), dx = near.x - P.x, dy = near.y - P.y;
        rip.style.opacity = ((0.15 + TLV * 0.12) * (0.4 + 0.6 * pul)).toFixed(2); rip.style.transform = "rotate(" + (Math.atan2(dx * rx + dy * ry, dx * fx + dy * fy) * 57.3).toFixed(1) + "deg)";
      } else rip.style.opacity = 0;
    } else { aw.style.opacity = 0; rip.style.opacity = 0; }
    cv.style.transform = play && TLV >= 3 ? "translate(" + ((FR() - 0.5) * TLV * 0.7).toFixed(1) + "px," + ((FR() - 0.5) * TLV * 0.7).toFixed(1) + "px) scale(1.012)" : "";
    vig.style.opacity = (0.55 + TLV * 0.12).toFixed(2);
    dgO.style.opacity = Math.max(dg, play && TLV === 4 ? 0.3 + 0.3 * Math.sin(t * 9) : 0).toFixed(2);
    brO.style.opacity = play && (P.tired || P.stam < 0.3) ? ((0.3 + Math.sin(t * 5) * 0.15) * (1 - P.stam)).toFixed(2) : 0;
    nzC.style.opacity = (0.05 + dg * 0.12).toFixed(2);
    slit.style.display = P.hid && play ? "" : "none";
    flashT = Math.max(0, flashT - dt); flash.style.opacity = flashT > 0 ? 1 : 0;
    // the torch's beam (no dust in it: the specks read as sparks floating in the light)
    if (play && torch && !P.hid) {
      beam.visible = true; beam.position.copy(cam.position); beam.lookAt(cam.position.clone().sub(fwS)); coneM.uniforms.u.value = 0.055 * (spot.intensity / 2.6);
    } else beam.visible = false;
    rd.render(scene, cam);
  }
  // the title: a slow look round the Main Hall
  function title(t) {
    cam.position.set(48 + Math.sin(t / 9) * 1.2, 1.7, 49.5); cam.rotation.set(0, t / 5, 0);
    spot.position.copy(cam.position); spot.intensity = 2.4; spot.target.position.set(cam.position.x - Math.sin(t / 5) * 5, 1.5, cam.position.z - Math.cos(t / 5) * 5);
    beam.visible = false; aw.style.opacity = 0; rip.style.opacity = 0; slit.style.display = "none";
    if (!litKey) { litKey = "title"; refreshLM(new Set(["hall", "ringW", "hallW"])); }
    rd.render(scene, cam);
  }

  return {
    frame, title, resize,
    flash() { flashT = 0.12; },
    setQuality(q) { Q = q; applyQ(); },
    setAware(on) { AW = !!on; },
    camera: cam,
    dispose() {
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } });
      rd.dispose();
      try { rd.forceContextLoss(); } catch (e) { /* fine */ }
      [cv, nzC, vig, dgO, brO, slit, flash, aw, rip].forEach((e) => e.remove());
    },
  };
}
