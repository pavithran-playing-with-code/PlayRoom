# 🎮 PlayRoom

Quick games to play with your friends, wherever they are. Make a room, send six
letters, and race each other for two to five minutes.

Fourteen games — Mahjong Solitaire, Memory Match, Speed Math, Tap Rush, Word
Rush, Arrow Escape, Missing Piece, Dino Dash, Number Rush, Color Dash, Pipes,
Flappy Dash, Slide Puzzle and Block Drop — all built for a phone held in one
hand. Everyone in a room gets exactly the same board, so it is a fair race
rather than a shared screen.

React + Express + MySQL + Socket.io, in one npm project that builds to a single
Node process.

---

## Running it locally

You need Node 18+ and a MySQL 8 you can write to.

```bash
npm install
cp .env.example .env          # copy .env.example on Windows
```

Fill in `DB_PASSWORD` and set `JWT_SECRET` to something long and random:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the schema and seed the game catalog:

```bash
node config/setupDb.js
```

Then run the two halves in separate terminals:

```bash
npm run server    # API + websocket on 4321
npm start         # React dev server on 3333, proxying /api to 4321
```

Open http://localhost:3333.

If you would rather not let a script touch your database, `npm run sql`
regenerates `sql/playroom-schema.sql` from the same definitions and you can run
that by hand instead. It is safe to re-run.

## Scripts

| Script | What it does |
|---|---|
| `npm start` | React dev server, port 3333 |
| `npm run server` | Express + Socket.io, port 4321 |
| `npm run dev` | the backend under nodemon |
| `npm run build` | production build into `build/` |
| `npm run sql` | write the schema out as plain SQL |
| `npm run share` | serve it to the internet from this laptop over a Tailscale Funnel |

---

## How it fits together

One process serves the API, the websocket and — in production — the compiled
frontend, all on the same port. There is no separate frontend host.

```
server.js              API, Socket.io, and the built frontend
routes/                auth · rooms · games · friends · leaderboard
config/                db · cors · socket · presence · matchClock · setupDb
src/pages/             Home · Lobby · Room · Friends · Leaderboard · Profile
src/components/games/  every game, plus the shared match engine
src/components/ui/     the design-system primitives
```

The match engine (`src/components/games/useGameEngine.js`) owns everything the
games have in common: a clock anchored to the server's start time so nobody's
phone can drift, score sync, opponents' live scores, and the end of the match.
A game only owns its own rules.

Results are decided by the server from stored scores — the client never reports
whether it won.

### Database

Nine tables: `users`, `game_types`, `rooms`, `room_players`, `game_sessions`,
`leaderboard`, `chat_messages`, `friendships`, `room_invites`.
`config/setupDb.js` is the single source of truth for all of them.

---

## Deploying

It runs on Render's free tier with a free Aiven MySQL behind it, for nothing a
month. **[docs/RUNBOOK.md](docs/RUNBOOK.md)** covers how it is put together,
how to ship a change, the environment variables, and the things that break it
quietly.

If you are working on the code — or pointing an AI assistant at it —
**[CLAUDE.md](CLAUDE.md)** has the conventions and the non-obvious patterns.
