// src/components/horror/wickPaint.js
// Painting a WICK floor onto a canvas, and the animation of a turn — shared by
// the solo page (pages/Wick.jsx) and the room game (games/WickGame.jsx).
// No React; reads the sim, never changes it.
import {
  COLS, ROWS, SHADE, CRAWLER, LUNGER, DARK, FLARE_RANGE, DIRS, radiusFor, isLit,
} from "./wickSim.js";
import {
  drawShade, drawCrawler, drawLunger, drawPlayer, drawKey, drawFlask, drawStairs, drawScare, flicker,
} from "./wickArt.js";

export const STEP_MS = 130;        // your move
export const THEIR_DELAY = 90;     // they move a beat after you, so the order reads
export const DASH_MS = 150;
export const SCARE_MS = 1100;
export const FLOOR_FADE_MS = 1100;
export const SWIPE_PX = 28;        // further than this between press and lift is a swipe


// Every death is explained in terms of the rule you broke.
export const CAUSE = {
  [SHADE]: ["A SHADE TOOK YOU", "Your lantern went out, and nothing held them back. Shades can't cross the light — keep it burning."],
  [CRAWLER]: ["THE CRAWLER GOT YOU", "It moves every other turn. The red corners mark where it can reach next — don't end your step there."],
  [LUNGER]: ["THE TALL ONE CAUGHT YOU", "A red lane means it charges next turn, all the way to the end. Step out, or get a pillar between you."],
  [DARK]: ["THE DARK TOOK YOU", "Out of oil. Every step burns one — sometimes a flask is worth the detour."],
};

// Met for the first time on this floor: one line on how it works.
export const MEET = {
  [SHADE]: ["Shades", "can't enter your light. As the oil runs down, the light shrinks and they close in."],
  [CRAWLER]: ["A crawler", "ignores the light, but only moves every other turn. Red corners: where it can reach next."],
  [LUNGER]: ["The tall one", "watches rows and columns. A red lane means it charges next turn. Break the line."],
};

export const KEYS = {
  ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left",
  w: "up", d: "right", s: "down", a: "left", " ": "wait", f: "flare",
};

export const ease = (k) => 1 - (1 - k) * (1 - k);


// A turn, as the eye sees it: you move, they move a beat later, burned shades
// fade, a flare rings out, and if something got you, its face.
export function animateTurn(a, s, ev, action, before, from, now) {
  a.tweens.set("p", { fx: from.x, fy: from.y, tx: s.player.x, ty: s.player.y, t0: now, dur: STEP_MS });
  for (const mv of ev.moves) {
    const was = displayOf(a, mv.id, before.get(mv.id) || mv.from, now);
    a.tweens.set(mv.id, {
      fx: was.x, fy: was.y, tx: mv.to.x, ty: mv.to.y,
      t0: now + THEIR_DELAY, dur: mv.dash ? DASH_MS : STEP_MS, dash: mv.dash,
    });
  }
  for (const id of ev.burned) {
    const at = before.get(id);
    if (at) a.burns.push({ x: at.x, y: at.y, t0: now });
  }
  if (action === "flare") { a.flare = { t0: now, x: s.player.x, y: s.player.y }; a.shake = 6; }
  if (ev.moves.some((m) => m.dash)) a.shake = Math.max(a.shake, 10);
  if (ev.dead) {
    a.scare = { t0: now + THEIR_DELAY + STEP_MS + 60, kind: ev.dead.kind };
    a.shake = 22;
  }
}

export const newAnim = () => ({ tweens: new Map(), burns: [], flare: null, floor: null, scare: null, shake: 0 });

// ── painting ─────────────────────────────────────────────────────────────────

export function displayOf(a, id, fallback, now) {
  const tw = a.tweens.get(id);
  if (!tw) return { x: fallback.x, y: fallback.y };
  const k = Math.max(0, Math.min(1, (now - tw.t0) / tw.dur));
  const e = tw.dash ? k * k : ease(k);
  return { x: tw.fx + (tw.tx - tw.fx) * e, y: tw.fy + (tw.ty - tw.fy) * e };
}

