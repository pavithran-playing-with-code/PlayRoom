// src/App.js
import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./utils/AuthContext";
import { SocketProvider } from "./utils/SocketContext";
import { PresenceProvider } from "./utils/PresenceContext";
import { ToastProvider, FunLayer } from "./components/ui";
import Navbar          from "./components/Navbar";
import Notifier        from "./components/Notifier";
import ProtectedRoute  from "./components/ProtectedRoute";
import Home            from "./pages/Home";
import Login           from "./pages/Login";
import Register        from "./pages/Register";
import Lobby           from "./pages/Lobby";
import Room            from "./pages/Room";
import Leaderboard     from "./pages/Leaderboard";
import Friends         from "./pages/Friends";
import Profile         from "./pages/Profile";
import { installErrorReporting } from "./utils/reportError";

installErrorReporting();

// A new page starts at the top. Without this, the browser kept the previous
// page's scroll, so a game card near the bottom of Home opened the lobby
// already scrolled down.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
      <PresenceProvider>
      <ToastProvider>
      {/* Sparkle trail + tap bursts + confetti, above everything, click-through */}
      <FunLayer />
      <BrowserRouter>
        {/* Live friend requests, invites and "X is online", on every page, mid-game too */}
        <Notifier />
        <ScrollToTop />
        <Routes>
          {/* Room page has its own full-screen game layout — no Navbar */}
          <Route path="/room/:code" element={<ProtectedRoute><Room /></ProtectedRoute>} />

          {/* All other pages share the Navbar */}
          <Route path="/*" element={<WithNav />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
      </PresenceProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

function WithNav() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/"            element={<Home />} />
        <Route path="/login"       element={<Login />} />
        <Route path="/register"    element={<Register />} />
        <Route path="/lobby"       element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
        <Route path="/friends"     element={<ProtectedRoute><Friends /></ProtectedRoute>} />
        <Route path="/profile"     element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="*"            element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
