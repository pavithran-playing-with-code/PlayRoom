// src/pages/IconLab.jsx
// TEMPORARY — delete once an icon style is chosen (with its route in App.js
// and the 🎨 link in Navbar.jsx). Icon styles to pick from, shown on the same
// eight games. Style 1 is what is live; 2–5 are the grown-up ones: dark,
// minimal, no faces, no outlines, no glow. The chosen style then gets drawn
// for every game.
import React from "react";
import { GAME_MAP } from "../components/games/registry";
import GamePoster from "../components/games/GamePoster";

const SAMPLE = ["dino", "flappy", "storm", "sneak", "emberfall", "blocks", "speedway", "memory"];
const Svg = ({ children }) => (
  <svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: "block", width: "100%", height: "100%" }}>{children}</svg>
);
const lin = (id, a, b, x2 = 1, y2 = 1) => (
  <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
);
// a quiet light across the top of a dark tile
const sheen = <path d="M0 0h64v26C44 20 20 20 0 26z" fill="#FFFFFF" opacity=".045" />;

/* ───────────── 2 · MIDNIGHT: a solid mark in one colour on near-black ───────────── */
// [from, to, the mark (painted in the gradient), the quiet part (same gradient, faint)]
const MID = {
  dino: ["#8CF2A6", "#1FA866", <><path d="M9 51V35c0-12 9-21 22-21h11c8 0 14 5 14 13v4c0 3-2 5-5 5H38v5c0 6-4 10-10 10z" /><circle cx="37" cy="24" r="3.4" fill="#101118" /><path d="M38 36H27" stroke="#101118" strokeWidth="2.4" strokeLinecap="round" /></>, <path d="M15 22l-3-8 8 3zM23 14l0-8 7 5z" />],
  flappy: ["#FFE27A", "#F29A1F", <><circle cx="29" cy="33" r="15" /><path d="M43 29l11 4-11 5z" /><circle cx="35" cy="28" r="3.2" fill="#101118" /><path d="M17 36c4-4 9-4 12 0-3 4-8 4-12 0z" fill="#101118" opacity=".55" /></>, <path d="M5 26l8 3-8 5z" />],
  storm: ["#C9B6FF", "#7A4FE8", <path d="M37 27L24 44h9l-5 14 17-20h-9l6-11z" />, <path d="M14 34a10 10 0 0 1 1-20 14 14 0 0 1 27-2 10 10 0 0 1 8 22z" />],
  sneak: ["#FFE9A8", "#E8B23A", <><path d="M24 56l3-28h10l3 28z" /><rect x="26" y="15" width="12" height="10" rx="1.5" /><path d="M23 14l9-8 9 8z" /></>, <path d="M39 20l25-10v22zM25 20L0 10v22z" />],
  emberfall: ["#FFB36B", "#F0431E", <><path d="M32 6c3 11 17 16 17 31a17 17 0 0 1-34 0c0-8 4-12 8-15 0 6 2 9 5 9 0-9 2-16 4-25z" /><path d="M32 54a7 7 0 0 1-7-7c0-5 7-8 7-15 4 5 7 9 7 15a7 7 0 0 1-7 7z" fill="#101118" opacity=".5" /></>, null],
  blocks: ["#E0B8FF", "#9A4FE8", <><rect x="9" y="12" width="14" height="14" rx="3" /><rect x="25" y="12" width="14" height="14" rx="3" /><rect x="41" y="12" width="14" height="14" rx="3" /><rect x="25" y="28" width="14" height="14" rx="3" /></>, <><rect x="9" y="44" width="14" height="14" rx="3" /><rect x="41" y="44" width="14" height="14" rx="3" /></>],
  speedway: ["#FF9A9A", "#E5303F", <><rect x="12" y="8" width="4" height="50" rx="2" /><path d="M16 11h10v9H16zM36 11h10v9H36zM26 20h10v9H26zM46 20h8v9h-8zM16 29h10v9H16zM36 29h10v9H36z" /></>, <path d="M26 11h10v9H26zM46 11h8v9h-8zM16 20h10v9H16zM36 20h10v9H36zM26 29h10v9H26zM46 29h8v9h-8z" />],
  memory: ["#FFB3D0", "#E8407F", <><rect x="29" y="13" width="24" height="36" rx="5" transform="rotate(9 41 31)" /><circle cx="41" cy="31" r="5" fill="#101118" opacity=".55" /></>, <rect x="10" y="15" width="24" height="36" rx="5" transform="rotate(-10 22 33)" />],
};
const midnight = (slug) => {
  const [a, b, mark, quiet] = MID[slug];
  const id = `il-m-${slug}`;
  return (
    <Svg>
      <defs>{lin(id, a, b, 0.6, 1)}{lin("il-night", "#1C1D27", "#0C0D12", 0, 1)}</defs>
      <rect width="64" height="64" fill="url(#il-night)" />
      {sheen}
      <g fill={`url(#${id})`} opacity=".3">{quiet}</g>
      <g fill={`url(#${id})`}>{mark}</g>
    </Svg>
  );
};

