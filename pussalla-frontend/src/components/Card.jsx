import React from "react";

// Simple card wrapper used across pages.
export default function Card({ children, className = "", as: Tag = "div", ...rest }) {
  return (
    <Tag className={`card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function PageHead({ title, subtitle, actions }) {
  return (
    <div className="page-head spread">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function KPI({ label, value, sub, tone = "green", icon }) {
  return (
    <div className={`kpi ${tone}`}>
      <div className="spread">
        <div className="label">{label}</div>
        {icon && <span style={{ fontSize: "1.2rem", opacity: 0.6 }}>{icon}</span>}
      </div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon = "🪹", title, message }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <strong>{title}</strong>
      {message && <p className="muted">{message}</p>}
    </div>
  );
}

export function Badge({ tone = "grey", children }) {
  return <span className={`badge tag-${tone}`}>{children}</span>;
}

// Lightweight skeleton row blocks for table-loading states.
export function SkeletonRows({ cols = 5, rows = 6 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c}><div className="skel" style={{ height: 14, width: `${70 - (c * 8) % 40}%` }} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function InlineLoading({ label = "Loading…" }) {
  return (
    <div className="row" style={{ padding: "1rem", justifyContent: "center", color: "var(--ink-500)" }}>
      <span className="ps-mini" /> <span>{label}</span>
    </div>
  );
}
