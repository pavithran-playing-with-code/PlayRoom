// src/utils/theme.js
// Light or dark. The choice is kept on this device (localStorage pr_theme);
// with none saved it follows the phone's own setting. public/index.html sets
// it before the first paint, so a dark phone never flashes light.
import { useEffect, useState } from "react";

const KEY = "pr_theme";
const BAR = { light: "#FFF6E6", dark: "#1A1424" };   // the phone's status bar

function saved() {
  try { const t = localStorage.getItem(KEY); return t === "dark" || t === "light" ? t : null; } catch { return null; }
}
function system() {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { return "light"; }
}
export const currentTheme = () => saved() || system();

function apply(t) {
  document.documentElement.setAttribute("data-theme", t);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", BAR[t]);
  window.dispatchEvent(new CustomEvent("pr-theme", { detail: t }));
}
export function setTheme(t) {
  try { localStorage.setItem(KEY, t); } catch { /* private window: this visit only */ }
  apply(t);
}

// [theme, toggle]: re-renders when it changes (here or from another tab)
export default function useTheme() {
  const [t, setT] = useState(currentTheme);
  useEffect(() => {
    const on = (e) => setT(e.detail || currentTheme());
    const onStore = (e) => { if (e.key === KEY) { const n = currentTheme(); apply(n); } };
    window.addEventListener("pr-theme", on);
    window.addEventListener("storage", onStore);
    // following the phone (nothing saved): change with it
    let mq = null;
    const onSys = () => { if (!saved()) apply(system()); };
    try { mq = window.matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", onSys); } catch { mq = null; }
    return () => {
      window.removeEventListener("pr-theme", on); window.removeEventListener("storage", onStore);
      if (mq) try { mq.removeEventListener("change", onSys); } catch { /* old Safari */ }
    };
  }, []);
  return [t, () => setTheme(t === "dark" ? "light" : "dark")];
}
