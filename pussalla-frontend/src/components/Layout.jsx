import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./Loaders.jsx";
import { Badge } from "./Card.jsx";
import { roleLabel, initials } from "../utils/helpers";

// Nav item definitions gated by role. super_admin sees everything.
const NAV = [
  { to: "/", label: "Dashboard", roles: ["employee", "supervisor", "hr", "admin", "super_admin"] },
  { to: "/earnings", label: "My Earnings", roles: ["employee"] },
  { to: "/daily-logs", label: "Daily Logs", roles: ["supervisor", "super_admin"] },
  { to: "/tasks", label: "Task Management", roles: ["admin", "super_admin"] },
  { to: "/employees", label: "Employees", roles: ["hr", "admin", "super_admin"] },
  { to: "/cross-assignments", label: "Cross-Assignments", roles: ["hr", "super_admin"] },
  { to: "/reports", label: "Reports", roles: ["hr", "admin", "super_admin"] },
  { to: "/audit", label: "Audit Trail", roles: ["super_admin"] },
];

function navGroups(user) {
  const items = NAV.filter((n) => n.roles.includes(user.role));
  return [
    { title: "Workspace", items: items.filter((i) => ["/", "/earnings", "/daily-logs"].includes(i.to)) },
    { title: "Administration", items: items.filter((i) => !["/", "/earnings", "/daily-logs"].includes(i.to)) },
  ].filter((g) => g.items.length);
}

export default function Layout({ children }) {
  const { user, logout, backendUp } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const groups = navGroups(user);

  return (
    <div className="shell">
      <div className={`sidebar-backdrop ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand spread">
          <Logo size="sm" />
        </div>
        <nav className="nav">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="nav-group">{g.title}</div>
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === "/"} onClick={() => setOpen(false)}>
                  <span className="ico">{n.icon}</span>
                  {n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="userbox spread">
          <div className="row">
            <span className="avatar">{initials(user.name)}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", lineHeight: 1.1 }}>{user.name}</div>
              <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.7)" }}>{user.code}</div>
            </div>
          </div>
          <button className="btn btn-sm" style={{ background: "rgba(255,255,255,0.12)" }} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="row">
            <button className="menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">☰ Menu</button>
            <div className="crumbs">
              Pussalla Incentive System <strong>/ {roleLabel(user.role)}</strong>
            </div>
          </div>
          <div className="row">
            <Badge tone={backendUp ? "green" : "red"}>
              <span className={`live-dot ${backendUp ? "" : "off"}`} /> {backendUp ? "API Online" : "API Offline"}
            </Badge>
            <Badge tone="grey">{user.code}</Badge>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
