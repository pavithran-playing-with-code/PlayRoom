// src/utils/filmSound.js
// A film's sound and subtitles, the way VLC does them. Downloaded films carry
// Dolby (AC-3, E-AC-3), DTS or TrueHD sound, which no phone browser plays —
// worse, Chrome on Android takes the track, says it's playing it and puts
// out nothing. So the file itself is read: ffmpeg, built for the browser
// (WebAssembly, loaded only when it's needed), lists its sound and subtitle
// tracks, decodes the chosen sound a piece at a time just ahead of where the
// film is, and Web Audio plays the pieces in step with the <video>: play,
// pause, seeking and speed, and if a piece isn't ready the film waits a
// moment for it. Subtitles in text (SRT, ASS, mov_text…) are read out whole.
//
// The file is never copied into memory: ffmpeg reads it straight from the
// phone (WORKERFS), only the bits it needs.
//
//   dolbyLike(file)            true when the sound is a kind browsers can't play
//   soundMissing(video)        true when the browser decoded no sound at all
//   const F = await openFilm(file)
//     F.audio  [{ n, label }]  F.subs [{ n, label, text }]  (text: false = picture subtitles)
//     const s = await F.sound(n, video, { onWait })
//       s.track (a MediaStreamTrack for the call), s.setVolume(0..1), s.volume(), s.stop()
//     await F.subtitles(n)  -> [{ a, b, text }] (seconds), or null
//     F.close()

const CORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
const SEG = 10;                  // seconds of sound per piece (short: the first sound and a jump come quickly)
const AHEAD = 5;                 // pieces decoded ahead of the film (50 s)
const RATE = 48000;
const LEAD = 0.06;               // seconds: a piece starts this far ahead, so it's never late

// ffmpeg's ~30 MB, fetched once as blobs (a worker may only load code from its own site)
let coreURLs = null;
const getCore = () => {
  if (!coreURLs) {
    const blob = async (url, type) => URL.createObjectURL(new Blob([await (await fetch(url)).arrayBuffer()], { type }));
    coreURLs = Promise.all([blob(`${CORE}/ffmpeg-core.js`, "text/javascript"), blob(`${CORE}/ffmpeg-core.wasm`, "application/wasm")])
      .then(([coreURL, wasmURL]) => ({ coreURL, wasmURL }))
      .catch((e) => { coreURLs = null; throw e; });
  }
  return coreURLs;
};
async function newFF() {
  const { FFmpeg } = await import("../vendor/ffmpeg/classes.js");
  const ff = new FFmpeg();
  await ff.load(await getCore());
  return ff;
}
// ffmpeg's last complaints, for the Sound check
const ffErrs = [];
// one ffmpeg for the sound, kept
let ffLoad = null;
const getFF = () => {
  if (!ffLoad) {
    ffLoad = newFF().then((ff) => {
      ff.on("log", ({ message }) => { if (/error|invalid|failed|cannot|could not|not found|unsupported/i.test(message)) { ffErrs.push(message.slice(0, 140)); if (ffErrs.length > 4) ffErrs.shift(); } });
      return ff;
    }).catch((e) => { ffLoad = null; throw e; });
  }
  return ffLoad;
};
// it does one thing at a time
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

// Is the sound Dolby, DTS or TrueHD? A quick look at the file's headers —
// the start (MKV, and MP4 with its index first) and the end (MP4 with its
// index last) — for the codec names the containers use. No ffmpeg needed.
const MARKS = ["A_EAC3", "A_AC3", "A_DTS", "A_TRUEHD", "A_MLP", "ec-3", "ac-3", "dtsc", "dtsh", "dtsl", "dtse", "mlpa"];
export async function dolbyLike(file) {
  const look = async (from, to) => {
    const b = new Uint8Array(await file.slice(from, to).arrayBuffer());
    let s = "";
    for (let i = 0; i < b.length; i += 65536) s += String.fromCharCode.apply(null, b.subarray(i, i + 65536));
    return MARKS.some((m) => s.includes(m));
  };
  const N = 4 * 1024 * 1024;
  try { return (await look(0, Math.min(file.size, N))) || (file.size > N && (await look(Math.max(N, file.size - N), file.size))); }
  catch { return false; }
}