/* ───────────── 3 · LINE: one thin white line drawing on a deep colour ───────────── */
const LINE = {
  dino: ["#1F7A52", "#0C3A2A", <><path d="M34 8H54V21H44V24H50V28H42V33H47V37H42V42L37 47V54H32V49H28V54H23V47L11 37V28L18 35H26L34 27Z" /><path d="M41 14.5h.1" /><path d="M6 59h52" opacity=".5" /></>],
  flappy: ["#2A72C4", "#102E66", <><circle cx="24" cy="32" r="13" /><path d="M14 34c3-4 8-4 11 0-3 4-8 4-11 0z" /><path d="M36 30l9 3.5-9 4" /><path d="M29 27h.1" /><path d="M48 5v14h11V5M48 59V46h11v13" opacity=".5" /></>],
  storm: ["#5A3FC0", "#1E1250", <><path d="M17 31a9.5 9.5 0 0 1 2-18.5 13 13 0 0 1 24.5 2A8.5 8.5 0 0 1 47 31" opacity=".5" /><path d="M36 24l-11 16h9l-5 17 15-21h-9l5-12z" /></>],
  sneak: ["#2A3A8A", "#0C1238", <><path d="M23 58l4-32h10l4 32z" /><path d="M25.5 42h13" /><path d="M26 26V16h12v10M23 16l9-9 9 9z" /><path d="M43 18l16-6M43 23l16 6M21 18L5 12M21 23L5 29" opacity=".5" /></>],
  emberfall: ["#C4421E", "#4A1010", <><path d="M32 5c2 11 16 16 16 31a16 16 0 0 1-32 0c0-7 3.5-10.5 7-14 0 6 2 8.5 4.5 8.5C27.5 21 30 14 32 5z" /><path d="M32 54a6.5 6.5 0 0 1-6.5-6.5c0-5 6.5-7.5 6.5-14 3.5 4.5 6.5 8 6.5 14A6.5 6.5 0 0 1 32 54z" opacity=".5" /></>],
  blocks: ["#8A3FC0", "#30104A", <><path d="M13 8h38v13H39v13H25V21H13z" /><path d="M6 57V46h14v11M34 57V44h12v-8h12v21M6 57h52" opacity=".5" /></>],
  speedway: ["#C42E3A", "#4A0C18", <><path d="M13 7v51" /><path d="M13 10c9-5 14 4 23 0s13-2 18 0v24c-5-2-9-4-18 0s-14-5-23 0z" /><path d="M24.5 9.5v24M36 10v24M45 8v24M13 22c9-5 14 4 23 0s13-2 18 0" opacity=".5" /></>],
  memory: ["#C43E7A", "#4A1030", <><rect x="8" y="15" width="22" height="34" rx="5" transform="rotate(-8 19 32)" opacity=".5" /><rect x="34" y="15" width="22" height="34" rx="5" transform="rotate(8 45 32)" /><path d="M45 25l2 4.4 4.8.6-3.5 3.3.9 4.7-4.2-2.4-4.2 2.4.9-4.7-3.5-3.3 4.8-.6z" transform="rotate(8 45 32)" /></>],
};
const line = (slug) => {
  const [a, b, art] = LINE[slug];
  const id = `il-l-${slug}`;
  return (
    <Svg>
      <defs>{lin(id, a, b)}</defs>
      <rect width="64" height="64" fill={`url(#${id})`} />
      <g fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" transform="translate(32 32) scale(.82) translate(-32 -32)">{art}</g>
    </Svg>
  );
};

