// src/components/games/KitchenRushInner.jsx
// KITCHEN RUSH — cook the orders before they run out. Solo, against friends
// (a kitchen each, the same orders), in teams, or together in one kitchen.
//
// The server runs the kitchen (config/togetherWorld.js, rules in
// together/kitchenCore.mjs): it decides what's on every counter, what's
// cooked, what was served and the score. This phone moves its own chef at
// once (and tells the server where it is), sends "use that counter", and
// draws the kitchen in 3D (kitchenScene.js, the PlayRoom look kit) with the
// other chefs eased between its ticks. The orders are cards over the top.
// Loaded lazily (three.js): KitchenRush.jsx is the wrapper.
//
// Steer with the stick (or WASD / arrows); Use with the button, Space or E —
// or tap a counter you're next to.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import { useUprightTouch, toGame, gameRect } from "../horror/LandscapeGate";
import FloatStick from "../together/FloatStick";
import TogetherResults from "../together/TogetherResults";
import useTogether, { secondsLeft, smoothRows, rivals, myScore } from "../together/useTogether";
import { ING, RECIPES, SPEED, REACH, kindAt, facingTile, slide, unpackItem } from "../together/kitchenCore.mjs";
import { createKitchenScene } from "./kitchenScene";

const REPORT_MS = 66;
const STICK_R = 44;
const WHY = {
  far: "Walk up to it first", chop: "🔪 Chop it on a board first", cook: "🔥 Grill the meat on a stove first — then it goes on the plate",
  nochop: "That doesn't go on a board", nocook: "Only meat goes on the stove", busy: "Something's already there",
  hands: "Your hands are full", empty: "Nothing to do there", plate: "Bring it on a plate", full: "That's already on the plate",
  plateful: "The plate's full", burnt: "It's burnt — bin it 🗑️",
};

