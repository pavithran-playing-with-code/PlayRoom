// config/mailer.js — sending email, for free.
//
// Render's free tier blocks the outgoing mail ports (25, 465, 587), so no SMTP.
// Instead a small Google Apps Script, published as a web app from the
// owner's Gmail, sends the mail: we POST it { secret, to, subject, html } over
// HTTPS and it calls MailApp.sendEmail. About 100 emails a day, free, and they
// really come from Gmail, so they land in the inbox. Setup: docs/RUNBOOK.md.
//
//   MAIL_URL     the web app's /exec URL
//   MAIL_SECRET  the word the script checks before it sends anything

const TIMEOUT_MS = 15000;

const mailReady = () => !!(process.env.MAIL_URL && process.env.MAIL_SECRET);

async function sendMail({ to, subject, html }) {
  if (!mailReady()) throw new Error("mail: MAIL_URL / MAIL_SECRET not set");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // text/plain, not JSON: Apps Script answers with a redirect, and a plain
    // body keeps it a "simple" request it accepts without fuss.
    const r = await fetch(process.env.MAIL_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ secret: process.env.MAIL_SECRET, to, subject, html }),
      redirect: "follow",
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => null);
    if (!data || !data.ok) throw new Error(`mail relay said ${data ? data.error : `HTTP ${r.status}`}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendMail, mailReady };
