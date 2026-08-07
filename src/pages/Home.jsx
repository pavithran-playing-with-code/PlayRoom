// src/pages/Home.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
import { GAMES } from "../components/games/registry";
import PeekBuddy from "../components/characters/PeekBuddy";

// Emoji that bob around the hero. Positioned by percentage so they stay put
// as the hero grows; hidden below 600px where they'd collide with the text.
const FLOATERS = [
  { left: "6%", top: "8%", e: "🀄" },
  { left: "88%", top: "14%", e: "🃏" },
  { left: "12%", top: "70%", e: "⚡" },
  { left: "82%", top: "66%", e: "🔤" },
  { left: "48%", top: "4%", e: "➗" },
];

const STEPS = [
  ["🎲", "Make a room", "Choose a game and a clock. Takes about four seconds.", "var(--sun)"],
  ["🔗", "Share the code", "Six letters. They type it in and they're sitting next to you.", "var(--mint)"],
  ["👑", "Win the round", "Same board, same timer. Highest score takes it.", "var(--bubble)"],
];

export default function Home() {
  const { isLoggedIn } = useAuth();

  return (
    <div className="wrap">
      <div className="mid">

        {/* ── Hero ── */}
        <section className="hero">
          {FLOATERS.map((f, i) => (
            <span key={f.e} className="float" style={{ left: f.left, top: f.top, animationDelay: `${i * 0.4}s` }}>
              {f.e}
            </span>
          ))}
          <div style={{ position: "relative" }}>
            <span className="chip c-grape" style={{ marginBottom: 18 }}>
              🎈 {GAMES.length} games · 2 to 5 minutes each
            </span>
            <h1>Grab a friend.<br />Pick a game.<br />Go.</h1>
            <p>
              Make a room, share the six-letter code, and whoever has the most points when the
              buzzer goes gets the crown. 👑
            </p>
            <div className="row" style={{ justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
              {isLoggedIn ? (
                <>
                  <Link to="/lobby" className="press p-white lg">🎮 Play now</Link>
                  <Link to="/leaderboard" className="press p-grape lg">🏆 Leaderboard</Link>
                </>
              ) : (
                <>
                  <Link to="/register" className="press p-white lg">🎮 Play free</Link>
                  <Link to="/login" className="press p-grape lg">Log in</Link>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── Games ── */}
        <section className="sec">
          <div className="sec-h">
            <h2>Pick your game</h2>
            <span className="chip c-sun">{GAMES.length} to choose from</span>
          </div>
          <div className="tiles">
            {GAMES.map((g) => (
              <Link key={g.slug} to={isLoggedIn ? "/lobby" : "/register"} className="tile">
                <PeekBuddy colour={g.col} size={60} />
                <span className="top" style={{ background: g.col }}>
                  <span className="ghost">{g.icon}</span>
                  <span className="big">{g.icon}</span>
                </span>
                <span className="bot" style={{ display: "block" }}>
                  <h3>{g.name}</h3>
                  <p>{g.blurb}</p>
                  <span className="row" style={{ justifyContent: "space-between" }}>
                    <span className="chip c-sun">{g.tag}</span>
                    <span className="muted" style={{ fontSize: ".82rem" }}>
                      👥 {g.minPlayers === g.maxPlayers ? g.maxPlayers : `${g.minPlayers}–${g.maxPlayers}`}
                    </span>
                  </span>
                </span>
              </Link>
            ))}

            {/* Placeholder tile — dashed and flat, so it reads as "not yet a thing". */}
            <div className="tile tile-soon">
              <span className="top" style={{ background: "transparent", borderBottomStyle: "dashed" }}>
                <span className="big" style={{ opacity: 0.4 }}>✨</span>
              </span>
              <span className="bot" style={{ display: "block", background: "transparent" }}>
                <h3>More on the way</h3>
                <p>New game every month. Tell us what you want next.</p>
              </span>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="sec">
          <div className="grid g3">
            {STEPS.map(([icon, title, desc, col], n) => (
              <div key={title} className="pop"
                style={{ padding: 24, textAlign: "center", transform: `rotate(${n === 1 ? 0 : n ? 1.2 : -1.2}deg)` }}>
                <div className="step-icon" style={{ background: col }}>{icon}</div>
                <h3 style={{ fontSize: "1.3rem", marginBottom: 6 }}>{title}</h3>
                <p className="muted" style={{ fontSize: ".92rem", lineHeight: 1.55 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
