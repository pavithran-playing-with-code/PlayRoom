// src/utils/callFloat.js
// The call's floating window on a phone. A phone browser can float only one
// video over other apps (video picture-in-picture), so both faces are drawn
// into one picture — the friend big, you small in the corner, like WhatsApp
// — and that picture is what floats.
//
// The frames come straight off the cameras' tracks (MediaStreamTrackProcessor),
// not from <video> elements: those stop drawing when the app is in the
// background, which is exactly when the window is up. Each new frame from
// the friend redraws the picture (no timers — they're throttled in the
// background too). A camera that stops sending (a phone that left its app,
// which pauses its camera) shows its last frame dimmed, "camera paused".
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

export function createFloat() {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const stream = cv.captureStream();
  // the latest frame of each camera, kept small
  const them = document.createElement("canvas"), me = document.createElement("canvas");
  let st = { name: "", avatar: "🙂", showThem: false, showMe: false, mirror: true, muted: false };
  let themAt = 0, meAt = 0, drawnAt = 0;
  const got = { them: false, me: false };    // a frame drawn yet (a new canvas is 300 wide: width says nothing)
  const follow = { them: null, me: null };   // { track, stop }

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
          const k = Math.min(1, 480 / Math.max(f.displayWidth, f.displayHeight));
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

  function draw(force = false) {
    const now = performance.now();
    if (!force && now - drawnAt < MIN_MS) return;
    drawnAt = now;
    ctx.fillStyle = "#221a30";
    ctx.fillRect(0, 0, W, H);
    // the friend, big
    const themLive = now - themAt < STALE_MS;
    if (st.showThem && got.them) {
      cover(ctx, them, 0, 0, W, H, false);
      if (!themLive) { ctx.fillStyle = "rgba(20,14,30,.55)"; ctx.fillRect(0, 0, W, H); }
    }
    if (!st.showThem || !got.them) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = '120px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(st.avatar || "🙂", W / 2, H * 0.42);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    if (st.showThem && got.them && !themLive) {
      ctx.font = "bold 20px sans-serif"; ctx.fillStyle = "#fff";
      ctx.fillText("📷 camera paused", W / 2, H * 0.42);
    }
    // their name along the bottom
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "rgba(0,0,0,.55)";
    const label = `${st.name}${st.muted ? " 🔇" : ""}`;
    const tw = Math.min(W - 20, ctx.measureText(label).width + 24);
    roundRect(ctx, 10, H - 46, tw, 34, 17); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left";
    ctx.fillText(label, 22, H - 22, W - 44);
    // you, small, top right
    if (st.showMe && got.me) {
      const iw = 116, ih = 154, ix = W - iw - 12, iy = 12;
      ctx.save();
      roundRect(ctx, ix, iy, iw, ih, 14); ctx.clip();
      cover(ctx, me, ix, iy, iw, ih, st.mirror);
      if (now - meAt >= STALE_MS) {
        ctx.fillStyle = "rgba(20,14,30,.6)"; ctx.fillRect(ix, iy, iw, ih);
        ctx.font = "bold 14px sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "center";
        ctx.fillText("📷 paused", ix + iw / 2, iy + ih / 2);
      }
      ctx.restore();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
      roundRect(ctx, ix, iy, iw, ih, 14); ctx.stroke();
    }
  }

  function track(which, s, into) {
    const t = s && s.getVideoTracks()[0];
    const cur = follow[which];
    if (cur && cur.track === t) return;
    if (cur) cur.stop();
    got[which] = false;
    follow[which] = t ? {
      track: t,
      stop: keep(t, into, () => {
        got[which] = true;
        if (which === "them") { themAt = performance.now(); draw(); }
        else { meAt = performance.now(); if (performance.now() - themAt > 300) draw(); }   // the friend's frames lead
      }),
    } : null;
  }

  draw(true);                        // a first picture, so the window can open at once
  return {
    stream,
    // { them, me: MediaStreams; showThem, showMe, mirror, name, avatar, muted }
    set(o) {
      st = { ...st, ...o };
      track("them", o.them, them);
      track("me", o.me, me);
      draw(true);
    },
    close() {
      for (const k of ["them", "me"]) { if (follow[k]) follow[k].stop(); follow[k] = null; }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
