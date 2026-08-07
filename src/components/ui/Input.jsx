// src/components/ui/Input.jsx
// Field wrapper + input / select built on the `.field` rules — ink outline,
// hard shadow, and the shadow turns grape on focus.
import React from "react";

export function Field({ label, hint, children, className = "", htmlFor }) {
  return (
    <div className={`field ${className}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <div className="muted" style={{ marginTop: 6, fontSize: ".8rem" }}>{hint}</div>}
    </div>
  );
}

export function Input({ label, hint, className = "", id, ...rest }) {
  const el = <input id={id} className={`ui-field ${className}`} {...rest} />;
  return label || hint ? <Field label={label} hint={hint} htmlFor={id}>{el}</Field> : el;
}

export function Select({ label, hint, children, className = "", id, ...rest }) {
  const el = <select id={id} className={`ui-field ${className}`} {...rest}>{children}</select>;
  return label || hint ? <Field label={label} hint={hint} htmlFor={id}>{el}</Field> : el;
}

export default Input;
