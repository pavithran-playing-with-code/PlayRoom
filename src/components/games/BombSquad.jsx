// src/components/games/BombSquad.jsx
// BOMB SQUAD — one of you sees the bomb, the rest of you have the manual.
// Talk it through: "four wires, the last one's yellow" — "cut the first".
// Solo, against friends (a bomb each, the same bombs), in teams, or together.
//
// The server runs the bombs (config/togetherWorld.js, rules in
// together/bombCore.mjs): it holds the timer, judges every cut and press,
// and sends the bomb's insides to the defuser's phone only. Everyone on the
// side sees the timer, the strikes and what's done; the next bomb goes to
// the next player.
import React, { useEffect, useRef, useState } from "react";
import GameFrame from "./GameFrame";
import TogetherResults from "../together/TogetherResults";
import useTogether, { secondsLeft, rivals, myScore } from "../together/useTogether";
import { COLOURS, KEYPAD_COLUMNS, SIMON_MAP, MANUAL, MAX_STRIKES, fmt } from "../together/bombCore.mjs";

const KIND_NAME = { wires: "Wires", button: "Button", keypad: "Symbols", simon: "Simon" };
const KIND_ICON = { wires: "🔌", button: "🔴", keypad: "🔣", simon: "🟦" };
const WHY = { wrong: "Strike! That wasn't it.", held: "Strike! That one wanted a quick press.", tapped: "Strike! That one wanted holding.", timing: "Strike! Wrong moment to let go." };
const SOUND_KEY = "bomb.sound";

// ── sound: beeps, a chime, a bang ────────────────────────────────────────────
function makeSound() {
  let ctx = null;
  const ready = () => {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const tone = (f, dur, type = "square", vol = 0.08, when = 0) => {
    const c = ready(); if (!c) return;
    const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  return {
    beep: (urgent) => tone(urgent ? 1320 : 990, 0.07),
    good: () => { tone(660, 0.12, "triangle", 0.12); tone(990, 0.18, "triangle", 0.12, 0.1); },
    bad: () => tone(140, 0.3, "sawtooth", 0.12),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "triangle", 0.12, i * 0.1)),
    boom: () => {
      const c = ready(); if (!c) return;
      const n = c.sampleRate * 0.9, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      f.type = "lowpass"; f.frequency.value = 700; g.gain.value = 0.6;
      src.buffer = buf; src.connect(f); f.connect(g); g.connect(c.destination); src.start();
    },
    close: () => { try { ctx && ctx.close(); } catch { /* gone */ } },
  };
}

// ── the bomb's modules ───────────────────────────────────────────────────────
function Wires({ m, onCut }) {
  return (
    <div className="bs-wires">
      {m.colours.map((c, i) => {
        const cut = m.cut.includes(i);
        return (
          <button key={i} className={`bs-wire${cut ? " cut" : ""}`} onClick={() => !cut && !m.done && onCut(i)} disabled={cut || m.done}
            aria-label={`Wire ${i + 1}, ${c}${cut ? ", cut" : ""}`}>
            <span className="bs-n">{i + 1}</span>
            <span className="bs-post" />
            <span className="bs-line" style={{ "--wc": COLOURS[c] }}><i /><i /></span>
            <span className="bs-post" />
          </button>
        );
      })}
    </div>
  );
}

function BigButton({ m, onDown, onUp, strip }) {
  const [held, setHeld] = useState(false);
  const down = (e) => { e.preventDefault(); if (m.done) return; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ } setHeld(true); onDown(); };
  const up = () => { if (!held) return; setHeld(false); onUp(); };
  return (
    <div className="bs-buttonwrap">
      <button className={`bs-big${held ? " held" : ""}`} style={{ "--bc": COLOURS[m.colour] }} disabled={m.done}
        onPointerDown={down} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}
        aria-label={`${m.colour} button saying ${m.label}`}>
        <span style={{ color: m.colour === "white" || m.colour === "yellow" ? "#2E2140" : "#fff" }}>{m.label}</span>
      </button>
      <span className="bs-strip" style={{ background: held && strip ? COLOURS[strip] : "#3B3548", boxShadow: held && strip ? `0 0 14px ${COLOURS[strip]}` : "none" }} aria-label={held && strip ? `${strip} strip` : "strip off"} />
    </div>
  );
}

function Keypad({ m, onKey }) {
  return (
    <div className="bs-keys">
      {m.symbols.map((sym, i) => (
        <button key={i} className={`bs-key${m.pressed.includes(i) ? " on" : ""}`} onClick={() => !m.done && !m.pressed.includes(i) && onKey(i)}
          disabled={m.done} aria-label={`Symbol ${sym}`}>
          <span className="bs-led" />{sym}
        </button>
      ))}
    </div>
  );
}

