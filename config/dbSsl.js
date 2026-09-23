// config/dbSsl.js — TLS settings for reaching a hosted MySQL.
//
// Hosted MySQL (Aiven and the like) refuses plaintext connections and presents
// a certificate signed by its own CA, so that CA has to be handed in or the
// handshake fails with "self signed certificate in certificate chain".
//
// DB_SSL_CA holds the PEM text itself rather than a path: Render's environment
// variables take multi-line values, so there's no certificate file to deploy
// and nothing secret to commit. Pasting a PEM into a .env collapses the real
// newlines into a literal \n, so those are put back.
//
// Shared by config/db.js (the app's pool) and config/setupDb.js (the one-shot
// bootstrapper), so the two can't drift apart and leave setup unable to
// connect to the database the app happily uses.
function sslOptions() {
  const ca = (process.env.DB_SSL_CA || "").trim();
  if (ca) return { ca: ca.replace(/\\n/g, "\n"), minVersion: "TLSv1.2" };
  // No CA given, but TLS still wanted: only works if the host's certificate
  // comes from a public CA that Node already trusts.
  if (process.env.DB_SSL === "true") return { minVersion: "TLSv1.2" };
  return undefined;                       // local MySQL, no TLS
}

module.exports = { sslOptions };