export function paint(canvas, B, s, a, pv, threat, armed, now, screen) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { W, H, T, ox, oy, dpr } = B;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#040308";
  ctx.fillRect(0, 0, W, H);
  if (!s) { paintIdle(ctx, W, H, now); return; }

  ctx.save();
  a.shake *= 0.86;
  if (a.shake > 0.5) ctx.translate((Math.random() - 0.5) * a.shake, (Math.random() - 0.5) * a.shake);

  const pp = displayOf(a, "p", s.player, now);
  const r = radiusFor(s.oil);
  const fl = flicker(now, s.oil);
  const cx = (x) => ox + (x + 0.5) * T;
  const cy = (y) => oy + (y + 0.5) * T;

  // floor and pillars
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const x0 = ox + x * T, y0 = oy + y * T;
      if (s.walls[y * COLS + x]) {
        ctx.fillStyle = "#0A0910";
        ctx.fillRect(x0, y0, T, T);
        ctx.fillStyle = "#1C1928";
        ctx.fillRect(x0 + T * 0.1, y0 + T * 0.06, T * 0.8, T * 0.72);
        ctx.fillStyle = "#26222F";
        ctx.fillRect(x0 + T * 0.1, y0 + T * 0.06, T * 0.8, T * 0.14);
        continue;
      }
      const lit = isLit(s, x, y);
      const d = Math.abs(x - s.player.x) + Math.abs(y - s.player.y);
      if (lit) {
        const w = 1 - d / (r + 1.6);
        ctx.fillStyle = `rgb(${Math.round(34 + 34 * w * fl)},${Math.round(25 + 22 * w * fl)},${Math.round(20 + 8 * w)})`;
      } else {
        ctx.fillStyle = "#0F0D16";
      }
      ctx.fillRect(x0 + 1, y0 + 1, T - 2, T - 2);
      // a few cracks, fixed per tile
      if ((x * 7 + y * 13) % 5 === 0) {
        ctx.strokeStyle = lit ? "rgba(0,0,0,.35)" : "rgba(0,0,0,.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0 + T * 0.2, y0 + T * 0.3);
        ctx.lineTo(x0 + T * 0.45, y0 + T * 0.45);
        ctx.lineTo(x0 + T * 0.4, y0 + T * 0.7);
        ctx.stroke();
      }
    }
  }

  // the lantern's glow, on top of the floor
  if (r >= 0) {
    const g = ctx.createRadialGradient(cx(pp.x), cy(pp.y), T * 0.2, cx(pp.x), cy(pp.y), (r + 1.3) * T * fl);
    g.addColorStop(0, "rgba(255,176,80,.30)");
    g.addColorStop(1, "rgba(255,150,60,0)");
    ctx.fillStyle = g;
    ctx.fillRect(ox, oy, T * COLS, T * ROWS);
  }

  drawStairs(ctx, ox + s.exit.x * T, oy + s.exit.y * T, T, s.hasKey, now);
  if (s.key) drawKey(ctx, cx(s.key.x), cy(s.key.y), T, now);
  for (const f of s.flasks) drawFlask(ctx, cx(f.x), cy(f.y), T, now);

  // what reaches where next turn
  const pulse = 0.5 + Math.sin(now / 160) * 0.5;
  const aimOf = new Map(s.monsters.filter((m) => m.aim).map((m) => [m.id, m.aim]));
  for (const t of threat) {
    const x0 = ox + t.x * T, y0 = oy + t.y * T;
    if (t.kind === LUNGER) {
      ctx.fillStyle = `rgba(255,30,50,${0.2 + pulse * 0.16})`;
      ctx.fillRect(x0 + 1, y0 + 1, T - 2, T - 2);
      const aim = aimOf.get(t.id);
      if (aim) chevron(ctx, x0 + T / 2, y0 + T / 2, T * 0.16, aim, `rgba(255,120,120,${0.5 + pulse * 0.4})`);
    } else {
      ctx.fillStyle = `rgba(255,30,50,${0.1 + pulse * 0.08})`;
      ctx.fillRect(x0 + 1, y0 + 1, T - 2, T - 2);
      corners(ctx, x0, y0, T, `rgba(255,60,70,${0.6 + pulse * 0.35})`);
    }
  }

  // where you can step, and which steps are deadly
  if (pv && !s.dead && screen === "play") {
    for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
      const o = pv[dir];
      if (!o || !o.ok) continue;
      const x = s.player.x + dx, y = s.player.y + dy;
      const px = cx(x), py = cy(y);
      if (o.deadly) {
        const hot = armed === dir;
        ctx.strokeStyle = hot ? "#FFFFFF" : "rgba(255,70,80,.9)";
        ctx.lineWidth = Math.max(2, T * (hot ? 0.08 : 0.05));
        const k = T * (hot ? 0.2 + pulse * 0.04 : 0.15);
        ctx.beginPath();
        ctx.moveTo(px - k, py - k); ctx.lineTo(px + k, py + k);
        ctx.moveTo(px + k, py - k); ctx.lineTo(px - k, py + k);
        ctx.stroke();
      } else {
        ctx.strokeStyle = o.descends ? "rgba(150,255,190,.85)" : "rgba(255,230,190,.28)";
        ctx.lineWidth = Math.max(1.5, T * 0.035);
        ctx.beginPath();
        ctx.arc(px, py, T * 0.13, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // things, back to front so a tall one stands in front of the row behind it
  const people = s.monsters.map((m) => ({ m, at: displayOf(a, m.id, m, now) }));
  people.push({ m: null, at: pp });
  people.sort((u, v) => u.at.y - v.at.y);
  for (const { m, at } of people) {
    const px = cx(at.x), py = cy(at.y);
    if (!m) { drawPlayer(ctx, px, py, T, { t: now, oil: s.oil }); continue; }
    const lit = isLit(s, m.x, m.y);
    const look = [Math.sign(s.player.x - m.x), Math.sign(s.player.y - m.y)];
    if (m.kind === SHADE) drawShade(ctx, px, py, T, { lit, t: now, look, phase: m.id * 1.9 });
    else if (m.kind === CRAWLER) drawCrawler(ctx, px, py, T, { lit, t: now, ready: m.ready, stunned: m.stun > 0, look });
    else drawLunger(ctx, px, py, T, { lit, t: now, aim: m.aim, rest: m.rest > 0, stunned: m.stun > 0 });
    if (m.stun > 0) {
      ctx.fillStyle = "rgba(255,220,150,.85)";
      ctx.font = `700 ${Math.round(T * 0.26)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("✦", px + T * 0.28, py - T * 0.3);
    }
  }

  // shades burning away
  a.burns = a.burns.filter((b) => now - b.t0 < 700);
  for (const b of a.burns) {
    const k = (now - b.t0) / 700;
    drawShade(ctx, cx(b.x), cy(b.y) - k * T * 0.4, T, { lit: true, t: now, alpha: 1 - k, phase: 0 });
    ctx.fillStyle = `rgba(255,190,90,${0.5 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(cx(b.x), cy(b.y), T * (0.3 + k * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  if (a.flare) {
    const k = (now - a.flare.t0) / 500;
    if (k >= 1) a.flare = null;
    else {
      ctx.strokeStyle = `rgba(255,210,140,${1 - k})`;
      ctx.lineWidth = T * 0.2 * (1 - k);
      ctx.beginPath();
      ctx.arc(cx(a.flare.x), cy(a.flare.y), (FLARE_RANGE + 0.5) * T * ease(k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,230,190,${0.35 * (1 - k)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Vignette: closes in as the light does, and breathes when you are in the dark.
  const reach = r >= 0 ? (r + 2.2) * T : T * (1.1 + Math.sin(now / 240) * 0.2);
  const v = ctx.createRadialGradient(cx(pp.x), cy(pp.y), reach * 0.6, cx(pp.x), cy(pp.y), reach + Math.max(W, H) * 0.55);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, r >= 0 ? "rgba(0,0,0,.55)" : "rgba(8,0,4,.82)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (a.floor) {
    const k = (now - a.floor.t0) / FLOOR_FADE_MS;
    if (k >= 1) a.floor = null;
    else {
      ctx.fillStyle = `rgba(0,0,0,${1 - ease(k)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(236,226,210,${k < 0.5 ? 1 : 2 - 2 * k})`;
      ctx.font = `700 ${Math.round(T * 0.8)}px Fredoka, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`DEPTH ${a.floor.depth}`, W / 2, H / 2);
    }
  }
}

// The scare gets the whole screen, HUD and all, for about a second.
export function paintScare(canvas, a, now) {
  if (!canvas) return;
  const on = a.scare && now >= a.scare.t0 && now - a.scare.t0 < SCARE_MS;
  canvas.style.display = on ? "block" : "none";
  if (!on) return;
  const W = window.innerWidth, H = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawScare(ctx, W, H, a.scare.kind, now, (now - a.scare.t0) / SCARE_MS);
}

// Behind the title card: a dark floor and one pair of eyes that is not yours.
function paintIdle(ctx, W, H, now) {
  const blink = Math.sin(now / 1900) > 0.96;
  if (blink) return;
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.shadowColor = "#C8D2FF";
  ctx.shadowBlur = 12;
  const y = H * 0.12, x = W * 0.5 + Math.sin(now / 3000) * W * 0.05;
  ctx.beginPath();
  ctx.arc(x - 9, y, 2.4, 0, Math.PI * 2);
  ctx.arc(x + 9, y, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function chevron(ctx, x, y, k, aim, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(aim.dy, aim.dx));
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, k * 0.5);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-k * 0.6, -k);
  ctx.lineTo(k * 0.6, 0);
  ctx.lineTo(-k * 0.6, k);
  ctx.stroke();
  ctx.restore();
}

function corners(ctx, x0, y0, T, color) {
  const k = T * 0.22, p = T * 0.1;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, T * 0.05);
  ctx.beginPath();
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = x0 + (sx ? T - p : p), y = y0 + (sy ? T - p : p);
    const hx = sx ? -k : k, vy = sy ? -k : k;
    ctx.moveTo(x + hx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + vy);
  }
  ctx.stroke();
}
