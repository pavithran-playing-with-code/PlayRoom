// src/pages/Profile.jsx
// Change how you appear to friends (name + badge), change your password —
// with the old one, or with a code emailed to you — and delete your account.
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { Avatar, PasswordInput, useToast } from "../components/ui";

// Same badges as sign-up, so everyone picks from one set.
const BADGES = ["🎮", "🦊", "🐸", "🐙", "🐱", "🐲", "🐼", "🐾", "🀄", "🃏", "🎯", "🌟"];
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;   // mirrors routes/auth.js
const CODE_RE = /^\d{6}$/;

// Ask the server to email a code, and count down until another may be sent.
function useEmailCode(purpose, toast) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(0);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  const countdown = (secs) => {
    clearInterval(timer.current);
    setWait(secs);
    timer.current = setInterval(() => setWait((w) => {
      if (w <= 1) { clearInterval(timer.current); return 0; }
      return w - 1;
    }), 1000);
  };
  async function send() {
    if (sending || wait) return;
    setSending(true);
    try {
      const res = await api.post("/api/auth/email-code", { purpose });
      const data = await res.json();
      if (data.wait) countdown(data.wait);
      if (!data.success) { toast.error(data.message || "Couldn't send the code."); return; }
      setSent(true);
      countdown(data.resend || 60);
      toast.success(`Code sent to ${data.email}. Check your inbox (and spam).`);
    } catch { toast.error("Couldn't reach the server."); }
    finally { setSending(false); }
  }
  const reset = () => { setSent(false); };
  return { sent, sending, wait, send, reset };
}

// The code box: digits only, and the phone offers the code from the email.
function CodeInput({ id, value, onChange }) {
  return (
    <input id={id} className="pf-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
      placeholder="123456" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))} />
  );
}

