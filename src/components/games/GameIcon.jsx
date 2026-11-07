// src/components/games/GameIcon.jsx
// A game's icon: PlayRoom's own little picture for each game, drawn in the
// toy-box style — thick ink outlines, flat bright colours, big simple shapes
// that still read at 24px. It sizes itself to the text around it (1em), so it
// drops in wherever the emoji used to be.
//
// Give it the game's `slug` where you have it; otherwise the emoji stored
// with the game is looked up (two games share ⚡, so the slug wins). A game
// with no picture yet shows its emoji, as before.
import React from "react";
import { GAMES } from "./registry";

import { PICTURES as ICONS } from "./gamePictures";

// LOOKS: the same pictures can be drawn several ways. "light" (thin, soft
// outlines, brighter colour) is the one PlayRoom uses; the others were tried
// side by side and are kept for a page or game that wants them (`look`).
export const LOOKS = ["light", "light3d", "flat", "soft", "sketch", "pastel", "badge"];

const FILTERS = {
  // a soft top light and a small shadow underneath, nothing shiny
  soft: (
    <filter id="gi-soft" x="-10%" y="-10%" width="120%" height="130%" colorInterpolationFilters="sRGB">
      <feOffset in="SourceAlpha" dy="2.2" result="drop" />
      <feGaussianBlur in="drop" stdDeviation="1.2" result="dropB" />
      <feFlood floodColor="#2E2140" floodOpacity="0.28" result="ink" />
      <feComposite in="ink" in2="dropB" operator="in" result="shadow" />
      <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
      <feDiffuseLighting in="blur" surfaceScale="2.5" diffuseConstant="1" lightingColor="#FFFFFF" result="light">
        <feDistantLight azimuth="235" elevation="55" />
      </feDiffuseLighting>
      <feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="0.85" k2="0.25" k3="0" k4="0" result="shaded" />
      <feComposite in="shaded" in2="SourceAlpha" operator="in" result="lit" />
      <feMerge><feMergeNode in="shadow" /><feMergeNode in="lit" /></feMerge>
    </filter>
  ),
  // the ink stays ink, everything else turns white
  sketch: (
    <filter id="gi-sketch" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="lum" />
      <feComponentTransfer in="lum" result="dark"><feFuncA type="discrete" tableValues="1 1 0 0 0 0 0" /></feComponentTransfer>
      <feComposite in="dark" in2="SourceAlpha" operator="in" result="darkIn" />
      <feFlood floodColor="#2E2140" result="inkC" />
      <feComposite in="inkC" in2="darkIn" operator="in" result="lines" />
      <feFlood floodColor="#FFFFFF" result="whiteC" />
      <feComposite in="whiteC" in2="SourceAlpha" operator="in" result="shapes" />
      <feMerge><feMergeNode in="shapes" /><feMergeNode in="lines" /></feMerge>
    </filter>
  ),
  // softer, lighter colours
  pastel: (
    <filter id="gi-pastel" colorInterpolationFilters="sRGB">
      <feColorMatrix type="saturate" values="0.55" result="calm" />
      <feComponentTransfer in="calm">
        <feFuncR type="linear" slope="0.78" intercept="0.2" />
        <feFuncG type="linear" slope="0.78" intercept="0.2" />
        <feFuncB type="linear" slope="0.78" intercept="0.2" />
      </feComponentTransfer>
    </filter>
  ),
};

// the emoji a game was stored with → its slug (⚡ is Tap Rush unless told otherwise)
const BY_EMOJI = {};
for (const g of GAMES) if (g.icon && !BY_EMOJI[g.icon]) BY_EMOJI[g.icon] = g.slug;

export const hasGameIcon = (slug) => !!ICONS[slug];

export default function GameIcon({ icon = "🎮", slug, look }) {
  const key = slug && ICONS[slug] ? slug : BY_EMOJI[icon];
  const pic = key && ICONS[key];
  if (!pic) return <>{icon || "🎮"}</>;
  const L = look || "light";
  if (L === "badge") {
    return (
      <svg className="game-icon" viewBox="-6 -6 76 76" width="1em" height="1em" aria-hidden="true" focusable="false">
        <circle cx="32" cy="34" r="35" fill="#2E2140" opacity="0.25" />
        <circle cx="32" cy="32" r="35" fill="#FFFFFF" stroke="#2E2140" strokeWidth="3.5" />
        <g transform="translate(7.5 7.5) scale(0.77)">{pic}</g>
      </svg>
    );
  }
  const light = L === "light" || L === "light3d";
  const f = FILTERS[L === "light3d" ? "soft" : L];
  const fid = L === "light3d" ? "soft" : L;
  return (
    <svg className={`game-icon${light ? " gi-light" : ""}`} viewBox={L === "soft" || L === "light3d" ? "-2 -2 68 68" : "0 0 64 64"} width="1em" height="1em" aria-hidden="true" focusable="false">
      {f && <defs>{f}</defs>}
      <g filter={f ? `url(#gi-${fid})` : undefined}>{pic}</g>
    </svg>
  );
}
