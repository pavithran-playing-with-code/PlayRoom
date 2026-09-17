// src/utils/reportError.js
// Sends problems only the browser can see (a crash in the page, a request that
// never reached the server, a reply that wasn't JSON) to the backend, which
// prints them in its terminal next to its own errors.
const BASE = process.env.REACT_APP_API_URL || "";
const recent = new Map();   // message -> last sent, so a repeating error prints once
let sent = 0;

// Browser noise that isn't a real problem.
const IGNORE = [/^ResizeObserver loop/, /^Script error\.?$/];

export function reportError(kind, message, extra = {}) {
  try {
    const msg = String(message || "unknown error").slice(0, 500);
    if (IGNORE.some((re) => re.test(msg))) return;
    const key = `${kind}:${msg}`;
    const now = Date.now();
    if (recent.has(key) && now - recent.get(key) < 10000) return;
    if (++sent > 30) return;               // a page stuck in a loop mustn't flood the terminal
    recent.set(key, now);

    let token = null;
    try { token = localStorage.getItem("pr_token"); } catch { /* private mode */ }
    fetch(BASE + "/api/client-log", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        kind,
        message: msg,
        stack: extra.stack ? String(extra.stack).slice(0, 2000) : undefined,
        page: window.location.pathname + window.location.search,
      }),
    }).catch(() => {});
  } catch { /* reporting must never break the page */ }
}

export function installErrorReporting() {
  if (typeof window === "undefined" || window.__prErrorReporting) return;
  window.__prErrorReporting = true;
  window.addEventListener("error", (e) => reportError("crash", e.message, { stack: e.error && e.error.stack }));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    reportError("crash", (r && r.message) || String(r), { stack: r && r.stack });
  });
}
