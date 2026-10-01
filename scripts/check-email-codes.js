// scripts/check-email-codes.js — change password by email code, and delete
// account, against a real backend and database. API-level, no browser.
//
//   1. node scripts/check-email-codes.js --relay      (a fake mail relay on :4590)
//   2. MAIL_URL=http://127.0.0.1:4590/exec MAIL_SECRET=test PORT=4399 node server.js
//   3. node scripts/check-email-codes.js http://127.0.0.1:4399 <user> <user2>
//
// Or let it do 1 itself: step 3 starts the relay in-process when nothing is on
// :4590. No real email is sent: the fake relay keeps each mail so the test can
// read the code out of it. <user> and <user2> are existing accounts with the
// password Passw0rd!23 (register is rate limited); it registers one throwaway
// account and deletes it. Point it at a development database only.
const http = require("http");

const RELAY_PORT = 4590, PW = "Passw0rd!23";
const mails = [];
let relayDown = false;

function startRelay() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        let m = {};
        try { m = JSON.parse(body); } catch { /* bad body */ }
        const out = relayDown ? { ok: false, error: "quota" } : m.secret !== "test" ? { ok: false, error: "forbidden" } : { ok: true, left: 99 };
        if (out.ok) mails.push(m);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out));
      });
    });
    srv.listen(RELAY_PORT, () => resolve(srv));
  });
}

if (process.argv[2] === "--relay") { startRelay().then(() => console.log(`fake relay on :${RELAY_PORT}`)); return; }

