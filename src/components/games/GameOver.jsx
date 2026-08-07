// src/components/games/GameOver.jsx
// Match-end overlay. Shows winner/placement for multiplayer, score for solo,
// plus a final standings list when opponents exist.
import React, { useEffect } from "react";
import { Avatar, avatarColour } from "../ui";
import { confetti } from "../ui/FunLayer";

const MEDAL = ["🥇", "🥈", "🥉"];

export default function GameOver({
  score,
  won,
  rank = 1,
  finished = false,       // completed objective early
  isOnline = false,
  me,                     // { username, avatar }
  opponents = [],         // [{ username, avatar, score }]
  onPlayAgain,
  onExit,
  extra = null,           // optional extra line (e.g. "Pairs: 12/16")
}) {
  const multi = isOnline && opponents.length > 0;
  const celebrate = won || finished;

  // Party on the way in — but only if there's something to celebrate.
  useEffect(() => {
    if (!celebrate) return;
    confetti(window.innerWidth / 2, window.innerHeight / 2, { count: 160 });
    const t = setTimeout(
      () => confetti(window.innerWidth / 2, window.innerHeight / 2.4,
        { count: 40, emojis: ["🎉", "🏆", "⭐", "🎊"] }), 260);
    return () => clearTimeout(t);
  }, [celebrate]);

  const headline = multi
    ? (won ? "🏆 You win!" : rank === 2 ? "🥈 So close!" : "Good game!")
    : (finished ? "🎉 Cleared it!" : "⏰ Time's up!");

  const standings = multi
    ? [{ username: me?.username || "You", avatar: me?.avatar, score, you: true }, ...opponents]
        .sort((a, b) => (b.score || 0) - (a.score || 0))
    : [];

  return (
    <div className="modal-scrim">
      <div className="pop" style={{ width: "100%", maxWidth: 420, padding: 32, textAlign: "center",
        background: celebrate ? "var(--sun)" : "var(--card)",
        animation: "drop .18s cubic-bezier(.34,1.7,.64,1)" }}>
        <div style={{ fontSize: "3.8rem" }}>{multi ? (won ? "🏆" : "🎮") : finished ? "🎉" : "⏰"}</div>
        <h2 style={{ fontSize: "1.9rem" }}>{headline}</h2>
        <p style={{ margin: "10px 0 22px", fontSize: "1.05rem" }}>
          Score: <strong>{Number(score).toLocaleString()}</strong>
          {extra ? <> · {extra}</> : null}
        </p>

        {multi && (
          <div className="stack" style={{ gap: 10, marginBottom: 24, textAlign: "left" }}>
            {standings.map((p, i) => (
              <div key={(p.username || "") + i} className="row"
                style={{
                  gap: 12, padding: "10px 14px", borderRadius: "var(--r)",
                  border: "3px solid var(--ink)", background: p.you ? "var(--lime)" : "#fff",
                }}>
                <span className="rank" style={{ width: 36, height: 36, background: i < 3 ? avatarColour(p.username) : "var(--paper2)" }}>
                  {MEDAL[i] || i + 1}
                </span>
                <Avatar emoji={p.avatar} size={32} seed={p.username} />
                <span style={{ flex: 1, minWidth: 0 }} className="truncate">
                  {p.username}{p.you && <span className="muted"> (you)</span>}
                </span>
                <span className="display">{Number(p.score || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {onPlayAgain && (
          <button className="press p-coral lg full" style={{ marginBottom: 12 }} onClick={onPlayAgain}>
            🔄 Play again
          </button>
        )}
        <button className="press p-white full" onClick={onExit}>← Back to lobby</button>
      </div>
    </div>
  );
}
