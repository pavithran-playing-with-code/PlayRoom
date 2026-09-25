// scripts/e2e.mjs — two (or four) real players, a real backend, a real socket.
//
// Starts an actual match and fails on any console error from any player's tab.
// That is the check that was missing when "socket.on is not a function" shipped:
// every unit test passed, the build compiled, and the room went blank the
// instant a match began, because nothing had ever started one.
//
// Running it:
//   1. a local MySQL with the schema, and .env pointing at it
//   2. PORT=4399 node server.js
//   3. REACT_APP_API_URL=http://127.0.0.1:4399 BUILD_PATH=<dir> npx react-scripts build
//   4. node scripts/e2e.mjs <dir> <screenshot-prefix> [free|teams]
//
// It creates throwaway accounts and rooms, so point it at a development
// database, never production.
//
// Each player gets its own browser context: one profile means shared
// localStorage, so every tab would hold whichever token was written last and
// the "four players" would all be the same person.
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.argv[2], SHOTS = process.argv[3], MODE = process.argv[4] || "free";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WEB = 4700, API = "http://127.0.0.1:4399";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };

const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(ROOT, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(WEB, r));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--remote-debugging-port=9360",
  "--user-data-dir=" + process.env.TEMP + "\\cdp-e2e", "about:blank"], { stdio: "ignore" });

let ws, id = 0, fails = 0;
const pending = new Map(), sessions = new Map(), errors = [];
const raw = (m, p = {}, sessionId) => new Promise((res) => {
  const n = ++id; pending.set(n, res);
  ws.send(JSON.stringify({ id: n, method: m, params: p, ...(sessionId ? { sessionId } : {}) }));
});
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

