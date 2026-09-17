// src/pages/Lobby.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { GAMES, GAME_MAP } from "../components/games/registry";
import { useToast, Avatar } from "../components/ui";
import { usePresence } from "../utils/PresenceContext";
import { presenceLabel } from "../utils/timeAgo";
import PeekBuddy from "../components/characters/PeekBuddy";

const DURATIONS = [
  { s: 120, label: "2 min" },
  { s: 180, label: "3 min" },
  { s: 240, label: "4 min" },
  { s: 300, label: "5 min" },
];

export default function Lobby() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  // The chosen game lives in the URL (?game=arrows): a game card on the home
  // page opens the lobby with that game already picked, and a refresh keeps it.
  const [params, setParams] = useSearchParams();
  const game = GAME_MAP[params.get("game")] ? params.get("game") : GAMES[0].slug;
  const setGame = (slug) => setParams({ game: slug }, { replace: true });
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [duration, setDuration] = useState(120);
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const codeRef = useRef(null);

  const selected = GAME_MAP[game] || GAMES[0];
  const playerChoices = Array.from({ length: selected.maxPlayers }, (_, i) => i + 1);
  // Solo = 1 seat. Nobody can join, so the room is implicitly private and the
  // privacy toggle is hidden rather than shown as a no-op.
  const isSolo = maxPlayers === 1;
  const mins = Math.round(duration / 60);

  // Keep maxPlayers valid when switching games.
  useEffect(() => {
    setMaxPlayers((mp) => Math.min(mp, selected.maxPlayers));
  }, [selected.maxPlayers]);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await api.get("/api/rooms");
      const data = await res.json();
      if (data.success) setRooms(data.rooms);
    } catch { /* silent */ } finally { setLoadingRooms(false); }
  }, []);

  useEffect(() => {
    fetchRooms();
    const t = setInterval(fetchRooms, 5000);
    return () => clearInterval(t);
  }, [fetchRooms]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await api.post("/api/rooms", {
        game_slug: game, max_players: maxPlayers,
        is_private: isSolo ? true : isPrivate,   // solo rooms are never listed
        duration_seconds: duration,
      });
      const data = await res.json();
      if (!data.success) { toast.error(data.message || "Failed to create room."); return; }
      navigate(`/room/${data.room.room_code}`);
    } catch { toast.error("Failed to create room."); }
    finally { setCreating(false); }
  }

  async function handleJoin(e) {
    e?.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const code = joinCode.trim().toUpperCase();
      const res = await api.post("/api/rooms/join", { room_code: code });
      const data = await res.json();
      if (!data.success) { toast.error(data.message || "Could not join."); return; }
      navigate(`/room/${code}`);
    } catch { toast.error("Failed to join room."); }
    finally { setJoining(false); }
  }

  async function quickJoin(code) {
    try {
      const res = await api.post("/api/rooms/join", { room_code: code });
      const data = await res.json();
      if (data.success) navigate(`/room/${code}`);
      else toast.error(data.message || "Could not join.");
    } catch { toast.error("Could not join."); }
  }

  const label = "muted";
  const stepLabel = { fontSize: ".78rem", letterSpacing: ".09em", textTransform: "uppercase", marginBottom: 10 };

  return (
    <div className="wrap">
      <div className="mid">

        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 26 }}>
          <div className="row" style={{ gap: 14 }}>
            <span className="face" style={{ width: 58, height: 58, fontSize: 29, background: "var(--sky)" }}>
              <span style={{ lineHeight: 1 }}>{user?.avatar || "🎮"}</span>
            </span>
            <div>
              <h1 style={{ fontSize: "1.9rem" }}>Hey {user?.username}! 👋</h1>
              <p className="muted">Who are we beating today?</p>
            </div>
          </div>
          <button className="press p-white sm" onClick={fetchRooms}>🔄 Refresh</button>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1.55fr 1fr", alignItems: "start" }} id="lobbyGrid">
          <div className="pop" style={{ padding: 26 }}>
            <h2 style={{ fontSize: "1.5rem", marginBottom: 18 }}>✨ Start a match</h2>

            <div className={label} style={stepLabel}>1 · Game</div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 12, marginBottom: 22 }}>
              {GAMES.map((g) => (
                <button key={g.slug} className="press pick" data-game={g.slug}
                  aria-pressed={g.slug === game} onClick={() => setGame(g.slug)}
                  style={{ flexDirection: "column", gap: 6, padding: "14px 8px", background: g.col, borderRadius: 20 }}>
                  <span style={{ fontSize: "1.9rem", lineHeight: 1 }}>{g.icon}</span>
                  <span style={{ fontSize: ".82rem", textAlign: "center", lineHeight: 1.15 }}>{g.name}</span>
                </button>
              ))}
            </div>

            <div className={label} style={stepLabel}>2 · Clock</div>
            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
              {DURATIONS.map((d) => (
                <button key={d.s} className="press dur p-white" aria-pressed={duration === d.s}
                  onClick={() => setDuration(d.s)} style={{ flex: 1, minWidth: 82 }}>
                  {d.label}
                </button>
              ))}
            </div>

            <div className={label} style={stepLabel}>3 · Seats</div>
            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 22 }} id="seats">
              {playerChoices.map((n) => (
                <button key={n} className="press seat p-white" aria-pressed={maxPlayers === n}
                  onClick={() => setMaxPlayers(n)} style={{ minWidth: 64 }}>
                  {n === 1 ? "Solo" : `${n} 👥`}
                </button>
              ))}
            </div>

            {/* Private — meaningless for a solo run, so we explain instead of asking. */}
            {isSolo ? (
              <div className="note" style={{ background: "var(--paper2)", marginBottom: 22 }}>
                🧍 Solo run — private by default. No room code to share, no invites, no chat.
              </div>
            ) : (
              <label className="row" style={{ gap: 11, fontSize: ".95rem", marginBottom: 22, cursor: "pointer" }}>
                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)}
                  style={{ width: 20, height: 20, accentColor: "var(--grape)" }} />
                🔒 Keep it private — invite only
              </label>
            )}

            {/* What you're about to create, spelled out: game, clock, seats. */}
            <div className="lobby-sum" aria-live="polite">
              <span className="chip" style={{ background: selected.col }}>{selected.icon} {selected.name}</span>
              <span className="chip c-sky">⏱️ {mins} min match</span>
              <span className="chip c-lime">{isSolo ? "🧍 Solo" : `👥 ${maxPlayers} seats`}</span>
            </div>
            <button className="press p-coral lg full" id="createBtn" onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…"
                : isSolo ? `🎯 Start solo · ${mins} min`
                : `🚀 Create room · ${mins} min`}
            </button>
          </div>

          <div className="stack">
            <div className="pop" style={{ padding: 26 }}>
              <h2 style={{ fontSize: "1.4rem", marginBottom: 6 }}>🔗 Got a code?</h2>
              <p className="muted" style={{ fontSize: ".92rem", marginBottom: 16 }}>
                Type the six letters your friend sent you.
              </p>
              <form onSubmit={handleJoin}>
                {/* Six letter tiles. A transparent input sits over them so the
                    tiles are what you see but a real field is what you type. */}
                <div className="code" style={{ justifyContent: "center", marginBottom: 18, position: "relative", cursor: "text" }}
                  onClick={() => codeRef.current?.focus()}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span key={i} className={joinCode[i] ? undefined : "muted"}>{joinCode[i] || "·"}</span>
                  ))}
                  <input ref={codeRef} value={joinCode} aria-label="Room code" inputMode="latin"
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0,
                             border: 0, padding: 0, background: "transparent", cursor: "text" }} />
                </div>
                <button type="submit" className="press p-mint full" disabled={joining || !joinCode.trim()}>
                  {joining ? "Joining…" : "🔗 Join room"}
                </button>
              </form>
            </div>
            <CrewCard />
            <div className="note" style={{ background: "var(--sun)" }}>
              💡 Rooms stay open until the host starts. No rush — grab a snack.
            </div>
          </div>
        </div>

        <section className="sec">
          <div className="sec-h">
            <h2>🌐 Rooms you can hop into</h2>
            <span className="chip c-mint">{rooms.length} open</span>
          </div>

          {loadingRooms ? (
            <div className="note" style={{ background: "var(--paper2)", textAlign: "center" }}>Looking for rooms…</div>
          ) : rooms.length === 0 ? (
            <div className="pop" style={{ padding: "48px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: 10 }}>🪑</div>
              <p className="muted">No open rooms right now.</p>
              <p className="muted" style={{ fontSize: ".9rem", marginTop: 4 }}>Create one above and invite a friend!</p>
            </div>
          ) : (
            <div className="tiles">
              {rooms.map((room) => {
                const g = GAME_MAP[room.game_slug];
                const mins = Math.round((room.duration_seconds || 120) / 60);
                const col = g?.col || "var(--sun)";
                const icon = room.game_icon || g?.icon || "🎮";
                return (
                  <button key={room.id} className="tile" onClick={() => quickJoin(room.room_code)}>
                    <PeekBuddy colour={col} size={54} />
                    <span className="top" style={{ background: col, height: 96 }}>
                      <span className="ghost">{icon}</span>
                      <span className="big" style={{ fontSize: "2.8rem" }}>{icon}</span>
                    </span>
                    <span className="bot" style={{ display: "block" }}>
                      <h3 style={{ fontSize: "1.1rem" }}>{room.game_name}</h3>
                      <p style={{ marginBottom: 10 }}>Hosted by {room.host_name}</p>
                      <span className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <span className="row" style={{ gap: 6 }}>
                          <span className="chip c-lime">👥 {room.player_count}/{room.max_players}</span>
                          <span className="chip c-sky">⏱️ {mins}m</span>
                        </span>
                        <span className="display" style={{ letterSpacing: ".14em", fontSize: "1rem" }}>{room.room_code}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// Your friends at a glance: faces only, a green pip means online right now.
// Tap a face for their name and when they were last on.
function CrewCard() {
  const { friends } = usePresence();
  const [pick, setPick] = useState(null);
  const onlineCt = friends.filter((f) => f.online).length;
  const picked = friends.find((f) => f.id === pick);

  return (
    <div className="pop" style={{ padding: 22 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ fontSize: "1.25rem" }}>👥 Your crew</h2>
        {friends.length > 0 && <span className="chip c-lime">{onlineCt} online</span>}
      </div>
      {friends.length === 0 ? (
        <p className="muted" style={{ fontSize: ".92rem" }}>
          No friends yet. <Link to="/friends" className="linkish">Add some</Link> to see when they're on.
        </p>
      ) : (
        <>
          <div className="crewfaces">
            {friends.map((f) => (
              <button key={f.id} type="button" className="crewface" aria-pressed={pick === f.id}
                onClick={() => setPick((p) => (p === f.id ? null : f.id))}
                title={`${f.username}: ${presenceLabel(f)}`} aria-label={`${f.username}, ${presenceLabel(f)}`}>
                <Avatar emoji={f.avatar} size={46} seed={f.id} online={f.online} className={f.online ? "" : "is-off"} />
                <span className={`crewtag${f.online ? " on" : ""}`}>{presenceLabel(f, { short: true })}</span>
              </button>
            ))}
          </div>
          {picked && (
            <div className="crewwho">
              <strong>{picked.username}</strong> · <span className="muted">{presenceLabel(picked)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
