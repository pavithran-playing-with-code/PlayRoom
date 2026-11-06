// src/components/games/kitchenScene.js
// KITCHEN RUSH, drawn in 3D: a bright little kitchen seen from the front,
// cabinets and wooden worktops, crates of produce, boards, stoves with
// sizzling pans, the serving hatch — and chefs (toyKit's `chef`) who walk,
// carry, chop, cook, cheer and worry. Every food has its raw, chopped, cooked,
// burnt and plated look; a finished burger stacks up properly on its plate.
// It only draws: KitchenRush.jsx feeds it the server's kitchen every frame.
import * as THREE from "three";
import { W, H, LAYOUT, CRATE, RECIPES, kindAt } from "../together/kitchenCore.mjs";
import { toon, box, ball, can, at, chef, chefPose, effects, ring, sunnyLights, INK } from "./toyKit";

const CHEF_COLOURS = [0x4cc9f0, 0xff8fc7, 0x8fdb5c, 0xffa36c, 0x9b5de5, 0x3dd6c0, 0xffc53d, 0xff6b6b];
const TOP = 0.9;                                   // the worktop's height

// ── food ─────────────────────────────────────────────────────────────────────
function tomato(chopped) {
  const g = new THREE.Group();
  if (chopped) {
    [[-0.08, 0], [0.08, 0.02], [0, -0.08]].forEach(([x, z], i) => {
      const sl = at(can(0.075, 0.075, 0.03, 0xe8433a, { line: 0.12 }), x, 0.02 + i * 0.012, z);
      sl.add(at(can(0.05, 0.05, 0.032, 0xff8a7a, { line: 0, shadow: false }), 0, 0.001, 0));
      g.add(sl);
    });
    return g;
  }
  g.add(at(ball(0.11, 0xe8433a), 0, 0.1, 0, 1, 0.88, 1));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(at(ball(0.03, 0x3f9b3a, { line: 0 }), Math.cos(a) * 0.04, 0.19, Math.sin(a) * 0.04, 1.4, 0.4, 0.6)); }
  return g;
}
function lettuce(chopped) {
  const g = new THREE.Group();
  if (chopped) {
    for (let i = 0; i < 6; i++) { const sh = at(box(0.1, 0.02, 0.05, i % 2 ? 0x7ed957 : 0x5fbf3f, { line: 0.12 }), (i % 3 - 1) * 0.07, 0.015 + i * 0.008, (Math.floor(i / 3) - 0.5) * 0.08); sh.rotation.y = i * 1.1; g.add(sh); }
    return g;
  }
  [[0, 0.1, 0, 0.12], [-0.07, 0.08, 0.04, 0.08], [0.07, 0.08, 0.03, 0.08], [0, 0.08, -0.07, 0.08]].forEach(([x, y, z, r], i) => g.add(at(ball(r, i ? 0x7ed957 : 0x9be86e), x, y, z)));
  return g;
}
function cheese(chopped) {
  const g = new THREE.Group();
  if (chopped) {
    [0, 1, 2].forEach((i) => { const s = at(box(0.13, 0.025, 0.13, 0xffd23f, { line: 0.12 }), (i - 1) * 0.05, 0.015 + i * 0.026, (i - 1) * 0.03); s.rotation.y = i * 0.4; g.add(s); });
    return g;
  }
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 3, 1, false, 0, Math.PI * 0.6), toon(0xffd23f));
  w.position.y = 0.06; w.castShadow = true;
  const o = new THREE.Mesh(w.geometry, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })); o.scale.setScalar(1.08); w.add(o);
  g.add(w);
  return g;
}
function bun() {
  const g = new THREE.Group();
  g.add(at(can(0.13, 0.12, 0.05, 0xe0a050), 0, 0.025, 0));
  const top = at(ball(0.13, 0xe0a050), 0, 0.07, 0, 1, 0.6, 1);
  g.add(top);
  for (let i = 0; i < 6; i++) { const a = i * 1.05; g.add(at(ball(0.012, 0xfff6e6, { line: 0 }), Math.cos(a) * 0.07, 0.135, Math.sin(a) * 0.07, 1.5, 0.6, 1)); }
  return g;
}
function patty(state) {
  const col = state === "burnt" ? 0x2a2326 : state === "cooked" ? 0x8a4b2a : 0xe88a8a;
  const g = new THREE.Group();
  g.add(at(can(0.12, 0.12, 0.05, col, { line: 0.1 }), 0, 0.03, 0));
  if (state === "cooked") for (const z of [-0.05, 0, 0.05]) g.add(at(box(0.18, 0.006, 0.012, 0x5a2a12, { line: 0, shadow: false }), 0, 0.056, z));
  return g;
}
function plateBase() {
  const g = new THREE.Group();
  g.add(at(can(0.2, 0.15, 0.04, 0xffffff, { line: 0.06 }), 0, 0.02, 0));
  g.add(at(can(0.14, 0.14, 0.005, 0xeef3f7, { line: 0, shadow: false }), 0, 0.042, 0));
  return g;
}
// a finished dish, built up in layers
function dish(r, on) {
  const g = plateBase();
  let y = 0.045;
  const put = (o, h) => { o.position.y = y; g.add(o); y += h; };
  if (r === "salad") {
    const bowl = at(can(0.15, 0.09, 0.09, 0xfff6e6, { line: 0.07 }), 0, 0.045 + 0.045, 0);
    g.add(bowl);
    for (let i = 0; i < 7; i++) { const a = i * 0.9; g.add(at(ball(0.04, i % 3 === 0 ? 0xe8433a : i % 2 ? 0x7ed957 : 0x5fbf3f, { line: 0.12 }), Math.cos(a) * 0.07, 0.15, Math.sin(a) * 0.07)); }
    return g;
  }
  put(at(can(0.13, 0.12, 0.04, 0xe0a050), 0, 0.02, 0), 0.045);
  if (on.includes("lettuce")) put(at(can(0.15, 0.15, 0.015, 0x7ed957, { line: 0.08 }), 0, 0.008, 0), 0.016);
  put(at(can(0.125, 0.125, 0.045, 0x8a4b2a, { line: 0.08 }), 0, 0.022, 0), 0.045);
  if (on.includes("cheese")) { const c = at(box(0.2, 0.012, 0.2, 0xffd23f, { line: 0.1 }), 0, 0.006, 0); c.rotation.y = 0.785; put(c, 0.014); }
  if (on.includes("tomato")) put(at(can(0.12, 0.12, 0.02, 0xe8433a, { line: 0.08 }), 0, 0.01, 0), 0.02);
  const top = at(ball(0.13, 0xe0a050), 0, 0, 0, 1, 0.62, 1);
  put(top, 0);
  for (let i = 0; i < 7; i++) { const a = i * 0.9; g.add(at(ball(0.012, 0xfff6e6, { line: 0 }), Math.cos(a) * 0.07, y + 0.07, Math.sin(a) * 0.07, 1.5, 0.6, 1)); }
  return g;
}
const signOf = (it) => (it ? `${it.k}|${it.s}|${(it.on || []).join("+")}` : "");
export function food(it) {
  if (!it) return null;
  if (it.k === "plate") {
    const key = [...(it.on || [])].sort().join(",");
    const r = Object.keys(RECIPES).find((k) => RECIPES[k].parts.join(",") === key);
    if (r) return dish(r, it.on);
    const g = plateBase();
    (it.on || []).forEach((k, i) => {
      const a = (i / Math.max(1, it.on.length)) * Math.PI * 2, d = it.on.length > 1 ? 0.07 : 0;
      const part = k === "meat" ? patty("cooked") : k === "bun" ? bun() : k === "tomato" ? tomato(true) : k === "lettuce" ? lettuce(true) : cheese(true);
      part.scale.setScalar(0.7);
      part.position.set(Math.cos(a) * d, 0.045, Math.sin(a) * d);
      g.add(part);
    });
    return g;
  }
  const chopped = it.s === "chopped";
  switch (it.k) {
    case "tomato": return tomato(chopped);
    case "lettuce": return lettuce(chopped);
    case "cheese": return cheese(chopped);
    case "bun": return bun();
    case "meat": return patty(it.s);
    default: return at(ball(0.1, 0xcccccc), 0, 0.1, 0);
  }
}

