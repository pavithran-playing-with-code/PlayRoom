// src/utils/timeAgo.js
// "Online now" / "Last seen 5m ago" for a presence record { online, last_seen }.
// `short` drops the "Last seen" prefix, for tight spots like a caption under a face.
export function presenceLabel(p, { short = false } = {}) {
  if (p?.online) return short ? "online" : "Online now";
  const at = p?.last_seen ? new Date(p.last_seen).getTime() : NaN;
  if (!Number.isFinite(at)) return short ? "offline" : "Offline";

  const s = Math.max(0, (Date.now() - at) / 1000);
  let ago;
  if (s < 60) ago = "just now";
  else if (s < 3600) ago = `${Math.floor(s / 60)}m ago`;
  else if (s < 86400) ago = `${Math.floor(s / 3600)}h ago`;
  else if (s < 7 * 86400) ago = `${Math.floor(s / 86400)}d ago`;
  else ago = new Date(at).toLocaleDateString();
  return short ? ago : `Last seen ${ago}`;
}
