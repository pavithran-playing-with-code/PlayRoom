// src/components/Notifier.jsx
// Live pop-ups for things that happen to you while you're somewhere else in the
// app, mid-game included: a friend request, a room invite, a request accepted,
// a friend coming online. Requests and invites carry their own buttons, so you
// can answer without leaving what you're doing.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useSocket } from "../utils/SocketContext";
import { usePresence } from "../utils/PresenceContext";
import { Avatar } from "./ui";

// How long each kind stays up (ms). Requests and invites also wait in the Crew page.
const LIFETIME = { request: 20000, invite: 25000, info: 5000, online: 4000 };
const MAX_SHOWN = 4;

export default function Notifier() {
  const { socket } = useSocket() || {};
  const { friends, refresh } = usePresence();
  const navigate = useNavigate();
  const location = useLocation();

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(null);
  const seq = useRef(0);
  const timers = useRef(new Map());
  const friendsRef = useRef(friends);
  useEffect(() => { friendsRef.current = friends; }, [friends]);

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  // `key` de-duplicates: a second invite to the same room replaces the first.
  const push = useCallback((item) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.filter((x) => x.key !== item.key), { ...item, id }].slice(-MAX_SHOWN));
    timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME[item.kind] || 6000));
  }, [dismiss]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const onRequest = (p) => push({
      key: `req-${p.id}`, kind: "request", reqId: p.id, face: p.from, text: "wants to be your friend",
    });
    const onInvite = (p) => push({
      key: `inv-${p.room_code}`, kind: "invite", invId: p.id, room: p.room_code, face: p.from,
      text: `invited you to ${p.game_icon || "🎮"} ${p.game_name || "a game"}`,
    });
    const onAccepted = (p) => push({
      key: `acc-${p.by?.id}`, kind: "info", face: p.by, text: "accepted your friend request 🎉",
    });
    const onPresence = ({ userId, online }) => {
      if (!online) return;
      const f = friendsRef.current.find((x) => Number(x.id) === Number(userId));
      if (f) push({ key: `on-${f.id}`, kind: "online", face: f, text: "is online" });
    };
    socket.on("friend:request", onRequest);
    socket.on("room:invite", onInvite);
    socket.on("friend:accepted", onAccepted);
    socket.on("presence:update", onPresence);
    return () => {
      socket.off("friend:request", onRequest);
      socket.off("room:invite", onInvite);
      socket.off("friend:accepted", onAccepted);
      socket.off("presence:update", onPresence);
    };
  }, [socket, push]);

  async function acceptRequest(n) {
    setBusy(n.id);
    try {
      const res = await api.post(`/api/friends/${n.reqId}/accept`);
      const data = await res.json();
      dismiss(n.id);
      push(data.success
        ? { key: `added-${n.reqId}`, kind: "info", face: n.face, text: "is in your crew now 🎉" }
        : { key: `err-${n.reqId}`, kind: "info", face: n.face, text: data.message || "That request is gone." });
    } catch {
      dismiss(n.id);
    } finally {
      setBusy(null);
      refresh();
    }
  }

  async function declineInvite(n) {
    dismiss(n.id);
    try { if (n.invId) await api.post(`/api/friends/invites/${n.invId}/decline`); } catch { /* silent */ }
    refresh();
  }

  async function joinInvite(n) {
    const here = location.pathname.match(/^\/room\/([A-Za-z0-9]+)/);
    const current = here ? here[1].toUpperCase() : null;
    if (current === n.room) { dismiss(n.id); return; }
    if (current && !window.confirm(
      "Leave the room you're in and join this one? If you're the host, your room closes for everyone."
    )) return;

    setBusy(n.id);
    try {
      if (current) await api.post(`/api/rooms/${current}/leave`);
      const res = await api.post("/api/rooms/join", { room_code: n.room });
      const data = await res.json();
      dismiss(n.id);
      if (data.success) navigate(`/room/${n.room}`);
      else push({ key: `err-${n.room}`, kind: "info", face: n.face, text: data.message || "That room isn't open any more." });
    } catch {
      dismiss(n.id);
    } finally {
      setBusy(null);
      refresh();
    }
  }

  if (!items.length) return null;

  return (
    <div className="notistack" aria-live="polite">
      {items.map((n) => (
        <div key={n.id} className={`noti noti-${n.kind}`} role="status">
          <Avatar emoji={n.face?.avatar || "🎮"} size={n.kind === "online" ? 30 : 42} seed={n.face?.id}
            online={n.kind === "online" ? true : undefined} />
          <div className="noti-body">
            <div><strong>{n.face?.username || "Someone"}</strong> {n.text}</div>
            {n.kind === "request" && (
              <div className="noti-acts">
                <button className="press p-lime sm" disabled={busy === n.id} onClick={() => acceptRequest(n)}>
                  {busy === n.id ? "…" : "Add ✓"}
                </button>
                <button className="press p-white sm" onClick={() => dismiss(n.id)}>Later</button>
              </div>
            )}
            {n.kind === "invite" && (
              <div className="noti-acts">
                <button className="press p-lime sm" disabled={busy === n.id} onClick={() => joinInvite(n)}>
                  {busy === n.id ? "Joining…" : "🎮 Join"}
                </button>
                <button className="press p-white sm" onClick={() => declineInvite(n)}>No thanks</button>
              </div>
            )}
          </div>
          <button type="button" className="noti-x" onClick={() => dismiss(n.id)} aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}
