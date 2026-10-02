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
 * the game while it runs, and "PlayRoom is closed" after Ctrl+C. All three come
 * from scripts/placeholder.js, which Funnel points at permanently and which
 * forwards to the game server whenever that is up. Funnel's own config is
 * written once and never swapped — swapping it leaves a gap in which the link
 * does not fail politely, it hangs, and the phone says "site can't be reached".
 */
const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");
const dns = require("dns");
const https = require("https");

require("dotenv").config();

const ROOT = path.join(__dirname, "..");
// The shared server gets its own port, so the local dev backend (npm start's
// proxy target and VS Code's F5, on PORT / 4321) can keep running alongside it.
// Both use the same MySQL database.
const PORT = Number(process.env.SHARE_PORT || 4333);
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

// Windows runs Tailscale as two things: a background service (tailscaled,
// which does the actual networking) and a tray app. Only the service can serve
// a Funnel.
//
// This used to start the tray app and wait a minute and a half. When the
// service is stopped — which is the usual reason the CLI says it cannot
// connect — that wait was for something nobody had started, so it always
// timed out and always fell back to a random Cloudflare link. Starting the
// service takes about two seconds and does not need admin rights.
const svcState = () => {
  const r = spawnSync("powershell", ["-NoProfile", "-Command",
    "(Get-Service -Name Tailscale -ErrorAction SilentlyContinue).Status"], { encoding: "utf8" });
  return (r.stdout || "").trim();          // "Running" | "Stopped" | ""
};

function startService() {
  const r = spawnSync("powershell", ["-NoProfile", "-Command",
    "try { Start-Service -Name Tailscale -ErrorAction Stop; 'ok' } catch { $_.Exception.Message }"],
    { encoding: "utf8" });
  return (r.stdout || "").trim();
}

// Poll fast and give up early: a working Tailscale answers in a second or two,
// and a broken one will not start answering because we waited longer.
async function settle(ts, seconds, note) {
  for (let i = 0; i < seconds * 4; i++) {
    const st = tsStatus(ts);
    if (st?.BackendState === "Running") return st;
    if (st?.BackendState === "NeedsLogin") return st;
    if (note && i === 8) line(note);
    await sleep(250);
  }
  return tsStatus(ts);
}

async function tailscaleReady(ts) {
  let st = tsStatus(ts);
  if (st?.BackendState === "Running") return st;
  if (st?.BackendState === "NeedsLogin") {
    line("⚠️  Tailscale is installed but signed out — open the Tailscale app and sign in.");
    return null;
  }

  if (process.platform === "win32") {
    // The service first: without it the CLI cannot talk to anything.
    const svc = svcState();
    if (svc && svc !== "Running") {
      line("⏳ Tailscale's service is stopped — starting it…");
      const out = startService();
      if (out !== "ok") {
        line(`⚠️  Couldn't start the Tailscale service: ${out}`);
        line("   Start it yourself with:  Start-Service Tailscale");
        line("   (or open the Tailscale app once), then run npm run share again.");
        return null;
      }
      st = await settle(ts, 12);
      if (st?.BackendState === "Running") { line("✅ Tailscale is up."); return st; }
    }

    // Service is up but the backend still isn't: the tray app owns the login
    // session, so give it a nudge.
    if (st?.BackendState !== "Running" && fs.existsSync(TS_APP)) {
      line("⏳ Starting the Tailscale app…");
      spawn(TS_APP, [], { detached: true, stdio: "ignore" }).unref();
      st = await settle(ts, 20, "   …still waiting for Tailscale");
      if (st?.BackendState === "Running") { line("✅ Tailscale is up."); return st; }
    }
  }

  if (st?.BackendState === "NeedsLogin") {
    line("⚠️  Tailscale needs you to sign in — open the Tailscale app.");
    return null;
  }
  line(`⚠️  Tailscale isn't connected (state: ${st?.BackendState || "service not answering"}).`);
  line("   Try:  Start-Service Tailscale");
  line("   then run npm run share again to get your fixed link back.");
  return null;
}

// ── 1b. the waiting room (scripts/placeholder.js) ────────────────────────────
// Which game port the running waiting room forwards to, or null if whatever
// is on that port isn't ours.
async function placeholderTarget() {
  try {
    const [tag, port] = (await (await fetch(`http://127.0.0.1:${PH_PORT}/__placeholder`)).text()).split(" ");
    // -1 is one left over from before it forwarded at all: still ours, still
    // needs replacing.
    return tag === "playroom-placeholder" ? Number(port) || -1 : null;
  } catch { return null; }
}

function stopPlaceholder() {
  try { process.kill(Number(fs.readFileSync(PID_FILE, "utf8"))); } catch { /* already gone */ }
}

