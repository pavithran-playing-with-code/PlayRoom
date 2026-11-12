// src/components/games/sneakAudio.js
// Shadow Sneak's sound, made with Web Audio — nothing recorded. A sneaking
// game is played by ear as much as by eye:
//
//   the lamp   a low hum that swells as a beam swings toward you and fades
//              as it passes: you hear danger coming before you see it
//   the alarm  a rising tone while the ring under you turns red (you're in
//              the light), and a sting the moment you're spotted
//   you        soft footsteps, softer still when ducked
//   moments    a bell's ding, the lamp turning faster, the door, and a little
//              tune when the lamp goes out
//
// Nothing plays until the first tap or key (init) — a phone allows no sound
// before one. `frame()` is fed once a frame; the rest are one-shots.
export function makeSneakAudio() {
  let AC = null, master = null, hum = null, humGain = null, humFilter = null, alarm = null, alarmGain = null, noise = null, tap = null;
  let walked = 0, lastSeen = 0;
  const init = () => {
    if (!AC) {
      try {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        master = AC.createGain(); master.gain.value = 0.55; master.connect(AC.destination);
        tap = AC.createAnalyser(); tap.fftSize = 1024; master.connect(tap);          // for tests: is anything sounding
        // the lamp: two low notes a hair apart (they beat, like a big motor), through a filter that opens as it nears
        humGain = AC.createGain(); humGain.gain.value = 0;
        humFilter = AC.createBiquadFilter(); humFilter.type = "lowpass"; humFilter.frequency.value = 180;
        hum = [55, 55.7, 110.4].map((f, i) => { const o = AC.createOscillator(); o.type = i === 2 ? "triangle" : "sawtooth"; o.frequency.value = f; o.connect(humFilter); o.start(); return o; });
        humFilter.connect(humGain); humGain.connect(master);
        // the alarm: silent until you're in the light
        alarmGain = AC.createGain(); alarmGain.gain.value = 0;
        alarm = AC.createOscillator(); alarm.type = "square"; alarm.frequency.value = 520;
        const af = AC.createBiquadFilter(); af.type = "lowpass"; af.frequency.value = 1800;
        alarm.connect(af); af.connect(alarmGain); alarmGain.connect(master); alarm.start();
        // a second of hiss, for footsteps
        noise = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
        const d = noise.getChannelData(0);
        let s = 12345;
        for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
      } catch { AC = null; }
    }
    if (AC && AC.state === "suspended") AC.resume();
  };
  function tone(f, d, type, v, f2, at = 0) {
    if (!AC) return;
    const t = AC.currentTime + at, o = AC.createOscillator(), g = AC.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v || 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
  }
  const seq = (fs, gap, d, v, type = "triangle") => fs.forEach((f, i) => tone(f, d, type, v, 0, i * gap));
  const step = (soft) => {
    if (!AC || !noise) return;
    const t = AC.currentTime, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    src.buffer = noise; f.type = "bandpass"; f.frequency.value = soft ? 500 : 800 + (walked % 2) * 180; f.Q.value = 1.2;
    g.gain.setValueAtTime(soft ? 0.03 : 0.085, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, (walked * 0.137) % 0.9, 0.08);
  };
  const sfx = {
    spotted: () => { tone(880, 0.12, "square", 0.16, 0, 0); tone(660, 0.14, "square", 0.16, 0, 0.11); tone(196, 0.55, "sawtooth", 0.2, 70, 0.22); },
    back: () => tone(300, 0.22, "sine", 0.1, 620),
    bell: () => { tone(1320, 0.9, "sine", 0.16); tone(1980, 0.7, "sine", 0.07); tone(2640, 0.4, "sine", 0.04); },
    door: () => seq([523, 659], 0.11, 0.22, 0.12),
    heat: () => { tone(220, 0.35, "sawtooth", 0.1, 440); tone(233, 0.35, "sawtooth", 0.08, 466, 0.02); },
    // the lamp winds down, then a happy little tune
    off: () => { tone(220, 0.7, "sawtooth", 0.14, 40); seq([523, 659, 784, 1046, 1318], 0.1, 0.4, 0.14, "triangle"); tone(1568, 0.7, "sine", 0.1, 0, 0.55); },
    over: () => seq([392, 330, 262, 196], 0.18, 0.5, 0.12),
  };
  return {
    init, sfx,
    // once a frame: near 0..1 (how close a beam is to pointing at me), seen 0..1 (how made-out I am),
    // moved (metres this frame), duck, hot (the lamp turning faster), off (the lamp is out)
    frame({ near = 0, seen = 0, moved = 0, duck = false, hot = false, off = false }) {
      if (!AC || AC.state !== "running") return;
      const t = AC.currentTime;
      const k = off ? 0 : near;
      humGain.gain.setTargetAtTime(off ? 0 : 0.03 + k * k * 0.3, t, 0.08);
      humFilter.frequency.setTargetAtTime(160 + k * 900, t, 0.08);
      const base = hot ? 1.26 : 1;
      hum[0].frequency.setTargetAtTime(55 * base, t, 0.2); hum[1].frequency.setTargetAtTime(55.7 * base, t, 0.2); hum[2].frequency.setTargetAtTime(110.4 * base, t, 0.2);
      // in the light: a tone that climbs with the ring, pulsing faster as it fills
      const s = off ? 0 : seen;
      alarm.frequency.setTargetAtTime(480 + s * 700, t, 0.03);
      alarmGain.gain.setTargetAtTime(s > 0.04 ? 0.05 + s * 0.09 * (0.6 + 0.4 * Math.sin(t * (14 + s * 20))) : 0, t, 0.02);
      lastSeen = s;
      // footsteps: one for every stride
      if (moved > 0) {
        walked += moved / (duck ? 0.42 : 0.62);
        if (Math.floor(walked) !== Math.floor(walked - moved / (duck ? 0.42 : 0.62))) step(duck);
      }
    },
    // for tests: how loud it is right now (0 = silence), and the state of things
    level() {
      if (!AC || !tap) return 0;
      const b = new Float32Array(tap.fftSize);
      tap.getFloatTimeDomainData(b);
      let e = 0;
      for (const x of b) e += x * x;
      return Math.sqrt(e / b.length);
    },
    state: () => ({ on: !!AC, ctx: AC ? AC.state : "none", hum: humGain ? +humGain.gain.value.toFixed(3) : 0, alarm: alarmGain ? +alarmGain.gain.value.toFixed(3) : 0, seen: lastSeen }),
    quiet() { if (AC && humGain) { const t = AC.currentTime; humGain.gain.setTargetAtTime(0, t, 0.1); alarmGain.gain.setTargetAtTime(0, t, 0.05); } },
    close() { try { if (AC) AC.close(); } catch { /* gone */ } AC = null; },
  };
}

// How close a beam is to pointing at (x, z), 0..1 — 1 when it's on you. The
// beams turn the same way, so the one about to arrive counts for more than
// the one that has just passed.
export function beamNear(W, angles, x, z) {
  const a = Math.atan2(z - (W.c + 0.5), x - (W.c + 0.5));
  let best = 0;
  for (const b of angles) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    // d > 0: the beam hasn't reached me yet (it turns toward bigger angles)
    const k = d >= 0 ? 1 - d / 1.1 : 1 + d / 0.45;
    if (k > best) best = k;
  }
  return Math.max(0, Math.min(1, best));
}