/* ───────────── 4 · GLASS: a few sheets of frosted glass on a deep colour ───────────── */
// abstract on purpose: the idea of the game in two or three clean shapes
const GLASS = {
  dino: ["#2FA36B", "#0E3F3A", <><rect x="12" y="14" width="9" height="40" rx="4.5" transform="rotate(24 16 34)" opacity=".35" /><rect x="27" y="12" width="9" height="42" rx="4.5" transform="rotate(24 31 33)" opacity=".6" /><rect x="42" y="12" width="9" height="40" rx="4.5" transform="rotate(24 46 32)" opacity=".95" /></>],
  flappy: ["#3A8FE8", "#16307A", <><rect x="40" y="-4" width="14" height="24" rx="4" opacity=".4" /><rect x="40" y="44" width="14" height="24" rx="4" opacity=".4" /><circle cx="26" cy="32" r="11" opacity=".95" /></>],
  storm: ["#7A5AE8", "#22124F", <><circle cx="32" cy="28" r="20" opacity=".28" /><path d="M37 14L21 36h10l-5 16 19-23H34l6-15z" opacity=".95" /></>],
  sneak: ["#3F52B8", "#0E1440", <><path d="M32 32L70 10v44z" opacity=".3" /><rect x="14" y="16" width="8" height="32" rx="4" opacity=".55" /><circle cx="32" cy="32" r="7" opacity=".95" /></>],
  emberfall: ["#F0602E", "#5A1220", <><path d="M32 6c9 11 18 20 18 32a18 18 0 0 1-36 0c0-12 9-21 18-32z" opacity=".4" /><path d="M32 26c5 6 10 11 10 18a10 10 0 0 1-20 0c0-7 5-12 10-18z" opacity=".95" /></>],
  blocks: ["#A45AE8", "#32145A", <><rect x="9" y="14" width="14" height="14" rx="4" opacity=".95" /><rect x="25" y="14" width="14" height="14" rx="4" opacity=".75" /><rect x="41" y="14" width="14" height="14" rx="4" opacity=".55" /><rect x="25" y="30" width="14" height="14" rx="4" opacity=".35" /></>],
  speedway: ["#E8404F", "#5A1024", <><circle cx="32" cy="32" r="18" fill="none" stroke="#FFFFFF" strokeWidth="8" opacity=".35" /><circle cx="44.7" cy="19.3" r="6" opacity=".95" /></>],
  memory: ["#E8508F", "#5A1238", <><rect x="10" y="15" width="24" height="36" rx="6" transform="rotate(-10 22 33)" opacity=".4" /><rect x="30" y="13" width="24" height="36" rx="6" transform="rotate(9 42 31)" opacity=".95" /></>],
};
const glass = (slug) => {
  const [a, b, art] = GLASS[slug];
  const id = `il-g-${slug}`;
  return (
    <Svg>
      <defs>{lin(id, a, b)}</defs>
      <rect width="64" height="64" fill={`url(#${id})`} />
      <circle cx="10" cy="6" r="34" fill="#FFFFFF" opacity=".07" />
      <g fill="#FFFFFF">{art}</g>
    </Svg>
  );
};

