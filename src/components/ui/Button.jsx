// src/components/ui/Button.jsx
// Every button in PlayRoom is a physical object: thick ink outline, hard offset
// shadow, and it travels down into the page when you press it. That behaviour
// lives in `.press` (index.css); the variants below only choose the colour.
import React from "react";

const VARIANTS = {
  primary: "p-sun",
  secondary: "p-coral",
  violet: "p-grape",
  mint: "p-mint",
  sky: "p-sky",
  lime: "p-lime",
  outline: "p-white",
  ghost: "p-ghost",
};

export default function Button({
  as: Tag = "button",
  variant = "primary",
  size,            // "sm" | "lg" | undefined
  full = false,
  className = "",
  children,
  ...rest
}) {
  const cls = [
    "press",
    VARIANTS[variant] || VARIANTS.primary,
    size === "sm" ? "sm" : size === "lg" ? "lg" : "",
    full ? "full" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
