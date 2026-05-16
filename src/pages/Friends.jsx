// src/pages/Friends.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";

const panel = {
  background:"var(--surface)", border:"1.5px solid var(--surface2)",
  borderRadius:16, padding:24,
};
const inputStyle = {
  flex:1, padding:"10px 14px", background:"var(--surface2)",
  border:"1.5px solid #4a3070", borderRadius:10, color:"var(--text)",
  outline:"none", fontSize:"0.9rem",
};

function Avatar({ emoji, size = 40 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:"50%",
      background:"linear-gradient(135deg,var(--accent),var(--accent2))",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize: size * 0.5, lineHeight:1, flexShrink:0 }}>
      <span style={{ lineHeight:1 }}>{emoji || "🎮"}</span>
    </div>
  );
}

export default function Friends() {
  const navigate = useNavigate();

  const [tab,       setTab]       = useState("friends"); // friends | requests | invites | find
  const [friends,   setFriends]   = useState([]);
  const [incoming,  setIncoming]  = useState([]);
  const [outgoing,  setOutgoing]  = useState([]);
  const [invites,   setInvites]   = useState([]);
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState([]);
  const [busy,      setBusy]      = useState({});
  const [toast,     setToast]     = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [f, p, i] = await Promise.all([
        api.get("/api/friends"),
        api.get("/api/friends/pending"),
        api.get("/api/friends/invites"),
      ]);
      const fd = await f.json();
      const pd = await p.json();
      const id = await i.json();
      if (fd.success) setFriends(fd.friends);
      if (pd.success) { setIncoming(pd.incoming); setOutgoing(pd.outgoing); }
      if (id.success) setInvites(id.invites);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 10000);
    return () => clearInterval(t);
  }, [loadAll]);

  async function search() {
    if (query.trim().length < 2) { setResults([]); return; }
    setBusy(b => ({ ...b, search: true }));
    try {
      const res  = await api.get(`/api/friends/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (data.success) setResults(data.users);
    } catch { /* silent */ }
    finally { setBusy(b => ({ ...b, search: false })); }
  }

  async function call(method, url, key) {
    setBusy(b => ({ ...b, [key]: true }));
    try {
      const res  = await api[method](url);
      const data = await res.json();
      if (!data.success) setToast(data.message || "Action failed.");
      else setToast("");
    } catch { setToast("Request failed."); }
    finally {
      setBusy(b => ({ ...b, [key]: false }));
      loadAll();
    }
  }

  async function sendRequest(userId) {
    setBusy(b => ({ ...b, [`req-${userId}`]: true }));
    try {
      const res  = await api.post("/api/friends/request", { user_id: userId });
      const data = await res.json();
      if (!data.success) setToast(data.message || "Could not send request.");
      else {
        setToast("Friend request sent!");
        // Mark inline so the button updates.
        setResults(rs => rs.map(u => u.id === userId ? { ...u, rel_status: "pending", rel_requested_by: -1 } : u));
      }
    } catch { setToast("Request failed."); }
    finally {
      setBusy(b => ({ ...b, [`req-${userId}`]: false }));
      loadAll();
    }
  }

  async function acceptInvite(inv) {
    setBusy(b => ({ ...b, [`inv-${inv.id}`]: true }));
    try {
      const res = await api.post("/api/rooms/join", { room_code: inv.room_code });
      const data = await res.json();
      if (data.success) {
        navigate(`/room/${inv.room_code}`);
      } else {
        setToast(data.message || "Could not join room.");
      }
    } catch { setToast("Could not join."); }
    finally { setBusy(b => ({ ...b, [`inv-${inv.id}`]: false })); loadAll(); }
  }

  const tabs = [
    { id:"friends",  label:`👥 Friends ${friends.length ? `(${friends.length})` : ""}` },
    { id:"requests", label:`📬 Requests ${incoming.length ? `(${incoming.length})` : ""}` },
    { id:"invites",  label:`🎮 Invites ${invites.length ? `(${invites.length})` : ""}` },
    { id:"find",     label:"🔍 Find People" },
  ];

  return (
    <div style={{ minHeight:"calc(100vh - 60px)", padding:"32px 20px" }}>
      <div style={{ maxWidth:760, margin:"0 auto" }}>
        <h1 style={{ fontSize:"1.8rem", fontWeight:900, marginBottom:4 }}>Friends 👥</h1>
        <p style={{ color:"var(--muted)", marginBottom:24 }}>Find friends, accept requests, and accept room invites.</p>

        {toast && (
          <div className="alert alert-info" style={{ marginBottom:16 }}>{toast}</div>
        )}

        <div style={{ display:"flex", gap:6, marginBottom:20, flexWrap:"wrap" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:"8px 14px", borderRadius:20, fontSize:"0.88rem", fontWeight:600,
                border:"1.5px solid var(--surface2)", cursor:"pointer",
                background: tab === t.id ? "var(--accent)" : "transparent",
                color: tab === t.id ? "#1a0930" : "var(--muted)" }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "friends" && (
          <div style={panel}>
            {friends.length === 0 ? (
              <Empty icon="🫂" line="No friends yet — search for people to add!" />
            ) : friends.map(f => (
              <FriendRow key={f.id} f={f}
                busy={!!busy[`del-${f.id}`]}
                onRemove={() => {
                  if (window.confirm(`Remove ${f.username} from friends?`))
                    call("delete", `/api/friends/${f.id}`, `del-${f.id}`);
                }} />
            ))}
          </div>
        )}

        {tab === "requests" && (
          <>
            <div style={panel}>
              <h3 style={hdr}>Incoming</h3>
              {incoming.length === 0 ? <Empty line="No incoming requests." />
                : incoming.map(r => (
                  <RequestRow key={r.id} r={r}
                    onAccept={() => call("post", `/api/friends/${r.id}/accept`, `acc-${r.id}`)}
                    onReject={() => call("post", `/api/friends/${r.id}/reject`, `rej-${r.id}`)}
                    busyA={!!busy[`acc-${r.id}`]} busyR={!!busy[`rej-${r.id}`]} />
                ))}
            </div>
            <div style={{ ...panel, marginTop:16 }}>
              <h3 style={hdr}>Sent</h3>
              {outgoing.length === 0 ? <Empty line="No outgoing requests." />
                : outgoing.map(r => (
                  <SentRow key={r.id} r={r}
                    onCancel={() => call("post", `/api/friends/${r.id}/reject`, `can-${r.id}`)}
                    busy={!!busy[`can-${r.id}`]} />
                ))}
            </div>
          </>
        )}

        {tab === "invites" && (
          <div style={panel}>
            {invites.length === 0 ? <Empty icon="📭" line="No pending invites." />
              : invites.map(inv => (
                <InviteRow key={inv.id} inv={inv}
                  onAccept={() => acceptInvite(inv)}
                  onDecline={() => call("post", `/api/friends/invites/${inv.id}/decline`, `dec-${inv.id}`)}
                  busyA={!!busy[`inv-${inv.id}`]} busyD={!!busy[`dec-${inv.id}`]} />
              ))}
          </div>
        )}

        {tab === "find" && (
          <div style={panel}>
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              <input style={inputStyle} value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && search()}
                placeholder="Search by username (min 2 chars)…" />
              <button className="btn btn-primary btn-sm" onClick={search}
                disabled={busy.search || query.trim().length < 2}>
                {busy.search ? "…" : "Search"}
              </button>
            </div>
            {results.length === 0 ? (
              query.trim().length < 2
                ? <Empty line="Type at least 2 characters to search." />
                : <Empty icon="🔍" line="No users found." />
            ) : results.map(u => (
              <SearchRow key={u.id} u={u}
                busy={!!busy[`req-${u.id}`]}
                onSend={() => sendRequest(u.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const hdr = { color:"var(--muted)", fontSize:"0.78rem", textTransform:"uppercase", letterSpacing:1, fontWeight:600, marginBottom:12 };

function Empty({ icon = "🪑", line }) {
  return (
    <div style={{ textAlign:"center", padding:"30px 10px", color:"var(--muted)" }}>
      <div style={{ fontSize:"2rem", marginBottom:8 }}>{icon}</div>
      <p>{line}</p>
    </div>
  );
}

function Row({ children }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0",
      borderBottom:"1px solid var(--surface2)" }}>
      {children}
    </div>
  );
}

function FriendRow({ f, busy, onRemove }) {
  return (
    <Row>
      <Avatar emoji={f.avatar} />
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700 }}>{f.username}</div>
        <div style={{ color:"var(--muted)", fontSize:"0.78rem" }}>Friends since {new Date(f.friends_since).toLocaleDateString()}</div>
      </div>
      <button className="btn btn-outline btn-sm" onClick={onRemove} disabled={busy}>
        {busy ? "…" : "Remove"}
      </button>
    </Row>
  );
}

function RequestRow({ r, onAccept, onReject, busyA, busyR }) {
  return (
    <Row>
      <Avatar emoji={r.avatar} />
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700 }}>{r.username}</div>
        <div style={{ color:"var(--muted)", fontSize:"0.78rem" }}>wants to be friends</div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={onAccept} disabled={busyA || busyR}>
        {busyA ? "…" : "Accept"}
      </button>
      <button className="btn btn-outline btn-sm" onClick={onReject} disabled={busyA || busyR}>
        {busyR ? "…" : "Reject"}
      </button>
    </Row>
  );
}

function SentRow({ r, onCancel, busy }) {
  return (
    <Row>
      <Avatar emoji={r.avatar} />
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700 }}>{r.username}</div>
        <div style={{ color:"var(--muted)", fontSize:"0.78rem" }}>Pending…</div>
      </div>
      <button className="btn btn-outline btn-sm" onClick={onCancel} disabled={busy}>
        {busy ? "…" : "Cancel"}
      </button>
    </Row>
  );
}

function InviteRow({ inv, onAccept, onDecline, busyA, busyD }) {
  return (
    <Row>
      <Avatar emoji={inv.from_avatar} />
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700 }}>{inv.from_username}</div>
        <div style={{ color:"var(--muted)", fontSize:"0.78rem" }}>
          invited you to {inv.game_icon} {inv.game_name} · {inv.room_code}
        </div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={onAccept} disabled={busyA || busyD}>
        {busyA ? "…" : "Join"}
      </button>
      <button className="btn btn-outline btn-sm" onClick={onDecline} disabled={busyA || busyD}>
        {busyD ? "…" : "Decline"}
      </button>
    </Row>
  );
}

function SearchRow({ u, onSend, busy }) {
  let action;
  if (u.rel_status === "accepted") {
    action = <span style={{ color:"var(--green)", fontSize:"0.85rem", fontWeight:600 }}>✓ Friends</span>;
  } else if (u.rel_status === "pending") {
    action = <span style={{ color:"var(--muted)", fontSize:"0.85rem" }}>Pending…</span>;
  } else if (u.rel_status === "blocked") {
    action = <span style={{ color:"var(--muted)", fontSize:"0.85rem" }}>Unavailable</span>;
  } else {
    action = (
      <button className="btn btn-primary btn-sm" onClick={onSend} disabled={busy}>
        {busy ? "…" : "Add Friend"}
      </button>
    );
  }
  return (
    <Row>
      <Avatar emoji={u.avatar} />
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700 }}>{u.username}</div>
      </div>
      {action}
    </Row>
  );
}
