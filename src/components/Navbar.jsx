// src/components/Navbar.jsx
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
import { api } from "../utils/api";
import Logo from "./Logo";

export default function Navbar() {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();

  const [open,      setOpen]      = useState(false);
  const [pendingCt, setPendingCt] = useState(0);
  const menuRef = useRef(null);

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKey   = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Poll pending friend-request + invite count for the badge.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    async function tick() {
      try {
        const res  = await api.get("/api/friends/inbox-count");
        const data = await res.json();
        if (!cancelled && data.success) setPendingCt(data.count || 0);
      } catch { /* silent */ }
    }
    tick();
    const t = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isLoggedIn]);

  function handleLogout() {
    setOpen(false);
    logout();
    navigate("/login");
  }

  return (
    <nav style={{ background:"var(--surface)", borderBottom:"1px solid var(--surface2)", padding:"0 20px", position:"sticky", top:0, zIndex:100 }}>
      <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:60 }}>

        <Link to="/" aria-label="PlayRoom home" style={{ display:"inline-flex" }}>
          <Logo size="md" />
        </Link>

        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {isLoggedIn ? (
            <>
              <Link to="/lobby"       style={{ padding:"8px 14px", borderRadius:8, color:"var(--muted)", fontSize:"0.9rem", fontWeight:600 }}>Lobby</Link>
              <Link to="/leaderboard" style={{ padding:"8px 14px", borderRadius:8, color:"var(--muted)", fontSize:"0.9rem", fontWeight:600 }}>🏆 Board</Link>

              <div ref={menuRef} style={{ position:"relative", marginLeft:8 }}>
                <button onClick={() => setOpen(o => !o)}
                  style={{ display:"flex", alignItems:"center", gap:10, background:"transparent",
                    border:"none", padding:"4px 8px", borderRadius:24, cursor:"pointer", color:"var(--text)" }}>
                  <div style={{ position:"relative", width:34, height:34, borderRadius:"50%",
                    background:"linear-gradient(135deg,var(--accent),var(--accent2))",
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.1rem", lineHeight:1 }}>
                    <span style={{ lineHeight:1 }}>{user?.avatar || "🎮"}</span>
                    {pendingCt > 0 && (
                      <span style={{ position:"absolute", top:-4, right:-4, minWidth:18, height:18,
                        borderRadius:9, background:"var(--red,#e25555)", color:"#fff",
                        fontSize:"0.65rem", fontWeight:700, padding:"0 5px",
                        display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>
                        {pendingCt > 9 ? "9+" : pendingCt}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize:"0.9rem", fontWeight:600 }}>{user?.username}</span>
                  <span style={{ color:"var(--muted)", fontSize:"0.7rem" }}>▾</span>
                </button>

                {open && (
                  <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, minWidth:220,
                    background:"var(--surface)", border:"1.5px solid var(--surface2)",
                    borderRadius:12, padding:6, boxShadow:"0 10px 30px rgba(0,0,0,0.4)" }}>
                    <div style={{ padding:"10px 12px", borderBottom:"1px solid var(--surface2)", marginBottom:4 }}>
                      <div style={{ fontWeight:700, fontSize:"0.9rem" }}>{user?.username}</div>
                      <div style={{ color:"var(--muted)", fontSize:"0.78rem" }}>Signed in</div>
                    </div>
                    <MenuItem to="/friends" onClick={() => setOpen(false)}
                      label={`👥 Friends${pendingCt ? `  (${pendingCt})` : ""}`} />
                    <MenuItem to="/leaderboard" onClick={() => setOpen(false)} label="🏆 Leaderboard" />
                    <div style={{ height:1, background:"var(--surface2)", margin:"4px 0" }} />
                    <button onClick={handleLogout}
                      style={{ width:"100%", textAlign:"left", padding:"10px 12px", borderRadius:8,
                        border:"none", background:"transparent", color:"var(--red,#e25555)",
                        fontSize:"0.9rem", fontWeight:600, cursor:"pointer" }}>
                      🚪 Logout
                    </button>
                  </div>
                )}
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

function MenuItem({ to, label, onClick }) {
  return (
    <Link to={to} onClick={onClick}
      style={{ display:"block", padding:"10px 12px", borderRadius:8, color:"var(--text)",
        fontSize:"0.9rem", fontWeight:600, textDecoration:"none" }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface2)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
      {label}
    </Link>
  );
}
