// src/components/games/movingScene.js
// MOVING DAY, drawn: a little house with its roof off, seen from the street,
// a garden, the van at the kerb, chubby movers and Biscuit the dog — all in
// the PlayRoom look kit (toyKit.js: toon light, ink outlines, soft shadows).
// It only draws: MovingDay.jsx feeds it the server's world every frame.
//   const sc = createMovingScene(canvas);  sc.resize(w, h);
//   sc.draw(state, dt, t);  sc.fx(event);  sc.dispose();
import * as THREE from "three";
import { W, H, LAYOUT, KINDS, HALF } from "../together/movingCore.mjs";
import { toon, box, ball, can, cone, at, mover, animate, effects, ring, sunnyLights, INK } from "./toyKit";

const MOVER_COLOURS = [0x4cc9f0, 0xff8fc7, 0x8fdb5c, 0xffa36c, 0x9b5de5, 0x3dd6c0, 0xffc53d, 0xff6b6b];
const WALL = 0xf6d2a6, WALL_TOP = 0xd8744c;
const wallH = (y) => (y >= 6 ? 0.3 : 0.7);           // the front wall low: a cutaway
const GRASS = 0x93cf6f, GRASS_B = 0x87c565, FIELD = 0x7ab95d;
const RUGS = [0x4cc9f0, 0xff6b6b, 0x9b5de5];

// a tile (x, y) in the rules is (x, 0, y) here: y down the screen = towards the camera

