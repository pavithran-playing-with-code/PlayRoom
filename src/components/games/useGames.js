// src/components/games/useGames.js
// The games, in the order the database says (game_types.sort_order, served by
// GET /api/games). Reordering the lobby is an UPDATE, not a deploy.
//
// registry.js still says what each game *is* — its component, colour, blurb.
// The database only says where it goes. A game the database doesn't list
// (not set up there yet, say) keeps its registry position, after the rest.
//
// The last order seen is kept on the device, so a returning visitor's page
// comes up in the right order straight away instead of reshuffling once the
// request lands. Asked once per page load and shared by every caller.
import { useEffect, useState } from "react";
import { api } from "../../utils/api";
import { GAMES } from "./registry";

const KEY = "pr_game_order";
let asked = null;

const saved = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : null;
  } catch { return null; }
};

function askServer() {
  if (!asked) {
    asked = api.get("/api/games")
      .then((r) => r.json())
      .then((d) => {
        if (!d || !d.success || !Array.isArray(d.games)) return null;
        const slugs = d.games.map((g) => g.slug);
        try { localStorage.setItem(KEY, JSON.stringify(slugs)); } catch { /* private window */ }
        return slugs;
      })
      .catch(() => { asked = null; return null; });    // offline: try again next time
  }
  return asked;
}

// Registry games, sorted by where their slug sits in `slugs`.
export function orderGames(slugs) {
  if (!Array.isArray(slugs) || !slugs.length) return GAMES;
  const rank = new Map(slugs.map((s, i) => [s, i]));
  const at = (g, i) => (rank.has(g.slug) ? rank.get(g.slug) : slugs.length + i);
  return GAMES.map((g, i) => [g, at(g, i)]).sort((a, b) => a[1] - b[1]).map(([g]) => g);
}

export default function useGames() {
  const [slugs, setSlugs] = useState(saved);
  useEffect(() => {
    let alive = true;
    askServer().then((s) => {
      if (alive && s && JSON.stringify(s) !== JSON.stringify(slugs)) setSlugs(s);
    });
    return () => { alive = false; };
    // once per mount: the answer is shared, and `slugs` only ever follows it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return orderGames(slugs);
}
