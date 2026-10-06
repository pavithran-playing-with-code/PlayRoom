// src/components/games/howToRules.js
// How to play each game: what you're trying to do, how, and one tip. Shown
// in the lobby (before a solo run starts), in the waiting room, and behind
// the ? in every game's top bar (GameFrame looks it up by the game's name).
//
// Keep it short — it's read on a phone in a few seconds — and keep it true
// to the rules: when a game's rules change, change its card here too.

export const HOW_TO = {
  mahjong: {
    name: "Mahjong Solitaire",
    goal: "Clear the stack of tiles by matching pairs.",
    steps: [
      "Tap two tiles with the same picture to take them off.",
      "Only free tiles can be taken: nothing on top, and an open side to the left or right.",
      "Greyed tiles are stuck for now — take the ones around them first.",
      "Clear the board for a big bonus and a fresh one.",
    ],
    tip: "💡 Hint shows a pair (costs points). 🔀 Shuffle if you're stuck.",
  },
  memory: {
    name: "Memory Match",
    goal: "Find all 10 pairs before the clock runs out.",
    steps: ["Tap a card to turn it over, then another.", "Same picture: they stay up. Different: they turn back."],
    tip: "Remember where each picture was — the faster you finish, the more you score.",
  },
  speedmath: {
    name: "Speed Math",
    goal: "Solve as many sums as you can.",
    steps: ["A sum appears at the top.", "Tap the right answer from the choices.", "Everyone in the room gets the same sums."],
    tip: "Speed matters, but a wrong answer costs you — be quick, not careless.",
  },
  reaction: {
    name: "Tap Rush",
    goal: "Tap the tiles as they light up — fast.",
    steps: ["A tile lights up: tap it for points.", "Watch out for 💣 tiles — don't tap those!"],
    tip: "Keep your thumb in the middle so every tile is close.",
  },
  wordrush: {
    name: "Word Rush",
    goal: "Unscramble as many words as you can.",
    steps: ["Tap the letters in the right order to spell the word.", "Tap a letter in your answer to take it back, or ⌫ Undo.", "A finished word checks itself."],
    tip: "Look for the first letter and common endings like -ing, -er, -ed.",
  },
  arrows: {
    name: "Arrow Escape",
    goal: "Get every arrow off the board.",
    steps: ["Tap an arrow and it slides away along its path.", "It only moves if nothing is in front of its head.", "Clear a board to get a longer, twistier one."],
    tip: "Start with the arrows whose way out is already clear.",
  },
  jigsaw: {
    name: "Missing Piece",
    goal: "Find the piece that fills the gap.",
    steps: ["A picture has one jigsaw piece missing.", "Tap the piece that fits the hole — shape and picture both."],
    tip: "Check the bumps and dents of the hole first, then the colours.",
  },
  dino: {
    name: "Dino Dash",
    goal: "Run as far as you can.",
    steps: ["Tap (or ▲) to jump the cacti.", "Hold Duck (or ▼) to get under the birds.", "A crash knocks you back to slow and costs a few points — keep running."],
    tip: "The faster you get, the earlier you need to jump.",
  },
  numbers: {
    name: "Number Rush",
    goal: "Tap the numbers in order, 1, 2, 3…",
    steps: ["Find 1, then 2, then 3 — as fast as you can.", "Clear a grid and the next is bigger, with colours and tilted numbers to fool you."],
    tip: "Look ahead for the next number while you tap this one.",
  },
  colors: {
    name: "Color Dash",
    goal: "Tap the colour that's named — before time's up.",
    steps: ["A colour is named at the top.", "Tap the matching swatch within 1.5 seconds.", "Right taps build a streak worth more; a wrong tap costs points."],
    tip: "Match the swatch shown with the name — don't stop to read.",
  },
  pipes: {
    name: "Pipes",
    goal: "Connect every pipe to the water.",
    steps: ["Tap a tile to turn its pipe.", "Pipes joined to the source fill with water.", "Join them all with no loose ends to clear the board."],
    tip: "Start from the corners and edges — they can only turn so many ways.",
  },
  flappy: {
    name: "Flappy Dash",
    goal: "Fly through as many gaps as you can.",
    steps: ["Tap to flap — let go and you fall.", "Each gap you get through is 10 points.", "A crash costs 10 and dazes you, then you fly on."],
    tip: "Small, steady taps beat big panicky ones.",
  },
  slide: {
    name: "Slide Puzzle",
    goal: "Put the tiles back in order 1–8.",
    steps: ["Tap a tile next to the empty space to slide it in.", "Get 1 to 8 in order with the gap at the end."],
    tip: "Fewer moves score more. Solve the top row first, then the rest.",
  },
  blocks: {
    name: "Block Blast",
    goal: "Fill rows and columns to blast them.",
    steps: ["Drag a piece from the tray onto the board.", "Fill a whole row or column and it clears.", "Out of room? The board is swept and you keep your score."],
    tip: "Keep a space free for the big pieces.",
  },
  racer: {
    name: "Road Hopper",
    goal: "Hop as far as you can across roads, rivers and railways.",
    steps: ["Tap to hop forward. Swipe left, right or down to hop that way.", "Roads: wait for a gap in the cars. Rivers: hop on the logs — the water's deadly.", "Railways: when the red light flashes, a train is coming!", "Don't hang about — fall too far behind and the eagle gets you."],
    tip: "10 points a row, 25 a coin. A crash puts you back a few rows — keep going.",
  },
  runner: {
    name: "Rail Runner",
    goal: "Run as far as you can and grab coins.",
    steps: ["Swipe ◀ ▶ to change lane.", "Swipe ▲ to jump barriers, ▼ to slide under bars.", "Swerve round the trains — you can't jump them."],
    tip: "Your score is metres run + 10 for every coin. A crash slows you right down.",
  },
  speedway: {
    name: "Speedway",
    goal: "Win the 3-lap race.",
    steps: ["Tilt the phone like a wheel, hold either side of the road, or use ◀ ▶ to steer.", "Drive over a glowing ⚡ pad and you boost by yourself — no button.", "The map in the corner shows where every car is."],
    tip: "Stay off the grass — it's slow, and turbo won't work there.",
  },
  storm: {
    name: "Dodge Storm",
    goal: "Survive the storm.",
    steps: ["Drag anywhere (or hold the arrow keys) to move.", "Don't touch the shards — skimming past them earns a bonus.", "A hit costs a few points, then you carry on."],
    tip: "Keep to open space, not the corners.",
  },
  maze: {
    name: "Maze Runner",
    goal: "Find the way out of each maze.",
    steps: ["Swipe or tap an arrow: the ball rolls to the next turning.", "Reach the 🚩 for a bigger maze.", "Together: someone finds the 🗝️, then anyone reaches the 🚪 to take everyone through."],
    tip: "Fewer moves score more.",
  },
  typing: {
    name: "Typing Race",
    goal: "Type as many words as you can.",
    steps: ["Type the highlighted word, then press space.", "Your car drives as you type — friends race in the lanes above.", "A wrong letter makes your car sputter; a missed word spins it out."],
    tip: "Accuracy builds your streak, and the streak builds your score.",
  },
  piano: {
    name: "Piano Tiles",
    goal: "Play the song — tap the black tiles.",
    steps: ["Tap the lowest black tile, then the next.", "Hold the long tiles until they've rolled past.", "Two in one row? Tap both.", "Don't tap the white."],
    tip: "Pick your song in the lobby: Easy, Medium or Hard.",
  },
  kitchen: {
    name: "Kitchen Rush",
    goal: "Cook the orders before they run out.",
    steps: ["Take food from the crates. Chop 🥬🍅🧀 on a 🔪 board.", "Grill 🥩 on a stove — take it off before it burns.", "Put everything on a plate and hand it in at SERVE.", "Walk with the stick; tap a counter or press Use."],
    tip: "Together, split the jobs: one chops, one cooks.",
  },
  bomb: {
    name: "Bomb Blast",
    goal: "Be the last bomber standing.",
    steps: ["Move with the stick. 💣 drops a bomb.", "Blasts break bricks and knock out bombers — including you!", "Grab power-ups: 💣 more bombs, 🔥 bigger blasts, 👟 speed."],
    tip: "Drop a bomb, then get round a corner before it goes off.",
  },
  tower: {
    name: "Tower Guard",
    goal: "Stop the monsters reaching your castle.",
    steps: ["Tap the grass beside the road to build a tower.", "🏹 archers are quick, 💣 cannons hit groups, ❄️ frost slows.", "Tap a tower to upgrade or sell it.", "Every monster stopped earns coins."],
    tip: "Send the next wave early with Send now for a bonus.",
  },
  carrom: {
    name: "Carrom",
    goal: "Pocket all your coins first.",
    steps: ["1 · Slide the striker along your line (drag it, or the slider).", "2 · Touch the board where you want it to go — an arrow shows the line.", "3 · Hold 🎯 Shoot: the power goes up and down — let go to shoot. 30 seconds a turn.", "Pocket your colour and you go again. Pocket the red queen, then one of yours straight after to keep her.", "Pocketing the striker is a foul."],
    tip: "Aim to send coins into the corner pockets, not straight at them.",
  },
  manor: {
    name: "Nana's Lullaby",
    goal: "Find the 3 keys and get out the front door.",
    steps: ["While Nana hums, you can move.", "When the humming stops, freeze — she hears every step.", "Use: open doors, hide in beds and wardrobes, flip light switches.", "Light: your own torch. Chased? Light off and stand still in the dark — she loses you and wanders off.", "Lit rooms show you to her — but she puts the lights out when she walks in."],
    tip: "Left thumb moves, right thumb looks. Push the stick far to run.",
  },
};

const byName = new Map(Object.values(HOW_TO).map((h) => [h.name.toLowerCase(), h]));
export const howToFor = (slugOrName) => (slugOrName && (HOW_TO[slugOrName] || byName.get(String(slugOrName).toLowerCase()))) || null;
