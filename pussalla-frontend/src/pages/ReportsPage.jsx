import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Card, { PageHead, KPI, EmptyState, SkeletonRows } from "../components/Card.jsx";
import Reveal from "../components/Reveal.jsx";
import { reportsApi, divisionsApi, employeesApi, downloadBlob } from "../api/client";
import { formatMoney, formatDate, taskTypeLabel, todayISO, currentMonthISO } from "../utils/helpers";

export default function ReportsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("monthly");
  const [month, setMonth] = useState(currentMonthISO());
  const [day, setDay] = useState(todayISO());
  const [daily, setDaily] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [payslipLoading, setPayslipLoading] = useState(null);
  const [gridEmp, setGridEmp] = useState(null);
  const [grid, setGrid] = useState(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [allGrid, setAllGrid] = useState(null);
  const [allGridLoading, setAllGridLoading] = useState(false);
  const [compactGrid, setCompactGrid] = useState(false);

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

  // Load employees for the breakdown grid (scoped by division filter).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await employeesApi.list(divisionFilter ? { divisionId: divisionFilter, limit: 500 } : { limit: 500 });
        if (active) setEmployees(list);
      } catch {
        if (active) setEmployees([]);
      }
    })();
    return () => { active = false; };
  }, [divisionFilter]);

  // All-employee work-breakdown grid (task x date for every employee).
  useEffect(() => {
    if (tab !== "monthly") return;
    let active = true;
    setAllGridLoading(true);
    (async () => {
      try {
        const r = await reportsApi.allEmployeeGrid(month, divisionFilter || undefined);
        if (active) setAllGrid(r);
      } catch {
        if (active) setAllGrid(null);
      } finally {
        if (active) setAllGridLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tab, month, divisionFilter]);

  const exportDailyCsv = async () => {
    const blob = await reportsApi.exportDailyCsv(day);
    downloadBlob(blob, `incentivize-daily-${day}.csv`);
  };

  const exportMonthlyCsv = async () => {
    const blob = await reportsApi.exportMonthlyCsv(month);
    downloadBlob(blob, `incentivize-monthly-${month}.csv`);
  };

  const exportMonthlyExcel = async () => {
    const blob = await reportsApi.exportMonthlyCsv(month);
    downloadBlob(blob, `incentivize-monthly-${month}.xls`);
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
        subtitle="Daily and monthly incentive payouts across the workforce. Export to CSV for payroll / Excel, download a PDF payslip, or open the per-employee task grid."
        actions={
          <>
            <div className="row" style={{ background: "var(--surface)", borderRadius: 999, padding: "0.25rem", border: "1px solid var(--ink-100)" }}>
              <button className={`btn btn-sm ${tab === "monthly" ? "" : "btn-ghost"}`} onClick={() => setTab("monthly")}>Monthly</button>
              <button className={`btn btn-sm ${tab === "daily" ? "" : "btn-ghost"}`} onClick={() => setTab("daily")}>Daily</button>
              <button className={`btn btn-sm ${tab === "grid" ? "" : "btn-ghost"}`} onClick={() => setTab("grid")}>Breakdown</button>
            </div>
            {tab !== "grid" && (tab === "daily" ? (
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: "auto" }} />
            ) : (
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto" }} />
            ))}
            <select value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} style={{ width: "auto" }}>
              <option value="">{isSupervisor ? "My division" : "All divisions"}</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {tab === "daily" ? (
              <button className="btn btn-gold btn-sm" onClick={exportDailyCsv} disabled={loading}>↓ Export CSV</button>
            ) : tab === "monthly" ? (
              <>
                <button className="btn btn-gold btn-sm" onClick={exportMonthlyCsv} disabled={loading}>↓ Export CSV</button>
                <button className="btn btn-sm" onClick={exportMonthlyExcel} disabled={loading}>↓ Excel</button>
              </>
            ) : null}
          </>
        }
      />

      {tab === "daily" ? (
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
      ) : tab === "monthly" ? (
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
              <Card>
                <div className="spread" style={{ marginBottom: "0.8rem" }}>
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Task grid{grid ? ` — ${grid.name} (${grid.code})` : ""}
                  </h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setGridEmp(null); setGrid(null); }}>✕ Close</button>
                </div>
                <EmployeeTaskGrid grid={grid} loading={gridLoading} onPayslip={() => grid && downloadPayslip(grid.employeeId, grid.code)} />
              </Card>
            </Reveal>
          )}

          <Reveal style={{ marginTop: "1rem" }}>
            <Card>
              <div className="spread" style={{ marginBottom: "0.8rem" }}>
                <h3 className="section-title" style={{ margin: 0 }}>All-employee work breakdown — {month}</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCompactGrid((v) => !v)}
                  title="Toggle between detailed cells (count + amount) and compact green checkmarks"
                >
                  {compactGrid ? "Show details" : "Compact (✓)"}
                </button>
              </div>
              <p className="muted" style={{ fontSize: "0.82rem", marginTop: 0, marginBottom: "0.6rem" }}>
                Every employee is listed with their tasks as rows and dates as columns. The employee name
                &amp; code cell is merged across their task rows. Each day cell shows how many times the
                task was done and how much was earned that day — hover any cell for full detail. In compact
                mode, a green ✓ marks a day with work; hover for the count and amount.
              </p>
              <AllEmployeeGrid grid={allGrid} loading={allGridLoading} compact={compactGrid} />
            </Card>
          </Reveal>
        </>
      ) : (
        // ---- Breakdown tab: pick an employee, see their full task x date grid ----
        <>
          <Reveal>
            <Card style={{ marginBottom: "1rem" }}>
              <div className="spread" style={{ marginBottom: "0.8rem" }}>
                <h3 className="section-title" style={{ margin: 0 }}>Employee task breakdown</h3>
                <div className="row">
                  <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto" }} />
                  <select value={gridEmp || ""} onChange={(e) => openGrid(e.target.value)} style={{ width: "auto" }}>
                    <option value="">Select an employee…</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.name} — {e.code}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="muted" style={{ fontSize: "0.84rem", marginTop: 0, marginBottom: 0 }}>
                Rows are tasks, columns are dates in {month}. Each cell shows the payout for that
                task on that day; row totals give the per-task payout and the grand total is the
                person's incentive payout for the month.
              </p>
            </Card>
          </Reveal>

          <Reveal>
            <Card>
              <div className="spread" style={{ marginBottom: "0.8rem" }}>
                <h3 className="section-title" style={{ margin: 0 }}>
                  {grid ? `${grid.name} (${grid.code}) — ${grid.divisionName || ""}` : "No employee selected"}
                </h3>
                {grid && grid.tasks.length > 0 && (
                  <button className="btn btn-gold btn-sm" onClick={() => downloadPayslip(grid.employeeId, grid.code)} disabled={payslipLoading !== null}>
                    {payslipLoading === grid.employeeId ? "…" : "↓ Payslip PDF (with grid)"}
                  </button>
                )}
              </div>
              <EmployeeTaskGrid grid={grid} loading={gridLoading} fullPage />
            </Card>
          </Reveal>
        </>
      )}
    </>
  );
}

