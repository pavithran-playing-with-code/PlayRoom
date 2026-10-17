// scripts/check-forgot-password.js — getting back in when you've forgotten
// your password (logged out): /api/auth/forgot/code, /verify, /reset.
// API-level, against a real backend and database, no browser.
//
//   1. MAIL_URL=http://127.0.0.1:4590/exec MAIL_SECRET=test PORT=4399 node server.js
//   2. node scripts/check-forgot-password.js http://127.0.0.1:4399
//
// It starts a fake mail relay on :4590 (or uses one already there) and reads
// the code out of the mail, so no real email is sent. It registers one
// throwaway account and deletes it at the end (about a minute later: the
// resend wait). Point it at a development database only.
const http = require("http");

const RELAY_PORT = 4590, PW = "Passw0rd!23";
const mails = [];
function startRelay() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        let m = {};
        try { m = JSON.parse(body); } catch { /* bad body */ }
        const ok = m.secret === "test";
        if (ok) mails.push(m);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(ok ? { ok: true, left: 99 } : { ok: false, error: "forbidden" }));
      });
    });
    srv.on("error", reject);
    srv.listen(RELAY_PORT, () => resolve(srv));
  });
}

const API = process.argv[2] || "http://127.0.0.1:4399";
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const call = async (path, { method = "GET", token, body } = {}) => {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const post = (path, body, token) => call(path, { method: "POST", body, token });
const login = (username, password) => post("/api/auth/login", { username, password });
const codeIn = (m) => { const d = m ? [...m.html.matchAll(/border-radius:12px">(\d)<\/div>/g)].map((x) => x[1]).join("") : ""; return d.length === 6 ? d : null; };
const lastMail = () => mails[mails.length - 1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const relay = await startRelay().catch(() => null);
  if (!relay) console.log("      (using the relay already on :4590 — codes can't be read from it)");

  const name = `fg${Date.now().toString(36).slice(-7)}`, email = `${name}@example.com`;
  const reg = await post("/api/auth/register", { username: name, email, password: PW });
  if (!reg.body.token) throw new Error("register: " + JSON.stringify(reg.body));

  const nobody = await post("/api/auth/forgot/code", { who: "no-such-player-xyz" });
  check("an unknown username or email: said so, nothing sent", nobody.status === 404 && !mails.some((m) => m.to === "no-such-player-xyz"));

  const n0 = mails.length;
  const s1 = await post("/api/auth/forgot/code", { who: name });
  check("by username, logged out: a code is emailed to the account's address", s1.body.success && mails.length === n0 + 1 && lastMail().to === email, JSON.stringify(s1.body));
  check("…the page is told the address only partly", s1.body.email && s1.body.email !== email && s1.body.email.endsWith("@example.com") && s1.body.email.includes("••••"), s1.body.email);
  const code = codeIn(lastMail());
  check("…the same 6-digit code email as ever", !!code && /change your password/.test(lastMail().html));
  const s2 = await post("/api/auth/forgot/code", { who: email.toUpperCase() });
  check("asking again straight away (by email this time): wait a minute", s2.status === 429 && s2.body.wait > 0 && mails.length === n0 + 1, JSON.stringify(s2.body));

  const wrong = code === "000000" ? "111111" : "000000";
  const w = await post("/api/auth/forgot/verify", { who: name, code: wrong });
  check("a wrong code: refused, tries left", w.status === 400 && /4 tries left/.test(w.body.message), JSON.stringify(w.body));
  const v = await post("/api/auth/forgot/verify", { who: email, code });
  check("the right code (by email): a ticket", v.body.success && !!v.body.ticket, JSON.stringify(v.body));
  const v2 = await post("/api/auth/forgot/verify", { who: name, code });
  check("…and the code is spent", v2.status === 400 && !v2.body.ticket);

  const short = await post("/api/auth/forgot/reset", { ticket: v.body.ticket, new_password: "abc" });
  check("a too-short new password is refused (the ticket still good)", short.status === 400 && /6-200/.test(short.body.message));
  const same = await post("/api/auth/forgot/reset", { ticket: v.body.ticket, new_password: PW });
  check("the same password again: told you can just log in", same.status === 400 && /already your password/.test(same.body.message));
  const r = await post("/api/auth/forgot/reset", { ticket: v.body.ticket, new_password: "Fresh!pass9" });
  check("a new password: saved, and you're logged in", r.body.success && !!r.body.token && r.body.user && r.body.user.username === name && !r.body.user.password, JSON.stringify(r.body).slice(0, 160));
  const me = await call("/api/auth/me", { token: r.body.token });
  check("…that login is real", me.body.success && me.body.user.username === name);
  check("…the new password logs in", !!(await login(name, "Fresh!pass9")).body.token);
  check("…the old one doesn't", !(await login(name, PW)).body.token);
  const again = await post("/api/auth/forgot/reset", { ticket: v.body.ticket, new_password: "Other!pass9" });
  check("the ticket works once", again.status === 400 && again.body.expired === true && !!(await login(name, "Fresh!pass9")).body.token);
  const forged = await post("/api/auth/forgot/reset", { ticket: "x.y.z", new_password: "Other!pass9" });
  check("a made-up ticket is refused", forged.status === 400);
  // a logged-in change-password ticket is for that, not this
  const tok = (await login(name, "Fresh!pass9")).body.token;
  const other = await post("/api/auth/change-password/verify", { current_password: "Fresh!pass9" }, tok);
  const cross = await post("/api/auth/forgot/reset", { ticket: other.body.ticket, new_password: "Other!pass9" });
  check("a logged-in change-password ticket can't be used here", !!other.body.ticket && cross.status === 400 && !!(await login(name, "Fresh!pass9")).body.token);

  // tidy up: the throwaway account (after the resend wait)
  await sleep(61000);
  await post("/api/auth/email-code", { purpose: "delete" }, tok);
  const del = await post("/api/auth/delete-account", { code: codeIn(lastMail()) }, tok);
  check("(throwaway account deleted)", del.body.success, JSON.stringify(del.body));

  if (relay) relay.close();
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
