// src/components/Logo.jsx
// Brand mark: three fanned tiles with a face on the front one, so the logo is
// part of the same cast as the runner and the peeking buddies rather than a
// generic icon. Used in the Navbar and the in-game header.
//
// It's the same artwork as the favicon and the home-screen icon, served from
// public/ rather than imported: the source PNG is over a megabyte, and
// bundling it would put all of that in front of the first paint for something
// drawn 46 pixels wide. logo192 is 39KB and the browser caches it once.
import React from "react";

const SIZES = {
  sm: { icon: 30, font: "1.15rem", gap: 8 },
  md: { icon: 46, font: "1.6rem", gap: 11 },
  lg: { icon: 64, font: "2.4rem", gap: 14 },
  xl: { icon: 88, font: "3.4rem", gap: 18 },
};

export default function Logo({ size = "md", showText = true, style = {} }) {
  const cfg = SIZES[size] || SIZES.md;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: cfg.gap, ...style }}>
      <img
        src={`${process.env.PUBLIC_URL}/logo192.png`}
        width={cfg.icon}
        height={cfg.icon}
        alt=""
        aria-hidden="true"
        // The artwork is a square card; the corners are rounded here rather
        // than baked in, so the same file works as a flat app icon too.
        style={{ borderRadius: "23%", flexShrink: 0, display: "block" }}
      />
      {showText && (
        <span
          className="display"
          style={{
            fontSize: cfg.font,
            lineHeight: 1,
            color: "var(--ink)",
            // hard offset shadow, the same trick every pressable uses
            textShadow: "0 3px 0 var(--sun)",
          }}
        >
          PlayRoom
        </span>
      )}
    </span>
  );
}
