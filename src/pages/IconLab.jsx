// src/pages/IconLab.jsx
// TEMPORARY — delete once an icon style is chosen (with its route in App.js
// and the 🎨 link in Navbar.jsx). Six icon styles to pick from, each with its
// OWN drawings and colours, shown on the same eight games so they can be
// compared. The chosen style then gets drawn for every game.
import React from "react";
import { GAME_MAP } from "../components/games/registry";
import GamePoster from "../components/games/GamePoster";

const SAMPLE = ["dino", "flappy", "storm", "sneak", "emberfall", "blocks", "speedway", "memory"];
const INK = "#1B1230";
const Svg = ({ children, crisp }) => (
  <svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true" shapeRendering={crisp ? "crispEdges" : undefined}
    style={{ display: "block", width: "100%", height: "100%" }}>{children}</svg>
);

/* ───────────────────────── 2 · pixel art ───────────────────────── */
const PAL = { G: "#5BD45B", g: "#2E9A3E", W: "#FFFFFF", K: "#1B1230", Y: "#FFD93B", y: "#E8A400", O: "#FF8A1F", R: "#F0413A", P: "#B77BFF", C: "#3FD0F0", B: "#3A6BE0" };
const PIXEL = {
  dino: { bg: "#FFE9B0", rows: ["......GGGGG.", ".....GGKGGGG", ".....GGGGGGG", ".....GGGG...", "G....GGGGGG.", "G...GGGG....", "GG.GGGGGGG..", "GGGGGGGG.G..", ".GGGGGGG....", "..gGGGGG....", "..gG..GG....", "..gGG.GGG..."] },
  flappy: { bg: "#8FDBFF", rows: ["....KKKKK...", "..KKYYYKWK..", ".KYYYYKWWWK.", "KYYYYYKWWKWK", "KYYYYYKWWKWK", "KWWWYYYKWWWK", "KWWWWYYYKKKK", "KWWWYYYKOOOO", ".KKKyyKOKKKK", "..KyyyyKOOOK", "...KKyyyKKK.", ".....KKK...."] },
  storm: { bg: "#2B2466", rows: ["......YYYY..", ".....YYYY...", "....YYYY....", "...YYYY.....", "..YYYYYYYY..", "..yyYYYYY...", ".....YYY....", "....YYY.....", "....YY......", "...YY.......", "...y........", "............"] },
  sneak: { bg: "#151B45", rows: [".....RR.....", "....RRRR....", "YY..KYYK..YY", "YYY.KYYK.YYY", "....KKKK....", "....WWWW....", "....RRRR....", "...WWWWWW...", "...RRRRRR...", "...WWWWWW...", "..WWWKKWWW..", "..WWWKKWWW.."] },
  emberfall: { bg: "#2E1638", rows: [".....R......", ".....RR.....", "....RRR...R.", "...RROR..RR.", "...ROORRRR..", "..RROOORRR..", "..ROOYOORR..", ".RROYYYOOR..", ".ROOYYYYOR..", ".ROYYWWYOR..", "..ROYWWYR...", "...RRRRR...."] },
  blocks: { bg: "#1A1440", rows: ["............", "...PPPPPP...", "...PPPPPP...", ".....PP.....", ".....PP.....", "............", "............", "......YY....", "CC....YYGG..", "CC..RRYYGG..", "CCCCRRGGGG..", "CCCCRRRRGG.."] },
  speedway: { bg: "#5A5F78", rows: ["....RRRR....", "..KRRYYRRK..", "..KRRYYRRK..", "...RCCCCR...", "...RCCCCR...", "...RRYYRR...", "...RRYYRR...", "..KRRYYRRK..", "..KRRYYRRK..", "..KRRRRRRK..", "...RRRRRR...", "............"] },
  memory: { bg: "#3FA88F", rows: ["..WWWWWWWW..", "..WWWWWWWW..", "..WWRWWRWW..", "..WRRRRRRW..", "..WRRRRRRW..", "..WRRRRRRW..", "..WWRRRRWW..", "..WWWRRWWW..", "..WWWWWWWW..", "..WWWWWWWW..", "..WWWWWWWW..", "............"] },
};
const pixel = (slug) => {
  const p = PIXEL[slug];
  return (
    <Svg crisp>
      <rect width="64" height="64" fill={p.bg} />
      {p.rows.map((row, y) => row.split("").map((ch, x) => (ch === "." ? null : <rect key={`${x}-${y}`} x={8 + x * 4} y={8 + y * 4} width="4.06" height="4.06" fill={PAL[ch]} />)))}
    </Svg>
  );
};