// one browser tab per player, each with its own console-error log
async function newPlayer(name) {
  // A browser context per player: same profile means shared localStorage, so
  // every tab would end up holding whichever token was written last and the
  // "four players" would all be the same person.
  const { result: ctx } = await raw("Target.createBrowserContext", {});
  const { result: t } = await raw("Target.createTarget", { url: "about:blank", browserContextId: ctx.browserContextId });
  const { result: s } = await raw("Target.attachToTarget", { targetId: t.targetId, flatten: true });
  const sid = s.sessionId;
  sessions.set(name, sid);
  await raw("Runtime.enable", {}, sid);
  await raw("Log.enable", {}, sid);
  await raw("Page.enable", {}, sid);
  return sid;
}
const js = async (sid, expr) => {
  const r = await raw("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sid);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};
const go = async (sid, url) => { await raw("Page.navigate", { url: `http://127.0.0.1:${WEB}${url}` }, sid); await sleep(2200); };
const shot = async (sid, n) => {
  const { result } = await raw("Page.captureScreenshot", { format: "png" }, sid);
  fs.writeFileSync(`${SHOTS}-${n}.png`, Buffer.from(result.data, "base64"));
};

// Register straight against the API, so the test isn't also testing the form.
async function signUp(sid, username) {
  return js(sid, `(async () => {
    const body = { username: ${JSON.stringify(username)}, email: ${JSON.stringify(username + "@e2e.test")}, password: "Passw0rd!23" };
    let r = await fetch("${API}/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let d = await r.json();
    if (!d.success) {
      r = await fetch("${API}/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: body.username, password: body.password }) });
      d = await r.json();
    }
    if (!d.token) return "no token: " + JSON.stringify(d).slice(0, 200);
    localStorage.setItem("pr_token", d.token);
    return "ok";
  })()`);
}
const apiCall = (sid, method, url, body) => js(sid, `(async () => {
  const r = await fetch("${API}${url}", { method: ${JSON.stringify(method)},
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("pr_token") },
    ${body ? `body: JSON.stringify(${JSON.stringify(body)})` : "body: undefined"} });
  return { status: r.status, body: await r.json() };
})()`);

try {
  let t;
  for (let i = 0; i < 60 && !t; i++) {
    try { t = (await (await fetch("http://127.0.0.1:9360/json/version")).json()); } catch { await sleep(250); }
  }
  ws = new WebSocket((await (await fetch("http://127.0.0.1:9360/json/version")).json()).webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    // any console error or uncaught exception, from any tab, is a failure
    if (d.method === "Runtime.exceptionThrown") {
      const e = d.params?.exceptionDetails;
      errors.push(`[uncaught] ${e?.exception?.description || e?.text || "?"}`.split("\n")[0]);
    }
    if (d.method === "Runtime.consoleAPICalled" && d.params?.type === "error") {
      errors.push("[console.error] " + (d.params.args?.[0]?.value || "").toString().slice(0, 160));
    }
    if (d.method === "Log.entryAdded" && d.params?.entry?.level === "error") {
      errors.push("[log] " + (d.params.entry.text || "").slice(0, 160));
    }
  });

  const stamp = Date.now().toString(36).slice(-5);
  const names = (process.env.E2E_USERS || "").split(",").filter(Boolean).length
    ? process.env.E2E_USERS.split(",")
    : MODE === "teams"
      ? [`t1${stamp}`, `t2${stamp}`, `t3${stamp}`, `t4${stamp}`]
      : MODE === "spectate"
        ? [`s1${stamp}`, `s2${stamp}`, `s3${stamp}`]
        : [`p1${stamp}`, `p2${stamp}`];
  const sids = [];
  for (const n of names) {
    const sid = await newPlayer(n);
    await go(sid, "/login");
    const r = await signUp(sid, n);
    if (r !== "ok") { check(`sign in ${n}`, false, r); throw new Error("cannot sign in"); }
    sids.push(sid);
  }
  check(`${names.length} players signed in`, sids.length === names.length);

  // host makes the room
  const seats = MODE === "teams" ? 4 : 2;
  const watcherAt = MODE === "spectate" ? sids.length - 1 : -1;   // last tab watches
  const made = await apiCall(sids[0], "POST", "/api/rooms",
    { game_slug: "numbers", max_players: seats, duration_seconds: 120, ...(MODE === "teams" ? { mode: "teams" } : {}) });
  check("room created", made.status === 201, JSON.stringify(made.body).slice(0, 140));
  const code = made.body?.room?.room_code;
  if (!code) throw new Error("no room code");
  if (MODE === "teams") check("room is a team room", made.body.room.mode === "teams", made.body.room.mode);

  // everyone else joins
  for (let i = 1; i < sids.length; i++) {
    if (i === watcherAt) continue;                    // the watcher comes in later, mid-match
    const j = await apiCall(sids[i], "POST", "/api/rooms/join", { room_code: code });
    check(`${names[i]} joined`, j.body?.success === true, JSON.stringify(j.body).slice(0, 120));
  }

  if (MODE === "teams") {
    // refuse to start with nobody on a side
    const early = await apiCall(sids[0], "PATCH", `/api/rooms/${code}/start`);
    check("won't start with no teams picked", early.status === 409, early.body?.message);
    // two a side
    for (let i = 0; i < 4; i++) {
      const r = await apiCall(sids[i], "PATCH", `/api/rooms/${code}/team`, { team: i < 2 ? 1 : 2 });
      check(`${names[i]} joined team ${i < 2 ? 1 : 2}`, r.body?.success === true, JSON.stringify(r.body).slice(0, 120));
    }
    // everyone on one side is still not a match
    await apiCall(sids[3], "PATCH", `/api/rooms/${code}/team`, { team: 1 });
    const oneSide = await apiCall(sids[0], "PATCH", `/api/rooms/${code}/start`);
    check("won't start with only one team", oneSide.status === 409, oneSide.body?.message);
    await apiCall(sids[3], "PATCH", `/api/rooms/${code}/team`, { team: 2 });
  }

  // open the room in every tab, then start (the watcher isn't in it yet)
  for (let i = 0; i < sids.length; i++) {
    if (i === watcherAt) continue;
    await go(sids[i], `/room/${code}`);
  }
  errors.length = 0;                         // only judge what happens from here
  const started = await apiCall(sids[0], "PATCH", `/api/rooms/${code}/start`);
  check("host started the match", started.body?.success === true, JSON.stringify(started.body).slice(0, 140));
  await sleep(5000);

  // the board must actually be on screen for everyone
  for (let i = 0; i < sids.length; i++) {
    if (i === watcherAt) continue;
    const seen = await js(sids[i], `(() => {
      const board = document.querySelector(".gameboard");
      const stats = [...document.querySelectorAll(".gb-stat .gb-l")].map(e => e.textContent).join("|");
      return { board: !!board, painted: board ? board.getBoundingClientRect().height : 0, stats,
               bodyLen: document.body.innerText.trim().length };
    })()`);
    check(`${names[i]} sees the board`, seen.board && seen.painted > 50,
      `height ${Math.round(seen.painted)}px, stats "${seen.stats}"`);
  }
  await shot(sids[0], MODE === "teams" ? "teams-play" : "free-play");

  if (MODE === "teams") {
    const strip = await js(sids[0], `(() => {
      const t = [...document.querySelectorAll(".teamscore")].map(e => e.innerText.replace(/\\s+/g, " ").trim());
      return t;
    })()`);
    check("team totals are on screen", Array.isArray(strip) && strip.length >= 2, JSON.stringify(strip));
  }

  if (MODE === "spectate") {
    // The watcher arrives now, mid-match, exactly as the Watch button does.
    const join = await apiCall(sids[watcherAt], "POST", "/api/rooms/join", { room_code: code });
    check("watcher joined as a spectator", join.body?.as_spectator === true, JSON.stringify(join.body).slice(0, 140));
    await go(sids[watcherAt], `/room/${code}?watch=${await js(sids[0], `1`) && ""}`.replace("?watch=", "?watch=1"));
    await sleep(4000);

    const view = await js(sids[watcherAt], `(() => {
      const stat = (l) => { const s = [...document.querySelectorAll(".gb-stat")].find(x => x.querySelector(".gb-l")?.textContent === l);
        return s ? s.querySelector(".gb-v").textContent : null; };
      return { badge: document.querySelector(".gb-badge")?.textContent || "",
               quit: [...document.querySelectorAll("button")].map(b => b.textContent.trim()).find(t => /Leave|Quit/.test(t)) || "",
               moves: stat("Moves"), score: stat("Score"),
               switcher: document.querySelectorAll(".spec-switch button").length,
               tiles: document.querySelectorAll(".gameboard button").length };
    })()`);
    check("watcher is in the watch view, not playing", view.quit.includes("Leave"),
      `quit button says "${view.quit}", badge "${view.badge}"`);

    // Hammer the board. A spectator must not be able to change anything.
    await js(sids[watcherAt], `(() => {
      const b = [...document.querySelectorAll(".gameboard button")];
      for (const el of b.slice(0, 12)) el.click();
      return b.length;
    })()`);
    await sleep(1200);
    const after = await js(sids[watcherAt], `(() => {
      const stat = (l) => { const s = [...document.querySelectorAll(".gb-stat")].find(x => x.querySelector(".gb-l")?.textContent === l);
        return s ? s.querySelector(".gb-v").textContent : null; };
      return { moves: stat("Moves"), score: stat("Score") };
    })()`);
    check("clicking the board does nothing for a spectator",
      after.moves === view.moves, `moves ${view.moves} -> ${after.moves}`);

    // How fast does a move reach the watcher? Play one and time it.
    // Number Rush only scores when you tap the number it is asking for, so tap
    // that one rather than hoping a random tile counts.
    const t0 = Date.now();
    const tapped = await js(sids[0], `(() => {
      const want = document.querySelector(".nr-target, .gb-v")?.textContent?.trim();
      const btns = [...document.querySelectorAll(".gameboard button")];
      let hit = btns.find((b) => b.textContent.trim() === "1") || btns[0];
      if (hit) hit.click();
      return { want, clicked: hit ? hit.textContent.trim() : null };
    })()`);
    console.log("      player tapped:", JSON.stringify(tapped));
    let lagMs = -1;
    for (let w = 0; w < 60; w++) {
      const n = await js(sids[watcherAt], `(() => {
        const s = [...document.querySelectorAll(".gb-stat")].find(x => x.querySelector(".gb-l")?.textContent === "Score");
        return s ? s.querySelector(".gb-v").textContent : "";
      })()`);
      if (n && n !== "0") { lagMs = Date.now() - t0; break; }
      await sleep(100);
    }
    check("a move reaches the watcher quickly", lagMs >= 0 && lagMs < 1500,
      lagMs < 0 ? "never arrived within 6s" : `${lagMs}ms`);

    // And the player they are watching must not have been touched.
    const poll = await apiCall(sids[0], "GET", `/api/rooms/${code}/poll`);
    const watcherRow = (poll.body?.players || []).find((p) => p.username === names[watcherAt]);
    check("the watcher never took a seat", watcherRow && !!watcherRow.is_spectator,
      JSON.stringify(watcherRow && { u: watcherRow.username, spec: watcherRow.is_spectator, moves: watcherRow.moves }));
    await shot(sids[watcherAt], "spectating");
  }

  check("no console errors while playing", errors.length === 0, errors.slice(0, 4).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
} catch (e) {
  console.log("FAIL  harness:", e.message);
  fails++;
} finally {
  if (errors.length) { console.log("\nerrors seen:"); for (const e of [...new Set(errors)].slice(0, 10)) console.log("  " + e); }
  try { ws && ws.close(); } catch {}
  chrome.kill();
  server.close();
  process.exit(fails ? 1 : 0);
}
