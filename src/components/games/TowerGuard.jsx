// src/components/games/TowerGuard.jsx
// TOWER GUARD — keep the monsters off the road to your castle. Solo, against
// friends (the same map and waves each), in teams, or together on one map
// with a purse each.
//
// The server runs the map (config/togetherWorld.js, rules in
// together/towerCore.mjs): monsters, towers, shots, coins, lives. This phone
// draws it — the monsters eased along the road between ticks — and sends
// build / upgrade / sell. Tap the grass to build there, tap a tower to
// upgrade or sell it.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import TogetherResults from "../together/TogetherResults";
import useTogether, { secondsLeft, blend, rivals, myScore } from "../together/useTogether";
import { W, H, TOWERS, MONSTERS, MAX_LEVEL, at, buildable, towerStats, upgradeCost } from "../together/towerCore.mjs";

const TAU = Math.PI * 2;
const WHY = { coins: "Not enough coins yet", spot: "Can't build there", max: "That tower is as strong as it gets", notyours: "Only its builder can sell it", out: "Your castle has fallen" };
const OWNER_COLOURS = ["#4CC9F0", "#FF8FC7", "#8FDB5C", "#FFA36C"];

function emoji(ctx, e, x, y, size) {
  ctx.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(e, x, y + size * 0.05);
}

// ── the map, drawn once per size into a picture of its own ───────────────────
function paintMap(map, T, seed) {
  const c = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = W * T * dpr; c.height = H * T * dpr;
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    ctx.fillStyle = (x + y) % 2 ? "#9BD770" : "#90CF66";
    ctx.fillRect(x * T, y * T, T, T);
  }
  // tufts of grass, the same every time
  let r = (Number(seed) || 1) % 9973;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  ctx.strokeStyle = "rgba(60,120,40,.35)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 60; i++) {
    const x = rnd() * W * T, y = rnd() * H * T;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 6); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 6); ctx.stroke();
  }
  // the road: a wide sandy band with an edge
  const pts = map.path.map(([x, y]) => [(x + 0.5) * T, (y + 0.5) * T]);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "#B58A55"; ctx.lineWidth = T * 0.92;
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.strokeStyle = "#E8C98E"; ctx.lineWidth = T * 0.78;
  ctx.stroke();
  ctx.strokeStyle = "rgba(181,138,85,.35)"; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
  ctx.stroke(); ctx.setLineDash([]);
  // the cave they come out of
  const [sx] = pts[0];
  ctx.fillStyle = "#3B3548";
  ctx.beginPath(); ctx.arc(sx, 0, T * 0.6, 0, Math.PI); ctx.fill();
  // trees
  for (const k of map.trees) emoji(ctx, "🌲", (k % W + 0.5) * T, (Math.floor(k / W) + 0.45) * T, T * 0.8);
  return c;
}

function drawMonster(ctx, kind, x, y, T, t, id, hp, slowed) {
  const bob = Math.sin(t * 8 + id) * T * 0.04;
  ctx.fillStyle = "rgba(46,33,64,.2)";
  ctx.beginPath(); ctx.ellipse(x, y + T * 0.22, T * 0.24, T * 0.08, 0, 0, TAU); ctx.fill();
  if (kind === "slime") {
    const sq = 1 + Math.sin(t * 9 + id) * 0.08;
    ctx.fillStyle = slowed ? "#8FD8F5" : "#6BD35A";
    ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y + T * 0.06, T * 0.24 * sq, (T * 0.2) / sq, 0, Math.PI, 0); ctx.lineTo(x + T * 0.24 * sq, y + T * 0.12); ctx.lineTo(x - T * 0.24 * sq, y + T * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#2E2140";
    ctx.beginPath(); ctx.arc(x - T * 0.08, y, T * 0.035, 0, TAU); ctx.arc(x + T * 0.08, y, T * 0.035, 0, TAU); ctx.fill();
  } else {
    const e = kind === "bat" ? "🦇" : kind === "ogre" ? "👹" : "🐉";
    const size = kind === "dragon" ? T * 0.9 : kind === "ogre" ? T * 0.6 : T * 0.5;
    if (slowed) { ctx.fillStyle = "rgba(143,216,245,.55)"; ctx.beginPath(); ctx.arc(x, y, size * 0.55, 0, TAU); ctx.fill(); }
    emoji(ctx, e, x, y + bob + (kind === "bat" ? -T * 0.12 : 0), size);
  }
  if (hp < 100) {
    const w = kind === "dragon" ? T * 0.8 : T * 0.5;
    ctx.fillStyle = "rgba(46,33,64,.8)"; ctx.fillRect(x - w / 2 - 1, y - T * 0.42 - 1, w + 2, 5);
    ctx.fillStyle = hp > 50 ? "#8FDB5C" : hp > 25 ? "#FFC53D" : "#FF6B6B"; ctx.fillRect(x - w / 2, y - T * 0.42, (w * hp) / 100, 3);
  }
}

