// src/components/horror/s13Audio.js
// The sounds of STATION 13, all synthesised — no files. A low drone that
// swells as it gets closer (and cuts out, the silence before, when it's
// right on you and not yet chasing); the monster's footsteps, breathing and
// whispers placed in 3D where it is; a heartbeat that quickens with the
// tension; and the short sounds for what happens.
//
// The building itself, too: everything rings in a big concrete hall (a
// reverb made here, no file); the fluorescent tubes hum and crackle where the
// power's on; water drips somewhere near; pipes groan far off; now and then
// the PA crackles with an announcement nobody can make out. While something
// hunts you a chase theme pulses under it all. In a locker the world goes
// muffled and your own breath is loud. The power coming back, the elevator
// opening, being seen, being caught: each has its own sound.
//
// Must be started from a tap (browsers keep audio locked until then), and
// closed when the page goes, or the drone keeps playing over the rest of the
// app. Follows the one mute every game shares (sfx.js).
import sfx from "../games/sfx";

const S = 3;
export function createS13Audio() {
  let AC = null, out = null, mg = null, dr = null, wet = null, muff = null, hum = null, humTone = null, chase = null;
  const R = Math.random;                       // what you hear: cosmetic, never the game
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  let unsub = null;

  // a big empty hall: noise that dies away over ~2.4 s, a little different each ear
  function hallVerb() {
    const len = (AC.sampleRate * 2.4) | 0, b = AC.createBuffer(2, len, AC.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const a = b.getChannelData(ch);
      for (let i = 0; i < len; i++) a[i] = (R() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < 40 ? i / 40 : 1);
    }
    const cv = AC.createConvolver(); cv.buffer = b;
    return cv;
  }

  function start() {
    if (AC) { if (AC.state === "suspended") AC.resume().catch(() => {}); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      // out ← muff (the locker's muffle) ← mg (everything) and ← wet (the hall's ring)
      out = AC.createGain(); out.gain.value = sfx.muted() ? 0 : 1; out.connect(AC.destination);
      muff = AC.createBiquadFilter(); muff.type = "lowpass"; muff.frequency.value = 18000; muff.connect(out);
      mg = AC.createGain(); mg.gain.value = 0.8; mg.connect(muff);
      const verb = hallVerb(); wet = AC.createGain(); wet.gain.value = 0.32; mg.connect(verb); verb.connect(wet); wet.connect(muff);
      // the drone
      const lp = AC.createBiquadFilter(); lp.frequency.value = 160; lp.connect(mg);
      dr = AC.createGain(); dr.gain.value = 0.25; dr.connect(lp);
      [55, 58.3, 82.4].forEach((f) => { const o = AC.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(dr); o.start(); });
      const l = AC.createOscillator(), lg = AC.createGain(); l.frequency.value = 0.07; lg.gain.value = 0.12; l.connect(lg); lg.connect(dr.gain); l.start();
      // the room's own tone: a low rumble of air in the vents
      const rn = noiseLoop(4), rlp = AC.createBiquadFilter(), rg = AC.createGain();
      rlp.type = "lowpass"; rlp.frequency.value = 220; rg.gain.value = 0.05; rn.connect(rlp); rlp.connect(rg); rg.connect(mg); rn.start();
      // the tubes' hum (up where the power's on): 100 Hz and its buzz
      hum = AC.createGain(); hum.gain.value = 0; hum.connect(mg);
      humTone = AC.createOscillator(); humTone.type = "square"; humTone.frequency.value = 100;
      const hb = AC.createBiquadFilter(); hb.type = "bandpass"; hb.frequency.value = 300; hb.Q.value = 3;
      humTone.connect(hb); hb.connect(hum); humTone.start();
      // the chase theme: two detuned low saws, a pulse on them, silent until something hunts you
      chase = AC.createGain(); chase.gain.value = 0; chase.connect(mg);
      const pulse = AC.createGain(); pulse.gain.value = 0.6; pulse.connect(chase);
      [41.2, 43.65, 87.3].forEach((f) => { const o = AC.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; const f2 = AC.createBiquadFilter(); f2.frequency.value = 420; o.connect(f2); f2.connect(pulse); o.start(); });
      const pl = AC.createOscillator(), pg = AC.createGain(); pl.type = "square"; pl.frequency.value = 2.6; pg.gain.value = 0.45; pl.connect(pg); pg.connect(pulse.gain); pl.start();
    } catch (e) { AC = null; return; }
    if (!unsub) unsub = sfx.onMute((m) => { if (out) out.gain.value = m ? 0 : 1; });
  }
  function noiseLoop(secs) {
    const n = (AC.sampleRate * secs) | 0, b = AC.createBuffer(1, n, AC.sampleRate), a = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (R() * 2 - 1)) / 1.02; a[i] = last * 3.5; }   // brown-ish
    const s = AC.createBufferSource(); s.buffer = b; s.loop = true;
    return s;
  }
  function tn(f, d, v, t, f2, dst, at = 0) {
    if (!AC) return;
    const o = AC.createOscillator(), g = AC.createGain(), T = AC.currentTime + at;
    o.type = t || "sine"; o.frequency.setValueAtTime(f, T); if (f2) o.frequency.exponentialRampToValueAtTime(f2, T + d);
    g.gain.setValueAtTime(v, T); g.gain.exponentialRampToValueAtTime(0.001, T + d);
    o.connect(g); g.connect(dst || mg); o.start(T); o.stop(T + d);
  }
  function nz(d, v, f, q, dst) {
    if (!AC) return;
    const n = (AC.sampleRate * d) | 0, b = AC.createBuffer(1, n, AC.sampleRate), a = b.getChannelData(0);
    for (let i = 0; i < n; i++) a[i] = (R() * 2 - 1) * (1 - i / n);
    const s = AC.createBufferSource(), g = AC.createGain(), fl = AC.createBiquadFilter();
    fl.type = q ? "bandpass" : "lowpass"; fl.frequency.value = f || 800; if (q) fl.Q.value = typeof q === "number" ? q : 1;
    s.buffer = b; g.gain.value = v;
    s.connect(fl); fl.connect(g); g.connect(dst || mg); s.start();
  }
  // a sound from a place in the building (HRTF), for a couple of seconds
  function pan(x, y) {
    if (!AC) return null;
    const p = AC.createPanner(); p.panningModel = "HRTF"; p.distanceModel = "inverse"; p.refDistance = 3; p.rolloffFactor = 1.3; p.maxDistance = 80;
    if (p.positionX) { p.positionX.value = x * S; p.positionY.value = 1.5; p.positionZ.value = y * S; } else p.setPosition(x * S, 1.5, y * S);
    p.connect(mg); later(() => { try { p.disconnect(); } catch (e) { /* gone */ } }, 3000);
    return p;
  }
  const SFX = {
    step: () => nz(0.09, 0.12, 500), stepRun: () => nz(0.09, 0.22, 500),
    beat: (v) => { tn(60, 0.14, 0.5 * v, "sine", 35); later(() => tn(52, 0.16, 0.35 * v, "sine", 30), 170); },
    pick: () => tn(520, 0.2, 0.15, "triangle", 780), click: () => nz(0.03, 0.2, 3000, 1),
    bang: () => { tn(70, 0.5, 0.5, "square", 30); nz(0.4, 0.4, 300); },
    whisper: () => { for (let i = 0; i < 4; i++) later(() => nz(0.35, 0.08, 1200 + R() * 1800, 1), i * 300); },
    growl: () => { tn(80, 1.2, 0.35, "sawtooth", 35); tn(83, 1.2, 0.3, "sawtooth", 38); },
    scream: () => { tn(900, 1.2, 0.35, "sawtooth", 1800); tn(1300, 1.2, 0.3, "square", 700); nz(1.2, 0.6, 2500); tn(45, 1.6, 0.6, "sine", 25); },
    alarm: () => { for (let i = 0; i < 6; i++) later(() => tn(i % 2 ? 600 : 800, 0.3, 0.2, "square"), i * 350); },
    door: () => { tn(100, 0.8, 0.3, "sawtooth", 60); nz(0.6, 0.3, 400); },
    locker: () => { nz(0.2, 0.35, 700); tn(120, 0.2, 0.2, "square", 80); },
    win: () => { tn(440, 1.5, 0.2, "sine", 880); },
    battery: () => tn(660, 0.3, 0.15, "square", 990),
    // the power coming back: a generator spinning up, the lights clunking on
    power: () => { tn(38, 2.2, 0.32, "sawtooth", 118); nz(0.25, 0.4, 260); later(() => { nz(0.12, 0.5, 1800, 2); tn(160, 0.3, 0.2, "square", 90); }, 900); later(() => nz(0.12, 0.35, 2200, 2), 1250); },
    // the elevator: a ding, then its hum
    elevator: () => { tn(1320, 1.4, 0.18, "sine"); tn(1046, 1.6, 0.16, "sine", null, null, 0.35); tn(55, 3, 0.15, "sine", 60); },
    // being seen: a stab of strings over the growl
    stab: () => { [740, 784, 1047, 1109].forEach((f) => tn(f, 0.9, 0.09, "sawtooth", f * 0.97)); nz(0.5, 0.25, 3400, 2); },
    // being caught: a deep boom under the scream
    boom: () => { tn(42, 2.2, 0.7, "sine", 22); nz(1.4, 0.5, 120); },
  };
  let stepM = 0, brM = 2, whT = 3, beatT = 0, brT = 0;
  let dripT = 2 + R() * 3, groanT = 10 + R() * 10, paT = 35 + R() * 25, crackT = 1, myBrT = 0;
  let wasHid = false;

  // the PA: a ding-dong, then a voice through a bad speaker that can't be made out
  function announce(near) {
    const p = near ? pan(near.x, near.y) : null;
    tn(784, 0.5, 0.12, "sine", null, p); tn(622, 0.7, 0.12, "sine", null, p, 0.45);
    for (let i = 0; i < 9; i++) later(() => { nz(0.16 + R() * 0.12, 0.09, 700 + R() * 900, 6, p); }, 1100 + i * (170 + R() * 90));
    later(() => nz(0.25, 0.08, 2600, 1, p), 2900);
  }

  return {
    start,
    // an event from the game: { name, x?, y? }
    play(e) {
      if (!AC || !e) return;
      if (e.name === "bangAt") { const p = pan(e.x, e.y); tn(70, 0.5, 0.5, "square", 30, p); nz(0.4, 0.5, 300, 0, p); return; }
      if (e.name === "creakAt") { const p = pan(e.x, e.y); tn(180, 0.9, 0.15, "sawtooth", 90, p); tn(70, 1.4, 0.1, "square", 55, p); return; }
      if (e.name === "growl") SFX.stab();
      if (e.name === "scream") SFX.boom();
      if (e.name === "alarm") SFX.elevator();
      const fn = SFX[e.name]; if (fn) fn(e.v);
    },
    // every frame: where you are and which way you face, the monsters, the
    // tension; and (more) whether you stand where the power's on, the flicker
    tick(dt, P, monsters, tlv, playing, more = {}) {
      if (!AC) return;
      const L = AC.listener, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), cx = P.x * S, cz = P.y * S;
      if (L.positionX) { L.positionX.value = cx; L.positionY.value = 1.7; L.positionZ.value = cz; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
      else { L.setPosition(cx, 1.7, cz); L.setOrientation(fx, 0, fz, 0, 1, 0); }
      let near = null, nd = Infinity, chasing = false;
      for (const M of monsters) {
        if (M.st === "sleep") continue;
        const d = Math.hypot(P.x - M.x, P.y - M.y);
        if (d < nd) { nd = d; near = M; }
        if (M.st === "chase" || M.st === "rear" || M.st === "lunge") chasing = true;
      }
      const dg = near ? Math.max(0, 1 - nd / 9) * (near.st === "chase" ? 1 : 0.55) : 0;
      if (dr) { const tg = playing && tlv === 4 && near && near.st !== "chase" ? 0.015 : 0.2 + dg * 0.3; dr.gain.value += (tg - dr.gain.value) * 0.06; }
      // in a locker: the world muffled
      const hid = !!P.hid;
      if (muff) muff.frequency.value += ((hid ? 520 : 18000) - muff.frequency.value) * Math.min(1, dt * (hid ? 6 : 2));
      if (hid !== wasHid) { wasHid = hid; if (hid) myBrT = 0.4; }
      // the tubes: hum where the power's on, crackling while they flicker
      const lit = !!more.lit, flick = more.flick || 0;
      if (hum) hum.gain.value += ((playing && lit ? 0.022 : 0) - hum.gain.value) * Math.min(1, dt * 2);
      if (playing && lit && flick > 0) { crackT -= dt; if (crackT <= 0) { crackT = 0.06 + R() * 0.12; nz(0.04, 0.12, 4000, 2); } }
      // the chase theme: up while something hunts you, slowly away after
      if (chase) chase.gain.value += ((playing && chasing ? 0.16 : 0) - chase.gain.value) * Math.min(1, dt * (chasing ? 1.5 : 0.35));
      if (!playing) return;
      // the building: drips, far-off groans, the PA now and then
      dripT -= dt;
      if (dripT <= 0) {
        dripT = 2.5 + R() * 5;
        const a = R() * Math.PI * 2, r = 3 + R() * 6, p = pan(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r);
        tn(1500 + R() * 900, 0.12, 0.12, "sine", 600 + R() * 300, p);
      }
      groanT -= dt;
      if (groanT <= 0) {
        groanT = 14 + R() * 18;
        const a = R() * Math.PI * 2, p = pan(P.x + Math.cos(a) * 14, P.y + Math.sin(a) * 14);
        tn(70 + R() * 40, 2.4, 0.18, "sawtooth", 45 + R() * 20, p); nz(1.6, 0.12, 500, 0, p);
      }
      paT -= dt;
      if (paT <= 0) { paT = 45 + R() * 40; if (!chasing) announce(null); }
      // your own breathing: loud in a locker
      if (hid) { myBrT -= dt; if (myBrT <= 0) { myBrT = 1.6 + tlv * -0.2; nz(0.7, 0.16 + tlv * 0.04, 650, 2); } }
      beatT -= dt; if (tlv >= 1 && beatT <= 0) { beatT = 1.3 - tlv * 0.22; SFX.beat(0.25 + tlv * 0.22); }
      if (P.tired || P.stam < 0.25) { brT -= dt; if (brT <= 0) { brT = 1.1; nz(0.45, 0.07, 600); } }
      if (!near || nd > 24) return;
      stepM -= dt; if (near.moving && stepM <= 0) { stepM = near.st === "chase" ? 0.28 : 0.55; const p = pan(near.x, near.y); nz(0.12, 0.9, 260, 0, p); tn(58, 0.18, 0.7, "sine", 38, p); }
      if (tlv >= 2) { brM -= dt; if (brM <= 0) { brM = near.st === "chase" ? 0.9 : 1.9; nz(0.8, 0.5, 900, 1, pan(near.x, near.y)); } }
      if (tlv >= 1) { whT -= dt; if (whT <= 0) { whT = 3 + R() * 5; const p = pan(near.x, near.y); for (let i = 0; i < 3; i++) later(() => nz(0.35, 0.25, 1300 + R() * 1500, 1, p), i * 260); } }
    },
    close() {
      timers.forEach(clearTimeout); timers.clear();
      if (unsub) { unsub(); unsub = null; }
      if (AC) { try { AC.close(); } catch (e) { /* closed */ } }
      AC = null; out = null; mg = null; dr = null; wet = null; muff = null; hum = null; humTone = null; chase = null;
    },
  };
}
