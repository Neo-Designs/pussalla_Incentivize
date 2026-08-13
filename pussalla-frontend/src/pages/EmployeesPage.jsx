import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card.jsx";
import Modal, { ConfirmDialog } from "../components/Modal.jsx";
import { MiniSpinner } from "../components/Loaders.jsx";
import { employeesApi, divisionsApi } from "../api/client";
import { formatMoney, roleLabel, initials, hasRole } from "../utils/helpers";

const ROLES = ["employee", "supervisor", "hr", "admin"];

const CSV_TEMPLATE = `code,name,role,divisionId,password
EMP-031,Sample Employee,employee,1,TempPass123
EMP-032,Sample Supervisor,supervisor,PPA,TempPass123
`;

export default function EmployeesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [divisions, setDivisions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [divs, rows] = await Promise.all([
        divisionsApi.list().catch(() => []),
        employeesApi.list().catch(() => []),
      ]);
      setDivisions(divs);
      setEmployees(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const divName = (id) => divisions.find((d) => d.id === id)?.name || "—";

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return employees
      .filter((e) => !filterRole || e.role === filterRole)
      .filter((e) => !term || e.name.toLowerCase().includes(term) || e.code.toLowerCase().includes(term));
  }, [employees, q, filterRole]);

  const canDelete = (emp) => emp.id !== user.id; // don't self-delete

  return (
    <>
      <PageHead
        title="Employees"
        subtitle="Manage staff records, roles and home division. All changes are audit-logged."
        actions={
          <>
            {hasRole(user, "hr") && (
              <button className="btn btn-ghost" onClick={() => setImportOpen(true)}>↓ Bulk import (CSV)</button>
            )}
            <button className="btn" onClick={() => { setEditTarget(null); setModalOpen(true); }}>+ Add employee</button>
          </>
        }
      />

      <div className="kpi-grid stagger" style={{ marginBottom: "1rem" }}>
        <KPI tone="green" label="Total Employees" value={employees.length} />
        <KPI tone="gold" label="Active" value={employees.filter((e) => e.active !== false).length} />
        <KPI tone="blue" label="Supervisors" value={employees.filter((e) => e.role === "supervisor").length} />
        <KPI tone="red" label="Inactive" value={employees.filter((e) => e.active === false).length} />
      </div>

      <Card style={{ marginBottom: "1rem" }}>
        <div className="row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or code…" />
          </div>
          <div>
            <label>Role</label>
            <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} style={{ width: "auto" }}>
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <table className="data"><tbody><SkeletonRows cols={5} /></tbody></table>
        ) : filtered.length === 0 ? (
          <EmptyState title="No employees match" />
        ) : (
          <table className="data">
            <thead>
              <tr><th>Employee</th><th>Code</th><th>Role</th><th>Home Division</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    <div className="row" style={{ gap: "0.5rem" }}>
                      <span className="badge tag-green" style={{ background: "var(--pussalla-green-100)", color: "var(--pussalla-green-800)", fontWeight: 700 }}>{initials(emp.name)}</span>
                      <strong>{emp.name}</strong>
                    </div>
                  </td>
                  <td className="mono">{emp.code}</td>
                  <td><Badge tone={emp.role === "supervisor" ? "green" : emp.role === "hr" ? "blue" : emp.role === "admin" ? "gold" : "grey"}>{roleLabel(emp.role)}</Badge></td>
                  <td>{divName(emp.home_division_id)}</td>
                  <td>{emp.active === false ? <Badge tone="red">Inactive</Badge> : <Badge tone="green">Active</Badge>}</td>
                  <td>
                    <div className="row" style={{ gap: "0.3rem" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditTarget(emp); setModalOpen(true); }}>Edit</button>
                      {hasRole(user, "hr") && canDelete(emp) && (
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => setConfirmDel(emp)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {modalOpen && (
        <EmployeeModal divisions={divisions} editTarget={editTarget} onSaved={() => { setModalOpen(false); setEditTarget(null); load(); }} onClose={() => { setModalOpen(false); setEditTarget(null); }} />
      )}

      {importOpen && (
        <BulkImportModal divisions={divisions} onDone={() => load()} onClose={() => setImportOpen(false)} />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete employee?"
          message={`Permanently delete ${confirmDel.name} (${confirmDel.code})? This cannot be undone and is recorded in the audit trail.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try { await employeesApi.remove(confirmDel.id); toast.success("Employee deleted"); setConfirmDel(null); load(); }
            catch (e) { toast.error(e.message); }
          }}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}

function EmployeeModal({ divisions, editTarget, onSaved, onClose }) {
  const toast = useToast();
  const isEdit = !!editTarget;
  const [code, setCode] = useState(editTarget?.code || "");
  const [name, setName] = useState(editTarget?.name || "");
  const [homeDivisionId, setHomeDivisionId] = useState(editTarget?.home_division_id || "");
  const [role, setRole] = useState(editTarget?.role || "employee");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(editTarget?.active !== false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (isEdit) {
      if (!name) { toast.error("Name is required"); return; }
      setSaving(true);
      try {
        await employeesApi.update(editTarget.id, {
          name, homeDivisionId: homeDivisionId ? Number(homeDivisionId) : null, role, active,
        });
        toast.success("Employee updated");
        onSaved();
      } catch (e) { toast.error(e.message); } finally { setSaving(false); }
    } else {
      if (!code || !name || !password) { toast.error("Code, name and password are required"); return; }
      setSaving(true);
      try {
        await employeesApi.create({
          code, name, homeDivisionId: homeDivisionId ? Number(homeDivisionId) : null, role, password,
        });
        toast.success("Employee created");
        onSaved();
      } catch (e) { toast.error(e.message); } finally { setSaving(false); }
    }
  };

  return (
    <Modal
      title={isEdit ? `Edit ${editTarget.name}` : "Add employee"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={saving}>{saving ? <><MiniSpinner /> Saving…</> : "Save"}</button>
        </>
      }
    >
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label>Employee code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} placeholder="EMP-031" />
        </div>
        <div>
          <label>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label>Home division</label>
          <select value={homeDivisionId} onChange={(e) => setHomeDivisionId(e.target.value)}>
            <option value="">— None —</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </div>
        {!isEdit && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Initial password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a strong password" />
          </div>
        )}
        {isEdit && (
          <div style={{ gridColumn: "1 / -1" }} className="row">
            <label className="row" style={{ fontSize: "0.88rem", gap: "0.4rem" }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: "auto" }} />
              Active (can sign in)
            </label>
          </div>
        )}
      </div>
      {isEdit && <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.8rem" }}>Role and division changes are audited. To reset a password, contact an administrator.</p>}
    </Modal>
  );
}

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pussalla-employee-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function BulkImportModal({ divisions, onDone, onClose }) {
  const toast = useToast();
  const [csvText, setCsvText] = useState("");
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.readAsText(file);
  };

  const submit = async () => {
    if (!csvText.trim()) { toast.error("Paste CSV or pick a file first"); return; }
    setSaving(true);
    try {
      const r = await employeesApi.bulkImport(csvText);
      setResult(r);
      if (r.created) { toast.success(`${r.created} employee(s) imported`); onDone(); }
      else { toast.info("No new employees created"); }
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal
      title="Bulk import employees"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn" onClick={submit} disabled={saving || !csvText.trim()}>
            {saving ? <><MiniSpinner /> Importing…</> : "Import CSV"}
          </button>
        </>
      }
    >
      <div style={{ marginBottom: "0.8rem" }}>
        <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>↓ Download CSV template</button>
        <span className="muted" style={{ fontSize: "0.82rem", marginLeft: "0.6rem" }}>
          Columns: code, name, role, divisionId, password
        </span>
      </div>
      <div style={{ marginBottom: "0.6rem" }}>
        <label>Choose CSV file</label>
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
      </div>
      <div>
        <label>…or paste CSV here</label>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={8}
          placeholder={"code,name,role,divisionId,password\nEMP-031,...,employee,1,Pass123"}
          style={{ fontFamily: "monospace", fontSize: "0.82rem", width: "100%" }}
        />
      </div>
      <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.4rem" }}>
        Valid division IDs/codes: {divisions.map((d) => `${d.id} (${d.code})`).join(", ")}.
        Valid roles: employee, supervisor, hr, admin.
      </p>

      {result && (
        <div style={{ marginTop: "0.8rem" }}>
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: "0.6rem" }}>
            <KPI tone="green" label="Created" value={result.created} />
            <KPI tone="gold" label="Skipped" value={result.skipped.length} />
            <KPI tone="red" label="Errors" value={result.errors.length} />
          </div>
          {result.skipped.length > 0 && (
            <details style={{ marginBottom: "0.4rem" }}>
              <summary style={{ cursor: "pointer", fontSize: "0.85rem" }}>Skipped rows ({result.skipped.length})</summary>
              <ul style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>
                {result.skipped.map((s, i) => <li key={i}>Row {s.row} · {s.code || "—"}: {s.reason}</li>)}
              </ul>
            </details>
          )}
          {result.errors.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer", fontSize: "0.85rem" }}>Error rows ({result.errors.length})</summary>
              <ul style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>
                {result.errors.map((s, i) => <li key={i}>Row {s.row} · {s.code || "—"}: {s.error}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
