// src/components/ui/Avatar.jsx
// Emoji face in an ink-outlined circle, with an optional presence pip.
// Ported from face(emoji, size, col, online) in the theme mock.
import React from "react";

// A stable colour per player so the same person keeps the same badge colour
// everywhere, instead of every avatar being marigold.
const PALETTE = ["var(--sun)", "var(--coral)", "var(--mint)", "var(--grape)", "var(--sky)", "var(--lime)", "var(--bubble)"];

export function avatarColour(key) {
  if (key == null) return PALETTE[0];
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function Avatar({
  emoji = "🎮",
  size = 40,
  online,          // undefined = no pip, true/false = green/grey pip
  colour,          // explicit fill; otherwise derived from `seed`
  seed,            // usually the user id or username
  className = "",
  style,
}) {
  const pip = Math.max(12, size * 0.3);
  return (
    <span
      className={`face ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: colour || avatarColour(seed ?? emoji),
        ...style,
      }}
    >
      <span style={{ lineHeight: 1 }}>{emoji}</span>
      {online != null && (
        <span
          className="pip"
          style={{ width: pip, height: pip, background: online ? "var(--lime)" : "#D8CEC2" }}
          title={online ? "Online" : "Offline"}
        />
      )}
    </span>
  );
}
