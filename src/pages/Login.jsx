// src/pages/Login.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import Detective, { useDetective } from "../components/characters/Detective";
import { useToast } from "../components/ui";

export default function Login() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const det = useDetective(false);

  async function handleSubmit(e) {
    e.preventDefault();
    // The doorman checks the paperwork before the server does.
    if (!form.username.trim()) { det.setMood("oops", 1800); toast.error("Give me a username first"); return; }
    if (!form.password) { det.stopPeeking(); det.setMood("oops", 1800); toast.error("Password, please"); return; }

    setLoading(true);
    try {
      const res = await api.post("/api/auth/login", form);
      const data = await res.json();
      if (!data.success) {
        det.stopPeeking();
        det.setMood("oops", 2200);
        toast.error(data.message || "Login failed.");
        return;
      }
      det.stopPeeking();
      det.setMood("cheer");
      login(data.user, data.token);
      toast.success(`Welcome back, ${data.user.username}!`);
      navigate("/lobby");
    } catch {
      det.stopPeeking();
      det.setMood("oops", 2200);
      toast.error("Server error — is the backend running on port 4321?");
    } finally { setLoading(false); }
  }

  return (
    <div className="wrap">
      <div className="authwrap">
        <div className="authart">
          <Detective mood={det.mood} size={300} />
          <div className="bubble" style={{ marginTop: 22, maxWidth: 340, textAlign: "left" }}>
            {det.line}
          </div>
        </div>

        <div className="pop" style={{ padding: 30 }}>
          <h1 style={{ fontSize: "2rem", marginBottom: 6 }}>Welcome back!</h1>
          <p className="muted" style={{ marginBottom: 24 }}>Your crew has been waiting.</p>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="lg-user">Username or email</label>
              <input id="lg-user" type="text" placeholder="your username" autoComplete="username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                {...det.nameProps} />
            </div>

            <div className="field">
              <label htmlFor="lg-pass">Password</label>
              <input id="lg-pass" type="password" placeholder="••••••••" autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                {...det.secretProps} />
            </div>

            <button type="submit" className="press p-coral lg full" style={{ marginTop: 6 }} disabled={loading}>
              {loading ? "Checking your papers…" : "🚪 Let me in"}
            </button>
          </form>

          <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: ".95rem" }}>First time here?</span>
            <Link to="/register" className="press p-white sm">Make an account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
