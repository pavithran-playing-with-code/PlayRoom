// src/components/hollow/hollowDress.js
// The look of the rooms past the Hall (hollowChapter.mjs): what their boxes
// are drawn as, what hangs on their walls, their lights, and the things in
// them that move — the Workshop's gears and lift, the Gallery's Cuckoo and
// its beam, the Stairwell's door the Keeper comes through, the Bell Tower's
// great clock face, its bells and counterweight.
//
// Each dressX(kit) is handed the scene's tools (kit: put, boxGeo, M, ctex…
// from hollowScene.js) and returns { applyQ(Q), ambient(T, t, dt, wound, S),
// event(e), holdKid(S) }. paperFor(name, kit) gives a room its wallpaper.
// Like the scene, these read the run and never change it.
import { cuckooAt, cuckooHead, CUCKOO, WS_CRANK, TW_FACE, TW_LEVER, TW_DOOR, CW, SW_GATE_X } from "./hollowChapter.mjs";

const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (k) => k * k * (3 - 2 * k);
const PI = Math.PI;

// ── wallpaper, per room ──
export function paperFor(name, kit) {
  const { ctex, M, R } = kit, WALL_H = 14, DADO = 1.7;
  const finish = (c, w, h, dy, dark) => {
    for (let i = 0; i < 12; i++) { const x = R() * w, g = c.createLinearGradient(0, 0, 0, dy * (0.3 + R() * 0.6)); g.addColorStop(0, "rgba(10,6,3,.4)"); g.addColorStop(1, "rgba(10,6,3,0)"); c.fillStyle = g; c.fillRect(x, 0, 5 + R() * 20, dy); }
    const pg = c.createLinearGradient(0, dy, 0, h); pg.addColorStop(0, dark[0]); pg.addColorStop(1, dark[1]); c.fillStyle = pg; c.fillRect(0, dy, w, h - dy);
    c.strokeStyle = "rgba(0,0,0,.5)"; c.lineWidth = 2; for (let x = 8; x < w; x += 64) c.strokeRect(x, dy + 18, 48, h - dy - 44);
    c.fillStyle = "#2a1c12"; c.fillRect(0, dy - 4, w, 12); c.fillStyle = "#0e0804"; c.fillRect(0, h - 16, w, 16);
    for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.08})`; c.fillRect(R() * w, R() * h, 1, 1); }
  };
  const tex = {
    // the Workshop: dark wood boards, a pegboard band, oil stains
    workshop: (c, w, h) => {
      const dy = h * (1 - DADO / WALL_H);
      for (let x = 0; x < w; x += 32) { c.fillStyle = x / 32 % 2 ? "#3a2a1c" : "#33251a"; c.fillRect(x, 0, 32, dy); c.fillStyle = "rgba(0,0,0,.4)"; c.fillRect(x, 0, 2, dy); }
      for (let y = dy * 0.55; y < dy * 0.75; y += 10) for (let x = 5; x < w; x += 10) { c.fillStyle = "rgba(0,0,0,.45)"; c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); }
      for (let i = 0; i < 10; i++) { const x = R() * w, y = R() * dy, g = c.createRadialGradient(x, y, 0, x, y, 30 + R() * 40); g.addColorStop(0, "rgba(10,6,2,.45)"); g.addColorStop(1, "rgba(10,6,2,0)"); c.fillStyle = g; c.fillRect(0, 0, w, dy); }
      finish(c, w, h, dy, ["#2a1c12", "#140c06"]);
    },
    // the Gallery: deep teal damask, gilt rails
    gallery: (c, w, h) => {
      const dy = h * (1 - DADO / WALL_H);
      c.fillStyle = "#14302e"; c.fillRect(0, 0, w, dy);
      for (let y = 20; y < dy; y += 64) for (let x = 0; x < w; x += 64) {
        const ox = ((y / 64) % 2) * 32;
        c.fillStyle = "rgba(60,110,100,.4)"; c.beginPath(); c.moveTo(x + ox + 32, y); c.quadraticCurveTo(x + ox + 56, y + 24, x + ox + 32, y + 48); c.quadraticCurveTo(x + ox + 8, y + 24, x + ox + 32, y); c.fill();
        c.fillStyle = "rgba(160,130,60,.25)"; c.beginPath(); c.arc(x + ox + 32, y + 24, 4, 0, 7); c.fill();
      }
      c.fillStyle = "rgba(170,140,70,.6)"; c.fillRect(0, dy * 0.2, w, 3);
      finish(c, w, h, dy, ["#2a1e14", "#120a06"]);
    },
    // the Stairwell: stained plaster over bare brick where it's fallen away
    stairwell: (c, w, h) => {
      const dy = h * (1 - DADO / WALL_H);
      c.fillStyle = "#5a5446"; c.fillRect(0, 0, w, dy);
      for (let i = 0; i < 7; i++) {
        const x = R() * w, y = R() * dy, rw = 30 + R() * 60, rh = 20 + R() * 50;
        c.fillStyle = "#4a2a22"; c.fillRect(x, y, rw, rh);
        for (let by = y; by < y + rh; by += 8) for (let bx = x + ((by / 8) % 2) * 8; bx < x + rw; bx += 16) { c.fillStyle = "rgba(120,60,40,.6)"; c.fillRect(bx + 1, by + 1, 14, 6); }
      }
      for (let i = 0; i < 16; i++) { const x = R() * w, g = c.createLinearGradient(0, 0, 0, dy); g.addColorStop(0, "rgba(40,30,15,.4)"); g.addColorStop(1, "rgba(40,30,15,0)"); c.fillStyle = g; c.fillRect(x, 0, 4 + R() * 14, dy); }
      finish(c, w, h, dy, ["#2a2420", "#100c08"]);
    },
    // the Bell Tower: old stone
    tower: (c, w, h) => {
      c.fillStyle = "#3a3a38"; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 28) for (let x = ((y / 28) % 2) * 32; x < w; x += 64) {
        const l = 52 + R() * 20; c.fillStyle = `rgb(${l},${l},${l - 4})`; c.fillRect(x + 2, y + 2, 60, 24);
        c.fillStyle = "rgba(0,0,0,.15)"; c.fillRect(x + 2, y + 22, 60, 4);
      }
      for (let i = 0; i < 20; i++) { const x = R() * w, y = R() * h, g = c.createRadialGradient(x, y, 0, x, y, 40); g.addColorStop(0, "rgba(30,40,20,.35)"); g.addColorStop(1, "rgba(30,40,20,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); }
      for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.1})`; c.fillRect(R() * w, R() * h, 1, 1); }
    },
  }[name];
  return tex ? M({ roughness: 1, map: ctex(256, 896, tex) }) : null;
}

