/* eslint-disable */
// ffmpeg.wasm 0.12.10 (@ffmpeg/ffmpeg, MIT, github.com/ffmpegwasm/ffmpeg.wasm), copied in: see README.
/**
 * Generate an unique message ID.
 */
export const getMessageID = (() => {
    let messageID = 0;
    return () => messageID++;
})();