// ── the furniture ────────────────────────────────────────────────────────────
// Each faces +z; a big thing lies along x (its two ends at ±HALF).
function build(k) {
  const g = new THREE.Group();
  const add = (o) => { g.add(o); return o; };
  switch (k) {
    case "box":
      add(at(box(0.42, 0.34, 0.42, 0xd6a066), 0, 0.17, 0));
      add(at(box(0.43, 0.02, 0.1, 0xf3e3c3, { line: 0 }), 0, 0.345, 0));
      break;
    case "books":
      add(at(box(0.44, 0.3, 0.38, 0xb98552), 0, 0.15, 0));
      [0xff6b6b, 0x4cc9f0, 0x8fdb5c].forEach((c, i) => add(at(box(0.08, 0.16, 0.26, c, { line: 0.1 }), -0.12 + i * 0.12, 0.38, 0)));
      break;
    case "lamp":
      add(at(can(0.13, 0.15, 0.06, 0x6c5e85), 0, 0.03, 0));
      add(at(can(0.025, 0.025, 0.5, 0x6c5e85, { line: 0 }), 0, 0.3, 0));
      add(at(cone(0.2, 0.22, 0xffd65c, { line: 0.08 }), 0, 0.6, 0)).rotation.x = Math.PI;
      break;
    case "plant":
      add(at(can(0.15, 0.11, 0.22, 0xe07a4f), 0, 0.11, 0));
      [[0, 0.36, 0, 0.16], [-0.1, 0.3, 0.05, 0.12], [0.1, 0.32, -0.04, 0.12]].forEach(([x, y, z, r]) => add(at(ball(r, 0x4fae4a), x, y, z)));
      break;
    case "tv":
      add(at(box(0.56, 0.38, 0.2, 0x3c3550), 0, 0.27, 0));
      add(at(box(0.46, 0.28, 0.02, 0x7fd6ff, { line: 0, shadow: false }), 0, 0.28, 0.11));
      add(at(box(0.2, 0.08, 0.16, 0x3c3550), 0, 0.04, 0));
      break;
    case "guitar":
      add(at(ball(0.16, 0xe0883f), 0, 0.08, 0.12, 1, 0.45, 1));
      add(at(ball(0.12, 0xe0883f), 0, 0.08, -0.08, 1, 0.45, 1));
      add(at(box(0.07, 0.05, 0.42, 0x6b4226, { line: 0.1 }), 0, 0.1, -0.3));
      break;
    case "chair":
      add(at(box(0.4, 0.07, 0.4, 0xff8fc7), 0, 0.26, 0));
      add(at(box(0.4, 0.34, 0.07, 0xff8fc7), 0, 0.45, -0.17));
      for (const [x, z] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) add(at(box(0.05, 0.24, 0.05, 0x8a5a3c, { line: 0 }), x, 0.12, z));
      break;
    case "teddy":
      add(at(ball(0.15, 0xc68a54), 0, 0.15, 0));
      add(at(ball(0.12, 0xc68a54), 0, 0.36, 0.02));
      for (const s of [-1, 1]) add(at(ball(0.05, 0xc68a54), s * 0.09, 0.46, 0));
      add(at(ball(0.04, 0xf3d4b2, { line: 0 }), 0, 0.34, 0.12));
      break;
    case "sofa":
      add(at(box(1.7, 0.26, 0.66, 0x9b5de5), 0, 0.2, 0));
      add(at(box(1.7, 0.42, 0.18, 0x9b5de5), 0, 0.42, -0.26));
      for (const s of [-1, 1]) add(at(box(0.18, 0.38, 0.66, 0x8448cf), s * 0.78, 0.3, 0));
      for (const s of [-1, 1]) add(at(box(0.66, 0.1, 0.46, 0xc39af2), s * 0.34, 0.37, 0.06));
      break;
    case "fridge":
      add(at(box(1.0, 1.2, 0.62, 0xf2f6fb), 0, 0.6, 0));
      add(at(box(1.0, 0.03, 0.63, 0xcfd8e3, { line: 0 }), 0, 0.8, 0));
      add(at(box(0.05, 0.3, 0.06, 0x9aa7b8, { line: 0 }), 0.38, 0.95, 0.33));
      add(at(box(0.05, 0.3, 0.06, 0x9aa7b8, { line: 0 }), 0.38, 0.45, 0.33));
      add(at(ball(0.06, 0xff6b6b, { line: 0.15 }), -0.25, 1.0, 0.32, 1, 1, 0.4));
      break;
    case "bed":
      add(at(box(1.8, 0.26, 1.0, 0xa86b45), 0, 0.13, 0));
      add(at(box(1.7, 0.16, 0.92, 0xffffff), 0, 0.33, 0));
      add(at(box(1.05, 0.08, 0.94, 0x4cc9f0), 0.3, 0.43, 0));
      add(at(box(0.36, 0.12, 0.6, 0xfff6e6), -0.62, 0.46, 0));
      add(at(box(0.12, 0.62, 1.0, 0xa86b45), -0.92, 0.31, 0));
      break;
    case "shelf":
      add(at(box(1.6, 1.25, 0.38, 0xc98f5e), 0, 0.62, 0));
      for (const y of [0.3, 0.7, 1.08]) {
        add(at(box(1.46, 0.03, 0.3, 0x9b6740, { line: 0 }), 0, y - 0.1, 0.04));
        [0xff6b6b, 0x4cc9f0, 0xffc53d, 0x8fdb5c, 0x9b5de5].forEach((c, i) => add(at(box(0.1, 0.24, 0.24, c, { line: 0.08, shadow: false }), -0.55 + i * 0.27 + (y * 7 % 1) * 0.1, y + 0.04, 0.06)));
      }
      break;
    default:
      add(at(box(0.4, 0.3, 0.4, 0xd6a066), 0, 0.15, 0));
  }
  // a big thing's ends: handles you grab (shown when you're near one)
  if (KINDS[k].big) {
    g.userData.ends = [-1, 1].map((s) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20), new THREE.MeshBasicMaterial({ color: 0xffc53d }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(s * HALF, 0.05, 0);
      m.visible = false;
      g.add(m);
      return m;
    });
  }
  return g;
}

// ── Biscuit ──────────────────────────────────────────────────────────────────
function dog() {
  const g = new THREE.Group(), b = new THREE.Group();
  g.add(b);
  b.add(at(ball(0.2, 0xe2b06a), 0, 0.24, 0, 1, 0.8, 1.35));
  const head = new THREE.Group();
  head.position.set(0, 0.4, 0.26);
  head.add(at(ball(0.15, 0xe2b06a), 0, 0, 0));
  head.add(at(ball(0.08, 0xf3d9b0), 0, -0.04, 0.12, 1, 0.8, 1));
  head.add(at(ball(0.03, INK, { line: 0 }), 0, -0.01, 0.2));
  for (const s of [-1, 1]) {
    head.add(at(ball(0.07, 0x8a5a3c), s * 0.13, 0.04, -0.02, 0.6, 1.3, 0.8));
    head.add(at(ball(0.028, INK, { line: 0 }), s * 0.06, 0.04, 0.12));
  }
  b.add(head);
  const tail = at(can(0.025, 0.04, 0.22, 0xe2b06a, { line: 0.1 }), 0, 0.34, -0.27);
  tail.rotation.x = -0.9;
  b.add(tail);
  const legs = [[-0.1, 0.12], [0.1, 0.12], [-0.1, -0.12], [0.1, -0.12]].map(([x, z]) => { const l = at(can(0.04, 0.04, 0.14, 0xd29b55, { line: 0 }), x, 0.07, z); b.add(l); return l; });
  g.userData = { b, head, tail, legs };
  return g;
}

