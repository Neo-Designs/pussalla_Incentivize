import React from "react";

// "Incentivize" wordmark with the gradient "I" mark.
export function Logo({ size = "md" }) {
  const font = size === "lg" ? "1.8rem" : size === "sm" ? "1.1rem" : "1.35rem";
  return (
    <span className="ps-logo-mark">
      <span className="mark">I</span>
      <span className="word" style={{ fontSize: font }}>
        Incentivize
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
export function FullScreenLoader({ label = "Loading Incentivize…" }) {
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
