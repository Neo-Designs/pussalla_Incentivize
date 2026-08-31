import React from "react";
import { formatMoney, formatNumber, formatDate, taskTypeLabel } from "../utils/helpers";

// On-screen employee incentive payslip. Fed by the `/employee-grid/:id`
// response (code, name, divisionName, month, dates, tasks[], grandTotal),
// where each task carries `days[<dayKey>] = { count, output, rate, amount }`.
//
// Layout is strictly bounded (max-width + overflow-x-auto) so nothing leaks
// past the right edge, even for 31-day months. Sections:
//   1. Professional header + bordered two-column employee metadata card
//   2. Highlighted Total Incentive Payout summary box
//   3. Clean monthly task activity grid (tasks x days, scrollable)
//   4. Polished itemized "Detailed Daily Breakdown" table (zebra, aligned)
export default function PayslipView({ grid, loading, onClose, onDownloadPdf, pdfLoading }) {
  if (loading) {
    return (
      <div className="payslip-wrap">
        <div className="payslip-card payslip-skeleton">
          <div className="ps-shimmer" style={{ height: 28, width: 220 }} />
          <div className="ps-shimmer" style={{ height: 16, width: 160, marginTop: 8 }} />
          <div className="ps-shimmer" style={{ height: 90, marginTop: 24 }} />
          <div className="ps-shimmer" style={{ height: 220, marginTop: 16 }} />
        </div>
      </div>
    );
  }

  if (!grid || !grid.tasks || grid.tasks.length === 0) {
    return (
      <div className="payslip-wrap">
        <div className="payslip-card payslip-empty">
          <div className="payslip-brand">Incentivize</div>
          <div className="payslip-doc-title">Incentive Payslip</div>
          <p className="muted">No task data for this employee this month.</p>
        </div>
      </div>
    );
  }

  const dates = grid.dates || [];
  const month = grid.month || "";
  const monthLabel = prettyMonth(month);

  // Flatten the task x date grid into itemized rows (Date | Task Code & Name |
  // Units | No. of Tasks | Rate per unit | Divided amongst | Daily base limit | Daily Earnings).
  const items = [];
  for (const t of grid.tasks) {
    for (const dk of Object.keys(t.days)) {
      const c = t.days[dk];
      items.push({
        dateKey: dk,
        date: `${month}-${dk}`,
        taskCode: t.taskCode,
        task: t.task,
        taskType: t.taskType,
        unit: t.unit,
        baseLimit: t.baseLimit ?? c.baseLimit ?? null,
        participantCount: c.participantCount || 1,
        count: Number(c.count) || 1,
        output: Number(c.output) || 0,
        rate: Number(c.rate) || 0,
        amount: Number(c.amount) || 0,
      });
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.task.localeCompare(b.task)));

  const grandTotal = Number(grid.grandTotal) || 0;
  const totalUnits = items.reduce((s, it) => s + it.output, 0);

  return (
    <div className="payslip-wrap">
      <div className="payslip-card">
        {/* ---- Header ---- */}
        <div className="payslip-head">
          <div>
            <div className="payslip-brand">Incentivize</div>
            <div className="payslip-doc-title">Incentive Payslip</div>
          </div>
          <div className="payslip-head-right">
            {(onClose || onDownloadPdf) && (
              <div className="payslip-actions">
                {onDownloadPdf && (
                  <button className="btn btn-gold btn-sm" onClick={onDownloadPdf} disabled={pdfLoading}>
                    {pdfLoading ? "Preparing…" : "↓ Download PDF"}
                  </button>
                )}
                {onClose && (
                  <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---- Employee metadata (bordered two-column info card) ---- */}
        <div className="payslip-meta">
          <div className="meta-cell">
            <div className="meta-label">Employee name</div>
            <div className="meta-value">{grid.name}</div>
          </div>
          <div className="meta-cell">
            <div className="meta-label">Employee code</div>
            <div className="meta-value mono">{grid.code}</div>
          </div>
          <div className="meta-cell">
            <div className="meta-label">Division</div>
            <div className="meta-value">{grid.divisionName || "—"}</div>
          </div>
          <div className="meta-cell">
            <div className="meta-label">Pay period</div>
            <div className="meta-value">{monthLabel}</div>
          </div>
        </div>

        {/* ---- Highlighted total payout summary ---- */}
        <div className="payslip-summary">
          <div className="summary-label">Monthly Total Earnings</div>
          <div className="summary-amount">{formatMoney(grandTotal)}</div>
          <div className="summary-sub">
            {items.length} log(s) · {grid.tasks.length} task(s) · {formatNumber(totalUnits)} units
          </div>
        </div>

        {/* ---- Monthly task activity grid ---- */}
        <section className="payslip-section">
          <h4 className="payslip-section-title">Monthly task activity</h4>
          <p className="payslip-section-sub">
            Each row is a task, each column a day (1–{dates.length}). A green <strong>✓</strong> marks a day
            the task was done — hover for units, rate and earnings.
          </p>
          <div className="payslip-grid-scroll">
            <table className="payslip-calendar">
              <thead>
                <tr>
                  <th className="cal-task">Task</th>
                  {dates.map((d) => (
                    <th key={d} className="cal-day" title={`${month}-${d}`}>{Number(d)}</th>
                  ))}
                  <th className="cal-total">Total</th>
                </tr>
              </thead>
              <tbody>
                {grid.tasks.map((t) => (
                  <tr key={t.taskId}>
                    <td className="cal-task">
                      <strong>{t.taskCode ? `[${t.taskCode}] ` : ""}{t.task}</strong>
                      <div className="muted cal-task-type">{taskTypeLabel(t.taskType)}</div>
                    </td>
                    {dates.map((d) => {
                      const c = t.days[d];
                      if (!c) return <td key={d} className="cal-empty" />;
                      const title = `${formatNumber(c.output)} ${t.unit || ""} · Rs. ${Number(c.amount).toFixed(2)} (Rs. ${Number(c.rate).toFixed(2)}/${t.unit || "unit"})`;
                      return (
                        <td key={d} className="cal-has" title={title}>
                          <span className="cal-tick">✓</span>
                        </td>
                      );
                    })}
                    <td className="cal-total money">{formatMoney(t.taskTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- Detailed daily breakdown (core financial record) ---- */}
        <section className="payslip-section">
          <h4 className="payslip-section-title">Detailed daily breakdown</h4>
          <p className="payslip-section-sub">Itemized per-day work: dates, tasks completed, units, task count, rate per unit, divided amongst, base limit, and daily earnings.</p>
          <div className="payslip-grid-scroll">
            <table className="payslip-table">
              <thead>
                <tr>
                  <th className="col-date">Date</th>
                  <th className="col-task">Task</th>
                  <th className="col-units">Units completed</th>
                  <th className="col-count num">No. of Tasks</th>
                  <th className="col-rate num">Rate per unit</th>
                  <th className="col-split num">Divided amongst</th>
                  <th className="col-limit num">Daily base limit</th>
                  <th className="col-earn num">Daily Earnings</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const isGroup = it.taskType === 2 || it.taskType === 3;
                  return (
                    <tr key={`${it.date}-${it.task}-${i}`} className={i % 2 ? "row-alt" : ""}>
                      <td className="col-date">{formatDate(it.date)}</td>
                      <td className="col-task">
                        <strong>{it.taskCode ? `[${it.taskCode}] ` : ""}{it.task}</strong>
                        <div className="muted col-task-type">{taskTypeLabel(it.taskType)}</div>
                      </td>
                      <td className="col-units mono">{formatNumber(it.output)} <span className="unit-tag">{it.unit || ""}</span></td>
                      <td className="col-count num mono">{it.count}</td>
                      <td className="col-rate num money">Rs. {it.rate.toFixed(2)}</td>
                      <td className="col-split num">{isGroup ? `${it.participantCount} worker${it.participantCount !== 1 ? "s" : ""}` : "—"}</td>
                      <td className="col-limit num mono">{it.taskType === 3 && it.baseLimit != null ? `${formatNumber(it.baseLimit)} ${it.unit || ""}` : "—"}</td>
                      <td className="col-earn num money strong">Rs. {it.amount.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} className="tfoot-label">Monthly Total Earnings</td>
                  <td className="col-earn num money strong" style={{ fontSize: "1.1rem" }}>Rs. {grandTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <div className="payslip-foot">
          This is a system-generated payslip. Discrepancies should be raised with HR.
        </div>
      </div>
    </div>
  );
}

function prettyMonth(iso) {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const mi = Number(m) - 1;
  return months[mi] ? `${months[mi]} ${y}` : iso;
}