export default function Profile() {
  const { user, login, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.username || "");
  const [badge, setBadge] = useState(user?.avatar || "🎮");
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw, setPw] = useState({ current: "", code: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [pwBy, setPwBy] = useState("password");          // "password" | "email": how you prove it's you
  const pwMail = useEmailCode("password", toast);

  const [delOpen, setDelOpen] = useState(false);
  const [delCode, setDelCode] = useState("");
  const [deleting, setDeleting] = useState(false);
  const delMail = useEmailCode("delete", toast);

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

  const byEmail = pwBy === "email";
  const proofOk = byEmail ? CODE_RE.test(pw.code) : !!pw.current;
  const [ticket, setTicket] = useState(null);           // set once you've proved it's you
  const [verifying, setVerifying] = useState(false);

  // Step 1: prove it's you — the current password, or the emailed code.
  async function verify(e) {
    e.preventDefault();
    if (byEmail && !CODE_RE.test(pw.code)) { toast.error("Enter the 6-digit code from the email."); return; }
    if (!byEmail && !pw.current) { toast.error("Enter your current password."); return; }
    setVerifying(true);
    try {
      const res = await api.post("/api/auth/change-password/verify", byEmail ? { code: pw.code } : { current_password: pw.current });
      const data = await res.json();
      if (!data.success) { toast.error(data.message || "Couldn't verify that."); return; }
      setTicket(data.ticket);
      setPw({ current: "", code: "", next: "", confirm: "" });
      toast.success("Verified! Now pick your new password.");
    } catch { toast.error("Couldn't reach the server."); }
    finally { setVerifying(false); }
  }

  function startOver() {
    setTicket(null);
    setPw({ current: "", code: "", next: "", confirm: "" });
    pwMail.reset();
  }

  // Step 2: the new password.
  async function savePassword(e) {
    e.preventDefault();
    if (pw.next.length < 6) { toast.error("The new password needs at least 6 characters."); return; }
    if (pw.next !== pw.confirm) { toast.error("The two new passwords don't match."); return; }
    setSavingPw(true);
    try {
      const res = await api.post("/api/auth/change-password", { ticket, new_password: pw.next });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.message || "Couldn't change your password.");
        if (data.expired) startOver();
        return;
      }
      startOver();
      toast.success("Password changed!");
    } catch { toast.error("Couldn't reach the server."); }
    finally { setSavingPw(false); }
  }

  async function deleteAccount(e) {
    e.preventDefault();
    if (!CODE_RE.test(delCode)) { toast.error("Enter the 6-digit code from the email."); return; }
    setDeleting(true);
    try {
      const res = await api.post("/api/auth/delete-account", { code: delCode });
      const data = await res.json();
      if (!data.success) { toast.error(data.message || "Couldn't delete your account."); return; }
      logout();
      toast.success("Your account has been deleted. Bye for now 👋");
      navigate("/", { replace: true });
    } catch { toast.error("Couldn't reach the server."); }
    finally { setDeleting(false); }
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

          {!ticket ? (
            <form className="pop" style={{ padding: 26 }} onSubmit={verify}>
              <h2 style={{ fontSize: "1.4rem", marginBottom: 6 }}>🔒 Change password</h2>
              <p className="muted pf-step">Step 1 of 2 · First, show it's you</p>

              <div className="pf-seg" role="tablist" aria-label="How to prove it's you">
                <button type="button" role="tab" aria-selected={!byEmail} onClick={() => setPwBy("password")}>🔑 Old password</button>
                <button type="button" role="tab" aria-selected={byEmail} onClick={() => setPwBy("email")}>📧 Email code</button>
              </div>

              {byEmail ? (
                <div className="field">
                  <label htmlFor="pf-code">Code from your email</label>
                  <div className="pf-coderow">
                    <CodeInput id="pf-code" value={pw.code} onChange={(v) => setPw((p) => ({ ...p, code: v }))} />
                    <button type="button" className="press p-sky" onClick={pwMail.send} disabled={pwMail.sending || pwMail.wait > 0}>
                      {pwMail.sending ? "Sending…" : pwMail.wait ? `Resend in ${pwMail.wait}s` : pwMail.sent ? "Send again" : "📧 Send code"}
                    </button>
                  </div>
                  <div className="hint">
                    {pwMail.sent ? `Sent to ${user?.email}. It works for 10 minutes.` : `We'll email a 6-digit code to ${user?.email}.`}
                  </div>
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="pf-cur">Current password</label>
                  <PasswordInput id="pf-cur" autoComplete="current-password" value={pw.current} onChange={setField("current")} />
                  <div className="hint">Forgotten it? Use <button type="button" className="linkish" onClick={() => setPwBy("email")}>an email code</button> instead.</div>
                </div>
              )}

              <button type="submit" className="press p-grape full" disabled={verifying || !proofOk}>
                {verifying ? "Checking…" : "✅ Verify"}
              </button>
            </form>
          ) : (
            <form className="pop pf-verified" style={{ padding: 26 }} onSubmit={savePassword}>
              <h2 style={{ fontSize: "1.4rem", marginBottom: 6 }}>🔒 Change password</h2>
              <p className="pf-step"><span className="chip c-lime">✅ Verified</span> Step 2 of 2 · Pick your new password</p>

              <div className="field">
                <label htmlFor="pf-new">New password</label>
                <PasswordInput id="pf-new" autoComplete="new-password" placeholder="at least 6 characters" autoFocus
                  value={pw.next} onChange={setField("next")} />
              </div>
              <div className="field">
                <label htmlFor="pf-confirm">New password again</label>
                <PasswordInput id="pf-confirm" autoComplete="new-password" value={pw.confirm} onChange={setField("confirm")} />
                {mismatch && <div className="hint hint-bad">Doesn't match the new password yet.</div>}
              </div>

              <button type="submit" className="press p-coral full"
                disabled={savingPw || pw.next.length < 6 || !pw.confirm || mismatch}>
                {savingPw ? "Updating…" : "🔑 Update password"}
              </button>
              <button type="button" className="linkish pf-cancel" onClick={startOver}>Cancel</button>
            </form>
          )}
        </div>

        <div className="pop pf-danger">
          <h2 style={{ fontSize: "1.4rem", marginBottom: 8 }}>🗑️ Delete account</h2>
          {!delOpen ? (
            <>
              <p className="muted" style={{ marginBottom: 14 }}>
                Removes your account for good: your scores, friends, match history and the rooms you host. This can't be undone.
              </p>
              <button type="button" className="press p-white" onClick={() => setDelOpen(true)}>Delete my account…</button>
            </>
          ) : (
            <form onSubmit={deleteAccount}>
              <p style={{ marginBottom: 14 }}>
                <b>This is permanent.</b> Your scores, friends, match history and the rooms you host are deleted with it,
                and <b>{user?.username}</b> is free for someone else to take. To be sure it's you, we'll email a code to {user?.email}.
              </p>
              <div className="field">
                <label htmlFor="pf-delcode">Code from your email</label>
                <div className="pf-coderow">
                  <CodeInput id="pf-delcode" value={delCode} onChange={setDelCode} />
                  <button type="button" className="press p-sky" onClick={delMail.send} disabled={delMail.sending || delMail.wait > 0}>
                    {delMail.sending ? "Sending…" : delMail.wait ? `Resend in ${delMail.wait}s` : delMail.sent ? "Send again" : "📧 Send code"}
                  </button>
                </div>
              </div>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <button type="submit" className="press p-coral" disabled={deleting || !CODE_RE.test(delCode)}>
                  {deleting ? "Deleting…" : "Delete my account forever"}
                </button>
                <button type="button" className="press p-white" onClick={() => { setDelOpen(false); setDelCode(""); }}>Keep my account</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
