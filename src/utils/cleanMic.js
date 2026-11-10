// src/utils/cleanMic.js
// A computer's microphone, cleaned of the steady tones laptops put into it.
//
// Measured on one laptop (scripts in CLAUDE.md, "Video calls"): a steady
// 4 kHz beep in the mic all the time, ~20 dB over the room, and an 8 kHz
// whine (with 16 kHz) the moment the webcam came on, ~29 dB over — friends
// heard an insect, then an irritating beep. Other apps' heavy noise removal
// hides such tones; the browser's doesn't. A tone like that is the same from
// one second to the next, and a voice never is, so:
//   • a low cut at 75 Hz (the mains hum and its rumble),
//   • a voice up to 6.5 kHz, everything above cut steeply,
//   • and every few seconds the mic's sound is measured: any narrow peak
//     that stands well over its neighbours twice in a row is a tone, and a
//     narrow notch is put on it (up to 8 of them; one that goes away is
//     freed again after a while).
// Phones don't get it (no such tones, and a phone's audio is touchier). If
// sound can't run yet, the mic goes as it is.

export const DESKTOP = typeof navigator !== "undefined" && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  && !(navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

const NOTCHES = 8, OFF = 22000;        // a notch set to OFF does nothing (it's above the low-pass)
const WINDOW_MS = 3000;                // one measurement
const OVER_DB = 12;                    // a peak this far over its neighbourhood is a tone
const LO = 250, HI = 7000;             // where tones are looked for (below: the low cut; above: the low-pass)

export async function cleanMic(raw, { force = false } = {}) {
  if (!raw || (!DESKTOP && !force) || raw.__raw) return raw;
  let ac;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    if (ac.state !== "running") await Promise.race([ac.resume(), new Promise((r) => setTimeout(r, 500))]).catch(() => {});
    if (ac.state !== "running") { ac.close().catch(() => {}); return raw; }
    const src = ac.createMediaStreamSource(new MediaStream([raw]));
    let node = src;
    const add = (type, hz, q) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; node.connect(f); node = f; return f; };
    add("highpass", 75, 0.7);
    add("lowpass", 6500, 0.54); add("lowpass", 6500, 1.31);
    add("notch", 8000, 4);                                     // the webcam whine, wanders ±500 Hz
    const notches = Array.from({ length: NOTCHES }, () => ({ f: add("notch", OFF, 30), hz: 0, seen: 0 }));
    const dest = ac.createMediaStreamDestination();
    dest.channelCount = 1;
    node.connect(dest);

    // ── finding tones ──
    const an = ac.createAnalyser();
    an.fftSize = 8192; an.smoothingTimeConstant = 0;
    src.connect(an);
    const n = an.frequencyBinCount, binHz = ac.sampleRate / an.fftSize;
    const acc = new Float64Array(n), fb = new Float32Array(n);
    let frames = 0, last = new Set();
    const sample = () => { an.getFloatFrequencyData(fb); for (let i = 0; i < n; i++) acc[i] += Math.pow(10, fb[i] / 10); frames++; };
    const measure = () => {
      if (!frames) return;
      const db = Array.from(acc, (p) => 10 * Math.log10(p / frames + 1e-20));
      acc.fill(0); frames = 0;
      const lo = Math.ceil(LO / binHz), hi = Math.floor(HI / binHz), w = Math.round(250 / binHz);
      const found = new Set();
      for (let i = lo; i <= hi; i++) {
        if (db[i] < db[i - 1] || db[i] < db[i + 1]) continue;
        const nb = db.slice(i - w, i + w).sort((a, b) => a - b);
        if (db[i] - nb[nb.length >> 1] > OVER_DB) found.add(Math.round((i * binHz) / 10) * 10);
      }
      // a tone: there in two measurements running (a voice's note never holds that long)
      const steady = [...found].filter((hz) => [...last].some((h) => Math.abs(h - hz) <= 30));
      last = found;
      for (const nt of notches) if (nt.hz) nt.seen++;
      for (const hz of steady) {
        const have = notches.find((nt) => nt.hz && Math.abs(nt.hz - hz) <= 40);
        if (have) { have.seen = 0; continue; }
        const free = notches.find((nt) => !nt.hz) || notches.reduce((a, b) => (a.seen > b.seen ? a : b));
        free.hz = hz; free.seen = 0;
        free.f.frequency.setTargetAtTime(hz, ac.currentTime, 0.05);
        free.f.Q.setTargetAtTime(Math.max(20, hz / 70), ac.currentTime, 0.05);   // ~70 Hz wide
      }
      // a notch whose tone hasn't been seen for ~a minute is freed
      for (const nt of notches) if (nt.hz && nt.seen > 20) { nt.hz = 0; nt.f.frequency.setTargetAtTime(OFF, ac.currentTime, 0.05); }
    };
    const tick = setInterval(sample, 100);
    const every = setInterval(measure, WINDOW_MS);

    const out = dest.stream.getAudioTracks()[0];
    try { out.contentHint = "speech"; } catch { /* fine */ }
    out.__raw = raw;
    out.__notches = () => notches.filter((nt) => nt.hz).map((nt) => nt.hz);     // for tests
    const end = out.stop.bind(out);
    out.stop = () => { clearInterval(tick); clearInterval(every); end(); raw.stop(); ac.close().catch(() => {}); };
    return out;
  } catch {
    if (ac) ac.close().catch(() => {});
    return raw;
  }
}
