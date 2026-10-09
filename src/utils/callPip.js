// src/utils/callPip.js
// The call in a small floating window that stays on top while you're on
// another tab or app — their face on the left, yours on the right, with
// mute and hang up, and the call's chat underneath (read and reply while a
// film plays in another tab).
//
// A plain video picture-in-picture can only show one video, so it showed
// just the other person. This uses Chrome's Document Picture-in-Picture
// (computers; Chrome 116+), a tiny page of its own, so it can show both.
// It's built with plain DOM, not React: React's clicks don't reach a
// separate window.
export const canDocPip = () => typeof window !== "undefined" && "documentPictureInPicture" in window;

let win = null;
let ui = null;          // { tiles: Map<key, {box, vid, face, name}>, mic, row }
let handlers = {};

const CSS = `
*{box-sizing:border-box;margin:0}
html,body{height:100%;background:#14101c;color:#fff;font-family:Nunito,system-ui,sans-serif;overflow:hidden}
body{display:flex;flex-direction:column}
.row{position:relative;flex:0 0 46%;min-height:90px;display:flex;gap:3px;padding:3px}
.tile{position:relative;flex:1;min-width:0;border-radius:10px;overflow:hidden;background:#221a30;display:grid;place-items:center}
.tile.me{outline:2px solid #FFC53D;outline-offset:-2px}
video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}
video.mirror{transform:scaleX(-1)}
.face{font-size:34px;width:56px;height:56px;border-radius:50%;background:#FFC53D;display:grid;place-items:center;border:3px solid #fff}
.name{position:absolute;left:4px;bottom:4px;padding:1px 8px;border-radius:999px;background:rgba(0,0,0,.55);font-weight:800;font-size:12px;
  max-width:calc(100% - 8px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar{flex:0 0 44px;display:flex;justify-content:center;align-items:center;gap:12px}
.chat{flex:1;min-height:0;display:flex;flex-direction:column;border-top:1px solid rgba(255,255,255,.15)}
.list{flex:1;min-height:0;overflow-y:auto;padding:6px 8px;display:flex;flex-direction:column;gap:4px}
.msg{align-self:flex-start;max-width:85%;padding:4px 9px;border-radius:12px 12px 12px 3px;background:rgba(255,255,255,.14);font-size:13px;line-height:1.3;word-break:break-word}
.msg.mine{align-self:flex-end;border-radius:12px 12px 3px 12px;background:#4CC9F0;color:#2E2140}
.msg b{display:block;font-size:10px;color:#FFC53D}
.empty{margin:auto;opacity:.55;font-weight:800;font-size:12px}
form{display:flex;gap:6px;padding:6px}
input{flex:1;min-width:0;height:34px;padding:0 12px;border-radius:999px;border:0;font:700 14px Nunito,system-ui,sans-serif;color:#2E2140;outline:none}
form button{background:#B5E655;color:#2E2140;border:0}
button{width:34px;height:34px;border-radius:50%;border:2px solid #fff;background:rgba(255,255,255,.2);color:#fff;font-size:16px;cursor:pointer;
  display:grid;place-items:center;padding:0}
button.off{background:#fff;color:#2E2140}
button.red{background:#e5484d}
`;

function tile(doc, key) {
  const box = doc.createElement("div"); box.className = "tile" + (key === "me" ? " me" : "");
  const vid = doc.createElement("video"); vid.autoplay = true; vid.playsInline = true; vid.muted = true;   // sound plays in the page
  const face = doc.createElement("div"); face.className = "face";
  const name = doc.createElement("div"); name.className = "name";
  box.append(vid, face, name);
  return { box, vid, face, name };
}

