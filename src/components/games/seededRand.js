// src/components/games/seededRand.js
// Shared deterministic RNG (Lehmer/Park-Miller). Same seed → same sequence, so
// every player in a room gets an identical board/problem set for fair races.
export function seededRand(seed) {
  let s = (Number(seed) || 1) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// Convenience: integer in [min, max] inclusive from a rand() function.
export function randInt(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

// Fisher–Yates shuffle (in place) using a rand() function.
export function shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
