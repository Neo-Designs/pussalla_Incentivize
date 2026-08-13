const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sendCsv, sendPayslipPdf } = require("../utils/exporters");

const router = express.Router();

const ALLOWED_ROLES = ["admin", "super_admin", "hr"];

// GET /api/reports/daily?date=2026-08-06
router.get("/daily", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)" });

  const { rows } = await pool.query(
    `SELECT e.id AS employee_id, e.code, e.name, e.home_division_id, d.name AS division_name,
            COUNT(DISTINCT l.id) AS tasks_completed,
            SUM(p.share_amount) AS daily_total
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     WHERE l.log_date = $1
     GROUP BY e.id, e.code, e.name, e.home_division_id, d.name
     ORDER BY daily_total DESC`,
    [date]
  );
  const grandTotal = rows.reduce((s, r) => s + Number(r.daily_total), 0);
  res.json({ date, rows, grandTotal });
});

// GET /api/reports/daily.csv?date=2026-08-06
router.get("/daily.csv", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)" });
  const { rows } = await pool.query(
    `SELECT e.code, e.name, d.name AS division_name,
            COUNT(DISTINCT l.id) AS tasks_completed,
            SUM(p.share_amount) AS daily_total
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     WHERE l.log_date = $1
     GROUP BY e.code, e.name, d.name
     ORDER BY daily_total DESC`,
    [date]
  );
  const out = [["Employee Code", "Name", "Division", "Tasks Completed", "Daily Total"]];
  rows.forEach((r) => out.push([r.code, r.name, r.division_name || "", r.tasks_completed, Number(r.daily_total).toFixed(2)]));
  out.push(["", "", "", "GRAND TOTAL", rows.reduce((s, r) => s + Number(r.daily_total), 0).toFixed(2)]);
  sendCsv(res, `pussalla-daily-${date}.csv`, out);
});

// GET /api/reports/monthly?month=2026-08  (server-side aggregation)
router.get("/monthly", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: "month query param is required (YYYY-MM)" });

  // Per-employee totals + days worked, in one grouped query.
  const { rows: summary } = await pool.query(
    `SELECT e.id AS employee_id, e.code, e.name, d.name AS division_name,
            SUM(p.share_amount) AS total,
            COUNT(DISTINCT l.log_date) AS days_logged,
            COUNT(DISTINCT l.id) AS task_logs
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     WHERE to_char(l.log_date, 'YYYY-MM') = $1
     GROUP BY e.id, e.code, e.name, d.name
     ORDER BY total DESC`,
    [month]
  );

  const employees = summary.map((r) => ({
    employeeId: r.employee_id, code: r.code, name: r.name,
    divisionName: r.division_name,
    total: Number(r.total),
    daysLogged: Number(r.days_logged),
    taskLogs: Number(r.task_logs),
    items: [],
  }));

  // Items (kept for per-employee breakdown / payslips). Still grouped server-side.
  const { rows: itemRows } = await pool.query(
    `SELECT p.employee_id, l.log_date AS date, t.name AS task, p.share_amount AS amount
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN tasks t ON t.id = l.task_id
     WHERE to_char(l.log_date, 'YYYY-MM') = $1
     ORDER BY p.employee_id, l.log_date`,
    [month]
  );
  const byId = new Map(employees.map((e) => [e.employeeId, e]));
  for (const it of itemRows) {
    const emp = byId.get(it.employee_id);
    if (emp) emp.items.push({ date: it.date, task: it.task, amount: Number(it.amount) });
  }

  const grandTotal = employees.reduce((s, e) => s + e.total, 0);
  res.json({ month, employees, grandTotal });
});

