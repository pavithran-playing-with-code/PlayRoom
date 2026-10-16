// src/components/hollow/hollowKid.js
// The kid, in three.js: a tiny figure in an oversized knitted jumper and a
// pointed hat, a jar of fireflies on a string at the hip, a scarf behind.
// No model file: built from shapes on a rig of pivots (hips, torso, head,
// shoulder/elbow, hip/knee), and animated by code.
//
// How it moves: every frame the state of the run (hollowCore's P) picks a
// target pose — a set of joint angles — and the rig eases toward it, so one
// pose melts into the next. Walk and run cycles are driven by P.stride, the
// same counter that makes the footstep sounds, so feet and sounds agree.
// On top of that, things that only follow: the hat's tip and pom on a
// spring, the scarf as a little rope (verlet), a squash on landing and a
// stretch on take-off.
//
// createKid(THREE, look) → { root, scarf, jar, update(P, dt, t), dispose }
// root goes in the scene; scarf too (it lives in world space).

const PI = Math.PI;
const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const ss = (a, b, x) => { const k = cl((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const LEG = 0.34;

const JOINTS = ["hipY", "pitch", "tx", "tz", "ty", "hx", "hy", "lS", "lO", "lE", "rS", "rO", "rE", "lL", "lK", "rL", "rK", "sq", "back"];

export function createKid(THREE, look = {}) {
  const col = { jumper: 0xa83c26, hat: 0xd2a63a, skin: 0xe6cfb8, trousers: 0x34303c, scarf: 0x3a7070, ...look };

  // a knitted look for the jumper and hat: vertical ribs and a little fuzz
  function knit(base) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#" + new THREE.Color(base).getHexString(); g.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 4) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, 0, 1, 64); g.fillStyle = "rgba(255,255,255,.06)"; g.fillRect(x + 2, 0, 1, 64); }
    for (let y = 0; y < 64; y += 3) { g.fillStyle = "rgba(0,0,0,.06)"; g.fillRect(0, y, 64, 1); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.encoding = THREE.sRGBEncoding;
    return t;
  }
  const mats = [];
  const M = (o) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, ...o }); mats.push(m); return m; };
  const jumperM = M({ color: 0xffffff, map: knit(col.jumper) });
  const hatM = M({ color: 0xffffff, map: knit(col.hat) });
  const skinM = M({ color: col.skin, roughness: 0.8 });
  const trouM = M({ color: col.trousers });
  const scarfM = M({ color: 0xffffff, map: knit(col.scarf) });
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xfff6e0 }); mats.push(eyeM);
  const faceM = M({ color: 0x1a1412, roughness: 1 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0xbfd8c0, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.35 }); mats.push(glassM);
  const glowM = new THREE.MeshBasicMaterial({ color: 0xe9ff9a }); mats.push(glowM);
  const geos = [];
  const G = (g) => { geos.push(g); return g; };
  const mesh = (g, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const grp = (parent, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };

  const root = new THREE.Group();
  const body = grp(root);                          // squash and stretch
  const hips = grp(body, 0, LEG, 0);
  const torso = grp(hips);
  // the jumper: too big, flaring at the hem, sleeves past the wrists
  mesh(G(new THREE.CylinderGeometry(0.1, 0.16, 0.36, 12, 1)), jumperM, torso, 0, 0.17, 0);
  mesh(G(new THREE.TorusGeometry(0.155, 0.025, 6, 14)), jumperM, torso, 0, 0.0, 0).rotation.x = PI / 2;
  mesh(G(new THREE.TorusGeometry(0.085, 0.03, 6, 12)), jumperM, torso, 0, 0.35, 0).rotation.x = PI / 2;   // the roll neck
  const head = grp(torso, 0, 0.37, 0);
  const skull = mesh(G(new THREE.SphereGeometry(0.15, 16, 12)), skinM, head, 0, 0.11, 0);
  skull.scale.set(1, 1.02, 0.96);
  // the face is in the hat's shadow: dark, with two small glints
  const face = mesh(G(new THREE.SphereGeometry(0.135, 14, 10, PI / 2 - PI * 0.36, PI * 0.72, PI * 0.36, PI * 0.36)), faceM, head, 0, 0.11, 0.022);
  face.rotation.y = 0; face.castShadow = false;
  const eyeG = G(new THREE.SphereGeometry(0.016, 8, 6));
  const eyeL = mesh(eyeG, eyeM, head, 0.05, 0.1, 0.16), eyeR = mesh(eyeG, eyeM, head, -0.05, 0.1, 0.16);
  eyeL.castShadow = eyeR.castShadow = false;
  // the hat: a brim, and a tall soft cone that leans on a spring, with a pom
  mesh(G(new THREE.TorusGeometry(0.15, 0.04, 8, 18)), hatM, head, 0, 0.17, 0).rotation.x = PI / 2;
  const hatPivot = grp(head, 0, 0.18, 0);
  const hatLow = mesh(G(new THREE.CylinderGeometry(0.1, 0.165, 0.16, 14, 1)), hatM, hatPivot, 0, 0.08, 0);
  const hatTipPivot = grp(hatPivot, 0, 0.16, 0);
  mesh(G(new THREE.ConeGeometry(0.1, 0.24, 14, 1)), hatM, hatTipPivot, 0, 0.12, 0);
  const pom = mesh(G(new THREE.SphereGeometry(0.05, 10, 8)), hatM, hatTipPivot, 0, 0.25, 0);
  void hatLow; void pom;

  // arms: shoulder → upper arm → elbow → forearm → hand (sleeve over most of it)
  function arm(side) {
    const sh = grp(torso, side * 0.12, 0.29, 0);
    mesh(G(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 8, 1)), jumperM, sh, 0, -0.08, 0);
    const el = grp(sh, 0, -0.155, 0);
    mesh(G(new THREE.CylinderGeometry(0.048, 0.042, 0.13, 8, 1)), jumperM, el, 0, -0.065, 0);
    const hand = mesh(G(new THREE.SphereGeometry(0.034, 8, 6)), skinM, el, 0, -0.145, 0.005);
    hand.scale.set(1, 1.2, 0.8);
    return { sh, el, hand };
  }
  const aL = arm(1), aR = arm(-1);
  // legs: hip → thigh → knee → shin → bare foot
  function leg(side) {
    const hp = grp(hips, side * 0.065, 0.02, 0);
    mesh(G(new THREE.CylinderGeometry(0.048, 0.042, 0.17, 8, 1)), trouM, hp, 0, -0.085, 0);
    const kn = grp(hp, 0, -0.165, 0);
    mesh(G(new THREE.CylinderGeometry(0.04, 0.034, 0.16, 8, 1)), trouM, kn, 0, -0.08, 0);
    const ft = mesh(G(new THREE.SphereGeometry(0.045, 8, 6)), skinM, kn, 0, -0.17, 0.03);
    ft.scale.set(0.8, 0.5, 1.45);
    return { hp, kn, ft };
  }
  const lL = leg(1), lR = leg(-1);

  // the firefly jar, on a string from the hip: it swings
  const jarPivot = grp(hips, -0.15, 0.02, 0.02);
  const jar = grp(jarPivot, 0, -0.1, 0);
  mesh(G(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 10, 1)), glassM, jar).castShadow = false;
  mesh(G(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10, 1)), M({ color: 0x5a4632 }), jar, 0, 0.055, 0);
  const flies = [];
  for (let i = 0; i < 4; i++) { const f = mesh(G(new THREE.SphereGeometry(0.009, 5, 4)), glowM, jar); f.castShadow = false; flies.push(f); }
  const jarGlow = mesh(G(new THREE.SphereGeometry(0.03, 8, 6)), new THREE.MeshBasicMaterial({ color: 0xd8f070, transparent: true, opacity: 0.45 }), jar);
  jarGlow.castShadow = false;

  // the scarf: a rope of points in the world, hung from the neck
  const scarf = new THREE.Group();
  const NS = 6, SEG = 0.07;
  const sp = [], spPrev = [], segs = [];
  const segG = G(new THREE.BoxGeometry(0.075, 0.018, SEG * 1.15));
  for (let i = 0; i < NS; i++) { sp.push(new THREE.Vector3()); spPrev.push(new THREE.Vector3()); }
  for (let i = 0; i < NS - 1; i++) { const s = new THREE.Mesh(segG, scarfM); s.castShadow = true; scarf.add(s); segs.push(s); }
  let scarfInit = false;

  // ── the pose ──
  const C = {}, Tg = {};
  for (const j of JOINTS) { C[j] = 0; Tg[j] = 0; }
  C.hipY = Tg.hipY = LEG; C.sq = Tg.sq = 1;
  let yaw = 0, lastX = 0, lastZ = 0, lastY = 0, lastVx = 0, lastVz = 0, first = true;
  const hat = { ax: 0, az: 0, vx: 0, vz: 0 };
  const jarS = { a: 0, v: 0, b: 0, w: 0 };
  let lookT = 0, lookY = 0, idleT = 0, blinkT = 2;
  const tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion();

  function set(o) { for (const k in o) Tg[k] = o[k]; }
  function base() {
    set({ hipY: LEG, pitch: 0, tx: 0.04, tz: 0, ty: 0, hx: 0, hy: 0, lS: 0.05, lO: 0.1, lE: 0.12, rS: 0.05, rO: 0.1, rE: 0.12, lL: 0, lK: 0.04, rL: 0, rK: 0.04, sq: 1, back: 0 });
  }

  function cycle(P, amt, crouch, t) {
    const ph = P.stride * PI, s = Math.sin(ph), c = Math.cos(ph);
    const run = cl((P.speed - 1.5) / 1.6, 0, 1) * amt;
    const sw = (crouch ? 0.32 : 0.42 + 0.38 * run);
    Tg.lL += s * sw; Tg.rL -= s * sw;
    Tg.lK += (crouch ? 0.35 : 0.12 + 0.95 * run) * Math.max(0, c) + 0.1 * run;
    Tg.rK += (crouch ? 0.35 : 0.12 + 0.95 * run) * Math.max(0, -c) + 0.1 * run;
    Tg.hipY += -0.012 - 0.035 * run + (0.016 + 0.03 * run) * Math.abs(c) * (crouch ? 0.4 : 1);
    Tg.tx += 0.05 + 0.32 * run; Tg.ty += s * (0.1 + 0.06 * run); Tg.hy -= s * 0.08;
    const as = (crouch ? 0.15 : 0.35 + 0.55 * run);
    Tg.lS -= s * as; Tg.rS += s * as;
    Tg.lE += 0.2 + 1.15 * run; Tg.rE += 0.2 + 1.15 * run;
    Tg.hx += 0.04 * run;
    void t;
    return run;
  }

  function crouchPose() {
    set({ hipY: 0.2, tx: 0.55, hx: -0.45, lL: 0.95, lK: 1.8, rL: 0.95, rK: 1.8, lS: 0.5, rS: 0.5, lE: 0.6, rE: 0.6, lO: 0.15, rO: 0.15 });
  }

  // at: where to draw the kid instead of P (held up by something), rules axes
  function update(P, dt, t, at) {
    const k = 1 - Math.exp(-dt * 15);
    base();
    const st = P.st, vy = P.vy;
    const moving = P.speed > 0.15;
    if (moving || st !== "ground" || P.act) idleT = 0; else idleT += dt;

    if (st === "ground") {
      if (P.crouch) { crouchPose(); if (moving) cycle(P, 0.5, true, t); }
      else if (moving) {
        const run = cycle(P, 1, false, t);
        // sneaking (slow): a little bent, arms out for balance
        if (P.speed < 1.3) { Tg.hipY -= 0.03; Tg.tx += 0.15; Tg.lO += 0.25; Tg.rO += 0.25; Tg.lE += 0.4; Tg.rE += 0.4; }
        void run;
      } else if (P.teeter) {
        // on the edge: arms going round, leaning out and back
        const w = t * 10;
        set({ lS: 1.4 + Math.sin(w) * 1.3, rS: 1.4 + Math.sin(w + 2.4) * 1.3, lO: 0.6, rO: 0.6, lE: 0.2, rE: 0.2, tx: Math.sin(t * 4.5) * 0.28, hipY: LEG - 0.02, lL: 0.25, lK: 0.35 });
      } else {
        // idle: breathing, looking about; after a while, hugging yourself
        Tg.tx = 0.03 + Math.sin(t * 2.1) * 0.015; Tg.hipY = LEG + Math.sin(t * 2.1) * 0.004;
        lookT -= dt;
        if (lookT <= 0) { lookT = 2 + Math.random() * 3; lookY = (Math.random() - 0.5) * 1.6; }
        Tg.hy = lookY; Tg.ty = lookY * 0.2; Tg.hx = -0.1 + Math.sin(t * 0.7) * 0.05;
        if (idleT > 6) { Tg.lS = 0.9; Tg.rS = 0.9; Tg.lO = -0.55; Tg.rO = -0.55; Tg.lE = 1.9; Tg.rE = 1.9; Tg.tx = 0.15 + Math.sin(t * 9) * 0.01; Tg.hx = 0.15; }
      }
      // the landing: knees give, then you come up
      const lw = Math.exp(-P.landT * 9) * cl(P.landV / 8, 0, 1);
      Tg.hipY -= 0.12 * lw; Tg.lK += 0.8 * lw; Tg.rK += 0.8 * lw; Tg.lL += 0.45 * lw; Tg.rL += 0.45 * lw; Tg.tx += 0.4 * lw;
      Tg.lS += 0.6 * lw; Tg.rS += 0.6 * lw; Tg.lO += 0.4 * lw; Tg.rO += 0.4 * lw;
      Tg.sq = 1 - 0.1 * lw;
    } else if (st === "air") {
      if (vy > 0.5) {
        // going up: one knee tucked, arms reaching
        set({ lL: 0.85, lK: 1.3, rL: -0.25, rK: 0.5, lS: 1.9, rS: 1.4, lE: 0.3, rE: 0.4, lO: 0.25, rO: 0.25, tx: 0.12, hx: -0.25 });
        Tg.sq = 1 + 0.08 * Math.exp(-P.jumpT * 8);
      } else {
        // coming down: arms up, and if it's a long fall, legs paddling
        const long = cl((P.airT - 0.35) * 3, 0, 1), w = t * 13;
        set({ lS: 2.4 + Math.sin(w) * 0.35 * long, rS: 2.4 + Math.sin(w + 1.7) * 0.35 * long, lO: 0.55, rO: 0.55, lE: 0.25, rE: 0.25,
          lL: 0.35 + Math.sin(w * 0.8) * 0.5 * long, lK: 0.6 + Math.max(0, Math.cos(w * 0.8)) * 0.6 * long,
          rL: 0.15 - Math.sin(w * 0.8) * 0.5 * long, rK: 0.6 + Math.max(0, -Math.cos(w * 0.8)) * 0.6 * long,
          tx: -0.08, hx: 0.25 * long });
      }
    } else if (st === "hang") {
      // hands on the edge, legs hanging and swinging a little
      const sw = Math.sin(t * 2.6) * Math.exp(-P.stT * 1.2);
      set({ lS: PI - 0.38, rS: PI - 0.38, lO: 0.16, rO: 0.16, lE: 0.12, rE: 0.12, tx: 0.08, hx: -0.4,
        lL: 0.12 + sw * 0.35, lK: 0.25, rL: -0.05 + sw * 0.3, rK: 0.35 });
    } else if (st === "climb" && P.climb) {
      const u = P.climb.u, a = ss(0, 0.55, u), b = ss(0.5, 1, u);
      // pull up: arms go from reaching to pressing down; then a knee up and over
      set({
        lS: lerp(PI - 0.38, 0.35, a) + lerp(0, -0.35, b), rS: lerp(PI - 0.38, 0.35, a) + lerp(0, -0.35, b),
        lE: lerp(0.15, 1.6, ss(0, 0.3, u)) - lerp(0, 1.4, ss(0.3, 0.6, u)), rE: lerp(0.15, 1.6, ss(0, 0.3, u)) - lerp(0, 1.4, ss(0.3, 0.6, u)),
        lO: 0.2, rO: 0.2,
        tx: lerp(0.1, 0.75, a) - lerp(0, 0.7, b), hx: lerp(-0.4, 0.1, a),
        lL: lerp(0.1, 1.7, ss(0.35, 0.65, u)) - lerp(0, 1.7, b), lK: lerp(0.25, 2.1, ss(0.35, 0.65, u)) - lerp(0, 2.05, b),
        rL: lerp(-0.1, -0.4, a) + lerp(0, 0.4, b), rK: lerp(0.3, 0.6, a) - lerp(0, 0.55, b),
        hipY: LEG - 0.1 * Math.sin(u * PI),
      });
    } else if (st === "drag") {
      const push = P.pushing !== false, ph = P.stride * PI, s = Math.sin(ph), c = Math.cos(ph);
      const go = cl(P.speed / 0.8, 0, 1);
      set({ lS: 1.45, rS: 1.45, lO: 0.08, rO: 0.08, lE: push ? 0.45 : 0.15, rE: push ? 0.45 : 0.15,
        tx: push ? 0.45 : -0.32, hx: push ? -0.4 : 0.2, hipY: LEG - 0.05,
        lL: (push ? 0.35 : -0.2) + s * 0.4 * go, lK: 0.35 + Math.max(0, c) * 0.6 * go,
        rL: (push ? -0.25 : 0.25) - s * 0.4 * go, rK: 0.35 + Math.max(0, -c) * 0.6 * go });
      Tg.ty = s * 0.08 * go;
    } else if (st === "caught") {
      // held up in its hand: kicking, pushing at its fingers
      const w = t * 11;
      set({ hipY: LEG, tx: -0.2 + Math.sin(t * 5) * 0.1, tz: Math.sin(t * 4) * 0.15, hx: 0.35,
        lS: 2.2 + Math.sin(w) * 0.5, rS: 2.0 + Math.sin(w + 2) * 0.5, lO: 0.5, rO: 0.5, lE: 0.9, rE: 0.9,
        lL: 0.4 + Math.sin(w) * 0.6, lK: 0.6 + Math.max(0, Math.cos(w)) * 0.8, rL: 0.2 - Math.sin(w) * 0.6, rK: 0.6 + Math.max(0, -Math.cos(w)) * 0.8 });
    } else if (st === "stun" && P.stun) {
      const u = cl(P.stT / P.stun.dur, 0, 1);
      if (P.stun.k === "hard") {
        // down on one knee, a hand to the floor, then up again
        const d = 1 - ss(0.55, 1, u);
        set({ hipY: lerp(LEG, 0.14, d), tx: 0.75 * d, hx: 0.35 * d, lL: 1.3 * d, lK: 2.2 * d, rL: -0.25 * d, rK: 1.75 * d,
          lS: 0.95 * d, rS: 0.35 * d, lE: 0.15, rE: 0.5 * d, lO: 0.2, rO: 0.3 });
      } else if (P.stun.k === "tumble") {
        // flat on your front, a moment, then pushing yourself up
        const down = ss(0, 0.2, u) * (1 - ss(0.55, 0.9, u));
        set({ pitch: 1.35 * down, hipY: LEG - 0.06 * down, tx: 0.35 * (1 - down) * ss(0.5, 0.9, u) * (1 - ss(0.9, 1, u)),
          lS: lerp(0.4, 1.75, down), rS: lerp(0.4, 1.75, down), lO: 0.45 * down, rO: 0.45 * down, lE: 0.6 * down, rE: 0.6 * down,
          lL: 0.2 * down, rL: -0.1 * down, lK: 0.3 * down, rK: 0.5 * down, hx: -0.7 * down });
      } else {
        // a bump: knocked back, arms up, a wobble
        const d = 1 - ss(0.3, 1, u);
        set({ tx: -0.45 * d, hx: 0.4 * d, lS: 1.6 * d, rS: 1.9 * d, lO: 0.5 * d, rO: 0.5 * d, lE: 0.8 * d, rE: 0.8 * d,
          hipY: LEG - 0.06 * d, lL: -0.35 * d, lK: 0.4 * d, rL: 0.3 * d, rK: 0.3 * d });
      }
    }

    // holding something: arms up over your head, whatever the legs are doing
    if (P.hold >= 0 && (st === "ground" || st === "air")) {
      set({ lS: 2.75, rS: 2.75, lO: 0.28, rO: 0.28, lE: 0.55, rE: 0.55 });
      Tg.tx = Math.min(Tg.tx, 0.12);
    }
    // a pick-up (bend and lift) or a throw (back over the head, then forward)
    if (P.act) {
      const u = cl(P.act.t / P.act.dur, 0, 1);
      if (P.act.k === "pick") {
        const d = Math.sin(u * PI);
        Tg.hipY -= 0.1 * d; Tg.tx += 0.8 * d; Tg.lK += 0.9 * d; Tg.rK += 0.9 * d; Tg.lL += 0.6 * d; Tg.rL += 0.6 * d;
        Tg.lS = lerp(Tg.lS, 0.6, d); Tg.rS = lerp(Tg.rS, 0.6, d);
      } else if (P.act.k === "wind") {
        // winding the music box: one hand on it, the other turning the key
        const w = Math.sin(u * Math.PI * 4);
        Tg.lS = 1.2; Tg.lE = 0.5; Tg.lO = -0.1;
        Tg.rS = 1.1 + w * 0.25; Tg.rO = -0.15 + Math.cos(u * Math.PI * 4) * 0.2; Tg.rE = 0.8;
        Tg.tx += 0.3; Tg.hx += 0.35;
      } else if (P.act.k === "lever") {
        // both hands up on the lever, then hauling it down with your weight
        const pull = ss(0.15, 0.6, u);
        Tg.lS = 2.6 - 1.2 * pull; Tg.rS = 2.6 - 1.2 * pull; Tg.lE = 0.4 + 0.6 * pull; Tg.rE = 0.4 + 0.6 * pull; Tg.lO = 0.15; Tg.rO = 0.15;
        Tg.hipY -= 0.12 * pull; Tg.lK += 0.7 * pull; Tg.rK += 0.7 * pull; Tg.lL += 0.4 * pull; Tg.rL += 0.4 * pull; Tg.tx += 0.3 * pull;
      } else if (P.act.k === "throw") {
        const wind = ss(0, 0.3, u) * (1 - ss(0.3, 0.45, u)), fl = ss(0.3, 0.5, u) * (1 - ss(0.75, 1, u));
        Tg.lS = 0.1 + 3.3 * wind + 1.3 * fl; Tg.rS = Tg.lS; Tg.lE = 0.9 * wind; Tg.rE = 0.9 * wind; Tg.lO = 0.25; Tg.rO = 0.25;
        Tg.tx = -0.3 * wind + 0.4 * fl; Tg.ty = 0.2 * wind;
      }
    }

    // ease toward the target; a hard snap only where a pose has to land at once
    const kk = st === "climb" ? 1 - Math.exp(-dt * 30) : k;
    for (const j of JOINTS) C[j] += (Tg[j] - C[j]) * kk;

    // facing, the short way round
    // the rules' depth runs into the screen, three.js's toward you: z is turned round
    const want = PI / 2 + P.face;
    if (first) yaw = want;
    let d = want - yaw;
    while (d > PI) d -= 2 * PI;
    while (d < -PI) d += 2 * PI;
    yaw += d * (1 - Math.exp(-dt * (st === "hang" || st === "climb" ? 30 : 13)));

    root.position.set(at ? at.x : P.x, at ? at.y : P.y, -(at ? at.z : P.z));
    root.rotation.set(0, yaw, 0);
    body.rotation.x = C.pitch;
    body.scale.set(1 / Math.sqrt(C.sq), C.sq, 1 / Math.sqrt(C.sq));
    hips.position.y = C.hipY;
    torso.rotation.set(C.tx, C.ty, C.tz);
    head.rotation.set(C.hx - C.tx * 0.5, C.hy, 0);
    aL.sh.rotation.set(-C.lS, 0, C.lO); aL.el.rotation.x = -C.lE;
    aR.sh.rotation.set(-C.rS, 0, -C.rO); aR.el.rotation.x = -C.rE;
    lL.hp.rotation.x = -C.lL; lL.kn.rotation.x = C.lK;
    lR.hp.rotation.x = -C.rL; lR.kn.rotation.x = C.rK;
    // feet flat-ish on the ground
    lL.ft.rotation.x = -(C.lK - C.lL) * 0.5; lR.ft.rotation.x = -(C.rK - C.rL) * 0.5;

    // blinking
    blinkT -= dt;
    const shut = blinkT < 0.12;
    eyeL.scale.y = eyeR.scale.y = shut ? 0.15 : 1;
    if (blinkT < 0) blinkT = 2.5 + Math.random() * 3.5;

    // what follows: the hat on a spring, from how the body speeds up and turns
    const ddt = Math.max(dt, 1e-3);
    const vx = first ? 0 : (P.x - lastX) / ddt, vz = first ? 0 : (-P.z - lastZ) / ddt, vyy = first ? 0 : (P.y - lastY) / ddt;
    const ax = cl((vx - lastVx) / ddt, -60, 60), az = cl((vz - lastVz) / ddt, -60, 60);
    lastX = P.x; lastZ = -P.z; lastY = P.y; lastVx = vx; lastVz = vz;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const fwdA = ax * sy + az * cy, sideA = ax * cy - az * sy;    // in the kid's own frame
    hat.vx += (-hat.ax * 60 - hat.vx * 7 - fwdA * 0.05 + cl(vyy, -8, 8) * 0.0) * dt;
    hat.vz += (-hat.az * 60 - hat.vz * 7 + sideA * 0.05) * dt;
    hat.ax = cl(hat.ax + hat.vx * dt, -0.9, 0.9); hat.az = cl(hat.az + hat.vz * dt, -0.9, 0.9);
    const droop = 0.15 + cl(-vyy * 0.03, -0.2, 0.25);       // flops back when you fall
    hatPivot.rotation.set(-0.12 + hat.ax * 0.4 - C.tx * 0.2, 0, hat.az * 0.4);
    hatTipPivot.rotation.set(-droop + hat.ax, 0, hat.az);
    // the jar swings the same way, on its string
    jarS.v += (-jarS.a * 40 - jarS.v * 3 - fwdA * 0.04) * dt; jarS.a = cl(jarS.a + jarS.v * dt, -1.2, 1.2);
    jarS.w += (-jarS.b * 40 - jarS.w * 3 + sideA * 0.04) * dt; jarS.b = cl(jarS.b + jarS.w * dt, -1.2, 1.2);
    jarPivot.rotation.set(jarS.a - C.tx, 0, jarS.b);
    flies.forEach((f, i) => f.position.set(Math.sin(t * (2.1 + i) + i * 2) * 0.025, Math.sin(t * (1.7 + i * 0.6) + i) * 0.03, Math.cos(t * (2.4 + i * 0.4) + i * 3) * 0.025));
    jarGlow.scale.setScalar(0.85 + Math.sin(t * 3.1) * 0.15);

    // the scarf: anchored at the back of the neck, the rest swings on its own
    root.updateMatrixWorld(true);
    tmp.set(0, 0.34, -0.07); torso.localToWorld(tmp);
    // first frame, or the kid moved a long way at once (a restart): hang it fresh
    if (!scarfInit || first || sp[1].distanceTo(tmp) > 0.5) {
      for (let i = 0; i < NS; i++) { sp[i].set(tmp.x, tmp.y - i * SEG, tmp.z); spPrev[i].copy(sp[i]); }
      scarfInit = true;
    }
    sp[0].copy(tmp); spPrev[0].copy(tmp);
    const back = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    for (let i = 1; i < NS; i++) {
      const p = sp[i], o = spPrev[i];
      const nx = p.x + (p.x - o.x) * 0.94, ny = p.y + (p.y - o.y) * 0.94 - 5 * dt * dt, nz = p.z + (p.z - o.z) * 0.94;
      o.copy(p); p.set(nx + back.x * 0.15 * dt * dt, ny, nz + back.z * 0.15 * dt * dt);
      if (!at && p.y < P.y + 0.01) p.y = P.y + 0.01;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < NS; i++) {
        const a = sp[i - 1], b = sp[i];
        tmp.subVectors(b, a); const l = tmp.length() || 1e-6, f = (l - SEG) / l;
        if (i === 1) b.addScaledVector(tmp, -f);
        else { a.addScaledVector(tmp, f * 0.5); b.addScaledVector(tmp, -f * 0.5); }
      }
      sp[0].copy(sp[0]);
    }
    for (let i = 0; i < NS - 1; i++) {
      const a = sp[i], b = sp[i + 1], s = segs[i];
      s.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      tmp.subVectors(b, a).normalize();
      q.setFromUnitVectors(up, tmp); s.quaternion.copy(q);
    }
    first = false;
  }

  // where the jar is now, for the light that follows it
  const jarWorld = new THREE.Vector3();
  function jarAt() { jar.getWorldPosition(jarWorld); return jarWorld; }

  function dispose() {
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
  }
  return { root, scarf, update, jarAt, dispose };
}
