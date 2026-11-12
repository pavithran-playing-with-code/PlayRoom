// src/pages/IconLab.jsx
// TEMPORARY — delete once an icon style is chosen (with its route in App.js
// and the 🎨 link in Navbar.jsx). Icon styles to pick from, each with its OWN
// drawings and colours, shown on the same eight games so they can be
// compared. The chosen style then gets drawn for every game.
import React from "react";
import { GAME_MAP } from "../components/games/registry";
import GamePoster from "../components/games/GamePoster";

const SAMPLE = ["dino", "flappy", "storm", "sneak", "emberfall", "blocks", "speedway", "memory"];
const INK = "#1B1230";

// one set of toy colours, each as a top-to-bottom gradient (v) and a round one (c)
const TONES = {
  green: ["#A6F7A0", "#2A9E48"], yellow: ["#FFF59A", "#F5A800"], orange: ["#FFC27A", "#F0601E"], red: ["#FF9A8A", "#C81E32"],
  purple: ["#DCC2FF", "#6B3FD6"], blue: ["#A8E4FF", "#1E7FD6"], white: ["#FFFFFF", "#C6CFE8"], grey: ["#A9A5C4", "#3A3655"],
  brown: ["#E0AC72", "#8A5A2E"], pink: ["#FFC2DE", "#D6408A"], teal: ["#9AF5E8", "#12998B"], skin: ["#FFE3C8", "#F0B088"],
};
const v = (n) => `url(#il-v-${n})`;
const c = (n) => `url(#il-c-${n})`;
const Defs = () => (
  <defs>
    {Object.entries(TONES).map(([n, [a, b]]) => (
      <React.Fragment key={n}>
        <linearGradient id={`il-v-${n}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
        <radialGradient id={`il-c-${n}`} cx="0.34" cy="0.26" r="0.9"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></radialGradient>
      </React.Fragment>
    ))}
    {/* the thick dark outline round a whole drawing, heavier underneath */}
    <filter id="il-ol" x="-25%" y="-25%" width="150%" height="160%" colorInterpolationFilters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="fat" />
      <feOffset in="fat" dy="2.2" result="low" />
      <feMerge result="shape"><feMergeNode in="fat" /><feMergeNode in="low" /></feMerge>
      <feFlood floodColor={INK} result="ink" />
      <feComposite in="ink" in2="shape" operator="in" result="line" />
      <feMerge><feMergeNode in="line" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    {/* a soft shadow, for the clay */}
    <filter id="il-soft" x="-30%" y="-30%" width="160%" height="180%" colorInterpolationFilters="sRGB">
      <feDropShadow dx="0" dy="3" stdDeviation="2.2" floodColor="#2A1850" floodOpacity="0.38" />
    </filter>
  </defs>
);
const Svg = ({ children }) => (
  <svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: "block", width: "100%", height: "100%" }}><Defs />{children}</svg>
);
const eye = (x, y, r, dx = 0.28) => (
  <>
    <circle cx={x} cy={y} r={r} fill="#FFFFFF" />
    <circle cx={x + r * dx} cy={y + r * 0.12} r={r * 0.52} fill={INK} />
    <circle cx={x + r * (dx + 0.2)} cy={y - r * 0.2} r={r * 0.2} fill="#FFFFFF" />
  </>
);
const brow = (d) => <path d={d} stroke={INK} strokeWidth="3.6" strokeLinecap="round" fill="none" />;
const gloss = (d, w = 2.8) => <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={w} strokeLinecap="round" opacity=".8" />;
const rays = (cx, cy) => [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => <path key={a} d={`M${cx} ${cy}l-6-60h12z`} fill="#FFFFFF" opacity=".12" transform={`rotate(${a} ${cx} ${cy})`} />);

/* ───────────── 2 · FACES: the game's character, up close, shouting ───────────── */
const FACES = {
  dino: ["#FFB04A", "#E0521E", (
    <>
      <path d="M12 24l-7-10 11 3zM20 13l-2-11 10 6zM33 9l3-9 7 9z" fill="#1F8A3E" />
      <path d="M2 70V36C2 18 15 8 31 8h15c10 0 17 7 17 17v9c0 5-3 8-8 8H44v28z" fill={v("green")} />
      <path d="M27 41h30c0 8-5 13-13 13H27z" fill="#5A1020" />
      <ellipse cx="39" cy="51.5" rx="7" ry="2.6" fill="#FF6B8A" />
      <path d="M31 41l3.5 6 3.5-6zM40 41l3.5 6 3.5-6zM49 41l3 5 3-5z" fill="#FFFFFF" />
      {eye(36, 24, 8.5)}{brow("M26 13l18 6")}
      <circle cx="56.5" cy="23" r="1.8" fill="#14602A" />
      {gloss("M8 34c1-9 6-15 13-18", 3.2)}
    </>
  )],
  flappy: ["#7FD4FF", "#1E7FD6", (
    <>
      <path d="M20 14l2-11 6 8 5-10 4 12z" fill={v("orange")} />
      <circle cx="27" cy="38" r="25" fill={c("yellow")} />
      <path d="M4 46c6 6 16 8 24 5-7-2-12-6-15-12z" fill="#E8870A" />
      <path d="M43 44l17 3-17 8z" fill="#C4420A" />
      <path d="M42 35l22 6-22 7z" fill={v("orange")} />
      {eye(34, 28, 9.5)}{brow("M23 17l19 6")}
      {gloss("M9 30c2-8 7-13 13-15", 3.2)}
    </>
  )],
  storm: ["#6B55D6", "#150C40", (
    <>
      <path d="M22 48l-7 12h6l-3 9 10-13h-6l4-8zM44 48l-6 11h6l-3 9 10-13h-6l3-7z" fill={v("yellow")} />
      <path d="M11 50A14 14 0 0 1 10 22a17 17 0 0 1 32-5A14 14 0 0 1 54 50z" fill={v("purple")} />
      {eye(23, 31, 6.5, 0.2)}{eye(41, 31, 6.5, 0.1)}
      {brow("M15 22l12 5")}{brow("M49 22l-12 5")}
      <rect x="23" y="40" width="18" height="7" rx="2.2" fill="#FFFFFF" /><path d="M29 40v7M35 40v7" stroke={INK} strokeWidth="1.4" />
      {gloss("M10 30a8 8 0 0 1 6-6M24 13a11 11 0 0 1 9-4")}
    </>
  )],
  sneak: ["#3A4AA8", "#0A0E2E", (
    <>
      <path d="M2 70V40C2 20 15 6 32 6s30 14 30 34v30z" fill={v("grey")} />
      <path d="M32 6c-9 0-17 4-22 11 6-3 14-5 22-5s16 2 22 5C49 10 41 6 32 6z" fill="#C4C0DC" opacity=".6" />
      <rect x="9" y="24" width="46" height="19" rx="9.5" fill={v("skin")} />
      {eye(23, 33.5, 6, 0.42)}{eye(41, 33.5, 6, 0.42)}
      {brow("M15 26l12 2")}{brow("M49 26l-12 2")}
      <path d="M2 52c10 6 20 8 30 8s20-2 30-8v18H2z" fill="#2B2745" />
    </>
  )],
  emberfall: ["#FF7A3D", "#6B0F1E", (
    <>
      <path d="M32 9c-4-9 6-12 15-8-4 3-5 8-3 14z" fill={v("red")} />
      <path d="M6 70V34C6 17 18 6 32 6s26 11 26 28v36z" fill={v("white")} />
      <path d="M11 28h42v11H11z" fill="#1A1030" />
      <circle cx="22" cy="33.5" r="3.2" fill="#FFB02E" /><circle cx="42" cy="33.5" r="3.2" fill="#FFB02E" />
      <path d="M28 22h8v38h-8z" fill={v("grey")} />
      <path d="M12 46h12v24H12zM40 46h12v24H40z" fill="#1A1030" opacity=".85" />
      <rect x="6" y="24" width="52" height="4" fill="#FFD23F" />
      {gloss("M13 22c2-6 6-10 12-12", 3)}
    </>
  )],
  blocks: ["#8A70F0", "#1B1250", (
    <>
      <rect x="6" y="14" width="52" height="50" rx="12" fill="#5A2FB8" />
      <rect x="6" y="5" width="52" height="50" rx="12" fill={v("purple")} />
      <rect x="13" y="9" width="38" height="6" rx="3" fill="#FFFFFF" opacity=".6" />
      {eye(22, 26, 7.5, 0.15)}{eye(42, 26, 7.5, 0.05)}
      {brow("M13 16l14 4")}{brow("M51 16l-14 4")}
      <path d="M18 38h28c0 8-6 12-14 12s-14-4-14-12z" fill="#3A1030" />
      <path d="M21 38h22v4H21z" fill="#FFFFFF" />
      <ellipse cx="32" cy="47" rx="6" ry="2.4" fill="#FF6B8A" />
    </>
  )],
  speedway: ["#8FE86B", "#1F7A30", (
    <>
      <path d="M4 44C4 22 18 6 36 6c16 0 26 11 26 27v15c0 6-4 10-10 10H16C9 58 4 52 4 44z" fill={v("red")} />
      <path d="M12 26C17 15 26 10 37 10" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <path d="M28 23h36v15H35c-5 0-7-3-7-7z" fill="#1A1030" />
      <path d="M31 25.5h33v10H36c-3 0-5-2-5-4.5z" fill={c("blue")} />
      <path d="M36 28l8 0M48 28l4 0" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      <path d="M40 46h18M40 51h14" stroke="#7A0F1E" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="4" y="40" width="20" height="5" fill="#FFD23F" />
    </>
  )],
  memory: ["#FF9AC0", "#B01F60", (
    <g transform="rotate(-7 32 32)">
      <rect x="9" y="12" width="46" height="56" rx="10" fill="#B8ACD9" />
      <rect x="9" y="4" width="46" height="56" rx="10" fill={v("white")} />
      <path d="M0-9l2.7 5.8 6.3.8-4.6 4.3 1.2 6.3L0 4.1l-5.6 3.1 1.2-6.3-4.6-4.3 6.3-.8z" fill={v("yellow")} transform="translate(32 15)" />
      {eye(23, 32, 6.5, 0.15)}{eye(41, 32, 6.5, 0.05)}
      <path d="M21 43c3 6 8 8 11 8s8-2 11-8z" fill="#3A1030" /><path d="M24 43h16v3H24z" fill="#FFFFFF" />
      <ellipse cx="15" cy="40" rx="3" ry="2" fill="#FF8FA8" /><ellipse cx="49" cy="40" rx="3" ry="2" fill="#FF8FA8" />
    </g>
  )],
};
const faces = (slug) => {
  const [a, b, art] = FACES[slug];
  return (
    <Svg>
      <radialGradient id={`il-fb-${slug}`} cx="0.5" cy="0.4" r="0.75"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></radialGradient>
      <rect width="64" height="64" fill={`url(#il-fb-${slug})`} />
      {rays(32, 30)}
      <g filter="url(#il-ol)">{art}</g>
    </Svg>
  );
};

/* ───────────── 3 · CLAY: soft, round, no outline — like modelling clay ───────────── */
const hi = (x, y, rx, ry, r = -30) => <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#FFFFFF" opacity=".55" transform={`rotate(${r} ${x} ${y})`} />;
const CLAY = {
  dino: ["#FFE6B8", (
    <>
      <path d="M17 47C8 47 5 41 5 36c6 2 10 3 15 4z" fill={c("green")} />
      <ellipse cx="24" cy="57" rx="6.5" ry="3.5" fill="#1F8A3E" /><ellipse cx="39" cy="57" rx="6.5" ry="3.5" fill="#1F8A3E" />
      <ellipse cx="30" cy="43" rx="16" ry="15" fill={c("green")} />
      <ellipse cx="32" cy="47" rx="9" ry="9" fill="#EFFFD6" />
      <circle cx="24" cy="23" r="3.4" fill={c("orange")} /><circle cx="19" cy="31" r="3.4" fill={c("orange")} /><circle cx="16" cy="40" r="3" fill={c("orange")} />
      <circle cx="40" cy="24" r="13.5" fill={c("green")} /><ellipse cx="51" cy="28" rx="8.5" ry="6.5" fill={c("green")} />
      {hi(35, 16, 5, 2.6)}
      <circle cx="44" cy="21" r="2.6" fill={INK} /><circle cx="44.8" cy="20.2" r=".9" fill="#FFFFFF" />
      <circle cx="56" cy="26" r="1" fill="#1F8A3E" /><path d="M47 31q4 2.5 8 0" fill="none" stroke="#1F8A3E" strokeWidth="1.5" strokeLinecap="round" />
    </>
  )],
  flappy: ["#CDEFFF", (
    <>
      <ellipse cx="14" cy="55" rx="12" ry="6" fill="#FFFFFF" /><ellipse cx="50" cy="57" rx="14" ry="6" fill="#FFFFFF" />
      <ellipse cx="50" cy="37" rx="8" ry="5" fill={c("orange")} />
      <circle cx="30" cy="33" r="19" fill={c("yellow")} />
      <ellipse cx="18" cy="38" rx="9" ry="6.5" fill={c("orange")} />
      {hi(22, 21, 6.5, 3)}
      <circle cx="38" cy="27" r="5.8" fill="#FFFFFF" /><circle cx="39.6" cy="27.6" r="2.8" fill={INK} /><circle cx="40.4" cy="26.6" r=".9" fill="#FFFFFF" />
      <circle cx="27" cy="13" r="3" fill={c("orange")} /><circle cx="33" cy="12" r="3.4" fill={c("orange")} />
    </>
  )],
  storm: ["#D9D0FF", (
    <>
      <path d="M36 36L23 52h9l-5 11 16-17h-9l6-10z" fill={v("yellow")} stroke={v("yellow")} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="19" cy="31" r="11" fill={c("purple")} /><circle cx="46" cy="31" r="10" fill={c("purple")} /><circle cx="33" cy="24" r="15" fill={c("purple")} /><rect x="12" y="29" width="42" height="13" rx="6.5" fill={c("purple")} />
      {hi(26, 14, 6, 2.8)}{hi(13, 25, 3.5, 1.8)}
    </>
  )],
  sneak: ["#3F4FA8", (
    <>
      <path d="M32 16L68 4v24z" fill="#FFF3A8" opacity=".7" />
      <ellipse cx="32" cy="58" rx="24" ry="6.5" fill={c("teal")} />
      <rect x="22" y="43" width="20" height="14" rx="5" fill={c("white")} />
      <rect x="23.5" y="32" width="17" height="13" rx="5" fill={c("red")} />
      <rect x="25" y="21" width="14" height="13" rx="5" fill={c("white")} />
      <circle cx="32" cy="15" r="7" fill={c("yellow")} />
      <path d="M24 9c2-5 5-7 8-7s6 2 8 7z" fill={c("red")} />
      {hi(27, 25, 3, 1.5)}{hi(26, 47, 3.5, 1.6)}
      <rect x="29.5" y="49" width="5" height="8" rx="2.5" fill="#57506E" />
    </>
  )],
  emberfall: ["#FFE1C4", (
    <>
      <rect x="10" y="50" width="44" height="8" rx="4" fill={c("brown")} transform="rotate(-9 32 54)" />
      <rect x="10" y="50" width="44" height="8" rx="4" fill={c("brown")} transform="rotate(9 32 54)" />
      <path d="M32 5c4 12 18 17 18 31a18 18 0 0 1-36 0c0-8 4-12 8-16 0 6 2 9 5 9 0-9 3-15 5-24z" fill={c("orange")} />
      <path d="M32 22c3 8 11 11 11 20a11 11 0 0 1-22 0c0-5 2-8 5-10 0 4 1 5 3 5 0-5 2-10 3-15z" fill={c("yellow")} />
      <ellipse cx="32" cy="46" rx="5" ry="6" fill="#FFFBEA" />
      {hi(22, 30, 3, 1.5, -60)}
    </>
  )],
  blocks: ["#F0DBFF", (
    <>
      {[[8, 10], [24.5, 10], [41, 10], [24.5, 26.5]].map(([x, y]) => <g key={`${x}-${y}`}><rect x={x} y={y} width="15" height="15" rx="4.5" fill={c("purple")} />{hi(x + 5, y + 4, 3.2, 1.5)}</g>)}
      <rect x="8" y="43" width="15" height="15" rx="4.5" fill={c("teal")} />{hi(13, 47, 3.2, 1.5)}
      <rect x="41" y="43" width="15" height="15" rx="4.5" fill={c("yellow")} />{hi(46, 47, 3.2, 1.5)}
      <rect x="24.5" y="43" width="15" height="15" rx="4.5" fill={c("pink")} />{hi(29.5, 47, 3.2, 1.5)}
    </>
  )],
  speedway: ["#FFD6D0", (
    <>
      <rect x="18" y="15" width="28" height="22" rx="10" fill={c("red")} />
      <rect x="23" y="19" width="18" height="11" rx="5" fill={c("blue")} />
      <rect x="5" y="29" width="54" height="19" rx="9.5" fill={c("red")} />
      {hi(16, 33, 6, 2, 0)}
      <circle cx="18" cy="49" r="8.5" fill={c("grey")} /><circle cx="18" cy="49" r="3.4" fill={c("white")} />
      <circle cx="46" cy="49" r="8.5" fill={c("grey")} /><circle cx="46" cy="49" r="3.4" fill={c("white")} />
      <circle cx="56" cy="37" r="2.6" fill={c("yellow")} />
    </>
  )],
  memory: ["#FFF0C4", (
    <>
      <rect x="8" y="13" width="28" height="40" rx="7" fill={c("purple")} transform="rotate(-13 22 33)" />
      <rect x="26" y="10" width="30" height="44" rx="8" fill={c("white")} transform="rotate(8 41 32)" />
      <g transform="rotate(8 41 32)">
        <path d="M41 42c-9-6.5-12-10.5-12-15a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 4.5-3 8.5-12 15z" fill={c("pink")} />
        {hi(35, 25, 2.6, 1.4)}
      </g>
    </>
  )],
};
const clay = (slug) => (
  <Svg>
    <rect width="64" height="64" fill={CLAY[slug][0]} />
    <g filter="url(#il-soft)">{CLAY[slug][1]}</g>
  </Svg>
);

/* ───────────── 4 · ISOMETRIC: a tiny world built of blocks on a tile ───────────── */
// a box seen from the corner: (x, y) is the middle of its top's near edge… its top is a diamond `s` wide each way, `h` tall
const box = (x, y, s, h, top, left, right, key) => (
  <g key={key}>
    <path d={`M${x - s} ${y - s / 2}L${x} ${y}V${y + h}L${x - s} ${y + h - s / 2}z`} fill={left} />
    <path d={`M${x + s} ${y - s / 2}L${x} ${y}V${y + h}L${x + s} ${y + h - s / 2}z`} fill={right} />
    <path d={`M${x} ${y - s}L${x + s} ${y - s / 2}L${x} ${y}L${x - s} ${y - s / 2}z`} fill={top} />
  </g>
);
const G3 = ["#8FF08F", "#3FB453", "#1F8A3E"], R3 = ["#FF9A8A", "#E5383B", "#A81826"], Y3 = ["#FFF08A", "#FFC62E", "#D99400"], W3 = ["#FFFFFF", "#DDE3F5", "#AEB8D6"];
const P3 = ["#E0C2FF", "#A970F0", "#6B33C4"], B3 = ["#B8ECFF", "#4CC9F0", "#1E86B0"], K3 = ["#6E6A8C", "#3A3655", "#221F38"], N3 = ["#E0AC72", "#B5763A", "#7A4A1E"];
const tile = (t) => box(32, 48, 28, 7, t[0], t[1], t[2], "tile");
const ISO = {
  dino: ["#FFD08A", (
    <>
      {tile(["#FFE9A8", "#E0A84A", "#B5762A"])}
      {box(15, 44, 5, 5, ...G3, "t")}
      {box(25, 43, 10, 12, ...G3, "b")}
      {box(22, 49, 3, 5, ...G3, "l1")}{box(31, 53, 3, 5, ...G3, "l2")}
      {box(36, 30, 9, 10, ...G3, "h")}
      <path d="M38 33l4-2v3.5l-4 2z" fill="#FFFFFF" /><path d="M40 32.5l2-1v3l-2 1z" fill={INK} />
      {box(50, 44, 3, 12, ...["#7FDB8E", "#2F9E5B", "#1F7A3A"], "c")}
    </>
  )],
  flappy: ["#8FDBFF", (
    <>
      {tile(["#B8F29A", "#5FB342", "#3F8A2A"])}
      {box(14, 34, 7, 16, ...G3, "p1")}{box(14, 30, 8.5, 4, ...G3, "p1c")}
      {box(50, 34, 7, 16, ...G3, "p2")}{box(50, 12, 8.5, 4, ...G3, "p2c")}
      {box(34, 26, 3, 3, "#FFB36B", "#FF6A2B", "#C4420A", "bk")}
      {box(29, 27, 7, 8, ...Y3, "bird")}
      <path d="M31 30l3.5-1.8v3.5l-3.5 1.8z" fill="#FFFFFF" /><path d="M32.8 29.2l1.7-.9v3l-1.7.9z" fill={INK} />
    </>
  )],
  storm: ["#3A2E80", (
    <>
      {tile(["#6B5AC0", "#40308F", "#2A1E66"])}
      <path d="M33 30l-8 12h6l-3 9 11-13h-6l4-8z" fill="#FFD93B" /><path d="M33 30l-8 12h4l5-12z" fill="#FFF08A" />
      {box(22, 24, 8, 7, ...W3, "c1")}{box(42, 24, 8, 7, ...W3, "c3")}{box(32, 20, 10, 9, ...W3, "c2")}
    </>
  )],
  sneak: ["#151B45", (
    <>
      <path d="M32 14L70 2v26z" fill="#FFE27A" opacity=".85" />
      {tile(["#3A4AA8", "#26306E", "#161C48"])}
      {box(18, 46, 5, 5, ...["#5A6DC9", "#34448F", "#222C66"], "w1")}{box(48, 42, 5, 5, ...["#5A6DC9", "#34448F", "#222C66"], "w2")}
      {box(32, 38, 8, 12, ...W3, "t1")}
      {box(32, 27, 7.5, 11, ...R3, "t2")}
      {box(32, 17, 7, 10, ...W3, "t3")}
      {box(32, 11, 6, 6, ...Y3, "lamp")}
      <path d="M32 -1l7 6.5-7 3.5-7-3.5z" fill="#E5383B" /><path d="M32 -1l7 6.5-7 3.5z" fill="#A81826" />
    </>
  )],
  emberfall: ["#3A1838", (
    <>
      {tile(["#8A86A4", "#55516E", "#35324A"])}
      {box(22, 46, 6, 4, ...N3, "l1")}{box(42, 46, 6, 4, ...N3, "l2")}{box(32, 50, 6, 4, ...N3, "l3")}
      <path d="M32 8c3 9 13 13 13 24 0 8-6 13-13 13s-13-5-13-13c0-6 3-9 6-12 0 5 1 7 3 7 0-7 2-12 4-19z" fill="#FF6A1F" />
      <path d="M32 22c2 6 7 8 7 14 0 4-3 7-7 7s-7-3-7-7c0-3 1-5 3-6 0 2 1 3 2 3 0-4 1-7 2-11z" fill="#FFD93B" />
      <ellipse cx="32" cy="38" rx="3" ry="4" fill="#FFFBEA" />
    </>
  )],
  blocks: ["#1B1250", (
    <>
      {tile(["#4A3A9A", "#2E2270", "#1E1550"])}
      {box(17, 44, 8, 8, ...B3, "b1")}{box(47, 44, 8, 8, ...Y3, "b2")}{box(32, 51, 8, 8, ...R3, "b3")}
      {box(22, 22, 8, 8, ...P3, "t1")}{box(32, 27, 8, 8, ...P3, "t2")}{box(42, 32, 8, 8, ...P3, "t3")}
      {box(32, 16, 8, 8, ...P3, "t4")}
    </>
  )],
  speedway: ["#8FE86B", (
    <>
      {tile(["#6A6F88", "#474B60", "#2E3144"])}
      <path d="M14 39l6-3M24 34l6-3M34 29l6-3M44 24l6-3" stroke="#FFFFFF" strokeWidth="1.6" opacity=".8" />
      {box(40, 47, 3, 3, ...K3, "w1")}{box(24, 39, 3, 3, ...K3, "w2")}
      <path d="M20 30l12-6 18 9v8l-12 6-18-9z" fill="#E5383B" />
      <path d="M20 30l18 9v8l-18-9z" fill="#C4212B" /><path d="M38 39l12-6v8l-12 6z" fill="#A81826" /><path d="M20 30l12-6 18 9-12 6z" fill="#FF9A8A" />
      <path d="M26 27l7-3.5 9 4.5-7 3.5z" fill="#B8ECFF" />
      {box(34, 30, 6, 4, ...["#FFB3A8", "#E5383B", "#A81826"], "cab")}
    </>
  )],
  memory: ["#2E9A7F", (
    <>
      {tile(["#5FE0B8", "#2FA880", "#1F7A5C"])}
      {box(22, 40, 13, 2.5, ...P3, "c1")}
      <path d="M22 31l4 2.5-4 2.5-4-2.5z" fill="#FFFFFF" opacity=".8" />
      {box(42, 36, 13, 2.5, ...W3, "c2")}
      <path d="M42 24l7 5.5-7 4-7-4z" fill="#FF5A8A" />
    </>
  )],
};
const iso = (slug) => (
  <Svg>
    <rect width="64" height="64" fill={ISO[slug][0]} />
    <rect width="64" height="64" fill="#FFFFFF" opacity=".08" />
    {ISO[slug][1]}
  </Svg>
);

/* ───────────── 5 · CRESTS: a shield for every game, gold rim, its sign in the middle ───────────── */
const SHIELD = "M32 3l25 8v21c0 15-10 24-25 29C17 56 7 47 7 32V11z";
const CREST = {
  dino: ["green", "#14401F", <><ellipse cx="32" cy="41" rx="9" ry="8" /><ellipse cx="20" cy="29" rx="4" ry="6" transform="rotate(-25 20 29)" /><ellipse cx="32" cy="24" rx="4.2" ry="6.5" /><ellipse cx="44" cy="29" rx="4" ry="6" transform="rotate(25 44 29)" /></>],
  flappy: ["blue", "#0C2E5A", <path d="M12 26c8-10 20-12 40-10-3 5-7 8-12 9 4 0 7 0 9-1-3 6-8 9-14 10 3 1 5 1 7 0-5 6-12 8-20 6-6-2-10-7-10-14z" />],
  storm: ["purple", "#1E1250", <path d="M38 12L18 36h11l-6 16 23-25H34l8-15z" />],
  sneak: ["grey", "#0E1230", <><path d="M8 32c7-10 15-15 24-15s17 5 24 15c-7 10-15 15-24 15S15 42 8 32z" /><circle cx="32" cy="32" r="8.5" fill={INK} /><circle cx="35" cy="29" r="2.6" /></>],
  emberfall: ["red", "#40101A", <><path d="M29 10l3-6 3 6v26h-6z" /><rect x="21" y="36" width="22" height="5" rx="2" /><rect x="29.5" y="41" width="5" height="9" rx="1.5" /><circle cx="32" cy="52" r="3" /></>],
  blocks: ["pink", "#4A1040", <path d="M13 17h38v13H39v14H25V30H13z" />],
  speedway: ["teal", "#0C3A3A", <><circle cx="32" cy="31" r="16" fill="none" stroke="currentColor" strokeWidth="6" /><circle cx="32" cy="31" r="5" /><path d="M32 31L18 27M32 31l14-4M32 31v15" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /></>],
  memory: ["orange", "#4A200A", <><rect x="13" y="18" width="19" height="27" rx="4" transform="rotate(-12 22 31)" /><rect x="31" y="16" width="19" height="27" rx="4" transform="rotate(10 41 30)" /></>],
};
const crest = (slug) => {
  const [tone, dark, sign] = CREST[slug];
  return (
    <Svg>
      <rect width="64" height="64" fill={dark} />
      {rays(32, 32)}
      <g filter="url(#il-ol)">
        <path d={SHIELD} fill="#B8801E" transform="translate(0 2.5)" />
        <path d={SHIELD} fill={v("yellow")} />
        <path d={SHIELD} fill={v(tone)} transform="translate(32 32) scale(.82) translate(-32 -32.5)" />
        <path d="M14 15l16-5.5" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
      </g>
      <g filter="url(#il-ol)" transform="translate(32 31) scale(.6) translate(-32 -31)">
        <g fill="#FFFFFF" color="#FFFFFF">{sign}</g>
      </g>
    </Svg>
  );
};

const STYLES = [
  { name: "Chunky cartoon (live now)", note: "Fat glossy toys, dark outline, sunburst.", draw: (slug) => <GamePoster slug={slug} /> },
  { name: "Faces", note: "The game's character up close, shouting — like a mobile-game app icon.", draw: faces },
  { name: "Clay", note: "Soft and round like modelling clay: no outline, soft shadows.", draw: clay },
  { name: "Isometric", note: "A tiny world built of blocks, seen from the corner.", draw: iso },
  { name: "Crests", note: "A gold-rimmed shield for every game, its sign in the middle.", draw: crest },
];

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
                <div key={slug} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span className="pc-tile-ic poster" style={{ borderRadius: 18 }}>{s.draw(slug)}</span>
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
