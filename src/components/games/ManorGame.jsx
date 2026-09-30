// src/components/games/ManorGame.jsx
// HOLLOW MANOR in a room: versus, teams or co-op, in one shared house.
//
// Unlike every other game here this one does not use useGameEngine. Its
// scores are not a phone's to post: the server runs the house (config/
// manorWorld.js), decides who took what and who got out, writes the scores
// itself and ends the match when everyone is out or caught. This page moves
// your own player, reports where you are, and draws what the server says.
//
// The solo page (pages/Manor.jsx) shares the drawing, the sound and the
// rules; the two-thumb controls here are the same as there.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "../../utils/SocketContext";
import { drawManor } from "../horror/manorRender";
import { createManorAudio } from "../horror/manorAudio";
import {
  createClient, applyTick, stepLocal, report, jump, playing, inIntro, timeLeft, sideOfMe,
  watchedPlayer, cycleWatch, placeName, viewState,
} from "../horror/manorClient";
import { say } from "../horror/manorSim";
import LandscapeGate, { useLandscapeCleanup } from "../horror/LandscapeGate";

const REPORT_MS = 66;                  // ~15 a second
const HUD_MS = 100;

const MEDAL = ["", "🥇", "🥈", "🥉"];

export default function ManorGame({ roomCode, currentUser, isSpectator = false, spectatorWatching = null, onGameEnd }) {
  const { socket } = useSocket() || {};
  const client = useRef(null);
  const audio = useRef(null);
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const view = useRef({ W: 390, H: 844, dpr: 1, safeTop: 0 });
  const keys = useRef({});
  const stick = useRef(null);
  const look = useRef(null);
  const sentAt = useRef(0);

  const [hud, setHud] = useState(null);
  const [over, setOver] = useState(null);
  const [gone, setGone] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useLandscapeCleanup();

  const syncHud = useCallback(() => {
    const c = client.current;
    if (!c) return;
    const now = Date.now();
    const side = sideOfMe(c);
    const w = watchedPlayer(c);
    setHud({
      role: c.role, mode: c.mode, alive: c.alive, escaped: c.escaped, place: c.place, intro: inIntro(c, now),
      left: timeLeft(c, now), msg: c.msg, side: side && { name: side.name, color: side.color, got: side.got, need: side.need, open: side.open },
      stam: c.body.stam, bat: c.body.bat, light: c.body.light, runOn: c.body.runOn, tired: c.body.stamCool > 0,
      crouch: c.body.crouch, decoys: c.decoys, watching: w && { name: w.name, color: w.color },
      players: [...c.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, alive: p.alive, escaped: p.escaped, place: p.place })),
      playing: playing(c),
    });
  }, []);

  useEffect(() => {
    document.body.classList.add("in-game");
    audio.current = createManorAudio();
    return () => {
      document.body.classList.remove("in-game");
      audio.current.close();
    };
  }, []);

  // ── the socket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !roomCode) return undefined;
    const hello = () => socket.emit("manor:hello", roomCode);
    const onInit = (init) => {
      if (init.code !== roomCode) return;
      const c = createClient(init);
      if (spectatorWatching) c.watch = Number(spectatorWatching.user_id);
      client.current = c;
      if (init.over) setOver(init.over);
      syncHud();
    };
    const onTick = (m) => {
      const c = client.current;
      if (!c || m.c !== roomCode) return;
      for (const s of applyTick(c, m)) audio.current.play(s);
    };
    const onOver = (o) => {
      if (o.code !== roomCode) return;
      if (client.current) client.current.over = o;
      setOver(o);
    };
    const onDecoyed = (r) => {
      const c = client.current;
      if (!c) return;
      c.decoys = r.left;
      if (r.ok) say(c, "The music box plays. It turns toward the sound. Slip away!", 3500);
      else say(c, r.why === "empty" ? "The music box is empty." : "It is watching you. Break line of sight first!", 2200);
      syncHud();
    };
    const onGone = (g) => { if (g.code === roomCode && !client.current) setGone(true); };
    socket.on("manor:init", onInit);
    socket.on("manor:tick", onTick);
    socket.on("manor:over", onOver);
    socket.on("manor:decoyed", onDecoyed);
    socket.on("manor:gone", onGone);
    socket.on("connect", hello);
    hello();
    // if the first hello was lost (socket still connecting), keep asking
    const retry = setInterval(() => { if (!client.current) hello(); }, 3000);
    return () => {
      clearInterval(retry);
      socket.off("manor:init", onInit);
      socket.off("manor:tick", onTick);
      socket.off("manor:over", onOver);
      socket.off("manor:decoyed", onDecoyed);
      socket.off("manor:gone", onGone);
      socket.off("connect", hello);
    };
  }, [socket, roomCode, spectatorWatching, syncHud]);

  // ── the canvas ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const fit = () => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = window.innerWidth, H = window.innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      const safeTop = rootRef.current ? parseFloat(getComputedStyle(rootRef.current).paddingTop) || 0 : 0;
      view.current = { W, H, dpr, safeTop };
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // ── the loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf, last = 0, lastHud = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - last) / 1000 || 0);
      last = ts;
      const c = client.current;
      const cv = canvasRef.current;
      if (!c || !cv) return;
      const now = Date.now();

      const k = keys.current;
      let ix = 0, iy = 0;
      if (k.a) ix--;
      if (k.d) ix++;
      if (k.w || k.ArrowUp) iy--;
      if (k.s || k.ArrowDown) iy++;
      const st = stick.current;
      if (st) {
        const dx = st.x - st.ox, dy = st.y - st.oy, l = Math.hypot(dx, dy);
        if (l > 10) { ix = dx / Math.max(l, 1) * Math.min(1, l / 50); iy = dy / Math.max(l, 1) * Math.min(1, l / 50); }
      }
      const turn = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
      for (const s of stepLocal(c, { ix, iy, turn, shift: !!k.Shift }, dt, now)) audio.current.play(s);

      if (playing(c) && !inIntro(c, now) && socket && now - sentAt.current >= REPORT_MS) {
        sentAt.current = now;
        socket.emit("manor:me", report(c));
      }

      drawManor(cv.getContext("2d"), viewState(c, now), view.current, ts / 1000, playing(c) ? stick.current : null);
      if (ts - lastHud > HUD_MS) { lastHud = ts; syncHud(); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [socket, syncHud]);

  // ── keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e) => {
      const c = client.current;
      if (!c) return;
      audio.current.start();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) e.preventDefault();
      if (inIntro(c)) { c.skipIntro = true; return; }
      if (!playing(c)) {
        if (k === "ArrowLeft") cycleWatch(c, -1);
        if (k === "ArrowRight") cycleWatch(c, 1);
        return;
      }
      keys.current[k] = true;
      if (k === "f") c.body.light = !c.body.light;
      if (k === " " && jump(c)) audio.current.play({ name: "jump" });
      if (k === "c") c.body.crouch = !c.body.crouch;
      if (k === "r") c.body.runOn = !c.body.runOn;
      if (k === "e" && socket) socket.emit("manor:decoy", roomCode);
      syncHud();
    };
    const up = (e) => { keys.current[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; };
    const blur = () => { keys.current = {}; stick.current = null; look.current = null; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [socket, roomCode, syncHud]);

  // ── thumbs: left moves, right looks ────────────────────────────────────────
  const onDown = (e) => {
    const c = client.current;
    audio.current.start();
    if (!c) return;
    if (inIntro(c)) { c.skipIntro = true; syncHud(); return; }
    if (!playing(c)) return;
    const cv = canvasRef.current;
    if (e.pointerType === "mouse" || e.clientX >= view.current.W * 0.5) {
      if (!look.current) { look.current = { id: e.pointerId, lx: e.clientX }; cv.setPointerCapture(e.pointerId); }
    } else if (!stick.current) {
      stick.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      cv.setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e) => {
    const st = stick.current, lk = look.current, c = client.current;
    if (st && e.pointerId === st.id) { st.x = e.clientX; st.y = e.clientY; }
    if (lk && e.pointerId === lk.id && c && playing(c)) { c.body.fa += (e.clientX - lk.lx) * 0.005; lk.lx = e.clientX; }
  };
  const onEnd = (e) => {
    if (stick.current && e.pointerId === stick.current.id) stick.current = null;
    if (look.current && e.pointerId === look.current.id) look.current = null;
  };

  // Buttons act on touch-down: a phone won't reliably make a click while the
  // other thumb holds the joystick, and jumping a barricade mid-run is that.
  const press = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    audio.current.start();
    const c = client.current;
    if (c && playing(c)) { fn(c); syncHud(); }
  };
  const decoy = () => socket && socket.emit("manor:decoy", roomCode);
  const watch = (dir) => (e) => { e.preventDefault(); e.stopPropagation(); const c = client.current; if (c) { cycleWatch(c, dir); syncHud(); } };

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    try { await onGameEnd?.(); } finally { setLeaving(false); }
  }

  // ── the screen ─────────────────────────────────────────────────────────────
  const h = hud;
  const clock = h ? `${Math.floor(h.left / 60000)}:${String(Math.floor(h.left / 1000) % 60).padStart(2, "0")}` : "";
  const out = h && h.role === "player" && (!h.alive || h.escaped);
  const watchingNow = h && !h.playing && !over;

  return (
    <div className="hm hmx" ref={rootRef} data-no-fun>
      <canvas ref={canvasRef} className="hm-cv"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} />

      {!h && !gone && (
        <div className="hm-ov"><p>Opening the house…</p></div>
      )}
      {gone && !over && (
        <div className="hm-ov">
          <h1>The house is shut</h1>
          <p>This match has already ended.</p>
          <button className="hm-go" onClick={leave}>Back to the lobby</button>
        </div>
      )}

      {h && !h.intro && !over && (
        <div className="hm-hud hmx-hud">
          <div className="hmx-top">
            <span className="hmx-clock">{clock}</span>
            {h.side && (
              <span className="hmx-mine" style={{ "--c": h.side.color }}>
                {Array.from({ length: h.side.need }).map((_, i) => <i key={i} className={i < h.side.got ? "got" : ""} />)}
                <b>{h.side.got}/{h.side.need}</b>
              </span>
            )}
          </div>
          {h.playing && (
            <>
              <div className="hm-bar stam"><i style={{ width: `${h.stam * 100}%` }} /></div>
              <div className="hm-bar bat"><i style={{ width: `${h.bat * 100}%` }} /></div>
            </>
          )}
          <div className="hmx-who">
            {h.players.map((p) => (
              <span key={p.id} className={`hmx-p${p.alive ? "" : " dead"}${p.escaped ? " out" : ""}`} style={{ "--c": p.color }}
                title={p.name}>
                <i />{p.name}{p.escaped ? ` · ${p.place ? placeName(p.place) : "out"}` : !p.alive ? " ✕" : ""}
              </span>
            ))}
          </div>
          {h.playing && (
            <button className="hmx-leave" onPointerDown={(e) => { e.stopPropagation(); setConfirmLeave(true); }}>Leave</button>
          )}
        </div>
      )}

      <div className="hm-msg" style={{ opacity: h && !h.intro && h.msg && !over ? 1 : 0 }} aria-live="polite">{h && !over ? h.msg : ""}</div>

      {h && h.playing && !h.intro && (
        <div className="hm-btns">
          <button className={h.runOn ? "on" : ""} onPointerDown={press((c) => { c.body.runOn = !c.body.runOn; })}>
            {h.tired && h.runOn ? "Tired" : h.runOn ? "Run on" : "Run off"}
          </button>
          <button style={{ opacity: h.decoys ? 1 : 0.4 }} onPointerDown={press(decoy)}>Music box {h.decoys}</button>
          <button className={h.light && h.bat > 0 ? "on" : ""} onPointerDown={press((c) => { c.body.light = !c.body.light; })}>
            {h.bat <= 0 ? "No power" : h.light ? "Light on" : "Light off"}
          </button>
          <button onPointerDown={press((c) => { if (jump(c)) audio.current.play({ name: "jump" }); })}>Jump</button>
          <button className={h.crouch ? "on" : ""} onPointerDown={press((c) => { c.body.crouch = !c.body.crouch; })}>
            {h.crouch ? "Crouch on" : "Crouch off"}
          </button>
        </div>
      )}

      {/* Out of it — caught, escaped, or only watching: look through someone
          else's eyes, and leave whenever you like. */}
      {watchingNow && h && (
        <div className="hmx-spec">
          {out && (
            <div className="hmx-banner">
              {h.escaped ? `You got out${h.mode === "free" && h.place ? ` — ${placeName(h.place)}` : ""}.` : "It took you."}
              <span> {h.mode === "coop" ? "" : "Watch the others, or leave."}</span>
            </div>
          )}
          <div className="hmx-specbar">
            <button onPointerDown={watch(-1)} aria-label="Watch the previous player">◀</button>
            <span className="hmx-watching" style={{ "--c": h.watching?.color || "#a39a88" }}>
              {h.watching ? <>Watching <b>{h.watching.name}</b></> : "Nobody left inside"}
            </span>
            <button onPointerDown={watch(1)} aria-label="Watch the next player">▶</button>
          </div>
          <button className="hmx-out" onClick={leave} disabled={leaving}>{leaving ? "Leaving…" : "← Leave"}</button>
        </div>
      )}

      {confirmLeave && (
        <div className="hm-ov">
          <h1>Leave the house?</h1>
          <p>
            {h?.mode === "coop"
              ? "You're all in this together — if you leave now, everyone loses."
              : "You'll count as caught. Your friends play on."}
          </p>
          <button className="hm-go" onClick={leave} disabled={leaving}>{leaving ? "Leaving…" : "Leave"}</button>
          <button className="hm-go" onClick={() => setConfirmLeave(false)}>Stay</button>
        </div>
      )}

      {over && <Results over={over} me={currentUser} onExit={leave} leaving={leaving} />}

      {/* A landscape game. The match can't wait, so say so. */}
      {h && !over && <LandscapeGate note="The match clock keeps running." />}
    </div>
  );
}

