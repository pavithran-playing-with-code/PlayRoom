// src/pages/Rooms.jsx
// Rooms, of two kinds. Game rooms: getting into someone else's match — a code
// a friend sent, or an open room (starting your own is the Play tab, /lobby).
// Movie rooms: made right here — you're in at once, nothing to start — and
// listed on their own, so friends can walk in while the film is on.
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../utils/api";
import { GAME_MAP } from "../components/games/registry";
import { useToast, Icon } from "../components/ui";
import PeekBuddy from "../components/characters/PeekBuddy";
import GameIcon from "../components/games/GameIcon";

export default function Rooms() {
  const navigate = useNavigate();
  const toast = useToast();

  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const codeRef = useRef(null);
  const [moviePrivate, setMoviePrivate] = useState(false);
  const [making, setMaking] = useState(false);

  // A movie room: made and entered in one tap. Four seats (the room's call holds four).
  async function makeMovieRoom() {
    setMaking(true);
    try {
      const res = await api.post("/api/rooms", { game_slug: "movie", max_players: 4, is_private: moviePrivate, duration_seconds: 0, mode: "free" });
      const data = await res.json();
      if (!data.success) { toast.error(data.message || "Couldn't make the movie room."); return; }
      navigate(`/room/${data.room.room_code}`);
    } catch { toast.error("Couldn't make the movie room."); }
    finally { setMaking(false); }
  }

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

  async function join(code) {
    const res = await api.post("/api/rooms/join", { room_code: code });
    const data = await res.json();
    if (!data.success) { toast.error(data.message || "Could not join."); return; }
    navigate(`/room/${code}`);
  }

  async function handleJoin(e) {
    e?.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    try { await join(joinCode.trim().toUpperCase()); }
    catch { toast.error("Failed to join room."); }
    finally { setJoining(false); }
  }

  async function quickJoin(code) {
    try { await join(code); } catch { toast.error("Could not join."); }
  }

  const gameRooms = rooms.filter((r) => r.game_slug !== "movie");
  const movieRooms = rooms.filter((r) => r.game_slug === "movie");

  return (
    <div className="wrap">
      <div className="mid">
        <div className="pop rm-movie">
          <div className="rm-movie-icon" aria-hidden="true">🍿</div>
          <div className="rm-movie-txt">
            <h2 className="rm-h">Movie room</h2>
            <p>Play a movie from your phone. Alone it's your own player; when friends walk in they watch it with you, and you can talk.</p>
            <label className="rm-movie-opt">
              <input type="checkbox" className="switch" checked={moviePrivate} onChange={(e) => setMoviePrivate(e.target.checked)} />
              <span>{moviePrivate ? "Private — only people with the link" : "Public — anyone can walk in from the list below"}</span>
            </label>
          </div>
          <button type="button" className="press p-sun full" onClick={makeMovieRoom} disabled={making}>
            {making ? "Opening…" : "🎬 Create a movie room"}
          </button>
        </div>

        <section className="sec" style={{ marginTop: 26 }}>
          <div className="sec-h">
            <h2 className="rm-h">🎬 Movie rooms</h2>
            <span className="chip c-coral">{movieRooms.length} open</span>
          </div>
          {movieRooms.length === 0 ? (
            <div className="note" style={{ background: "var(--paper2)", textAlign: "center" }}>{loadingRooms ? "Looking for rooms…" : "No movie rooms open right now."}</div>
          ) : (
            <div className="rm-movies">
              {movieRooms.map((room) => (
                <button key={room.id} className="pop rm-movie-row" onClick={() => quickJoin(room.room_code)} disabled={Number(room.player_count) >= Number(room.max_players)}>
                  <span className="rm-movie-row-icon" aria-hidden="true">🎬</span>
                  <span className="rm-movie-row-txt"><b>{room.host_name}'s movie room</b><small>{room.player_count} of {room.max_players} watching</small></span>
                  <span className="chip c-sun">{Number(room.player_count) >= Number(room.max_players) ? "Full" : "Join"}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="pop rm-code" style={{ marginTop: 30 }}>
          <h2 className="rm-h"><Icon name="link" size={22} stroke={2.8} /> Got a code?</h2>
          <p className="muted" style={{ fontSize: ".9rem", marginBottom: 14 }}>
            Type the six letters your friend sent you.
          </p>
          <form onSubmit={handleJoin}>
            {/* Six letter tiles. A transparent input sits over them so the
                tiles are what you see but a real field is what you type. */}
            <div className="code" style={{ justifyContent: "center", marginBottom: 16, position: "relative", cursor: "text" }}
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
              {joining ? "Joining…" : <><Icon name="arrow" size={18} stroke={2.8} /> Join room</>}
            </button>
          </form>
        </div>

        <section className="sec" style={{ marginTop: 30 }}>
          <div className="sec-h">
            <h2 className="rm-h"><Icon name="globe" size={26} stroke={2.6} /> Game rooms</h2>
            <span className="chip c-mint">{gameRooms.length} open</span>
          </div>

          {loadingRooms ? (
            <div className="note" style={{ background: "var(--paper2)", textAlign: "center" }}>Looking for rooms…</div>
          ) : gameRooms.length === 0 ? (
            <div className="pop" style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: 10 }}>🪑</div>
              <p className="muted">No open game rooms right now.</p>
              <Link to="/lobby" className="press p-coral" style={{ marginTop: 16 }}><Icon name="play" size={18} /> Start one</Link>
            </div>
          ) : (
            <div className="tiles">
              {gameRooms.map((room) => {
                const g = GAME_MAP[room.game_slug];
                const mins = Number(room.duration_seconds) === 0 ? "∞" : `${Math.round((room.duration_seconds || 120) / 60)}m`;
                const col = g?.col || "var(--sun)";
                const icon = room.game_icon || g?.icon || "🎮";
                return (
                  <button key={room.id} className="tile" onClick={() => quickJoin(room.room_code)}>
                    <PeekBuddy colour={col} size={54} />
                    <span className="top" style={{ background: col, height: 96 }}>
                      <span className="ghost"><GameIcon icon={icon} slug={room.game_slug} /></span>
                      <span className="big" style={{ fontSize: "2.8rem" }}><GameIcon icon={icon} slug={room.game_slug} /></span>
                    </span>
                    <span className="bot" style={{ display: "block" }}>
                      <h3 style={{ fontSize: "1.1rem" }}>{room.game_name}</h3>
                      <p style={{ marginBottom: 10 }}>Hosted by {room.host_name}</p>
                      <span className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <span className="row" style={{ gap: 6 }}>
                          <span className="chip c-lime"><Icon name="people" size={13} stroke={2.8} /> {room.player_count}/{room.max_players}</span>
                          <span className="chip c-sky"><Icon name="clock" size={13} stroke={2.8} /> {mins}</span>
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
