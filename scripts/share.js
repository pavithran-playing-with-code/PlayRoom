#!/usr/bin/env node
/**
 * npm run share — put this PlayRoom instance on the public internet.
 * npm run share:off — take the link completely offline (no "closed" page).
 *
 * Everything runs on THIS machine: the Express API, the built React app and
 * your local MySQL. A tunnel just forwards a public HTTPS address to
 * localhost, so friends can play and their data lands in your DB.
 *
 * Two tunnels, tried in this order:
 *   1. Tailscale Funnel        — FIXED link, https://<device>.<tailnet>.ts.net.
 *                                Used whenever Tailscale is installed and signed in.
 *   2. Cloudflare quick tunnel — random link that changes on every run. The
 *                                fallback, so sharing still works without Tailscale.
 *
 * With the fixed link, visitors never hit a raw browser error while this
 * laptop is on: they see "Getting PlayRoom ready…" while it starts or rebuilds,
 * the game while it runs, and "PlayRoom is closed" after Ctrl+C. Those two pages
 * come from scripts/placeholder.js, which keeps running after this window closes.
 */
const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");

require("dotenv").config();

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 4321;
const PH_PORT = Number(process.env.PLACEHOLDER_PORT || 4320);
const BUILD = path.join(ROOT, "build", "index.html");
const STATE = path.join(ROOT, ".share-state");
const PID_FILE = path.join(ROOT, ".share-placeholder.pid");

const line = (s = "") => console.log(s);
const die = (msg) => { line("\n❌ " + msg + "\n"); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runs(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: false });
  return !r.error && r.status === 0;
}

function portInUse(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (e) => resolve(e.code === "EADDRINUSE"));
    probe.once("listening", () => probe.close(() => resolve(false)));
    probe.listen(port);
  });
}

// ── 1a. Tailscale Funnel (the fixed link) ────────────────────────────────────
const TS_DIR = path.join(process.env.ProgramFiles || "C:\\Program Files", "Tailscale");
const TS_APP = path.join(TS_DIR, "tailscale-ipn.exe");

function findTailscale() {
  for (const c of [path.join(TS_DIR, "tailscale.exe"), "tailscale"]) if (runs(c, ["version"])) return c;
  return null;
}

function tsStatus(ts) {
  const r = spawnSync(ts, ["status", "--json"], { encoding: "utf8" });
  try { return JSON.parse(r.stdout); } catch { return null; }
}

// On Windows the Tailscale background service keeps running after the app is
// closed, but without the app it sits in "NoState" and can't serve anything.
// Start the app ourselves instead of failing with a confusing error.
async function tailscaleReady(ts) {
  let st = tsStatus(ts);
  if (st?.BackendState === "Running") return st;
  if (st?.BackendState === "NeedsLogin") {
    line("⚠️  Tailscale is installed but signed out — open the Tailscale app and sign in.");
    return null;
  }
  if (process.platform === "win32" && fs.existsSync(TS_APP)) {
    line("⏳ Starting the Tailscale app…");
    spawn(TS_APP, [], { detached: true, stdio: "ignore" }).unref();
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      st = tsStatus(ts);
      if (st?.BackendState === "Running") return st;
    }
  }
  line(`⚠️  Tailscale isn't connected (state: ${st?.BackendState || "unknown"}).`);
  return null;
}

// ── 1b. the waiting room (scripts/placeholder.js) ────────────────────────────
async function placeholderUp() {
  try {
    const r = await fetch(`http://127.0.0.1:${PH_PORT}/__placeholder`);
    return (await r.text()) === "playroom-placeholder";
  } catch { return false; }
}

// Start it detached, so it keeps serving the "closed" page after this window
// is gone. Reuse it if an earlier run already started it.
async function ensurePlaceholder() {
  if (await placeholderUp()) return true;
  if (await portInUse(PH_PORT)) return false;          // someone else owns the port
  spawn(process.execPath, [path.join(__dirname, "placeholder.js"), String(PH_PORT)], {
    cwd: ROOT, detached: true, stdio: "ignore", windowsHide: true,
  }).unref();
  for (let i = 0; i < 20; i++) {
    await sleep(150);
    if (await placeholderUp()) return true;
  }
  return false;
}

// Point the fixed link at the waiting room, showing the given page. --bg makes
// Funnel keep it up after this process exits.
function showPlaceholder(ts, state) {
  try { fs.writeFileSync(STATE, state); } catch { /* page defaults to "closed" */ }
  spawnSync(ts, ["funnel", "reset"], { stdio: "ignore" });
  spawnSync(ts, ["funnel", "--bg", String(PH_PORT)], { stdio: "ignore" });
}

