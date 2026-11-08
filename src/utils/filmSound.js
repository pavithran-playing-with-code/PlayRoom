// src/utils/filmSound.js
// A film's sound when the browser can't play it — the way VLC does: Dolby
// (AC-3, E-AC-3), DTS, TrueHD… are common in downloaded films and no phone
// browser decodes them, so the picture plays in silence. Here ffmpeg, built
// for the browser (WebAssembly, loaded only when it's needed), decodes the
// sound a piece at a time just ahead of where the film is, and Web Audio
// plays the pieces in step with the <video>: it follows play, pause, seeking
// and speed, and if a piece isn't ready yet the film waits a moment for it.
//
// The file is never copied into memory: ffmpeg reads it straight from the
// phone (WORKERFS), only the bit each piece needs.
//
//   const s = await filmSound(file, video, { onWait })
//     null        the file has no sound at all (or ffmpeg couldn't load)
//     s.track     the sound, as a MediaStreamTrack (to send to the call)
//     s.setVolume(0..1)  how loud it is here (the call's copy is unchanged)
//     s.stop()

const CORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
const SEG = 20;                  // seconds of sound per piece
const RATE = 48000;
const LEAD = 0.06;               // seconds: a piece starts this far ahead, so it's never late

let ffLoad = null;
// one ffmpeg for the page, loaded once (~30 MB, from the CDN, the first time it's needed)
function getFF() {
  if (!ffLoad) {
    ffLoad = (async () => {
      const { FFmpeg } = await import("../vendor/ffmpeg/classes.js");
      // fetched as blobs: a worker may only load code from its own site
      const toBlobURL = async (url, type) => URL.createObjectURL(new Blob([await (await fetch(url)).arrayBuffer()], { type }));
      const ff = new FFmpeg();
      await ff.load({
        coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ff;
    })().catch((e) => { ffLoad = null; throw e; });
  }
  return ffLoad;
}

// ffmpeg does one thing at a time
let chain = Promise.resolve();
const queued = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

let mountN = 0;

// Does the browser actually play this video's sound? Asked once it has
// played a moment: Chrome counts the sound it decoded, Firefox and Safari
// say whether there is any. Resolves true when the sound needs our help.
export function soundMissing(v) {
  return new Promise((res) => {
    let done = false;
    const check = () => {
      if (done || v.currentTime < 1.2) return;
      done = true; v.removeEventListener("timeupdate", check);
      if ("webkitAudioDecodedByteCount" in v) res(v.webkitAudioDecodedByteCount === 0);
      else if ("mozHasAudio" in v) res(!v.mozHasAudio);
      else if (v.audioTracks) res(v.audioTracks.length === 0);
      else res(false);
    };
    v.addEventListener("timeupdate", check);
    check();
  });
}

export async function filmSound(file, v, { onWait } = {}) {
  let ff;
  try { ff = await getFF(); } catch { return null; }
  const dir = `/film${++mountN}`, path = `${dir}/${file.name}`;
  await queued(async () => { await ff.createDir(dir); await ff.mount("WORKERFS", { files: [file] }, dir); });
  // the streams in the file: is there sound at all?
  const log = [];
  const onLog = ({ message }) => log.push(message);
  ff.on("log", onLog);
  await queued(() => ff.exec(["-hide_banner", "-i", path]).catch(() => {}));
  ff.off("log", onLog);
  if (!log.some((l) => /Stream #\d+:\d+.*Audio:/.test(l))) {
    await queued(async () => { try { await ff.unmount(dir); await ff.deleteDir(dir); } catch { /* fine */ } });
    return null;
  }

  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC({ sampleRate: RATE });
  const master = ac.createGain(), local = ac.createGain(), out = ac.createMediaStreamDestination();
  master.connect(local); local.connect(ac.destination); master.connect(out);
  const cache = new Map();          // piece -> AudioBuffer, or a Promise of one
  let alive = true, playing = null, waiting = false, pausedByUs = false;
  const dur = () => (Number.isFinite(v.duration) ? v.duration : Infinity);

  // decode one piece: from i*SEG, SEG seconds, stereo, 48 kHz, as floats
  const decode = (i) => queued(async () => {
    if (!alive) return null;
    const o = `/s${mountN}_${i}.raw`;
    await ff.exec(["-hide_banner", "-loglevel", "error", "-ss", String(i * SEG), "-i", path, "-t", String(SEG),
      "-map", "0:a:0", "-vn", "-sn", "-dn", "-ac", "2", "-ar", String(RATE), "-f", "f32le", o]);
    let data;
    try { data = await ff.readFile(o); await ff.deleteFile(o); } catch { return null; }
    const f = new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4));
    const n = Math.floor(f.length / 2);
    if (!n || !alive) return null;
    const buf = ac.createBuffer(2, n, RATE), L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (let k = 0; k < n; k++) { L[k] = f[2 * k]; R[k] = f[2 * k + 1]; }
    return buf;
  });
  const want = (i) => {
    if (i < 0 || i * SEG >= dur() || cache.has(i)) return;
    cache.set(i, decode(i).then((b) => { if (alive) { if (b) cache.set(i, b); else cache.delete(i); } return b; }));
  };
  const ready = (i) => { const b = cache.get(i); return b && !(b instanceof Promise) ? b : null; };

  const stopAll = () => {
    if (!playing) return;
    for (const s of playing.srcs) { try { s.stop(); } catch { /* done */ } }
    playing = null;
  };
  // start piece i at the film's time t, and line up the next one after it
  const schedule = (i, at, from) => {
    const b = ready(i);
    if (!b) return false;
    const s = ac.createBufferSource();
    s.buffer = b; s.playbackRate.value = v.playbackRate || 1;
    s.connect(master);
    s.start(at, Math.max(0, from));
    playing.srcs.push(s);
    playing.last = i;
    playing.endAt = at + (b.duration - Math.max(0, from)) / (v.playbackRate || 1);
    return true;
  };
  const begin = () => {
    const t = v.currentTime, i = Math.floor(t / SEG), rate = v.playbackRate || 1;
    if (!ready(i)) return false;
    const at = ac.currentTime + LEAD;
    playing = { srcs: [], t0: t + LEAD * rate, c0: at, rate };
    schedule(i, at, t + LEAD * rate - i * SEG);
    return true;
  };

  const tick = () => {
    if (!alive) return;
    const t = v.currentTime, i = Math.floor(t / SEG);
    for (let k = i; k <= i + 2; k++) want(k);
    for (const k of cache.keys()) if (k < i - 1 || k > i + 3) cache.delete(k);
    if (v.seeking || v.ended) { stopAll(); return; }
    if (waiting) {
      // the film is held for its sound: go on once the piece is here
      if (ready(i)) {
        waiting = false; if (onWait) onWait(false);
        if (pausedByUs) { pausedByUs = false; v.play().catch(() => {}); }
      }
      return;
    }
    if (v.paused) { stopAll(); return; }
    if (ac.state === "suspended") ac.resume().catch(() => {});
    if (!playing) {
      if (!begin()) {
        // not decoded yet: hold the film until it is
        waiting = true; if (onWait) onWait(true);
        pausedByUs = true; v.pause();
      }
      return;
    }
    // drifted (a stall, a seek, a new speed): start again from where the film is
    const expect = playing.t0 + (ac.currentTime - playing.c0) * playing.rate;
    if (Math.abs(expect - t) > 0.25 || playing.rate !== (v.playbackRate || 1)) { stopAll(); begin(); return; }
    // the next piece, right after this one
    if (playing.endAt - ac.currentTime < 2.5) {
      if (!schedule(playing.last + 1, playing.endAt, 0) && playing.endAt - ac.currentTime < 0.3 && (playing.last + 1) * SEG < dur()) {
        stopAll(); waiting = true; if (onWait) onWait(true); pausedByUs = true; v.pause();
      }
    }
  };
  const evs = ["play", "pause", "seeking", "seeked", "ratechange", "ended"];
  const onEv = (e) => { if (e.type === "pause" && pausedByUs) return; if (e.type === "play" && waiting) { pausedByUs = false; } tick(); };
  evs.forEach((n) => v.addEventListener(n, onEv));
  const every = setInterval(tick, 200);
  v.muted = true;                   // its own (silent) sound is out of the way
  tick();

  return {
    track: out.stream.getAudioTracks()[0],
    setVolume(x) { local.gain.value = Math.max(0, Math.min(1, x)); },
    volume() { return local.gain.value; },
    stop() {
      alive = false;
      clearInterval(every);
      evs.forEach((n) => v.removeEventListener(n, onEv));
      stopAll(); cache.clear();
      ac.close().catch(() => {});
      queued(async () => { try { await ff.unmount(dir); await ff.deleteDir(dir); } catch { /* fine */ } });
    },
  };
}
