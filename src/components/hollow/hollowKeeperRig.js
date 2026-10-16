// src/components/hollow/hollowKeeperRig.js
// The Keeper, in three.js: a giant, hunched, ~5.5 m tall. Its head is wound
// in old bandages — no eyes — and a brass ear-trumpet is strapped to one
// side of it: it hunts by sound. A moth-eaten waistcoat, a leather apron, a
// ring of keys at the belt, and arms so long the hands hang near the floor.
//
// Like the kid (hollowKid.js) it's a rig of pivots posed by code: every
// frame what the Keeper is doing (hollowKeeper.mjs's K.st) picks a target
// pose and the rig eases toward it; the walk is driven by K.stride, the same
// counter that makes its footsteps, so feet and sound agree.
//
// createKeeper(THREE) → { root, update(K, dt, t, kid), handAt(), dispose }
// `kid` is where the kid is (rules axes) — for the reach when it grabs.

const PI = Math.PI;
const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const ss = (a, b, x) => { const k = cl((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const HIP = 2.45;
const JOINTS = ["hipY", "lean", "tz", "ty", "hx", "hy", "hz", "jaw", "lS", "lO", "lE", "rS", "rO", "rE", "lL", "lK", "rL", "rK", "fing"];

export function createKeeper(THREE) {
  const geos = [], mats = [];
  const G = (g) => { geos.push(g); return g; };
  const M = (o) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o }); mats.push(m); return m; };
  function tex(w, h, fn) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  let sd = 9137;
  const R = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const skinM = M({ color: 0xffffff, roughness: 0.7, map: tex(64, 64, (c, w, h) => {
    c.fillStyle = "#5e5b4e"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${30 + R() * 30},${26 + R() * 20},${20},${R() * 0.35})`; c.fillRect(R() * w, R() * h, 2, 2); }
    for (let y = 2; y < h; y += 5 + R() * 4) { c.strokeStyle = "rgba(20,15,10,.35)"; c.lineWidth = 1; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= w; x += 8) c.lineTo(x, y + (R() - 0.5) * 2); c.stroke(); }   // wrinkles
    for (let i = 0; i < 8; i++) { c.strokeStyle = "rgba(70,30,45,.35)"; c.beginPath(); c.moveTo(R() * w, R() * h); c.lineTo(R() * w, R() * h); c.stroke(); }   // veins
    for (let i = 0; i < 5; i++) { const x = R() * w, y = R() * h, g = c.createRadialGradient(x, y, 0, x, y, 9); g.addColorStop(0, "rgba(40,50,30,.4)"); g.addColorStop(1, "rgba(40,50,30,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); }   // blotches
  }) });
  const coatM = M({ color: 0xffffff, map: tex(64, 64, (c, w, h) => {
    c.fillStyle = "#2a2622"; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { c.fillStyle = "rgba(0,0,0,.15)"; c.fillRect(0, y, w, 1); }
    for (let i = 0; i < 8; i++) { c.fillStyle = "rgba(10,8,6,.9)"; c.beginPath(); c.arc(R() * w, R() * h, 1 + R() * 3, 0, 7); c.fill(); }    // moth holes
  }) });
  const vestM = M({ color: 0x3a2a24 });
  const apronM = M({ color: 0xffffff, roughness: 0.6, map: tex(64, 128, (c, w, h) => {
    c.fillStyle = "#4a3828"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 20; i++) { const x = R() * w, y = R() * h, g = c.createRadialGradient(x, y, 0, x, y, 12); g.addColorStop(0, "rgba(20,10,5,.5)"); g.addColorStop(1, "rgba(20,10,5,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); }
  }) });
  const bandM = M({ color: 0xffffff, map: tex(64, 64, (c, w, h) => {
    c.fillStyle = "#b4a888"; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { c.fillStyle = "rgba(60,45,25,.3)"; c.fillRect(0, y, w, 2); }
    for (let i = 0; i < 5; i++) { const x = R() * w, y = R() * h, g = c.createRadialGradient(x, y, 0, x, y, 10); g.addColorStop(0, "rgba(90,40,20,.45)"); g.addColorStop(1, "rgba(90,40,20,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); }
  }) });
  const brassM = M({ color: 0xa08048, metalness: 0.8, roughness: 0.35 });
  const mouthM = new THREE.MeshBasicMaterial({ color: 0x080404 }); mats.push(mouthM);
  const toothM = M({ color: 0xc8bc98, roughness: 0.5 });
  const leatherM = M({ color: 0x2a1c12 });
  const mesh = (g, m, p, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(G(g), m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  const grp = (p, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.position.set(x, y, z); p.add(o); return o; };

  const root = new THREE.Group();
  const hips = grp(root, 0, HIP, 0);
  mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.6, 12), coatM, hips, 0, 0.1, 0);
  // the torso: a barrel with a hump, leaning forward from the hips
  const torso = grp(hips);
  mesh(new THREE.CylinderGeometry(0.85, 0.7, 2.0, 14), vestM, torso, 0, 1.0, 0).scale.set(1, 1, 0.85);
  mesh(new THREE.SphereGeometry(0.8, 14, 10), coatM, torso, 0, 1.75, -0.25).scale.set(1.15, 0.8, 0.95);   // the hump
  mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.14, 14), leatherM, torso, 0, 0.12, 0).scale.set(1, 1, 0.86);   // the belt
  // the apron, hanging from the belt
  const apron = grp(torso, 0, 0.1, 0.62);
  mesh(new THREE.BoxGeometry(1.1, 1.9, 0.06), apronM, apron, 0, -0.9, 0);
  // the ring of keys at its hip: they swing (and in 3d, jangle)
  const keys = grp(torso, 0.78, 0.05, 0.25);
  mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 16), brassM, keys, 0, -0.16, 0);
  for (let i = 0; i < 6; i++) { const k = mesh(new THREE.BoxGeometry(0.04, 0.22, 0.015), brassM, keys, Math.cos(i) * 0.12, -0.36 - (i % 3) * 0.03, Math.sin(i) * 0.08); k.rotation.z = (i - 3) * 0.2; }
  // the neck, thrust forward, and the head
  const neck = grp(torso, 0, 1.85, 0.35);
  mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.7, 10), skinM, neck, 0, 0.25, 0.1).rotation.x = 0.6;
  const head = grp(neck, 0, 0.55, 0.4);
  const skull = mesh(new THREE.SphereGeometry(0.5, 16, 12), skinM, head, 0, 0.1, 0);
  skull.scale.set(0.9, 1.15, 1.0);
  // bandages round and round the top of it — over where the eyes would be
  for (let i = 0; i < 6; i++) {
    const b = mesh(new THREE.TorusGeometry(0.47 - Math.abs(i - 2) * 0.03, 0.07, 6, 18), bandM, head, 0, 0.0 + i * 0.12, 0);
    b.rotation.set(PI / 2 + (R() - 0.5) * 0.3, (R() - 0.5) * 0.2, (R() - 0.5) * 0.3); b.scale.set(0.95, 1.05, 1);
  }
  const tail = mesh(new THREE.BoxGeometry(0.1, 0.6, 0.02), bandM, head, -0.3, -0.05, -0.38);   // a loose end
  tail.rotation.set(0.3, 0, 0.4);
  // the jaw: a wide mouth under the bandages, that drops open
  const jaw = grp(head, 0, -0.18, 0.05);
  mesh(new THREE.SphereGeometry(0.42, 14, 8, 0, PI * 2, PI / 2, PI / 2), skinM, jaw, 0, 0.02, 0.02).scale.set(0.9, 0.7, 1.05);
  mesh(new THREE.BoxGeometry(0.6, 0.08, 0.25), mouthM, jaw, 0, 0.03, 0.3);
  for (let i = 0; i < 7; i++) mesh(new THREE.ConeGeometry(0.025, 0.08, 4), toothM, jaw, -0.24 + i * 0.08, 0.07, 0.38);
  // the ear-trumpet, strapped to the right side: what it hunts with
  const horn = grp(head, 0.48, 0.12, -0.05);
  horn.rotation.set(0, 0, -0.5);
  mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 10), brassM, horn, 0.12, 0.28, 0).rotation.z = -0.3;
  const bell = mesh(new THREE.CylinderGeometry(0.42, 0.08, 0.55, 18, 1, true), brassM, horn, 0.35, 0.7, 0);
  bell.rotation.z = -0.5; bell.material.side = THREE.DoubleSide;
  mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 20), brassM, horn, 0.49, 0.95, 0).rotation.set(PI / 2, 0.5, 0);
  mesh(new THREE.BoxGeometry(0.06, 0.5, 0.95), leatherM, head, 0.05, 0.2, 0).rotation.z = -0.15;   // the strap over the top

  // arms: shoulder → long upper arm → elbow → long forearm → a big hand of long fingers
  function arm(side) {
    const sh = grp(torso, side * 0.95, 1.6, 0.1);
    mesh(new THREE.SphereGeometry(0.35, 10, 8), coatM, sh);
    mesh(new THREE.CylinderGeometry(0.28, 0.22, 1.5, 10), coatM, sh, 0, -0.75, 0);
    const el = grp(sh, 0, -1.5, 0);
    mesh(new THREE.CylinderGeometry(0.2, 0.15, 1.45, 10), skinM, el, 0, -0.72, 0);
    mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.3, 10), coatM, el, 0, -0.1, 0);   // the cuff
    const hand = grp(el, 0, -1.48, 0.02);
    mesh(new THREE.BoxGeometry(0.34, 0.32, 0.14), skinM, hand, 0, -0.1, 0);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const f = grp(hand, -0.13 + i * 0.087, -0.25, 0);
      mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.45, 6), skinM, f, 0, -0.22, 0);
      fingers.push(f);
    }
    const th = grp(hand, side * -0.2, -0.12, 0.06); th.rotation.z = side * 0.6;
    mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.3, 6), skinM, th, 0, -0.15, 0);
    fingers.push(th);
    return { sh, el, hand, fingers };
  }
  const aL = arm(1), aR = arm(-1);
  // legs: heavy, short for its size, bent
  function leg(side) {
    const hp = grp(hips, side * 0.4, 0, 0);
    mesh(new THREE.CylinderGeometry(0.34, 0.26, 1.3, 10), coatM, hp, 0, -0.62, 0);
    const kn = grp(hp, 0, -1.25, 0);
    mesh(new THREE.CylinderGeometry(0.25, 0.2, 1.2, 10), coatM, kn, 0, -0.6, 0);
    const ft = mesh(new THREE.BoxGeometry(0.42, 0.24, 0.85), leatherM, kn, 0, -1.2, 0.2);
    return { hp, kn, ft };
  }
  const lL = leg(1), lR = leg(-1);

  // ── the pose ──
  const C = {}, Tg = {};
  for (const j of JOINTS) { C[j] = 0; Tg[j] = 0; }
  C.hipY = Tg.hipY = HIP;
  let yaw = 0, first = true, grabT = 0, sniffT = 0;
  const set = (o) => { for (const k in o) Tg[k] = o[k]; };
  const tmp = new THREE.Vector3();

  function update(K, dt, t, kid) {
    const k = 1 - Math.exp(-dt * 6);
    set({ hipY: HIP, lean: 0.5, tz: 0, ty: 0, hx: -0.35, hy: 0, hz: 0, jaw: 0.05, lS: 0.15, lO: 0.12, lE: 0.25, rS: 0.15, rO: 0.12, rE: 0.25, lL: 0, lK: 0.15, rL: 0, rK: 0.15, fing: 0.3 });
    const ph = K.stride * PI, s = Math.sin(ph), c = Math.cos(ph);
    const go = cl(K.spd / 1.2, 0, 1), run = cl((K.spd - 2) / 0.9, 0, 1);
    // walking: heavy, a sway side to side, arms hanging and swinging late
    if (K.spd > 0.05) {
      const sw = 0.32 + 0.18 * run;
      Tg.lL = s * sw * go; Tg.rL = -s * sw * go;
      Tg.lK = 0.15 + (0.3 + 0.5 * run) * Math.max(0, c) * go; Tg.rK = 0.15 + (0.3 + 0.5 * run) * Math.max(0, -c) * go;
      Tg.hipY = HIP - 0.05 - 0.08 * Math.abs(s) * go;
      Tg.tz = s * 0.06 * go; Tg.ty = -s * 0.08 * go;
      Tg.lS = 0.15 - s * 0.2 * go; Tg.rS = 0.15 + s * 0.2 * go;
    }
    const st = K.st;
    if (st === "patrol" && K.pause > 0) {
      // standing on its round: head slowly turning, now and then a sniff
      Tg.hy = Math.sin(t * 0.4) * 0.5; Tg.hx = -0.3 + Math.sin(t * 0.7) * 0.05;
      sniffT = (sniffT + dt) % 1.7;
      if (sniffT < 0.4) { Tg.hx -= 0.25 * Math.sin(sniffT / 0.4 * PI); Tg.hy *= 0.5; }
    }
    if (st === "listen") {
      // it freezes, tilts its trumpet toward the sound, a hand cupped to it
      const a = Math.atan2(K.tz - K.z, K.tx - K.x) - K.face;
      Tg.hy = cl(Math.sin(a) * 0.9, -0.9, 0.9); Tg.hz = 0.45; Tg.hx = -0.15;
      Tg.rS = 2.3; Tg.rO = 0.6; Tg.rE = 1.9; Tg.fing = 0.6; Tg.lean = 0.42; Tg.jaw = 0.15;
    }
    if (st === "go") { Tg.lean = 0.65; Tg.hx = -0.45; Tg.lS += 0.3; Tg.rS += 0.3; }
    if (st === "search") {
      // bent double, both hands sweeping across the floor in front of it
      const w = Math.sin(t * 1.7);
      Tg.lean = 1.05; Tg.hipY = HIP - 0.35; Tg.lK += 0.55; Tg.rK += 0.55; Tg.lL += 0.35; Tg.rL += 0.35;
      Tg.lS = 0.75 + w * 0.25; Tg.rS = 0.75 - w * 0.25; Tg.lO = 0.35 + w * 0.3; Tg.rO = 0.35 - w * 0.3; Tg.lE = 0.2; Tg.rE = 0.2;
      Tg.hy = w * 0.4; Tg.hz = 0.25; Tg.fing = 0.15;
    }
    if (st === "chase") {
      // the charge: forward, arms out for you, mouth open
      Tg.lean = 0.85; Tg.hx = -0.6; Tg.jaw = 0.55;
      Tg.lS = 1.25 + Math.sin(t * 9) * 0.15; Tg.rS = 1.25 - Math.sin(t * 9) * 0.15; Tg.lE = 0.15; Tg.rE = 0.15; Tg.lO = 0.35; Tg.rO = 0.35; Tg.fing = 0.1;
    }
    if (st === "grab") {
      // down for the kid with the right hand, then up to its face
      grabT += dt;
      const down = 1 - ss(0.45, 1.4, grabT);
      Tg.lean = 0.5 + 0.7 * down; Tg.hipY = HIP - 0.4 * down; Tg.lK += 0.5 * down; Tg.rK += 0.5 * down;
      Tg.rS = 0.9 * down + 1.55 * (1 - down); Tg.rE = 0.15 * down + 1.7 * (1 - down); Tg.rO = 0.1;
      Tg.fing = grabT > 0.4 ? 1.2 : 0.1; Tg.hx = -0.2 + 0.4 * (1 - down); Tg.jaw = 0.2 + 0.5 * ss(1.2, 1.8, grabT);
      Tg.lS = 0.6; Tg.lO = 0.5;
    } else grabT = 0;

    for (const j of JOINTS) C[j] += (Tg[j] - C[j]) * (st === "grab" ? 1 - Math.exp(-dt * 9) : k);

    // facing, the short way round (the rules' depth runs into the screen: z turned round)
    const want = PI / 2 + K.face;
    if (first) yaw = want;
    let d = want - yaw;
    while (d > PI) d -= 2 * PI;
    while (d < -PI) d += 2 * PI;
    yaw += d * (1 - Math.exp(-dt * 5));
    root.position.set(K.x, 0, -K.z);
    root.rotation.y = yaw;
    hips.position.y = C.hipY;
    torso.rotation.set(C.lean, C.ty, C.tz);
    neck.rotation.set(-C.lean * 0.55, 0, 0);
    head.rotation.set(C.hx, C.hy, C.hz);
    jaw.rotation.x = C.jaw;
    aL.sh.rotation.set(-C.lS - C.lean * 0.6, 0, C.lO); aL.el.rotation.x = -C.lE;
    aR.sh.rotation.set(-C.rS - C.lean * 0.6, 0, -C.rO); aR.el.rotation.x = -C.rE;
    for (const a of [aL, aR]) a.fingers.forEach((f, i) => { if (i < 4) f.rotation.x = -C.fing - Math.sin(t * 2 + i) * 0.05; });
    lL.hp.rotation.x = -C.lL; lL.kn.rotation.x = C.lK;
    lR.hp.rotation.x = -C.rL; lR.kn.rotation.x = C.rK;
    lL.ft.rotation.x = -(C.lK - C.lL) * 0.6; lR.ft.rotation.x = -(C.rK - C.rL) * 0.6;
    apron.rotation.x = -C.lean * 0.7 + Math.sin(t * 1.3) * 0.03 + K.spd * 0.05;
    keys.rotation.set(Math.sin(K.stride * PI * 2) * 0.3 * go - C.lean * 0.5, 0, Math.sin(K.stride * PI) * 0.25 * go);
    first = false;
    void kid;
  }

  // where its right hand is, in the rules' axes (the kid hangs from it when caught)
  function handAt() {
    root.updateMatrixWorld(true);
    aR.hand.getWorldPosition(tmp);
    return { x: tmp.x, y: tmp.y - 0.55, z: -tmp.z };
  }

  function dispose() {
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
  }
  return { root, update, handAt, dispose, grabbing: () => grabT };
}
