// src/components/TabBar.jsx
// The phone's way around: four tabs along the bottom, under the thumb.
// Phones only (CSS shows it under 600px); on a computer the header's links
// do the same job. Signed in only.
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
import { usePresence } from "../utils/PresenceContext";

const TABS = [
  { to: "/lobby",       icon: "🎮", label: "Play" },
  { to: "/rooms",       icon: "🚪", label: "Rooms" },
  { to: "/friends",     icon: "👥", label: "Friends" },
  { to: "/leaderboard", icon: "🏆", label: "Board" },
];

export default function TabBar() {
  const { isLoggedIn } = useAuth();
  const { inboxCount } = usePresence();
  const { pathname } = useLocation();
  if (!isLoggedIn) return null;

  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => {
        const on = pathname === t.to;
        const badge = t.to === "/friends" && inboxCount > 0;
        return (
          <Link key={t.to} to={t.to} className={`tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
            <span className="tab-ic" aria-hidden="true">
              {t.icon}
              {badge && <span className="tab-badge">{inboxCount > 9 ? "9+" : inboxCount}</span>}
            </span>
            <span className="tab-lbl">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