// GET /api/reports/monthly/:employeeId?month=2026-08  (drill-down)
router.get("/monthly/:employeeId", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  const { employeeId } = req.params;
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: "month query param is required (YYYY-MM)" });

  const { rows } = await pool.query(
    `SELECT e.id AS employee_id, e.code, e.name, d.name AS division_name,
            l.log_date AS date, t.name AS task, t.task_type, l.total_output, t.unit,
            p.share_amount AS amount
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN tasks t ON t.id = l.task_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     WHERE p.employee_id = $1 AND to_char(l.log_date, 'YYYY-MM') = $2
     ORDER BY l.log_date`,
    [employeeId, month]
  );
  if (!rows.length) return res.json({ employeeId: Number(employeeId), month, items: [], taskBreakdown: [], total: 0 });

  const items = rows.map((r) => ({
    date: r.date, task: r.task, taskType: r.task_type,
    output: Number(r.total_output), unit: r.unit, amount: Number(r.amount),
  }));
  const taskMap = {};
  for (const it of items) taskMap[it.task] = (taskMap[it.task] || 0) + it.amount;
  const taskBreakdown = Object.entries(taskMap).map(([task, total]) => ({ task, total }));
  const total = items.reduce((s, it) => s + it.amount, 0);
  res.json({
    employeeId: Number(employeeId), code: rows[0].code, name: rows[0].name,
    divisionName: rows[0].division_name, month, items, taskBreakdown, total,
  });
});

// GET /api/reports/monthly.csv?month=2026-08
router.get("/monthly.csv", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: "month query param is required (YYYY-MM)" });
  const { rows } = await pool.query(
    `SELECT e.code, e.name, d.name AS division_name,
            l.log_date AS date, t.name AS task, p.share_amount AS amount
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN tasks t ON t.id = l.task_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     WHERE to_char(l.log_date, 'YYYY-MM') = $1
     ORDER BY e.id, l.log_date`,
    [month]
  );
  const out = [["Employee Code", "Name", "Division", "Date", "Task", "Amount"]];
  rows.forEach((r) => out.push([r.code, r.name, r.division_name || "", String(r.date).slice(0, 10), r.task, Number(r.amount).toFixed(2)]));
  sendCsv(res, `pussalla-monthly-${month}.csv`, out);
});

// GET /api/reports/payslip.pdf?employeeId=X&month=2026-08
// Employees can only request their own; admin/HR/super_admin can request any.
router.get("/payslip.pdf", requireAuth, async (req, res) => {
  const { employeeId, month } = req.query;
  if (!employeeId || !month) return res.status(400).json({ error: "employeeId and month are required" });

  const isPrivileged = req.user.role === "super_admin" || ["admin", "hr"].includes(req.user.role);
  if (!isPrivileged && Number(req.user.id) !== Number(employeeId)) {
    return res.status(403).json({ error: "You can only view your own payslip" });
  }

  const { rows } = await pool.query(
    `SELECT e.code, e.name, d.name AS division_name,
            l.log_date AS date, t.name AS task, p.share_amount AS amount
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN tasks t ON t.id = l.task_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     WHERE p.employee_id = $1 AND to_char(l.log_date, 'YYYY-MM') = $2
     ORDER BY l.log_date`,
    [employeeId, month]
  );
  const items = rows.map((r) => ({ date: r.date, task: r.task, amount: Number(r.amount) }));
  const taskMap = {};
  for (const it of items) taskMap[it.task] = (taskMap[it.task] || 0) + it.amount;
  const taskBreakdown = Object.entries(taskMap).map(([task, total]) => ({ task, total }));
  const grandTotal = items.reduce((s, it) => s + it.amount, 0);

  sendPayslipPdf(res, {
    employeeCode: rows[0]?.code || String(employeeId),
    employeeName: rows[0]?.name || "Employee",
    divisionName: rows[0]?.division_name || "—",
    month, items, taskBreakdown, grandTotal,
  });
});

