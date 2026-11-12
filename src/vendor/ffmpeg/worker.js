/* eslint-disable */
// ffmpeg.wasm 0.12.10 (@ffmpeg/ffmpeg, MIT, github.com/ffmpegwasm/ffmpeg.wasm), copied in: see README.
import { CORE_URL, FFMessageType } from "./const.js";
import { ERROR_UNKNOWN_MESSAGE_TYPE, ERROR_NOT_LOADED, ERROR_IMPORT_FAILURE, } from "./errors.js";
let ffmpeg;
// PlayRoom (the one change here beyond the README's): a film mounted with
// WORKERFS was read 32 KB at a time, each a blocking read of its own — some
// 200 of them for 10 s of an ordinary film, and on a phone every one costs.
// It is read a megabyte at a time instead and the last few kept, so the
// file's header and index aren't fetched again for every piece.
const io = { n: 0, bytes: 0, ms: 0, off: false };
const BITE = 1 << 20, KEEP = 12;
const biteReads = (core) => {
    const W = core.FS.filesystems.WORKERFS;
    if (!W || !W.stream_ops || W.__pr)
        return;
    W.__pr = true;
    const reader = new FileReaderSync();
    const plain = W.stream_ops.read;
    W.stream_ops.read = (stream, buffer, offset, length, position) => {
        const node = stream.node, size = node.size;
        if (io.off || !node.contents || typeof node.contents.slice !== "function") {
            const t0 = performance.now();
            const r = plain(stream, buffer, offset, length, position);
            io.n++; io.bytes += r; io.ms += performance.now() - t0;
            return r;
        }
        if (position >= size)
            return 0;
        const end = Math.min(size, position + length);
        const bites = node.__bites || (node.__bites = new Map());
        let done = 0;
        while (position + done < end) {
            const p = position + done, k = Math.floor(p / BITE);
            let b = bites.get(k);
            if (b) { bites.delete(k); bites.set(k, b); }
            else {
                const t0 = performance.now();
                b = new Uint8Array(reader.readAsArrayBuffer(node.contents.slice(k * BITE, Math.min(size, (k + 1) * BITE))));
                io.n++; io.bytes += b.length; io.ms += performance.now() - t0;
                bites.set(k, b);
                if (bites.size > KEEP) bites.delete(bites.keys().next().value);
            }
            const from = p - k * BITE, n = Math.min(b.length - from, end - p);
            if (n <= 0)
                break;
            buffer.set(b.subarray(from, from + n), offset + done);
            done += n;
        }
        return done;
    };
};
const load = async ({ coreURL: _coreURL, wasmURL: _wasmURL, workerURL: _workerURL, }) => {
    const first = !ffmpeg;
    try {
        if (!_coreURL)
            _coreURL = CORE_URL;
        // when web worker type is `classic`.
        importScripts(_coreURL);
    }
    catch {
        if (!_coreURL)
            _coreURL = CORE_URL.replace('/umd/', '/esm/');
        // when web worker type is `module`.
        self.createFFmpegCore = (await import(
        /* webpackIgnore: true */ /* @vite-ignore */ _coreURL)).default;
        if (!self.createFFmpegCore) {
            throw ERROR_IMPORT_FAILURE;
        }
    }
    const coreURL = _coreURL;
    const wasmURL = _wasmURL ? _wasmURL : _coreURL.replace(/.js$/g, ".wasm");
    const workerURL = _workerURL
        ? _workerURL
        : _coreURL.replace(/.js$/g, ".worker.js");
    ffmpeg = await self.createFFmpegCore({
        // Fix `Overload resolution failed.` when using multi-threaded ffmpeg-core.
        // Encoded wasmURL and workerURL in the URL as a hack to fix locateFile issue.
        mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL }))}`,
    });
    biteReads(ffmpeg);
    ffmpeg.setLogger((data) => self.postMessage({ type: FFMessageType.LOG, data }));
    ffmpeg.setProgress((data) => self.postMessage({
        type: FFMessageType.PROGRESS,
        data,
    }));
    return first;
};
const exec = ({ args, timeout = -1 }) => {
    // PlayRoom: ["-pr-bite", "0" | "1"] turns the big-bite reading off or on (tests compare the two)
    if (args[0] === "-pr-bite") { io.off = args[1] === "0"; return 0; }
    io.n = 0; io.bytes = 0; io.ms = 0;
    ffmpeg.setTimeout(timeout);
    ffmpeg.exec(...args);
    const ret = ffmpeg.ret;
    ffmpeg.reset();
    self.postMessage({ type: FFMessageType.LOG, data: { type: "io", message: `pr-io ${io.n} ${io.bytes} ${Math.round(io.ms)}` } });
    return ret;
};
const writeFile = ({ path, data }) => {
    ffmpeg.FS.writeFile(path, data);
    return true;
};
const readFile = ({ path, encoding }) => ffmpeg.FS.readFile(path, { encoding });
// TODO: check if deletion works.
const deleteFile = ({ path }) => {
    ffmpeg.FS.unlink(path);
    return true;
};
const rename = ({ oldPath, newPath }) => {
    ffmpeg.FS.rename(oldPath, newPath);
    return true;
};
// TODO: check if creation works.
const createDir = ({ path }) => {
    ffmpeg.FS.mkdir(path);
    return true;
};
const listDir = ({ path }) => {
    const names = ffmpeg.FS.readdir(path);
    const nodes = [];
    for (const name of names) {
        const stat = ffmpeg.FS.stat(`${path}/${name}`);
        const isDir = ffmpeg.FS.isDir(stat.mode);
        nodes.push({ name, isDir });
    }
    return nodes;
};
// TODO: check if deletion works.
const deleteDir = ({ path }) => {
    ffmpeg.FS.rmdir(path);
    return true;
};
const mount = ({ fsType, options, mountPoint }) => {
    const str = fsType;
    const fs = ffmpeg.FS.filesystems[str];
    if (!fs)
        return false;
    ffmpeg.FS.mount(fs, options, mountPoint);
    return true;
};
const unmount = ({ mountPoint }) => {
    ffmpeg.FS.unmount(mountPoint);
    return true;
};
self.onmessage = async ({ data: { id, type, data: _data }, }) => {
    const trans = [];
    let data;
    try {
        if (type !== FFMessageType.LOAD && !ffmpeg)
            throw ERROR_NOT_LOADED; // eslint-disable-line
        switch (type) {
            case FFMessageType.LOAD:
                data = await load(_data);
                break;
            case FFMessageType.EXEC:
                data = exec(_data);
                break;
            case FFMessageType.WRITE_FILE:
                data = writeFile(_data);
                break;
            case FFMessageType.READ_FILE:
                data = readFile(_data);
                break;
            case FFMessageType.DELETE_FILE:
                data = deleteFile(_data);
                break;
            case FFMessageType.RENAME:
                data = rename(_data);
                break;
            case FFMessageType.CREATE_DIR:
                data = createDir(_data);
                break;
            case FFMessageType.LIST_DIR:
                data = listDir(_data);
                break;
            case FFMessageType.DELETE_DIR:
                data = deleteDir(_data);
                break;
            case FFMessageType.MOUNT:
                data = mount(_data);
                break;
            case FFMessageType.UNMOUNT:
                data = unmount(_data);
                break;
            default:
                throw ERROR_UNKNOWN_MESSAGE_TYPE;
        }
    }
    catch (e) {
        self.postMessage({
            id,
            type: FFMessageType.ERROR,
            data: e.toString(),
        });
        return;
    }
    if (data instanceof Uint8Array) {
        trans.push(data.buffer);
    }
    self.postMessage({ id, type, data }, trans);
};
