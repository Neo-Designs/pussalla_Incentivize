import React from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Loaders.jsx";

export default function NotFoundPage() {
  return (
    <div className="app-loader" style={{ position: "static", minHeight: "100vh" }}>
      <div className="stack">
        <Logo size="lg" />
        <div style={{ fontSize: "3rem", fontWeight: 800, color: "var(--pussalla-green-700)" }}>404</div>
        <p className="muted">That page doesn't exist.</p>
        <Link to="/" className="btn">Back to dashboard</Link>
      </div>
    </div>
  );
}