/* ───────────────────────── 3 · cute (kawaii) ───────────────────────── */
const BR = "#5A3A4A";
const K = { stroke: BR, strokeWidth: 2.2, strokeLinejoin: "round", strokeLinecap: "round" };
const face = (x, y, g) => (
  <>
    <circle cx={x - g} cy={y} r="1.9" fill={BR} /><circle cx={x + g} cy={y} r="1.9" fill={BR} />
    <path d={`M${x - 2.6} ${y + 2.6}q2.6 2.8 5.2 0`} fill="none" stroke={BR} strokeWidth="1.7" strokeLinecap="round" />
    <ellipse cx={x - g - 3.2} cy={y + 3} rx="2.3" ry="1.4" fill="#FF8FA8" opacity=".85" /><ellipse cx={x + g + 3.2} cy={y + 3} rx="2.3" ry="1.4" fill="#FF8FA8" opacity=".85" />
  </>
);
const CUTE = {
  dino: (
    <>
      <rect width="64" height="64" fill="#D9F7C4" />
      <path d="M18 22l-5-7 8 2zM25 15l-1-8 7 4zM35 12l3-7 5 7z" fill="#4FB85A" {...K} />
      <path d="M12 56V34c0-13 9-21 21-21s19 8 19 17c0 6-4 10-10 10h-2v6c0 6-4 10-10 10z" fill="#8FE08F" {...K} />
      <ellipse cx="24" cy="49" rx="8" ry="5" fill="#E9FFD0" />
      {face(35, 27, 6)}
    </>
  ),
  flappy: (
    <>
      <rect width="64" height="64" fill="#CDEFFF" />
      <path d="M49 31l9 3.5-9 4z" fill="#FF9A4A" {...K} />
      <circle cx="31" cy="34" r="19" fill="#FFE27A" {...K} />
      <ellipse cx="16" cy="38" rx="7" ry="5" fill="#FFC93D" {...K} />
      <path d="M26 15l3-6 3 5 3-5 2 6" fill="#FF9A4A" {...K} />
      {face(35, 31, 6)}
    </>
  ),
  storm: (
    <>
      <rect width="64" height="64" fill="#E4DBFF" />
      <path d="M35 40l-8 11h6l-4 10 11-14h-6l4-7z" fill="#FFD93B" {...K} />
      <path d="M15 41a11 11 0 0 1 1-22 14 14 0 0 1 27-2 11 11 0 0 1 6 24z" fill="#FFFFFF" {...K} />
      {face(31, 29, 6)}
    </>
  ),
  sneak: (
    <>
      <rect width="64" height="64" fill="#3A4690" />
      <path d="M32 18L66 6v24zM32 18L-2 6v24z" fill="#FFF3A8" opacity=".55" />
      <path d="M20 60l4-34h16l4 34z" fill="#FFFFFF" {...K} />
      <path d="M21.5 50h21l1.2 10H20z" fill="#FF7A7A" {...K} />
      <rect x="24" y="13" width="16" height="13" rx="2" fill="#FFE27A" {...K} />
      <path d="M21 13l11-10 11 10z" fill="#FF7A7A" {...K} />
      {face(32, 37, 5)}
    </>
  ),
  emberfall: (
    <>
      <rect width="64" height="64" fill="#FFE1C4" />
      <path d="M32 6c3 11 18 16 18 32a18 18 0 0 1-36 0c0-8 4-12 8-16 0 7 2 9 5 9 0-9 3-16 5-25z" fill="#FF9A4A" {...K} />
      <ellipse cx="32" cy="45" rx="11" ry="10" fill="#FFD08A" />
      {face(32, 42, 6)}
    </>
  ),
  blocks: (
    <>
      <rect width="64" height="64" fill="#F3DBFF" />
      <path d="M8 12h48v18H42v24H22V30H8z" fill="#C08CFF" {...K} />
      <path d="M13 16h38" stroke="#E6CCFF" strokeWidth="2.6" strokeLinecap="round" />
      {face(32, 24, 7)}
    </>
  ),
  speedway: (
    <>
      <rect width="64" height="64" fill="#FFD9D9" />
      <path d="M6 46v-9c0-3 2-5 5-5h5l7-12h18l9 12h3c3 0 5 2 5 5v9z" fill="#FF6B6B" {...K} />
      <path d="M26 24h6v8H21zM36 24h4l6 8H36z" fill="#D6F4FF" {...K} />
      <circle cx="19" cy="47" r="7" fill={BR} /><circle cx="19" cy="47" r="2.8" fill="#FFFFFF" />
      <circle cx="46" cy="47" r="7" fill={BR} /><circle cx="46" cy="47" r="2.8" fill="#FFFFFF" />
      {face(32.5, 38, 4.5)}
    </>
  ),
  memory: (
    <>
      <rect width="64" height="64" fill="#FFF0C4" />
      <rect x="9" y="14" width="26" height="38" rx="6" fill="#B9A3FF" transform="rotate(-12 22 33)" {...K} />
      <rect x="24" y="10" width="30" height="44" rx="7" fill="#FFFFFF" transform="rotate(7 39 32)" {...K} />
      <g transform="rotate(7 39 32)">
        <path d="M39 26c-5.5-4-7.5-6.5-7.5-9.5a3.8 3.8 0 0 1 7.5-1 3.8 3.8 0 0 1 7.5 1c0 3-2 5.5-7.5 9.5z" fill="#FF7AA8" {...K} />
        {face(39, 37, 5)}
      </g>
    </>
  ),
};

