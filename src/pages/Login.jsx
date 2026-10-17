// src/pages/Login.jsx
// Logging in — and, if you've forgotten your password, getting back in: your
// username or email, a 6-digit code mailed to the account's address, a new
// password, and you're logged in (routes/auth.js, /forgot/*).
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import Detective, { useDetective } from "../components/characters/Detective";
import { useToast, PasswordInput } from "../components/ui";

const CODE_RE = /^\d{6}$/;

// Forgotten password: three steps on the same card.
//   who   your username or email  → a code is mailed
//   code  the 6 digits            → a ticket, good for 10 minutes
//   pass  a new password, twice   → saved, and you're logged in
function Forgot({ startWho, onBack, onDone, det, toast }) {
  const [step, setStep] = useState("who");
  const [who, setWho] = useState(startWho || "");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState(null);
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  const countdown = (secs) => {
    clearInterval(timer.current);
    setWait(secs);
    timer.current = setInterval(() => setWait((w) => { if (w <= 1) { clearInterval(timer.current); return 0; } return w - 1; }), 1000);
  };
  const post = async (path, body) => {
    const res = await api.post(path, body);
    return res.json();
  };

  async function sendCode(e) {
    if (e) e.preventDefault();
    if (!who.trim()) { det.setMood("oops", 1800); toast.error("Your username or email, please"); return; }
    if (busy || wait) return;
    setBusy(true);
    try {
      const data = await post("/api/auth/forgot/code", { who: who.trim() });
      if (data.wait) countdown(data.wait);
      if (!data.success) { det.setMood("oops", 2200); toast.error(data.message || "Couldn't send the code."); return; }
      setEmail(data.email);
      countdown(data.resend || 60);
      setStep("code");
      toast.success(`Code sent to ${data.email}. Check your inbox (and spam).`);
    } catch { toast.error("Couldn't reach the server."); }
    finally { setBusy(false); }
  }

  async function checkCode(e) {
    e.preventDefault();
    if (!CODE_RE.test(code)) { det.setMood("oops", 1800); toast.error("Enter the 6-digit code from the email."); return; }
    setBusy(true);
    try {
      const data = await post("/api/auth/forgot/verify", { who: who.trim(), code });
      if (!data.success) { det.setMood("oops", 2200); toast.error(data.message || "That code didn't work."); return; }
      setTicket(data.ticket);
      setStep("pass");
    } catch { toast.error("Couldn't reach the server."); }
    finally { setBusy(false); }
  }

  async function save(e) {
    e.preventDefault();
    if (pw.next.length < 6) { det.setMood("oops", 1800); toast.error("At least 6 characters, please."); return; }
    if (pw.next !== pw.confirm) { det.setMood("oops", 1800); toast.error("Those two don't match."); return; }
    setBusy(true);
    try {
      const data = await post("/api/auth/forgot/reset", { ticket, new_password: pw.next });
      if (!data.success) {
        det.setMood("oops", 2200);
        toast.error(data.message || "Couldn't save it.");
        if (data.expired) { setStep("who"); setCode(""); setTicket(null); }
        return;
      }
      onDone(data);
    } catch { toast.error("Couldn't reach the server."); }
    finally { setBusy(false); }
  }

  const dots = ["who", "code", "pass"].indexOf(step);
  return (
    <>
      <h1 style={{ fontSize: "2rem", marginBottom: 6 }}>Forgot it? 🔑</h1>
      <p className="muted" style={{ marginBottom: 14 }}>
        {step === "who" && "We'll email a 6-digit code to your account's address."}
        {step === "code" && <>We sent a code to <b>{email}</b>. It works for 10 minutes.</>}
        {step === "pass" && "Last step: pick a new password."}
      </p>
      <div className="lg-steps" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i <= dots ? "on" : ""} />)}</div>

      {step === "who" && (
        <form onSubmit={sendCode}>
          <div className="field">
            <label htmlFor="fg-who">Username or email</label>
            <input id="fg-who" type="text" placeholder="your username" autoComplete="username"
              value={who} onChange={(e) => setWho(e.target.value)} autoFocus />
          </div>
          <button type="submit" className="press p-coral lg full" style={{ marginTop: 6 }} disabled={busy || !!wait}>
            {busy ? "Sending…" : wait ? `Send again in ${wait}s` : "📧 Email me a code"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={checkCode}>
          <div className="field">
            <label htmlFor="fg-code">Code from your email</label>
            <div className="pf-coderow">
              <input id="fg-code" className="pf-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                placeholder="123456" value={code} autoFocus
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
              <button type="button" className="press p-white" onClick={() => sendCode()} disabled={busy || !!wait}>
                {wait ? `Resend in ${wait}s` : "Send again"}
              </button>
            </div>
          </div>
          <button type="submit" className="press p-coral lg full" style={{ marginTop: 6 }} disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Next →"}
          </button>
          <button type="button" className="lg-linkbtn" onClick={() => { setStep("who"); setCode(""); }}>Wrong account? Change it</button>
        </form>
      )}

      {step === "pass" && (
        <form onSubmit={save}>
          <div className="field">
            <label htmlFor="fg-new">New password</label>
            <PasswordInput id="fg-new" placeholder="at least 6 characters" autoComplete="new-password"
              value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} {...det.secretProps} />
          </div>
          <div className="field">
            <label htmlFor="fg-confirm">New password again</label>
            <PasswordInput id="fg-confirm" placeholder="the same again" autoComplete="new-password"
              value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} {...det.secretProps} />
          </div>
          <button type="submit" className="press p-coral lg full" style={{ marginTop: 6 }} disabled={busy}>
            {busy ? "Saving…" : "💾 Save and log in"}
          </button>
        </form>
      )}

      <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
        <button type="button" className="press p-white sm" onClick={onBack}>← Back to log in</button>
      </div>
    </>
  );
}

export default function Login() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);
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
          {forgot ? (
            <Forgot startWho={form.username} det={det} toast={toast}
              onBack={() => { det.stopPeeking(); setForgot(false); }}
              onDone={(data) => {
                det.stopPeeking();
                det.setMood("cheer");
                login(data.user, data.token);
                toast.success(`Password changed — welcome back, ${data.user.username}!`);
                navigate("/lobby");
              }} />
          ) : (
            <>
              <h1 style={{ fontSize: "2rem", marginBottom: 6 }}>Welcome back!</h1>
              <p className="muted" style={{ marginBottom: 24 }}>Your friends have been waiting.</p>

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
                  <PasswordInput id="lg-pass" placeholder="••••••••" autoComplete="current-password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    {...det.secretProps} />
                  <button type="button" className="lg-forgot" onClick={() => { det.stopPeeking(); setForgot(true); }}>
                    Forgot password?
                  </button>
                </div>

                <button type="submit" className="press p-coral lg full" style={{ marginTop: 6 }} disabled={loading}>
                  {loading ? "Checking your papers…" : "🚪 Let me in"}
                </button>
              </form>

              <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
                <span className="muted" style={{ fontSize: ".95rem" }}>First time here?</span>
                <Link to="/register" className="press p-white sm">Make an account</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
