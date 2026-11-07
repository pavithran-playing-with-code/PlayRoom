// src/components/games/RailRunner.jsx
// Rail Runner: run along a sky path over floating islands, jump the barriers,
// slide under the bars, swerve round the train cars, grab the coins. Swipe
// left or right to change lane, up to jump, down to slide — or the arrow keys.
//
// Everyone in a room runs the same course (from the seed) and the room's
// clock decides it; a crash slows you right down but takes nothing away.
// The rules are runnerSim.js; the 3D world ("Sky Sprint" look: Meadow
// Isles, Sunset Dunes, Neon Night) is railScene.js, three.js loaded only
// when the game opens. Full screen, like a phone game (GameFrame bare).
import React, { useCallback, useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import useSpecStream from "./useSpecStream";
import { newRun, step, steer, jump, slide, score, layCourse, GRAVITY } from "./runnerSim.js";
import { createRailScene, themeAt, THEMES } from "./railScene";
import { useSocket } from "../../utils/SocketContext";

const FRIEND_COLOURS = [0x4cc9f0, 0xff8fc7, 0x8fdb5c, 0xffc53d, 0x9b5de5, 0x3dd6c0, 0xff6b6b, 0xffa36c];
const SEND_MS = 110;

const SWIPE_PX = 26;
const SPEC_BACK = 16;                        // a frame names what was taken this far behind the runner
// a coin or a thing in the way, named the same on every phone (the course is the seed's)
const itemKey = (o) => Math.round(o.z * 10) * 3 + o.lane + 1;
const r2 = (n) => Math.round(n * 100) / 100;

// ── sound: little bips and a running tune (Web Audio, no files) ─────────────
function makeAudio() {
  let ac = null, mg = null, muted = false, mStep = 0, mT = 0;
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 17];
  const bip = (f, d, ty, v, sl) => {
    if (!ac || muted) return;
    const t = ac.currentTime, o = ac.createOscillator(), n = ac.createGain();
    o.type = ty || "square"; o.frequency.setValueAtTime(f, t);
    if (sl) o.frequency.exponentialRampToValueAtTime(sl, t + d);
    n.gain.setValueAtTime(v || 0.06, t); n.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(n); n.connect(mg); o.start(); o.stop(t + d);
  };
  return {
    init() {
      if (ac) { if (ac.resume) ac.resume(); return; }
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); mg = ac.createGain(); mg.gain.value = 1; mg.connect(ac.destination); } catch { ac = null; }
    },
    mute(m) { muted = m; },
    close() { try { if (ac) ac.close(); } catch { /* gone */ } ac = null; },
    lane() { bip(500, 0.08, "triangle", 0.05, 700); }, jump() { bip(320, 0.2, "square", 0.05, 720); }, slide() { bip(260, 0.2, "sawtooth", 0.04, 120); },
    coin(n) { bip(880 + Math.min(n % 12, 8) * 60, 0.09, "triangle", 0.07, 1500); }, crash() { bip(130, 0.4, "sawtooth", 0.14, 40); },
    music(dt) {
      if (!ac || muted) return;
      mT -= dt; if (mT > 0) return;
      mT = 0.2; mStep++;
      const base = 196, n = SCALE[(mStep * 3 + (mStep >> 3)) % SCALE.length];
      bip(base * Math.pow(2, n / 12), 0.18, "triangle", 0.028);
      if (mStep % 4 === 0) bip((base / 2) * Math.pow(2, SCALE[(mStep >> 2) % 4] / 12), 0.3, "sine", 0.05);
    },
  };
}
const buzz = (n) => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(n); } catch { /* fine */ } };

