# PlayRoom

Quick multiplayer games to play with friends on a phone. React + Express +
MySQL + Socket.io in one npm project, one Node process, one deploy.

Live at `playroom-ojpu.onrender.com`. **This repository is public** — no
hostname, credential or certificate belongs in it.

---

## Working here

- **Branch `dev`. `main` is what is live** and auto-deploys on push. Merging
  does nothing; the push to `main` is what ships. After merging, `git checkout
  dev` again — it is easy to forget and deploy your next commit by accident.
- **Never run migrations or DDL against the database.** Put the SQL in `sql/`
  and hand it over to run by hand. Reading is fine.
- **Don't push unless asked.**
- **`.env` holds real secrets.** Scan a diff before committing.
- Deployment, environment variables and free-tier limits live in
  [docs/RUNBOOK.md](docs/RUNBOOK.md). Read it before touching hosting.

## Commands

| | |
|---|---|
| `npm start` | React dev server on 3333, proxying the API to 4321 |
| `npm run server` | the backend alone on 4321 |
| `npm run sql` | regenerate `sql/playroom-schema.sql` from `config/setupDb.js` |
| `npm run share` | the old laptop-based Tailscale Funnel share; superseded by hosting |
| `npm run build` | production build — **only** needed for `share`; Render builds itself |

Local development points at a local MySQL and is unaffected by production.

**Never run `npm run build` to "deploy".** It overwrites `build/`, which the
share script serves. To check a build compiles, send it elsewhere:
`BUILD_PATH=<scratch> npx react-scripts build`.

---

## Shape of it

```
server.js          API + Socket.io + (in production) serves build/
routes/            auth, rooms, games, friends, leaderboard
config/            db, dbSsl, cors, socket, presence, matchClock, setupDb
middleware/        auth (JWT), errorHandler
src/pages/         Home, Lobby, Room, Friends, Leaderboard, Profile, auth
src/components/games/   every game + the shared engine
src/components/ui/      the design system primitives
```

One process serves the API, the websocket and the built frontend on a single
port. There is no separate frontend host.

### Adding a game

Three places, or it half-exists:

1. the component, in `src/components/games/`
2. an entry in `src/components/games/registry.js` — Lobby, Home and Room all
   read from that list
3. a row in `GAME_SEED` in `config/setupDb.js`, **and** the slug in `APP_GAMES`
   in `server.js`

Played together? Also `COOP_GAMES` in `routes/rooms.js` (the server refuses
a co-op room otherwise) and `COOP_GOAL` in `config/matchResult.js`.

Then `npm run sql` and run the SQL against the database by hand. A missing
`game_types` row means "Game type not found" when someone creates a room;
`server.js` warns about this at startup.

---

## The patterns that matter

**Everything is seeded.** Boards, decks, piece order, courses — all derived
from the room's `seed` via `seededRand`. Everyone in a room must get identical
content or the race is meaningless. Never use bare `Math.random()` for anything
a player sees, except cosmetic effects.

**Games hold play state in a ref, not just state.** Two taps in the same tick
each have to see the other's result. React state does not update until the next
render, so a second tap reads stale state — that is how the Memory game used to
strand cards and never end. The pattern: mutate `live.current`, then mirror it
into state for rendering. Every game does this.

**`useGameEngine` owns time, sync and who won.** A game calls
`addScore`/`addMove`/`finish`; it does not own the clock. The clock is
recomputed from a server-anchored deadline on every tick, never counted down,
so a backgrounded phone cannot drift.

**The server decides the result, not the client.** `POST
/api/leaderboard/update` reads the stored scores and ranks the whole room from
one snapshot, once the clock has stopped. Never send `won: true`.

**A match is 2 or 5 minutes, or unlimited** (`duration_seconds` 0): no
clock (`settleIfExpired` skips it, the engine's `timeLeft` holds at
`UNLIMITED_LEFT`, `GameFrame` shows ∞). It ends when its players leave:
leaving keeps your seat and score (`leftUnlimited` in rooms.js), and the
last one out finishes and records it; the sweep ends an idle one. Goals that
scale with the clock (Word Rush together) use the time played.

**Play again is together**: the results card (`AgainPanel`) shows who in the
room is ready (`POST /:code/again`, `room:again`); when everyone still there
is, the next match is made with all of them and already started
(`room:again-go`) — no waiting room. `scripts/check-again.js` tests both.

**Clearing the objective does not end a match.** The room's clock does. A game
that finished early should hand out a bonus and deal a fresh board — otherwise
that player sees a results screen calling them the winner while everyone else
is still playing, and their score freezes.

**`GameFrame` sizes the board.** Its child is a render prop taking `{w, h}`;
compute tile sizes from those. Don't measure the window. `.gameshell` is fixed
at `100svh` with `body.in-game` so phones can't scroll the game off-screen.

