// src/components/games/GameOver.jsx
// Match-end overlay. Shows winner/placement for multiplayer, score for solo,
// plus a final standings list when opponents exist.
//
// Pass `eng` (from useGameEngine) and everything is read from it; the loose
// props are still accepted for callers that don't use the engine.
import React, { useEffect, useState } from "react";
import { Avatar, avatarColour } from "../ui";
import { confetti } from "../ui/FunLayer";

const MEDAL = ["🥇", "🥈", "🥉"];

const TEAM_NAMES = ["Red", "Yellow", "Blue", "Green"];
const TEAM_COLOURS = ["var(--coral)", "var(--sun)", "var(--sky)", "var(--mint)"];

export default function GameOver(props) {
  const { eng, me, onPlayAgain, extra = null } = props;
  const fromEng = eng ? {
    score: eng.score, won: eng.won, draw: eng.draw, rank: eng.rank,
    finished: eng.finished, closed: eng.closed, isOnline: eng.isOnline,
    opponents: Object.values(eng.opponents), teams: eng.teams, onExit: eng.endMatch,
  } : {};
  const {
    score = 0,
    won = false,
    draw = false,
    rank = 1,
    finished = false,       // completed objective early
    closed = false,         // the room shut mid-match
    isOnline = false,
    opponents = [],         // [{ username, avatar, score }]
    teams = null,           // [{ team, total, members, mine }] in a team room
    onExit,
  } = { ...props, ...fromEng };

  const [leaving, setLeaving] = useState(false);
  const multi = isOnline && opponents.length > 0;

  // In a team room the match is decided by the sides, so the headline follows
  // your side — a player can top the scoreboard and still be on the losing
  // team, and being told "You win!" in that moment would be a lie.
  const sides = teams && teams.length > 1 ? teams : null;
  const myTeam = sides?.find((t) => t.mine) || null;
  const teamWon  = !!(sides && myTeam && myTeam.total === sides[0].total && sides[0].total > sides[1].total);
  const teamDraw = !!(sides && myTeam && myTeam.total === sides[0].total && sides[0].total === sides[1].total);
  const iWon = sides ? teamWon : won;

  const celebrate = !closed && (iWon || (!sides && finished));

  // Party on the way in — but only if there's something to celebrate.
  useEffect(() => {
    if (!celebrate) return undefined;
    confetti(window.innerWidth / 2, window.innerHeight / 2, { count: 160 });
    const t = setTimeout(
      () => confetti(window.innerWidth / 2, window.innerHeight / 2.4,
        { count: 40, emojis: ["🎉", "🏆", "⭐", "🎊"] }), 260);
    return () => clearTimeout(t);
  }, [celebrate]);

  const headline = closed ? "🚪 Match closed"
    : sides
      ? (teamWon ? `🏆 ${TEAM_NAMES[(myTeam.team - 1) % TEAM_NAMES.length]} wins!`
        : teamDraw ? "🤝 It's a draw!"
        : "Good game!")
    : multi
      ? (finished ? "🎉 Board cleared!"
        : won ? "🏆 You win!"
        : draw ? "🤝 It's a draw!"
        : rank === 2 ? "🥈 So close!" : "Good game!")
      : (finished ? "🎉 Cleared it!" : "⏰ Time's up!");

  const icon = closed ? "🚪"
    : sides ? (teamWon ? "🏆" : teamDraw ? "🤝" : "⚔️")
    : multi ? (won ? "🏆" : draw ? "🤝" : finished ? "🎉" : "🎮")
    : finished ? "🎉" : "⏰";

  const standings = multi
    ? [{ username: me?.username || "You", avatar: me?.avatar, score, you: true }, ...opponents]
        .sort((a, b) => (b.score || 0) - (a.score || 0))
    : [];

  function exit() {
    if (leaving) return;
    setLeaving(true);
    onExit && onExit();
  }

  return (
    <div className="modal-scrim">
      <div className="pop" style={{ width: "100%", maxWidth: 420, padding: "clamp(20px, 5vw, 32px)", textAlign: "center",
        maxHeight: "calc(100dvh - 32px)", overflowY: "auto",
        background: celebrate ? "var(--sun)" : "var(--card)",
        animation: "drop .18s cubic-bezier(.34,1.7,.64,1)" }}>
        <div style={{ fontSize: "3.4rem" }}>{icon}</div>
        <h2 style={{ fontSize: "1.8rem" }}>{headline}</h2>
        {closed && <p className="muted" style={{ marginTop: 6 }}>The host left, so the room closed.</p>}
        <p style={{ margin: "10px 0 20px", fontSize: "1.05rem" }}>
          Score: <strong>{Number(score).toLocaleString()}</strong>
          {extra ? <> · {extra}</> : null}
        </p>

        {sides && (
          <div className="stack" style={{ gap: 8, marginBottom: 18, textAlign: "left" }}>
            <div className="muted eyebrow">Final team scores</div>
            {sides.map((t, i) => (
              <div key={t.team} className="row teamfinal"
                style={{ background: TEAM_COLOURS[(t.team - 1) % TEAM_COLOURS.length] }}>
                <span className="rank" style={{ width: 32, height: 32, background: "#fff" }}>
                  {i === 0 ? "🏆" : i + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{TEAM_NAMES[(t.team - 1) % TEAM_NAMES.length]}</strong>
                  {t.mine && <span className="muted"> · your team</span>}
                  <span className="muted" style={{ display: "block", fontSize: ".78rem" }}>
                    {t.members} player{t.members === 1 ? "" : "s"}
                  </span>
                </span>
                <strong>{Number(t.total).toLocaleString()}</strong>
              </div>
            ))}
          </div>
        )}

        {multi && (
          <div className="stack" style={{ gap: 10, marginBottom: 22, textAlign: "left" }}>
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
            {finished && !closed && (
              <div className="muted" style={{ fontSize: ".85rem", textAlign: "center" }}>
                Others may still be playing. Scores update live.
              </div>
            )}
          </div>
        )}

        {onPlayAgain && (
          <button className="press p-coral lg full" style={{ marginBottom: 12 }} onClick={onPlayAgain}>
            🔄 Play again
          </button>
        )}
        <button className="press p-white full" onClick={exit} disabled={leaving}>
          {leaving ? "Saving your score…" : "← Back to lobby"}
        </button>
      </div>
    </div>
  );
}