function drawTower(ctx, tw, T, t, colour, selected) {
  const [x, y, kind, level, , aim] = tw;
  const cx = (x + 0.5) * T, cy = (y + 0.5) * T, def = TOWERS[kind];
  ctx.fillStyle = "rgba(46,33,64,.25)";
  ctx.beginPath(); ctx.ellipse(cx, cy + T * 0.3, T * 0.36, T * 0.12, 0, 0, TAU); ctx.fill();
  // the base: stone, with the builder's colour round it
  ctx.fillStyle = "#D9D2C5"; ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy + T * 0.06, T * 0.38, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = colour; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy + T * 0.06, T * 0.31, 0, TAU); ctx.stroke();
  // the barrel, pointing where it last shot
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(aim || -Math.PI / 2);
  ctx.fillStyle = def.colour; ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2;
  ctx.fillRect(0, -T * 0.07, T * 0.36, T * 0.14); ctx.strokeRect(0, -T * 0.07, T * 0.36, T * 0.14);
  ctx.restore();
  ctx.fillStyle = def.colour;
  ctx.beginPath(); ctx.arc(cx, cy, T * 0.25, 0, TAU); ctx.fill(); ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 2; ctx.stroke();
  emoji(ctx, def.icon, cx, cy, T * 0.38);
  // level pips
  for (let i = 0; i < level; i++) {
    ctx.fillStyle = "#FFC53D"; ctx.strokeStyle = "#2E2140"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx + (i - (level - 1) / 2) * T * 0.17, cy + T * 0.42, T * 0.065, 0, TAU); ctx.fill(); ctx.stroke();
  }
  if (selected) {
    const st = towerStats(kind, level);
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.strokeStyle = `rgba(255,255,255,${0.7 + Math.sin(t * 5) * 0.2})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, st.range * T, 0, TAU); ctx.fill(); ctx.stroke();
  }
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function TowerGuard(props) {
  const { roomCode, seed, currentUser, isSpectator = false, spectatorWatching = null, onGameEnd, durationSeconds = 300 } = props;
  const myId = Number(currentUser?.id);
  const canvasRef = useRef(null);
  const size = useRef({ T: 40 });
  const mapPic = useRef({ key: "", pic: null, map: null });
  const fx = useRef({ pops: [], shots: [], hit: 0 });
  const [pick, setPick] = useState(null);           // { x, y, tower? } — the sheet at the bottom
  const pickRef = useRef(null);
  pickRef.current = pick;
  const [msg, setMsg] = useState(null);
  const [hud, setHud] = useState({ left: durationSeconds, score: 0, coins: 0, lives: 20, wave: 0, next: 0, rivals: [], fallen: false, towers: [] });
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type = "info", ms = 1200) => { setMsg({ text, type }); timers.current.push(setTimeout(() => setMsg(null), ms)); };

  const tg = useTogether({
    roomCode, watchId: spectatorWatching?.user_id ?? null,
    onTick: (v) => {
      const now = performance.now() / 1000, f = fx.current;
      for (const sh of v.sh || []) f.shots.push({ s: sh, at: now });
      for (const e of v.e || []) {
        if (e.type === "kill") f.pops.push({ text: `+${e.b}`, x: e.x, y: e.y, at: now });
        else if (e.type === "leak") { f.hit = now; flash(`💔 A ${MONSTERS[e.kind].name.toLowerCase()} got through! ${e.lives} lives left`, "error"); }
        else if (e.type === "wave") flash(e.dragon ? `🐉 Wave ${e.wave} — a dragon is coming!` : `⚔️ Wave ${e.wave}!`, e.dragon ? "error" : "info", 1600);
        else if (e.type === "cleared") flash(`✅ Wave ${e.wave} seen off!`, "success");
        else if (e.type === "fallen") flash("🏰 The castle has fallen", "error", 3000);
      }
    },
    onReply: (r) => { if (!r.ok && WHY[r.why]) flash(WHY[r.why] + (r.need ? ` (${r.need} 🪙)` : ""), "info"); },
  });

  const { live: tgLive } = tg;
  useEffect(() => {
    let raf, lastHud = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const L = tgLive.current, c = canvasRef.current;
      if (!L || !c) return;
      const { T } = size.current;
      const key = `${T}|${L.world?.map?.name}`;
      // the map comes from the server (it was built from the room's seed);
      // its picture is painted once for each size
      if (mapPic.current.key !== key && L.world) {
        const map = rebuild(L.world.map);
        mapPic.current = { key, pic: paintMap(map, T, seed), map };
      }
      const map = mapPic.current.map;
      const cw = W * T, ch = H * T, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = ts / 1000, now = performance.now() / 1000, f = fx.current;
      const shake = now - f.hit < 0.35 ? Math.sin(now * 80) * 4 * (1 - (now - f.hit) / 0.35) : 0;
      ctx.save(); ctx.translate(shake, 0);
      if (mapPic.current.pic) ctx.drawImage(mapPic.current.pic, 0, 0, cw, ch);
      // the castle
      const cs = map.castle;
      emoji(ctx, "🏰", (cs.x + 0.5) * T, (cs.y + 0.35) * T, T * 1.15);
      const v = L.view;
      // a spot picked for building
      const p = pickRef.current;
      if (p && !p.tower) {
        ctx.strokeStyle = `rgba(255,255,255,${0.7 + Math.sin(t * 6) * 0.25})`; ctx.lineWidth = 3;
        ctx.strokeRect(p.x * T + 2, p.y * T + 2, T - 4, T - 4);
      }
      // towers
      const owners = L.players.map((x) => x.id);
      for (const tw of v.tw) drawTower(ctx, tw, T, t, OWNER_COLOURS[Math.max(0, owners.indexOf(tw[4])) % 4], p && p.tower && p.x === tw[0] && p.y === tw[1]);
      // monsters, eased along the road between ticks
      const k = blend(L);
      const prev = new Map((L.prev?.m || []).map((m) => [m[0], m]));
      const ms = v.m.map((m) => { const q = prev.get(m[0]); const d = q ? q[2] + (m[2] - q[2]) * k : m[2]; const [x, y] = at(map, d); return { m, x, y }; }).sort((a, b) => a.y - b.y);
      for (const { m, x, y } of ms) if (y > -0.5) drawMonster(ctx, m[1], x * T, y * T, T, t, m[0], m[3], m[4]);
      // shots
      f.shots = f.shots.filter((s) => now - s.at < 0.3);
      for (const { s, at: a0 } of f.shots) {
        const q = (now - a0) / 0.3, [tx, ty, mx, my, kind] = s;
        const x0 = (tx + 0.5) * T, y0 = (ty + 0.5) * T, x1 = mx * T, y1 = my * T;
        if (kind === "archer") {
          const hx = x0 + (x1 - x0) * Math.min(1, q * 2), hy = y0 + (y1 - y0) * Math.min(1, q * 2);
          ctx.strokeStyle = `rgba(90,60,30,${1 - q})`; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(hx - (x1 - x0) * 0.12, hy - (y1 - y0) * 0.12); ctx.lineTo(hx, hy); ctx.stroke();
        } else if (kind === "cannon") {
          if (q < 0.5) { const k2 = q * 2, hx = x0 + (x1 - x0) * k2, hy = y0 + (y1 - y0) * k2 - Math.sin(k2 * Math.PI) * T * 0.6; ctx.fillStyle = "#2E2140"; ctx.beginPath(); ctx.arc(hx, hy, T * 0.08, 0, TAU); ctx.fill(); }
          else { const k2 = (q - 0.5) * 2; ctx.fillStyle = `rgba(255,163,108,${0.7 * (1 - k2)})`; ctx.beginPath(); ctx.arc(x1, y1, T * (0.3 + 0.7 * k2), 0, TAU); ctx.fill(); }
        } else {
          ctx.strokeStyle = `rgba(143,216,245,${1 - q})`; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
      }
      // coins popping off kills
      f.pops = f.pops.filter((q) => now - q.at < 0.9);
      ctx.textAlign = "center";
      for (const q of f.pops) {
        const k2 = (now - q.at) / 0.9;
        ctx.globalAlpha = 1 - k2;
        ctx.font = `800 ${Math.round(T * 0.36)}px Fredoka,sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = "#2E2140"; ctx.fillStyle = "#FFC53D";
        ctx.strokeText(q.text, q.x * T, q.y * T - k2 * T * 0.8); ctx.fillText(q.text, q.x * T, q.y * T - k2 * T * 0.8);
        ctx.globalAlpha = 1;
      }
      // between waves: the countdown, big and soft
      if (!v.fl && v.nw > 0) {
        ctx.font = `800 ${Math.round(T * 0.5)}px Fredoka,sans-serif`;
        ctx.lineWidth = 5; ctx.strokeStyle = "#2E2140"; ctx.fillStyle = "#FFFFFF";
        const text = v.wv === 0 ? `Build! First wave in ${Math.ceil(v.nw)}` : `Wave ${v.wv + 1} in ${Math.ceil(v.nw)}`;
        ctx.strokeText(text, cw / 2, T * 0.8); ctx.fillText(text, cw / 2, T * 0.8);
      }
      if (v.fl) { ctx.fillStyle = "rgba(46,33,64,.45)"; ctx.fillRect(0, 0, cw, ch); emoji(ctx, "🏚️", cw / 2, ch / 2 - T, T * 2); ctx.font = `800 ${Math.round(T * 0.6)}px Fredoka,sans-serif`; ctx.fillStyle = "#fff"; ctx.fillText("The castle has fallen", cw / 2, ch / 2 + T * 0.4); }
      ctx.restore();
      if (ts - lastHud > 200) {
        lastHud = ts;
        const mine = (v.$ || []).find(([id]) => id === myId);
        setHud({ left: secondsLeft(L), score: myScore(L), coins: mine ? mine[1] : 0, lives: v.lv, wave: v.wv, next: v.nw, rivals: rivals(L), fallen: !!v.fl, towers: v.tw });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tgLive, seed, myId]);

  // tap the map: a tower to look at, or grass to build on
  const onTap = (e) => {
    if (isSpectator) return;
    const c = canvasRef.current, L = tg.live.current, map = mapPic.current.map;
    if (!c || !L || !map || L.view.fl) return;
    const r = c.getBoundingClientRect(), { T } = size.current;
    const k = (W * T) / (c.clientWidth || W * T);
    const x = Math.floor(((e.clientX - r.left - c.clientLeft) * k) / T), y = Math.floor(((e.clientY - r.top - c.clientTop) * k) / T);
    const tower = L.view.tw.find((tw) => tw[0] === x && tw[1] === y);
    if (tower) { setPick({ x, y, tower: true }); return; }
    if (!buildable(map, x, y)) { setPick(null); return; }
    setPick({ x, y, tower: false });
  };
  const build = (kind) => { if (pick) { tg.send("build", { x: pick.x, y: pick.y, kind }); setPick(null); } };
  const upgrade = () => { if (pick) tg.send("up", { x: pick.x, y: pick.y }); };
  const sell = () => { if (pick) { tg.send("sell", { x: pick.x, y: pick.y }); setPick(null); } };

  const L = tg.live.current;
  const selTower = pick && pick.tower ? hud.towers.find((tw) => tw[0] === pick.x && tw[1] === pick.y) : null;
  useEffect(() => { if (pick && pick.tower && !selTower) setPick(null); }, [pick, selTower]);

  const stats = [
    { label: "Score", value: Number(hud.score).toLocaleString() },
    { label: "Coins", value: `🪙 ${hud.coins}` },
    { label: "Lives", value: `❤️ ${hud.lives}`, urgent: hud.lives <= 5 },
    { label: "Wave", value: hud.wave || "—" },
  ];
  let sheet = null;
  if (!isSpectator && pick && !pick.tower) {
    sheet = (
      <div className="tw-sheet">
        {Object.entries(TOWERS).map(([kind, d]) => (
          <button key={kind} className={`press tw-buy${hud.coins < d.cost ? " poor" : ""}`} onClick={() => build(kind)}>
            <span className="tw-ic">{d.icon}</span><b>{d.name}</b><small>🪙 {d.cost}</small>
          </button>
        ))}
        <button className="press p-white tw-x" onClick={() => setPick(null)} aria-label="Close">✕</button>
      </div>
    );
  } else if (!isSpectator && selTower) {
    const [, , kind, level, owner] = selTower;
    const def = TOWERS[kind];
    const ownerName = owner === myId ? "yours" : `${L?.players.find((p) => p.id === owner)?.name || "someone"}'s`;
    sheet = (
      <div className="tw-sheet">
        <div className="tw-info"><span className="tw-ic">{def.icon}</span><b>{def.name}</b><small>Level {level} · {ownerName}</small></div>
        {level < MAX_LEVEL
          ? <button className={`press p-sun tw-act${hud.coins < upgradeCost(kind, level) ? " poor" : ""}`} onClick={upgrade}>⬆️ Upgrade<small>🪙 {upgradeCost(kind, level)}</small></button>
          : <span className="tw-max">⭐ Max</span>}
        {owner === myId && <button className="press p-white tw-act" onClick={sell}>💰 Sell</button>}
        <button className="press p-white tw-x" onClick={() => setPick(null)} aria-label="Close">✕</button>
      </div>
    );
  }

  return (
    <>
      <GameFrame
        gameName="Tower Guard" badge="🏰 TOWER GUARD"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: hud.left, max: durationSeconds }}
        opponents={hud.rivals}
        message={msg}
        onQuit={onGameEnd}
        controls={sheet || (!isSpectator ? <div className="tw-hint muted">Tap the grass to build · tap a tower to upgrade</div> : null)}
      >
        {({ w, h }) => {
          const T = Math.max(20, Math.floor(Math.min(w / W, h / H)));
          size.current = { T };
          return (
            <div className="tw-pad" style={{ width: w, height: h }} onContextMenu={(e) => e.preventDefault()}>
              {!tg.ready && <div className="muted">{tg.gone ? "This battle is over." : "Marching to the castle…"}</div>}
              <canvas ref={canvasRef} className="tw-canvas" onPointerDown={onTap}
                style={{ width: W * T, height: H * T, display: tg.ready ? "block" : "none" }}
                role="img" aria-label="Tower Guard: the road to your castle, from above" />
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
        <TogetherResults over={tg.over} me={currentUser} onExit={onGameEnd} icon="🏰"
          goalText={(s) => (s.sum?.fallen ? `The castle fell in wave ${s.sum.wave}.` : `The castle stood — ${s.sum?.waves ?? 0} waves seen off, ${s.sum?.kills ?? 0} monsters stopped.`)}
          describe={(s) => `${s.sum?.fallen ? "🏚️ fell" : `❤️ ${s.sum?.lives ?? 0}`} · wave ${s.sum?.wave ?? 0} · ${s.sum?.kills ?? 0} stopped`} />
      )}
    </>
  );
}

// The map the server sent, made walkable for drawing.
function rebuild(m) {
  const pts = m.path.map(([x, y]) => [x + 0.5, y + 0.5]);
  const segs = [];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const l = Math.hypot(bx - ax, by - ay);
    segs.push({ ax, ay, bx, by, l, at: len });
    len += l;
  }
  const road = new Set();
  for (const s of segs) {
    const steps = Math.ceil(s.l * 4);
    for (let k = 0; k <= steps; k++) {
      const x = Math.floor(s.ax + ((s.bx - s.ax) * k) / steps), y = Math.floor(s.ay + ((s.by - s.ay) * k) / steps);
      if (x >= 0 && y >= 0 && x < W && y < H) road.add(y * W + x);
    }
  }
  return { name: m.name, path: m.path, pts, segs, len, road, trees: new Set(m.trees), castle: m.castle };
}
