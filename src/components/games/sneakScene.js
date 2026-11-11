// src/components/games/sneakScene.js
// SHADOW SNEAK, drawn in 3D with the PlayRoom look kit: a toy lighthouse on
// dark blue ground at night, short block walls standing about, and the lamp's
// beam sweeping over it all — cut off wherever a wall stands in its way, so
// every wall throws a real wedge of shadow. You (the kit's mover) creep from
// shadow to shadow with the camera over your shoulder; friends are there too,
// with their names.
//
// Only drawing: sneakSim.js has the rules. The beam on the ground is not a
// light effect that roughly agrees with the rules — it IS the rules, drawn:
// the same rays the sim uses to decide whether the lamp can see a spot.
import * as THREE from "three";
import { TALL, LOW, HALF, cellAt } from "./sneakSim";
import { INK, toon, at, can, cone, ball, box, mover, animate, effects, nameTag, ring } from "./toyKit";

export const SNEAK_COLOURS = [0x4cc9f0, 0xff8fc7, 0x8fdb5c, 0xffa36c, 0x9b5de5, 0x3dd6c0, 0xffc53d, 0xff6b6b];
const WALL_H = 1.1, LOW_H = 0.45, LAMP_Y = 3.3, RAYS = 30, TILT = 1.2;

let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
// the ground: big soft tiles, one square a metre
function floorTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    x.fillStyle = (i + j) % 2 ? "#2b3a6b" : "#304178";
    x.fillRect(i * 64, j * 64, 64, 64);
    x.strokeStyle = "rgba(20,26,56,.55)"; x.lineWidth = 3;
    x.strokeRect(i * 64 + 1.5, j * 64 + 1.5, 61, 61);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// how far the lamp's light gets along this direction before a tall wall stops it
function reach(W, a, max) {
  const tx = W.c + 0.5, tz = W.c + 0.5, cx = Math.cos(a), sz = Math.sin(a);
  for (let d = 0.75; d < max; d += 0.1) if (cellAt(W, tx + cx * d, tz + sz * d) === TALL) return d;
  return max;
}

function lighthouse() {
  const g = new THREE.Group();
  g.add(at(can(0.62, 0.7, 0.3, 0x8d93b8, { line: 0.04 }), 0, 0.15, 0));
  const bands = [0xff6b6b, 0xffffff, 0xff6b6b, 0xffffff];
  bands.forEach((col, i) => g.add(at(can(0.5 - i * 0.045, 0.545 - i * 0.045, 0.62, col, { line: 0.05 }), 0, 0.6 + i * 0.62, 0)));
  g.add(at(box(0.26, 0.42, 0.06, 0x5a4636, { line: 0.08 }), 0, 0.5, 0.56));              // the door
  g.add(at(can(0.52, 0.52, 0.08, 0x3c3550, { line: 0.06 }), 0, 2.82, 0));                // the gallery
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 14), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }));
  glass.position.y = 3.12;
  g.add(glass);
  g.add(at(cone(0.42, 0.42, 0xff6b6b, { line: 0.07 }), 0, 3.58, 0));
  g.add(at(ball(0.07, 0xffc53d, { line: 0.15 }), 0, 3.84, 0));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xfff2a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.y = 3.12; halo.scale.setScalar(2.6);
  g.add(halo);
  g.userData = { glass, halo };
  return g;
}
function flag() {
  const g = new THREE.Group();
  g.add(at(can(0.035, 0.035, 0.9, 0xd8d2cc, { line: 0.25 }), 0, 0.45, 0));
  const cloth = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(0.42, 0.74, 0), new THREE.Vector3(0, 0.58, 0)]), new THREE.MeshBasicMaterial({ color: 0x8d93b8, side: THREE.DoubleSide }));
  g.add(cloth);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), new THREE.MeshBasicMaterial({ color: 0x8d93b8, transparent: true, opacity: 0.35, depthWrite: false }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.025;
  g.add(pad);
  g.userData = { cloth, pad };
  return g;
}
function bell() {
  const g = new THREE.Group();
  g.add(at(box(0.08, 1.0, 0.08, 0x8a6a48, { line: 0.2 }), -0.22, 0.5, 0));
  g.add(at(box(0.08, 1.0, 0.08, 0x8a6a48, { line: 0.2 }), 0.22, 0.5, 0));
  g.add(at(box(0.62, 0.08, 0.1, 0x8a6a48, { line: 0.15 }), 0, 1.02, 0));
  const swing = new THREE.Group();
  swing.position.y = 0.98;
  swing.add(at(cone(0.2, 0.32, 0xffc53d, { line: 0.1 }), 0, -0.2, 0));
  swing.add(at(ball(0.05, 0x8a6a48, { line: 0 }), 0, -0.4, 0));
  g.add(swing);
  const pad = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.44, 24), new THREE.MeshBasicMaterial({ color: 0xffc53d, transparent: true, opacity: 0.6, depthWrite: false }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.03;
  g.add(pad);
  g.userData = { swing, pad };
  return g;
}

