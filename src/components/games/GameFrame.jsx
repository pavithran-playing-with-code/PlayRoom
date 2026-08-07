// src/components/games/GameFrame.jsx
// Full-screen chrome shared by every game: header (logo + stats + clock),
// live opponent bar, message banner, board area, and a controls strip.
import React from "react";
import Logo from "../Logo";
import { ProgressRing, Avatar } from "../ui";

export default function GameFrame({
  gameName,
  badge,
  isSpectator = false,
  spectatorName = "",
  stats = [],                 // [{ label, value, urgent }]
  timer,                      // { value, max } seconds — renders the ring
  opponents = [],             // [{ user_id, username, avatar, score }]
  message = null,             // { text, type }
  controls = null,            // node
  onQuit,
  children,
}) {
  const msgFill = { success: "var(--lime)", error: "var(--coral)", info: "var(--sky)" };

  return (
    <div className="gameshell">
      {/* Header */}
      <div className="gamebar">
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
          <Logo size="sm" showText={false} />
          <span className="chip c-sun">
            {isSpectator ? `👀 Watching ${spectatorName}` : badge || gameName}
          </span>
        </div>

        <div className="row" style={{ gap: 16 }}>
          {timer && (
            <ProgressRing
              value={timer.value} max={timer.max} size={54} stroke={5}
              urgent={timer.value <= 20}
              label={`${Math.floor(timer.value / 60)}:${(timer.value % 60).toString().padStart(2, "0")}`}
            />
          )}
          {stats.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div className="display" style={{ fontSize: "1.35rem", color: s.urgent ? "var(--coral)" : "var(--ink)" }}>
                {s.value}
              </div>
              <div className="muted" style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".1em" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <button className="press p-white sm" onClick={onQuit}>
          {isSpectator ? "← Leave" : "🚪 Quit"}
        </button>
      </div>

      {/* Opponent bar */}
      {opponents.length > 0 && (
        <div className="gamerow">
          {opponents.map((p) => (
            <div key={p.user_id} className="oppcard">
              <Avatar emoji={p.avatar} size={32} seed={p.user_id} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: ".9rem" }} className="truncate">{p.username}</div>
                <div className="muted" style={{ fontSize: ".76rem" }}>
                  {Number(p.score ?? 0).toLocaleString()} pts
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Message banner */}
      {message && (
        <div className="gamemsg" style={{ background: msgFill[message.type] || msgFill.info }}>
          {message.text}
        </div>
      )}

      {/* Board */}
      <div className="gameboard">{children}</div>

      {/* Controls */}
      {controls && <div className="gamefoot">{controls}</div>}
    </div>
  );
}
