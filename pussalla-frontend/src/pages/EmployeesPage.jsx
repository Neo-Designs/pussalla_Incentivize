import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card.jsx";
import Modal, { ConfirmDialog } from "../components/Modal.jsx";
import { MiniSpinner } from "../components/Loaders.jsx";
import { employeesApi, divisionsApi, subDivisionsApi } from "../api/client";
import { formatMoney, roleLabel, initials, hasRole } from "../utils/helpers";

const ROLES = ["employee", "supervisor", "hr", "admin", "super_admin"];

const CSV_TEMPLATE = `code,name,role,divisionId,subDivisionId,password
EMP-031,Sample Employee,employee,1,,TempPass123
EMP-032,Sample Supervisor,supervisor,PPA,,TempPass123
`;

export default function EmployeesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [divisions, setDivisions] = useState([]);
  const [subDivisions, setSubDivisions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterDiv, setFilterDiv] = useState("");
  const [filterSubDiv, setFilterSubDiv] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [subDivModalOpen, setSubDivModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [divs, subs, rows] = await Promise.all([
        divisionsApi.list().catch(() => []),
        subDivisionsApi.list().catch(() => []),
        employeesApi.listAll().catch(() => []),
      ]);
      setDivisions(divs);
      setSubDivisions(subs);
      setEmployees(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const divName = (id) => divisions.find((d) => d.id === id)?.name || "—";
  const subDivName = (id) => subDivisions.find((s) => s.id === id)?.name || null;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return employees
      .filter((e) => !filterRole || e.role === filterRole)
      .filter((e) => !filterDiv || Number(e.home_division_id) === Number(filterDiv))
      .filter((e) => !filterSubDiv || (filterSubDiv === "none" ? !e.sub_division_id : Number(e.sub_division_id) === Number(filterSubDiv)))
      .filter((e) => !term || e.name.toLowerCase().includes(term) || e.code.toLowerCase().includes(term));
  }, [employees, q, filterRole, filterDiv, filterSubDiv]);

  // Head-count per sub-division (active employees), shown in the filter list.
  const subDivCounts = useMemo(() => {
    const m = {};
    for (const e of employees) if (e.active !== false && e.sub_division_id) m[e.sub_division_id] = (m[e.sub_division_id] || 0) + 1;
    return m;
  }, [employees]);
  const subDivOptions = useMemo(
    () => subDivisions
      .filter((s) => !filterDiv || Number(s.division_id) === Number(filterDiv))
      .slice().sort((a, b) => a.name.localeCompare(b.name)),
    [subDivisions, filterDiv]
  );

  const canDelete = (emp) => emp.id !== user.id; // don't self-delete

  return (
    <>
      <PageHead
        title="Employees"
        subtitle="Manage staff records, roles and home division. All changes are audit-logged."
        actions={
          <>
            {hasRole(user, "hr") && (
              <button className="btn btn-ghost" onClick={() => setSubDivModalOpen(true)}>⚙ Sub-divisions</button>
            )}
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
        {(filterDiv || filterSubDiv || filterRole || q) && (
          <KPI tone="green" label="Matching filters"
            value={filtered.length}
            sub={`${filtered.filter((e) => e.active !== false).length} active`} />
        )}
      </div>

      <Card style={{ marginBottom: "1rem" }}>
        <div className="row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or code…" />
          </div>
          <div>
            <label>Division</label>
            <select value={filterDiv} onChange={(e) => { setFilterDiv(e.target.value); setFilterSubDiv(""); }} style={{ width: "auto" }}>
              <option value="">All divisions</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label>Sub-division</label>
            <select value={filterSubDiv} onChange={(e) => setFilterSubDiv(e.target.value)} style={{ width: "auto" }}>
              <option value="">All sub-divisions</option>
              {subDivOptions.map((s) => <option key={s.id} value={s.id}>{s.name} ({subDivCounts[s.id] || 0})</option>)}
              <option value="none">— No sub-division —</option>
            </select>
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
              <tr><th>Employee</th><th>Code</th><th>Role</th><th>Home Division</th><th>Sub-division</th><th>Status</th><th>Actions</th></tr>
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
                  <td><Badge tone={emp.role === "super_admin" ? "red" : emp.role === "supervisor" ? "green" : emp.role === "hr" ? "blue" : emp.role === "admin" ? "gold" : "grey"}>{roleLabel(emp.role)}</Badge></td>
                  <td>{divName(emp.home_division_id)}</td>
                  <td>{subDivName(emp.sub_division_id) || "—"}</td>
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
        <EmployeeModal divisions={divisions} subDivisions={subDivisions} editTarget={editTarget} user={user} onSaved={() => { setModalOpen(false); setEditTarget(null); load(); }} onClose={() => { setModalOpen(false); setEditTarget(null); }} />
      )}

      {importOpen && (
        <BulkImportModal divisions={divisions} subDivisions={subDivisions} onDone={() => load()} onClose={() => setImportOpen(false)} />
      )}

      {subDivModalOpen && (
        <SubDivisionsModal divisions={divisions} subDivisions={subDivisions} onChanged={() => load()} onClose={() => setSubDivModalOpen(false)} />
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

function EmployeeModal({ divisions, subDivisions, editTarget, user, onSaved, onClose }) {
  const toast = useToast();
  const isEdit = !!editTarget;
  const isSuperAdmin = hasRole(user, "super_admin");
  const [code, setCode] = useState(editTarget?.code || "");
  const [name, setName] = useState(editTarget?.name || "");
  const [homeDivisionId, setHomeDivisionId] = useState(editTarget?.home_division_id || "");
  const [subDivisionId, setSubDivisionId] = useState(editTarget?.sub_division_id || "");
  const [role, setRole] = useState(editTarget?.role || "employee");
  const [password, setPassword] = useState("");
  const [resetPassword, setResetPassword] = useState(false);
  const [active, setActive] = useState(editTarget?.active !== false);
  const [saving, setSaving] = useState(false);

  const subDivisionOptions = useMemo(
    () => (homeDivisionId ? subDivisions.filter((s) => s.division_id === Number(homeDivisionId)) : []),
    [subDivisions, homeDivisionId]
  );

  const submit = async () => {
    if (isEdit) {
      if (!name) { toast.error("Name is required"); return; }
      if (resetPassword && !password) { toast.error("Enter a new password"); return; }
      setSaving(true);
      try {
        await employeesApi.update(editTarget.id, {
          name,
          homeDivisionId: homeDivisionId ? Number(homeDivisionId) : null,
          subDivisionId: subDivisionId ? Number(subDivisionId) : "",
          role,
          active,
          password: resetPassword && password ? password : undefined,
        });
        toast.success(resetPassword ? "Employee updated & password reset" : "Employee updated");
        onSaved();
      } catch (e) { toast.error(e.message); } finally { setSaving(false); }
    } else {
      if (!code || !name || !password) { toast.error("Code, name and password are required"); return; }
      setSaving(true);
      try {
        await employeesApi.create({
          code, name, homeDivisionId: homeDivisionId ? Number(homeDivisionId) : null,
          subDivisionId: subDivisionId ? Number(subDivisionId) : null, role, password,
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
          <select value={homeDivisionId} onChange={(e) => { setHomeDivisionId(e.target.value); setSubDivisionId(""); }}>
            <option value="">— None —</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label>Sub-division</label>
          <select value={subDivisionId} onChange={(e) => setSubDivisionId(e.target.value)} disabled={!homeDivisionId}>
            <option value="">— None —</option>
            {subDivisionOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
          <div style={{ gridColumn: "1 / -1" }}>
            {isSuperAdmin && (
              <div style={{ marginBottom: "0.6rem" }}>
                <label className="row" style={{ fontSize: "0.88rem", gap: "0.4rem" }}>
                  <input type="checkbox" checked={resetPassword} onChange={(e) => setResetPassword(e.target.checked)} style={{ width: "auto" }} />
                  Reset password
                </label>
                {resetPassword && (
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" style={{ marginTop: "0.4rem" }} />
                )}
              </div>
            )}
            <label className="row" style={{ fontSize: "0.88rem", gap: "0.4rem" }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: "auto" }} />
              Active (can sign in)
            </label>
          </div>
        )}
      </div>
      {isEdit && <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.8rem" }}>{isSuperAdmin ? "Role, division and password changes are audited." : "Role and division changes are audited. Only a super admin can reset passwords."}</p>}
    </Modal>
  );
}

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "incentivize-employee-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function BulkImportModal({ divisions, subDivisions, onDone, onClose }) {
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
          Columns: code, name, role, divisionId, subDivisionId (optional), password
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
      {subDivisions.length > 0 && (
        <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.2rem" }}>
          Valid sub-division IDs/codes: {subDivisions.map((s) => `${s.id} (${s.code})`).join(", ")}.
        </p>
      )}

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

// Manage the sub-divisions (sections) within a division — e.g. Ganewaththa's
// Birds Unloading, Cold Storage - Loading, Cutup & MDM, etc. Kept lightweight:
// pick a division, then add/rename/delete its sections.
function SubDivisionsModal({ divisions, subDivisions, onChanged, onClose }) {
  const toast = useToast();
  const [divisionId, setDivisionId] = useState(divisions[0]?.id || "");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [editing, setEditing] = useState(null); // sub-division being renamed
  const [editName, setEditName] = useState("");

  const scoped = subDivisions.filter((s) => s.division_id === Number(divisionId));

  const add = async () => {
    if (!divisionId || !code.trim() || !name.trim()) { toast.error("Division, code and name are required"); return; }
    setSaving(true);
    try {
      await subDivisionsApi.create({ divisionId: Number(divisionId), code: code.trim(), name: name.trim() });
      toast.success("Sub-division added");
      setCode(""); setName("");
      onChanged();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const rename = async (sub) => {
    if (!editName.trim()) { toast.error("Name is required"); return; }
    try {
      await subDivisionsApi.update(sub.id, { name: editName.trim() });
      toast.success("Sub-division renamed");
      setEditing(null);
      onChanged();
    } catch (e) { toast.error(e.message); }
  };

  const remove = async (sub) => {
    try {
      await subDivisionsApi.remove(sub.id);
      toast.success("Sub-division deleted");
      setConfirmDel(null);
      onChanged();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <Modal title="Manage sub-divisions" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      <div>
        <label>Division</label>
        <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div style={{ marginTop: "0.8rem" }}>
        {scoped.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.85rem" }}>No sub-divisions yet for this division.</p>
        ) : (
          <table className="data">
            <thead><tr><th>Code</th><th>Name</th><th>Actions</th></tr></thead>
            <tbody>
              {scoped.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.code}</td>
                  <td>
                    {editing === s.id ? (
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ fontSize: "0.85rem" }} />
                    ) : s.name}
                  </td>
                  <td>
                    <div className="row" style={{ gap: "0.3rem" }}>
                      {editing === s.id ? (
                        <>
                          <button className="btn btn-sm" onClick={() => rename(s)}>Save</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(s.id); setEditName(s.name); }}>Rename</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => setConfirmDel(s)}>Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr auto", gap: "0.5rem", marginTop: "0.9rem", alignItems: "end" }}>
        <div>
          <label>New code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BIRDS-UNLD" />
        </div>
        <div>
          <label>New name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Birds Unloading" />
        </div>
        <button className="btn btn-sm" onClick={add} disabled={saving}>+ Add</button>
      </div>

      {confirmDel && (
        <ConfirmDialog
          title="Delete sub-division?"
          message={`Delete "${confirmDel.name}"? Employees and tasks assigned to it will fall back to no sub-division.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => remove(confirmDel)}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </Modal>
  );
}