const [API, U1, U2] = process.argv.slice(2);
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};
const call = async (path, { method = "GET", token, body } = {}) => {
  const r = await fetch(API + path, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const login = async (username, password = PW) => call("/api/auth/login", { method: "POST", body: { username, password } });
// the code is one digit per tile in the email
const codeIn = (m) => {
  const d = m ? [...m.html.matchAll(/border-radius:12px">(\d)<\/div>/g)].map((x) => x[1]).join("") : "";
  return d.length === 6 ? d : null;
};
const lastMail = () => mails[mails.length - 1];

(async () => {
  const relay = await startRelay().catch(() => null);   // or one is already running
  if (!relay) console.log("      (using the relay already on :4590)");

  const a = await login(U1);
  if (!a.body.token) throw new Error(`login ${U1}: ${JSON.stringify(a.body)}`);
  const tok = a.body.token, email = a.body.user.email;

  // ── change password by code ────────────────────────────────────────────────
  const n0 = mails.length;
  const s1 = await call("/api/auth/email-code", { method: "POST", token: tok, body: { purpose: "password" } });
  check("ask for a code: it's emailed to the account's address", s1.body.success && mails.length === n0 + 1 && lastMail().to === email,
    JSON.stringify(s1.body));
  const code1 = codeIn(lastMail());
  check("…a 6-digit code, in an email that says what it's for", !!code1 && /change your password/.test(lastMail().html) && /password/.test(lastMail().subject));
  const s2 = await call("/api/auth/email-code", { method: "POST", token: tok, body: { purpose: "password" } });
  check("asking again straight away: wait a minute", s2.status === 429 && s2.body.wait > 0 && mails.length === n0 + 1, JSON.stringify(s2.body));

  const wrong = code1 === "000000" ? "111111" : "000000";
  const w1 = await call("/api/auth/change-password", { method: "POST", token: tok, body: { code: wrong, new_password: "N3wPass!word" } });
  check("a wrong code: refused, with tries left — and not a 401 (that would log you out)", w1.status === 400 && /4 tries left/.test(w1.body.message), JSON.stringify(w1.body));
  const short = await call("/api/auth/change-password", { method: "POST", token: tok, body: { code: code1, new_password: "abc" } });
  check("a too-short new password is refused before the code is spent", short.status === 400 && /6-200/.test(short.body.message));
  const ok = await call("/api/auth/change-password", { method: "POST", token: tok, body: { code: code1, new_password: "N3wPass!word" } });
  check("the right code: password changed, no old password needed", ok.body.success, JSON.stringify(ok.body));
  check("…the new password logs in", !!(await login(U1, "N3wPass!word")).body.token);
  check("…the old one doesn't", !(await login(U1)).body.token);
  const again = await call("/api/auth/change-password", { method: "POST", token: tok, body: { code: code1, new_password: "Other!pass1" } });
  check("a code works once", again.status === 400 && /expired|used/.test(again.body.message), JSON.stringify(again.body));
  const back = await call("/api/auth/change-password", { method: "POST", token: tok, body: { current_password: "N3wPass!word", new_password: PW } });
  check("the old way (current password) still works", back.body.success);

  // ── two steps: verify, then the new password (what the page does) ─────────
  const v0 = await call("/api/auth/change-password/verify", { method: "POST", token: tok, body: { current_password: "nope" } });
  check("verify with a wrong password: refused (400, so you stay logged in)", v0.status === 400 && !v0.body.ticket);
  const v1 = await call("/api/auth/change-password/verify", { method: "POST", token: tok, body: { current_password: PW } });
  check("verify with the right one: a ticket for step two", v1.body.success && !!v1.body.ticket);
  const t1 = await call("/api/auth/change-password", { method: "POST", token: tok, body: { ticket: v1.body.ticket, new_password: "Tick3t!pass" } });
  check("the ticket changes the password", t1.body.success && !!(await login(U1, "Tick3t!pass")).body.token, JSON.stringify(t1.body));
  const t2 = await call("/api/auth/change-password", { method: "POST", token: tok, body: { ticket: v1.body.ticket, new_password: "Again!pass1" } });
  check("…once: the same ticket can't change it again", t2.status === 400 && t2.body.expired === true && !!(await login(U1, "Tick3t!pass")).body.token);
  const forged = await call("/api/auth/change-password", { method: "POST", token: tok, body: { ticket: "x.y.z", new_password: "Again!pass1" } });
  check("a made-up ticket is refused", forged.status === 400);
  const vb = await call("/api/auth/change-password/verify", { method: "POST", token: tok, body: { current_password: "Tick3t!pass" } });
  await call("/api/auth/change-password", { method: "POST", token: tok, body: { ticket: vb.body.ticket, new_password: PW } });
  check("(password put back)", !!(await login(U1)).body.token);

  // ── too many wrong tries ───────────────────────────────────────────────────
  // (the resend wait is a minute: use the second account)
  const b = await login(U2);
  const tok2 = b.body.token;
  await call("/api/auth/email-code", { method: "POST", token: tok2, body: { purpose: "password" } });
  const vc = await call("/api/auth/change-password/verify", { method: "POST", token: tok2, body: { code: codeIn(lastMail()) } });
  check("verify with an emailed code: a ticket too", vc.body.success && !!vc.body.ticket, JSON.stringify(vc.body));
  const vc2 = await call("/api/auth/change-password/verify", { method: "POST", token: tok2, body: { code: codeIn(lastMail()) } });
  check("…and that code is now spent", vc2.status === 400);
  await new Promise((r2) => setTimeout(r2, 61000));    // the resend wait, before the next code
  await call("/api/auth/email-code", { method: "POST", token: tok2, body: { purpose: "password" } });
  const code2 = codeIn(lastMail());
  const bad = code2 === "222222" ? "333333" : "222222";
  let r;
  for (let i = 0; i < 5; i++) r = await call("/api/auth/change-password", { method: "POST", token: tok2, body: { code: bad, new_password: "N3wPass!word" } });
  check("five wrong tries use the code up", /Too many wrong tries/.test(r.body.message), r.body.message);
  r = await call("/api/auth/change-password", { method: "POST", token: tok2, body: { code: code2, new_password: "N3wPass!word" } });
  check("…after which even the right code is refused", !r.body.success && !!(await login(U2)).body.token);

  // ── delete account ─────────────────────────────────────────────────────────
  const name = `del${Date.now().toString(36).slice(-6)}`;
  const reg = await call("/api/auth/register", { method: "POST", body: { username: name, email: `${name}@example.com`, password: PW } });
  if (!reg.body.token) throw new Error("register: " + JSON.stringify(reg.body));
  const dt = reg.body.token;
  // give it things to delete: a room it hosts, a friend request
  const room = await call("/api/rooms", { method: "POST", token: dt, body: { game_slug: "numbers", max_players: 2, duration_seconds: 60 } });
  const code = room.body.room && room.body.room.room_code;
  const fq = await call("/api/friends/request", { method: "POST", token: dt, body: { user_id: a.body.user.id } });
  const pend0 = await call("/api/friends/pending", { token: tok });
  check("(set-up) it hosts a room and has sent a friend request", !!code && fq.body.success && JSON.stringify(pend0.body).includes(name));

  const noCode = await call("/api/auth/delete-account", { method: "POST", token: dt, body: {} });
  check("delete without a code: refused", noCode.status === 400 && /6-digit/.test(noCode.body.message));

  relayDown = true;
  const down = await call("/api/auth/email-code", { method: "POST", token: dt, body: { purpose: "delete" } });
  relayDown = false;
  check("if the mail can't be sent, it says so", down.status === 502 && /Couldn't send/.test(down.body.message), JSON.stringify(down.body));
  const up = await call("/api/auth/email-code", { method: "POST", token: dt, body: { purpose: "delete" } });
  check("…and a failed send doesn't make you wait to try again", up.body.success, JSON.stringify(up.body));
  check("the delete email says what it's for", /delete your account/.test(lastMail().html) && lastMail().to === `${name}@example.com`);
  const dcode = codeIn(lastMail());
  const del = await call("/api/auth/delete-account", { method: "POST", token: dt, body: { code: dcode } });
  check("the right code: account deleted", del.body.success, JSON.stringify(del.body));
  check("…it can't log in", !(await login(name)).body.token);
  const me = await call("/api/auth/me", { token: dt });
  check("…its old token finds nobody", me.status === 404);
  const rm = code ? await call(`/api/rooms/${code}`, { token: tok }) : { status: 404 };
  check("…the room it hosted is gone", rm.status === 404, `room ${code}: ${rm.status}`);
  const fr = await call("/api/friends/pending", { token: tok });
  check("…and so is its friend request", !JSON.stringify(fr.body).includes(name));
  const re = await call("/api/auth/register", { method: "POST", body: { username: name, email: `${name}@example.com`, password: PW } });
  check("…its name and email are free again", !!re.body.token);
  if (re.body.token) {
    // tidy up the re-registration too (and prove a fresh account can delete itself)
    await new Promise((r2) => setTimeout(r2, 50));
    await call("/api/auth/email-code", { method: "POST", token: re.body.token, body: { purpose: "delete" } });
    await call("/api/auth/delete-account", { method: "POST", token: re.body.token, body: { code: codeIn(lastMail()) } });
  }

  // ── not mid-match ──────────────────────────────────────────────────────────
  const host = await login(U1), guest = await login(U2);
  const mr = await call("/api/rooms", { method: "POST", token: host.body.token, body: { game_slug: "numbers", max_players: 2, duration_seconds: 60 } });
  const mcode = mr.body.room && mr.body.room.room_code;
  await call("/api/rooms/join", { method: "POST", token: guest.body.token, body: { room_code: mcode } });
  await call(`/api/rooms/${mcode}/start`, { method: "PATCH", token: host.body.token });
  const mid = await call("/api/auth/delete-account", { method: "POST", token: guest.body.token, body: { code: "123456" } });
  check("in a match: can't delete until it's over", mid.status === 409 && /match/.test(mid.body.message), JSON.stringify(mid.body));
  await call(`/api/rooms/${mcode}/leave`, { method: "POST", token: guest.body.token });
  await call(`/api/rooms/${mcode}/leave`, { method: "POST", token: host.body.token });

  if (relay) relay.close();
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
