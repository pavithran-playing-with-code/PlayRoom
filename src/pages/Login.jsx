// src/pages/Login.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import Logo from "../components/Logo";

export default function Login() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await api.post("/api/auth/login", form);
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      login(data.user, data.token);
      navigate("/lobby");
    } catch {
      setError("Server error — is the backend running on port 4321?");
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: "calc(100vh - 60px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom: 14 }}>
            <Logo size="lg" />
          </div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 900, marginBottom: 6 }}>
            Welcome back!
          </h1>
          <p style={{ color: "var(--muted)" }}>Log in to continue</p>
        </div>

        <div className="card">
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Username or Email</label>
              <input type="text" placeholder="Enter your username…"
                value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input type="password" placeholder="Enter your password…"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
              {loading ? "Logging in…" : "🚀 Let's Play!"}
            </button>
          </form>
          <p style={{ textAlign: "center", marginTop: 20, color: "var(--muted)", fontSize: "0.9rem" }}>
            No account?{" "}
            <Link to="/register" style={{ color: "var(--accent)", fontWeight: 700 }}>Sign up free</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
