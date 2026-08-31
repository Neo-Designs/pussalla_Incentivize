import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Card, { PageHead, KPI, EmptyState, SkeletonRows } from "../components/Card.jsx";
import Reveal from "../components/Reveal.jsx";
import CellTooltip from "../components/CellTooltip.jsx";
import PayslipView from "../components/PayslipView.jsx";
import { reportsApi, divisionsApi, downloadBlob } from "../api/client";
import { formatMoney, formatNumber, formatDate, taskTypeLabel, todayISO, currentMonthISO } from "../utils/helpers";

// Rich hover tooltip for a single task×date cell: units done, the incentive
// rate snapshot for that day, and the total earned. rate may be 0 for group
// tasks where the per-worker "rate" is derived from a pool/tier rule.
function CellDetail({ cell, taskName, unit, taskType }) {
  const units = Number(cell?.output || 0);
  const rate = Number(cell?.rate || 0);
  const amount = Number(cell?.amount || 0);
  const count = Number(cell?.count || 0);
  const participantCount = Number(cell?.participantCount || 1);
  const baseLimit = cell?.baseLimit;
  const isGroup = taskType === 2 || taskType === 3;
  return (
    <>
      <div className="pop-head">{taskName}</div>
      <div className="pop-row">
        <span className="pop-label">Units done</span>
        <span className="pop-value">{formatNumber(units)} {unit}</span>
      </div>
      <div className="pop-row">
        <span className="pop-label">Rate per unit</span>
        <span className="pop-value">Rs. {rate.toFixed(2)} / {unit}</span>
      </div>
      <div className="pop-row">
        <span className="pop-label">Total earned</span>
        <span className="pop-value money">{formatMoney(amount)}</span>
      </div>
      {isGroup && (
        <div className="pop-row" style={{ marginTop: "0.2rem", paddingTop: "0.2rem", borderTop: "1px dashed rgba(255,255,255,0.15)" }}>
          <span className="pop-label">Divided amongst</span>
          <span className="pop-value strong">{participantCount} worker{participantCount !== 1 ? "s" : ""}</span>
        </div>
      )}
      {taskType === 3 && baseLimit != null && (
        <div className="pop-row">
          <span className="pop-label">Daily base limit</span>
          <span className="pop-value">{formatNumber(baseLimit)} {unit}</span>
        </div>
      )}
      {count > 1 && (
        <div className="pop-rate-note">{count} logs on this day; units &amp; earnings summed.</div>
      )}
      {isGroup && (
        <div className="pop-rate-note">
          Group task: divided amongst {participantCount} worker{participantCount !== 1 ? "s" : ""} ({taskType === 3 ? `tiered bonus over ${formatNumber(baseLimit || 0)} ${unit} base limit` : "flat-rate pool split"}).
        </div>
      )}
    </>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("monthly");
  const [month, setMonth] = useState(currentMonthISO());
  const [day, setDay] = useState(todayISO());
  const [daily, setDaily] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [tasksReportData, setTasksReportData] = useState([]);
  const [tasksReportLoading, setTasksReportLoading] = useState(false);
  const [divisions, setDivisions] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [payslipLoading, setPayslipLoading] = useState(null);
  const [gridEmp, setGridEmp] = useState(null);
  const [grid, setGrid] = useState(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [allGrid, setAllGrid] = useState(null);
  const [allGridLoading, setAllGridLoading] = useState(false);
  const [breakdownDivision, setBreakdownDivision] = useState("");

  const isSupervisor = user.role === "supervisor";

  // Supervisors default to their own division but may switch (demo mode).
  useEffect(() => {
    if (isSupervisor && !divisionFilter && user.homeDivisionId) {
      setDivisionFilter(String(user.homeDivisionId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    divisionsApi.list().then(setDivisions).catch(() => setDivisions([]));
  }, []);

  useEffect(() => {
    let active = true;
    if (tab === "tasks") {
      setTasksReportLoading(true);
      reportsApi.tasksReport(divisionFilter || undefined)
        .then((r) => { if (active) setTasksReportData(r); })
        .catch(() => { if (active) setTasksReportData([]); })
        .finally(() => { if (active) setTasksReportLoading(false); });
      return () => { active = false; };
    }

    setLoading(true);
    (async () => {
      try {
        if (tab === "daily") {
          const r = await reportsApi.daily(day, divisionFilter || undefined);
          if (active) { setDaily(r); setMonthly(null); }
        } else {
          const r = await reportsApi.monthly(month, divisionFilter || undefined);
          if (active) { setMonthly(r); setDaily(null); }
        }
      } catch {
        if (active) { setDaily(null); setMonthly(null); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tab, month, day, divisionFilter]);

  // All-employee work-breakdown grid (task x date for every employee).
  useEffect(() => {
    if (tab !== "monthly") return;
    let active = true;
    setAllGridLoading(true);
    (async () => {
      try {
        const r = await reportsApi.allEmployeeGrid(month, breakdownDivision || undefined);
        if (active) setAllGrid(r);
      } catch {
        if (active) setAllGrid(null);
      } finally {
        if (active) setAllGridLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tab, month, breakdownDivision]);

  const exportDailyCsv = async () => {
    const blob = await reportsApi.exportDailyCsv(day);
    downloadBlob(blob, `incentivize-daily-${day}.csv`);
  };

  const exportMonthlyCsv = async () => {
    const blob = await reportsApi.exportMonthlyCsv(month);
    downloadBlob(blob, `incentivize-monthly-${month}.csv`);
  };

  const exportTasksCsv = async () => {
    const blob = await reportsApi.exportTasksCsv(divisionFilter || undefined);
    downloadBlob(blob, `incentivize-tasks-report.csv`);
  };

  const downloadPayslip = async (employeeId, code) => {
    setPayslipLoading(employeeId);
    try {
      const blob = await reportsApi.payslipPdf(employeeId, month);
      downloadBlob(blob, `payslip-${code}-${month}.pdf`);
    } finally {
      setPayslipLoading(null);
    }
  };

  const openGrid = async (employeeId) => {
    setGridEmp(employeeId);
    setGridLoading(true);
    setGrid(null);
    try {
      const r = await reportsApi.employeeGrid(employeeId, month);
      setGrid(r);
    } catch {
      setGrid(null);
    } finally {
      setGridLoading(false);
    }
  };

  return (
    <>
      <PageHead
        title="Incentive Reports"
        subtitle="Daily and monthly incentive payouts, task details report, CSV exports, PDF payslips, and all-employee work grid."
        actions={
          <>
            <div className="row" style={{ background: "var(--surface)", borderRadius: 999, padding: "0.25rem", border: "1px solid var(--ink-100)" }}>
              <button className={`btn btn-sm ${tab === "monthly" ? "" : "btn-ghost"}`} onClick={() => setTab("monthly")}>Monthly</button>
              <button className={`btn btn-sm ${tab === "daily" ? "" : "btn-ghost"}`} onClick={() => setTab("daily")}>Daily</button>
              <button className={`btn btn-sm ${tab === "tasks" ? "" : "btn-ghost"}`} onClick={() => setTab("tasks")}>Task Details</button>
            </div>
            {tab === "daily" && (
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: "auto" }} />
            )}
            {tab === "monthly" && (
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto" }} />
            )}
            <select value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} style={{ width: "auto" }}>
              <option value="">{isSupervisor ? "My division" : "All divisions"}</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {tab === "daily" && (
              <button className="btn btn-gold btn-sm" onClick={exportDailyCsv} disabled={loading}>↓ Export CSV</button>
            )}
            {tab === "monthly" && (
              <button className="btn btn-gold btn-sm" onClick={exportMonthlyCsv} disabled={loading}>↓ Export CSV</button>
            )}
            {tab === "tasks" && (
              <button className="btn btn-gold btn-sm" onClick={exportTasksCsv} disabled={tasksReportLoading}>↓ Export Tasks CSV</button>
            )}
          </>
        }
      />

      {tab === "tasks" ? (
        <>
          <div className="kpi-grid stagger" style={{ marginBottom: "1rem" }}>
            <KPI tone="green" label="Total Tasks" value={tasksReportData.length} />
            <KPI tone="gold" label="Active Tasks" value={tasksReportData.filter((t) => t.active).length} />
            <KPI tone="blue" label="Divisions" value={new Set(tasksReportData.map((t) => t.division_id)).size} />
          </div>
          <Reveal>
            <Card>
              <h3 className="section-title">Detailed List of Tasks</h3>
              {tasksReportLoading ? (
                <table className="data"><tbody><SkeletonRows cols={8} /></tbody></table>
              ) : tasksReportData.length === 0 ? (
                <EmptyState title="No tasks found" message="No task records match the current filter." />
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Task Name</th>
                      <th>Division</th>
                      <th>Task Type</th>
                      <th>Rate (Rs.)</th>
                      <th>Base Limit</th>
                      <th>Unit</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasksReportData.map((t) => (
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
              )}
            </Card>
          </Reveal>
        </>
      ) : tab === "daily" ? (
        <>
          <div className="kpi-grid stagger" style={{ marginBottom: "1rem" }}>
            <KPI tone="green" label="Daily Payout" value={daily ? formatMoney(daily.grandTotal) : "—"} />
            <KPI tone="gold" label="Earners" value={daily ? daily.rows.length : "—"} sub={`on ${daily ? formatDate(daily.date) : "—"}`} />
            <KPI tone="blue" label="Top Earner" value={daily?.rows[0] ? daily.rows[0].name.split(" ")[0] : "—"} sub={daily?.rows[0] ? formatMoney(daily.rows[0].daily_total) : ""} />
          </div>
          <Reveal>
            <Card>
              <h3 className="section-title">Daily payout by employee — {daily ? formatDate(daily.date) : "—"}</h3>
              {loading ? (
                <table className="data"><tbody><SkeletonRows cols={4} /></tbody></table>
              ) : !daily || daily.rows.length === 0 ? (
                <EmptyState title="No payouts for this date" />
              ) : (
                <table className="data">
                  <thead><tr><th>#</th><th>Employee</th><th>Division</th><th>Tasks</th><th>Total</th></tr></thead>
                  <tbody>
                    {daily.rows.map((r, i) => (
                      <tr key={r.employee_id}>
                        <td className="muted">{i + 1}</td>
                        <td><strong>{r.name}</strong><div className="muted" style={{ fontSize: "0.78rem" }}>{r.code}</div></td>
                        <td>{r.division_name || "—"}</td>
                        <td>{r.tasks_completed}</td>
                        <td className="money"><strong>{formatMoney(r.daily_total)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 800 }}>
                      <td colSpan={4}>Grand total</td>
                      <td className="money">{formatMoney(daily.grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </Card>
          </Reveal>
        </>
      ) : (
        <>
          <div className="kpi-grid stagger" style={{ marginBottom: "1rem" }}>
            <KPI tone="green" label={`Payout ${monthly?.month || month}`} value={monthly ? formatMoney(monthly.grandTotal) : "—"} />
            <KPI tone="gold" label="Employees Paid" value={monthly ? monthly.employees.length : "—"} />
            <KPI tone="blue" label="Top Earner" value={monthly?.employees[0] ? monthly.employees[0].name.split(" ")[0] : "—"} sub={monthly?.employees[0] ? formatMoney(monthly.employees[0].total) : ""} />
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1fr 2fr" }}>
            <Reveal>
              <Card>
                <h3 className="section-title">Leaderboard</h3>
                {loading ? (
                  <table className="data"><tbody><SkeletonRows cols={2} /></tbody></table>
                ) : !monthly || monthly.employees.length === 0 ? (
                  <EmptyState title="No data for this month" />
                ) : (
                  <div>
                    {monthly.employees.slice(0, 10).map((e, i) => {
                      const max = monthly.employees[0].total || 1;
                      return (
                        <div key={e.employeeId} style={{ marginBottom: "0.6rem" }}>
                          <div className="spread" style={{ fontSize: "0.86rem" }}>
                            <span><strong>{i + 1}.</strong> {e.name}</span>
                            <span className="money"><strong>{formatMoney(e.total)}</strong></span>
                          </div>
                          <div className="bar-track" style={{ marginTop: "0.3rem" }}>
                            <div className="bar-fill bar-fill-static" style={{ width: `${(e.total / max) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </Reveal>

            <Reveal>
              <Card>
                <h3 className="section-title">Employee breakdown — {monthly?.month || month}</h3>
                {loading ? (
                  <table className="data"><tbody><SkeletonRows cols={3} /></tbody></table>
                ) : !monthly || monthly.employees.length === 0 ? (
                  <EmptyState title="No data for this month" />
                ) : (
                  <table className="data">
                    <thead><tr><th>Employee</th><th>Division</th><th>Days</th><th>Total</th><th>Payslip</th><th>Grid</th></tr></thead>
                    <tbody>
                      {monthly.employees.map((e) => (
                        <tr key={e.employeeId} style={gridEmp === e.employeeId ? { background: "var(--pussalla-green-050)" } : undefined}>
                          <td><strong>{e.name}</strong><div className="muted" style={{ fontSize: "0.78rem" }}>{e.code}</div></td>
                          <td>{e.divisionName || "—"}</td>
                          <td>{e.daysLogged ?? "—"}</td>
                          <td className="money"><strong>{formatMoney(e.total)}</strong></td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => downloadPayslip(e.employeeId, e.code)} disabled={payslipLoading !== null}>
                              {payslipLoading === e.employeeId ? "…" : "↓ PDF"}
                            </button>
                          </td>
                          <td>
                            <button className="btn btn-sm" onClick={() => openGrid(e.employeeId)}>
                              {gridEmp === e.employeeId ? "✓ Showing" : "View grid"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 800 }}>
                        <td colSpan={3}>Grand total</td>
                        <td className="money">{formatMoney(monthly.grandTotal)}</td>
                        <td /><td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </Card>
            </Reveal>
          </div>

          {gridEmp && (
            <Reveal style={{ marginTop: "1rem" }}>
              <PayslipView
                grid={grid}
                loading={gridLoading}
                onClose={() => { setGridEmp(null); setGrid(null); }}
                onDownloadPdf={() => grid && downloadPayslip(grid.employeeId, grid.code)}
                pdfLoading={payslipLoading === Number(gridEmp)}
              />
            </Reveal>
          )}

          <Reveal style={{ marginTop: "1rem" }}>
            <Card>
              <div className="spread" style={{ marginBottom: "0.8rem" }}>
                <h3 className="section-title" style={{ margin: 0 }}>All-employee work breakdown — {month}</h3>
                <select value={breakdownDivision} onChange={(e) => setBreakdownDivision(e.target.value)} style={{ width: "auto" }}>
                  <option value="">All divisions</option>
                  {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <p className="muted" style={{ fontSize: "0.82rem", marginTop: 0, marginBottom: "0.6rem" }}>
                Every employee is listed with their tasks as rows and dates (1–{(allGrid?.dates?.length) || 0}) as columns.
                The employee name &amp; code cell is merged across their task rows. Each day cell shows a green ✓ when
                that task was done on that day — <strong>hover any ✓</strong> for a detailed breakdown of units done,
                the incentive rate, and the total earned that day.
              </p>
              <AllEmployeeGrid grid={allGrid} loading={allGridLoading} />
            </Card>
          </Reveal>
        </>
      )}
    </>
  );
}

// All-employee work breakdown: one table where the employee name/code cell is
// rowspan-merged across that employee's task rows. Each task row has a day
// column per date in the month; a cell shows a clean green ✓ when that task
// was done on that day, and a rich hover tooltip (units / rate / earned).
function AllEmployeeGrid({ grid, loading }) {
  if (loading) return <table className="data"><tbody><SkeletonRows cols={6} rows={5} /></tbody></table>;
  if (!grid || !grid.employees || grid.employees.length === 0) {
    return <EmptyState title="No work logged this month" message="There is no task data to show for the selected period." />;
  }
  const dates = grid.dates || [];
  const monthLabel = grid.month || "";

  const renderCell = (cell, t) => {
    if (!cell) return <td key="empty" className="cell-empty" />;
    const title = `${formatNumber(cell.output)} ${t.unit || ""} · Rs. ${Number(cell.amount).toFixed(2)}`;
    return (
      <td key="c" className="cell-has cell-tick-detail" title={title}>
        <CellTooltip content={<CellDetail cell={cell} taskName={t.task} unit={t.unit} taskType={t.taskType} />}>
          <span className="cell-tick">✓</span>
        </CellTooltip>
      </td>
    );
  };

  return (
    <div className="grid-breakdown all-employee-grid">
      <table>
        <thead>
          <tr>
            <th className="emp-col">Employee</th>
            <th className="task-col">Task</th>
            {dates.map((d) => <th key={d} title={`${monthLabel}-${d}`}>{d}</th>)}
            <th className="row-total-col">Task total</th>
            <th className="emp-total-col">Employee total</th>
          </tr>
        </thead>
        <tbody>
          {grid.employees.map((emp) => {
            const rows = emp.tasks.length
              ? emp.tasks
              : [{ __empty: true, task: "—", taskId: `none-${emp.employeeId}`, days: {}, taskTotal: 0 }];
            const rowSpan = rows.length;
            return rows.map((t, i) => (
              <tr key={`${emp.employeeId}-${t.taskId}`}>
                {i === 0 && (
                  <td rowSpan={rowSpan} className="emp-col">
                    <strong>{emp.name}</strong>
                    <div className="muted mono" style={{ fontSize: "0.74rem" }}>{emp.code}</div>
                    {emp.divisionName && <div className="muted" style={{ fontSize: "0.68rem" }}>{emp.divisionName}</div>}
                  </td>
                )}
                <td className="task-col">
                  {t.__empty ? <span className="muted">No tasks</span> : (
                    <>
                      <strong style={{ fontSize: "0.8rem" }}>{t.task}</strong>
                      <div className="muted" style={{ fontSize: "0.68rem" }}>{taskTypeLabel(t.taskType)}</div>
                    </>
                  )}
                </td>
                {dates.map((d) => renderCell(t.days?.[d], t))}
                <td className="row-total">{t.__empty ? "—" : formatMoney(t.taskTotal)}</td>
                {i === 0 && (
                  <td rowSpan={rowSpan} className="emp-total money">
                    <strong>{formatMoney(emp.total)}</strong>
                  </td>
                )}
              </tr>
            ));
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 800 }}>
            <td colSpan={2 + dates.length + 1}>Grand total</td>
            <td className="money">{formatMoney(grid.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
