// src/components/TabBar.jsx
// The phone's way around: four tabs along the bottom, under the thumb.
// Phones only (CSS shows it under 600px); on a computer the header's links
// do the same job. Signed in only.
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
import { usePresence } from "../utils/PresenceContext";
import Icon from "./ui/Icon";

const TABS = [
  { to: "/lobby",       icon: "gamepad", label: "Play" },
  { to: "/rooms",       icon: "door",    label: "Rooms" },
  { to: "/friends",     icon: "people",  label: "Friends" },
  { to: "/leaderboard", icon: "trophy",  label: "Board" },
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
              <Icon name={t.icon} size={24} stroke={on ? 2.6 : 2.2} />
              {badge && <span className="tab-badge">{inboxCount > 9 ? "9+" : inboxCount}</span>}
            </span>
            <span className="tab-lbl">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
