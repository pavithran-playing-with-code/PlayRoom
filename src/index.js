import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<React.StrictMode><App /></React.StrictMode>);

// Played like a phone app: a long press brings up no menu (Chrome's "download
// image" on a game canvas, "copy" on a button), nothing is dragged or
// selected, and a pinch doesn't zoom the page. Text boxes keep their menus.
const typing = (t) => !!(t && t.closest && t.closest("input, textarea, [contenteditable='true']"));
document.addEventListener("contextmenu", (e) => { if (!typing(e.target)) e.preventDefault(); });
document.addEventListener("selectstart", (e) => { if (!typing(e.target)) e.preventDefault(); });
document.addEventListener("dragstart", (e) => { if (!typing(e.target)) e.preventDefault(); });
document.addEventListener("gesturestart", (e) => e.preventDefault());             // iOS pinch