// ── the kitchen ──────────────────────────────────────────────────────────────
function checker(a, b, n) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const s = 128 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? a : b; x.fillRect(i * s, j * s, s, s); }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}
function tiles() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const x = c.getContext("2d");
  x.fillStyle = "#fffaf0"; x.fillRect(0, 0, 128, 64);
  x.strokeStyle = "#e3d6c4"; x.lineWidth = 3;
  for (let r = 0; r < 4; r++) for (let i = -1; i < 5; i++) x.strokeRect(i * 32 + (r % 2) * 16, r * 16, 32, 16);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1.5);
  return t;
}
function signTex(text) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 80;
  const x = c.getContext("2d");
  x.fillStyle = "#ffc53d"; x.fillRect(0, 0, 256, 80);
  x.strokeStyle = "#2e2140"; x.lineWidth = 10; x.strokeRect(5, 5, 246, 70);
  x.fillStyle = "#2e2140"; x.font = "800 50px Fredoka, Nunito, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, 128, 44);
  return new THREE.CanvasTexture(c);
}

function kitchen(scene) {
  const g = new THREE.Group();
  scene.add(g);
  // floor: a checked kitchen floor, the room beyond it
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), toon(0xffffff, { map: checker("#f7c48f", "#fff0dc", 9) }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true;
  g.add(floor);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), toon(0xf6d3a8));
  outside.rotation.x = -Math.PI / 2; outside.position.set(W / 2, -0.01, H / 2); outside.receiveShadow = true;
  g.add(outside);
  // the back wall, tiled, with a shelf of jars and a clock
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W + 2, 2.4), toon(0xffffff, { map: tiles() }));
  back.position.set(W / 2, 1.2, -0.02); back.receiveShadow = true;
  g.add(back);
  g.add(at(box(3.2, 0.08, 0.3, 0xc98f5e), 2.6, 1.9, 0.12));
  [[1.4, 0xff8fc7], [2.1, 0x8fdb5c], [2.8, 0xffc53d], [3.5, 0x4cc9f0]].forEach(([x, c]) => { g.add(at(can(0.12, 0.12, 0.24, c, { line: 0.08 }), x, 2.06, 0.12)); g.add(at(can(0.13, 0.13, 0.05, 0xffffff, { line: 0.1 }), x, 2.2, 0.12)); });
  const clock = at(can(0.32, 0.32, 0.06, 0xffffff, { line: 0.1 }), 6.6, 1.75, 0.04); clock.rotation.x = Math.PI / 2; g.add(clock);
  const hand1 = at(box(0.03, 0.2, 0.02, INK, { line: 0 }), 6.6, 1.8, 0.09), hand2 = at(box(0.03, 0.14, 0.02, INK, { line: 0 }), 6.64, 1.73, 0.09);
  hand2.rotation.z = -1.2; g.add(hand1, hand2);
  // counters
  const cab = toon(0x86d3bf), wood = toon(0xd08a4a);
  const tileObjs = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = LAYOUT[y][x];
    if (ch === ".") continue;
    const kind = kindAt(x, y);
    const t = new THREE.Group();
    t.position.set(x + 0.5, 0, y + 0.5);
    g.add(t);
    tileObjs.set(y * W + x, t);
    if (kind === "bin") {
      t.add(at(can(0.3, 0.26, 0.75, 0x9aa7b8), 0, 0.375, 0));
      t.add(at(can(0.32, 0.32, 0.06, 0x7d8a9b), 0, 0.78, 0));
      t.add(at(box(0.12, 0.05, 0.05, 0x7d8a9b, { line: 0.1 }), 0, 0.83, 0));
      continue;
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.98, TOP - 0.06, 0.98), cab);
    body.position.y = (TOP - 0.06) / 2; body.castShadow = true; body.receiveShadow = true;
    t.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 1.0), kind === "stove" ? toon(0x4a4458) : wood);
    top.position.y = TOP - 0.04; top.castShadow = true; top.receiveShadow = true;
    t.add(top);
    // a cupboard door and handle on the side that faces the room
    const open = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dy]) => kindAt(x + dx, y + dy) === "floor");
    for (const [dx, dy] of open.slice(0, 1)) {
      const door = at(box(0.8, 0.6, 0.02, 0xa8e3d3, { line: 0 }), dx * 0.5, 0.42, dy * 0.5);
      door.rotation.y = Math.atan2(dx, dy);
      t.add(door);
      const h = at(box(0.2, 0.04, 0.04, 0xffffff, { line: 0.15 }), dx * 0.53, 0.62, dy * 0.53);
      h.rotation.y = Math.atan2(dx, dy);
      t.add(h);
    }
    if (kind === "crate") {
      t.add(at(box(0.78, 0.18, 0.7, 0xc9853f), 0, TOP + 0.09, 0));
      t.add(at(box(0.8, 0.03, 0.72, 0xa86a2c, { line: 0 }), 0, TOP + 0.13, 0));
      const k = CRATE[ch];
      [[-0.18, -0.12], [0.16, -0.1], [0, 0.12], [-0.2, 0.15], [0.2, 0.14]].forEach(([dx, dz], i) => {
        const f = food({ k, s: "raw" });
        f.position.set(dx, TOP + 0.15 + (i > 2 ? 0.03 : 0), dz);
        f.rotation.y = i * 1.3;
        t.add(f);
      });
    } else if (kind === "board") {
      t.add(at(box(0.7, 0.05, 0.5, 0xf3d7a6), 0, TOP + 0.025, 0.05));
      const knife = new THREE.Group();
      knife.add(at(box(0.26, 0.012, 0.07, 0xd8dee8, { line: 0.12 }), 0.08, 0, 0));
      knife.add(at(box(0.12, 0.03, 0.04, 0x6b4226, { line: 0.12 }), -0.12, 0, 0));
      knife.position.set(0.05, TOP + 0.06, -0.2);
      t.add(knife);
      t.userData.knife = knife;
    } else if (kind === "stove") {
      const burner = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 8, 28), new THREE.MeshBasicMaterial({ color: 0x77708a }));
      burner.rotation.x = Math.PI / 2; burner.position.y = TOP + 0.01;
      t.add(burner);
      const pan = new THREE.Group();
      pan.add(at(can(0.27, 0.23, 0.07, 0x3c3550, { line: 0.06 }), 0, 0.035, 0));
      pan.add(at(box(0.32, 0.04, 0.06, 0x2e2140, { line: 0 }), 0.42, 0.06, 0));
      pan.position.y = TOP + 0.03;
      t.add(pan);
      const flames = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffc53d : 0xff6b3d }));
        f.position.set(Math.cos(a) * 0.22, TOP + 0.03, Math.sin(a) * 0.22);
        flames.add(f);
      }
      flames.visible = false;
      t.add(flames);
      t.userData = { burner, pan, flames };
    } else if (kind === "plates") {
      for (let i = 0; i < 4; i++) { const p = plateBase(); p.position.y = TOP + i * 0.045; t.add(p); }
    } else if (kind === "window") {
      // the hatch: an awning outside, a bell on the counter
      for (let i = 0; i < 4; i++) {
        const stripe = at(box(0.6, 0.04, 0.25, i % 2 ? 0xffffff : 0xff6b6b, { line: 0 }), -0.75, 1.55 - 0.02 * i, -0.375 + i * 0.25);
        stripe.rotation.z = -0.35;
        t.add(stripe);
      }
      if (y === LAYOUT.findIndex((r) => r[x] === "W")) {
        const bell = new THREE.Group();
        bell.add(at(ball(0.11, 0xffc53d), 0, 0.02, 0, 1, 0.85, 1));
        bell.add(at(can(0.15, 0.15, 0.02, 0xffc53d, { line: 0.1 }), 0, 0, 0));
        bell.add(at(ball(0.025, 0xffc53d, { line: 0.15 }), 0, 0.12, 0));
        bell.position.set(0.2, TOP, 0.35);
        t.add(bell);
        t.userData.bell = bell;
        const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex("SERVE") }));
        sign.scale.set(1.1, 0.34, 1);
        sign.position.set(-0.55, 1.95, 0.5);
        t.add(sign);
      }
    }
  }
  return { tileObjs };
}

