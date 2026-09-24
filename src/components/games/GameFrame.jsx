// src/components/games/GameFrame.jsx
// Full-screen chrome shared by every game: header (clock, stats, friends,
// quit), live opponent strip, board area and a controls strip.
//
// The board area is measured and handed to the game as a render prop,
// `{({ w, h }) => …}`, so each game sizes its pieces to the space that's
// actually left: phone, tablet or laptop, portrait or landscape. Nothing
// ever needs scrolling.
import React, { useLayoutEffect, useRef, useState } from "react";
import Logo from "../Logo";
import FriendsDock from "../FriendsDock";
import { ProgressRing, Avatar } from "../ui";
import useMedia from "../../utils/useMedia";

const COMPACT = "(max-width: 600px)";

// A first guess before the real measurement, so the first frame is close.
const guess = () => (typeof window === "undefined"
  ? { w: 360, h: 480 }
  : { w: Math.max(0, window.innerWidth - 24), h: Math.max(0, window.innerHeight - 170) });

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Matches the waiting room's team colours and names.
const TEAM_NAMES = ["Red", "Yellow", "Blue", "Green"];
const TEAM_COLOURS = ["var(--coral)", "var(--sun)", "var(--sky)", "var(--mint)"];

export default function GameFrame({
  gameName,
  badge,
  isSpectator = false,
  spectatorName = "",
  stats = [],                 // [{ label, value, urgent }]
  timer,                      // { value, max } seconds — renders the ring
  opponents = [],             // [{ user_id, username, avatar, score }]
  teams = null,               // [{ team, total, members, mine }] in a team room, else null
  message = null,             // { text, type }
  controls = null,            // node
  onQuit,
  children,                   // node, or ({ w, h }) => node
}) {
  const msgFill = { success: "var(--lime)", error: "var(--coral)", info: "var(--sky)" };
  const compact = useMedia(COMPACT);
  const boardRef = useRef(null);
  const [size, setSize] = useState(guess);

  // A game owns the whole screen: stop the page behind it from scrolling, so
  // the header can't be pushed out of sight on a phone.
  useLayoutEffect(() => {
    document.body.classList.add("in-game");
    return () => document.body.classList.remove("in-game");
  }, []);

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const measure = () => {
      const cs = getComputedStyle(el);
      const w = Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
      const h = Math.floor(el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const mins = timer?.max ? Math.round(timer.max / 60) : null;

  return (
    <div className="gameshell">
      {/* Header: one row on a phone, roomier on bigger screens */}
      <div className="gamebar">
        <div className={`gb-id${isSpectator ? " keep" : ""}`}>
          <Logo size="sm" showText={false} />
          <span className="chip c-sun">
            {isSpectator ? `👀 Watching ${spectatorName}` : badge || gameName}
            {!isSpectator && mins ? ` · ${mins} MIN` : ""}
          </span>
        </div>

        <div className="gb-stats">
          {timer && (
            <span title={mins ? `${mins}-minute match` : undefined} style={{ display: "inline-flex" }}>
              <ProgressRing
                value={timer.value} max={timer.max} size={compact ? 44 : 54} stroke={compact ? 4 : 5}
                urgent={timer.value <= 20}
                label={clock(timer.value)}
              />
            </span>
          )}
          {stats.map((s) => (
            <div key={s.label} className="gb-stat">
              <div className="display gb-v" style={{ color: s.urgent ? "var(--coral)" : "var(--ink)" }}>
                {s.value}
              </div>
              <div className="muted gb-l">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="gb-end">
          <FriendsDock max={compact ? 2 : 3} size={compact ? 26 : 30} />
          <button className="press p-white sm gb-quit" onClick={onQuit} aria-label={isSpectator ? "Leave" : "Quit"}>
            <span className="gb-quit-ic">{isSpectator ? "← " : "🚪 "}</span>{isSpectator ? "Leave" : "Quit"}
          </button>
        </div>
      </div>

      {/* In a team room the sides come first: your own score matters, but the
          number that decides the match is your side's total. Sizes are shown
          because a bigger side is an advantage under a straight total. */}
      {teams && teams.length > 0 && (
        <div className="gamerow teamrow">
          {teams.map((t, i) => (
            <div key={t.team} className={`teamscore${t.mine ? " mine" : ""}`}
              style={{ background: TEAM_COLOURS[(t.team - 1) % TEAM_COLOURS.length] }}>
              <span className="ts-name">
                {i === 0 && teams.length > 1 && teams[0].total > teams[1].total ? "👑 " : ""}
                {TEAM_NAMES[(t.team - 1) % TEAM_NAMES.length]}
                {t.mine && " (you)"}
              </span>
              <span className="ts-total">{Number(t.total).toLocaleString()}</span>
              <span className="ts-size">{t.members}p</span>
            </div>
          ))}
        </div>
      )}

      {/* Opponent strip: a single row that swipes sideways on a phone */}
      {opponents.length > 0 && (
        <div className="gamerow">
          {opponents.map((p) => (
            <div key={p.user_id} className="oppcard">
              <Avatar emoji={p.avatar} size={compact ? 26 : 32} seed={p.user_id} />
              <div style={{ minWidth: 0 }}>
                <div className="truncate opp-name">{p.username}</div>
                <div className="muted opp-pts">{Number(p.score ?? 0).toLocaleString()} pts</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Board. The message floats over it instead of pushing it down, so the
          board never jumps under the player's finger. */}
      <div className="gameboard" ref={boardRef}>
        {message && (
          <div key={message.text} className="gamemsg" style={{ background: msgFill[message.type] || msgFill.info }}>
            {message.text}
          </div>
        )}
        {typeof children === "function" ? children(size) : children}
      </div>

      {controls && <div className="gamefoot">{controls}</div>}
    </div>
  );
}
