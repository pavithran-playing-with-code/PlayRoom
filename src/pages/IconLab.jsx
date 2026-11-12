// src/pages/IconLab.jsx
// TEMPORARY — delete once an icon style is chosen (with its route in App.js
// and the 🎨 link in Navbar.jsx). Every game's icon in eight styles, side by
// side, to pick one from. Each style is the same drawing (gamePosters.js)
// given a different finish, so they can be compared like for like.
import React from "react";
import { GAMES } from "../components/games/registry";
import { POSTERS } from "../components/games/gamePosters";
import GamePoster from "../components/games/GamePoster";

const INK = "#1B1230";
const at = (s) => `translate(32 32) scale(${s}) translate(-32 -32)`;
const Svg = ({ children }) => (
  <svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: "block", width: "100%", height: "100%" }}>{children}</svg>
);
const bgRad = (id, p) => (
  <radialGradient id={id} cx="0.5" cy="0.5" r="0.72"><stop offset="0" stopColor={p.bg[0]} /><stop offset="1" stopColor={p.bg[1]} /></radialGradient>
);
const bgLin = (id, p) => (
  <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={p.bg[0]} /><stop offset="1" stopColor={p.bg[1]} /></linearGradient>
);
// the dark outline of style 1, under a name of this page's own
const outline = (
  <filter id="il-ol" x="-25%" y="-25%" width="150%" height="160%" colorInterpolationFilters="sRGB">
    <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="fat" />
    <feOffset in="fat" dy="2.2" result="low" />
    <feMerge result="shape"><feMergeNode in="fat" /><feMergeNode in="low" /></feMerge>
    <feFlood floodColor={INK} result="ink" />
    <feComposite in="ink" in2="shape" operator="in" result="line" />
    <feMerge><feMergeNode in="line" /><feMergeNode in="SourceGraphic" /></feMerge>
  </filter>
);

