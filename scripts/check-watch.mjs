// scripts/check-watch.mjs — watching a video together: the server's rules
// (config/callWatch.js) and how a phone steers its player (watchSync.js).
// No browser, no server: a second to run.
//
//   node scripts/check-watch.mjs
//
// The whole thing — two phones, a real file, in sync — is a browser test:
// see CLAUDE.md, "Video calls".
import { createRequire } from "node:module";
import { posAt, steer, clockOf, sizeOf } from "../src/utils/watchSync.js";
const require = createRequire(import.meta.url);
const W = require("../config/callWatch.js");

let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };
const FILM = { kind: "file", name: "Film.mp4", size: 1400000000, dur: 6000 };

// the server's rules
check("nothing to play or pause before a video's on", W.step(null, { op: "play", pos: 3 }, 1, 0) === undefined);
check("a bad file is refused", W.step(null, { op: "open", src: { kind: "file", name: "x", size: -1, dur: 10 } }, 1, 0) === undefined
  && W.step(null, { op: "open", src: { kind: "url", name: "x" } }, 1, 0) === undefined);
let w = W.step(null, { op: "open", src: { ...FILM, extra: "dropped", name: "Film\u0000.mp4" } }, 1, 1000);
check("open: paused at the start, the opener ready", w && !w.playing && w.pos === 0 && w.rev === 1 && w.ready.join() === "1" && w.by === 1);
check("open: the file cleaned up", w.src.name === "Film.mp4" && !("extra" in w.src));
w = W.step(w, { op: "ready" }, 2, 1500);
check("a friend picks the same file: ready", w.ready.join() === "1,2" && w.rev === 2);
check("ready twice changes nothing", W.step(w, { op: "ready" }, 2, 1600) === undefined);
w = W.step(w, { op: "play", pos: 0 }, 2, 2000);
check("anyone can play", w.playing && w.at === 2000);
check("playing: the position runs with the clock", Math.abs(W.posAt(w, 12000) - 10) < 1e-9);
w = W.step(w, { op: "pause", pos: 9.5 }, 1, 12000);
check("pause holds where they paused", !w.playing && W.posAt(w, 99999) === 9.5);
w = W.step(w, { op: "seek", pos: 999999 }, 1, 13000);
check("a seek past the end stops at the end", w.pos === FILM.dur);
w = W.step(w, { op: "seek", pos: "nonsense" }, 1, 13000);
check("a seek to nonsense stays put", w.pos === FILM.dur);
w = W.step(w, { op: "play", pos: 10 }, 1, 20000);
check("playing never runs past the end", W.posAt(w, 20000 + 1e9) === FILM.dur);
const before = w.rev;
const w2 = W.step(w, { op: "open", src: { ...FILM, name: "Other.mp4", size: 5 } }, 2, 30000);
check("another video replaces it: back to the start, counted on", w2.src.name === "Other.mp4" && w2.pos === 0 && w2.rev === before + 1 && w2.ready.join() === "2");
check("close: nothing on", W.step(w2, { op: "close" }, 1, 31000) === null);
check("an unknown op is ignored", W.step(w2, { op: "explode" }, 1, 31000) === undefined);

// the phone's steering
const pw = { src: FILM, playing: true, pos: 100, at: 5000 };
check("the phone works out the same position", posAt(pw, 7000) === 102 && W.posAt(pw, 7000) === 102);
let s = steer(50, 50.05, true);
check("close enough: left alone", s.seek === null && s.rate === 1);
s = steer(50, 50.3, true);
check("a little behind: a touch faster", s.seek === null && s.rate > 1 && s.rate <= 1.1, JSON.stringify(s));
s = steer(50.3, 50, true);
check("a little ahead: a touch slower", s.seek === null && s.rate < 1 && s.rate >= 0.9, JSON.stringify(s));
s = steer(50, 58, true);
check("far off: jump", s.seek === 58 && s.rate === 1);
s = steer(50, 50.1, false);
check("paused, nearly there: no jump", s.seek === null && s.rate === 1);
s = steer(50, 52, false);
check("paused somewhere else: jump", s.seek === 52);
// a player that follows the steering ends up in step
let cur = 0, t = 0;
const live = { src: FILM, playing: true, pos: 0.45, at: 0 };
for (let i = 0; i < 40; i++) {           // 400 ms ticks, 16 s
  const st = steer(cur, posAt(live, t), true);
  if (st.seek != null) cur = st.seek;
  cur += 0.4 * st.rate; t += 400;
}
check("a player 0.45 s behind catches up within seconds, without a jump", Math.abs(posAt(live, t) - cur) < 0.12, (posAt(live, t) - cur).toFixed(3));
check("times read well", clockOf(3909) === "1:05:09" && clockOf(247) === "4:07" && clockOf(-5) === "0:00");
check("sizes read well", sizeOf(1400000000) === "1.4 GB" && sizeOf(730000000) === "730 MB" && sizeOf(1304539) === "1.3 MB" && sizeOf(239771) === "0.2 MB");

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
