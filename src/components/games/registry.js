// src/components/games/registry.js
// Single source of truth for playable games. To add a game: build its component,
// then add one entry here. Lobby/Home/Room all read from this list.
import MahjongGame from "../MahjongGame";
import MemoryGame from "../MemoryGame";
import SpeedMath from "./SpeedMath";
import TapRush from "./TapRush";
import WordRush from "./WordRush";
import ArrowEscape from "./ArrowEscape";
import MissingPiece from "./MissingPiece";
import DinoDash from "./DinoDash";
import NumberRush from "./NumberRush";
import ColorDash from "./ColorDash";
import Pipes from "./Pipes";
import FlappyDash from "./FlappyDash";
import SlidePuzzle from "./SlidePuzzle";
import BlockDrop from "./BlockDrop";
import TurboRacer from "./TurboRacer";
import RailRunner from "./RailRunner";
import Speedway from "./Speedway";
import DodgeStorm from "./DodgeStorm";
import MazeRunner from "./MazeRunner";
import ManorGame from "./ManorGame";
import TypingRace from "./TypingRace";
import PianoTiles from "./PianoTiles";
import KitchenRush from "./KitchenRush";
import BombSquad from "./BombSquad";
import TowerGuard from "./TowerGuard";
import CarromGame from "./CarromGame";

