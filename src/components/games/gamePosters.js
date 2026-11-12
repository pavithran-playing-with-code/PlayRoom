// src/components/games/gamePosters.js
// A game's ICON, in the chunky cartoon style of a mobile-game app icon: ONE
// big hero (a character's face, a fat glossy object) with a thick dark
// outline, on a bright sunburst of the game's colour. The Play page's tiles,
// the start sheet and "Play again" show these (GamePoster.jsx); the little
// inline icons beside a game's name are still gamePictures.js (GameIcon).
//
// Each is { bg: [middle, edge], defs, back, art } on a 64 x 64 board.
// GamePoster paints the sunburst from `bg`, then `back` (anything behind the
// hero: a beam, a road — no outline), then `art` inside ONE group whose
// filter adds the dark outline round the whole silhouette, heavier
// underneath. So inside `art`: no strokes for outlines, no soft shadows and
// nothing see-through outside the hero's own shape (the outline is made from
// the group's alpha). Shade like a toy: a gradient top to bottom, a darker
// slab under it for thickness, a white shine top left. One hero, big, a
// little tilted; it must read at 40px.
import React from "react";

const INK = "#1B1230";
const F = { fontFamily: "Fredoka, Nunito, 'Segoe UI', sans-serif", fontWeight: 700, textAnchor: "middle" };
const V = (id, a, b) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
);
const R = (id, a, b) => (
  <radialGradient id={id} cx="0.35" cy="0.28" r="0.85"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></radialGradient>
);
// a big cartoon eye looking right
const eye = (x, y, r) => (
  <>
    <circle cx={x} cy={y} r={r} fill="#FFFFFF" />
    <circle cx={x + r * 0.28} cy={y + r * 0.12} r={r * 0.52} fill={INK} />
    <circle cx={x + r * 0.48} cy={y - r * 0.2} r={r * 0.2} fill="#FFFFFF" />
  </>
);
const shine = (d, w = 2.6) => <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={w} strokeLinecap="round" opacity=".8" />;
// one fat square block (blocks, keys): a dark slab, a top, a shine
const cell = (x, y, s, top, side, key) => (
  <g key={key}>
    <rect x={x} y={y + s * 0.2} width={s} height={s} rx={s * 0.24} fill={side} />
    <rect x={x} y={y} width={s} height={s} rx={s * 0.24} fill={top} />
    <rect x={x + s * 0.16} y={y + s * 0.12} width={s * 0.68} height={s * 0.2} rx={s * 0.1} fill="#FFFFFF" opacity=".5" />
  </g>
);