// a gear: a disc with teeth, in a group, facing the camera
function gear(kit, r, teeth, mat, thick = 0.15) {
  const { THREE, put, keep } = kit, g = new THREE.Group();
  put(keep(new THREE.CylinderGeometry(r, r, thick, Math.max(16, teeth * 2))), mat, 0, 0, 0, g).rotation.x = PI / 2;
  const tg = keep(new THREE.BoxGeometry(r * 0.18, r * 0.2, thick));
  for (let i = 0; i < teeth; i++) { const a = i / teeth * PI * 2, t = put(tg, mat, Math.cos(a) * (r + r * 0.08), Math.sin(a) * (r + r * 0.08), 0, g); t.rotation.z = a; }
  for (let i = 0; i < 4; i++) put(keep(new THREE.BoxGeometry(r * 1.6, r * 0.12, thick * 0.6)), mat, 0, 0, thick * 0.3, g).rotation.z = i * PI / 4;
  put(keep(new THREE.CylinderGeometry(r * 0.15, r * 0.15, thick * 1.6, 12)), mat, 0, 0, 0, g).rotation.x = PI / 2;
  return g;
}
function flame(kit, x, y, z, size = 1) {
  const { THREE, scene, keep, glowT, Z } = kit;
  const fl = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowT, color: 0xffb050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
  fl.position.set(x, y, Z(z)); fl.scale.set(0.12 * size, 0.24 * size, 1); scene.add(fl);
  const ha = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowT, color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3 })));
  ha.position.copy(fl.position); ha.scale.set(1.2 * size, 1.2 * size, 1); scene.add(ha);
  return { fl, ha, size };
}
function fillLight(kit, x, color, intensity, w) {
  const { THREE, scene, Z } = kit;
  const L = new THREE.DirectionalLight(color, intensity);
  L.position.set(x - 4, 16, Z(-8)); L.target.position.set(x, 0, Z(3)); scene.add(L, L.target);
  Object.assign(L.shadow.camera, { left: -w, right: w, top: 16, bottom: -16, near: 1, far: 60 });
  L.shadow.bias = -0.0008; L.shadow.normalBias = 0.02;
  return L;
}
const shadowQ = (L, Q, big) => { L.castShadow = Q > 0; if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } L.shadow.mapSize.set(Q > 1 ? 2048 : 1024, Q > 1 ? (big ? 2048 : 1024) : 512); };

