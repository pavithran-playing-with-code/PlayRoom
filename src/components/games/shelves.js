// src/components/games/shelves.js
// How the Play page groups the games into rows. Display only: the order
// within a row is still the database's (useGames), and a game no row names
// (a new one) lands on "More games" so it never goes missing.
export const SHELVES = [
  { key: "quick",   title: "⚡ Quick & brainy",     games: ["speedmath", "reaction", "wordrush", "typing", "colors", "numbers"] },
  { key: "puzzle",  title: "🧩 Puzzles & classics", games: ["mahjong", "memory", "arrows", "pipes", "slide", "blocks", "maze"] },
  { key: "action",  title: "🏁 Racing & action",    games: ["speedway", "dino", "flappy", "racer", "runner", "storm", "piano"] },
  { key: "big",     title: "🌋 Big adventures",     games: ["kitchen", "manor", "sunshard", "emberfall", "hollow"] },
];

// [{ key, title, games: [registry entries] }], empty rows dropped.
export function shelve(games) {
  const placed = new Set(SHELVES.flatMap((s) => s.games));
  const rows = SHELVES.map((s) => ({ ...s, games: games.filter((g) => s.games.includes(g.slug)) }));
  const rest = games.filter((g) => !placed.has(g.slug));
  if (rest.length) rows.push({ key: "more", title: "🎲 More games", games: rest });
  return rows.filter((r) => r.games.length);
}