**Live updates go over the socket; polling is the fallback.** `PresenceContext`
holds friends and the inbox badge; `room:score` carries opponents' scores during
a match. Adding a new poll is usually the wrong answer.

**Rate limiting is tiered, and `app.use("/api/")` runs for everything.**
Anything with its own limiter must be listed in `HAS_OWN_LIMIT` in `server.js`
or it spends from two budgets and 429s mid-match.

---

## Design

A toy-box theme called "Playdate": thick ink outlines, hard offset shadows, big
rounded shapes, one accent colour per game.

- Colour, radius and shadow are CSS variables in `src/index.css`. Use
  `var(--sun)`, not a hex.
- `.pop` is a card, `.press` is a pressable, `.chip` is a pill. Compose those
  rather than styling from scratch.
- Tailwind is present but the theme is hand-written CSS. Match what is there.
- Each game owns a CSS prefix — `.cd-` Color Dash, `.bd-` Block Drop, and so on.
- **Phones first.** It is played on a phone in a pocket-sized window. Check at
  390px before calling anything done.
- A picture must be recognisable at ~40px. Two emoji that differ only in detail
  — two fish, a whale and a dolphin, a lion and a tiger — read as the same tile.
  Distinguish by silhouette.
- Don't key an element on a value that changes every round: React rebuilds it
  and replays its entry animation, which reads as flicker.

---

## Verifying

There is no test runner. What works:

- **Pure logic** — board modules (`tetrisBoard.js`, `pipesBoard.js`,
  `flappySim.js`…) and `config/matchResult.js` are plain JS with no React or
  database, so they can be exercised from a Node script directly
  (`scripts/check-runner.mjs`, `scripts/check-speedway.mjs`, `scripts/check-piano.mjs`,
  `scripts/check-mahjong.mjs`, `scripts/check-maze.mjs`).
- **Played alone or against each other only** (no "Play together"): Dino
  Dash, Flappy Dash, Rail Runner, Maze Runner, Number Rush and Pipes, like
  the other score-attack games. Their co-op modes were removed (2026-11):
  an old co-op room of one is ranked on the scores.
- **Memory and Mahjong together** share one board through
  a move log: `config/coopBoard.js` numbers every move (`cb:act`) and keeps
  the room's list; each phone plays the list through the rules in
  `src/components/games/coopBoards.js` (`coopLog.js`, `useCoopBoard.js`), its
  own moves shown at once and rebased when the server's order comes back.
  Rules must be pure — no clock, no `Math.random`, never mutate the state.
  `scripts/check-coop.mjs` proves crossed moves from three phones converge.
  A side wins by reaching `COOP_GOAL` in `config/matchResult.js`. Word Rush
  together uses the same log (who has which word).
- **The together games run on the server** — Kitchen Rush, Moving Day:
  `config/togetherWorld.js` keeps a world per side (one each,
  per team, or one for a co-op room) on the rules in
  `src/components/together/<game>Core.mjs`, which the phones share. Phones
  send `tg:act` / `tg:me`, draw `tg:tick`, and never post a score.
  `scripts/check-together-world.js` tests the server side with a fake
  database (and builds each one solo, against friends, in teams and
  together); `check-kitchen.mjs`, `check-moving.mjs` test the rules. A rules
  module can say SHARED (one world for the whole room, scored per side);
  none does now. Moving Day: a house per side, big things carried by two
  (`by` per end), the van loads anything inside it, an empty house deals
  the next. A new one: copy the registration in all of the "Adding a game"
  places plus `togetherWorld.js` GAMES and COOP, `matchResult.js`
  TOGETHER_GAMES and the `NOT IN (...)` list in `server.js`.
- **Every game is played solo, together and against each other** — never
  only one.
- **The look kit** (`src/components/games/toyKit.js`) is how 3D games should
  look: toon light in three steps, ink outlines (an inverted shell), soft
  shadows, a `mover()` character that squashes, blinks and walks,
  `effects()` for puffs, bursts and floating words. Moving Day
  (`movingScene.js`) is drawn with it. To
  look at a scene without a server, mount it on a temporary route that runs
  the rules module in the page (delete it after); headless Chrome draws in
  software at ~4 fps, so pop-in animations are caught half way.
