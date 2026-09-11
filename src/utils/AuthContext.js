// src/utils/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,  setUser]  = useState(() => { try { return JSON.parse(localStorage.getItem("pr_user")); } catch { return null; } });
  const [token, setToken] = useState(() => localStorage.getItem("pr_token"));

  useEffect(() => {
    const handler = () => { setUser(null); setToken(null); };
    window.addEventListener("pr:unauthorized", handler);
    return () => window.removeEventListener("pr:unauthorized", handler);
  }, []);

  // The cached profile in localStorage is a first-paint convenience, not the
  // truth: it can be arbitrarily stale (or edited by hand). Re-fetch it once on
  // boot whenever we hold a token. A revoked or deleted account 401s here,
  // which apiFetch turns into pr:unauthorized → logged out.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res  = await api.get("/api/auth/me");
        const data = await res.json();
        if (!cancelled && data.success && data.user) {
          setUser(data.user);
          localStorage.setItem("pr_user", JSON.stringify(data.user));
        }
      } catch { /* offline — keep the cached profile */ }
    })();
    return () => { cancelled = true; };
  }, [token]);

  function login(userData, tokenStr) {
    localStorage.setItem("pr_token", tokenStr);
    localStorage.setItem("pr_user",  JSON.stringify(userData));
    setToken(tokenStr);
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem("pr_token");
    localStorage.removeItem("pr_user");
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoggedIn: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
