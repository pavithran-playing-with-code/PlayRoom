// src/pages/Lobby.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { SHELVES } from "../components/games/shelves";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { usePresence } from "../utils/PresenceContext";
import { useCall } from "../utils/CallContext";
import { presenceLabel } from "../utils/timeAgo";
import { readLastPlay, saveLastPlay } from "../utils/lastPlay";
import { GAME_MAP } from "../components/games/registry";
import useGames from "../components/games/useGames";
import { useToast, Avatar } from "../components/ui";
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
// The chips over the games: every game, a group, the team games, or search.
const CAT_LABEL = { quick: "⚡ Quick", puzzle: "🧩 Puzzles", action: "🏁 Racing", big: "🌋 Adventures" };
const CATS = [{ key: "all", label: "🎲 All" },
  ...SHELVES.map((s) => ({ key: s.key, label: CAT_LABEL[s.key] || s.title })),
  { key: "team", label: "🤝 Team" }];
const CAT_KEY = "pr_play_cat";
const savedCat = () => { try { const c = localStorage.getItem(CAT_KEY); return CATS.some((x) => x.key === c) ? c : "all"; } catch { return "all"; } };

const shortLen = (secs) => (secs === 0 ? "♾️" : `${Math.round(secs / 60)} min`);

// The Play tab: friends online at the top (tap one to invite them into
// whatever you pick), your last match one tap away, then every game as an
// icon tile, in its group, with a search. Tapping a game slides
// its settings up from the bottom with Start pinned under your thumb.
// Joining someone else's room is /rooms.
export default function Lobby() {
  const { user } = useAuth();
  const { friends } = usePresence();
  const { call: onCall, startCall } = useCall();
  const navigate = useNavigate();
  const toast = useToast();
  const last = useRef(readLastPlay()).current;

  // The open game lives in the URL (?game=arrows): a game card on the home
  // page opens its sheet straight away, a refresh keeps
  // it, and Back closes it. Games in the database's order.
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

  // Which chip is on, remembered on this phone. "Team" shows the games you
  // can play as a team, and ticks Play as a team in their sheet.
  const [cat, setCatState] = useState(savedCat);
  const setCat = (c) => { setCatState(c); try { localStorage.setItem(CAT_KEY, c); } catch { /* private window */ } };
  const onlyTogether = cat === "team";
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  // Your last settings come back with you.
  const [maxPlayers, setMaxPlayers] = useState(last?.maxPlayers || 2);
  const [duration, setDuration] = useState(last?.duration ?? 120);
  const [isPrivate, setIsPrivate] = useState(!!last?.isPrivate);
  const [teamMode, setTeamMode] = useState(false);
  const [coopMode, setCoopMode] = useState(false);
  const [song, setSong] = useState(0);             // Piano Tiles: which song
  const [creating, setCreating] = useState(false);
  const [openRooms, setOpenRooms] = useState(0);
  // A friend tapped in the strip: whatever you start next, they're invited.
  const [invitee, setInvitee] = useState(null);
  // A friend tapped in the strip: their card (call, invite, watch) is open.
  const [pickedId, setPickedId] = useState(null);
  const [watching, setWatching] = useState(false);

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

  // Inviting someone: a solo room has no seat for them.
  useEffect(() => {
    if (invitee && sheetOpen && selected.maxPlayers >= 2) setMaxPlayers((mp) => Math.max(mp, 2));
  }, [invitee, sheetOpen, selected.maxPlayers]);

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
  // showing team games only; for the rest you tick it.
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

  // Make the room (and start it, solo), invite whoever was picked, go in.
  async function createRoom(s) {
    setCreating(true);
    try {
      const solo = s.maxPlayers === 1;
      const res = await api.post("/api/rooms", {
        game_slug: s.slug, max_players: s.maxPlayers,
        is_private: solo ? true : s.isPrivate,   // solo rooms are never listed
        duration_seconds: s.duration,
        mode: s.mode,
        ...(s.slug === "piano" ? { song: s.song || 0 } : {}),
      });
      const data = await res.json();
      if (!data.success) { toast.error(data.message || "Failed to create room."); return; }
      const code = data.room.room_code;
      saveLastPlay(s);
      // Solo: you've already pressed Start, so start it — straight into the
      // game, no waiting room on the way. (If that fails, the room's own
      // Start button is still there.)
      if (solo) { try { await api.patch(`/api/rooms/${code}/start`, {}); } catch { /* the room page can start it */ } }
      else if (invitee) {
        try {
          const r = await api.post(`/api/rooms/${code}/invite`, { user_id: invitee.id });
          const d = await r.json();
          if (d.success) toast.success(`Invited ${invitee.username}`);
          else toast.error(d.message || `Couldn't invite ${invitee.username}.`);
        } catch { toast.error(`Couldn't invite ${invitee.username}.`); }
      }
      // In place of the open sheet: Back from the room comes to this page.
      navigate(`/room/${code}`, { replace: sheetOpen });
    } catch { toast.error("Failed to create room."); }
    finally { setCreating(false); }
  }

  // Drop in on a friend's match: joining a room under way seats you as a
  // spectator (the same call the friends dock makes).
  async function watch(f) {
    const code = f.playing?.room_code;
    if (!code || watching) return;
    setWatching(true);
    try {
      const res = await api.post("/api/rooms/join", { room_code: code });
      const data = await res.json();
      if (data.success) navigate(`/room/${code}?watch=${f.id}`);
      else toast.error(data.message || "Couldn't watch right now.");
    } catch { toast.error("Couldn't watch right now."); }
    finally { setWatching(false); }
  }

  function inviteToGame(f) {
    setInvitee(f);
    setPickedId(null);
    setTimeout(() => document.getElementById("qp-games")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const handleCreate = () => createRoom({
    slug: game, maxPlayers, duration, isPrivate, song,
    mode: teams ? "teams" : coop ? "coop" : "free",
  });

  const lastGame = last && GAME_MAP[last.slug];
  const q = searching ? query.trim().toLowerCase() : "";
  const shelf = SHELVES.find((x) => x.key === cat);
  // Searching looks through every game; otherwise the chip decides.
  const shown = q ? GAMES.filter((g) => g.name.toLowerCase().includes(q))
    : cat === "team" ? GAMES.filter((g) => g.coopMax > 0)
    : shelf ? GAMES.filter((g) => shelf.games.includes(g.slug))
    : GAMES;
  const online = friends.filter((f) => f.online);
  const strip = online.length ? online : friends.slice(0, 8);
  const picked = friends.find((f) => f.id === pickedId) || null;

  return (
    <div className="wrap play-wrap">
      <div className="mid">

        <div className="play-hi">
          <span className="face" style={{ width: 46, height: 46, fontSize: 23, background: "var(--sky)" }}>
            <span style={{ lineHeight: 1 }}>{user?.avatar || "🎮"}</span>
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1>Hey {user?.username}! 👋</h1>
            <p className="muted">Who are we beating today?</p>
          </div>
          <Link to="/rooms" className="press p-mint sm play-join">🔗 Join</Link>
        </div>

        {/* Friends: online first. Tap one for their card: call them, invite
            them into a game, or watch the match they're in. */}
        {friends.length > 0 && (
          <section className="pc-sec">
            <div className="pc-friends">
              <span className="pc-friends-l">{online.length ? <>🟢<b>{online.length}</b></> : "👥"}</span>
              {strip.map((f) => {
                const on = pickedId === f.id || invitee?.id === f.id;
                return (
                  <button key={f.id} type="button" className={`pc-friend${on ? " on" : ""}`} aria-pressed={on}
                    aria-expanded={pickedId === f.id} aria-label={`${f.username}, ${presenceLabel(f)}`}
                    onClick={() => setPickedId((v) => (v === f.id ? null : f.id))}>
                    <Avatar emoji={f.avatar} size={42} seed={f.id} online={f.online} className={f.online ? "" : "is-off"} />
                    <span>{f.username}</span>
                  </button>
                );
              })}
            </div>
            {picked ? (
              <div className="qp-fcard">
                <div className="qp-fcard-top">
                  <Avatar emoji={picked.avatar} size={40} seed={picked.id} online={picked.online} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b>{picked.username}</b>
                    <small className="muted">
                      {picked.playing ? <>Playing <GameIcon icon={picked.playing.game_icon} /> {picked.playing.game_name}</> : presenceLabel(picked)}
                    </small>
                  </div>
                  <button type="button" className="qp-x" onClick={() => setPickedId(null)} aria-label="Close">✕</button>
                </div>
                <div className="qp-fcard-acts">
                  <button type="button" className="press p-lime sm" onClick={() => { startCall(picked); setPickedId(null); }}
                    disabled={!!onCall && onCall.members.some((m) => Number(m.id) === Number(picked.id))}>📞 Call</button>
                  <button type="button" className="press p-sun sm" onClick={() => inviteToGame(picked)}>💌 Invite to a game</button>
                  {picked.playing && (
                    <button type="button" className="press p-sky sm" onClick={() => watch(picked)} disabled={watching}>
                      {watching ? "…" : "👁️ Watch"}
                    </button>
                  )}
                </div>
              </div>
            ) : invitee ? (
              <div className="qp-inviting">
                <span>💌 Pick a game to play with <b>{invitee.username}</b></span>
                <button type="button" onClick={() => setInvitee(null)} aria-label="Stop inviting">✕</button>
              </div>
            ) : null}
          </section>
        )}

        {openRooms > 0 && (
          <Link to="/rooms" className="play-nudge">
            <span>🌐 <b>{openRooms}</b> open room{openRooms > 1 ? "s" : ""} you can hop into</span>
            <span aria-hidden="true">→</span>
          </Link>
        )}

        {/* Your last match, one tap from playing again with the same settings. */}
        {lastGame && (
          <div className="pc-again" style={{ background: lastGame.col }}>
            <button type="button" className="pc-again-info" onClick={() => openGame(lastGame.slug)}
              aria-label={`Change settings for ${lastGame.name}`}>
              <span className="pc-again-ic"><GameIcon icon={lastGame.icon} /></span>
              <span className="pc-again-txt">
                <small>Play again</small>
                <b>{lastGame.name}</b>
              </span>
              <span className="pc-again-set">
                {last.maxPlayers === 1 ? "🧍" : `👥${last.maxPlayers}`}
                {!lastGame.endless && ` · ${shortLen(last.duration)}`}
              </span>
            </button>
            <button type="button" className="press p-coral pc-again-go" disabled={creating}
              onClick={() => createRoom(last)} aria-label={`Play ${lastGame.name} again`}>{creating ? "…" : "▶"}</button>
          </div>
        )}

        <section className="pc-sec" id="qp-games">
          <div className="pc-cats" role="tablist" aria-label="Game groups">
            {CATS.map((c) => (
              <button key={c.key} type="button" role="tab" aria-selected={!searching && cat === c.key}
                className={`pc-cat${!searching && cat === c.key ? " on" : ""}`}
                onClick={() => { setSearching(false); setQuery(""); setCat(c.key); }}>{c.label}</button>
            ))}
            <button type="button" className={`pc-cat${searching ? " on" : ""}`} aria-pressed={searching} aria-label="Search games"
              onClick={() => { setSearching((x) => !x); setQuery(""); }}>🔍</button>
          </div>
          {searching && (
            <label className="pc-search">
              <span aria-hidden="true">🔍</span>
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a game" aria-label="Find a game" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear">✕</button>}
            </label>
          )}
          {shown.length === 0 ? (
            <p className="muted" style={{ padding: "18px 4px" }}>No game called “{query}”.</p>
          ) : (
            <div className="pc-grid">
              {shown.map((g) => (
                <button key={g.slug} type="button" className="pc-tile" data-game={g.slug} onClick={() => openGame(g.slug)}>
                  <span className="pc-tile-ic" style={{ background: g.col }}><GameIcon icon={g.icon} /></span>
                  <span className="pc-tile-name">{g.name}</span>
                </button>
              ))}
            </div>
          )}
        </section>
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
              {invitee && !isSolo && (
                <div className="qp-inviting" style={{ marginBottom: 16 }}>
                  <span>💌 <b>{invitee.username}</b> gets an invite when you create it</span>
                  <button type="button" onClick={() => setInvitee(null)} aria-label="Stop inviting">✕</button>
                </div>
              )}

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
                {!isSolo && invitee && <span className="chip c-coral">💌 {invitee.username}</span>}
                {game === "piano" && <span className="chip c-sun">{SONGS[song].icon} {SONGS[song].name}</span>}
              </div>
              <button className="press p-coral lg full" id="createBtn" onClick={handleCreate} disabled={creating}>
                {creating ? "Creating…" : isSolo ? "🎯 Start solo" : invitee ? `🚀 Create & invite` : "🚀 Create room"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
