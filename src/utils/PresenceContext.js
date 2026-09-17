// src/utils/PresenceContext.js
// Your friends, whether each is online (and if not, when they were last seen),
// and your inbox count. Kept live over the socket, so the navbar, the lobby,
// the Crew page and the in-game header all agree without each polling on its own.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import { useSocket } from "./SocketContext";

const PresenceContext = createContext(null);

// Online first, then whoever was seen most recently, then by name.
function byPresence(a, b) {
  if (a.online !== b.online) return a.online ? -1 : 1;
  const ta = a.last_seen ? Date.parse(a.last_seen) : 0;
  const tb = b.last_seen ? Date.parse(b.last_seen) : 0;
  if (ta !== tb) return tb - ta;
  return String(a.username).localeCompare(String(b.username));
}

export function PresenceProvider({ children }) {
  const { isLoggedIn } = useAuth();
  const { socket } = useSocket() || {};

  const [list, setList] = useState([]);           // [{ id, username, avatar, friends_since }]
  const [presence, setPresence] = useState({});   // id -> { online, last_seen }
  const [inboxCount, setInboxCount] = useState(0);
  // Bumps whenever requests or invites change, so pages showing them can reload.
  const [inboxVersion, setInboxVersion] = useState(0);

  const merge = useCallback((map) => {
    setPresence((prev) => {
      const next = { ...prev };
      for (const [id, p] of Object.entries(map || {})) {
        next[id] = { online: !!p.online, last_seen: p.last_seen || prev[id]?.last_seen || null };
      }
      return next;
    });
  }, []);

  const loadFriends = useCallback(async () => {
    try {
      const res = await api.get("/api/friends");
      const data = await res.json();
      if (!data.success) return;
      setList(data.friends);
      merge(Object.fromEntries(data.friends.map((f) => [f.id, f])));
    } catch { /* offline: keep what we have */ }
  }, [merge]);

  const loadInbox = useCallback(async () => {
    try {
      const res = await api.get("/api/friends/inbox-count");
      const data = await res.json();
      if (data.success) setInboxCount(data.count || 0);
    } catch { /* silent */ }
  }, []);

  const refresh = useCallback(() => {
    loadFriends();
    loadInbox();
    setInboxVersion((v) => v + 1);
  }, [loadFriends, loadInbox]);

  // Boot, plus slow polling as a safety net for when the socket is down.
  useEffect(() => {
    if (!isLoggedIn) {
      setList([]);
      setPresence({});
      setInboxCount(0);
      return undefined;
    }
    loadFriends();
    loadInbox();
    const f = setInterval(loadFriends, 60000);
    const i = setInterval(loadInbox, 30000);
    return () => { clearInterval(f); clearInterval(i); };
  }, [isLoggedIn, loadFriends, loadInbox]);

  // Live updates.
  useEffect(() => {
    if (!socket) return undefined;
    const onSnapshot = (map) => merge(map);
    const onUpdate = ({ userId, online, last_seen }) => merge({ [userId]: { online, last_seen } });
    const onInbox = () => { loadInbox(); setInboxVersion((v) => v + 1); };
    const onFriends = () => refresh();
    const onReconnect = () => { loadFriends(); loadInbox(); };   // catch up on anything missed

    socket.on("presence:snapshot", onSnapshot);
    socket.on("presence:update", onUpdate);
    socket.on("friend:request", onInbox);
    socket.on("room:invite", onInbox);
    socket.on("friend:accepted", onFriends);
    socket.on("friends:changed", onFriends);
    socket.on("connect", onReconnect);
    return () => {
      socket.off("presence:snapshot", onSnapshot);
      socket.off("presence:update", onUpdate);
      socket.off("friend:request", onInbox);
      socket.off("room:invite", onInbox);
      socket.off("friend:accepted", onFriends);
      socket.off("friends:changed", onFriends);
      socket.off("connect", onReconnect);
    };
  }, [socket, merge, loadFriends, loadInbox, refresh]);

  const friends = useMemo(
    () => list
      .map((f) => ({ ...f, online: !!presence[f.id]?.online, last_seen: presence[f.id]?.last_seen || null }))
      .sort(byPresence),
    [list, presence]
  );

  const value = useMemo(() => ({
    friends,
    inboxCount,
    inboxVersion,
    refresh,
    presenceOf: (id) => presence[id] || null,
    isOnline: (id) => !!presence[id]?.online,
  }), [friends, inboxCount, inboxVersion, refresh, presence]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

const EMPTY = {
  friends: [], inboxCount: 0, inboxVersion: 0,
  refresh() {}, presenceOf: () => null, isOnline: () => false,
};

export function usePresence() {
  return useContext(PresenceContext) || EMPTY;
}
