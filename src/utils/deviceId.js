// src/utils/deviceId.js
// This phone or computer, the same every time (kept in localStorage). Sent
// with the socket, so the server can tell "my other device" from "this
// device, reconnected": a phone whose connection blipped comes back with a
// new socket while the server still thinks the old one is alive for up to
// ~20 s, and was told its own match was being played "on another device".
const make = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
let id = null;
export function deviceId() {
  if (id) return id;
  try {
    id = localStorage.getItem("pr_device");
    if (!id) { id = make(); localStorage.setItem("pr_device", id); }
  } catch { id = make(); }                 // private mode: this page load
  return id;
}
