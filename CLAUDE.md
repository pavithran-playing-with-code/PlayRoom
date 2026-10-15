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
scale with the clock (co-op runners, Word Rush) use the time played.

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
  `scripts/check-mahjong.mjs`, `scripts/check-maze.mjs`, `check-manor*`).
- **Maze Runner together** is relayed, not server-run: each phone moves its
  own ball and sends `maze:pos` (maze, where, key taken, door reached);
  `config/socket.js` passes it on, and a phone that missed something catches
  up from the next message.
- **Memory, Mahjong, Number Rush and Pipes together** share one board through
  a move log: `config/coopBoard.js` numbers every move (`cb:act`) and keeps
  the room's list; each phone plays the list through the rules in
  `src/components/games/coopBoards.js` (`coopLog.js`, `useCoopBoard.js`), its
  own moves shown at once and rebased when the server's order comes back.
  Rules must be pure — no clock, no `Math.random`, never mutate the state.
  `scripts/check-coop.mjs` proves crossed moves from three phones converge.
  A side wins by reaching `COOP_GOAL` in `config/matchResult.js`. Word Rush
  together uses the same log (who has which word).
- **Rail Runner, Dino Dash and Flappy Dash together** relay positions
  (`run:pos`, `useRunTogether.js`): friends drawn as ghosts, a crash is "down"
  until a friend grabs a seeded ❤️ (`runTogether.js`). The side wins on its
  points added up against `COOP_PACE` × seconds × players — keep the client
  and server paces equal (check-coop proves it).
- **The together games run on the server** — Kitchen Rush:
  `config/togetherWorld.js` keeps a world per side (one each,
  per team, or one for a co-op room) on the rules in
  `src/components/together/<game>Core.mjs`, which the phones share. Phones
  send `tg:act` / `tg:me`, draw `tg:tick`, and never post a score.
  `scripts/check-together-world.js` tests the server side with a fake
  database; `check-kitchen.mjs` tests the rules. A rules module can say
  SHARED (one world for the whole room, scored per side); none does now.