const LANG = { eng: "English", hin: "Hindi", tam: "Tamil", tel: "Telugu", mal: "Malayalam", kan: "Kannada", ben: "Bengali", mar: "Marathi", guj: "Gujarati", pan: "Punjabi", urd: "Urdu",
  jpn: "Japanese", kor: "Korean", chi: "Chinese", zho: "Chinese", spa: "Spanish", fre: "French", fra: "French", ger: "German", deu: "German", ita: "Italian", por: "Portuguese",
  rus: "Russian", ara: "Arabic", tur: "Turkish", ind: "Indonesian", tha: "Thai", vie: "Vietnamese" };
const CODEC = { eac3: "Dolby Digital Plus", ac3: "Dolby Digital", dts: "DTS", truehd: "Dolby TrueHD", aac: "AAC", opus: "Opus", mp3: "MP3", vorbis: "Vorbis", flac: "FLAC" };
const TEXT_SUBS = /^(subrip|srt|ass|ssa|mov_text|webvtt|text|microdvd|subviewer)/;

// "Stream #0:1(eng): Audio: eac3, 48000 Hz, 5.1(side), fltp, 640 kb/s (default)" and the title under it
function parseStreams(lines) {
  const audio = [], subs = [];
  let cur = null;
  for (const l of lines) {
    const m = /Stream #\d+:\d+(?:\[[^\]]*\])?(?:\((\w+)\))?: (Audio|Subtitle|Video|Data|Attachment): (.*)/.exec(l);
    if (m) {
      cur = null;
      const lang = LANG[m[1]] || (m[1] && m[1] !== "und" ? m[1] : "");
      if (m[2] === "Audio") {
        const codec = m[3].split(/[ ,(]/)[0];
        const ch = /\b(\d\.\d(?:\(\w+\))?|stereo|mono)\b/.exec(m[3]);
        cur = { n: audio.length, lang, codec, ch: ch ? ch[1].replace(/\(.*\)/, "") : "", def: /\(default\)/.test(m[3]), title: "" };
        audio.push(cur);
      } else if (m[2] === "Subtitle") {
        const codec = m[3].split(/[ ,(]/)[0];
        cur = { n: subs.length, lang, codec, text: TEXT_SUBS.test(codec), def: /\(default\)/.test(m[3]), forced: /\(forced\)/.test(m[3]), title: "" };
        subs.push(cur);
      }
      continue;
    }
    const t = /^\s+title\s*:\s*(.+)$/.exec(l);
    if (t && cur && !cur.title) cur.title = t[1].trim();
  }
  for (const a of audio) a.label = [a.title || a.lang || `Track ${a.n + 1}`, a.title && a.lang && !a.title.includes(a.lang) ? a.lang : "", `${CODEC[a.codec] || a.codec}${a.ch ? " " + a.ch : ""}`].filter(Boolean).join(" · ");
  for (const s of subs) s.label = [s.title || s.lang || `Subtitles ${s.n + 1}`, s.title && s.lang && !s.title.includes(s.lang) ? s.lang : "", s.forced ? "forced" : "", s.text ? "" : "picture — can't be shown"].filter(Boolean).join(" · ");
  return { audio, subs };
}

// "00:01:02.345 --> 00:01:04.000" blocks, the text without its tags
function parseVTT(txt) {
  const sec = (s) => { const p = s.trim().split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
  const cues = [];
  for (const block of txt.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n"), i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->").map((x) => sec(x.trim().split(" ")[0]));
    const text = lines.slice(i + 1).join("\n").replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim();
    if (text && Number.isFinite(a) && Number.isFinite(b)) cues.push({ a, b, text });
  }
  return cues.sort((x, y) => x.a - y.a);
}

export async function openFilm(file) {
  const ff = await getFF();
  const dir = `/film${++mountN}`, path = `${dir}/${file.name}`;
  await queued(async () => { await ff.createDir(dir); await ff.mount("WORKERFS", { files: [file] }, dir); });
  const log = [];
  const onLog = ({ message }) => log.push(message);
  ff.on("log", onLog);
  await queued(() => ff.exec(["-hide_banner", "-i", path]).catch(() => {}));
  ff.off("log", onLog);
  const info = parseStreams(log);
  const F = {
    ...info,
    probe: log.filter((l) => /Input #|Duration|Stream #/.test(l)).map((l) => l.trim().slice(0, 140)).slice(0, 12),
    // the sound of audio track n, in step with the video
    sound: (n, v, opts) => playSound(ff, path, n, v, opts),
    // text subtitles n, read out whole — by a second ffmpeg, so the sound
    // never waits behind it (it has to read through the whole file)
    async subtitles(n) {
      const s = info.subs[n];
      if (!s || !s.text) return null;
      let f2;
      try {
        f2 = await newFF();
        await f2.createDir("/f"); await f2.mount("WORKERFS", { files: [file] }, "/f");
        await f2.exec(["-hide_banner", "-loglevel", "error", "-i", `/f/${file.name}`, "-map", `0:s:${n}`, "-vn", "-an", "-c:s", "webvtt", "/s.vtt"]);
        const out = await f2.readFile("/s.vtt", "utf8");
        return parseVTT(typeof out === "string" ? out : new TextDecoder().decode(out));
      } catch { return null; }
      finally { try { f2 && f2.terminate(); } catch { /* gone */ } }
    },
    close() { queued(async () => { try { await ff.unmount(dir); await ff.deleteDir(dir); } catch { /* fine */ } }); },
  };
  return F;
}

// One-call form, kept for the old use: the first sound of a file, or null.
export async function filmSound(file, v, opts) {
  let F;
  try { F = await openFilm(file); } catch { return null; }
  if (!F.audio.length) { F.close(); return null; }
  const s = await F.sound(0, v, opts);
  const stop = s.stop;
  s.stop = () => { stop(); F.close(); };
  return s;
}

async function playSound(ff, path, n, v, { onWait } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC({ sampleRate: RATE });
  const master = ac.createGain(), local = ac.createGain(), out = ac.createMediaStreamDestination(), here = ac.createMediaStreamDestination();
  master.connect(out); master.connect(local); local.connect(here);
  // Heard here through an <audio> player, like the call's voices — not
  // straight from Web Audio: on Android, once a call has the microphone the
  // phone is in call-audio mode, and Web Audio's own output played for a
  // moment and then went quiet. A player of a stream keeps sounding.
  const sink = document.createElement("audio");
  sink.autoplay = true; sink.setAttribute("playsinline", ""); sink.style.display = "none";
  sink.srcObject = here.stream;
  document.body.appendChild(sink);
  const kick = () => { if (sink.paused) sink.play().catch(() => {}); };
  kick();
  const cache = new Map();          // piece -> AudioBuffer, or a Promise of one
  const tag = `${++mountN}`;
  let alive = true, playing = null, waiting = false, pausedByUs = false;
  const st = { pieces: 0, failed: 0, ms: 0, peak: 0, restarts: 0 };
  const tries = new Map();          // piece -> times it came out bad
  const dur = () => (Number.isFinite(v.duration) ? v.duration : Infinity);

  // decode one piece: from i*SEG, SEG seconds, stereo, 48 kHz, as floats
  const decode = (i) => queued(async () => {
    if (!alive) return null;
    const o = `/s${tag}_${i}.raw`, t0 = performance.now();
    // a short look at the file only (a big film's headers are read once per piece)
    await ff.exec(["-hide_banner", "-loglevel", "error", "-probesize", "2000000", "-analyzeduration", "1000000",
      "-ss", String(i * SEG), "-i", path, "-t", String(SEG),
      "-map", `0:a:${n}`, "-vn", "-sn", "-dn", "-ac", "2", "-ar", String(RATE), "-f", "s16le", o]);
    let data;
    try { data = await ff.readFile(o); await ff.deleteFile(o); } catch { data = null; }
    st.ms = Math.round(performance.now() - t0);
    const f = data ? new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2)) : new Int16Array(0);
    const len = Math.floor(f.length / 2);
    if (!alive) return null;
    // came out short (a read that failed part way): try again — twice, then
    // let it be silence rather than hold the film for ever
    const full = Math.min(SEG, dur() - i * SEG) - 0.3;
    if (len / RATE < full) {
      const k = (tries.get(i) || 0) + 1;
      tries.set(i, k); st.failed++;
      if (k < 3) return null;
      if (!len) return ac.createBuffer(2, Math.max(1, Math.round(Math.max(0.5, full) * RATE)), RATE);
    }
    const buf = ac.createBuffer(2, Math.max(1, len), RATE), L = buf.getChannelData(0), R = buf.getChannelData(1);
    let pk = 0;
    for (let k = 0; k < len; k++) { L[k] = f[2 * k] / 32768; R[k] = f[2 * k + 1] / 32768; const a = Math.abs(L[k]); if (a > pk) pk = a; }
    st.pieces++; st.peak = Math.max(st.peak, pk);
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
  // piece i from `from` seconds into it, at the context's time `at`
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
    const b = ready(i), from = t + LEAD * rate - i * SEG;
    if (!b) return false;
    // a piece that ends before where the film is: no good, decode it again
    if (from >= b.duration - 0.05) { cache.delete(i); return false; }
    const at = ac.currentTime + LEAD;
    playing = { srcs: [], t0: t + LEAD * rate, c0: at, rate };
    schedule(i, at, from);
    st.restarts++;
    return true;
  };
  const hold = () => { waiting = true; if (onWait) onWait(true); if (!v.paused) { pausedByUs = true; v.pause(); } };

  const tick = () => {
    if (!alive) return;
    const t = v.currentTime, i = Math.floor(t / SEG);
    for (let k = i; k <= i + AHEAD; k++) want(k);
    for (const k of cache.keys()) if (k < i - 1 || k > i + AHEAD + 1) cache.delete(k);
    kick();
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
    if (!playing) { if (!begin()) { stopAll(); hold(); } return; }
    // drifted (a stall, a seek, a new speed): start again from where the film is
    const expect = playing.t0 + (ac.currentTime - playing.c0) * playing.rate;
    if (Math.abs(expect - t) > 0.3 || playing.rate !== (v.playbackRate || 1)) { stopAll(); begin(); return; }
    // the next piece, right after this one
    if (playing.endAt - ac.currentTime < 2.5 && !schedule(playing.last + 1, playing.endAt, 0)
      && playing.endAt - ac.currentTime < 0.3 && (playing.last + 1) * SEG < dur()) { stopAll(); hold(); }
  };
  const evs = ["play", "pause", "seeking", "seeked", "ratechange", "ended"];
  const onEv = (e) => {
    if (e.type === "pause" && pausedByUs) return;
    if (e.type === "play" && waiting) pausedByUs = false;
    if (e.type === "play" && ac.state === "suspended") ac.resume().catch(() => {});
    tick();
  };
  evs.forEach((x) => v.addEventListener(x, onEv));
  // a phone's sound only starts from a tap: any tap wakes it
  const wake = () => { if (ac.state === "suspended") ac.resume().catch(() => {}); kick(); };
  document.addEventListener("pointerdown", wake, true);
  const every = setInterval(tick, 200);
  v.muted = true;                   // its own sound (silent, or wrong) is out of the way
  tick();

  return {
    track: out.stream.getAudioTracks()[0],
    // for the Sound check
    stats: () => ({ ...st, ctx: ac.state, playing: !!playing, waiting, muted: v.muted, vol: local.gain.value, player: sink.paused ? "paused" : "playing", errs: ffErrs.slice() }),
    setVolume(x) { local.gain.value = Math.max(0, Math.min(1, x)); },
    volume() { return local.gain.value; },
    stop() {
      alive = false;
      clearInterval(every);
      evs.forEach((x) => v.removeEventListener(x, onEv));
      document.removeEventListener("pointerdown", wake, true);
      stopAll(); cache.clear();
      if (waiting && onWait) onWait(false);
      try { sink.pause(); sink.srcObject = null; sink.remove(); } catch { /* gone */ }
      ac.close().catch(() => {});
    },
  };
}
