// src/components/games/TapRush.jsx
// A tile lights up: tap it fast. Hits in a row build a streak (×2, ×3, ×4);
// a bomb or a tile you let go out breaks it. Gold stars are worth a lot, ice
// takes two taps, a double lights two tiles at once. The run of tiles is
// seeded (tapRushRules.js), so a head-to-head race is fair; the reaction
// timing is each player's own. Points-in-time: the highest score wins.
//
// Play state lives in a ref (two taps in one tick must each see the other),
// mirrored into state to draw. Taps land on touch-down, not release: for a
// reaction game the click's delay is felt.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpectate from "./useSpectate";
import sfx from "./sfx";
import { GRID, buildSequence, multFor, windowFor, targetsOf, tapOn, timeOut, STREAK_STEP, MAX_MULT } from "./tapRushRules.js";

const ICON = { star: "⭐", gold: "🌟", ice: "🧊", double: "⭐", bomb: "💣" };

export default function TapRush(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null,
    spectatorState = null } = props;

  const seq = useMemo(() => buildSequence(seed), [seed]);

  const live = useRef({ step: 0, hits: 0, combo: 0, best: 0, ice: 0, done: [] });
  const [view, setView] = useState(() => ({ ...live.current }));
  const show = () => setView({ ...live.current, done: [...live.current.done] });

  // what's flying about: score pop-ups, spark bursts, the shake, a banner
  const [fx, setFx] = useState({ pops: [], bursts: [], shake: 0, banner: null });
  const fxId = useRef(0);
  const timers = useRef(new Set());
  const later = (fn, ms) => { const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms); timers.current.add(t); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function pop(pos, text, cls) {
    const id = ++fxId.current;
    setFx((f) => ({ ...f, pops: [...f.pops.slice(-5), { id, pos, text, cls }] }));
    later(() => setFx((f) => ({ ...f, pops: f.pops.filter((p) => p.id !== id) })), 800);
  }
  function burst(pos, cls) {
    const id = ++fxId.current;
    setFx((f) => ({ ...f, bursts: [...f.bursts.slice(-4), { id, pos, cls }] }));
    later(() => setFx((f) => ({ ...f, bursts: f.bursts.filter((p) => p.id !== id) })), 600);
  }
  function banner(text, cls) {
    const id = ++fxId.current;
    setFx((f) => ({ ...f, banner: { id, text, cls } }));
    later(() => setFx((f) => (f.banner && f.banner.id === id ? { ...f, banner: null } : f)), 1100);
  }

  // Watching draws the same board the player is on: the tiles are seeded, so
  // how far through them they are (and their streak) is the whole picture.
  const spectate = useSpectate({
    isSpectator, spectatorState,
    snapshot: () => ({ step: live.current.step, hits: live.current.hits, combo: live.current.combo, ice: live.current.ice, done: live.current.done }),
    apply: (st) => { Object.assign(live.current, { step: st.step || 0, hits: st.hits ?? 0, combo: st.combo ?? 0, ice: st.ice ?? 0, done: st.done || [] }); show(); },
  });

  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd,
    extraState: spectate.extraState });

  const item = seq[view.step % seq.length];
  const windowMs = windowFor(view.hits, item.kind);
  const mult = multFor(view.combo);
  const playing = !isSpectator && !eng.gameOver;

  // the tile goes out if you don't get to it
  useEffect(() => {
    if (!playing) return undefined;
    const t = setTimeout(() => {
      const r = timeOut(seq, live.current);
      if (r.dodged) { sfx.pop(0.7); pop(item.pos, "dodged", "tp-pop-dodge"); }
      else if (r.streakBroke) { sfx.thud(); banner("streak lost", "tp-banner-lost"); }
      show();
    }, windowMs);
    return () => clearTimeout(t);
    // only a new tile restarts the clock: cracking ice or hitting half a double keeps it
  }, [view.step, playing]);   // eslint-disable-line react-hooks/exhaustive-deps

  function tap(pos, e) {
    if (e) e.preventDefault();
    if (!playing) return;
    const L = live.current, was = seq[L.step % seq.length];
    const r = tapOn(seq, L, pos);
    if (!r) return;
    eng.addMove();
    if (r.points) eng.addScore(r.points);
    L.best = Math.max(L.best, L.combo);
    if (r.kind === "bomb") {
      sfx.boom(); burst(pos, "tp-burst-bomb");
      setFx((f) => ({ ...f, shake: f.shake + 1 }));
      pop(pos, String(r.points), "tp-pop-bad");
      if (r.streakBroke) banner("streak lost", "tp-banner-lost");
    } else if (r.cracked) {
      sfx.crack(); pop(pos, "crack!", "tp-pop-ice");
    } else {
      if (was.kind === "gold") sfx.sparkle(); else if (was.kind === "ice") sfx.crack();
      sfx.blip(1 + Math.min(L.combo, 20) * 0.035);
      burst(pos, was.kind === "gold" ? "tp-burst-gold" : was.kind === "ice" ? "tp-burst-ice" : "tp-burst");
      const applied = multFor(L.combo - 1);              // the multiplier these points were worked out with
      pop(pos, `+${r.points}${applied > 1 ? ` ×${applied}` : ""}`, was.kind === "gold" ? "tp-pop-gold" : "tp-pop");
      if (r.multUp) { sfx.chime(r.mult); banner(`×${r.mult} streak!`, `tp-banner-x${r.mult}`); }
    }
    show();
  }

  // the last ten seconds tick
  const secs = Math.ceil(eng.timeLeft);
  useEffect(() => { if (playing && !eng.unlimited && secs > 0 && secs <= 10) sfx.tick(secs <= 3); }, [secs, playing, eng.unlimited]);
  // a light beat underneath, quickening as the tiles do
  const tempo = useRef(100);
  tempo.current = Math.min(160, 96 + view.hits * 0.7 + mult * 4);
  useEffect(() => {
    if (!playing) return undefined;
    const b = sfx.beat(() => tempo.current, 0.8);
    return () => b.stop();
  }, [playing]);
  // the end: up if you're ahead, down if not
  const ended = useRef(false);
  useEffect(() => {
    if (!eng.gameOver || isSpectator || ended.current) return;
    ended.current = true;
    if (eng.won || eng.rank === 1) sfx.win(); else sfx.lose();
  }, [eng.gameOver, eng.won, eng.rank, isSpectator]);

  const oppList = Object.values(eng.opponents);
  const specScore = spectatorWatching?.score ?? 0;
  const stats = isSpectator
    ? [{ label: "Score", value: Number(specScore).toLocaleString() }, { label: "Streak", value: `×${mult}` }]
    : [{ label: "Score", value: eng.score.toLocaleString() }, { label: "Streak", value: view.combo ? `${view.combo} ×${mult}` : "—" }];

  const targets = targetsOf(item, view.done);
  const toNext = view.combo % STREAK_STEP, atMax = mult >= MAX_MULT;

  return (
    <>
      <GameFrame
        gameName="Tap Rush" badge="⚡ TAP RUSH"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        onQuit={eng.endMatch}
        sound
      >
        {({ w, h }) => {
          // A square grid as big as the board area allows, with room for the streak meter.
          const side = Math.floor(Math.max(150, Math.min(w, h - 86, 440)));
          const gap = Math.max(8, Math.round(side * 0.035));
          return (
            <div className="tp-wrap" style={{ width: side }}>
              <div className="muted eyebrow" style={{ textAlign: "center" }}>Tap the stars · 🧊 twice · leave the 💣</div>
              {/* a bomb shakes it: two identical animations, swapped, so it replays without rebuilding the grid */}
              <div className={`taprush-grid tp-grid${fx.shake ? (fx.shake % 2 ? " tp-shakeA" : " tp-shakeB") : ""}${mult >= 3 ? ` tp-hot${mult}` : ""}`} style={{ width: side, gap }}>
                {Array.from({ length: GRID }).map((_, pos) => {
                  const lit = targets.includes(pos);
                  const kind = lit ? item.kind : null;
                  const cracked = lit && kind === "ice" && view.ice > 0;
                  const cls = ["taptile", "tp-tile", lit ? "lit" : "", kind ? `tp-${kind}` : "", cracked ? "tp-cracked" : ""].filter(Boolean).join(" ");
                  return (
                    <button key={pos} className={cls} onPointerDown={(e) => tap(pos, e)} onClick={(e) => e.preventDefault()}
                      aria-label={kind ? kind : "Empty"} style={{ fontSize: Math.round(side * 0.13) }}>
                      {lit && <span className="tp-icon">{ICON[kind]}</span>}
                      {/* how long it has left: a bar draining along the bottom */}
                      {lit && playing && <span key={view.step} className="tp-ring" style={{ animationDuration: `${windowMs}ms` }} />}
                      {fx.bursts.filter((b) => b.pos === pos).map((b) => (
                        <span key={b.id} className={`tp-burst ${b.cls}`}>{Array.from({ length: 8 }).map((__, i) => <i key={i} style={{ "--a": `${i * 45}deg` }} />)}</span>
                      ))}
                      {fx.pops.filter((p) => p.pos === pos).map((p) => <span key={p.id} className={`tp-pop ${p.cls}`}>{p.text}</span>)}
                    </button>
                  );
                })}
              </div>
              {/* the streak: five in a row moves you up a multiplier */}
              <div className={`tp-meter${atMax ? " max" : ""}`}>
                <span className="tp-mult">×{mult}</span>
                <span className="tp-bar"><i style={{ width: `${atMax ? 100 : (toNext / STREAK_STEP) * 100}%` }} /></span>
                <span className="tp-best">best {view.best || view.combo}</span>
              </div>
              {fx.banner && <div key={fx.banner.id} className={`tp-banner ${fx.banner.cls}`}>{fx.banner.text}</div>}
            </div>
          );
        }}
      </GameFrame>

      {eng.gameOver && !isSpectator && <GameOver eng={eng} me={currentUser} />}
    </>
  );
}
