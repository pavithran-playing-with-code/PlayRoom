// src/components/ui/Tabs.jsx
// Pill tabs — the selected one is a pressed-down grape button, the rest sit up
// in white. `tabs` = [{ id, label, count }]. Controlled via value/onChange.
import React from "react";

// Deliberately NOT role="tablist"/"tab": there are no aria-controls'd panels
// here, and role="tab" forbids aria-pressed — which is the hook the `.press`
// rules use to draw the selected tab pushed into the page.
export default function Tabs({ tabs, value, onChange, className = "" }) {
  return (
    <div className={`inline ${className}`}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            aria-pressed={active}
            onClick={() => onChange(t.id)}
            className={`press ${active ? "p-grape" : "p-white"}`}
          >
            {t.label}
            {t.count ? (
              <span className="chip c-coral" style={{ borderWidth: 2, padding: "1px 8px", fontSize: ".72rem" }}>
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
