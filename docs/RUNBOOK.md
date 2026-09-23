# PlayRoom — running it in production

How the live site is put together, how to ship a change, and the things that
will bite you. Written for whoever maintains this next, including future-me.

> **This repository is public.** No hostname, username, password or certificate
> belongs in here. Every credential lives in the Render dashboard (for the app)
> or the Aiven console (for the database), and nowhere else.

---

## Where it lives

| Piece | Service | Plan |
|---|---|---|
| App (API + Socket.io + the React build) | Render web service, Singapore | Free |
| MySQL 8.4 | Aiven | Free, 1GB |
| Keep-awake pinger | UptimeRobot → `/api/health` every 5 min | Free |

One Node process serves everything: `server.js` mounts the API, runs the
Socket.io hub on the same port, and — when `NODE_ENV=production` — serves the
compiled React app out of `build/`. There is no separate frontend host.

### Why this shape

Socket.io needs a server that stays connected, which rules out Vercel, Netlify
and anything else serverless — live presence, invites and score sync all ride
that socket. A single always-on Node process is the requirement, and Render's
free tier is one of the few that still offers it with WebSockets and no card.

---

## Shipping a change

Work on `dev`. `main` is what is live.

```bash
# on dev
git add -A && git commit -m "..." && git push

# when it should go live
git checkout main && git merge dev && git push origin main
git checkout dev                      # easy to forget, and main auto-deploys
```

**The push to `main` is what deploys**, not the merge. Render rebuilds and
restarts within a minute or two; watch the Deploys tab.

Never run a production build locally for the live site — Render runs the build
itself. `npm run build` is only for `npm run share`.

### Expect a short outage

Free instances restart rather than swapping over, so the site is down for
roughly 30 seconds mid-deploy. Don't push while people are mid-match.

---

## Changing the database

**Schema changes do not deploy.** Render ships code; Aiven keeps whatever
schema it already had. Ship a column the database doesn't have and the app
breaks on the first query.

The schema lives in one place: `config/setupDb.js`. After editing it:

```bash
npm run sql      # regenerates sql/playroom-schema.sql from setupDb.js
```

Then open `sql/playroom-schema.sql` in MySQL Workbench, connected to Aiven, and
run it. It is safe to re-run: tables are `CREATE TABLE IF NOT EXISTS`, added
columns check `information_schema` first, and the game catalog upserts.

Connecting Workbench to Aiven needs **SSL → Require** plus the CA certificate
file from the Aiven console. Without it the connection simply fails.

### The trap in `CREATE TABLE IF NOT EXISTS`

It skips the table *entirely* when it exists — a new column in the `CREATE`
statement never reaches a database that already has that table. Any column
added after first release therefore needs an entry in `COLUMN_MIGRATIONS` in
`config/setupDb.js`. `scripts/makeSql.js` renders those into the `.sql` as
look-then-alter blocks, because MySQL has no `ADD COLUMN IF NOT EXISTS`.

`users.last_seen_at` was missing one of these for a while and the friends list
silently ran without it. Check the list when you add a column.

---

## Environment variables

Set in Render → Environment. Values are not recorded here.

| Key | Notes |
|---|---|
| `NODE_ENV` | `production`. Also what makes `server.js` serve `build/`. |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | From the Aiven console. The port is not 3306 and the database is not called `playroom`. |
| `DB_SSL_CA` | The CA certificate **text**, pasted whole, `BEGIN`/`END` lines included. See `config/dbSsl.js`. |
| `DB_POOL_SIZE` | Optional, defaults to 10. Aiven's free tier caps total connections at 76 on 1GB of RAM. |
| `JWT_SECRET` | Long and random. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Changing it logs everyone out once, nothing worse. |
| `JWT_EXPIRES_IN` | `7d`. |
| `PRODUCTION_URL` | The live origin, no trailing slash. **Required** — see below. |
| `GENERATE_SOURCEMAP` | `false`, or the React build can exhaust the free builder's memory. |

**Never set `PORT`.** Render assigns it; overriding it makes the service
unreachable.

### `PRODUCTION_URL` is not optional

Browsers attach an `Origin` header to POST requests even same-site. With no
allowed origins configured, `config/cors.js` rejects every one with a 403 — the
page loads perfectly and then login, room creation and presence all fail. The
startup log warns about this; believe it.

---

## Build command

```
npm install --include=dev && npm run build
```

`--include=dev` is load-bearing. Tailwind, PostCSS and Autoprefixer are
devDependencies, and `NODE_ENV=production` makes plain `npm install` skip them,
which fails the CSS build.

Start command is `node server.js`.

---

## The free-tier facts worth knowing

**Render sleeps after 15 minutes idle** and takes ~50 seconds to wake. The
UptimeRobot ping every 5 minutes is what prevents it. This consumes roughly 744
of the 750 free instance-hours a month, so **there is no room for a second
always-on service** — adding one means the pinger goes part-time or both get
suspended until the month rolls over.

**Aiven powers down idle free services.** Not an issue while the app is awake
and holding its pool open. They email before doing it.

**Startup retries rather than exiting.** `config/db.js` tries ten times over
thirty seconds, because a free database that has just woken is slow to answer
and a process that gave up would only be restarted into the same race.

**The `onrender.com` subdomain cannot be changed.** Render appends a random
suffix to every new service URL as policy — it is not a name collision, and
recreating the service only produces a different suffix. A custom domain is the
only route to a clean address.

---

## Local development is unaffected

`.env` still points at local MySQL. `npm start` (port 3333) and `npm run server`
(port 4321) behave exactly as before, against your own database. Only Render's
environment points at Aiven.

Keep it that way. Putting the Aiven credentials in your local `.env` means your
next experiment runs against real accounts and real match history.

`npm run share` and the Tailscale Funnel path still work, but they were the
laptop-based workaround this setup replaces.

---

## Open items

- The lobby orders games by `game_types.id` (`routes/games.js`). Reordering
  without code means adding a `sort_order` column and ordering by it; renumbering
  ids is not an option, as `rooms.game_type_id` references them.
- Registration is open to anyone with the URL. If that becomes a problem, an
  invite code is the smallest fix.
- `public/favicon.ico` is the leftover Create React App icon. Unused — the
  explicit `<link>` tags in `index.html` take priority — but still in the tree.
