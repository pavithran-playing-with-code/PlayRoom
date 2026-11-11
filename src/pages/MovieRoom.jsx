// src/pages/MovieRoom.jsx — a Movie Night room (slug "movie").
//
// Nothing to start and no clock: the room stays open ("waiting") so friends,
// or anyone if it's public, can walk in from the Rooms list while it's on.
// Everyone seated joins the room's call (config/calls.js, call:room — no
// ringing, no need to be friends), and whoever picks a movie plays it to the
// call: the same film machinery as "a video watched together" in a call
// (Dolby sound, tracks, subtitles; CallContext playFilm).
import React, { useRef, useState } from "react";
import { useCall } from "../utils/CallContext";
import { Avatar } from "../components/ui";

export default function MovieRoom({ code, room, players, user, onLeave }) {
  const C = useCall();
  const pick = useRef(null);
  const [copied, setCopied] = useState(false);
  const inCall = !!(C.call && C.call.room === code);
  const here = new Set(inCall ? (C.call.members || []).map((m) => Number(m.id)) : []);
  const seats = room?.max_players || 4;

  const leave = () => { if (inCall) C.hangUp(); onLeave(); };
  const copy = async () => {
    const link = `${window.location.origin}/room/${code}`;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* shown on screen anyway */ }
  };
  const chose = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (f) { C.playFilm(f); C.setExpanded(true); }
  };

  return (
    <div className="wrap">
      <div className="mn" style={{ maxWidth: 620, margin: "0 auto" }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <button className="press p-white sm" onClick={leave}>← Leave</button>
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="chip c-coral">🎬 Movie Night</span>
            <span className="chip c-sky">{room?.is_private ? "🔒 Private" : "🌍 Public"}</span>
          </span>
        </div>

        <div className="pop mn-hero">
          <div className="mn-icon" aria-hidden="true">🍿</div>
          <h2>Movie Night</h2>
          <p>{inCall
            ? "You're in. Pick a movie from your phone and everyone here watches it with you, sound and all."
            : "Join to watch together. You'll hear each other (mic on, camera off), and anyone can play a movie from their phone."}</p>
          {inCall ? (
            <div className="mn-btns">
              <button className="press p-sun lg full" onClick={() => pick.current && pick.current.click()}>🎬 Pick a movie</button>
              <button className="press p-white full" onClick={() => C.setExpanded(true)}>📺 Open the screen</button>
            </div>
          ) : (
            <button className="press p-sun lg full" onClick={() => C.joinRoom(code)}>🍿 Join the movie night</button>
          )}
          <input ref={pick} type="file" accept="video/*,.mkv,.avi,.mov,.webm,.ts,.m4v" hidden onChange={chose} />
        </div>

        <div className="pop" style={{ padding: 20, marginTop: 16 }}>
          <h3 style={{ fontSize: "1.1rem", marginBottom: 12 }}>Who's here ({players.length} of {seats})</h3>
          <div className="mn-who">
            {players.map((p) => (
              <div key={p.user_id} className="mn-seat">
                <Avatar emoji={p.avatar} size={48} seed={p.user_id} />
                <b>{p.username}{Number(p.user_id) === Number(user?.id) ? " (you)" : ""}</b>
                <small>{here.has(Number(p.user_id)) ? "🎧 watching" : "not joined yet"}</small>
              </div>
            ))}
          </div>
          <div className="mn-code">
            <span>Room code <b>{code}</b></span>
            <button className="press p-white sm" onClick={copy}>{copied ? "✓ Copied" : "🔗 Copy link"}</button>
          </div>
          <p className="muted" style={{ fontSize: ".85rem", margin: "10px 0 0" }}>
            {room?.is_private ? "Send the link to friends to let them in." : "It's on the Rooms list, so friends can join from there, or send them the link."} Up to {seats} people.
          </p>
        </div>
      </div>
    </div>
  );
}
