// src/components/ui/Toast.jsx
// App-wide toast notifications. Wrap the app in <ToastProvider>, then call
// const toast = useToast();  toast.success("Saved!");  toast.error("Nope");
//
// Each one is a hard-outlined pill that hops up from the bottom of the screen.
import React, { createContext, useContext, useState, useCallback, useRef } from "react";

const ToastContext = createContext(null);

const TONES = {
  info:    { icon: "💬", fill: "var(--sun)" },
  success: { icon: "🎉", fill: "var(--lime)" },
  error:   { icon: "🙅", fill: "var(--coral)", ink: "#fff" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(1);

  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((message, tone = "info", ms = 3000) => {
    const id = idRef.current++;
    setToasts((t) => [...t, { id, message, tone }]);
    if (ms > 0) setTimeout(() => remove(id), ms);
    return id;
  }, [remove]);

  const api = {
    show: push,
    info: (m, ms) => push(m, "info", ms),
    success: (m, ms) => push(m, "success", ms),
    error: (m, ms) => push(m, "error", ms),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toaststack">
        {toasts.map((t) => {
          const tone = TONES[t.tone] || TONES.info;
          return (
            <div
              key={t.id}
              onClick={() => remove(t.id)}
              className="toast"
              style={{ background: tone.fill, color: tone.ink, cursor: "pointer" }}
            >
              <span>{tone.icon}</span>
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext) || { show() {}, info() {}, success() {}, error() {} };
}
