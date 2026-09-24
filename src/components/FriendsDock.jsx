// src/components/FriendsDock.jsx
// Your friends as a small stack of faces, each with a presence pip (green =
// online). Tap it for the full list: who's on now, and when everyone else was
// last seen. It sits in the navbar and in the in-game header, so it's visible
// on every screen.
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePresence } from "../utils/PresenceContext";
import { api } from "../utils/api";
import { presenceLabel } from "../utils/timeAgo";
import { Avatar } from "./ui";

export default function FriendsDock({ max = 3, size = 34 }) {
  const { friends } = usePresence();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [, setTick] = useState(0);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const close = () => setOpen(false);
    // Re-render now and then so "5m ago" stays true while the list is open.
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      clearInterval(t);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!friends.length) return null;

  const onlineCt = friends.filter((f) => f.online).length;
  const shown = friends.slice(0, max);
  const extra = friends.length - shown.length;

  // Drop in on a friend's match. Joining a room that is already under way
  // seats you as a spectator, so this is the same call the lobby makes.
  async function watch(friend) {
    const code = friend.playing?.room_code;
    if (!code || joining) return;
    setJoining(friend.id);
    try {
      const res = await api.post("/api/rooms/join", { room_code: code });
      const data = await res.json();
      if (data.success) {
        setOpen(false);
        navigate(`/room/${code}?watch=${friend.id}`);
      }
    } catch { /* the row stays put; they can tap again */ }
    finally { setJoining(null); }
  }

  function toggle() {
    if (!open && btnRef.current) {
      // Fixed to the viewport, so no parent's overflow can clip it.
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: Math.round(r.bottom + 10), right: Math.max(12, Math.round(window.innerWidth - r.right)) });
    }
    setOpen((o) => !o);
  }

  return (
    <span className="fdock" ref={wrapRef}>
      <button ref={btnRef} type="button" className="fdock-btn" onClick={toggle} aria-expanded={open}
        aria-label={`Friends: ${onlineCt} of ${friends.length} online`}
        title={`${onlineCt} of ${friends.length} friends online`}>
        <span className="fdock-faces">
          {shown.map((f, i) => (
            <Avatar key={f.id} emoji={f.avatar} size={size} seed={f.id} online={f.online}
              className={f.online ? "" : "is-off"} style={{ zIndex: shown.length - i }} />
          ))}
        </span>
        {extra > 0 && <span className="fdock-more">+{extra}</span>}
      </button>

      {open && pos && (
        <div className="fdock-panel" style={{ top: pos.top, right: pos.right }} role="dialog" aria-label="Friends">
          <div className="fdock-head">
            Friends <span className="chip c-lime">{onlineCt} online</span>
          </div>
          {friends.map((f) => (
            <div key={f.id} className="fdock-row">
              <Avatar emoji={f.avatar} size={34} seed={f.id} online={f.online} className={f.online ? "" : "is-off"} />
              <span className="fdock-who">
                <span className="fdock-name">{f.username}</span>
                <span className={f.playing ? "fdock-playing" : f.online ? "fdock-on" : "muted"}>
                  {f.playing ? `${f.playing.game_icon || "🎮"} ${f.playing.game_name}` : presenceLabel(f)}
                </span>
              </span>
              {f.playing && (
                <button type="button" className="press p-sun sm fdock-watch"
                  onClick={() => watch(f)} disabled={joining === f.id}
                  aria-label={`Watch ${f.username} play ${f.playing.game_name}`}>
                  {joining === f.id ? "…" : "👁️ Watch"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
