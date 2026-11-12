// src/pages/IconLab.jsx
// TEMPORARY — delete once an icon style is chosen (with its route in App.js
// and the 🎨 link in Navbar.jsx). Three takes on the chunky cartoon icon,
// shown on the same eight games: what is live, and two more with other
// subjects and other colours. The chosen one then gets drawn for every game.
import React from "react";
import { GAME_MAP } from "../components/games/registry";
import GamePoster from "../components/games/GamePoster";

const SAMPLE = ["dino", "flappy", "storm", "sneak", "emberfall", "blocks", "speedway", "memory"];
const INK = "#1B1230";
const F = { fontFamily: "Fredoka, Nunito, 'Segoe UI', sans-serif", fontWeight: 700, textAnchor: "middle" };

// toy colours, each as a top-to-bottom gradient (v) and a round one (c)
const TONES = {
  green: ["#A6F7A0", "#2A9E48"], yellow: ["#FFF59A", "#F5A800"], orange: ["#FFC27A", "#F0601E"], red: ["#FF9A8A", "#C81E32"],
  purple: ["#DCC2FF", "#6B3FD6"], blue: ["#A8E4FF", "#1E7FD6"], white: ["#FFFFFF", "#C6CFE8"], grey: ["#A9A5C4", "#3A3655"],
  brown: ["#E0AC72", "#8A5A2E"], pink: ["#FFC2DE", "#D6408A"], teal: ["#9AF5E8", "#12998B"], steel: ["#F2F5FF", "#8E99BC"],
};
const v = (n) => `url(#il-v-${n})`;
const c = (n) => `url(#il-c-${n})`;
const Svg = ({ children }) => (
  <svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: "block", width: "100%", height: "100%" }}>
    <defs>
      {Object.entries(TONES).map(([n, [a, b]]) => (
        <React.Fragment key={n}>
          <linearGradient id={`il-v-${n}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
          <radialGradient id={`il-c-${n}`} cx="0.34" cy="0.26" r="0.9"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></radialGradient>
        </React.Fragment>
      ))}
      {/* the thick dark outline round the whole hero, heavier underneath */}
      <filter id="il-ol" x="-25%" y="-25%" width="150%" height="160%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="fat" />
        <feOffset in="fat" dy="2.2" result="low" />
        <feMerge result="shape"><feMergeNode in="fat" /><feMergeNode in="low" /></feMerge>
        <feFlood floodColor={INK} result="ink" />
        <feComposite in="ink" in2="shape" operator="in" result="line" />
        <feMerge><feMergeNode in="line" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    {children}
  </svg>
);
const gloss = (d, w = 2.8) => <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={w} strokeLinecap="round" opacity=".8" />;
// one fat square block: a dark slab, a top, a shine
const cell = (x, y, s, top, side, key) => (
  <g key={key}>
    <rect x={x} y={y + s * 0.2} width={s} height={s} rx={s * 0.24} fill={side} />
    <rect x={x} y={y} width={s} height={s} rx={s * 0.24} fill={top} />
    <rect x={x + s * 0.16} y={y + s * 0.12} width={s * 0.68} height={s * 0.2} rx={s * 0.1} fill="#FFFFFF" opacity=".5" />
  </g>
);
const RAYS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

/* ───────────── 2 · CHUNKY, NIGHT: new heroes on a dark tile, rays in the game's colour ───────────── */
// [ray colour, back (no outline), hero]
const NIGHT = {
  // the whole dino, running
  dino: ["#5BE07A", null, (
    <g transform="translate(32 33) scale(1.08) translate(-32.5 -31)">
      <path d="M34 8H54V21H44V24H50V28H42V33H47V37H42V42L37 47V54H32V49H28V54H23V47L11 37V28L18 35H26L34 27Z" fill={v("green")} stroke={v("green")} strokeWidth="3" strokeLinejoin="round" />
      <path d="M26 37l8-8v13l-5 5h-6v-6z" fill="#EFFFD6" opacity=".8" />
      <circle cx="41" cy="14.5" r="3.4" fill="#FFFFFF" /><circle cx="42" cy="14.8" r="1.7" fill={INK} />
      {gloss("M37 9.5h12", 2.2)}
      <path d="M44 22.5h6" stroke="#14602A" strokeWidth="1.8" strokeLinecap="round" />
    </g>
  )],
  // a golden wing
  flappy: ["#FFD23F", null, (
    <g transform="rotate(-8 32 32)">
      <path d="M6 30c10-15 27-19 52-14-3 7-9 11-16 13 5 0 9-1 12-2-4 9-11 13-20 14 4 1 7 1 10 0-7 9-18 12-29 9C8 46 3 39 6 30z" fill="#C98600" transform="translate(0 3.5)" />
      <path d="M6 30c10-15 27-19 52-14-3 7-9 11-16 13 5 0 9-1 12-2-4 9-11 13-20 14 4 1 7 1 10 0-7 9-18 12-29 9C8 46 3 39 6 30z" fill={v("yellow")} />
      <path d="M18 31c9-2 18-6 26-12M20 40c8-1 15-4 22-9M22 47c5 0 10-2 14-5" fill="none" stroke="#D98E00" strokeWidth="2.2" strokeLinecap="round" />
      {gloss("M11 29c4-6 10-10 18-12", 3)}
    </g>
  )],
  // one huge bolt
  storm: ["#B99BFF", <path d="M11 14l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5zM54 42l1.2 3.2 3.2 1.2-3.2 1.2-1.2 3.2-1.2-3.2-3.2-1.2 3.2-1.2z" fill="#FFFFFF" />, (
    <>
      <path d="M42 3L13 36h14l-8 25 32-36H36l11-22z" fill="#C98600" transform="translate(0 4)" />
      <path d="M42 3L13 36h14l-8 25 32-36H36l11-22z" fill={v("yellow")} />
      <path d="M38 9L23 30" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" />
    </>
  )],
  // a lantern
  sneak: ["#FFE27A", null, (
    <>
      <path d="M22 13c0-12 20-12 20 0" fill="none" stroke="#8E8AA8" strokeWidth="4" strokeLinecap="round" />
      <path d="M21 20h22l-4-9H25z" fill={v("grey")} />
      <rect x="17" y="19" width="30" height="33" rx="6" fill={c("yellow")} />
      <path d="M32 44c-5 0-7-4-5-8 1 1.5 2 1.5 2.5.5C29 32 31 30 32 26c3 3.5 6 6.5 5 11.5 1-.5 1.5-1.5 1.5-2.5 2 4-1 9-6.5 9z" fill={v("orange")} />
      <rect x="17" y="19" width="30" height="5" fill={v("grey")} /><rect x="17" y="46" width="30" height="6" fill={v("grey")} />
      <rect x="13" y="50" width="38" height="9" rx="3.5" fill={v("grey")} />
      {gloss("M21 28v12", 2.6)}
    </>
  )],
  // a shield with a flame on it
  emberfall: ["#FF7A3D", null, (
    <g transform="rotate(-6 32 32)">
      <path d="M32 3l25 8v21c0 15-10 24-25 29C17 56 7 47 7 32V11z" fill="#6E7898" transform="translate(0 3)" />
      <path d="M32 3l25 8v21c0 15-10 24-25 29C17 56 7 47 7 32V11z" fill={v("steel")} />
      <path d="M32 10l19 6v16c0 11-7.5 18-19 22-11.5-4-19-11-19-22V16z" fill={v("red")} />
      <path d="M32 47c-7 0-9.5-5.5-7-11 1.3 2 3 2 3.5.7C27 31 31 27.5 32 22c4.5 4.5 8.5 9 7 16 1.3-.7 2-2 2-3.5 3 5.5 0 12.5-9 12.5z" fill={v("yellow")} />
      {gloss("M12 15l14-4.5", 2.6)}
    </g>
  )],
  // a stack of blocks
  blocks: ["#B06BF0", null, (
    <g transform="rotate(-6 32 32)">
      {cell(4, 37, 18, "#5CD0F5", "#1E86B0", "a")}{cell(23, 37, 18, "#FFD23F", "#C98600", "b")}{cell(42, 37, 18, "#FF6B6B", "#B81F2A", "c")}
      {cell(13.5, 18, 18, "#8FE06B", "#3F962A", "d")}{cell(32.5, 18, 18, "#D29BFF", "#7A3FD6", "e")}
      {cell(23, -1, 18, "#FF9BCF", "#C2468A", "f")}
    </g>
  )],
  // the chequered flag
  speedway: ["#FF5A76", null, (
    <g transform="rotate(-9 32 32)">
      <rect x="8" y="4" width="6" height="58" rx="3" fill={v("brown")} />
      <rect x="14" y="8" width="44" height="32" rx="3" fill="#B8BED6" transform="translate(0 2.5)" />
      <rect x="14" y="8" width="44" height="30" rx="3" fill="#FFFFFF" />
      {[[0, 0], [2, 0], [1, 1], [3, 1], [0, 2], [2, 2]].map(([x, y]) => <rect key={`${x}-${y}`} x={14 + x * 11} y={8 + y * 10} width="11" height="10" fill="#2B2440" />)}
      {gloss("M17 11h8", 2)}
    </g>
  )],
  // a card you haven't turned yet
  memory: ["#FF8FC7", null, (
    <g transform="rotate(8 32 32)">
      <rect x="12" y="10" width="40" height="52" rx="9" fill="#3A2496" />
      <rect x="12" y="3" width="40" height="52" rx="9" fill={v("purple")} />
      <rect x="17" y="8" width="30" height="42" rx="5" fill="none" stroke="#FFFFFF" strokeWidth="2" opacity=".55" />
      <text x="32" y="42" fontSize="36" fill="#3A2496" {...F} transform="translate(0 2.5)">?</text>
      <text x="32" y="42" fontSize="36" fill="#FFFFFF" {...F}>?</text>
    </g>
  )],
};
const night = (slug) => {
  const [ray, back, hero] = NIGHT[slug];
  return (
    <Svg>
      <radialGradient id="il-nt" cx="0.5" cy="0.5" r="0.72"><stop offset="0" stopColor="#3A2F78" /><stop offset="1" stopColor="#0B0820" /></radialGradient>
      <rect width="64" height="64" fill="url(#il-nt)" />
      {RAYS.map((a) => <path key={a} d="M32 32L26-20h12z" fill={ray} opacity=".2" transform={`rotate(${a} 32 32)`} />)}
      {back}
      <g filter="url(#il-ol)">{hero}</g>
    </Svg>
  );
};

/* ───────────── 3 · CHUNKY, POP: other heroes again, on a bright striped tile ───────────── */
// [tile colour, back (no outline), hero]
const POP = {
  // the cactus you jump
  dino: ["#FF7A59", null, (
    <>
      <path d="M10 57h44" stroke="#B5622A" strokeWidth="7" strokeLinecap="round" />
      <path d="M26 38h-5a6 6 0 0 1-6-6v-8" fill="none" stroke="#2F9E48" strokeWidth="9" strokeLinecap="round" />
      <path d="M38 31h5a6 6 0 0 0 6-6v-6" fill="none" stroke="#2F9E48" strokeWidth="9" strokeLinecap="round" />
      <rect x="24" y="8" width="16" height="48" rx="8" fill={v("green")} />
      <path d="M29 14v32" stroke="#D6FFD0" strokeWidth="2.6" strokeLinecap="round" opacity=".8" />
      <path d="M13.5 25v6M50.5 20v5" stroke="#A6F7A0" strokeWidth="2" strokeLinecap="round" />
      <circle cx="34" cy="8" r="4.5" fill={c("pink")} /><circle cx="34" cy="8" r="1.6" fill="#FFF59A" />
    </>
  )],
  // the pipes and the gap
  flappy: ["#5B5BE8", null, (
    <>
      <rect x="20" y="-8" width="24" height="24" fill={v("green")} /><rect x="15" y="11" width="34" height="10" rx="3.5" fill={v("green")} />
      <rect x="20" y="50" width="24" height="24" fill={v("green")} /><rect x="15" y="43" width="34" height="10" rx="3.5" fill={v("green")} />
      <rect x="23" y="-8" width="4" height="18" fill="#E0FFE0" opacity=".7" /><rect x="23" y="54" width="4" height="18" fill="#E0FFE0" opacity=".7" />
      <rect x="18" y="13" width="14" height="2.6" rx="1.3" fill="#FFFFFF" opacity=".6" /><rect x="18" y="45" width="14" height="2.6" rx="1.3" fill="#FFFFFF" opacity=".6" />
      <path d="M0-8l2.4 5.2 5.6.7-4.1 3.8 1.1 5.6L0 4.5l-5 2.8 1.1-5.6-4.1-3.8 5.6-.7z" fill={v("yellow")} transform="translate(32 32)" />
    </>
  )],
  // shards coming down
  storm: ["#2EC4B6", null, (
    <>
      <g transform="rotate(-22 14 38)"><path d="M14 22l7 12-7 22-7-22z" fill={v("pink")} /><path d="M14 22l7 12h-7z" fill="#FFE3F2" /></g>
      <g transform="rotate(20 50 36)"><path d="M50 20l7 12-7 22-7-22z" fill={v("pink")} /><path d="M50 20l7 12h-7z" fill="#FFE3F2" /></g>
      <path d="M32 3l12 20-12 38-12-38z" fill="#D6408A" />
      <path d="M32 3L20 23h12z" fill="#FFE3F2" /><path d="M32 3l12 20H32z" fill="#FFB0D8" /><path d="M20 23l12 38V23z" fill="#FF7ABF" />
      {gloss("M26 19l4-7", 2.4)}
    </>
  )],
  // a torch, on
  sneak: ["#7A4FE8", <path d="M40 24L70 4v52z" fill="#FFF3A8" opacity=".9" />, (
    <g transform="rotate(-12 28 34)">
      <rect x="2" y="27" width="30" height="16" rx="5" fill={v("grey")} />
      <rect x="6" y="29.5" width="18" height="3" rx="1.5" fill="#FFFFFF" opacity=".45" />
      <rect x="12" y="34" width="8" height="5" rx="2.5" fill={v("red")} />
      <path d="M30 26l14-7v32l-14-7z" fill={v("steel")} />
      <ellipse cx="44" cy="35" rx="4.5" ry="16" fill={c("yellow")} />
    </g>
  )],
  // the ember itself: a red shard
  emberfall: ["#FFD66B", null, (
    <g transform="rotate(8 32 32)">
      <path d="M32 3l21 13v28L32 60 11 44V16z" fill="#A81826" />
      <path d="M32 3l21 13-21 13-21-13z" fill="#FFC2B8" />
      <path d="M11 16l21 13v31L11 44z" fill="#F0413A" />
      <path d="M53 16L32 29v31l21-16z" fill="#B81F2A" />
      <path d="M32 29v31" stroke="#FF9A8A" strokeWidth="1.4" />
      {gloss("M19 14l10-6", 2.6)}
    </g>
  )],
  // the L
  blocks: ["#2A9BE8", null, (
    <g transform="rotate(10 32 32)">
      {cell(13, 2, 18, "#FFB36B", "#C4601E", "a")}{cell(13, 21, 18, "#FFB36B", "#C4601E", "b")}{cell(13, 40, 18, "#FFB36B", "#C4601E", "c")}{cell(32, 40, 18, "#FFB36B", "#C4601E", "d")}
    </g>
  )],
  // a wheel
  speedway: ["#8FDB5C", null, (
    <>
      <circle cx="32" cy="34" r="27" fill="#1A1630" />
      <circle cx="32" cy="31" r="27" fill={c("grey")} />
      {RAYS.map((a) => <path key={a} d="M32 5v6" stroke="#1A1630" strokeWidth="3.4" strokeLinecap="round" transform={`rotate(${a + 15} 32 31)`} />)}
      <circle cx="32" cy="31" r="16" fill="#1A1630" />
      <circle cx="32" cy="31" r="14" fill={c("white")} />
      {[0, 72, 144, 216, 288].map((a) => <path key={a} d="M32 31V19" stroke="#8E99BC" strokeWidth="4.2" strokeLinecap="round" transform={`rotate(${a} 32 31)`} />)}
      <circle cx="32" cy="31" r="4.5" fill={c("red")} />
      {gloss("M11 22a23 23 0 0 1 13-11", 3)}
    </>
  )],
  // a pair, found
  memory: ["#FFB02E", null, (
    <>
      {[[-11, 21, 31], [11, 43, 33]].map(([r, cx, cy]) => (
        <g key={r} transform={`rotate(${r} ${cx} ${cy})`}>
          <rect x={cx - 13} y={cy - 15} width="26" height="38" rx="6.5" fill="#B8ACD9" />
          <rect x={cx - 13} y={cy - 20} width="26" height="38" rx="6.5" fill={v("white")} />
          <path d={`M${cx} ${cy + 7}c-7.5-5.5-10-9-10-13a5 5 0 0 1 10-1.5 5 5 0 0 1 10 1.5c0 4-2.5 7.5-10 13z`} fill={v("pink")} />
          <path d={`M${cx - 6} ${cy - 8}l2-2`} stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
    </>
  )],
};
const pop = (slug) => {
  const [bg, back, hero] = POP[slug];
  return (
    <Svg>
      <rect width="64" height="64" fill={bg} />
      {[-48, -24, 0, 24, 48].map((x) => <path key={x} d={`M${x} 64L${x + 64} 0h12L${x + 12} 64z`} fill="#FFFFFF" opacity=".14" />)}
      <path d="M0 40h64v24H0z" fill="#1B1230" opacity=".1" />
      {back}
      <g filter="url(#il-ol)">{hero}</g>
    </Svg>
  );
};

const STYLES = [
  { name: "Chunky (live now)", note: "Sunburst in the game's own colour.", draw: (slug) => <GamePoster slug={slug} /> },
  { name: "Chunky, night", note: "New drawings on a dark tile; the rays carry the game's colour.", draw: night },
  { name: "Chunky, pop", note: "New drawings again, on a bright striped tile in a clashing colour.", draw: pop },
];

export default function IconLab() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "18px 16px 120px" }}>
      <h1 className="display" style={{ fontSize: "1.5rem", margin: "0 0 4px" }}>🎨 Icon styles</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: ".9rem" }}>Eight games in each. Pick by number — or mix: "the drawings of 2 on the colours of 3". This page is temporary.</p>
      {STYLES.map((s, i) => (
        <section key={s.name} className="pop" style={{ padding: 14, marginBottom: 18 }}>
          <h2 className="display" style={{ fontSize: "1.15rem", margin: 0 }}>Style {i + 1} — {s.name}</h2>
          <p className="muted" style={{ margin: "2px 0 12px", fontSize: ".82rem" }}>{s.note}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "14px 10px" }}>
            {SAMPLE.map((slug) => {
              const name = (GAME_MAP[slug] && GAME_MAP[slug].name) || slug;
              return (
                <div key={slug} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, minWidth: 0 }}>
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