// npm run share:off — fixed link fully offline, waiting room stopped.
function stopEverything() {
  const ts = findTailscale();
  if (ts) spawnSync(ts, ["funnel", "reset"], { stdio: "ignore" });
  try {
    const pid = Number(fs.readFileSync(PID_FILE, "utf8"));
    if (pid) process.kill(pid);
  } catch { /* not running */ }
  try { fs.unlinkSync(PID_FILE); } catch { /* already gone */ }
  line("\n🔌 PlayRoom's link is fully offline — no game and no \"closed\" page.");
  line("   Run npm run share to open it again.\n");
}

// ── 1c. Cloudflare quick tunnel (the fallback) ───────────────────────────────
// Preference order: a portable copy in tools/ (no admin, no PATH surprises),
// then anything installed system-wide. If neither exists we fetch the official
// single-file binary from Cloudflare's GitHub releases into tools/.
const TOOLS_DIR = path.join(ROOT, "tools");
const LOCAL_CF = path.join(TOOLS_DIR, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
const CF_DOWNLOAD = {
  win32: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
  linux: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
};

function findCloudflared() {
  if (fs.existsSync(LOCAL_CF) && runs(LOCAL_CF, ["--version"])) return LOCAL_CF;
  const systemWide = [
    "cloudflared",
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "cloudflared", "cloudflared.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "cloudflared", "cloudflared.exe"),
  ];
  for (const c of systemWide) if (runs(c, ["--version"])) return c;
  return null;
}

async function downloadCloudflared() {
  const url = CF_DOWNLOAD[process.platform];
  if (!url) die(`No cloudflared download known for platform "${process.platform}". Install it manually.`);
  line("⬇️  cloudflared not found — downloading the official binary (~50 MB, one time)");
  line(`    ${url}`);
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) die(`Download failed (HTTP ${res.status}). Check your internet connection.`);
  fs.writeFileSync(LOCAL_CF, Buffer.from(await res.arrayBuffer()));
  if (process.platform !== "win32") fs.chmodSync(LOCAL_CF, 0o755);
  if (!runs(LOCAL_CF, ["--version"])) die("Downloaded cloudflared but it would not run.");
  line("✅ cloudflared ready in tools/\n");
  return LOCAL_CF;
}

// ── 2. is the build up to date with src/? ────────────────────────────────────
function newestMtime(dir) {
  let newest = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  };
  try { walk(dir); } catch { /* missing dir */ }
  return newest;
}

function ensureBuild(fail) {
  const built = fs.existsSync(BUILD) ? fs.statSync(BUILD).mtimeMs : 0;
  const src = Math.max(newestMtime(path.join(ROOT, "src")), newestMtime(path.join(ROOT, "public")));
  if (built && built >= src) { line("✅ Build is up to date"); return; }
  line(built ? "🔨 Code changed since last build — rebuilding…" : "🔨 No build found — building…");
  const r = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit", shell: true });
  if (r.status !== 0) fail("Build failed. Fix the errors above, then run `npm run share` again.");
}

