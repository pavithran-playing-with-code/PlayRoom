// src/utils/callFloat.js
// The call's floating window on a phone. A phone browser can float only one
// video over other apps (video picture-in-picture), so everyone's face is
// drawn into one picture — up to four: one friend big with you in the
// corner (like WhatsApp), two friends one above the other, three in a 2×2
// with you — and that picture is what floats.
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
const W = 360, H = 480;            // portrait, like a phone's call
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

// Where each face goes: [x, y, w, h] for the friends in order, then you.
// One friend: them full, you in the corner (`inset`).
function layout(n) {
  if (n <= 1) return { boxes: [[0, 0, W, H]], me: [W - 128, 12, 116, 154], inset: true };
  if (n === 2) return { boxes: [[0, 0, W, H / 2 - 1], [0, H / 2 + 1, W, H / 2 - 1]], me: [W - 98, H / 2 - 66, 88, 116], inset: true };
  const w = W / 2 - 1, h = H / 2 - 1;
  return { boxes: [[0, 0, w, h], [W / 2 + 1, 0, w, h], [0, H / 2 + 1, w, h]], me: [W / 2 + 1, H / 2 + 1, w, h], inset: false };
}

export function createFloat() {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const stream = cv.captureStream();
  // per face (key): the latest frame, kept small; when it came; the track it follows
  const faces = new Map();           // key -> { cv, at, got, track, stop }
  let people = [];                   // [{ key, stream, show, name, avatar, muted, mirror, me }]
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
    if (small) { roundRect(ctx, x, y, w, h, 12); ctx.clip(); }
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
    // the name, bottom left (yours too, in a grid; not on the little corner picture)
    if (!small || !p.me) {
      const label = `${p.name}${p.muted ? " 🔇" : ""}`;
      ctx.font = `bold ${h > 300 ? 20 : 15}px sans-serif`;
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      const th = h > 300 ? 32 : 26, tw = Math.min(w - 16, ctx.measureText(label).width + 20);
      ctx.fillStyle = "rgba(0,0,0,.55)";
      roundRect(ctx, x + 8, y + h - th - 8, tw, th, th / 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + 18, y + h - 8 - th / 2, w - 36);
    }
    ctx.restore();
    if (small) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; roundRect(ctx, x, y, w, h, 12); ctx.stroke(); }
  }

  function draw(force = false) {
    const now = performance.now();
    if (!force && now - drawnAt < MIN_MS) return;
    drawnAt = now;
    ctx.fillStyle = "#100b18";
    ctx.fillRect(0, 0, W, H);
    const them = people.filter((p) => !p.me).slice(0, 3), me = people.find((p) => p.me);
    const L = layout(them.length);
    them.forEach((p, i) => face(p, L.boxes[i], now, false));
    if (me) face(me, L.me, now, L.inset);
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
    // [{ key, stream, show, name, avatar, muted, mirror, me }] — friends first, you last
    set(list) { people = list; follow(); draw(true); },
    close() {
      for (const F of faces.values()) if (F.stop) F.stop();
      faces.clear();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
