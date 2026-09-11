// src/pages/Profile.jsx
// Change how you appear to friends (name + badge) and change your password.
import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { Avatar, PasswordInput, useToast } from "../components/ui";

// Same badges as sign-up, so everyone picks from one set.
const BADGES = ["🎮", "🦊", "🐸", "🐙", "🐱", "🐲", "🐼", "🐾", "🀄", "🃏", "🎯", "🌟"];
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;   // mirrors routes/auth.js

export default function Profile() {
  const { user, login } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(user?.username || "");
  const [badge, setBadge] = useState(user?.avatar || "🎮");
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);

  // The cached profile gets refreshed from the server on load — follow it.
  useEffect(() => {
    setName(user?.username || "");
    setBadge(user?.avatar || "🎮");
  }, [user?.username, user?.avatar]);

  const cleanName = name.trim();
  const nameOk = USERNAME_RE.test(cleanName);
  const changed = cleanName !== (user?.username || "") || badge !== (user?.avatar || "");
  // Keep an older badge that isn't in today's set selectable.
  const badges = !user?.avatar || BADGES.includes(user.avatar) ? BADGES : [user.avatar, ...BADGES];
  const mismatch = pw.confirm.length > 0 && pw.next !== pw.confirm;

  async function saveProfile(e) {
    e.preventDefault();
    if (!nameOk) { toast.error("Username: 3–32 letters, numbers, _ . or -"); return; }
    setSavingProfile(true);
    try {
      const res = await api.patch("/api/auth/me", { username: cleanName, avatar: badge });
      const data = await res.json();
      if (!data.success) { toast.error(data.message || "Couldn't save your profile."); return; }
      // A new name comes with a new token (the token carries the name).
      login(data.user, data.token);
      toast.success("Profile saved!");
    } catch { toast.error("Couldn't reach the server."); }
    finally { setSavingProfile(false); }
  }

  async function savePassword(e) {
    e.preventDefault();
    if (!pw.current) { toast.error("Enter your current password."); return; }
    if (pw.next.length < 6) { toast.error("The new password needs at least 6 characters."); return; }
    if (pw.next !== pw.confirm) { toast.error("The two new passwords don't match."); return; }
    setSavingPw(true);
    try {
      const res = await api.post("/api/auth/change-password", { current_password: pw.current, new_password: pw.next });
      const data = await res.json();
      if (!data.success) { toast.error(data.message || "Couldn't change your password."); return; }
      setPw({ current: "", next: "", confirm: "" });
      toast.success("Password changed!");
    } catch { toast.error("Couldn't reach the server."); }
    finally { setSavingPw(false); }
  }

  const setField = (key) => (e) => setPw((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="wrap">
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="row" style={{ gap: 16, marginBottom: 26, flexWrap: "wrap" }}>
          <Avatar emoji={badge} size={64} seed={user?.id} />
          <div style={{ flex: 1, minWidth: 180 }}>
            <h1 style={{ fontSize: "2rem" }}>Your profile</h1>
            <p className="muted">Change how friends see you, and keep your account safe.</p>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="chip c-sun">🏆 {Number(user?.total_score || 0).toLocaleString()} pts</span>
            <span className="chip c-sky">🎮 {user?.games_played || 0} played</span>
            <span className="chip c-lime">👑 {user?.games_won || 0} won</span>
          </div>
        </div>

        <div className="grid g2" style={{ alignItems: "start" }}>
          <form className="pop" style={{ padding: 26 }} onSubmit={saveProfile}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: 18 }}>✏️ Name &amp; badge</h2>

            <div className="field">
              <label htmlFor="pf-name">Username</label>
              <input id="pf-name" autoComplete="username" maxLength={32}
                value={name} onChange={(e) => setName(e.target.value)} />
              <div className={`hint${name && !nameOk ? " hint-bad" : ""}`}>
                {name && !nameOk
                  ? "3–32 characters: letters, numbers, _ . or -"
                  : "You log in with this name too. Friends see it straight away."}
              </div>
            </div>

            <div className="field">
              <label>Badge</label>
              <div className="avpick">
                {badges.map((b) => (
                  <button type="button" key={b} aria-pressed={badge === b} onClick={() => setBadge(b)}>{b}</button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="pf-email">Email</label>
              <input id="pf-email" value={user?.email || ""} disabled readOnly />
            </div>

            <button type="submit" className="press p-sun full" disabled={!changed || !nameOk || savingProfile}>
              {savingProfile ? "Saving…" : changed ? "💾 Save changes" : "No changes yet"}
            </button>
          </form>

          <form className="pop" style={{ padding: 26 }} onSubmit={savePassword}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: 18 }}>🔒 Change password</h2>

            <div className="field">
              <label htmlFor="pf-cur">Current password</label>
              <PasswordInput id="pf-cur" autoComplete="current-password" value={pw.current} onChange={setField("current")} />
            </div>
            <div className="field">
              <label htmlFor="pf-new">New password</label>
              <PasswordInput id="pf-new" autoComplete="new-password" placeholder="at least 6 characters"
                value={pw.next} onChange={setField("next")} />
            </div>
            <div className="field">
              <label htmlFor="pf-confirm">New password again</label>
              <PasswordInput id="pf-confirm" autoComplete="new-password" value={pw.confirm} onChange={setField("confirm")} />
              {mismatch && <div className="hint hint-bad">Doesn't match the new password yet.</div>}
            </div>

            <button type="submit" className="press p-coral full"
              disabled={savingPw || !pw.current || !pw.next || !pw.confirm || mismatch}>
              {savingPw ? "Changing…" : "🔑 Change password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
