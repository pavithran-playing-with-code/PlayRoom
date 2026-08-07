// src/components/ui/ProgressRing.jsx
// The match clock. Drawn with the theme's outline weight: a full ink ring
// underneath, the remaining time painted over it, and the number in Fredoka.
import React from "react";

export default function ProgressRing({ value, max, size = 60, stroke = 7, urgent = false, label }) {
  const r = (size - stroke - 3) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const color = urgent ? "var(--coral)" : pct > 0.5 ? "var(--lime)" : "var(--sun)";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* ink track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="var(--card)" stroke="var(--ink)" strokeWidth={stroke + 3} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center leading-none">
        <span className="display" style={{ color: "var(--ink)", fontSize: size * 0.26 }}>{label}</span>
      </div>
    </div>
  );
}