export default function RailRunner(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;
  const myId = Number(currentUser?.id);
  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { socket } = useSocket() || {};
  // friends on the same course, from the room: drawn as ghosts beside you
  const seatedRef = useRef([]);
  seatedRef.current = (players || []).filter((p) => !p.is_spectator).map((p) => ({ id: Number(p.user_id), name: p.username })).sort((a, b) => a.id - b.id);
  const remote = useRef(new Map());
  useEffect(() => {
    if (!socket) return undefined;
    const onPos = (m) => {
      const id = Number(m.user_id);
      if (id === myId || m.z === undefined) return;
      const o = remote.current.get(id) || { x: m.x, zs: m.z };
      Object.assign(o, { f: m, at: performance.now() });
      remote.current.set(id, o);
    };
    socket.on("rr:pos", onPos);
    return () => socket.off("rr:pos", onPos);
  }, [socket, myId]);
  const othersNow = (now, dt, skip) => {
    const out = [];
    for (const [id, o] of remote.current) {
      if (id === skip || now - o.at > 8000) continue;
      const t = Math.min(0.4, (now - o.at) / 1000);
      const z = o.f.z + (o.f.st ? 0 : o.f.v * t);
      o.zs = Math.abs(z - o.zs) > 30 ? z : o.zs + (z - o.zs) * Math.min(1, dt * 10);
      o.x += (o.f.x - o.x) * Math.min(1, dt * 12);
      const slot = Math.max(0, seatedRef.current.findIndex((p) => p.id === id));
      out.push({ id, z: o.zs, x: o.x, y: o.f.y, sl: o.f.sl, st: o.f.st, v: o.f.v, colour: FRIEND_COLOURS[slot % FRIEND_COLOURS.length], name: seatedRef.current[slot]?.name || "Friend"});
    }
    return out;
  };
  const othersRef = useRef(othersNow);
  othersRef.current = othersNow;
  const { addScore } = eng;
  const sim = useRef(null);
  if (sim.current === null) sim.current = newRun(seed);
  const audio = useRef(null);
  if (!audio.current) audio.current = makeAudio();
  useEffect(() => { const a = audio.current; return () => a.close(); }, []);
  const [muted, setMuted] = useState(false);
  useEffect(() => { audio.current.mute(muted); }, [muted]);

  const hostRef = useRef(null), distRef = useRef(null), coinRef = useRef(null);
  const size = useRef({ w: 300, h: 400 });
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);
  // the last seconds: the score goes every frame, so nothing is left unsent at the whistle
  const endingRef = useRef(false);
  endingRef.current = eng.timeLeft <= 2;
  useEffect(() => { if (eng.gameOver) { const s = sim.current; setHud({ dist: Math.floor(s.z), coins: s.coins, crashes: s.crashes }); } }, [eng.gameOver]);
  const [hud, setHud] = useState({ dist: 0, coins: 0, crashes: 0 });
  const [toast, setToast] = useState(null);
  const [flash, setFlash] = useState(0);
  const [hint, setHint] = useState(true);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const say = useCallback((text) => {
    const m = { text, n: Math.random() };
    setToast(m);
    timers.current.push(setTimeout(() => setToast((x) => (x === m ? null : x)), 1400));
  }, []);

  // ── watched: a small picture of the run, ~15 times a second, only while a
  // friend is watching. The course is the seed's, so the watcher lays it
  // too; the frame says where you are and what you've taken near you.
  const watchId = spectatorWatching?.user_id;
  const [specReady, setSpecReady] = useState(false);
  const specReadyRef = useRef(false);
  useEffect(() => { specReadyRef.current = false; setSpecReady(false); }, [watchId]);
  const spec = useSpecStream({ roomCode, isSpectator, myId, watchId,
    frame: () => {
      const s = sim.current, cg = [], hb = [];
      for (const row of s.rows) for (const o of row.items) {
        if (o.z + (o.len || 0) < s.z - SPEC_BACK || o.z > s.z + 3) continue;
        if (o.kind === "coin" ? o.got : o.hit) (o.kind === "coin" ? cg : hb).push(itemKey(o));
      }
      return { z: r2(s.z), v: r2(s.speed), x: r2(s.x), l: s.lane, y: r2(s.y), vy: r2(s.vy), sl: r2(s.slideT), st: r2(s.stunT), sf: r2(s.safeT),
        c: s.coins, k: s.crashes, cg, hb };
    },
    onFrame: () => { if (!specReadyRef.current) { specReadyRef.current = true; setSpecReady(true); } },
  });

  // ── three.js, loaded when the game opens ──
  const [THREE, setThree] = useState(null);
  const [noGl, setNoGl] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([import("three"), import("three/examples/jsm/utils/BufferGeometryUtils.js")])
      .then(([m, u]) => { if (alive) setThree({ T: m, merge: (g) => u.BufferGeometryUtils.mergeBufferGeometries(g) }); })
      .catch(() => { if (alive) setNoGl(true); });
    return () => { alive = false; };
  }, []);

  const act = (what) => {
    if (overRef.current || isSpectator) return;
    audio.current.init();
    const s = sim.current, A = audio.current;
    if (what === "left") { if (steer(s, -1)) A.lane(); }
    else if (what === "right") { if (steer(s, 1)) A.lane(); }
    else if (what === "up") { if (jump(s)) A.jump(); }
    else if (what === "down") { if (slide(s) && s.y < 0.01) A.slide(); }
  };

  useEffect(() => {
    if (isSpectator) return undefined;
    const onKey = (e) => {
      const k = e.key;
      if (e.repeat) return;
      if (k === "m" || k === "M") { setMuted((x) => !x); return; }
      const what = k === "ArrowLeft" || k === "a" ? "left" : k === "ArrowRight" || k === "d" ? "right"
        : k === "ArrowUp" || k === "w" || k === " " ? "up" : k === "ArrowDown" || k === "s" ? "down" : null;
      if (what) { e.preventDefault(); act(what); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // a swipe: one move, the moment the finger has gone far enough. One per
  // touch: letting a finger that kept going swipe again took a single swipe
  // two lanes, to the edge
  const touch = useRef(null);
  const onDown = (e) => {
    if (overRef.current || isSpectator) return;
    if (e.target.closest && e.target.closest("button")) return;
    audio.current.init();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, used: false };
  };
  const onMove = (e) => {
    const t = touch.current;
    if (!t || t.used || e.pointerId !== t.id) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    t.used = true;
    act(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down");
  };
  const onUp = (e) => { if (touch.current && e.pointerId === touch.current.id) touch.current = null; };

  // ── the loop ──
  useEffect(() => {
    if (isSpectator || !THREE || !hostRef.current) return undefined;
    let scene;
    try { scene = createRailScene(THREE.T, THREE.merge); } catch { setNoGl(true); return undefined; }
    const host = hostRef.current;
    scene.canvas.className = "rr-gl";
    host.insertBefore(scene.canvas, host.firstChild);
    // the hint, for a few seconds from when you can see the run (not from when the page opened)
    setHint(true);
    timers.current.push(setTimeout(() => setHint(false), 3500));
    let raf, last = performance.now(), pushed = 0, pushedAt = 0, lastHud = 0, sizeW = 0, sizeH = 0, theme = 0, coinRun = 0;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      // never backwards (the first frame can be stamped early); and on a phone
      // that draws slowly, the run still goes at its real speed: a long frame
      // is played in small steps, so nothing is jumped over
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = Math.max(last, now);
      if (size.current.w !== sizeW || size.current.h !== sizeH) { sizeW = size.current.w; sizeH = size.current.h; scene.resize(sizeW, sizeH); }
      const s = sim.current, A = audio.current;
      let crashed = false;
      if (!overRef.current) {
        const out = { crashed: false, got: [] };
        for (let left = dt; left > 1e-6; left -= 1 / 60) {
          const o = step(s, Math.min(left, 1 / 60));
          if (o.crashed) out.crashed = true;
          out.got.push(...o.got);
        }
        crashed = out.crashed;
        if (out.crashed) {
          A.crash(); buzz(150);
          setFlash((f) => f + 1);
          say("Ouch! Keep running!");
        }
        for (let i = 0; i < out.got.length; i++) { coinRun++; A.coin(coinRun); }
        const th = themeAt(s.z);
        if (th !== theme) { theme = th; say(THEMES[th]); }
        // the score to the engine a few times a second, and the metres and
        // coins straight onto the page: re-rendering the screen for every
        // metre caused little hitches
        const target = score(s);
        if (target !== pushed && (now - pushedAt > 250 || endingRef.current)) { addScore(target - pushed); pushed = target; pushedAt = now; }
        if (distRef.current) distRef.current.textContent = String(Math.floor(s.z));
        if (coinRef.current) coinRef.current.textContent = `● ${s.coins}`;
        if (now - lastHud > 1000) { lastHud = now; setHud({ dist: Math.floor(s.z), coins: s.coins, crashes: s.crashes }); }
        A.music(dt);
      }
      if (socket && roomCode && !overRef.current && now - sentAt > SEND_MS) {
        sentAt = now;
        socket.emit("rr:pos", { code: roomCode, z: Math.round(s.z * 10) / 10, x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100,
          v: Math.round(s.speed * 10) / 10, sl: s.slideT > 0 ? 1 : 0, st: s.stunT > 0 ? 1 : 0 });
      }
      scene.frame({ s, t: now / 1000, dt, crashed, others: othersRef.current(now, dt, myId) });
    };
    let sentAt = 0;
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      try { host.removeChild(scene.canvas); } catch { /* gone */ }
      scene.dispose();
    };
  }, [isSpectator, THREE, addScore, say, socket, roomCode, myId]);

  // ── the watcher's loop: the same scene, driven by the watched runner's
  // frames. A frame comes ~15 times a second; between them the run carries
  // on at its speed (z), a jump follows its arc (y), a lane change eases (x),
  // so it draws at the screen's rate. No sound, no input, nothing sent.
  useEffect(() => {
    if (!isSpectator || !THREE || !hostRef.current) return undefined;
    let scene;
    try { scene = createRailScene(THREE.T, THREE.merge); } catch { setNoGl(true); return undefined; }
    const host = hostRef.current;
    scene.canvas.className = "rr-gl";
    host.insertBefore(scene.canvas, host.firstChild);
    let ws = newRun(seed), zs = 0, xs = 0, ys = 0, lastL = null, crashes = -1;
    let raf, last = performance.now(), lastHud = 0, sizeW = 0, sizeH = 0, theme = 0;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = Math.max(last, now);
      if (size.current.w !== sizeW || size.current.h !== sizeH) { sizeW = size.current.w; sizeH = size.current.h; scene.resize(sizeW, sizeH); }
      const L = spec.current;
      let crashed = false;
      if (L && L.f) {
        const f = L.f, age = (now - L.at) / 1000, tau = Math.min(0.4, age);
        const target = f.z + (age < 1 ? f.v * tau : 0);
        if (L !== lastL) {
          // another runner, or far behind: start from where they are
          if (lastL === null || Math.abs(target - zs) > 25) {
            if (target < ws.z - 20) ws = newRun(seed);
            zs = target; xs = f.x; ys = f.y; crashes = f.k; theme = -1;
          }
          lastL = L;
          ws.lane = f.l; ws.slideT = f.sl; ws.stunT = f.st; ws.safeT = f.sf; ws.coins = f.c;
          if (f.k > crashes) {
            crashed = true;
            setFlash((n) => n + 1);
            say("Ouch!");
          }
          crashes = f.k;
        } else {
          ws.slideT = Math.max(0, ws.slideT - dt); ws.stunT = Math.max(0, ws.stunT - dt); ws.safeT = Math.max(0, ws.safeT - dt);
        }
        zs += (age < 1 ? f.v : 0) * dt;
        zs += (target - zs) * Math.min(1, dt * 8);
        xs += (f.x + (f.l - f.x) * (1 - Math.exp(-14 * tau)) - xs) * Math.min(1, dt * 16);
        const yt = f.y > 0 || f.vy > 0 ? Math.max(0, f.y + f.vy * tau - (GRAVITY / 2) * tau * tau) : 0;
        ys += (yt - ys) * Math.min(1, dt * 20);
        ws.z = zs; ws.x = xs; ws.y = ys < 0.002 ? 0 : ys; ws.speed = f.v;
        layCourse(ws);
        // what they've taken: gone here too (a coin with its sparkle, a thing hit with its burst)
        const cg = new Set(f.cg || []), hb = new Set(f.hb || []);
        for (const row of ws.rows) for (const o of row.items) {
          if (o.z + (o.len || 0) < zs - SPEC_BACK - 4 || o.z > zs + 6) continue;
          if (o.kind === "coin") { if (!o.got && cg.has(itemKey(o))) o.got = true; }
          else if (!o.hit && hb.has(itemKey(o))) o.hit = true;
        }
        const th = themeAt(zs);
        if (th !== theme) { if (theme >= 0 || th > 0) say(THEMES[th]); theme = th; }
        if (distRef.current) distRef.current.textContent = String(Math.floor(zs));
        if (coinRef.current) coinRef.current.textContent = `● ${f.c}`;
        if (now - lastHud > 1000) { lastHud = now; setHud({ dist: Math.floor(zs), coins: f.c, crashes: f.k }); }
      }
      scene.frame({ s: ws, t: now / 1000, dt, crashed, others: othersRef.current(now, dt, Number(watchId)) });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      try { host.removeChild(scene.canvas); } catch { /* gone */ }
      scene.dispose();
    };
  }, [isSpectator, THREE, seed, spec, say, watchId]);

  // against friends: who's ahead, small, top right
  // (watching: everyone who's playing, the one you watch marked)
  const oppList = Object.values(eng.opponents);
  const watched = Number(watchId), wScore = Number(spectatorWatching?.score) || 0;
  const rank = oppList.length
    ? (isSpectator
      ? oppList.map((o) => ({ id: o.user_id, name: o.username, me: Number(o.user_id) === watched, score: Number(o.user_id) === watched ? Math.max(wScore, Number(o.score) || 0) : Number(o.score) || 0 }))
      : [{ id: myId, name: "You", score: eng.score, me: true }, ...oppList.map((o) => ({ id: o.user_id, name: o.username, score: Number(o.score) || 0 }))]
    ).sort((a, b) => b.score - a.score).slice(0, 4)
    : [];

  return (
    <>
      <GameFrame
        gameName="Rail Runner" badge="🏃 RAIL RUNNER"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={[]}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={oppList}
        teams={eng.teams}
        onQuit={eng.endMatch}
        bare
        floatExtra={!isSpectator ? (
          <button type="button" className="gf-btn" aria-label={muted ? "Sound on" : "Sound off"} aria-pressed={muted}
            onClick={() => { audio.current.init(); setMuted((x) => !x); }}>{muted ? "✕ ♪" : "♪"}</button>
        ) : null}
      >
        {({ w, h }) => {
          size.current = { w, h };
          return (
            <div className="rr-stage" ref={hostRef} style={{ width: w, height: h }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              onContextMenu={(e) => e.preventDefault()}>
              {!THREE && !noGl && <div className="rr-msg">Getting the islands ready…</div>}
              {isSpectator && THREE && !noGl && !specReady && <div className="rr-msg">Connecting to {spectatorWatching?.username || "the"}{spectatorWatching?.username ? "'s" : ""} run…</div>}
              {noGl && <div className="rr-msg">This game needs WebGL. Try another browser, or turn on hardware acceleration.</div>}
              <div className="rr-hud" aria-live="polite">
                <div key={flash} className={`rr-flash${flash ? " on" : ""}`} />
                <div className="rr-coins" ref={coinRef}>● {hud.coins}</div>
                <div className="rr-score"><span ref={distRef}>{hud.dist}</span><small>METERS</small></div>
                {rank.length > 1 && (
                  <ol className="rr-rank">
                    {rank.map((r, i) => <li key={r.id} className={r.me ? "me" : ""}><b>{i + 1}</b><span>{r.name}</span><em>{r.score.toLocaleString()}</em></li>)}
                  </ol>
                )}
                {toast && <div key={toast.n} className="rr-toast">{toast.text}</div>}
                {!isSpectator && <div className={`rr-hint${hint ? " on" : ""}`}>Swipe ← → to dodge · ↑ jump · ↓ slide</div>}
              </div>
            </div>
          );
        }}
      </GameFrame>
      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={`Distance: ${hud.dist}m · Coins: ${hud.coins}${hud.crashes ? ` · Crashes: ${hud.crashes}` : ""}`} />
      )}
    </>
  );
}