// ── 3. server readiness ──────────────────────────────────────────────────────
// Checked BEFORE we spawn: otherwise waitForServer() happily gets a 200 from
// whatever is already on the port and hides that our own server just died of
// EADDRINUSE. (A stray `node server.js` from VS Code's F5 causes exactly that.)
async function waitForServer(hasDied, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (hasDied && hasDied()) return false;
    try {
      const res = await fetch(`http://localhost:${PORT}/api/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  return false;
}

function announce(url, fixed) {
  line("\n══════════════════════════════════════════════");
  line("  🎮  SHARE THIS LINK WITH YOUR FRIENDS");
  line("");
  line("      " + url);
  line("");
  line(fixed
    ? "  This link never changes — send it once and it\n  works every time you run npm run share."
    : "  This link changes every run — send the new one\n  each time. (Install Tailscale for a fixed link.)");
  line("  Their accounts and scores save to YOUR MySQL.");
  line("  Keep this window open and your PC awake.");
  line("  Press Ctrl+C here to close PlayRoom.");
  line("══════════════════════════════════════════════\n");
}

(async () => {
  if (process.argv[2] === "stop") { stopEverything(); return; }

  line("\n──────────────────────────────────────────────");
  line("  PlayRoom — going public");
  line("──────────────────────────────────────────────\n");

  // Pick the tunnel first. The fixed link has to be known before the server
  // starts, because the server only accepts requests from origins it trusts.
  const ts = findTailscale();
  let fixedUrl = null;
  if (ts) {
    const st = await tailscaleReady(ts);
    const host = st?.Self?.DNSName?.replace(/\.$/, "");
    if (host) fixedUrl = `https://${host}`;
  }

  let cf = null;
  let waitingRoom = false;
  if (fixedUrl) {
    line(`✅ Tailscale connected — fixed link: ${fixedUrl}`);
    waitingRoom = await ensurePlaceholder();
    if (waitingRoom) {
      showPlaceholder(ts, "starting");
      line("🪧 Anyone opening the link right now sees \"Getting PlayRoom ready…\"");
    } else {
      line(`⚠️  Couldn't start the waiting-room page (port ${PH_PORT} is busy) — carrying on without it.`);
    }
  } else {
    if (ts) line("↪️  Using a Cloudflare link instead (it changes every run).");
    cf = findCloudflared();
    if (cf) line("✅ cloudflared found");
    else cf = await downloadCloudflared();
  }

  // From here on, bailing out should leave friends a "closed" page, not the
  // "getting ready" one forever.
  const fail = (msg) => {
    if (waitingRoom) showPlaceholder(ts, "closed");
    die(msg);
  };

  ensureBuild(fail);

  if (await portInUse(PORT)) {
    fail(`Port ${PORT} is already in use.

   Something is already listening there - most likely 'node server.js'
   from VS Code's Run button (F5) or another terminal, or an earlier
   'npm run share'. Stop it with Ctrl+C, then run 'npm run share' again.
   This script starts the server itself.`);
  }

  // ── server ──
  // NODE_ENV=production makes server.js serve build/ (one port, one URL).
  // SHARE_MODE=1 lets CORS accept random trycloudflare.com hostnames, and
  // PRODUCTION_URL tells it to trust the fixed Tailscale link. All set here, so
  // VS Code's debug launcher (which injects NODE_ENV=development, and which
  // dotenv will not override) can't win, and .env never needs editing.
  const server = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      SHARE_MODE: "1",
      PORT: String(PORT),
      ...(fixedUrl ? { PRODUCTION_URL: fixedUrl } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.stdout.write(d));
  server.stderr.on("data", (d) => process.stderr.write(d));

  let serverDied = false;
  server.on("exit", () => { serverDied = true; });

  if (!(await waitForServer(() => serverDied))) {
    server.kill();
    fail(`Server never came up on port ${PORT}. Is MySQL running? Is that port already in use?`);
  }
  line(`✅ Server ready on http://localhost:${PORT}`);

  // ── tunnel ──
  line("🌍 Opening public link…\n");
  let tunnel;
  if (fixedUrl) {
    // Swap the waiting room out for the game.
    spawnSync(ts, ["funnel", "reset"], { stdio: "ignore" });
    tunnel = spawn(ts, ["funnel", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
    const host = new URL(fixedUrl).host;
    let announced = false, askedApproval = false;
    const scan = (buf) => {
      const text = String(buf);
      // First run ever: Tailscale asks the account owner to switch Funnel on.
      const approve = text.match(/https:\/\/login\.tailscale\.com\/f\/funnel\S*/);
      if (approve && !askedApproval) {
        askedApproval = true;
        line("👉 One-time step: open this link and click Enable:\n     " + approve[0]);
        line("   This window carries on by itself once you approve.\n");
      }
      if (!announced && text.includes(host)) { announced = true; announce(fixedUrl, true); }
    };
    tunnel.stdout.on("data", scan);
    tunnel.stderr.on("data", scan);
  } else {
    tunnel = spawn(cf, ["tunnel", "--url", `http://localhost:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
    let announced = false;
    const scan = (buf) => {
      const m = String(buf).match(/https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/);
      if (m && !announced) { announced = true; announce(m[0], false); }
    };
    tunnel.stdout.on("data", scan);
    tunnel.stderr.on("data", scan);
  }

  // ── shutdown ──
  // Ctrl+C, closing this window, or the server dying all end up here.
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    line("\n\n🛑 Closing PlayRoom…");
    try { tunnel.kill(); } catch { /* already gone */ }
    try { server.kill(); } catch { /* already gone */ }
    if (fixedUrl) {
      if (await ensurePlaceholder()) {
        showPlaceholder(ts, "closed");
        line("🪧 Friends opening the link now see \"PlayRoom is closed right now\".");
        line("   (npm run share:off takes the link fully offline.)");
      } else {
        spawnSync(ts, ["funnel", "reset"], { stdio: "ignore" });
      }
    }
    setTimeout(() => process.exit(0), 300);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGHUP", shutdown);      // Windows: the console window was closed
  server.on("exit", shutdown);
  tunnel.on("exit", shutdown);
})();