// ── the house, the garden, the van ───────────────────────────────────────────
function planks() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const x = c.getContext("2d");
  for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? "#d49a5e" : "#e0ad72"; x.fillRect(0, i * 16, 64, 16); }
  x.strokeStyle = "rgba(110,60,25,.35)"; x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(0, i * 16); x.lineTo(64, i * 16); x.stroke(); }
  [[20, 0], [50, 16], [10, 32], [40, 48]].forEach(([px, py]) => { x.beginPath(); x.moveTo(px, py); x.lineTo(px, py + 16); x.stroke(); });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function world(scene) {
  const g = new THREE.Group();
  scene.add(g);
  // the ground, well past the edges
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 50), toon(FIELD));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(W / 2, -0.01, H / 2);
  ground.receiveShadow = true;
  g.add(ground);
  // the street below the kerb
  const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 3.2), toon(0x6d6a7a));
  road.rotation.x = -Math.PI / 2; road.position.set(W / 2, 0.0, H + 1.6); road.receiveShadow = true;
  g.add(road);
  for (let x = -20; x < 40; x += 2) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.14), toon(0xfff6e6)); d.rotation.x = -Math.PI / 2; d.position.set(x, 0.005, H + 1.9); g.add(d); }
  const kerb = new THREE.Mesh(new THREE.BoxGeometry(60, 0.08, 0.25), toon(0xd8d2cc)); kerb.position.set(W / 2, 0.04, H + 0.05); kerb.receiveShadow = true; g.add(kerb);
  // floors: planks indoors, a checked lawn outside
  const tex = planks();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = LAYOUT[y][x];
    if (c === "#" || c === "w" || c === "C" || c === "T") continue;
    const indoor = y < 7;
    let mat;
    if (indoor) { const m = toon(0xffffff, { map: tex }); mat = m; }
    else mat = toon((x + y) % 2 ? GRASS : GRASS_B);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    f.rotation.x = -Math.PI / 2; f.position.set(x + 0.5, 0.001, y + 0.5); f.receiveShadow = true;
    g.add(f);
  }
  // the rugs: each patch of r as one rounded mat
  const seen = new Set();
  let ri = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (LAYOUT[y][x] !== "r" || seen.has(`${x},${y}`)) continue;
    let x2 = x, y2 = y;
    while (LAYOUT[y][x2 + 1] === "r") x2++;
    while (LAYOUT[y2 + 1] && LAYOUT[y2 + 1][x] === "r") y2++;
    for (let yy = y; yy <= y2; yy++) for (let xx = x; xx <= x2; xx++) seen.add(`${xx},${yy}`);
    const w = x2 - x + 1, h = y2 - y + 1;
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 28), toon(RUGS[ri++ % RUGS.length]));
    rug.scale.set(w * 0.95, 1, h * 0.95);
    rug.position.set(x + w / 2, 0.012, y + h / 2); rug.receiveShadow = true;
    g.add(rug);
  }
  // walls: low (the roof is off), cream, a wooden top; windows are a sill and two posts
  const wallGeo = new THREE.BoxGeometry(1, 1, 1), topGeo = new THREE.BoxGeometry(1.02, 0.08, 1.02);
  const wallInst = new THREE.InstancedMesh(wallGeo, toon(WALL), W * H);
  const topInst = new THREE.InstancedMesh(topGeo, toon(WALL_TOP), W * H);
  wallInst.castShadow = true; wallInst.receiveShadow = true;
  let n = 0;
  const m4 = new THREE.Matrix4();
  for (let y = 0; y < 7; y++) for (let x = 0; x < W; x++) {
    const c = LAYOUT[y][x];
    if (c === "#") {
      const wh = wallH(y);
      m4.makeScale(1, wh, 1); m4.setPosition(x + 0.5, wh / 2, y + 0.5); wallInst.setMatrixAt(n, m4);
      m4.makeTranslation(x + 0.5, wh + 0.04, y + 0.5); topInst.setMatrixAt(n, m4); n++;
    } else if (c === "w") {
      // an open window: a low sill with a window box of flowers under it
      g.add(at(box(1, 0.14, 1, WALL, { line: 0 }), x + 0.5, 0.07, y + 0.5));
      g.add(at(box(1.02, 0.05, 1.04, 0x9fe3ff, { line: 0 }), x + 0.5, 0.165, y + 0.5));
      g.add(at(box(0.8, 0.12, 0.2, 0x8a5a3c, { line: 0.1 }), x + 0.5, 0.12, y + 1.08));
      for (const s of [-0.25, 0, 0.25]) g.add(at(ball(0.06, [0xff8fc7, 0xffc53d, 0xff6b6b][Math.round((s + 0.25) * 4)], { line: 0.15 }), x + 0.5 + s, 0.22, y + 1.08));
    }
  }
  wallInst.count = n; topInst.count = n;
  g.add(wallInst, topInst);
  // the front step and a doormat
  g.add(at(box(2, 0.05, 0.5, 0xd8d2cc, { line: 0 }), 9, 0.025, 7.25));
  // the van: a bed with low sides (open to the garden), a cab, wheels
  let vx0 = 99, vx1 = -1, vy0 = 99, vy1 = -1, cx0 = 99;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (LAYOUT[y][x] === "T") { vx0 = Math.min(vx0, x); vx1 = Math.max(vx1, x + 1); vy0 = Math.min(vy0, y); vy1 = Math.max(vy1, y + 1); }
    if (LAYOUT[y][x] === "C") cx0 = Math.min(cx0, x);
  }
  const vw = vx1 - vx0, vd = vy1 - vy0, vcx = (vx0 + vx1) / 2, vcz = (vy0 + vy1) / 2;
  g.add(at(box(vw, 0.18, vd, 0xf2f2f2), vcx, 0.09, vcz));
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(vw - 0.1, vd - 0.1), toon(0xbfa27f));
  bed.rotation.x = -Math.PI / 2; bed.position.set(vcx, 0.185, vcz); bed.receiveShadow = true; g.add(bed);
  g.add(at(box(vw, 0.55, 0.12, 0xff6b6b), vcx, 0.45, vy0 + 0.06));           // the far side
  g.add(at(box(0.12, 0.55, vd, 0xff6b6b), vx1 - 0.06, 0.45, vcz));           // against the cab
  g.add(at(box(vw, 0.28, 0.12, 0xff6b6b), vcx, 0.3, vy1 - 0.06));            // the near side, low so you see in
  g.add(at(box(vw - 0.4, 0.08, 0.13, 0xffffff, { line: 0 }), vcx, 0.38, vy1 - 0.06));
  const ramp = at(box(0.7, 0.04, vd - 0.4, 0xa8a4b4, { line: 0 }), vx0 - 0.3, 0.09, vcz);
  ramp.rotation.z = 0.25; g.add(ramp);
  const cab = new THREE.Group();
  cab.add(at(box(1.9, 1.05, vd, 0xff6b6b), 0, 0.62, 0));
  cab.add(at(box(0.08, 0.45, vd - 0.4, 0x9fe3ff, { line: 0, shadow: false }), 0.95, 0.8, 0));
  cab.add(at(box(1.0, 0.3, vd - 0.2, 0xff6b6b), 0.95, 0.25, 0));
  cab.add(at(box(0.12, 0.12, 0.3, 0xffd65c, { line: 0.1 }), 1.45, 0.3, vd / 2 - 0.3));
  cab.position.set(cx0 + 0.95, 0, vcz);
  g.add(cab);
  for (const [x, z] of [[vx0 + 0.9, vy1], [vx1 - 0.6, vy1], [cx0 + 1.2, vy1], [vx0 + 0.9, vy0], [vx1 - 0.6, vy0], [cx0 + 1.2, vy0]]) {
    const wheel = at(can(0.3, 0.3, 0.22, 0x2f2a3a), x, 0.3, z);
    wheel.rotation.x = Math.PI / 2; g.add(wheel);
    g.add(at(can(0.12, 0.12, 0.24, 0xd8d2cc, { line: 0 }), x, 0.3, z).rotateX(Math.PI / 2));
  }
  // the load: a stack that grows as things go in
  const load = new THREE.Group();
  g.add(load);
  // the garden: trees round the edges, bushes, flowers, a fence
  const tree = (x, z, s = 1) => {
    g.add(at(can(0.1 * s, 0.14 * s, 0.7 * s, 0x8a5a3c), x, 0.35 * s, z));
    g.add(at(ball(0.55 * s, 0x5fbf4a), x, 1.0 * s, z));
    g.add(at(ball(0.38 * s, 0x6fd15a), x + 0.25 * s, 1.35 * s, z + 0.1 * s));
  };
  [[-1.2, 1], [-1.4, 4.5], [-1, 8], [17.3, 1.5], [17.5, 5], [-2.5, 11.8], [3, -1.3], [8, -1.5], [13, -1.2]].forEach(([x, z], i) => tree(x, z, 0.9 + (i % 3) * 0.15));
  [[1, 7.6], [5.5, 7.5], [13.6, 7.4], [0.6, 10.4]].forEach(([x, z]) => g.add(at(ball(0.32, 0x4fae4a), x, 0.22, z, 1, 0.75, 1)));
  [[2.2, 8.4, 0xff8fc7], [3.1, 9.6, 0xffc53d], [6.2, 8.8, 0xffffff], [4.6, 10.3, 0xff6b6b], [0.9, 9.1, 0x9b5de5]].forEach(([x, z, c]) => {
    g.add(at(can(0.015, 0.015, 0.2, 0x4fae4a, { line: 0 }), x, 0.1, z));
    g.add(at(ball(0.07, c, { line: 0.15 }), x, 0.22, z));
  });
  for (let x = 0.3; x < 7.8; x += 0.5) g.add(at(box(0.08, 0.36, 0.08, 0xfff6e6, { line: 0.15 }), x, 0.18, H - 0.15));
  g.add(at(box(7.6, 0.06, 0.05, 0xfff6e6, { line: 0 }), 4.05, 0.3, H - 0.15));
  // a postbox by the gate
  g.add(at(can(0.04, 0.04, 0.6, 0x6c5e85, { line: 0 }), 7.6, 0.3, 7.6));
  g.add(at(box(0.3, 0.22, 0.2, 0x4cc9f0), 7.6, 0.66, 7.6));
  return { g, load, van: { x0: vx0, x1: vx1, y0: vy0, y1: vy1 } };
}

