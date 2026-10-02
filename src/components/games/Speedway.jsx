// src/components/games/Speedway.jsx
// Speedway: a three-lap race on a road of bends and hills, seen from behind
// your car — with everyone in the room on the same road at the same time.
// You see their cars ahead of you (and pass them), with their names over
// them; on your own, three computer cars race you. The pedal is always down:
// steer with the buttons, by holding either side of the road, or the arrow
// keys (down to brake). Stay on the tarmac — the grass is slow — and don't
// drive into the back of anyone.
//
// Each phone drives its own car and tells the room where it is (race:pos,
// ~10 times a second); everyone else's car is drawn from that, carried
// forward at its speed between reports. The room's clock and the scores
// decide the result: the first across the line after three laps wins; if
// the clock runs out first, whoever got furthest.
//
// The rules are speedwaySim.js. The road is drawn the way the old arcade
// racers did it: one strip per road segment, projected from far to near.
import React, { useEffect, useMemo, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import GameOver from "./GameOver";
import useGameEngine from "./useGameEngine";
import { useSocket } from "../../utils/SocketContext";
import {
  buildTrack, newCar, drive, newBots, driveBot, segAt, lapOf, kmh, raceScore, placeOf,
  SEG, ROAD_W, LAPS, MAX_SPEED, START_S,
} from "./speedwaySim.js";

const DRAW = 180;                                     // segments drawn ahead
const CAM_H = 1000, CAM_DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180);
const PLAYER_Z = CAM_H * CAM_DEPTH;
const CAR_W = 520;                                    // a car's width, road units
const SEND_MS = 100;
const COLOURS = ["#ff5a5f", "#4cc9f0", "#8fe36b", "#ffc53d", "#c77dff", "#ff9f43", "#2de2c8", "#ff7bd5"];
const PLACE = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th"];
const TAU = Math.PI * 2;

// ── drawing ──────────────────────────────────────────────────────────────────
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// A car from behind: tyres, body, rear window, tail lights. w: its width.
function drawCar(ctx, x, y, w, color, tilt = 0, braking = false) {
  const h = w * 0.55;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = "rgba(0,0,0,.3)";                   // shadow
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.55, h * 0.12, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#1c1c22";                          // tyres
  ctx.fillRect(-w * 0.5, -h * 0.32, w * 0.16, h * 0.32);
  ctx.fillRect(w * 0.34, -h * 0.32, w * 0.16, h * 0.32);
  ctx.fillStyle = color;                              // body
  ctx.beginPath();
  ctx.moveTo(-w * 0.48, -h * 0.18);
  ctx.lineTo(-w * 0.46, -h * 0.62);
  ctx.quadraticCurveTo(-w * 0.32, -h * 1.0, 0, -h * 1.0);
  ctx.quadraticCurveTo(w * 0.32, -h * 1.0, w * 0.46, -h * 0.62);
  ctx.lineTo(w * 0.48, -h * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.45)";
  ctx.lineWidth = Math.max(1, w * 0.02);
  ctx.stroke();
  ctx.fillStyle = "#26303d";                          // rear window
  ctx.beginPath();
  ctx.moveTo(-w * 0.3, -h * 0.66);
  ctx.quadraticCurveTo(0, -h * 0.98, w * 0.3, -h * 0.66);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, 0.7);                  // bumper
  ctx.fillRect(-w * 0.44, -h * 0.3, w * 0.88, h * 0.12);
  ctx.fillStyle = braking ? "#ff2a2a" : "#b3262a";    // tail lights
  ctx.fillRect(-w * 0.42, -h * 0.5, w * 0.16, h * 0.1);
  ctx.fillRect(w * 0.26, -h * 0.5, w * 0.16, h * 0.1);
  ctx.restore();
}

