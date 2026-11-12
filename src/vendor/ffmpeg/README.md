# ffmpeg.wasm's front (vendored)

The JavaScript half of `@ffmpeg/ffmpeg` 0.12.10 (MIT,
https://github.com/ffmpegwasm/ffmpeg.wasm), copied from its `dist/esm` so
one line could change: `classes.js` makes its worker only from the bundled
`./worker.js`. Upstream also accepts a worker URL in a variable, which made
webpack warn "the request of a dependency is an expression", and a CI build
treats warnings as errors.

`worker.js` has one addition of ours, marked "PlayRoom": a film mounted with
WORKERFS is read a megabyte at a time and the last few megabytes kept
(`biteReads`). Emscripten reads it 32 KB at a time, each a blocking read of
its own — 320 of them for 10 s of an ordinary film, which was three quarters
of the time a piece took on a laptop (938 ms → 247 ms) and more on a phone:
the sound fell behind the picture and the film paused. After every run it
logs `pr-io <reads> <bytes> <ms>`.

The heavy half — ffmpeg itself, `@ffmpeg/core` 0.12.6, ~30 MB of
WebAssembly — is fetched from jsDelivr at run time, only when a film's sound
needs decoding (`src/utils/filmSound.js`).
