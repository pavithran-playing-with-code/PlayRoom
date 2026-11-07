// src/components/games/mazeScene.js
// MAZE RUNNER, drawn as a toy you'd tip in your hands: a wooden tray with a
// maze of painted walls on it, a shiny marble that rolls down a corridor and
// stops at the turning, the board tipping the way it rolls, a trail of dots
// where you've been, and a hole with a flag — the marble drops in and the
// next, bigger maze is laid out.
//
// Only drawing: mazeBoard.js has the rules (the maze, where a roll stops).
// One cell is one unit; row 0 is the far side, column 0 the left.
import * as THREE from "three";
import { N, W, isOpen } from "./mazeBoard";
import { toon, part, at, effects, sunnyLights, INK } from "./toyKit";

const WALL_H = 0.42, WALL_T = 0.16;
const GEO = new Map();
const geo = (k, f) => { if (!GEO.has(k)) GEO.set(k, f()); return GEO.get(k); };

function board(maze) {
  const g = new THREE.Group();
  const { rows, cols } = maze;
  const X = (c) => c + 0.5 - cols / 2, Z = (r) => r + 0.5 - rows / 2;
  // the tray: a wooden base with a raised rim
  g.add(at(part(new THREE.BoxGeometry(cols + 1.2, 0.5, rows + 1.2), 0xc98f55, { line: 0.01, receive: true }), 0, -0.25, 0));
  for (const [w, d, x, z] of [[cols + 1.2, 0.6, 0, -rows / 2 - 0.3], [cols + 1.2, 0.6, 0, rows / 2 + 0.3], [0.6, rows, -cols / 2 - 0.3, 0], [0.6, rows, cols / 2 + 0.3, 0]]) {
    g.add(at(part(new THREE.BoxGeometry(w, 0.5, d), 0xa0703f, { line: 0.02 }), x, 0.2, z));
  }
  // the floor, in soft checks
  const floor = new THREE.Group();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const m = new THREE.Mesh(geo("tile", () => new THREE.BoxGeometry(1, 0.04, 1)), toon((r + c) % 2 ? 0xfff1d6 : 0xffe8c2));
    m.position.set(X(c), 0, Z(r));
    m.receiveShadow = true;
    floor.add(m);
  }
  g.add(floor);
  // walls: each cell's north and west wall, plus the far east and south edges
  const wallM = 0x9b5de5;
  const addWall = (x, z, along) => {
    const w = at(part(geo(along ? "wx" : "wz", () => (along ? new THREE.BoxGeometry(1 + WALL_T, WALL_H, WALL_T) : new THREE.BoxGeometry(WALL_T, WALL_H, 1 + WALL_T))), wallM, { line: 0.05 }), x, WALL_H / 2, z);
    g.add(w);
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (r > 0 && !isOpen(maze, r, c, N)) addWall(X(c), Z(r) - 0.5, true);
    if (c > 0 && !isOpen(maze, r, c, W)) addWall(X(c) - 0.5, Z(r), false);
  }
  // the start: a star on the floor; the goal: a hole and a flag
  const st = new THREE.Mesh(geo("star", () => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 0.14 : 0.32; if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } return new THREE.ShapeGeometry(s); }), new THREE.MeshBasicMaterial({ color: 0xffc53d }));
  st.rotation.x = -Math.PI / 2;
  st.position.set(X(maze.start.c), 0.03, Z(maze.start.r));
  g.add(st);
  const gx = X(maze.goal.c), gz = Z(maze.goal.r);
  const hole = new THREE.Mesh(geo("hole", () => new THREE.CircleGeometry(0.32, 24)), new THREE.MeshBasicMaterial({ color: 0x1a1226 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(gx, 0.03, gz);
  g.add(hole);
  const ring = at(part(geo("ring", () => new THREE.TorusGeometry(0.34, 0.05, 8, 24)), 0x5dbb5a, { line: 0.15 }), gx, 0.04, gz);
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  const flag = new THREE.Group();
  flag.add(at(part(geo("pole", () => new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8)), 0xffffff, { line: 0.2 }), 0, 0.55, 0));
  const cloth = at(part(geo("cloth", () => new THREE.BoxGeometry(0.42, 0.26, 0.03)), 0xff6b6b, { line: 0.1 }), 0.22, 0.95, 0);
  flag.add(cloth);
  flag.position.set(gx + 0.28, 0, gz - 0.2);
  g.add(flag);
  // the trail: a dot on every cell you've rolled over (shown as you go)
  const dots = maze.cells.map((_, i) => {
    const d = new THREE.Mesh(geo("dot", () => new THREE.CylinderGeometry(0.09, 0.09, 0.02, 12)), new THREE.MeshBasicMaterial({ color: 0xff8fc7 }));
    d.position.set(X(i % cols), 0.035, Z(Math.floor(i / cols)));
    d.visible = false;
    g.add(d);
    return d;
  });
  return { g, X, Z, dots, cloth, rows, cols };
}

export function createMazeScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfff6e6);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  sunnyLights(scene, { size: 10 });
  const fx = effects(scene);
  const tray = new THREE.Group();            // what tips
  scene.add(tray);
  // the marble: glossy blue, a white glint, an ink outline
  const marble = new THREE.Group();
  const ballGeo = new THREE.SphereGeometry(0.28, 28, 20);
  const ball = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0x4cc9f0, roughness: 0.18, metalness: 0.15 }));
  ball.castShadow = true;
  const ink = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  ink.scale.setScalar(1.08);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 28), toon(0xffffff));
  marble.add(ball, ink, stripe);
  marble.position.y = 0.3;
  tray.add(marble);
  let B = null, size = { w: 300, h: 300 }, from = null, to = null, t = 1, dur = 0.2, tipX = 0, tipZ = 0, sink = 0, wasDone = false;
  const at0 = new THREE.Vector3();

  function fit() {
    if (!B) return;
    camera.aspect = size.w / size.h;
    const span = Math.max(B.cols, B.rows) + 1.6;
    const tilt = 1.05;
    const dist = (span / 2) / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect) * 1.2 + 1.4;
    camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist);
    camera.lookAt(0, 0, 0.35);
    camera.updateProjectionMatrix();
  }

  function setMaze(maze) {
    if (B) { tray.remove(B.g); }
    B = board(maze);
    tray.add(B.g);
    from = to = { r: maze.start.r, c: maze.start.c };
    t = 1; sink = 0; wasDone = false;
    marble.scale.setScalar(1);
    marble.position.set(B.X(maze.start.c), 0.3, B.Z(maze.start.r));
    fit();
  }

  function resize(w, h) {
    size = { w, h };
    renderer.setSize(w, h, false);
    fit();
  }

  // st: { pos: {r, c}, seen: Set("r,c"), done }
  function draw(st, dt0, now) {
    const dt = Math.max(0, Math.min(0.1, dt0 || 0));
    if (!B) return;
    // a new place to roll to: off it goes, quicker per cell the longer the run
    if (!to || st.pos.r !== to.r || st.pos.c !== to.c) {
      from = marbleCell();
      to = { r: st.pos.r, c: st.pos.c };
      const len = Math.abs(to.r - from.r) + Math.abs(to.c - from.c);
      dur = 0.1 + len * 0.055;
      t = 0;
      tipX = Math.sign(to.r - from.r) * 0.07;           // the board tips the way it rolls
      tipZ = -Math.sign(to.c - from.c) * 0.07;
    }
    if (t < 1) {
      const prev = t;
      t = Math.min(1, t + dt / dur);
      const e = 1 - Math.pow(1 - t, 3);
      const x0 = B.X(from.c), z0 = B.Z(from.r), x1 = B.X(to.c), z1 = B.Z(to.r);
      const x = x0 + (x1 - x0) * e, z = z0 + (z1 - z0) * e;
      const moved = Math.hypot(x - marble.position.x, z - marble.position.z);
      // roll: turn the ball about the axis across its path
      if (moved > 0) { const ax = new THREE.Vector3(z1 - z0, 0, -(x1 - x0)).normalize(); ball.rotateOnWorldAxis(ax, moved / 0.28); stripe.rotateOnWorldAxis(ax, moved / 0.28); }
      marble.position.x = x; marble.position.z = z;
      if (prev < 1 && t >= 1) { fx.puff(x1, z1, { color: 0xffffff, size: 0.08 }); }
    } else { tipX *= Math.pow(0.02, dt); tipZ *= Math.pow(0.02, dt); }
    tray.rotation.x += (tipX - tray.rotation.x) * Math.min(1, dt * 10);
    tray.rotation.z += (tipZ - tray.rotation.z) * Math.min(1, dt * 10);
    // the trail
    st.seen.forEach((k) => { const [r, c] = k.split(",").map(Number); const d = B.dots[r * B.cols + c]; if (d) d.visible = true; });
    // solved: into the hole it goes, with a burst
    if (st.done && !wasDone && t >= 1) { wasDone = true; at0.copy(marble.position); fx.burst(at0.x, 0.4, at0.z, { n: 18, speed: 2.6 }); fx.word("IN!", at0.x, 1.1, at0.z, { color: "#8fdb5c", height: 0.6 }); }
    if (wasDone) { sink = Math.min(1, sink + dt * 2.2); marble.position.y = 0.3 - sink * 0.45; marble.scale.setScalar(1 - sink * 0.6); }
    else marble.position.y = 0.3;
    B.cloth.rotation.y = Math.sin(now * 3) * 0.25;
    fx.tick(dt);
    renderer.render(scene, camera);
  }

  // which cell the marble is in now (nearest)
  function marbleCell() {
    return { r: Math.round(marble.position.z + B.rows / 2 - 0.5), c: Math.round(marble.position.x + B.cols / 2 - 0.5) };
  }

  return {
    resize,
    setMaze,
    draw,
    dispose() {
      renderer.dispose();
      for (const g of GEO.values()) g.dispose();
      GEO.clear();
    },
  };
}
