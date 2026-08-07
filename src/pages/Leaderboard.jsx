// src/pages/Leaderboard.jsx
import React, { useState, useEffect } from "react";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { Avatar, Spinner, avatarColour } from "../components/ui";

const MEDAL = ["🥇", "🥈", "🥉"];
// Podium reading order is 2nd, 1st, 3rd — so the tallest block sits in the middle.
const PODIUM_HEIGHTS = [96, 132, 74];

export default function Leaderboard() {
  const { user } = useAuth();
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => { if (d.success) setBoard(d.leaderboard); })
      .finally(() => setLoading(false));
  }, []);

  const myRow = board.find((r) => r.user_id === user?.id);
  const top3 = board.slice(0, 3);
  const podium = [top3[1], top3[0], top3[2]].filter(Boolean);

  return (
    <div className="wrap">
      <div style={{ maxWidth: 820, margin: "0 auto" }}>

        <div style={{ textAlign: "center", marginBottom: 34 }}>
          <div style={{ fontSize: "3.4rem" }}>🏆</div>
          <h1 style={{ fontSize: "2.4rem" }}>Hall of Fame</h1>
          <p className="muted">Everyone's best across all {board.length ? "" : "five "}games</p>
        </div>

        {loading ? (
          <div className="row" style={{ justifyContent: "center", padding: "70px 0" }}><Spinner size={38} /></div>
        ) : board.length === 0 ? (
          <div className="pop" style={{ padding: "56px 20px", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: 10 }}>🎮</div>
            <p className="muted">No scores yet — play a game to claim the top spot!</p>
          </div>
        ) : (
          <>
            {/* Podium */}
            {podium.length > 0 && (
              <div className="row" style={{ alignItems: "flex-end", justifyContent: "center", gap: 14, marginBottom: 34 }}>
                {podium.map((p, orderIdx) => {
                  const place = board.indexOf(p);
                  const col = avatarColour(p.user_id);
                  return (
                    <div key={p.user_id} style={{ flex: 1, maxWidth: 150, textAlign: "center" }}>
                      <Avatar emoji={p.avatar} size={place === 0 ? 76 : 58} seed={p.user_id} />
                      <div className="display" style={{ marginTop: 8, fontSize: "1.05rem" }}>{p.username}</div>
                      <div style={{ fontSize: ".9rem" }}>{Number(p.total_score).toLocaleString()}</div>
                      <div className="step" style={{ height: PODIUM_HEIGHTS[orderIdx], background: col, marginTop: 10 }}>
                        {MEDAL[place]}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* My rank — only worth a callout when I'm not already visible up top */}
            {myRow && board.indexOf(myRow) > 2 && (
              <div className="pop row" style={{ padding: "14px 18px", gap: 14, marginBottom: 20, background: "var(--sun)" }}>
                <span className="rank" style={{ background: "#fff" }}>#{myRow.rank}</span>
                <Avatar emoji={myRow.avatar} size={44} seed={myRow.user_id} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="display" style={{ display: "block", fontSize: "1.1rem" }}>Your rank</span>
                  <span className="muted" style={{ fontSize: ".85rem" }}>
                    {myRow.games_played} games · {myRow.win_rate}% win rate
                  </span>
                </span>
                <span className="display" style={{ fontSize: "1.25rem" }}>
                  {Number(myRow.total_score).toLocaleString()}
                </span>
              </div>
            )}

            {/* Full table */}
            <div className="stack">
              {board.map((row, i) => {
                const isMe = row.user_id === user?.id;
                const col = avatarColour(row.user_id);
                return (
                  <div key={row.user_id} className="pop row"
                    style={{ padding: "14px 18px", gap: 14, background: isMe ? "var(--sun)" : undefined }}>
                    <span className="rank" style={{ background: i < 3 ? col : "var(--paper2)" }}>
                      {i < 3 ? MEDAL[i] : i + 1}
                    </span>
                    <Avatar emoji={row.avatar} size={44} seed={row.user_id} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="display" style={{ display: "block", fontSize: "1.1rem" }}>
                        {row.username}{isMe && " (you)"}
                      </span>
                      <span className="muted" style={{ fontSize: ".85rem" }}>
                        {row.games_played} games played · {row.win_rate}% wins
                      </span>
                    </span>
                    <span className="display" style={{ fontSize: "1.25rem" }}>
                      {Number(row.total_score).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
