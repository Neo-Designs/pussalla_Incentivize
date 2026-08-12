import React from "react";

// Pussalla wordmark with the gradient "P" mark.
export function Logo({ size = "md" }) {
  const font = size === "lg" ? "1.8rem" : size === "sm" ? "1.1rem" : "1.35rem";
  return (
    <span className="ps-logo-mark">
      <span className="mark">P</span>
      <span className="word" style={{ fontSize: font }}>
        <span className="p">Puss</span><span className="u">alla</span>
      </span>
    </span>
  );
}

// Concentric dual-ring spinner (green + gold).
export function Spinner({ size = 60 }) {
  return <div className="pussalla-spinner" style={{ width: size, height: size }} aria-label="Loading" />;
}

// Playful bobbing egg loader used on the splash screen.
export function EggLoader() {
  return (
    <div className="ps-egg-loader eggs" aria-label="Loading">
      <span className="egg" />
      <span className="egg" />
      <span className="egg" />
      <span className="egg" />
    </div>
  );
}

export function MiniSpinner() {
  return <span className="ps-mini" aria-label="Working" />;
}

// Inline progress bar (indeterminate).
export function ProgressBar() {
  return <div className="ps-bar" />;
}

// Full-screen splash shown during initial auth bootstrap.
export function FullScreenLoader({ label = "Loading Pussalla…" }) {
  return (
    <div className="app-loader">
      <div className="stack">
        <Logo size="lg" />
        <EggLoader />
        <p className="muted" style={{ marginTop: "0.4rem" }}>{label}</p>
        <div style={{ width: 220 }}><ProgressBar /></div>
      </div>
    </div>
  );
}
