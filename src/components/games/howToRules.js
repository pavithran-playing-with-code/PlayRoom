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
      "Together: one stack for everyone. Pick a tile, and anyone can take it with its twin.",
      "Clear the board for a big bonus and a fresh one.",
    ],
    tip: "💡 Hint shows a pair (costs points). 🔀 Shuffle if you're stuck.",
  },
  memory: {
    name: "Memory Match",
    goal: "Find all 10 pairs before the clock runs out.",
    steps: ["Tap a card to turn it over, then another.", "Same picture: they stay up. Different: they turn back.", "Together: one deck for everyone. Turn the twin of anyone's card to make a pair."],
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
    steps: ["Tap the letters in the right order to spell the word.", "Tap a letter in your answer to take it back, or ⌫ Undo.", "A finished word checks itself.", "Together: each of you has your own word from one pile — solve enough as a team."],
    tip: "Look for the first letter and common endings like -ing, -er, -ed.",
  },
  arrows: {
    name: "Arrow Escape",
    goal: "Get every arrow off the board.",
    steps: ["Tap an arrow and it slides away along its path.", "It only moves if nothing is in front of its head.", "Clear a board to get a longer, twistier one."],
    tip: "Start with the arrows whose way out is already clear.",
  },
  dino: {
    name: "Dino Dash",
    goal: "Run as far as you can.",
    steps: ["Tap (or ▲) to jump the cacti.", "Hold Duck (or ▼) to get under the birds.", "A crash knocks you back to slow and costs a few points — keep running.", "Together: a crash knocks you down — a friend grabbing a ❤️ gets you up."],
    tip: "The faster you get, the earlier you need to jump.",
  },
  numbers: {
    name: "Number Rush",
    goal: "Tap the numbers in order, 1, 2, 3…",
    steps: ["Find 1, then 2, then 3 — as fast as you can.", "Clear a grid and the next is bigger, with colours and tilted numbers to fool you.", "Together: one grid — whoever taps the next number moves everyone on. Clear 5 grids to win."],
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
    steps: ["Tap a tile to turn its pipe.", "Pipes joined to the source fill with water.", "Join them all with no loose ends to clear the board.", "Together: one board — anyone can turn any pipe. Join 3 boards to win."],
    tip: "Start from the corners and edges — they can only turn so many ways.",
  },
  flappy: {
    name: "Flappy Dash",
    goal: "Fly through as many gaps as you can.",
    steps: ["Tap to flap — let go and you fall.", "Each gap you get through is 10 points.", "A crash costs 10 and dazes you, then you fly on.", "Together: a crash knocks you down — a friend flying through a ❤️ gets you up."],
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
    steps: ["Swipe ◀ ▶ to change lane.", "Swipe ▲ to jump barriers, ▼ to slide under bars.", "Swerve round the trains — you can't jump them.", "Together: a crash knocks you down — a friend grabbing a ❤️ gets you up."],
    tip: "Your score is metres run + 10 for every coin. A crash slows you right down.",
  },
  sunshard: {
    name: "Sunshard Jump",
    goal: "Jump across the floating islands, grab all 5 Sunshards and light the Sky Temple.",
    steps: ["Left half of the screen: the joystick (or W A S D) — put your thumb down anywhere there. Right half: drag to turn the camera.", "JUMP — and again in the air to double-jump. Hold JUMP after the double jump to glide.", "Land on a slime to knock it out. Touching one from the side costs a heart.", "Follow the golden arrow and the light beams. Blue rings move, cracked stones crumble, red mushrooms bounce you, wind vents lift you. Every zone has its own sky.", "Falling is fine: you're back at the last flag. Together: any of you can take a shard for everyone — and you're tied tail to tail, so stick close or the rope snaps."],
    tip: "First to light the temple wins.",
  },
  emberfall: {
    name: "Emberfall",
    goal: "Win back the three Ember Shards from their guardians, then defeat the Cinder Colossus.",
    steps: ["Pick a hero on the title screen, then New Journey (or Continue your last one).", "Drag on the left to move — push to the edge to sprint. Drag on the right to look, pinch to zoom.", "ATTACK (hold to chain three hits), ROLL dodges through blows, SLAM (Meteor Slam: leap and crash down) when the blue ring is full, HEAL drinks a potion. Hold JUMP in the air to glide, or at a wall to climb.", "A green button appears beside people, chests, horses and things to do: TALK, OPEN, RIDE, DO. Top right: Bag, emotes, camera and menu; tap the minimap to fast-travel to lit watchtowers.", "With a friend in the room, each of you explores your own island for now."],
    tip: "A red ring on the ground is a boss about to strike: roll out of it, or roll through the blow at the last moment to counter.",
  },
  hollow: {
    name: "Hollow Hours",
    goal: "Get out of the house: through every room to the top of the Bell Tower by midnight.",
    steps: ["Left thumb moves (a small push is a quiet walk), JUMP, hold GRAB to drag, tap it to pick up, throw, wind or pull. CROUCH to crawl under things. Keyboard: W A S D, Space, E, C, Shift to sneak.", "Jump at an edge to catch it, then push toward it (or jump) to climb up.", "The Keeper is blind: it hunts by sound. Sneak, keep to the carpet, hide under things or among the coats, throw a can to send it away.", "The Cuckoo comes out on the hour and sweeps its light: be behind something when it does.", "Together: you go on only when you're both through. Crouch to give a boost. If it catches either of you, you both start the room again."],
    tip: "When the Keeper stops breathing, it's listening. Freeze.",
  },
  speedway: {
    name: "Speedway",
    goal: "Win the race — 3 laps, 5 on a 3–4 minute clock, 8 on 5 minutes.",
    steps: ["Hold the left half of the screen to steer left, the right half to steer right. The pedal's down by itself.", "Keep holding through a bend and you drift: sparks go white, blue, orange, purple. Let go to boost — the longer the drift, the bigger.", "Both halves at once: brake. Yellow pads on the road boost you too.", "Keyboard: W A S D or the arrows, Shift or Space to drift."],
    tip: "Stay off the grass and away from the wall — both cost you speed.",
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
  manor: {
    name: "Station 13",
    goal: "Find 4 fuses, bring the power back, and get out through the elevator.",
    steps: ["Follow the green signs. Every fuse you take brings the lights back to another part of the building.", "It hunts by sound and sight: running is loud, the flashlight shows you, the dark hides you. Lit areas are safe to read, not safe to stand in.", "When it notices you, break its line of sight — round a corner, through a door.", "USE hides you in a locker. It can still find you if it saw you go in.", "Your flashlight drains, faster when it's close. Batteries lie about. With 4 fuses, run for the elevator."],
    tip: "Walk when you can. A running step carries three times as far.",
  },
};

const byName = new Map(Object.values(HOW_TO).map((h) => [h.name.toLowerCase(), h]));
export const howToFor = (slugOrName) => (slugOrName && (HOW_TO[slugOrName] || byName.get(String(slugOrName).toLowerCase()))) || null;
