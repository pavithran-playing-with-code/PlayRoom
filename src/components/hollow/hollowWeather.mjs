// src/components/hollow/hollowWeather.mjs
// The night outside and the house's small noises, as pure functions of the
// run's clock (S.T): the pictures (hollowScene.js) and the sound
// (hollowAudio.js) both read them, so the gust that moves the curtain is the
// gust you hear, the flash is followed by its thunder, and the drop you see
// land in the puddle is the one you hear. No state, no Math.random.

const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// wind against the window, 0..1: a slow swell with sharper gusts on top
export function gust(T) {
  const base = 0.35 + 0.25 * Math.sin(T * 0.21) + 0.15 * Math.sin(T * 0.53 + 1.3);
  const g = Math.max(0, Math.sin(T * 0.9 + Math.sin(T * 0.31) * 2)) ** 6;
  return cl(base + 0.5 * g, 0, 1);
}

// cloud over the moon, 0 (clear) .. 0.85: mostly clear, now and then a long pass
export function cloud(T) {
  return cl(Math.sin(T * 0.07) * 0.7 + Math.sin(T * 0.029 + 2) * 0.6 - 0.25, 0, 0.85);
}

// lightning: one storm flash in each window of LP seconds, somewhere in it
export const LP = 41;
export function flashAt(k) { return k * LP + 14 + hash(k) * 22; }
// how bright the flash is now, 0..1: a flicker, a pause, a bigger one
export function lightning(T) {
  const k = Math.floor(T / LP), d = T - flashAt(k);
  if (d < 0 || d > 0.6) return 0;
  if (d < 0.07) return 0.7;
  if (d < 0.14) return 0.1;
  if (d < 0.22) return 1;
  return Math.max(0, 1 - (d - 0.22) / 0.38) * 0.6;
}
export const THUNDER_DELAY = 1.6;

// the leak: a drop every DRIP seconds from the ceiling into the puddle
export const DRIP = 2.6, DROP_FALL = 0.75;
export const LEAK = { x: 3.1, z: 1.25, r: 0.55, top: 9.5 };     // by where you wake up: the first thing you hear
// where the drop is in its fall, 0..1 (1 = landing now), or -1 between drops
export function dropAt(T) {
  const p = T % DRIP;
  return p < DROP_FALL ? p / DROP_FALL : -1;
}
