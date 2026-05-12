# 🎮 PlayRoom — Multi-Game Platform  v1.0

React + Express + MySQL in a **single project folder** — just like your dEpr project.

---

## Project Structure

```
PlayRoom/                     ← one folder, one npm project
├── .vscode/
│   └── launch.json           ← F5 starts the backend (node server.js)
├── config/
│   ├── db.js                 ← MySQL2 connection pool
│   └── setupDb.js            ← run once to create all tables
├── middleware/
│   ├── auth.js               ← JWT verifyToken
│   └── errorHandler.js
├── routes/
│   ├── auth.js               ← /api/auth  (register, login, me)
│   ├── rooms.js              ← /api/rooms (create, join, start, poll, chat, score)
│   ├── games.js              ← /api/games (list game types)
│   └── leaderboard.js        ← /api/leaderboard
├── public/
│   └── index.html            ← React entry HTML
├── src/                      ← React frontend (CRA)
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── ProtectedRoute.jsx
│   │   ├── MahjongGame.jsx   ← Mahjong solitaire (offline + online)
│   │   └── MemoryGame.jsx    ← Memory card match (offline + online)
│   ├── pages/
│   │   ├── Home.jsx
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── Lobby.jsx         ← Browse / create / join rooms
│   │   ├── Room.jsx          ← Waiting room + launches game
│   │   └── Leaderboard.jsx
│   ├── utils/
│   │   ├── api.js            ← apiFetch helper
│   │   └── AuthContext.js    ← React auth context
│   ├── App.js
│   ├── index.js
│   └── index.css
├── server.js                 ← Express API (port 4321)
├── package.json              ← single package.json for everything
├── .env.example              ← copy to .env
└── .gitignore
```

---

## Quick Start

### Step 1 — Install dependencies
```bash
npm install
```

### Step 2 — Configure environment
```bash
# Copy the example and fill in your values
copy .env.example .env        # Windows
cp .env.example .env          # Mac / Linux
```
Open `.env` and set:
- `DB_PASSWORD` — your MySQL root password
- `JWT_SECRET`  — any long random string

### Step 3 — Create the database
```bash
node config/setupDb.js
```
This creates the `playroom` database and all 7 tables automatically.

### Step 4 — Start the backend
```bash
node server.js          # or press F5 in VS Code
```
Backend runs at **http://localhost:4321**

### Step 5 — Start the frontend (new terminal)
```bash
npm start
```
React dev server runs at **http://localhost:**  
API calls to `/api/*` are automatically proxied to port 4321.

---

## VS Code F5
The `.vscode/launch.json` is pre-configured:
- Press **F5** → runs `node server.js` with `NODE_ENV=development`
- Restart on file change is enabled (`"restart": true`)

---

## Available Scripts

| Script | What it does |
|--------|-------------|
| `npm start` | Start React dev server (port ) |
| `npm run build` | Build React for production into `/build` |
| `node server.js` | Start Express backend (port 4321) |
| `npm run dev` | Start backend with nodemon (auto-reload) |
| `node config/setupDb.js` | Create database + tables + seed data |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | Accounts — username, email, bcrypt password, avatar |
| `game_types` | Mahjong, Memory, Trivia (seeded on setup) |
| `rooms` | Game rooms with 6-char room codes |
| `room_players` | Who is in each room + live scores |
| `game_sessions` | Completed game records |
| `leaderboard` | Global scores (upserted after each game) |
| `chat_messages` | In-room chat messages |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Login → JWT |
| GET  | `/api/auth/me` | ✓ | Current user |
| GET  | `/api/games` | — | List game types |
| GET  | `/api/rooms` | ✓ | Open public rooms |
| POST | `/api/rooms` | ✓ | Create room |
| POST | `/api/rooms/join` | ✓ | Join by room code |
| GET  | `/api/rooms/:code` | ✓ | Room detail + players |
| PATCH | `/api/rooms/:code/start` | ✓ | Host starts game |
| PATCH | `/api/rooms/:code/score` | ✓ | Submit score update |
| GET  | `/api/rooms/:code/poll` | ✓ | Poll status + chat |
| POST | `/api/rooms/:code/chat` | ✓ | Send chat message |
| GET  | `/api/leaderboard` | — | Global rankings |
| POST | `/api/leaderboard/update` | ✓ | Update score after game |

---

## Production Deployment

```bash
npm run build           # builds React into /build
NODE_ENV=production node server.js
```
In production, Express serves the React build from `/build` automatically.

---

## V2 Roadmap
- WebSockets (Socket.io) — real-time instead of polling
- Trivia Quiz game
- Player profiles + match history
- Private room passwords
- Mobile PWA support
