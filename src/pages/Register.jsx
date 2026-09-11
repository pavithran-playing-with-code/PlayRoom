// src/pages/Register.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import Detective, { useDetective } from "../components/characters/Detective";
import { useToast, PasswordInput } from "../components/ui";

const AVATARS = ["🎮", "🦊", "🐸", "🐙", "🐱", "🐲", "🐼", "🐾", "🀄", "🃏", "🎯", "🌟"];

export default function Register() {
  const [form, setForm] = useState({ username: "", email: "", password: "", avatar: "🎮" });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const det = useDetective(true);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.username.trim()) { det.setMood("oops", 1800); toast.error("Pick a name first"); return; }
    if (!form.password) { det.stopPeeking(); det.setMood("oops", 1800); toast.error("Password, please"); return; }

    setLoading(true);
    try {
      const res = await api.post("/api/auth/register", form);
      const data = await res.json();
      if (!data.success) {
        det.stopPeeking();
        det.setMood("oops", 2200);
        toast.error(data.message || "Could not create account.");
        return;
      }
      det.stopPeeking();
      det.setMood("cheer");
      login(data.user, data.token);
      toast.success(`Welcome aboard, ${data.user.username}!`);
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
          <h1 style={{ fontSize: "2rem", marginBottom: 6 }}>Join the club</h1>
          <p className="muted" style={{ marginBottom: 24 }}>Takes about twenty seconds.</p>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="rg-user">Username</label>
              <input id="rg-user" type="text" placeholder="pick something fun" autoComplete="username"
                required minLength={3} maxLength={32}
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                {...det.nameProps} />
            </div>

            <div className="field">
              <label>Pick your badge</label>
              <div className="avpick">
                {AVATARS.map((av) => (
                  <button type="button" key={av}
                    aria-pressed={form.avatar === av}
                    onClick={() => { setForm((f) => ({ ...f, avatar: av })); det.setMood("watch", 1200); }}>
                    {av}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="rg-mail">Email</label>
              <input id="rg-mail" type="email" placeholder="your@email.com" autoComplete="email" required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                {...det.nameProps} />
            </div>

            <div className="field">
              <label htmlFor="rg-pass">Password</label>
              <PasswordInput id="rg-pass" placeholder="at least 6 characters" autoComplete="new-password"
                required minLength={6}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                {...det.secretProps} />
            </div>

            <button type="submit" className="press p-mint lg full" style={{ marginTop: 6 }} disabled={loading}>
              {loading ? "Filing your paperwork…" : "🎉 Create my account"}
            </button>
          </form>

          <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: ".95rem" }}>Already have one?</span>
            <Link to="/login" className="press p-white sm">Log in instead</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
