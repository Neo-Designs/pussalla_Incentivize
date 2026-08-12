import React, { useEffect } from "react";
import { Logo } from "./Loaders.jsx";

// Centered modal dialog. Closes on backdrop click and Escape.
export default function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={wide ? { width: "min(860px, 100%)" } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="head">
          <h3>{title}</h3>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="body">{children}</div>
        {footer && <div className="foot">{footer}</div>}
      </div>
    </div>
  );
}

// Small branded confirm dialog for destructive actions.
export function ConfirmDialog({ title = "Confirm", message, confirmLabel = "Confirm", onConfirm, onClose, danger }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn ${danger ? "btn-danger" : ""}`} onClick={() => { onConfirm?.(); }}>{confirmLabel}</button>
        </>
      }
    >
      <p style={{ color: "var(--ink-700)" }}>{message}</p>
    </Modal>
  );
}

export { Logo };
