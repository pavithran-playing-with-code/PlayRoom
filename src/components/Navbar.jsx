// src/components/Navbar.jsx
// The header bar. Behind the links, `.runstrip` holds the mascot who strolls
// the width of the bar and shows off. He's decorative (pointer-events:none)
// and walks on every screen size, phones included.
//
// Two groups: the page links, and "me" (friends dock + account menu). Side by
// side on bigger screens; on a phone "me" sits next to the logo and the links
// get a full-width row of their own.
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
import { usePresence } from "../utils/PresenceContext";
import useMedia from "../utils/useMedia";
import Logo from "./Logo";
import Runner from "./characters/Runner";
import FriendsDock from "./FriendsDock";
import { Avatar } from "./ui";

export default function Navbar() {
  const { user, isLoggedIn, logout } = useAuth();
  // Kept live over the socket by PresenceContext, no polling of our own.
  const { inboxCount: pendingCt } = usePresence();
  const narrow = useMedia("(max-width: 400px)");
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function handleLogout() { setOpen(false); logout(); navigate("/login"); }

  const navLink = (to, label) => (
    <Link key={to} to={to} className="navlink" aria-current={location.pathname === to}>{label}</Link>
  );

  return (
    <nav className="nav">
      <div className="runstrip" aria-hidden="true"><Runner height={40} /></div>
      <div className="bar">
        <Link to="/" aria-label="PlayRoom home" className="row" style={{ gap: 11 }}>
          <Logo size="md" />
        </Link>

        {isLoggedIn ? (
          <>
            <div className="navlinks">
              {navLink("/lobby", "🕹️ Lobby")}
              {navLink("/leaderboard", "🏆 Board")}
              {navLink("/friends", pendingCt ? `👥 Crew (${pendingCt})` : "👥 Crew")}
            </div>

            <div className="navme">
              {/* Friends' faces with online pips: tap for who's on and last seen */}
              <FriendsDock max={narrow ? 2 : 3} size={32} />

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
                    <MenuItem to="/profile" onClick={() => setOpen(false)} label="✏️ Edit profile" />
                    <MenuItem to="/friends" onClick={() => setOpen(false)}
                      label={`👥 Friends${pendingCt ? `  (${pendingCt})` : ""}`} />
                    <MenuItem to="/leaderboard" onClick={() => setOpen(false)} label="🏆 Leaderboard" />
                    <MenuItem to="/lobby" onClick={() => setOpen(false)} label="🕹️ Game Lobby" />
                    <button className="danger" onClick={handleLogout}>🚪 Log out</button>
                  </div>
                )}
              </span>
            </div>
          </>
        ) : (
          <div className="navme">
            {navLink("/login", "Log in")}
            <Link to="/register" className="press p-coral sm">Join free</Link>
          </div>
        )}
      </div>
    </nav>
  );
}

function MenuItem({ to, label, onClick }) {
  return <Link to={to} onClick={onClick} className="menu-item">{label}</Link>;
}