function Results({ over, me, onExit, leaving }) {
  const myId = Number(me?.id);
  const mine = over.sides.find((s) => s.members.some((m) => m.id === myId));
  const coop = over.mode === "coop";
  const headline = coop
    ? (over.reason === "won" ? "You all got out" : "The house kept you")
    : mine && mine.place === 1 ? (over.mode === "teams" ? `${mine.name} got out first` : "You got out first")
    : mine && mine.place ? `Out — ${placeName(mine.place)}`
    : over.reason === "time" ? "The night ran out" : "Caught";
  const sub = coop
    ? (over.reason === "won" ? "Every relic, every one of you, through the far gate." : "One of you was taken, and that was the end of it.")
    : over.mode === "teams" ? "The first team with everyone out wins." : "First one out wins.";
  return (
    <div className="hm-ov hmx-results">
      <h1>{headline}</h1>
      <p>{sub}</p>
      <div className="hmx-standings">
        {over.sides.map((s) => (
          <div key={s.key} className={`hmx-row${mine && s.key === mine.key ? " mine" : ""}`} style={{ "--c": s.color }}>
            <span className="hmx-place">{s.place ? (MEDAL[s.place] || placeName(s.place)) : "✕"}</span>
            <span className="hmx-name">
              <b>{over.mode === "free" ? s.members[0]?.name : s.name}</b>
              {over.mode !== "free" && (
                <small>{s.members.map((m) => `${m.name}${m.escaped ? "" : " ✕"}`).join(", ")}</small>
              )}
            </span>
            <span className="hmx-got">{s.got}/{s.need}</span>
          </div>
        ))}
      </div>
      <button className="hm-go" onClick={onExit} disabled={leaving}>{leaving ? "Saving…" : "Back to the lobby"}</button>
    </div>
  );
}
