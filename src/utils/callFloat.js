// src/utils/callFloat.js
// The call's floating window on a phone. A phone browser can float only one
// video over other apps (video picture-in-picture), so everyone's face is
// drawn into one picture — up to four — and that picture is what floats.
// It looks like the call's bubble in the page: the faces stacked in a
// rounded card with white seams, a friend on top and you below (with three
// or four, two by two), and the call's time in a pill at the bottom.
//
// The frames come straight off the cameras' tracks (MediaStreamTrackProcessor),
// not from <video> elements: those stop drawing when the app is in the
// background, which is exactly when the window is up. New frames redraw the
// picture (no timers — they're throttled in the background too). A camera
// that stops sending (a phone that left its app, which pauses its camera)
// shows its last frame dimmed, "camera paused".
//
// Plain DOM, no React. Where the processor isn't there (iPhone Safari),
// canFloatBoth() is false and the call floats the friend's video alone.
let W = 270, H = 480;              // portrait, like the bubble; wider with three or four
const STALE_MS = 1500;             // no frame for this long: that camera is paused
const MIN_MS = 55;                 // at most ~18 pictures a second

export const canFloatBoth = () => typeof window !== "undefined" && "MediaStreamTrackProcessor" in window &&
  typeof HTMLCanvasElement !== "undefined" && !!HTMLCanvasElement.prototype.captureStream;

// Draw `src` (a canvas) to fill the box, cropping the overflow.
function cover(ctx, src, x, y, w, h, mirror) {
  const sw = src.width, sh = src.height;
  if (!sw || !sh) return;
  const k = Math.max(w / sw, h / sh), dw = sw * k, dh = sh * k;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (mirror) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh); }
  else ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Where each face goes, as in the bubble: [x, y, w, h] for each of `n`
// faces in order (friends, then you). Inside a frame (F) with seams (G):
// one fills it, two stacked, three with the first across the top, four two by two.
const F = 10, G = 5;
function layout(n) {
  const x0 = F, y0 = F, w = W - 2 * F, h = H - 2 * F;
  const hw = (w - G) / 2, hh = (h - G) / 2;
  if (n <= 1) return [[x0, y0, w, h]];
  if (n === 2) return [[x0, y0, w, hh], [x0, y0 + hh + G, w, hh]];
  if (n === 3) return [[x0, y0, w, hh], [x0, y0 + hh + G, hw, hh], [x0 + hw + G, y0 + hh + G, hw, hh]];
  return [[x0, y0, hw, hh], [x0 + hw + G, y0, hw, hh], [x0, y0 + hh + G, hw, hh], [x0 + hw + G, y0 + hh + G, hw, hh]];
}

