// src/utils/SocketContext.js
// Single shared Socket.io connection for the whole app. Connects only when the
// user is logged in (passes the JWT in the handshake), and tears down on logout.
//
// Real-time is ADDITIVE to the existing REST polling: components can listen for
// push events to refresh instantly, while polling remains a safety net.
// Friends' presence is tracked on top of this socket in PresenceContext.

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
  // Also held in state: consumers that subscribe to events need a re-render
  // when the socket appears. Reading socketRef.current during render gave them
  // `null` on first paint and never updated them.
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || !token) {
      // Logged out — close any existing socket.
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    const s = io(SOCKET_URL, {
      auth: { token },
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = s;
    setSocket(s);

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));

    return () => {
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
    };
  }, [isLoggedIn, token]);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
