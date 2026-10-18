// src/components/horror/s13Audio.js
// The sounds of STATION 13, all synthesised — no files. A low drone that
// swells as it gets closer (and cuts out, the silence before, when it's
// right on you and not yet chasing); the monster's footsteps, breathing and
// whispers placed in 3D where it is; a heartbeat that quickens with the
// tension; and the short sounds for what happens.
//
// Must be started from a tap (browsers keep audio locked until then), and
// closed when the page goes, or the drone keeps playing over the rest of the app.
const S = 3;
export function createS13Audio() {
  let AC = null, mg = null, dr = null;
  const R = Math.random;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

  function start() {
    if (AC) { if (AC.state === "suspended") AC.resume().catch(() => {}); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      mg = AC.createGain(); mg.gain.value = 0.8; mg.connect(AC.destination);
      const lp = AC.createBiquadFilter(); lp.frequency.value = 160; lp.connect(mg);
      dr = AC.createGain(); dr.gain.value = 0.25; dr.connect(lp);
      [55, 58.3, 82.4].forEach((f) => { const o = AC.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(dr); o.start(); });
      const l = AC.createOscillator(), lg = AC.createGain(); l.frequency.value = 0.07; lg.gain.value = 0.12; l.connect(lg); lg.connect(dr.gain); l.start();
    } catch (e) { AC = null; }
  }
  function tn(f, d, v, t, f2, dst) {
    if (!AC) return;
    const o = AC.createOscillator(), g = AC.createGain(), T = AC.currentTime;
    o.type = t || "sine"; o.frequency.setValueAtTime(f, T); if (f2) o.frequency.exponentialRampToValueAtTime(f2, T + d);
    g.gain.setValueAtTime(v, T); g.gain.exponentialRampToValueAtTime(0.001, T + d);
    o.connect(g); g.connect(dst || mg); o.start(T); o.stop(T + d);
  }
  function nz(d, v, f, q, dst) {
    if (!AC) return;
    const n = (AC.sampleRate * d) | 0, b = AC.createBuffer(1, n, AC.sampleRate), a = b.getChannelData(0);
    for (let i = 0; i < n; i++) a[i] = (R() * 2 - 1) * (1 - i / n);
    const s = AC.createBufferSource(), g = AC.createGain(), fl = AC.createBiquadFilter();
    fl.type = q ? "bandpass" : "lowpass"; fl.frequency.value = f || 800; s.buffer = b; g.gain.value = v;
    s.connect(fl); fl.connect(g); g.connect(dst || mg); s.start();
  }
  // a sound from a place in the building (HRTF), for a couple of seconds
  function pan(x, y) {
    if (!AC) return null;
    const p = AC.createPanner(); p.panningModel = "HRTF"; p.distanceModel = "inverse"; p.refDistance = 3; p.rolloffFactor = 1.3; p.maxDistance = 80;
    if (p.positionX) { p.positionX.value = x * S; p.positionY.value = 1.5; p.positionZ.value = y * S; } else p.setPosition(x * S, 1.5, y * S);
    p.connect(mg); later(() => { try { p.disconnect(); } catch (e) { /* gone */ } }, 2500);
    return p;
  }
  const SFX = {
    step: () => nz(0.09, 0.12, 500), stepRun: () => nz(0.09, 0.22, 500),
    beat: (v) => { tn(60, 0.14, 0.5 * v, "sine", 35); later(() => tn(52, 0.16, 0.35 * v, "sine", 30), 170); },
    pick: () => tn(520, 0.2, 0.15, "triangle", 780), click: () => nz(0.03, 0.2, 3000, 1),
    bang: () => { tn(70, 0.5, 0.5, "square", 30); nz(0.4, 0.4, 300); },
    whisper: () => { for (let i = 0; i < 4; i++) later(() => nz(0.35, 0.08, 1200 + R() * 1800, 1), i * 300); },
    growl: () => { tn(80, 1.2, 0.35, "sawtooth", 35); tn(83, 1.2, 0.3, "sawtooth", 38); },
    scream: () => { tn(900, 1.2, 0.35, "sawtooth", 1800); tn(1300, 1.2, 0.3, "square", 700); nz(1.2, 0.6, 2500); },
    alarm: () => { for (let i = 0; i < 6; i++) later(() => tn(i % 2 ? 600 : 800, 0.3, 0.2, "square"), i * 350); },
    door: () => { tn(100, 0.8, 0.3, "sawtooth", 60); nz(0.6, 0.3, 400); },
    locker: () => { nz(0.2, 0.35, 700); tn(120, 0.2, 0.2, "square", 80); },
    win: () => { tn(440, 1.5, 0.2, "sine", 880); },
    battery: () => tn(660, 0.3, 0.15, "square", 990),
  };
  let stepM = 0, brM = 2, whT = 3, beatT = 0, brT = 0;
  return {
    start,
    // an event from the game: { name, x?, y? }
    play(e) {
      if (!AC || !e) return;
      if (e.name === "bangAt") { const p = pan(e.x, e.y); tn(70, 0.5, 0.5, "square", 30, p); nz(0.4, 0.5, 300, 0, p); return; }
      if (e.name === "creakAt") { const p = pan(e.x, e.y); tn(180, 0.9, 0.15, "sawtooth", 90, p); tn(70, 1.4, 0.1, "square", 55, p); return; }
      const fn = SFX[e.name]; if (fn) fn(e.v);
    },
    // every frame: where you are and which way you face, the monsters, the tension
    tick(dt, P, monsters, tlv, playing) {
      if (!AC) return;
      const L = AC.listener, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), cx = P.x * S, cz = P.y * S;
      if (L.positionX) { L.positionX.value = cx; L.positionY.value = 1.7; L.positionZ.value = cz; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
      else { L.setPosition(cx, 1.7, cz); L.setOrientation(fx, 0, fz, 0, 1, 0); }
      let near = null, nd = Infinity;
      for (const M of monsters) { if (M.st === "sleep") continue; const d = Math.hypot(P.x - M.x, P.y - M.y); if (d < nd) { nd = d; near = M; } }
      const dg = near ? Math.max(0, 1 - nd / 9) * (near.st === "chase" ? 1 : 0.55) : 0;
      if (dr) { const tg = playing && tlv === 4 && near && near.st !== "chase" ? 0.015 : 0.2 + dg * 0.3; dr.gain.value += (tg - dr.gain.value) * 0.06; }
      if (!playing) return;
      beatT -= dt; if (tlv >= 1 && beatT <= 0) { beatT = 1.3 - tlv * 0.22; SFX.beat(0.25 + tlv * 0.22); }
      if (P.tired || P.stam < 0.25) { brT -= dt; if (brT <= 0) { brT = 1.1; nz(0.45, 0.07, 600); } }
      if (!near || nd > 24) return;
      stepM -= dt; if (near.moving && stepM <= 0) { stepM = near.st === "chase" ? 0.28 : 0.55; const p = pan(near.x, near.y); nz(0.12, 0.9, 260, 0, p); tn(58, 0.18, 0.7, "sine", 38, p); }
      if (tlv >= 2) { brM -= dt; if (brM <= 0) { brM = near.st === "chase" ? 0.9 : 1.9; nz(0.8, 0.5, 900, 1, pan(near.x, near.y)); } }
      if (tlv >= 1) { whT -= dt; if (whT <= 0) { whT = 3 + R() * 5; const p = pan(near.x, near.y); for (let i = 0; i < 3; i++) later(() => nz(0.35, 0.25, 1300 + R() * 1500, 1, p), i * 260); } }
    },
    close() {
      timers.forEach(clearTimeout); timers.clear();
      if (AC) { try { AC.close(); } catch (e) { /* closed */ } }
      AC = null; mg = null; dr = null;
    },
  };
}
