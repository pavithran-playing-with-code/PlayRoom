// ─────────────────────────────────────────────────────────────────────────────
//  config/cors.js — the single CORS policy for the whole backend.
//
//  Both the Express app (server.js) and the Socket.io hub (config/socket.js)
//  import from here. They used to carry near-identical copies of this logic,
//  which is exactly the kind of thing that drifts: tighten one, forget the
//  other, and the websocket quietly becomes the weak door.
// ─────────────────────────────────────────────────────────────────────────────

const isProd = () => process.env.NODE_ENV === "production";

// Browsers never send a trailing slash on Origin, but proxies and hand-written
// clients sometimes do — and an env var is easy to paste with one.
const normalize = (origin) => String(origin || "").trim().replace(/\/+$/, "");

// Allowed production origins. Accepts a comma-separated list so a deployment
// can serve more than one hostname (apex + www, staging, a custom domain).
function allowedOrigins() {
  return [process.env.CORS_ORIGINS, process.env.PRODUCTION_URL]
    .filter(Boolean)
    .flatMap((v) => v.split(","))
    .map(normalize)
    .filter(Boolean);
}

// Any port, http or https, localhost or the loopback IP. Dev only.
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const isLocalhostOrigin = (origin) => LOCALHOST_RE.test(origin);

// Cloudflare quick tunnels hand out a fresh random hostname every restart, so
// the exact URL can't be known ahead of time and pinned in .env. When SHARE_MODE
// is on (set by `npm run share`), trust any trycloudflare.com host so the app
// works immediately without an edit-and-restart dance.
//
// Deliberately opt-in: a real deployment must still name its origins explicitly,
// or it would be trusting every tunnel anyone can spin up in 10 seconds.
const QUICK_TUNNEL_RE = /^https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com$/;
const shareMode = () => process.env.SHARE_MODE === "1";

function isAllowedOrigin(origin) {
  // No Origin header at all: same-origin navigations, curl, health checks,
  // server-to-server. There is no browser to protect in that case.
  if (!origin) return true;
  const clean = normalize(origin);
  if (allowedOrigins().includes(clean)) return true;
  if (!isProd() && isLocalhostOrigin(clean)) return true;
  if (shareMode() && QUICK_TUNNEL_RE.test(clean)) return true;
  return false;
}

// express `cors` and socket.io both accept this (origin, callback) shape.
function corsOrigin(origin, callback) {
  if (isAllowedOrigin(origin)) return callback(null, true);
  // Tagged 403 so middleware/errorHandler reports "Forbidden" rather than
  // dressing a policy decision up as a 500 Internal Server Error.
  const err = new Error(`Not allowed by CORS: ${origin}`);
  err.status = 403;
  return callback(err);
}

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Warn loudly rather than silently falling back to a localhost origin in prod.
function assertProductionOrigins() {
  if (isProd() && allowedOrigins().length === 0) {
    console.warn(
      "⚠️  NODE_ENV=production but no CORS_ORIGINS/PRODUCTION_URL is set — " +
      "every cross-origin browser request will be rejected."
    );
  }
}

module.exports = { corsOptions, corsOrigin, isAllowedOrigin, allowedOrigins, assertProductionOrigins };
