import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card.jsx";
import Reveal from "../components/Reveal.jsx";
import { reportsApi } from "../api/client";
import { downloadBlob } from "../api/client";
import { formatMoney, formatNumber, formatDate, taskTypeLabel, currentMonthISO } from "../utils/helpers";
import { downloadCsv } from "../utils/helpers";

export default function EarningsPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonthISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const [y, m] = month.split("-");
    // month range: first day to last day of the selected month
    const from = `${month}-01`;
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    const to = `${month}-${String(lastDay).padStart(2, "0")}`;
    reportsApi
      .myEarnings(from, to)
      .then((d) => { if (active) setData(d); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month]);

  const items = data?.items || [];
  const taskBreakdown = data?.taskBreakdown || [];
  const monthTotal = data?.total || 0;

  const exportCsv = () => {
    if (!items.length) return;
    const rows = [["Date", "Task", "Type", "Output", "Unit", "Your Share"]];
    items.forEach((it) => {
      rows.push([it.date, it.task, taskTypeLabel(it.taskType), it.output, it.unit, it.amount.toFixed(2)]);
    });
    rows.push([]);
    rows.push(["", "", "", "", "TOTAL", monthTotal.toFixed(2)]);
    downloadCsv(`incentivize-earnings-${month}.csv`, rows);
  };

  const exportPayslip = async () => {
    const blob = await reportsApi.payslipPdf(user.id, month);
    downloadBlob(blob, `payslip-${user.code}-${month}.pdf`);
  };

  return (
    <>
      <PageHead
        title="My Earnings"
        subtitle="Your incentive payouts across all tasks you participated in, with a per-task breakdown."
        actions={
          <>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto" }} />
            <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!items.length}>↓ CSV</button>
            <button className="btn btn-sm" onClick={exportPayslip} disabled={!items.length}>↓ Payslip (PDF)</button>
          </>
        }
      />

      <div className="kpi-grid stagger" style={{ marginBottom: "1.25rem" }}>
        <KPI tone="green" label={`${month} Earnings`} value={formatMoney(monthTotal)} sub={`${items.length} task log(s)`} />
        <KPI tone="gold" label="Home Division" value={data?.divisionName || "—"} sub={user.code} />
        <KPI tone="blue" label="Avg / Log" value={formatMoney(items.length ? monthTotal / items.length : 0)} sub="this month" />
      </div>

      <Reveal>
        <div className="grid stagger" style={{ gridTemplateColumns: "1fr 2fr", marginBottom: "1rem" }}>
          <Card>
          <h3 className="section-title">Per-task breakdown</h3>
          {loading ? (
            <table className="data"><tbody><SkeletonRows cols={2} /></tbody></table>
          ) : !taskBreakdown.length ? (
            <EmptyState title="No tasks this month" />
          ) : (
            <div>
              {taskBreakdown.map((t) => {
                const max = taskBreakdown[0].total || 1;
                return (
                  <div key={t.task} style={{ marginBottom: "0.6rem" }}>
                    <div className="spread" style={{ fontSize: "0.86rem" }}>
                      <span>{t.task}</span>
                      <span className="money"><strong>{formatMoney(t.total)}</strong></span>
                    </div>
                    <div className="bar-track" style={{ marginTop: "0.3rem" }}>
                      <div className="bar-fill bar-fill-static" style={{ width: `${(t.total / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="section-title">Payout history</h3>
          {loading ? (
            <table className="data"><tbody><SkeletonRows cols={5} /></tbody></table>
          ) : items.length === 0 ? (
            <EmptyState title="No earnings for this period" message="Try selecting a different month, or check back after your supervisor enters logs." />
          ) : (
            <table className="data">
              <thead>
                <tr><th>Date</th><th>Task</th><th>Type</th><th>Output</th><th>Your Share</th></tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="nowrap">{formatDate(it.date)}</td>
                    <td><strong>{it.task}</strong><div className="muted" style={{ fontSize: "0.78rem" }}>{it.divisionName}</div></td>
                    <td><Badge tone="grey">{taskTypeLabel(it.taskType)}</Badge></td>
                    <td className="mono">{formatNumber(it.output)} {it.unit}</td>
                    <td className="money"><strong>{formatMoney(it.amount)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        </div>
      </Reveal>
    </>
  );
}
