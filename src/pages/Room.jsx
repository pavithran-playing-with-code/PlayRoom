// src/pages/Room.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import MahjongGame from "../components/MahjongGame";
import MemoryGame  from "../components/MemoryGame";

export default function Room() {
  const { code } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [room,      setRoom]      = useState(null);
  const [players,   setPlayers]   = useState([]);
  const [status,    setStatus]    = useState("waiting");
  const [seed,      setSeed]      = useState(null);
  const [chat,      setChat]      = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [error,     setError]     = useState("");
  const [starting,  setStarting]  = useState(false);
  const [copied,    setCopied]    = useState(false);

  const chatRef = useRef(null);
  const pollRef = useRef(null);

  const fetchRoom = useCallback(async () => {
    try {
      const res  = await api.get(`/api/rooms/${code}`);
      const data = await res.json();
      if (!data.success) { setError("Room not found."); return; }
      setRoom(data.room);
      setPlayers(data.room.players || []);
    } catch { setError("Could not load room."); }
  }, [code]);

  const poll = useCallback(async () => {
    try {
      const res  = await api.get(`/api/rooms/${code}/poll`);
      const data = await res.json();
      if (!data.success) return;
      setStatus(data.status);
      setSeed(data.seed);
      setPlayers(data.players || []);
      setChat(data.chat || []);
    } catch { /* silent */ }
  }, [code]);

  useEffect(() => {
    fetchRoom();
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current);
  }, [fetchRoom, poll]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chat]);

  async function handleStart() {
    setStarting(true);
    try {
      const res  = await api.patch(`/api/rooms/${code}/start`, {});
      const data = await res.json();
      if (!data.success) setError(data.message);
    } catch { setError("Failed to start game."); }
    finally { setStarting(false); }
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    try { await api.post(`/api/rooms/${code}/chat`, { message: msg }); } catch { /* silent */ }
  }

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  const isHost   = players.find(p => p.user_id === user?.id)?.is_host;
  const canStart = isHost && players.length >= 1 && status === "waiting";

  // ── In-game ───────────────────────────────────────────────────────────────
  if (status === "in_progress" && seed !== null) {
    clearInterval(pollRef.current);
    const GameComponent = room?.game_slug === "memory" ? MemoryGame : MahjongGame;
    return (
      <GameComponent
        roomCode={code}
        seed={seed}
        players={players}
        currentUser={user}
        onGameEnd={async (score, pairs, moves, won) => {
          try { await api.post("/api/leaderboard/update", { score, won: !!won }); } catch { /* silent */ }
          navigate("/lobby");
        }}
      />
    );
  }

  // ── Waiting lobby ─────────────────────────────────────────────────────────
  const inputStyle = {
    flex:1, padding:"10px 14px", background:"var(--surface2)",
    border:"1.5px solid #4a3070", borderRadius:10, color:"var(--text)",
    outline:"none", fontSize:"0.9rem",
  };

  return (
    <div style={{ minHeight:"100vh", padding:"32px 20px", background:"var(--bg)" }}>
      <div style={{ maxWidth:680, margin:"0 auto" }}>

        {error && <div className="alert alert-error" style={{ marginBottom:20 }}>{error}</div>}

        <div className="card">
          {/* Game icon + title */}
          <div style={{ textAlign:"center", marginBottom:24 }}>
            <div style={{ fontSize:"2.8rem", marginBottom:8 }}>{room?.game_icon || "🎮"}</div>
            <h1 style={{ fontSize:"1.5rem", fontWeight:900, marginBottom:4 }}>
              {room?.game_name || "Loading…"}
            </h1>
            <span style={{ color:"var(--muted)", fontSize:"0.9rem" }}>
              {status === "waiting" ? "🟡 Waiting for players…" : "🟢 Game in progress"}
            </span>
          </div>

          {/* Room code box */}
          <div style={{ background:"var(--surface2)", borderRadius:14, padding:20, textAlign:"center", marginBottom:24 }}>
            <div style={{ color:"var(--muted)", fontSize:"0.78rem", textTransform:"uppercase", letterSpacing:2, marginBottom:8 }}>
              Room Code — Share with friends
            </div>
            <div style={{ fontSize:"2.4rem", fontWeight:900, color:"var(--accent)", letterSpacing:10 }}>
              {code}
            </div>
            <button className="btn btn-outline btn-sm" style={{ marginTop:12 }} onClick={copyCode}>
              {copied ? "✅ Copied!" : "📋 Copy Code"}
            </button>
          </div>

          {/* Player slots */}
          <h3 style={{ color:"var(--muted)", fontSize:"0.8rem", textTransform:"uppercase", letterSpacing:1, fontWeight:600, marginBottom:14 }}>
            Players ({players.length}/{room?.max_players || 2})
          </h3>
          <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
            {Array.from({ length: room?.max_players || 2 }).map((_, i) => {
              const p = players[i];
              return p ? (
                <div key={i} style={{ flex:1, minWidth:130, background:"rgba(78,203,113,0.08)",
                  border:"1.5px solid rgba(78,203,113,0.35)", borderRadius:14, padding:16, textAlign:"center" }}>
                  <div style={{ width:48, height:48, borderRadius:"50%", margin:"0 auto 8px",
                    background:"linear-gradient(135deg,var(--accent),var(--accent2))",
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.5rem" }}>
                    {p.avatar}
                  </div>
                  <div style={{ fontWeight:700, fontSize:"0.95rem" }}>{p.username}</div>
                  {p.is_host        && <div style={{ color:"var(--accent)", fontSize:"0.75rem", marginTop:4 }}>👑 Host</div>}
                  {p.user_id === user?.id && <div style={{ color:"var(--green)",  fontSize:"0.75rem" }}>You</div>}
                </div>
              ) : (
                <div key={i} style={{ flex:1, minWidth:130, background:"var(--surface2)",
                  border:"1.5px dashed #4a3070", borderRadius:14, padding:16, textAlign:"center" }}>
                  <div style={{ width:48, height:48, borderRadius:"50%", margin:"0 auto 8px",
                    background:"var(--surface)", border:"2px dashed #4a3070",
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.4rem", color:"var(--muted)" }}>?</div>
                  <div style={{ color:"var(--muted)", fontSize:"0.85rem" }}>Waiting…</div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          {canStart && (
            <button className="btn btn-primary btn-full" onClick={handleStart} disabled={starting} style={{ marginBottom:12 }}>
              {starting ? "Starting…" : "🚀 Start Game!"}
            </button>
          )}
          {!isHost && status === "waiting" && (
            <div className="alert alert-info" style={{ marginBottom:12 }}>
              ⏳ Waiting for the host to start the game…
            </div>
          )}
          <button className="btn btn-outline btn-full" onClick={() => navigate("/lobby")}>
            ← Back to Lobby
          </button>

          {/* Chat */}
          <div style={{ marginTop:28 }}>
            <div style={{ fontWeight:700, marginBottom:10 }}>💬 Room Chat</div>
            <div ref={chatRef} style={{ background:"var(--surface2)", borderRadius:14, padding:14,
              maxHeight:200, overflowY:"auto", display:"flex", flexDirection:"column", gap:8 }}>
              {chat.length === 0 ? (
                <div style={{ textAlign:"center", color:"var(--muted)", fontSize:"0.85rem", padding:"10px 0" }}>
                  No messages yet — say hi!
                </div>
              ) : chat.map((m, i) => (
                <div key={i} style={{ background:"var(--surface)", borderRadius:8, padding:"8px 12px", fontSize:"0.85rem" }}>
                  <div style={{ color:"var(--accent)", fontSize:"0.72rem", fontWeight:700, marginBottom:2 }}>
                    {m.avatar} {m.username}
                  </div>
                  {m.message}
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <input style={inputStyle} placeholder="Type a message…"
                value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendChat()} maxLength={200} />
              <button className="btn btn-secondary btn-sm" onClick={sendChat}>Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