function Simon({ m, onPress }) {
  const [lit, setLit] = useState(null);
  const pressed = useRef(0);
  const seq = m.flash.join(",");
  // flash the run over and over, with a pause, until it's pressed
  useEffect(() => {
    if (m.done) return undefined;
    const run = seq ? seq.split(",") : [];
    let i = 0, alive = true, t = null;
    const next = () => {
      if (!alive) return;
      if (Date.now() - pressed.current < 2500) { t = setTimeout(next, 400); return; }
      if (i < run.length) { setLit(run[i]); t = setTimeout(() => { setLit(null); i++; t = setTimeout(next, 260); }, 480); }
      else { i = 0; t = setTimeout(next, 1600); }
    };
    t = setTimeout(next, 600);
    return () => { alive = false; clearTimeout(t); setLit(null); };
  }, [seq, m.done]);
  const press = (c) => { if (m.done) return; pressed.current = Date.now(); setLit(c); setTimeout(() => setLit(null), 160); onPress(c); };
  return (
    <div className="bs-simon">
      {["red", "blue", "green", "yellow"].map((c) => (
        <button key={c} className={`bs-sq${lit === c ? " lit" : ""}`} style={{ "--sc": COLOURS[c] }} onClick={() => press(c)} disabled={m.done} aria-label={`Simon ${c}`} />
      ))}
    </div>
  );
}

