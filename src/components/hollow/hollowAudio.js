// src/components/hollow/hollowAudio.js
// The sounds of HOLLOW HOURS, all synthesised — no files.
//
// Every sound comes from a place: events carry where they happened (in the
// rules' axes) and are heard through an HRTF panner from the camera, so a
// drip to the right is to the right and the clock is up on the wall.
//
// Layers, from the bottom:
//   the house    a low drone and a hum that never stop
//   the night    wind at the window (louder in a gust — hollowWeather's
//                gust(), the same one that moves the curtain), thunder after
//                each flash, drips into the puddle, the clock's tick
//   the house    now and then, far off: a creak overhead, knocking in the
//   settling     pipes, a door, something heavy set down
//   the music    the music box on the table, a slow waltz that slows and
//   box          sags out of tune as it runs down (wound by the kid)
//   the score    a low string pad that swells with tension (hanging, high up,
//                a long fall); a heartbeat under it when it's high; a soft
//                chord when you first see the room from the top
//   the kid      feet that sound like what they're on, breath, thumps,
//                scrapes, clatter
//   the Keeper   heavy feet that make the boards groan, its keys jangling at
//                each step; a wheezing breath that goes where it goes — and
//                stops while it listens; a low hum on its round; a sniff, a
//                grunt when it hears, a roar when it comes, a growl when it
//                gives up; drums and strings while it's after you; a
//                shriek of strings when it has you
// Under the cot or the table everything goes muffled (a low-pass on the
// master) and drier.
//
// Must be started from a tap (browsers keep audio locked until then) and
// closed when the page goes.
import { gust, flashAt, LP, THUNDER_DELAY, DRIP, DROP_FALL } from "./hollowWeather.mjs";

// the music box's tune: a waltz in A minor, three notes a bar (MIDI; 0 = rest)
const TUNE = [
  69, 72, 76, 81, 76, 72, 71, 74, 77, 83, 77, 74,
  68, 71, 76, 80, 76, 71, 69, 72, 76, 81, 0, 76,
  74, 77, 81, 77, 74, 72, 72, 76, 79, 76, 72, 71,
  69, 72, 76, 71, 68, 64, 69, 0, 0, 69, 0, 0,
];
// where each room's sounds come from: its clock, and the night (a window, or
// in the Hall only a far-off draught, much quieter)
const PLACES = {
  nursery: { clock: { x: 6.6, y: 7.6, z: 5.85 }, win: { x: 15, y: 7, z: 5.9 }, wind: 1 },
  hall: { clock: { x: 35.2, y: 5.6, z: 5.5 }, win: { x: 22, y: 10, z: 14 }, wind: 0.35 },
  // the Workshop: a whole wall of clocks, none agreeing
  workshop: { clock: { x: 16, y: 7, z: 5.8 }, win: { x: 17, y: 12, z: 14 }, wind: 0.2, chorus: true },
  // the Gallery: the cuckoo clock's heavy tock
  gallery: { clock: { x: 21, y: 5.2, z: 4.5 }, win: { x: 20, y: 12, z: 14 }, wind: 0.3, deep: 0.8 },
  // the Stairwell: no clock; a draught down it
  stairwell: { clock: null, win: { x: 25, y: 8, z: 10 }, wind: 0.55 },
  // the Bell Tower: the great clock, and the wind at its face
  tower: { clock: { x: 10, y: 10, z: 5.8 }, win: { x: 10, y: 12, z: 6.5 }, wind: 1.1, deep: 1 },
};
let WIN = PLACES.nursery.win;