// people: [{ key, name, stream, showVideo, avatar, mirror, muted }] — them first, me last
export function updatePip({ people, mic, chat = [] }) {
  if (!win || !ui) return;
  // the chat: redrawn when there's something new
  if (ui.chatN !== chat.length) {
    ui.chatN = chat.length;
    const doc0 = win.document, list = ui.list;
    list.replaceChildren();
    if (!chat.length) { const e = doc0.createElement("div"); e.className = "empty"; e.textContent = "Chat here — not saved"; list.append(e); }
    for (const m of chat.slice(-40)) {
      const e = doc0.createElement("div"); e.className = "msg" + (m.mine ? " mine" : "");
      if (!m.mine) { const b = doc0.createElement("b"); b.textContent = m.name; e.append(b); }
      e.append(doc0.createTextNode(m.text));
      list.append(e);
    }
    list.scrollTop = list.scrollHeight;
  }
  const doc = win.document, keep = new Set();
  for (const p of people) {
    keep.add(p.key);
    let t = ui.tiles.get(p.key);
    if (!t) { t = tile(doc, p.key); ui.tiles.set(p.key, t); }
    ui.row.appendChild(t.box);                          // keeps the order: them, then me
    const v = p.showVideo ? p.stream : null;
    if (t.vid.srcObject !== v) { t.vid.srcObject = v; if (v) t.vid.play().catch(() => {}); }
    t.vid.style.display = v ? "" : "none";
    t.vid.className = p.mirror ? "mirror" : "";
    t.face.style.display = v ? "none" : "";
    t.face.textContent = p.avatar || "🙂";
    t.name.textContent = p.name + (p.muted ? " 🔇" : "");
  }
  for (const [k, t] of ui.tiles) if (!keep.has(k)) { t.vid.srcObject = null; t.box.remove(); ui.tiles.delete(k); }
  ui.mic.textContent = mic ? "🎤" : "🔇";
  ui.mic.className = mic ? "" : "off";
  ui.mic.title = mic ? "Mute" : "Unmute";
}

export async function openPip(state, on) {
  if (!canDocPip()) return false;
  handlers = on || {};
  if (win && !win.closed) { updatePip(state); return true; }
  try {
    win = await window.documentPictureInPicture.requestWindow({ width: 420, height: 400 });
  } catch { win = null; return false; }
  const doc = win.document;
  const style = doc.createElement("style"); style.textContent = CSS; doc.head.appendChild(style);
  doc.title = "PlayRoom call";
  const row = doc.createElement("div"); row.className = "row";
  const bar = doc.createElement("div"); bar.className = "bar";
  const mic = doc.createElement("button"); mic.addEventListener("click", () => handlers.onMic && handlers.onMic());
  const back = doc.createElement("button"); back.textContent = "⤢"; back.title = "Back to the call";
  back.addEventListener("click", () => { try { window.focus(); } catch { /* fine */ } if (handlers.onBack) handlers.onBack(); closePip(); });
  const hang = doc.createElement("button"); hang.className = "red"; hang.textContent = "✕"; hang.title = "Hang up";
  hang.addEventListener("click", () => { if (handlers.onHangUp) handlers.onHangUp(); closePip(); });
  bar.append(mic, back, hang);
  const chat = doc.createElement("div"); chat.className = "chat";
  const list = doc.createElement("div"); list.className = "list";
  const form = doc.createElement("form");
  const input = doc.createElement("input"); input.placeholder = "Message…"; input.maxLength = 500; input.autocomplete = "off";
  const send = doc.createElement("button"); send.type = "submit"; send.textContent = "➤"; send.title = "Send";
  form.append(input, send);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = input.value.trim();
    if (t && handlers.onSend) { handlers.onSend(t); input.value = ""; }
  });
  chat.append(list, form);
  doc.body.append(row, bar, chat);
  ui = { tiles: new Map(), mic, row, list, chatN: -1 };
  win.addEventListener("pagehide", () => { win = null; ui = null; });
  updatePip(state);
  return true;
}

export function closePip() {
  try { if (win && !win.closed) win.close(); } catch { /* gone */ }
  win = null; ui = null;
}

export const pipOpen = () => !!win && !win.closed;
