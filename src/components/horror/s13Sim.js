// src/components/horror/s13Sim.js
// STATION 13, solo: one run of the hospital — you, the fuses, the monster.
// The rules are s13Core.mjs (shared with the online game and the server);
// this is the run around them: pickups and the power coming back, the
// monster, the scripted scares, the lines it says to you, the win and the
// catch. Nothing here draws or plays sound: anything the page should hear
// about is pushed onto `s.events`. No React, no DOM — it runs from Node.
import {
  genStation, placeItems, placeMonsters, newPlayer, stepPlayer, drainTorch, stepMonster, tension, litZones, setTarget,
  lockerNear, hideIn, leaveLocker, atExit, zoneAt, ZN, NEED, PICK_R, BATTERY_GIVES, rng, START,
} from "./s13Core.mjs";

export function newRun(seed) {
  const st = genStation(seed);
  const { items, lockers } = placeItems(st, seed);
  const rand = rng((Number(seed) || 1) + 991);
  const s = {
    seed, st, items, lockers, rand,
    P: newPlayer(START.x, START.y, START.yaw),
    M: placeMonsters(st, seed, 1)[0],
    fuses: 0, lit: litZones(0), time: 0, evT: 25, flick: 0, shake: 0, area: "", tlv: 0,
    msg: "", msgT: 0, mode: "play", deadT: 0, events: [],
  };
  say(s, "Lit areas are safe to read. Dark ones are not. Follow the green signs.", 6);
  return s;
}

const ev = (s, name, o) => s.events.push({ name, ...(o || {}) });
export function say(s, text, secs) { s.msg = text; s.msgT = secs || 4; }
export const areaName = (s) => ZN[zoneAt(s.st, s.P.x, s.P.y)] || "";

// E: into the locker within reach, or out of the one you're in
export function interact(s) {
  if (s.mode !== "play") return;
  const P = s.P;
  if (P.hid) { leaveLocker(P); ev(s, "locker"); return; }
  const l = lockerNear(s.lockers, P.x, P.y);
  if (!l) return;
  hideIn(P, l);
  ev(s, "locker");
  // light off in here and it loses you; light on and it can still find you
  if (P.fl && P.bat > 0) say(s, "Switch your light off — it will see it.", 3.5);
}
export const actionLabel = (s) => (s.mode !== "play" ? "" : s.P.hid ? "LEAVE" : lockerNear(s.lockers, s.P.x, s.P.y) ? "HIDE" : "");
export function toggleLight(s) { if (s.P.bat > 0) { s.P.fl = !s.P.fl; ev(s, "click"); } }

function caught(s, hidden) {
  if (s.mode !== "play") return;
  s.mode = "dead"; s.deadT = 0;
  if (hidden) s.P.hid = null;
  // it, right in front of you
  s.P.yaw = Math.atan2(-(s.M.x - s.P.x), -(s.M.y - s.P.y));
  s.M.x = s.P.x - Math.sin(s.P.yaw) * 0.9; s.M.y = s.P.y - Math.cos(s.P.yaw) * 0.9;
  s.shake = 1.4;
  ev(s, "scream"); ev(s, "caught");
  say(s, "", 0);
}

// One frame. `inp`: { ix, iz, run }.
export function tick(s, inp, dt) {
  if (s.mode === "dead") { s.deadT += dt; return; }
  if (s.mode !== "play") return;
  const { P, M, st } = s;
  s.time += dt;
  s.tlv = tension(M, P.x, P.y);
  for (const n of stepPlayer(P, st, inp, dt)) ev(s, n);
  if (drainTorch(P, dt, s.tlv)) say(s, "The flashlight dies.", 3);

  for (const it of s.items) {
    if (it.got || Math.hypot(it.x - P.x, it.y - P.y) >= PICK_R) continue;
    it.got = true;
    ev(s, "pick");
    if (it.t === "f") {
      s.fuses++;
      const before = s.lit;
      s.lit = litZones(s.fuses);
      const fresh = [...s.lit].filter((z) => !before.has(z)).map((z) => ZN[z]);
      s.flick = 3;
      ev(s, "bang"); ev(s, "power");
      // picking one up is noisy: it comes to look
      if (M.st !== "chase" && M.st !== "sleep") { M.st = "invest"; M.wait = 0; setTarget(M, st, P.x | 0, P.y | 0); }
      if (s.fuses >= NEED) {
        say(s, "Power restored. The elevator is waiting. So is IT.", 6);
        ev(s, "alarm");
        if (M.st !== "sleep") { M.st = "invest"; M.wait = 0; setTarget(M, st, P.x | 0, P.y | 0); }
      } else say(s, `Fuse ${s.fuses}/${NEED}. ${fresh.length ? `Power returns: ${fresh.join(", ")}. ` : ""}Something heard that.`, 5);
    } else { P.bat = Math.min(100, P.bat + BATTERY_GIVES); say(s, "Battery found.", 2); }
  }

  const target = { id: 1, x: P.x, y: P.y, fl: P.fl && P.bat > 0, hid: !!P.hid, moving: P.moving, run: P.run };
  const got = stepMonster(M, st, [target], dt, s.rand, { lit: s.lit, fuses: s.fuses }, (name, o) => {
    if (name === "notice") { ev(s, "growl"); s.shake = 0.7; s.flick = 2; say(s, "It noticed you. Break line of sight!", 3.5); }
    else if (name === "chase") say(s, "RUN.", 2);
    else if (name === "lostsight") say(s, "It lost track of you.", 2.5);
    else if (name === "gaveup") say(s, "You lost it... for now.", 3);
    else if (name === "rear") ev(s, "growl");
    else if (name === "zone") {
      if (Math.hypot(o.x - P.x, o.y - P.y) > 7 && s.rand() < 0.6) {
        ev(s, "bangAt", { x: o.x, y: o.y });
        if (s.rand() < 0.4 && s.msgT <= 0) say(s, "A distant bang echoes through the building.", 3);
      }
    } else if (name === "door") ev(s, "creakAt", { x: st.doors[o.i].x + 0.5, y: st.doors[o.i].y + 0.5 });
  });
  if (got) { caught(s, got.hidden); return; }

  if (s.fuses >= NEED && atExit(P.x, P.y)) { s.mode = "won"; ev(s, "door"); ev(s, "win"); return; }

  // the building, now and then, when it isn't hunting you
  s.evT -= dt;
  if (s.evT <= 0 && M.st !== "chase") {
    s.evT = 22 + s.rand() * 25;
    const r = s.rand();
    if (r < 0.35) { ev(s, "bang"); say(s, "Something fell over in the dark.", 3.5); s.flick = 1.5; }
    else if (r < 0.7) { ev(s, "whisper"); say(s, "...behind you...", 3); }
    else { s.flick = 2.5; say(s, "The lights flicker.", 2.5); }
  }
  s.flick = Math.max(0, s.flick - dt);
  s.shake = Math.max(0, s.shake - dt * 1.5);
  if (s.msgT > 0) { s.msgT -= dt; if (s.msgT <= 0) s.msg = ""; }
  s.area = areaName(s);
}

export const timeText = (sec) => { const n = Math.floor(sec); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`; };
