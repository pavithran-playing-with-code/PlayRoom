// src/components/games/pianoSongs.js
// Piano Tiles' songs: what's played, and how hard each one is.
//
// The room's seed decides the song: SONGS[seed % SONGS.length]. Picking a
// song in the lobby makes the server choose a seed that lands on it
// (routes/rooms.js, PIANO_SONGS — keep it equal to SONGS.length; the piano
// check proves it), so everyone in the room plays the one the host picked,
// and a rematch keeps it.
//
// Notes are MIDI numbers. The tiles follow the tune: a higher note sits
// further right.

export const LEVELS = {
  //          rows/s at the start, top speed, long tiles, two-at-once rows
  easy:   { label: "Easy",   base: 2.0, max: 5.0, long: 0.07, double: 0 },
  medium: { label: "Medium", base: 2.4, max: 7.0, long: 0.13, double: 0.07 },
  hard:   { label: "Hard",   base: 3.0, max: 8.5, long: 0.18, double: 0.15 },
};

export const SONGS = [
  { name: "Twinkle Twinkle", icon: "⭐", level: "easy",
    notes: [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60,
      67, 67, 65, 65, 64, 64, 62, 67, 67, 65, 65, 64, 64, 62] },
  { name: "Happy Birthday", icon: "🎂", level: "easy",
    notes: [60, 60, 62, 60, 65, 64, 60, 60, 62, 60, 67, 65,
      60, 60, 72, 69, 65, 64, 62, 70, 70, 69, 65, 67, 65] },
  { name: "Ode to Joy", icon: "🎻", level: "medium",
    notes: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62,
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60] },
  { name: "Jingle Bells", icon: "🔔", level: "medium",
    notes: [64, 64, 64, 64, 64, 64, 64, 67, 60, 62, 64,
      65, 65, 65, 65, 65, 64, 64, 64, 64, 62, 62, 64, 62, 67] },
  { name: "Für Elise", icon: "🎹", level: "hard",
    notes: [76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 68, 71, 72,
      64, 76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 72, 71, 69] },
  { name: "Canon in D", icon: "🕊️", level: "hard",
    notes: [78, 76, 74, 73, 71, 69, 71, 73, 74, 73, 71, 69, 67, 66, 67, 64,
      62, 66, 69, 67, 66, 62, 66, 64, 62, 59, 62, 69, 67, 71, 69, 67] },
  { name: "The Entertainer", icon: "🎩", level: "hard",
    notes: [62, 63, 64, 72, 64, 72, 64, 72, 72, 74, 75, 76, 72, 74, 76, 71, 74, 72,
      62, 63, 64, 72, 64, 72, 64, 72, 69, 67, 66, 69, 72, 76, 74, 72, 69, 74] },
];

export const songFor = (seed) => SONGS[Math.abs(Math.floor(Number(seed) || 0)) % SONGS.length];
export const songIndex = (seed) => Math.abs(Math.floor(Number(seed) || 0)) % SONGS.length;