export function createFloat() {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const stream = cv.captureStream();
  // per face (key): the latest frame, kept small; when it came; the track it follows
  const faces = new Map();           // key -> { cv, at, got, track, stop }
  let people = [];                   // [{ key, stream, show, name, avatar, muted, mirror, me }]
  let since = 0, muted = false;      // the pill: the call's time (worked out at each picture: the page's own clock stops in the background), 🔇
  let drawnAt = 0;

  function keep(track, into, onFrame) {
    let stop = false, reader;
    try { reader = new window.MediaStreamTrackProcessor({ track }).readable.getReader(); } catch { return () => {}; }
    (async () => {
      while (!stop) {
        let r;
        try { r = await reader.read(); } catch { break; }
        if (r.done) break;
        const f = r.value;
        try {
          const k = Math.min(1, 400 / Math.max(f.displayWidth, f.displayHeight));
          const w = Math.round(f.displayWidth * k), h = Math.round(f.displayHeight * k);
          if (into.width !== w || into.height !== h) { into.width = w; into.height = h; }
          into.getContext("2d").drawImage(f, 0, 0, w, h);
        } catch { /* a frame we couldn't draw */ }
        f.close();
        onFrame();
      }
    })();
    return () => { stop = true; reader.cancel().catch(() => {}); };
  }

  function face(p, box, now, small) {
    const [x, y, w, h] = box, F = faces.get(p.key);
    const has = p.show && F && F.got;
    ctx.save();
    roundRect(ctx, x, y, w, h, small ? 12 : 14); ctx.clip();
    ctx.fillStyle = "#221a30";
    ctx.fillRect(x, y, w, h);
    if (has) {
      cover(ctx, F.cv, x, y, w, h, p.mirror);
      if (now - F.at >= STALE_MS) {
        ctx.fillStyle = "rgba(20,14,30,.6)"; ctx.fillRect(x, y, w, h);
        ctx.font = `bold ${small ? 13 : 18}px sans-serif`; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(small ? "📷 paused" : "📷 camera paused", x + w / 2, y + h / 2);
      }
    } else {
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `${Math.round(Math.min(w, h) * 0.38)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.fillText(p.avatar || "🙂", x + w / 2, y + h * 0.45);
    }
    // the name, a small pill top left
    if (!p.me) {
      const label = `${p.name}${p.muted ? " 🔇" : ""}`;
      ctx.font = "bold 15px sans-serif";
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      const th = 24, tw = Math.min(w - 16, ctx.measureText(label).width + 18);
      ctx.fillStyle = "rgba(0,0,0,.55)";
      roundRect(ctx, x + 8, y + 8, tw, th, th / 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + 17, y + 8 + th / 2, w - 34);
    }
    ctx.restore();
  }

  function draw(force = false) {
    const now = performance.now();
    if (!force && now - drawnAt < MIN_MS) return;
    drawnAt = now;
    const tiles = [...people.filter((p) => !p.me).slice(0, 3), ...people.filter((p) => p.me)];
    // one or two faces: tall and narrow, like the bubble; more: wider, two by two
    const w = tiles.length <= 2 ? 270 : 360;
    if (cv.width !== w) { cv.width = w; W = w; }
    // the bubble's card: an ink rim, white inside, the faces on it
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#2E2140";
    roundRect(ctx, 0, 0, W, H, 26); ctx.fill();
    ctx.fillStyle = "#fff";
    roundRect(ctx, 4, 4, W - 8, H - 8, 22); ctx.fill();
    const L = layout(tiles.length);
    tiles.forEach((p, i) => face(p, L[i], now, false));
    // the time, in a pill along the bottom
    if (since) {
      const sec = Math.max(0, Math.floor((Date.now() - since) / 1000));
      const pill = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}${muted ? " 🔇" : ""}`;
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const tw = ctx.measureText(pill).width + 28;
      ctx.fillStyle = "rgba(0,0,0,.6)";
      roundRect(ctx, (W - tw) / 2, H - F - 38, tw, 30, 15); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(pill, W / 2, H - F - 23);
    }
  }

  // a new frame: friends' frames lead; yours redraw only if theirs have stopped
  function framed(F, mine) {
    F.got = true; F.at = performance.now();
    if (!mine) { draw(); return; }
    const now = performance.now();
    if (people.every((q) => q.me || !faces.get(q.key) || now - faces.get(q.key).at > 300)) draw();
  }

  // follow each face's camera, and let go of anyone who's left
  function follow() {
    const keys = new Set(people.map((p) => p.key));
    for (const [k, F] of faces) if (!keys.has(k)) { if (F.stop) F.stop(); faces.delete(k); }
    for (const p of people) {
      const t = p.stream && p.stream.getVideoTracks()[0];
      let F = faces.get(p.key);
      if (!F) { F = { cv: document.createElement("canvas"), at: 0, got: false, track: null, stop: null }; faces.set(p.key, F); }
      if (F.track === t) continue;
      if (F.stop) F.stop();
      F.track = t || null; F.got = false; F.stop = null;
      if (t) F.stop = keep(t, F.cv, framed.bind(null, F, !!p.me));
    }
  }

  draw(true);                        // a first picture, so the window can open at once
  return {
    stream,
    // [{ key, stream, show, name, avatar, muted, mirror, me }] — friends first, you last;
    // `o`: { since (when the call began, ms), muted } — the pill at the bottom
    set(list, o = {}) { people = list; since = o.since || 0; muted = !!o.muted; follow(); draw(true); },
    close() {
      for (const F of faces.values()) if (F.stop) F.stop();
      faces.clear();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
