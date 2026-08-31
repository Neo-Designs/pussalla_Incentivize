import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card.jsx";
import Modal, { ConfirmDialog } from "../components/Modal.jsx";
import { MiniSpinner } from "../components/Loaders.jsx";
import { tasksApi, divisionsApi, reportsApi, downloadBlob } from "../api/client";
import { formatMoney, formatNumber, taskTypeLabel, TASK_TYPES } from "../utils/helpers";

export default function TasksPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [divisions, setDivisions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDiv, setFilterDiv] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [showTaskReportModal, setShowTaskReportModal] = useState(false);
  const [taskReportData, setTaskReportData] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [divs, rows] = await Promise.all([
        divisionsApi.list().catch(() => []),
        tasksApi.list().catch(() => []),
      ]);
      setDivisions(divs);
      setTasks(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const divName = (id) => divisions.find((d) => d.id === id)?.name || "—";

  const filtered = useMemo(
    () => (filterDiv ? tasks.filter((t) => t.division_id === Number(filterDiv)) : tasks),
    [tasks, filterDiv]
  );

  const openTaskReport = async () => {
    setShowTaskReportModal(true);
    setReportLoading(true);
    try {
      const data = await reportsApi.tasksReport(filterDiv || undefined);
      setTaskReportData(data);
    } catch {
      setTaskReportData([]);
    } finally {
      setReportLoading(false);
    }
  };

  const exportTasksCsv = async () => {
    try {
      const blob = await reportsApi.exportTasksCsv(filterDiv || undefined);
      downloadBlob(blob, `incentivize-tasks-report.csv`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleSaved = () => { setModalOpen(false); setEditTarget(null); load(); };

  return (
    <>
      <PageHead
        title="Task Management"
        subtitle="Define the tasks, calculation engine and payout rate per division."
        actions={
          <div className="row" style={{ gap: "0.5rem" }}>
            <button className="btn btn-gold" onClick={openTaskReport}>📋 Task Details Report</button>
            <button className="btn" onClick={() => { setEditTarget(null); setModalOpen(true); }}>+ New task</button>
          </div>
        }
      />

      <div className="kpi-grid stagger" style={{ marginBottom: "1rem" }}>
        <KPI tone="green" label="Active Tasks" value={tasks.length} />
        <KPI tone="gold" label="Type 1 (Individual)" value={tasks.filter((t) => t.task_type === 1).length} />
        <KPI tone="blue" label="Type 2 (Pool)" value={tasks.filter((t) => t.task_type === 2).length} />
        <KPI tone="red" label="Type 3 (Tiered)" value={tasks.filter((t) => t.task_type === 3).length} />
      </div>

      <Card style={{ marginBottom: "1rem" }}>
        <div className="spread">
          <div>
            <label>Filter by division</label>
            <select value={filterDiv} onChange={(e) => setFilterDiv(e.target.value)} style={{ width: "auto" }}>
              <option value="">All divisions</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={exportTasksCsv}>↓ Export Tasks CSV</button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <table className="data"><tbody><SkeletonRows cols={7} /></tbody></table>
        ) : filtered.length === 0 ? (
          <EmptyState title="No tasks yet" message="Create a task to start capturing daily output." />
        ) : (
          <table className="data">
            <thead>
              <tr><th>Code</th><th>Task</th><th>Division</th><th>Type</th><th>Rate</th><th>Base Limit</th><th>Unit</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td><code className="mono">{t.code || `TSK-${String(t.id).padStart(3, "0")}`}</code></td>
                  <td><strong>{t.name}</strong></td>
                  <td>{divName(t.division_id)}</td>
                  <td>
                    <Badge tone={t.task_type === 1 ? "green" : t.task_type === 2 ? "gold" : "blue"}>
                      {taskTypeLabel(t.task_type)}
                    </Badge>
                  </td>
                  <td className="money">{formatMoney(t.rate)}</td>
                  <td>{t.task_type === 3 ? formatNumber(t.base_limit) : "—"}</td>
                  <td className="mono">{t.unit}</td>
                  <td>
                    <div className="row" style={{ gap: "0.3rem" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditTarget(t); setModalOpen(true); }}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => setConfirmDel(t)}>Deactivate</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {modalOpen && (
        <TaskModal
          divisions={divisions}
          editTarget={editTarget}
          user={user}
          onSaved={handleSaved}
          onDivisionsUpdated={(newDivs) => setDivisions(newDivs)}
          onClose={() => { setModalOpen(false); setEditTarget(null); }}
        />
      )}

      {showTaskReportModal && (
        <Modal
          title="Detailed Task Report"
          onClose={() => setShowTaskReportModal(false)}
          footer={
            <>
              <button className="btn btn-gold" onClick={exportTasksCsv}>↓ Export Tasks CSV</button>
              <button className="btn btn-ghost" onClick={() => setShowTaskReportModal(false)}>Close</button>
            </>
          }
        >
          {reportLoading ? (
            <table className="data"><tbody><SkeletonRows cols={8} /></tbody></table>
          ) : taskReportData.length === 0 ? (
            <EmptyState title="No tasks found" />
          ) : (
            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Task Name</th>
                    <th>Division</th>
                    <th>Type</th>
                    <th>Rate (Rs.)</th>
                    <th>Base Limit</th>
                    <th>Unit</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {taskReportData.map((t) => (
                    <tr key={t.id}>
                      <td><code className="mono">{t.code || `TSK-${String(t.id).padStart(3, "0")}`}</code></td>
                      <td><strong>{t.task_name}</strong></td>
                      <td>{t.division_name ? `${t.division_name} (${t.division_code || ""})` : "—"}</td>
                      <td>{taskTypeLabel(t.task_type)}</td>
                      <td className="money">Rs. {Number(t.rate).toFixed(2)}</td>
                      <td>{t.task_type === 3 ? formatNumber(t.base_limit) : "—"}</td>
                      <td className="mono">{t.unit}</td>
                      <td>
                        <span className={`badge ${t.active ? "badge-green" : "badge-gray"}`}>
                          {t.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Deactivate task?"
          message={`Deactivating "${confirmDel.name}" hides it from daily logging. Existing logs are preserved. This is recorded in the audit trail.`}
          confirmLabel="Deactivate"
          danger
          onConfirm={async () => {
            try { await tasksApi.remove(confirmDel.id); toast.success("Task deactivated"); setConfirmDel(null); load(); }
            catch (e) { toast.error(e.message); }
          }}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}

function TaskModal({ divisions, editTarget, user, onSaved, onDivisionsUpdated, onClose }) {
  const toast = useToast();
  const isEdit = !!editTarget;
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [code, setCode] = useState(editTarget?.code || "");
  const [name, setName] = useState(editTarget?.name || "");
  const [divisionId, setDivisionId] = useState(editTarget?.division_id || "");
  const [taskType, setTaskType] = useState(editTarget?.task_type || 1);
  const [rate, setRate] = useState(editTarget?.rate ?? "");
  const [baseLimit, setBaseLimit] = useState(editTarget?.base_limit ?? "");
  const [unit, setUnit] = useState(editTarget?.unit || "");
  const [saving, setSaving] = useState(false);
  const [divModalOpen, setDivModalOpen] = useState(false);

  const submit = async () => {
    if (!name || !divisionId || !taskType || rate === "" || !unit) { toast.error("All fields except base limit are required"); return; }
    if (Number(taskType) === 3 && (baseLimit === "" || baseLimit == null)) { toast.error("Base limit is required for Type 3 tasks"); return; }
    
    setSaving(true);
    try {
      const payload = {
        code: code.trim() || undefined,
        divisionId: Number(divisionId),
        name,
        taskType: Number(taskType),
        rate: Number(rate),
        baseLimit: Number(taskType) === 3 ? Number(baseLimit) : null,
        unit,
      };

      if (isEdit) {
        await tasksApi.update(editTarget.id, payload);
        toast.success("Task updated");
      } else {
        await tasksApi.create(payload);
        toast.success("Task created");
      }
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const handleDivisionCreated = (newDiv) => {
    const updated = [...divisions, newDiv];
    if (onDivisionsUpdated) onDivisionsUpdated(updated);
    setDivisionId(String(newDiv.id));
    setDivModalOpen(false);
  };

  return (
    <>
      <Modal
        title={isEdit ? "Edit task" : "New task"}
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={submit} disabled={saving}>{saving ? <><MiniSpinner /> Saving…</> : "Save task"}</button>
          </>
        }
      >
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label>Task code (auto-generated if empty)</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. TSK-001" />
          </div>
          <div>
            <label>Unit</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, tray, trip, sqm…" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Task name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken Deboning (Individual)" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="spread" style={{ marginBottom: "0.2rem" }}>
              <label style={{ margin: 0 }}>Division</label>
              {isAdmin && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ padding: "0.1rem 0.4rem", fontSize: "0.78rem" }} onClick={() => setDivModalOpen(true)}>
                  + Add Division
                </button>
              )}
            </div>
            <select
              value={divisionId}
              onChange={(e) => {
                if (e.target.value === "NEW") {
                  setDivModalOpen(true);
                } else {
                  setDivisionId(e.target.value);
                }
              }}
            >
              <option value="">Select division…</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
              {isAdmin && <option value="NEW">+ Add New Division…</option>}
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label>Calculation engine</label>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
              {[1, 2, 3].map((t) => (
                <button key={t} type="button" className={`btn btn-sm ${Number(taskType) === t ? "" : "btn-ghost"}`} onClick={() => setTaskType(t)} style={{ flexDirection: "column", gap: "0.1rem", height: "auto", padding: "0.6rem", alignItems: "stretch" }}>
                  <strong>{TASK_TYPES[t].short}</strong>
                  <span style={{ fontSize: "0.74rem", fontWeight: 400, opacity: 0.85 }}>{TASK_TYPES[t].label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label>Rate (Rs. per unit)</label>
            <input type="number" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div>
            <label>Base limit {Number(taskType) === 3 ? "(required)" : "(Type 3 only)"}</label>
            <input type="number" min="0" step="any" value={baseLimit} disabled={Number(taskType) !== 3} placeholder={Number(taskType) === 3 ? "e.g. 2000" : "—"} onChange={(e) => setBaseLimit(e.target.value)} />
          </div>
        </div>

        <div className="card" style={{ background: "var(--surface-2)", marginTop: "1rem", fontSize: "0.85rem", color: "var(--ink-700)" }}>
          <strong>How it pays:</strong>
          <ul style={{ margin: "0.4rem 0 0 1.2rem", lineHeight: 1.6 }}>
            <li><strong>Type 1</strong> — each worker's output × rate (individual payout).</li>
            <li><strong>Type 2</strong> — total output × rate, split equally among checked-off workers.</li>
            <li><strong>Type 3</strong> — max(0, total − base limit) × rate, split among workers (tiered bonus).</li>
          </ul>
        </div>
      </Modal>

      {divModalOpen && (
        <DivisionModal
          onCreated={handleDivisionCreated}
          onClose={() => setDivModalOpen(false)}
        />
      )}
    </>
  );
}

function DivisionModal({ onCreated, onClose }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error("Division name is required"); return; }
    setSaving(true);
    try {
      const created = await divisionsApi.create({
        code: code.trim() || undefined,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success(`Division "${created.name}" created`);
      onCreated(created);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Create New Division"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={saving}>{saving ? <><MiniSpinner /> Saving…</> : "Save Division"}</button>
        </>
      }
    >
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label>Division Code (optional)</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. PKG" />
        </div>
        <div>
          <label>Division Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Packaging Unit" />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label>Description (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief overview of division operations" />
        </div>
      </div>
    </Modal>
  );
}
