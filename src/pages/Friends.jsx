// src/pages/Friends.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../utils/api";
import { usePresence } from "../utils/PresenceContext";
import { presenceLabel } from "../utils/timeAgo";
import { Avatar, Tabs, useToast } from "../components/ui";

export default function Friends() {
  const navigate = useNavigate();
  const toast = useToast();
  const { presenceOf, inboxVersion, refresh } = usePresence();

  const [tab, setTab] = useState("friends");
  const [watchBusy, setWatchBusy] = useState(null);
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [invites, setInvites] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState({});

  const loadAll = useCallback(async () => {
    try {
      const [f, p, i] = await Promise.all([
        api.get("/api/friends"),
        api.get("/api/friends/pending"),
        api.get("/api/friends/invites"),
      ]);
      const fd = await f.json(); const pd = await p.json(); const id = await i.json();
      if (fd.success) setFriends(fd.friends);
      if (pd.success) { setIncoming(pd.incoming); setOutgoing(pd.outgoing); }
      if (id.success) setInvites(id.invites);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 15000);
    return () => clearInterval(t);
  }, [loadAll]);

  // Live: a request or invite just arrived, or someone answered one.
  useEffect(() => { if (inboxVersion) loadAll(); }, [inboxVersion, loadAll]);

  async function search() {
    if (query.trim().length < 2) { setResults([]); return; }
    setBusy((b) => ({ ...b, search: true }));
    try {
      const res = await api.get(`/api/friends/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (data.success) setResults(data.users);
    } catch { /* silent */ } finally { setBusy((b) => ({ ...b, search: false })); }
  }

  async function call(method, url, key, okMsg) {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await api[method](url);
      const data = await res.json();
      if (!data.success) toast.error(data.message || "Action failed.");
      else if (okMsg) toast.success(okMsg);
    } catch { toast.error("Request failed."); }
    finally { setBusy((b) => ({ ...b, [key]: false })); refresh(); }
  }

  async function sendRequest(userId) {
    setBusy((b) => ({ ...b, [`req-${userId}`]: true }));
    try {
      const res = await api.post("/api/friends/request", { user_id: userId });
      const data = await res.json();
      if (!data.success) toast.error(data.message || "Could not send request.");
      else {
        toast.success("Friend request sent!");
        setResults((rs) => rs.map((u) => u.id === userId ? { ...u, rel_status: "pending", rel_requested_by: -1 } : u));
      }
    } catch { toast.error("Request failed."); }
    finally { setBusy((b) => ({ ...b, [`req-${userId}`]: false })); loadAll(); }
  }

  async function acceptInvite(inv) {
    setBusy((b) => ({ ...b, [`inv-${inv.id}`]: true }));
    try {
      const res = await api.post("/api/rooms/join", { room_code: inv.room_code });
      const data = await res.json();
      if (data.success) navigate(`/room/${inv.room_code}`);
      else toast.error(data.message || "Could not join room.");
    } catch { toast.error("Could not join."); }
    finally { setBusy((b) => ({ ...b, [`inv-${inv.id}`]: false })); loadAll(); }
  }

  const tabs = [
    { id: "friends", label: "👥 Crew", count: friends.length },
    { id: "requests", label: "📬 Requests", count: incoming.length },
    { id: "invites", label: "🎮 Invites", count: invites.length },
    { id: "find", label: "🔍 Find people" },
  ];

  const online = (id) => !!presenceOf(id)?.online;

  // Joining a room that is already under way seats you as a spectator.
  async function watch(friend) {
    const code = friend.playing?.room_code;
    if (!code || watchBusy) return;
    setWatchBusy(friend.id);
    try {
      const res = await api.post("/api/rooms/join", { room_code: code });
      const data = await res.json();
      if (data.success) navigate(`/room/${code}?watch=${friend.id}`);
      else toast.error(data.message || "Could not watch that match.");
    } catch { toast.error("Could not watch that match."); }
    finally { setWatchBusy(null); }
  }

  return (
    <div className="wrap">
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ fontSize: "2.1rem", marginBottom: 6 }}>Your crew 👥</h1>
        <p className="muted" style={{ marginBottom: 26 }}>
          Add people once, then drop them straight into a room.
        </p>

        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <div style={{ height: 26 }} />

        {tab === "friends" && (
          friends.length === 0
            ? <Empty icon="🫂" line="No friends yet — go find some people!" />
            : <div className="stack">
                {friends.map((f) => (
                  <Row key={f.id}>
                    <Avatar emoji={f.avatar} size={48} seed={f.id} online={online(f.id)} />
                    <Who name={f.username}
                      sub={f.playing ? `${f.playing.game_icon || "🎮"} playing ${f.playing.game_name}`
                        : online(f.id) ? "🟢 online now · ready to play"
                        : presenceOf(f.id)?.last_seen ? presenceLabel(presenceOf(f.id))
                        : `friends since ${new Date(f.friends_since).toLocaleDateString()}`} />
                    {f.playing && (
                      <button className="press p-sun sm" disabled={watchBusy === f.id}
                        onClick={() => watch(f)}
                        aria-label={`Watch ${f.username} play ${f.playing.game_name}`}>
                        {watchBusy === f.id ? "…" : "👁️ Watch"}
                      </button>
                    )}
                    <button className="press p-white sm" disabled={!!busy[`del-${f.id}`]}
                      onClick={() => {
                        if (window.confirm(`Remove ${f.username}?`)) {
                          call("delete", `/api/friends/${f.id}`, `del-${f.id}`, "Friend removed.");
                        }
                      }}>
                      {busy[`del-${f.id}`] ? "…" : "Remove"}
                    </button>
                  </Row>
                ))}
              </div>
        )}

        {tab === "requests" && (
          <>
            <div className="muted eyebrow">Wants to join your crew</div>
            {incoming.length === 0 ? <Empty line="No incoming requests." /> : (
              <div className="stack" style={{ marginBottom: 32 }}>
                {incoming.map((r) => (
                  <Row key={r.id} tone="var(--paper2)">
                    <Avatar emoji={r.avatar} size={48} seed={r.user_id} />
                    <Who name={r.username} sub="wants to be friends" />
                    <button className="press p-white sm" disabled={!!busy[`rej-${r.id}`]}
                      onClick={() => call("post", `/api/friends/${r.id}/reject`, `rej-${r.id}`)}>Nah</button>
                    <button className="press p-lime sm" disabled={!!busy[`acc-${r.id}`]}
                      onClick={() => call("post", `/api/friends/${r.id}/accept`, `acc-${r.id}`, "Friend added!")}>Add ✓</button>
                  </Row>
                ))}
              </div>
            )}

            <div className="muted eyebrow">Requests you sent</div>
            {outgoing.length === 0 ? <Empty line="No outgoing requests." /> : (
              <div className="stack">
                {outgoing.map((r) => (
                  <Row key={r.id}>
                    <Avatar emoji={r.avatar} size={48} seed={r.user_id} />
                    <Who name={r.username} sub="waiting for them to answer…" />
                    <button className="press p-white sm" disabled={!!busy[`can-${r.id}`]}
                      onClick={() => call("post", `/api/friends/${r.id}/reject`, `can-${r.id}`)}>Cancel</button>
                  </Row>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "invites" && (
          invites.length === 0
            ? <Empty icon="📭" line="No pending invites." />
            : <div className="stack">
                {invites.map((inv) => (
                  <Row key={inv.id} tone="var(--paper2)">
                    <Avatar emoji={inv.from_avatar} size={48} seed={inv.from_id} online={online(inv.from_id)} />
                    <Who name={inv.from_username}
                      sub={`invited you to ${inv.game_icon} ${inv.game_name} · ${inv.room_code}`} />
                    <button className="press p-white sm" disabled={!!busy[`dec-${inv.id}`]}
                      onClick={() => call("post", `/api/friends/invites/${inv.id}/decline`, `dec-${inv.id}`)}>Decline</button>
                    <button className="press p-lime sm" disabled={!!busy[`inv-${inv.id}`]}
                      onClick={() => acceptInvite(inv)}>🎮 Join</button>
                  </Row>
                ))}
              </div>
        )}

        {tab === "find" && (
          <>
            <div className="inline" style={{ marginBottom: 28 }}>
              <input className="press p-white" style={{ justifyContent: "flex-start", fontFamily: "Nunito", fontWeight: 700 }}
                placeholder="Search a username…" value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()} />
              <button className="press p-sky" onClick={search} disabled={busy.search || query.trim().length < 2}>
                {busy.search ? "…" : "🔍 Search"}
              </button>
            </div>

            {results.length === 0 ? (
              query.trim().length < 2
                ? <Empty icon="⌨️" line="Type at least 2 characters to search." />
                : <Empty icon="🔍" line="No players found by that name." />
            ) : (
              <div className="stack">
                {results.map((u) => (
                  <Row key={u.id}>
                    <Avatar emoji={u.avatar} size={48} seed={u.id}
                      online={u.rel_status === "accepted" ? online(u.id) : undefined} />
                    <Who name={u.username}
                      sub={u.rel_status === "accepted" ? presenceLabel(presenceOf(u.id)) : "player"} />
                    {u.rel_status === "accepted" ? <span className="chip c-lime">✓ In your crew</span>
                      : u.rel_status === "pending" ? <span className="chip">Pending…</span>
                      : u.rel_status === "blocked" ? <span className="chip">Unavailable</span>
                      : <button className="press p-lime sm" disabled={!!busy[`req-${u.id}`]}
                          onClick={() => sendRequest(u.id)}>
                          {busy[`req-${u.id}`] ? "…" : "Add ✓"}
                        </button>}
                  </Row>
                ))}
              </div>
            )}
          </>
        )}

        {friends.length === 0 && tab === "friends" && (
          <div className="note" style={{ background: "var(--sun)", marginTop: 20 }}>
            💡 Search for a username in <button className="linkish" onClick={() => setTab("find")}>Find people</button>,
            or share a room code from the <Link to="/lobby" className="linkish">lobby</Link>.
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ children, tone }) {
  return <div className="pop row" style={{ padding: "14px 18px", gap: 14, background: tone }}>{children}</div>;
}

function Who({ name, sub }) {
  return (
    <span style={{ flex: 1, minWidth: 0 }}>
      <span className="display" style={{ display: "block", fontSize: "1.15rem" }}>{name}</span>
      <span className="muted" style={{ fontSize: ".85rem" }}>{sub}</span>
    </span>
  );
}

function Empty({ icon = "🪑", line }) {
  return (
    <div className="pop" style={{ padding: "48px 20px", textAlign: "center" }}>
      <div style={{ fontSize: "3rem", marginBottom: 10 }}>{icon}</div>
      <p className="muted">{line}</p>
    </div>
  );
}
