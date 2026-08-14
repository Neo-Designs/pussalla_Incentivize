import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Card, { PageHead, KPI, EmptyState, Badge, SkeletonRows } from "../components/Card.jsx";
import Reveal from "../components/Reveal.jsx";
import { VerticalBarChart, MultiLineChart, AreaChart, StackedColumnChart, Sparkline, CHART_PALETTE } from "../components/charts.jsx";
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
  const [earnerDiv, setEarnerDiv] = useState("");   // top-earners division filter
  const [drillDiv, setDrillDiv] = useState(null);    // selected division for drill-down

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
  const drillTitle = drillDiv ? "Task payout in " + (drillDiv.name || divisionName(drillDiv.id)) : "Payout by division";

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
              <Reveal>
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
              </Reveal>
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
                <Reveal style={{ marginBottom: "1rem" }}>
                  <Card className="rise">
                    <div className="spread" style={{ marginBottom: "0.8rem" }}>
                      <h3 className="section-title" style={{ margin: 0 }}>{drillTitle}</h3>
                      {drillDiv ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => setDrillDiv(null)}>Back to divisions</button>
                      ) : null}
                    </div>
                    <p className="muted" style={{ fontSize: "0.82rem", marginTop: 0, marginBottom: "0.6rem" }}>
                      {drillDiv
                        ? "Which task is costing the company the most in this division. Click a bar to switch back."
                        : "Click a division bar to drill into per-task payout for that division."}
                    </p>
                    {drillDiv ? (
                      <DivisionTaskBars
                        tasks={(analytics.divisionTasks || {})[drillDiv.id] || []}
                        onBack={() => setDrillDiv(null)}
                      />
                    ) : (
                      <VerticalBarChart
                        data={analytics.divisions}
                        onSelect={(d) => setDrillDiv(d)}
                      />
                    )}
                  </Card>
                </Reveal>
              )}

              {analytics && (analytics.divisionTrend || []).length > 1 && (
                <Reveal style={{ marginBottom: "1rem" }}>
                  <Card className="rise">
                    <h3 className="section-title">Payout trends over time</h3>
                    <DivisionTrendMultiLine analytics={analytics} divisions={divisions} />
                  </Card>
                </Reveal>
              )}

              {analytics && (analytics.participationTrend || []).length > 1 && (
                <Reveal style={{ marginBottom: "1rem" }}>
                  <Card className="rise">
                    <h3 className="section-title">Employee participation rate</h3>
                    <p className="muted" style={{ fontSize: "0.82rem", marginTop: 0, marginBottom: "0.6rem" }}>
                      Distinct employees earning an incentive each day.
                    </p>
                    <AreaChart data={analytics.participationTrend} valueKey="participants" labelKey="date" />
                  </Card>
                </Reveal>
              )}

              {analytics && (analytics.editsTrend || []).length > 0 && (
                <Reveal style={{ marginBottom: "1rem" }}>
                  <Card className="rise">
                    <h3 className="section-title">All audit edits (stacked)</h3>
                    <p className="muted" style={{ fontSize: "0.82rem", marginTop: 0, marginBottom: "0.6rem" }}>
                      Daily count of every audit action — create / update / delete.
                    </p>
                    <EditsStackedChart rows={analytics.editsTrend} />
                  </Card>
                </Reveal>
              )}

              <Reveal>
                <div className="grid stagger" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
                  <Card>
                    <div className="spread" style={{ marginBottom: "0.8rem" }}>
                      <h3 className="section-title" style={{ margin: 0 }}>Top earners — leaderboard</h3>
                      <select
                        value={earnerDiv}
                        onChange={(e) => setEarnerDiv(e.target.value)}
                        style={{ width: "auto", fontSize: "0.8rem" }}
                      >
                        <option value="">All divisions</option>
                        {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    {!analytics || (analytics.topEarners || []).length === 0 ? (
                      <EmptyState title="No earner data yet" />
                    ) : (
                      <TopEarnersLeaderboard earners={analytics.topEarners} earnerDiv={earnerDiv} divisions={divisions} />
                    )}
                    <div style={{ marginTop: "0.7rem" }}>
                      <Link to="/reports" className="btn btn-ghost btn-sm">Full reports →</Link>
                    </div>
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
              </Reveal>

              {user.role === "super_admin" && (
                <Reveal style={{ marginTop: "1rem" }}>
                  <Card className="rise">
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
                </Reveal>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

// Vertical bars of per-task payout within the drilled-down division, so the
// super admin can see which task costs the company the most there.
function DivisionTaskBars({ tasks, onBack }) {
  if (!tasks.length) return <EmptyState title="No task data for this division" />;
  const data = tasks.map((t) => ({ id: t.taskId, name: t.task, total: t.total }));
  return (
    <VerticalBarChart
      data={data}
      onSelect={onBack}
      color="#7a1e1e"
    />
  );
}

// Multiline payout trend: one line per division over time.
function DivisionTrendMultiLine({ analytics, divisions }) {
  const rows = analytics.divisionTrend || [];
  if (rows.length < 2) return <EmptyState title="Not enough trend data" />;
  const dates = [...new Set(rows.map((r) => String(r.date).slice(0, 10)))].sort();
  const divIds = [...new Set(rows.map((r) => r.divisionId))];
  const divName = (id) => divisions.find((d) => d.id === id)?.name || `Division ${id}`;
  const series = divIds.map((id, i) => ({
    id, name: divName(id), color: CHART_PALETTE[i % CHART_PALETTE.length],
    points: dates.map((d) => {
      const r = rows.find((x) => String(x.date).slice(0, 10) === d && x.divisionId === id);
      return { value: r ? r.total : 0 };
    }),
  }));
  return <MultiLineChart series={series} dates={dates} />;
}

// Stacked column chart of all audit edits (create/update/delete) per day.
function EditsStackedChart({ rows }) {
  if (!rows.length) return <EmptyState title="No edit activity" />;
  const dates = [...new Set(rows.map((r) => String(r.date).slice(0, 10)))].sort();
  const actions = [...new Set(rows.map((r) => r.action))];
  const colors = { CREATE: "#0e7a4f", UPDATE: "#b35400", DELETE: "#a30404" };
  const stacks = actions.map((a) => ({
    name: a.charAt(0) + a.slice(1).toLowerCase(),
    values: dates.map((d) => rows.find((r) => String(r.date).slice(0, 10) === d && r.action === a)?.count || 0),
  }));
  return <StackedColumnChart dates={dates} stacks={stacks} colors={actions.map((a) => colors[a] || "#590707")} />;
}

// Ranked top-earner leaderboard with sparklines, client-filterable by division.
function TopEarnersLeaderboard({ earners, earnerDiv, divisions }) {
  const divName = (id) => divisions.find((d) => d.id === id)?.name;
  const filtered = earners
    .filter((e) => {
      if (!earnerDiv) return true;
      // Match by division name since top earners carry divisionName (home div).
      return divName(Number(earnerDiv)) === e.divisionName;
    })
    .slice(0, 10);
  if (!filtered.length) return <EmptyState title="No earners for this division" />;
  const max = filtered[0].total || 1;
  return (
    <div>
      {filtered.map((e, i) => {
        const spark = (e.series || []).map((s) => s.amount);
        return (
          <div key={e.id} style={{ marginBottom: "0.65rem" }}>
            <div className="spread" style={{ fontSize: "0.85rem" }}>
              <span><strong>{i + 1}.</strong> {e.name} <span className="muted" style={{ fontSize: "0.76rem" }}>{e.code}</span></span>
              <span className="row" style={{ alignItems: "center", gap: "0.55rem" }}>
                {spark.length > 1 && <Sparkline data={spark} color={CHART_PALETTE[i % CHART_PALETTE.length]} />}
                <span className="money"><strong>{formatMoney(e.total)}</strong></span>
              </span>
            </div>
            <div className="bar-track" style={{ marginTop: "0.3rem" }}>
              <div className="bar-fill bar-fill-static" style={{ width: `${(e.total / max) * 100}%` }} />
            </div>
            <div className="muted" style={{ fontSize: "0.74rem", marginTop: "0.15rem" }}>{e.divisionName || "—"}</div>
          </div>
        );
      })}
    </div>
  );
}
