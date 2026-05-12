// src/utils/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,  setUser]  = useState(() => { try { return JSON.parse(localStorage.getItem("pr_user")); } catch { return null; } });
  const [token, setToken] = useState(() => localStorage.getItem("pr_token"));

  useEffect(() => {
    const handler = () => { setUser(null); setToken(null); };
    window.addEventListener("pr:unauthorized", handler);
    return () => window.removeEventListener("pr:unauthorized", handler);
  }, []);

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
