// src/pages/Register.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";

const AVATARS = ["🎮", "🀄", "🃏", "🧩", "🎯", "🎲", "🏆", "⚡", "🔥", "🌟", "🐉", "🦊"];

export default function Register() {
  const [form, setForm] = useState({ username: "", email: "", password: "", avatar: "🎮" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await api.post("/api/auth/register", form);
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
      <div style={{ width: "100%", maxWidth: 460 }}>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: "3rem", marginBottom: 8 }}>🎉</div>
          <h1 style={{
            fontSize: "1.8rem", fontWeight: 900, marginBottom: 6,
            background: "linear-gradient(90deg,var(--accent),var(--accent2))",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text"
          }}>
            Create Account
          </h1>
          <p style={{ color: "var(--muted)" }}>Join PlayRoom for free</p>
        </div>

        <div className="card">
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>

            {/* Avatar picker */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", color: "var(--muted)", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Pick your avatar
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {AVATARS.map(av => (
                  <button type="button" key={av} onClick={() => setForm(f => ({ ...f, avatar: av }))}
                    style={{
                      width: 44, height: 44, borderRadius: 10, fontSize: "1.3rem", cursor: "pointer", transition: "all 0.15s",
                      border: form.avatar === av ? "2px solid var(--accent)" : "2px solid var(--surface2)",
                      background: form.avatar === av ? "rgba(247,201,72,0.15)" : "var(--surface2)"
                    }}>
                    {av}
                  </button>
                ))}
              </div>
            </div>

            <div className="input-group">
              <label>Username</label>
              <input type="text" placeholder="Choose a username…"
                value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                required minLength={3} maxLength={32} />
            </div>
            <div className="input-group">
              <label>Email</label>
              <input type="email" placeholder="your@email.com"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input type="password" placeholder="At least 6 characters"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required minLength={6} />
            </div>

            <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
              {loading ? "Creating account…" : "🎮 Join PlayRoom!"}
            </button>
          </form>
          <p style={{ textAlign: "center", marginTop: 20, color: "var(--muted)", fontSize: "0.9rem" }}>
            Already have an account?{" "}
            <Link to="/login" style={{ color: "var(--accent)", fontWeight: 700 }}>Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
