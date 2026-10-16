// scripts/check-hollow-relay.js — Hollow Hours' relays in config/socket.js
// (hh:kid, hh:room), with socket.io and presence faked: no server, no
// database, a second to run.
//
//   node scripts/check-hollow-relay.js
//
// A pretend phone connects; we fire messages at its handlers and see what the
// rest of the room would be sent: the sender's id stamped from its login (not
// from the message), bad shapes and oversized messages dropped, the rate
// capped — but never a message saying someone was caught.
const path = require("path");
const stub = (rel, exports) => { const file = require.resolve(path.join(__dirname, "..", rel)); require.cache[file] = { id: file, filename: file, loaded: true, exports }; };

// presence: nobody's friends, nobody online — and anything else it's asked, a harmless no-op
const known = { online: new Map(), isOnline: () => false, onlineUserIds: () => [], friendIdsOf: async () => [] };
stub("config/presence.js", new Proxy(known, { get: (o, k) => (k in o ? o[k] : () => undefined) }));
// socket.io: a Server that only remembers its connection handler
let onConnection = null;
const sent = [];
class FakeServer {
  constructor() { this.handlers = {}; }
  use() {}
  on(ev, fn) { if (ev === "connection") onConnection = fn; }
  to(ch) { return { emit: (ev, p) => sent.push({ ch, ev, p }), volatile: { emit: (ev, p) => sent.push({ ch, ev, p, volatile: true }) } }; }
}
const sioFile = require.resolve("socket.io");
require.cache[sioFile] = { id: sioFile, filename: sioFile, loaded: true, exports: { Server: FakeServer } };

const { initSocket } = require(path.join(__dirname, "..", "config", "socket"));
initSocket({});

let fails = 0;
const check = (n, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

// a phone: user 7, its handlers caught as it connects
function phone(uid) {
  const h = {};
  const sock = {
    id: "s" + uid, user: { id: uid }, handshake: { auth: {} }, data: {}, rooms: new Set(),
    on(ev, fn) { h[ev] = fn; }, emit() {}, join() {}, leave() {}, disconnect() {},
    to(ch) { return { emit: (ev, p) => sent.push({ ch, ev, p, from: uid }), volatile: { emit: (ev, p) => sent.push({ ch, ev, p, from: uid, volatile: true }) } }; },
    broadcast: { emit() {} },
  };
  onConnection(sock);
  return h;
}
const h = phone(7);
check("the Hollow relays are there", typeof h["hh:kid"] === "function" && typeof h["hh:room"] === "function");

const kid = (o = {}) => ({ code: "ABCD", d: { r: 2, x: 3.2, y: 0, z: 2.5, st: "ground", ev: [], use: [], ...o } });
const last = () => sent[sent.length - 1];

sent.length = 0;
h["hh:kid"]({ ...kid(), user_id: 99 });
check("a kid is relayed to the room, stamped with the sender's own id", sent.length === 1 && last().ch === "room:ABCD" && last().ev === "hh:kid" && last().p.user_id === 7 && last().p.d.x === 3.2);

sent.length = 0;
h["hh:kid"]({ code: "AB", d: kid().d });
h["hh:kid"]({ code: "ABCD", d: [1, 2] });
h["hh:kid"]({ code: "ABCD", d: { ...kid().d, x: "far" } });
h["hh:kid"]({ code: "ABCD", d: { ...kid().d, r: 1000 } });
h["hh:kid"]({ code: "ABCD", d: { ...kid().d, ev: new Array(80).fill({ n: "step" }) } });
h["hh:kid"]({ code: "ABCD", d: { ...kid().d, pad: "x".repeat(5000) } });
check("bad codes, shapes and oversized messages are dropped", sent.length === 0, `${sent.length} got through`);

// the rate cap: a burst gets thinned, but a catch always goes through
sent.length = 0;
for (let i = 0; i < 10; i++) h["hh:kid"](kid({ x: i }));
const thinned = sent.length;
h["hh:kid"](kid({ caught: { who: "7", by: "cuckoo" } }));
h["hh:kid"](kid({ use: [{ n: "lever", x: 7, y: 11.6, z: 4.8 }] }));
check("a burst of kids is thinned; a catch and a lever pull are never dropped", thinned < 10 && sent.length === thinned + 2, `${thinned} of 10, then ${sent.length - thinned} of 2`);

// the host's room
sent.length = 0;
h["hh:room"]({ code: "ABCD", d: { r: 4, rt: 12.5, rs: { burst: true }, K: { x: 5, z: 3, st: "chase" }, kin: [], gone: [], mov: [], rev: [{ n: "burst", x: 0.8, y: 2, z: 5.5 }] } });
check("the host's room is relayed whole", sent.length === 1 && last().ev === "hh:room" && last().p.user_id === 7 && last().p.d.K.st === "chase");
sent.length = 0;
h["hh:room"]({ code: "ABCD", d: { r: 4 } });
h["hh:room"]({ code: "ABCD", d: { r: 4, rt: 1, pad: "x".repeat(9000) } });
check("a room without its clock, or too big, is dropped", sent.length === 0);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
