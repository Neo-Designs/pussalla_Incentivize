import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { hasRole } from "../utils/helpers";

// Guards a route: requires an authenticated user (and optionally one of the
// listed roles). Unauthenticated users are sent to /login; authenticated but
// unauthorized users see a friendly "no access" panel.
export function RequireAuth({ roles, children }) {
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) return null; // FullScreenLoader is rendered by App
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (roles && roles.length && !hasRole(user, ...roles)) {
    return (
      <div className="content" style={{ paddingTop: "3rem" }}>
        <div className="card" style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: "2.6rem", marginBottom: "0.5rem" }}>🔒</div>
          <h2 style={{ color: "var(--pussalla-green-900)" }}>Access restricted</h2>
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Your role ({user.role}) does not have permission to view this section.
            Contact an administrator if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }
  return children;
}
