// src/pages/Room.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { useSocket } from "../utils/SocketContext";
import { getGameComponent, GAME_MAP } from "../components/games/registry";
import { Avatar, Modal } from "../components/ui";
import { usePresence } from "../utils/PresenceContext";
import { presenceLabel } from "../utils/timeAgo";

// Keyed by the room code, so going straight from one room to another (an
// invite accepted from inside a room) starts clean instead of inheriting the
// old room's status, seed and players.
export default function RoomPage() {
  const { code } = useParams();
  return <Room key={code} />;
}

function Room() {
  const { code } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { socket } = useSocket() || {};

  const [room,      setRoom]      = useState(null);
  const [players,   setPlayers]   = useState([]);
  const [status,    setStatus]    = useState("waiting");
  const [seed,      setSeed]      = useState(null);
  const [duration,  setDuration]  = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [serverNow, setServerNow] = useState(null);
  const [chat,      setChat]      = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [error,     setError]     = useState("");
  const [starting,  setStarting]  = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [copied,    setCopied]    = useState(false);

  const { friends } = usePresence();
  const [played,         setPlayed]         = useState(false);
  const [showInvite,     setShowInvite]     = useState(false);
  const [inviteToast,    setInviteToast]    = useState("");
  const [invitedIds,     setInvitedIds]     = useState(new Set());
  const [notFound,       setNotFound]       = useState(false);
  const [redirectIn,     setRedirectIn]     = useState(4);

  const chatRef    = useRef(null);
  const pollRef    = useRef(null);
  const leftRef    = useRef(false);     // make sure we only call /leave once
  const inviteRef  = useRef(null);

  // Derived up here because the polling effect below needs isSpectator.
  const me          = players.find(p => p.user_id === user?.id);
  const isSpectator = !!me?.is_spectator;

  // Pause the room poll while we're actually playing — the game component runs
  // its own score/opponent sync loop, so a second timer is pure duplicate load.
  // Spectators keep polling: their whole view is rendered from poll data.
  const pausePolling = notFound || played || (status === "in_progress" && !isSpectator);

  const fetchRoom = useCallback(async () => {
    try {
      const res  = await api.get(`/api/rooms/${code}`);
      const data = await res.json();
      if (!data.success) { setNotFound(true); setError(data.message || "Room not found."); return; }
      setRoom(data.room);
      setPlayers(data.room.players || []);
      if (data.room.duration_seconds) setDuration(data.room.duration_seconds);
    } catch { setError("Could not load room."); }
  }, [code]);

  const poll = useCallback(async () => {
    try {
      const res  = await api.get(`/api/rooms/${code}/poll`);
      const data = await res.json();
      if (!data.success) {
        if (res.status === 404) setNotFound(true);
        return;
      }
      setStatus(data.status);
      setSeed(data.seed);
      if (data.duration_seconds) setDuration(data.duration_seconds);
      setStartedAt(data.started_at || null);
      setServerNow(data.server_now || null);
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

  // Countdown + auto-redirect when the room doesn't exist.
  // (Polling has already stopped — `pausePolling` covers notFound.)
  useEffect(() => {
    if (!notFound) return;
    setRedirectIn(4);
    const t = setInterval(() => {
      setRedirectIn(n => {
        if (n <= 1) { clearInterval(t); navigate("/lobby"); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [notFound, navigate]);

  // Leave on tab close. Kept in its own effect so it stays armed even while
  // polling is paused mid-game.
  // NOTE: do NOT call leaveRoom() in the cleanup — React 18 StrictMode
  // double-invokes effects in dev (mount → unmount → mount), which would mark
  // the room abandoned the instant it's created. Leave fires only on explicit
  // user intent (back button, quit) and on tab close.
  useEffect(() => {
    const onUnload = () => leaveRoom();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [leaveRoom]);

  // Real-time: subscribe to this room's channel and refresh the instant the
  // server says something changed. Polling below stays as a safety net for
  // dropped sockets, but at a much slower cadence now that it isn't the only
  // way to learn about a join, a chat line or the host pressing Start.
  useEffect(() => {
    if (!socket || notFound) return;
    const refresh = () => poll();
    // A join changes who's here AND the seat count, so refresh both.
    const joined = () => { poll(); fetchRoom(); };
    socket.emit("room:join", code);
    socket.on("room:players", joined);
    socket.on("room:started", refresh);
    socket.on("room:chat", refresh);
    socket.on("room:ended", refresh);
    return () => {
      socket.emit("room:leave", code);
      socket.off("room:players", joined);
      socket.off("room:started", refresh);
      socket.off("room:chat", refresh);
      socket.off("room:ended", refresh);
    };
  }, [socket, code, poll, fetchRoom, notFound]);

  useEffect(() => {
    if (pausePolling) return;
    fetchRoom();
    poll();
    // The socket channel above delivers changes the moment they happen; this
    // is the safety net for when it's down. In the waiting room it has to be
    // quick, or the host stares at "Waiting for 1 more player…" long after
    // their friend arrived.
    pollRef.current = setInterval(poll, 2500);
    // Coming back to the tab shouldn't wait for the next tick either.
    const onWake = () => { if (document.visibilityState === "visible") { poll(); fetchRoom(); } };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [fetchRoom, poll, pausePolling]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chat]);

  // Once I'm in the game, stay in it until I leave. When the match ends (the
  // clock, or the host walked out) the game shows its own results screen and
  // records the score. Swapping to the "Game finished" card here used to pull
  // that screen away, and the result was never saved.
  useEffect(() => {
    if (status === "in_progress" && seed !== null && !isSpectator) setPlayed(true);
  }, [status, seed, isSpectator]);

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

  async function handleStart(confirmed = false) {
    if (!confirmed && seatsLeft > 0 && !isSolo) { setConfirmStart(true); return; }
    setConfirmStart(false);
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

  const isHost       = !!me?.is_host;
  const seatedPlayers    = players.filter(p => !p.is_spectator);
  const watchingPlayers  = players.filter(p =>  p.is_spectator);
  const canStart     = isHost && seatedPlayers.length >= 1 && status === "waiting";

  // A 1-seat room is a solo run: nobody else can join it (the API rejects joins
  // and hides it from the open-room list), so every "get people in here" affordance
  // — room code, invites, chat, empty seats — is noise and stays hidden.
  const isSolo       = (room?.max_players || 0) === 1;
  const seatsLeft    = room ? Math.max(0, (room.max_players || 1) - seatedPlayers.length) : 1;
  // Solo needs nobody; any other room needs one other person. Empty seats are
  // fine, but the host is asked first, so nobody starts a 5-player match by
  // accident while two friends are still typing in the code.
  const tooFewToStart = !isSolo && seatedPlayers.length < 2;

  // ── Room not found ────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <Notice emoji="🔍" title="Room not found">
        <p className="muted" style={{ marginBottom: 6 }}>
          No room with the code <span className="display" style={{ letterSpacing: ".16em" }}>{code}</span>.
        </p>
        <p className="muted" style={{ fontSize: ".9rem", marginBottom: 22 }}>
          Double-check it. Heading back to the lobby in <strong>{redirectIn}s</strong>…
        </p>
        <button className="press p-sun full" onClick={() => navigate("/lobby")}>← Back to lobby</button>
      </Notice>
    );
  }

  // ── Room ended ────────────────────────────────────────────────────────────
  if ((status === "abandoned" || status === "finished") && !played) {
    return (
      <Notice emoji={status === "abandoned" ? "🚪" : "🏁"}
        title={status === "abandoned" ? "Room closed" : "Game finished"}>
        <p className="muted" style={{ marginBottom: 22 }}>
          {status === "abandoned" ? "The host left or the room was abandoned." : "This room's game has ended."}
        </p>
        <button className="press p-sun full" onClick={() => navigate("/lobby")}>← Back to lobby</button>
      </Notice>
    );
  }

  // ── In-game ───────────────────────────────────────────────────────────────
  if ((played || status === "in_progress") && seed !== null && !isSpectator) {
    const GameComponent = getGameComponent(room?.game_slug);
    return (
      <GameComponent
        roomCode={code}
        seed={seed}
        players={seatedPlayers}
        currentUser={user}
        durationSeconds={duration || 120}
        startedAt={startedAt}
        serverNow={serverNow}
        onGameEnd={async () => {
          // The server reads the validated score from room_players AND decides
          // the outcome from it — nothing about the result is sent from here.
          try { await api.post("/api/leaderboard/update", { room_code: code }); } catch { /* silent */ }
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
        <Notice emoji="👀" title="Nobody to watch yet">
          <p className="muted" style={{ marginBottom: 22 }}>Waiting for a player to join the board…</p>
          <button className="press p-white full" onClick={exitToLobby}>← Leave spectator mode</button>
        </Notice>
      );
    }

    const GameComponent = getGameComponent(room?.game_slug);
    return (
      <GameComponent
        roomCode={code}
        seed={seed}
        players={seatedPlayers}
        currentUser={user}
        durationSeconds={duration || 120}
        startedAt={startedAt}
        serverNow={serverNow}
        isSpectator
        spectatorState={parsedState}
        spectatorWatching={watched}
        onGameEnd={exitToLobby}
      />
    );
  }


  // ── Waiting lobby ─────────────────────────────────────────────────────────
  const mins = duration ? Math.round(duration / 60) : null;
  const seats = room?.max_players || 2;
  const g = GAME_MAP[room?.game_slug];
  const col = g?.col || "var(--mint)";

  return (
    <div className="wrap">
      <div style={{ maxWidth: 820, margin: "0 auto" }}>

        <div className="row" style={{ justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
          <button className="press p-white sm" onClick={exitToLobby}>← Leave</button>
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="chip c-sun">{room?.game_icon || "🎮"} {room?.game_name || "Loading…"}</span>
            {mins && <span className="chip c-sky">⏱️ {mins} min match</span>}
            {isSolo && <span className="chip c-coral">🧍 Solo run</span>}
          </span>
        </div>

        {error && (
          <div className="note" style={{ background: "var(--coral)", color: "#fff", marginBottom: 18 }}>{error}</div>
        )}

        {/* Room code — only useful when someone else can actually join. Held back
            until `room` loads so a solo run never flashes a code. */}
        {!room ? null : isSolo ? (
          <div className="pop" style={{ padding: 30, textAlign: "center", marginBottom: 22, background: col }}>
            <div style={{ fontSize: "3rem", marginBottom: 8 }}>🎯</div>
            <div style={{ fontSize: "1.05rem" }}>Just you and the clock — beat your own best score.</div>
          </div>
        ) : (
          <div className="pop" style={{ padding: 30, textAlign: "center", marginBottom: 22, background: col }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>Room code — send it to a friend</div>
            <div className="code" style={{ justifyContent: "center", marginBottom: 18 }}>
              {code.split("").map((ch, i) => <span key={i}>{ch}</span>)}
            </div>
            <button className="press p-white sm" onClick={copyCode}>
              {copied ? "✅ Copied!" : "📋 Copy code"}
            </button>
          </div>
        )}

        <div className="pop" style={{ padding: 26 }}>
          <h3 style={{ fontSize: "1.25rem", marginBottom: 16 }}>
            {isSolo ? "Ready to go" : `Who's here (${seatedPlayers.length} of ${seats})`}
          </h3>

          <div className="row" style={{ gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
            {Array.from({ length: seats }).map((_, i) => {
              const p = seatedPlayers[i];
              return p ? (
                <div key={i} className="slot filled">
                  <div style={{ marginBottom: 10 }}>
                    <Avatar emoji={p.avatar} size={56} seed={p.user_id} />
                  </div>
                  <div style={{ fontSize: "1rem" }}>{p.username}</div>
                  {/* "Host" is meaningless when you're the only player. */}
                  {!!p.is_host && !isSolo && <div style={{ fontSize: ".8rem", marginTop: 3 }}>👑 Host</div>}
                  {p.user_id === user?.id && <div className="muted" style={{ fontSize: ".8rem" }}>that's you</div>}
                </div>
              ) : (
                <div key={i} className="slot">
                  <div className="slot-empty">?</div>
                  <div className="muted" style={{ fontSize: ".92rem" }}>empty seat</div>
                </div>
              );
            })}
          </div>

          {/* Spectators */}
          {watchingPlayers.length > 0 && (
            <>
              <div className="muted eyebrow">👀 Watching ({watchingPlayers.length})</div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                {watchingPlayers.map((p) => (
                  <span key={p.user_id} className="chip">
                    {p.avatar} {p.username}{p.user_id === user?.id && " (you)"}
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            {/* Invite friends — never in a solo run, there's no seat to fill. */}
            {status === "waiting" && me && !isSolo && (
              <span ref={inviteRef} style={{ position: "relative", flex: 1, minWidth: 180 }}>
                <button className="press p-white full" onClick={() => setShowInvite((s) => !s)}>
                  👥 Invite friends
                </button>
                {showInvite && (
                  <div className="menu" style={{ left: 0, right: 0, maxHeight: 260, overflowY: "auto" }}>
                    {friends.length === 0 ? (
                      <div className="muted" style={{ padding: 14, textAlign: "center", fontSize: ".9rem" }}>
                        No friends yet. <Link to="/friends" style={{ textDecoration: "underline" }}>Find some →</Link>
                      </div>
                    ) : friends.map((f) => {
                      const inRoom = players.some((p) => p.user_id === f.id);
                      const sent = invitedIds.has(f.id);
                      return (
                        <div key={f.id} className="row" style={{ gap: 10, padding: "8px 10px" }}>
                          <Avatar emoji={f.avatar} size={32} seed={f.id} online={f.online} />
                          <span style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
                            <span style={{ display: "block", fontSize: ".92rem" }}>{f.username}</span>
                            <span className="muted" style={{ fontSize: ".74rem" }}>{presenceLabel(f)}</span>
                          </span>
                          {inRoom ? <span className="muted" style={{ fontSize: ".78rem" }}>In room</span>
                            : sent ? <span className="chip c-lime" style={{ fontSize: ".72rem" }}>✓ Invited</span>
                            : <button className="press p-lime sm" onClick={() => sendInvite(f.id)}>Invite</button>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </span>
            )}

            {canStart && (
              <button className="press p-coral lg" style={{ flex: 2, minWidth: 220 }}
                onClick={() => handleStart()} disabled={starting || tooFewToStart}>
                {starting ? "Starting…"
                  : tooFewToStart ? "⏳ Waiting for someone to join…"
                  : isSolo ? "🎯 Start solo run!"
                  : seatsLeft > 0 ? `🚀 Start with ${seatedPlayers.length} of ${seats}`
                  : "🚀 Start the game!"}
              </button>
            )}
          </div>

          {canStart && tooFewToStart && (
            <div className="note" style={{ background: "var(--paper2)", marginTop: 16 }}>
              👥 Send the code or invite a friend — a match needs at least two players.
              (Want to play on your own? Start a solo run from the lobby.)
            </div>
          )}

          {/* Starting with empty seats: say who's actually playing first. */}
          <Modal open={confirmStart} onClose={() => setConfirmStart(false)} title="Start without a full room?">
            <p style={{ marginBottom: 8 }}>
              {seatedPlayers.length} of {seats} seats are taken, so this match is between{" "}
              <strong>{seatedPlayers.map((p) => p.username).join(" and ")}</strong>.
            </p>
            <p className="muted" style={{ fontSize: ".9rem", marginBottom: 20 }}>
              The {seatsLeft} empty seat{seatsLeft > 1 ? "s" : ""} stay{seatsLeft > 1 ? "" : "s"} empty, and the
              result counts for the players who are here. Anyone who arrives later can still watch.
            </p>
            <div className="inline">
              <button className="press p-white" style={{ flex: 1 }} onClick={() => setConfirmStart(false)}>
                ⏳ Keep waiting
              </button>
              <button className="press p-coral" style={{ flex: 1 }} onClick={() => handleStart(true)}>
                🚀 Start with {seatedPlayers.length}
              </button>
            </div>
          </Modal>

          {inviteToast && <div className="muted" style={{ marginTop: 10, fontSize: ".82rem" }}>{inviteToast}</div>}

          {isSpectator && status === "waiting" && (
            <div className="note" style={{ background: "var(--sky)", marginTop: 20 }}>
              👀 You're spectating — you'll see live scores when the game begins.
            </div>
          )}
          {!isHost && !isSpectator && status === "waiting" && (
            <div className="note" style={{ background: "var(--paper2)", marginTop: 20 }}>
              ⏳ Waiting for the host to start the game…
            </div>
          )}

          {/* Chat — hidden in a solo run; there's nobody to talk to. */}
          {!isSolo && (
            <div className="note" style={{ background: "var(--paper2)", marginTop: 24, boxShadow: "none" }}>
              <div className="muted eyebrow">💬 Chat</div>
              <div ref={chatRef} className="stack" style={{ gap: 10, marginBottom: 14, maxHeight: 210, overflowY: "auto" }}>
                {chat.length === 0 ? (
                  <div className="muted" style={{ fontSize: ".9rem", padding: "6px 0" }}>No messages yet — say hi!</div>
                ) : chat.map((m, i) => (
                  <div key={i} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                    <Avatar emoji={m.avatar} size={34} seed={m.username} />
                    <span style={{ fontSize: ".95rem" }}>
                      <strong>{m.username}</strong> <span className="muted">{m.message}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="inline">
                <input className="press p-white" style={{ justifyContent: "flex-start", fontFamily: "Nunito", fontWeight: 700 }}
                  placeholder="Say something nice…" value={chatInput} maxLength={200}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()} />
                <button className="press p-sun" onClick={sendChat}>Send</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Full-page message card — "room not found", "room closed" and the empty
// spectator state are otherwise three copies of the same layout.
function Notice({ emoji, title, children }) {
  return (
    <div className="wrap" style={{ display: "flex", alignItems: "center", minHeight: "100vh" }}>
      <div className="pop" style={{ maxWidth: 440, margin: "0 auto", padding: 30, textAlign: "center" }}>
        <div style={{ fontSize: "3.4rem", marginBottom: 10 }}>{emoji}</div>
        <h1 style={{ fontSize: "1.7rem", marginBottom: 8 }}>{title}</h1>
        {children}
      </div>
    </div>
  );
}
