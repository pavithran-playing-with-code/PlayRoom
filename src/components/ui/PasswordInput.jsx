// src/components/ui/PasswordInput.jsx
// A password field with a show/hide eye toggle. Chrome draws no reveal button
// of its own (Edge does — that one is suppressed in index.css so we never get
// two eyes), so the auth pages need their own.
//
// Everything except `type` is passed straight to the <input>, so callers keep
// spreading their own handlers onto it — including the Detective's
// secretProps on the login/register pages.
import React, { useRef, useState } from "react";

export default function PasswordInput({ type: _ignored, ...rest }) {
  const [shown, setShown] = useState(false);
  const ref = useRef(null);

  function toggle() {
    const el = ref.current;
    const start = el?.selectionStart;
    const end = el?.selectionEnd;
    setShown((s) => !s);
    // Swapping an input's type can drop the caret back to the start in some
    // browsers. Put it back where the user left it.
    requestAnimationFrame(() => {
      if (el && start != null) {
        try { el.setSelectionRange(start, end); } catch { /* not focused */ }
      }
    });
  }

  return (
    <div className="pw">
      <input ref={ref} {...rest} type={shown ? "text" : "password"} />
      <button
        type="button"
        className="pw-toggle"
        aria-label="Show password"
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
        // Keep focus in the field. Without this, clicking the eye blurs the
        // input, which the Detective reads as "you left the password box" and
        // drops his paws from his eyes mid-typing.
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        {shown ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}

const iconProps = {
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round",
  "aria-hidden": true,
};

function Eye() {
  return (
    <svg {...iconProps}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg {...iconProps}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
