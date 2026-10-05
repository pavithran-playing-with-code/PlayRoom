// src/components/games/TowerGuard.jsx
// TOWER GUARD — keep the monsters off the road to your castle. Solo, against
// friends (the same map and waves each), in teams, or together on one map
// with a purse each.
//
// The server runs the map (config/togetherWorld.js, rules in
// together/towerCore.mjs): monsters, towers, shots, coins, lives. This phone
// draws it (the pictures are towerArt.js) — the monsters eased along the road
// between ticks — and sends build / upgrade / sell / send-the-next-wave.
// Tap the grass to build there, tap a tower to upgrade or sell it.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import TogetherResults from "../together/TogetherResults";
import useTogether, { secondsLeft, smoothRows, rivals, myScore } from "../together/useTogether";
import { W, H, TOWERS, MONSTERS, MAX_LEVEL, SELL_BACK, LIVES, at, buildable, towerStats, upgradeCost } from "../together/towerCore.mjs";
import { paintMap, caveEyes, castle, drawTower, drawMonster, drawShot, statChips, emoji } from "./towerArt";

const Chips = ({ list }) => <span className="tw-chips">{list.map((c) => <i key={c}>{c}</i>)}</span>;

const TAU = Math.PI * 2;
const WHY = { coins: "Not enough coins yet", spot: "Can't build there", max: "That tower is as strong as it gets", notyours: "Only its builder can sell it", out: "Your castle has fallen" };
const OWNER_COLOURS = ["#4CC9F0", "#FF8FC7", "#8FDB5C", "#FFA36C"];
const LEVEL_NAMES = {
  archer: ["Lookout", "Archer Tower", "Archer Keep"],
  cannon: ["Cannon Cart", "Bastion", "Twin Fortress"],
  frost: ["Ice Shard", "Ice Cluster", "Frost Spire"],
};
const spentOn = (kind, level) => { let s = TOWERS[kind].cost; for (let l = 1; l < level; l++) s += upgradeCost(kind, l); return s; };