/* ───────────────────────── 4 · bold shapes (poster art) ───────────────────────── */
const CR = "#F7EEDB", RD = "#E63946", NV = "#1D3557", YL = "#F4B400", TL = "#2A9D8F", GN = "#2A9D5C";
const SHAPES = {
  dino: (
    <>
      <rect width="64" height="64" fill={YL} />
      <path d="M14 30l-8-5 8-7zM22 18l-3-9 10 3z" fill={NV} />
      <path d="M12 64V30a22 22 0 0 1 22-22h20v20H42v36z" fill={GN} />
      <circle cx="40" cy="18" r="5" fill={CR} /><circle cx="41.5" cy="18" r="2.2" fill={NV} />
      <path d="M42 28l3 6 3-6zM48 28l3 6 3-6z" fill={CR} />
    </>
  ),
  flappy: (
    <>
      <rect width="64" height="64" fill="#8ECAE6" />
      <rect x="44" y="0" width="16" height="20" fill={GN} /><rect x="44" y="46" width="16" height="18" fill={GN} />
      <path d="M38 29l14 5-14 5z" fill={RD} />
      <circle cx="25" cy="33" r="16" fill={YL} />
      <path d="M11 35a9 9 0 0 0 18 0z" fill="#E76F51" />
      <circle cx="31" cy="27" r="5.5" fill={CR} /><circle cx="32.5" cy="27" r="2.4" fill={NV} />
    </>
  ),
  storm: (
    <>
      <rect width="64" height="64" fill={NV} />
      <circle cx="21" cy="24" r="11" fill={CR} /><circle cx="36" cy="19" r="14" fill={CR} /><circle cx="48" cy="26" r="9" fill={CR} /><rect x="12" y="23" width="44" height="12" rx="6" fill={CR} />
      <path d="M37 31L23 48h9l-5 15 17-20h-9l6-12z" fill={YL} />
    </>
  ),
  sneak: (
    <>
      <rect width="64" height="64" fill="#14213D" />
      <path d="M32 18L70 2v30z" fill={YL} />
      <path d="M-4 64a36 13 0 0 1 72 0z" fill={TL} />
      <path d="M21 58l4-34h14l4 34z" fill={CR} />
      <path d="M23.2 39h17.6l1 9H22.2z" fill={RD} />
      <rect x="25" y="12" width="14" height="12" fill={YL} />
      <path d="M21 12l11-9 11 9z" fill={RD} />
    </>
  ),
  emberfall: (
    <>
      <rect width="64" height="64" fill="#2B1B3D" />
      <path d="M32 4c11 13 20 22 20 35a20 20 0 0 1-40 0C12 26 21 17 32 4z" fill={RD} />
      <path d="M32 22c7 9 12 14 12 22a12 12 0 0 1-24 0c0-8 5-13 12-22z" fill={YL} />
      <circle cx="32" cy="46" r="5.5" fill={CR} />
    </>
  ),
  blocks: (
    <>
      <rect width="64" height="64" fill={CR} />
      <rect x="8" y="8" width="15" height="15" fill={RD} /><rect x="24.5" y="8" width="15" height="15" fill={NV} /><rect x="41" y="8" width="15" height="15" fill={YL} />
      <rect x="24.5" y="24.5" width="15" height="15" fill={TL} />
      <circle cx="15.5" cy="48.5" r="7.5" fill={YL} /><rect x="41" y="41" width="15" height="15" fill={RD} /><path d="M24.5 56V41h15z" fill={NV} />
    </>
  ),
  speedway: (
    <>
      <rect width="64" height="64" fill={RD} />
      <g transform="rotate(-10 32 32)">
        <rect x="9" y="6" width="5" height="54" fill={NV} />
        <rect x="14" y="10" width="40" height="30" fill={CR} />
        {[[0, 0], [2, 0], [1, 1], [3, 1], [0, 2], [2, 2]].map(([x, y]) => <rect key={`${x}-${y}`} x={14 + x * 10} y={10 + y * 10} width="10" height="10" fill={NV} />)}
      </g>
    </>
  ),
  memory: (
    <>
      <rect width="64" height="64" fill={TL} />
      <rect x="8" y="13" width="27" height="38" rx="5" fill={NV} transform="rotate(-11 21 32)" />
      <rect x="28" y="12" width="28" height="40" rx="5" fill={CR} transform="rotate(8 42 32)" />
      <circle cx="42" cy="32" r="8.5" fill={RD} /><path d="M42 23.5a8.5 8.5 0 0 1 0 17z" fill={YL} />
    </>
  ),
};

