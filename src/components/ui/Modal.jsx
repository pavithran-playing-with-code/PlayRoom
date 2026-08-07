// src/components/ui/Modal.jsx
import React, { useEffect } from "react";

export default function Modal({ open, onClose, title, children, maxWidth = 460 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="pop" style={{ width: "100%", maxWidth, padding: 26, animation: "drop .16s cubic-bezier(.34,1.7,.64,1)" }}>
        {title && (
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontSize: "1.25rem" }}>{title}</h3>
            <button className="press p-white sm" onClick={onClose} aria-label="Close">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
