// src/components/games/registry.js
// Single source of truth for playable games. To add a game: build its component,
// then add one entry here. Lobby/Home/Room all read from this list.
import MahjongGame from "../MahjongGame";
import MemoryGame from "../MemoryGame";
import SpeedMath from "./SpeedMath";
import TapRush from "./TapRush";
import WordRush from "./WordRush";
import ArrowEscape from "./ArrowEscape";

// `col` is the game's colour across the whole product — Home tile header,
// Lobby picker, open-room card, peeking buddy. One game, one colour, everywhere.
export const GAMES = [
  {
    slug: "mahjong", name: "Mahjong Solitaire", icon: "🀄",
    blurb: "Match free tiles and clear the board before the clock stops.",
    minPlayers: 1, maxPlayers: 2, tag: "Classic", col: "var(--sun)",
    Component: MahjongGame,
  },
  {
    slug: "memory", name: "Memory Match", icon: "🃏",
    blurb: "Flip cards, remember pairs, race everyone else to the last one.",
    minPlayers: 1, maxPlayers: 4, tag: "Classic", col: "var(--coral)",
    Component: MemoryGame,
  },
  {
    slug: "speedmath", name: "Speed Math", icon: "➗",
    blurb: "Answer fast, build a streak, watch the bonus points stack up.",
    minPlayers: 1, maxPlayers: 4, tag: "Brain", col: "var(--mint)",
    Component: SpeedMath,
  },
  {
    slug: "reaction", name: "Tap Rush", icon: "⚡",
    blurb: "Smash the lit tiles. Touch a bomb and you lose the streak.",
    minPlayers: 1, maxPlayers: 4, tag: "Reflex", col: "var(--sky)",
    Component: TapRush,
  },
  {
    slug: "wordrush", name: "Word Rush", icon: "🔤",
    blurb: "Unscramble as many words as you can before time runs out.",
    minPlayers: 1, maxPlayers: 4, tag: "Word", col: "var(--lime)",
    Component: WordRush,
  },
  {
    slug: "arrows", name: "Arrow Escape", icon: "🏹",
    blurb: "Tap an arrow to slide it off the board, but only if its path is clear.",
    minPlayers: 1, maxPlayers: 4, tag: "Puzzle", col: "var(--bubble)",
    Component: ArrowEscape,
  },
];

export const GAME_MAP = Object.fromEntries(GAMES.map((g) => [g.slug, g]));

export function getGame(slug) {
  return GAME_MAP[slug] || null;
}

export function getGameComponent(slug) {
  return (GAME_MAP[slug] || GAME_MAP.mahjong).Component;
}
