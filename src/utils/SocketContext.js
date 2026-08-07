// src/utils/SocketContext.js
// Single shared Socket.io connection for the whole app. Connects only when the
// user is logged in (passes the JWT in the handshake), and tears down on logout.
//
// Real-time is ADDITIVE to the existing REST polling: components can listen for
// push events to refresh instantly, while polling remains a safety net.

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

// Same convention as utils/api.js: same-origin in prod (Express serves the
// build); in dev the CRA proxy forwards /socket.io to the backend on :4321.
const SOCKET_URL = process.env.REACT_APP_API_URL || undefined;

export function SocketProvider({ children }) {
  const { token, isLoggedIn } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  // Set of currently-online userIds (numbers), updated via presence events.
  const [onlineUsers, setOnlineUsers] = useState(() => new Set());

  useEffect(() => {
    if (!isLoggedIn || !token) {
      // Logged out — close any existing socket.
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
        setOnlineUsers(new Set());
      }
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("presence:update", ({ userId, online }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (online) next.add(Number(userId));
        else next.delete(Number(userId));
        return next;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [isLoggedIn, token]);

  const value = {
    socket: socketRef.current,
    connected,
    onlineUsers,
    isUserOnline: (id) => onlineUsers.has(Number(id)),
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