/* ───────────── 5 · GOLD ON BLACK: an engraved sign in brushed gold ───────────── */
const GOLD = {
  dino: <><ellipse cx="32" cy="41" rx="9" ry="8" /><ellipse cx="20" cy="29" rx="4" ry="6" transform="rotate(-25 20 29)" /><ellipse cx="32" cy="24" rx="4.2" ry="6.5" /><ellipse cx="44" cy="29" rx="4" ry="6" transform="rotate(25 44 29)" /></>,
  flappy: <path d="M12 26c8-10 20-12 40-10-3 5-7 8-12 9 4 0 7 0 9-1-3 6-8 9-14 10 3 1 5 1 7 0-5 6-12 8-20 6-6-2-10-7-10-14z" />,
  storm: <path d="M38 10L18 36h11l-6 18 23-27H34l8-17z" />,
  sneak: <><path d="M8 32c7-10 15-15 24-15s17 5 24 15c-7 10-15 15-24 15S15 42 8 32z" /><circle cx="32" cy="32" r="8.5" fill="#0B0B0E" /><circle cx="35" cy="29" r="2.6" /></>,
  emberfall: <><path d="M29 12l3-7 3 7v26h-6z" /><rect x="21" y="38" width="22" height="4.5" rx="2" /><rect x="29.8" y="42.5" width="4.4" height="9" rx="1.5" /><circle cx="32" cy="54" r="3" /></>,
  blocks: <path d="M13 17h38v13H39v14H25V30H13z" />,
  speedway: <><circle cx="32" cy="32" r="17" fill="none" stroke="url(#il-gold)" strokeWidth="5" /><circle cx="32" cy="32" r="4.5" /><path d="M32 32L17 28M32 32l15-4M32 32v16" stroke="url(#il-gold)" strokeWidth="4.4" strokeLinecap="round" /></>,
  memory: <><rect x="13" y="18" width="19" height="27" rx="4" transform="rotate(-12 22 31)" opacity=".55" /><rect x="31" y="16" width="19" height="27" rx="4" transform="rotate(10 41 30)" /></>,
};
const gold = (slug) => (
  <Svg>
    <defs>
      <linearGradient id="il-gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="64" y2="64">
        <stop offset="0" stopColor="#F7E3A1" /><stop offset="0.45" stopColor="#D4A94A" /><stop offset="0.7" stopColor="#F1D58A" /><stop offset="1" stopColor="#9A7426" />
      </linearGradient>
      {lin("il-black", "#1A1A1F", "#060608", 0, 1)}
    </defs>
    <rect width="64" height="64" fill="url(#il-black)" />
    {sheen}
    <rect x="5" y="5" width="54" height="54" rx="13" fill="none" stroke="url(#il-gold)" strokeWidth="1" opacity=".7" />
    <g fill="url(#il-gold)" transform="translate(32 32) scale(.72) translate(-32 -32)">{GOLD[slug]}</g>
  </Svg>
);

const STYLES = [
  { name: "Chunky cartoon (live now)", note: "For comparison.", toy: true, draw: (slug) => <GamePoster slug={slug} /> },
  { name: "Midnight", note: "Near-black tile, one solid mark in the game's colour.", draw: midnight },
  { name: "Line", note: "One thin white line drawing on a deep colour.", draw: line },
  { name: "Glass", note: "Abstract: the idea of the game in two or three sheets of frosted glass.", draw: glass },
  { name: "Gold on black", note: "A sign in brushed gold, thin gold frame.", draw: gold },
];

// the grown-up styles get a plain tile: no ink border, no toy shadow
const PLAIN = { display: "block", width: "100%", maxWidth: 100, aspectRatio: "1", borderRadius: "23%", overflow: "hidden", boxShadow: "0 6px 14px rgba(10,8,30,.28)" };

export default function IconLab() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "18px 16px 120px" }}>
      <h1 className="display" style={{ fontSize: "1.5rem", margin: "0 0 4px" }}>🎨 Icon styles</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: ".9rem" }}>Eight games in each style. Pick one by its number. This page is temporary.</p>
      {STYLES.map((s, i) => (
        <section key={s.name} className="pop" style={{ padding: 14, marginBottom: 18 }}>
          <h2 className="display" style={{ fontSize: "1.15rem", margin: 0 }}>Style {i + 1} — {s.name}</h2>
          <p className="muted" style={{ margin: "2px 0 12px", fontSize: ".82rem" }}>{s.note}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "14px 10px" }}>
            {SAMPLE.map((slug) => {
              const name = (GAME_MAP[slug] && GAME_MAP[slug].name) || slug;
              return (
                <div key={slug} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, minWidth: 0 }}>
                  {s.toy
                    ? <span className="pc-tile-ic poster" style={{ borderRadius: 18 }}>{s.draw(slug)}</span>
                    : <span style={PLAIN}>{s.draw(slug)}</span>}
                  <span style={{ fontSize: ".68rem", fontWeight: 800, textAlign: "center", lineHeight: 1.1 }}>{name}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