- **Play as a team** (rooms.mode `coop`; the lobby's checkbox, once "Play
  together") starts ticked only for games with `coopDefault` in the
  registry (Kitchen Rush, Station 13, Sunshard Jump). In a team
  game the top shows the team's points only, never each player's.
- **Endless games** (`endless` in the registry: Station 13, Sunshard Jump,
  Emberfall) have no clock: always unlimited, no length picker in the lobby
  or the waiting room, and no ∞ drawn in the game.
- **Speedway is live-shared**: a top-down drift racer (`driftSim.js`, the
  "Turbo Drift" look). Each phone sends its car over the socket (`race:pos`:
  position, angle, velocity, drift and boost, relayed by `config/socket.js`);
  everyone else's car is eased toward that and drawn with the same effects.
  Laps follow the room clock (`lapsFor`). The score sync still decides the
  result.
- **Station 13** (slug `manor`) is a first-person hospital horror in
  three.js r128 (a lazy chunk), ported from a single-file original: the
  rules are `src/components/horror/s13Core.mjs` (the layout from the seed,
  `genStation`; the monster, `stepMonster`: asleep, patrol, investigate,
  notice — a stare you can break — chase, rear and lunge), shared by the
  solo run (`s13Sim.js`, `pages/Manor.jsx`), the room's phones
  (`s13Client.js`) and the server; `s13Scene.js` draws, `s13Audio.js`
  sounds. Online the server runs the monsters (`config/manorWorld.js`,
  `monstersFor`: 1–3 for 8 players); each phone moves itself and reports
  (`manor:me`), lockers are asked for (`manor:use`). Friends are drawn as
  survivors (`friendFig`) with their name and distance in metres over them
  (through walls), and the HUD lists how far each one is. Each side hunts its
  own 4 fuses in its colour (together: one set), every fuse lights two
  zones for everyone, the first side into the elevator wins. Caught online,
  you're back in the Main Hall in a moment with the monsters sent off.
  In a locker with your torch off it gives up on you and goes back on its
  rounds; torch on, it can still find you if it lingers. Floor props (the
  dead, a tipped bin) don't block; standing ones block only their drawn box
  (`FOOT` in s13Core, kept on the grid as `g.box`), not their whole tile.
  `check-manor.mjs` has a bot get out of most seeded runs;
  `check-manor-world.js` tests the server with a fake database.
- **Sunshard Jump** (slug `sunshard`) is a 3D platformer, all jumping —
  no coins, no attack; a slime is beaten by landing on it (three.js r128,
  a lazy chunk): islands from `sunshardWorld.js`, rules in `sunshardSim.js`,
  drawing in `sunshardScene.js` (a sky per zone, `THEMES`). On a phone the
  left half of the screen is the joystick, the right half the camera.
  Each phone relays its explorer (`isl:pos`); together,
  the shard bits are unioned, one of you home wins for all, and you're tied
  tail to tail in seat order (`tether`: each phone holds back only its own
  explorer; a chain that never snaps, with a little slack in the air — fall
  and you're back beside the friend you're tied to). Slimes wander by the
  match clock, so they agree; a stomp or a crumbling stone goes to the room
  (`isl:ev`, `killSlime` / `crumbleAt`). Light the temple and the side moves
  on to the next island (`seed-1`, `seed-2`…, `rd` in `isl:pos`); islands'
  points add up under the cap.
  `scripts/check-sunshard.mjs` has a bot finish 24 seeded levels.
  **Sunhaven Isle** is stage 2 of every round: lighting the temple opens a
  3 s portal to a free-roaming island 62 m above it (`sunhavenWorld.js`,
  `sunhavenSim.js`, drawn by `createIsle` in the scene, built only at the
  portal): Elder Sol's 4 shrines (pulse, dash, +heart, bigger pulse), Pip's
  slime quest, Brindle's boots, then the Shade Colossus; saved, and 6 s later
  the next sky island. No `Math.random` in its rules (creatures wander by the
  clock, the boss's orbs from a seeded stream). `isl:pos` carries the stage
  (`sg`) and found flags (`fm`). Together, the portal is joint (`isl:ev` `tp`
  with a match-clock `at`), and the lowest seated id on the isle is the host:
  only it runs the creatures and the boss and sends them (`isl:host`, ~8/s);
  every phone decides damage to its own explorer; kills, hearts, shrines and
  the boss's end are shared events. Race: each player's own island.
- **Emberfall** (slug `emberfall`, solo only for now — the registry offers
  one seat until co-op is ported) is a finished single page,
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
  **Co-op is not in the rebuild yet**: each player plays their own island and
  `ef:msg` is ignored. The old two-player version is kept beside it as
  `index-backup-before-p6a.html` + `game.js` (and `game-backup-before-p6a.js`);
  how its co-op worked, for porting: the page posts `send`, the
  room gets `ef:msg` (passed on whole by `config/socket.js`, size-capped),
  and back. The NET section of game.js is the co-op: the playing player with
  the lowest id hosts (enemies, bosses, time, weather; a snapshot `w` ~8/s),
  the other's enemies are puppets, its hits go to the host (`hit`), the host's
  blows come back (`hurt`); world changes (chests, trees, smashed objects,
  forage, towers, quest) are sent as they happen and applied without loot,
  and a returning player asks for all of it (`hello` → `full`). Two can ride
  one horse (seat 0 drives, seat 1 behind). Test it with two frames and a
  relay in one headless page (`window.__ef` reaches everything); a room for it
  needs its `game_types` row (`sql/emberfall.sql`).
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
  software video make every step slow here, not stuck. Chat in a call
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
  silence some laptops). A mic that sends digital silence (a laptop's
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
- **One account, two devices** — a call is on one device: the others hear
  `call:mine`, show "In a call on your other device", can't start a second
  call, and can take it over (`call:move`). A match is played on one device:
  `room:play` in `config/socket.js` holds it, the other is told "elsewhere"
  and can watch or, once `room:play-free`, play. Leaving a room from the
  other device (tab closed) keeps the seat (`heldElsewhere`, the leave
  sends its socket id). `check-calls.js` covers the call rules.
- **Spectating** — a puzzle or board game sends its board with every move
  (`useSpectate`, `room:live`). A real-time game (Speedway, Piano Tiles,
  Dino Dash, Flappy Dash, Rail Runner, Road Hopper, Dodge Storm, Sunshard
  Jump, Emberfall) streams instead (`useSpecStream`): the watcher asks for a
  player's frames every 2s (`room:frame-want`), that player's phone sends a
  small picture of its game ~15×/s only while asked (`room:frame`, relayed
  volatile by `config/socket.js`), and the watcher draws the game's own scene
  from it, eased between frames, input refused and silent. Emberfall's page
  has a watch mode (`?embed=1&watch=1`: no input, no saving, no sound).
  Kitchen Rush and Station 13 run on the server and draw their own watchers.
- **One game on its own** — build with a temporary route that mounts it with a
  fixed seed, serve the build, and drive it over the Chrome DevTools Protocol.
  Sample the DOM to assert behaviour, and screenshot at 390px. Delete the route
  before committing.
- **A whole match** — `scripts/e2e.mjs` signs in real players against a real
  backend, starts a real match, and fails on any console error. Its header says
  how to run it.
- **Rules that span requests** — `scripts/check-results.js` (a finished match
  reaches the Hall of Fame), `scripts/check-spectating.js` (a friend
  mid-match is visible and watchable) and `scripts/check-email-codes.js`
  (password-by-code and delete account, with a fake mail relay). API-level,
  no browser, quick to run.

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