export default function KitchenRushInner(props) {
  const { roomCode, currentUser, isSpectator = false, spectatorWatching = null, onGameEnd, durationSeconds = 120 } = props;
  const myId = Number(currentUser?.id);
  const me = useRef(null);                       // my chef, moved here at once
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, set: { w: 0, h: 0 } });
  const keys = useRef({});
  const stick = useRef(null);
  const knobRef = useRef(null);
  const sentAt = useRef(0);
  const [msg, setMsg] = useState(null);
  const [hud, setHud] = useState({ left: durationSeconds, score: 0, stars: 0, served: 0, rivals: [], orders: [] });
  const fresh = useRef(new Map());               // order id -> when it arrived (the card pops in)
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type = "info", ms = 900) => {
    setMsg({ text, type });
    timers.current.push(setTimeout(() => setMsg(null), ms));
  };

  const tg = useTogether({
    roomCode, watchId: spectatorWatching?.user_id ?? null,
    onInit: (init) => {
      const mine = init.view.p.find((p) => p[0] === myId);
      me.current = mine && init.role === "player" ? { x: mine[1], y: mine[2], fx: mine[3], fy: mine[4], moving: false } : null;
    },
    onTick: (v) => {
      const t = performance.now() / 1000;
      for (const e of v.e || []) {
        sceneRef.current?.event(e, t);
        if (e.type === "served" && e.id === myId) flash(`${RECIPES[e.r].icon} Served! +${e.pts}`, "success");
        else if (e.type === "wrong" && e.id === myId) flash("Nobody ordered that!", "error");
        else if (e.type === "expired") flash(`${RECIPES[e.r].icon} An order ran out`, "error");
        else if (e.type === "burnt") flash("🔥 Something's burning!", "error");
      }
      for (const o of v.o) if (!fresh.current.has(o[0])) fresh.current.set(o[0], Date.now());
    },
    onReply: (r) => { if (!r.ok && r.why && WHY[r.why]) flash(WHY[r.why], "info", 1100); },
    onSnap: (r) => { if (me.current) { me.current.x = r.x; me.current.y = r.y; } },
  });

  const applyAt = (t) => {
    if (!t) { flash("Face a counter to use it", "info"); return; }
    sceneRef.current?.used(t.x, t.y, performance.now() / 1000);
    tg.send("use", { x: t.x, y: t.y });
  };
  // the Use button: the counter you face, or whatever in reach does something
  // (the server picks: kitchenCore.applyNear) — you only have to be near it
  const pressUse = () => {
    const m = me.current;
    if (!m || tg.over) return;
    const t = facingTile(m.x, m.y, m.fx, m.fy);
    if (t) sceneRef.current?.used(t.x, t.y, performance.now() / 1000);
    tg.send("use", { x: t ? t.x : null, y: t ? t.y : null, near: 1 });
  };

  useEffect(() => {
    if (isSpectator) return undefined;
    const down = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k.toLowerCase())) { keys.current[k.toLowerCase()] = true; e.preventDefault(); }
      if ((k === " " || k === "e" || k === "Enter") && !e.repeat) { e.preventDefault(); pressUse(); }
    };
    const up = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  });

  // A landscape game: on a phone held upright GameFrame draws it turned a
  // quarter, and every pointer position is turned back before it's read.
  const rotated = useUprightTouch();
  const rot = useRef(rotated);
  rot.current = rotated;

  // tap a counter: use it if it's in reach
  const onBoardTap = (e) => {
    const m = me.current, c = canvasRef.current, sc = sceneRef.current;
    if (!m || !c || !sc || isSpectator) return;
    const r = gameRect(c, rot.current), at = toGame(e, rot.current);
    const nx = ((at.x - r.left) / r.width) * 2 - 1, ny = -(((at.y - r.top) / r.height) * 2 - 1);
    const t = sc.tileAt(nx, ny);
    if (!t || kindAt(t.x, t.y) === "floor" || kindAt(t.x, t.y) === "wall") return;
    if (Math.hypot(t.x + 0.5 - m.x, t.y + 0.5 - m.y) > REACH) { flash(WHY.far, "info"); return; }
    const dx = t.x + 0.5 - m.x, dy = t.y + 0.5 - m.y, l = Math.hypot(dx, dy) || 1;
    m.fx = dx / l; m.fy = dy / l;
    applyAt(t);
  };

  // the 3D view: made once the canvas is there
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !tg.ready) return undefined;
    let sc;
    try { sc = createKitchenScene(c); } catch (e) { console.error("Kitchen Rush: couldn't start the 3D view", e); return undefined; }
    sceneRef.current = sc;
    sizeRef.current.set = { w: 0, h: 0 };
    return () => { sc.dispose(); sceneRef.current = null; };
  }, [tg.ready]);

  const { live: tgLive, report: tgReport } = tg;
  // ── the loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf, last = performance.now(), lastHud = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      const L = tgLive.current;
      const m = me.current;
      if (!L) return;
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
        m.moving = l > 0.05;
        if (m.moving) {
          if (l > 1) { ix /= l; iy /= l; }
          [m.x, m.y] = slide(m.x, m.y, ix * SPEED * dt, iy * SPEED * dt);
          const fl = Math.hypot(ix, iy);
          m.fx = ix / fl; m.fy = iy / fl;
        }
        const now = Date.now();
        if (now - sentAt.current >= (m.moving ? REPORT_MS : 300)) {
          sentAt.current = now;
          tgReport({ x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100, fx: Math.round(m.fx * 100) / 100, fy: Math.round(m.fy * 100) / 100 });
        }
      }
      const sc = sceneRef.current;
      if (sc) {
        const { w, h, set } = sizeRef.current;
        if (w && h && (w !== set.w || h !== set.h)) { sc.resize(w, h); sizeRef.current.set = { w, h }; }
        const items = new Map(L.view.i.map(([i, a]) => [i, unpackItem(a)]));
        const named = L.view.p.length > 1;
        const chefs = smoothRows(L, "p", [1, 2]).map(({ row: p, moving }, i) => {
          const mine = m && p[0] === myId;
          const pl = L.players.find((x) => x.id === p[0]);
          const x = mine ? m.x : p[1], y = mine ? m.y : p[2], fx = mine ? m.fx : p[3], fy = mine ? m.fy : p[4];
          return {
            id: p[0], i, mine: !!mine, x, y, fx, fy, hold: unpackItem(p[5]), chop: !!p[6], left: !!p[7],
            moving: mine ? m.moving : moving, facingTile: facingTile(x, y, fx, fy),
            name: named ? (mine ? "You" : pl?.name) : null,
          };
        }).filter((p) => !p.left);
        let facing = null;
        if (m && !L.over) {
          const ft = facingTile(m.x, m.y, m.fx, m.fy);
          if (ft && Math.hypot(ft.x + 0.5 - m.x, ft.y + 0.5 - m.y) <= REACH) facing = ft;
        }
        sc.draw({ chefs, items, facing }, dt, ts / 1000);
      }
      if (ts - lastHud > 150) {
        lastHud = ts;
        setHud({ left: secondsLeft(L), score: myScore(L), stars: L.view.st, served: L.view.sv, line: L.world?.line, rivals: rivals(L), orders: L.view.o });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tgLive, tgReport, myId]);

  const starText = "⭐".repeat(hud.stars || 0) + "☆".repeat(3 - (hud.stars || 0));
  const stats = [
    { label: "Score", value: Number(hud.score).toLocaleString() },
    { label: "Stars", value: starText },
    { label: "Served", value: hud.served },
  ];
  const controls = !isSpectator ? (
    <div className="kr-controls">
      <FloatStick stick={stick} knobRef={knobRef} label="Move" />
      <button className="press p-sun kr-use" onPointerDown={(e) => { e.preventDefault(); pressUse(); }} aria-label="Use">🖐️ Use</button>
    </div>
  ) : null;

  // the order cards: what's wanted, what's in it, how long it has
  const orders = (side) => (
    <div className={`kr3-orders${side ? " side" : ""}`} aria-label="Orders">
      {[0, 1, 2, 3].map((i) => {
        const o = hud.orders[i];
        if (!o) return <div key={`e${i}`} className="kr3-card empty" />;
        const [id, r, left, life] = o;
        const rec = RECIPES[r], k = Math.max(0, left / life);
        const born = fresh.current.get(id) || 0;
        const tone = k > 0.5 ? "ok" : k > 0.25 ? "hurry" : "late";
        return (
          <div key={id} className={`kr3-card ${tone}${Date.now() - born < 450 ? " new" : ""}`}>
            <span className="kr3-dish">{rec.icon}{r === "cheese" && <i>🧀</i>}{r === "deluxe" && <i>✨</i>}</span>
            <span className="kr3-name">{rec.name}</span>
            <span className="kr3-parts">{rec.parts.map((p) => <b key={p}>{ING[p].icon}</b>)}</span>
            <span className="kr3-time"><span style={{ width: `${k * 100}%` }} /></span>
          </div>
        );
      })}
    </div>
  );

  const L = tg.live.current;
  return (
    <>
      <GameFrame
        gameName="Kitchen Rush" badge="🍳 KITCHEN RUSH"
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
          // wide (sideways): the orders in a column on the left; otherwise along the top
          const side = w > h * 1.25;
          const cw = Math.round(side ? w - Math.min(132, w * 0.2) : w), ch = Math.round(side ? h : h - 78);
          sizeRef.current.w = cw; sizeRef.current.h = ch;
          return (
            <div className={`kr3-pad${side ? " side" : ""}`} style={{ width: w, height: h }} onContextMenu={(e) => e.preventDefault()}>
              {tg.ready && orders(side)}
              {!tg.ready && <div className="md-wait">{tg.gone ? "This kitchen has closed." : "Opening the kitchen…"}</div>}
              <canvas ref={canvasRef} className="md-canvas" onPointerDown={onBoardTap}
                style={{ width: cw, height: ch, display: tg.ready ? "block" : "none" }}
                role="img" aria-label="Kitchen Rush: the kitchen, the orders beside it" />
              {isSpectator && L && L.sides.length > 1 && (
                <div className="kr-watch kr3-watch">
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
        <TogetherResults over={tg.over} me={currentUser} onExit={onGameEnd} icon="🍳"
          goalText={(s) => (s.goal ? `${"⭐".repeat(s.sum?.stars || 1)} — ${s.sum?.served ?? 0} orders served.` : `One star needs ${s.sum?.line?.[0] ?? "?"} points — ${s.sum?.served ?? 0} orders served.`)}
          describe={(s) => `${"⭐".repeat(s.sum?.stars || 0)}${s.sum?.stars ? " · " : ""}${s.sum?.served ?? 0} served${s.sum?.missed ? ` · ${s.sum.missed} missed` : ""}`} />
      )}
    </>
  );
}
