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
      "Quick matches in a row build a combo worth more. From board 2, the ★ golden pair pays double.",
      "Together: one stack for everyone. Pick a tile, and anyone can take it with its twin.",
      "Clear the board for a big bonus and a fresh one. The corner says how many moves are open.",
    ],
    tip: "💡 Hint shows a pair (costs points). 🔀 Shuffle if you're stuck.",
  },
  memory: {
    name: "Memory Match",
    goal: "Find the pairs — and clear as many decks as you can before the clock runs out.",
    steps: ["Tap a card to turn it over, then another.", "Same picture: they stay up. Different: they turn back (−5).", "Pairs in a row build a combo worth more; the ★ golden pair pays double.", "Clear a deck for a bonus and a new one: new pictures, then twelve pairs.", "Together: one deck for everyone. Turn the twin of anyone's card to make a pair."],
    tip: "Remember where each picture was — a miss breaks your combo.",
  },
  speedmath: {
    name: "Speed Math",
    goal: "Solve as many sums as you can — they get harder as you go.",
    steps: ["Tap the right answer (or press 1–4). Everyone in the room gets the same sums.", "Level 1 is + and −, then times tables, then ÷, then two-step sums and \"? + 17 = 42\".", "Answer before the bar under the sum runs out for a quick bonus. ★ gold sums pay double.", "Right answers in a row build a streak: ×1.5 after 5, ×2 after 10. A wrong answer costs points, breaks the streak — and shows you the right one."],
    tip: "Speed matters, but a wrong answer costs you — be quick, not careless.",
  },
  reaction: {
    name: "Tap Rush",
    goal: "Tap the tiles as they light up — fast — and keep your streak going.",
    steps: ["A tile lights up: tap it before its bar runs out.", "Hits in a row build a streak: ×2 after 5, ×3 after 10, ×4 after 15. Letting a tile go out breaks it.", "🌟 gold is worth a lot. 🧊 ice needs two taps. Sometimes two stars light at once — tap both.", "💣 Leave bombs alone: tapping one costs points and your streak. Letting it go out is safe."],
    tip: "Keep your thumb in the middle so every tile is close.",
  },
  wordrush: {
    name: "Word Rush",
    goal: "Unscramble as many words as you can.",
    steps: ["Tap the letters in the right order to spell the word.", "Tap a letter in your answer to take it back, or ⌫ Undo.", "Words grow from 4 letters to 7. Longer words, quick solves and a streak score more; ★ golden words pay double.", "💡 Hint lights the next right letter; 👀 Answer shows the word — both cost a little.", "Together: each of you has your own word from one pile — solve enough as a team."],
    tip: "Look for the first letter and common endings like -ing, -er, -ed.",
  },
  arrows: {
    name: "Arrow Escape",
    goal: "Get every arrow off the board.",
    steps: ["Tap an arrow and it slides away along its path.", "It only moves if nothing is in front of its head — a blocked tap costs points and your streak.", "Arrows out in a row build a streak worth more.", "★ Golden arrows pay extra; a 💣 bomb arrow takes every arrow touching it.", "Clear a board quickly for a speed bonus, then a longer, twistier one."],
    tip: "Start with the arrows whose way out is already clear.",
  },
  dino: {
    name: "Dino Dash",
    goal: "Run as far as you can, and grab the coins.",
    steps: ["Tap (or ▲) to jump the cacti.", "Hold Duck (or ▼) to get under the birds.", "Coins arc over the cacti — jump in time to grab them — and line the ground under the high birds.", "A crash knocks you back to slow and costs a few points — keep running.", "Together: a crash knocks you down — a friend grabbing a ❤️ gets you up."],
    tip: "The faster you get, the earlier you need to jump.",
  },
  numbers: {
    name: "Number Rush",
    goal: "Tap the numbers in order, 1, 2, 3…",
    steps: ["Find 1, then 2, then 3 — as fast as you can.", "Quick taps build a rush: ×2, then ×3. A miss or a pause breaks it.", "The ★ golden number pays extra; clear a grid fast for a speed bonus.", "Each grid is bigger — then colours, tiles that shuffle, tilted numbers.", "Together: one grid — whoever taps the next number moves everyone on. Clear 5 grids to win."],
    tip: "Look ahead for the next number while you tap this one.",
  },
  colors: {
    name: "Color Dash",
    goal: "Tap the colour the card asks for — before the bar runs out.",
    steps: ["A colour is named at the top: tap its tile.", "Later the swatch goes, then come colour words in the wrong ink — tap the WORD or the INK, as the card says.", "Then odd one out: nine tiles one colour, one a shade off.", "Right taps build a streak worth more; ★ fever rounds pay double; a wrong tap costs points."],
    tip: "On word-vs-ink rounds, read the little label first.",
  },
  pipes: {
    name: "Pipes",
    goal: "Connect every pipe to the water.",
    steps: ["Tap a tile to turn its pipe.", "Pipes joined to the source fill with water.", "Join them all with no loose ends to clear the board. Do it in the fewest turns for a Perfect bonus; quickly, for a speed bonus.", "💡 Hint puts one wrong pipe right, for a few points.", "Together: one board — anyone can turn any pipe. Join 3 boards to win."],
    tip: "Start from the corners and edges — they can only turn so many ways.",
  },
  flappy: {
    name: "Flappy Dash",
    goal: "Fly through as many gaps as you can.",
    steps: ["Stars sit between the pipes — steer through them for +5.", "Ten pipes in a row pays ×2, twenty ×3; every 10th pipe is golden. A crash ends the streak.", "Tap to flap — let go and you fall.", "Each gap you get through is 10 points.", "A crash costs 10 and dazes you, then you fly on.", "Together: a crash knocks you down — a friend flying through a ❤️ gets you up."],
    tip: "Small, steady taps beat big panicky ones.",
  },
  slide: {
    name: "Slide Puzzle",
    goal: "Slide the tiles back in order, with the gap at the end.",
    steps: ["Tap a tile in the gap's row or column and the whole line slides — or swipe.", "A tile in its place gets a tick; a finished row chimes.", "Two 3×3 boards, then 4×4 — and every second board is a picture.", "Fewer moves and a quicker solve score more."],
    tip: "Solve the top row first, then the next — leave the last two rows for last.",
  },
  blocks: {
    name: "Block Blast",
    goal: "Fill rows and columns to blast them.",
    steps: ["Drag a piece from the tray onto the board — the lines it would fill glow.", "Fill a whole row or column and it clears; several at once score more.", "Clear again within three pieces to grow your combo. Empty the whole board for +300.", "Out of room? The board is swept and you keep your score."],
    tip: "Keep a space free for the big pieces.",
  },
  racer: {
    name: "Road Hopper",
    goal: "Hop as far as you can across roads, rivers and railways.",
    steps: ["Hop on quickly for a hot streak: new rows one after another pay ×2, then ×3.", "A 💎 gem rides a log now and then — hop onto it for +50.", "Tap to hop forward. Swipe left, right or down to hop that way.", "Roads: wait for a gap in the cars. Rivers: hop on the logs — the water's deadly.", "Railways: when the red light flashes, a train is coming!", "Don't hang about — fall too far behind and the eagle gets you."],
    tip: "10 points a row, 25 a coin. A crash puts you back a few rows — keep going.",
  },
  runner: {
    name: "Rail Runner",
    goal: "Run as far as you can and grab coins.",
    steps: ["Power-ups now and then: 🧲 a magnet pulls in the coins, ✖2 doubles them, 🛡️ a shield takes one crash.", "Swipe ◀ ▶ to change lane.", "Swipe ▲ to jump barriers, ▼ to slide under bars.", "Swerve round the trains — you can't jump them.", "Together: a crash knocks you down — a friend grabbing a ❤️ gets you up."],
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
    steps: ["Your best lap races beside you as a 👻 ghost — the split under the lap time says if you're ahead.", "Hold the left half of the screen to steer left, the right half to steer right. The pedal's down by itself.", "Keep holding through a bend and you drift: sparks go white, blue, orange, purple. Let go to boost — the longer the drift, the bigger.", "Both halves at once: brake. Yellow pads on the road boost you too.", "Keyboard: W A S D or the arrows, Shift or Space to drift."],
    tip: "Stay off the grass and away from the wall — both cost you speed.",
  },
  storm: {
    name: "Dodge Storm",
    goal: "Survive the storm.",
    steps: ["Stay alive: each second is worth ×2 after 20 s, ×3 after 40 s.", "Grab ⭐ stars, 🛡️ shields (they take one hit) and ⏱️ slow time. From 30 s, purple shards hunt you.", "Drag anywhere (or hold the arrow keys) to move.", "Don't touch the shards — skimming past them earns a bonus.", "A hit costs a few points, then you carry on."],
    tip: "Keep to open space, not the corners.",
  },
  maze: {
    name: "Maze Runner",
    goal: "Find the way out of each maze.",
    steps: ["On your own: 💎 gems wait in the dead ends — take them all before the 🚩 for a bonus. Match the par for a perfect route.", "From maze 4 there's fog: you only see near where you've been.", "Swipe or tap an arrow: the ball rolls to the next turning.", "Reach the 🚩 for a bigger maze.", "Together: someone finds the 🗝️, then anyone reaches the 🚪 to take everyone through."],
    tip: "Fewer moves score more.",
  },
  typing: {
    name: "Typing Race",
    goal: "Type as many words as you can.",
    steps: ["Type the highlighted word, then press space.", "Your car drives as you type — friends race in the lanes above.", "Ten right in a row lights the nitro: ×1.5. A ★ golden word pays double; a word with no wrong letter earns a little more.", "The words get longer as you go. A missed word spins your car out."],
    tip: "Accuracy builds your streak, and the streak builds your score.",
  },
  piano: {
    name: "Piano Tiles",
    goal: "Play the song — tap the black tiles.",
    steps: ["Fifty in a row is 🔥 FEVER: every tile pays double until you slip. Every 30th tile is ★ golden: +20.", "Tap the lowest black tile, then the next.", "Hold the long tiles until they've rolled past.", "Two in one row? Tap both.", "Don't tap the white."],
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
