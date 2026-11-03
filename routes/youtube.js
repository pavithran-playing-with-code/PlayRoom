// routes/youtube.js — browsing YouTube to watch a video together in a call.
//
// The key (YOUTUBE_API_KEY, Google Cloud → YouTube Data API v3) stays here;
// the phones ask us. The free quota is 10,000 units a day: a trending page
// costs 1, a search 101 (the search, then its videos' details) — so about a
// hundred searches a day for everyone. Answers are kept (trending for half an
// hour, a search for six) so friends asking the same thing share one, and
// each person gets SEARCH_PER_HOUR searches.
//
// Only videos that may be embedded and aren't live: the call plays them in
// YouTube's own player, kept in step (src/components/CallWatch.jsx).
const router = require("express").Router();
const { verifyToken } = require("../middleware/auth");

const API = "https://www.googleapis.com/youtube/v3";
const TRENDING_MS = 30 * 60 * 1000, SEARCH_MS = 6 * 3600 * 1000, KEEP = 300;
const SEARCH_PER_HOUR = 40;
// the chips over the feed: YouTube's own category numbers
const CATEGORIES = { music: "10", gaming: "20", comedy: "23", entertainment: "24", sports: "17", films: "1" };

const cache = new Map();                       // key -> { until, data }
const kept = (k) => { const c = cache.get(k); if (c && c.until > Date.now()) return c.data; cache.delete(k); return null; };
const keep = (k, data, ms) => {
  cache.set(k, { until: Date.now() + ms, data });
  while (cache.size > KEEP) cache.delete(cache.keys().next().value);
};
const asked = new Map();                       // user id -> [times of their searches]

// PT1H2M3S -> 3723
function seconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  return m ? ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) : 0;
}
// what a phone needs to show and play a video
function card(v) {
  const s = v.snippet || {}, t = s.thumbnails || {};
  return {
    id: v.id, title: (s.title || "").slice(0, 150), ch: (s.channelTitle || "").slice(0, 80),
    dur: seconds(v.contentDetails && v.contentDetails.duration),
    thumb: (t.medium || t.high || t.default || {}).url || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
    views: Number(v.statistics && v.statistics.viewCount) || 0,
  };
}
const playable = (v) => v.status && v.status.embeddable !== false && (!v.snippet || v.snippet.liveBroadcastContent === "none") && seconds(v.contentDetails && v.contentDetails.duration) > 0;

async function yt(path, params) {
  const q = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY });
  const res = await fetch(`${API}/${path}?${q}`, { signal: AbortSignal.timeout(8000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = (data.error && data.error.errors && data.error.errors[0] && data.error.errors[0].reason) || res.status;
    const err = new Error(`YouTube ${path}: ${why}`);
    err.quota = why === "quotaExceeded" || why === "dailyLimitExceeded";
    throw err;
  }
  return data;
}
const PARTS = "snippet,contentDetails,status,statistics";

router.use(verifyToken);
router.use((req, res, next) => {
  if (!process.env.YOUTUBE_API_KEY) return res.status(503).json({ success: false, message: "YouTube isn't set up on this server yet." });
  next();
});
const failed = (res, err) => {
  console.warn("⚠️  YouTube:", err.message);
  res.status(err.quota ? 503 : 502).json({ success: false,
    message: err.quota ? "YouTube's daily limit is used up. It resets overnight (Pacific time)." : "Couldn't reach YouTube. Try again." });
};

// GET /api/youtube/trending?cat=music&page=<token>
router.get("/trending", async (req, res) => {
  const cat = CATEGORIES[req.query.cat] || "";
  const region = /^[A-Z]{2}$/.test(req.query.region || "") ? req.query.region : "IN";
  const page = typeof req.query.page === "string" ? req.query.page.slice(0, 100) : "";
  const k = `t|${region}|${cat}|${page}`;
  const hit = kept(k);
  if (hit) return res.json(hit);
  try {
    const d = await yt("videos", { part: PARTS, chart: "mostPopular", regionCode: region, maxResults: "24",
      ...(cat ? { videoCategoryId: cat } : {}), ...(page ? { pageToken: page } : {}) });
    const out = { success: true, videos: (d.items || []).filter(playable).map(card), next: d.nextPageToken || null };
    keep(k, out, TRENDING_MS);
    res.json(out);
  } catch (err) {
    // a category YouTube has no chart for here: an empty shelf, not an error
    if (/notFound|invalid/i.test(err.message)) return res.json({ success: true, videos: [], next: null });
    failed(res, err);
  }
});

// GET /api/youtube/search?q=...&page=<token>
router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!q) return res.status(400).json({ success: false, message: "Type something to search for." });
  const page = typeof req.query.page === "string" ? req.query.page.slice(0, 100) : "";
  const k = `s|${q.toLowerCase()}|${page}`;
  const hit = kept(k);
  if (hit) return res.json(hit);
  const now = Date.now(), mine = (asked.get(req.user.id) || []).filter((t) => now - t < 3600 * 1000);
  if (mine.length >= SEARCH_PER_HOUR) return res.status(429).json({ success: false, message: "That's a lot of searching — try again in a bit, or pick from Trending." });
  mine.push(now); asked.set(req.user.id, mine);
  try {
    const s = await yt("search", { part: "id", type: "video", q, maxResults: "20", videoEmbeddable: "true",
      safeSearch: "moderate", ...(page ? { pageToken: page } : {}) });
    const ids = (s.items || []).map((x) => x.id && x.id.videoId).filter(Boolean);
    const d = ids.length ? await yt("videos", { part: PARTS, id: ids.join(",") }) : { items: [] };
    const byId = new Map((d.items || []).filter(playable).map((v) => [v.id, card(v)]));
    const out = { success: true, videos: ids.map((id) => byId.get(id)).filter(Boolean), next: s.nextPageToken || null };
    keep(k, out, SEARCH_MS);
    res.json(out);
  } catch (err) { failed(res, err); }
});

module.exports = router;
module.exports.seconds = seconds;
