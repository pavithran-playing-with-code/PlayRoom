// src/components/UpdatePrompt.jsx
// "A new version is ready — Update".
//
// The installed app (and any tab left open) keeps running the version it
// loaded until it is reloaded, and most people don't know to reload. So the
// app looks for itself: every few minutes, and whenever it comes back to the
// front, it fetches the home page fresh (the server never lets that be kept)
// and reads the name of the main script in it. A build's scripts carry its
// hash in their names, so a different name is a new version: a card slides up
// with one button, which reloads.
//
// It never interrupts: in a game (body.in-game) or a call it waits, and shows
// once you're out. It can be put off ("Later") for half an hour.
//
// A page of the old version that asks for a piece the new deploy has removed
// (a game's lazy chunk) fails to load it — that also means "there's a new
// version", so the card shows at once.
import React, { useEffect, useRef, useState } from "react";

const CHECK_MS = 3 * 60 * 1000;
const LATER_MS = 30 * 60 * 1000;
const MAIN = /static\/js\/main\.[a-z0-9]+\.js/i;

// the main script this page is running (none in development: nothing to compare)
function mine() {
  if (typeof document === "undefined") return null;
  for (const s of document.scripts) { const m = MAIN.exec(s.src || ""); if (m) return m[0]; }
  return null;
}
const busy = () => document.body.classList.contains("in-game") || !!document.querySelector(".call-screen, .call-ring");

export default function UpdatePrompt() {
  const [ready, setReady] = useState(false);     // a newer version is out
  const [show, setShow] = useState(false);       // …and now is a good moment to say so
  const [going, setGoing] = useState(false);
  const laterUntil = useRef(0);
  const readyRef = useRef(false);

  useEffect(() => {
    const me = mine();
    let alive = true, checking = false;
    const found = () => { if (alive && !readyRef.current) { readyRef.current = true; setReady(true); } };
    const check = async () => {
      if (!me || readyRef.current || checking || document.hidden) return;
      checking = true;
      try {
        const res = await fetch(`/?v=${Date.now()}`, { cache: "no-store", headers: { Accept: "text/html" } });
        if (res.ok) { const m = MAIN.exec(await res.text()); if (m && m[0] !== me) found(); }
      } catch { /* offline: try again later */ }
      checking = false;
    };
    // a piece of this (old) version that is no longer on the server
    const onFail = (e) => {
      const r = e && (e.reason || e.error);
      const msg = String((r && (r.name + " " + r.message)) || (e && e.message) || "");
      if (/ChunkLoadError|Loading chunk|Loading CSS chunk/i.test(msg)) found();
    };
    const onFront = () => { if (!document.hidden) check(); };
    const t = setInterval(check, CHECK_MS);
    const first = setTimeout(check, 20000);
    document.addEventListener("visibilitychange", onFront);
    window.addEventListener("focus", onFront);
    window.addEventListener("unhandledrejection", onFail);
    window.addEventListener("error", onFail);
    return () => {
      alive = false; clearInterval(t); clearTimeout(first);
      document.removeEventListener("visibilitychange", onFront);
      window.removeEventListener("focus", onFront);
      window.removeEventListener("unhandledrejection", onFail);
      window.removeEventListener("error", onFail);
    };
  }, []);

  // say so only when it won't interrupt a game or a call
  useEffect(() => {
    if (!ready) return undefined;
    const look = () => setShow(Date.now() >= laterUntil.current && !busy());
    look();
    const t = setInterval(look, 2000);
    return () => clearInterval(t);
  }, [ready]);

  if (!ready || !show) return null;
  const update = () => { setGoing(true); window.location.reload(); };
  const later = () => { laterUntil.current = Date.now() + LATER_MS; setShow(false); };
  return (
    <div className="upd" role="alertdialog" aria-label="A new version of PlayRoom is ready">
      <div className="pop upd-card">
        <span className="upd-icon" aria-hidden="true">🎉</span>
        <span className="upd-txt"><b>A new version is ready</b><small>Update to get the latest games and fixes.</small></span>
        <span className="upd-btns">
          <button type="button" className="press p-sun sm" onClick={update} disabled={going}>{going ? "Updating…" : "Update"}</button>
          <button type="button" className="upd-later" onClick={later}>Later</button>
        </span>
      </div>
    </div>
  );
}
