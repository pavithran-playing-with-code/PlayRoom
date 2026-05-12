// src/pages/Leaderboard.jsx
import React, { useState, useEffect } from "react";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";

const MEDAL = ["🥇","🥈","🥉"];

export default function Leaderboard() {
  const { user } = useAuth();
  const [board,   setBoard]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/leaderboard")
      .then(r => r.json())
      .then(d => { if (d.success) setBoard(d.leaderboard); })
      .finally(() => setLoading(false));
  }, []);

  const myRow = board.find(r => r.user_id === user?.id);

  return (
    <div style={{ minHeight:"calc(100vh - 60px)", padding:"32px 20px" }}>
      <div style={{ maxWidth:720, margin:"0 auto" }}>

        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:"3rem", marginBottom:8 }}>🏆</div>
          <h1 style={{ fontSize:"2rem", fontWeight:900, marginBottom:6 }}>Leaderboard</h1>
          <p style={{ color:"var(--muted)" }}>Top players across all games</p>
        </div>

        {/* My rank highlight */}
        {myRow && (
          <div style={{ background:"rgba(247,201,72,0.08)", border:"1.5px solid rgba(247,201,72,0.3)",
            borderRadius:14, padding:"14px 20px", marginBottom:24,
            display:"flex", alignItems:"center", gap:16 }}>
            <span style={{ fontSize:"1.5rem", fontWeight:900, color:"var(--accent)", minWidth:44 }}>
              #{myRow.rank}
            </span>
            <span style={{ fontSize:"1.3rem" }}>{myRow.avatar}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700 }}>Your Rank</div>
              <div style={{ color:"var(--muted)", fontSize:"0.83rem" }}>
                {myRow.games_played} games · {myRow.win_rate}% win rate
              </div>
            </div>
            <span style={{ fontWeight:900, fontSize:"1.15rem", color:"var(--accent)" }}>
              {Number(myRow.total_score).toLocaleString()} pts
            </span>
          </div>
        )}

        {/* Table */}
        <div style={{ background:"var(--surface)", border:"1.5px solid var(--surface2)", borderRadius:16, overflow:"hidden" }}>
          {/* Header row */}
          <div style={{ display:"grid", gridTemplateColumns:"52px 1fr 90px 70px 70px",
            padding:"10px 20px", borderBottom:"1px solid var(--surface2)",
            color:"var(--muted)", fontSize:"0.75rem", textTransform:"uppercase", letterSpacing:1, fontWeight:600 }}>
            <span>#</span><span>Player</span>
            <span style={{ textAlign:"right" }}>Score</span>
            <span style={{ textAlign:"right" }}>Games</span>
            <span style={{ textAlign:"right" }}>Win%</span>
          </div>

          {loading ? (
            <div style={{ textAlign:"center", padding:"48px 20px", color:"var(--muted)" }}>Loading…</div>
          ) : board.length === 0 ? (
            <div style={{ textAlign:"center", padding:"48px 20px", color:"var(--muted)" }}>
              <div style={{ fontSize:"2rem", marginBottom:10 }}>🎮</div>
              No scores yet — play a game to appear here!
            </div>
          ) : board.map((row, i) => {
            const isMe = row.user_id === user?.id;
            return (
              <div key={row.user_id} style={{ display:"grid", gridTemplateColumns:"52px 1fr 90px 70px 70px",
                padding:"13px 20px", alignItems:"center",
                borderBottom: i < board.length - 1 ? "1px solid var(--surface2)" : "none",
                background: isMe ? "rgba(247,201,72,0.05)" : "transparent" }}>
                <span style={{ fontSize: i < 3 ? "1.25rem" : "0.9rem", fontWeight:700,
                  color: i < 3 ? "var(--accent)" : "var(--muted)" }}>
                  {i < 3 ? MEDAL[i] : `#${row.rank}`}
                </span>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:"1.15rem" }}>{row.avatar}</span>
                  <span style={{ fontWeight:600, fontSize:"0.95rem" }}>
                    {row.username}
                    {isMe && <span style={{ marginLeft:6, color:"var(--accent)", fontSize:"0.72rem" }}>(you)</span>}
                  </span>
                </div>
                <span style={{ textAlign:"right", fontWeight:700, color:"var(--accent)" }}>
                  {Number(row.total_score).toLocaleString()}
                </span>
                <span style={{ textAlign:"right", color:"var(--muted)", fontSize:"0.88rem" }}>
                  {row.games_played}
                </span>
                <span style={{ textAlign:"right", color:"var(--green)", fontSize:"0.88rem", fontWeight:600 }}>
                  {row.win_rate}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
