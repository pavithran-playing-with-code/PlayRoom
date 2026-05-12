// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./utils/AuthContext";
import Navbar          from "./components/Navbar";
import ProtectedRoute  from "./components/ProtectedRoute";
import Home            from "./pages/Home";
import Login           from "./pages/Login";
import Register        from "./pages/Register";
import Lobby           from "./pages/Lobby";
import Room            from "./pages/Room";
import Leaderboard     from "./pages/Leaderboard";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Room page has its own full-screen game layout — no Navbar */}
          <Route path="/room/:code" element={<ProtectedRoute><Room /></ProtectedRoute>} />

          {/* All other pages share the Navbar */}
          <Route path="/*" element={<WithNav />} />
        </Routes>
      </BrowserRouter>
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
        <Route path="*"            element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
