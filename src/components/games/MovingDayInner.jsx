// src/components/games/MovingDayInner.jsx
// MOVING DAY — get everything out of the house and into the van before the
// clock runs out. Solo, against friends (a house each, the same furniture),
// in teams, or together in one house — the big things need two of you.
//
// The server runs the house (config/togetherWorld.js, rules in
// together/movingCore.mjs): what's where, who holds what, what flew, what
// broke, the score. This phone moves its own mover at once (and tells the
// server where it is), sends Grab and Throw, and draws the house in 3D
// (movingScene.js, the PlayRoom look kit) with everyone else eased between
// the server's ticks. Loaded lazily (three.js): MovingDay.jsx is the wrapper.
//
// Steer with the stick (or WASD / arrows); Grab with the button, Space or E;
// Throw with its button, Q or F.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import FloatStick from "../together/FloatStick";
import TogetherResults from "../together/TogetherResults";
import useTogether, { secondsLeft, smoothRows, rivals, myScore } from "../together/useTogether";
import { SPEED, SLOW_ALONE, SLOW_PAIR, SLOW_SMALL, STRETCH, REACH, KINDS, slide, ends } from "../together/movingCore.mjs";
import { createMovingScene } from "./movingScene";

const REPORT_MS = 66;
const STICK_R = 44;
const WHY = {
  nothing: "Nothing in reach — walk right up to it",
  big: "Too big to throw — carry it (a friend on the other end makes it quick)",
  empty: "Your hands are empty",
};