// ── the manual ───────────────────────────────────────────────────────────────
function Manual({ kinds, tab, setTab }) {
  const order = ["wires", "button", "keypad", "simon"];
  return (
    <div className="bs-manual">
      <div className="bs-tabs" role="tablist">
        {order.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`bs-tab${tab === k ? " on" : ""}${kinds.includes(k) ? " here" : ""}`} onClick={() => setTab(k)}>
            {KIND_NAME[k]}{kinds.includes(k) && <i />}
          </button>
        ))}
      </div>
      <div className="bs-page">
        {tab === "wires" && (
          <>
            <p className="bs-lead">Count the wires (top to bottom: first to last), then follow the first rule that fits.</p>
            {MANUAL.wires.map((w) => (
              <div key={w.n} className="bs-rule"><b>{w.n} wires</b><ol>{w.rules.map((r, i) => <li key={i}>{r}</li>)}</ol></div>
            ))}
          </>
        )}
        {tab === "button" && (
          <>
            <p className="bs-lead">The first rule that fits:</p>
            <ol className="bs-rule">{MANUAL.button.map((r, i) => <li key={i}>{r}</li>)}</ol>
            <div className="bs-rule"><b>Holding</b><ul>{MANUAL.hold.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
          </>
        )}
        {tab === "keypad" && (
          <>
            <p className="bs-lead">{MANUAL.keypad}</p>
            <div className="bs-cols">
              {KEYPAD_COLUMNS.map((col, i) => (
                <div key={i} className="bs-col"><b>{i + 1}</b>{col.map((s) => <span key={s}>{s}</span>)}</div>
              ))}
            </div>
          </>
        )}
        {tab === "simon" && (
          <>
            <p className="bs-lead">{MANUAL.simon}</p>
            {[["vowel", "Serial number HAS a vowel"], ["none", "Serial number has NO vowel"]].map(([k, title]) => (
              <div key={k} className="bs-rule">
                <b>{title}</b>
                <table className="bs-table">
                  <thead><tr><th>Flash →</th>{["red", "blue", "green", "yellow"].map((c) => <th key={c}><span className="bs-dot" style={{ background: COLOURS[c] }} /></th>)}</tr></thead>
                  <tbody>
                    {SIMON_MAP[k].map((row, st) => (
                      <tr key={st}><td>{st} strike{st === 1 ? "" : "s"}</td>{["red", "blue", "green", "yellow"].map((c) => <td key={c}><span className="bs-dot" style={{ background: COLOURS[row[c]] }} /></td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── the game ─────────────────────────────────────────────────────────────────
export default function BombSquad(props) {
  const { roomCode, currentUser, isSpectator = false, spectatorWatching = null, onGameEnd, durationSeconds = 180 } = props;
  const myId = Number(currentUser?.id);
  const [secret, setSecret] = useState(null);
  const [hud, setHud] = useState({ left: durationSeconds, score: 0, defused: 0, rivals: [], v: null });
  const [msg, setMsg] = useState(null);
  const [shake, setShake] = useState(0);
  const [strip, setStrip] = useState(null);
  const [tab, setTab] = useState("wires");
  const [showManual, setShowManual] = useState(false);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } });
  const soundRef = useRef(sound);
  useEffect(() => { soundRef.current = sound; try { localStorage.setItem(SOUND_KEY, sound ? "on" : "off"); } catch { /* private */ } }, [sound]);
  const sfx = useRef(null);
  if (sfx.current === null) sfx.current = makeSound();
  useEffect(() => () => sfx.current.close(), []);
  const play = (k, ...a) => { if (soundRef.current) sfx.current[k](...a); };
  const timerRef = useRef(null);
  const caseRef = useRef(null);
  // a strike shakes the bomb, a bang shakes it harder (without rebuilding it)
  useEffect(() => {
    const el = caseRef.current;
    if (!shake || !el || !el.animate) return;
    el.animate([{ transform: "translate(0,0)" }, { transform: "translate(-7px,2px)" }, { transform: "translate(6px,-2px)" }, { transform: "translate(-4px,1px)" }, { transform: "translate(0,0)" }], { duration: 380 });
  }, [shake]);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (text, type = "info", ms = 1300) => { setMsg({ text, type }); timers.current.push(setTimeout(() => setMsg(null), ms)); };
  const nameOf = (id) => { const L = tg.live.current; if (Number(id) === myId) return "You"; return L?.players.find((p) => p.id === Number(id))?.name || "Someone"; };

  const tg = useTogether({
    roomCode, watchId: spectatorWatching?.user_id ?? null,
    onInit: (init) => setSecret(init.secret || null),
    onSecret: (data) => setSecret(data),
    onTick: (v) => {
      for (const e of v.e || []) {
        if (e.type === "strike") { setShake((n) => n + 1); play("bad"); if (v.d !== myId) flash(`✕ Strike ${e.strikes} of ${MAX_STRIKES}`, "error"); }
        else if (e.type === "solved") play("good");
        else if (e.type === "defused") { play("win"); }
        else if (e.type === "boom") { play("boom"); setShake((n) => n + 3); }
        else if (e.type === "bomb") { setStrip(null); setShowManual(false); if (e.handed) flash(`${nameOf(e.defuser)} takes over the bomb`, "info"); }
      }
    },
    onReply: (r) => {
      if (r.a === "bdown" && r.strip) setStrip(r.strip);
      if (!r.ok && WHY[r.why]) flash(WHY[r.why], "error");
    },
  });

  // the timer, smooth between ticks, beeping each second
  useEffect(() => {
    let raf, lastSec = null;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const L = tg.live.current;
      const b = L && L.view.b;
      const left = b ? Math.max(0, b.left - (Date.now() - L.viewAt) / 1000) : 0;
      if (timerRef.current) timerRef.current.textContent = b ? fmt(left) : "-:--";
      const sec = Math.ceil(left);
      if (b && sec !== lastSec) { if (lastSec !== null && sec > 0 && L.role === "player" && !L.over) play("beep", sec <= 10); lastSec = sec; }
    };
    raf = requestAnimationFrame(frame);
    const hudT = setInterval(() => {
      const L = tg.live.current;
      if (L) setHud({ left: secondsLeft(L), score: myScore(L), defused: L.view.df, rivals: rivals(L), v: L.view });
    }, 200);
    return () => { cancelAnimationFrame(raf); clearInterval(hudT); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = () => (timerRef.current ? timerRef.current.textContent : "");
  const send = (a, extra) => tg.send(a, extra);

  const v = hud.v;
  const L = tg.live.current;
  const b = v && v.b;
  const amDefuser = !!(v && v.d === myId && !isSpectator);
  const bombHere = amDefuser && secret && b && secret.i === b.i ? secret : null;
  const solo = !!(v && v.solo);
  const kinds = b ? b.m.map((x) => x[0]) : [];
  const strikes = b ? b.k : 0;

  const stats = [
    { label: "Score", value: Number(hud.score).toLocaleString() },
    { label: "Defused", value: `${hud.defused}${v ? ` / ${v.goal}` : ""}` },
    { label: "Strikes", value: b ? `${strikes}/${MAX_STRIKES}` : "—", urgent: strikes >= 2 },
  ];
  const controls = !isSpectator ? (
    <div className="bs-controls">
      {amDefuser && solo && b && (
        <button className="press p-white bs-ctl" onClick={() => setShowManual((x) => !x)}>{showManual ? "💣 The bomb" : "📖 Manual"}</button>
      )}
      <button className="press p-white bs-ctl" onClick={() => setSound((x) => !x)} aria-pressed={sound}>{sound ? "🔊" : "🔇"}</button>
    </div>
  ) : null;

  let body;
  if (!tg.ready || !v) body = <div className="muted">{tg.gone ? "This bomb has gone." : "Bringing out the bomb…"}</div>;
  else if (!b) {
    const last = v.last;
    body = (
      <div className={`bs-between ${last ? last.kind : ""}`}>
        {last && last.kind === "boom" && <><div className="bs-big-icon">💥</div><h2>BOOM!</h2><p>{last.why === "time" ? "The timer ran out." : "Three strikes."}</p></>}
        {last && last.kind === "defused" && <><div className="bs-big-icon">✅</div><h2>Defused!</h2><p>+{last.bonus} · {last.left}s to spare</p></>}
        {!last && <><div className="bs-big-icon">💣</div><h2>Get ready…</h2></>}
        <p className="bs-next">Next bomb: <b>{v.d === myId ? "you defuse it" : `${nameOf(v.d)} defuses it`}</b>{v.d !== myId && !solo ? " — you read the manual" : ""}</p>
      </div>
    );
  } else {
    const status = (
      <div className={`bs-status${strikes >= 2 ? " hot" : ""}`}>
        <span className="bs-lcd" ref={timerRef}>{fmt(b.left)}</span>
        <span className="bs-x" aria-label={`${strikes} strikes`}>{Array.from({ length: MAX_STRIKES }, (_, i) => <i key={i} className={i < strikes ? "on" : ""}>✕</i>)}</span>
        <span className="bs-mods">{b.m.map(([k, d], i) => <span key={i} className={`bs-mod${d ? " done" : ""}`} title={KIND_NAME[k]}>{KIND_ICON[k]}</span>)}</span>
      </div>
    );
    if (bombHere && !(solo && showManual)) {
      body = (
        <div className="bs-wrap">
          {status}
          <div className="bs-case" ref={caseRef}>
            <div className="bs-plate">
              <span className="bs-serial">SERIAL <b>{bombHere.serial}</b></span>
              <span className="bs-batts" aria-label={`${bombHere.batteries} batteries`}>{bombHere.batteries ? "🔋".repeat(bombHere.batteries) : "no batteries"}</span>
            </div>
            <div className="bs-grid">
              {bombHere.m.map((m, i) => (
                <div key={`${b.i}-${i}`} className={`bs-module${m.done ? " done" : ""}`}>
                  <span className="bs-light" />
                  {m.kind === "wires" && <Wires m={m} onCut={(w) => send("cut", { m: i, i: w })} />}
                  {m.kind === "button" && <BigButton m={m} strip={strip} onDown={() => { setStrip(null); send("bdown", { m: i }); }} onUp={() => send("bup", { m: i, shown: shown() })} />}
                  {m.kind === "keypad" && <Keypad m={m} onKey={(k) => send("key", { m: i, i: k })} />}
                  {m.kind === "simon" && <Simon m={m} onPress={(c) => send("simon", { m: i, c })} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    } else {
      body = (
        <div className="bs-wrap">
          {status}
          {!amDefuser && (
            <div className="bs-who">
              {isSpectator ? "👀 " : "🧑‍🔧 "}<b>{nameOf(v.d)}</b> {isSpectator ? "is defusing." : "has the bomb. Ask what they see!"}
            </div>
          )}
          <Manual kinds={kinds} tab={tab} setTab={setTab} />
        </div>
      );
    }
  }

  return (
    <>
      <GameFrame
        gameName="Bomb Squad" badge="💣 BOMB SQUAD"
        isSpectator={isSpectator} spectatorName={spectatorWatching?.username}
        stats={stats}
        timer={{ value: hud.left, max: durationSeconds }}
        opponents={hud.rivals}
        message={msg}
        onQuit={onGameEnd}
        controls={controls}
      >
        {({ w, h }) => (
          <div className="bs-pad" style={{ width: w, height: h }}>
            {body}
            {isSpectator && L && L.sides.length > 1 && (
              <div className="kr-watch">
                {L.sides.map((s) => (
                  <button key={s.key} className={`press sm ${s.key === L.side ? "p-sun" : "p-white"}`} onClick={() => tg.watch(s.key)}>
                    {L.mode === "teams" ? `${s.name} team` : s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </GameFrame>
      {tg.over && !isSpectator && (
        <TogetherResults over={tg.over} me={currentUser} onExit={onGameEnd} icon="💣"
          goalText={(s) => `${s.sum?.defused ?? 0} of ${s.sum?.goal ?? 1} bomb${(s.sum?.goal ?? 1) === 1 ? "" : "s"} defused${s.sum?.exploded ? ` · ${s.sum.exploded} went off` : ""}.`}
          describe={(s) => `${s.sum?.defused ?? 0} defused${s.sum?.exploded ? ` · ${s.sum.exploded} 💥` : ""}`} />
      )}
    </>
  );
}