// A little picture of a tower at a level, for the shop and the upgrade sheet.
function TowerIcon({ kind, level, size = 46 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawTower(ctx, kind, level, size / 2, size * 0.5, size * 0.78, 0.5, -Math.PI / 4, "rgba(0,0,0,0)");
  }, [kind, level, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function TowerGuard(props) {
  const { roomCode, seed, currentUser, isSpectator = false, spectatorWatching = null, onGameEnd, durationSeconds = 300 } = props;
  const myId = Number(currentUser?.id);
  const canvasRef = useRef(null);
  const size = useRef({ T: 40 });
  const mapPic = useRef({ key: "", pic: null, map: null });
  // effects: coin pops, shots, monster hit-flashes, puffs, tower bounces, sparkles
  const fx = useRef({ pops: [], shots: [], hit: 0, flash: new Map(), lastHp: new Map(), puffs: [], bounce: new Map(), sparks: [], words: [] });
  const [pick, setPick] = useState(null);           // { x, y, tower? } — the sheet at the bottom
  const pickRef = useRef(null);
  pickRef.current = pick;
  const [msg, setMsg] = useState(null);
  const [hud, setHud] = useState({ left: durationSeconds, score: 0, coins: 0, lives: LIVES, wave: 0, next: 0, live: false, leftIn: 0, rivals: [], fallen: false, towers: [] });
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type = "info", ms = 1200) => { setMsg({ text, type }); timers.current.push(setTimeout(() => setMsg(null), ms)); };

  const tg = useTogether({
    roomCode, watchId: spectatorWatching?.user_id ?? null,
    onTick: (v) => {
      const now = performance.now() / 1000, f = fx.current;
      for (const sh of v.sh || []) f.shots.push({ s: sh, at: now });
      // a monster that lost health this tick flashes white
      const seen = new Set();
      for (const m of v.m) {
        seen.add(m[0]);
        const was = f.lastHp.get(m[0]);
        if (was !== undefined && m[3] < was) f.flash.set(m[0], now);
        f.lastHp.set(m[0], m[3]);
      }
      for (const id of [...f.lastHp.keys()]) if (!seen.has(id)) f.lastHp.delete(id);
      for (const e of v.e || []) {
        if (e.type === "kill") {
          f.pops.push({ text: `+${e.b}`, x: e.x, y: e.y, at: now });
          for (let i = 0; i < 8; i++) f.puffs.push({ x: e.x, y: e.y, a: (i * TAU) / 8, at: now, c: e.kind === "slime" ? "#8FDB5C" : e.kind === "bat" ? "#9B5DE5" : e.kind === "ogre" ? "#B5C27A" : "#FF6B6B" });
        } else if (e.type === "leak") { f.hit = now; flash(`💔 A ${MONSTERS[e.kind].name.toLowerCase()} got through! ${e.lives} lives left`, "error"); }
        else if (e.type === "wave") flash(e.dragon ? `🐉 Wave ${e.wave} — a dragon is coming!` : `⚔️ Wave ${e.wave}!`, e.dragon ? "error" : "info", 1600);
        else if (e.type === "cleared") flash(`✅ Wave ${e.wave} seen off! +${10 + 2 * e.wave} 🪙`, "success");
        else if (e.type === "fallen") flash("🏰 The castle has fallen", "error", 3000);
        else if (e.type === "early") flash(`⏩ Here they come! +${e.bonus} 🪙 each`, "success");
        else if (e.type === "built") {
          f.bounce.set(`${e.x},${e.y}`, now);
          for (let i = 0; i < 6; i++) f.puffs.push({ x: e.x + 0.5, y: e.y + 0.75, a: Math.PI + (i * Math.PI) / 5, at: now, c: "#C8B48A" });
        } else if (e.type === "up") {
          f.bounce.set(`${e.x},${e.y}`, now);
          for (let i = 0; i < 12; i++) f.sparks.push({ x: e.x + 0.5, y: e.y + 0.4, a: (i * TAU) / 12, at: now });
          f.words.push({ text: `LEVEL ${e.level}!`, x: e.x + 0.5, y: e.y, at: now });
        } else if (e.type === "sold") f.pops.push({ text: `+${e.back}`, x: e.x + 0.5, y: e.y + 0.5, at: now });
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
      caveEyes(ctx, map, T, t);
      const v = L.view;
      // a spot picked for building: a glowing square and how far an archer would reach
      const p = pickRef.current;
      if (p && !p.tower) {
        ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc((p.x + 0.5) * T, (p.y + 0.5) * T, towerStats("archer", 1).range * T, 0, TAU); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(255,255,255,${0.7 + Math.sin(t * 6) * 0.25})`; ctx.lineWidth = 3;
        ctx.strokeRect(p.x * T + 2, p.y * T + 2, T - 4, T - 4);
      }
      // the range of the tower you're looking at
      const selected = p && p.tower ? v.tw.find((tw) => tw[0] === p.x && tw[1] === p.y) : null;
      if (selected) {
        const st = towerStats(selected[2], selected[3]);
        ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.strokeStyle = `rgba(255,255,255,${0.7 + Math.sin(t * 5) * 0.2})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc((selected[0] + 0.5) * T, (selected[1] + 0.5) * T, st.range * T, 0, TAU); ctx.fill(); ctx.stroke();
      }
      // monsters (behind what's lower on the screen) and towers, sorted by depth
      const owners = L.players.map((x) => x.id);
      const things = [];
      for (const { row: m } of smoothRows(L, "m", [2])) {
        const [x, y] = at(map, m[2]);
        if (y > -0.5) things.push({ y, draw: () => drawMonster(ctx, m[1], x * T, y * T, T, t, m[0], m[3], m[4], Math.max(0, 1 - (now - (f.flash.get(m[0]) || -9)) / 0.15)) });
      }
      for (const tw of v.tw) {
        const b = f.bounce.get(`${tw[0]},${tw[1]}`);
        const pop = b ? Math.max(0, Math.sin(Math.min(1, (now - b) / 0.4) * Math.PI)) * (1 - (now - b) / 0.4) : 0;
        things.push({ y: tw[1] + 0.6, draw: () => drawTower(ctx, tw[2], tw[3], (tw[0] + 0.5) * T, (tw[1] + 0.4) * T, T, t, tw[5], OWNER_COLOURS[Math.max(0, owners.indexOf(tw[4])) % 4], Math.max(0, pop)) });
      }
      things.push({ y: map.castle.y + 0.9, draw: () => castle(ctx, map, T, t, v.lv, LIVES) });
      things.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
      // shots
      f.shots = f.shots.filter((s) => now - s.at < 0.32);
      for (const { s, at: a0 } of f.shots) {
        const [tx, ty, mx, my, kind, level] = s;
        drawShot(ctx, kind, level || 1, (tx + 0.5) * T, (ty + 0.2) * T, mx * T, my * T, (now - a0) / 0.32, T);
      }
      // puffs, sparkles, coins, words
      f.puffs = f.puffs.filter((q) => now - q.at < 0.5);
      for (const q of f.puffs) {
        const k2 = (now - q.at) / 0.5;
        ctx.fillStyle = q.c; ctx.globalAlpha = 1 - k2;
        ctx.beginPath(); ctx.arc((q.x + Math.cos(q.a) * k2 * 0.45) * T, (q.y + Math.sin(q.a) * k2 * 0.3) * T - k2 * T * 0.2, T * (0.09 - k2 * 0.05), 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      f.sparks = f.sparks.filter((q) => now - q.at < 0.7);
      for (const q of f.sparks) {
        const k2 = (now - q.at) / 0.7, r = k2 * T * 0.7;
        ctx.fillStyle = `rgba(255,214,90,${1 - k2})`;
        const x = q.x * T + Math.cos(q.a) * r, y = q.y * T + Math.sin(q.a) * r * 0.7 - k2 * T * 0.3;
        ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 1.5, y - 1.5); ctx.lineTo(x + 4, y); ctx.lineTo(x + 1.5, y + 1.5); ctx.lineTo(x, y + 4); ctx.lineTo(x - 1.5, y + 1.5); ctx.lineTo(x - 4, y); ctx.lineTo(x - 1.5, y - 1.5); ctx.fill();
      }
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      f.pops = f.pops.filter((q) => now - q.at < 0.9);
      for (const q of f.pops) {
        const k2 = (now - q.at) / 0.9;
        ctx.globalAlpha = 1 - k2;
        ctx.font = `800 ${Math.round(T * 0.36)}px Fredoka,sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = "#2E2140"; ctx.fillStyle = "#FFC53D";
        ctx.strokeText(q.text, q.x * T, q.y * T - k2 * T * 0.8); ctx.fillText(q.text, q.x * T, q.y * T - k2 * T * 0.8);
        ctx.globalAlpha = 1;
      }
      f.words = f.words.filter((q) => now - q.at < 1.1);
      for (const q of f.words) {
        const k2 = (now - q.at) / 1.1;
        ctx.globalAlpha = 1 - k2 * k2;
        ctx.font = `800 ${Math.round(T * (0.36 + 0.1 * Math.sin(Math.min(1, k2 * 4) * Math.PI)))}px Fredoka,sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = "#2E2140"; ctx.fillStyle = "#FFFFFF";
        ctx.strokeText(q.text, q.x * T, q.y * T - k2 * T * 0.6); ctx.fillText(q.text, q.x * T, q.y * T - k2 * T * 0.6);
        ctx.globalAlpha = 1;
      }
      // the wave strip along the top: how far through this wave, or the countdown to the next
      if (!v.fl) {
        const sw = cw - T * 0.6, sx = T * 0.3, sy = T * 0.18, sh = T * 0.36;
        ctx.fillStyle = "rgba(46,33,64,.72)";
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sx, sy, sw, sh, sh / 2) : ctx.rect(sx, sy, sw, sh); ctx.fill();
        let text;
        if (v.nw > 0) {
          const k2 = 1 - v.nw / 10;
          ctx.fillStyle = "#4CC9F0"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sx, sy, Math.max(sh, sw * Math.min(1, k2)), sh, sh / 2) : ctx.rect(sx, sy, sw * k2, sh); ctx.fill();
          text = v.wv === 0 ? `Build! First wave in ${Math.ceil(v.nw)}` : `Wave ${v.wv + 1} in ${Math.ceil(v.nw)}`;
        } else {
          const total = 6 + 2 * v.wv + (v.wv % 5 === 0 ? 1 : 0), k2 = 1 - v.lf / total;
          ctx.fillStyle = v.wv % 5 === 0 ? "#FF6B6B" : "#8FDB5C";
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sx, sy, Math.max(sh, sw * Math.max(0, Math.min(1, k2))), sh, sh / 2) : ctx.rect(sx, sy, sw * k2, sh); ctx.fill();
          text = `${v.wv % 5 === 0 ? "🐉 " : ""}Wave ${v.wv} · ${v.lf} to go`;
        }
        ctx.font = `800 ${Math.round(sh * 0.62)}px Fredoka,sans-serif`; ctx.fillStyle = "#FFFFFF"; ctx.textBaseline = "middle";
        ctx.fillText(text, cw / 2, sy + sh / 2 + 1);
        ctx.textBaseline = "alphabetic";
      }
      if (v.fl) { ctx.fillStyle = "rgba(46,33,64,.5)"; ctx.fillRect(0, 0, cw, ch); emoji(ctx, "🏚️", cw / 2, ch / 2 - T, T * 2); ctx.font = `800 ${Math.round(T * 0.6)}px Fredoka,sans-serif`; ctx.fillStyle = "#fff"; ctx.fillText("The castle has fallen", cw / 2, ch / 2 + T * 0.4); }
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
  const sendNow = () => tg.send("next");

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
            <TowerIcon kind={kind} level={1} size={44} />
            <b>{d.name}</b>
            <Chips list={statChips(kind, towerStats(kind, 1))} />
            <span className="tw-cost">🪙 {d.cost}</span>
          </button>
        ))}
        <button className="press p-white tw-x" onClick={() => setPick(null)} aria-label="Close">✕</button>
      </div>
    );
  } else if (!isSpectator && selTower) {
    const [, , kind, level, owner] = selTower;
    const ownerName = owner === myId ? "Yours" : `${L?.players.find((pl) => pl.id === owner)?.name || "Someone"}'s`;
    const now = towerStats(kind, level), next = level < MAX_LEVEL ? towerStats(kind, level + 1) : null;
    const back = Math.round(spentOn(kind, level) * SELL_BACK);
    sheet = (
      <div className="tw-sheet tw-upsheet">
        <div className="tw-info">
          <TowerIcon kind={kind} level={level} size={46} />
          <span className="tw-who">
            <b>{LEVEL_NAMES[kind][level - 1]}</b>
            <small>{"⭐".repeat(level)} · {ownerName}</small>
          </span>
          <Chips list={statChips(kind, now)} />
          <button className="press p-white tw-x" onClick={() => setPick(null)} aria-label="Close">✕</button>
        </div>
        <div className="tw-row">
          {next ? (
            <button className={`press p-sun tw-up${hud.coins < upgradeCost(kind, level) ? " poor" : ""}`} onClick={upgrade}>
              <TowerIcon kind={kind} level={level + 1} size={40} />
              <span>
                <b>⬆️ {LEVEL_NAMES[kind][level]}</b>
                <small>⚔️ {Math.round(now.dmg)} → {Math.round(next.dmg)} · 📏 {now.range.toFixed(1)} → {next.range.toFixed(1)}</small>
              </span>
              <span className="tw-cost">🪙 {upgradeCost(kind, level)}</span>
            </button>
          ) : <span className="tw-max">⭐⭐⭐ Fully upgraded</span>}
          {owner === myId && <button className="press p-white tw-sell" onClick={sell}>💰 Sell<small>+{back} 🪙</small></button>}
        </div>
      </div>
    );
  }
  const hint = !isSpectator ? (
    <div className="tw-bar">
      <span className="tw-hint muted">Tap the grass to build · tap a tower to upgrade</span>
      {!hud.fallen && hud.next > 0.6 && (
        <button className="press p-coral tw-early" onClick={sendNow}>⏩ Send now <small>+{Math.round(hud.next * 2)} 🪙</small></button>
      )}
    </div>
  ) : null;

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
        controls={isSpectator ? null : <div className="tw-dock">{sheet || hint}</div>}
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
