// src/utils/api.js
// In development, requests go directly to the backend via REACT_APP_API_URL.
// In production, Express serves everything from the same origin so BASE stays "".

const BASE = process.env.REACT_APP_API_URL || "";

export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem("pr_token");
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  // Bearer tokens travel in the Authorization header; no cookies needed.
  // (credentials:"include" forces tighter CORS + sends cookies we don't use.)
  const res = await fetch(BASE + endpoint, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem("pr_token");
    localStorage.removeItem("pr_user");
    window.dispatchEvent(new CustomEvent("pr:unauthorized"));
  }
  return res;
}

export const api = {
  get: (url) => apiFetch(url),
  post: (url, body) => apiFetch(url, { method: "POST", body: JSON.stringify(body) }),
  patch: (url, body) => apiFetch(url, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (url) => apiFetch(url, { method: "DELETE" }),
};