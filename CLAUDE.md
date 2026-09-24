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
  database, so they can be exercised from a Node script directly.
- **One game on its own** — build with a temporary route that mounts it with a
  fixed seed, serve the build, and drive it over the Chrome DevTools Protocol.
  Sample the DOM to assert behaviour, and screenshot at 390px. Delete the route
  before committing.
- **A whole match** — `scripts/e2e.mjs` signs in real players against a real
  backend, starts a real match, and fails on any console error. Its header says
  how to run it.

**Anything touching the room, the socket or the engine gets the e2e run before
it ships.** `socket.on is not a function` reached production and blanked every
online match: the unit tests passed, the build compiled, and nothing had ever
started a match. Compiling is not evidence that a room works.

Reproduce a bug before fixing it, and prove the test catches it — reintroduce
the bug and watch it fail. Several "fixes" here turned out to be the test being
wrong, and the grey flash in Color Dash was the card, not the grid everyone
assumed.

