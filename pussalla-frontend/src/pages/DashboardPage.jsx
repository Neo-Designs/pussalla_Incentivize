import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card.jsx";
import { dailyLogsApi, reportsApi, divisionsApi, auditApi } from "../api/client";
import { formatMoney, formatNumber, formatDate, hasRole, roleLabel, taskTypeLabel, todayISO, currentMonthISO } from "../utils/helpers";

export default function DashboardPage() {
  const { user } = useAuth();
  const [divisions, setDivisions] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [monthReport, setMonthReport] = useState(null);
  const [todayReport, setTodayReport] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [divs, logs] = await Promise.all([
          divisionsApi.list().catch(() => []),
          dailyLogsApi.list({ date: todayISO() }).catch(() => []),
        ]);
        if (!active) return;
        setDivisions(divs);
        setTodayLogs(logs);

        const promises = [];
        if (hasRole(user, "hr", "admin", "super_admin")) {
          promises.push(
            reportsApi.monthly(currentMonthISO()).then(setMonthReport).catch(() => setMonthReport(null)),
            reportsApi.daily(todayISO()).then(setTodayReport).catch(() => setTodayReport(null)),
          );
        }
        if (hasRole(user, "admin", "super_admin")) {
          promises.push(reportsApi.analytics().then(setAnalytics).catch(() => setAnalytics(null)));
        }
        if (user.role === "super_admin") {
          promises.push(auditApi.list({ flagged: "true" }).then(setAudit).catch(() => setAudit([])));
        }
        await Promise.all(promises);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user]);

  const divisionName = (id) => divisions.find((d) => d.id === id)?.name || "—";

  // Employee dashboard: personal earnings from today's logs.
  const myTodayTotal = useMemo(() => {
    return todayLogs.reduce((sum, log) => {
      const share = (log.participants || [])
        .filter((p) => p.employeeId === user.id)
        .reduce((s, p) => s + Number(p.share), 0);
      return sum + share;
    }, 0);
  }, [todayLogs, user.id]);

  const myTodayTasks = todayLogs
    .filter((log) => (log.participants || []).some((p) => p.employeeId === user.id))
    .map((log) => ({
      ...log,
      myShare: (log.participants || []).find((p) => p.employeeId === user.id)?.share || 0,
    }));

  return (
    <>
      <PageHead
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle={`You're signed in as ${roleLabel(user.role)} · ${formatDate(todayISO())}`}
      />

      {loading ? (
        <Card>
          <table className="data">
            <tbody><SkeletonRows cols={4} rows={3} /></tbody>
          </table>
        </Card>
      ) : (
        <>
          {user.role === "employee" && (
            <>
              <div className="kpi-grid stagger" style={{ marginBottom: "1.25rem" }}>
                <KPI tone="green" label="Today's Incentive" value={formatMoney(myTodayTotal)} sub={`${myTodayTasks.length} task(s) today`} />
                <KPI tone="gold" label="Home Division" value={divisionName(user.homeDivisionId)} sub={user.code} />
                <KPI tone="blue" label="Tasks Available" value={divisions.length} sub="active divisions" />
              </div>
              <Card className="rise">
                <div className="spread" style={{ marginBottom: "0.8rem" }}>
                  <h3 className="section-title" style={{ margin: 0 }}>Today's task payouts</h3>
                  <Link to="/earnings" className="btn btn-ghost btn-sm">View my earnings →</Link>
                </div>
                {myTodayTasks.length === 0 ? (
                  <EmptyState title="No task logs yet today" message="Check back once your supervisor enters today's output." />
                ) : (
                  <table className="data">
                    <thead><tr><th>Task</th><th>Type</th><th>Output</th><th>Your share</th></tr></thead>
                    <tbody>
                      {myTodayTasks.map((t) => (
                        <tr key={t.id}>
                          <td><strong>{t.task_name}</strong><div className="muted" style={{ fontSize: "0.78rem" }}>{divisionName(t.division_id)}</div></td>
                          <td><Badge tone="grey">{taskTypeLabel(t.task_type)}</Badge></td>
                          <td className="mono">{formatNumber(t.total_output)} {t.unit}</td>
                          <td className="money"><strong>{formatMoney(t.myShare)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </>
          )}

          {(user.role === "supervisor") && (
            <>
              <div className="kpi-grid stagger" style={{ marginBottom: "1.25rem" }}>
                <KPI tone="green" label="Logs Entered Today" value={todayLogs.length} sub={divisionName(user.homeDivisionId)} />
                <KPI tone="gold" label="Output Captured" value={formatNumber(todayLogs.reduce((s, l) => s + Number(l.total_output), 0))} sub="across today's logs" />
                <KPI tone="blue" label="Payout Total Today" value={formatMoney(todayLogs.reduce((s, l) => s + Number(l.amount), 0))} sub="gross incentive" />
              </div>
              <Card className="rise">
                <div className="spread" style={{ marginBottom: "0.8rem" }}>
                  <h3 className="section-title" style={{ margin: 0 }}>Today's daily logs</h3>
                  <Link to="/daily-logs" className="btn btn-sm">Log output →</Link>
                </div>
                {todayLogs.length === 0 ? (
                  <EmptyState title="No logs entered yet today" message="Capture the day's task output to start calculating incentives." />
                ) : (
                  <table className="data">
                    <thead><tr><th>Task</th><th>Type</th><th>Output</th><th>Amount</th><th>Workers</th></tr></thead>
                    <tbody>
                      {todayLogs.map((l) => (
                        <tr key={l.id}>
                          <td><strong>{l.task_name}</strong></td>
                          <td><Badge tone="grey">{taskTypeLabel(l.task_type)}</Badge></td>
                          <td className="mono">{formatNumber(l.total_output)} {l.unit}</td>
                          <td className="money">{formatMoney(l.amount)}</td>
                          <td>{(l.participants || []).length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </>
          )}

          {hasRole(user, "hr", "admin", "super_admin") && (
            <>
              <div className="kpi-grid stagger" style={{ marginBottom: "1.25rem" }}>
                <KPI tone="green" label="Today's Payout" value={todayReport ? formatMoney(todayReport.grandTotal) : "—"} sub={todayReport ? `${todayReport.rows.length} earners` : "no data"} />
                <KPI tone="gold" label={`This Month (${currentMonthISO()})`} value={monthReport ? formatMoney(monthReport.grandTotal) : "—"} sub={monthReport ? `${monthReport.employees.length} employees` : "no data"} />
                <KPI tone="blue" label="Divisions" value={divisions.length} sub="operational" />
                {analytics && <KPI tone="blue" label="Active Employees" value={analytics.activeEmployees} sub={`${analytics.activeTasks} active tasks`} />}
                {analytics && <KPI tone="gold" label="Total Payout (all-time)" value={formatMoney(analytics.totalPayout)} sub={`${analytics.totalLogs} logs`} />}
                {user.role === "super_admin" && <KPI tone="red" label="Flagged Edits" value={audit.length} sub="retroactive changes" />}
              </div>

              {analytics && analytics.divisions.length > 0 && (
                <Card className="rise" style={{ marginBottom: "1rem" }}>
                  <h3 className="section-title">Payout by division</h3>
                  <DivisionBars divisions={analytics.divisions} />
                </Card>
              )}

              {analytics && analytics.dailyTrend.length > 1 && (
                <Card className="rise" style={{ marginBottom: "1rem" }}>
                  <h3 className="section-title">Daily payout trend</h3>
                  <TrendChart trend={analytics.dailyTrend} />
                </Card>
              )}

              <div className="grid stagger" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
                <Card>
                  <div className="spread" style={{ marginBottom: "0.8rem" }}>
                    <h3 className="section-title" style={{ margin: 0 }}>Top earners — this month</h3>
                    <Link to="/reports" className="btn btn-ghost btn-sm">Full reports →</Link>
                  </div>
                  {!monthReport || monthReport.employees.length === 0 ? (
                    <EmptyState title="No monthly data yet" />
                  ) : (
                    <table className="data">
                      <thead><tr><th>Employee</th><th>Division</th><th>Total</th></tr></thead>
                      <tbody>
                        {monthReport.employees.slice(0, 6).map((e) => (
                          <tr key={e.employeeId}>
                            <td><strong>{e.name}</strong><div className="muted" style={{ fontSize: "0.78rem" }}>{e.code}</div></td>
                            <td>{e.divisionName || "—"}</td>
                            <td className="money"><strong>{formatMoney(e.total)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>

                <Card>
                  <h3 className="section-title">Today by division</h3>
                  {todayLogs.length === 0 ? (
                    <EmptyState title="No logs today" />
                  ) : (
                    (() => {
                      const byDiv = {};
                      todayLogs.forEach((l) => {
                        byDiv[l.division_id] = byDiv[l.division_id] || { name: divisionName(l.division_id), amount: 0, count: 0 };
                        byDiv[l.division_id].amount += Number(l.amount);
                        byDiv[l.division_id].count += 1;
                      });
                      const max = Math.max(...Object.values(byDiv).map((d) => d.amount), 1);
                      return Object.values(byDiv).map((d) => (
                        <div key={d.name} style={{ marginBottom: "0.7rem" }}>
                          <div className="spread" style={{ fontSize: "0.85rem" }}>
                            <span>{d.name} <span className="muted">· {d.count}</span></span>
                            <span className="money"><strong>{formatMoney(d.amount)}</strong></span>
                          </div>
                          <div className="bar-track" style={{ marginTop: "0.3rem" }}>
                            <div className="bar-fill" style={{ width: `${(d.amount / max) * 100}%` }} />
                          </div>
                        </div>
                      ));
                    })()
                  )}
                </Card>
              </div>

              {user.role === "super_admin" && (
                <Card className="rise" style={{ marginTop: "1rem" }}>
                  <div className="spread" style={{ marginBottom: "0.8rem" }}>
                    <h3 className="section-title" style={{ margin: 0 }}>🛡️ Flagged retroactive edits</h3>
                    <Link to="/audit" className="btn btn-ghost btn-sm">Audit trail →</Link>
                  </div>
                  {audit.length === 0 ? (
                    <EmptyState icon="✅" title="Nothing flagged" message="No retroactive log edits detected." />
                  ) : (
                    <table className="data">
                      <thead><tr><th>Actor</th><th>Entity</th><th>Note</th><th>When</th></tr></thead>
                      <tbody>
                        {audit.slice(0, 6).map((a) => (
                          <tr key={a.id}>
                            <td><strong>{a.actor_name || "—"}</strong><div className="muted" style={{ fontSize: "0.78rem" }}>{a.actor_code}</div></td>
                            <td className="mono">{a.entity}#{a.entity_id}</td>
                            <td><span className="flag-dot" /> <span className="muted">{a.note}</span></td>
                            <td className="muted">{formatDate(a.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

// Simple hand-rolled SVG bar chart for division payouts (no chart library).
function DivisionBars({ divisions }) {
  const max = Math.max(...divisions.map((d) => d.total), 1);
  return (
    <div>
      {divisions.map((d) => (
        <div key={d.id} style={{ marginBottom: "0.7rem" }}>
          <div className="spread" style={{ fontSize: "0.85rem" }}>
            <span>{d.name} <span className="muted">· {d.logCount} logs</span></span>
            <span className="money"><strong>{formatMoney(d.total)}</strong></span>
          </div>
          <div className="bar-track" style={{ marginTop: "0.3rem" }}>
            <div className="bar-fill bar-fill-static" style={{ width: `${(d.total / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Hand-rolled SVG line/bars for the daily payout trend.
function TrendChart({ trend }) {
  const w = 640;
  const h = 160;
  const pad = 28;
  const data = trend.slice(-30); // last 30 days
  const max = Math.max(...data.map((d) => d.total), 1);
  const stepX = (w - pad * 2) / Math.max(data.length - 1, 1);
  const x = (i) => pad + i * stepX;
  const y = (v) => h - pad - (v / max) * (h - pad * 2);
  const points = data.map((d, i) => `${x(i)},${y(d.total)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Daily payout trend">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--ink-100)" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="var(--ink-100)" />
      <polyline points={points} fill="none" stroke="var(--pussalla-green-600)" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.total)} r="2.5" fill="var(--pussalla-green-600)" />
      ))}
    </svg>
  );
}
