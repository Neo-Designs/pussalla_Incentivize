import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card.jsx";
import Modal, { ConfirmDialog } from "../components/Modal.jsx";
import { MiniSpinner } from "../components/Loaders.jsx";
import { dailyLogsApi, tasksApi, employeesApi, divisionsApi, subDivisionsApi, crossApi } from "../api/client";
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
  // employeeId -> from_division_id, for cross-assignments INTO the filtered
  // division on the filtered date. Lets us tag a cross-assigned worker with
  // the home division they came from.
  const [crossMap, setCrossMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(todayISO());
  const [filterDiv, setFilterDiv] = useState(user.homeDivisionId || "");
  const [subDivisions, setSubDivisions] = useState([]);
  const [filterSubDiv, setFilterSubDiv] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const canSeeAllDivisions = hasRole(user, "super_admin") || hasRole(user, "supervisor");

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDate) params.date = filterDate;
      if (filterDiv) params.divisionId = filterDiv;
      if (filterSubDiv) params.subDivisionId = filterSubDiv;
      // Cross-assignments INTO the filtered division on the filtered date tell
      // us which employees are temporarily rostered there that day.
      const crossParams = {};
      if (filterDate) crossParams.date = filterDate;
      if (filterDiv) crossParams.toDivisionId = filterDiv;
      const [divs, emps, rows, cross] = await Promise.all([
        divisionsApi.list().catch(() => []),
        // Fetch a large page so cross-assigned employees from every home
        // division are available when the supervisor picks a target division.
        employeesApi.list({ limit: 500 }).catch(() => []),
        dailyLogsApi.list(params).catch(() => []),
        crossApi.list(crossParams).catch(() => []),
      ]);
      setDivisions(divs);
      setEmployees(emps);
      setLogs(rows);
      const map = {};
      for (const c of cross) map[Number(c.employee_id)] = Number(c.from_division_id);
      setCrossMap(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterDate, filterDiv, filterSubDiv]);

  // Sub-division options depend on the chosen division filter; reset when it changes.
  useEffect(() => {
    setFilterSubDiv("");
    if (!filterDiv) { setSubDivisions([]); return; }
    subDivisionsApi.list(filterDiv).then(setSubDivisions).catch(() => setSubDivisions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDiv]);

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
          {filterDiv && (
            <div>
              <label>Sub-division</label>
              <select value={filterSubDiv} onChange={(e) => setFilterSubDiv(e.target.value)} style={{ width: "auto" }}>
                <option value="">All sub-divisions</option>
                {subDivisions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
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
          crossMap={crossMap}
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

function LogEntryModal({ divisions, employees, crossMap, editTarget, defaultDivisionId, onSaved, onClose }) {
  const toast = useToast();
  const [date, setDate] = useState(editTarget?.log_date || todayISO());
  const [divisionId, setDivisionId] = useState(editTarget?.division_id || defaultDivisionId || "");
  const [taskId, setTaskId] = useState(editTarget?.task_id || "");
  const [tasks, setTasks] = useState([]);
  const [modalSubDivs, setModalSubDivs] = useState([]);
  const [subDivisionId, setSubDivisionId] = useState("");
  const [showOthers, setShowOthers] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const [tasksLoading, setTasksLoading] = useState(false);

  // Cross-assignments INTO the modal's selected division, active as of the
  // modal's selected date. This is fetched independently of the page filter so
  // that a supervisor picking any division sees the correct cross-assigned
  // staff for that division on that date.
  const [modalCrossMap, setModalCrossMap] = useState(crossMap || {});

  useEffect(() => {
    if (!divisionId || !date) { setModalCrossMap(crossMap || {}); return; }
    let cancelled = false;
    crossApi.list({ toDivisionId: divisionId, effectiveOn: date })
      .then((rows) => {
        if (cancelled) return;
        const map = {};
        for (const c of rows) map[Number(c.employee_id)] = Number(c.from_division_id);
        setModalCrossMap(map);
      })
      .catch(() => { if (!cancelled) setModalCrossMap(crossMap || {}); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId, date]);

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
    if (!divisionId) { setTasks([]); setTaskId(""); setModalSubDivs([]); setSubDivisionId(""); return; }
    setSubDivisionId("");
    subDivisionsApi.list(divisionId).then(setModalSubDivs).catch(() => setModalSubDivs([]));
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
        unit: editTarget.unit, name: editTarget.task_name, sub_division_id: editTarget.sub_division_id,
      };
    }
    return tasks.find((t) => t.id === Number(taskId));
  }, [editTarget, tasks, taskId]);

  // Tasks offered in the dropdown: narrowed to the chosen sub-division.
  const tasksForPicker = useMemo(
    () => (subDivisionId ? tasks.filter((t) => Number(t.sub_division_id) === Number(subDivisionId)) : tasks),
    [tasks, subDivisionId]
  );
  // Picking a sub-division with a single task selects that task automatically.
  useEffect(() => {
    if (editTarget) return;
    if (subDivisionId && tasksForPicker.length === 1) setTaskId(String(tasksForPicker[0].id));
    else setTaskId("");
    setParticipantIds([]);
    setShowOthers(false);
    setEmpSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subDivisionId, tasksForPicker]);

  const isType1 = selectedTask?.task_type === 1;
  const isType4 = selectedTask?.task_type === 4;

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
    if (isType4) return { ...calcEngine(selectedTask, workers, workers), count: workers };
    if (!totalOutput || !workers) return { total: 0, perWorker: 0, count: workers };
    return { ...calcEngine(selectedTask, Number(totalOutput), workers), count: workers };
  }, [selectedTask, isType1, isType4, entries, totalOutput, participantIds]);

  // When the selected task is scoped to a sub-division (e.g. "Birds Unloading"
  // within Ganewaththa), only that sub-division's own staff are valid
  // participants — a cross-assigned worker is still let in regardless, since
  // cross-assignments are tracked at the division level, not sub-division.
  const taskSubDivisionId = selectedTask?.sub_division_id;
  const validEmployees = useMemo(
    () => employees.filter(
      (e) => e.active !== false && (
        (
          (!divisionId || Number(e.home_division_id) === Number(divisionId)) &&
          (showOthers || !taskSubDivisionId || Number(e.sub_division_id) === Number(taskSubDivisionId))
        ) ||
        participantIds.includes(Number(e.id)) ||
        Object.prototype.hasOwnProperty.call(modalCrossMap, Number(e.id))
      )
    ),
    [employees, divisionId, modalCrossMap, taskSubDivisionId, showOthers, participantIds]
  );
  // Checklist after the search box; the task's own sub-division is listed first.
  const checklistEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    const list = q
      ? validEmployees.filter((e) => `${e.name} ${e.code}`.toLowerCase().includes(q))
      : validEmployees;
    if (!taskSubDivisionId) return list;
    const own = (e) => Number(e.sub_division_id) === Number(taskSubDivisionId);
    return [...list.filter(own), ...list.filter((e) => !own(e))];
  }, [validEmployees, empSearch, taskSubDivisionId]);
  const subDivNameOf = (id) => modalSubDivs.find((s) => Number(s.id) === Number(id))?.name;

  const crossFromName = (empId) => {
    const fromId = modalCrossMap[Number(empId)];
    if (!fromId) return null;
    return divisions.find((d) => Number(d.id) === Number(fromId))?.name || "another division";
  };

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
      if (!participantIds.length || (!isType4 && !totalOutput)) {
        toast.error(isType4 ? "Tick at least one person who was present" : "Total output and at least one participant are required");
        return;
      }
      setSaving(true);
      try {
        await dailyLogsApi.create({
          date, divisionId: Number(divisionId), taskId: Number(taskId),
          ...(isType4 ? {} : { totalOutput: Number(totalOutput) }), participantIds,
        });
        toast.success("Group log saved");
        onSaved();
      } catch (e) { toast.error(e.message); } finally { setSaving(false); }
    }
  };

  // Edit flow: change the units and/or who took part; shares are recalculated.
  const submitEdit = async () => {
    const payload = {};
    if (!isType4) {
      const out = isType1 ? entries[0]?.output : totalOutput;
      if (out == null || out === "") { toast.error("Total output is required"); return; }
      payload.totalOutput = Number(out);
    }
    if (!isType1) {
      if (!participantIds.length) { toast.error("Tick at least one person"); return; }
      payload.participantIds = participantIds;
    }
    const newDate = String(date).slice(0, 10);
    if (!newDate) { toast.error("Date is required"); return; }
    if (newDate !== String(editTarget.log_date).slice(0, 10)) payload.logDate = newDate;
    setSaving(true);
    try {
      await dailyLogsApi.update(editTarget.id, payload);
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
          <input type="date" value={String(date).slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
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
          {modalSubDivs.length > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <label>Sub-division</label>
              <select value={subDivisionId} onChange={(e) => setSubDivisionId(e.target.value)}>
                <option value="">All sub-divisions</option>
                {modalSubDivs.map((sd) => <option key={sd.id} value={sd.id}>{sd.name}</option>)}
              </select>
            </div>
          )}
          <label>Task</label>
          {tasksLoading ? <InlineMini label="Loading tasks…" /> : (
            <select value={taskId} onChange={(e) => { setTaskId(e.target.value); setParticipantIds([]); }}>
              <option value="">Select…</option>
              {tasksForPicker.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {taskTypeLabel(t.task_type)} · {formatMoney(t.rate)}/{t.task_type === 4 ? "person/day" : t.unit}
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
            <Badge tone={isType1 || isType4 ? "green" : selectedTask.task_type === 3 ? "blue" : "gold"}>{taskTypeLabel(selectedTask.task_type)}</Badge>
          </div>
          {isType4 ? (
            <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>
              {participantIds.length} present × {formatMoney(selectedTask.rate)} = {" "}
              <strong style={{ color: "var(--pussalla-green-700)" }}>{formatMoney(preview.total)}</strong>
            </div>
          ) : isType1 ? (
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

      {selectedTask && isType1 && isEdit && (
        <div style={{ marginTop: "0.9rem" }}>
          <label>Output ({selectedTask.unit})</label>
          <input type="number" min="0" step="any" value={entries[0]?.output ?? ""} onChange={(e) => setEntry(0, "output", e.target.value)} />
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
                    const from = crossFromName(emp.id);
                    return <option key={emp.id} value={emp.id}>{emp.code} · {emp.name}{from ? ` (cross-assigned from ${from})` : ""}</option>;
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
          {!isType4 && (
            <div style={{ marginTop: "0.9rem" }}>
              <label>Total output ({selectedTask.unit})</label>
              <input type="number" min="0" step="any" value={totalOutput} onChange={(e) => setTotalOutput(e.target.value)} />
            </div>
          )}
          {(
            <div style={{ marginTop: "0.9rem" }}>
              <div className="spread" style={{ marginBottom: "0.3rem", flexWrap: "wrap", gap: "0.4rem" }}>
                <label style={{ margin: 0 }}>{isType4 ? "Present today" : "Participants"} ({participantIds.length} selected)</label>
                <div className="row" style={{ gap: "0.3rem" }}>
                  <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => setParticipantIds((arr) => [...new Set([...arr, ...checklistEmployees.map((e) => Number(e.id))])])}>
                    Select all shown
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParticipantIds([])}>Clear</button>
                </div>
              </div>
              <div className="row" style={{ gap: "0.6rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
                <input placeholder="Search name or code…" value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
                {taskSubDivisionId && (
                  <label className="row" style={{ margin: 0, gap: "0.3rem", fontSize: "0.82rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} style={{ width: "auto" }} />
                    Show employees from other sub-divisions
                  </label>
                )}
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--ink-100)", borderRadius: "var(--radius-sm)", padding: "0.4rem" }}>
                {checklistEmployees.length === 0 ? (
                  <span className="muted">{empSearch ? "No match." : "No employees assigned to this task's sub-division yet."}</span>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.3rem" }}>
                    {checklistEmployees.map((emp) => {
                      const from = crossFromName(emp.id);
                      const otherSub = showOthers && taskSubDivisionId && Number(emp.sub_division_id) !== Number(taskSubDivisionId)
                        ? subDivNameOf(emp.sub_division_id) || "no sub-division" : null;
                      return (
                        <label key={emp.id} className="row" style={{ fontSize: "0.85rem", cursor: "pointer", gap: "0.4rem" }}>
                          <input type="checkbox" checked={participantIds.includes(emp.id)} onChange={() => toggleParticipant(emp.id)} style={{ width: "auto" }} />
                          <span>
                            {emp.name} <span className="muted">{emp.code}</span>
                            {from && <Badge tone="red" style={{ marginLeft: "0.3rem", fontSize: "0.66rem" }}>cross-assigned from {from}</Badge>}
                            {otherSub && <Badge tone="grey" style={{ marginLeft: "0.3rem", fontSize: "0.66rem" }}>{otherSub}</Badge>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              {isEdit && selectedTask && (
                <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.4rem" }}>
                  Tick or untick people and/or change the output — every share is recalculated on save.
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
