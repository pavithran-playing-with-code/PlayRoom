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
const HEAD = [4, 6];             // seconds: the two quick first pieces, one after the other from exactly where the film
                                 // is (a start, a jump) — decoded side by side, so 10 s of sound is here in the time 6 s takes
const HEADS = HEAD[0] + HEAD[1];
// Keeping the sound on the picture, the way VLC does: the gap between them is
// measured all the time and closed by playing the sound a touch faster or
// slower (3% at most: not heard), never by cutting it — unless it is far out.
const SYNC_IN = 0.03;            // seconds apart before it is pulled back …
const SYNC_DONE = 0.008;         // … and how close it is brought
const SYNC_HARD = 0.25;          // this far out: start the sound again at the right place
const SYNC_MAX = 0.03;           // the most the sound's speed is bent
const NEXT = 1.5;                // seconds before a piece ends that the next is lined up behind it
// How far the film's sound can be turned up here past its own level (VLC goes
// to 200%): a film mixed down from 5.1 is quiet on a phone. Only what is heard
// on this phone — what goes to a call stays as it is.
export const BOOST = 3;
const SINK_LAT = 0.02;           // seconds the <audio> player adds on top of the sound engine's own delay (a guess)

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
// what the last pieces cost in reading the file: { n reads, MB, ms } (the Sound check, tests)
const ioSeen = { n: 0, mb: 0, ms: 0 };
async function newFF() {
  const { FFmpeg } = await import("../vendor/ffmpeg/classes.js");
  const ff = new FFmpeg();
  await ff.load(await getCore());
  ff.on("log", ({ message }) => { const m = /^pr-io (\d+) (\d+) (\d+)/.exec(message || ""); if (m) { ioSeen.n = +m[1]; ioSeen.mb = +(m[2] / 1048576).toFixed(1); ioSeen.ms = +m[3]; } });
  if (typeof window !== "undefined" && window.__noBite) await ff.exec(["-pr-bite", "0"]);     // for tests: the file read as it used to be
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
// A decoder can die in the middle of a film: ffmpeg in the browser keeps a
// little memory from every piece it decodes, and after enough of them it runs
// out and stops answering (or answers with nothing). The one decoder kept for
// every film was then dead for good — sound gone mid-film, and still gone
// after closing the film and opening it again, until the app was restarted.
// So: nothing waits on a decoder for ever (`within`), one that has died is
// thrown away and the next film loads a new one (`retireShared`), and a
// film's decoders are swapped for fresh ones as they go (`renew`, below).
const within = (p, ms) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("the decoder didn't answer")), ms);
  p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
});
function retireShared(ff) {
  const mine = ffLoad;
  if (mine) mine.then((x) => { if (x === ff && ffLoad === mine) ffLoad = null; }).catch(() => {});
  chain = Promise.resolve();        // whatever was queued behind it is never coming back
  try { ff.terminate(); } catch { /* gone already */ }
}
const FRESH = 60;                 // pieces a decoder decodes before it is swapped for a new one
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
const dolbySeen = new WeakMap();
export function dolbyLike(file) {
  if (!dolbySeen.has(file)) dolbySeen.set(file, dolbyLook(file));
  return dolbySeen.get(file);
}
async function dolbyLook(file) {
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
  // "Duration: 01:52:03.45, start: …"
  let dur = 0;
  for (const l of lines) { const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(l); if (d) { dur = d[1] * 3600 + d[2] * 60 + Number(d[3]); break; } }
  return { audio, subs, dur };
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
  let ff = await getFF();
  let dir = `/film${++mountN}`, path = `${dir}/${file.name}`;
  let log = [];
  // mount the file and ask what is in it. `sure`: no answer at all means the decoder is dead
  const read = async (sure) => {
    log = [];
    const onLog = ({ message }) => log.push(message);
    const f = ff, d = dir, pth = path;
    await within(queued(async () => { await f.createDir(d); await f.mount("WORKERFS", { files: [file] }, d); }), 20000);
    f.on("log", onLog);
    try { await within(queued(() => f.exec(["-hide_banner", "-i", pth]).catch(() => {})), 45000); }
    finally { try { f.off("log", onLog); } catch { /* gone */ } }
    if (sure && !log.some((l) => /Input #/.test(l))) throw new Error("the decoder gave no answer");
  };
  try { await read(true); }
  catch {
    // the kept decoder has died (see retireShared): a new one, and once more
    retireShared(ff);
    ff = await getFF();
    dir = `/film${++mountN}`; path = `${dir}/${file.name}`;
    await read(false);
  }
  const info = parseStreams(log);
  const F = {
    ...info,
    probe: log.filter((l) => /Input #|Duration|Stream #/.test(l)).map((l) => l.trim().slice(0, 140)).slice(0, 12),
    // the sound of audio track n, in step with the video
    sound: (n, v, opts) => playSound(ff, path, n, v, { ...(opts || {}), file }),
    // Text subtitles n. Reading them means reading the film, and a whole film
    // is gigabytes — minutes on a phone, with nothing on the screen meanwhile,
    // which looked like subtitles not working. So they are read a stretch at
    // a time (PART), the stretch the film is in first: the promise gives the
    // lines so far once that one is in, and `onPart(lines)` hands over more
    // as each next stretch arrives (wherever the film has got to by then,
    // then the rest). `where()` is the film's time now; `alive()` false
    // stops it. Its own ffmpeg, so the sound never waits behind it; a phone
    // with no room for another borrows the sound's.
    async subtitles(n, { where, onPart, alive } = {}) {
      const s = info.subs[n];
      if (!s || !s.text) return null;
      const live = () => !alive || alive();
      let f2 = null, p2 = path, own = false;
      try {
        f2 = await newFF(); own = true;
        await f2.createDir("/f"); await f2.mount("WORKERFS", { files: [file] }, "/f");
        p2 = `/f/${file.name}`;
      } catch { try { own && f2 && f2.terminate(); } catch { /* gone */ } f2 = ff; p2 = path; own = false; }
      const done = () => { if (own) { try { f2.terminate(); } catch { /* gone */ } } };
      const run = (args) => (own ? f2.exec(args) : queued(() => f2.exec(args)));
      const o = `/sub${++mountN}.vtt`;
      const read = async (from, secs) => {
        const args = ["-hide_banner", "-loglevel", "error"];
        if (from !== null) args.push("-ss", String(from));
        args.push("-i", p2);
        if (secs) args.push("-t", String(secs));
        args.push("-map", `0:s:${n}`, "-vn", "-an", "-c:s", "webvtt", "-y", o);
        await run(args).catch(() => {});
        let out;
        try { out = await f2.readFile(o, "utf8"); await f2.deleteFile(o); } catch { return null; }
        const cues = parseVTT(typeof out === "string" ? out : new TextDecoder().decode(out));
        if (from) for (const c of cues) { c.a += from; c.b += from; }
        return cues;
      };
      const total = info.dur || 0;
      // a film whose length isn't known: all at once, as before
      if (!total) { try { return await read(null, 0); } finally { done(); } }
      const PART = 180, OVER = 8, parts = Math.ceil(total / PART), got = new Set(), all = [];
      // lines from a stretch, into the list: one cut in two by a stretch's edge is joined again
      const add = (cues) => {
        for (const c of cues) {
          const same = all.find((x) => x.text === c.text && c.a <= x.b + 0.05 && x.a <= c.b + 0.05);
          if (same) { same.a = Math.min(same.a, c.a); same.b = Math.max(same.b, c.b); } else all.push(c);
        }
        all.sort((x, y) => x.a - y.a);
      };
      const next = () => {
        const here = Math.max(0, Math.min(parts - 1, Math.floor(((where && where()) || 0) / PART)));
        for (let k = here; k < parts; k++) if (!got.has(k)) return k;
        for (let k = 0; k < here; k++) if (!got.has(k)) return k;
        return -1;
      };
      const one = async (k) => {
        got.add(k);
        const from = Math.max(0, k * PART - OVER);
        const cues = await read(from, (k + 1) * PART - from + 1);
        if (cues) add(cues);
        return !!cues;
      };
      let first;
      try { first = await one(next()); } catch { first = false; }
      if (!first || !live()) { done(); return first ? all.slice() : null; }
      (async () => {
        try {
          for (let k = next(); k >= 0 && live(); k = next()) { await one(k); if (live() && onPart) onPart(all.slice()); }
        } catch { /* what's read stays */ }
        done();
      })();
      return all.slice();
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
// The picture never plays without its sound, and once going it doesn't stop.
// Where the film is (its start, or after a jump) two quick pieces are decoded
// first, side by side, from that very moment (HEAD: 4 s, then the 6 s after
// it) — the first is ready several times sooner than a whole SEG piece, and
// the second sees it through to the whole pieces — and the picture is held (paused by us, `held`) until its
// sound is here AND will last: the sound in hand has to outlast the time the
// next piece still needs, judged from how fast this phone is really decoding
// (`safe`). Letting go the moment the quick piece arrived started the film
// and stopped it again 4 s later on a phone — worse than a second more wait.
// If the decoders still fall behind mid-film it waits once more, for longer.
// `start`: the film hasn't begun — begin it when its sound is ready.
async function playSound(ff, path, n, v, { onWait, file, start = false } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC({ sampleRate: RATE });
  const master = ac.createGain(), local = ac.createGain(), out = ac.createMediaStreamDestination(), here = ac.createMediaStreamDestination();
  master.connect(out); master.connect(local);
  // turned up past 100% the loud moments would crackle: a limiter holds the
  // peaks just under full and leaves everything quieter alone
  try {
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.2;
    local.connect(lim); lim.connect(here);
  } catch { local.connect(here); }
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
  const st = { pieces: 0, failed: 0, ms: 0, peak: 0, restarts: 0, workers: 1, off: 0, worst: 0, resyncs: 0, nudges: 0, stalls: 0 };
  let alive = true, playing = null, cur = 0, waitShown = false;
  let held = !!start;               // the picture is paused by us, waiting for its sound
  let head = null, headN = 0;       // { t0, parts: [{ from, secs, buf, busy, at }], tok }: the quick pieces for where the film is
  const began = new Map();          // piece -> when its decoding started
  let rate = 0;                     // ms of work a second of sound takes on this phone (measured)
  let strict = false, heldAt = 0;   // fell behind once: wait for more next time; when this hold began
  let seenT = -1, movedAt = 0;      // the picture's time last tick, and when it last moved
  // how long after it is handed over the sound is really heard: the phone's
  // own delay (large on Bluetooth earphones). A <video> allows for this by
  // itself; its sound is ours now, so we do.
  // Eased: a phone's figure jumps about (and changes when earphones connect);
  // followed slowly, the sound is bent to it instead of being cut.
  let latS = null;
  const lat = () => {
    let l = (ac.outputLatency || ac.baseLatency || 0) + SINK_LAT;
    l = Number.isFinite(l) ? Math.max(0, Math.min(0.35, l)) : SINK_LAT;
    latS = latS === null ? l : latS + (l - latS) * 0.02;
    return latS;
  };
  let letGo = 0;                    // gave up waiting for sound that never came: no holding until this time
  const dur = () => (Number.isFinite(v.duration) ? v.duration : Infinity);

  // the decoders: this film's ffmpeg, and a second one of our own
  const workers = [{ ff, path, busy: false, n: 0, bad: 0 }];
  const idle = (x) => !x.busy && !x.gone;
  // A new decoder in this one's place. `dead`: it has stopped working (it is
  // not used again, and its pieces go to the other one meanwhile); otherwise
  // it has simply done FRESH pieces and is swapped before it runs out of
  // memory — the old one works on until the new one is loaded.
  // the new decoder goes in (the old one is not in the middle of a piece)
  const swapIn = (w, nx, dead) => {
    const old = w.ff, wasOwn = w.own;
    w.ff = nx.ff; w.path = nx.path; w.next = null; w.own = true; w.n = 0; w.bad = 0; w.gone = false; w.renewing = false; w.renewedAt = performance.now();
    if (wasOwn) { try { old.terminate(); } catch { /* gone */ } }
    else if (dead) retireShared(old);                // the decoder kept for every film: the next film gets a new one
  };
  const renew = (w, dead) => {
    if (w.renewing || !file || !alive) return;
    if (!dead && workers.some((x) => x.renewing)) return;                       // one at a time: the sound keeps coming
    if (dead && !w.gone && w.renewedAt && performance.now() - w.renewedAt < 60000) return;   // (a film's last pieces come out short: not a reason to keep swapping)
    w.renewing = true;
    if (dead) w.gone = true;
    st.renewed = (st.renewed || 0) + 1;
    (async () => {
      let f2 = null, ok = false;
      try {
        f2 = await newFF();
        const d2 = `/w${tag}_${++mountN}`;
        await f2.createDir(d2); await f2.mount("WORKERFS", { files: [file] }, d2);
        if (alive) {
          const nx = { ff: f2, path: `${d2}/${file.name}` };
          ok = true;
          // a dead one, or one doing nothing: now. One in the middle of a piece
          // (on a slow phone it always is): as its next piece begins — `raw`.
          if (w.gone || !w.busy) swapIn(w, nx, dead); else w.next = nx;
        }
      } catch { /* no new decoder this time */ }
      if (!ok) {
        if (f2) { try { f2.terminate(); } catch { /* gone */ } }
        w.renewing = false;
        if (alive && w.gone) setTimeout(() => renew(w, true), 5000);            // try again: it has no decoder at all
      }
      pump();
    })();
  };
  let second = null;
  const addSecond = () => {
    if (second || !file) return;
    second = (async () => {
      if (typeof window !== "undefined" && window.__slowFF) await new Promise((r) => setTimeout(r, window.__slowFF * 5));   // for tests: a second decoder takes a while to load on a phone
      const f2 = await newFF();
      if (!alive) { f2.terminate(); return; }
      const dir = `/w${tag}`;
      await f2.createDir(dir); await f2.mount("WORKERFS", { files: [file] }, dir);
      workers.push({ ff: f2, path: `${dir}/${file.name}`, busy: false, own: true, n: 0, bad: 0 });
      st.workers = workers.length;
      pump();
    })().catch(() => {});
  };

  // `secs` of sound from `from` on one decoder, stereo 48 kHz: the samples, or none
  const raw = async (w, from, secs, name) => {
    const o = `/s${tag}_${name}.raw`;
    // for tests: a decoder as slow as a phone's (window.__slowFF: ms of work per second of sound)
    if (typeof window !== "undefined" && window.__slowFF) await new Promise((r) => setTimeout(r, secs * window.__slowFF));
    if (w.next) swapIn(w, w.next, false);            // a fresh decoder was waiting for this moment
    const used = w.ff;
    let hung = false;
    await within(used.exec(["-hide_banner", "-loglevel", "error", "-probesize", "2000000", "-analyzeduration", "1000000",
      "-ss", String(from), "-i", w.path, "-t", String(secs),
      "-map", `0:a:${n}`, "-vn", "-sn", "-dn",
      // raw samples carry no times: a track that starts late, or has a hole in
      // it, would come out short and early. Fill those with silence.
      "-af", "aresample=async=1:first_pts=0",
      "-ac", "2", "-ar", String(RATE), "-f", "s16le", o]).catch(() => {}), Math.max(30000, secs * 6000)).catch(() => { hung = true; });
    let data = null;
    if (!hung) { try { data = await within(used.readFile(o), 10000); used.deleteFile(o).catch(() => {}); } catch { data = null; } }
    const out = data ? new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2)) : new Int16Array(0);
    if (w.ff === used) {
      // how this decoder is doing: nothing back twice running (or no answer at all) and it is replaced
      w.n = (w.n || 0) + 1;
      w.bad = out.length < RATE ? (w.bad || 0) + 1 : 0;
      if (hung || w.bad >= 2) renew(w, true);
      else if (w.n >= FRESH) renew(w, false);
    }
    return out;
  };
  // `room`: make it at least this many samples long (the rest silence)
  const toBuffer = (f, len, room = 0) => {
    const buf = ac.createBuffer(2, Math.max(1, len, room), RATE), L = buf.getChannelData(0), R = buf.getChannelData(1);
    let pk = 0;
    for (let k = 0; k < len; k++) { L[k] = f[2 * k] / 32768; R[k] = f[2 * k + 1] / 32768; const a = Math.abs(L[k]); if (a > pk) pk = a; }
    st.peak = Math.max(st.peak, pk);
    return buf;
  };
  // a quick piece: `part.secs` seconds from `part.from`
  const decodeHead = async (w, h, part) => {
    const f = await raw(w, part.from, part.secs, `h${h.tok}_${Math.round(part.from * 10)}`);
    const len = Math.floor(f.length / 2);
    return alive && len > RATE / 2 ? toBuffer(f, len) : null;
  };
  const clocked = (ms, secs) => { const r = ms / Math.max(0.5, secs); rate = rate ? Math.max(r, rate * 0.6 + r * 0.4) : r; st.est = Math.round(rate * SEG); };
  // decode one piece on one decoder: from i*SEG, SEG seconds
  const decode = async (w, i) => {
    const t0 = performance.now();
    const f = await raw(w, i * SEG, SEG, String(i));
    st.ms = Math.round(performance.now() - t0);
    if (!alive) return null;
    const len = Math.floor(f.length / 2);
    // came out short (a read that failed part way): again — twice, then let it be
    const whole = Math.min(SEG, dur() - i * SEG), full = whole - 0.3;
    if (len / RATE < full) {
      const k = (tries.get(i) || 0) + 1;
      tries.set(i, k); st.failed++;
      if (k < 3) return null;
    }
    st.pieces++;
    // always its whole length (a track that ends before the picture, a piece
    // that won't decode: silence) — a short piece used to stop the film there
    return toBuffer(f, len, Number.isFinite(whole) ? Math.round(Math.max(0.5, whole) * RATE) : 0);
  };
  // give every free decoder the most urgent piece: the one the film is in,
  // then the next ones in order; pieces it has left behind are dropped
  const wanted = (i) => i >= cur - 1 && i <= cur + AHEAD && i * SEG < dur();
  // the piece the quick pieces stand in for (the film is inside them): not decoded a second time
  const covered = (i) => { const t = v.currentTime; return !!head && i === Math.floor(head.t0 / SEG) && (i + 1) * SEG <= head.t0 + HEADS + 0.05 && t >= head.t0 - 0.05 && t < head.t0 + HEADS; };
  const startPart = (h, part, w) => {
    part.busy = true; part.at = performance.now(); w.busy = true;
    decodeHead(w, h, part).then((b) => {
      w.busy = false; part.busy = false;
      const took = performance.now() - part.at;
      clocked(took, part.secs);
      if (part === h.parts[0]) st.headMs = Math.round(took);
      if (!alive) return;
      if (head === h) { if (b) part.buf = b; else head = null; }       // one that failed: the whole pieces take over
      tick(); pump();
    });
  };
  const pump = () => {
    if (!alive) return;
    for (const k of [...jobs.keys()]) if (!wanted(k)) jobs.delete(k);
    // first of all, the quick pieces for where the film is
    if (head) for (const part of head.parts) {
      if (part.buf || part.busy) continue;
      const w = workers.find(idle);
      if (!w) break;
      startPart(head, part, w);
    }
    for (const w of workers) {
      if (!idle(w) || !jobs.size) continue;
      let best = null, bs = Infinity;
      for (const k of jobs.keys()) { const sc = k >= cur ? k - cur : 100 + cur - k; if (sc < bs) { bs = sc; best = k; } }
      jobs.delete(best); busy.add(best); w.busy = true;
      began.set(best, performance.now());
      decode(w, best).then((b) => decoded(w, best, b));
    }
  };
  const decoded = (w, i, b) => {
    w.busy = false; busy.delete(i);
    const took = performance.now() - (began.get(i) || performance.now());
    began.delete(i);
    if (took > 0) clocked(took, SEG);
    if (!alive) return;
    if (b) { cache.set(i, b); if (i === cur && !playing) tick(); }
    pump();
  };
  const want = (i) => { if (wanted(i) && !cache.has(i) && !busy.has(i) && !covered(i)) jobs.set(i, true); };

  const stopAll = () => {
    if (!playing) return;
    for (const e of playing.srcs) { e.src.onended = null; try { e.src.stop(); } catch { /* done */ } }
    playing = null;
  };
  // a buffer that starts at film time `base`, from `from` seconds into it, at the context's time `at`
  const put = (b, at, from, base) => {
    const src = ac.createBufferSource(), P = playing, e = { src, at };
    src.buffer = b; src.playbackRate.value = P.rate;
    src.connect(master);
    src.onended = () => { const k = P.srcs.indexOf(e); if (k >= 0) P.srcs.splice(k, 1); };
    src.start(at, Math.max(0, from));
    P.srcs.push(e);
    P.endT = base + b.duration;                                         // the film time this sound runs to
    P.endAt = at + (b.duration - Math.max(0, from)) / P.rate;
  };
  // play the sound at a new speed from this moment (to close a gap with the picture)
  const retime = (r) => {
    const c = ac.currentTime, P = playing;
    P.t0 += (c - P.c0) * P.rate; P.c0 = c; P.rate = r;
    for (const e of P.srcs) { try { e.src.playbackRate.value = r; } catch { /* ended */ } }
    P.endAt = c + (P.endT - P.t0) / r;
  };
  // the quick piece that has the sound for film time t, if one does
  const headFor = (t) => {
    if (!head) return null;
    for (let k = head.parts.length - 1; k >= 0; k--) {
      const q = head.parts[k];
      if (q.buf && t >= q.from - 0.05 && t < q.from + q.buf.duration - (k === head.parts.length - 1 ? 0.6 : 0.05)) return q;
    }
    return null;
  };
  // the quick piece that starts right where film time `end` is
  const headAt = (end) => (head ? head.parts.find((q) => Math.abs(q.from - end) < 0.08) || null : null);
  const ready = (t) => cache.has(Math.floor(t / SEG)) || !!headFor(t);
  // what plays from film time `end` on: { b, base } (a quick piece first, else the whole piece), or null
  const nextFrom = (end) => {
    const q = headAt(end);
    if (q && q.buf) return { b: q.buf, base: q.from };
    const i = Math.floor((end + 0.001) / SEG), b = cache.get(i);
    return b && end - i * SEG < b.duration - 0.02 ? { b, base: i * SEG } : null;
  };
  // the film time the decoded sound runs to without a gap, from t (t itself if there's none)
  const aheadTo = (t) => {
    const i0 = Math.floor(t / SEG), b0 = cache.get(i0), h = headFor(t);
    let end;
    if (h) end = h.from + h.buf.duration;
    else if (b0 && t < i0 * SEG + b0.duration - 0.05) end = i0 * SEG + b0.duration;
    else return t;
    for (let n = 0; n < AHEAD + 4; n++) {
      const x = nextFrom(end);
      if (!x || x.base + x.b.duration <= end + 0.02) break;
      end = x.base + x.b.duration;
    }
    return end;
  };
  // Safe to let the picture go: its sound is here and will outlast the wait
  // for what comes after it.
  const safe = (t) => {
    const end = aheadTo(t);
    if (end <= t) return false;
    if (end >= dur() - 0.5) return true;
    const have = (end - t) / (v.playbackRate || 1);                    // seconds of play in hand
    const per = rate || 900;                                            // ms a second of sound takes (a careful guess until measured)
    const q = headAt(end), nxt = Math.floor((end + 0.001) / SEG);
    // being decoded: what's left of it; not started: all of it, and a wait for a free decoder
    let left;
    if (q) left = q.busy ? Math.max(0, per * q.secs - (performance.now() - q.at)) : per * q.secs * 1.3;
    else left = busy.has(nxt) ? Math.max(0, per * SEG - (performance.now() - (began.get(nxt) || performance.now()))) : per * SEG * 1.3;
    if (have >= (left / 1000) * (strict ? 1.7 : 1.3) + (strict ? 2 : 0.8)) return true;
    // never held for ever on a bad guess: after a long wait, go with what there is
    return performance.now() - heldAt > per * SEG * 3 + 4000;
  };
  // ask for the quick pieces for film time t (unless its sound is here, or coming)
  const wantHead = (t) => {
    if (cache.has(Math.floor(t / SEG)) || t >= dur() - 0.3) return;
    if (head && t >= head.t0 - 0.05 && t < head.t0 + HEADS - 0.6) return;
    const t0 = Math.max(0, t);
    head = { t0, tok: ++headN, parts: [{ from: t0, secs: HEAD[0] }, { from: t0 + HEAD[0], secs: HEAD[1] }].filter((q) => q.from < dur() - 0.3) };
    pump();
  };
  const begin = () => {
    const t = v.currentTime, speed = v.playbackRate || 1;
    // the film time handed to the sound engine at `at`: where the picture will
    // be then, and on by the phone's own delay, so it is heard on time
    const t0 = t + (LEAD + lat()) * speed, i = Math.floor(t0 / SEG);
    let b = cache.get(i), base = i * SEG;
    if (b && t0 - base >= b.duration - 0.05) { cache.delete(i); b = null; }   // too short: decode it again
    const h = headFor(t0) || headFor(t);
    if (h && t0 - h.from < h.buf.duration - 0.05) { b = h.buf; base = h.from; }   // the quick pieces first: they lead on without a gap
    if (!b) return false;
    const at = ac.currentTime + LEAD;
    playing = { srcs: [], t0, c0: at, rate: speed, speed, born: performance.now(), fixes: 0, err: null, nudging: false };
    put(b, at, t0 - base, base);
    st.restarts++;
    return true;
  };
  const waitFlag = (on) => {
    if (on === waitShown) return;
    waitShown = on;
    if (onWait) onWait(on);
  };
  // mid: the sound ran out while playing (not a start or a jump) — next time, wait for more
  const hold = (mid = false) => {
    if (performance.now() < letGo) return;
    if (!held) { held = true; heldAt = performance.now(); st.holds = (st.holds || 0) + 1; if (mid) { strict = true; st.ranOut = (st.ranOut || 0) + 1; } try { v.pause(); } catch { /* gone */ } }
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
      if (!heldAt) heldAt = performance.now();
      // ▶ tapped while it waits (the player shows ▶, so people do): the picture
      // ran on silent with its sound chasing it and never catching up. It
      // waits. Only sound that never comes at all (a decoder that failed) is
      // given up on, so the film can at least be watched.
      if (!v.paused && !(typeof window !== "undefined" && window.__oldSync)) {
        if (performance.now() - heldAt > 30000 && !ready(t)) { held = false; heldAt = 0; letGo = performance.now() + 30000; st.gaveUp = (st.gaveUp || 0) + 1; waitFlag(false); return; }
        try { v.pause(); } catch { /* gone */ }
      }
      if (!ready(t) || !safe(t)) { waitFlag(true); return; }
      held = false; heldAt = 0; waitFlag(false);
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
      return;                                       // "playing" brings us back to begin
    }
    if (v.paused) { stopAll(); waitFlag(false); seenT = t; movedAt = performance.now(); return; }
    // Is the picture really moving? After ▶ or a jump a phone takes a moment
    // to show the next frame, and it can stall mid-film (a busy phone). Sound
    // started against a picture that isn't moving is early from then on.
    const now = performance.now();
    if (t !== seenT) { seenT = t; movedAt = now; }
    // (a phone's clock may move in steps: only a long stop, or one the player owns up to, counts)
    const stuck = now - movedAt > 1000 || (v.readyState < 3 && now - movedAt > 250);
    const old = typeof window !== "undefined" && window.__oldSync;      // for tests: the sound as it was kept before
    if (!playing) {
      if (stuck && !old) return;                    // the sound comes in when the picture moves (this runs again then)
      if (begin()) { waitFlag(false); return; }
      if (!old && ready(t) && aheadTo(t) > t + 0.6) return;   // the sound for here is in hand (begin looks a little ahead): no reason to wait
      // its sound isn't decoded yet: the picture waits for it
      wantHead(t);
      hold();
      return;
    }
    const speed = v.playbackRate || 1;
    if (playing.speed !== speed) { stopAll(); tick(); return; }          // a new speed: start again at it
    // how far the sound heard is from the picture shown (+: the sound is ahead)
    const err = playing.t0 + (ac.currentTime - playing.c0) * playing.rate - lat() * speed - t;
    playing.err = playing.err === null ? err : playing.err * 0.6 + err * 0.4;
    st.off = Math.round(playing.err * 1000);
    const age = now - playing.born;
    if (age > 1500) st.worst = Math.max(st.worst, Math.abs(st.off));
    if (old) {
      if (Math.abs(err + lat() * speed) > 0.3) { stopAll(); tick(); return; }
    } else {
      // the picture has stopped (it is loading, or the phone is busy): the sound stops with it
      if (stuck) { st.stalls++; stopAll(); return; }
      // far out (a jump, a long stall), or still out just after starting — when
      // nobody hears a cut: start the sound again at the right place
      const far = Math.abs(err) > SYNC_HARD && Math.abs(playing.err) > 0.15;   // and not one odd reading
      if (far || (age > 450 && age < 2500 && Math.abs(playing.err) > 0.08 && playing.fixes < 2)) {
        const fx = far ? playing.fixes : playing.fixes + 1;
        stopAll(); st.resyncs++;
        if (begin()) playing.fixes = fx;
        return;
      }
      // a little out: bend the sound's speed until it is back — not while the
      // next piece is already lined up behind this one at the old speed
      let to = speed;
      if (Math.abs(playing.err) > (playing.nudging ? SYNC_DONE : SYNC_IN)) to = speed * (1 - Math.max(-SYNC_MAX, Math.min(SYNC_MAX, playing.err * 0.5)));
      if (!playing.srcs.some((e) => e.at > ac.currentTime) && Math.abs(to - playing.rate) > 0.0008) {
        if (!playing.nudging && to !== speed) st.nudges++;
        playing.nudging = to !== speed;
        retime(to);
      }
    }
    // what comes next, right after this
    if (playing.endAt - ac.currentTime < (old ? 3 : NEXT)) {
      const x = nextFrom(playing.endT);
      if (x) put(x.b, playing.endAt, playing.endT - x.base, x.base);
    }
    // ran out (the next piece wasn't ready in time): the picture waits
    if (playing.endAt - ac.currentTime < -0.05) { stopAll(); if (playing === null && !ready(v.currentTime)) { wantHead(v.currentTime); hold(true); } }
  }
  const evs = ["play", "pause", "seeking", "seeked", "ratechange", "ended", "playing", "waiting", "timeupdate"];
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
    stats: () => ({ ...st, io: { ...ioSeen }, lat: Math.round(lat() * 1000), ctx: ac.state, playing: !!playing, waiting: waitShown, held, muted: v.muted, vol: local.gain.value,
      player: sink.paused ? "paused" : "playing", queued: jobs.size, ahead: [...cache.keys()].filter((k) => k >= cur).length, errs: ffErrs.slice() }),
    setVolume(x) { local.gain.value = Math.max(0, Math.min(BOOST, x)); },
    volume() { return local.gain.value; },
    stop() {
      alive = false;
      clearInterval(every);
      evs.forEach((x) => v.removeEventListener(x, onEv));
      document.removeEventListener("pointerdown", wake, true);
      stopAll(); cache.clear(); jobs.clear();
      waitFlag(false);
      for (const w of workers) {
        if (w.own) { try { w.ff.terminate(); } catch { /* gone */ } }
        if (w.next) { try { w.next.ff.terminate(); } catch { /* gone */ } w.next = null; }
      }
      try { sink.pause(); sink.srcObject = null; sink.remove(); } catch { /* gone */ }
      ac.close().catch(() => {});
    },
  };
}
