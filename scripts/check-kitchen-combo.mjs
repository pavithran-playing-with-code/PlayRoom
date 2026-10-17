// scripts/check-kitchen-combo.mjs — Kitchen Rush's service combo (src/components/together/kitchenCore.mjs).
//
//   node scripts/check-kitchen-combo.mjs
//
// Orders served one after another build a combo, each 10% more than the last
// up to half again; a plate nobody ordered or an order that runs out ends it;
// the view carries it; the summary keeps the best.
import * as k from "../src/components/together/kitchenCore.mjs";

let fails = 0;
const ok = (n, pass, extra = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}${extra ? "  " + extra : ""}`); };

ok("x1 for the first, +10% each after, at most x1.5", k.comboMult(1) === 1 && Math.abs(k.comboMult(3) - 1.2) < 1e-9 && k.comboMult(99) === 1.5);

// a kitchen with one chef standing at the window, salads ordered, a finished salad in hand each time
const s = k.createSide(5, { players: [1], durMs: 120000 });
const chef = s.players.get(1);
chef.x = 1.5; chef.y = 2.5;                                  // beside the window at (0,2)
const salad = () => ({ k: "plate", s: "", p: 0, on: ["lettuce", "tomato"] });
const order = () => { s.orders.push({ id: ++s.oid, r: "salad", until: s.t + 1000, life: 1000 }); };
const got = [];
for (let i = 0; i < 7; i++) {
  order(); chef.hold = salad();
  const before = s.score;
  k.use(s, 1, 0, 2);
  got.push(s.score - before);
}
const base = 40 + Math.round(40 * k.TIP * 1);                // served at once: the full tip
ok("served one after another: each worth more", got[0] === base && got[1] === Math.round(base * 1.1) && got[2] === Math.round(base * 1.2), got.join(","));
ok("…up to half again", got[6] === Math.round(base * 1.5) && s.streak === 7);
ok("the view carries the combo", k.view(s, true).sk === 7);
// a plate nobody ordered ends it
chef.hold = { k: "plate", s: "", p: 0, on: ["bun", "meat"] };
k.use(s, 1, 0, 2);
ok("a plate nobody ordered ends the combo", s.streak === 0);
order(); chef.hold = salad(); const b2 = s.score; k.use(s, 1, 0, 2);
ok("…the next serve starts again at x1", s.score - b2 === base && s.streak === 1);
// an order that runs out ends it
s.orders.push({ id: ++s.oid, r: "burger", until: s.t + 0.05, life: 60 });
k.step(s, 0.1);
ok("an order running out ends the combo", s.streak === 0);
ok("the summary keeps the best combo", k.summary(s).combo === 7);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
