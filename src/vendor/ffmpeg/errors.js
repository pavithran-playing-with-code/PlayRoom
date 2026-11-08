/* eslint-disable */
// ffmpeg.wasm 0.12.10 (@ffmpeg/ffmpeg, MIT, github.com/ffmpegwasm/ffmpeg.wasm), copied in: see README.
export const ERROR_UNKNOWN_MESSAGE_TYPE = new Error("unknown message type");
export const ERROR_NOT_LOADED = new Error("ffmpeg is not loaded, call `await ffmpeg.load()` first");
export const ERROR_TERMINATED = new Error("called FFmpeg.terminate()");
export const ERROR_IMPORT_FAILURE = new Error("failed to import ffmpeg-core.js");
