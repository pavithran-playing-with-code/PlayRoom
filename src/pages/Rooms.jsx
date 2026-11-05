// src/pages/Rooms.jsx
// Getting into someone else's match: a code a friend sent, or an open room.
// (Starting your own is the Play tab, /lobby.)
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../utils/api";
import { GAME_MAP } from "../components/games/registry";
import { useToast } from "../components/ui";
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

  return (
    <div className="wrap">
      <div className="mid">
        <div className="pop rm-code">
          <h2 style={{ fontSize: "1.35rem", marginBottom: 4 }}>🔗 Got a code?</h2>
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
              {joining ? "Joining…" : "🔗 Join room"}
            </button>
          </form>
        </div>

        <section className="sec" style={{ marginTop: 30 }}>
          <div className="sec-h">
            <h2>🌐 Open rooms</h2>
            <span className="chip c-mint">{rooms.length} open</span>
          </div>

          {loadingRooms ? (
            <div className="note" style={{ background: "var(--paper2)", textAlign: "center" }}>Looking for rooms…</div>
          ) : rooms.length === 0 ? (
            <div className="pop" style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: 10 }}>🪑</div>
              <p className="muted">No open rooms right now.</p>
              <Link to="/lobby" className="press p-coral" style={{ marginTop: 16 }}>🎮 Start one</Link>
            </div>
          ) : (
            <div className="tiles">
              {rooms.map((room) => {
                const g = GAME_MAP[room.game_slug];
                const mins = Number(room.duration_seconds) === 0 ? "∞" : `${Math.round((room.duration_seconds || 120) / 60)}m`;
                const col = g?.col || "var(--sun)";
                const icon = room.game_icon || g?.icon || "🎮";
                return (
                  <button key={room.id} className="tile" onClick={() => quickJoin(room.room_code)}>
                    <PeekBuddy colour={col} size={54} />
                    <span className="top" style={{ background: col, height: 96 }}>
                      <span className="ghost"><GameIcon icon={icon} /></span>
                      <span className="big" style={{ fontSize: "2.8rem" }}><GameIcon icon={icon} /></span>
                    </span>
                    <span className="bot" style={{ display: "block" }}>
                      <h3 style={{ fontSize: "1.1rem" }}>{room.game_name}</h3>
                      <p style={{ marginBottom: 10 }}>Hosted by {room.host_name}</p>
                      <span className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <span className="row" style={{ gap: 6 }}>
                          <span className="chip c-lime">👥 {room.player_count}/{room.max_players}</span>
                          <span className="chip c-sky">⏱️ {mins}</span>
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