/* ───────────────────────── 5 · ink doodle ───────────────────────── */
// thick hand-inked lines over a blob of colour on cream paper
const D = { fill: "none", stroke: INK, strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" };
const DOODLE = {
  dino: ["#8FE08F", <><path d="M34 8H54V21H44V24H50V28H42V33H47V37H42V42L37 47V54H32V49H28V54H23V47L11 37V28L18 35H26L34 27Z" /><circle cx="41" cy="14.5" r="1.8" fill={INK} /><path d="M6 59h14M27 59h8M42 59h16" /></>],
  flappy: ["#FFD93B", <><circle cx="24" cy="32" r="13" /><path d="M14 34c3-4 8-4 11 0-3 4-8 4-11 0z" /><path d="M36 30l9 3.5-9 4" /><circle cx="29" cy="27" r="1.8" fill={INK} /><path d="M48 5v14h11V5M48 59V46h11v13" /></>],
  storm: ["#B9A3FF", <><path d="M17 31a9.5 9.5 0 0 1 2-18.5 13 13 0 0 1 24.5 2A8.5 8.5 0 0 1 47 31" /><path d="M36 24l-11 16h9l-5 17 15-21h-9l5-12z" fill="#FFD93B" /></>],
  sneak: ["#FFE27A", <><path d="M23 58l4-32h10l4 32z" fill="#FFFFFF" /><path d="M25.5 42h13" /><path d="M26 26V16h12v10M23 16l9-9 9 9z" /><path d="M43 18l16-6M43 23l16 6M21 18L5 12M21 23L5 29" /></>],
  emberfall: ["#FF9A4A", <><path d="M32 5c2 11 16 16 16 31a16 16 0 0 1-32 0c0-7 3.5-10.5 7-14 0 6 2 8.5 4.5 8.5C27.5 21 30 14 32 5z" /><path d="M32 54a6.5 6.5 0 0 1-6.5-6.5c0-5 6.5-7.5 6.5-14 3.5 4.5 6.5 8 6.5 14A6.5 6.5 0 0 1 32 54z" fill="#FFE27A" /></>],
  blocks: ["#7FD8F5", <><path d="M13 8h38v13H39v13H25V21H13z" fill="#FFFFFF" /><path d="M6 57V46h14v11M34 57V44h12v-8h12v21M6 57h52" /></>],
  speedway: ["#FF8A8A", <><path d="M13 7v51" /><path d="M13 10c9-5 14 4 23 0s13-2 18 0v24c-5-2-9-4-18 0s-14-5-23 0z" fill="#FFFFFF" /><path d="M19 14h7v7h-7zM33 15h7v7h-7zM26 22h7v7h-7zM41 22h7v7h-7z" fill={INK} stroke="none" /></>],
  memory: ["#FFB0D0", <><rect x="8" y="15" width="22" height="34" rx="5" transform="rotate(-8 19 32)" fill="#FFFFFF" /><rect x="34" y="15" width="22" height="34" rx="5" transform="rotate(8 45 32)" fill="#FFFFFF" /><path d="M45 25l2 4.4 4.8.6-3.5 3.3.9 4.7-4.2-2.4-4.2 2.4.9-4.7-3.5-3.3 4.8-.6z" fill="#FFD93B" strokeWidth="2.4" transform="rotate(8 45 32)" /><path d="M19 27l4 5-4 5-4-5z" strokeWidth="2.4" transform="rotate(-8 19 32)" /></>],
};
const doodle = (slug) => (
  <Svg>
    <rect width="64" height="64" fill="#FFF6E2" />
    <path d="M10 30C8 14 24 6 38 9s22 14 18 29-18 20-31 17S12 44 10 30z" fill={DOODLE[slug][0]} />
    <g {...D}>{DOODLE[slug][1]}</g>
  </Svg>
);

/* ───────────────────────── 6 · big letter ───────────────────────── */
const TYPE = { dino: ["#FF8A3D", "#C4420A"], flappy: ["#3DB8FF", "#0A6EC4"], storm: ["#8A6BFF", "#3A1FB0"], sneak: ["#3A4AA8", "#101640"], emberfall: ["#FF5A4A", "#8F1020"], blocks: ["#B06BF0", "#5A1FA8"], speedway: ["#3FCF6B", "#0F7A38"], memory: ["#FF6BA8", "#B01F60"] };
const letter = (slug, name) => {
  const [a, b] = TYPE[slug];
  const ch = (name || slug)[0].toUpperCase();
  const T = { x: 32, y: 47, fontSize: 44, fontFamily: "Fredoka, Nunito, 'Segoe UI', sans-serif", fontWeight: 700, textAnchor: "middle" };
  return (
    <Svg>
      <rect width="64" height="64" fill={a} />
      <path d="M-10 40L40-10h18L-10 58zM10 74L74 10v18L28 74z" fill="#FFFFFF" opacity=".14" />
      <g transform="rotate(-8 32 32)">
        <text {...T} fill={INK} stroke={INK} strokeWidth="7" strokeLinejoin="round" transform="translate(0 4)">{ch}</text>
        <text {...T} fill={b} stroke={INK} strokeWidth="7" strokeLinejoin="round" paintOrder="stroke">{ch}</text>
        <text {...T} fill="#FFFFFF" transform="translate(0 -3)">{ch}</text>
      </g>
    </Svg>
  );
};

const STYLES = [
  { name: "Chunky cartoon (live now)", note: "Fat glossy toys, dark outline, sunburst.", draw: (slug) => <GamePoster slug={slug} /> },
  { name: "Pixel art", note: "Retro arcade sprites, square by square.", draw: pixel },
  { name: "Cute", note: "Soft pastel, everything has a little face.", draw: (slug) => <Svg>{CUTE[slug]}</Svg> },
  { name: "Bold shapes", note: "Flat poster art from circles, squares and triangles; five strong colours.", draw: (slug) => <Svg>{SHAPES[slug]}</Svg> },
  { name: "Ink doodle", note: "Hand-inked lines over a blob of colour on cream paper.", draw: doodle },
  { name: "Big letter", note: "The game's first letter, chunky, each game its own colour.", draw: letter },
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
                  <span className="pc-tile-ic poster" style={{ borderRadius: 18 }}>{s.draw(slug, name)}</span>
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
