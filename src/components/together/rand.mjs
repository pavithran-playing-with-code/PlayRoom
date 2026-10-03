// src/components/together/rand.mjs
// The seeded randomness the "together" games share with the server. The same
// Park-Miller generator as games/seededRand.js, but as an .mjs file so the
// server (CommonJS) can import it alongside the game rules.
export function seededRand(seed) {
  let s = (Number(seed) || 1) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export const randInt = (rand, min, max) => min + Math.floor(rand() * (max - min + 1));
export const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

export function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
