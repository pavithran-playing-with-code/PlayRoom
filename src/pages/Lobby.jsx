// src/pages/Lobby.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";

const GAME_OPTS = [
  { slug:"mahjong", label:"🀄 Mahjong Solitaire" },
  { slug:"memory",  label:"🃏 Memory Match" },
];

export default function Lobby() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rooms,        setRooms]        = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const [createForm,  setCreateForm]  = useState({ game_slug:"mahjong", max_players:2, is_private:false });
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState("");

  const [joinCode,  setJoinCode]  = useState("");
  const [joining,   setJoining]   = useState(false);
  const [joinError, setJoinError] = useState("");

  const fetchRooms = useCallback(async () => {
    try {
      const res  = await api.get("/api/rooms");
      const data = await res.json();
      if (data.success) setRooms(data.rooms);
    } catch { /* silent */ } finally { setLoadingRooms(false); }
  }, []);

  useEffect(() => {
    fetchRooms();
    const t = setInterval(fetchRooms, 5000);
    return () => clearInterval(t);
  }, [fetchRooms]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError(""); setCreating(true);
    try {
      const res  = await api.post("/api/rooms", createForm);
      const data = await res.json();
      if (!data.success) { setCreateError(data.message); return; }
      navigate(`/room/${data.room.room_code}`);
    } catch { setCreateError("Failed to create room."); }
    finally { setCreating(false); }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoinError(""); setJoining(true);
    try {
      const code = joinCode.trim().toUpperCase();
      const res  = await api.post("/api/rooms/join", { room_code: code });
      const data = await res.json();
      if (!data.success) { setJoinError(data.message); return; }
      navigate(`/room/${code}`);
    } catch { setJoinError("Failed to join room."); }
    finally { setJoining(false); }
  }

  async function quickJoin(code) {
    try {
      const res  = await api.post("/api/rooms/join", { room_code: code });
      const data = await res.json();
      if (data.success) navigate(`/room/${code}`);
    } catch { /* silent */ }
  }

  const panelStyle = {
    background:"var(--surface)", border:"1.5px solid var(--surface2)",
    borderRadius:16, padding:24,
  };

  return (
    <div style={{ minHeight:"calc(100vh - 60px)", padding:"32px 20px" }}>
      <div style={{ maxWidth:1000, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28, flexWrap:"wrap", gap:12 }}>
          <div>
            <h1 style={{ fontSize:"1.8rem", fontWeight:900 }}>Game Lobby 🎮</h1>
            <p style={{ color:"var(--muted)", marginTop:4 }}>Welcome back, {user?.avatar} {user?.username}!</p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={fetchRooms}>🔄 Refresh</button>
        </div>

        {/* Create + Join panels */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:20, marginBottom:36 }}>

          {/* Create */}
          <div style={panelStyle}>
            <h2 style={{ fontSize:"1.1rem", fontWeight:700, marginBottom:20 }}>✨ Create Room</h2>
            {createError && <div className="alert alert-error">{createError}</div>}
            <form onSubmit={handleCreate}>
              <div className="input-group">
                <label>Game</label>
                <select value={createForm.game_slug}
                  onChange={e => setCreateForm(f => ({ ...f, game_slug: e.target.value }))}>
                  {GAME_OPTS.map(g => <option key={g.slug} value={g.slug}>{g.label}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Players</label>
                <select value={createForm.max_players}
                  onChange={e => setCreateForm(f => ({ ...f, max_players: parseInt(e.target.value) }))}>
                  <option value={1}>Solo (1 player)</option>
                  <option value={2}>1v1 (2 players)</option>
                </select>
              </div>
              <label style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, cursor:"pointer", color:"var(--muted)", fontSize:"0.9rem" }}>
                <input type="checkbox" checked={createForm.is_private}
                  onChange={e => setCreateForm(f => ({ ...f, is_private: e.target.checked }))}
                  style={{ width:16, height:16, accentColor:"var(--accent)" }} />
                Private room (invite only)
              </label>
              <button className="btn btn-primary btn-full" type="submit" disabled={creating}>
                {creating ? "Creating…" : "🚀 Create Room"}
              </button>
            </form>
          </div>

          {/* Join */}
          <div style={panelStyle}>
            <h2 style={{ fontSize:"1.1rem", fontWeight:700, marginBottom:20 }}>🔗 Join by Room Code</h2>
            {joinError && <div className="alert alert-error">{joinError}</div>}
            <form onSubmit={handleJoin}>
              <div className="input-group">
                <label>Room Code</label>
                <input type="text" placeholder="e.g. ABC123"
                  value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  style={{ textAlign:"center", letterSpacing:6, fontSize:"1.3rem", fontWeight:700 }} />
              </div>
              <button className="btn btn-secondary btn-full" type="submit" disabled={joining || !joinCode.trim()}>
                {joining ? "Joining…" : "🔗 Join Room"}
              </button>
            </form>
            <p style={{ marginTop:20, color:"var(--muted)", fontSize:"0.85rem", lineHeight:1.6 }}>
              💡 Tip: Share your Room Code with a friend and they can join instantly!
            </p>
          </div>
        </div>

        {/* Open rooms */}
        <h2 style={{ fontSize:"1.15rem", fontWeight:700, marginBottom:16 }}>
          🌐 Open Rooms
          {rooms.length > 0 && (
            <span style={{ marginLeft:10, background:"var(--surface2)", borderRadius:20,
              padding:"2px 10px", fontSize:"0.78rem", color:"var(--muted)", fontWeight:500 }}>
              {rooms.length}
            </span>
          )}
        </h2>

        {loadingRooms ? (
          <p style={{ color:"var(--muted)", padding:"40px 0", textAlign:"center" }}>Loading rooms…</p>
        ) : rooms.length === 0 ? (
          <div style={{ textAlign:"center", padding:"56px 20px", color:"var(--muted)" }}>
            <div style={{ fontSize:"3rem", marginBottom:12 }}>🪑</div>
            <p>No open rooms right now.</p>
            <p style={{ marginTop:8, fontSize:"0.9rem" }}>Create one and invite a friend!</p>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:16 }}>
            {rooms.map(room => (
              <div key={room.id} onClick={() => quickJoin(room.room_code)}
                style={{ background:"var(--surface)", border:"1.5px solid var(--surface2)", borderRadius:14,
                  padding:"18px 20px", cursor:"pointer", transition:"all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.transform="translateY(-4px)"; e.currentTarget.style.borderColor="var(--accent)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.borderColor="var(--surface2)"; }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ fontSize:"1.4rem" }}>{room.game_icon}</span>
                  <span style={{ background:"var(--surface2)", borderRadius:20, padding:"3px 10px", fontSize:"0.78rem", color:"var(--muted)" }}>
                    {room.player_count}/{room.max_players} 👥
                  </span>
                </div>
                <div style={{ fontWeight:700, marginBottom:4 }}>{room.game_name}</div>
                <div style={{ color:"var(--muted)", fontSize:"0.85rem", marginBottom:12 }}>Host: {room.host_name}</div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ background:"rgba(78,203,113,0.1)", color:"var(--green)",
                    border:"1px solid rgba(78,203,113,0.25)", borderRadius:20, padding:"3px 10px", fontSize:"0.78rem" }}>
                    🟢 Waiting
                  </span>
                  <span style={{ fontWeight:900, letterSpacing:3, color:"var(--accent)", fontSize:"1rem" }}>
                    {room.room_code}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
