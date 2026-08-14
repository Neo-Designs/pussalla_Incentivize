import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo, ProgressBar } from "../components/Loaders.jsx";
import { ApiError } from "../api/client";

const DEMO_LOGINS = [
  { code: "EMP-001", role: "Super Admin" },
  { code: "EMP-002", role: "HR" },
  { code: "EMP-003", role: "Admin" },
  { code: "EMP-004", role: "Supervisor" },
  { code: "EMP-009", role: "Employee" },
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

  const quickFill = (c) => { setCode(c); setPassword("Incentivize@123"); };

  return (
    <div className="login-page">
      <div className="login-pitch">
        <Logo size="lg" />
        <h2>Incentive salary &amp; division task management, built for the floor.</h2>
        <p>
          Track daily output across all divisions, calculate payouts with the three task engines,
          and keep a tamper-evident audit trail — all in one place.
        </p>
      </div>

      <div className="login-glass">
        <div style={{ textAlign: "center", marginBottom: "1.4rem" }}>
          <Logo />
          <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>Sign in with your employee code</p>
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
          {busy && <div style={{ marginBottom: "0.8rem" }}><ProgressBar /></div>}
          <button className="btn" style={{ width: "100%" }} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>

      <div className="login-demo">
        {DEMO_LOGINS.map((d) => (
          <button
            type="button"
            className="chip"
            key={d.code}
            onClick={() => quickFill(d.code)}
            title={`Sign in as ${d.role}`}
          >
            <span className="k">{d.code}</span>
            <span>{d.role}</span>
          </button>
        ))}
        <div className="pwd-note">
          Demo password for all accounts: <span className="mono">Incentivize@123</span> — click a chip to autofill.
        </div>
      </div>
    </div>
  );
}
