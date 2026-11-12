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
const AHEAD = 6;                 // pieces decoded ahead of the film (60 s)
const RATE = 48000;
const LEAD = 0.06;               // seconds: a piece starts this far ahead, so it's never late
const HEAD = 4;                  // seconds: the quick first piece, from exactly where the film is (a start, a jump)

// ffmpeg's ~30 MB, fetched once as blobs (a worker may only load code from its own site)
let coreURLs = null;
const getCore = () => {
  if (!coreURLs) {
    // kept on the phone after the first time (Cache Storage, which the
    // browser doesn't clear like its ordinary cache): the next film's sound
    // starts at once instead of after a 30 MB download
    const blob = async (url, type) => {
      let res = null, box = null;
      try { box = await caches.open("pr-ffmpeg-0.12.6"); res = await box.match(url); } catch { box = null; }
      if (!res) {
        res = await fetch(url);
        if (!res.ok) throw new Error(`decoder download: ${res.status}`);
        if (box) { try { await box.put(url, res.clone()); } catch { /* full: fine */ } }
      }
      return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type }));
    };
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
// Start loading the decoder now (a film's been picked and its sound will
// need it): nothing to wait for later. Safe to call any number of times.
export function warmDecoder() { getFF().catch(() => {}); }
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
    sound: (n, v, opts) => playSound(ff, path, n, v, { ...(opts || {}), file }),
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