// A progress bar that always faces the camera.
function bar(color) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.11), new THREE.MeshBasicMaterial({ color: INK, depthTest: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.06), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  fill.position.z = 0.001;
  bg.renderOrder = 8; fill.renderOrder = 9;
  g.add(bg, fill);
  g.userData.fill = fill;
  return g;
}

// ── the scene ────────────────────────────────────────────────────────────────
export function createKitchenScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3c99a);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  sunnyLights(scene, { cx: W / 2, cz: H / 2, size: 8, indoor: true });
  const fx = effects(scene);
  const { tileObjs } = kitchen(scene);
  const base = new THREE.Vector3();

  const onTile = new Map();      // tile -> { sign, obj }
  const bars = new Map();        // tile -> bar
  const chefs = new Map();       // id -> { c, held, heldSign, ring, tag, cheer }
  const facing = new THREE.Group();
  for (const [x, z, w, d] of [[0, -0.47, 1, 0.06], [0, 0.47, 1, 0.06], [-0.47, 0, 0.06, 1], [0.47, 0, 0.06, 1]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    m.position.set(x, 0, z);
    facing.add(m);
  }
  facing.visible = false;
  scene.add(facing);
  const flashRing = facing.clone();
  flashRing.children.forEach((m) => { m.material = new THREE.MeshBasicMaterial({ color: 0x9b5de5, transparent: true, depthWrite: false }); });
  flashRing.visible = false;
  scene.add(flashRing);
  let flashAt = -9, smokeAt = 0, steamAt = 0, shake = 0, worriedUntil = 0;

  function frame(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tilt = 0.8;                              // low enough to see the chefs' faces
    const pts = [[-0.1, 2.3, 0], [W + 0.1, 2.3, 0], [-0.9, 0, H + 0.05], [W + 0.1, 0, H + 0.05], [-0.9, 1.6, 2]];
    const v = new THREE.Vector3();
    let cz = H / 2, d = 16;
    const place = () => { camera.position.set(W / 2, Math.sin(tilt) * d, cz + Math.cos(tilt) * d); camera.lookAt(W / 2, 0, cz); camera.updateMatrixWorld(); camera.updateProjectionMatrix(); };
    for (let pass = 0; pass < 3; pass++) {
      let lo = 4, hi = 60;
      for (let i = 0; i < 24; i++) {
        d = (lo + hi) / 2; place();
        const ok = pts.every(([x, y, z]) => { v.set(x, y, z).project(camera); return Math.abs(v.x) <= 0.97 && Math.abs(v.y) <= 0.96; });
        if (ok) hi = d; else lo = d;
      }
      d = hi; place();
      const ys = pts.map(([x, y, z]) => v.set(x, y, z).project(camera).y);
      cz -= ((Math.max(...ys) + Math.min(...ys)) / 2) * 2.4;
    }
    place();
    base.copy(camera.position);
  }

  function tag(text, mine) {
    const c = document.createElement("canvas");
    const x = c.getContext("2d");
    x.font = "800 44px Fredoka, Nunito, sans-serif";
    const tw = Math.ceil(x.measureText(text).width) + 40;
    c.width = tw; c.height = 64;
    x.font = "800 44px Fredoka, Nunito, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.lineJoin = "round";
    x.lineWidth = 9; x.strokeStyle = "#2E2140"; x.strokeText(text, tw / 2, 34);
    x.fillStyle = mine ? "#FFC53D" : "#ffffff"; x.fillText(text, tw / 2, 34);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.renderOrder = 9;
    s.scale.set(0.36 * (tw / 64), 0.36, 1);
    return s;
  }

  // state: { chefs: [{ id, i, x, y, fx, fy, hold, chop, moving, name, mine }], items: Map(tile -> item), facing: {x,y}|null }
  function draw(st, dt, t) {
    // what's on the counters
    for (const [ti, obj] of tileObjs) {
      const it = st.items.get(ti) || null;
      const sg = signOf(it);
      let o = onTile.get(ti);
      if (!o || o.sign !== sg) {
        if (o && o.obj) obj.remove(o.obj);
        const f = food(it);
        const kind = kindAt(ti % W, Math.floor(ti / W));
        if (f) { f.position.y = kind === "stove" ? TOP + 0.08 : kind === "board" ? TOP + 0.05 : TOP; obj.add(f); }
        o = { sign: sg, obj: f, born: t };
        onTile.set(ti, o);
      }
      // a thing just put down lands with a little squash
      if (o.obj) { const k = Math.min(1, (t - o.born) / 0.25); o.obj.scale.set(1 + (1 - k) * 0.25, 1 - (1 - k) * 0.3, 1 + (1 - k) * 0.25); }
      const u = obj.userData;
      const x = ti % W, y = Math.floor(ti / W);
      if (u.bell && u.bell.scale.x > 1) u.bell.scale.setScalar(Math.max(1, u.bell.scale.x - dt * 2));
      // stoves: flames, sizzle, smoke
      if (u.flames) {
        const hot = it && it.k === "meat" && it.s !== "burnt";
        u.flames.visible = !!hot;
        if (hot) u.flames.children.forEach((f, i) => { f.scale.y = 0.7 + Math.sin(t * 20 + i * 2) * 0.35; });
        u.burner.material.color.setHex(hot ? 0xff7a3d : 0x77708a);
        if (hot && o.obj) o.obj.position.y = TOP + 0.08 + Math.abs(Math.sin(t * 25)) * 0.01;
        if (hot && t - steamAt > 0.18) { steamAt = t; fx.puff(x + 0.5 + (Math.random() - 0.5) * 0.3, y + 0.5, { color: 0xffffff, size: 0.07, up: 1.2 }); }
        if (it && (it.s === "burnt" || (it.s === "cooked" && it.p > 0.5)) && t - smokeAt > 0.12) { smokeAt = t; fx.puff(x + 0.5, y + 0.5, { color: it.s === "burnt" ? 0x3c3550 : 0x8a8a96, size: 0.12, up: 1.4 }); worriedUntil = t + 0.6; }
      }
      // the knife on a board lies still unless someone's chopping
      if (u.knife) u.knife.visible = !(it && it.s === "raw" && it.p > 0);
      // progress: chopping and cooking
      let p = -1, col = 0x8fdb5c;
      if (it && kindAt(x, y) === "board" && it.s === "raw" && it.p > 0) p = it.p;
      if (it && kindAt(x, y) === "stove" && it.k === "meat") {
        if (it.s === "raw") { p = it.p; col = 0xffc53d; }
        else if (it.s === "cooked" && it.p > 0.35) { p = 1 - it.p; col = Math.sin(t * (8 + it.p * 16)) > 0 ? 0xff6b6b : 0xffffff; }
      }
      let b = bars.get(ti);
      if (p >= 0) {
        if (!b) { b = bar(col); scene.add(b); bars.set(ti, b); }
        b.visible = true;
        b.position.set(x + 0.5, TOP + 0.75, y + 0.5);
        b.quaternion.copy(camera.quaternion);
        b.userData.fill.material.color.setHex(col);
        b.userData.fill.scale.x = Math.max(0.02, Math.min(1, p));
        b.userData.fill.position.x = -0.28 * (1 - Math.min(1, p));
      } else if (b) b.visible = false;
    }
    // the chefs
    const here = new Set();
    for (const p of st.chefs) {
      here.add(p.id);
      let o = chefs.get(p.id);
      if (!o) {
        const c = chef(CHEF_COLOURS[p.i % CHEF_COLOURS.length], { seed: Math.abs(p.id) % 97 });
        c.scale.setScalar(1.08);
        scene.add(c);
        const r = p.mine ? ring(0xffffff, 0.42) : null;
        if (r) scene.add(r);
        const tg = p.name ? tag(p.name, p.mine) : null;
        if (tg) scene.add(tg);
        o = { c, ring: r, tag: tg, held: null, heldSign: "", cheer: 0, puffAt: 0 };
        chefs.set(p.id, o);
      }
      o.c.position.set(p.x, 0, p.y);
      const want = Math.atan2(p.fx, p.fy);
      let d = want - o.c.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      o.c.rotation.y += d * Math.min(1, dt * 14);
      o.cheer = Math.max(0, o.cheer - dt);
      const ft = p.facingTile;
      const cook = !!(ft && kindAt(ft.x, ft.y) === "stove" && st.items.get(ft.y * W + ft.x)?.k === "meat");
      chefPose(o.c, t, dt, { walk: p.moving ? 1 : 0, carry: !!p.hold, chop: p.chop, cook: cook && !p.moving, mood: t < worriedUntil ? "worried" : null, cheer: o.cheer });
      // what's in their hands
      const sg = signOf(p.hold);
      if (sg !== o.heldSign) {
        if (o.held) scene.remove(o.held);
        o.held = p.hold ? food(p.hold) : null;
        if (o.held) scene.add(o.held);
        o.heldSign = sg;
      }
      if (o.held) {
        o.held.position.set(p.x + p.fx * 0.36, 0.62 + Math.abs(Math.sin(t * 11)) * 0.02 * (p.moving ? 1 : 0), p.y + p.fy * 0.36);
        o.held.rotation.y = o.c.rotation.y;
      }
      if (o.ring) { o.ring.position.set(p.x, 0.02, p.y); o.ring.material.opacity = 0.5 + Math.sin(t * 5) * 0.3; }
      if (o.tag) o.tag.position.set(p.x, 2.05, p.y);
      if (p.moving && t - o.puffAt > 0.2) { o.puffAt = t; fx.puff(p.x - p.fx * 0.2, p.y - p.fy * 0.2, { size: 0.05, up: 0.25, color: 0xfff3e0 }); }
    }
    for (const [id, o] of chefs) if (!here.has(id)) { scene.remove(o.c); if (o.held) scene.remove(o.held); if (o.ring) scene.remove(o.ring); if (o.tag) scene.remove(o.tag); chefs.delete(id); }
    // the counter I'm facing, and a flash where I just used one
    if (st.facing) {
      facing.visible = true;
      facing.position.set(st.facing.x + 0.5, TOP + 0.02, st.facing.y + 0.5);
      facing.children.forEach((m) => { m.material.opacity = 0.55 + Math.sin(t * 6) * 0.35; });
    } else facing.visible = false;
    flashRing.visible = t - flashAt < 0.3;
    if (flashRing.visible) flashRing.children.forEach((m) => { m.material.opacity = 1 - (t - flashAt) / 0.3; });
    fx.tick(dt);
    camera.position.copy(base);
    if (shake > 0) { shake = Math.max(0, shake - dt * 3); camera.position.x += (Math.random() - 0.5) * shake * 0.1; camera.position.y += (Math.random() - 0.5) * shake * 0.1; }
    renderer.render(scene, camera);
  }

  function used(x, y, t) {
    flashRing.position.set(x + 0.5, TOP + 0.03, y + 0.5);
    flashAt = t;
  }

  function event(e, t) {
    const winRow = LAYOUT.findIndex((r) => r[0] === "W");
    if (e.type === "served") {
      fx.burst(0.6, TOP + 0.3, winRow + 1, { colors: [0xffc53d, 0xffffff, 0x8fdb5c], n: 18, speed: 3.5 });
      fx.word(`+${e.pts}`, 0.8, TOP + 0.9, winRow + 1, { color: "#FFC53D", height: 0.55 });
      const o = chefs.get(e.id); if (o) o.cheer = 1.2;
      const bell = tileObjs.get(winRow * W)?.userData.bell;
      if (bell) bell.scale.setScalar(1.4);
    } else if (e.type === "wrong") {
      fx.word("Nope!", 0.8, TOP + 0.9, winRow + 1, { color: "#FF6B6B", height: 0.45 });
    } else if (e.type === "chopped") {
      fx.burst(e.x + 0.5, TOP + 0.2, e.y + 0.5, { colors: [0x8fdb5c, 0xffffff], n: 8, speed: 2 });
      fx.word("✓", e.x + 0.5, TOP + 0.7, e.y + 0.5, { color: "#8FDB5C", height: 0.35, life: 0.6 });
    } else if (e.type === "cooked") {
      fx.word("Done!", e.x + 0.5, TOP + 0.8, e.y + 0.5, { color: "#FFC53D", height: 0.35, life: 0.8 });
    } else if (e.type === "burnt") {
      fx.word("Burnt!", e.x + 0.5, TOP + 0.8, e.y + 0.5, { color: "#FF6B6B", height: 0.4 });
      shake = 0.8; worriedUntil = t + 2;
    } else if (e.type === "expired") {
      worriedUntil = t + 1.2;
    }
  }

  // which counter tile is under a point on the screen (for tapping one)
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP);
  function tileAt(nx, ny) {
    ray.setFromCamera({ x: nx, y: ny }, camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: Math.floor(hit.x), y: Math.floor(hit.z) };
  }

  return {
    resize: frame,
    draw,
    event,
    used,
    tileAt,
    dispose() {
      renderer.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}