const STYLES = [
  { name: "Chunky cartoon (live now)", note: "Dark outline, sunburst behind.",
    draw: (p, slug) => <GamePoster slug={slug} /> },

  { name: "Sticker", note: "White border like a peeled sticker, plain pastel tile.",
    draw: (p) => (
      <Svg>
        <defs>
          {p.defs}
          <filter id="il-sticker" x="-30%" y="-30%" width="160%" height="170%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="fat" />
            <feFlood floodColor="#FFFFFF" /><feComposite in2="fat" operator="in" result="white" />
            <feOffset in="fat" dy="2.6" result="low" /><feFlood floodColor={INK} floodOpacity="0.35" /><feComposite in2="low" operator="in" result="shade" />
            <feMorphology in="SourceAlpha" operator="dilate" radius="0.7" result="thin" />
            <feFlood floodColor={INK} /><feComposite in2="thin" operator="in" result="line" />
            <feMerge><feMergeNode in="shade" /><feMergeNode in="white" /><feMergeNode in="line" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="64" height="64" fill={p.bg[0]} />
        <g filter="url(#il-sticker)"><g transform={at(0.8)}>{p.art}</g></g>
      </Svg>
    ) },

  { name: "Dark tile", note: "Night-blue tile, the game's colour as a disc behind.",
    draw: (p, slug) => (
      <Svg>
        <defs>{p.defs}{outline}{bgRad(`il-d-${slug}`, p)}</defs>
        <rect width="64" height="64" fill="#171231" />
        <circle cx="32" cy="34" r="25" fill="#0B0820" />
        <circle cx="32" cy="32" r="25" fill={`url(#il-d-${slug})`} />
        <g filter="url(#il-ol)"><g transform={at(0.8)}>{p.art}</g></g>
      </Svg>
    ) },

  { name: "Gold badge", note: "A medal with a gold ring.",
    draw: (p, slug) => (
      <Svg>
        <defs>
          {p.defs}{outline}{bgRad(`il-b-${slug}`, p)}
          <linearGradient id="il-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF2A8" /><stop offset="0.5" stopColor="#FFC62E" /><stop offset="1" stopColor="#C47F00" /></linearGradient>
        </defs>
        <rect width="64" height="64" fill={p.bg[1]} />
        <circle cx="32" cy="34.5" r="30" fill={INK} />
        <circle cx="32" cy="32" r="30" fill={INK} />
        <circle cx="32" cy="32" r="28.3" fill="url(#il-gold)" />
        <circle cx="32" cy="32" r="23.5" fill={INK} />
        <circle cx="32" cy="32" r="22" fill={`url(#il-b-${slug})`} />
        <path d="M9 24a24.5 24.5 0 0 1 15-14" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity=".8" />
        <g filter="url(#il-ol)"><g transform={at(0.7)}>{p.art}</g></g>
      </Svg>
    ) },

  { name: "Flat", note: "No outline, a hard flat shadow.",
    draw: (p, slug) => (
      <Svg>
        <defs>
          {p.defs}{bgLin(`il-f-${slug}`, p)}
          <filter id="il-flat" x="-30%" y="-30%" width="170%" height="170%" colorInterpolationFilters="sRGB">
            <feOffset in="SourceAlpha" dx="3" dy="3.5" result="low" /><feFlood floodColor={INK} floodOpacity="0.3" /><feComposite in2="low" operator="in" result="shade" />
            <feMerge><feMergeNode in="shade" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="64" height="64" fill={`url(#il-f-${slug})`} />
        <g filter="url(#il-flat)"><g transform={at(0.84)}>{p.art}</g></g>
      </Svg>
    ) },

  { name: "White shape", note: "Just the shape in white, like a phone's app icons.",
    draw: (p, slug) => (
      <Svg>
        <defs>
          {p.defs}{bgLin(`il-w-${slug}`, p)}
          <filter id="il-white" x="-30%" y="-30%" width="170%" height="170%" colorInterpolationFilters="sRGB">
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" result="white" />
            <feOffset in="SourceAlpha" dx="2.6" dy="3" result="low" /><feFlood floodColor={INK} floodOpacity="0.3" /><feComposite in2="low" operator="in" result="shade" />
            <feMerge><feMergeNode in="shade" /><feMergeNode in="white" /></feMerge>
          </filter>
        </defs>
        <rect width="64" height="64" fill={`url(#il-w-${slug})`} />
        <g filter="url(#il-white)"><g transform={at(0.78)}>{p.art}</g></g>
      </Svg>
    ) },

  { name: "Comic", note: "Cream paper, printed dots, dark outline.",
    draw: (p, slug) => (
      <Svg>
        <defs>
          {p.defs}{outline}
          <pattern id={`il-dots-${slug}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="3" cy="3" r="1.5" fill={p.bg[1]} opacity=".45" /></pattern>
        </defs>
        <rect width="64" height="64" fill="#FFF6DE" />
        <rect width="64" height="64" fill={`url(#il-dots-${slug})`} />
        <path d="M-4 46L68 26v42H-4z" fill={p.bg[0]} />
        <path d="M-4 46L68 26" stroke={INK} strokeWidth="2" />
        <g filter="url(#il-ol)"><g transform={at(0.88)}>{p.art}</g></g>
      </Svg>
    ) },

  { name: "Two-colour split", note: "The tile cut corner to corner in two colours.",
    draw: (p) => (
      <Svg>
        <defs>{p.defs}{outline}</defs>
        <rect width="64" height="64" fill={p.bg[1]} />
        <path d="M0 0h64L0 64z" fill={p.bg[0]} />
        <g filter="url(#il-ol)"><g transform={at(0.9)}>{p.art}</g></g>
      </Svg>
    ) },
];

export default function IconLab() {
  const games = GAMES.filter((g) => POSTERS[g.slug]);
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "18px 16px 120px" }}>
      <h1 className="display" style={{ fontSize: "1.5rem", margin: "0 0 4px" }}>🎨 Icon styles</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: ".9rem" }}>Pick one by its number. This page is temporary.</p>
      {STYLES.map((s, i) => (
        <section key={s.name} className="pop" style={{ padding: 14, marginBottom: 18 }}>
          <h2 className="display" style={{ fontSize: "1.15rem", margin: 0 }}>Style {i + 1} — {s.name}</h2>
          <p className="muted" style={{ margin: "2px 0 12px", fontSize: ".82rem" }}>{s.note}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(68px,1fr))", gap: "14px 10px" }}>
            {games.map((g) => (
              <div key={g.slug} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span className="pc-tile-ic poster" style={{ borderRadius: 18 }}>{s.draw(POSTERS[g.slug], g.slug)}</span>
                <span style={{ fontSize: ".66rem", fontWeight: 800, textAlign: "center", lineHeight: 1.1 }}>{g.name}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