export function createHollowAudio() {
  let AC = null, out = null, muff = null, wet = null, dry = null;
  let dragG = null, dragF = null, windG = null, windF = null, whistle = null, whistleG = null, windP = null, place = PLACES.nursery, placeName = "nursery";
  let padG = null, padF = null, droneG = null;
  let kP = null, kBreathG = null, kBreathF = null, kHumG = null, kHum = null, drumG = null;
  const R = Math.random;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  let muted = false;

  function impulse(sec, decay) {
    const n = (AC.sampleRate * sec) | 0, b = AC.createBuffer(2, n, AC.sampleRate);
    for (let c = 0; c < 2; c++) { const a = b.getChannelData(c); for (let i = 0; i < n; i++) a[i] = (R() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  function brown(sec) {
    const n = (AC.sampleRate * sec) | 0, b = AC.createBuffer(1, n, AC.sampleRate), a = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (R() * 2 - 1)) / 1.02; a[i] = last * 3.5; }
    return b;
  }
  function white(sec) {
    const n = (AC.sampleRate * sec) | 0, b = AC.createBuffer(1, n, AC.sampleRate), a = b.getChannelData(0);
    for (let i = 0; i < n; i++) a[i] = R() * 2 - 1;
    return b;
  }
  const loop = (buf, rate = 1) => { const s = AC.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(); return s; };
  const filt = (type, f, q) => { const x = AC.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q) x.Q.value = q; return x; };
  const gain = (v) => { const g = AC.createGain(); g.gain.value = v; return g; };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };

  // ── where a sound is ──
  // the rules' axes, turned for the ears: x right, y up, z toward the camera
  const setPos = (p, x, y, z) => {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = -z; } else p.setPosition(x, y, -z);
  };
  function panAt(x, y, z, life = 3000) {
    const p = AC.createPanner();
    p.panningModel = "HRTF"; p.distanceModel = "inverse"; p.refDistance = 7; p.rolloffFactor = 0.9; p.maxDistance = 60;
    setPos(p, x, y == null ? 0.5 : y, z == null ? 2.5 : z);
    p.connect(dry); p.connect(wet);
    if (life) later(() => { try { p.disconnect(); } catch (e) { /* gone */ } }, life);
    return p;
  }
  const at = (e) => panAt(e.x, (e.y || 0) + 0.3, e.z);

  function start() {
    if (AC) { if (AC.state === "suspended") AC.resume().catch(() => {}); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      out = gain(muted ? 0 : 0.9); out.connect(AC.destination);
      // the muffle (under furniture) sits over everything
      muff = filt("lowpass", 18000); muff.connect(out);
      dry = gain(1); dry.connect(muff);
      const verb = AC.createConvolver(); verb.buffer = impulse(2.2, 2.4);
      wet = gain(0.3); chain(wet, verb, muff);
      const bb = brown(5), wb = white(3);

      // the house: a low drone, beating slowly, and a hum
      droneG = gain(0); droneG.connect(muff);
      for (const f of [41.2, 41.7, 61.8]) { const o = AC.createOscillator(); o.frequency.value = f; chain(o, gain(f > 60 ? 0.12 : 0.3), droneG); o.start(); }
      chain(loop(bb), filt("lowpass", 160), gain(0.5), droneG);
      droneG.gain.linearRampToValueAtTime(0.35, AC.currentTime + 3);

      // the night at the window: wind, and a whistle through the frame
      const wp = panAt(WIN.x, WIN.y, WIN.z, 0); windP = wp;
      windF = filt("bandpass", 500, 1.2); windG = gain(0);
      chain(loop(bb, 1.8), windF, windG, wp);
      whistle = AC.createOscillator(); whistle.frequency.value = 900; whistleG = gain(0);
      chain(whistle, filt("bandpass", 900, 8), whistleG, wp); whistle.start();
      const hiss = gain(0.025); chain(loop(wb, 0.5), filt("highpass", 3000), hiss, wp);

      // the block's scrape: always running, turned up while it moves
      dragF = filt("bandpass", 320, 1.4); dragG = gain(0);
      chain(loop(bb, 2.5), dragF, dragG); dragG.connect(dry); dragG.connect(wet);

      // the Keeper's voice, wherever it is: a wheeze, and a hum
      kP = panAt(0, 4, 4, 0);
      kBreathF = filt("bandpass", 520, 2.2); kBreathG = gain(0);
      chain(loop(bb, 1.3), kBreathF, kBreathG, kP);
      kHum = AC.createOscillator(); kHum.type = "sawtooth"; kHum.frequency.value = 73; kHumG = gain(0);
      const hv = AC.createOscillator(), hvg = gain(1.5); hv.frequency.value = 4.5; chain(hv, hvg, kHum.frequency); hv.start();
      chain(kHum, filt("lowpass", 380, 2), kHumG, kP); kHum.start();
      // the chase: drums under everything (not placed: it's in your chest)
      drumG = gain(0); drumG.connect(muff);

      // the score: a low string pad, a minor chord, opening with tension
      padF = filt("lowpass", 300, 0.7); padG = gain(0);
      chain(padF, padG, muff);
      for (const [f, d] of [[110, -6], [110, 5], [130.8, -4], [164.8, 7], [55, 0]]) {
        const o = AC.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = d;
        const l = AC.createOscillator(), lg = gain(3); l.frequency.value = 0.15 + R() * 0.2; chain(l, lg, o.detune); l.start();
        chain(o, gain(0.06), padF); o.start();
      }
    } catch (e) { AC = null; }
  }

  function tn(f, d, v, type, f2, dst, when = 0) {
    if (!AC) return;
    const o = AC.createOscillator(), g = AC.createGain(), T = AC.currentTime + when;
    o.type = type || "sine"; o.frequency.setValueAtTime(f, T); if (f2) o.frequency.exponentialRampToValueAtTime(f2, T + d);
    g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(v, T + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, T + d);
    o.connect(g); g.connect(dst || dry); o.start(T); o.stop(T + d + 0.02);
  }
  function nz(d, v, f, type, q, dst, when = 0, f2, attack = 0) {
    if (!AC) return;
    const n = Math.max(1, (AC.sampleRate * d) | 0), b = AC.createBuffer(1, n, AC.sampleRate), a = b.getChannelData(0);
    const atk = Math.max(1, (attack * AC.sampleRate) | 0);
    for (let i = 0; i < n; i++) a[i] = (R() * 2 - 1) * Math.pow(1 - i / n, 2) * Math.min(1, i / atk);
    const s = AC.createBufferSource(), g = AC.createGain(), fl = AC.createBiquadFilter(), T = AC.currentTime + when;
    fl.type = type || "lowpass"; fl.frequency.setValueAtTime(f, T); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, T + d); if (q) fl.Q.value = q;
    s.buffer = b; g.gain.value = v;
    s.connect(fl); fl.connect(g); g.connect(dst || dry); s.start(T);
  }

  // ── the kid ──
  function step(e) {
    const d = at(e), v = Math.min(1, 0.45 + (e.v || 1) / 5) * (e.crouch ? 0.5 : 1), j = 0.85 + R() * 0.3;
    if (e.mat === "water") { nz(0.14, 0.32 * v, 2600 * j, "bandpass", 1.5, d); tn(900 * j, 0.08, 0.05, "sine", 500, d); nz(0.08, 0.15 * v, 700, "lowpass", 0, d, 0.04); return; }
    if (e.mat === "cloth") { nz(0.09, 0.22 * v, 600 * j, "lowpass", 0, d); return; }
    if (e.mat === "book") { nz(0.06, 0.2 * v, 2200 * j, "bandpass", 1.2, d); nz(0.05, 0.18 * v, 500, "lowpass", 0, d); return; }
    nz(0.05, 0.3 * v, 1300 * j, "lowpass", 0, d);
    tn(120 * j, 0.07, 0.12 * v, "sine", 70, d);
    if (R() < 0.14) tn(230 + R() * 90, 0.35, 0.025, "triangle", 190, d, 0.03);     // a board gives
  }
  function thud(e, v, mat) {
    const d = at(e), k = Math.min(1, v / 12);
    if (mat === "cloth") { nz(0.2, 0.25 + 0.3 * k, 400, "lowpass", 0, d); return; }
    if (mat === "water") { nz(0.3, 0.4 * k + 0.2, 2000, "bandpass", 1, d); return; }
    nz(0.12, 0.3 + 0.4 * k, 700, "lowpass", 0, d);
    tn(90, 0.18 + 0.2 * k, 0.25 + 0.4 * k, "sine", 40, d);
  }
  // a small voice: breath through a filter, pitched like a child
  function breath(e, v, f = 1500, d = 0.12) { nz(d, v, f, "bandpass", 2.5, at(e), 0, null, 0.02); }
  function voice(e, f, f2, d, v) {
    const p = at(e), lp = filt("lowpass", 1100); lp.connect(p);
    tn(f, d, v, "sawtooth", f2, lp); tn(f * 2.01, d, v * 0.3, "triangle", f2 * 2, lp);
    breath(e, v * 0.6, 1800, d);
  }

  // ── the house settling, far off ──
  function settle() {
    const k = R();
    const x = R() * 34 - 2, y = 9 + R() * 4, z = 2 + R() * 6;
    const p = panAt(x, y, z);
    if (k < 0.35) {                                   // a long creak overhead
      const o = AC.createOscillator(), g = gain(0), f = filt("bandpass", 300, 6), T = AC.currentTime;
      o.type = "sawtooth"; o.frequency.setValueAtTime(70 + R() * 30, T);
      for (let i = 1; i < 8; i++) o.frequency.linearRampToValueAtTime(60 + R() * 70, T + i * 0.18);
      g.gain.linearRampToValueAtTime(0.06, T + 0.3); g.gain.linearRampToValueAtTime(0, T + 1.4);
      chain(o, f, g, p); o.start(T); o.stop(T + 1.5);
    } else if (k < 0.6) {                             // knocking in the pipes
      const n = 3 + ((R() * 4) | 0);
      for (let i = 0; i < n; i++) { tn(180 + R() * 40, 0.25, 0.08, "triangle", 150, p, i * (0.12 + R() * 0.1)); nz(0.03, 0.12, 3000, "bandpass", 3, p, i * 0.15); }
    } else if (k < 0.8) {                             // something heavy set down, somewhere
      tn(55, 0.7, 0.16, "sine", 35, p); nz(0.4, 0.1, 200, "lowpass", 0, p);
    } else {                                          // a door, a long way off
      tn(140, 1.2, 0.04, "sawtooth", 95, p); later(() => { tn(60, 0.5, 0.12, "sine", 40, p); nz(0.2, 0.1, 400, "lowpass", 0, p); }, 1100);
    }
  }
  function thunder() {
    const p = panAt(WIN.x + (R() - 0.5) * 20, 12, 14), T = AC.currentTime;
    const s = AC.createBufferSource(); s.buffer = brown(4.5);
    const f = filt("lowpass", 200), g = gain(0);
    g.gain.setValueAtTime(0, T); g.gain.linearRampToValueAtTime(1.1, T + 0.15);
    for (let i = 1; i < 10; i++) g.gain.linearRampToValueAtTime(0.25 + R() * 0.9 * (1 - i / 10), T + 0.15 + i * 0.4);
    g.gain.linearRampToValueAtTime(0, T + 4.4);
    chain(s, f, g, p); s.start(T);
    // the window rattles in its frame
    const wp = panAt(WIN.x, WIN.y, WIN.z);
    for (let i = 0; i < 7; i++) nz(0.04, 0.06, 2500, "bandpass", 4, wp, 0.25 + i * 0.07);
  }

  // ── the music box ──
  // a tine: a pure tone with a bright, fast-dying overtone and a click
  function tine(midi, v, p, sag) {
    const f = 440 * Math.pow(2, (midi - 69) / 12) * (1 - sag * (0.02 + R() * 0.02));
    tn(f, 1.6, v, "sine", f * (1 - sag * 0.01), p);
    tn(f * 3.98, 0.25, v * 0.25, "sine", null, p);
    tn(f * 7.1, 0.08, v * 0.1, "sine", null, p);
    nz(0.01, v * 0.4, 6000, "highpass", 0, p);
  }
  let boxNote = 0, boxNext = 0, boxP = null, boxMuteUntil = 0;
  function boxTick(box, wound, dt) {
    if (!box || wound <= 0.002) { boxNext = 0; return; }
    if (!boxP) boxP = panAt(box.x, box.y + 0.2, box.z, 0);
    boxNext -= dt;
    if (boxNext > 0 || AC.currentTime < boxMuteUntil) return;
    const w = Math.min(1, wound * 1.6);              // full speed most of the way, then slowing
    const n = TUNE[boxNote % TUNE.length];
    if (n) tine(n, 0.16 * (0.5 + 0.5 * w), boxP, 1 - w);
    boxNote++;
    boxNext = 0.38 / Math.max(0.18, w) + (w < 0.4 ? R() * 0.15 * (1 - w) : 0);
  }

  // ── the Keeper's sounds ──
  const kAt = (e, y) => panAt(e.x, y == null ? 4 : y, e.z);
  function kStep(e) {
    const p = kAt(e, 0.3), v = Math.min(1, 0.5 + (e.v || 1) / 3);
    tn(48, 0.4, 0.45 * v, "sine", 30, p);
    nz(0.22, 0.32 * v, 260, "lowpass", 0, p);
    if (R() < 0.6) tn(110 + R() * 40, 0.6, 0.05, "triangle", 85, p, 0.05);          // the boards groan
    const kp = kAt(e, 2.4);                                                           // the keys at its belt
    for (let i = 0; i < 3 + ((R() * 3) | 0); i++) tn(2600 + R() * 2400, 0.12, 0.025, "sine", null, kp, 0.03 + i * 0.03 + R() * 0.02);
  }
  function stinger() {
    // strings shrieking: a cluster that won't resolve
    const lp = filt("lowpass", 4000); lp.connect(dry); lp.connect(wet);
    for (const f of [880, 932, 988, 1047]) tn(f, 1.4, 0.06, "sawtooth", f * 1.02, lp);
    tn(55, 1.2, 0.35, "sine", 30);
    nz(0.5, 0.25, 600, "lowpass");
  }
  const SFX = {
    kStep,
    kSniff: (e) => { const p = kAt(e); for (let i = 0; i < 3; i++) nz(0.09, 0.14 + i * 0.03, 2300, "bandpass", 2, p, i * 0.13, null, 0.03); },
    kHear: (e) => { const p = kAt(e), lp = filt("lowpass", 520); lp.connect(p); tn(92, 0.55, 0.16, "sawtooth", 125, lp); tn(95, 0.55, 0.1, "sawtooth", 128, lp); },
    kRoar: (e) => {
      const p = kAt(e), lp = filt("lowpass", 300); lp.connect(p);
      lp.frequency.setValueAtTime(300, AC.currentTime); lp.frequency.linearRampToValueAtTime(1400, AC.currentTime + 0.25); lp.frequency.linearRampToValueAtTime(500, AC.currentTime + 1.4);
      tn(72, 1.4, 0.35, "sawtooth", 48, lp); tn(75, 1.4, 0.3, "sawtooth", 50, lp); tn(144, 1.2, 0.12, "square", 96, lp);
      nz(1.3, 0.3, 420, "bandpass", 0.8, p, 0, null, 0.1);
      padSwell = 1;
    },
    kLost: (e) => { const p = kAt(e), lp = filt("lowpass", 420); lp.connect(p); tn(62, 1.0, 0.22, "sawtooth", 44, lp); tn(64, 1.0, 0.16, "sawtooth", 45, lp); nz(0.8, 0.12, 300, "lowpass", 0, p); },
    kGrab: (e) => { stinger(); voice(e, 620, 900, 0.35, 0.07); later(() => voice(e, 700, 520, 0.5, 0.05), 380); },
    respawn: (e) => { breath(e, 0.16, 1600, 0.35); },
    // ── the Workshop ──
    crank: (e) => { const p = at(e); for (let i = 0; i < 5; i++) { nz(0.012, 0.25, 4200, "bandpass", 3, p, i * 0.06); tn(2200, 0.02, 0.03, "square", null, p, i * 0.06); } tn(300 + (e.wind || 0) * 300, 0.3, 0.04, "triangle", 420 + (e.wind || 0) * 400, p); },
    crankStuck: (e) => { const p = at(e); tn(140, 0.15, 0.2, "square", 90, p); nz(0.06, 0.2, 800, "lowpass", 0, p); },
    ding: (e) => { const p = at(e); [1, 2.01, 2.76].forEach((m, i) => tn(1320 * m, 1.4 - i * 0.3, 0.08 - i * 0.02, "sine", null, p)); },
    liftGo: (e) => {
      const p = panAt(e.x, e.y + 1, e.z, 6000), T = AC.currentTime, g = gain(0), o = AC.createOscillator(); o.type = "sawtooth"; o.frequency.value = 55;
      g.gain.setValueAtTime(0, T); g.gain.linearRampToValueAtTime(0.06, T + 0.3); g.gain.setValueAtTime(0.06, T + 3.8); g.gain.linearRampToValueAtTime(0, T + 4.6);
      chain(o, filt("lowpass", 220), g, p); o.start(T); o.stop(T + 4.7);
      for (let i = 0; i < 30; i++) nz(0.03, 0.05, 2600 + R() * 1200, "bandpass", 3, p, 0.2 + i * 0.14);     // the chain over the pulley
    },
    liftStop: (e) => { const p = at(e); tn(160, 0.4, 0.25, "square", 80, p); [1, 2.4, 3.9].forEach((m) => tn(420 * m, 0.5, 0.03, "sine", null, p)); nz(0.2, 0.2, 900, "lowpass", 0, p); },
    // ── the Gallery: the Cuckoo ──
    cWarn: (e) => {
      const p = at(e);
      nz(2.2, 0.12, 300, "bandpass", 2, p, 0, 2400, 0.5);                                   // gears winding up
      for (let i = 0; i < 12; i++) { const w = 2.2 * (1 - Math.pow(1 - i / 12, 1.6)); nz(0.02, 0.12, 3200, "bandpass", 4, p, w); }   // ticks, faster and faster
      for (let i = 0; i < 4; i++) tn(200, 0.06, 0.06, "square", 150, p, 1.4 + i * 0.18);        // the little doors rattle
    },
    cOut: (e) => {
      const p = at(e), lp = filt("lowpass", 2600); lp.connect(p);
      tn(110, 0.25, 0.3, "square", 70, p); nz(0.15, 0.3, 600, "lowpass", 0, p);            // the doors bang open
      // "cuck-oo": two hooting notes, a little wrong
      for (const [f, at0, d] of [[700, 0.25, 0.32], [560, 0.62, 0.5], [702, 1.4, 0.3], [548, 1.75, 0.6]]) { tn(f, d, 0.16, "sine", f * 0.985, lp, at0); tn(f * 2.02, d, 0.05, "triangle", f * 1.95, lp, at0); tn(f * 0.5, d, 0.05, "sawtooth", f * 0.48, lp, at0); }
      // and while it's out, a thin shimmer, like a lamp humming
      const T = AC.currentTime, g = gain(0); g.gain.setValueAtTime(0, T + 1); g.gain.linearRampToValueAtTime(0.035, T + 2); g.gain.setValueAtTime(0.035, T + 6); g.gain.linearRampToValueAtTime(0, T + 6.8);
      for (const f of [990, 1484, 1979]) { const o = AC.createOscillator(); o.frequency.value = f + R() * 4; const tr = AC.createOscillator(), tg = gain(f * 0.004); tr.frequency.value = 6 + R() * 2; chain(tr, tg, o.frequency); tr.start(T); tr.stop(T + 7); chain(o, g); o.start(T); o.stop(T + 7); }
      g.connect(p);
      padSwell = Math.max(padSwell, 0.8);
    },
    cBack: (e) => { const p = at(e); nz(0.8, 0.1, 2000, "bandpass", 2, p, 0, 300); tn(120, 0.15, 0.25, "square", 80, p, 0.8); tn(118, 0.15, 0.2, "square", 75, p, 0.95); },
    cGrab: (e) => { stinger(); const p = at(e), lp = filt("lowpass", 3500); lp.connect(p); tn(900, 0.6, 0.12, "sawtooth", 1800, lp); tn(1400, 0.6, 0.08, "square", 700, lp, 0.1); voice(e, 620, 900, 0.35, 0.07); },
    // ── the Stairwell ──
    burst: (e) => {
      const p = at(e);
      nz(1.4, 0.7, 700, "lowpass", 0, p); tn(45, 1.2, 0.6, "sine", 25, p);
      for (let i = 0; i < 10; i++) nz(0.08 + R() * 0.1, 0.3, 1200 + R() * 2500, "bandpass", 2, p, R() * 0.6);     // splinters
      for (let i = 0; i < 6; i++) tn(150 + R() * 120, 0.3, 0.08, "triangle", 90, panAt(e.x + R() * 6, 0.2, 2 + R() * 3), 0.5 + R() * 1.2);   // planks landing
      padSwell = 1;
    },
    smash: (e) => {
      const p = at(e);
      tn(220, 0.9, 0.2, "sawtooth", 80, p); nz(0.6, 0.4, 1800, "bandpass", 1, p);
      [1, 2.7, 5.1, 8.3].forEach((m, i) => tn(330 * m, 1.2 - i * 0.2, 0.08, "sine", null, p, 0.25));                 // the bars ring
      later(() => { const q = panAt(e.x + 2, 0, 2); tn(260, 0.8, 0.2, "triangle", 200, q); nz(0.3, 0.3, 900, "lowpass", 0, q); }, 600);
    },
    // ── the Bell Tower ──
    lever: (e) => { const p = at(e); tn(90, 0.5, 0.3, "square", 50, p); nz(0.3, 0.3, 700, "lowpass", 0, p); later(() => nz(1.6, 0.12, 300, "bandpass", 2, p, 0, 1200, 0.4), 300); },
    bell: (e) => {
      const p = panAt(e.x, e.y, e.z, 7000), f = 98 * (1 + ((e.strike || 1) % 3) * 0.125);
      [[0.5, 0.25, 6], [1, 0.3, 5.5], [1.19, 0.12, 4], [1.5, 0.1, 3.5], [2, 0.12, 3], [2.5, 0.06, 2.2], [3, 0.05, 1.6], [4.07, 0.03, 1.2]].forEach(([m, v, d]) => tn(f * m, d, v, "sine", f * m * 0.998, p));
      nz(0.08, 0.3, 1800, "bandpass", 1, p);
      if ((e.strike || 0) === 12) padSwell = 1;
    },
    faceOpen: (e) => {
      const p = at(e), lp = filt("lowpass", 600); lp.connect(p); tn(160, 1.6, 0.06, "sawtooth", 110, lp);       // the little door creaks
      nz(2.5, 0.25, 500, "bandpass", 1, p, 0.3, 1400, 0.6);                                          // the night air comes in
      [57, 64, 69, 73, 76].forEach((m, i) => later(() => tine(m, 0.09, dry, 0), 900 + i * 260));   // a major chord, at last
    },

    step,
    jump: (e) => { breath(e, 0.12, 1700, 0.1); nz(0.05, 0.15, 900, "lowpass", 0, at(e)); },
    land: (e) => { if (e.v > 2.5) thud(e, e.v, e.mat); },
    hardLand: (e) => voice(e, 300, 190, 0.22, 0.05),
    tumble: (e) => { voice(e, 340, 160, 0.4, 0.06); later(() => thud(e, 6, "wood"), 140); },
    bump: (e) => { thud(e, 6, "wood"); voice(e, 360, 260, 0.14, 0.04); },
    grab: (e) => { nz(0.08, 0.2, 2600, "bandpass", 1.5, at(e)); voice(e, 280, 330, 0.09, 0.035); },
    mantle: (e) => { nz(0.18, 0.18, 1600, "bandpass", 1, at(e), 0, 900); breath(e, 0.1, 1400, 0.15); },
    climb: (e) => { voice(e, 260, 300, 0.25, 0.04); nz(0.35, 0.16, 1800, "bandpass", 1, at(e), 0.08, 700); },
    up: (e) => step({ ...e, v: 1.5 }),
    letGo: (e) => breath(e, 0.1, 1200, 0.1),
    dragOn: (e) => { nz(0.06, 0.2, 2400, "bandpass", 1.5, at(e)); voice(e, 240, 230, 0.12, 0.025); },
    dragOff: () => {},
    pick: (e) => { nz(0.08, 0.2, 2600, "bandpass", 1.5, at(e)); tn(e.kind === "can" ? 1800 : 600, 0.08, 0.05, "triangle", null, at(e)); },
    throw: (e) => { nz(0.28, 0.22, 400, "bandpass", 1.5, at(e), 0, 2200); voice(e, 300, 380, 0.1, 0.035); },
    clank: (e) => {
      const d = at(e), k = Math.min(1, e.v / 8);
      if (e.kind === "can") { [1, 2.76, 5.4, 8.9].forEach((m, i) => tn(720 * m * (0.95 + R() * 0.1), 0.35 - i * 0.06, (0.12 - i * 0.025) * (0.4 + k), "sine", null, d)); nz(0.04, 0.3 * k, 4000, "highpass", 0, d); }
      else if (e.mat === "cloth") nz(0.1, 0.25 * k, 500, "lowpass", 0, d);
      else { tn(340 * (0.9 + R() * 0.2), 0.12, 0.25 * (0.4 + k), "triangle", 240, d); nz(0.05, 0.25 * k, 1500, "lowpass", 0, d); }
    },
    // winding: a ratchet, click by click, then the tune starts over
    wind: (e) => {
      const p = at(e);
      for (let i = 0; i < 9; i++) { nz(0.012, 0.25, 5000, "bandpass", 3, p, i * 0.07); tn(2400, 0.02, 0.03, "square", null, p, i * 0.07); }
      boxNote = 0; boxNext = 0; boxMuteUntil = AC.currentTime + 0.75;
    },
    // the first look down from the top of the chest: a soft open chord
    discover: () => { [57, 64, 69, 72, 76].forEach((m, i) => tine(m, 0.07, dry, 0)); padSwell = 1; },
    vent: (e) => { const d = at(e); [1, 1.6, 2.3].forEach((m, i) => tn(110 * m, 1.6, 0.12 - i * 0.03, "sine", 100 * m, d)); nz(0.4, 0.2, 1200, "bandpass", 1, d); },
  };

  let lastTick = -1, lastDrip = -1, lastThunder = -1, settleT = 6, beatT = 0, tension = 0, padSwell = 0, under = 0;
  let kBreath = 0, humI = 0, humT = 0, nextDrum = 0, drumN = 0;
  const HUM = [45, 0, 48, 47, 45, 0, 43, 45, 40, 0, 0, 0];      // its tune, low, half-remembered (MIDI)
  function drums(now, on) {
    // a pounding beat while it chases you: kick, a low tom, kick-kick, a string stab every bar
    drumG.gain.setTargetAtTime(on ? 1 : 0, now, on ? 0.05 : 0.6);
    if (!on) { nextDrum = 0; return; }
    if (nextDrum < now) nextDrum = now + 0.02;
    while (nextDrum < now + 0.12) {
      const at = nextDrum - now, b = drumN % 8;
      if (b === 0 || b === 3 || b === 4) { tn(62, 0.28, 0.5, "sine", 38, drumG, at); nz(0.05, 0.25, 900, "lowpass", 0, drumG, at); }
      if (b === 2 || b === 6) { tn(110, 0.22, 0.25, "triangle", 70, drumG, at); nz(0.08, 0.15, 2500, "bandpass", 1, drumG, at); }
      if (b === 0) for (const f of [220, 233, 330]) tn(f, 0.35, 0.05, "sawtooth", f, drumG, at);
      drumN++; nextDrum += 60 / 150 / 2;
    }
  }
  return {
    start,
    // for tests: whether the sound is running
    state: () => (AC ? AC.state : "off"),
    // an event from the run: { n, x, y, z, ... }
    play(e) { if (AC && e && SFX[e.n]) SFX[e.n](e); },
    // every frame. o: { cam: {x,y,z} (rules axes), T (the run's clock),
    // dragV, tension 0..1, covered (under something), box, wound }
    tick(dt, o) {
      if (!AC) return;
      const L = AC.listener, c = o.cam;
      if (L.positionX) { L.positionX.value = c.x; L.positionY.value = c.y; L.positionZ.value = -c.z; L.forwardX.value = 0; L.forwardY.value = -0.15; L.forwardZ.value = -1; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
      else { L.setPosition(c.x, c.y, -c.z); L.setOrientation(0, -0.15, -1, 0, 1, 0); }
      const now = AC.currentTime, T = o.T;
      // a new room: its clock, its window (or not)
      const rn = (o.room && o.room.name) || "nursery";
      if (rn !== placeName && PLACES[rn]) { placeName = rn; place = PLACES[rn]; WIN = place.win; setPos(windP, WIN.x, WIN.y, WIN.z); }
      const CLOCK = place.clock, LEAK = o.room && o.room.leak;

      // the clock
      const sec = Math.floor(T);
      if (sec !== lastTick) {
        lastTick = sec;
        if (CLOCK) {
          const p = panAt(CLOCK.x, CLOCK.y, CLOCK.z), hi = sec % 2 === 0, dp = place.deep || 0;
          nz(0.03, (hi ? 0.1 : 0.07) * (1 + dp), (hi ? 3800 : 2600) * (1 - dp * 0.65), "bandpass", 4, p);
          tn((hi ? 1900 : 1500) * (1 - dp * 0.7), 0.04 + dp * 0.12, 0.03 * (1 + dp * 2), "sine", null, p);
          // a wall of clocks: more ticks, out of step
          if (place.chorus) for (let i = 0; i < 4; i++) later(() => { const q = panAt(4 + R() * 20, 5 + R() * 5, 5.8); nz(0.025, 0.05, 2500 + R() * 2500, "bandpass", 4, q); }, 120 + i * 190 + R() * 80);
        }
      }
      // the leak: a drop lands every DRIP seconds
      const drip = Math.floor((T - DROP_FALL) / DRIP);
      if (LEAK && drip !== lastDrip && T > DROP_FALL) {
        lastDrip = drip;
        const p = panAt(LEAK.x, 0.1, LEAK.z), f = 1500 + R() * 600;
        tn(f, 0.12, 0.08, "sine", f * 0.6, p); nz(0.02, 0.06, 4000, "highpass", 0, p);
      }
      // thunder, a moment after each flash
      const k = Math.floor((T - THUNDER_DELAY) / LP);
      if (k !== lastThunder && T - THUNDER_DELAY >= flashAt(k)) { lastThunder = k; if (T - THUNDER_DELAY - flashAt(k) < 1) thunder(); }
      // the wind follows the gusts
      const g = gust(T);
      windG.gain.setTargetAtTime((0.05 + g * 0.22) * place.wind, now, 0.3);
      windF.frequency.setTargetAtTime(380 + g * 500, now, 0.3);
      whistleG.gain.setTargetAtTime(Math.max(0, g - 0.55) * 0.05 * place.wind, now, 0.2);
      whistle.frequency.setTargetAtTime(700 + g * 600, now, 0.3);
      // the house settling
      settleT -= dt;
      if (settleT <= 0) { settleT = 8 + R() * 14; settle(); }
      // the music box
      boxTick(o.box, o.wound, dt);
      // the Keeper: its breath follows it, a hum on its round, drums when it's after you
      const K = o.K;
      if (K) {
        setPos(kP, K.x, 4.2, K.z);
        const rate = { chase: 2.6, grab: 2.2, search: 1.6, go: 1.3 }[K.st] || 0.75;
        kBreath += dt * rate;
        const held = K.st === "listen" ? 0 : 1;                   // listening, it holds its breath
        const loud = { chase: 0.5, grab: 0.4, search: 0.35, go: 0.28 }[K.st] || 0.2;
        const ph = kBreath % 1, curve = ph < 0.42 ? Math.sin(ph / 0.42 * Math.PI) : Math.sin((ph - 0.42) / 0.58 * Math.PI) * 0.7;
        kBreathG.gain.setTargetAtTime(loud * curve * held, now, 0.05);
        kBreathF.frequency.setTargetAtTime(ph < 0.42 ? 420 : 680, now, 0.08);
        const humming = K.st === "patrol";
        kHumG.gain.setTargetAtTime(humming ? 0.05 : 0, now, 0.3);
        if (humming) {
          humT -= dt;
          if (humT <= 0) { humT = 0.9; const n = HUM[humI++ % HUM.length]; if (n) kHum.frequency.setTargetAtTime(440 * Math.pow(2, (n - 69) / 12), now, 0.15); else kHumG.gain.setTargetAtTime(0.005, now, 0.1); }
        }
        drums(now, K.st === "chase");
      } else { kBreathG.gain.setTargetAtTime(0, now, 0.2); kHumG.gain.setTargetAtTime(0, now, 0.2); drums(now, false); }
      // the block
      dragG.gain.setTargetAtTime(Math.min(0.35, (o.dragV || 0) * 0.45), now, 0.06);
      dragF.frequency.setTargetAtTime(260 + (o.dragV || 0) * 220, now, 0.1);
      // the score swells with tension; a heartbeat under it at the top
      padSwell = Math.max(0, padSwell - dt * 0.12);
      tension += ((o.tension || 0) - tension) * (1 - Math.exp(-dt * 1.2));
      const tv = Math.max(tension, padSwell * 0.6);
      padG.gain.setTargetAtTime(0.02 + tv * 0.22, now, 0.4);
      padF.frequency.setTargetAtTime(220 + tv * 1400, now, 0.4);
      if (tension > 0.45) {
        beatT -= dt;
        if (beatT <= 0) { beatT = 60 / (70 + tension * 60); const v = (tension - 0.4) * 0.9; tn(58, 0.14, v, "sine", 38); later(() => tn(52, 0.16, v * 0.7, "sine", 32), 160); }
      }
      // under the cot: muffled, drier
      under += ((o.covered ? 1 : 0) - under) * (1 - Math.exp(-dt * 4));
      muff.frequency.setTargetAtTime(18000 - under * 16800, now, 0.08);
      wet.gain.setTargetAtTime(0.3 - under * 0.2, now, 0.1);
    },
    mute(v) { muted = v; if (out) out.gain.setTargetAtTime(v ? 0 : 0.9, AC.currentTime, 0.05); },
    suspend() { if (AC && AC.state === "running") AC.suspend().catch(() => {}); },
    close() {
      timers.forEach(clearTimeout); timers.clear();
      if (AC) { try { AC.close(); } catch (e) { /* gone */ } AC = null; }
    },
  };
}