// The task x date grid shared between the inline view and the Breakdown tab.
function EmployeeTaskGrid({ grid, loading, fullPage, onPayslip }) {
  if (loading) return <table className="data"><tbody><SkeletonRows cols={6} rows={4} /></tbody></table>;
  if (!grid || !grid.tasks || grid.tasks.length === 0) {
    return <EmptyState title="No task data for this employee this month" message="Pick another employee or month to see the breakdown." />;
  }
  const dates = grid.dates || [];
  return (
    <div className="grid-breakdown">
      <table>
        <thead>
          <tr>
            <th>Task</th>
            {dates.map((d) => <th key={d} title={d}>{d.slice(8)}</th>)}
            <th>Task total</th>
          </tr>
        </thead>
        <tbody>
          {grid.tasks.map((t) => (
            <tr key={t.taskId}>
              <td>
                <strong>{t.task}</strong>
                <div className="muted" style={{ fontSize: "0.72rem" }}>{taskTypeLabel(t.taskType)}</div>
              </td>
              {dates.map((d) => {
                const cell = t.days[d];
                const title = cell
                  ? `${Number(cell.count)} × done · ${Number(cell.output)} ${t.unit} · Rs. ${Number(cell.amount).toFixed(2)}`
                  : "";
                return (
                  <td key={d} className={cell ? "cell-has" : ""} title={title}>
                    {cell ? (
                      <span className="cell-stack">
                        <span className="cell-count">{Number(cell.count)}×</span>
                        <span className="cell-amt">{Number(cell.amount).toFixed(0)}</span>
                      </span>
                    ) : ""}
                  </td>
                );
              })}
              <td className="row-total">{formatMoney(t.taskTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total incentive payout</td>
            {dates.map((d) => <td key={d} />)}
            <td className="money">{formatMoney(grid.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// All-employee work breakdown: one table where the employee name/code cell is
// rowspan-merged across that employee's task rows. Each task row has a day
// column per date in the month; cells show count + amount (or a green ✓ in
// compact mode) with a hover tooltip carrying the full detail.
function AllEmployeeGrid({ grid, loading, compact }) {
  if (loading) return <table className="data"><tbody><SkeletonRows cols={6} rows={5} /></tbody></table>;
  if (!grid || !grid.employees || grid.employees.length === 0) {
    return <EmptyState title="No work logged this month" message="There is no task data to show for the selected period." />;
  }
  const dates = grid.dates || [];

  const renderCell = (cell, unit) => {
    if (!cell) return <td key="empty" className="cell-empty" />;
    const title = `${Number(cell.count)} × done · ${Number(cell.output)} ${unit} · Rs. ${Number(cell.amount).toFixed(2)}`;
    if (compact) {
      return <td key="c" className="cell-tick" title={title}>✓</td>;
    }
    return (
      <td key="c" className="cell-has" title={title}>
        <span className="cell-stack">
          <span className="cell-count">{Number(cell.count)}×</span>
          <span className="cell-amt">{Number(cell.amount).toFixed(0)}</span>
        </span>
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
            {dates.map((d) => <th key={d} title={d}>{d.slice(8)}</th>)}
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
                {dates.map((d) => renderCell(t.days?.[d], t.unit || ""))}
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
