import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card.jsx";
import { dailyLogsApi } from "../api/client";
import { formatMoney, formatNumber, formatDate, taskTypeLabel, currentMonthISO } from "../utils/helpers";
import { downloadCsv } from "../utils/helpers";

export default function EarningsPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonthISO());
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    dailyLogsApi.list()
      .then((rows) => { if (active) setLogs(rows); })
      .catch(() => { if (active) setLogs([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // All logs where I am a participant.
  const myLogs = useMemo(() => {
    return logs
      .filter((l) => (l.participants || []).some((p) => p.employeeId === user.id))
      .map((l) => {
        const share = (l.participants || []).find((p) => p.employeeId === user.id)?.share || 0;
        return { ...l, myShare: Number(share) };
      })
      .sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
  }, [logs, user.id]);

  const monthFiltered = useMemo(
    () => myLogs.filter((l) => String(l.log_date).slice(0, 7) === month),
    [myLogs, month]
  );

  const monthTotal = monthFiltered.reduce((s, l) => s + l.myShare, 0);
  const allTimeTotal = myLogs.reduce((s, l) => s + l.myShare, 0);

  const exportCsv = () => {
    const rows = [["Date", "Task", "Type", "Output", "Unit", "Your Share"]];
    monthFiltered.forEach((l) => {
      rows.push([l.log_date, l.task_name, taskTypeLabel(l.task_type), l.total_output, l.unit, l.myShare.toFixed(2)]);
    });
    downloadCsv(`pussalla-earnings-${month}.csv`, rows);
  };

  return (
    <>
      <PageHead
        title="My Earnings"
        subtitle="Your incentive payouts across all tasks you participated in."
        actions={
          <>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto" }} />
            <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!monthFiltered.length}>↓ CSV</button>
          </>
        }
      />

      <div className="kpi-grid stagger" style={{ marginBottom: "1.25rem" }}>
        <KPI tone="green" label={`${month} Earnings`} value={formatMoney(monthTotal)} sub={`${monthFiltered.length} task log(s)`} />
        <KPI tone="gold" label="All-Time Earnings" value={formatMoney(allTimeTotal)} sub={`${myLogs.length} total log(s)`} />
        <KPI tone="blue" label="Avg / Log" value={formatMoney(monthFiltered.length ? monthTotal / monthFiltered.length : 0)} sub="this month" />
      </div>

      <Card>
        <h3 className="section-title">Payout history</h3>
        {loading ? (
          <table className="data"><tbody><SkeletonRows cols={5} /></tbody></table>
        ) : monthFiltered.length === 0 ? (
          <EmptyState title="No earnings for this period" message="Try selecting a different month, or check back after your supervisor enters logs." />
        ) : (
          <table className="data">
            <thead>
              <tr><th>Date</th><th>Task</th><th>Type</th><th>Output</th><th>Your Share</th></tr>
            </thead>
            <tbody>
              {monthFiltered.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap">{formatDate(l.log_date)}</td>
                  <td><strong>{l.task_name}</strong></td>
                  <td><Badge tone="grey">{taskTypeLabel(l.task_type)}</Badge></td>
                  <td className="mono">{formatNumber(l.total_output)} {l.unit}</td>
                  <td className="money"><strong>{formatMoney(l.myShare)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
