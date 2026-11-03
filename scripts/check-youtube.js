// scripts/check-youtube.js — the YouTube browsing route (routes/youtube.js)
// against a pretend YouTube: what it asks for, what it hands the phones,
// that answers are kept, the per-person search limit, and a used-up quota.
// No key, no network, no database: a second to run.
//
//   node scripts/check-youtube.js
const path = require("path");
const http = require("http");
const express = require("express");

process.env.YOUTUBE_API_KEY = "test-key";
// signed in as whoever the X-User header says
const authPath = require.resolve(path.join(__dirname, "..", "middleware", "auth"));
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true,
  exports: { verifyToken: (req, res, next) => { req.user = { id: Number(req.headers["x-user"]) || 1 }; next(); } } };

// the pretend YouTube
const asked = [];
let quotaGone = false;
const video = (id, extra = {}) => ({
  id, snippet: { title: `Video ${id}`, channelTitle: "Chan", liveBroadcastContent: "none", thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } },
  contentDetails: { duration: "PT1H2M3S" }, status: { embeddable: true }, statistics: { viewCount: "1234" }, ...extra,
});
global.fetch = async (url) => {
  const u = new URL(url);
  asked.push(u);
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
  if (u.searchParams.get("key") !== "test-key") return json(400, { error: { errors: [{ reason: "keyInvalid" }] } });
  if (quotaGone) return json(403, { error: { errors: [{ reason: "quotaExceeded" }] } });
  if (u.pathname.endsWith("/search")) return json(200, { items: ["aaaaaaaaaa1", "liveliveli1", "nembednemb1"].map((videoId) => ({ id: { videoId } })), nextPageToken: "P2" });
  if (u.searchParams.get("chart") === "mostPopular") return json(200, { items: [video("trendtrend1"), video("trendtrend2")], nextPageToken: "T2" });
  if (u.searchParams.get("id")) return json(200, { items: [video("aaaaaaaaaa1"),
    video("liveliveli1", { snippet: { title: "Live", channelTitle: "C", liveBroadcastContent: "live" } }),
    video("nembednemb1", { status: { embeddable: false } })] });
  return json(404, {});
};

const router = require("../routes/youtube");
const app = express();
app.use("/api/youtube", router);
let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api/youtube`;
  const get = (p, user = 1) => new Promise((resolve) => http.get(base + p, { headers: { "x-user": String(user) } }, (res) => {
    let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
  }));
  try {
    check("durations read", router.seconds("PT1H2M3S") === 3723 && router.seconds("PT4M") === 240 && router.seconds("P1DT1S") === 86401 && router.seconds("x") === 0);
    let r = await get("/trending?cat=music");
    const t = asked[asked.length - 1];
    check("trending: India's chart, music, one cheap call", r.status === 200 && t.searchParams.get("regionCode") === "IN" && t.searchParams.get("videoCategoryId") === "10" && asked.length === 1);
    check("trending: the cards the phones need", r.body.videos.length === 2 && r.body.videos[0].id === "trendtrend1" && r.body.videos[0].dur === 3723
      && r.body.videos[0].ch === "Chan" && r.body.videos[0].views === 1234 && /mqdefault/.test(r.body.videos[0].thumb) && r.body.next === "T2");
    r = await get("/trending?cat=music", 2);
    check("trending again (someone else): kept, YouTube not asked", r.status === 200 && asked.length === 1);
    r = await get("/search?q=%20lofi%20%20beats%20");
    check("search: the search, then its videos", r.status === 200 && asked.length === 3 && asked[1].searchParams.get("q") === "lofi beats" && asked[1].searchParams.get("videoEmbeddable") === "true");
    check("search: live and not-embeddable videos left out", r.body.videos.length === 1 && r.body.videos[0].id === "aaaaaaaaaa1", JSON.stringify(r.body.videos.map((v) => v.id)));
    r = await get("/search?q=LOFI%20beats", 3);
    check("the same search, another person: kept", r.status === 200 && asked.length === 3);
    r = await get("/search?q=");
    check("an empty search is refused", r.status === 400);
    let last;
    for (let i = 0; i < 41; i++) last = await get(`/search?q=different${i}`, 7);
    check("a person's 41st search in an hour is refused", last.status === 429, String(last.status));
    r = await get("/search?q=fresh", 8);
    check("…but someone else can still search", r.status === 200);
    quotaGone = true;
    r = await get("/search?q=after", 9);
    check("quota used up: says so", r.status === 503 && /daily limit/.test(r.body.message));
    delete process.env.YOUTUBE_API_KEY;
    r = await get("/trending?cat=gaming");
    check("no key on the server: says it isn't set up", r.status === 503 && /isn't set up/.test(r.body.message));
  } catch (e) { fails++; console.log("ERROR", e.message); }
  console.log(fails ? `\n${fails} failed` : "\nall passed");
  server.close(); process.exit(fails ? 1 : 0);
});
