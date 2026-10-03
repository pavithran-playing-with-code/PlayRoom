// src/components/together/TogetherResults.jsx
// The results card for a together game, from what the server sent at the end
// (tg:over). One side — a solo run or everybody together — is judged on its
// goal; several sides on their scores. Play again and Back to the lobby, the
// same as every other game's results.
import React, { useEffect, useState } from "react";
import { confetti } from "../ui/FunLayer";
import { usePlayAgain } from "../games/PlayAgain";

export default function TogetherResults({ over, me, onExit, goalText, describe, icon = "🎮" }) {
  const myId = Number(me?.id);
  const ctx = usePlayAgain();
  const [again, setAgain] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const rematch = ctx && ctx.rematch && Number(ctx.rematch.byId) !== myId ? ctx.rematch : null;
  const mine = over.sides.find((s) => s.members.some((m) => Number(m.id) === myId)) || null;
  const one = over.sides.length === 1;
  const best = over.sides[0]?.score ?? 0;
  const top = over.sides.filter((s) => s.score === best);
  const iWon = one ? !!(mine && mine.goal) : !!(mine && mine.score === best && top.length === 1);
  const draw = !one && !!mine && mine.score === best && top.length > 1;
  const name = (s) => (over.mode === "teams" ? `${s.name} team` : s.members[0]?.name || "Someone");

  const headline = one
    ? (iWon ? (over.mode === "coop" ? "🎉 You did it together!" : "🎉 You did it!") : "😅 Not this time")
    : iWon ? (over.mode === "teams" ? `🏆 ${mine.name} team wins!` : "🏆 You win!")
    : draw ? "🤝 It's a draw!"
    : `${name(over.sides[0])} wins`;

  useEffect(() => {
    if (!iWon) return undefined;
    confetti(window.innerWidth / 2, window.innerHeight / 2, { count: 160 });
    const t = setTimeout(() => confetti(window.innerWidth / 2, window.innerHeight / 2.4, { count: 40, emojis: ["🎉", "🏆", "⭐", "🎊"] }), 260);
    return () => clearTimeout(t);
  }, [iWon]);

  async function playAgain() {
    if (!ctx || again === "busy") return;
    setAgain("busy");
    setAgain((await ctx.start()) || null);
  }
  function exit() {
    if (leaving) return;
    setLeaving(true);
    onExit && onExit();
  }

  return (
    <div className="modal-scrim">
      <div className="pop" style={{ width: "100%", maxWidth: 420, padding: "clamp(20px, 5vw, 32px)", textAlign: "center",
        maxHeight: "calc(100dvh - 32px)", overflowY: "auto", background: iWon ? "var(--sun)" : "var(--card)",
        animation: "drop .18s cubic-bezier(.34,1.7,.64,1)" }}>
        <div style={{ fontSize: "3.4rem" }}>{iWon ? "🏆" : icon}</div>
        <h2 style={{ fontSize: "1.7rem" }}>{headline}</h2>
        {one && goalText && <p className="muted" style={{ marginTop: 6 }}>{goalText(mine || over.sides[0])}</p>}
        <div className="stack" style={{ gap: 10, margin: "18px 0 22px", textAlign: "left" }}>
          {over.sides.map((s, i) => (
            <div key={s.key} className="row" style={{ gap: 12, padding: "10px 14px", borderRadius: "var(--r)",
              border: "3px solid var(--ink)", background: mine && s.key === mine.key ? "var(--lime)" : "#fff" }}>
              <span className="rank" style={{ width: 34, height: 34, background: s.color }}>{one ? (s.goal ? "⭐" : "✕") : i === 0 && !draw ? "🏆" : i + 1}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong className="truncate" style={{ display: "block" }}>
                  {over.mode === "free" ? s.members[0]?.name : over.mode === "coop" ? s.members.map((m) => m.name).join(", ") : `${s.name} team`}
                </strong>
                <span className="muted" style={{ display: "block", fontSize: ".8rem" }}>
                  {describe ? describe(s) : ""}{over.mode === "teams" ? ` · ${s.members.map((m) => m.name).join(", ")}` : ""}
                </span>
              </span>
              <span className="display">{Number(s.score).toLocaleString()}</span>
            </div>
          ))}
        </div>
        {ctx && (
          <>
            {rematch && <p className="muted" style={{ marginBottom: 8, fontWeight: 700 }}>🎮 {rematch.by} started a new game — join in!</p>}
            <button className="press p-coral lg full" style={{ marginBottom: 12 }} onClick={playAgain} disabled={again === "busy" || leaving}>
              {again === "busy" ? "Setting up…" : rematch ? `🔄 Join ${rematch.by}'s game` : "🔄 Play again"}
            </button>
            {again && again !== "busy" && <p className="hint hint-bad" style={{ marginBottom: 10 }}>{again}</p>}
          </>
        )}
        <button className="press p-white full" onClick={exit} disabled={leaving}>{leaving ? "Saving…" : "← Back to lobby"}</button>
      </div>
    </div>
  );
}
