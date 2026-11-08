# ffmpeg.wasm's front (vendored)

The JavaScript half of `@ffmpeg/ffmpeg` 0.12.10 (MIT,
https://github.com/ffmpegwasm/ffmpeg.wasm), copied from its `dist/esm` so
one line could change: `classes.js` makes its worker only from the bundled
`./worker.js`. Upstream also accepts a worker URL in a variable, which made
webpack warn "the request of a dependency is an expression", and a CI build
treats warnings as errors.

The heavy half — ffmpeg itself, `@ffmpeg/core` 0.12.6, ~30 MB of
WebAssembly — is fetched from jsDelivr at run time, only when a film's sound
needs decoding (`src/utils/filmSound.js`).
