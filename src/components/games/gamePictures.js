// src/components/games/gamePictures.js
// A picture for every game, drawn in the toy-box style on a 64 x 64 board:
// thick ink outlines, flat bright colours, shapes that read at 24px. The game
// icons draw them (GameIcon.jsx), and Slide Puzzle cuts them into tiles.
import React from "react";

const INK = "#2E2140";
const K = { stroke: INK, strokeWidth: 3.5, strokeLinejoin: "round", strokeLinecap: "round" };
const T = { ...K, strokeWidth: 2.5 };

// each picture on a 64 × 64 board
export const PICTURES = {
  // a mahjong tile, standing up, with its edge: a red circle and two bamboo sticks
  mahjong: (
    <>
      <rect x="15" y="10" width="36" height="46" rx="7" fill="#D9C79F" {...K} />
      <rect x="11" y="6" width="36" height="46" rx="7" fill="#FFF6E6" {...K} />
      <circle cx="29" cy="19" r="7" fill="#FF6B6B" {...T} />
      <circle cx="29" cy="19" r="2.5" fill="#FFF6E6" />
      <rect x="20" y="31" width="5" height="15" rx="2.5" fill="#5DBB5A" {...T} />
      <rect x="33" y="31" width="5" height="15" rx="2.5" fill="#5DBB5A" {...T} />
    </>
  ),
  // two cards: one face down, one turned over to a star
  memory: (
    <>
      <rect x="7" y="14" width="26" height="36" rx="6" fill="#FFC53D" {...K} transform="rotate(-10 20 32)" />
      <path d="M14 26l12 12M26 26L14 38" stroke="#E2A21A" strokeWidth="3" strokeLinecap="round" transform="rotate(-10 20 32)" />
      <rect x="31" y="12" width="26" height="36" rx="6" fill="#FFFFFF" {...K} transform="rotate(8 44 30)" />
      <path d="M44 21l3 6.5 7 .8-5.2 4.8 1.5 7-6.3-3.6-6.3 3.6 1.5-7-5.2-4.8 7-.8z" fill="#FF8FC7" {...T} transform="rotate(8 44 30)" />
    </>
  ),
  // a bubbly sum card: plus and times
  speedmath: (
    <>
      <rect x="8" y="8" width="48" height="48" rx="12" fill="#4CC9F0" {...K} />
      <path d="M22 18v14M15 25h14" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <path d="M37 18l10 10M47 18L37 28" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <path d="M17 42h12M17 48h12" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <circle cx="42" cy="45" r="6" fill="#FFC53D" {...T} />
    </>
  ),
  // a big red button and a finger's tap rings
  reaction: (
    <>
      <ellipse cx="32" cy="44" rx="22" ry="9" fill="#B9B4CC" {...K} />
      <path d="M14 36v8c0 5 8 9 18 9s18-4 18-9v-8" fill="#C94A4A" {...K} />
      <ellipse cx="32" cy="36" rx="18" ry="8" fill="#FF6B6B" {...K} />
      <path d="M24 33c3-2 7-3 11-2" stroke="#FFB3B3" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M10 18l6 6M32 8v9M54 18l-6 6" stroke={INK} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  // letter tiles: a big A in front of a B
  wordrush: (
    <>
      <rect x="28" y="8" width="28" height="28" rx="6" fill="#FFC53D" {...K} />
      <text x="42" y="29" textAnchor="middle" fontFamily="Fredoka, Nunito, sans-serif" fontWeight="800" fontSize="20" fill={INK}>B</text>
      <rect x="8" y="24" width="32" height="32" rx="7" fill="#FFFFFF" {...K} />
      <text x="24" y="49" textAnchor="middle" fontFamily="Fredoka, Nunito, sans-serif" fontWeight="800" fontSize="25" fill={INK}>A</text>
    </>
  ),
  // a block with an arrow sliding out of the grid
  arrows: (
    <>
      <rect x="6" y="6" width="52" height="52" rx="10" fill="#E8E2FF" {...K} />
      <rect x="12" y="12" width="18" height="18" rx="4" fill="#FFC53D" {...T} />
      <path d="M21 26V16M17 20l4-4 4 4" stroke={INK} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="12" y="34" width="18" height="18" rx="4" fill="#4CC9F0" {...T} />
      <path d="M16 43h10M22 39l4 4-4 4" stroke={INK} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="36" y="22" width="18" height="18" rx="4" fill="#9B5DE5" {...T} transform="translate(6 0)" />
      <path d="M46 31h10M52 27l4 4-4 4" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M36 31h4" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 3" />
    </>
  ),
  // the dino: a round green head, a big eye, a grin, spikes
  dino: (
    <>
      <path d="M18 18l4-9 5 8M28 14l5-9 4 9" fill="#5DBB5A" {...T} />
      <path d="M10 40c0-16 9-26 24-26 13 0 22 7 22 18 0 9-7 14-16 14H24v8H12z" fill="#8FDB5C" {...K} />
      <circle cx="36" cy="27" r="6" fill="#FFFFFF" {...T} />
      <circle cx="38" cy="27.5" r="3" fill={INK} />
      <path d="M33 39c5 3 12 3 18-1" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="49" cy="25" r="1.6" fill={INK} />
    </>
  ),
  // numbered bubbles, to tap in order
  numbers: (
    <>
      <circle cx="20" cy="22" r="12" fill="#FF8FC7" {...K} />
      <circle cx="44" cy="22" r="12" fill="#4CC9F0" {...K} />
      <circle cx="32" cy="44" r="12" fill="#FFC53D" {...K} />
      {[["1", 20, 27], ["2", 44, 27], ["3", 32, 49]].map(([n, x, y]) => (
        <text key={n} x={x} y={y} textAnchor="middle" fontFamily="Fredoka, Nunito, sans-serif" fontWeight="800" fontSize="15" fill={INK}>{n}</text>
      ))}
    </>
  ),
  // a paint splat in four colours
  colors: (
    <>
      <path d="M32 6c5 0 6 7 10 8s9-3 12 1-3 8-1 12 8 6 5 11-9 2-12 5-1 11-7 11-5-7-9-9-10 2-12-3 4-8 2-12-9-6-6-11 8-1 11-4 2-9 7-9z" fill="#FFFFFF" {...K} />
      <circle cx="25" cy="25" r="7" fill="#FF6B6B" {...T} />
      <circle cx="40" cy="24" r="7" fill="#FFC53D" {...T} />
      <circle cx="24" cy="40" r="7" fill="#4CC9F0" {...T} />
      <circle cx="40" cy="40" r="7" fill="#8FDB5C" {...T} />
    </>
  ),
  // a pipe bend with water running out of it
  pipes: (
    <>
      <path d="M8 18h22a14 14 0 0 1 14 14v8h-12v-8a2 2 0 0 0-2-2H8z" fill="#3DD6C0" {...K} />
      <rect x="6" y="15" width="7" height="18" rx="2" fill="#2BB3A0" {...T} />
      <rect x="29" y="38" width="18" height="7" rx="2" fill="#2BB3A0" {...T} />
      <path d="M38 48c-3 4-5 6-5 8a5 5 0 0 0 10 0c0-2-2-4-5-8z" fill="#4CC9F0" {...T} />
    </>
  ),
  // the round yellow bird, mid-flap
  flappy: (
    <>
      <path d="M11 30c-4-3-4-8 1-8l7 5" fill="#F2A227" {...T} />
      <ellipse cx="30" cy="34" rx="20" ry="18" fill="#FFD23F" {...K} />
      <ellipse cx="34" cy="43" rx="11" ry="6" fill="#FFF3C4" />
      <path d="M48 31l12 4-12 4z" fill="#FF8A3D" {...T} />
      <circle cx="40" cy="26" r="6.5" fill="#FFFFFF" {...T} />
      <circle cx="42" cy="26.5" r="3" fill={INK} />
      <ellipse cx="22" cy="36" rx="9" ry="6" fill="#F2A227" {...T} transform="rotate(-25 22 36)" />
      <path d="M27 16c0-4 3-6 6-4" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  // a sliding puzzle: eight tiles and a gap
  slide: (
    <>
      <rect x="6" y="6" width="52" height="52" rx="10" fill="#5A4E8C" {...K} />
      {[[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [0, 2], [1, 2], [2, 2]].map(([c, r], i) => (
        <rect key={i} x={11 + c * 15} y={11 + r * 15} width="13" height="13" rx="3.5"
          fill={["#FFC53D", "#FF8FC7", "#4CC9F0", "#8FDB5C", "#FFA36C", "#9B5DE5", "#3DD6C0", "#FF6B6B"][i]} {...T} />
      ))}
      <path d="M42 33h8" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 4" />
    </>
  ),
  // toy blocks: an L of four, one more falling in
  blocks: (
    <>
      {[[10, 30, "#FF6B6B"], [24, 30, "#FF6B6B"], [10, 44, "#FF6B6B"], [38, 44, "#4CC9F0"], [24, 44, "#4CC9F0"]].map(([x, y, c], i) => (
        <rect key={i} x={x} y={y} width="14" height="14" rx="3" fill={c} {...T} />
      ))}
      <rect x="38" y="10" width="14" height="14" rx="3" fill="#FFC53D" {...T} />
      <rect x="38" y="24" width="14" height="14" rx="3" fill="#FFC53D" {...T} />
      <path d="M45 4v3" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  // the chick crossing a road
  racer: (
    <>
      <rect x="2" y="42" width="60" height="16" rx="3" fill="#5D6170" {...T} />
      <path d="M8 50h10M26 50h10M44 50h10" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="32" cy="32" rx="14" ry="13" fill="#FFFFFF" {...K} />
      <circle cx="32" cy="16" r="9" fill="#FFFFFF" {...K} />
      <path d="M27 8c1-4 4-4 5-1 1-3 4-3 5 1" fill="#FF4D4D" {...T} />
      <path d="M40 16l6 2-6 2z" fill="#FFA21A" {...T} />
      <circle cx="35" cy="14" r="2" fill={INK} />
      <path d="M22 30c-4-3-2-8 2-7" fill="#F4F1FF" {...T} />
      <path d="M28 45v5M36 45v5" stroke="#FFA21A" strokeWidth="3.5" strokeLinecap="round" />
    </>
  ),
  // a train's round front, on rails
  runner: (
    <>
      <path d="M10 60l8-14M54 60l-8-14M14 54h36" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <rect x="14" y="8" width="36" height="40" rx="12" fill="#FF6B6B" {...K} />
      <rect x="20" y="15" width="24" height="13" rx="4" fill="#9FD8FF" {...T} />
      <circle cx="22" cy="39" r="3.5" fill="#FFF3A6" {...T} />
      <circle cx="42" cy="39" r="3.5" fill="#FFF3A6" {...T} />
      <path d="M26 44h12" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  // a race car from above, and the chequered flag
  speedway: (
    <>
      <path d="M44 4v22" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M44 5h15v12H44z" fill="#FFFFFF" {...T} />
      <path d="M44 5h5v6h-5zM54 5h5v6h-5zM49 11h5v6h-5z" fill={INK} />
      <path d="M4 44c0-6 4-9 10-9h8l6-7h12l6 7h8c5 0 7 4 7 9v4H4z" fill="#4CC9F0" {...K} />
      <path d="M29 30h10l4 5H26z" fill="#9FD8FF" {...T} />
      <circle cx="16" cy="48" r="7" fill={INK} />
      <circle cx="16" cy="48" r="2.5" fill="#D8D2CC" />
      <circle cx="48" cy="48" r="7" fill={INK} />
      <circle cx="48" cy="48" r="2.5" fill="#D8D2CC" />
      <circle cx="33" cy="41" r="4.5" fill="#FFFFFF" {...T} strokeWidth="2" />
      <path d="M2 38h6M1 44h5" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  // a glowing crystal shard and a lightning bolt in the night
  storm: (
    <>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#2B2350" {...K} />
      <path d="M38 8L26 30h10l-8 20 18-26H36l6-16z" fill="#FFD447" {...T} />
      <path d="M18 34l6 8-6 12-6-12z" fill="#FF8FC7" {...T} />
      <path d="M18 36l2 6-2 8" stroke="#FFD1EA" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  // a lighthouse at night, its beam cut by a wall's shadow
  sneak: (
    <>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#232C5C" {...K} />
      <path d="M30 20L58 10v22z" fill="#FFE27A" />
      <path d="M17 54l3-30h10l3 30z" fill="#FFFFFF" {...T} />
      <path d="M19 34h12M18 44h14" stroke="#FF6B6B" strokeWidth="5" />
      <path d="M17 54l3-30h10l3 30z" fill="none" {...T} />
      <rect x="19" y="15" width="12" height="9" rx="2" fill="#FFE27A" {...T} />
      <path d="M17 15l8-7 8 7z" fill="#FF6B6B" {...T} />
      <rect x="42" y="42" width="13" height="12" rx="2" fill="#6F7FC4" {...T} />
    </>
  ),
  // a little maze, its way out marked, and you
  maze: (
    <>
      <rect x="6" y="6" width="52" height="52" rx="10" fill="#FFF6E6" {...K} />
      <path d="M16 6v20h14M30 16v20M40 26v26M16 36h14v12M50 16H40M16 48h6" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M11 54V31h13" stroke="#FF8FC7" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 5" fill="none" />
      <circle cx="47" cy="46" r="5" fill="#4CC9F0" {...T} />
      <path d="M50 8h6v6" stroke="#5DBB5A" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  // keyboard keys, one pressed
  typing: (
    <>
      <rect x="4" y="14" width="56" height="38" rx="9" fill="#5D6170" {...K} />
      {[[10, 20], [22, 20], [34, 20], [46, 20], [10, 32], [34, 32], [46, 32]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="9" height="9" rx="2.5" fill="#FFFFFF" {...T} strokeWidth="2" />
      ))}
      <rect x="22" y="33" width="9" height="9" rx="2.5" fill="#FFC53D" {...T} strokeWidth="2" />
      <rect x="16" y="44" width="32" height="5" rx="2.5" fill="#FFFFFF" {...T} strokeWidth="2" />
    </>
  ),
  // piano keys, one lit
  piano: (
    <>
      <rect x="6" y="10" width="52" height="44" rx="8" fill="#FFFFFF" {...K} />
      <path d="M19 10v44M32 10v44M45 10v44" stroke={INK} strokeWidth="3" />
      <rect x="32" y="12" width="13" height="40" fill="#FFC53D" />
      <path d="M32 10v44M45 10v44" stroke={INK} strokeWidth="3" />
      {[15, 28, 41].map((x) => <rect key={x} x={x} y="10" width="8" height="24" rx="2" fill={INK} />)}
      <path d="M6 18a8 8 0 0 1 8-8" stroke={INK} strokeWidth="3.5" fill="none" />
    </>
  ),
  // a chef's hat
  kitchen: (
    <>
      <path d="M17 36c-7 0-11-6-9-12s9-8 13-5c1-7 7-11 13-10 6 0 11 4 12 9 5-3 12 0 12 7 0 6-5 11-12 11z" fill="#FFFFFF" {...K} />
      <rect x="17" y="34" width="30" height="18" rx="4" fill="#FFFFFF" {...K} />
      <rect x="17" y="40" width="30" height="5" fill="#FF6B6B" stroke={INK} strokeWidth="2.5" />
      <path d="M24 26c1-4 3-6 6-7" stroke="#D9D2E6" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  // a taped cardboard box
  moving: (
    <>
      <path d="M8 22l24-10 24 10v28L32 60 8 50z" fill="#E0A96D" {...K} />
      <path d="M8 22l24 10 24-10M32 32v28" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" fill="none" />
      <path d="M8 22l24 10 24-10-24-10z" fill="#EDBE86" {...K} />
      <path d="M20 17l24 10" stroke="#FFF3D6" strokeWidth="5" strokeLinecap="round" />
      <path d="M40 40l8-3v6l-8 3z" fill="#FFFFFF" {...T} strokeWidth="2" />
    </>
  ),
  // a floating island with a glowing sun shard above it
  sunshard: (
    <>
      <path d="M32 6l6 10-6 10-6-10z" fill="#FFC53D" {...T} />
      <path d="M32 9l2 7-2 6" stroke="#FFF3A6" strokeWidth="2" fill="none" />
      <path d="M8 36c0-4 4-6 8-6h32c4 0 8 2 8 6z" fill="#8FDB5C" {...K} />
      <path d="M10 36h44L36 58c-2 2-6 2-8 0z" fill="#C98F55" {...K} />
      <path d="M22 42l4 6M38 44l-3 5" stroke="#A0703F" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  // a campfire flame
  emberfall: (
    <>
      <path d="M32 6c3 10 16 16 16 30a16 16 0 0 1-32 0c0-8 5-12 8-16 1 5 3 7 6 8-2-8 0-15 2-22z" fill="#FF8A3D" {...K} />
      <path d="M32 30c2 6 8 8 8 15a8 8 0 0 1-16 0c0-4 3-6 4-8 1 2 2 3 3 3-1-4 0-7 1-10z" fill="#FFD447" {...T} />
      <path d="M14 56l36-6M14 50l36 6" stroke="#8A5A33" strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  // the cuckoo clock's face, a little wrong
  hollow: (
    <>
      <path d="M8 26L32 6l24 20z" fill="#6B4423" {...K} />
      <rect x="12" y="24" width="40" height="34" rx="6" fill="#8A5A33" {...K} />
      <circle cx="32" cy="40" r="12" fill="#FFF6E6" {...K} />
      <path d="M32 40v-7M32 40l5 4" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <circle cx="25" cy="14" r="2" fill="#FFD447" />
      <circle cx="39" cy="14" r="2" fill="#FFD447" />
    </>
  ),
};


export const pictureFor = (slug) => PICTURES[slug] || null;
export const PICTURE_SLUGS = Object.keys(PICTURES);