export default function MovingDayInner(props) {
  const { roomCode, currentUser, isSpectator = false, spectatorWatching = null, onGameEnd, durationSeconds = 120 } = props;
  const myId = Number(currentUser?.id);
  const me = useRef(null);                       // my mover, moved here at once
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, set: { w: 0, h: 0 } });
  const keys = useRef({});
  const stick = useRef(null);
  const knobRef = useRef(null);
  const sentAt = useRef(0);
  const hint = useRef({ fragile: false });
  const [msg, setMsg] = useState(null);
  const [hud, setHud] = useState({ left: durationSeconds, score: 0, stars: 0, items: 0, house: 0, rivals: [], holding: 0, big: false });
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type = "info", ms = 1100) => {
    setMsg({ text, type });
    timers.current.push(setTimeout(() => setMsg(null), ms));
  };

  const tg = useTogether({
    roomCode, watchId: spectatorWatching?.user_id ?? null,
    onInit: (init) => {
      const mine = init.view.p.find((p) => p[0] === myId);
      me.current = mine && init.role === "player" ? { x: mine[1], y: mine[2], fx: mine[3], fy: mine[4], moving: 0 } : null;
    },
    onTick: (v) => {
      for (const e of v.e || []) {
        sceneRef.current?.event(e);
        if (e.type === "smash") {
          if (!hint.current.fragile) { hint.current.fragile = true; flash("💥 It broke! Lamps, plants and the telly are fragile — carry them", "error", 2400); }
          else flash(`💥 The ${KINDS[e.k]?.name.toLowerCase() || "thing"} broke!`, "error");
        } else if (e.type === "woof" && e.id === myId) flash("🐶 Biscuit knocked it out of your hands!", "error", 1500);
        else if (e.type === "cleared") flash(`🏠 House cleared! +${e.pts} — here comes the next one`, "success", 2200);
      }
    },
    onReply: (r) => { if (!r.ok && r.why && WHY[r.why]) flash(WHY[r.why], "info", 1400); },
    onSnap: (r) => { if (me.current) { me.current.x = r.x; me.current.y = r.y; } },
  });

  const { live: tgLive, report: tgReport, send: tgSend } = tg;
  const grab = () => { if (me.current && !tg.over) tgSend("grab"); };
  const toss = () => { if (me.current && !tg.over) tgSend("throw"); };

  useEffect(() => {
    if (isSpectator) return undefined;
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) { keys.current[k] = true; e.preventDefault(); }
      if ((k === " " || k === "e" || k === "enter") && !e.repeat) { e.preventDefault(); grab(); }
      if ((k === "q" || k === "f") && !e.repeat) { e.preventDefault(); toss(); }
    };
    const up = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  });

  // the 3D view: made once the canvas is there, gone with it
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !tg.ready) return undefined;
    let sc;
    try { sc = createMovingScene(c); } catch (e) { console.error("Moving Day: couldn't start the 3D view", e); return undefined; }
    sceneRef.current = sc;
    sizeRef.current.set = { w: 0, h: 0 };
    return () => { sc.dispose(); sceneRef.current = null; };
  }, [tg.ready]);

  // ── the loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf, last = performance.now(), lastHud = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      const L = tgLive.current;
      const m = me.current;
      const sc = sceneRef.current;
      if (!L) return;
      const items = smoothRows(L, "i", [2, 3]).map(({ row }) => row);
      const others = smoothRows(L, "p", [1, 2]);
      const posOf = (id) => {
        if (m && id === myId) return [m.x, m.y];
        const o = others.find((r) => r.row[0] === id);
        return o ? [o.row[1], o.row[2]] : null;
      };
      // what I hold, as the server last said
      const mineRow = L.view.p.find((p) => p[0] === myId);
      const heldId = mineRow ? mineRow[5] : 0;
      const held = heldId ? items.find((r) => r[0] === heldId) : null;
      const heldBig = held && KINDS[held[1]].big;
      const mates = held ? (heldBig ? held[6].filter(Boolean) : held[6]) : [];
      // move my mover
      if (m && !L.over) {
        let ix = 0, iy = 0;
        const k = keys.current;
        if (k.a || k.arrowleft) ix--;
        if (k.d || k.arrowright) ix++;
        if (k.w || k.arrowup) iy--;
        if (k.s || k.arrowdown) iy++;
        const st = stick.current;
        if (st) {
          const dx = st.x - st.ox, dy = st.y - st.oy, l = Math.hypot(dx, dy);
          if (l > 6) { ix = (dx / l) * Math.min(1, l / STICK_R); iy = (dy / l) * Math.min(1, l / STICK_R); }
          if (knobRef.current) { const c = Math.min(l, STICK_R) / (l || 1); knobRef.current.style.transform = `translate(${dx * c}px, ${dy * c}px)`; }
        } else if (knobRef.current) knobRef.current.style.transform = "";
        const l = Math.hypot(ix, iy);
        const speed = !held ? SPEED : !heldBig ? SPEED * SLOW_SMALL : SPEED * (mates.length >= 2 ? SLOW_PAIR : SLOW_ALONE);
        m.moving = l > 0.05 ? Math.min(1, l) * (speed / SPEED) : 0;
        if (l > 0.05) {
          if (l > 1) { ix /= l; iy /= l; }
          let [nx, ny] = slide(m.x, m.y, ix * speed * dt, iy * speed * dt);
          // two on a big thing: neither can walk off and leave the other holding it
          if (heldBig && mates.length >= 2) {
            const partner = posOf(mates.find((id) => id !== myId));
            if (partner) {
              const was = Math.hypot(m.x - partner[0], m.y - partner[1]), now = Math.hypot(nx - partner[0], ny - partner[1]);
              if (now > STRETCH && now > was) { nx = m.x; ny = m.y; }
            }
          }
          m.x = nx; m.y = ny;
          const fl = Math.hypot(ix, iy);
          m.fx = ix / fl; m.fy = iy / fl;
        }
        const now = Date.now();
        if (now - sentAt.current >= (m.moving ? REPORT_MS : 300)) {
          sentAt.current = now;
          tgReport({ x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100, fx: Math.round(m.fx * 100) / 100, fy: Math.round(m.fy * 100) / 100 });
        }
      }
      // what my hands are near (lit up)
      let near = null;
      if (m && !heldId) {
        let bd = REACH;
        for (const r of items) {
          if (r[5] >= 0) continue;
          const it = { k: r[1], x: r[2], y: r[3], a: r[4] };
          if (KINDS[it.k].big) {
            const both = ends(it);
            for (let e = 0; e < 2; e++) {
              if (r[6][e]) continue;
              const d = Math.hypot(both[e][0] - m.x, both[e][1] - m.y);
              if (d < bd) { bd = d; near = { id: r[0], end: e }; }
            }
          } else if (!r[6].length) {
            const d = Math.hypot(it.x - m.x, it.y - m.y);
            if (d < bd) { bd = d; near = { id: r[0], end: 0 }; }
          }
        }
      }
      if (sc) {
        const { w, h, set } = sizeRef.current;
        if (w && h && (w !== set.w || h !== set.h)) { sc.resize(w, h); sizeRef.current.set = { w, h }; }
        const players = L.players || [];
        const order = new Map(players.map((p, i) => [p.id, i]));
        const named = L.view.p.length > 1;
        const movers = others.filter(({ row }) => !row[7]).map(({ row, moving }) => {
          const mine = m && row[0] === myId;
          const pl = players.find((p) => p.id === row[0]);
          const hold = row[5] ? items.find((r) => r[0] === row[5]) : null;
          return {
            id: row[0], i: order.get(row[0]) ?? 0, mine: !!mine,
            x: mine ? m.x : row[1], y: mine ? m.y : row[2], fx: mine ? m.fx : row[3], fy: mine ? m.fy : row[4],
            walk: mine ? m.moving : moving ? 0.8 : 0, carry: hold ? (KINDS[hold[1]].big ? 2 : 1) : 0, lift: hold && KINDS[hold[1]].big ? -0.12 : 0,
            name: named ? (mine ? "You" : pl?.name) : null,
          };
        });
        // things: what I carry follows my hands here, at once
        const things = items.map((r) => {
          const it = { id: r[0], k: r[1], x: r[2], y: r[3], a: r[4], fly: r[5], held: r[6].some(Boolean) };
          if (!m || !it.held || it.fly >= 0) return it;
          const big = KINDS[it.k].big;
          if (!big && r[6][0] === myId) { it.x = m.x + m.fx * 0.35; it.y = m.y + m.fy * 0.35; }
          if (big && r[6].includes(myId)) {
            const who = r[6].filter(Boolean);
            if (who.length >= 2) {
              const a = posOf(r[6][0]), b = posOf(r[6][1]);
              if (a && b) { it.x = (a[0] + b[0]) / 2; it.y = (a[1] + b[1]) / 2; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.2) it.a = Math.atan2(b[1] - a[1], b[0] - a[0]); }
            } else if (mineRow) {
              // dragging alone: keep where it sits from me, moved with me
              it.x += m.x - mineRow[1]; it.y += m.y - mineRow[2];
            }
          }
          return it;
        });
        sc.draw({ movers, items: things, dog: L.view.d, near, loaded: L.view.ld }, dt, ts / 1000);
      }
      if (ts - lastHud > 200) {
        lastHud = ts;
        setHud({
          left: secondsLeft(L), score: myScore(L), stars: L.view.st, items: L.view.left, house: (L.view.hs || 0) + 1, rivals: rivals(L),
          holding: heldId, big: !!heldBig, near: !!near,
        });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tgLive, tgReport, myId]);

  const starText = "⭐".repeat(hud.stars || 0) + "☆".repeat(3 - (hud.stars || 0));
  const stats = [
    { label: "Score", value: Number(hud.score).toLocaleString() },
    { label: "Stars", value: starText },
    { label: "To go", value: hud.items },
  ];
  const controls = !isSpectator ? (
    <div className="kr-controls md-controls">
      <FloatStick stick={stick} knobRef={knobRef} label="Move" />
      <div className="md-btns">
        <button className="press p-sky md-throw" disabled={!hud.holding || hud.big}
          onPointerDown={(e) => { e.preventDefault(); toss(); }} aria-label="Throw">Throw</button>
        <button className={`press ${hud.holding ? "p-coral" : "p-sun"} kr-use md-grab${hud.near && !hud.holding ? " hot" : ""}`}
          onPointerDown={(e) => { e.preventDefault(); grab(); }} aria-label={hud.holding ? "Put it down" : "Grab"}>
          {hud.holding ? "Drop" : "Grab"}
        </button>
      </div>
    </div>
  ) : null;

  const L = tg.live.current;
  return (
    <>
      <GameFrame
        gameName="Moving Day" badge="📦 MOVING DAY"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: hud.left, max: durationSeconds }}
        opponents={hud.rivals}
        message={msg}
        onQuit={onGameEnd}
        controls={controls}
        landscape
      >
        {({ w, h }) => {
          sizeRef.current.w = Math.round(w); sizeRef.current.h = Math.round(h);
          return (
            <div className="md-pad" style={{ width: w, height: h }} onContextMenu={(e) => e.preventDefault()}>
              {!tg.ready && <div className="md-wait">{tg.gone ? "This house is empty now." : "Opening the house…"}</div>}
              <canvas ref={canvasRef} className="md-canvas" style={{ width: w, height: h, display: tg.ready ? "block" : "none" }}
                role="img" aria-label="Moving Day: the house from the street, the van at the kerb" />
              {tg.ready && L && (
                <div className="md-house" aria-hidden="true">House {hud.house}</div>
              )}
              {isSpectator && L && L.sides.length > 1 && (
                <div className="kr-watch">
                  {L.sides.map((s) => (
                    <button key={s.key} className={`press sm ${s.key === L.side ? "p-sun" : "p-white"}`} onClick={() => tg.watch(s.key)}>
                      {L.mode === "teams" ? `${s.name} team` : s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }}
      </GameFrame>
      {tg.over && !isSpectator && (
        <TogetherResults over={tg.over} me={currentUser} onExit={onGameEnd} icon="📦"
          goalText={(s) => (s.goal ? `${"⭐".repeat(s.sum?.stars || 1)} — ${s.sum?.loaded ?? 0} things moved.` : `One star needs ${s.sum?.line?.[0] ?? "?"} points — ${s.sum?.loaded ?? 0} things moved.`)}
          describe={(s) => `${"⭐".repeat(s.sum?.stars || 0)}${s.sum?.stars ? " · " : ""}${s.sum?.loaded ?? 0} moved${s.sum?.houses ? ` · ${s.sum.houses} house${s.sum.houses > 1 ? "s" : ""}` : ""}${s.sum?.broken ? ` · ${s.sum.broken} broken` : ""}`} />
      )}
    </>
  );
}
