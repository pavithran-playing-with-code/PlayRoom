// src/components/ui/FunLayer.jsx
// The "wooo" layer. One full-screen canvas, pointer-events:none, mounted once
// at the app root:
//
//   • a little burst wherever you press
//   • confetti on demand — any component can fire one without importing this:
//       window.dispatchEvent(new CustomEvent("pr:confetti", {
//         detail: { x, y, count, emojis: ["🎉"] }
//       }))
//
// Canvas (not DOM nodes) so hundreds of particles cost nothing, and the render
// loop parks itself the moment the particle list empties — idle pages burn 0%.
// Honours prefers-reduced-motion by rendering nothing at all.

import React, { useEffect, useRef } from "react";

// The toy palette, as literals — canvas can't read CSS variables. Keep these in
// step with the `:root` tokens in index.css.
const TRAIL_COLORS = ["#FFC53D", "#FF6B6B", "#3DD6C0", "#4CC9F0", "#9B5DE5"];
const CONFETTI_COLORS = ["#FFC53D", "#FF6B6B", "#3DD6C0", "#4CC9F0", "#9B5DE5", "#B5E655", "#FF8FC7"];
const MAX_PARTICLES = 420;

export default function FunLayer() {
  const canvasRef = useRef(null);
  const partsRef = useRef([]);
  const rafRef = useRef(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const add = (p) => {
      const parts = partsRef.current;
      if (parts.length >= MAX_PARTICLES) parts.shift();
      parts.push(p);
      start();
    };

    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];

    // ── Press burst ──────────────────────────────────────────────────────────
    const onDown = (e) => {
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14 + rand(-0.2, 0.2);
        const sp = rand(1.8, 5);
        add({
          kind: "spark", x: e.clientX, y: e.clientY,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 1, decay: rand(0.022, 0.04),
          size: rand(3, 7), color: pick(TRAIL_COLORS), spin: 0, rot: 0,
        });
      }
    };

    // ── Confetti (fired by other components) ─────────────────────────────────
    const onConfetti = (e) => {
      const d = e.detail || {};
      const x = d.x ?? window.innerWidth / 2;
      const y = d.y ?? window.innerHeight / 3;
      const count = Math.min(d.count ?? 60, 240);
      const emojis = d.emojis || null;
      for (let i = 0; i < count; i++) {
        const a = rand(-Math.PI, 0) + rand(-0.3, 0.3);   // mostly upward
        const sp = rand(4, 13);
        add({
          kind: emojis ? "emoji" : "confetti",
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 1, decay: rand(0.008, 0.016),
          size: emojis ? rand(16, 30) : rand(5, 11),
          color: pick(CONFETTI_COLORS),
          glyph: emojis ? pick(emojis) : null,
          rot: rand(0, Math.PI * 2), spin: rand(-0.22, 0.22),
        });
      }
    };

    // ── Loop ─────────────────────────────────────────────────────────────────
    const tick = () => {
      const parts = partsRef.current;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
        if (p.kind === "spark") { p.vy += 0.02; p.vx *= 0.97; p.vy *= 0.97; }
        else { p.vy += 0.24; p.vx *= 0.995; }        // confetti falls
        p.life -= p.decay;
        if (p.life <= 0 || p.y > window.innerHeight + 60) { parts.splice(i, 1); continue; }

        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        if (p.kind === "emoji") {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.font = `${p.size}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.glyph, 0, 0);
          ctx.restore();
        } else if (p.kind === "confetti") {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.fillStyle = p.color;
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      if (parts.length) rafRef.current = requestAnimationFrame(tick);
      else rafRef.current = 0;                       // idle: stop the loop
    };

    const start = () => { if (!rafRef.current) rafRef.current = requestAnimationFrame(tick); };

    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pr:confetti", onConfetti);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pr:confetti", onConfetti);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      partsRef.current = [];
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}
    />
  );
}

// Convenience helper for callers: confetti(x, y, opts)
export function confetti(x, y, opts = {}) {
  window.dispatchEvent(new CustomEvent("pr:confetti", { detail: { x, y, ...opts } }));
}
