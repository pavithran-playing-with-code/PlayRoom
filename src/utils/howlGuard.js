// src/utils/howlGuard.js
// Two devices in one call, near each other (a phone and a laptop, two
// phones): one's speaker plays my voice, the other's microphone hears it and
// sends it back, round and round, until it builds into a loud whistle — the
// "beep" friends heard. Echo cancelling only removes a device's own speaker,
// never the one beside it, so the browser can't stop it.
//
// A howl looks like nothing else in a call: one pure tone, loud, standing
// far over everything around it, at the very same pitch for most of a
// second. A voice's notes move, and its harmonics come in families. So the
// microphone is watched (an AnalyserNode — nothing is recorded or changed),
// and the moment a howl builds the mic is paused for a few seconds, which
// breaks the loop at once. onHowl tells the call (it says why, and after a
// few in a row, keeps the mic off).
//
//   const stop = howlGuard(track, { onHowl(count, hz) {}, isOn: () => micIsOn })
const FFT = 2048;
const STEP_MS = 80;
const OVER_DB = 32;        // the peak over the median of the voice range
const LOUD_DB = -42;       // and loud in itself
const HOLD = 7;            // steps at the same pitch (~0.55 s)
const PAUSE_MS = 3000;

export function howlGuard(track, { onHowl, isOn, pauseMs = PAUSE_MS } = {}) {
  if (!track) return () => {};
  let ac, timer, alive = true, paused = 0, count = 0, run = 0, lastBin = -1;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    ac.resume().catch(() => {});
    const an = ac.createAnalyser();
    an.fftSize = FFT; an.smoothingTimeConstant = 0;
    ac.createMediaStreamSource(new MediaStream([track])).connect(an);
    const fb = new Float32Array(an.frequencyBinCount), binHz = ac.sampleRate / FFT;
    const lo = Math.ceil(250 / binHz), hi = Math.floor(6000 / binHz);
    const tmp = new Float32Array(hi - lo);
    timer = setInterval(() => {
      if (!alive || ac.state !== "running") { if (ac.state === "suspended") ac.resume().catch(() => {}); return; }
      if (paused) return;
      an.getFloatFrequencyData(fb);
      let best = lo;
      for (let i = lo; i < hi; i++) { tmp[i - lo] = fb[i]; if (fb[i] > fb[best]) best = i; }
      const sorted = Array.from(tmp).sort((a, b) => a - b), med = sorted[sorted.length >> 1];
      const howling = fb[best] > LOUD_DB && fb[best] - med > OVER_DB;
      if (howling && (lastBin < 0 || Math.abs(best - lastBin) <= 1)) run++;
      else run = howling ? 1 : 0;
      lastBin = howling ? best : -1;
      if (run < HOLD) return;
      // a howl: pause the mic, which breaks the loop
      run = 0; lastBin = -1; count++;
      track.enabled = false;
      paused = setTimeout(() => {
        paused = 0;
        // back on — unless it was turned off meanwhile (by hand, or the call)
        if (alive && track.readyState === "live" && (!isOn || isOn())) track.enabled = true;
      }, pauseMs);
      if (onHowl) onHowl(count, Math.round(best * binHz));
    }, STEP_MS);
  } catch { /* no Web Audio: no guard */ }
  return () => {
    alive = false;
    clearInterval(timer); clearTimeout(paused);
    if (ac) ac.close().catch(() => {});
  };
}