- **Play as a team** (rooms.mode `coop`; the lobby's checkbox, once "Play
  together") starts ticked only for games with `coopDefault` in the
  registry (Kitchen Rush, Sunshard Jump). In a team
  game the top shows the team's points only, never each player's.
- **Endless games** (`endless` in the registry: Sunshard Jump,
  Emberfall) have no clock: always unlimited, no length picker in the lobby
  or the waiting room, and no ∞ drawn in the game.
- **Speedway is live-shared**: a top-down drift racer (`driftSim.js`, the
  "Turbo Drift" look). Each phone sends its car over the socket (`race:pos`:
  position, angle, velocity, drift and boost, relayed by `config/socket.js`);
  everyone else's car is eased toward that and drawn with the same effects.
  Laps follow the room clock (`lapsFor`). The score sync still decides the
  result.
- **Road Hopper** (slug `racer`) is drawn in 3D with the look kit
  (`hopperScene.js`, a lazy chunk: `RoadHopper.jsx` wraps
  `RoadHopperInner.jsx`); the rules are still `hopperSim.js`. Everyone hops
  the same course and sees everyone's chick: each phone sends its square
  (`hop:pos`, at once on a hop or crash, else ~10×/s) and the others play the
  hop out locally. Each seat starts on its own square (`START_COLS`).
  **Flappy Dash** (`flappyScene.js`, towers of toy blocks; friends' birds
  over `fly:pos`, carried on under gravity, flying a little behind yours)
  and **Dodge Storm** (`stormScene.js`, a floating arena in a night storm;
  friends as ghosts over `storm:pos`; a finger is raycast onto the arena,
  `toSim`) are built the same way: lazy `X.jsx` + `XInner.jsx`, rules
  untouched, `nameTag` from the look kit.
- **Sunshard Jump** (slug `sunshard`) is a 3D climb up the Sky Tree —
  all jumping, no attack; a slime is beaten by landing on it (three.js r128,
  loaded when the game opens). `towerWorld.js` builds the tree from the seed
  (a spiral of stones round a trunk you can't pass through, five bands with
  their own stones and sky, the Sun Crown on top; every jump checked) in the
  same shape the old island levels had, so `sunshardSim.js` runs it and
  `sunshardScene.js` draws it (the trunk, vine, boughs, the Crown's beacon
  and the Gloom are drawn only for a tree). `SunshardTower.jsx` runs a
  match. The Gloom, a sea of storm cloud, rises under you (`gloomAt`: each
  phone's own, from when its climb began); caught, you lose a balloon and go
  back to your flag with the Gloom pushed under you; three, and the climb
  starts again (your best height stays). A fall of more than 8 m pops you
  back on your last plain stone (`fallBack`). Sunshards sit on stones off
  the spiral and sink your Gloom (together: one taken is gone for the
  team and sinks everyone's, `isl:ev` `shard`; its points are the taker's). The Crown: 5,000 points and a taller tree
  (`towerCode(seed, round)`). The explorer is a rigged tree-climber kid (beanie,
  hood, puffy jacket, rope; limbs swing from hips and shoulders in `pose`); drag up (or R) to look up the tree. On a
  phone the left half of the screen is the
  joystick, the right half the camera. Each phone relays its explorer
  (`isl:pos`: balloons as hp, best height as p, fin once crowned); stomps
  and crumbling stones go to the room (`isl:ev`). Together you're tied tail
  to tail in seat order (`tether`), caught you're hauled up beside a friend
  with no balloon lost, and one of you on the Crown is the Crown for all.
  `scripts/check-tower.mjs` checks the trees and has a bot climb them (a
  few minutes; `NB=3` for a quick run); `check-sunshard.mjs` still tests
  the physics and the tether on the island levels.
- **Shadow Sneak** (slug `sneak`, landscape) — a lighthouse in the middle
  of a dark maze sweeps its beams round, walls throw shadows, and you creep
  from your corner to the lamp to switch it off; then a bigger maze, low
  walls you must duck behind, a third beam. Two beams from the first maze,
  three from the fourth; from the third maze the lamp turns the other way
  now and then (`W.turns`, `lampTurn`: it flickers `WARN_S` first); more
  players in the room, a faster lamp (`CROWD`). Flags (`W.checks`) are save
  points: walk over one and it's yours — it must be unmistakable (it flies
  up green with a glow and "SAVED!"; a flag whose colour barely changed was
  the user's one complaint about them) — and spotted, you're back at it.
  Rules in `sneakSim.js` (pure): `buildLevel(seed, level, { coop, players })`
  — rebuilt with more walls until every corner has a way in whose lit
  stretches can be crossed between beams (`wayIn`); you are seen only inside
  a beam with a clear line to the lamp (`sees`), spotted after `SPOT_S` in
  it. The lamp's angle is a function of the match clock (`roundAngle`, on
  `lampClock`), so every phone agrees. Drawn by `sneakScene.js` with the
  look kit: the lamp is a real point light low in the tower (below the
  walls' tops, so their shadows run to the edge: dark ground is ground the
  lamp can't see), its shadow map drawn once a maze (`shadowMap.autoUpdate`
  off); the bright beam is a fan of the same rays the rules use, cut off at
  the walls — if the two ever disagree, fix the drawing.
  `ShadowSneakInner.jsx` (lazy) runs it in fixed small steps of real time
  (at 4 fps headless it once fell behind the clock and nobody was ever
  spotted). Friends over `sn:pos`. Against each other it is a race: one
  lamp for everybody — the first there puts it out (`sn:ev` `off`) and
  takes its points, the rest are moved on with what they'd earned getting
  near. Together (one maze): the lamp goes out when everyone is at the
  door, a 🔔 bell holds the lamp on whoever stands on it, and anyone
  spotted makes it turn faster for all (`sn:ev` `spot` → `heats`); the win
  is `lampGoal` lamps (pairs_matched 1, `COOP_GOAL`).
  `scripts/check-sneak.mjs` plans an unseen route through every kind of
  maze (alone, three and five in the room) and walks it through the rules.
  `window.__sn[<player id>]` reaches a run in tests; two players are tested
  in one page joined by a pretend socket (two 3D scenes crawl in headless
  Chrome: wait for each step, don't sleep a fixed time). Its sound
  (`sneakAudio.js`, Web Audio, nothing recorded) is part of the play: the
  lamp's hum swells as a beam comes round to you (`beamNear`) and an alarm
  climbs while you're in the light; footsteps, a sting when spotted, three
  pips before the lamp turns back, a tune when it goes out. Tests measure
  it muted (`__sn[id].audio.state()` and `.level()`); a watcher hears nothing.
- **Emberfall** (slug `emberfall`, 1–2 players) is a finished single page,
  `public/emberfall/index.html` (the mobile rebuild, worked on outside this
  repo as `emberfall-p*.html`; three.js from the CDN, falling back to the
  `three.min.js` beside it), run in a frame by `Emberfall.jsx`, which only
  relays. The page speaks the same bridge as before (its "PlayRoom bridge"
  section): `ready` once loaded, `score` once a second; it takes `init`
  (ids, names, the notch), `names` and `over` (stop the game and the sound).
  It also posts `fs` on a tap (the room page goes full screen, so a phone's
  status bar goes — the page, not the frame, to keep the sideways turn) and
  `leave` from its Quit; the floating clock, Leave and ? are hidden for it
  (GameFrame `helpOnly`, `noHelp`) — How to play is in the page's own menu.
  It asks for full screen once a session (Android shows an exit notice on
  every entry).
  Its people are jointed (p7a): `jointed()` cuts every arm and leg at the
  elbow / knee into `limb.lower`, which `poseHumanoid` bends — a walk and
  run with knee lift and heel kick, elbows, hips and chest turning against
  each other, an idle that breathes and looks about, a pose in the air, a
  lean into turns. Heroes, enemies and villagers share it. What a hand
  holds hangs from the forearm (`hang`), and a hand's place in the world is
  `handAt()` — not `arms[i].localToWorld`. The whole game crawls in
  headless Chrome (allow 45 s to load, tens of seconds a step); to look at
  poses, render a strip of them from `window.__ef` (`makeHero`,
  `poseHumanoid`, `renderer`) into a canvas, as the hero portraits do.
  Attack feel (p7b, the FX block above `toast`): `swoosh()` draws a crescent
  of light along each swing, `impact()` a star and thrown sparks where a blow
  lands (enemy or hero), `cam.punch` pushes the view in for a moment, an
  enemy is squashed by a hit (`pivot.scale` from `e.hit`), a kill throws a
  ring, hit numbers land big and settle. Drawing only, pooled, and wrapped
  so a failure means no effect, never a broken game. Written without being
  run (the user tests on their phone; see the memory note).
  Story and teaching (p7c, the block above the quest code): `storyCards()`
  shows full-screen cards (the opening on a new journey, one for each shard
  won, the ending before the tally; tap to go on, Skip), `bossIntro()` a
  guardian's title and a line as it wakes, `tipTick()` one tip, once ever
  (`ef-tips`), at the moment it's useful — attack, roll, heal, the slam,
  lock on, a horse, a watchtower. The quest line names the one step you're
  on (`setQuestText`, from `getObjective`), and the villagers' lines follow
  the shards you hold (`lines`). Also written without being run.
  **Playing together, part 1** (p7d, the `CO` block by the bridge; only in a
  team room, `init.coop`): the page posts `send`, the room gets `ef:msg`
  (passed on whole by `config/socket.js`, size-capped), and back as
  `{ef:'msg'}`. Three messages: `p` (my hero, ~12/s — the other page draws
  it with `updatePeers`: pose, swing, emote, name on the HUD), `hit` (a blow
  I landed: the other page's copy of that enemy, found by id and checked by
  place, takes it too — `CO.rx` stops it echoing), `q` (stage, shards,
  guardians beaten, beacons, the win: merged by `coopApply`, never taken
  back). Each page still runs its own enemies, so where an enemy stands
  differs between the two phones: that is part 2 — one host running them, as
  the old version did (kept beside the page as `index-backup-before-p6a.html`
  + `game.js`, its NET section: the lowest id hosts, a snapshot `w` ~8/s,
  the other's enemies are puppets, `hit` / `hurt`, world changes sent as
  they happen, `hello` → `full`, two to a horse). Not a team room: each has
  their own island and the points decide. Written without being run; test
  with two frames and a relay in one headless page (`window.__ef`) if the
  user allows testing again.
- **Hollow Hours** (slug `hollow`, 1–2 players, endless) is a side-on
  horror adventure in three.js r128: a small child, a house built for
  giants, six rooms — the Nursery, the Hall (the Keeper, blind, hunts by
  sound), the Workshop (a crank and a lift), the Gallery (the Cuckoo sweeps a
  beam on the hour; furniture between you and its eye is shadow), the
  Stairwell (the chase), the Bell Tower (midnight). Pure rules in
  `src/components/hollow/*.mjs` (`hollowCore` the kid and the rooms' boxes,
  `hollowChapter` the later rooms, `hollowKeeper`, `hollowWeather`);
  drawing in `hollowScene.js` + `hollowDress.js` (+ the kid and Keeper rigs);
  sound synthesised in `hollowAudio.js`. The rules measure depth into the
  screen and three.js toward you: drawing goes through `Z()`, or it comes
  out mirrored. Standalone at `/hollow` (`pages/Hollow.jsx`, title and
  Continue); in a room through `HollowGame.jsx` (lazy) and the same view.
  Together, each phone runs its own run (`hollowNet.mjs`): every phone sends
  its kid (`hh:kid`), the lowest seat still here also the room — its clock,
  machinery, the Keeper (`hh:room`); you go on only when both are through,
  and a catch restarts the room for both. `scripts/check-hollow.mjs` has bots
  play every room and two phones play together; `check-hollow-relay.js` tests
  the server's relays. A building scene that throws shows "couldn't start
  the 3D view": look in the console — twice it was a `let` used before its
  line.
- **Video calls** (friends, up to 4) — `config/calls.js` rings and
  introduces; the media goes phone to phone (`src/utils/CallContext.js`,
  `src/components/CallLayer.jsx`). In each pair only the lower user id
  makes the first offer: letting both offer and one back off left Chrome
  stuck on "Connecting…" about one call in three. `scripts/check-calls.js`
  tests the server's rules (who can call, ringing, busy, four at most,
  dropping and coming back) with a fake socket hub. Test the phones with
  headless tabs and Chrome's `--use-fake-device-for-media-stream
  --use-fake-ui-for-media-stream`; that failure was intermittent, so run
  it several times. Screen sharing (from a computer) reuses its two slots
  each time, so offers don't grow; receiving phones build their own
  MediaStreams from incoming tracks, because Chrome empties its own when a
  slot is reused. To test it, replace `getDisplayMedia` with the fake
  camera (a canvas stops making frames in a background tab, and the real
  desktop starves the machine), and allow tens of seconds: three tabs of
  software video make every step slow here, not stuck. 🖥️ opens a Share
  menu: the screen (computers), **a video watched together** — a file from
  your phone plays on it (`playFilm`, its own controls, `FilmStage`) and
  goes to everyone as your shared screen, so they need nothing: the
  player's `captureStream()`, or on an iPhone a canvas plus Web Audio;
  `call:media` carries its name (`film`); its picture slot
  prefers H.264 (`preferH264`: a phone's chip, so 1080p stays 1080p). A film whose sound the
  browser can't play (Dolby AC-3 / E-AC-3, DTS — most downloaded films) plays
  silent — Chrome on Android even claims to play it — so `dolbyLike` looks in
  the file's headers first (`soundMissing` is the backup) and
  `src/utils/filmSound.js` decodes it like VLC: ffmpeg.wasm (the JS front vendored in `src/vendor/ffmpeg`, the ~30 MB
  core from jsDelivr only when needed) reads the file in place (WORKERFS),
  10 s at a time, 60 s ahead, two ffmpegs, the piece the film is in first
  (a jump drops the rest); the film never waits for its sound; Web Audio
  plays it in step —
  heard through an <audio> player of a stream (on Android in a call, Web
  Audio's own output played a second and went quiet) — and its
  track replaces the silent one going to the call. Swipe up/down on a shared
  video: left half brightness, right half volume (`useLevels`). Audio & subtitles
  (`TrackMenu`) lists the file's tracks (`openFilm`): any sound track is
  decoded; text subtitles are read out whole by a second ffmpeg, shown here
  (`SubLine`) and drawn into a canvas picture that replaces the one sent,
  so friends see them. (It first required everyone to
  pick the same file and only synced play/pause — nobody expected that, so
  it was dropped; that sync engine, `config/callWatch.js` `call:watch`,
  `watchSync.js`, now serves YouTube.) Or **YouTube together**:
  browse trending / shelves / search (`routes/youtube.js`, the key
  `YOUTUBE_API_KEY` only on the server, answers cached, 40 searches an hour
  each) and everyone's own YouTube player (`CallYouTube.jsx`, jumps only:
  it takes no fine rates; a phone that won't start it with sound
  before a tap starts it muted, in step, with 🔇 Tap for sound). A player that should play and doesn't move (an
  ad, loading, a tap needed) asks everyone to `wait`; it says `go` once it
  moves. Ads are YouTube's, per person: never block or strip them (its
  embed terms). `check-watch.mjs` tests the rules, `check-youtube.js` the
  route with a pretend YouTube; two phones in step were tested with a
  recorded .webm through `DOM.setFileInputFiles`, and with the real
  YouTube player (the feed answered through CDP `Fetch`, CORS preflight
  included). A link drops the camera to a smaller size with
  more of you (720p for two, 360p for four) and further on a weak link
  (`gauge`): three full copies starved a phone until voices broke up.
  Changing networks restarts ICE at once (`kick`). Chat in a call
  (`call:chat`) is relayed to the call's members and never stored; the
  chat panel stops key events reaching the page, or a game listening for
  Space eats the spaces typed into it. On a computer the call floats in a
  Document Picture-in-Picture window (`src/utils/callPip.js`, plain DOM —
  React's events don't reach another window): both faces and the chat.
  ⌄ is the one way to minimise: it floats the call — a computer gets the
  Document Picture-in-Picture window, a phone a video picture-in-picture
  of every face (up to four) drawn into one canvas by
  `src/utils/callFloat.js` from the tracks' frames
  (MediaStreamTrackProcessor, which keeps going in the background where
  <video> and timers don't) — only while it floats (`run`), from clones of
  the tracks: reading your own camera all call long stalled a phone's
  self-view. Only where neither works (iPhone) does it
  leave the in-page bubble, which then shows every face. Both floating
  windows are drawn to look like the bubble (faces stacked in a rounded
  card, the time in a pill); the bubble resizes from its top-left handle
  (`pr_bubble_size` in localStorage). A phone can only start floating
  from a tap: Back, or leaving the app, can't do it. 👥 picks whose faces
  show in the bubble, both floating windows, beside a shared screen and
  over it in full screen (`pr_call_hidden`, never the last one); the call
  grid itself always shows everyone. The installed app is portrait
  (manifest.json), so while a screen is shared it asks for `lock("any")`
  and goes back to portrait after — and since that isn't honoured
  everywhere, an Android phone held sideways (the motion sensor,
  `useHeldSideways`) draws the call turned (`.call-root.rot` / `rot-ccw`)
  and sends `turn` for its camera. An iPhone can only full-screen a
  <video> (its own player, no faces), so ⛶ there is our own full screen
  (`.call-share.pfull`). A friend whose
  frames stop (their phone left the app) is `paused` (CallContext counts
  decoded frames) and shows their face, not black. Sound goes first:
  audio senders have high priority, every Opus slot gets stereo + in-band
  FEC, and the mic asks for one channel (not voice isolation: it could
  silence some laptops). On a computer the mic goes through `cleanMic` (`src/utils/cleanMic.js`):
  a 75 Hz low cut, a 6.5 kHz low-pass, an 8 kHz notch (a laptop's webcam
  whined into its own mic at 8 kHz the moment it came on — the "insect"),
  and a tone finder: every 3 s the mic's spectrum is measured and any narrow
  peak 12 dB over its neighbours twice running gets a narrow notch (up to 8)
  — the same laptop beeped at 4 kHz all the time, camera or not. Measure a
  laptop's mic with headless Chrome (`--use-fake-ui-for-media-stream`, real
  devices) and an AnalyserNode: nothing recorded, only the peaks. Two devices
  near each other in one call feed back into a whistle (echo cancelling only
  removes a device's own speaker): `howlGuard.js` watches the mic (every
  device, phones too — it only listens) for one loud pure tone held ~0.5 s and
  pauses the mic 3 s, which breaks the loop; three in a minute, the mic stays
  off with a word on why. A mic that sends digital silence (a laptop's
  "Default" being an empty socket or Stereo Mix — friends hear nothing,
  you hear them) is caught by measuring it (`peakOf`): the other mics are
  tried, "communications" first, the first that hears anything swapped in
  (`swapMic`); none, and a picker opens (also 🎙️ in the 👥 panel) — measured
  only for a mic's first half-minute. Test the
  bubble with phones that can't float (`NO_FLOAT` in the harness). Back shrinks the call to its bubble (the open call
  holds one history entry). Leaving the app doesn't hold the call; only
  the phone taking the mic does. A game drawn sideways on an upright
  screen (`useDrawnSideways` in LandscapeGate) turns the call with it,
  and `call:media` carries `turn`, so the others turn that camera back.
- **PlayRoom Player** (`/watch`, `pages/Player.jsx`, no login, no call): a
  video from the phone with the call's film machinery — Dolby / DTS decoded
  (`filmSound.js`, started the moment the file is picked; the ~30 MB decoder
  kept in Cache Storage, `pr-ffmpeg-0.12.6`), Audio & subs, swipes for
  brightness / volume / scrubbing, double-tap ±10 s, speed, full screen
  sideways, the screen kept awake, and where you were remembered
  (`pr_resume:<name>:<size>`). Test it by picking a file with CDP
  `DOM.setFileInputFiles` (make one with ffmpeg.wasm: E-AC-3 + AAC + SRT) and
  listening to the page's <audio> sink with an AnalyserNode; `window.__pl`
  gives the decoder's numbers and the tap timings.
- **A movie room** (slug `movie`, `pages/MovieRoom.jsx`) is a kind of room,
  not a game: made from the Rooms page (which lists movie rooms and game
  rooms apart), never on the Play or Home lists (`room: true` in the
  registry keeps it out of `GAMES`; `GAME_MAP` still has it). No seats to
  pick, nothing to start (the start route refuses it): it stays `waiting`,
  so people can walk in from the Rooms list mid-film. Alone it is a movie
  player — `playFilm` with no call and no microphone, drawn by CallLayer as
  a movie screen (`solo`: a film of mine with nobody to show it to). When a
  second person is seated everyone joins the room's call (`call:room` in
  `config/calls.js`, id `r-<code>`: no ringing, no friendship needed, 4 at
  most, open with one in it, kept fresh in the database while anyone is in
  it) and the same film, still playing, goes to them: now it's the call
  screen. `check-calls.js` tests the room call.
- **A film's picture never plays without its sound, and once going it
  doesn't stop** (`filmSound.js` `playSound`): where the film is — its start,
  a jump — two quick pieces (`head`: 4 s, then the 6 s after it) are decoded
  side by side from that very moment, ahead of the 10 s pieces, on two
  decoders from the start. The picture is held (paused by us, `held`;
  `start` begins a film only once its sound is here) until the sound in hand
  will outlast the time the next piece still needs, judged from how fast
  this phone is really decoding (`safe`, `rate`) — letting go the moment
  the first quick piece arrived started the film and paused it again 4 s
  later on a phone. A decoder that still falls behind mid-film holds once
  more, for longer (`strict`). A Dolby film is recognised before it is
  started (`dolbyLike`), so its first scene is never silent. Test with a
  decoder as slow as a phone's (`window.__slowFF` = ms of work per second
  of sound; 400 is a mid phone): the first half minute must play with no
  pause and no picture without sound (`window.__pl.stats()`: `held`,
  `holds`, `ranOut`, `headMs`, `est`). A fast test machine hides this
  whole class of bug.
- **A film's sound stays on its picture** (`playSound`'s `tick`): the gap
  between the sound heard and the picture shown is measured every tick
  (`stats().off`, ms; it allows for the phone's own output delay, `lat`) and
  closed by bending the sound's speed up to 3% (`retime`), never by cutting
  it; only 250 ms out, or still out just after a start, is the sound started
  again. It used to be left anywhere within 300 ms, so every ▶, jump or
  dropped frame left it out of step for good. Sound starts only once the
  picture is really moving, and stops while it is stalled. Every decoded
  piece is its whole length (`aresample=async=1:first_pts=0`, and padded): a
  short one paused the film at that spot. Test: make the picture slip by
  patching the video's `currentTime` getter and watch `off` come back with
  `restarts` unchanged; `window.__oldSync` gives the old behaviour, which
  must fail. The Sound check (Audio & subtitles) shows these numbers on a
  phone.
  ▶ tapped while the film waits for its sound (the player shows ▶, so
  people tap it) pauses it again: it used to run on silent with the sound
  chasing it and never catching up — 25 s of silent picture in the test
  (`TAP=1` taps ▶ all through the wait; `__oldSync` brings it back). Only
  sound that never comes in 30 s is given up on. A film's own sound plays
  with no message about it (no "Sound fixed"): the user asked.
- **A film is read in big bites** (`biteReads` in the vendored
  `src/vendor/ffmpeg/worker.js`): WORKERFS read it 32 KB at a time, 320
  blocking reads for 10 s of a 6 Mbps film — three quarters of a piece's
  time on a laptop, more on a phone, and why the sound fell behind and the
  film paused. A megabyte at a time: 938 ms → 247 ms a piece.
  `stats().io` is the last piece's reads; `window.__noBite` reads the old
  way. Test with a film of a real size: a small test file hides it (make one
  in headless Chrome with the core itself: `testsrc2` + `noise` through
  libx264 at 6 Mbps, E-AC-3 5.1, 8 minutes ≈ 400 MB). The movie screen
  (CallContext's `playFilm`) is tested on a temporary route that calls
  `useCall().playFilm(file)`; `window.__film()` is its Sound check.
- **Subtitles come a stretch at a time** (`F.subtitles(n, { where, onPart,
  alive })` in `filmSound.js`): reading them means reading the film, and
  the whole of a 2 GB film took minutes on a phone with nothing on the
  screen — "subtitles are not working". The 3 minutes the film is in are
  read first (the promise gives those lines), then onward from wherever the
  film is, then the rest, each handed to `onPart`; a line cut by a stretch's
  edge is joined again. A phone with no room for a third ffmpeg borrows the
  sound's. Test with a film carrying an SRT track ("Line N" every 4 s):
  jump to the middle, pick the subtitles, and the right line must be up in
  a second or two; then jump back to the start for the rest.
- **The installed app never asks the browser for full screen.** Chrome
  answers every `requestFullscreen` with its own notice ("<site> — drag from
  the top to exit full screen") and no page can turn that off; the user
  wants never to see it. So `manifest.json` is `display: fullscreen` (the
  app has the whole screen always, no status bar), and where `isInstalled()`
  ⛶ is our own full screen (`.pfull`, the film stage too) plus
  `orientation.lock` — in the call, the movie screen and the Player. Only
  a browser tab still uses the Fullscreen API. Don't add a
  `requestFullscreen` that the installed app can reach. (A phone that
  installed the app before this keeps the old manifest until Chrome
  refreshes it, or the app is installed again.)
- **"A new version is ready — Update"** (`src/components/UpdatePrompt.jsx`,
  mounted in App): the installed app keeps running the bundle it loaded, so
  the server says when a new one is live. `server.js` reads the main
  script's hashed name from `build/index.html` at start (`BUILD_ID`) and
  tells every socket connection (`app:version`); a deploy restarts the
  server, every app reconnects, and one whose own script has another name
  shows a card with Update (a reload). No timer (the user asked). Without a
  socket (logged out) it looks once when brought to the front (fetches `/`
  fresh), and a lazy chunk failing to load counts too. It waits while in a
  game (`body.in-game`) or a call; "Later" puts it off half an hour.
- **The Rooms page** runs: Got a code? (one box for either kind of room),
  Movie rooms (make one, then other people's), Game rooms (start one, then
  other people's). Your own room is never listed to you.
- **One account, two devices** — a call is on one device: the others hear
  `call:mine`, show "In a call on your other device", can't start a second
  call, and can take it over (`call:move`). A match is played on one device:
  `room:play` in `config/socket.js` holds it, the other is told "elsewhere"
  and can watch or, once `room:play-free`, play. Leaving a room from the
  other device (tab closed) keeps the seat (`heldElsewhere`, the leave
  sends its socket id). Devices, not sockets, are told apart: each
  sends `deviceId()` (`src/utils/deviceId.js`, localStorage) with the socket;
  a phone whose connection blipped comes back on a new socket while the
  server still thinks the old one is alive (~20 s), and was told its own
  match was "on your other device". `check-calls.js` covers the call rules,
  `check-devices.js` (the real socket server, real connections) the match
  hold and leaving.
- **Spectating** — a puzzle or board game sends its board with every move
  (`useSpectate`, `room:live`). A real-time game (Speedway, Piano Tiles,
  Dino Dash, Flappy Dash, Rail Runner, Road Hopper, Dodge Storm, Sunshard
  Jump, Emberfall) streams instead (`useSpecStream`): the watcher asks for a
  player's frames every 2s (`room:frame-want`), that player's phone sends a
  small picture of its game ~15×/s only while asked (`room:frame`, relayed
  volatile by `config/socket.js`), and the watcher draws the game's own scene
  from it, eased between frames, input refused and silent. Emberfall's page
  has a watch mode (`?embed=1&watch=1`: no input, no saving, no sound).
  Kitchen Rush runs on the server and draws its own watchers.
- **One game on its own** — build with a temporary route that mounts it with a
  fixed seed, serve the build, and drive it over the Chrome DevTools Protocol.
  Sample the DOM to assert behaviour, and screenshot at 390px. Delete the route
  before committing.
- **A whole match** — `scripts/e2e.mjs` signs in real players against a real
  backend, starts a real match, and fails on any console error. Its header says
  how to run it.
- **Rules that span requests** — `scripts/check-results.js` (a finished match
  reaches the Hall of Fame), `scripts/check-spectating.js` (a friend
  mid-match is visible and watchable), `scripts/check-email-codes.js`
  (password-by-code and delete account, with a fake mail relay) and
  `scripts/check-forgot-password.js` (a forgotten password, logged out:
  `/api/auth/forgot/*`). API-level, no browser, quick to run.

Every headless Chrome a test launches gets `--mute-audio`: tests must never
play sound on the machine they run on.

Register is rate limited to 10 accounts an hour per IP, so a long run of tests
will start failing with 429 — reuse accounts from an earlier run rather than
raising the limit.

**Anything touching the room, the socket or the engine gets the e2e run before
it ships.** `socket.on is not a function` reached production and blanked every
online match: the unit tests passed, the build compiled, and nothing had ever
started a match. Compiling is not evidence that a room works.

Reproduce a bug before fixing it, and prove the test catches it — reintroduce
the bug and watch it fail. Several "fixes" here turned out to be the test being
wrong, and the grey flash in Color Dash was the card, not the grid everyone
assumed.

