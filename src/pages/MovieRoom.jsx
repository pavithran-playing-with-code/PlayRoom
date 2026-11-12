// src/pages/MovieRoom.jsx — a movie room (slug "movie"), made from the Rooms page.
//
// Nothing to start and no clock: the room stays open ("waiting") so friends,
// or anyone if it's public, can walk in from the Rooms list while it's on.
//
// Alone, it is your own movie player: pick a film and it plays full screen
// (CallContext playFilm, drawn by CallLayer as a movie screen — no call, no
// microphone asked for). The moment a second person is in the room, everyone
// joins the room's call (config/calls.js, call:room — no ringing, no need to
// be friends) and the same film, still playing, goes to them as a shared
// screen: now it is the call screen, with faces and voices.
import React, { useEffect, useRef, useState } from "react";
import { useCall } from "../utils/CallContext";
import { Avatar } from "../components/ui";

export default function MovieRoom({ code, room, players, user, onLeave }) {
  const C = useCall();
  const pick = useRef(null);
  const [copied, setCopied] = useState(false);
  const inCall = !!(C.call && C.call.room === code);
  const here = new Set(inCall ? (C.call.members || []).map((m) => Number(m.id)) : []);
  const seats = room?.max_players || 4;
  const together = players.length >= 2;

  // company: into the room's call (once for each time the room fills past one)
  const tried = useRef(0);
  const joinRoom = C.joinRoom;
  useEffect(() => {
    if (!together) { tried.current = 0; return; }
    if (inCall || tried.current === players.length) return;
    tried.current = players.length;
    joinRoom(code);
  }, [together, inCall, players.length, code, joinRoom]);

  const leave = () => {
    if (inCall) C.hangUp(); else if (C.film) C.share();        // the film stops with the room
    onLeave();
  };
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
            <span className="chip c-coral">🎬 Movie room</span>
            <span className="chip c-sky">{room?.is_private ? "🔒 Private" : "🌍 Public"}</span>
          </span>
        </div>

        <div className="pop mn-hero">
          <div className="mn-icon" aria-hidden="true">🍿</div>
          <h2>{C.film ? C.film.name : "Movie room"}</h2>
          <p>{C.film
            ? (together ? "Playing for everyone here." : "Playing. When a friend walks in, they watch it with you.")
            : together ? "Pick a movie from your phone and everyone here watches it with you, sound and all."
              : "Pick a movie from your phone and watch. When a friend walks in, they see it with you and you can talk."}</p>
          <div className="mn-btns">
            {C.film && <button className="press p-sun lg full" onClick={() => C.setExpanded(true)}>▶ Back to the movie</button>}
            <button className={`press ${C.film ? "p-white" : "p-sun lg"} full`} onClick={() => pick.current && pick.current.click()}>
              🎬 {C.film ? "Play a different movie" : "Pick a movie"}
            </button>
            {together && !inCall && <button className="press p-white full" onClick={() => C.joinRoom(code)}>🎧 Join the others</button>}
            {inCall && !C.film && <button className="press p-white full" onClick={() => C.setExpanded(true)}>📺 Open the screen</button>}
          </div>
          <input ref={pick} type="file" accept="video/*,.mkv,.avi,.mov,.webm,.ts,.m4v" hidden onChange={chose} />
        </div>

        <div className="pop" style={{ padding: 20, marginTop: 16 }}>
          <h3 style={{ fontSize: "1.1rem", marginBottom: 12 }}>Who's here ({players.length} of {seats})</h3>
          <div className="mn-who">
            {players.map((p) => (
              <div key={p.user_id} className="mn-seat">
                <Avatar emoji={p.avatar} size={48} seed={p.user_id} />
                <b>{p.username}{Number(p.user_id) === Number(user?.id) ? " (you)" : ""}</b>
                {together && <small>{here.has(Number(p.user_id)) ? "🎧 watching" : "joining…"}</small>}
              </div>
            ))}
          </div>
          <div className="mn-code">
            <span>Room code <b>{code}</b></span>
            <button className="press p-white sm" onClick={copy}>{copied ? "✓ Copied" : "🔗 Copy link"}</button>
          </div>
          <p className="muted" style={{ fontSize: ".85rem", margin: "10px 0 0" }}>
            {room?.is_private ? "Send the link to friends to let them in." : "It's on the Rooms list, so friends can walk in from there, or send them the link."} Up to {seats} people.
          </p>
        </div>
      </div>
    </div>
  );
}
