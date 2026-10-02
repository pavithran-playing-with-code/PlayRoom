#!/usr/bin/env node
/**
 * The front door for the shared link.
 *
 * Tailscale Funnel points here and nowhere else, and share.js starts this
 * detached so it outlives the share window. It has two jobs:
 *
 *   1. while the game server is up, forward everything to it — ordinary
 *      requests and the Socket.io websocket alike
 *   2. while it is not, serve "Getting PlayRoom ready…" or "PlayRoom is
 *      closed right now"
 *
 * Why it forwards, instead of share.js re-pointing Funnel at the game:
 * changing the Funnel target leaves a moment with no serve config at all, and
 * a visitor who opens the link in that moment gets no page — the connection
 * hangs until the browser gives up with "this site can't be reached". Running
 * `tailscale funnel` in the foreground made it worse, because closing the
 * share window tore the config down and left it torn down. On a phone that is
 * the whole experience; a laptop on the tailnet often hides it, because it
 * reaches the machine directly and never goes near the public entry point.
 *
 * So the Funnel config is written once and never touched again, and this
 * server decides what a visitor sees. Ctrl+C, a closed window or a crash all
 * just mean the game port stops answering, and the closed page comes back on
 * its own.
 *
 * Which page is read from .share-state on every request, so share.js switches
 * between "starting" and "closed" by rewriting that one file.
 */
const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.argv[2] || process.env.PLACEHOLDER_PORT || 4320);
const GAME = Number(process.argv[3] || process.env.SHARE_PORT || 4333);
const STATE = path.join(ROOT, ".share-state");
const PID_FILE = path.join(ROOT, ".share-placeholder.pid");
const PAGES = {
  starting: path.join(ROOT, "offline", "starting.html"),
  closed: path.join(ROOT, "offline", "closed.html"),
};

// share.js writes "starting" before the game is up and "closed" on the way
// out. It can't write anything if the window is simply closed, though, so a
// game we have already seen running and that has now gone is "closed"
// whatever the file still says — otherwise friends sit on "getting ready…"
// for a game nobody is starting.
let sawGame = false;

function mode() {
  let m = "closed";
  try { m = fs.readFileSync(STATE, "utf8").trim(); } catch { /* defaults to closed */ }
  if (m === "starting" && sawGame) return "closed";
  return PAGES[m] ? m : "closed";
}

// The game server is behind one more hop now, so tell it who actually called
// and over what. Host is passed through untouched: server.js matches it
// against PRODUCTION_URL, and rewriting it to localhost would fail CORS on
// every POST.
function forwarded(req) {
  const h = { ...req.headers };
  const chain = h["x-forwarded-for"];
  const hop = req.socket.remoteAddress || "";
  h["x-forwarded-for"] = chain ? `${chain}, ${hop}` : hop;
  h["x-forwarded-proto"] = h["x-forwarded-proto"] || "https";
  return h;
}

function servePage(req, res) {
  if (res.headersSent || res.writableEnded) return;
  const m = mode();
  const headers = { "Cache-Control": "no-store", "Retry-After": "10" };

  // The pages poll /api/health to find out when the real game is back. Answer
  // honestly — "not yet" — so they keep waiting instead of reloading into this.
  if ((req.url || "/").startsWith("/api/") || (req.url || "/").startsWith("/socket.io")) {
    res.writeHead(503, { ...headers, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: false, status: m }));
  }

  // Every path gets the page, so a friend refreshing /lobby sees it too.
  let html;
  try { html = fs.readFileSync(PAGES[m]); } catch { html = "PlayRoom is closed right now."; }
  res.writeHead(503, { ...headers, "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

const server = http.createServer((req, res) => {
  // Lets share.js tell "our waiting room is already running" from "something
  // else has taken this port" — and, since a leftover one from an earlier run
  // may be forwarding somewhere else entirely, which port it is pointed at.
  // Never forwarded.
  if ((req.url || "/").split("?")[0] === "/__placeholder") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end(`playroom-placeholder ${GAME}`);
  }

  // No health check first: a refused connection to localhost comes back at
  // once, which makes trying it both the fastest test of "is the game up" and
  // the only one that cannot be out of date.
  const upstream = http.request(
    { host: "127.0.0.1", port: GAME, method: req.method, path: req.url, headers: forwarded(req) },
    (up) => {
      sawGame = true;
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    }
  );
  upstream.on("error", () => { req.unpipe(upstream); servePage(req, res); });
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
});

// Socket.io carries every live score, invite and presence update, so the
// upgrade has to be forwarded too. Once it is a websocket there is no HTTP
// left to parse: replay the request line and headers down a raw socket, then
// let the two ends talk.
server.on("upgrade", (req, socket, head) => {
  socket.on("error", () => socket.destroy());
  const h = forwarded(req);
  const lines = [`${req.method} ${req.url} HTTP/1.1`];
  for (const [k, v] of Object.entries(h)) {
    for (const one of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${one}`);
  }
  const preamble = lines.join("\r\n") + "\r\n\r\n";

  const up = net.connect(GAME, "127.0.0.1", () => {
    up.write(preamble);
    if (head && head.length) up.write(head);
    socket.pipe(up);
    up.pipe(socket);
  });
  // Nothing useful to say over a half-open websocket, so just close it. The
  // page notices and falls back to polling.
  up.on("error", () => socket.destroy());
});

server.listen(PORT, "127.0.0.1", () => {
  try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch { /* not critical */ }
});