// Start it detached, so it keeps serving the "closed" page after this window
// is gone. Reuse the one from an earlier run — unless that run used a
// different SHARE_PORT, in which case it is forwarding to a port with nothing
// on it and every visitor would see "closed" while the game is right here.
async function ensurePlaceholder() {
  const running = await placeholderTarget();
  if (running === PORT) return true;
  if (running !== null) {
    stopPlaceholder();
    for (let i = 0; i < 20 && (await portInUse(PH_PORT)); i++) await sleep(150);
  } else if (await portInUse(PH_PORT)) {
    return false;                                      // someone else owns the port
  }
  spawn(process.execPath, [path.join(__dirname, "placeholder.js"), String(PH_PORT), String(PORT)], {
    cwd: ROOT, detached: true, stdio: "ignore", windowsHide: true,
  }).unref();
  for (let i = 0; i < 20; i++) {
    await sleep(150);
    if ((await placeholderTarget()) === PORT) return true;
  }
  return false;
}

// Which page the waiting room shows. It re-reads this on every request, so
// this is the whole of "switch to the closed page".
function setState(state) {
  try { fs.writeFileSync(STATE, state); } catch { /* page defaults to "closed" */ }
}

// Write the Funnel config. Also the repair when a public entry point has gone
// bad: writing it again re-registers the link with all of them.
function applyFunnel(ts) {
  const r = spawnSync(ts, ["funnel", "--bg", String(PH_PORT)], { encoding: "utf8" });
  // First run ever: Tailscale asks the account owner to switch Funnel on.
  const approve = ((r.stdout || "") + (r.stderr || "")).match(/https:\/\/login\.tailscale\.com\/f\/funnel\S*/);
  if (approve) {
    line("👉 One-time step: open this link and click Enable:\n     " + approve[0]);
    line("   Then run npm run share again.\n");
    return false;
  }
  return r.status === 0;
}

