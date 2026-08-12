import React, { useEffect, useState } from "react";
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
  const [employeeId, setEmployeeId] = useState("");
  const [toDivisionId, setToDivisionId] = useState("");
  const [assignmentDate, setAssignmentDate] = useState(todayISO());
  const [shift, setShift] = useState("Morning");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const SHIFTS = ["Morning", "Evening", "Night"];

  const submit = async () => {
    if (!employeeId || !toDivisionId || !assignmentDate || !shift) { toast.error("Employee, destination division, date and shift are required"); return; }
    setSaving(true);
    try {
      await crossApi.create({ employeeId: Number(employeeId), toDivisionId: Number(toDivisionId), assignmentDate, shift, note });
      toast.success("Assignment created");
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
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label>Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Select…</option>
            {employees.filter((e) => e.active !== false).map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.code} · {emp.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Reassign to division</label>
          <select value={toDivisionId} onChange={(e) => setToDivisionId(e.target.value)}>
            <option value="">Select…</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
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
      <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.8rem" }}>
        The employee's home division is recorded automatically as the "from" division.
      </p>
    </Modal>
  );
}
