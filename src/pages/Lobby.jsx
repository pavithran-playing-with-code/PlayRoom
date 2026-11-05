// src/pages/Lobby.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { shelve } from "../components/games/shelves";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { GAME_MAP } from "../components/games/registry";
import useGames from "../components/games/useGames";
import { useToast } from "../components/ui";
import GameIcon from "../components/games/GameIcon";
import { SONGS, LEVELS } from "../components/games/pianoSongs";
import HowTo from "../components/games/HowTo";

// The little crew that fills up as you add seats.
const CREW = ["🐯", "🐼", "🦊", "🐸", "🌸", "🚀", "🐙", "🦁"];
const CREW_COLS = ["var(--sun)", "var(--sky)", "var(--coral)", "var(--mint)",
  "var(--bubble)", "var(--lime)", "var(--peach)", "var(--berry)"];

// 0 is unlimited: no clock, the match ends when its players leave
const DURATIONS = [
  { s: 120, label: "2 min" },
  { s: 300, label: "5 min" },
  { s: 0, label: "♾️", name: "Unlimited" },        // the icon alone: the word didn't fit a phone's button
];
const lengthText = (secs) => (secs === 0 ? "no time limit" : `${Math.round(secs / 60)} min`);

// The Play tab. Games on shelves you swipe sideways; tap one and its settings
// slide up from the bottom with Start pinned under your thumb — no scrolling
// past every option to find it. Joining someone else's room is /rooms.
export default function Lobby() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  // The open game lives in the URL (?game=arrows): a game card on the home
  // page opens its sheet straight away, a refresh keeps it, and Back closes
  // it. Games in the database's order (game_types.sort_order).
  const GAMES = useGames();
  const [params, setParams] = useSearchParams();
  const sheetOpen = !!GAME_MAP[params.get("game")];
  const game = sheetOpen ? params.get("game") : GAMES[0].slug;
  // Opened here: a history entry of ours, so closing is Back. Arrived with
  // it (from Home, a refresh): closing just clears it.
  const pushed = useRef(false);
  const openGame = (slug) => { pushed.current = true; setParams({ game: slug }); };
  const closeSheet = () => {
    if (pushed.current) { pushed.current = false; navigate(-1); }
    else setParams({}, { replace: true });
  };

  const [onlyTogether, setOnlyTogether] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [duration, setDuration] = useState(120);
  const [isPrivate, setIsPrivate] = useState(false);
  const [teamMode, setTeamMode] = useState(false);
  const [coopMode, setCoopMode] = useState(false);
  const [song, setSong] = useState(0);             // Piano Tiles: which song
  const [creating, setCreating] = useState(false);
  const [openRooms, setOpenRooms] = useState(0);

  const selected = GAME_MAP[game] || GAMES[0];
  // Solo = 1 seat. Nobody can join, so the room is implicitly private and the
  // privacy toggle is hidden rather than shown as a no-op.
  const isSolo = maxPlayers === 1;
  const length = lengthText(duration);
  // Two sides of two is the smallest team match worth the name.
  const MIN_TEAM_SEATS = 4;
  const canTeam = maxPlayers >= MIN_TEAM_SEATS;
  const teams = teamMode && canTeam;
  // Playing together: only games that have a side to be on, 2 up to their cap.
  const coopMax = selected.coopMax || 0;
  const canCoop = coopMax > 0 && maxPlayers >= 2 && maxPlayers <= coopMax;
  const coop = coopMode && canCoop && !teams;

  // Keep maxPlayers valid when switching games.
  useEffect(() => {
    setMaxPlayers((mp) => Math.min(mp, selected.maxPlayers));
  }, [selected.maxPlayers]);

  // Dropping below four seats leaves no room for two teams.
  useEffect(() => {
    if (!canTeam) setTeamMode(false);
  }, [canTeam]);

  // Some games want a longer clock (a house takes a while to search).
  useEffect(() => {
    if (selected.defaultDuration != null) setDuration(selected.defaultDuration);
  }, [selected.slug, selected.defaultDuration]);

  // Play as a team starts ticked for the games made for it (coopDefault:
  // Kitchen Rush, Station 13, Sunshard Jump), and for any game picked while
  // the shelves show team games only; for the rest you tick it.
  useEffect(() => {
    if (selected.coopDefault || onlyTogether) { setCoopMode(true); setTeamMode(false); } else setCoopMode(false);
  }, [selected.slug, selected.coopDefault, onlyTogether]);

  // The sheet holds the page still behind it, and Escape closes it.
  useEffect(() => {
    if (!sheetOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") closeSheet(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
    // closeSheet only reads a ref and the router
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen]);

  // How many open rooms there are, once, for the nudge toward the Rooms tab.
  // (The Rooms tab keeps itself fresh; this page doesn't poll.)
  useEffect(() => {
    let alive = true;
    api.get("/api/rooms").then((r) => r.json())
      .then((d) => { if (alive && d.success) setOpenRooms(d.rooms.length); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await api.post("/api/rooms", {
        game_slug: game, max_players: maxPlayers,
        is_private: isSolo ? true : isPrivate,   // solo rooms are never listed
        duration_seconds: duration,
        mode: teams ? "teams" : coop ? "coop" : "free",
        ...(game === "piano" ? { song } : {}),
      });
      const data = await res.json();
      if (!data.success) { toast.error(data.message || "Failed to create room."); return; }
      // Solo: you've already pressed Start, so start it — straight into the
      // game, no waiting room on the way. (If that fails, the room's own
      // Start button is still there.)
      if (isSolo) { try { await api.patch(`/api/rooms/${data.room.room_code}/start`, {}); } catch { /* the room page can start it */ } }
      // In place of the open sheet: Back from the room comes to the shelves.
      navigate(`/room/${data.room.room_code}`, { replace: true });
    } catch { toast.error("Failed to create room."); }
    finally { setCreating(false); }
  }

  const shelves = shelve(GAMES.filter((g) => !onlyTogether || g.coopMax > 0));

  return (
    <div className="wrap play-wrap">
      <div className="mid">

        <div className="play-hi">
          <span className="face" style={{ width: 46, height: 46, fontSize: 23, background: "var(--sky)" }}>
            <span style={{ lineHeight: 1 }}>{user?.avatar || "🎮"}</span>
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1>Hey {user?.username}! 👋</h1>
            <p className="muted">Pick a game to play.</p>
          </div>
          <Link to="/rooms" className="press p-mint sm play-join">🔗 Join</Link>
        </div>

        {openRooms > 0 && (
          <Link to="/rooms" className="play-nudge">
            <span>🌐 <b>{openRooms}</b> open room{openRooms > 1 ? "s" : ""} you can hop into</span>
            <span aria-hidden="true">→</span>
          </Link>
        )}

        {/* Which games can be played as a team is there when you ask for it —
            a toggle that narrows the shelves — not a badge on every card. */}
        <div className="play-filter">
          <button type="button" className={`chip lb-together${onlyTogether ? " on" : ""}`} aria-pressed={onlyTogether}
            onClick={() => setOnlyTogether((o) => !o)}>
            🤝 Team games only{onlyTogether ? " ✓" : ""}
          </button>
        </div>

        {shelves.map((row) => (
          <section key={row.key} className="shelf">
            <h2 className="shelf-h">{row.title}<span className="muted">{row.games.length}</span></h2>
            <div className="shelf-row">
              {row.games.map((g) => (
                <button key={g.slug} type="button" className="press shelf-card" data-game={g.slug}
                  style={{ background: g.col }} onClick={() => openGame(g.slug)}>
                  <span className="shelf-ic"><GameIcon icon={g.icon} /></span>
                  <span className="shelf-name">{g.name}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {sheetOpen && (
        <div className="lsheet-scrim" onClick={closeSheet}>
          <div className="lsheet" role="dialog" aria-modal="true" aria-label={`Start ${selected.name}`}
            onClick={(e) => e.stopPropagation()}>
            <div className="lsheet-head" style={{ background: selected.col }}>
              <span className="lsheet-ic"><GameIcon icon={selected.icon} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2>{selected.name}</h2>
                {selected.blurb && <p>{selected.blurb}</p>}
              </div>
              <button type="button" className="lsheet-x" onClick={closeSheet} aria-label="Close">✕</button>
            </div>

            <div className="lsheet-body">
              {/* an endless game (Station 13, Sunshard Jump, Emberfall) has no clock to pick */}
              {!selected.endless && (
                <>
                  <div className="lsheet-lbl">⏱️ Clock</div>
                  <div className="durrow">
                    {DURATIONS.map((d) => (
                      <button key={d.s} className="press dur p-white" aria-pressed={duration === d.s}
                        aria-label={d.name} title={d.name} onClick={() => setDuration(d.s)}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="lsheet-lbl">👥 Players</div>
              {/* Solo and 2 are the usual picks, so they're one tap. Past that,
                  the crew grows a face at a time up to 8. */}
              <div className="seatpick" id="seats">
                <button className="press seat p-white" aria-pressed={maxPlayers === 1}
                  onClick={() => setMaxPlayers(1)}>🧍 Solo</button>
                {/* a solo-only game (Emberfall, for now) offers just Solo */}
                {selected.maxPlayers >= 2 && <button className="press seat p-white" aria-pressed={maxPlayers === 2}
                  onClick={() => setMaxPlayers(2)}>👥 2</button>}
                {selected.maxPlayers < 3 ? null : maxPlayers < 3 ? (
                  <button className="press seat p-white" onClick={() => setMaxPlayers(3)}
                    aria-label="More players">➕ More</button>
                ) : (
                  <span className="seatstep">
                    <button className="press p-white step" aria-label="One player fewer"
                      onClick={() => setMaxPlayers(maxPlayers - 1)}>–</button>
                    <span className="seatcrew" aria-hidden="true">
                      {Array.from({ length: maxPlayers }).map((_, i) => (
                        <span key={i} className="face"
                          style={{ background: CREW_COLS[i % CREW_COLS.length], zIndex: 9 - i }}>
                          {CREW[i % CREW.length]}
                        </span>
                      ))}
                    </span>
                    <strong>{maxPlayers}</strong>
                    <button className="press p-white step" aria-label="One player more"
                      disabled={maxPlayers >= (coop ? coopMax : selected.maxPlayers)}
                      onClick={() => setMaxPlayers(Math.min(coop ? coopMax : selected.maxPlayers, maxPlayers + 1))}>+</button>
                  </span>
                )}
              </div>
              <div className="muted seathint">
                {isSolo
                  ? (selected.maxPlayers === 1 ? "🧍 Solo — this game is played alone for now."
                    : selected.endless ? "🧍 Solo — no clock, play as long as you like." : "🧍 Solo — just you and the clock.")
                  : `👥 ${maxPlayers} players — everyone has to join before the game can start.`}
              </div>

              {/* Private and teams mean nothing for a solo run, so they're not asked. */}
              {!isSolo && (
                <div className="opts">
                  <label className={`opt${isPrivate ? " on" : ""}`}>
                    <span className="opt-ico" aria-hidden="true">🔒</span>
                    <span className="opt-txt">Keep it private<small>Only people you invite can join</small></span>
                    <input type="checkbox" className="switch" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                  </label>
                  {/* Together: one side against the game. */}
                  {coopMax > 0 && (
                    <label className={`opt${coop ? " on" : ""}${canCoop ? "" : " off"}`}>
                      <span className="opt-ico" aria-hidden="true">🤝</span>
                      <span className="opt-txt">Play as a team
                        <small>{canCoop ? (selected.coopLabel || "All of you on one side") : `2 to ${coopMax} players`}</small></span>
                      <input type="checkbox" className="switch" checked={coop} disabled={!canCoop}
                        onChange={(e) => { setCoopMode(e.target.checked); if (e.target.checked) setTeamMode(false); }} />
                    </label>
                  )}
                  {/* Two sides of two: offered only once there are four seats. */}
                  {canTeam && (
                    <label className={`opt${teams ? " on" : ""}`}>
                      <span className="opt-ico" aria-hidden="true">⚔️</span>
                      <span className="opt-txt">Team match<small>Play as sides — highest total wins</small></span>
                      <input type="checkbox" className="switch" checked={teams}
                        onChange={(e) => { setTeamMode(e.target.checked); if (e.target.checked) setCoopMode(false); }} />
                    </label>
                  )}
                </div>
              )}

              {/* Piano Tiles: pick the song — everyone in the room plays it */}
              {game === "piano" && (
                <div className="pt-songs" role="radiogroup" aria-label="Pick a song">
                  {SONGS.map((sg, i) => (
                    <button key={sg.name} type="button" role="radio" aria-checked={song === i}
                      className={`pt-song${song === i ? " on" : ""}`} onClick={() => setSong(i)}>
                      <span className="pt-song-ic">{sg.icon}</span>
                      <b>{sg.name}</b>
                      <span className={`pt-lvl lvl-${sg.level}`}>{LEVELS[sg.level].label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* How to play it, before you start — folded away until asked for */}
              <details className="howto-box">
                <summary>📖 How to play</summary>
                <HowTo game={selected.slug} title={false} />
              </details>
            </div>

            {/* Always in reach: what you're about to make, and the button. */}
            <div className="lsheet-foot">
              <div className="lobby-sum" aria-live="polite">
                {!selected.endless && <span className="chip c-sky">{duration === 0 ? "♾️ No limit" : `⏱️ ${length}`}</span>}
                <span className="chip c-lime">{isSolo ? "🧍 Solo" : `👥 ${maxPlayers} players`}</span>
                {!isSolo && isPrivate && <span className="chip c-sun">🔒 Private</span>}
                {teams && <span className="chip c-grape">⚔️ Teams</span>}
                {coop && <span className="chip c-grape">🤝 Team</span>}
                {game === "piano" && <span className="chip c-sun">{SONGS[song].icon} {SONGS[song].name}</span>}
              </div>
              <button className="press p-coral lg full" id="createBtn" onClick={handleCreate} disabled={creating}>
                {creating ? "Creating…" : isSolo ? "🎯 Start solo" : "🚀 Create room"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