// draw the common looks of these rooms; returns the meshes it made for kin boxes
function boxes(kit, extra) {
  const { THREE, room, put, boxGeo, M, mWood, mDark, mPale, keep, ctex, R, track } = kit;
  const crateT = ctex(128, 128, (c, w, h) => {
    c.fillStyle = "#6a4a2c"; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(0, y, w, 3); }
    c.strokeStyle = "#3a2614"; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10); c.beginPath(); c.moveTo(5, 5); c.lineTo(w - 5, h - 5); c.stroke();
    for (let i = 0; i < 800; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.15})`; c.fillRect(R() * w, R() * h, 1, 1); }
  }, false);
  const mCrate = M({ map: crateT });
  for (const s of room.solids) {
    const w = s.x1 - s.x0, h = s.y1 - s.y0, d = s.z1 - s.z0, cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, cz = (s.z0 + s.z1) / 2;
    if (extra && extra(s, { w, h, d, cx, cy, cz })) continue;
    switch (s.look) {
      case "crate": put(boxGeo(w, h, d, 1), mCrate, cx, cy, cz); break;
      case "beam": put(boxGeo(w, h, d, 2), mDark, cx, cy, cz); break;
      case "platform": put(boxGeo(w, h, d, 2), mWood, cx, cy, cz); break;
      case "stool": case "fallen": {
        const top = put(boxGeo(w + 0.2, 0.2, d + 0.2, 1), mWood, cx, s.y1 - 0.1, cz);
        void top;
        for (const [x, z] of [[s.x0 + 0.1, s.z0 + 0.1], [s.x1 - 0.1, s.z0 + 0.1], [s.x0 + 0.1, s.z1 - 0.1], [s.x1 - 0.1, s.z1 - 0.1]]) put(boxGeo(0.12, h - 0.2, 0.12, 1), mDark, x, s.y0 + (h - 0.2) / 2, z);
        put(boxGeo(w, 0.06, 0.08, 1), mDark, cx, s.y0 + h * 0.35, s.z0 + 0.1);
        break;
      }
      default: break;
    }
  }
  void THREE; void mPale; void keep; void track;
}

// ═══════════════════════ the Workshop ═══════════════════════
export function dressWorkshop(kit) {
  const { THREE, scene, room, put, boxGeo, M, keep, ctex, R, FR, Z, mDark, mWood, mBlack, track } = kit;
  void mBlack;
  const brass = M({ color: 0xb08c4a, metalness: 0.8, roughness: 0.32 }), iron = M({ color: 0x3a3a3e, metalness: 0.7, roughness: 0.5 });
  let liftMesh = null;
  boxes(kit, (s, b) => {
    if (s.look === "bench") {
      put(boxGeo(b.w, b.h, b.d, 2), mWood, b.cx, b.cy, b.cz);
      put(boxGeo(b.w, 0.5, 0.1, 2), mDark, b.cx, s.y0 - 0.25, s.z0 + 0.05);     // the apron along the front
      return true;
    }
    if (s.look === "lift") {
      const g = new THREE.Group(); scene.add(g);
      put(boxGeo(b.w, b.h, b.d, 1), iron, 0, 0, 0, g);
      for (const x of [-b.w / 2 + 0.05, b.w / 2 - 0.05]) for (const z of [-b.d / 2 + 0.05, b.d / 2 - 0.05]) put(boxGeo(0.05, 1.0, 0.05, 1), iron, x, 0.5, z, g);   // corner posts
      put(boxGeo(b.w, 0.05, 0.05, 1), brass, 0, 1.0, -b.d / 2 + 0.05, g);
      put(boxGeo(b.w, 0.05, 0.05, 1), brass, 0, 1.0, b.d / 2 - 0.05, g);
      liftMesh = g; track(s, g);
      return true;
    }
    return false;
  });
  // the lift's shaft: two rails, a pulley up top, the chains
  for (const x of [25.05, 27.55]) put(boxGeo(0.12, 9.0, 0.12, 1), iron, x, 4.5, 3.6);
  const pulley = gear(kit, 0.6, 12, iron, 0.12); pulley.position.set(26.3, 9.2, Z(3.6)); scene.add(pulley);
  const chains = [-0.7, 0.7].map((dx) => { const m = put(boxGeo(0.04, 1, 0.04, 1), iron, 26.3 + dx, 5, 3.6); return m; });
  // the hatch: a brass rim round it
  { const H = { x0: 25.6, x1: 27.0, y0: 7.2, y1: 7.95 }, z = room.d - 0.04;
    put(boxGeo(H.x1 - H.x0 + 0.24, 0.1, 0.1, 1), brass, (H.x0 + H.x1) / 2, H.y1 + 0.05, z);
    put(boxGeo(H.x1 - H.x0 + 0.24, 0.1, 0.1, 1), brass, (H.x0 + H.x1) / 2, H.y0 - 0.05, z);
    put(boxGeo(0.1, H.y1 - H.y0, 0.1, 1), brass, H.x0 - 0.05, (H.y0 + H.y1) / 2, z);
    put(boxGeo(0.1, H.y1 - H.y0, 0.1, 1), brass, H.x1 + 0.05, (H.y0 + H.y1) / 2, z); }
  // where you came in: a little door with a gap under it
  put(boxGeo(2.4, 4.6, 0.1, 1), M({ map: kit.darkWoodT }), 1.6, 0.72 + 2.3, room.d - 0.06);
  // the crank on the bench: a wheel with a handle, turning as it's wound
  const crank = new THREE.Group(); crank.position.set(WS_CRANK.x, WS_CRANK.y + 0.55, Z(WS_CRANK.z + 0.25)); scene.add(crank);
  put(boxGeo(0.25, 0.55, 0.25, 1), iron, 0, -0.28, 0, crank);
  const wheel = new THREE.Group(); crank.add(wheel);
  put(keep(new THREE.TorusGeometry(0.42, 0.05, 8, 24)), brass, 0, 0, 0, wheel);
  for (let i = 0; i < 4; i++) put(boxGeo(0.84, 0.05, 0.05, 1), brass, 0, 0, 0, wheel).rotation.z = i * PI / 4;
  put(keep(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8)), mDark, 0.38, 0.25, 0.16, wheel).rotation.x = PI / 2;
  // on the bench: a giant pocket watch lying open, gears, a lamp
  const watch = new THREE.Group(); watch.position.set(13.5, 3.5, Z(3.8)); scene.add(watch);
  put(keep(new THREE.CylinderGeometry(1.3, 1.3, 0.25, 32)), brass, 0, 0.12, 0, watch);
  put(keep(new THREE.CircleGeometry(1.15, 32)), M({ map: ctex(128, 128, (c) => { c.fillStyle = "#d8ccb0"; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.fillStyle = "#2a1e14"; for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; c.fillRect(64 + Math.cos(a) * 52 - 2, 64 + Math.sin(a) * 52 - 2, 4, 6); } }, false) }), 0, 0.26, 0, watch).rotation.x = -PI / 2;
  const wHand = put(boxGeo(0.06, 0.02, 0.9, 1), mDark, 0, 0.28, -0.4, watch);
  void wHand;
  const benchGears = [];
  [[17.2, 3.5, 2.0, 0.55, 14], [18.4, 3.5, 2.6, 0.35, 10], [10.6, 3.5, 4.5, 0.45, 12]].forEach(([x, y, z, r, n]) => {
    const g = gear(kit, r, n, R() < 0.5 ? brass : iron, 0.1); g.position.set(x, y + 0.05, Z(z)); g.rotation.x = -PI / 2; scene.add(g); benchGears.push(g);
  });
  // a lamp on the bench, green-shaded, and its light
  put(keep(new THREE.CylinderGeometry(0.3, 0.35, 0.12, 16)), brass, 19.8, 3.56, 1.8);
  put(boxGeo(0.06, 1.6, 0.06, 1), brass, 19.8, 4.35, 1.8);
  put(keep(new THREE.ConeGeometry(0.6, 0.45, 16, 1, true)), M({ color: 0x1e4a2a, side: THREE.DoubleSide, roughness: 0.6 }), 19.8, 5.1, 1.8);
  const lamp = new THREE.PointLight(0xffc878, 1.9, 11, 2); lamp.position.set(19.8, 4.85, Z(1.8)); scene.add(lamp);
  const bulb = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: kit.glowT, color: 0xffe0a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
  bulb.position.set(19.8, 4.95, Z(1.8)); bulb.scale.set(0.5, 0.5, 1); scene.add(bulb);
  // the wall behind: great gears turning slowly, and clocks, each its own time
  const wallGears = [];
  [[5, 8.5, 2.2, 22, 0.08], [9.8, 10.6, 1.4, 16, -0.13], [30.5, 6.8, 2.6, 24, 0.06], [32.5, 10.2, 1.2, 12, -0.15]].forEach(([x, y, r, n, sp]) => {
    const g = gear(kit, r, n, R() < 0.5 ? brass : iron, 0.2); g.position.set(x, y, Z(room.d - 0.25)); scene.add(g); wallGears.push({ g, sp });
  });
  const clocks = [];
  [[4.0, 5.2], [16, 7.4], [20.5, 8.8], [23.0, 6.2]].forEach(([x, y], i) => {
    const c = new THREE.Group(); c.position.set(x, y, Z(room.d - 0.15)); scene.add(c);
    put(boxGeo(1.1, 1.6 + i * 0.2, 0.25, 1), mDark, 0, -0.3, 0, c);
    put(keep(new THREE.CircleGeometry(0.42, 20)), M({ color: 0xd8ccb0, roughness: 0.6 }), 0, 0.1, 0.14, c, false);
    const p = new THREE.Group(); p.position.set(0, -0.35, 0.15); c.add(p);
    put(boxGeo(0.03, 0.6 + i * 0.1, 0.02, 1), brass, 0, -0.3, 0, p);
    put(keep(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12)), brass, 0, -0.65 - i * 0.1, 0, p).rotation.x = PI / 2;
    clocks.push({ p, ph: i * 1.7, sp: 2.4 + i * 0.35 });
  });
  // a pegboard of tools
  [[6.5, 6.0, 0.2], [7.3, 5.8, -0.1], [8.1, 6.1, 0.3]].forEach(([x, y, r]) => { put(boxGeo(0.1, 1.2, 0.06, 1), iron, x, y, room.d - 0.1).rotation.z = r; });
  const fill = fillLight(kit, 17, 0x6878a0, 0.32, 22);
  const lampFl = { k: 1 };
  return {
    applyQ(Q) { shadowQ(fill, Q); lamp.castShadow = Q > 1; lamp.shadow.mapSize.set(512, 512); },
    ambient(T, t, dt, wound, S) {
      for (const w of wallGears) w.g.rotation.z += dt * w.sp;
      for (const g of benchGears) g.rotation.z += dt * 0.2;
      pulley.rotation.z = (liftMesh ? liftMesh.position.y : 0) * 1.2;
      for (const c of clocks) c.p.rotation.z = Math.sin(t * c.sp + c.ph) * 0.2;
      lampFl.k = 0.95 + Math.sin(t * 13) * 0.02 + (FR() - 0.5) * 0.02;
      lamp.intensity = 1.9 * lampFl.k;
      // the crank turns while it's wound, and spins back when the lift goes
      if (S && S.rs) wheel.rotation.z = -(S.rs.wind || 0) * PI * 3 - (S.rs.lift === "up" ? t * 6 : 0);
      if (liftMesh) for (const [i, c] of chains.entries()) { const top = 9.2, bot = liftMesh.position.y + 0.1; c.scale.y = Math.max(0.01, top - bot); c.position.y = (top + bot) / 2; void i; }
    },
    event(e) { if (e.n === "liftStop") kit.puff(26.3, e.y || 0, 3.6, 3, 0.4); },
  };
}

// ═══════════════════════ the Gallery, and the Cuckoo ═══════════════════════
export function dressGallery(kit) {
  const { THREE, scene, room, put, boxGeo, M, keep, ctex, R, FR, Z, mDark, mWood, glowT } = kit;
  void mDark; void mWood;
  const gilt = M({ color: 0xb8933e, metalness: 0.75, roughness: 0.35 });
  const velvet = M({ color: 0x5a1820, roughness: 0.95 });
  // the cuckoo clock's moving parts (made by cuckooClock(), called from the loop below)
  let doorL = null, doorR = null, pend = null, cHead = null, beak = null, eye = null, eyeGlow = null;
  const neckSegs = [];
  boxes(kit, (s, b) => {
    switch (s.look) {
      case "pedestal": {
        put(boxGeo(b.w, b.h * 0.85, b.d, 1), M({ color: 0x8a8678, roughness: 0.6 }), b.cx, b.h * 0.425, b.cz);
        put(boxGeo(b.w + 0.2, 0.15, b.d + 0.2, 1), M({ color: 0x9a968a, roughness: 0.5 }), b.cx, b.h * 0.86, b.cz);
        // a figure on it, its face worn away
        const st = M({ color: 0xb8b4a8, roughness: 0.55 });
        put(keep(new THREE.CylinderGeometry(0.28, 0.45, 1.6, 12)), st, b.cx, s.y1 + 0.8, b.cz);
        put(keep(new THREE.SphereGeometry(0.28, 12, 10)), st, b.cx, s.y1 + 1.9, b.cz);
        put(keep(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8)), st, b.cx + 0.35, s.y1 + 1.2, b.cz).rotation.z = -0.5;
        return true;
      }
      case "piano": {
        put(boxGeo(b.w, b.h, b.d, 1.5), M({ color: 0x0e0c0c, roughness: 0.25, metalness: 0.2 }), b.cx, b.cy, b.cz);
        put(boxGeo(b.w - 0.4, 0.12, 0.5, 1), M({ color: 0xe8e0cc, roughness: 0.4 }), b.cx, s.y0 + 0.65, s.z0 - 0.2);   // the keys
        for (let i = 0; i < 18; i++) put(boxGeo(0.07, 0.05, 0.3, 1), M({ color: 0x101010 }), s.x0 + 0.4 + i * 0.18, s.y0 + 0.73, s.z0 - 0.12, scene, false);
        const lid = put(boxGeo(b.w, 0.06, b.d * 0.9, 1.5), M({ color: 0x0e0c0c, roughness: 0.25 }), b.cx, s.y1 + 0.6, b.cz + 0.3); lid.rotation.x = 0.5;
        return true;
      }
      case "chair": put(boxGeo(b.w, b.h, b.d, 1), velvet, b.cx, b.cy, b.cz); for (const z of [s.z0 + 0.1, s.z1 - 0.1]) put(boxGeo(b.w, 0.4, 0.2, 1), velvet, b.cx, s.y1 + 0.2, z); return true;
      case "chairback": put(boxGeo(b.w, b.h, b.d, 1), velvet, b.cx, b.cy, b.cz); put(boxGeo(b.w + 0.05, 0.12, b.d + 0.05, 1), gilt, b.cx, s.y1, b.cz); return true;
      case "plant": {
        put(keep(new THREE.CylinderGeometry(0.55, 0.42, 1.0, 14)), M({ color: 0x6a3a28, roughness: 0.8 }), b.cx, 0.5, b.cz);
        const leaf = M({ color: 0x1e3a22, roughness: 0.8, side: THREE.DoubleSide });
        for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2, l = put(keep(new THREE.PlaneGeometry(0.5, 2.0)), leaf, b.cx + Math.cos(a) * 0.2, 1.0 + 1.0, b.cz + Math.sin(a) * 0.2); l.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5); }
        return true;
      }
      case "screen": {
        const pt = ctex(128, 256, (c, w, h) => { c.fillStyle = "#2a1a14"; c.fillRect(0, 0, w, h); c.strokeStyle = "rgba(180,140,70,.6)"; c.lineWidth = 3; c.strokeRect(6, 6, w - 12, h - 12);
          for (let i = 0; i < 6; i++) { c.strokeStyle = "rgba(200,180,140,.35)"; c.beginPath(); c.moveTo(R() * w, h); c.quadraticCurveTo(R() * w, R() * h, R() * w, R() * h * 0.4); c.stroke(); }
          c.fillStyle = "rgba(180,60,50,.5)"; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(R() * w, R() * h * 0.5, 6, 0, 7); c.fill(); } }, false);
        const pm = M({ map: pt, side: THREE.DoubleSide });
        [[0, 1.0], [0.85, 2.0], [0, 3.0]].forEach(([dx, z], i) => { const p = put(boxGeo(0.06, b.h, 0.9, 1), pm, s.x0 + dx * 0.15 + 0.08, b.cy, s.z0 + 0.45 + i * 0.85); p.rotation.y = (i % 2 ? -0.3 : 0.3); });
        return true;
      }
      case "cclock": cuckooClock(s, b); return true;
      default: return false;
    }
  });
  // paintings on the walls, and the exit door standing ajar
  [[4.5, 6.5, 1.6, 2.1], [11.5, 7.2, 2.4, 1.7], [28, 7.0, 2.0, 2.6], [33.5, 6.4, 1.4, 1.8]].forEach(([x, y, w, h], i) => {
    put(boxGeo(w + 0.25, h + 0.25, 0.1, 1), gilt, x, y, room.d - 0.06);
    put(keep(new THREE.PlaneGeometry(w, h)), M({ map: ctex(128, 128, (c, ww, hh) => {
      const g = c.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, ["#2a3a3a", "#3a2a1a", "#1a2030", "#302018"][i]); g.addColorStop(1, "#0c0a08"); c.fillStyle = g; c.fillRect(0, 0, ww, hh);
      c.fillStyle = "rgba(220,200,160,.25)"; c.beginPath(); c.ellipse(ww * (0.3 + R() * 0.4), hh * 0.45, 14, 20, 0, 0, 7); c.fill();
      c.fillStyle = "#0a0806"; c.fillRect(ww * 0.4, hh * 0.55, ww * 0.2, hh * 0.45);
    }, false), roughness: 0.7 }), x, y, room.d - 0.12, scene, false);
  });
  { const Dd = room.door, z = room.d - 0.06;
    for (const x of [Dd.x0 - 0.15, Dd.x1 + 0.15]) put(boxGeo(0.3, Dd.y1 + 0.3, 0.2, 1), M({ map: kit.darkWoodT }), x, (Dd.y1 + 0.3) / 2, z);
    put(boxGeo(Dd.x1 - Dd.x0 + 0.6, 0.3, 0.2, 1), M({ map: kit.darkWoodT }), (Dd.x0 + Dd.x1) / 2, Dd.y1 + 0.15, z);
    const dr = new THREE.Group(); dr.position.set(Dd.x0, 0, Z(room.d + 0.05)); dr.rotation.y = 1.2; scene.add(dr);
    put(boxGeo(Dd.x1 - Dd.x0, Dd.y1, 0.1, 1), M({ map: kit.darkWoodT }), (Dd.x1 - Dd.x0) / 2, Dd.y1 / 2, 0, dr);
    const glow = new THREE.PointLight(0xb09060, 0.5, 5, 2); glow.position.set((Dd.x0 + Dd.x1) / 2, 1.5, Z(room.d + 1.5)); scene.add(glow); }
  put(boxGeo(2.4, 4.6, 0.1, 1), M({ map: kit.darkWoodT }), 1.6, 0.72 + 2.3, room.d - 0.06);
  // a chandelier, unlit, turning a little on its chain
  const chand = new THREE.Group(); chand.position.set(14, 11, Z(2.8)); scene.add(chand);
  put(boxGeo(0.04, 3, 0.04, 1), gilt, 0, 1.5, 0, chand, false);
  put(keep(new THREE.TorusGeometry(1.0, 0.05, 6, 24)), gilt, 0, 0, 0, chand).rotation.x = PI / 2;
  for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; put(keep(new THREE.OctahedronGeometry(0.09)), M({ color: 0xd0e0e8, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.8 }), Math.cos(a), -0.25, Math.sin(a), chand, false); }

  // ── the cuckoo clock and the Cuckoo ──
  function cuckooClock(s, b) {
    const carved = M({ map: kit.darkWoodT, roughness: 0.7 });
    put(boxGeo(b.w, b.h - 1.2, b.d, 1.5), carved, b.cx, (b.h - 1.2) / 2, b.cz);
    // a peaked roof, leaves carved along it
    const roof = put(keep(new THREE.CylinderGeometry(0.01, (b.w + 1.2) / 2, 2.4, 4, 1)), carved, b.cx, b.h - 0.2, b.cz);
    roof.rotation.y = PI / 4; roof.scale.set(1, 1, 0.45);
    for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.22, l = put(keep(new THREE.ConeGeometry(0.22, 0.7, 5)), M({ color: 0x2e2216 }), b.cx + Math.sin(a) * 2.7, b.h - 1.0 + Math.cos(a) * 0.9, s.z0 - 0.05); l.rotation.z = -a; }
    // the face
    put(keep(new THREE.CircleGeometry(1.25, 32)), M({ map: ctex(128, 128, (c) => { c.fillStyle = "#cfc2a0"; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.fillStyle = "#2a1e14"; c.font = "bold 14px Georgia"; c.textAlign = "center"; c.textBaseline = "middle"; ["XII", "III", "VI", "IX"].forEach((n, i) => { const a = i / 4 * PI * 2 - PI / 2; c.fillText(n, 64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); }); }, false), roughness: 0.6 }), b.cx, 5.2, s.z0 - 0.02, scene, false);
    put(keep(new THREE.TorusGeometry(1.3, 0.08, 8, 32)), gilt, b.cx, 5.2, s.z0 - 0.04);
    // its little doors, up high: they swing open on the hour
    const dy = 7.8;
    put(boxGeo(1.9, 1.5, 0.1, 1), M({ color: 0x050302 }), b.cx, dy, s.z0 + 0.02, scene, false);
    doorL = new THREE.Group(); doorL.position.set(b.cx - 0.8, dy, Z(s.z0 - 0.05)); scene.add(doorL);
    doorR = new THREE.Group(); doorR.position.set(b.cx + 0.8, dy, Z(s.z0 - 0.05)); scene.add(doorR);
    put(boxGeo(0.8, 1.4, 0.08, 1), carved, 0.4, 0, 0, doorL); put(boxGeo(0.8, 1.4, 0.08, 1), carved, -0.4, 0, 0, doorR);
    // the pendulum and the pine-cone weights on their chains, below
    pend = new THREE.Group(); pend.position.set(b.cx, 3.6, Z(s.z0 - 0.1)); scene.add(pend);
    put(boxGeo(0.06, 2.6, 0.04, 1), gilt, 0, -1.3, 0, pend); put(keep(new THREE.SphereGeometry(0.3, 14, 10)), gilt, 0, -2.7, 0, pend).scale.set(1, 1, 0.3);
    for (const dx of [-1.3, 1.3]) { put(boxGeo(0.03, 3.0, 0.03, 1), gilt, b.cx + dx, 2.4, s.z0 - 0.15); put(keep(new THREE.ConeGeometry(0.25, 0.9, 10)), M({ color: 0x3a2a18, roughness: 0.6, metalness: 0.4 }), b.cx + dx, 0.75, s.z0 - 0.15).rotation.x = PI; }
    // the bird: painted wood gone to cracks, one great glass eye, a beak that opens
    const paint = M({ map: ctex(64, 64, (c, w, h) => { c.fillStyle = "#5a6a7a"; c.fillRect(0, 0, w, h); c.fillStyle = "#8a3a2a"; c.fillRect(0, h * 0.55, w, h * 0.45);
      c.strokeStyle = "rgba(20,15,10,.7)"; for (let i = 0; i < 14; i++) { c.beginPath(); let x = R() * w, y = R() * h; c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 14; y += (R() - 0.5) * 14; c.lineTo(x, y); } c.stroke(); }
      for (let i = 0; i < 8; i++) { c.fillStyle = "#c8b898"; c.fillRect(R() * w, R() * h, 3 + R() * 5, 2 + R() * 3); } }), roughness: 0.7 });
    cHead = new THREE.Group(); scene.add(cHead);
    put(keep(new THREE.SphereGeometry(0.55, 16, 12)), paint, 0, 0, 0, cHead).scale.set(0.9, 0.95, 1.2);
    for (let i = 0; i < 5; i++) put(keep(new THREE.ConeGeometry(0.06, 0.55, 5)), paint, (i - 2) * 0.1, 0.55, -0.2 - Math.abs(i - 2) * 0.05, cHead).rotation.x = -0.5;
    const beakM = M({ color: 0xa88838, roughness: 0.5 });
    const upper = put(keep(new THREE.ConeGeometry(0.2, 0.75, 8)), beakM, 0, 0.05, 0.85, cHead); upper.rotation.x = PI / 2; upper.scale.set(1, 1, 0.5);
    beak = new THREE.Group(); beak.position.set(0, -0.05, 0.45); cHead.add(beak);
    const lower = put(keep(new THREE.ConeGeometry(0.16, 0.6, 8)), beakM, 0, -0.03, 0.3, beak); lower.rotation.x = PI / 2; lower.scale.set(1, 1, 0.4);
    eye = put(keep(new THREE.SphereGeometry(0.2, 14, 10)), keep(new THREE.MeshBasicMaterial({ color: 0xfff0b0 })), 0, 0.12, 0.42, cHead, false);
    put(keep(new THREE.SphereGeometry(0.08, 10, 8)), keep(new THREE.MeshBasicMaterial({ color: 0x100804 })), 0, 0.12, 0.6, cHead, false);
    eyeGlow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowT, color: 0xffe8a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })));
    eyeGlow.scale.set(1.6, 1.6, 1); cHead.add(eyeGlow); eyeGlow.position.set(0, 0.12, 0.5);
    // the neck: bellows, brass rings between
    const bel = M({ color: 0x2a1c14, roughness: 0.9 });
    for (let i = 0; i < 16; i++) { const sgm = put(keep(new THREE.CylinderGeometry(0.2, 0.2, 0.24, 10)), i % 2 ? gilt : bel, 0, 0, 0, scene); sgm.visible = false; neckSegs.push(sgm); }
  }
  // the beam: a spotlight from its eye (real shadows behind the furniture from Medium up), and a pale cone you can see
  const spot = new THREE.SpotLight(0xffe2a8, 0, 22, 0.2, 0.4, 1.2);
  spot.shadow.bias = -0.002; spot.shadow.camera.near = 0.5; scene.add(spot, spot.target);
  const coneM = keep(new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(1, 1, 24, 1, true)), coneM); scene.add(cone);
  const fill = fillLight(kit, 20, 0x5a6a90, 0.28, 24);
  const sconces = [7, 31].map((x) => { const f = flame(kit, x, 5.3, room.d - 0.5, 1); const L = new THREE.PointLight(0xffa858, 0.9, 7, 2); L.position.set(x, 5.6, Z(room.d - 0.8)); scene.add(L); return { ...f, L, ph: R() * 9 }; });
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  let lunge = 0;
  const head = { x: 21, y: 7.7, z: 5.6 };
  function place(qq, S) {
    const h = cuckooHead(qq);
    head.x = h.x; head.y = h.y; head.z = h.z;
    // caught: the head darts down to the kid, then draws back up toward its doors
    if (S && S.caught && S.caught.by === "cuckoo") {
      const u = S.caught.t;
      lunge = cl(u / 0.35, 0, 1);
      const back = ease(cl((u - 0.5) / 1.5, 0, 1));
      head.x += (S.P.x - head.x) * lunge * (1 - back) + (CUCKOO.x - head.x) * back * 0.6;
      head.y += (S.P.y + 1.0 - head.y) * lunge * (1 - back) + 1.2 * back;
      head.z += (S.P.z - 0.4 - head.z) * lunge * (1 - back) + (3.6 - head.z) * back * 0.5;
    }
    return h;
  }
  return {
    applyQ(Q) { shadowQ(fill, Q, true); spot.castShadow = Q > 0; spot.shadow.mapSize.set(Q > 1 ? 1024 : 512, Q > 1 ? 1024 : 512); if (spot.shadow.map) { spot.shadow.map.dispose(); spot.shadow.map = null; } },
    ambient(T, t, dt, wound, S) {
      const roomT = S ? S.roomT : t;
      const qq = cuckooAt(roomT);
      place(qq, S);
      const out = qq.ph === "out" ? 1 : qq.ph === "warn" ? 0.15 * qq.k : qq.ph === "back" ? 1 - qq.k : 0;
      const caught = S && S.caught && S.caught.by === "cuckoo";
      // doors: rattling in the warning, swung wide while it's out
      const open = qq.ph === "warn" ? (qq.k > 0.6 ? ease((qq.k - 0.6) / 0.4) * 0.6 : Math.sin(t * 40) * 0.04 * qq.k) : qq.ph === "out" || caught ? 1.5 : qq.ph === "back" ? 1.5 * (1 - ease(qq.k)) : 0;
      if (doorL) { doorL.rotation.y = -open; doorR.rotation.y = open; }
      if (pend) pend.rotation.z = Math.sin(t * PI * 0.8) * 0.15;
      // the head, the neck from the doors to it
      if (cHead) {
        cHead.position.set(head.x, head.y, Z(head.z));
        const tx = caught ? S.P.x : qq.bx, tz = caught ? S.P.z : 2.2;
        cHead.lookAt(tx, caught ? S.P.y : 0, Z(tz));
        cHead.rotation.z += Math.sin(t * 7) * 0.03 * out;
        beak.rotation.x = caught ? -0.6 * (1 - ease(cl((S.caught.t - 0.3) / 0.2, 0, 1))) + 0.05 : qq.ph === "out" ? -0.15 - Math.max(0, Math.sin(t * 9)) * 0.25 : 0;
        cHead.visible = head.z < 4.75 || out > 0 || caught;
        // the neck: a curve from inside the doors, sagging, to the back of its head
        const ax = CUCKOO.x, ay = 7.8, az = 5.2;
        neckSegs.forEach((sg, i) => {
          const u = (i + 0.5) / neckSegs.length, sag = Math.sin(u * PI) * 0.6 * Math.min(1, Math.abs(head.z - az) / 2);
          const x = ax + (head.x - ax) * u, y = ay + (head.y - ay) * u + sag, z = az + (head.z - 0.5 - az) * u;
          sg.position.set(x, y, Z(z));
          tmpA.set(head.x - ax, head.y - ay, -(head.z - 0.5 - az)).normalize();
          q.setFromUnitVectors(up, tmpA); sg.quaternion.copy(q);
          sg.visible = z < 4.6;
        });
        // the eye and its beam
        const lit = qq.ph === "out" && qq.neck > 0.3 && !caught;
        eye.material.color.setHex(lit || caught ? 0xfff6c0 : 0xb8a070);
        eyeGlow.material.opacity = (lit ? 0.85 : qq.ph === "warn" ? 0.25 * qq.k : 0) + (caught ? 0.6 : 0);
        spot.intensity = lit ? 9 : 0;
        spot.position.set(head.x, head.y, Z(head.z));
        spot.target.position.set(qq.bx, 0, Z(2.2)); spot.target.updateMatrixWorld();
        // the visible cone, from the eye to the floor
        if (lit) {
          tmpA.set(head.x, head.y, Z(head.z)); tmpB.set(qq.bx, 0, Z(2.2));
          const len = tmpA.distanceTo(tmpB), rad = Math.tan(0.2) * len;
          cone.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
          cone.scale.set(rad, len, rad);
          q.setFromUnitVectors(up, tmpA.clone().sub(tmpB).normalize()); cone.quaternion.copy(q);
          coneM.opacity = 0.1 + Math.sin(t * 30) * 0.01;
        } else coneM.opacity = 0;
      }
      for (const s of sconces) { const f = 0.85 + Math.sin(t * 8 + s.ph) * 0.06 + (FR() - 0.5) * 0.08; s.L.intensity = 0.9 * f; s.fl.scale.set(0.12, 0.24 * f, 1); s.ha.material.opacity = 0.28 * f; }
      chand.rotation.y = Math.sin(t * 0.3) * 0.08;
    },
    event() {},
    // the Cuckoo out of its clock: pull the camera back so its head and its beam are in view
    camLift(S) { const qq = cuckooAt(S.roomT); return (S.caught && S.caught.by === "cuckoo") ? 1 : qq.ph === "out" ? ease(cl(qq.k * 4, 0, 1)) : qq.ph === "back" ? 1 - qq.k : 0; },
    camNear(S) { const qq = cuckooAt(S.roomT); return qq.ph === "out" || (S.caught && S.caught.by === "cuckoo") ? 1 : qq.ph === "warn" ? 0.6 * qq.k : qq.ph === "back" ? 1 - qq.k : 0; },
    // caught by the Cuckoo: the kid hangs from its beak
    holdKid(S) {
      if (!S.caught || S.caught.by !== "cuckoo" || lunge < 1) return null;
      return { x: head.x, y: head.y - 1.15, z: head.z + 0.45 };
    },
  };
}

// ═══════════════════════ the Stairwell ═══════════════════════
export function dressStairwell(kit) {
  const { THREE, scene, room, put, boxGeo, M, keep, ctex, R, FR, Z, mDark, mWood, mBlack } = kit;
  void mWood;
  const iron = M({ color: 0x2e2e32, metalness: 0.7, roughness: 0.55 });
  const stone = M({ map: ctex(128, 128, (c, w, h) => { c.fillStyle = "#4a4640"; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) for (let x = ((y / 16) % 2) * 16; x < w; x += 32) { const l = 60 + R() * 20; c.fillStyle = `rgb(${l},${l - 4},${l - 10})`; c.fillRect(x + 1, y + 1, 30, 14); } for (let i = 0; i < 600; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.2})`; c.fillRect(R() * w, R() * h, 2, 2); } }), roughness: 1 });
  let gateMesh = null;
  boxes(kit, (s, b) => {
    switch (s.look) {
      case "pit": put(boxGeo(b.w, b.h, b.d, 1), mBlack, b.cx, b.cy, b.cz, scene, false, false); return true;
      case "gate": {
        const g = new THREE.Group(); scene.add(g);
        for (let i = 0; i < 18; i++) put(boxGeo(0.07, b.h, 0.07, 1), iron, 0, 0, -b.d / 2 + 0.2 + i * (b.d - 0.4) / 17, g);
        for (const y of [-b.h / 2 + 0.1, 0, b.h / 2 - 0.1]) put(boxGeo(0.1, 0.1, b.d, 1), iron, 0, y, 0, g);
        kit.track(s, g); gateMesh = g;
        return true;
      }
      case "landing": put(boxGeo(b.w, b.h, b.d, 1.5), stone, b.cx, b.cy, b.cz); put(boxGeo(b.w, 0.1, b.d, 2), mWood, b.cx, s.y1 - 0.04, b.cz); return true;
      case "shelves": {
        put(boxGeo(b.w, b.h, b.d, 1), mDark, b.cx, b.cy, b.cz);
        for (let i = 0; i < 10; i++) { const jx = s.x0 + 0.4 + R() * (b.w - 0.8); put(keep(new THREE.CylinderGeometry(0.15, 0.15, 0.4 + R() * 0.3, 10)), M({ color: [0x4a5a3a, 0x5a4a2a, 0x3a4a5a][i % 3], roughness: 0.2, transparent: true, opacity: 0.85 }), jx, s.y1 + 0.25, s.z1 - 0.3 - R() * 0.5); }
        return true;
      }
      default: return false;
    }
  });
  // pipes along the wall, a hanging bulb
  for (const y of [4.6, 5.0]) put(keep(new THREE.CylinderGeometry(0.12, 0.12, room.w, 10)), iron, room.w / 2, y, room.d - 0.3).rotation.z = PI / 2;
  const bulbG = new THREE.Group(); bulbG.position.set(18, 9, Z(3)); scene.add(bulbG);
  put(boxGeo(0.02, 3.5, 0.02, 1), mBlack, 0, -1.75, 0, bulbG, false);
  const bulb = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: kit.glowT, color: 0xffe8b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
  bulb.position.set(0, -3.6, 0); bulb.scale.set(0.5, 0.5, 1); bulbG.add(bulb);
  const bulbL = new THREE.PointLight(0xffe0a8, 1.4, 14, 2); bulbL.position.set(0, -3.7, 0); bulbG.add(bulbL);
  const bulb2 = new THREE.PointLight(0xffc890, 1.0, 12, 2); bulb2.position.set(38, 6.2, Z(3)); scene.add(bulb2);
  // the big door at the start, the cat-flap you crawled through at its foot: it bursts
  const door = new THREE.Group(); door.position.set(0.3, 0, Z(room.d - 0.06)); scene.add(door);
  put(boxGeo(3.0, 8.0, 0.15, 1.5), M({ map: kit.darkWoodT }), 1.5, 4.0 + 0.72, 0, door);
  const planks = [];
  for (let i = 0; i < 8; i++) { const p = put(boxGeo(0.3, 1.2 + R(), 0.08, 1), M({ map: kit.darkWoodT }), 1.5, 3, room.d - 0.2); p.visible = false; planks.push({ m: p, vx: 0, vy: 0, vz: 0, r: 0, t: 9 }); }
  // where you go: a grate gone from a hole high up
  { const O = { x0: 43.6, x1: 45.1, y0: 3.6, y1: 4.35 }, z = room.d - 0.04;
    put(boxGeo(O.x1 - O.x0 + 0.24, 0.1, 0.1, 1), iron, (O.x0 + O.x1) / 2, O.y1 + 0.05, z);
    put(boxGeo(O.x1 - O.x0 + 0.24, 0.1, 0.1, 1), iron, (O.x0 + O.x1) / 2, O.y0 - 0.05, z); }
  const fill = fillLight(kit, 25, 0x5a6480, 0.3, 30);
  let burstT = -1;
  return {
    applyQ(Q) { shadowQ(fill, Q, true); },
    ambient(T, t, dt) {
      // the bulb swings and stutters
      bulbG.rotation.z = Math.sin(t * 0.9) * 0.06 + (burstT >= 0 ? Math.sin(t * 4) * 0.12 * Math.exp(-(t - burstT) * 0.3) : 0);
      const fl = FR() < 0.03 ? 0.2 : 1;
      bulbL.intensity = 1.4 * fl; bulb.material.opacity = fl;
      if (burstT >= 0) {
        const u = t - burstT;
        door.rotation.y = Math.min(2.2, u * 9) - Math.sin(Math.min(u, 3) * 6) * 0.1 * Math.exp(-u);
        for (const p of planks) {
          if (p.t > 4) { p.m.visible = false; continue; }
          p.t += dt; p.vy -= 18 * dt;
          p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.05, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
          if (p.m.position.y <= 0.05) { p.vx *= 0.8; p.vz *= 0.8; p.vy = 0; } else p.m.rotation.z += p.r * dt;
        }
      }
      void T;
    },
    event(e) {
      if (e.n === "burst") {
        burstT = performance.now() / 1000;
        for (const p of planks) { p.t = 0; p.m.visible = true; p.m.position.set(1.5 + FR(), 2 + FR() * 3, Z(room.d - 0.3)); p.vx = 2 + FR() * 5; p.vy = 2 + FR() * 4; p.vz = (FR() * 4 + 2); p.r = (FR() - 0.5) * 12; }
        kit.puff(1.6, 0.3, 4.5, 8, 0.9);
      }
      if (e.n === "smash") { kit.puff(SW_GATE_X + 0.4, 0.2, 3, 8, 0.8); if (gateMesh) gateMesh.visible = false; }
    },
  };
}

