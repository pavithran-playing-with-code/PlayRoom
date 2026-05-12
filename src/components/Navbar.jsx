// src/components/Navbar.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";

export default function Navbar() {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav style={{ background:"var(--surface)", borderBottom:"1px solid var(--surface2)", padding:"0 20px", position:"sticky", top:0, zIndex:100 }}>
      <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:60 }}>

        <Link to="/" style={{ fontSize:"1.4rem", fontWeight:900, background:"linear-gradient(90deg,var(--accent),var(--accent2))", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", letterSpacing:"-1px" }}>
          PlayRoom 🎮
        </Link>

        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {isLoggedIn ? (
            <>
              <Link to="/lobby"       style={{ padding:"8px 14px", borderRadius:8, color:"var(--muted)", fontSize:"0.9rem", fontWeight:600 }}>Lobby</Link>
              <Link to="/leaderboard" style={{ padding:"8px 14px", borderRadius:8, color:"var(--muted)", fontSize:"0.9rem", fontWeight:600 }}>🏆 Board</Link>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginLeft:8 }}>
                <div style={{ width:34, height:34, borderRadius:"50%", background:"linear-gradient(135deg,var(--accent),var(--accent2))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.1rem" }}>
                  {user?.avatar || "🎮"}
                </div>
                <span style={{ fontSize:"0.9rem", fontWeight:600 }}>{user?.username}</span>
                <button onClick={() => { logout(); navigate("/login"); }}
                  style={{ padding:"6px 14px", borderRadius:8, background:"transparent", border:"1.5px solid var(--surface2)", color:"var(--muted)", fontSize:"0.85rem", fontWeight:600, cursor:"pointer" }}>
                  Logout
                </button>
              </div>
            </>
          ) : (
            <>
              <Link to="/login"    style={{ padding:"8px 14px", borderRadius:8, color:"var(--muted)", fontSize:"0.9rem", fontWeight:600 }}>Login</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Sign Up</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