export const POSTERS = {
  mahjong: {
    bg: ["#7DF0A4", "#0C6B3E"],
    defs: V("gp-mahjong-a", "#FFFFFF", "#F1DFB4"),
    art: (
      <g transform="rotate(-9 32 32)">
        <rect x="14" y="13" width="36" height="45" rx="8" fill="#B88E46" />
        <rect x="14" y="6" width="36" height="45" rx="8" fill="url(#gp-mahjong-a)" />
        <rect x="18.5" y="9" width="27" height="5" rx="2.5" fill="#FFFFFF" />
        <rect x="23" y="21" width="18" height="13" rx="2.5" fill="none" stroke="#E0303A" strokeWidth="5.2" />
        <path d="M32 14.5v29" stroke="#E0303A" strokeWidth="5.6" strokeLinecap="round" />
      </g>
    ),
  },
  memory: {
    bg: ["#FFB0A0", "#B92A52"],
    defs: <>{V("gp-memory-a", "#9A82FF", "#4A31B8")}{V("gp-memory-b", "#FFF08A", "#FF9D0A")}</>,
    art: (
      <>
        <g transform="rotate(-15 22 34)">
          <rect x="7" y="13" width="27" height="40" rx="6.5" fill="url(#gp-memory-a)" />
          <rect x="11" y="17" width="19" height="32" rx="3.5" fill="none" stroke="#C9BEFF" strokeWidth="2" />
          <path d="M20.5 26l5 7-5 7-5-7z" fill="#C9BEFF" />
        </g>
        <g transform="rotate(9 42 34)">
          <rect x="26" y="15" width="30" height="42" rx="7" fill="#BDB0E0" />
          <rect x="26" y="10" width="30" height="42" rx="7" fill="#FFFFFF" />
          <path d="M0-12l3.6 7.7 8.4 1.1-6.2 5.8 1.6 8.4L0 6.8l-7.4 4.2 1.6-8.4-6.2-5.8 8.4-1.1z" fill="url(#gp-memory-b)" transform="translate(41 31)" />
          <path d="M37.5 25l2-3.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      </>
    ),
  },
  speedmath: {
    bg: ["#7DF5E4", "#0D7D94"],
    art: (
      <g transform="rotate(-8 32 32)">
        <path d="M24 12v28M10 26h28" stroke="#C98600" strokeWidth="12" strokeLinecap="round" transform="translate(0 4)" />
        <path d="M24 12v28M10 26h28" stroke="#FFD23F" strokeWidth="12" strokeLinecap="round" />
        <path d="M21 11v9M9.5 23h8" stroke="#FFF6B8" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M38 38l14 14M52 38L38 52" stroke="#B81F6E" strokeWidth="10" strokeLinecap="round" transform="translate(0 3.5)" />
        <path d="M38 38l14 14M52 38L38 52" stroke="#FF5FA8" strokeWidth="10" strokeLinecap="round" />
        <path d="M36.5 37l4 4" stroke="#FFD0E6" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    ),
  },
  reaction: {
    bg: ["#C9F2FF", "#1E7FC4"],
    defs: <>{R("gp-reaction-a", "#FFA08A", "#C4121F")}{V("gp-reaction-b", "#F6F8FF", "#A7B0D0")}</>,
    art: (
      <g transform="translate(0 -5)">
        <path d="M5 49c0-7 12-10 27-10s27 3 27 10v6c0 6-12 9-27 9S5 61 5 55z" fill="#7A84AC" />
        <path d="M5 47c0-7 12-10 27-10s27 3 27 10c0 6-12 9-27 9S5 53 5 47z" fill="url(#gp-reaction-b)" />
        <path d="M11 45c0-15 9.5-26 21-26s21 11 21 26c0 4.5-9.5 7-21 7s-21-2.5-21-7z" fill="url(#gp-reaction-a)" />
        <path d="M18 34c2.5-6.5 7-10 13-10" fill="none" stroke="#FFFFFF" strokeWidth="3.6" strokeLinecap="round" opacity=".85" />
      </g>
    ),
  },
  wordrush: {
    bg: ["#D8FF8A", "#3A8F1E"],
    defs: V("gp-wordrush-a", "#FFFFFF", "#F3E7C4"),
    art: (
      <>
        <g transform="rotate(14 46 18)">{cell(34, 5, 24, "#FF8FC7", "#C2468A", "r")}<text x="46" y="24" fontSize="18" fill="#7A1450" {...F}>R</text></g>
        <g transform="rotate(-9 26 38)">
          <rect x="5" y="23" width="42" height="38" rx="10" fill="#C9A85A" />
          <rect x="5" y="15" width="42" height="40" rx="10" fill="url(#gp-wordrush-a)" />
          <rect x="11" y="18.5" width="30" height="5.5" rx="2.7" fill="#FFFFFF" />
          <text x="26" y="47" fontSize="30" fill="#2F8F1E" {...F}>W</text>
        </g>
      </>
    ),
  },
  arrows: {
    bg: ["#FFC7E4", "#C02E80"],
    defs: V("gp-arrows-a", "#FFF08A", "#FFB000"),
    art: (
      <g transform="rotate(-38 32 32)">
        <path d="M6 24h24V10l28 22-28 22V40H6z" fill="#C47F00" transform="translate(0 5)" strokeLinejoin="round" stroke="#C47F00" strokeWidth="4" />
        <path d="M6 24h24V10l28 22-28 22V40H6z" fill="url(#gp-arrows-a)" strokeLinejoin="round" stroke="url(#gp-arrows-a)" strokeWidth="4" />
        <path d="M9 27h20M34 17l12 9.5" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" opacity=".85" />
      </g>
    ),
  },
  dino: {
    bg: ["#FFE89A", "#F0672E"],
    defs: V("gp-dino-a", "#9BF59B", "#2A9E48"),
    art: (
      <>
        <path d="M15 24l-4-12 10 5zM22 15l0-11 9 7zM33 11l3-9 7 9z" fill="#1F8A3E" />
        <path d="M6 56V35C6 21 17 11 31 11h11c10 0 17 6.5 17 15.5v6c0 4-3 6.5-7 6.5H39v5c0 7-5 12-12 12z" fill="url(#gp-dino-a)" />
        <path d="M6 45c8 3 21 3.5 33 .5-1 6-5.5 10.5-12 10.5H6z" fill="#F4FFD0" opacity=".85" />
        <path d="M41 39l3 5 3-5zM48.5 39l3 5 3-5z" fill="#FFFFFF" />
        <path d="M39 39h-13" stroke="#14602A" strokeWidth="2.2" strokeLinecap="round" />
        {eye(36, 24, 7.5)}
        <path d="M27 14.5l16 5" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="53.5" cy="23" r="1.6" fill="#14602A" />
        {shine("M12 33c1-8 5-13 11-16", 3)}
      </>
    ),
  },
  numbers: {
    bg: ["#B5ECFF", "#2462C9"],
    defs: <>{R("gp-numbers-1", "#FFA6CF", "#D61F78")}{R("gp-numbers-2", "#FFF59A", "#F0A000")}{R("gp-numbers-3", "#C9B6FF", "#5A32D6")}</>,
    art: (
      <>
        <circle cx="47" cy="18" r="12.5" fill="url(#gp-numbers-2)" /><ellipse cx="43" cy="12" rx="4.5" ry="2.4" fill="#FFFFFF" opacity=".7" transform="rotate(-32 43 12)" /><text x="47" y="23.5" fontSize="15" fill="#6B3D00" {...F}>2</text>
        <circle cx="49" cy="47" r="10.5" fill="url(#gp-numbers-3)" /><ellipse cx="45.5" cy="42" rx="3.8" ry="2" fill="#FFFFFF" opacity=".7" transform="rotate(-32 45.5 42)" /><text x="49" y="51.5" fontSize="13" fill="#FFFFFF" {...F}>3</text>
        <circle cx="23" cy="35" r="19" fill="url(#gp-numbers-1)" /><ellipse cx="16" cy="25" rx="7" ry="3.6" fill="#FFFFFF" opacity=".75" transform="rotate(-32 16 25)" /><text x="23" y="44" fontSize="25" fill="#FFFFFF" {...F}>1</text>
      </>
    ),
  },
  colors: {
    bg: ["#8A7BE8", "#2B1F66"],
    art: (
      <g transform="rotate(-12 32 32)">
        <circle cx="32" cy="35" r="25" fill="#3A2A70" />
        {["#FF4F5E", "#FFB703", "#8FDB5C", "#2EC4B6", "#4CC9F0", "#B06BF0"].map((c, i) => (
          <path key={c} d="M32 31L32 6A25 25 0 0 1 53.65 18.5z" fill={c} transform={`rotate(${i * 60} 32 31)`} />
        ))}
        <path d="M13 22a21 21 0 0 1 14-11.5" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity=".7" />
        <circle cx="32" cy="32.5" r="9.5" fill="#C9C2E6" /><circle cx="32" cy="31" r="9.5" fill="#FFFFFF" />
      </g>
    ),
  },
  pipes: {
    bg: ["#8FA6F0", "#1B2460"],
    defs: R("gp-pipes-a", "#B8F0FF", "#1E9BE0"),
    art: (
      <>
        <path d="M-6 24h28a14 14 0 0 1 14 14v32" fill="none" stroke="#0D6F68" strokeWidth="19" />
        <path d="M-6 22h28a16 16 0 0 1 16 16v32" fill="none" stroke="#2CC9B8" strokeWidth="13" />
        <path d="M-6 17.5h28a20.5 20.5 0 0 1 20.5 20.5v32" fill="none" stroke="#A8F7EC" strokeWidth="2.8" />
        <rect x="8" y="9" width="9" height="29" rx="3" fill="#128A80" /><rect x="9.8" y="11" width="2.8" height="25" rx="1.4" fill="#7FE8DA" />
        <rect x="22" y="44" width="29" height="9" rx="3" fill="#128A80" /><rect x="24" y="45.8" width="25" height="2.8" rx="1.4" fill="#7FE8DA" />
        <path d="M49 6c0 0-9 10-9 16a9 9 0 0 0 18 0C58 16 49 6 49 6z" fill="url(#gp-pipes-a)" />
        {shine("M45 22a4.2 4.2 0 0 0 3 4.2", 2.2)}
      </>
    ),
  },
  flappy: {
    bg: ["#D6F5FF", "#2A9BE8"],
    defs: R("gp-flappy-a", "#FFF08A", "#F59A0A"),
    back: <path d="M0 50a6 6 0 0 1 11-3 7 7 0 0 1 11 5H0zM44 14a5 5 0 0 1 9-2 6 6 0 0 1 9 4H44z" fill="#FFFFFF" opacity=".9" />,
    art: (
      <g transform="translate(30 33) scale(1.42) translate(-24 -34)">
        <path d="M9 30c-6-1.5-9 3-9 7.5 4.5 1.5 10 0 14-3.5z" fill="#FFF6C4" />
        <ellipse cx="24" cy="34" rx="15" ry="12.5" fill="url(#gp-flappy-a)" />
        <path d="M11 41c4.5 4.5 13 5.5 19 3-5.5-1-10-4-13-8.5z" fill="#E8870A" />
        <ellipse cx="18" cy="27" rx="5.5" ry="2.6" fill="#FFFFFF" opacity=".6" transform="rotate(-25 18 27)" />
        {eye(29.5, 29.5, 5.6)}
        <path d="M23.5 23l11 3" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M36.5 32.5l11 3.5-11 4.5z" fill="#FF6A2B" /><path d="M37 36.5l7 .5" stroke="#B83A00" strokeWidth="1.1" />
      </g>
    ),
  },
  slide: {
    bg: ["#D6DDF5", "#4A5590"],
    art: (
      <g transform="rotate(-7 32 32)">
        <rect x="3" y="8" width="58" height="56" rx="10" fill="#1F2650" />
        <rect x="3" y="3" width="58" height="56" rx="10" fill="#3A4680" />
        {[[0, 0, "#FF5A5A", "#C4212B", 1], [1, 0, "#FFC02E", "#D98E00", 2], [2, 0, "#8FDB5C", "#4FA02A", 3], [0, 1, "#3ED6C6", "#1C9488", 4], [2, 1, "#5CD0F5", "#1E90C0", 5], [0, 2, "#A970F0", "#6B33C4", 6], [1, 2, "#FF9BCF", "#D9609F", 7]].map(([cx, cy, top, side, n]) => (
          <g key={n}>{cell(7.5 + cx * 17, 6.5 + cy * 17, 15, top, side, n)}<text x={15 + cx * 17} y={18 + cy * 17} fontSize="10.5" fill="#FFFFFF" {...F}>{n}</text></g>
        ))}
        <path d="M43 48h12M50 43.5l5 4.5-5 4.5" fill="none" stroke="#FFD23F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
  },
  blocks: {
    bg: ["#8A70F0", "#1B1250"],
    art: (
      <>
        <g transform="rotate(-14 12 50)">{cell(4, 42, 15, "#FFD23F", "#C98600", "y")}</g>
        <g transform="rotate(14 50 50)">{cell(42, 42, 15, "#4CC9F0", "#1E86B0", "c")}</g>
        <g transform="rotate(9 32 24)">
          {cell(8, 6, 16, "#D29BFF", "#7A3FD6", 1)}{cell(24, 6, 16, "#D29BFF", "#7A3FD6", 2)}{cell(40, 6, 16, "#D29BFF", "#7A3FD6", 3)}{cell(24, 22, 16, "#D29BFF", "#7A3FD6", 4)}
        </g>
      </>
    ),
  },
  racer: {
    bg: ["#C8F59A", "#3F9A30"],
    defs: R("gp-racer-a", "#FFF59A", "#F5B800"),
    back: <><rect y="44" width="64" height="20" fill="#474B60" /><path d="M2 54h10M20 54h10M38 54h10M56 54h10" stroke="#FFFFFF" strokeWidth="2.6" opacity=".8" /></>,
    art: (
      <g transform="translate(32 33) scale(1.55) translate(-24 -40)">
        <path d="M19.5 29l2-6 3 4.5 3-4.5 2 6.5z" fill="#FF5A2B" />
        <path d="M11 44c0-10 5.5-16 13-16s13 6 13 16c0 6.5-5.5 10-13 10s-13-3.5-13-10z" fill="url(#gp-racer-a)" />
        <ellipse cx="18.5" cy="34.5" rx="4.5" ry="2.3" fill="#FFFFFF" opacity=".65" transform="rotate(-25 18.5 34.5)" />
        <circle cx="19" cy="40.5" r="3.8" fill="#FFFFFF" /><circle cx="19.6" cy="40.8" r="2.2" fill={INK} /><circle cx="20.4" cy="40" r=".7" fill="#FFFFFF" />
        <circle cx="29" cy="40.5" r="3.8" fill="#FFFFFF" /><circle cx="29.6" cy="40.8" r="2.2" fill={INK} /><circle cx="30.4" cy="40" r=".7" fill="#FFFFFF" />
        <path d="M20.5 45.5l3.5 3.5 3.5-3.5z" fill="#FF6A2B" />
        <ellipse cx="14.5" cy="46" rx="1.9" ry="1.2" fill="#FF9BB0" /><ellipse cx="33.5" cy="46" rx="1.9" ry="1.2" fill="#FF9BB0" />
      </g>
    ),
  },
  storm: {
    bg: ["#9A7BFF", "#150C40"],
    defs: <>{V("gp-storm-a", "#C9BCFF", "#5A3FD1")}{V("gp-storm-b", "#FFFBC4", "#FFC400")}</>,
    art: (
      <>
        <path d="M13 36a11 11 0 0 1 1-22 15 15 0 0 1 28-3 12 12 0 0 1 9 25z" fill="url(#gp-storm-a)" />
        {shine("M11 23a7 7 0 0 1 6-5M24 11a10 10 0 0 1 8-3", 2.4)}
        <path d="M40 22L20 45h12l-6 17 22-26H36l8-14z" fill="#D98E00" transform="translate(0 3)" />
        <path d="M40 22L20 45h12l-6 17 22-26H36l8-14z" fill="url(#gp-storm-b)" />
        <path d="M37 26L27 40" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity=".9" />
      </>
    ),
  },
  maze: {
    bg: ["#A8F7EC", "#0F7F7A"],
    defs: <>{V("gp-maze-a", "#4FE0D0", "#1FA89C")}{R("gp-maze-b", "#FFA08A", "#D61F2C")}</>,
    art: (
      <g transform="rotate(-6 32 32)">
        <rect x="4" y="9" width="56" height="54" rx="9" fill="#0A5A56" />
        <rect x="4" y="3" width="56" height="54" rx="9" fill="url(#gp-maze-a)" />
        <path d="M11 10h42v40H11zM11 23h15M35 10v15h9M22 34v16M32 36h12v14" fill="none" stroke="#0E7A72" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 2.2)" />
        <path d="M11 10h42v40H11zM11 23h15M35 10v15h9M22 34v16M32 36h12v14" fill="none" stroke="#FFFFFF" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="19" cy="17" r="4.6" fill="url(#gp-maze-b)" /><circle cx="17.6" cy="15.6" r="1.4" fill="#FFFFFF" />
        <path d="M47 32l-7 3 7 3z" fill="#FFD23F" /><path d="M47 31v12" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      </g>
    ),
  },
  typing: {
    bg: ["#C4E8FF", "#1F6FC4"],
    defs: V("gp-typing-a", "#FFFFFF", "#DCE6FA"),
    art: (
      <>
        <g transform="rotate(13 46 18)">{cell(34, 4, 24, "#FFE066", "#D9A400", "s")}<text x="46" y="22.5" fontSize="17" fill="#8A4E00" {...F}>S</text></g>
        <g transform="rotate(-9 26 38)">
          <rect x="4" y="24" width="44" height="38" rx="10" fill="#8FA4D4" />
          <rect x="4" y="15" width="44" height="40" rx="10" fill="url(#gp-typing-a)" />
          <rect x="9.5" y="18" width="33" height="30" rx="7" fill="#FFFFFF" />
          <text x="26" y="45" fontSize="29" fill="#2A5FC0" {...F}>A</text>
        </g>
      </>
    ),
  },
  runner: {
    bg: ["#FFD08A", "#E0405E"],
    defs: <>{V("gp-runner-a", "#FF7A6B", "#C81E32")}{V("gp-runner-b", "#D6F4FF", "#6BC4F0")}</>,
    back: <><path d="M20 52L8 66M44 52l12 14" stroke="#F2E6DA" strokeWidth="3.6" /><path d="M10 60h44" stroke="#8A5A4A" strokeWidth="3" /></>,
    art: (
      <>
        <rect x="12" y="10" width="40" height="46" rx="10" fill="#8F1222" />
        <rect x="12" y="5" width="40" height="46" rx="10" fill="url(#gp-runner-a)" />
        <rect x="16.5" y="8" width="31" height="4.5" rx="2.2" fill="#FFFFFF" opacity=".55" />
        <rect x="17" y="15" width="30" height="15" rx="4.5" fill="#3A1A30" /><rect x="19" y="17" width="26" height="11" rx="3" fill="url(#gp-runner-b)" />
        <path d="M22 26l6-7M28 26l3-3.5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" opacity=".8" />
        <rect x="12" y="41" width="40" height="6" fill="#FFD23F" />
        <circle cx="21" cy="35.5" r="4" fill="#FFF3A8" /><circle cx="43" cy="35.5" r="4" fill="#FFF3A8" /><circle cx="20" cy="34.5" r="1.3" fill="#FFFFFF" /><circle cx="42" cy="34.5" r="1.3" fill="#FFFFFF" />
        <rect x="27" y="33.5" width="10" height="4" rx="2" fill="#8F1222" />
      </>
    ),
  },
  speedway: {
    bg: ["#C8F59A", "#3F8F30"],
    defs: V("gp-speedway-a", "#FFF08A", "#F5A000"),
    back: (
      <>
        <path d="M-10 70C-6 30 24 4 74 2" fill="none" stroke="#3A3E52" strokeWidth="38" />
        <path d="M-10 70C-6 30 24 4 74 2" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeDasharray="5 6" opacity=".7" />
        <circle cx="9" cy="52" r="7" fill="#FFFFFF" opacity=".85" /><circle cx="18" cy="59" r="5" fill="#FFFFFF" opacity=".7" />
      </>
    ),
    art: (
      <g transform="translate(35 31) rotate(-38) scale(1.22) translate(-34 -33)">
        <rect x="19" y="17.5" width="9" height="6" rx="2.2" fill="#2B2440" /><rect x="41" y="17.5" width="9" height="6" rx="2.2" fill="#2B2440" /><rect x="19" y="42.5" width="9" height="6" rx="2.2" fill="#2B2440" /><rect x="41" y="42.5" width="9" height="6" rx="2.2" fill="#2B2440" />
        <rect x="15" y="22" width="38" height="22" rx="8.5" fill="url(#gp-speedway-a)" />
        <rect x="18.5" y="24" width="31" height="4" rx="2" fill="#FFFFFF" opacity=".6" />
        <rect x="26" y="26" width="14" height="14" rx="3.5" fill="#2A3558" /><rect x="28" y="28" width="10" height="10" rx="2.2" fill="#8FE0FF" /><path d="M29.5 30h5" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" />
        <rect x="11.5" y="25" width="5" height="16" rx="2" fill="#E5383B" /><path d="M43 33h8" stroke="#E5383B" strokeWidth="3.6" />
      </g>
    ),
  },
  piano: {
    bg: ["#FFD6EA", "#E0408F"],
    art: (
      <g transform="rotate(-9 32 32)">
        <rect x="4" y="19" width="56" height="40" rx="7" fill="#9A9AB8" />
        <rect x="4" y="11" width="56" height="40" rx="7" fill="#FFFFFF" />
        <path d="M18 11v40M32 11v40M46 11v40" stroke="#C9C4DC" strokeWidth="1.8" />
        <rect x="33" y="33" width="12" height="18" fill="#7FE0FF" />
        <rect x="13" y="11" width="10" height="24" rx="2.5" fill="#2B1F45" /><rect x="27" y="11" width="10" height="24" rx="2.5" fill="#2B1F45" /><rect x="41" y="11" width="10" height="24" rx="2.5" fill="#2B1F45" />
        <rect x="15" y="13" width="2.4" height="17" rx="1.2" fill="#6E6390" /><rect x="29" y="13" width="2.4" height="17" rx="1.2" fill="#6E6390" /><rect x="43" y="13" width="2.4" height="17" rx="1.2" fill="#6E6390" />
      </g>
    ),
  },
  kitchen: {
    bg: ["#FFF0A8", "#F07A1E"],
    defs: <>{V("gp-kitchen-a", "#7A7296", "#2A2640")}{R("gp-kitchen-b", "#FFE98A", "#FF9D0A")}{V("gp-kitchen-c", "#FFE066", "#FF3D1F")}</>,
    back: <path d="M16 64c-5-7 2-10 0-17 6 2.5 8 7 7 11.5 3.5-2.5 3.5-7 2.5-10.5 7 4.5 9 11.5 4.5 16zM36 64c-2.5-4.5 1-7 0-11.5 4.5 2.5 6.5 7 4.5 11.5z" fill="url(#gp-kitchen-c)" />,
    art: (
      <>
        <rect x="42" y="38.5" width="24" height="7" rx="3.5" fill="#8A5A3C" />
        <rect x="2" y="36" width="46" height="14" rx="7" fill="url(#gp-kitchen-a)" />
        <rect x="4.5" y="34.5" width="41" height="6.5" rx="3.2" fill="#8E86AA" />
        <rect x="8" y="35.8" width="24" height="2" rx="1" fill="#FFFFFF" opacity=".5" />
        <g transform="rotate(-10 24 20)">
          <path d="M19 8c-9-1-15 5.5-14 13s10 11.5 17.5 8.5 15 1 19.5-5.5 1-15-7.5-15c-3.5 0-5-1-8.5-1s-4.5 0-7 0z" fill="#FFFFFF" />
          <circle cx="24" cy="18.5" r="8" fill="url(#gp-kitchen-b)" /><ellipse cx="21.5" cy="15.5" rx="2.8" ry="1.7" fill="#FFFFFF" opacity=".85" />
        </g>
      </>
    ),
  },
  moving: {
    bg: ["#B8F7EC", "#1C8F84"],
    defs: V("gp-moving-a", "#EDB670", "#B5763A"),
    art: (
      <>
        <path d="M32 26c-10-3-14-11-12-17 8 0 12 6 12 17zM32 26c0-12 5-18 13-18 0 8-3 15-13 18zM32 26c-3-9-1-17 1-22 5 5 4 14-1 22z" fill="#3FB453" />
        <path d="M32 26c-7-3-9-8-9-13M32 26c1-8 4-12 9-14" fill="none" stroke="#8FE68A" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="9" y="27" width="46" height="33" rx="3.5" fill="url(#gp-moving-a)" />
        <rect x="27.5" y="27" width="9" height="33" fill="#F8E4BC" />
        <path d="M9 27L2 16h21l5 11zM55 27l7-11H41l-5 11z" fill="#F4CC92" />
        <path d="M16 51v-9M13 45l3-3 3 3M48 51v-9M45 45l3-3 3 3" stroke="#6B4423" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="11" y="29" width="14" height="2.6" rx="1.3" fill="#FFFFFF" opacity=".4" />
      </>
    ),
  },
  sunshard: {
    bg: ["#C4ECFF", "#2A7FE0"],
    back: <path d="M10 14l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5zM55 40l1.2 3.2 3.2 1.2-3.2 1.2-1.2 3.2-1.2-3.2-3.2-1.2 3.2-1.2z" fill="#FFFFFF" />,
    art: (
      <g transform="rotate(10 32 32)">
        <path d="M32 3l18 25-18 33-18-33z" fill="#FFB000" />
        <path d="M32 3L14 28h18z" fill="#FFF8C4" />
        <path d="M32 3l18 25H32z" fill="#FFE066" />
        <path d="M14 28l18 33V28z" fill="#FFC21F" />
        <path d="M50 28L32 61V28z" fill="#F08A00" />
        <path d="M24 22l6-9" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    ),
  },
  sneak: {
    bg: ["#5A70D6", "#0A0E2E"],
    defs: V("gp-sneak-a", "#FFFFFF", "#C4CCE8"),
    back: <><path d="M32 17L74 0v34z" fill="#FFE27A" opacity=".9" /><path d="M32 17L-10 6v22z" fill="#FFE27A" opacity=".55" /></>,
    art: (
      <>
        <path d="M19 64l5-38h16l5 38z" fill="url(#gp-sneak-a)" />
        <path d="M22.8 35h18.4l1.2 9H21.6zM20.4 53h23.2l1.4 11H19z" fill="#E5383B" />
        <rect x="18" y="23" width="28" height="5" rx="2.2" fill="#4A4466" />
        <rect x="23" y="11" width="18" height="12" rx="2" fill="#FFF3A8" /><path d="M32 11v12" stroke="#E0B84A" strokeWidth="1.8" />
        <path d="M19 12L32 1l13 11z" fill="#E5383B" />
        <path d="M24 10l7-6" stroke="#FF9A9A" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  emberfall: {
    bg: ["#FFB05A", "#5A1030"],
    defs: <>{V("gp-emberfall-a", "#FFE066", "#FF3D1F")}{V("gp-emberfall-b", "#FFFFFF", "#AEBBD6")}</>,
    art: (
      <>
        <g transform="translate(32 40) scale(1.32) translate(-32 -40)">
          <path d="M32 59c-11 0-15-8.5-11-17 2 3 4.5 3 5.5 1-2-8.5 4.5-14 5.5-21.5 6.5 6.5 13 13 11 23.5 2-1 3-3 3-5.5 4.5 8.5 0 19.5-14 19.5z" fill="url(#gp-emberfall-a)" />
          <path d="M32 59c-6.5 0-8.5-5.5-6.5-11 2 2 3.5 1 3.5-1 0-4.5 3-6.5 4-11 4.5 5.5 7.5 9 5.5 15.5 3 4-.5 7.5-6.5 7.5z" fill="#FFF6B8" />
        </g>
        <g transform="rotate(32 32 32)">
          <path d="M28.5 9L32 0l3.5 9v31h-7z" fill="url(#gp-emberfall-b)" />
          <path d="M32 2v38" stroke="#8A97B8" strokeWidth="1.2" /><path d="M30 10v24" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="21" y="39" width="22" height="6" rx="2.5" fill="#FFD23F" /><rect x="23" y="40" width="18" height="1.8" rx=".9" fill="#FFF6B8" />
          <rect x="29.5" y="45" width="5" height="10" rx="1.5" fill="#8A4A2A" /><circle cx="32" cy="57.5" r="3.4" fill="#FFD23F" />
        </g>
      </>
    ),
  },
  hollow: {
    bg: ["#9A7BE0", "#140A30"],
    defs: R("gp-hollow-a", "#FFFBEA", "#E3C98A"),
    art: (
      <g transform="rotate(-8 32 32)">
        <circle cx="32" cy="35" r="25" fill="#5A3A1E" />
        <circle cx="32" cy="31" r="25" fill="#E0A848" />
        <path d="M12 24a21.5 21.5 0 0 1 14-13.5" fill="none" stroke="#FFE9A8" strokeWidth="2.8" strokeLinecap="round" />
        <circle cx="32" cy="31" r="19.5" fill="url(#gp-hollow-a)" />
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => <path key={a} d="M32 14.5v3.5" stroke="#6B4E2E" strokeWidth={a % 90 ? 1.4 : 2.8} strokeLinecap="round" transform={`rotate(${a} 32 31)`} />)}
        <path d="M32 31V17" stroke={INK} strokeWidth="3.2" strokeLinecap="round" /><path d="M32 31l-4.5-10" stroke={INK} strokeWidth="3.8" strokeLinecap="round" />
        <circle cx="32" cy="31" r="3" fill="#C4283A" />
      </g>
    ),
  },
};

export const hasPoster = (slug) => !!POSTERS[slug];
