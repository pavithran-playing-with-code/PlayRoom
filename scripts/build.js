#!/usr/bin/env node
/**
 * npm run build — a production build that never takes the live site down.
 *
 * react-scripts empties build/ before writing the new one, so for the ~40 s a
 * build takes, a running `npm run share` has nothing to serve and friends get a
 * broken page. Instead we build into build-next/ and swap it into place only
 * once it has succeeded: the old version keeps serving right up to the switch,
 * and a failed build never touches the live site at all.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LIVE = path.join(ROOT, "build");
const NEXT = path.join(ROOT, "build-next");
const OLD = path.join(ROOT, "build-old");

// Windows retries these for us when a file is briefly locked.
const rm = (p) => fs.rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Windows refuses to rename a folder while a file inside it is being read — a
// friend loading the page at that exact moment — so retry briefly.
function renameWithRetry(from, to) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return; }
    catch (e) {
      if (i >= 50 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
      pause(100);
    }
  }
}

rm(NEXT);
const r = spawnSync("npx", ["react-scripts", "build"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, BUILD_PATH: NEXT },
});
if (r.status !== 0) {
  rm(NEXT);
  console.error("\n❌ Build failed — the live site was not touched.\n");
  process.exit(r.status || 1);
}

rm(OLD);
const hadLive = fs.existsSync(LIVE);
if (hadLive) renameWithRetry(LIVE, OLD);
try {
  renameWithRetry(NEXT, LIVE);
} catch (e) {
  // Never leave the site with no build at all: put the previous one back.
  if (hadLive) renameWithRetry(OLD, LIVE);
  console.error(`\n❌ Couldn't swap the new build in (${e.code}) — the previous version is still live.\n`);
  process.exit(1);
}
try { rm(OLD); } catch { /* still in use — it's gitignored and cleared next build */ }
console.log("\n✅ New build is live — swapped in with no downtime.\n");
