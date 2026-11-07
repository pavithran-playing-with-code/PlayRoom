// src/components/games/sunshardAudio.js
// Sunshard Jump's sound: Web Audio only — a little tune, and a blip for
// everything that happens. Nothing plays until the first tap (init).
export function makeAudio() {
  let AC = null, master = null, muted = false, music = 0, playing = false, tense = 0;
  const init = () => {
    if (!AC) {
      try {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        master = AC.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(AC.destination);
        const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3], pat = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 7, 5, 4, 2, 3];
        let n = 0;
        music = setInterval(() => {
          if (!AC || muted || !playing) return;
          const i = pat[n % pat.length];
          tone(scale[i], 0.5, "sine", 0.035);
          if (n % 4 === 0) tone(scale[i] / 2, 0.9, "triangle", 0.03);
          // the Gloom close: a low heartbeat under the tune
          if (tense > 0.2 && n % 2 === 0) tone(62, 0.25, "sine", 0.07 * tense, 40);
          n++;
        }, 260);
      } catch { AC = null; }
    }
    if (AC && AC.state === "suspended") AC.resume();
  };
  function tone(f, d, type, v, f2) {
    if (!AC) return;
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v || 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
  }
  const seq = (fs, gap, d, v) => fs.forEach((f, i) => setTimeout(() => tone(f, d, "triangle", v), i * gap));
  const sfx = {
    jump: () => tone(380, 0.16, "sine", 0.14, 640), dbl: () => tone(520, 0.2, "triangle", 0.14, 980), land: () => tone(130, 0.12, "sine", 0.18, 60),
    shard: () => seq([523, 659, 784, 1046, 1318], 90, 0.4, 0.14),
    hurt: () => tone(240, 0.3, "sawtooth", 0.14, 70), stomp: () => tone(320, 0.16, "square", 0.1, 140), spring: () => tone(260, 0.28, "sine", 0.16, 1000),
    flag: () => seq([660, 880], 110, 0.25, 0.12), crumble: () => tone(90, 0.3, "sawtooth", 0.08, 40),
    tie: () => seq([660, 990], 90, 0.2, 0.1), snap: () => tone(900, 0.25, "square", 0.09, 160),
    win: () => seq([523, 659, 784, 1046, 784, 1046, 1318], 150, 0.45, 0.15), beep: (hi) => tone(hi ? 880 : 440, hi ? 0.45 : 0.18, "square", 0.12),
    caught: () => { tone(180, 0.6, "sawtooth", 0.16, 50); tone(90, 0.8, "sine", 0.18, 40); },
    pop: () => seq([392, 523, 659], 70, 0.2, 0.12),
    thunder: () => tone(55, 0.9, "sawtooth", 0.08, 30),
    over: () => seq([392, 330, 262, 196], 180, 0.5, 0.13),
  };
  return {
    init, sfx,
    play(on) { playing = on; },
    tension(k) { tense = k; },
    mute(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    close() { clearInterval(music); try { if (AC) AC.close(); } catch { /* gone */ } AC = null; },
  };
}