export function createSneakScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1230);
  scene.fog = new THREE.Fog(0x0e1230, 22, 46);
  const camera = new THREE.PerspectiveCamera(40, 0.7, 0.1, 90);
  // night: a cool fill from above, a little moonlight for shape, and the lamp's own warm glow
  scene.add(new THREE.HemisphereLight(0x8fa4ff, 0x161a3a, 0.62));
  const moon = new THREE.DirectionalLight(0xcfd6ff, 0.42);
  moon.position.set(-5, 12, 6);
  scene.add(moon);
  const lampGlow = new THREE.PointLight(0xffe7a0, 0.9, 16, 1.6);
  scene.add(lampGlow);
  const fx = effects(scene);
  const ftex = floorTex();
  const inkBack = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

  let level = null;                  // { W, group, tower, flags, bells, wedges, cones }
  const sneakers = new Map();        // id -> { m, tag, tagText, x, z, face, fall, duck, down, in, ringM }
  let camD = 18, halfX = 5, halfZ = 8, shake = 0, dark = 0;
  const camAt = new THREE.Vector3(), look = new THREE.Vector3();
  let camSet = false;

  function clearLevel() {
    if (!level) return;
    scene.remove(level.group);
    for (const t of level.trash) t.dispose();
    level = null;
  }

  function setLevel(W) {
    clearLevel();
    const g = new THREE.Group(), trash = [];
    const n = W.n;
    // the ground
    const tex = ftex.clone(); tex.needsUpdate = true; tex.repeat.set(n / 2, n / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(n, n), new THREE.MeshToonMaterial({ map: tex, gradientMap: toon(0xffffff).gradientMap }));
    trash.push(tex, floor.geometry, floor.material);
    floor.rotation.x = -Math.PI / 2; floor.position.set(n / 2, 0, n / 2);
    g.add(floor);
    // the walls: one drawing each for tall, low and the outer wall, and their ink shells
    const kinds = [
      { test: (c, x, z) => c === TALL && x > 0 && z > 0 && x < n - 1 && z < n - 1, h: WALL_H, col: 0x6f7fc4 },
      { test: (c) => c === LOW, h: LOW_H, col: 0x9fd0c8 },
      { test: (c, x, z) => c === TALL && z !== n - 1 && (x === 0 || z === 0 || x === n - 1), h: WALL_H + 0.3, col: 0x4a5594 },
      { test: (c, x, z) => z === n - 1, h: 0.3, col: 0x4a5594 },             // the near side is a kerb: it must never hide you
    ];
    const M = new THREE.Matrix4();
    for (const k of kinds) {
      const list = [];
      for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) if (k.test(W.cells[z * n + x], x, z)) list.push([x, z]);
      if (!list.length) continue;
      const geo = new THREE.BoxGeometry(0.96, k.h, 0.96);
      const body = new THREE.InstancedMesh(geo, toon(k.col), list.length);
      const shell = new THREE.InstancedMesh(geo, inkBack, list.length);
      trash.push(geo);
      list.forEach(([x, z], i) => {
        M.makeTranslation(x + 0.5, k.h / 2, z + 0.5);
        body.setMatrixAt(i, M);
        M.makeScale(1.07, 1 + 0.07 / k.h, 1.07).setPosition(x + 0.5, k.h / 2, z + 0.5);
        shell.setMatrixAt(i, M);
      });
      g.add(body, shell);
    }
    // the lighthouse
    const tower = lighthouse();
    tower.position.set(W.c + 0.5, 0, W.c + 0.5);
    g.add(tower);
    // flags and bells
    const flags = W.checks.map((k) => { const f = flag(); f.position.set(k.x, 0, k.z); g.add(f); return f; });
    const bells = W.bells.map((b) => { const m = bell(); m.position.set(b.x, 0, b.z); m.rotation.y = -b.a + Math.PI / 2; g.add(m); return m; });
    // the beams: the lit ground (a fan cut off by the walls) and a soft cone in the air
    const wedges = [], cones = [];
    for (let k = 0; k < W.beams; k++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((RAYS + 2) * 3), 3));
      const idx = [];
      for (let i = 1; i <= RAYS; i++) idx.push(0, i + 1, i);
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff09a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      trash.push(geo, mat); m.frustumCulled = false; m.renderOrder = 2;
      g.add(m); wedges.push(m);
      const len = 2.4;                                         // a short glow in the air at the lamp: the lit ground shows where the beam reaches
      const cg = new THREE.ConeGeometry(Math.tan(HALF) * len, len, 20, 1, true);
      cg.translate(0, -len / 2, 0); cg.rotateZ(Math.PI / 2);          // the point at the lamp, opening along +x
      const cm = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      trash.push(cg, cm.material); cm.position.set(W.c + 0.5, LAMP_Y - 0.2, W.c + 0.5); cm.renderOrder = 3;
      g.add(cm); cones.push(cm);
    }
    scene.add(g);
    lampGlow.position.set(W.c + 0.5, LAMP_Y, W.c + 0.5);
    level = { W, group: g, tower, flags, bells, wedges, cones, trash, max: n * 0.75 };
    camSet = false; dark = 0;
    for (const o of sneakers.values()) { scene.remove(o.m); if (o.tag) scene.remove(o.tag); scene.remove(o.ringM); }
    sneakers.clear();
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // about nine and a half squares across, and at least eleven down the screen
    const v = (camera.fov * Math.PI) / 360, hh = Math.atan(Math.tan(v) * camera.aspect);
    camD = Math.max(9.5 / (2 * Math.tan(hh)), 11 / (2 * Math.tan(v)));
    camD = Math.min(camD, 30);
    halfX = camD * Math.tan(hh); halfZ = (camD * Math.tan(v)) / Math.sin(TILT);      // how much ground the screen shows, each way from its middle
  }

  // st: { me, others: [...], beams: [angles], heat, off (0..1: the lamp going out), cp, rung: [bell indexes] }
  // a sneaker: { id, slot, name, x, z, face, duck, moving, seen, down, grace, in }
  function draw(st, dt0, now) {
    if (!level) return;
    const dt = Math.max(0, Math.min(0.1, dt0 || 0)), W = level.W;
    dark += ((st.off ? 1 : 0) - dark) * Math.min(1, dt * 5);
    // the lamp and its beams
    const hot = st.heat ? 1 : 0;
    const col = hot ? 0xffa066 : 0xfff09a;
    level.wedges.forEach((m, k) => {
      const a0 = st.beams[k] ?? 0, p = m.geometry.attributes.position.array;
      p[0] = W.c + 0.5; p[1] = 0.035; p[2] = W.c + 0.5;
      for (let i = 0; i <= RAYS; i++) {
        const a = a0 - HALF + (2 * HALF * i) / RAYS, d = reach(W, a, level.max);
        p[(i + 1) * 3] = W.c + 0.5 + Math.cos(a) * d; p[(i + 1) * 3 + 1] = 0.035; p[(i + 1) * 3 + 2] = W.c + 0.5 + Math.sin(a) * d;
      }
      m.geometry.attributes.position.needsUpdate = true;
      m.material.color.setHex(col);
      m.material.opacity = 0.8 * (1 - dark) * (0.96 + Math.sin(now * 9 + k) * 0.03);
      const c = level.cones[k];
      c.rotation.y = -a0;
      c.rotation.z = -0.5;                                    // tipped down toward the ground
      c.material.color.setHex(col);
      c.material.opacity = 0.08 * (1 - dark);
    });
    const tu = level.tower.userData;
    tu.glass.material.color.setHex(dark > 0.5 ? 0x4a5594 : col);
    tu.halo.material.opacity = 0.9 * (1 - dark);
    tu.halo.scale.setScalar(2.6 + Math.sin(now * 5) * 0.15);
    lampGlow.intensity = 0.9 * (1 - dark);
    // flags: mine flies my colour
    level.flags.forEach((f, i) => {
      const mine = st.cp === i, c = mine ? SNEAK_COLOURS[st.me.slot % SNEAK_COLOURS.length] : 0x8d93b8;
      f.userData.cloth.material.color.setHex(c);
      f.userData.pad.material.color.setHex(c);
      f.userData.pad.material.opacity = mine ? 0.55 : 0.3;
      f.userData.cloth.scale.x = 1 + Math.sin(now * 5 + i) * 0.08;
    });
    level.bells.forEach((b, i) => {
      const on = (st.rung || []).includes(i);
      b.userData.swing.rotation.z = on ? Math.sin(now * 16) * 0.5 : Math.sin(now * 1.5 + i) * 0.04;
      b.userData.pad.material.opacity = on ? 0.95 : 0.45 + Math.sin(now * 3 + i) * 0.15;
    });
    // everyone
    const here = new Set();
    for (const r of [st.me, ...(st.others || [])]) {
      if (!r) continue;
      here.add(r.id);
      const me = r === st.me, colour = SNEAK_COLOURS[r.slot % SNEAK_COLOURS.length];
      let o = sneakers.get(r.id);
      if (!o) {
        const m = mover(colour, { seed: r.slot * 3 + 1 });
        const ringM = ring(me ? 0xffffff : colour, 0.4);
        scene.add(m, ringM);
        o = { m, ringM, tag: null, tagText: "", x: r.x, z: r.z, face: r.face || 0, fall: 0, duck: 0, down: false, in: false, hide: 0 };
        sneakers.set(r.id, o);
      }
      const label = me ? "" : r.name || "";
      if (label !== o.tagText) {
        if (o.tag) { scene.remove(o.tag); o.tag.material.map.dispose(); o.tag.material.dispose(); }
        o.tag = label ? nameTag(label, colour) : null;
        if (o.tag) { o.tag.scale.multiplyScalar(1.5); scene.add(o.tag); }
        o.tagText = label;
      }
      // friends are eased to where they said they were
      const k = me ? 1 : Math.min(1, dt * 12);
      if (Math.hypot(r.x - o.x, r.z - o.z) > 4) { o.x = r.x; o.z = r.z; }
      const px = o.x, pz = o.z;
      o.x += (r.x - o.x) * k; o.z += (r.z - o.z) * k;
      const sp = Math.hypot(o.x - px, o.z - pz) / Math.max(dt, 1e-3);
      let d = (r.face || 0) - o.face;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      o.face += d * Math.min(1, dt * 14);
      const down = r.down > 0;
      if (down && !o.down) {
        fx.burst(o.x, 0.6, o.z, { colors: [0xfff2a8, 0xffffff, 0xff6b6b], n: 18, speed: 3 });
        fx.word(me ? "SPOTTED!" : "spotted!", o.x, 1.5, o.z, { color: "#ff6b6b", height: me ? 0.75 : 0.5 });
        if (me) shake = 1;
      }
      if (!down && o.down) for (let i = 0; i < 4; i++) fx.puff(r.x, r.z, { color: 0xcfd6ff, size: 0.16 });
      if (r.in && !o.in) {
        fx.burst(o.x, 0.8, o.z, { colors: [0xffc53d, 0xffffff, colour], n: 16, speed: 2.6 });
        if (!me) fx.word("in!", o.x, 1.5, o.z, { color: "#8fdb5c", height: 0.5 });
      }
      o.down = down; o.in = !!r.in;
      o.fall += ((down ? 1 : 0) - o.fall) * Math.min(1, dt * 10);
      o.duck += ((r.duck ? 1 : 0) - o.duck) * Math.min(1, dt * 14);
      o.hide += ((r.in ? 1 : 0) - o.hide) * Math.min(1, dt * 6);
      const s = 0.95 * (1 - o.hide * 0.85);
      o.m.visible = o.hide < 0.97;
      o.m.position.set(o.x, 0.02, o.z);
      o.m.rotation.set(-o.fall * Math.PI / 2, o.face, 0, "YXZ");
      o.m.scale.set(s * (1 + o.duck * 0.12), s * (1 - o.duck * 0.42), s * (1 + o.duck * 0.12));
      animate(o.m, now, { walk: down ? 0 : Math.min(1, me ? r.moving || 0 : sp / 3) });
      if (down) for (const e of o.m.userData.eyes) e.scale.y = 0.2;
      // the ring under you fills red as the lamp makes you out; blinks while you're safe from it
      o.ringM.position.set(o.x, 0.03, o.z);
      o.ringM.visible = !r.in;
      if (me) {
        const seen = r.seen || 0;
        o.ringM.material.color.setRGB(1, 1 - seen * 0.75, 1 - seen * 0.85);
        o.ringM.scale.setScalar(1 + seen * 0.5);
        o.ringM.material.opacity = r.grace > 0 ? 0.5 + Math.sin(now * 18) * 0.4 : 0.9;
      }
      if (o.tag) { o.tag.position.set(o.x, 1.75 - o.duck * 0.4, o.z); o.tag.visible = !r.in; }
    }
    for (const [id, o] of sneakers) if (!here.has(id)) { scene.remove(o.m, o.ringM); if (o.tag) scene.remove(o.tag); sneakers.delete(id); }
    // the camera: over your shoulder, a little ahead of where you face
    const me = sneakers.get(st.me.id);
    if (me) {
      // follow you, but don't look past the edge of the ground: in a corner the screen stays full of it
      const n = W.n, fit = (p, half) => (half * 2 >= n + 1 ? n / 2 : Math.max(half - 0.5, Math.min(n - half + 0.5, p)));
      look.set(fit(me.x, halfX), 0, fit(me.z - 0.6, halfZ));
      const want = camAt.set(look.x, Math.sin(TILT) * camD, look.z + Math.cos(TILT) * camD);
      if (!camSet) { camera.position.copy(want); camSet = true; } else camera.position.lerp(want, Math.min(1, dt * 7));
      const cx = camera.position.x, cz = camera.position.z - Math.cos(TILT) * camD;
      if (shake > 0) { shake = Math.max(0, shake - dt * 2.5); camera.position.x += (Math.random() - 0.5) * shake * 0.3; camera.position.y += (Math.random() - 0.5) * shake * 0.3; }
      camera.lookAt(cx, 0, cz);
    }
    fx.tick(dt);
    renderer.render(scene, camera);
  }

  // a moment worth a flourish, at a spot: the lamp going out, a flag taken
  function cheer(kind, x, z) {
    if (kind === "off" && level) {
      const W = level.W;
      fx.burst(W.c + 0.5, LAMP_Y, W.c + 0.5, { colors: [0xfff2a8, 0xffc53d, 0xffffff, 0x8fdb5c], n: 40, speed: 5 });
      fx.word("LIGHTS OUT!", W.c + 0.5, LAMP_Y + 0.9, W.c + 0.5, { color: "#ffc53d", height: 1.1, life: 1.6 });
    } else if (kind === "flag") {
      fx.burst(x, 0.9, z, { colors: [0x8fdb5c, 0xffffff], n: 10, speed: 2 });
      fx.word("flag!", x, 1.5, z, { color: "#8fdb5c", height: 0.5, life: 0.9 });
    } else if (kind === "bell") {
      fx.word("ding!", x, 1.7, z, { color: "#ffc53d", height: 0.55, life: 0.9 });
    }
  }

  return {
    resize, setLevel, draw, cheer,
    dispose() {
      clearLevel();
      for (const o of sneakers.values()) if (o.tag) { o.tag.material.map.dispose(); o.tag.material.dispose(); }
      ftex.dispose();
      renderer.dispose();
    },
  };
}
