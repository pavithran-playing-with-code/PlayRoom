// src/components/hollow/hollowScene.js
// Drawing HOLLOW HOURS with three.js (r128, loaded lazily by the page): the
// room from hollowCore's boxes, dressed by what each box is (`look`), the
// kid (hollowKid.js), the things you can carry, and the light — moonlight
// through the window panes (real shadows from Medium up; a painted patch on
// Low), a candle on the table, the firefly jar at the kid's hip, fog and
// dust in the moonbeam.
//
// The camera is side-on, a little above, trailing the kid and looking a
// little ahead of where they're going.
//
// The rules measure depth into the screen (z grows away from the camera);
// three.js measures it toward the viewer. Every place here that turns a
// rules position into a picture position goes through Z(), and the camera
// sits on three.js's +z side, so nothing is drawn mirrored.
//
// Reads the run and never changes it. createHollow(host, THREE, opts) puts
// its canvas into `host`; frame(S, dt, t) draws.
import { createKid } from "./hollowKid";
import { createKeeper } from "./hollowKeeperRig";
import { paperFor, dressWorkshop, dressGallery, dressStairwell, dressTower } from "./hollowDress";
import { covered } from "./hollowCore.mjs";
import { gust, cloud, lightning, dropAt } from "./hollowWeather.mjs";

const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const Z = (z) => -z;

