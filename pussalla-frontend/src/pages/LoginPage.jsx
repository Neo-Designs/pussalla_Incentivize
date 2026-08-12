import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo, EggLoader, ProgressBar } from "../components/Loaders.jsx";
import { ApiError } from "../api/client";

const DEMO_LOGINS = [
  { code: "EMP-001", role: "Super Admin" },
  { code: "EMP-002", role: "HR" },
  { code: "EMP-003", role: "Admin" },
  { code: "EMP-004", role: "Supervisor (Plant A)" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = location.state?.from || "/";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(code.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to reach the server. Is the backend running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <section className="login-hero">
        <div style={{ position: "relative", zIndex: 1 }}>
          <Logo size="lg" />
        </div>
        <div className="pitch" style={{ position: "relative", zIndex: 1 }}>
          <h2>Incentive salary & division task management, built for the floor.</h2>
          <p>
            Track daily output across all five Pussalla divisions, calculate payouts with the
            three task engines, and keep a tamper-evident audit trail — all in one place.
          </p>
        </div>
        <div className="roles">
          {DEMO_LOGINS.map((d) => (
            <div className="r" key={d.code}>
              <span className="k mono">{d.code}</span>
              <span className="v">{d.role}</span>
            </div>
          ))}
          <div className="r">
            <span className="k mono" style={{ minWidth: 64 }}>pwd</span>
            <span className="v">Pussalla@123</span>
          </div>
        </div>
      </section>

      <section className="login-card-wrap">
        <div className="login-card">
          {busy && <div style={{ marginBottom: "1rem" }}><ProgressBar /></div>}
          <div style={{ marginBottom: "1.5rem", textAlign: "center" }}>
            <Logo />
            <p className="muted" style={{ marginTop: "0.5rem" }}>Sign in with your employee code</p>
          </div>

          {error && <div className="err-box">⚠️ {error}</div>}

          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="code">Employee code</label>
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. EMP-004"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button className="btn" style={{ width: "100%" }} disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
            <span className="muted" style={{ fontSize: "0.78rem" }}>
              Use one of the demo codes shown on the left.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
