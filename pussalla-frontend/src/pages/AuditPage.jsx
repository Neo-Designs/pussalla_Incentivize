import React, { useEffect, useMemo, useState } from "react";
import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card.jsx";
import { auditApi, divisionsApi } from "../api/client";
import { formatDateTime, formatDate } from "../utils/helpers";

const ACTION_TONE = { CREATE: "green", UPDATE: "blue", DELETE: "red" };

export default function AuditPage() {
  const [divisions, setDivisions] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDiv, setFilterDiv] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [entity, setEntity] = useState("");
  const [expanded, setExpanded] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDiv) params.divisionId = filterDiv;
      if (flaggedOnly) params.flagged = "true";
      const [divs, list] = await Promise.all([
        divisionsApi.list().catch(() => []),
        auditApi.list(params).catch(() => []),
      ]);
      setDivisions(divs);
      // client-side entity filter (backend doesn't filter by entity)
      setRows(entity ? list.filter((r) => r.entity === entity) : list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterDiv, flaggedOnly]);

  useEffect(() => { setRows((prev) => prev.filter ? prev : prev); }, []); // noop guard

  const divName = (id) => divisions.find((d) => d.id === id)?.name || "—";

  const entities = useMemo(() => Array.from(new Set(rows.map((r) => r.entity))).sort(), [rows]);

  const flaggedCount = rows.filter((r) => r.flagged).length;

  const toggle = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  return (
    <>
      <PageHead
        title="Audit Trail"
        subtitle="Immutable, append-only record of every payroll-relevant change. Flagged rows indicate retroactive edits."
      />

      <div className="kpi-grid stagger" style={{ marginBottom: "1rem" }}>
        <KPI tone="green" label="Entries (filtered)" value={rows.length} />
        <KPI tone="red" label="Flagged" value={flaggedCount} sub="retroactive edits" />
        <KPI tone="gold" label="Entities" value={entities.length} />
      </div>

      <Card style={{ marginBottom: "1rem" }}>
        <div className="row">
          <div>
            <label>Division</label>
            <select value={filterDiv} onChange={(e) => setFilterDiv(e.target.value)} style={{ width: "auto" }}>
              <option value="">All</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label>Entity</label>
            <select value={entity} onChange={(e) => setEntity(e.target.value)} style={{ width: "auto" }}>
              <option value="">All</option>
              {entities.map((en) => <option key={en} value={en}>{en}</option>)}
            </select>
          </div>
          <label className="row" style={{ fontSize: "0.88rem", gap: "0.4rem", alignSelf: "flex-end", paddingBottom: "0.7rem" }}>
            <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} style={{ width: "auto" }} />
            Flagged / retroactive only
          </label>
          <button className="btn btn-ghost btn-sm" onClick={load} style={{ alignSelf: "flex-end" }}>↻ Refresh</button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <table className="data"><tbody><SkeletonRows cols={5} /></tbody></table>
        ) : rows.filter((r) => !entity || r.entity === entity).length === 0 ? (
          <EmptyState icon="🛡️" title="No audit entries match" message="Adjust the filters to see more records." />
        ) : (
          <table className="data">
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Division</th><th>Note</th></tr>
            </thead>
            <tbody>
              {rows.filter((r) => !entity || r.entity === entity).map((a) => (
                <React.Fragment key={a.id}>
                  <tr onClick={() => toggle(a.id)} style={{ cursor: "pointer" }}>
                    <td className="nowrap">{formatDateTime(a.created_at)}</td>
                    <td><strong>{a.actor_name || "system"}</strong>{a.actor_code && <div className="muted" style={{ fontSize: "0.78rem" }}>{a.actor_code}</div>}</td>
                    <td><Badge tone={ACTION_TONE[a.action] || "grey"}>{a.action}</Badge></td>
                    <td className="mono">{a.entity}#{a.entity_id}</td>
                    <td>{divName(a.division_id)}</td>
                    <td>
                      <div className="row" style={{ gap: "0.4rem" }}>
                        {a.flagged && <span className="flag-dot" />}
                        <span className="muted" style={{ fontSize: "0.82rem" }}>{a.note || "—"}</span>
                      </div>
                    </td>
                  </tr>
                  {expanded[a.id] && (
                    <tr>
                      <td colSpan={6} style={{ background: "var(--surface-2)" }}>
                        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                          <div>
                            <strong style={{ fontSize: "0.78rem", textTransform: "uppercase", color: "var(--ink-500)" }}>Old values</strong>
                            <pre className="mono" style={{ fontSize: "0.76rem", margin: "0.3rem 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                              {a.old_values ? JSON.stringify(a.old_values, null, 2) : "—"}
                            </pre>
                          </div>
                          <div>
                            <strong style={{ fontSize: "0.78rem", textTransform: "uppercase", color: "var(--ink-500)" }}>New values</strong>
                            <pre className="mono" style={{ fontSize: "0.76rem", margin: "0.3rem 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                              {a.new_values ? JSON.stringify(a.new_values, null, 2) : "—"}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.8rem" }}>
        This table is read-only by design — the backend never UPDATEs or DELETEs from <code className="mono">audit_logs</code>.
        Records older than the current calendar day that touch <code className="mono">daily_task_logs</code> are auto-flagged.
      </p>
    </>
  );
}