// ── the scene ────────────────────────────────────────────────────────────────
export function createMovingScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe8ff);
  scene.fog = new THREE.Fog(0xbfe8ff, 24, 46);
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 100);
  sunnyLights(scene, { cx: W / 2, cz: H / 2, size: 12 });
  const { load, van } = world(scene);
  const fx = effects(scene);

  const things = new Map();     // item id -> group
  const movers = new Map();     // player id -> { m, tag, ring }
  const pooch = dog();
  pooch.scale.setScalar(1.25);
  scene.add(pooch);
  let loadN = 0, drawn = false;

  function frame(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // From the street, looking up the garden: as close as fits the house's
    // back wall, both sides and the van's wheels on screen, centred.
    const tilt = 1.0;                                       // radians up from flat
    const pts = [[-0.2, 0.75, -0.2], [W + 0.2, 0.75, -0.2], [-0.2, 0, H + 0.3], [W + 0.2, 0, H + 0.3], [W + 0.2, 1.1, H - 0.2]];
    const v = new THREE.Vector3();
    let cz = H / 2, d = 20;
    const place = () => {
      camera.position.set(W / 2, Math.sin(tilt) * d, cz + Math.cos(tilt) * d);
      camera.lookAt(W / 2, 0, cz);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
    };
    for (let pass = 0; pass < 3; pass++) {
      let lo = 4, hi = 60;
      for (let i = 0; i < 24; i++) {
        d = (lo + hi) / 2;
        place();
        const fits = pts.every(([x, y, z]) => { v.set(x, y, z).project(camera); return Math.abs(v.x) <= 0.97 && Math.abs(v.y) <= 0.95; });
        if (fits) hi = d; else lo = d;
      }
      d = hi;
      place();
      // even out the margins top and bottom
      const ys = pts.map(([x, y, z]) => v.set(x, y, z).project(camera).y);
      const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
      cz -= mid * 2.2;
    }
    place();
    base.copy(camera.position);
  }
  const base = new THREE.Vector3();

  function moverFor(id, i, name, mine) {
    let o = movers.get(id);
    if (o) return o;
    const m = mover(MOVER_COLOURS[i % MOVER_COLOURS.length], { seed: id % 97 });
    m.scale.setScalar(1.3);
    scene.add(m);
    const r = mine ? ring(0xffffff, 0.42) : null;
    if (r) scene.add(r);
    let tag = null;
    if (name) {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      ctx.font = "800 44px Fredoka, Nunito, sans-serif";
      const tw = Math.ceil(ctx.measureText(name).width) + 40;
      c.width = tw; c.height = 64;
      ctx.font = "800 44px Fredoka, Nunito, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      ctx.lineWidth = 9; ctx.strokeStyle = "#2E2140"; ctx.strokeText(name, tw / 2, 34);
      ctx.fillStyle = "#ffffff"; ctx.fillText(name, tw / 2, 34);
      tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
      tag.renderOrder = 9;
      tag.scale.set(0.42 * (tw / 64), 0.42, 1);
      scene.add(tag);
    }
    o = { m, ring: r, tag, puffAt: 0 };
    movers.set(id, o);
    return o;
  }

  let shake = 0;
  // state: { movers: [{ id, i, x, y, fx, fy, carry, lift, walk, name, mine }], items: [{ id, k, x, y, a, fly, held }],
  //          dog: [x, y, fx, fy, nap], near: { id, end }|null, loaded }
  function draw(st, dt, t) {
    // movers
    const alive = new Set();
    for (const p of st.movers) {
      alive.add(p.id);
      const o = moverFor(p.id, p.i, p.name, p.mine);
      o.m.position.set(p.x, 0, p.y);
      const want = Math.atan2(p.fx, p.fy);
      let d = want - o.m.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      o.m.rotation.y += d * Math.min(1, dt * 14);
      animate(o.m, t, { walk: p.walk, carry: p.carry, lift: p.lift || 0 });
      if (o.ring) { o.ring.position.set(p.x, 0.02, p.y); o.ring.material.opacity = 0.55 + Math.sin(t * 5) * 0.3; }
      if (o.tag) o.tag.position.set(p.x, 1.75, p.y);
      if (p.walk > 0.3 && t - o.puffAt > 0.16) { o.puffAt = t; fx.puff(p.x - p.fx * 0.2, p.y - p.fy * 0.2, { size: 0.06, up: 0.3 }); }
    }
    for (const [id, o] of movers) if (!alive.has(id)) { scene.remove(o.m); if (o.ring) scene.remove(o.ring); if (o.tag) scene.remove(o.tag); movers.delete(id); }
    // things
    const here = new Set();
    for (const it of st.items) {
      here.add(it.id);
      let g = things.get(it.id);
      // the first house is simply there; a new house's things pop up into place
      if (!g) { g = build(it.k); scene.add(g); things.set(it.id, g); g.userData.k = it.k; g.userData.pop = drawn ? 0 : 1; }
      // a new house: things pop up into place
      g.userData.pop = Math.min(1, g.userData.pop + dt * 3);
      const pop = g.userData.pop, sp = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.25 : 1;
      g.scale.setScalar(Math.max(0.01, pop) * sp * 1.12);
      const big = !!KINDS[it.k].big;
      let h = 0;
      if (it.fly >= 0) h = 4 * it.fly * (1 - it.fly) * 1.3 + 0.2;
      else if (it.held) h = big ? 0.32 : 0.45;
      g.position.set(it.x, h, it.y);
      // big things lie along their angle; small ones a little askew, spinning in the air
      if (big) g.rotation.y = -it.a;
      else if (it.fly >= 0) { g.rotation.y += dt * 12; g.rotation.x = it.fly * 6; }
      else { g.rotation.x = 0; g.rotation.y = -it.a; }
      if (it.held && !big) g.position.y += Math.sin(t * 13) * 0.02;
      // the thing you'd grab, and a big thing's free ends near you
      const near = st.near && st.near.id === it.id;
      const ol = g.userData.hl;
      if (near !== !!ol) {
        g.userData.hl = near;
        g.traverse((o) => { if (o.material && o.material.color && o.material.side === THREE.BackSide) o.material = near ? hlMat : inkMatOf(o); });
      }
      if (g.userData.ends) g.userData.ends.forEach((e, i) => { e.visible = !!(near && st.near.end === i); e.scale.setScalar(1 + Math.sin(t * 8) * 0.12); });
    }
    for (const [id, g] of things) if (!here.has(id)) { scene.remove(g); things.delete(id); }
    drawn = true;
    // Biscuit
    if (st.dog) {
      const [x, y, dfx, dfy, nap] = st.dog;
      const u = pooch.userData;
      const moved = Math.hypot(x - pooch.position.x, y - pooch.position.z) > 0.002;
      pooch.position.set(x, 0, y);
      pooch.rotation.y = Math.atan2(dfx, dfy);
      u.tail.rotation.z = Math.sin(t * (nap ? 3 : 18)) * 0.6;
      u.b.position.y = moved ? Math.abs(Math.sin(t * 16)) * 0.04 : 0;
      u.b.scale.y = nap ? 0.75 : 1;
      u.head.rotation.x = nap ? 0.45 : Math.sin(t * 2) * 0.06;
      u.legs.forEach((l, i) => { l.position.y = 0.07 + (moved ? Math.max(0, Math.sin(t * 16 + (i % 2) * Math.PI)) * 0.05 : 0); });
    }
    // the load in the van: a little stack per thing loaded (up to a vanful)
    const shown = Math.min(24, st.loaded || 0);
    while (loadN < shown) {
      const i = loadN++;
      const cols = [0xd6a066, 0xc98f5e, 0xe2b06a, 0xb98552];
      const bx = at(box(0.42, 0.3, 0.42, cols[i % 4], { line: 0.06 }), van.x1 - 0.5 - Math.floor(i / 6) * 0.5, 0.33 + Math.floor((i % 6) / 3) * 0.32, van.y0 + 0.6 + (i % 3) * 0.75);
      bx.rotation.y = (i * 0.37) % 0.4 - 0.2;
      load.add(bx);
    }
    if (shown < loadN) { load.clear(); loadN = 0; }
    fx.tick(dt);
    // a crash shakes the camera a moment
    camera.position.copy(base);
    if (shake > 0) { shake = Math.max(0, shake - dt * 3); camera.position.x += (Math.random() - 0.5) * shake * 0.12; camera.position.y += (Math.random() - 0.5) * shake * 0.12; }
    renderer.render(scene, camera);
  }

  const hlMat = new THREE.MeshBasicMaterial({ color: 0xffc53d, side: THREE.BackSide });
  const baseInk = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  const inkMatOf = () => baseInk;

  // something happened (from the server's events)
  function event(e) {
    if (e.type === "loaded") {
      fx.burst(e.x, 0.5, e.y, { n: 16 });
      fx.word(`+${e.pts}`, e.x, 1.0, e.y, { color: "#FFC53D", height: 0.5 });
    } else if (e.type === "smash") {
      fx.burst(e.x, 0.3, e.y, { colors: [0xffffff, 0x9fe3ff, 0xff6b6b], n: 18, shape: "shard", speed: 3.5 });
      fx.word(e.why === "dog" ? "OOPS!" : "CRASH!", e.x, 0.9, e.y, { color: "#FF6B6B", height: 0.5 });
      shake = 1;
    } else if (e.type === "woof") {
      fx.word("WOOF!", e.x, 0.9, e.y, { color: "#FFFFFF", height: 0.42 });
    } else if (e.type === "cleared") {
      for (let i = 0; i < 6; i++) fx.burst(2 + i * 2.2, 0.6, 3.5, { colors: [0xffc53d, 0xff8fc7, 0x4cc9f0, 0x8fdb5c], n: 14, speed: 4 });
      fx.word(`House cleared! +${e.pts}`, W / 2, 1.6, 3.6, { color: "#8FDB5C", height: 0.8, life: 1.8 });
    } else if (e.type === "land") {
      for (let i = 0; i < 4; i++) fx.puff(e.x, e.y, { size: 0.09, up: 0.4, color: 0xf3e3c3 });
    } else if (e.type === "throw" && e.x != null) {
      fx.puff(e.x, e.y, { size: 0.08 });
    }
  }

  return {
    resize: frame,
    draw,
    event,
    dispose() {
      renderer.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}
