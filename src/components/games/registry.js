// src/components/games/registry.js
// Single source of truth for playable games. To add a game: build its component,
// then add one entry here. Lobby/Home/Room all read from this list.
import MahjongGame from "../MahjongGame";
import MemoryGame from "../MemoryGame";
import SpeedMath from "./SpeedMath";
import TapRush from "./TapRush";
import WordRush from "./WordRush";
import ArrowEscape from "./ArrowEscape";
import DinoDash from "./DinoDash";
import NumberRush from "./NumberRush";
import ColorDash from "./ColorDash";
import Pipes from "./Pipes";
import FlappyDash from "./FlappyDash";
import SlidePuzzle from "./SlidePuzzle";
import BlockDrop from "./BlockDrop";
import RoadHopper from "./RoadHopper";
import RailRunner from "./RailRunner";
import Speedway from "./Speedway";
import DodgeStorm from "./DodgeStorm";
import MazeRunner from "./MazeRunner";
import ManorGame from "./ManorGame";
import TypingRace from "./TypingRace";
import PianoTiles from "./PianoTiles";
import KitchenRush from "./KitchenRush";
import SunshardIslands from "./SunshardIslands";
import Emberfall from "./Emberfall";
import HollowGame from "./HollowGame";

// `col` is the game's colour across the whole product — Home tile header,
// Lobby picker, open-room card, peeking buddy. One game, one colour, everywhere.
//
// Optional:
//   coopMax          the game can be played together, on one side, by up
//                    to this many (the lobby offers it; rooms.mode 'coop')
//   defaultDuration  the clock the lobby picks when you choose this game
//   endless          no clock at all: always unlimited, and the lobby and the
//                    waiting room don't offer a match length
//   ownsSpectating   the game draws its own "who to watch" picker, so the
//                    room's is not laid over the top of it
//   coopDefault      "Play as a team" starts ticked for this game (the games
//                    made for it); otherwise the lobby starts it unticked
//   coopLabel        what playing as a team means in this game (a short line)
//   coopNote         what the waiting room says to a team room
export const GAMES = [
  {
    slug: "mahjong", name: "Mahjong Solitaire", icon: "🀄",
    blurb: "Match free tiles and clear the board before the clock stops.",
    minPlayers: 1, maxPlayers: 8, tag: "Classic", col: "var(--sun)",
    coopMax: 4,
    coopLabel: "one stack — take pairs together",
    coopNote: "One stack for all of you. Pick a tile, and anyone can take it with its twin. Clear the stack together to win.",
    Component: MahjongGame,
  },
  {
    slug: "memory", name: "Memory Match", icon: "🃏",
    blurb: "Flip cards, remember pairs, chain combos and clear deck after deck. Watch for the golden pair!",
    minPlayers: 1, maxPlayers: 8, tag: "Classic", col: "var(--coral)",
    coopMax: 4,
    coopLabel: "one deck — find the pairs together",
    coopNote: "One deck for all of you. Each of you turns one card at a time — turn the twin of anyone's card to make a pair. Clear the deck together to win.",
    Component: MemoryGame,
  },
  {
    slug: "speedmath", name: "Speed Math", icon: "➗",
    blurb: "Sums that climb from + to ÷ and two-step puzzles. Answer fast for bonuses, build a ×2 streak, grab the ★ gold sums.",
    minPlayers: 1, maxPlayers: 8, tag: "Brain", col: "var(--mint)",
    Component: SpeedMath,
  },
  {
    slug: "reaction", name: "Tap Rush", icon: "⚡",
    blurb: "Smash the lit tiles, build a ×4 streak, crack the ice, grab the gold. Touch a bomb and the streak's gone.",
    minPlayers: 1, maxPlayers: 8, tag: "Reflex", col: "var(--sky)",
    Component: TapRush,
  },
  {
    slug: "wordrush", name: "Word Rush", icon: "🔤",
    blurb: "Unscramble as many words as you can before time runs out.",
    minPlayers: 1, maxPlayers: 8, tag: "Word", col: "var(--lime)",
    coopMax: 4,
    coopLabel: "one pile of words — solve them together",
    coopNote: "One pile of words for all of you — each of you works on your own word. Solve enough together to reach the goal.",
    Component: WordRush,
  },
  {
    slug: "arrows", name: "Arrow Escape", icon: "🏹",
    blurb: "Slide arrows off the board, but only if their path is clear. Golden arrows, bomb arrows, big streaks.",
    minPlayers: 1, maxPlayers: 8, tag: "Puzzle", col: "var(--bubble)",
    Component: ArrowEscape,
  },
  {
    slug: "dino", name: "Dino Dash", icon: "🦖",
    blurb: "Jump the cacti, duck the birds. Crash and you're back to slow, so keep running.",
    minPlayers: 1, maxPlayers: 8, tag: "Reflex", col: "var(--leaf)",
    coopMax: 4,
    coopLabel: "run side by side — save each other with ❤️",
    coopNote: "Run the same course side by side. A crash knocks you down — a friend's ❤️ gets you up. Your points add up to the team's.",
    Component: DinoDash,
  },
  {
    slug: "numbers", name: "Number Rush", icon: "🔢",
    blurb: "Tap 1, 2, 3… in order. Build a rush, grab the golden number — and watch out, the tiles shuffle.",
    minPlayers: 1, maxPlayers: 8, tag: "Focus", col: "var(--ice)",
    coopMax: 4,
    coopLabel: "one grid — count together",
    coopNote: "One grid for all of you. Whoever taps the next number moves everyone on. Clear 5 grids together to win.",
    Component: NumberRush,
  },
  {
    slug: "colors", name: "Color Dash", icon: "🎨",
    blurb: "Find the colour before the bar runs out — then word-vs-ink tricks and odd-one-out shades. Streaks score big.",
    minPlayers: 1, maxPlayers: 8, tag: "Reflex", col: "var(--berry)",
    Component: ColorDash,
  },
  {
    slug: "pipes", name: "Pipes", icon: "🚰",
    blurb: "Turn the pipes until every one joins up to the source. No loose ends!",
    minPlayers: 1, maxPlayers: 8, tag: "Puzzle", col: "var(--pipe)",
    coopMax: 4,
    coopLabel: "one board — join the pipes together",
    coopNote: "One board for all of you — anyone can turn any pipe. Join 3 boards together to win.",
    Component: Pipes,
  },
  {
    slug: "flappy", name: "Flappy Dash", icon: "🐤",
    blurb: "Tap to flap. Squeeze through the pipes and try not to meet one.",
    minPlayers: 1, maxPlayers: 8, tag: "Reflex", col: "var(--chick)",
    coopMax: 4,
    coopLabel: "fly side by side — save each other with ❤️",
    coopNote: "Run the same course side by side. A crash knocks you down — a friend's ❤️ gets you up. Your points add up to the team's.",
    Component: FlappyDash,
  },
  {
    slug: "slide", name: "Slide Puzzle", icon: "🔀",
    blurb: "Slide the tiles back in order — then bigger boards and picture puzzles. Fewer moves, more points.",
    minPlayers: 1, maxPlayers: 8, tag: "Puzzle", col: "var(--slate)",
    Component: SlidePuzzle,
  },
  {
    slug: "blocks", name: "Block Blast", icon: "🧱",
    blurb: "Fit the pieces in and clear whole rows and columns.",
    minPlayers: 1, maxPlayers: 8, tag: "Classic", col: "var(--brick)",
    Component: BlockDrop,
  },
  {
    // the "racer" slot: Turbo Racer once, now Road Hopper (the slug stays, so
    // old rooms and results still line up)
    slug: "racer", name: "Road Hopper", icon: "🐔",
    blurb: "Hop across roads, rivers and railways — how far can you get?",
    minPlayers: 1, maxPlayers: 8, tag: "Arcade", col: "var(--slate)",
    Component: RoadHopper,
  },
  {
    slug: "runner", name: "Rail Runner", icon: "🏃",
    blurb: "Run the rails: jump the barriers, slide under the bars, dodge the trains.",
    minPlayers: 1, maxPlayers: 8, tag: "Arcade", col: "var(--coral)",
    coopMax: 4,
    coopLabel: "run side by side — save each other with ❤️",
    coopNote: "Run the same course side by side. A crash knocks you down — a friend's ❤️ gets you up. Your points add up to the team's.",
    Component: RailRunner,
  },
  {
    slug: "speedway", name: "Speedway", icon: "🏁",
    blurb: "Top-down drift racing. Slide the corners to charge a boost — first across the line wins.",
    minPlayers: 1, maxPlayers: 8, tag: "Arcade", col: "var(--sky)",
    Component: Speedway,
  },
  {
    slug: "storm", name: "Dodge Storm", icon: "⚡",
    blurb: "Stay alive while the shards close in from every side.",
    minPlayers: 1, maxPlayers: 8, tag: "Arcade", col: "var(--berry)",
    Component: DodgeStorm,
  },
  {
    slug: "maze", name: "Maze Runner", icon: "🧭",
    blurb: "One way out, and it gets bigger every time you find it.",
    minPlayers: 1, maxPlayers: 8, tag: "Brain", col: "var(--leaf)",
    coopMax: 4, defaultDuration: 300,
    coopLabel: "one maze — find the key, open the door",
    coopNote: "One maze for all of you. Someone finds the 🗝️, then anyone can open the 🚪 — and you all go on to a bigger one.",
    Component: MazeRunner,
  },
  {
    slug: "typing", name: "Typing Race", icon: "⌨️",
    blurb: "Type the words as fast as you can. Same words for everyone, streaks score big.",
    minPlayers: 1, maxPlayers: 8, tag: "Speed", col: "var(--ice)",
    Component: TypingRace,
  },
  {
    slug: "piano", name: "Piano Tiles", icon: "🎹",
    blurb: "Tap the black tiles, never the white. Every tile is the next note of the song.",
    minPlayers: 1, maxPlayers: 8, tag: "Speed", col: "var(--bubble)",
    Component: PianoTiles,
  },
  {
    slug: "kitchen", name: "Kitchen Rush", icon: "🍳",
    blurb: "Chop, cook, plate up and serve before the orders run out. Best with friends in one kitchen.",
    minPlayers: 1, maxPlayers: 8, tag: "Together", col: "var(--peach)",
    coopMax: 4, coopDefault: true, defaultDuration: 300, ownsSpectating: true,
    coopLabel: "one kitchen, every cook in it",
    coopNote: "One kitchen for all of you: split the work — chop, cook, plate up and serve.",
    Component: KitchenRush,
  },
  {
    slug: "manor", name: "Station 13", icon: "🏥",
    blurb: "A dark hospital and something that hunts by sound. Find 4 fuses, bring the power back, reach the elevator.",
    minPlayers: 1, maxPlayers: 8, tag: "Horror", col: "var(--grape)",
    coopMax: 4, coopDefault: true, defaultDuration: 0, endless: true, ownsSpectating: true,
    coopLabel: "one fuse count — out through the elevator together",
    coopNote: "You're all on one side: any of you can take a fuse for everyone. Split up, keep to the light, hide in lockers — a caught friend wakes back in the Main Hall.",
    Component: ManorGame,
  },
  {
    slug: "sunshard", name: "Sunshard Jump", icon: "🏝️",
    blurb: "A 3D jumping game: jump, double-jump and glide across floating islands, grab 5 Sunshards and light the Sky Temple.",
    minPlayers: 1, maxPlayers: 8, tag: "Adventure", col: "var(--sky)",
    coopMax: 4, coopDefault: true, defaultDuration: 0, endless: true,
    coopLabel: "one shard count — light the temple together",
    coopNote: "One shard count for all of you: any of you can take a Sunshard for everyone, and when one of you lights the temple, you all go on to the next island. You're chained together — you can't get too far apart.",
    Component: SunshardIslands,
  },
  {
    slug: "emberfall", name: "Emberfall", icon: "🔥",
    blurb: "A 3D island adventure: pick a hero, beat three guardians for their Ember Shards, then the Cinder Colossus.",
    minPlayers: 1, maxPlayers: 1, tag: "Adventure", col: "var(--coral)",   // solo only, for now
    defaultDuration: 0, endless: true,
    Component: Emberfall,
  },
  {
    slug: "hollow", name: "Hollow Hours", icon: "🕰️",
    blurb: "A side-on horror adventure: a tiny child in a house built for giants. Sneak past the Keeper, hide from the Cuckoo, climb the Bell Tower by midnight.",
    minPlayers: 1, maxPlayers: 2, tag: "Horror", col: "var(--grape)",
    coopMax: 2, coopDefault: true, defaultDuration: 0, endless: true,
    coopLabel: "one chapter — through every room together",
    coopNote: "You go on to each room only when both of you are through. Crouch to give your friend a boost; at the top of the tower, pull the two levers together. If it catches either of you, you both start that room again.",
    Component: HollowGame,
  },
];

export const GAME_MAP = Object.fromEntries(GAMES.map((g) => [g.slug, g]));

export function getGame(slug) {
  return GAME_MAP[slug] || null;
}

export function getGameComponent(slug) {
  return (GAME_MAP[slug] || GAME_MAP.mahjong).Component;
}