export function createHollow(host, THREE, opts) {
  const { room, quality = 1 } = opts;
  let seed = 1234567;
  const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };   // the room's look: the same every time
  const FR = Math.random;                                                                      // flicker and dust: cosmetic

  const cv = document.createElement("canvas"); cv.className = "hh-gl";
  host.prepend(cv);
  const rd = new THREE.WebGLRenderer({ canvas: cv, antialias: quality > 0, powerPreference: "high-performance" });
  rd.outputEncoding = THREE.sRGBEncoding; rd.toneMapping = THREE.ACESFilmicToneMapping; rd.toneMappingExposure = 1.15;
  rd.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const FOG = 0x0b0d16;
  scene.background = new THREE.Color(FOG); scene.fog = new THREE.FogExp2(FOG, 0.026);
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  scene.add(cam);

  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  // ── textures, all drawn here ──
  function ctex(w, h, fn, rep = true) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return keep(t);
  }
  const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  function grain(c, w, h, base, n, dark) {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const y = R() * h, a = 0.04 + R() * 0.1;
      c.strokeStyle = rgba(dark[0], dark[1], dark[2], a); c.lineWidth = 1 + R() * 2;
      c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x * 0.02 + i) * 3 + (R() - 0.5) * 2);
      c.stroke();
    }
    for (let i = 0; i < 6; i++) { const x = R() * w, y = R() * h; c.fillStyle = rgba(dark[0], dark[1], dark[2], 0.25); c.beginPath(); c.ellipse(x, y, 6 + R() * 8, 3 + R() * 3, 0, 0, 7); c.fill(); }
    for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.06})`; c.fillRect(R() * w, R() * h, 1, 1); }
  }
  const woodT = ctex(256, 256, (c, w, h) => grain(c, w, h, "#6b4a32", 60, [30, 18, 10]));
  const darkWoodT = ctex(256, 256, (c, w, h) => grain(c, w, h, "#3d2a1e", 60, [10, 6, 4]));
  const paleWoodT = ctex(256, 256, (c, w, h) => grain(c, w, h, "#8a6a4a", 50, [50, 32, 18]));
  const floorT = ctex(512, 512, (c, w, h) => {
    const n = 6, ph = h / n;
    for (let i = 0; i < n; i++) {
      const l = 70 + R() * 22;
      c.fillStyle = rgba(l, l * 0.7, l * 0.48, 1); c.fillRect(0, i * ph, w, ph);
      for (let k = 0; k < 18; k++) { const y = i * ph + R() * ph; c.strokeStyle = `rgba(20,12,6,${0.05 + R() * 0.12})`; c.lineWidth = 1; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= w; x += 32) c.lineTo(x, y + (R() - 0.5) * 3); c.stroke(); }
      const cut = R() * w; c.fillStyle = "rgba(10,6,3,.8)"; c.fillRect(cut, i * ph, 2, ph);
      c.fillStyle = "rgba(10,6,3,.85)"; c.fillRect(0, i * ph, w, 2);
      c.fillStyle = "rgba(255,230,200,.05)"; c.fillRect(0, i * ph + 2, w, 1);
    }
    for (let i = 0; i < 30; i++) { const x = R() * w, y = R() * h, r = 20 + R() * 60, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, "rgba(10,6,2,.25)"); g.addColorStop(1, "rgba(10,6,2,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); }
    for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.08})`; c.fillRect(R() * w, R() * h, 1, 1); }
  });
  // the wallpaper: tired stripes and a small print, damp coming down, a dark wood dado
  const WALL_H = 14, DADO = 1.7;
  const paperT = ctex(256, 896, (c, w, h) => {
    const dy = h * (1 - DADO / WALL_H);
    for (let x = 0; x < w; x += 32) { c.fillStyle = (x / 32) % 2 ? "#5d6650" : "#6e7660"; c.fillRect(x, 0, 32, dy); }
    for (let y = 10; y < dy; y += 26) for (let x = 0; x < w; x += 32) {
      c.fillStyle = "rgba(40,40,28,.35)"; c.beginPath(); c.ellipse(x + 16 + ((y / 26) % 2) * 0, y, 3, 5, 0, 0, 7); c.fill();
      c.fillStyle = "rgba(200,190,150,.12)"; c.fillRect(x + 15, y - 7, 2, 2);
    }
    for (let i = 0; i < 9; i++) { const x = R() * w, g = c.createLinearGradient(0, 0, 0, dy * (0.4 + R() * 0.5)); g.addColorStop(0, "rgba(30,25,10,.35)"); g.addColorStop(1, "rgba(30,25,10,0)"); c.fillStyle = g; c.fillRect(x, 0, 6 + R() * 18, dy); }
    for (let i = 0; i < 18; i++) { const x = R() * w, y = R() * dy, r = 20 + R() * 70, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, "rgba(40,35,20,.3)"); g.addColorStop(1, "rgba(40,35,20,0)"); c.fillStyle = g; c.fillRect(0, 0, w, dy); }
    // the dado: panels, a rail, a skirting board
    const pg = c.createLinearGradient(0, dy, 0, h); pg.addColorStop(0, "#3e2a1c"); pg.addColorStop(1, "#24170f"); c.fillStyle = pg; c.fillRect(0, dy, w, h - dy);
    c.strokeStyle = "rgba(0,0,0,.5)"; c.lineWidth = 2; for (let x = 8; x < w; x += 64) c.strokeRect(x, dy + 18, 48, h - dy - 44);
    c.fillStyle = "#4a3324"; c.fillRect(0, dy - 4, w, 12); c.fillStyle = "rgba(255,220,180,.1)"; c.fillRect(0, dy - 4, w, 2);
    c.fillStyle = "#1c120b"; c.fillRect(0, h - 16, w, 16);
    for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.07})`; c.fillRect(R() * w, R() * h, 1, 1); }
  });
  const ticking = ctex(128, 128, (c, w, h) => {
    c.fillStyle = "#b9ad93"; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { c.fillStyle = "#6c6a7a"; c.fillRect(x + 5, 0, 3, h); c.fillStyle = "rgba(108,106,122,.4)"; c.fillRect(x + 10, 0, 1, h); }
    for (let i = 0; i < 12; i++) { const x = R() * w, y = R() * h, r = 10 + R() * 30, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, "rgba(90,70,30,.3)"); g.addColorStop(1, "rgba(90,70,30,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); }
  });
  const blanketT = ctex(128, 128, (c, w, h) => {
    c.fillStyle = "#5a2e2a"; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { c.fillStyle = (x + y) / 32 % 2 ? "rgba(255,230,190,.08)" : "rgba(0,0,0,.12)"; c.fillRect(x, y, 32, 32); }
    for (let i = 0; i < 1200; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.1})`; c.fillRect(R() * w, R() * h, 1, 1); }
  });
  const rugT = ctex(256, 256, (c, w, h) => {
    c.fillStyle = "#4a1d1c"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#7a5a33"; c.lineWidth = 8; c.strokeRect(14, 14, w - 28, h - 28);
    c.strokeStyle = "#20302e"; c.lineWidth = 4; c.strokeRect(30, 30, w - 60, h - 60);
    for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? "#7a5a33" : "#2a3a36"; c.beginPath(); c.moveTo(w / 2, 50 + i * 26); c.lineTo(w / 2 + 50 - i * 6, h / 2); c.lineTo(w / 2, h - 50 - i * 26); c.lineTo(w / 2 - 50 + i * 6, h / 2); c.closePath(); c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1; }
    for (let i = 0; i < 5000; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.15})`; c.fillRect(R() * w, R() * h, 1, 1); }
  }, false);
  const glowT = ctex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }, false);
  const blobT = ctex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(0,0,0,.75)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }, false);

  const M = (o) => keep(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o }));
  const mWood = M({ map: woodT }), mDark = M({ map: darkWoodT }), mPale = M({ map: paleWoodT });
  const mFloor = M({ map: floorT, roughness: 0.85 });
  const mPaper = M({ map: paperT, roughness: 1 });
  // the Hall's paper: an old oxblood damask, darker, over the same dado
  const mHallPaper = room.name !== "hall" ? null : M({ roughness: 1, map: ctex(256, 896, (c, w, h) => {
    const dy = h * (1 - DADO / WALL_H);
    c.fillStyle = "#3a1a1c"; c.fillRect(0, 0, w, dy);
    for (let y = 20; y < dy; y += 64) for (let x = 0; x < w; x += 64) {
      const ox = ((y / 64) % 2) * 32;
      c.fillStyle = "rgba(90,40,36,.55)"; c.beginPath(); c.moveTo(x + ox + 32, y); c.quadraticCurveTo(x + ox + 54, y + 22, x + ox + 32, y + 44); c.quadraticCurveTo(x + ox + 10, y + 22, x + ox + 32, y); c.fill();
      c.fillStyle = "rgba(20,8,8,.5)"; c.beginPath(); c.arc(x + ox + 32, y + 22, 5, 0, 7); c.fill();
    }
    for (let i = 0; i < 12; i++) { const x = R() * w, g = c.createLinearGradient(0, 0, 0, dy * (0.3 + R() * 0.6)); g.addColorStop(0, "rgba(10,5,2,.45)"); g.addColorStop(1, "rgba(10,5,2,0)"); c.fillStyle = g; c.fillRect(x, 0, 5 + R() * 20, dy); }
    for (let i = 0; i < 14; i++) { const x = R() * w, y = R() * dy, r = 20 + R() * 70, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, "rgba(15,8,4,.35)"); g.addColorStop(1, "rgba(15,8,4,0)"); c.fillStyle = g; c.fillRect(0, 0, w, dy); }
    const pg = c.createLinearGradient(0, dy, 0, h); pg.addColorStop(0, "#2e1e14"); pg.addColorStop(1, "#160e08"); c.fillStyle = pg; c.fillRect(0, dy, w, h - dy);
    c.strokeStyle = "rgba(0,0,0,.5)"; c.lineWidth = 2; for (let x = 8; x < w; x += 64) c.strokeRect(x, dy + 18, 48, h - dy - 44);
    c.fillStyle = "#3a2618"; c.fillRect(0, dy - 4, w, 12); c.fillStyle = "#120a06"; c.fillRect(0, h - 16, w, 16);
    for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.08})`; c.fillRect(R() * w, R() * h, 1, 1); }
  }) });
  const mSide = M({ color: 0x24251d, roughness: 1 });
  const mVent = M({ color: 0x15161a, roughness: 0.6, metalness: 0.4 });
  const mTick = M({ map: ticking }), mBlanket = M({ map: blanketT });
  const mRug = M({ map: rugT, roughness: 1 });
  const mBlack = keep(new THREE.MeshBasicMaterial({ color: 0x020203 }));

  // a box whose texture is laid on at a fixed size per metre, on every face
  function boxGeo(w, h, d, tm = 2) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    const sz = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * sz[f][0] / tm, uv.getY(k) * sz[f][1] / tm); }
    return keep(g);
  }
  // a mesh in the room at a rules position (or, in a group, at a local one)
  function put(geo, mat, x, y, z, parent = scene, cast = true, recv = true) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, parent === scene ? Z(z) : z); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m;
  }
  const boxAt = (s, mat, tm) => put(boxGeo(s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0, tm), mat, (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2);

  // ── the room ──
  const movers = [];
  // the tools the rooms past the Hall dress themselves with (hollowDress.js)
  const track = (s, m) => movers.push({ s, m });
  const kit = { THREE, scene, room, put, boxGeo, M, keep, ctex, grain, R, FR, Z, glowT, webT: null, woodT, darkWoodT, paleWoodT,
    mWood, mDark, mPale, mBlack, mVent, track, puff: (...a) => puff(...a), cam };
  const mRoomPaper = paperFor(room.name, kit);
  let hasBack = false;
  for (const s of room.solids) {
    const w = s.x1 - s.x0, h = s.y1 - s.y0, d = s.z1 - s.z0, cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, cz = (s.z0 + s.z1) / 2;
    switch (s.look) {
      case "floor": { const m = boxAt(s, mFloor, 3); m.castShadow = false; break; }
      case "back": hasBack = true; break;
      case "duct": boxAt(s, mVent, 1); break;
      case "dark": if (room.name !== "hall") put(boxGeo(w, h, d, 2), mBlack, cx, cy, cz, scene, false, false); break;
      case "wall": boxAt(s, mSide, 4); break;
      case "vent": boxAt(s, mVent, 1); break;
      case "leg": boxAt(s, mDark, 1); break;
      case "table": case "seat": case "chairback": boxAt(s, mWood, 1.5); break;
      case "shelf": {
        boxAt(s, mPale, 1.5);
        for (const bx of [s.x0 + 0.5, s.x1 - 0.6]) put(boxGeo(0.12, 0.6, 0.9), mDark, bx, s.y0 - 0.3, s.z1 - 0.45);
        break;
      }
      case "books": {
        const cols = [0x5b2a24, 0x2c3d4f, 0x6b5a2a, 0x3a4a2e];
        const n = 4, bh = h / n;
        for (let i = 0; i < n; i++) {
          const ox = (R() - 0.5) * 0.12, oz = (R() - 0.5) * 0.1;
          const b = put(boxGeo(w - 0.06 + ox, bh - 0.01, d - 0.08 + oz, 1), M({ color: cols[i % cols.length], roughness: 0.8 }), cx + ox * 0.5, s.y0 + bh * (i + 0.5), cz + oz * 0.5);
          b.rotation.y = (R() - 0.5) * 0.12;
          put(boxGeo(0.02, bh * 0.7, d - 0.12, 1), M({ color: 0xd8ccb0 }), cx + w / 2 - 0.02 + ox * 0.5, s.y0 + bh * (i + 0.5), cz + oz * 0.5, scene, false);
        }
        break;
      }
      case "cot": {
        // the frame, three mattresses not quite square on it, a pillow, a blanket over the front
        put(boxGeo(w, 0.25, d, 1.5), mDark, cx, s.y0 + 0.125, cz);
        let y = s.y0 + 0.25;
        const mh = (h - 0.25 - 0.1) / 3;
        for (let i = 0; i < 3; i++) {
          const ox = (R() - 0.5) * 0.25;
          const mm = put(boxGeo(w - 0.1 - R() * 0.15, mh, d - 0.1, 1.2), mTick, cx + ox, y + mh / 2, cz);
          mm.rotation.y = (R() - 0.5) * 0.02;
          y += mh;
        }
        put(boxGeo(1.4, 0.32, 2.2, 1), M({ color: 0xc9bfa6 }), s.x0 + 1.0, s.y1 + 0.06, cz + 1.4).rotation.z = 0.08;
        const bl = put(boxGeo(w * 0.62, 0.08, d * 0.7, 2), mBlanket, cx + 0.9, s.y1 - 0.02, cz - 0.6);
        bl.rotation.y = 0.05;
        put(boxGeo(w * 0.62, 1.3, 0.06, 2), mBlanket, cx + 0.9, s.y1 - 0.65, s.z0 + 0.4, scene, true, true).rotation.x = -0.06;
        break;
      }
      case "block": {
        const faces = ["A", "B", "C", "D", "E", "F"].map((L, i) => M({ map: ctex(128, 128, (c, ww, hh) => {
          c.fillStyle = ["#7a2f26", "#2f4e6b", "#7a6a2c", "#3a5a34", "#6b3a5c", "#7a4a26"][i]; c.fillRect(0, 0, ww, hh);
          c.strokeStyle = "#d8c8a0"; c.lineWidth = 8; c.strokeRect(10, 10, ww - 20, hh - 20);
          c.fillStyle = "#e6d6b0"; c.font = "bold 74px Georgia, serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(L, ww / 2, hh / 2 + 4);
          for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(0,0,0,${R() * 0.15})`; c.fillRect(R() * ww, R() * hh, 1, 1); }
          c.fillStyle = "rgba(255,255,255,.08)"; c.fillRect(R() * 80, R() * 80, 30, 6);
        }, false), roughness: 0.75 }));
        const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), faces);
        m.castShadow = m.receiveShadow = true; scene.add(m);
        movers.push({ s, m });
        break;
      }
      case "chest": {
        const body = boxAt(s, mDark, 1.5);
        void body;
        // the top, overhanging a little
        put(boxGeo(w + 0.25, 0.15, d + 0.2, 1.5), mWood, cx, s.y1 - 0.07, cz - 0.05);
        // the front: drawers shut, and two dark slots where drawers are pulled out
        const front = ctex(256, 268, (c, ww, hh) => {
          grain(c, ww, hh, "#3d2a1e", 40, [10, 6, 4]);
          const Y = (y) => hh - (y / h) * hh, X = (x) => ((x - s.x0) / w) * ww;
          const rows = [[0.25, 1.85], [2.7, 3.3], [4.1, 4.95]];
          for (const [a, b] of rows) {
            c.fillStyle = "#4a3324"; c.fillRect(X(20.5), Y(b), X(24.5) - X(20.5), Y(a) - Y(b));
            c.strokeStyle = "rgba(0,0,0,.6)"; c.lineWidth = 3; c.strokeRect(X(20.5), Y(b), X(24.5) - X(20.5), Y(a) - Y(b));
            c.fillStyle = "rgba(255,230,190,.08)"; c.fillRect(X(20.5), Y(b), X(24.5) - X(20.5), 2);
          }
          for (const [a, b] of [[2.0, 2.6], [3.4, 4.0]]) { c.fillStyle = "#050302"; c.fillRect(X(20.5), Y(b), X(24.5) - X(20.5), Y(a) - Y(b)); }
        }, false);
        put(keep(new THREE.PlaneGeometry(w, h)), M({ map: front }), cx, cy, s.z0 - 0.005, scene, false, true);
        for (const [y, n] of [[1.05, 2], [3.0, 2], [4.52, 2]]) for (let i = 0; i < n; i++) put(keep(new THREE.SphereGeometry(0.09, 10, 8)), M({ color: 0xa08048, metalness: 0.7, roughness: 0.35 }), s.x0 + w * (i + 1) / (n + 1), y, s.z0 - 0.06);
        break;
      }
      case "drawer": {
        const top = M({ map: ctex(128, 64, (c, ww, hh) => {
          c.fillStyle = "#2a2622"; c.fillRect(0, 0, ww, hh);
          const cols = ["#5b6a7a", "#7a6a5a", "#8a4a3a", "#bfb6a0", "#4a5a4a"];
          for (let i = 0; i < 9; i++) { c.fillStyle = cols[i % cols.length]; c.beginPath(); c.ellipse(10 + R() * (ww - 20), 8 + R() * (hh - 16), 14 + R() * 18, 7 + R() * 8, R() * 3, 0, 7); c.fill(); }
          for (let i = 0; i < 600; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.2})`; c.fillRect(R() * ww, R() * hh, 1, 1); }
        }, false) });
        const dm = new THREE.Mesh(boxGeo(w, h, d, 1.2), [mWood, mWood, top, mWood, mPale, mWood]);
        dm.position.set(cx, cy, Z(cz)); dm.castShadow = dm.receiveShadow = true; scene.add(dm);
        // a lip of drawer-side rising above the clothes, and the knob
        put(boxGeo(w, 0.1, 0.06, 1), mPale, cx, s.y1 + 0.05, s.z0 + 0.03);
        put(keep(new THREE.SphereGeometry(0.09, 10, 8)), M({ color: 0xa08048, metalness: 0.7, roughness: 0.35 }), cx, cy, s.z0 - 0.06);
        break;
      }
      case "rug": { const m = put(keep(new THREE.PlaneGeometry(w, d)), mRug, cx, s.y1 + 0.002, cz, scene, false, true); m.rotation.x = -Math.PI / 2; break; }
      default: break;
    }
  }

  // the back wall, one plane with holes in it (the room says where: a window,
  // so the moon comes in through the panes only; a vent; a doorway)
  if (hasBack) {
    const holes = room.holes || [], xs = [-2, room.w + 2];
    holes.forEach((h) => xs.push(h.x0, h.x1));
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i], x1 = xs[i + 1], mid = (x0 + x1) / 2, hole = holes.find((h) => mid > h.x0 && mid < h.x1);
      const top = room.tall || WALL_H;
      const ys = hole ? [[0, hole.y0], [hole.y1, top]] : [[0, top]];
      for (const [y0, y1] of ys) {
        const g = keep(new THREE.PlaneGeometry(x1 - x0, y1 - y0)), uv = g.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, (x0 + uv.getX(k) * (x1 - x0)) / 4, (y0 + uv.getY(k) * (y1 - y0)) / WALL_H);
        put(g, room.name === "hall" ? mHallPaper : mRoomPaper || mPaper, (x0 + x1) / 2, (y0 + y1) / 2, room.d, scene, true, true).material.side = THREE.DoubleSide;
      }
    }
  }
  // ── lights ──
  scene.add(new THREE.HemisphereLight(room.hemi ? room.hemi[0] : 0x3c4a6e, room.hemi ? room.hemi[1] : 0x1a120c, 0.55));
  const hemi = scene.children.find((o) => o.isHemisphereLight);
  const jarL = new THREE.PointLight(0xd8f28a, 1.1, 4.2, 2); scene.add(jarL);
  // a soft light that stays with the kid, from the camera's side and above:
  // the kid has to read against the dark wherever they are
  const keyL = new THREE.PointLight(0xffe2c0, 0.55, 4.5, 2); scene.add(keyL);

  // ── the things you can pick up ──
  const itemMeshes = [];
  function makeItem(kind) {
    const g = new THREE.Group();
    if (kind === "can") {
      put(keep(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 14)), M({ color: 0x8a8e92, metalness: 0.8, roughness: 0.35 }), 0, 0, 0, g);
      put(keep(new THREE.CylinderGeometry(0.102, 0.102, 0.13, 14)), M({ color: 0x7a2a22, roughness: 0.7 }), 0, 0, 0, g);
    } else {
      put(keep(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10)), M({ color: 0x3a5a6a, roughness: 1 }), 0, 0, 0, g);
      for (const y of [-0.11, 0.11]) put(keep(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 14)), mPale, 0, y, 0, g);
    }
    scene.add(g);
    return g;
  }

  // ── the kid ──
  const kid = createKid(THREE);
  scene.add(kid.root, kid.scarf);
  kid.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const blob = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.7, 0.7)), keep(new THREE.MeshBasicMaterial({ map: blobT, transparent: true, depthWrite: false, opacity: 0.8 })));
  blob.rotation.x = -Math.PI / 2; scene.add(blob);

  // the surface right under a point: for the blob shadow
  function groundUnder(x, z, y) {
    let best = -1;
    for (const s of room.solids) if (s.look !== "none" && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1 && s.y1 <= y + 0.05 && s.y1 > best) best = s.y1;
    return best;
  }

  // ── rings on water ──
  const ringT = ctex(64, 64, (c) => { c.strokeStyle = "rgba(200,215,240,.9)"; c.lineWidth = 3; c.beginPath(); c.arc(32, 32, 27, 0, 7); c.stroke(); }, false);
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), keep(new THREE.MeshBasicMaterial({ map: ringT, transparent: true, depthWrite: false, opacity: 0 })));
    r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r); rings.push({ m: r, t: 9, size: 1 });
  }
  let ringI = 0;
  function ring(x, z, size) { const r = rings[ringI++ % rings.length]; r.m.position.set(x, 0.01, Z(z)); r.t = 0; r.size = size; r.m.visible = true; }

  // ── dust kicked up: landing, a hard fall, the block dragged ──
  const smokeT = ctex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(150,140,125,.55)"); g.addColorStop(1, "rgba(150,140,125,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }, false);
  const puffs = [];
  for (let i = 0; i < 24; i++) {
    const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: smokeT, transparent: true, depthWrite: false, opacity: 0 })));
    sp.visible = false; scene.add(sp); puffs.push({ s: sp, t: 9, vx: 0, vy: 0, vz: 0, size: 0.3 });
  }
  let puffI = 0;
  function puff(x, y, z, n, size) {
    for (let i = 0; i < n; i++) {
      const p = puffs[puffI++ % puffs.length], a = FR() * Math.PI * 2;
      p.s.position.set(x + Math.cos(a) * 0.1, y + 0.05, Z(z + Math.sin(a) * 0.1));
      p.vx = Math.cos(a) * (0.4 + FR() * 0.5); p.vz = -Math.sin(a) * (0.3 + FR() * 0.3); p.vy = 0.15 + FR() * 0.25;
      p.t = 0; p.size = size * (0.7 + FR() * 0.6); p.s.visible = true;
    }
  }
  function stepFx(dt) {
    for (const p of puffs) {
      if (!p.s.visible) continue;
      p.t += dt;
      const k = p.t / 0.9;
      if (k >= 1) { p.s.visible = false; continue; }
      p.s.position.x += p.vx * dt * (1 - k); p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt * (1 - k);
      p.s.scale.setScalar(p.size * (0.5 + k)); p.s.material.opacity = 0.5 * (1 - k);
    }
    for (const r of rings) {
      if (!r.m.visible) continue;
      r.t += dt;
      const k = r.t / 0.8;
      if (k >= 1) { r.m.visible = false; continue; }
      r.m.scale.setScalar(r.size * (0.15 + k)); r.m.material.opacity = 0.5 * (1 - k);
    }
  }

  // ── mist along the floor, cobwebs in the corners ──
  const mistT = ctex(256, 64, (c, w, h) => {
    for (let i = 0; i < 60; i++) {
      const x = R() * w, y = h * (0.5 + R() * 0.3), r = 8 + R() * 20, g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(150,165,200,.2)"); g.addColorStop(1, "rgba(150,165,200,0)"); c.fillStyle = g;
      for (const dx of [-w, 0, w]) c.fillRect(x - r + dx, y - r, 2 * r, 2 * r);
    }
    // fade out at the top and bottom, so it's wisps, not a band
    c.globalCompositeOperation = "destination-in";
    const f = c.createLinearGradient(0, 0, 0, h); f.addColorStop(0, "rgba(0,0,0,0)"); f.addColorStop(0.55, "rgba(0,0,0,1)"); f.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = f; c.fillRect(0, 0, w, h);
  });
  const mists = [];
  for (const [z, sp, op] of [[5.4, 0.006, 0.22], [3.2, -0.004, 0.14]]) {
    const t = keep(mistT.clone()); t.needsUpdate = true; t.repeat.set(4, 1);
    const m = put(keep(new THREE.PlaneGeometry(36, 0.9)), keep(new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: op, blending: THREE.AdditiveBlending })), 15, 0.32, z, scene, false, false);
    mists.push({ m, t, sp });
  }
  const webT = ctex(128, 128, (c, w) => {
    c.strokeStyle = "rgba(210,210,220,.35)"; c.lineWidth = 1;
    for (let i = 0; i < 9; i++) { const a = i / 8 * Math.PI / 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * w, Math.sin(a) * w); c.stroke(); }
    for (let r = 14; r < w; r += 13 + R() * 6) { c.beginPath(); for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2, rr = r * (0.92 + R() * 0.12); if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.stroke(); }
  }, false);

  // ── the Nursery's own things: the window and the moon, the clock, the doll,
  // the candle, the music box, the leak, cobwebs ──
  function dressNursery() {
    const VENT = room.vent, LEAK = room.leak, WIN = room.win;
    let moonBase = 1.25;
    // the vent: a dented metal rim round the hole, the dark duct going back
    {
      const rim = M({ color: 0x4a4c50, metalness: 0.7, roughness: 0.45 }), V = VENT, z = room.d - 0.04;
      put(boxGeo(V.x1 - V.x0 + 0.24, 0.12, 0.1, 1), rim, (V.x0 + V.x1) / 2, V.y1 + 0.06, z);
      put(boxGeo(V.x1 - V.x0 + 0.24, 0.08, 0.1, 1), rim, (V.x0 + V.x1) / 2, V.y0 - 0.02, z);
      put(boxGeo(0.12, V.y1 - V.y0, 0.1, 1), rim, V.x0 - 0.06, (V.y0 + V.y1) / 2, z);
      put(boxGeo(0.12, V.y1 - V.y0, 0.1, 1), rim, V.x1 + 0.06, (V.y0 + V.y1) / 2, z);
      for (const x of [V.x0 + 0.08, V.x1 - 0.08]) for (const y of [V.y0 + 0.06, V.y1 - 0.06]) put(keep(new THREE.SphereGeometry(0.025, 6, 4)), rim, x, y, z - 0.06);
      put(keep(new THREE.PlaneGeometry(V.x1 - V.x0, V.y1 - V.y0)), mBlack, (V.x0 + V.x1) / 2, (V.y0 + V.y1) / 2, 9.9, scene, false, false);
    }
    // the window: frame, panes, the night outside and the moon, clouds going over it
    let sky = null, clouds = null, cur = null;
    {
      const z = room.d;
      sky = put(keep(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0)), keep(new THREE.MeshBasicMaterial({ map: ctex(256, 256, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#1a2848"); g.addColorStop(1, "#33476e"); c.fillStyle = g; c.fillRect(0, 0, w, h);
        const m = c.createRadialGradient(w * 0.68, h * 0.3, 0, w * 0.68, h * 0.3, 90); m.addColorStop(0, "rgba(230,238,255,1)"); m.addColorStop(0.18, "rgba(220,230,255,.95)"); m.addColorStop(0.24, "rgba(160,180,230,.35)"); m.addColorStop(1, "rgba(120,140,200,0)");
        c.fillStyle = m; c.fillRect(0, 0, w, h);
        c.fillStyle = "rgba(10,14,26,.9)"; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 8) c.lineTo(x, h * 0.78 - Math.abs(Math.sin(x * 0.05)) * 26 - (x > 90 && x < 130 ? 50 : 0)); c.lineTo(w, h); c.fill();
      }, false), fog: false })), (WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, z + 0.4, scene, false, false);
      const cloudT = ctex(512, 128, (c, w, h) => {
        for (let i = 0; i < 40; i++) {
          const x = R() * w, y = h * (0.15 + R() * 0.5), r = 18 + R() * 40, g = c.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, "rgba(40,48,70,.85)"); g.addColorStop(1, "rgba(40,48,70,0)"); c.fillStyle = g;
          for (const dx of [-w, 0, w]) c.fillRect(x - r + dx, y - r, 2 * r, 2 * r);
        }
      });
      clouds = put(keep(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0)), keep(new THREE.MeshBasicMaterial({ map: cloudT, transparent: true, depthWrite: false, fog: false })), (WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, z + 0.35, scene, false, false);
      const fr = (x0, x1, y0, y1) => put(boxGeo(x1 - x0, y1 - y0, 0.22, 1), mPale, (x0 + x1) / 2, (y0 + y1) / 2, z);
      fr(WIN.x0 - 0.18, WIN.x1 + 0.18, WIN.y0 - 0.3, WIN.y0); fr(WIN.x0 - 0.18, WIN.x1 + 0.18, WIN.y1, WIN.y1 + 0.18);
      fr(WIN.x0 - 0.18, WIN.x0, WIN.y0, WIN.y1); fr(WIN.x1, WIN.x1 + 0.18, WIN.y0, WIN.y1);
      fr((WIN.x0 + WIN.x1) / 2 - 0.07, (WIN.x0 + WIN.x1) / 2 + 0.07, WIN.y0, WIN.y1);
      fr(WIN.x0, WIN.x1, (WIN.y0 + WIN.y1) / 2 - 0.06, (WIN.y0 + WIN.y1) / 2 + 0.06);
      // the sill, deep enough to cast a line of shadow
      put(boxGeo(WIN.x1 - WIN.x0 + 0.8, 0.12, 0.5, 1), mPale, (WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.3, z - 0.2);
      // a torn curtain on one side
      cur = put(boxGeo(1.2, WIN.y1 - WIN.y0 + 1.2, 0.05, 2), M({ color: 0x4a3a40, roughness: 1, transparent: true, opacity: 0.92 }), WIN.x0 + 0.2, (WIN.y0 + WIN.y1) / 2 + 0.2, z - 0.25);
      cur.rotation.z = 0.04;
    }

    // ── the wall clock: the house's heart; its pendulum keeps the time ──
    const clock = new THREE.Group(); clock.position.set(6.6, 7.6, Z(room.d - 0.18)); scene.add(clock);
    {
      put(boxGeo(2.0, 4.4, 0.3, 1), mDark, 0, -1.2, -0.05, clock);
      const faceT = ctex(256, 256, (c, w, h) => {
        c.fillStyle = "#cbbd98"; c.beginPath(); c.arc(128, 128, 120, 0, 7); c.fill();
        const g = c.createRadialGradient(128, 128, 30, 128, 128, 125); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(60,40,10,.45)"); c.fillStyle = g; c.fill();
        c.fillStyle = "#2a1e14"; c.font = "bold 26px Georgia, serif"; c.textAlign = "center"; c.textBaseline = "middle";
        const N = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
        N.forEach((n, i) => { const a = i / 12 * Math.PI * 2 - Math.PI / 2; c.fillText(n, 128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92); });
        for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; c.fillRect(128 + Math.cos(a) * 112 - 1, 128 + Math.sin(a) * 112 - 1, i % 5 ? 2 : 4, i % 5 ? 2 : 4); }
        c.strokeStyle = "rgba(40,30,20,.6)"; c.lineWidth = 2; c.beginPath(); c.moveTo(60, 40); c.lineTo(120, 110); c.lineTo(110, 150); c.stroke();   // a crack
      }, false);
      put(keep(new THREE.CircleGeometry(0.82, 32)), M({ map: faceT, roughness: 0.6 }), 0, 0, 0.12, clock, false, true);
      put(keep(new THREE.TorusGeometry(0.85, 0.07, 8, 32)), M({ color: 0x8a6a3a, metalness: 0.6, roughness: 0.4 }), 0, 0, 0.12, clock);
    }
    const handM = M({ color: 0x1a120c });
    const hourH = new THREE.Group(), minH = new THREE.Group(), pend = new THREE.Group();
    hourH.position.set(0, 0, 0.15); minH.position.set(0, 0, 0.17); pend.position.set(0, -1.0, 0.15);
    clock.add(hourH, minH, pend);
    put(boxGeo(0.06, 0.45, 0.02, 1), handM, 0, 0.2, 0, hourH);
    put(boxGeo(0.04, 0.68, 0.02, 1), handM, 0, 0.32, 0, minH);
    put(boxGeo(0.04, 2.1, 0.03, 1), M({ color: 0x8a6a3a, metalness: 0.6 }), 0, -1.05, 0, pend);
    put(keep(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 20)), M({ color: 0xa08048, metalness: 0.8, roughness: 0.3 }), 0, -2.1, 0, pend).rotation.x = Math.PI / 2;
  
    // ── the rag doll slumped on the cot, and the mobile over it ──
    {
      const d = new THREE.Group(); d.position.set(6.2, 2.8 + 0.25, Z(5.0)); d.rotation.set(0, 0.5, 0.15); scene.add(d);
      const cloth = M({ color: 0x8a7a6a }), dress = M({ color: 0x5a3a5a });
      put(keep(new THREE.CylinderGeometry(0.16, 0.24, 0.5, 10)), dress, 0, 0.1, 0, d);
      put(keep(new THREE.SphereGeometry(0.2, 12, 10)), cloth, 0.05, 0.5, 0, d).scale.set(1, 1.05, 0.95);
      for (const x of [-0.07, 0.07]) put(keep(new THREE.SphereGeometry(0.035, 8, 6)), M({ color: 0x0b0b0b, roughness: 0.3 }), 0.08 + x, 0.53, 0.17, d);
      put(keep(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8)), cloth, 0.25, 0.05, 0.1, d).rotation.z = 1.1;
      put(keep(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8)), cloth, -0.24, 0.0, 0.05, d).rotation.z = -1.3;
      put(keep(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8)), cloth, 0.1, -0.15, 0.3, d).rotation.x = 1.4;
      put(keep(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8)), cloth, -0.1, -0.15, 0.3, d).rotation.x = 1.3;
    }
    const mobile = new THREE.Group(); mobile.position.set(7.4, 7.6, Z(3.2)); scene.add(mobile);
    put(keep(new THREE.CylinderGeometry(0.01, 0.01, 4, 4)), handM, 0, 2, 0, mobile, false);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2, arm = new THREE.Group(); arm.rotation.y = a; mobile.add(arm);
      put(boxGeo(1.2, 0.03, 0.03, 1), mPale, 0.6, 0, 0, arm, false);
      put(keep(new THREE.CylinderGeometry(0.006, 0.006, 0.7, 3)), handM, 1.15, -0.35, 0, arm, false);
      const bird = put(keep(new THREE.ConeGeometry(0.12, 0.45, 6)), M({ color: [0x7a3a2a, 0x2a4a5a, 0x8a7a3a][i] }), 1.15, -0.75, 0, arm);
      bird.rotation.z = Math.PI / 2;
    }
    // a picture, crooked: someone very tall in a doorway
    {
      const pic = put(boxGeo(1.6, 2.1, 0.08, 1), mDark, 25.6, 8.3, room.d - 0.05);
      pic.rotation.z = -0.07;
      const art = put(keep(new THREE.PlaneGeometry(1.3, 1.8)), M({ map: ctex(128, 176, (c, w, h) => {
        c.fillStyle = "#3a3428"; c.fillRect(0, 0, w, h);
        const g = c.createRadialGradient(w / 2, h * 0.45, 5, w / 2, h * 0.45, 80); g.addColorStop(0, "#8a7a5a"); g.addColorStop(1, "#2a241a"); c.fillStyle = g; c.fillRect(14, 14, w - 28, h - 14);
        c.fillStyle = "#0e0b08"; c.beginPath(); c.ellipse(w / 2, 46, 11, 13, 0, 0, 7); c.fill(); c.fillRect(w / 2 - 14, 56, 28, 110); c.fillRect(w / 2 - 22, 60, 6, 80); c.fillRect(w / 2 + 16, 60, 6, 80);
      }, false), roughness: 0.6 }), 25.6, 8.3, room.d - 0.1, scene, false);
      art.rotation.set(0, 0, -0.07);
    }
    // jars on the high shelf, at the back
    for (let i = 0; i < 3; i++) {
      const j = put(keep(new THREE.CylinderGeometry(0.12, 0.12, 0.34 + i * 0.06, 10)), M({ color: [0x4a5a3a, 0x5a4a2a, 0x3a4a5a][i], roughness: 0.2, transparent: true, opacity: 0.8 }), 26.5 + i * 0.35, 6.0 + 0.17 + i * 0.03, 5.88);
      void j;
    }
    // the vent grate, knocked off and leaning on the shelf
    {
      const gr = new THREE.Group(); gr.position.set(VENT.x0 - 0.75, 6.0, Z(5.82)); gr.rotation.set(-0.22, 0.1, 0.05); scene.add(gr);
      const gm = M({ color: 0x3a3c40, metalness: 0.6, roughness: 0.5 });
      for (let i = 0; i < 6; i++) put(boxGeo(0.03, 0.75, 0.03, 1), gm, -0.45 + i * 0.18, 0.37, 0, gr);
      put(boxGeo(1.0, 0.04, 0.04, 1), gm, 0, 0.02, 0, gr); put(boxGeo(1.0, 0.04, 0.04, 1), gm, 0, 0.74, 0, gr);
    }

    // the candle on the table
    const candle = new THREE.Group(); candle.position.set(14.9, 3.05, Z(4.4)); scene.add(candle);
    put(keep(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 14)), M({ color: 0x8a6a3a, metalness: 0.6, roughness: 0.4 }), 0, 0.03, 0, candle);
    put(keep(new THREE.CylinderGeometry(0.08, 0.09, 0.42, 10)), M({ color: 0xe8dcc0, roughness: 0.5, emissive: 0x3a2008 }), 0, 0.27, 0, candle);
    const flameM = keep(new THREE.SpriteMaterial({ map: glowT, color: 0xffb050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const flame = new THREE.Sprite(flameM); flame.position.set(0, 0.56, 0); flame.scale.set(0.16, 0.3, 1); candle.add(flame);
    const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowT, color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 })));
    halo.position.set(0, 0.56, 0); halo.scale.set(1.4, 1.4, 1); candle.add(halo);

    const LDr = { x: -0.3, y: -1, z: -0.55 };                           // the way the moonlight falls (rules axes)
    const LD = (() => { const l = Math.hypot(LDr.x, LDr.y, LDr.z); return { x: LDr.x / l, y: LDr.y / l, z: LDr.z / l }; })();
    const moon = new THREE.DirectionalLight(0xa6bce8, 1.25);
    const mTarget = new THREE.Vector3(14.5, 0, Z(2.2));
    moon.position.copy(mTarget).addScaledVector(new THREE.Vector3(LD.x, LD.y, Z(LD.z)), -22); moon.target.position.copy(mTarget);
    scene.add(moon, moon.target);
    Object.assign(moon.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 50 });
    moon.shadow.bias = -0.0008; moon.shadow.normalBias = 0.02;
    const candleL = new THREE.PointLight(0xff9a48, 1.6, 9, 2); candleL.position.set(14.9, 3.7, Z(4.2)); scene.add(candleL);
    candleL.shadow.bias = -0.004; candleL.shadow.camera.near = 0.1;
    const night = new THREE.PointLight(0x6a7ab0, 0.5, 14, 2); night.position.set(24, 5, Z(1.0)); scene.add(night);

    // the moonbeam: a pale shaft from the window to the floor, with dust in it
    const shaftDrop = (x, y) => { const k = y / -LD.y; return [x + LD.x * k, 0.02, room.d + LD.z * k]; };
    let shaft, dust, patch;
    {
      const top = [[WIN.x0, WIN.y1], [WIN.x1, WIN.y1], [WIN.x1, WIN.y0], [WIN.x0, WIN.y0]].map(([x, y]) => [x, y, room.d - 0.02]);
      const bot = top.map(([x, y]) => shaftDrop(x, y));
      const pos = [], colA = [];
      const quad = (a, b, c, d, ca, cb) => { [a, b, c, a, c, d].forEach((p, i) => { pos.push(p[0], p[1], Z(p[2])); const k = [ca, cb, cb, ca, cb, ca][i]; colA.push(k, k, k); }); };
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(top[i], top[j], bot[j], bot[i], 0.55, 0.0); }
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(colA, 3));
      shaft = new THREE.Mesh(g, keep(new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x8fa6e0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })));
      scene.add(shaft);
      // the painted patch of moonlight on the floor, for when there are no shadows
      const pg = keep(new THREE.PlaneGeometry(1, 1));
      patch = new THREE.Group(); scene.add(patch);
      const pm = keep(new THREE.MeshBasicMaterial({ color: 0x5a6a90, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      const [ax, , az] = shaftDrop(WIN.x0, WIN.y1), [bx, , bz] = shaftDrop(WIN.x1, WIN.y0);
      const mx = (WIN.x0 + WIN.x1) / 2;
      for (const [x0, x1, z0, z1] of [[ax, shaftDrop(mx, 0)[0] - 0.08, az, (az + bz) / 2 - 0.06], [shaftDrop(mx, 0)[0] + 0.08, bx, az, (az + bz) / 2 - 0.06], [ax, shaftDrop(mx, 0)[0] - 0.08, (az + bz) / 2 + 0.06, bz], [shaftDrop(mx, 0)[0] + 0.08, bx, (az + bz) / 2 + 0.06, bz]]) {
        const p = new THREE.Mesh(pg, pm); p.rotation.x = -Math.PI / 2; p.position.set((x0 + x1) / 2, 0.03, Z((z0 + z1) / 2)); p.scale.set(Math.abs(x1 - x0), Math.abs(z1 - z0), 1); patch.add(p);
      }
      const N = 220, dp = new Float32Array(N * 3), seeds = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        // a point somewhere along a ray from the window toward the floor
        const sx = WIN.x0 + (WIN.x1 - WIN.x0) * FR(), sy = WIN.y0 + (WIN.y1 - WIN.y0) * FR(), along = sy * FR() / -LD.y;
        seeds[i * 3] = sx + LD.x * along; seeds[i * 3 + 1] = sy + LD.y * along; seeds[i * 3 + 2] = Z(room.d + LD.z * along);
      }
      const dg = keep(new THREE.BufferGeometry()); dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
      dust = new THREE.Points(dg, keep(new THREE.PointsMaterial({ map: glowT, color: 0xc8d4f0, size: 0.07, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
      dust.userData.seeds = seeds;
      scene.add(dust);
    }

    // ── the music box on the table: lid up, a dancer turning while it plays ──
    const mbox = new THREE.Group(); scene.add(mbox);
    let dancer = null;
    {
      const b = room.box;
      mbox.position.set(b.x, b.y, Z(b.z)); mbox.rotation.y = 0.35;
      const gold = M({ color: 0xb08a48, metalness: 0.8, roughness: 0.35 }), lacq = M({ color: 0x4a2030, roughness: 0.6 });
      put(boxGeo(0.5, 0.26, 0.36, 0.5), lacq, 0, 0.13, 0, mbox);
      put(boxGeo(0.52, 0.03, 0.38, 0.5), gold, 0, 0.26, 0, mbox);
      const lid = new THREE.Group(); lid.position.set(0, 0.27, -0.18); lid.rotation.x = -1.9; mbox.add(lid);
      put(boxGeo(0.5, 0.03, 0.36, 0.5), lacq, 0, 0, 0.18, lid);
      put(keep(new THREE.PlaneGeometry(0.42, 0.28)), M({ color: 0x8a96a0, metalness: 0.9, roughness: 0.15 }), 0, 0.02, 0.18, lid).rotation.x = -Math.PI / 2;   // a little mirror
      put(keep(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4)), gold, 0, 0.31, 0, mbox);
      dancer = new THREE.Group(); dancer.position.set(0, 0.35, 0); mbox.add(dancer);
      const pale = M({ color: 0xe8dcd0, roughness: 0.5 });
      put(keep(new THREE.ConeGeometry(0.06, 0.07, 10)), M({ color: 0xd8a8b8, roughness: 0.6 }), 0, 0.01, 0, dancer);
      put(keep(new THREE.CylinderGeometry(0.012, 0.018, 0.07, 6)), pale, 0, 0.06, 0, dancer);
      put(keep(new THREE.SphereGeometry(0.02, 8, 6)), pale, 0, 0.11, 0, dancer);
      put(keep(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 4)), pale, 0, 0.12, 0, dancer).rotation.z = 0.3;
    }


    // the leak: a dark puddle, and a drop falling into it
    const puddle = put(keep(new THREE.CircleGeometry(LEAK.r, 24)), M({ color: 0x121a26, emissive: 0x05080d, roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.78 }), LEAK.x, 0.004, LEAK.z, scene, false, true);
    puddle.rotation.x = -Math.PI / 2; puddle.scale.set(1.25, 0.85, 1);
    const drop = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowT, color: 0xbcd0f0, transparent: true, opacity: 0.8, depthWrite: false })));
    drop.scale.set(0.04, 0.11, 1); scene.add(drop);
    let lastDrop = -1;

    const webM = keep(new THREE.MeshBasicMaterial({ map: webT, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    // a corner up by the ceiling, under the table, beside the chest, under the table's near corner
    for (const [x, y, z, ry, rz, sz] of [[0.02, 9.5, 5.9, Math.PI / 2, -Math.PI / 2, 2.2], [15.45, 2.78, 4.95, 0, Math.PI, 0.9], [25.0, 4.8, 5.95, 0, -Math.PI / 2, 1.1], [10.9, 2.78, 0.95, 0, Math.PI / 2, 0.7]]) {
      const g = keep(new THREE.PlaneGeometry(sz, sz)); g.translate(sz / 2, -sz / 2, 0);
      put(g, webM, x, y, z, scene, false, false).rotation.set(0, ry, rz);
    }

    function applyQ(Q) {
      moon.castShadow = Q > 0;
      if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
      moon.shadow.mapSize.set(Q > 1 ? 2048 : 1024, Q > 1 ? 2048 : 1024);
      // without shadows the moon can't come through just the window: dim it, paint the patch
      moonBase = Q > 0 ? 1.25 : 0.25;
      patch.visible = Q === 0;
      // the candle throws real shadows only on High: a point light's shadow is six renders
      candleL.castShadow = Q > 1; candleL.shadow.mapSize.set(512, 512);
      if (candleL.shadow.map) { candleL.shadow.map.dispose(); candleL.shadow.map = null; }
    }
    function ambient(T, t, dt, wound) {
      const cl0 = cloud(T), fl = lightning(T), g = gust(T);
      moon.intensity = moonBase * (1 - 0.72 * cl0) + fl * 7;
      moon.color.setRGB(0.65 + fl * 0.35, 0.74 + fl * 0.26, 0.91 + fl * 0.09);
      hemi.intensity = 0.55 + fl * 1.2;
      shaft.material.opacity = (0.14 + Math.sin(t * 0.25) * 0.02) * (1 - 0.8 * cl0) + fl * 0.35;
      patch.children.forEach((c) => { c.material.opacity = 0.35 * (1 - 0.8 * cl0) + fl * 0.4; });
      sky.material.color.setScalar(Math.min(2.5, 1 - 0.45 * cl0 + fl * 1.5));
      clouds.material.map.offset.x = T * 0.006; clouds.material.opacity = 0.3 + cl0 * 0.7;
      // the curtain breathes in the gusts, and its shadow moves on the floor
      cur.rotation.set(-0.05 - g * 0.3 + Math.sin(T * 2.3) * 0.04 * g, 0, 0.04 + Math.sin(T * 1.7) * 0.06 * g);
      // the clock: the pendulum swings a second each way; the hands creep toward midnight
      pend.rotation.z = Math.sin(T * Math.PI) * 0.18;
      const mins = 52 + T / 60;
      minH.rotation.z = -mins / 60 * Math.PI * 2; hourH.rotation.z = -(11 + mins / 60) / 12 * Math.PI * 2;
      mobile.rotation.y = t * 0.12 + g * 0.2;
      // the candle breathes, and leans in a gust
      const f = 0.85 + Math.sin(t * 9) * 0.06 + Math.sin(t * 23) * 0.04 + (FR() - 0.5) * 0.08 - g * 0.06;
      candleL.intensity = 1.6 * f + fl * 0.5; flame.scale.set(0.15 * (0.9 + f * 0.1), 0.3 * f, 1); halo.material.opacity = 0.3 * f;
      flame.position.x = Math.sin(t * 3) * 0.01 * g;
      // the dust drifts in the beam
      const pa = dust.geometry.attributes.position, sd = dust.userData.seeds;
      for (let i = 0; i < pa.count; i++) pa.setXYZ(i, sd[i * 3] + Math.sin(t * 0.21 + i) * 0.25, sd[i * 3 + 1] + Math.sin(t * 0.13 + i * 1.7) * 0.3, sd[i * 3 + 2] + Math.cos(t * 0.17 + i * 0.7) * 0.2);
      pa.needsUpdate = true;
      dust.material.opacity = 0.7 * (1 - 0.7 * cl0) + fl * 0.3;
      // the leak
      const d = dropAt(T);
      drop.visible = d >= 0;
      if (d >= 0) drop.position.set(LEAK.x, LEAK.top * (1 - d * d), Z(LEAK.z));
      const n = Math.floor(T / 2.6);
      if (d < 0 && n !== lastDrop) { lastDrop = n; ring(LEAK.x, LEAK.z, 0.5); }
      // the music box: the dancer turns while it plays, slowing as it runs down
      if (dancer && wound > 0) dancer.rotation.y += dt * 2.4 * Math.min(1, wound * 1.6);
      stepFx(dt);
    }
    return { applyQ, ambient };
  }

  // ── the Hall's own things: sconces, the runner, the bench and the cases, the
  // coat stand and its coats, the grandfather clock, the doorway into the
  // dark, the far door, faces in frames ──
  function dressHall() {
    const D = room.d;
    let gPend = null;            // the grandfather clock's pendulum (made in the loop below)
    const brass = M({ color: 0xa08048, metalness: 0.8, roughness: 0.35 });
    // what each box is, here
    const runnerT = ctex(128, 512, (c, w, h) => {
      c.fillStyle = "#4a1418"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#7a5a2a"; c.fillRect(6, 0, 8, h); c.fillRect(w - 14, 0, 8, h);
      c.fillStyle = "#1e2a2a"; c.fillRect(18, 0, 6, h); c.fillRect(w - 24, 0, 6, h);
      for (let y = 30; y < h; y += 64) { c.fillStyle = "rgba(122,90,42,.6)"; c.beginPath(); c.moveTo(w / 2, y - 22); c.lineTo(w / 2 + 26, y); c.lineTo(w / 2, y + 22); c.lineTo(w / 2 - 26, y); c.fill(); c.fillStyle = "rgba(30,42,42,.8)"; c.beginPath(); c.arc(w / 2, y, 7, 0, 7); c.fill(); }
      for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.18})`; c.fillRect(R() * w, R() * h, 1, 1); }
      for (let i = 0; i < 6; i++) { const y = R() * h, g = c.createRadialGradient(w / 2, y, 0, w / 2, y, 50); g.addColorStop(0, "rgba(10,5,2,.4)"); g.addColorStop(1, "rgba(10,5,2,0)"); c.fillStyle = g; c.fillRect(0, y - 50, w, 100); }
    });
    const leather = (base) => M({ map: ctex(128, 128, (c, w, h) => {
      c.fillStyle = base; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.12})`; c.fillRect(R() * w, R() * h, 2, 2); }
      c.fillStyle = "rgba(20,12,6,.75)"; c.fillRect(w * 0.25, 0, 10, h); c.fillRect(w * 0.7, 0, 10, h);
      c.strokeStyle = "rgba(0,0,0,.4)"; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6);
    }, false), roughness: 0.7 });
    for (const s of room.solids) {
      const w = s.x1 - s.x0, h = s.y1 - s.y0, d = s.z1 - s.z0, cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, cz = (s.z0 + s.z1) / 2;
      switch (s.look) {
        case "dark": put(boxGeo(w, h, d, 2), mBlack, cx, cy, cz, scene, false, false); break;
        case "runner": {
          const t = runnerT.clone(); t.needsUpdate = true; keep(t); t.repeat.set(1, w / 4);
          const m = put(keep(new THREE.PlaneGeometry(d, w)), M({ map: t, roughness: 1 }), cx, s.y1 + 0.003, cz, scene, false, true);
          m.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
          break;
        }
        case "tray": {
          const m = put(keep(new THREE.CylinderGeometry(Math.min(w, d) / 2, Math.min(w, d) / 2 - 0.04, 0.03, 20)), M({ color: 0x34322e, metalness: 0.5, roughness: 0.65 }), cx, 0.015, cz, scene, true, true);
          m.scale.set(w / Math.min(w, d), 1, d / Math.min(w, d));
          break;
        }
        case "bench": {
          put(boxGeo(w, h, d, 1.5), mWood, cx, cy, cz);
          put(boxGeo(w, 1.2, 0.12, 1.5), mWood, cx, s.y1 + 0.75, s.z1 - 0.06);    // the backrest
          for (const x of [s.x0 + 0.1, s.x1 - 0.1]) put(boxGeo(0.12, 1.3, 0.12, 1), mDark, x, s.y1 + 0.6, s.z1 - 0.06);
          break;
        }
        case "case": put(boxGeo(w, h, d, 1), leather("#4a3020"), cx, cy, cz); put(boxGeo(0.3, 0.06, 0.06, 1), brass, cx, s.y1 + 0.03, s.z0 + 0.2); break;
        case "case2": put(boxGeo(w, h, d, 1), leather("#2a3a40"), cx, cy, cz); put(boxGeo(0.3, 0.06, 0.06, 1), brass, cx, s.y1 + 0.03, s.z0 + 0.2); break;
        case "sidetable": {
          put(boxGeo(w + 0.1, h, d + 0.1, 1.5), mWood, cx, cy, cz);
          put(boxGeo(w - 0.3, 0.3, 0.06, 1), mPale, cx, s.y0 - 0.17, s.z0 + 0.05);
          put(keep(new THREE.SphereGeometry(0.06, 8, 6)), brass, cx, s.y0 - 0.17, s.z0 - 0.01);
          // a vase of dead flowers
          put(keep(new THREE.CylinderGeometry(0.14, 0.2, 0.55, 12)), M({ color: 0x3a4a5a, roughness: 0.3, metalness: 0.1 }), s.x1 - 0.5, s.y1 + 0.27, cz + 0.2);
          for (let i = 0; i < 5; i++) { const st = put(keep(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 4)), M({ color: 0x3a3020 }), s.x1 - 0.5 + (R() - 0.5) * 0.15, s.y1 + 0.85, cz + 0.2); st.rotation.set((R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.8); }
          break;
        }
        case "pole": {
          put(keep(new THREE.CylinderGeometry(0.08, 0.1, h, 10)), mDark, cx, cy, cz);
          put(keep(new THREE.CylinderGeometry(0.5, 0.6, 0.15, 12)), mDark, cx, 0.08, cz);
          for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2, hk = put(boxGeo(0.5, 0.06, 0.06, 1), brass, cx + Math.cos(a) * 0.25, s.y1 - 0.4, cz + Math.sin(a) * 0.25); hk.rotation.y = -a; }
          break;
        }
        case "gclock": gclock(s); break;
        case "ustand": {
          put(keep(new THREE.CylinderGeometry(w / 2, w / 2 - 0.05, h, 16, 1, true)), M({ color: 0x5a4a30, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }), cx, cy, cz);
          for (const [dx, a] of [[-0.12, 0.15], [0.14, -0.2]]) { const u = put(keep(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6)), M({ color: 0x1a1a20 }), cx + dx, 1.2, cz); u.rotation.z = a; }
          break;
        }
        default: break;
      }
    }

    // the coats on the stand: long, to the floor; they stir as you pass
    const coats = [];
    {
      const pole = room.solids.find((s) => s.look === "pole"), px = (pole.x0 + pole.x1) / 2, pz = (pole.z0 + pole.z1) / 2;
      const cols = [0x120e0c, 0x1a1012, 0x0e1214, 0x16120c];
      // heavy wool: a weave and a few worn patches, so they read as cloth, not plastic
      const woolT = ctex(64, 128, (c, w, h) => {
        c.fillStyle = "#fff"; c.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(0,0,0,${0.06 + R() * 0.06})`; c.fillRect(0, y, w, 1); }
        for (let i = 0; i < 6; i++) { const x = R() * w, y = R() * h, g = c.createRadialGradient(x, y, 0, x, y, 10); g.addColorStop(0, "rgba(255,255,255,.4)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); }
      });
      [[-0.55, -0.35], [0.5, -0.4], [-0.2, 0.25], [0.35, 0.2]].forEach(([dx, dz], i) => {
        const g = new THREE.Group(); g.position.set(px + dx * 0.5, 7.0, Z(pz + dz)); scene.add(g);
        const len = 6.2 + R() * 0.5;
        const coat = put(keep(new THREE.CylinderGeometry(0.3, 0.75, len, 10, 4, true)), M({ color: cols[i], map: woolT, roughness: 1, side: THREE.DoubleSide }), dx * 0.6, -len / 2, 0, g);
        coat.scale.set(1, 1, 0.55);
        put(keep(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), M({ color: cols[i], roughness: 1 }), dx * 0.6, -0.05, 0, g);
        coats.push({ g, ph: R() * 6, sway: 0 });
      });
    }

    // the tall doorway into the Keeper's room: a frame, and something red far back
    {
      const K = room.door, trim = M({ map: darkWoodT, roughness: 0.8 });
      put(boxGeo(0.35, K.y1 + 0.3, 0.3, 1), trim, K.x0 - 0.17, (K.y1 + 0.3) / 2, D - 0.1);
      put(boxGeo(0.35, K.y1 + 0.3, 0.3, 1), trim, K.x1 + 0.17, (K.y1 + 0.3) / 2, D - 0.1);
      put(boxGeo(K.x1 - K.x0 + 1.0, 0.45, 0.35, 1), trim, (K.x0 + K.x1) / 2, K.y1 + 0.2, D - 0.1);
      // a door hanging open into the dark, half seen
      const dr = new THREE.Group(); dr.position.set(K.x1, 0, Z(D + 0.05)); dr.rotation.y = -1.9; scene.add(dr);
      put(boxGeo(K.x1 - K.x0, K.y1, 0.15, 1.5), M({ map: darkWoodT }), -(K.x1 - K.x0) / 2, K.y1 / 2, 0, dr);
    }
    const lair = new THREE.PointLight(0xa02818, 0.9, 7, 2); lair.position.set((room.door.x0 + room.door.x1) / 2, 2.5, Z(D + 3.2)); scene.add(lair);

    // the far door, with the gap under it
    {
      const E = room.exitDoor, x0 = E.x0 - 0.3, x1 = E.x1 + 0.3, top = 8.4;
      const doorT = ctex(128, 384, (c, w, h) => {
        grain(c, w, h, "#3a2618", 40, [12, 6, 3]);
        c.strokeStyle = "rgba(0,0,0,.55)"; c.lineWidth = 5;
        c.strokeRect(14, 20, w - 28, h * 0.4); c.strokeRect(14, h * 0.5, w - 28, h * 0.42);
        c.fillStyle = "rgba(255,220,180,.06)"; c.fillRect(14, 20, w - 28, 3); c.fillRect(14, h * 0.5, w - 28, 3);
        for (let i = 0; i < 9; i++) { c.strokeStyle = "rgba(200,190,170,.18)"; c.lineWidth = 2; c.beginPath(); const x = w * 0.2 + R() * w * 0.6, y = h * 0.86 + R() * h * 0.1; c.moveTo(x, y); c.lineTo(x + (R() - 0.5) * 20, y - 20 - R() * 30); c.stroke(); }   // scratches, low down
      }, false);
      put(boxGeo(x1 - x0, top - E.y1, 0.14, 1), [mDark, mDark, mDark, mDark, M({ map: doorT }), mDark], (x0 + x1) / 2, (top + E.y1) / 2, D - 0.08);
      put(keep(new THREE.SphereGeometry(0.16, 10, 8)), brass, x0 + 0.35, 4.0, D - 0.2);
      put(boxGeo(0.25, 0.5, 0.06, 1), brass, x0 + 0.35, 4.0, D - 0.16);
      const trim = M({ map: darkWoodT });
      put(boxGeo(0.3, top + 0.3, 0.25, 1), trim, x0 - 0.15, (top + 0.3) / 2, D - 0.1);
      put(boxGeo(0.3, top + 0.3, 0.25, 1), trim, x1 + 0.15, (top + 0.3) / 2, D - 0.1);
      put(boxGeo(x1 - x0 + 0.9, 0.35, 0.3, 1), trim, (x0 + x1) / 2, top + 0.15, D - 0.1);
      // a little light leaks under it from the other side
      const leak = put(keep(new THREE.PlaneGeometry(x1 - x0 - 0.3, 1.4)), keep(new THREE.MeshBasicMaterial({ map: glowT, color: 0x8a7a50, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })), (x0 + x1) / 2, 0.01, D - 0.6, scene, false, false);
      leak.rotation.x = -Math.PI / 2;
    }

    // where you came in: the duct's mouth, its grate fallen on the boards below
    {
      const U = room.duct, rim = M({ color: 0x4a4c50, metalness: 0.7, roughness: 0.45 }), z = D - 0.04;
      put(boxGeo(U.x1 - U.x0 + 0.24, 0.1, 0.1, 1), rim, (U.x0 + U.x1) / 2, U.y1 + 0.05, z);
      put(boxGeo(U.x1 - U.x0 + 0.24, 0.1, 0.1, 1), rim, (U.x0 + U.x1) / 2, U.y0 - 0.05, z);
      put(boxGeo(0.1, U.y1 - U.y0, 0.1, 1), rim, U.x0 - 0.05, (U.y0 + U.y1) / 2, z);
      put(boxGeo(0.1, U.y1 - U.y0, 0.1, 1), rim, U.x1 + 0.05, (U.y0 + U.y1) / 2, z);
      put(keep(new THREE.PlaneGeometry(U.x1 - U.x0, U.y1 - U.y0)), mBlack, (U.x0 + U.x1) / 2, (U.y0 + U.y1) / 2, D + 2.9, scene, false, false);
      const gr = new THREE.Group(); gr.position.set(U.x1 + 0.8, 0.03, Z(4.9)); gr.rotation.set(-Math.PI / 2, 0, 0.5); scene.add(gr);
      const gm = M({ color: 0x3a3c40, metalness: 0.6, roughness: 0.5 });
      for (let i = 0; i < 6; i++) put(boxGeo(0.03, 0.75, 0.03, 1), gm, -0.45 + i * 0.18, 0, 0, gr);
    }

    // faces in frames, scratched out; the hall's own dark
    const faceArt = (k) => ctex(128, 160, (c, w, h) => {
      c.fillStyle = ["#3a3428", "#2a3030", "#342a2a"][k]; c.fillRect(0, 0, w, h);
      const g = c.createRadialGradient(w / 2, h * 0.4, 5, w / 2, h * 0.4, 70); g.addColorStop(0, "#7a6a50"); g.addColorStop(1, "#201a14"); c.fillStyle = g; c.fillRect(10, 10, w - 20, h - 20);
      c.fillStyle = "#1a1410"; c.beginPath(); c.ellipse(w / 2, h * 0.38, 26, 32, 0, 0, 7); c.fill(); c.fillRect(w / 2 - 34, h * 0.55, 68, h * 0.45);
      c.strokeStyle = "rgba(220,210,190,.5)"; c.lineWidth = 2;
      for (let i = 0; i < 14; i++) { c.beginPath(); const x = w / 2 + (R() - 0.5) * 40, y = h * 0.38 + (R() - 0.5) * 40; c.moveTo(x, y); c.lineTo(x + (R() - 0.5) * 30, y + (R() - 0.5) * 30); c.stroke(); }
    }, false);
    [[5.0, 6.8, -0.04], [14.0, 7.4, 0.05], [29.0, 6.9, -0.06]].forEach(([x, y, tilt], k) => {
      const f = put(boxGeo(1.5, 1.9, 0.08, 1), M({ map: darkWoodT }), x, y, D - 0.05); f.rotation.z = tilt;
      const a = put(keep(new THREE.PlaneGeometry(1.2, 1.55)), M({ map: faceArt(k), roughness: 0.6 }), x, y, D - 0.1, scene, false); a.rotation.z = tilt;
    });
    const webM = keep(new THREE.MeshBasicMaterial({ map: webT, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    for (const [x, y, z, ry, rz, sz] of [[0.02, 8.5, 5.9, Math.PI / 2, -Math.PI / 2, 2.0], [12.5, 1.13, 5.75, 0, Math.PI, 0.8], [28.0, 2.48, 5.85, 0, Math.PI, 0.9]]) {
      const g = keep(new THREE.PlaneGeometry(sz, sz)); g.translate(sz / 2, -sz / 2, 0);
      put(g, webM, x, y, z, scene, false, false).rotation.set(0, ry, rz);
    }

    // the grandfather clock: a tall case, a face, a pendulum behind glass
    function gclock(s) {
      const w = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, front = s.z0;
      put(boxGeo(w, s.y1 - 0.4, s.z1 - s.z0, 1.5), mDark, cx, (s.y1 - 0.4) / 2, cz);
      put(boxGeo(w + 0.2, 0.5, s.z1 - s.z0 + 0.15, 1.5), mWood, cx, s.y1 - 0.2, cz);
      const faceT = ctex(128, 128, (c, ww) => {
        c.fillStyle = "#c8bc98"; c.beginPath(); c.arc(64, 64, 60, 0, 7); c.fill();
        c.fillStyle = "#2a1e14"; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.fillRect(64 + Math.cos(a) * 50 - 2, 64 + Math.sin(a) * 50 - 2, 4, 4); }
        c.strokeStyle = "#1a120c"; c.lineWidth = 4; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 22); c.moveTo(64, 64); c.lineTo(92, 70); c.stroke();
        void ww;
      }, false);
      put(keep(new THREE.CircleGeometry(0.55, 24)), M({ map: faceT, roughness: 0.6 }), cx, s.y1 - 1.4, front - 0.01, scene, false);
      put(keep(new THREE.TorusGeometry(0.58, 0.05, 6, 24)), brass, cx, s.y1 - 1.4, front - 0.02);
      // the glass over the pendulum, and the pendulum itself
      put(keep(new THREE.PlaneGeometry(w - 0.5, 3.2)), keep(new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.55 })), cx, 3.0, front - 0.02, scene, false);
      gPend = new THREE.Group(); gPend.position.set(cx, 4.4, Z(front + 0.1)); scene.add(gPend);
      put(boxGeo(0.03, 2.4, 0.02, 1), brass, 0, -1.2, 0, gPend);
      put(keep(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16)), brass, 0, -2.4, 0, gPend).rotation.x = Math.PI / 2;
    }

    // ── lights: three sconces, the red far back, a cold fill from above for shadows ──
    const sconces = [];
    for (const x of [6.5, 15.6, 38.6]) {
      const y = 5.4, z = D - 0.15;
      put(boxGeo(0.12, 0.5, 0.12, 1), brass, x, y - 0.3, z);
      put(boxGeo(0.1, 0.1, 0.5, 1), brass, x, y - 0.1, z - 0.25);
      put(keep(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 8)), M({ color: 0xe8dcc0, emissive: 0x3a2008 }), x, y + 0.1, z - 0.45);
      const fl = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowT, color: 0xffb050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
      fl.position.set(x, y + 0.33, Z(z - 0.45)); fl.scale.set(0.12, 0.24, 1); scene.add(fl);
      const ha = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowT, color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3 })));
      ha.position.copy(fl.position); ha.scale.set(1.3, 1.3, 1); scene.add(ha);
      const L = new THREE.PointLight(0xffa858, 1.3, 9, 2); L.position.set(x, y + 0.4, Z(z - 0.8)); scene.add(L);
      sconces.push({ fl, ha, L, ph: R() * 10 });
    }
    const fill = new THREE.DirectionalLight(0x7080a8, 0.35);
    fill.position.set(18, 16, Z(-8)); fill.target.position.set(22, 0, Z(3)); scene.add(fill, fill.target);
    Object.assign(fill.shadow.camera, { left: -26, right: 26, top: 14, bottom: -14, near: 1, far: 50 });
    fill.shadow.bias = -0.0008; fill.shadow.normalBias = 0.02;

    function applyQ(Q) {
      fill.castShadow = Q > 0;
      if (fill.shadow.map) { fill.shadow.map.dispose(); fill.shadow.map = null; }
      fill.shadow.mapSize.set(Q > 1 ? 2048 : 1024, Q > 1 ? 1024 : 512);
    }
    function ambient(T, t) {
      for (const s of sconces) {
        const f = 0.85 + Math.sin(t * 8 + s.ph) * 0.06 + Math.sin(t * 21 + s.ph) * 0.04 + (FR() - 0.5) * 0.08;
        s.L.intensity = 1.3 * f; s.fl.scale.set(0.12, 0.24 * f, 1); s.ha.material.opacity = 0.28 * f;
      }
      lair.intensity = 0.8 + Math.sin(t * 0.7) * 0.15 + Math.sin(t * 2.3) * 0.05;
      if (gPend) gPend.rotation.z = Math.sin(T * Math.PI * 0.5) * 0.12;     // a slow two-second beat
      for (const c of coats) c.g.rotation.set(Math.sin(t * 0.6 + c.ph) * 0.012 + c.sway, 0, Math.sin(t * 0.4 + c.ph) * 0.01);
    }
    // the coats stir when the kid brushes through them
    function near(P, dt) {
      for (const c of coats) {
        const dx = P.x - c.g.position.x, dz = P.z + c.g.position.z;
        const hit = Math.hypot(dx, dz) < 0.9 && P.speed > 0.2 ? 0.05 : 0;
        c.sway += (hit * Math.sign(P.vx || 1) - c.sway) * (1 - Math.exp(-dt * 3));
      }
    }
    return { applyQ, ambient, near };
  }


  kit.webT = webT;
  const dress = { hall: dressHall, nursery: dressNursery, workshop: () => dressWorkshop(kit), gallery: () => dressGallery(kit),
    stairwell: () => dressStairwell(kit), tower: () => dressTower(kit) }[room.name]();

  // ── quality ──
  let Q = quality;
  function applyQ() {
    rd.setPixelRatio(Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][Q]));
    rd.shadowMap.enabled = Q > 0;
    dress.applyQ(Q);
    scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.needsUpdate = true; }); } });
    resize();
  }
  function resize() {
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    cam.aspect = w / h;
    // a narrow (upright) screen sees less of the room across: pull back a little
    cam.fov = w / h < 1.2 ? 46 : 34;
    cam.updateProjectionMatrix(); rd.setSize(w, h, false);
    cv.style.width = "100%"; cv.style.height = "100%";
  }
  applyQ();

  // ── the camera ──
  const camP = new THREE.Vector3(), camL = new THREE.Vector3();
  let lead = 0, camInit = false, low = 0, big = 0, lift = 0;
  // under something (the cot, the table) and crouched: the camera drops to look in under it
  // near: how close the Keeper is (0..1): the camera eases back and up to show all of it
  // up: something high up the camera must look up at (the Cuckoo on its neck)
  function follow(P, dt, snap, under, near = 0, up = 0) {
    big += (near - big) * (snap ? 1 : 1 - Math.exp(-dt * 1.4));
    lift += (up - lift) * (snap ? 1 : 1 - Math.exp(-dt * 1.2));
    const k = snap ? 1 : 1 - Math.exp(-dt * 3.4), ky = snap ? 1 : 1 - Math.exp(-dt * 2.4);
    lead += ((P.vx || 0) * 0.35 - lead) * (1 - Math.exp(-dt * 1.5));
    low += ((P.st === "ground" && P.crouch && under ? 1 : 0) - low) * (snap ? 1 : 1 - Math.exp(-dt * 2.2));
    const half = cam.aspect < 1.2 ? 3.0 : 5.0;
    const tx = cl(P.x + lead, half, room.w - half + 0.4), ty = cl(P.y + 1.3 - 0.75 * low + 1.3 * big + 1.5 * lift, 0.6, room.camMaxY || 8.2), tz = -7.4 + P.z * 0.3 + 1.2 * low - 2.2 * big - 5.0 * lift;
    camP.x += (tx - camP.x) * k; camP.y += (ty + 1.4 - 0.9 * low - camP.y) * ky; camP.z += (tz - camP.z) * k;
    camL.x += (tx - camL.x) * k; camL.y += (ty - camL.y) * ky; camL.z += (P.z * 0.55 + 1.6 - camL.z) * k;
    cam.position.set(camP.x, camP.y, Z(camP.z));
    cam.lookAt(camL.x, camL.y, Z(camL.z));
  }

  // the room's own life, on the run's clock T (t is wall time, for flicker)
  function ambient(T, t, dt, wound, S) {
    dress.ambient(T, t, dt, wound, S);
    // the mist creeps
    for (const m of mists) m.t.offset.x = t * m.sp;
    stepFx(dt);
  }

  // what happened this frame, for the dust and the rings
  function event(e) {
    if (e.n === "land" && e.v > 3) puff(e.x, e.y, e.z, e.v > 6 ? 5 : 3, 0.25 + e.v * 0.03);
    else if (e.n === "hardLand" || e.n === "tumble") puff(e.x, e.y, e.z, 7, 0.6);
    else if (e.n === "step" && e.mat === "water") ring(e.x, e.z, 0.7);
    else if (e.n === "bump") puff(e.x, e.y + 0.3, e.z, 3, 0.3);
    if (dress.event) dress.event(e);
  }

  let dragDust = 0, keeper = null;

  // ── friends, playing together: the same kid in other colours, their name over them ──
  const FRIEND_LOOK = { jumper: 0x2e6a52, hat: 0x4a6ab0, scarf: 0xb0703a, trousers: 0x2a2a30 };
  const friendRigs = new Map();
  function nameTag(name) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 64;
    const g = c.getContext("2d");
    g.font = "italic 30px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "#000"; g.shadowBlur = 8; g.fillStyle = "#e6dcc4"; g.fillText(String(name || "Friend").slice(0, 16), 128, 34);
    const tx = keep(new THREE.CanvasTexture(c)); tx.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, opacity: 0.85 })));
    sp.scale.set(1.6, 0.4, 1); sp.renderOrder = 5;
    return sp;
  }
  function drawFriends(S, dt, t) {
    const live = new Set();
    for (const f of S.friends || []) {
      if (!f.here || f.roomI !== S.roomI || f.out || f.x == null) continue;
      live.add(f.id);
      let r = friendRigs.get(f.id);
      if (!r) {
        const k = createKid(THREE, FRIEND_LOOK); scene.add(k.root, k.scarf);
        const tag = nameTag(f.name); scene.add(tag);
        const b = blob.clone(); b.material = blob.material.clone(); keep(b.material); scene.add(b);
        r = { k, tag, b, x: f.x, y: f.y, z: f.z };
        friendRigs.set(f.id, r);
      }
      // eased toward where their phone last said (a jump across the room is just taken)
      const far = Math.hypot(f.x - r.x, f.y - r.y, f.z - r.z) > 2.5, kk = far ? 1 : 1 - Math.exp(-dt * 14);
      r.x += (f.x - r.x) * kk; r.y += (f.y - r.y) * kk; r.z += (f.z - r.z) * kk;
      let at = null;
      if (S.caught && S.caught.who === f.id && keeper && keeper.grabbing() > 0.45) { const h = keeper.handAt(); at = { x: h.x, y: h.y - 0.75, z: h.z }; }
      r.k.update({ ...f, x: r.x, y: r.y, z: r.z, speed: f.speed || 0, stride: f.stride || 0 }, dt, t, at);
      const hx = at ? at.x : r.x, hy = at ? at.y : r.y, hz = at ? at.z : r.z;
      r.tag.position.set(hx, hy + (f.crouch ? 1.15 : 1.5), Z(hz));
      const gy = groundUnder(r.x, r.z, r.y);
      r.b.position.set(r.x, gy + 0.012, Z(r.z)); r.b.visible = !at && gy > -0.5 && f.st !== "hang";
      r.b.material.opacity = cl(0.8 - (r.y - gy) * 0.12, 0.15, 0.8);
    }
    for (const [id, r] of friendRigs) { const on = live.has(id); r.k.root.visible = on; r.k.scarf.visible = on; r.tag.visible = on; if (!on) r.b.visible = false; }
  }
  function frame(S, dt, t) {
    const P = S.P;
    const under = covered(S);
    // something huge close by (the Keeper, the Cuckoo out of its clock): the camera eases back to show it
    const near = Math.max(S.K ? (S.caught ? 1 : cl(1 - (Math.hypot(S.K.x - P.x, S.K.z - P.z) - 3) / 7, 0, 1)) : 0, dress.camNear ? dress.camNear(S) : 0);
    const up = dress.camLift ? dress.camLift(S) : 0;
    if (!camInit) { follow(P, dt, true, under, near, up); camInit = true; }
    follow(P, dt, false, under, near, up);
    // a slight drift, as if held
    cam.position.x += Math.sin(t * 0.31) * 0.03; cam.position.y += Math.sin(t * 0.43) * 0.025;

    // the Keeper, if this room has one
    let held = null;
    if (S.K) {
      if (!keeper) { keeper = createKeeper(THREE); scene.add(keeper.root); }
      keeper.update(S.K, dt, t, P);
      // caught by it (this kid, not a friend): the kid hangs from its hand
      if (S.caught && S.caught.by !== "cuckoo" && (S.caught.who == null || S.caught.who === S.me) && keeper.grabbing() > 0.45) { const h = keeper.handAt(); held = { x: h.x, y: h.y - 0.75, z: h.z }; }
    } else if (keeper) { scene.remove(keeper.root); keeper.dispose(); keeper = null; }
    // a room's own monster may hold the kid (the Cuckoo, by its beak)
    if (!held && dress.holdKid && (S.caught == null || S.caught.who == null || S.caught.who === S.me)) held = dress.holdKid(S);
    kid.update(P, dt, t, held);
    // through the exit and waiting: out of the room
    kid.root.visible = kid.scarf.visible = !S.out;
    drawFriends(S, dt, t);
    keyL.position.set(P.x - 0.4, P.y + 1.6, Z(P.z - 1.6));
    const j = kid.jarAt(); jarL.position.set(j.x, j.y + 0.05, j.z + 0.1);
    jarL.intensity = 1.0 + Math.sin(t * 3.1) * 0.12 + Math.sin(t * 7.3) * 0.05;
    const gy = groundUnder(P.x, P.z, P.y);
    const hgt = P.y - gy;
    blob.position.set(P.x, gy + 0.012, Z(P.z));
    blob.scale.setScalar(cl(1 - hgt * 0.15, 0.4, 1) * (P.crouch ? 1.15 : 1));
    blob.material.opacity = cl(0.8 - hgt * 0.12, 0.15, 0.8);
    blob.visible = gy > -0.5 && P.st !== "hang" && P.st !== "caught";

    for (const mv of movers) { mv.m.position.set((mv.s.x0 + mv.s.x1) / 2, (mv.s.y0 + mv.s.y1) / 2, Z((mv.s.z0 + mv.s.z1) / 2)); mv.m.visible = !mv.s.gone; }
    // the block kicks up dust along the floor as it goes
    if (P.st === "drag" && P.speed > 0.15 && P.drag) {
      dragDust -= dt;
      if (dragDust <= 0) { dragDust = 0.18; const b = P.drag.b; puff((b.x0 + b.x1) / 2 - P.drag.nx * 0.6, 0, (b.z0 + b.z1) / 2 - P.drag.nz * 0.6, 1, 0.35); }
    }
    S.items.forEach((it, i) => {
      if (!itemMeshes[i]) { itemMeshes[i] = makeItem(it.kind); itemMeshes[i].userData.roll = 0; }
      const g = itemMeshes[i];
      g.position.set(it.x, it.y + it.r, Z(it.z));
      if (it.held) g.rotation.set(0, P.face, Math.PI / 2);
      else if (!it.rest) { g.userData.roll += Math.hypot(it.vx, it.vz) * dt / it.r; g.rotation.set(g.userData.roll, Math.atan2(it.vz, it.vx), Math.PI / 2); }
    });
    if (dress.near) dress.near(P, dt);
    ambient(S.T, t, dt, S.box ? S.box.wound : 0, S);
    rd.render(scene, cam);
  }

  // the title's backdrop: the room alone, the camera slowly crossing it
  const titleP = { x: 8, y: 0, z: 2, vx: 0, st: "ground", face: 0, speed: 0, stride: 0 };
  function title(S, dt, t) {
    titleP.x = 9 + Math.sin(t * 0.05) * 6; titleP.y = 1.5; titleP.z = 2;
    follow(titleP, dt, !camInit, false); camInit = true;
    kid.update(S.P, dt, t);
    const j = kid.jarAt(); jarL.position.set(j.x, j.y + 0.05, j.z + 0.1);
    ambient(t, t, dt, 1);
    rd.render(scene, cam);
  }

  // where the camera is, in the rules' axes: the ears are there
  const camAt = { x: 0, y: 0, z: 0 };
  function camPos() { camAt.x = cam.position.x; camAt.y = cam.position.y; camAt.z = -cam.position.z; return camAt; }

  function reset() { camInit = false; }
  function setQuality(q) { Q = q; applyQ(); }
  function dispose() {
    kid.dispose();
    for (const r of friendRigs.values()) r.k.dispose();
    if (keeper) keeper.dispose();
    disposables.forEach((d) => d.dispose && d.dispose());
    itemMeshes.length = 0;
    rd.dispose();
    cv.remove();
  }
  return { frame, title, event, camPos, resize, setQuality, reset, dispose };
}
