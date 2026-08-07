// src/components/ui/Spinner.jsx
// Thick ink ring with one marigold quadrant — matches the outline weight the
// rest of the theme uses instead of a hairline loader.
import React from "react";

export default function Spinner({ size = 22, className = "" }) {
  return (
    <span
      className={`spinner ${className}`}
      style={{
        width: size,
        height: size,
        borderWidth: Math.max(3, size / 7),
      }}
      role="status"
      aria-label="Loading"
    />
  );
}
