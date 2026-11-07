// src/pages/IconLab.jsx
// /icons — choosing a look for the game icons. Every game's picture in every
// look, side by side on Play-page tiles; "Use this" switches the whole app to
// that look on this phone, to see it on the real Play page. Not linked from
// anywhere: it goes once a look is chosen.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import GameIcon, { LOOKS, getIconLook, setIconLook } from "../components/games/GameIcon";
import { GAMES } from "../components/games/registry";

export default function IconLab() {
  const [chosen, setChosen] = useState(getIconLook);
  useEffect(() => {
    const on = () => setChosen(getIconLook());
    window.addEventListener("pr:iconlook", on);
    return () => window.removeEventListener("pr:iconlook", on);
  }, []);
  return (
    <div className="il-page">
      <div className="il-head">
        <h1>Icon looks</h1>
        <p className="muted">Pick one with “Use this”, then open the Play page to see it for real.</p>
        <Link to="/lobby" className="press p-sun sm">Open the Play page</Link>
      </div>
      {LOOKS.map((L, n) => (
        <section key={L.key} className={`pop il-look${chosen === L.key ? " on" : ""}`}>
          <div className="il-top">
            <div>
              <b>{n + 1}. {L.name}</b>
              <div className="muted il-says">{L.says}</div>
            </div>
            <button type="button" className={`press sm ${chosen === L.key ? "p-mint" : "p-white"}`} onClick={() => setIconLook(L.key)}>
              {chosen === L.key ? "✓ In use" : "Use this"}
            </button>
          </div>
          <div className="il-grid">
            {GAMES.map((g) => (
              <span key={g.slug} className="pc-tile-ic il-tile" style={{ backgroundColor: g.col }} title={g.name}>
                <GameIcon icon={g.icon} slug={g.slug} look={L.key} />
              </span>
            ))}
          </div>
          <div className="il-inline">Playing <GameIcon icon="🦖" slug="dino" look={L.key} /> Dino Dash · invited you to <GameIcon icon="🀄" slug="mahjong" look={L.key} /> Mahjong</div>
        </section>
      ))}
    </div>
  );
}