// Funnel points at the waiting room and stays there for good — the waiting
// room forwards to the game. Don't rewrite a config that is already right:
// every write is a few seconds in which the public link serves nothing.
function ensureFunnel(ts) {
  const want = `http://127.0.0.1:${PH_PORT}`;
  try {
    const cfg = JSON.parse(spawnSync(ts, ["serve", "status", "--json"], { encoding: "utf8" }).stdout);
    const web = Object.values(cfg?.Web || {})[0];
    const funnelOn = Object.values(cfg?.AllowFunnel || {}).some(Boolean);
    if (funnelOn && web?.Handlers?.["/"]?.Proxy === want) return true;
  } catch { /* no config yet, or an old Tailscale without --json */ }
  return applyFunnel(ts);
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

// ── 1c. is the link reachable from outside? ──────────────────────────────────
// Opening it on this laptop proves nothing. The laptop is on the tailnet, so
// the hostname resolves to the machine itself and the request never goes near
// Tailscale's public entry points. A phone has no such shortcut — which is how
// the link could work here and show "site can't be reached" there. So ask
// public DNS where the rest of the world gets sent, and try those addresses.
async function publicAddresses(host) {
  const r = new dns.promises.Resolver();
  r.setServers(["1.1.1.1", "8.8.8.8"]);                 // deliberately not MagicDNS
  const [v4, v6] = await Promise.all([
    r.resolve4(host).catch(() => []),
    r.resolve6(host).catch(() => []),
  ]);
  return { v4, v6 };
}

function reaches(ip, host, family) {
  return new Promise((resolve) => {
    const req = https.request(
      { host: ip, family, servername: host, port: 443, path: "/api/health",
        headers: { Host: host }, timeout: 8000 },
      (res) => { res.resume(); resolve(res.statusCode === 200); }
    );
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
    req.end();
  });
}

// Whether this machine has IPv6 at all. Without checking, a failed IPv6 test
// would blame Tailscale for a route the local network simply doesn't have.
function hasIPv6() {
  return new Promise((resolve) => {
    const s = net.connect({ host: "2606:4700:4700::1111", port: 443, family: 6 });
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(2500, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

// Which of the published addresses are not serving the game.
async function failing(host) {
  const { v4 } = await publicAddresses(host);
  const ok = await Promise.all(v4.map((ip) => reaches(ip, host, 4)));
  return v4.filter((_, i) => !ok[i]);
}

// Poll until every published IPv4 address serves the game, so the link we print
// is one a friend can actually open. It normally takes a second or two.
//
// One address going bad while the others are fine is a real state, not a
// theoretical one: the entry point still accepts the connection and then drops
// the TLS handshake, which a browser reports as "this site can't be reached"
// without trying any of the others. Writing the Funnel config again clears it.
async function waitForPublic(host, ts) {
  const { v4, v6 } = await publicAddresses(host);
  if (!v4.length && !v6.length) return { verdict: "unknown" };
  let repaired = false;

  for (let i = 0; i < 30; i++) {
    const ok = await Promise.all(v4.map((ip) => reaches(ip, host, 4)));
    if (v4.length && ok.every(Boolean)) {
      const v6ok = v6.length && (await hasIPv6())
        ? (await Promise.all(v6.map((ip) => reaches(ip, host, 6)))).every(Boolean)
        : null;                                         // null: couldn't tell
      return { verdict: "ok", v6ok };
    }
    // Give a fresh config a few seconds to reach every entry point before
    // deciding one of them is stuck.
    if (i === 6 && !repaired) { repaired = true; applyFunnel(ts); }
    await sleep(1000);
  }
  return { verdict: "unreachable" };
}

// ── 1d. Cloudflare quick tunnel (the fallback) ───────────────────────────────
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
    setState("starting");
    waitingRoom = await ensurePlaceholder();
    if (waitingRoom && ensureFunnel(ts)) {
      line("🪧 Anyone opening the link right now sees \"Getting PlayRoom ready…\"");
    } else {
      line(waitingRoom
        ? "⚠️  Couldn't point the fixed link at this machine."
        : `⚠️  Couldn't start the waiting room — is port ${PH_PORT} busy?`);
      line("   Falling back to a Cloudflare link so the game is still shareable.");
      waitingRoom = false;
      fixedUrl = null;
    }
  }

  if (!fixedUrl) {
    if (ts) line("↪️  Using a Cloudflare link instead (it changes every run).");
    cf = findCloudflared();
    if (cf) line("✅ cloudflared found");
    else cf = await downloadCloudflared();
  }

  // From here on, bailing out should leave friends a "closed" page, not the
  // "getting ready" one forever.
  const fail = (msg) => {
    if (waitingRoom) setState("closed");
    die(msg);
  };

  ensureBuild(fail);

  if (await portInUse(PORT)) {
    fail(`Port ${PORT} is already in use.

   Most likely an earlier 'npm run share' is still running. Stop it with
   Ctrl+C, then run 'npm run share' again. (The local dev backend on 4321
   is fine to leave running.) To use a different port, set SHARE_PORT in .env.`);
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
  let tunnel = null, watch = null;
  if (fixedUrl) {
    // Nothing to switch over: Funnel already points at the waiting room, and
    // the waiting room started forwarding to the game the moment it came up.
    // All that's left is to confirm the outside world can see it, because
    // this laptop's own view of the link goes a different way round.
    const host = new URL(fixedUrl).host;
    const { verdict, v6ok } = await waitForPublic(host, ts);

    // An entry point can go bad hours into a session, and this laptop is the
    // last place that would notice: it reaches the game over the tailnet,
    // never through the public ones. So keep checking on the phone's behalf.
    watch = setInterval(async () => {
      const bad = await failing(host);
      if (!bad.length) return;
      if (!(await failing(host)).length) return;       // a blip, not a fault
      line("🔧 Part of the public link stopped answering — re-registering it…");
      applyFunnel(ts);
    }, 120000);
    watch.unref();

    if (verdict === "unreachable") {
      line("⚠️  The link works on this laptop but nothing outside can reach it yet.");
      line("   Check Funnel is enabled for this device:");
      line("     https://login.tailscale.com/admin/machines  →  this machine  →  Funnel");
      line("   The game is still playable here: http://localhost:" + PORT + "\n");
    } else if (verdict === "unknown") {
      line("ℹ️  Couldn't look up the public address (DNS blocked?) — printing the link anyway.");
    } else if (v6ok === false) {
      line("⚠️  Reachable over IPv4 but not IPv6. A phone on mobile data usually tries");
      line("   IPv6 first, so if it says \"site can't be reached\", turn Wi-Fi on.");
    }
    announce(fixedUrl, true);
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
    clearInterval(watch);
    try { tunnel?.kill(); } catch { /* already gone */ }
    try { server.kill(); } catch { /* already gone */ }
    if (fixedUrl) {
      // Only the page changes. Funnel keeps pointing at the waiting room, so
      // there is never a moment where the link answers with nothing — and if
      // this window is closed outright and none of this runs, the waiting room
      // sees the game port stop answering and shows the same page anyway.
      setState("closed");
      line("🪧 Friends opening the link now see \"PlayRoom is closed right now\".");
      line("   (npm run share:off takes the link fully offline.)");
    }
    setTimeout(() => process.exit(0), 300);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGHUP", shutdown);      // Windows: the console window was closed
  server.on("exit", shutdown);
  tunnel?.on("exit", shutdown);   // only the Cloudflare fallback has one
})();
