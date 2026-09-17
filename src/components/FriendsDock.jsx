// src/components/FriendsDock.jsx
// Your friends as a small stack of faces, each with a presence pip (green =
// online). Tap it for the full list: who's on now, and when everyone else was
// last seen. It sits in the navbar and in the in-game header, so it's visible
// on every screen.
import React, { useEffect, useRef, useState } from "react";
import { usePresence } from "../utils/PresenceContext";
import { presenceLabel } from "../utils/timeAgo";
import { Avatar } from "./ui";

export default function FriendsDock({ max = 3, size = 34 }) {
  const { friends } = usePresence();
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
                <span className={f.online ? "fdock-on" : "muted"}>{presenceLabel(f)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
