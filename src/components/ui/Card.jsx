// src/components/ui/Card.jsx
// A sheet of card stock sitting off the page — `.pop` gives it the ink outline
// and the hard shadow underneath.
import React from "react";

export default function Card({
  tone,                   // optional palette fill: "sun" | "coral" | "mint" | "grape" | "sky" | "lime" | "paper"
  hover = false,          // lift a little when the pointer is over it
  className = "",
  style,
  children,
  ...rest
}) {
  const fills = {
    sun: "var(--sun)", coral: "var(--coral)", mint: "var(--mint)",
    grape: "var(--grape)", sky: "var(--sky)", lime: "var(--lime)",
    paper: "var(--paper2)",
  };

  return (
    <div
      className={`pop ${hover ? "card-hover" : ""} ${className}`}
      style={{ padding: 24, background: fills[tone], ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