// GET /api/reports/my-earnings?from=&to=  (scoped to the logged-in employee)
router.get("/my-earnings", requireAuth, async (req, res) => {
  const { from, to } = req.query;
  const clauses = ["p.employee_id = $1"];
  const params = [req.user.id];
  if (from) { params.push(from); clauses.push(`l.log_date >= $${params.length}`); }
  if (to) { params.push(to); clauses.push(`l.log_date <= $${params.length}`); }
  const where = `WHERE ${clauses.join(" AND ")}`;

  const { rows } = await pool.query(
    `SELECT e.code, e.name, d.name AS division_name,
            l.id AS log_id, l.log_date AS date, t.name AS task, t.task_type,
            l.total_output, t.unit, p.share_amount AS amount
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN tasks t ON t.id = l.task_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     ${where}
     ORDER BY l.log_date DESC, l.id DESC`,
    params
  );

  const items = rows.map((r) => ({
    date: r.date, task: r.task, taskType: r.task_type,
    output: Number(r.total_output), unit: r.unit, amount: Number(r.amount),
    divisionName: r.division_name,
  }));
  const taskMap = {};
  for (const it of items) taskMap[it.task] = (taskMap[it.task] || 0) + it.amount;
  const taskBreakdown = Object.entries(taskMap)
    .map(([task, total]) => ({ task, total }))
    .sort((a, b) => b.total - a.total);
  const grandTotal = items.reduce((s, it) => s + it.amount, 0);

  res.json({
    employeeId: req.user.id, code: rows[0]?.code, name: rows[0]?.name,
    divisionName: rows[0]?.division_name, items, taskBreakdown, total: grandTotal,
  });
});

// GET /api/reports/analytics?from=&to=  (super_admin, admin)
router.get("/analytics", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const { from, to } = req.query;
  const dateClause = [];
  const dp = [];
  if (from) { dp.push(from); dateClause.push(`l.log_date >= $${dp.length}`); }
  if (to) { dp.push(to); dateClause.push(`l.log_date <= $${dp.length}`); }
  const where = dateClause.length ? `WHERE ${dateClause.join(" AND ")}` : "";

  const [totals, divTotals, topEarners, trend, flagged, counts] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT l.id) AS log_count,
              COALESCE(SUM(l.amount), 0) AS total_payout,
              COALESCE(SUM(l.total_output), 0) AS total_output
       FROM daily_task_logs l ${where}`,
      dp
    ),
    pool.query(
      `SELECT d.id, d.name, COUNT(l.id) AS log_count, COALESCE(SUM(l.amount), 0) AS total
       FROM daily_task_logs l
       JOIN divisions d ON d.id = l.division_id
       ${where}
       GROUP BY d.id, d.name ORDER BY total DESC`,
      dp
    ),
    pool.query(
      `SELECT e.id, e.code, e.name, d.name AS division_name, SUM(p.share_amount) AS total
       FROM task_participants p
       JOIN daily_task_logs l ON l.id = p.daily_task_log_id
       JOIN employees e ON e.id = p.employee_id
       LEFT JOIN divisions d ON d.id = e.home_division_id
       ${where}
       GROUP BY e.id, e.code, e.name, d.name
       ORDER BY total DESC LIMIT 10`,
      dp
    ),
    pool.query(
      `SELECT l.log_date AS date, COUNT(l.id) AS log_count, COALESCE(SUM(l.amount), 0) AS total
       FROM daily_task_logs l ${where}
       GROUP BY l.log_date ORDER BY l.log_date`,
      dp
    ),
    pool.query(`SELECT COUNT(*)::int AS flagged_count FROM audit_logs WHERE flagged = true`),
    pool.query(
      `SELECT (SELECT COUNT(*) FROM employees WHERE active = true) AS active_employees,
              (SELECT COUNT(*) FROM tasks WHERE active = true) AS active_tasks,
              (SELECT COUNT(*) FROM divisions) AS divisions`
    ),
  ]);

  res.json({
    totalLogs: Number(totals.rows[0].log_count),
    totalPayout: Number(totals.rows[0].total_payout),
    totalOutput: Number(totals.rows[0].total_output),
    divisions: divTotals.rows.map((r) => ({ id: r.id, name: r.name, logCount: Number(r.log_count), total: Number(r.total) })),
    topEarners: topEarners.rows.map((r) => ({ id: r.id, code: r.code, name: r.name, divisionName: r.division_name, total: Number(r.total) })),
    dailyTrend: trend.rows.map((r) => ({ date: r.date, logCount: Number(r.log_count), total: Number(r.total) })),
    flaggedEdits: flagged.rows[0].flagged_count,
    activeEmployees: counts.rows[0].active_employees,
    activeTasks: counts.rows[0].active_tasks,
    divisionCount: counts.rows[0].divisions,
  });
});

module.exports = router;
