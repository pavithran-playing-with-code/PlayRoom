// src/pages/Home.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
import Logo from "../components/Logo";

const GAMES = [
  { icon:"🀄", name:"Mahjong Solitaire", desc:"Match pairs of free tiles to clear the board. Solo or 1v1!",   players:"1–2" },
  { icon:"🃏", name:"Memory Match",      desc:"Flip cards and find matching pairs. Race against friends!",     players:"1–4" },
  { icon:"🧠", name:"Trivia Quiz",        desc:"Answer questions and outsmart your opponents.",                players:"2–4", soon:true },
];

export default function Home() {
  const { isLoggedIn } = useAuth();

  return (
    <div style={{ minHeight:"calc(100vh - 60px)", display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", textAlign:"center", padding:"48px 20px",
      background:"radial-gradient(ellipse at 50% 0%, #3d2660 0%, #1a0a2e 70%)" }}>

      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        .gc:hover { transform:translateY(-6px); border-color:var(--accent) !important; }
      `}</style>

      {/* Badge */}
      <div style={{ background:"rgba(247,201,72,0.12)", border:"1px solid rgba(247,201,72,0.3)", borderRadius:20,
        padding:"6px 18px", fontSize:"0.85rem", color:"var(--accent)", marginBottom:24 }}>
        🎮 Your Multi-Game Platform
      </div>

      {/* Title — uses shared Logo so the icon stays consistent with the navbar */}
      <div style={{ marginBottom:16, display:"flex", justifyContent:"center" }}>
        <Logo size="xl" />
      </div>
      <p style={{ fontSize:"clamp(1rem,2vw,1.2rem)", color:"var(--muted)", maxWidth:520, margin:"0 auto 40px", lineHeight:1.7 }}>
        Play classic games online or offline. Create a room, share the Room ID, and challenge your friends in real-time!
      </p>

      {/* CTA */}
      <div style={{ display:"flex", gap:14, flexWrap:"wrap", justifyContent:"center", marginBottom:56 }}>
        {isLoggedIn ? (
          <>
            <Link to="/lobby"       className="btn btn-primary"   style={{ fontSize:"1.05rem", padding:"14px 32px" }}>🚀 Go to Lobby</Link>
            <Link to="/leaderboard" className="btn btn-outline"   style={{ fontSize:"1.05rem", padding:"14px 32px" }}>🏆 Leaderboard</Link>
          </>
        ) : (
          <>
            <Link to="/register" className="btn btn-primary"  style={{ fontSize:"1.05rem", padding:"14px 32px" }}>🎮 Play Free</Link>
            <Link to="/login"    className="btn btn-outline"  style={{ fontSize:"1.05rem", padding:"14px 32px" }}>Log In</Link>
          </>
        )}
      </div>

      {/* Floating tiles */}
      <div style={{ display:"flex", gap:12, marginBottom:56, flexWrap:"wrap", justifyContent:"center" }}>
        {["🀇","🀙","🀄","🀃","🀅","🀁"].map((t,i) => (
          <div key={i} style={{ width:52, height:68, background:"var(--surface)", border:"2px solid #c8a84b",
            borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.8rem",
            boxShadow:"0 5px 0 #8b6914", animation:"float 2s ease-in-out infinite",
            animationDelay:`${i * 0.22}s` }}>
            {t}
          </div>
        ))}
      </div>

      {/* Game cards */}
      <h2 style={{ fontSize:"1.5rem", fontWeight:800, marginBottom:20 }}>Games Available</h2>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:20,
        width:"100%", maxWidth:860, marginBottom:56 }}>
        {GAMES.map(g => (
          <div key={g.name} className="gc" style={{ background:"var(--surface)", border:"1.5px solid var(--surface2)",
            borderRadius:16, padding:"28px 22px", textAlign:"center", transition:"all 0.2s",
            opacity: g.soon ? 0.65 : 1 }}>
            <div style={{ fontSize:"2.8rem", marginBottom:14 }}>{g.icon}</div>
            <h3 style={{ fontSize:"1.05rem", fontWeight:700, marginBottom:8 }}>{g.name}</h3>
            <p style={{ color:"var(--muted)", fontSize:"0.88rem", lineHeight:1.6, marginBottom:14 }}>{g.desc}</p>
            <span style={{ background:"var(--surface2)", borderRadius:20, padding:"4px 12px", fontSize:"0.78rem", color:"var(--muted)" }}>
              👥 {g.players} players
            </span>
            {g.soon && <div style={{ marginTop:10, fontSize:"0.8rem", color:"var(--accent)" }}>Coming Soon</div>}
          </div>
        ))}
      </div>

      {/* Stats strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, width:"100%", maxWidth:520 }}>
        {[{ v:"3+", l:"Games" },{ v:"4", l:"Max Players" },{ v:"∞", l:"Fun" }].map(s => (
          <div key={s.l} style={{ background:"var(--surface)", border:"1.5px solid var(--surface2)", borderRadius:14, padding:20 }}>
            <div style={{ fontSize:"2rem", fontWeight:900, color:"var(--accent)", marginBottom:4 }}>{s.v}</div>
            <div style={{ color:"var(--muted)", fontSize:"0.85rem" }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
