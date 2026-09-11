#!/usr/bin/env node
/**
 * The page friends see when the game isn't running: "Getting PlayRoom ready…"
 * while `npm run share` starts or rebuilds, and "PlayRoom is closed right now"
 * after it stops.
 *
 * Why a separate little server: on Windows, Tailscale Funnel can only serve a
 * file directly when run as Administrator, but it can always forward to a
 * port. So this server runs on its own port — started detached by share.js so
 * it outlives the share window — and Funnel is pointed at it whenever the game
 * itself is down.
 *
 * The current mode is read from .share-state on every request, so share.js
 * flips between "starting" and "closed" by rewriting that one file.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.argv[2] || process.env.PLACEHOLDER_PORT || 4320);
const STATE = path.join(ROOT, ".share-state");
const PID_FILE = path.join(ROOT, ".share-placeholder.pid");
const PAGES = {
  starting: path.join(ROOT, "offline", "starting.html"),
  closed: path.join(ROOT, "offline", "closed.html"),
};

function mode() {
  try {
    const m = fs.readFileSync(STATE, "utf8").trim();
    return PAGES[m] ? m : "closed";
  } catch { return "closed"; }
}

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];

  // Lets share.js tell "our waiting room is already running" from "something
  // else has taken this port".
  if (url === "/__placeholder") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("playroom-placeholder");
  }

  const m = mode();
  const headers = { "Cache-Control": "no-store", "Retry-After": "10" };

  // The pages poll /api/health to find out when the real game is back. Answer
  // honestly — "not yet" — so they keep waiting instead of reloading into this.
  if (url.startsWith("/api/") || url.startsWith("/socket.io")) {
    res.writeHead(503, { ...headers, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: false, status: m }));
  }

  // Every path gets the page, so a friend refreshing /lobby sees it too.
  let html;
  try { html = fs.readFileSync(PAGES[m]); } catch { html = "PlayRoom is closed right now."; }
  res.writeHead(503, { ...headers, "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});

server.listen(PORT, "127.0.0.1", () => {
  try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch { /* not critical */ }
});
