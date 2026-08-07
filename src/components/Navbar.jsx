// src/components/Navbar.jsx
// The header bar. Behind the links, `.runstrip` holds the mascot who strolls
// the width of the bar and shows off — he's decorative, pointer-events:none,
// and hidden entirely on narrow screens.
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
import { api } from "../utils/api";
import Logo from "./Logo";
import Runner from "./characters/Runner";
import { Avatar } from "./ui";

export default function Navbar() {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [pendingCt, setPendingCt] = useState(0);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    async function tick() {
      try {
        const res = await api.get("/api/friends/inbox-count");
        const data = await res.json();
        if (!cancelled && data.success) setPendingCt(data.count || 0);
      } catch { /* silent */ }
    }
    tick();
    const t = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isLoggedIn]);

  function handleLogout() { setOpen(false); logout(); navigate("/login"); }

  const navLink = (to, label) => (
    <Link key={to} to={to} className="navlink" aria-current={location.pathname === to}>
      {label}
    </Link>
  );

  return (
    <nav className="nav">
      <div className="runstrip" aria-hidden="true"><Runner height={40} /></div>
      <div className="bar">
        <Link to="/" aria-label="PlayRoom home" className="row" style={{ gap: 11 }}>
          <Logo size="md" />
        </Link>

        <div className="row" style={{ gap: 6 }}>
          {isLoggedIn ? (
            <>
              {navLink("/lobby", "🕹️ Lobby")}
              {navLink("/leaderboard", "🏆 Board")}
              {navLink("/friends", pendingCt ? `👥 Crew (${pendingCt})` : "👥 Crew")}

              <span className="menuwrap" ref={menuRef}>
                <button onClick={() => setOpen((o) => !o)} style={{ borderRadius: 999, position: "relative" }}
                  aria-haspopup="true" aria-expanded={open} aria-label="Account menu">
                  <Avatar emoji={user?.avatar || "🎮"} size={42} seed={user?.id ?? user?.username} />
                  {pendingCt > 0 && (
                    <span className="notif">{pendingCt > 9 ? "9+" : pendingCt}</span>
                  )}
                </button>

                {open && (
                  <div className="menu">
                    <div className="who">
                      <Avatar emoji={user?.avatar || "🎮"} size={40} seed={user?.id ?? user?.username} />
                      <span>
                        <span className="display" style={{ display: "block", fontSize: "1.05rem" }}>{user?.username}</span>
                        <span className="muted" style={{ fontSize: ".8rem" }}>Signed in</span>
                      </span>
                    </div>
                    <MenuItem to="/friends" onClick={() => setOpen(false)}
                      label={`👥 Friends${pendingCt ? `  (${pendingCt})` : ""}`} />
                    <MenuItem to="/leaderboard" onClick={() => setOpen(false)} label="🏆 Leaderboard" />
                    <MenuItem to="/lobby" onClick={() => setOpen(false)} label="🕹️ Game Lobby" />
                    <button className="danger" onClick={handleLogout}>🚪 Log out</button>
                  </div>
                )}
              </span>
            </>
          ) : (
            <>
              {navLink("/login", "Log in")}
              <Link to="/register" className="press p-coral sm">Join free</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function MenuItem({ to, label, onClick }) {
  return <Link to={to} onClick={onClick} className="menu-item">{label}</Link>;
}
