import React, { useEffect, useMemo, useState } from "react";
import { useToast } from "../context/ToastContext";
import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card.jsx";
import Modal from "../components/Modal.jsx";
import { MiniSpinner } from "../components/Loaders.jsx";
import { crossApi, employeesApi, divisionsApi } from "../api/client";
import { formatDate, todayISO, initials } from "../utils/helpers";

export default function CrossAssignmentsPage() {
  const toast = useToast();
  const [divisions, setDivisions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDate) params.date = filterDate;
      const [divs, emps, list] = await Promise.all([
        divisionsApi.list().catch(() => []),
        employeesApi.list().catch(() => []),
        crossApi.list(params).catch(() => []),
      ]);
      setDivisions(divs);
      setEmployees(emps);
      setRows(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterDate]);

  const divName = (id) => divisions.find((d) => d.id === id)?.name || `#${id}`;
  const empName = (id) => employees.find((e) => e.id === id)?.name || `#${id}`;
  const empCode = (id) => employees.find((e) => e.id === id)?.code || "";

  return (
    <>
      <PageHead
        title="Cross-Division Assignments"
        subtitle="Temporarily reassign employees across divisions for a shift. Managed by HR."
        actions={<button className="btn" onClick={() => setModalOpen(true)}>+ New assignment</button>}
      />

      <div className="kpi-grid stagger" style={{ marginBottom: "1rem" }}>
        <KPI tone="green" label="Assignments (filtered)" value={rows.length} />
        <KPI tone="gold" label="Distinct Employees" value={new Set(rows.map((r) => r.employee_id)).size} />
        <KPI tone="blue" label="Divisions Involved" value={new Set([...rows.map((r) => r.from_division_id), ...rows.map((r) => r.to_division_id)]).size} />
      </div>

      <Card style={{ marginBottom: "1rem" }}>
        <div className="row">
          <div>
            <label>Filter by date</label>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ width: "auto" }} />
          </div>
          {filterDate && <button className="btn btn-ghost btn-sm" onClick={() => setFilterDate("")} style={{ alignSelf: "flex-end" }}>Clear</button>}
        </div>
      </Card>

      <Card>
        {loading ? (
          <table className="data"><tbody><SkeletonRows cols={5} /></tbody></table>
        ) : rows.length === 0 ? (
          <EmptyState title="No assignments" message="Create a cross-division assignment to cover staffing gaps." />
        ) : (
          <table className="data">
            <thead>
              <tr><th>Employee</th><th>From</th><th>To</th><th>Date</th><th>Shift</th><th>Note</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="row" style={{ gap: "0.4rem" }}>
                      <span className="badge tag-green" style={{ fontWeight: 700 }}>{initials(empName(r.employee_id))}</span>
                      <div><strong>{empName(r.employee_id)}</strong><div className="muted" style={{ fontSize: "0.78rem" }}>{empCode(r.employee_id)}</div></div>
                    </div>
                  </td>
                  <td>{divName(r.from_division_id)}</td>
                  <td><Badge tone="gold">→ {divName(r.to_division_id)}</Badge></td>
                  <td className="nowrap">{formatDate(r.assignment_date)}</td>
                  <td>{r.shift}</td>
                  <td className="muted">{r.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {modalOpen && (
        <AssignModal
          divisions={divisions}
          employees={employees}
          onSaved={() => { setModalOpen(false); load(); }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function AssignModal({ divisions, employees, onSaved, onClose }) {
  const toast = useToast();
  const [fromDivisionId, setFromDivisionId] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [toDivisionId, setToDivisionId] = useState("");
  const [assignmentDate, setAssignmentDate] = useState(todayISO());
  const [shift, setShift] = useState("Morning");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const SHIFTS = ["Morning", "Evening", "Night"];

  // Step 2 — employees whose home division is the chosen "from" department.
  const divisionEmployees = useMemo(
    () => employees.filter((e) => e.active !== false && Number(e.home_division_id) === Number(fromDivisionId)),
    [employees, fromDivisionId]
  );

  const divName = (id) => divisions.find((d) => d.id === Number(id))?.name || "";

  const toggle = (id) => {
    const v = Number(id);
    setSelectedIds((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]));
  };
  const selectAll = () => setSelectedIds(divisionEmployees.map((e) => e.id));
  const clearAll = () => setSelectedIds([]);

  const submit = async () => {
    if (!fromDivisionId) { toast.error("Choose the home department first"); return; }
    if (!selectedIds.length) { toast.error("Select at least one employee to cross-assign"); return; }
    if (!toDivisionId) { toast.error("Choose the new department"); return; }
    if (Number(toDivisionId) === Number(fromDivisionId)) { toast.error("New department must differ from the home department"); return; }
    if (!assignmentDate || !shift) { toast.error("Date and shift are required"); return; }
    setSaving(true);
    try {
      await Promise.all(
        selectedIds.map((empId) =>
          crossApi.create({ employeeId: Number(empId), toDivisionId: Number(toDivisionId), assignmentDate, shift, note })
        )
      );
      toast.success(`Cross-assigned ${selectedIds.length} employee(s) to ${divName(toDivisionId)}`);
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal
      title="New cross-division assignment"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={saving}>{saving ? <><MiniSpinner /> Saving…</> : "Create"}</button>
        </>
      }
    >
      {/* Step 1 — home department */}
      <div className="step-label">Step 1 · Home department</div>
      <label>Choose the employee's home department</label>
      <select value={fromDivisionId} onChange={(e) => { setFromDivisionId(e.target.value); setSelectedIds([]); }}>
        <option value="">Select department…</option>
        {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>

      {/* Step 2 — employees in that department */}
      {fromDivisionId && (
        <div style={{ marginTop: "1rem" }}>
          <div className="step-label">Step 2 · Select employees to cross-assign</div>
          {divisionEmployees.length === 0 ? (
            <div className="empty" style={{ padding: "1.2rem" }}>
              <div className="big">🪹</div>
              <strong>No active employees in {divName(fromDivisionId)}</strong>
              <p className="muted">Pick a different home department.</p>
            </div>
          ) : (
            <>
              <div className="spread" style={{ marginBottom: "0.5rem" }}>
                <span className="muted" style={{ fontSize: "0.82rem" }}>{selectedIds.length} of {divisionEmployees.length} selected</span>
                <div className="row" style={{ gap: "0.4rem" }}>
                  <button className="btn btn-ghost btn-sm" onClick={selectAll}>Select all</button>
                  <button className="btn btn-ghost btn-sm" onClick={clearAll} disabled={!selectedIds.length}>Clear</button>
                </div>
              </div>
              <div className="pick-list">
                {divisionEmployees.map((emp) => {
                  const on = selectedIds.includes(emp.id);
                  return (
                    <label key={emp.id} className={`pick-row ${on ? "on" : ""}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(emp.id)} />
                      <span className="badge tag-green" style={{ fontWeight: 700 }}>{initials(emp.name)}</span>
                      <span className="pick-name">{emp.name}</span>
                      <span className="muted mono" style={{ fontSize: "0.78rem" }}>{emp.code}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3 — new department */}
      {selectedIds.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <div className="step-label">Step 3 · New department</div>
          <label>Reassign selected employee(s) to</label>
          <select value={toDivisionId} onChange={(e) => setToDivisionId(e.target.value)}>
            <option value="">Select new department…</option>
            {divisions.filter((d) => Number(d.id) !== Number(fromDivisionId)).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Step 4 — schedule + note */}
      {toDivisionId && (
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "1rem" }}>
          <div>
            <label>Assignment date</label>
            <input type="date" value={assignmentDate} onChange={(e) => setAssignmentDate(e.target.value)} />
          </div>
          <div>
            <label>Shift</label>
            <select value={shift} onChange={(e) => setShift(e.target.value)}>
              {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Note (optional)</label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for reassignment…" />
          </div>
        </div>
      )}

      {toDivisionId && (
        <div className="card" style={{ marginTop: "0.9rem", background: "var(--pussalla-green-050)", border: "1px solid var(--pussalla-green-100)" }}>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            <strong>{selectedIds.length}</strong> employee(s) move from{" "}
            <strong>{divName(fromDivisionId)}</strong> →{" "}
            <strong style={{ color: "var(--pussalla-green-700)" }}>{divName(toDivisionId)}</strong> on{" "}
            {assignmentDate} ({shift}). They will appear in {divName(toDivisionId)}'s daily-log roster that day.
          </div>
        </div>
      )}
    </Modal>
  );
}
