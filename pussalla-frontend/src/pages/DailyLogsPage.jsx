import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card.jsx";
import Modal, { ConfirmDialog } from "../components/Modal.jsx";
import { MiniSpinner } from "../components/Loaders.jsx";
import { dailyLogsApi, tasksApi, employeesApi, divisionsApi, crossApi } from "../api/client";
import {
  formatMoney, formatNumber, formatDate, taskTypeLabel, calcEngine,
  todayISO, initials, hasRole,
} from "../utils/helpers";

export default function DailyLogsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [divisions, setDivisions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [logs, setLogs] = useState([]);
  const [crossEmployeeIds, setCrossEmployeeIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(todayISO());
  const [filterDiv, setFilterDiv] = useState(user.homeDivisionId || "");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const canSeeAllDivisions = hasRole(user, "super_admin");

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDate) params.date = filterDate;
      if (filterDiv) params.divisionId = filterDiv;
      // Cross-assignments INTO the filtered division on the filtered date tell
      // us which employees are temporarily rostered there that day.
      const crossParams = {};
      if (filterDate) crossParams.date = filterDate;
      if (filterDiv) crossParams.toDivisionId = filterDiv;
      const [divs, emps, rows, cross] = await Promise.all([
        divisionsApi.list().catch(() => []),
        employeesApi.list().catch(() => []),
        dailyLogsApi.list(params).catch(() => []),
        crossApi.list(crossParams).catch(() => []),
      ]);
      setDivisions(divs);
      setEmployees(emps);
      setLogs(rows);
      setCrossEmployeeIds(Array.from(new Set(cross.map((c) => Number(c.employee_id)))));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterDate, filterDiv]);

  const empName = (id) => employees.find((e) => e.id === id)?.name || `#${id}`;
  const divName = (id) => divisions.find((d) => d.id === id)?.name || "—";

  const totalAmount = logs.reduce((s, l) => s + Number(l.amount), 0);
  const totalOutput = logs.reduce((s, l) => s + Number(l.total_output), 0);

  const handleSaved = () => { setModalOpen(false); setEditTarget(null); load(); };

  return (
    <>
      <PageHead
        title="Daily Task Logs"
        subtitle="Capture, review and edit daily task output. The three calculation engines compute payouts automatically."
        actions={<button className="btn" onClick={() => { setEditTarget(null); setModalOpen(true); }}>+ New log entry</button>}
      />

      <div className="kpi-grid" style={{ marginBottom: "1rem" }}>
        <KPI tone="green" label="Logs (filtered)" value={logs.length} />
        <KPI tone="gold" label="Output Captured" value={formatNumber(totalOutput)} />
        <KPI tone="blue" label="Payout Total" value={formatMoney(totalAmount)} />
      </div>

      <Card style={{ marginBottom: "1rem" }}>
        <div className="row">
          <div>
            <label>Date</label>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ width: "auto" }} />
          </div>
          <div>
            <label>Division {canSeeAllDivisions ? "" : "(your division)"}</label>
            <select value={filterDiv} onChange={(e) => setFilterDiv(e.target.value)} style={{ width: "auto" }} disabled={!canSeeAllDivisions && !!user.homeDivisionId}>
              <option value="">All divisions</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <table className="data"><tbody><SkeletonRows cols={6} /></tbody></table>
        ) : logs.length === 0 ? (
          <EmptyState title="No logs for this filter" message="Adjust the date/division or create a new entry." />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Task</th><th>Division</th><th>Type</th><th>Output</th><th>Amount</th><th>Participants</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td><strong>{l.task_name}</strong><div className="muted" style={{ fontSize: "0.78rem" }}>{formatDate(l.log_date)}</div></td>
                  <td>{divName(l.division_id)}</td>
                  <td><Badge tone="grey">{taskTypeLabel(l.task_type)}</Badge></td>
                  <td className="mono">{formatNumber(l.total_output)} {l.unit}</td>
                  <td className="money"><strong>{formatMoney(l.amount)}</strong></td>
                  <td>
                    <div className="row" style={{ gap: "0.25rem" }}>
                      {(l.participants || []).slice(0, 4).map((p) => (
                        <span key={p.employeeId} title={`${empName(p.employeeId)}: ${formatMoney(p.share)}`} className="badge tag-green" style={{ fontSize: "0.7rem" }}>
                          {initials(empName(p.employeeId))}
                        </span>
                      ))}
                      {(l.participants || []).length > 4 && <span className="muted">+{(l.participants || []).length - 4}</span>}
                    </div>
                  </td>
                  <td>
                    <div className="row" style={{ gap: "0.3rem" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditTarget(l); setModalOpen(true); }}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => setConfirmDel(l)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {modalOpen && (
        <LogEntryModal
          divisions={divisions}
          employees={employees}
          crossEmployeeIds={crossEmployeeIds}
          editTarget={editTarget}
          defaultDivisionId={user.homeDivisionId}
          onSaved={handleSaved}
          onClose={() => { setModalOpen(false); setEditTarget(null); }}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete log entry?"
          message={`Delete "${confirmDel.task_name}" (${formatNumber(confirmDel.total_output)} ${confirmDel.unit})? This is recorded in the audit trail.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await dailyLogsApi.remove(confirmDel.id);
              toast.success("Log entry deleted");
              setConfirmDel(null);
              load();
            } catch (e) { toast.error(e.message); }
          }}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}

function LogEntryModal({ divisions, employees, crossEmployeeIds, editTarget, defaultDivisionId, onSaved, onClose }) {
  const toast = useToast();
  const [date, setDate] = useState(editTarget?.log_date || todayISO());
  const [divisionId, setDivisionId] = useState(editTarget?.division_id || defaultDivisionId || "");
  const [taskId, setTaskId] = useState(editTarget?.task_id || "");
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Type 1 entries: one row per employee with individual output
  const [entries, setEntries] = useState(() => {
    if (editTarget && editTarget.task_type === 1) {
      return (editTarget.participants || []).map((p) => ({ employeeId: p.employeeId, output: Number(editTarget.total_output) }));
    }
    return [{ employeeId: "", output: "" }];
  });
  // Type 2/3 pooled inputs
  const [totalOutput, setTotalOutput] = useState(editTarget ? Number(editTarget.total_output) : "");
  const [participantIds, setParticipantIds] = useState(() => {
    if (editTarget && editTarget.task_type !== 1) return (editTarget.participants || []).map((p) => p.employeeId);
    return [];
  });

  const [saving, setSaving] = useState(false);

  // Load tasks when division changes (only on create flow).
  useEffect(() => {
    if (editTarget) {
      // For edit, we already know the task — but fetch the full list for display.
      setTasksLoading(true);
      tasksApi.list(divisionId).then(setTasks).catch(() => setTasks([])).finally(() => setTasksLoading(false));
      return;
    }
    if (!divisionId) { setTasks([]); setTaskId(""); return; }
    setTasksLoading(true);
    tasksApi.list(divisionId)
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false));
    setTaskId("");
  }, [divisionId, editTarget]);

  const selectedTask = useMemo(() => {
    if (editTarget) {
      return {
        task_type: editTarget.task_type, rate: editTarget.rate_snapshot, base_limit: editTarget.base_limit_snapshot,
        unit: editTarget.unit, name: editTarget.task_name,
      };
    }
    return tasks.find((t) => t.id === Number(taskId));
  }, [editTarget, tasks, taskId]);

  const isType1 = selectedTask?.task_type === 1;

  // Live calc preview.
  const preview = useMemo(() => {
    if (!selectedTask) return null;
    if (isType1) {
      return entries.reduce((acc, en) => {
        if (en.output && en.employeeId) {
          const { total } = calcEngine(selectedTask, Number(en.output), 1);
          acc.total += total;
          acc.perWorker.push({ id: en.employeeId, amount: total });
        }
        return acc;
      }, { total: 0, perWorker: [] });
    }
    const workers = participantIds.length;
    if (!totalOutput || !workers) return { total: 0, perWorker: 0, count: workers };
    return { ...calcEngine(selectedTask, Number(totalOutput), workers), count: workers };
  }, [selectedTask, isType1, entries, totalOutput, participantIds]);

  const validEmployees = useMemo(
    () => employees.filter(
      (e) => e.active !== false && (
        (!divisionId || Number(e.home_division_id) === Number(divisionId)) ||
        crossEmployeeIds.includes(Number(e.id))
      )
    ),
    [employees, divisionId, crossEmployeeIds]
  );

  const setEntry = (i, field, value) => {
    setEntries((arr) => arr.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  };
  const addEntry = () => setEntries((a) => [...a, { employeeId: "", output: "" }]);
  const removeEntry = (i) => setEntries((a) => a.filter((_, idx) => idx !== i));

  const toggleParticipant = (id) => {
    const v = Number(id);
    setParticipantIds((arr) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const submit = async () => {
    if (!date || !divisionId || !taskId) { toast.error("Date, division and task are required"); return; }
    if (isType1) {
      const clean = entries.filter((e) => e.employeeId && e.output !== "" && e.output != null);
      if (!clean.length) { toast.error("Add at least one employee with output"); return; }
      setSaving(true);
      try {
        await dailyLogsApi.create({
          date, divisionId: Number(divisionId), taskId: Number(taskId),
          entries: clean.map((e) => ({ employeeId: Number(e.employeeId), output: Number(e.output) })),
        });
        toast.success("Individual log(s) saved");
        onSaved();
      } catch (e) { toast.error(e.message); } finally { setSaving(false); }
    } else {
      if (!totalOutput || !participantIds.length) { toast.error("Total output and at least one participant are required"); return; }
      setSaving(true);
      try {
        await dailyLogsApi.create({
          date, divisionId: Number(divisionId), taskId: Number(taskId),
          totalOutput: Number(totalOutput), participantIds,
        });
        toast.success("Group log saved");
        onSaved();
      } catch (e) { toast.error(e.message); } finally { setSaving(false); }
    }
  };

  // Edit flow: PUT only updates totalOutput.
  const submitEdit = async () => {
    if (totalOutput == null || totalOutput === "") { toast.error("Total output is required"); return; }
    setSaving(true);
    try {
      await dailyLogsApi.update(editTarget.id, Number(totalOutput));
      toast.success(editTarget && String(editTarget.log_date).slice(0, 10) !== todayISO()
        ? "Updated — flagged as retroactive edit"
        : "Log updated");
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const isEdit = !!editTarget;

  return (
    <Modal
      title={isEdit ? "Edit log entry" : "New daily log entry"}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={isEdit ? submitEdit : submit} disabled={saving || !selectedTask}>
            {saving ? <><MiniSpinner /> Saving…</> : isEdit ? "Save changes" : "Save log"}
          </button>
        </>
      }
    >
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label>Date</label>
          <input type="date" value={String(date).slice(0, 10)} onChange={(e) => setDate(e.target.value)} disabled={isEdit} />
        </div>
        <div>
          <label>Division</label>
          <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)} disabled={isEdit}>
            <option value="">Select…</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      {!isEdit && (
        <div style={{ marginTop: "0.75rem" }}>
          <label>Task</label>
          {tasksLoading ? <InlineMini label="Loading tasks…" /> : (
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Select…</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {taskTypeLabel(t.task_type)} · {formatMoney(t.rate)}/{t.unit}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {isEdit && (
        <div className="card" style={{ background: "var(--surface-2)", marginTop: "0.75rem", padding: "0.8rem" }}>
          <div className="row">
            <Badge tone="grey">{taskTypeLabel(editTarget.task_type)}</Badge>
            <strong>{editTarget.task_name}</strong>
            <span className="muted">rate {formatMoney(editTarget.rate_snapshot)}/{editTarget.unit}</span>
            {editTarget.task_type === 3 && <span className="muted">base limit {formatNumber(editTarget.base_limit_snapshot)}</span>}
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="card" style={{ marginTop: "0.9rem", background: "var(--pussalla-green-050)", border: "1px solid var(--pussalla-green-100)" }}>
          <div className="spread">
            <strong>Calculation preview</strong>
            <Badge tone={isType1 ? "green" : selectedTask.task_type === 3 ? "blue" : "gold"}>{taskTypeLabel(selectedTask.task_type)}</Badge>
          </div>
          {isType1 ? (
            <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>
              {preview.perWorker.length} valid entr{preview.perWorker.length === 1 ? "y" : "ies"} · total payout{" "}
              <strong style={{ color: "var(--pussalla-green-700)" }}>{formatMoney(preview.total)}</strong>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>
              {participantIds.length} participant(s) · pool{" "}
              <strong style={{ color: "var(--pussalla-green-700)" }}>{formatMoney(preview.total)}</strong> · per worker{" "}
              <strong style={{ color: "var(--pussalla-gold-700)" }}>{formatMoney(preview.perWorker)}</strong>
            </div>
          )}
        </div>
      )}

      {/* Type 1 — individual entries */}
      {selectedTask && isType1 && !isEdit && (
        <div style={{ marginTop: "0.9rem" }}>
          <div className="spread"><label style={{ margin: 0 }}>Individual entries</label><button className="btn btn-ghost btn-sm" onClick={addEntry}>+ Add</button></div>
          {entries.map((en, i) => (
            <div className="grid" style={{ gridTemplateColumns: "1fr 140px auto", alignItems: "end", gap: "0.5rem", marginTop: "0.4rem" }} key={i}>
              <div>
                <select value={en.employeeId} onChange={(e) => setEntry(i, "employeeId", e.target.value)}>
                  <option value="">Select employee…</option>
                  {validEmployees.map((emp) => {
                    const isCross = crossEmployeeIds.includes(Number(emp.id)) && Number(emp.home_division_id) !== Number(divisionId);
                    return <option key={emp.id} value={emp.id}>{emp.code} · {emp.name}{isCross ? " (cross-assigned)" : ""}</option>;
                  })}
                </select>
              </div>
              <div>
                <input type="number" min="0" step="any" placeholder={`Output (${selectedTask.unit})`} value={en.output} onChange={(e) => setEntry(i, "output", e.target.value)} />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => removeEntry(i)} disabled={entries.length === 1} aria-label="Remove entry">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Type 2/3 — pooled */}
      {selectedTask && !isType1 && (
        <>
          <div style={{ marginTop: "0.9rem" }}>
            <label>Total output ({selectedTask.unit})</label>
            <input type="number" min="0" step="any" value={totalOutput} onChange={(e) => setTotalOutput(e.target.value)} />
          </div>
          {!isEdit && (
            <div style={{ marginTop: "0.9rem" }}>
              <label>Participants ({participantIds.length} selected)</label>
              <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--ink-100)", borderRadius: "var(--radius-sm)", padding: "0.4rem" }}>
                {validEmployees.length === 0 ? (
                  <span className="muted">No employees in this division.</span>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.3rem" }}>
                    {validEmployees.map((emp) => {
                      const isCross = crossEmployeeIds.includes(Number(emp.id)) && Number(emp.home_division_id) !== Number(divisionId);
                      return (
                        <label key={emp.id} className="row" style={{ fontSize: "0.85rem", cursor: "pointer", gap: "0.4rem" }}>
                          <input type="checkbox" checked={participantIds.includes(emp.id)} onChange={() => toggleParticipant(emp.id)} style={{ width: "auto" }} />
                          <span>
                            {emp.name} <span className="muted">{emp.code}</span>
                            {isCross && <Badge tone="gold" style={{ marginLeft: "0.3rem", fontSize: "0.66rem" }}>cross</Badge>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              {isEdit && selectedTask && (
                <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.4rem" }}>
                  {participantIds.length} existing participant(s); editing updates output and redistributes shares.
                </p>
              )}
            </div>
          )}
          {isEdit && (
            <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.6rem" }}>
              Editing on a date <em>after</em> the log's own date is automatically flagged for Super Admin review.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

function InlineMini({ label }) {
  return <div className="row" style={{ padding: "0.3rem 0", gap: "0.4rem", color: "var(--ink-500)" }}><MiniSpinner /> <span>{label}</span></div>;
}