// ═══════════════════════ the Bell Tower ═══════════════════════
export function dressTower(kit) {
  const { THREE, scene, room, put, boxGeo, M, keep, ctex, R, FR, Z, mDark, mBlack, glowT } = kit;
  void glowT;
  const iron = M({ color: 0x2e2e32, metalness: 0.7, roughness: 0.5 }), bronze = M({ color: 0x6a5230, metalness: 0.8, roughness: 0.35 });
  let wMesh = null;
  boxes(kit, (s, b) => {
    if (s.look === "weight") {
      const g = new THREE.Group(); scene.add(g);
      put(boxGeo(b.w, b.h, b.d, 1), iron, 0, 0, 0, g);
      put(boxGeo(b.w * 0.6, 0.5, b.d * 0.6, 1), iron, 0, -0.4, 0, g);
      wMesh = g; kit.track(s, g);
      return true;
    }
    if (s.look === "facedoor") return true;
    return false;
  });
  const chain = put(boxGeo(0.06, 1, 0.06, 1), iron, (CW.x0 + CW.x1) / 2, 10, 3);
  const pulley = gear(kit, 0.5, 10, iron, 0.12); pulley.position.set((CW.x0 + CW.x1) / 2, 17.2, Z(3)); scene.add(pulley);
  // the great clock face from behind: lit by the moon, its numerals backwards
  const F = TW_FACE;
  const faceT = ctex(512, 512, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); g.addColorStop(0, "rgba(220,230,250,.95)"); g.addColorStop(0.9, "rgba(170,190,225,.9)"); g.addColorStop(1, "rgba(60,70,90,1)");
    c.fillStyle = g; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, 7); c.fill();
    c.save(); c.translate(w, 0); c.scale(-1, 1);                    // seen from behind: mirrored
    c.fillStyle = "rgba(20,24,34,.85)"; c.font = "bold 44px Georgia"; c.textAlign = "center"; c.textBaseline = "middle";
    ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"].forEach((n, i) => { const a = i / 12 * PI * 2 - PI / 2; c.fillText(n, w / 2 + Math.cos(a) * 195, h / 2 + Math.sin(a) * 195); });
    c.restore();
    c.strokeStyle = "rgba(20,24,34,.8)"; c.lineWidth = 10; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 8, 0, 7); c.stroke();
    for (let i = 0; i < 6; i++) { c.strokeStyle = "rgba(20,24,34,.5)"; c.lineWidth = 6; c.beginPath(); c.moveTo(w / 2, h / 2); const a = i / 6 * PI * 2; c.lineTo(w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2); c.stroke(); }   // the glazing bars
  }, false);
  const face = put(keep(new THREE.CircleGeometry(F.r, 48)), keep(new THREE.MeshBasicMaterial({ map: faceT, fog: false })), F.x, F.y, room.d - 0.03, scene, false, false);
  void face;
  put(keep(new THREE.TorusGeometry(F.r + 0.1, 0.25, 8, 48)), bronze, F.x, F.y, room.d - 0.1);
  // the hands, black against the glass: nearly midnight; at midnight they meet at XII
  const hH = new THREE.Group(), mH = new THREE.Group(); hH.position.set(F.x, F.y, Z(room.d - 0.2)); mH.position.set(F.x, F.y, Z(room.d - 0.25)); scene.add(hH, mH);
  put(boxGeo(0.35, 2.4, 0.08, 1), mBlack, 0, 1.0, 0, hH); put(boxGeo(0.22, 3.6, 0.08, 1), mBlack, 0, 1.6, 0, mH);
  put(keep(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16)), bronze, F.x, F.y, room.d - 0.3).rotation.x = PI / 2;
  // the little door in the face: a dark panel, swinging open at midnight
  const fd = new THREE.Group(); fd.position.set(TW_DOOR.x0, TW_DOOR.y0, Z(room.d - 0.06)); scene.add(fd);
  put(boxGeo(TW_DOOR.x1 - TW_DOOR.x0, TW_DOOR.y1 - TW_DOOR.y0, 0.06, 1), M({ color: 0x1a1c24, metalness: 0.5, roughness: 0.5 }), (TW_DOOR.x1 - TW_DOOR.x0) / 2, (TW_DOOR.y1 - TW_DOOR.y0) / 2, 0, fd);
  const night = put(keep(new THREE.PlaneGeometry(TW_DOOR.x1 - TW_DOOR.x0, TW_DOOR.y1 - TW_DOOR.y0)), keep(new THREE.MeshBasicMaterial({ color: 0x8aa0d0, fog: false })), (TW_DOOR.x0 + TW_DOOR.x1) / 2, (TW_DOOR.y0 + TW_DOOR.y1) / 2, room.d + 0.5, scene, false, false);
  // the lever on the top platform (together, one at each end)
  const arms = (room.levers || [TW_LEVER]).map((L) => {
    const lever = new THREE.Group(); lever.position.set(L.x, L.y, Z(L.z + 0.6)); scene.add(lever);
    put(boxGeo(0.5, 0.3, 0.4, 1), iron, 0, 0.15, 0, lever);
    const a = new THREE.Group(); a.position.set(0, 0.3, 0); lever.add(a);
    put(boxGeo(0.08, 1.4, 0.08, 1), iron, 0, 0.7, 0, a); put(keep(new THREE.SphereGeometry(0.12, 10, 8)), M({ color: 0x8a2a1a, roughness: 0.4 }), 0, 1.42, 0, a);
    return a;
  });
  // gears turning in the dark, a great pendulum, the bells overhead
  const gears = [[3.5, 13, 2.6, 26, 0.05], [15, 15, 1.8, 18, -0.08], [6, 5.5, 1.2, 12, 0.12]].map(([x, y, r, n, sp]) => { const g = gear(kit, r, n, R() < 0.5 ? bronze : iron, 0.25); g.position.set(x, y, Z(room.d - 0.5)); scene.add(g); return { g, sp }; });
  const pend = new THREE.Group(); pend.position.set(15.8, 16.5, Z(1.2)); scene.add(pend);
  put(boxGeo(0.1, 11, 0.1, 1), bronze, 0, -5.5, 0, pend); put(keep(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 24)), bronze, 0, -11.2, 0, pend).rotation.x = PI / 2;
  const bells = [4.5, 9, 13.5].map((x, i) => {
    const g = new THREE.Group(); g.position.set(x, 19.2, Z(3)); scene.add(g);
    put(keep(new THREE.CylinderGeometry(0.5 + i * 0.1, 1.3 + i * 0.2, 1.8, 20, 1, true)), M({ color: 0x5a4a28, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide }), 0, -1.2, 0, g);
    put(boxGeo(2.6, 0.3, 0.3, 1), mDark, 0, 0, 0, g);
    return { g, a: 0, v: 0 };
  });
  put(boxGeo(room.w, 0.5, 0.5, 2), mDark, room.w / 2, 19.3, 3);
  // the moon through the face, from behind, and a lantern by the lever
  const moon = new THREE.DirectionalLight(0xa8bce8, 0.9);
  moon.position.set(F.x - 3, F.y + 10, Z(room.d + 18)); moon.target.position.set(9, 0, Z(1.5)); scene.add(moon, moon.target);
  Object.assign(moon.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  moon.shadow.bias = -0.0008; moon.shadow.normalBias = 0.02;
  const glow = new THREE.PointLight(0x9ab0e0, 1.1, 14, 2); glow.position.set(F.x, F.y, Z(room.d - 2)); scene.add(glow);
  const lantern = flame(kit, 9.8, 12.0, 5.5, 1.2);
  const lanternL = new THREE.PointLight(0xffb060, 1.2, 8, 2); lanternL.position.set(9.8, 12.2, Z(5.0)); scene.add(lanternL);
  const lowL = new THREE.PointLight(0xffa050, 0.9, 9, 2); lowL.position.set(3, 3, Z(2)); scene.add(lowL);
  const lowF = flame(kit, 2.0, 2.6, 5.6, 1);
  let doorOpen = 0;
  return {
    applyQ(Q) { moon.castShadow = Q > 0; if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } moon.shadow.mapSize.set(Q > 1 ? 2048 : 1024, Q > 1 ? 2048 : 1024); },
    ambient(T, t, dt, wound, S) {
      const r = S && S.rs;
      for (const g of gears) g.g.rotation.z += dt * g.sp;
      pend.rotation.z = Math.sin(t * 0.55) * 0.12;
      // the hands: a minute to midnight, and at midnight they close to XII
      const mid = r && r.midnight >= 0 ? ease(cl((S.roomT - r.midnight) / 2.5, 0, 1)) : 0;
      mH.rotation.z = (1 - mid) * (PI * 2 / 60) * 1.0;
      hH.rotation.z = (1 - mid) * (PI * 2 / 720) * 1.0 + 0.0;
      // a lever is down once midnight's struck; before that, only while it's held (together: a few seconds)
      arms.forEach((a, i) => {
        const pulledAt = r ? (r.midnight >= 0 ? r.midnight : (r.pulled || [])[i]) : -99;
        const down = r && (r.midnight >= 0 || S.roomT - pulledAt < 3) ? ease(cl((S.roomT - pulledAt) / 0.4, 0, 1)) : 0;
        a.rotation.x = 0.5 - 1.4 * down;
      });
      // the bells swing out on each stroke, and slow
      for (const b of bells) { b.v += (-b.a * 6 - b.v * 1.2) * dt; b.a += b.v * dt; b.g.rotation.z = b.a; }
      // the counterweight's chain
      if (wMesh) { const top = 17.2, bot = wMesh.position.y + 0.2; chain.scale.y = Math.max(0.01, top - bot); chain.position.y = (top + bot) / 2; pulley.rotation.z = wMesh.position.y * 1.4; }
      // the door in the face swings open; behind it, the night
      doorOpen += ((r && r.open ? 1 : 0) - doorOpen) * Math.min(1, dt * 1.5);
      fd.rotation.y = -doorOpen * 1.9;
      night.material.color.setScalar(0.4 + doorOpen * 0.6);
      const f = 0.85 + Math.sin(t * 8) * 0.06 + (FR() - 0.5) * 0.08;
      lanternL.intensity = 1.2 * f; lantern.fl.scale.set(0.14, 0.29 * f, 1); lowL.intensity = 0.9 * f; lowF.fl.scale.set(0.12, 0.24 * f, 1);
      glow.intensity = 1.1 + (r && r.midnight >= 0 ? Math.max(0, Math.sin((S.roomT - r.midnight) * PI / 1.1)) * 0.6 * (r.strikes < 12 ? 1 : 0) : 0);
    },
    event(e) { if (e.n === "bell") { const b = bells[(e.strike || 1) % bells.length]; b.v += 1.4; for (const o of bells) o.v += 0.3; } if (e.n === "faceOpen") kit.puff((TW_DOOR.x0 + TW_DOOR.x1) / 2, TW_DOOR.y0, room.d - 0.3, 5, 0.5); },
  };
}