// The player. Rules, from friends watching on phones:
//   • the film never stops for its sound — if a piece isn't ready yet the
//     picture goes on and the sound comes in the moment it is;
//   • the piece the film needs now is decoded first, always: a jump
//     forward or back drops the work queued for where it was;
//   • two ffmpegs decode at once (the second starts after the first sound),
//     so the sound stays well ahead of the picture on a phone.
// The picture never plays without its sound. Where the film is (its start,
// or after a jump) a quick HEAD-second piece is decoded first, from that very
// moment — ready several times sooner than a whole SEG piece — and until
// it is, the picture is held (paused by us, `held`), then let go with its
// sound. If the decoders ever fall behind mid-film, the same: it waits.
// `start`: the film hasn't begun — begin it when its sound is ready.
async function playSound(ff, path, n, v, { onWait, file, start = false } = {}) {
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

  const cache = new Map();          // piece -> AudioBuffer (decoded)
  const jobs = new Map();           // piece -> true (asked for, not started)
  const busy = new Set();           // pieces being decoded now
  const tries = new Map();          // piece -> times it came out bad
  const tag = `${++mountN}`;
  const st = { pieces: 0, failed: 0, ms: 0, peak: 0, restarts: 0, workers: 1 };
  let alive = true, playing = null, cur = 0, waitShown = false;
  let held = !!start;               // the picture is paused by us, waiting for its sound
  let head = null, headN = 0;       // { t0, buf, busy, tok }: the quick piece for where the film is
  const dur = () => (Number.isFinite(v.duration) ? v.duration : Infinity);

  // the decoders: this film's ffmpeg, and a second one of our own
  const workers = [{ ff, path, busy: false }];
  let second = null;
  const addSecond = () => {
    if (second || !file) return;
    second = (async () => {
      const f2 = await newFF();
      if (!alive) { f2.terminate(); return; }
      const dir = `/w${tag}`;
      await f2.createDir(dir); await f2.mount("WORKERFS", { files: [file] }, dir);
      workers.push({ ff: f2, path: `${dir}/${file.name}`, busy: false, own: true });
      st.workers = workers.length;
      pump();
    })().catch(() => {});
  };

  // `secs` of sound from `from` on one decoder, stereo 48 kHz: the samples, or none
  const raw = async (w, from, secs, name) => {
    const o = `/s${tag}_${name}.raw`;
    await w.ff.exec(["-hide_banner", "-loglevel", "error", "-probesize", "2000000", "-analyzeduration", "1000000",
      "-ss", String(from), "-i", w.path, "-t", String(secs),
      "-map", `0:a:${n}`, "-vn", "-sn", "-dn", "-ac", "2", "-ar", String(RATE), "-f", "s16le", o]).catch(() => {});
    let data;
    try { data = await w.ff.readFile(o); await w.ff.deleteFile(o); } catch { data = null; }
    return data ? new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2)) : new Int16Array(0);
  };
  const toBuffer = (f, len) => {
    const buf = ac.createBuffer(2, Math.max(1, len), RATE), L = buf.getChannelData(0), R = buf.getChannelData(1);
    let pk = 0;
    for (let k = 0; k < len; k++) { L[k] = f[2 * k] / 32768; R[k] = f[2 * k + 1] / 32768; const a = Math.abs(L[k]); if (a > pk) pk = a; }
    st.peak = Math.max(st.peak, pk);
    return buf;
  };
  // the quick piece: HEAD seconds from where the film is
  const decodeHead = async (w, h) => {
    const t0 = performance.now();
    const f = await raw(w, h.t0, HEAD, `h${h.tok}`);
    st.headMs = Math.round(performance.now() - t0);
    const len = Math.floor(f.length / 2);
    return alive && len > RATE / 2 ? toBuffer(f, len) : null;
  };
  // decode one piece on one decoder: from i*SEG, SEG seconds
  const decode = async (w, i) => {
    const t0 = performance.now();
    const f = await raw(w, i * SEG, SEG, String(i));
    st.ms = Math.round(performance.now() - t0);
    if (!alive) return null;
    const len = Math.floor(f.length / 2);
    // came out short (a read that failed part way): again — twice, then let it be
    const full = Math.min(SEG, dur() - i * SEG) - 0.3;
    if (len / RATE < full) {
      const k = (tries.get(i) || 0) + 1;
      tries.set(i, k); st.failed++;
      if (k < 3) return null;
      if (!len) return ac.createBuffer(2, Math.max(1, Math.round(Math.max(0.5, full) * RATE)), RATE);
    }
    st.pieces++;
    return toBuffer(f, len);
  };
  // give every free decoder the most urgent piece: the one the film is in,
  // then the next ones in order; pieces it has left behind are dropped
  const wanted = (i) => i >= cur - 1 && i <= cur + AHEAD && i * SEG < dur();
  const pump = () => {
    if (!alive) return;
    for (const k of [...jobs.keys()]) if (!wanted(k)) jobs.delete(k);
    // first of all, the quick piece for where the film is
    if (head && !head.buf && !head.busy) {
      const w = workers.find((x) => !x.busy);
      if (w) {
        const h = head;
        h.busy = true; w.busy = true;
        decodeHead(w, h).then((b) => {
          w.busy = false; h.busy = false;
          if (!alive) return;
          if (head === h) { if (b) h.buf = b; else head = null; }
          tick(); pump();
        });
      }
    }
    for (const w of workers) {
      if (w.busy || !jobs.size) continue;
      let best = null, bs = Infinity;
      for (const k of jobs.keys()) { const sc = k >= cur ? k - cur : 100 + cur - k; if (sc < bs) { bs = sc; best = k; } }
      jobs.delete(best); busy.add(best); w.busy = true;
      decode(w, best).then((b) => decoded(w, best, b));
    }
  };
  const decoded = (w, i, b) => {
    w.busy = false; busy.delete(i);
    if (!alive) return;
    if (b) { cache.set(i, b); if (i === cur && !playing) tick(); }
    pump();
  };
  const want = (i) => { if (wanted(i) && !cache.has(i) && !busy.has(i)) jobs.set(i, true); };

  const stopAll = () => {
    if (!playing) return;
    for (const s of playing.srcs) { try { s.stop(); } catch { /* done */ } }
    playing = null;
  };
  // a buffer that starts at film time `base`, from `from` seconds into it, at the context's time `at`
  const put = (b, at, from, base) => {
    const src = ac.createBufferSource();
    src.buffer = b; src.playbackRate.value = v.playbackRate || 1;
    src.connect(master);
    src.start(at, Math.max(0, from));
    playing.srcs.push(src);
    playing.endT = base + b.duration;                                   // the film time this sound runs to
    playing.endAt = at + (b.duration - Math.max(0, from)) / (v.playbackRate || 1);
  };
  // the quick piece, if it has the sound for film time t
  const headFor = (t) => (head && head.buf && t >= head.t0 - 0.05 && t < head.t0 + head.buf.duration - 0.6 ? head : null);
  const ready = (t) => cache.has(Math.floor(t / SEG)) || !!headFor(t);
  // ask for the quick piece for film time t (unless its sound is here, or coming)
  const wantHead = (t) => {
    if (cache.has(Math.floor(t / SEG)) || t >= dur() - 0.3) return;
    if (head && t >= head.t0 - 0.05 && t < head.t0 + HEAD - 0.6) return;
    head = { t0: Math.max(0, t), buf: null, busy: false, tok: ++headN };
    pump();
  };
  const begin = () => {
    const t = v.currentTime, i = Math.floor(t / SEG), rate = v.playbackRate || 1;
    let b = cache.get(i), base = i * SEG;
    if (b && t + LEAD * rate - base >= b.duration - 0.05) { cache.delete(i); b = null; }   // too short: decode it again
    if (!b) { const h = headFor(t); if (h) { b = h.buf; base = h.t0; } }
    if (!b) return false;
    const at = ac.currentTime + LEAD;
    playing = { srcs: [], t0: t + LEAD * rate, c0: at, rate };
    put(b, at, t + LEAD * rate - base, base);
    st.restarts++;
    return true;
  };
  const waitFlag = (on) => {
    if (on === waitShown) return;
    waitShown = on;
    if (onWait) onWait(on);
  };
  const hold = () => {
    if (!held) { held = true; st.holds = (st.holds || 0) + 1; try { v.pause(); } catch { /* gone */ } }
    waitFlag(true);
  };

  function tick() {
    if (!alive) return;
    const t = v.currentTime;
    cur = Math.floor(t / SEG);
    for (let k = cur; k <= cur + AHEAD; k++) want(k);
    for (const k of cache.keys()) if (k < cur - 2 || k > cur + AHEAD + 1) cache.delete(k);
    pump();
    kick();
    if (v.ended || t >= dur() - 0.3) { stopAll(); held = false; waitFlag(false); return; }
    if (v.seeking) { stopAll(); return; }
    if (ac.state === "suspended") ac.resume().catch(() => {});
    // held by us for its sound: let it go the moment the sound is here
    if (held) {
      stopAll();
      wantHead(t);
      if (!ready(t)) { waitFlag(true); return; }
      held = false; waitFlag(false);
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
      return;                                       // "playing" brings us back to begin
    }
    if (v.paused) { stopAll(); waitFlag(false); return; }
    if (!playing) {
      if (begin()) { waitFlag(false); return; }
      // its sound isn't decoded yet: the picture waits for it
      wantHead(t);
      hold();
      return;
    }
    // drifted (a stall, a jump, a new speed): start again from where the film is
    const expect = playing.t0 + (ac.currentTime - playing.c0) * playing.rate;
    if (Math.abs(expect - t) > 0.3 || playing.rate !== (v.playbackRate || 1)) { stopAll(); tick(); return; }
    // what comes next, right after this
    if (playing.endAt - ac.currentTime < 3) {
      const i = Math.floor((playing.endT + 0.001) / SEG), nb = cache.get(i), from = playing.endT - i * SEG;
      if (nb && from < nb.duration - 0.02) put(nb, playing.endAt, from, i * SEG);
    }
    // ran out (the next piece wasn't ready in time): the picture waits
    if (playing.endAt - ac.currentTime < -0.05) { stopAll(); if (playing === null && !ready(v.currentTime)) { wantHead(v.currentTime); hold(); } }
  }
  const evs = ["play", "pause", "seeking", "seeked", "ratechange", "ended", "playing"];
  const onEv = (e) => {
    if (e.type === "play" && ac.state === "suspended") ac.resume().catch(() => {});
    tick();
  };
  evs.forEach((x) => v.addEventListener(x, onEv));
  // a phone's sound only starts from a tap: any tap wakes it
  const wake = () => { if (ac.state === "suspended") ac.resume().catch(() => {}); kick(); };
  document.addEventListener("pointerdown", wake, true);
  const every = setInterval(tick, 150);
  v.muted = true;                   // its own sound (silent, or wrong) is out of the way
  addSecond();                      // two decoders from the start: one for where the film is, one for what follows
  wantHead(v.currentTime);
  tick();

  return {
    track: out.stream.getAudioTracks()[0],
    // for the Sound check
    stats: () => ({ ...st, ctx: ac.state, playing: !!playing, waiting: waitShown, held, muted: v.muted, vol: local.gain.value,
      player: sink.paused ? "paused" : "playing", queued: jobs.size, ahead: [...cache.keys()].filter((k) => k >= cur).length, errs: ffErrs.slice() }),
    setVolume(x) { local.gain.value = Math.max(0, Math.min(1, x)); },
    volume() { return local.gain.value; },
    stop() {
      alive = false;
      clearInterval(every);
      evs.forEach((x) => v.removeEventListener(x, onEv));
      document.removeEventListener("pointerdown", wake, true);
      stopAll(); cache.clear(); jobs.clear();
      waitFlag(false);
      for (const w of workers) if (w.own) { try { w.ff.terminate(); } catch { /* gone */ } }
      try { sink.pause(); sink.srcObject = null; sink.remove(); } catch { /* gone */ }
      ac.close().catch(() => {});
    },
  };
}
