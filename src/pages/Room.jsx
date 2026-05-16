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

  const [friends,        setFriends]        = useState([]);
  const [showInvite,     setShowInvite]     = useState(false);
  const [inviteToast,    setInviteToast]    = useState("");
  const [invitedIds,     setInvitedIds]     = useState(new Set());

  const chatRef    = useRef(null);
  const pollRef    = useRef(null);
  const leftRef    = useRef(false);     // make sure we only call /leave once
  const inviteRef  = useRef(null);

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

  // Single leave helper — idempotent, used on tab close + explicit Quit/Back.
  const leaveRoom = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    // keepalive lets the request complete even if the tab is closing.
    try {
      const token = localStorage.getItem("pr_token");
      fetch(`/api/rooms/${code}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        keepalive: true,
      });
    } catch { /* silent */ }
  }, [code]);

  const exitToLobby = useCallback(() => {
    leaveRoom();
    navigate("/lobby");
  }, [leaveRoom, navigate]);

  useEffect(() => {
    fetchRoom();
    poll();
    pollRef.current = setInterval(poll, 2000);
    const onUnload = () => leaveRoom();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(pollRef.current);
      window.removeEventListener("beforeunload", onUnload);
      // NOTE: do NOT call leaveRoom() here — React 18 StrictMode double-invokes
      // effects in dev (mount → unmount → mount) which would mark the room
      // abandoned the instant it's created. Leave is fired explicitly on
      // user-intent actions (back button, quit) + beforeunload (tab close).
    };
  }, [fetchRoom, poll, leaveRoom]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chat]);

  // Load friend list once for the invite picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await api.get("/api/friends");
        const data = await res.json();
        if (!cancelled && data.success) setFriends(data.friends);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Close invite popover on outside click / escape.
  useEffect(() => {
    if (!showInvite) return;
    const onClick = (e) => { if (inviteRef.current && !inviteRef.current.contains(e.target)) setShowInvite(false); };
    const onKey   = (e) => { if (e.key === "Escape") setShowInvite(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [showInvite]);

  async function sendInvite(friendId) {
    setInviteToast("");
    try {
      const res  = await api.post(`/api/rooms/${code}/invite`, { user_id: friendId });
      const data = await res.json();
      if (data.success) {
        setInvitedIds(prev => new Set(prev).add(friendId));
        setInviteToast("Invite sent!");
      } else {
        setInviteToast(data.message || "Could not send invite.");
      }
    } catch { setInviteToast("Invite failed."); }
  }

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

  const me           = players.find(p => p.user_id === user?.id);
  const isHost       = !!me?.is_host;
  const isSpectator  = !!me?.is_spectator;
  const seatedPlayers    = players.filter(p => !p.is_spectator);
  const watchingPlayers  = players.filter(p =>  p.is_spectator);
  const canStart     = isHost && seatedPlayers.length >= 1 && status === "waiting";

  // ── Room ended ────────────────────────────────────────────────────────────
  if (status === "abandoned" || status === "finished") {
    return (
      <div style={{ minHeight:"100vh", padding:"32px 20px", background:"var(--bg)" }}>
        <div style={{ maxWidth:520, margin:"0 auto" }}>
          <div className="card" style={{ textAlign:"center" }}>
            <div style={{ fontSize:"3rem", marginBottom:12 }}>
              {status === "abandoned" ? "🚪" : "🏁"}
            </div>
            <h1 style={{ fontSize:"1.4rem", fontWeight:900, marginBottom:8 }}>
              {status === "abandoned" ? "Room closed" : "Game finished"}
            </h1>
            <p style={{ color:"var(--muted)", marginBottom:20 }}>
              {status === "abandoned"
                ? "The host left or the room was abandoned."
                : "This room's game has ended."}
            </p>
            <button className="btn btn-primary btn-full" onClick={() => navigate("/lobby")}>
              ← Back to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── In-game ───────────────────────────────────────────────────────────────
  if (status === "in_progress" && seed !== null && !isSpectator) {
    clearInterval(pollRef.current);
    const GameComponent = room?.game_slug === "memory" ? MemoryGame : MahjongGame;
    return (
      <GameComponent
        roomCode={code}
        seed={seed}
        players={seatedPlayers}
        currentUser={user}
        onGameEnd={async (_score, _pairs, _moves, won) => {
          // Server reads the validated score from room_players; we only signal win/loss + room.
          try { await api.post("/api/leaderboard/update", { room_code: code, won: !!won }); } catch { /* silent */ }
          exitToLobby();
        }}
      />
    );
  }

  // ── Spectator view (game in progress, I'm watching) ───────────────────────
  if (status === "in_progress" && isSpectator && seed !== null) {
    const watched = seatedPlayers.find(p => p.is_host) || seatedPlayers[0];
    let parsedState = null;
    try { parsedState = watched?.game_state ? JSON.parse(watched.game_state) : null; } catch { parsedState = null; }

    if (!watched) {
      return (
        <div style={{ minHeight:"100vh", padding:"32px 20px", background:"var(--bg)" }}>
          <div style={{ maxWidth:520, margin:"0 auto" }}>
            <div className="card" style={{ textAlign:"center" }}>
              <div style={{ fontSize:"3rem", marginBottom:12 }}>👀</div>
              <p style={{ color:"var(--muted)", marginBottom:20 }}>Waiting for a player to watch…</p>
              <button className="btn btn-outline btn-full" onClick={exitToLobby}>
                ← Leave Spectator Mode
              </button>
            </div>
          </div>
        </div>
      );
    }

    const GameComponent = room?.game_slug === "memory" ? MemoryGame : MahjongGame;
    return (
      <GameComponent
        roomCode={code}
        seed={seed}
        players={seatedPlayers}
        currentUser={user}
        isSpectator
        spectatorState={parsedState}
        spectatorWatching={watched}
        onGameEnd={exitToLobby}
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
            Players ({seatedPlayers.length}/{room?.max_players || 2})
          </h3>
          <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
            {Array.from({ length: room?.max_players || 2 }).map((_, i) => {
              const p = seatedPlayers[i];
              return p ? (
                <div key={i} style={{ flex:1, minWidth:130, background:"rgba(78,203,113,0.08)",
                  border:"1.5px solid rgba(78,203,113,0.35)", borderRadius:14, padding:16, textAlign:"center" }}>
                  <div style={{ width:48, height:48, borderRadius:"50%", margin:"0 auto 8px",
                    background:"linear-gradient(135deg,var(--accent),var(--accent2))",
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.5rem", lineHeight:1 }}>
                    <span style={{ lineHeight:1 }}>{p.avatar}</span>
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

          {/* Spectators */}
          {watchingPlayers.length > 0 && (
            <>
              <h3 style={{ color:"var(--muted)", fontSize:"0.78rem", textTransform:"uppercase", letterSpacing:1, fontWeight:600, marginBottom:10 }}>
                👀 Watching ({watchingPlayers.length})
              </h3>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:20 }}>
                {watchingPlayers.map(p => (
                  <div key={p.user_id} style={{ background:"var(--surface2)", borderRadius:20,
                    padding:"4px 12px", fontSize:"0.85rem", display:"flex", alignItems:"center", gap:6 }}>
                    <span>{p.avatar}</span>
                    <span>{p.username}{p.user_id === user?.id && " (You)"}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Invite friends */}
          {status === "waiting" && me && (
            <div ref={inviteRef} style={{ position:"relative", marginBottom:12 }}>
              <button className="btn btn-outline btn-full" onClick={() => setShowInvite(s => !s)}>
                👥 Invite Friends
              </button>
              {showInvite && (
                <div style={{ position:"absolute", top:"calc(100% + 8px)", left:0, right:0, zIndex:50,
                  background:"var(--surface)", border:"1.5px solid var(--surface2)", borderRadius:12,
                  padding:8, maxHeight:260, overflowY:"auto", boxShadow:"0 10px 30px rgba(0,0,0,0.4)" }}>
                  {friends.length === 0 ? (
                    <div style={{ padding:14, textAlign:"center", color:"var(--muted)", fontSize:"0.88rem" }}>
                      No friends yet. <a href="/friends" style={{ color:"var(--accent)" }}>Find some →</a>
                    </div>
                  ) : friends.map(f => {
                    const inRoom = players.some(p => p.user_id === f.id);
                    const sent   = invitedIds.has(f.id);
                    return (
                      <div key={f.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px" }}>
                        <div style={{ width:32, height:32, borderRadius:"50%",
                          background:"linear-gradient(135deg,var(--accent),var(--accent2))",
                          display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1rem", lineHeight:1 }}>
                          <span style={{ lineHeight:1 }}>{f.avatar}</span>
                        </div>
                        <div style={{ flex:1, fontSize:"0.9rem", fontWeight:600 }}>{f.username}</div>
                        {inRoom ? (
                          <span style={{ color:"var(--muted)", fontSize:"0.8rem" }}>In room</span>
                        ) : sent ? (
                          <span style={{ color:"var(--green)", fontSize:"0.8rem" }}>✓ Invited</span>
                        ) : (
                          <button className="btn btn-primary btn-sm" onClick={() => sendInvite(f.id)}>
                            Invite
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {inviteToast && (
                <div style={{ marginTop:8, color:"var(--muted)", fontSize:"0.82rem", textAlign:"center" }}>
                  {inviteToast}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {canStart && (
            <button className="btn btn-primary btn-full" onClick={handleStart} disabled={starting} style={{ marginBottom:12 }}>
              {starting ? "Starting…" : "🚀 Start Game!"}
            </button>
          )}
          {isSpectator && status === "waiting" && (
            <div className="alert alert-info" style={{ marginBottom:12 }}>
              👀 You're spectating — you'll see live scores when the game begins.
            </div>
          )}
          {!isHost && !isSpectator && status === "waiting" && (
            <div className="alert alert-info" style={{ marginBottom:12 }}>
              ⏳ Waiting for the host to start the game…
            </div>
          )}
          <button className="btn btn-outline btn-full" onClick={exitToLobby}>
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