function render(ctx, W, H, track, me, cars, t, skyOff) {
  const L = track.LAP, len = track.segs.length;
  const pos = (((me.d - PLAYER_Z) % L) + L) % L;
  const baseI = Math.floor(pos / SEG), basePct = (pos % SEG) / SEG;
  const pSeg = segAt(track, me.d), pPct = ((((me.d % L) + L) % L) % SEG) / SEG;
  const playerY = pSeg.y1 + (pSeg.y2 - pSeg.y1) * pPct;

  // sky and hills, drifting with the bends
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, "#5aa9e6");
  sky.addColorStop(1, "#bfe3f7");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  for (const [hcol, amp, base, speed] of [["#9cc79a", 0.07, 0.5, 0.4], ["#78b16f", 0.05, 0.55, 0.7]]) {
    ctx.fillStyle = hcol;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H * base - Math.sin((x + skyOff * speed * W) / (W * 0.18)) * H * amp - H * amp);
    ctx.lineTo(W, H);
    ctx.fill();
  }

  // project the segments near to far, keeping each one's screen strip
  const proj = new Array(DRAW);
  let maxy = H, x = 0, dx = -(track.segs[baseI].curve * basePct);
  const camX = me.x * ROAD_W, camY = playerY + CAM_H;
  const P = (wx, wy, wz) => {
    const cz = wz, sc = CAM_DEPTH / cz;
    return { x: W / 2 + sc * wx * W / 2, y: H / 2 - sc * wy * H / 2, w: sc * ROAD_W * W / 2, sc };
  };
  for (let n = 0; n < DRAW; n++) {
    const seg = track.segs[(baseI + n) % len];
    const looped = seg.i < baseI;
    const z1 = seg.z1 - pos + (looped ? L : 0), z2 = z1 + SEG;
    // across: the road's centre, shifted by the bends so far, relative to your car
    const p1 = P(x - camX, seg.y1 - camY, z1), p2 = P(x + dx - camX, seg.y2 - camY, z2);
    x += dx;
    dx += seg.curve;
    proj[n] = { seg, p1, p2, clip: maxy, ok: false };
    if (z1 <= CAM_DEPTH || p2.y >= p1.y || p2.y >= maxy) continue;
    proj[n].ok = true;
    const dark = Math.floor(seg.i / 3) % 2;
    // grass, rumble strips, road, lane lines
    ctx.fillStyle = dark ? "#3f9a43" : "#47a84b";
    ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);
    const quad = (x1, w1, x2, w2, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      // a pixel of overlap with the strip beyond, so no grass shows through the seam
      ctx.moveTo(x1 - w1, p1.y + 0.5); ctx.lineTo(x1 + w1, p1.y + 0.5); ctx.lineTo(x2 + w2, p2.y - 1); ctx.lineTo(x2 - w2, p2.y - 1);
      ctx.closePath();
      ctx.fill();
    };
    quad(p1.x, p1.w * 1.15, p2.x, p2.w * 1.15, dark ? "#e8e8e8" : "#d6283b");
    quad(p1.x, p1.w, p2.x, p2.w, dark ? "#5b5d66" : "#62646d");
    if (dark) for (const lane of [-1 / 3, 1 / 3]) {
      quad(p1.x + p1.w * lane * 2, p1.w * 0.02, p2.x + p2.w * lane * 2, p2.w * 0.02, "#f2f2f2");
    }
    if (seg.i % len === 0 || seg.i % len === 1) quad(p1.x, p1.w, p2.x, p2.w, (seg.i % 2) ? "#111" : "#fafafa");  // the line
    maxy = p1.y;
  }

  // far to near: roadside trees, then cars, each clipped behind the hills
  const carsBySeg = new Map();
  for (const c of cars) {
    const cz = (((c.d % L) + L) % L);
    const n = (Math.floor(cz / SEG) - baseI + len) % len;
    if (n >= DRAW || n < 1) continue;
    if (!carsBySeg.has(n)) carsBySeg.set(n, []);
    carsBySeg.get(n).push({ c, pct: (cz % SEG) / SEG });
  }
  for (let n = DRAW - 1; n > 0; n--) {
    const pr = proj[n];
    if (!pr || !pr.ok) continue;
    const { p1, p2, seg } = pr;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, pr.clip);
    ctx.clip();
    if (seg.i % 8 === 0) {
      for (const side of [-1, 1]) {
        const tx = p1.x + side * p1.w * 1.45, th = p1.w * 0.9, tw = p1.w * 0.32;
        ctx.fillStyle = "#6b4a2b";
        ctx.fillRect(tx - tw * 0.08, p1.y - th * 0.35, tw * 0.16, th * 0.35);
        ctx.fillStyle = seg.i % 16 ? "#2f7d32" : "#3c8f3a";
        ctx.beginPath();
        ctx.moveTo(tx, p1.y - th); ctx.lineTo(tx + tw / 2, p1.y - th * 0.3); ctx.lineTo(tx - tw / 2, p1.y - th * 0.3);
        ctx.fill();
      }
    }
    for (const { c, pct } of carsBySeg.get(n) || []) {
      const sc = p1.sc + (p2.sc - p1.sc) * pct;
      const cx = p1.x + (p2.x - p1.x) * pct + sc * c.x * ROAD_W * W / 2;
      const cy = p1.y + (p2.y - p1.y) * pct;
      const cw = sc * CAR_W * W / 2;
      if (cw < 2) continue;
      drawCar(ctx, cx, cy, cw, c.color, 0);
      if (c.name && cw > 14) {
        const fs = Math.max(10, Math.min(16, cw * 0.28));
        ctx.font = `bold ${fs}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,.7)";
        ctx.strokeText(c.name, cx, cy - cw * 0.62);
        ctx.fillStyle = "#fff";
        ctx.fillText(c.name, cx, cy - cw * 0.62);
      }
    }
    ctx.restore();
  }

  // your car
  const steerTilt = (me.steerShow || 0) * 0.06;
  const bounce = me.speed > 0 ? Math.sin(t * 30) * 1.2 * (me.speed / MAX_SPEED) : 0;
  drawCar(ctx, W / 2, H - H * 0.04 + bounce, Math.min(W * 0.3, H * 0.36), me.color, steerTilt, me.braking);
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function Speedway(props) {
  const { roomCode, seed, players, currentUser, onGameEnd, durationSeconds = 120,
    startedAt, serverNow, isSpectator = false, spectatorWatching = null } = props;
  const eng = useGameEngine({ roomCode, players, currentUser, durationSeconds, startedAt, serverNow, isSpectator, onGameEnd });
  const { addScore } = eng;
  const { socket } = useSocket() || {};
  const track = useMemo(() => buildTrack(seed), [seed]);

  // grid slots by join order (user id), the same on every phone
  const seated = useMemo(() => (players || []).filter((p) => !p.is_spectator)
    .map((p) => ({ id: Number(p.user_id), name: p.username })).sort((a, b) => a.id - b.id), [players]);
  const myId = Number(currentUser?.id);
  const mySlot = Math.max(0, seated.findIndex((p) => p.id === myId));
  const solo = seated.length <= 1;

  const me = useRef(null);
  if (me.current === null) me.current = { ...newCar(mySlot), color: COLOURS[mySlot % COLOURS.length] };
  const bots = useRef(null);
  if (bots.current === null) bots.current = solo ? newBots(seed, 3, 1) : [];
  const remote = useRef(new Map());                   // user id -> { d, x, s, f, at }
  const input = useRef({ left: false, right: false, brake: false });
  const canvasRef = useRef(null);
  const size = useRef({ w: 300, h: 400 });
  const overRef = useRef(false);
  useEffect(() => { overRef.current = eng.gameOver; }, [eng.gameOver]);
  const elapsedRef = useRef(0);
  useEffect(() => { elapsedRef.current = Math.max(0, durationSeconds - eng.timeLeft); }, [eng.timeLeft, durationSeconds]);

  const [hud, setHud] = useState({ place: 1, of: 1, lap: 1, speed: 0, count: START_S, since: -START_S, finished: null });
  const [msg, setMsg] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type, ms = 900) => {
    setMsg({ text, type });
    timers.current.push(setTimeout(() => setMsg(null), ms));
  };

  // everyone else's cars, from the room
  useEffect(() => {
    if (!socket) return undefined;
    const onPos = (m) => {
      const id = Number(m.user_id);
      if (id === myId) return;
      remote.current.set(id, { d: m.d, x: m.x, s: m.s, f: m.f, at: performance.now() });
    };
    socket.on("race:pos", onPos);
    return () => socket.off("race:pos", onPos);
  }, [socket, myId]);

  // keys: hold to steer, down to brake
  useEffect(() => {
    if (isSpectator) return undefined;
    const set = (e, v) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a") input.current.left = v;
      else if (k === "ArrowRight" || k === "d") input.current.right = v;
      else if (k === "ArrowDown" || k === "s") input.current.brake = v;
      else return;
      e.preventDefault();
    };
    const dn = (e) => set(e, true), up = (e) => set(e, false);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [isSpectator]);

  // touch: hold either half of the road to steer that way
  const holds = useRef(new Map());
  const onDown = (e) => {
    if (isSpectator) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    const box = e.currentTarget.getBoundingClientRect();
    holds.current.set(e.pointerId, e.clientX - box.left < box.width / 2 ? "left" : "right");
  };
  const onUp = (e) => { holds.current.delete(e.pointerId); };

  useEffect(() => {
    if (isSpectator) return undefined;
    let raf, last = performance.now(), pushed = 0, lastHud = 0, sent = 0, skyOff = 0, wasLap = 1, said = -1;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = elapsedRef.current;
      const go = elapsed >= START_S;
      const car = me.current;
      // everyone else, carried forward from their last report
      const others = [];
      for (const [id, r] of remote.current) {
        const ahead = r.f === null ? (r.s * (now - r.at)) / 1000 : 0;
        const who = seated.find((p) => p.id === id);
        const slot = seated.findIndex((p) => p.id === id);
        others.push({ d: r.d + ahead, x: r.x, finishedAt: r.f, color: COLOURS[Math.max(0, slot) % COLOURS.length], name: who ? who.name : "" });
      }
      for (const b of bots.current) {
        driveBot(track, b, dt, go, [car, ...bots.current.filter((o) => o !== b)], elapsed);
        others.push(b);
      }
      if (!overRef.current) {
        const held = [...holds.current.values()];
        const left = input.current.left || held.includes("left"), right = input.current.right || held.includes("right");
        const steer = (left ? -1 : 0) + (right ? 1 : 0);
        car.steerShow = steer;
        car.braking = input.current.brake;
        const out = drive(track, car, { steer, brake: input.current.brake }, dt, go, others, elapsed);
        if (out.bumped) flash("Bump!", "error", 600);
        const target = raceScore(track, car, durationSeconds);
        if (target !== pushed) { addScore(target - pushed); pushed = target; }
        const lap = lapOf(track, car.d);
        if (lap !== wasLap && car.finishedAt === null) { flash(lap === LAPS ? "Final lap!" : `Lap ${lap}`, "info"); wasLap = lap; }
        if (socket && roomCode && now - sent > SEND_MS) {
          sent = now;
          socket.emit("race:pos", { code: roomCode, d: Math.round(car.d), x: Math.round(car.x * 1000) / 1000, s: Math.round(car.speed), f: car.finishedAt });
        }
      }
      skyOff += segAt(track, car.d).curve * (car.speed / MAX_SPEED) * dt * 0.02;
      const all = [car, ...others];
      const place = placeOf(car, all);
      if (car.finishedAt !== null && said < 0) { said = place; flash(`Finished ${PLACE[place] || place + "th"}!`, "success", 3000); }
      if (now - lastHud > 120) {
        lastHud = now;
        setHud({ place, of: all.length, lap: lapOf(track, car.d), speed: kmh(car), count: Math.max(0, START_S - elapsed), since: elapsed - START_S, finished: car.finishedAt });
      }
      const c = canvasRef.current;
      if (c) {
        const { w, h } = size.current, dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const ctx = c.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        render(ctx, w, h, track, car, others, now / 1000, skyOff);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, addScore, socket, roomCode, track, seated, durationSeconds]);

  const stats = [
    { label: "Place", value: `${PLACE[hud.place] || hud.place}/${hud.of}` },
    { label: "Lap", value: `${Math.min(hud.lap, LAPS)}/${LAPS}` },
    { label: "Speed", value: `${hud.speed} km/h` },
  ];
  const hold = (side, label, aria) => (
    <button className="press p-white sw-btn" aria-label={aria}
      onPointerDown={(e) => { e.preventDefault(); input.current[side] = true; }}
      onPointerUp={() => { input.current[side] = false; }} onPointerCancel={() => { input.current[side] = false; }}
      onPointerLeave={() => { input.current[side] = false; }}>{label}</button>
  );
  const controls = !isSpectator ? <>{hold("left", "◀", "Steer left")}{hold("brake", "Brake", "Brake")}{hold("right", "▶", "Steer right")}</> : null;
  const count = Math.ceil(hud.count);

  return (
    <>
      <GameFrame
        gameName="Speedway" badge="🏁 SPEEDWAY"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={isSpectator ? [{ label: "Score", value: Number(spectatorWatching?.score ?? 0).toLocaleString() }] : stats}
        timer={{ value: eng.timeLeft, max: durationSeconds }}
        opponents={Object.values(eng.opponents)}
        teams={eng.teams}
        message={msg}
        onQuit={eng.endMatch}
        controls={controls}
      >
        {({ w, h }) => {
          if (isSpectator) {
            return <div className="muted">👀 Watching {spectatorWatching?.username} — {Number(spectatorWatching?.score ?? 0).toLocaleString()} pts</div>;
          }
          const cw = w, ch = Math.min(h, w * 1.25);
          size.current = { w: cw, h: ch };
          return (
            <div className="sw-pad" style={{ width: w, height: h }}
              onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={(e) => e.preventDefault()}>
              <div className="sw-stage" style={{ width: cw, height: ch }}>
                <canvas ref={canvasRef} className="sw-canvas" style={{ width: cw, height: ch }}
                  role="img" aria-label="Speedway: steer round the bends, three laps" />
                {hud.count > 0 && <div className="sw-count">{count}</div>}
                {hud.count <= 0 && hud.since >= 0 && hud.since < 1.2 && <div className="sw-count go">GO!</div>}
              </div>
              <div className="sw-help muted">{solo ? "Race the computer · " : ""}Hold ◀ ▶ (or either side of the road) to steer</div>
            </div>
          );
        }}
      </GameFrame>
      {eng.gameOver && !isSpectator && (
        <GameOver eng={eng} me={currentUser}
          extra={hud.finished !== null ? `Finished ${PLACE[hud.place] || hud.place}` : `Lap ${Math.min(hud.lap, LAPS)} of ${LAPS} · ${PLACE[hud.place] || hud.place} place`} />
      )}
    </>
  );
}