// `col` is the game's colour across the whole product — Home tile header,
// Lobby picker, open-room card, peeking buddy. One game, one colour, everywhere.
//
// Optional:
//   coopMax          the game can be played together, on one side, by up
//                    to this many (the lobby offers it; rooms.mode 'coop')
//   defaultDuration  the clock the lobby picks when you choose this game
//   ownsSpectating   the game draws its own "who to watch" picker, so the
//                    room's is not laid over the top of it
//   coopLabel        the lobby's "Play together — …" line for this game
//   seatChoices      the only seat counts this game can be played with, each
//                    with its button and its line; four seats means teams
//   coopNote         what the waiting room says to a together room
export const GAMES = [
  {
    slug: "mahjong", name: "Mahjong Solitaire", icon: "🀄",
    blurb: "Match free tiles and clear the board before the clock stops.",
    minPlayers: 1, maxPlayers: 8, tag: "Classic", col: "var(--sun)",
    Component: MahjongGame,
  },
  {
    slug: "memory", name: "Memory Match", icon: "🃏",
    blurb: "Flip cards, remember pairs, race everyone else to the last one.",
    minPlayers: 1, maxPlayers: 8, tag: "Classic", col: "var(--coral)",
    Component: MemoryGame,
  },
  {
    slug: "speedmath", name: "Speed Math", icon: "➗",
    blurb: "Answer fast, build a streak, watch the bonus points stack up.",
    minPlayers: 1, maxPlayers: 8, tag: "Brain", col: "var(--mint)",
    Component: SpeedMath,
  },
  {
    slug: "reaction", name: "Tap Rush", icon: "⚡",
    blurb: "Smash the lit tiles. Touch a bomb and you lose the streak.",
    minPlayers: 1, maxPlayers: 8, tag: "Reflex", col: "var(--sky)",
    Component: TapRush,
  },
  {
    slug: "wordrush", name: "Word Rush", icon: "🔤",
    blurb: "Unscramble as many words as you can before time runs out.",
    minPlayers: 1, maxPlayers: 8, tag: "Word", col: "var(--lime)",
    Component: WordRush,
  },
  {
    slug: "arrows", name: "Arrow Escape", icon: "🏹",
    blurb: "Tap an arrow to slide it off the board, but only if its path is clear.",
    minPlayers: 1, maxPlayers: 8, tag: "Puzzle", col: "var(--bubble)",
    Component: ArrowEscape,
  },
  {
    slug: "jigsaw", name: "Missing Piece", icon: "🧩",
    blurb: "A piece of the picture is gone. Spot the one that fits before your friends do.",
    minPlayers: 1, maxPlayers: 8, tag: "Puzzle", col: "var(--peach)",
    Component: MissingPiece,
  },
  {
    slug: "dino", name: "Dino Dash", icon: "🦖",
    blurb: "Jump the cacti, duck the birds. Crash and you're back to slow, so keep running.",
    minPlayers: 1, maxPlayers: 8, tag: "Reflex", col: "var(--leaf)",
    Component: DinoDash,
  },
  {
    slug: "numbers", name: "Number Rush", icon: "🔢",
    blurb: "Tap 1, 2, 3… in order. Every grid you clear brings a bigger, busier one.",
    minPlayers: 1, maxPlayers: 8, tag: "Focus", col: "var(--ice)",
    Component: NumberRush,
  },
  {
    slug: "colors", name: "Color Dash", icon: "🎨",
    blurb: "Find the colour on the card before the bar runs out. Streaks score big.",
    minPlayers: 1, maxPlayers: 8, tag: "Reflex", col: "var(--berry)",
    Component: ColorDash,
  },
  {
    slug: "pipes", name: "Pipes", icon: "🚰",
    blurb: "Turn the pipes until every one joins up to the source. No loose ends!",
    minPlayers: 1, maxPlayers: 8, tag: "Puzzle", col: "var(--pipe)",
    Component: Pipes,
  },
  {
    slug: "flappy", name: "Flappy Dash", icon: "🐤",
    blurb: "Tap to flap. Squeeze through the pipes and try not to meet one.",
    minPlayers: 1, maxPlayers: 8, tag: "Reflex", col: "var(--chick)",
    Component: FlappyDash,
  },
  {
    slug: "slide", name: "Slide Puzzle", icon: "🔀",
    blurb: "Slide the tiles until 1–8 are back in order. Fewer moves, more points.",
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
    slug: "racer", name: "Turbo Racer", icon: "🏎️",
    blurb: "Swerve through the traffic, grab the coins, never slow down.",
    minPlayers: 1, maxPlayers: 8, tag: "Arcade", col: "var(--slate)",
    Component: TurboRacer,
  },
  {
    slug: "runner", name: "Rail Runner", icon: "🏃",
    blurb: "Run the rails: jump the barriers, slide under the bars, dodge the trains.",
    minPlayers: 1, maxPlayers: 8, tag: "Arcade", col: "var(--coral)",
    Component: RailRunner,
  },
  {
    slug: "speedway", name: "Speedway", icon: "🏁",
    blurb: "Three laps, one road, everyone on it at once. First across the line wins.",
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
    coopMax: 4, defaultDuration: 180, ownsSpectating: true,
    coopLabel: "one kitchen, every cook in it",
    coopNote: "One kitchen for all of you: split the work — chop, cook, plate up and serve.",
    Component: KitchenRush,
  },
  {
    slug: "bomb", name: "Bomb Squad", icon: "💣",
    blurb: "One of you sees the bomb, the rest have the manual. Talk it through before the timer runs out.",
    minPlayers: 1, maxPlayers: 8, tag: "Together", col: "var(--coral)",
    coopMax: 4, defaultDuration: 300, ownsSpectating: true,
    coopLabel: "one bomb, one defuser, everyone else reads the manual",
    coopNote: "One of you sees the bomb, the rest of you read the manual — talk! Each new bomb goes to the next player.",
    Component: BombSquad,
  },
  {
    slug: "tower", name: "Tower Guard", icon: "🏰",
    blurb: "Build towers along the road and keep the monsters off your castle. Together, defend one castle.",
    minPlayers: 1, maxPlayers: 8, tag: "Together", col: "var(--leaf)",
    coopMax: 4, defaultDuration: 300, ownsSpectating: true,
    coopLabel: "one castle, a purse each",
    coopNote: "One map, one castle: build together and keep it standing to the end. Every kill pays all of you.",
    Component: TowerGuard,
  },
  {
    slug: "carrom", name: "Carrom", icon: "⚫⚪",          // drawn as a little board by GameIcon
    blurb: "Flick the striker, pocket your colour, cover the queen. Against the computer, 1 v 1, or 2 v 2.",
    minPlayers: 1, maxPlayers: 4, tag: "Classic", col: "var(--brick)",
    defaultDuration: 300, ownsSpectating: true,
    seatChoices: [
      { n: 1, label: "🤖 vs Computer", hint: "🤖 You against the computer — pick Easy, Medium or Hard when it starts." },
      { n: 2, label: "👥 1 v 1", hint: "👥 You and a friend, head to head. No computer." },
      { n: 4, label: "👥👥 2 v 2", hint: "👥👥 Two teams of two, partners opposite. Pick teams in the waiting room." },
    ],
    Component: CarromGame,
  },
  {
    slug: "manor", name: "Hollow Manor", icon: "🏚️",
    blurb: "Take your relics and get out before the house finds you. Race, team up, or survive it together.",
    minPlayers: 1, maxPlayers: 8, tag: "Horror", col: "var(--grape)",
    coopMax: 4, defaultDuration: 300, ownsSpectating: true,
    coopLabel: "everyone gets out, or nobody does",
    coopNote: "You're all on one side: take every relic, and every one of you gets out — or none of you does.",
    Component: ManorGame,
  },
];

export const GAME_MAP = Object.fromEntries(GAMES.map((g) => [g.slug, g]));

export function getGame(slug) {
  return GAME_MAP[slug] || null;
}

export function getGameComponent(slug) {
  return (GAME_MAP[slug] || GAME_MAP.mahjong).Component;
}
