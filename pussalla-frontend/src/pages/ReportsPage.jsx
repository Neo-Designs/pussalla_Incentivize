import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card.jsx";
import { reportsApi, downloadBlob } from "../api/client";
import { formatMoney, formatDate, todayISO, currentMonthISO } from "../utils/helpers";

export default function ReportsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("monthly");
  const [month, setMonth] = useState(currentMonthISO());
  const [day, setDay] = useState(todayISO());
  const [daily, setDaily] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [loading, setLoading] = useState(false);
  const [payslipLoading, setPayslipLoading] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        if (tab === "daily") {
          const r = await reportsApi.daily(day);
          if (active) { setDaily(r); setMonthly(null); }
        } else {
          const r = await reportsApi.monthly(month);
          if (active) { setMonthly(r); setDaily(null); }
        }
      } catch {
        if (active) { setDaily(null); setMonthly(null); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tab, month, day]);

  const exportDailyCsv = async () => {
    const blob = await reportsApi.exportDailyCsv(day);
    downloadBlob(blob, `pussalla-daily-${day}.csv`);
  };

  const exportMonthlyCsv = async () => {
    const blob = await reportsApi.exportMonthlyCsv(month);
    downloadBlob(blob, `pussalla-monthly-${month}.csv`);
  };

  const exportMonthlyExcel = async () => {
    // Excel opens CSV natively; reuse the CSV with an .xls-friendly name.
    const blob = await reportsApi.exportMonthlyCsv(month);
    downloadBlob(blob, `pussalla-monthly-${month}.xls`);
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

  return (
    <>
      <PageHead
        title="Incentive Reports"
        subtitle="Daily and monthly incentive payouts across the workforce. Export to CSV for PBSS payroll / Excel, or download a PDF payslip per employee."
        actions={
          <>
            <div className="row" style={{ background: "var(--surface)", borderRadius: 999, padding: "0.25rem", border: "1px solid var(--ink-100)" }}>
              <button className={`btn btn-sm ${tab === "monthly" ? "" : "btn-ghost"}`} onClick={() => setTab("monthly")}>Monthly</button>
              <button className={`btn btn-sm ${tab === "daily" ? "" : "btn-ghost"}`} onClick={() => setTab("daily")}>Daily</button>
            </div>
            {tab === "daily" ? (
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: "auto" }} />
            ) : (
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto" }} />
            )}
            <button className="btn btn-gold btn-sm" onClick={tab === "daily" ? exportDailyCsv : exportMonthlyCsv} disabled={loading}>
              ↓ Export CSV
            </button>
            {tab === "monthly" && (
              <button className="btn btn-sm" onClick={exportMonthlyExcel} disabled={loading}>↓ Excel</button>
            )}
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
        </>
      ) : (
        <>
          <div className="kpi-grid stagger" style={{ marginBottom: "1rem" }}>
            <KPI tone="green" label={`Payout ${monthly?.month || month}`} value={monthly ? formatMoney(monthly.grandTotal) : "—"} />
            <KPI tone="gold" label="Employees Paid" value={monthly ? monthly.employees.length : "—"} />
            <KPI tone="blue" label="Top Earner" value={monthly?.employees[0] ? monthly.employees[0].name.split(" ")[0] : "—"} sub={monthly?.employees[0] ? formatMoney(monthly.employees[0].total) : ""} />
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1fr 2fr" }}>
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

            <Card>
              <h3 className="section-title">Employee breakdown — {monthly?.month || month}</h3>
              {loading ? (
                <table className="data"><tbody><SkeletonRows cols={3} /></tbody></table>
              ) : !monthly || monthly.employees.length === 0 ? (
                <EmptyState title="No data for this month" />
              ) : (
                <table className="data">
                  <thead><tr><th>Employee</th><th>Division</th><th>Days</th><th>Total</th><th>Payslip</th></tr></thead>
                  <tbody>
                    {monthly.employees.map((e) => (
                      <tr key={e.employeeId}>
                        <td><strong>{e.name}</strong><div className="muted" style={{ fontSize: "0.78rem" }}>{e.code}</div></td>
                        <td>{e.divisionName || "—"}</td>
                        <td>{e.daysLogged ?? "—"}</td>
                        <td className="money"><strong>{formatMoney(e.total)}</strong></td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => downloadPayslip(e.employeeId, e.code)}
                            disabled={payslipLoading !== null}
                          >
                            {payslipLoading === e.employeeId ? "…" : "↓ PDF"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 800 }}>
                      <td colSpan={3}>Grand total</td>
                      <td className="money">{formatMoney(monthly.grandTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
