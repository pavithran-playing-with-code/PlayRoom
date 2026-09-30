// src/components/horror/manorAudio.js
// The sounds of HOLLOW MANOR, all synthesised — no files. A low drone runs
// underneath; everything else is a short tone or a burst of noise, played for
// the events manorSim pushes. The tones are the original page's, unchanged.
//
// Must be started from a tap (browsers keep audio locked until then), and
// closed when the page goes, or the drone keeps playing over the rest of the app.
export function createManorAudio() {
  let AC = null, mg = null;
  const timers = new Set();

  function start() {
    if (AC) { if (AC.state === "suspended") AC.resume(); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      mg = AC.createGain();
      mg.gain.value = 0.7;
      mg.connect(AC.destination);
      const lp = AC.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 140;
      const dg = AC.createGain();
      dg.gain.value = 0.1;
      lp.connect(dg);
      dg.connect(mg);
      [46, 49.5, 92.4].forEach((f) => {
        const o = AC.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.connect(lp);
        o.start();
      });
    } catch (e) { AC = null; }
  }

  function tone(f, dur, vol, type, f2) {
    if (!AC) return;
    const o = AC.createOscillator(), v = AC.createGain(), t = AC.currentTime;
    o.type = type || "sine";
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    v.gain.setValueAtTime(vol, t);
    v.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(v);
    v.connect(mg);
    o.start(t);
    o.stop(t + dur);
  }

  function noise(dur, vol) {
    if (!AC) return;
    const n = AC.sampleRate * dur, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = AC.createBufferSource(), v = AC.createGain();
    src.buffer = b;
    v.gain.value = vol;
    src.connect(v);
    v.connect(mg);
    src.start();
  }

  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

  const SOUNDS = {
    step: () => tone(75, 0.09, 0.07, "triangle", 45),
    stepRun: () => tone(95, 0.09, 0.12, "triangle", 45),
    jump: () => tone(200, 0.15, 0.1, "triangle", 380),
    land: () => tone(70, 0.15, 0.25, "sine", 40),
    gateSlam: () => { noise(0.4, 0.6); tone(70, 0.7, 0.4, "square", 40); },
    puff: () => { tone(160, 0.25, 0.12, "triangle", 60); noise(0.15, 0.12); },
    battery: () => tone(660, 0.4, 0.2, "square", 990),
    relic: () => { tone(880, 0.8, 0.25, "sine", 1320); tone(1320, 1, 0.15, "sine"); },
    win: () => { noise(0.8, 0.3); tone(440, 1.5, 0.2, "sine", 880); },
    caught: () => { noise(1, 0.9); tone(1100, 0.9, 0.3, "sawtooth", 120); },
    spotted: () => { noise(0.5, 0.5); tone(700, 0.6, 0.15, "sawtooth", 180); },
    flicker: () => tone(90, 0.5, 0.3, "square", 40),
    ghostStep: (v) => tone(52, 0.14, v, "sine", 34),
    heartbeat: (v) => { tone(60, 0.2, 0.55 * v, "sine", 32); later(() => tone(55, 0.2, 0.4 * v, "sine", 30), 190); },
    musicBox: () => [523, 392, 466, 349, 523, 392].forEach((f, i) => later(() => tone(f, 0.5, 0.14, "triangle"), i * 230)),
  };

  return {
    start,
    play(ev) { const fn = SOUNDS[ev.name]; if (fn) fn(ev.v); },
    close() {
      timers.forEach(clearTimeout);
      timers.clear();
      if (AC) { try { AC.close(); } catch (e) { /* already closed */ } }
      AC = null;
    },
  };
}
