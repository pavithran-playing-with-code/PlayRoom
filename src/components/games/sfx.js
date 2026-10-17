// src/components/games/sfx.js
// The games' shared sound kit: every effect synthesised in the browser, no
// files to load. One audio context for the whole app, started on the first
// touch (browsers keep sound locked until then), and one mute switch that
// every game shares and remembers (pr_mute in localStorage; the 🔊 button in
// GameFrame when a game passes `sound`).
//
//   import sfx from "./sfx";
//   sfx.blip(1.2);  sfx.boom();  sfx.chime(2);  const beat = sfx.beat(() => 120); beat.stop();
//
// Everything is quiet by design: these are phones, played in company. Tests
// run Chrome with --mute-audio, so nothing here ever sounds on a dev machine.
import { useSyncExternalStore } from "react";

let AC = null, out = null, verb = null, wet = null;
let muted = false;
try { muted = localStorage.getItem("pr_mute") === "1"; } catch { /* fine */ }
const subs = new Set();

// one context, made on the first touch anywhere
function ctx() {
  if (AC) { if (AC.state === "suspended") AC.resume().catch(() => {}); return AC; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    out = AC.createGain(); out.gain.value = muted ? 0 : 0.7; out.connect(AC.destination);
    // a short room, so sounds sit somewhere instead of in your ear
    verb = AC.createConvolver();
    const n = (AC.sampleRate * 0.8) | 0, b = AC.createBuffer(2, n, AC.sampleRate);
    for (let c = 0; c < 2; c++) { const a = b.getChannelData(c); for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    verb.buffer = b; wet = AC.createGain(); wet.gain.value = 0.18; wet.connect(verb); verb.connect(out);
  } catch { AC = null; }
  return AC;
}
if (typeof window !== "undefined") {
  const wake = () => { ctx(); };
  window.addEventListener("pointerdown", wake, { capture: true, passive: true });
  window.addEventListener("keydown", wake, { capture: true, passive: true });
}

function dest(dry = 1) {
  if (!AC) return null;
  const g = AC.createGain(); g.gain.value = dry; g.connect(out); g.connect(wet);
  setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, 4000);
  return g;
}
// a tone: frequency (and where it slides to), length, loudness, wave, a delay
function tone(f, d, v, type = "sine", f2 = null, at = 0, to = null) {
  if (!ctx() || muted) return;
  const T = AC.currentTime + at, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, T); if (f2) o.frequency.exponentialRampToValueAtTime(f2, T + d);
  g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(v, T + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, T + d);
  o.connect(g); g.connect(to || dest()); o.start(T); o.stop(T + d + 0.02);
}
// a burst of noise through a filter
function noise(d, v, f = 1200, type = "lowpass", at = 0, f2 = null, q = 0.8) {
  if (!ctx() || muted) return;
  const T = AC.currentTime + at, n = Math.max(1, (AC.sampleRate * d) | 0), b = AC.createBuffer(1, n, AC.sampleRate), a = b.getChannelData(0);
  for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  fl.type = type; fl.frequency.setValueAtTime(f, T); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, T + d); fl.Q.value = q;
  g.gain.value = v; s.buffer = b; s.connect(fl); fl.connect(g); g.connect(dest()); s.start(T);
}
const note = (m) => 440 * Math.pow(2, (m - 69) / 12);

const sfx = {
  tone, noise, note,
  // a bright tap; pitch > 1 climbs (a streak)
  blip(pitch = 1) { tone(620 * pitch, 0.09, 0.11, "triangle", 900 * pitch); tone(1240 * pitch, 0.05, 0.03, "sine"); },
  // a soft pop: something appears
  pop(pitch = 1) { tone(300 * pitch, 0.08, 0.07, "sine", 520 * pitch); noise(0.03, 0.05, 2500, "bandpass"); },
  // a good thing: a sparkle of rising notes
  sparkle() { [76, 81, 85, 88].forEach((m, i) => tone(note(m), 0.22, 0.06, "triangle", null, i * 0.045)); },
  // a level up: a bright chord, higher with the level
  chime(level = 1) { const r = 72 + Math.min(12, level * 2); [0, 4, 7, 12].forEach((s, i) => tone(note(r + s), 0.45, 0.05, "sine", null, i * 0.03)); },
  // something breaking: a crack of ice, glass
  crack() { noise(0.12, 0.18, 4200, "highpass"); tone(1800, 0.08, 0.04, "square", 900); },
  // bad: a boom
  boom() { noise(0.5, 0.35, 900, "lowpass", 0, 120); tone(70, 0.45, 0.35, "sine", 35); },
  // a miss: a dull thud and a sour note
  thud() { tone(140, 0.16, 0.12, "sine", 70); tone(233, 0.18, 0.025, "sawtooth", 220); },
  // the clock running out
  tick(hi = false) { noise(0.025, hi ? 0.12 : 0.08, hi ? 3600 : 2600, "bandpass", 0, null, 5); },
  // a whoosh: something flies
  whoosh() { noise(0.25, 0.12, 400, "bandpass", 0, 2400, 1.4); },
  // the end: up for a win, down for a loss
  win() { [72, 76, 79, 84].forEach((m, i) => tone(note(m), 0.5, 0.07, "triangle", null, i * 0.11)); },
  lose() { [67, 63, 60].forEach((m, i) => tone(note(m), 0.4, 0.06, "triangle", null, i * 0.16)); },
  // A light beat under the game: a kick and a hat, bpm() asked every bar so
  // it can speed up with the game. Returns { stop }.
  beat(bpm, vol = 1) {
    let on = true, next = 0, n = 0;
    const timer = setInterval(() => {
      if (!on || muted || !ctx()) return;
      const now = AC.currentTime;
      if (next < now) next = now + 0.05;
      while (next < now + 0.15) {
        const at = next - now, step = n % 8;
        if (step % 4 === 0) tone(110, 0.14, 0.09 * vol, "sine", 45, at);
        if (step % 2 === 1) noise(0.03, 0.035 * vol, 7000, "highpass", at);
        if (step === 6) noise(0.06, 0.04 * vol, 1800, "bandpass", at);
        n++; next += 60 / Math.max(60, Math.min(200, bpm() || 100)) / 2;
      }
    }, 40);
    return { stop() { on = false; clearInterval(timer); } };
  },
  // the shared switch
  muted: () => muted,
  setMuted(m) {
    muted = !!m;
    try { localStorage.setItem("pr_mute", muted ? "1" : "0"); } catch { /* fine */ }
    if (out && AC) out.gain.setTargetAtTime(muted ? 0 : 0.7, AC.currentTime, 0.02);
    subs.forEach((f) => f());
  },
};

// React: whether sound is off, kept in step across every game and tab
export function useMuted() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => muted, () => false);
}

export default sfx;
