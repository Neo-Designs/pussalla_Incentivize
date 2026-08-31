const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sendCsv, sendPayslipPdf } = require("../utils/exporters");

const router = express.Router();

// Reports are visible to HR, Admin, Super Admin and (for their own division
// by default) Supervisors. Supervisors can switch the division filter in the
// UI (demo mode) so the endpoints honour an optional `divisionId` filter
// rather than hard-scoping to the supervisor's home division server-side.
const ALLOWED_ROLES = ["admin", "super_admin", "hr", "supervisor"];

// `pg` parses DATE columns into JS Date objects (midnight UTC). Naive
// `String(date).slice(0,10)` yields a locale string like "Thu Aug 13" which
// does NOT match the ISO day keys the grid iterates, so every matrix cell
// ended up blank. These helpers normalize a log_date (Date OR string) to a
// stable 2-digit day-of-month key ("01".."31") and an ISO "YYYY-MM-DD" string
// used for display, regardless of how the driver returned it.
function dayKey(logDate) {
  const d = logDate instanceof Date ? logDate : new Date(logDate);
  return String(d.getUTCDate()).padStart(2, "0");
}
function isoDate(logDate) {
  if (typeof logDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(logDate)) return logDate.slice(0, 10);
  const d = logDate instanceof Date ? logDate : new Date(logDate);
  return d.toISOString().slice(0, 10);
}
// Day-number columns ("01".."31") for a given YYYY-MM month.
function monthDayKeys(month) {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= lastDay; d++) out.push(String(d).padStart(2, "0"));
  return out;
}

// GET /api/reports/daily?date=2026-08-06&divisionId=2
router.get("/daily", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  const { date, divisionId } = req.query;
  if (!date) return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)" });

  const clauses = ["l.log_date = $1"];
  const params = [date];
  if (divisionId) { params.push(divisionId); clauses.push(`l.division_id = $${params.length}`); }
  const where = `WHERE ${clauses.join(" AND ")}`;

  const { rows } = await pool.query(
    `SELECT e.id AS employee_id, e.code, e.name, e.home_division_id, d.name AS division_name,
            COUNT(DISTINCT l.id) AS tasks_completed,
            SUM(p.share_amount) AS daily_total
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     ${where}
     GROUP BY e.id, e.code, e.name, e.home_division_id, d.name
     ORDER BY daily_total DESC`,
    params
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
  sendCsv(res, `incentivize-daily-${date}.csv`, out);
});

// GET /api/reports/monthly?month=2026-08&divisionId=2  (server-side aggregation)
router.get("/monthly", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  const { month, divisionId } = req.query;
  if (!month) return res.status(400).json({ error: "month query param is required (YYYY-MM)" });

  const clauses = ["to_char(l.log_date, 'YYYY-MM') = $1"];
  const params = [month];
  if (divisionId) { params.push(divisionId); clauses.push(`l.division_id = $${params.length}`); }
  const where = `WHERE ${clauses.join(" AND ")}`;

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
     ${where}
     GROUP BY e.id, e.code, e.name, d.name
     ORDER BY total DESC`,
    params
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
     ${where}
     ORDER BY p.employee_id, l.log_date`,
    params
  );
  const byId = new Map(employees.map((e) => [e.employeeId, e]));
  for (const it of itemRows) {
    const emp = byId.get(it.employee_id);
    if (emp) emp.items.push({ date: isoDate(it.date), task: it.task, amount: Number(it.amount) });
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
            l.log_date AS date, t.code AS task_code, t.name AS task, t.task_type, t.unit,
            COUNT(DISTINCT l.id) AS count,
            SUM(l.total_output) AS total_output,
            AVG(l.rate_snapshot) AS rate,
            SUM(p.share_amount) AS amount
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN tasks t ON t.id = l.task_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     WHERE p.employee_id = $1 AND to_char(l.log_date, 'YYYY-MM') = $2
     GROUP BY e.id, e.code, e.name, d.name, l.log_date, t.code, t.name, t.task_type, t.unit
     ORDER BY l.log_date, t.name`,
    [employeeId, month]
  );
  if (!rows.length) return res.json({ employeeId: Number(employeeId), month, items: [], taskBreakdown: [], total: 0 });

  const items = rows.map((r) => ({
    date: isoDate(r.date),
    taskCode: r.task_code,
    task: r.task,
    taskType: r.task_type,
    count: Number(r.count),
    output: Number(r.total_output),
    unit: r.unit,
    rate: Number(r.rate),
    amount: Number(r.amount),
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

// GET /api/reports/employee-grid/:employeeId?month=2026-08
router.get("/employee-grid/:employeeId", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  const { employeeId } = req.params;
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: "month query param is required (YYYY-MM)" });

  const dates = monthDayKeys(month); // ["01" .. "<lastDay>"]

  const { rows } = await pool.query(
    `SELECT e.code, e.name, e.home_division_id, d.name AS division_name,
            t.id AS task_id, t.code AS task_code, t.name AS task, t.task_type, t.unit,
            l.log_date AS date, l.id AS log_id, l.total_output, l.rate_snapshot AS rate,
            p.share_amount AS amount,
            (
              SELECT COUNT(DISTINCT tp.employee_id)
              FROM task_participants tp
              JOIN daily_task_logs dl ON dl.id = tp.daily_task_log_id
              WHERE dl.task_id = t.id AND dl.log_date = l.log_date
            ) AS participant_count
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN tasks t ON t.id = l.task_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     WHERE p.employee_id = $1 AND to_char(l.log_date, 'YYYY-MM') = $2
     ORDER BY t.name, l.log_date`,
    [employeeId, month]
  );

  if (!rows.length) {
    return res.json({ employeeId: Number(employeeId), month, dates, tasks: [], grandTotal: 0 });
  }

  const taskIndex = new Map();
  for (const r of rows) {
    const key = r.task_id;
    if (!taskIndex.has(key)) {
      taskIndex.set(key, {
        taskId: r.task_id, taskCode: r.task_code, task: r.task, taskType: r.task_type, unit: r.unit,
        days: {}, taskTotal: 0, logCount: 0,
      });
    }
    const t = taskIndex.get(key);
    const dk = dayKey(r.date);
    if (!t.days[dk]) t.days[dk] = { count: 0, output: 0, amount: 0, rate: 0, participantCount: 1 };
    t.days[dk].count += 1;
    t.days[dk].output += Number(r.total_output);
    t.days[dk].rate = Number(r.rate);
    t.days[dk].amount += Number(r.amount);
    t.days[dk].participantCount = Number(r.participant_count || 1);
    t.taskTotal += Number(r.amount);
    t.logCount += 1;
  }

  const tasks = [...taskIndex.values()].sort((a, b) => b.taskTotal - a.taskTotal);
  const grandTotal = tasks.reduce((s, t) => s + t.taskTotal, 0);

  res.json({
    employeeId: Number(employeeId),
    code: rows[0].code, name: rows[0].name,
    divisionName: rows[0].division_name, month, dates, tasks, grandTotal,
  });
});


// GET /api/reports/all-employee-grid?month=2026-08&divisionId=
router.get("/all-employee-grid", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  const { month, divisionId } = req.query;
  if (!month) return res.status(400).json({ error: "month query param is required (YYYY-MM)" });

  const dates = monthDayKeys(month);

  const clauses = ["to_char(l.log_date, 'YYYY-MM') = $1"];
  const params = [month];
  if (divisionId) { params.push(divisionId); clauses.push(`l.division_id = $${params.length}`); }
  const where = clauses.join(" AND ");

  const { rows } = await pool.query(
    `SELECT e.id AS employee_id, e.code, e.name, d.name AS division_name,
            t.id AS task_id, t.code AS task_code, t.name AS task, t.task_type, t.unit,
            l.log_date AS date, l.total_output, l.rate_snapshot AS rate,
            p.share_amount AS amount,
            (
              SELECT COUNT(DISTINCT tp.employee_id)
              FROM task_participants tp
              JOIN daily_task_logs dl ON dl.id = tp.daily_task_log_id
              WHERE dl.task_id = t.id AND dl.log_date = l.log_date
            ) AS participant_count
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN tasks t ON t.id = l.task_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     WHERE ${where}
     ORDER BY e.id, t.name, l.log_date`,
    params
  );

  const empParams = [];
  const empClauses = [];
  if (divisionId) { empParams.push(divisionId); empClauses.push(`home_division_id = $${empParams.length}`); }
  const empWhere = empClauses.length ? `WHERE ${empClauses.join(" AND ")}` : "";
  const { rows: allEmps } = await pool.query(
    `SELECT e.id, e.code, e.name, d.name AS division_name
     FROM employees e LEFT JOIN divisions d ON d.id = e.home_division_id
     ${empWhere} ORDER BY e.id`,
    empParams
  );

  const byEmp = new Map();
  for (const e of allEmps) {
    byEmp.set(e.id, {
      employeeId: e.id, code: e.code, name: e.name,
      divisionName: e.division_name, total: 0, tasks: [],
    });
  }

  const taskIndex = new Map();
  for (const r of rows) {
    const emp = byEmp.get(r.employee_id);
    if (!emp) continue;
    if (!taskIndex.has(r.employee_id)) taskIndex.set(r.employee_id, new Map());
    const ti = taskIndex.get(r.employee_id);
    if (!ti.has(r.task_id)) {
      ti.set(r.task_id, {
        taskId: r.task_id, taskCode: r.task_code, task: r.task, taskType: r.task_type, unit: r.unit,
        days: {}, taskTotal: 0,
      });
    }
    const t = ti.get(r.task_id);
    const dk = dayKey(r.date);
    if (!t.days[dk]) t.days[dk] = { count: 0, output: 0, amount: 0, rate: 0, participantCount: 1 };
    t.days[dk].count += 1;
    t.days[dk].output += Number(r.total_output);
    t.days[dk].rate = Number(r.rate);
    t.days[dk].amount += Number(r.amount);
    t.days[dk].participantCount = Number(r.participant_count || 1);
    t.taskTotal += Number(r.amount);
    emp.total += Number(r.amount);
  }

  for (const [empId, ti] of taskIndex) {
    const emp = byEmp.get(empId);
    emp.tasks = [...ti.values()].sort((a, b) => b.taskTotal - a.taskTotal);
  }

  res.json({
    month, dates,
    employees: [...byEmp.values()],
    grandTotal: [...byEmp.values()].reduce((s, e) => s + e.total, 0),
  });
});

// GET /api/reports/monthly.csv?month=2026-08
router.get("/monthly.csv", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: "month query param is required (YYYY-MM)" });
  const { rows } = await pool.query(
    `SELECT e.code, e.name, d.name AS division_name,
            l.log_date AS date, t.code AS task_code, t.name AS task, p.share_amount AS amount
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN tasks t ON t.id = l.task_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     WHERE to_char(l.log_date, 'YYYY-MM') = $1
     ORDER BY e.id, l.log_date`,
    [month]
  );
  const out = [["Employee Code", "Name", "Division", "Date", "Task Code", "Task", "Amount"]];
  rows.forEach((r) => out.push([r.code, r.name, r.division_name || "", isoDate(r.date), r.task_code || "", r.task, Number(r.amount).toFixed(2)]));
  sendCsv(res, `incentivize-monthly-${month}.csv`, out);
});

// GET /api/reports/tasks-report?divisionId=
router.get("/tasks-report", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  const { divisionId } = req.query;
  const params = [];
  const clauses = [];
  if (divisionId) { params.push(divisionId); clauses.push(`t.division_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT t.id, t.code, t.name AS task_name, t.task_type, t.rate, t.base_limit, t.unit, t.active,
            d.id AS division_id, d.code AS division_code, d.name AS division_name
     FROM tasks t
     LEFT JOIN divisions d ON d.id = t.division_id
     ${where}
     ORDER BY d.name, t.code, t.name`,
    params
  );
  res.json(rows);
});

// GET /api/reports/tasks.csv?divisionId=
router.get("/tasks.csv", requireAuth, requireRole(...ALLOWED_ROLES), async (req, res) => {
  const { divisionId } = req.query;
  const params = [];
  const clauses = [];
  if (divisionId) { params.push(divisionId); clauses.push(`t.division_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT t.code AS task_code, t.name AS task_name, d.code AS division_code, d.name AS division_name,
            t.task_type, t.rate, t.base_limit, t.unit, t.active
     FROM tasks t
     LEFT JOIN divisions d ON d.id = t.division_id
     ${where}
     ORDER BY d.name, t.code, t.name`,
    params
  );

  const out = [["Task Code", "Task Name", "Division Code", "Division Name", "Task Type", "Rate (Rs)", "Base Limit", "Unit", "Status"]];
  rows.forEach((r) => {
    const typeLabel = r.task_type === 1 ? "Individual Flat Rate" : r.task_type === 2 ? "Group Pool" : "Group Tiered";
    out.push([
      r.task_code || "", r.task_name, r.division_code || "", r.division_name || "",
      typeLabel, Number(r.rate).toFixed(2), r.base_limit != null ? Number(r.base_limit) : "", r.unit,
      r.active ? "Active" : "Inactive"
    ]);
  });
  sendCsv(res, `incentivize-tasks-report.csv`, out);
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
            t.id AS task_id, t.name AS task, t.task_type, t.unit,
            l.log_date AS date, l.total_output, l.rate_snapshot AS rate,
            p.share_amount AS amount
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN tasks t ON t.id = l.task_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     WHERE p.employee_id = $1 AND to_char(l.log_date, 'YYYY-MM') = $2
     ORDER BY l.log_date, t.name`,
    [employeeId, month]
  );
  // Itemized line items carry units, rate and earnings so the payslip can
  // render a full Date | Task | Units | Rate | Earnings breakdown. `date` is
  // normalized to a clean ISO string (pg returns a Date object otherwise).
  const items = rows.map((r) => ({
    date: isoDate(r.date), task: r.task, unit: r.unit,
    output: Number(r.total_output), rate: Number(r.rate),
    amount: Number(r.amount),
  }));

  // Build the task x date grid: rows = tasks, columns = every day in the month.
  // Each cell stores the number of times the task was logged (count), the total
  // units, the per-unit rate snapshot and the payout amount, so the payslip can
  // show "how many", "how much" and "at what rate". Days are keyed by 2-digit
  // day-of-month ("01".."31") to match the column keys the renderer iterates.
  const dates = monthDayKeys(month);
  const taskMap = {};
  const taskTotals = {};
  for (const r of rows) {
    const key = r.task;
    if (!taskMap[key]) { taskMap[key] = { task: r.task, unit: r.unit, days: {} }; taskTotals[key] = 0; }
    const dk = dayKey(r.date);
    if (!taskMap[key].days[dk]) taskMap[key].days[dk] = { count: 0, output: 0, rate: 0, amount: 0 };
    taskMap[key].days[dk].count += 1;
    taskMap[key].days[dk].output += Number(r.total_output);
    taskMap[key].days[dk].rate = Number(r.rate);
    taskMap[key].days[dk].amount += Number(r.amount);
    taskTotals[key] += Number(r.amount);
  }
  const taskBreakdown = Object.entries(taskTotals)
    .map(([task, total]) => ({ task, total }))
    .sort((a, b) => b.total - a.total);
  const gridRows = Object.values(taskMap).sort((a, b) => taskTotals[b.task] - taskTotals[a.task]);
  const grandTotal = items.reduce((s, it) => s + it.amount, 0);

  sendPayslipPdf(res, {
    company: "Incentivize",
    employeeCode: rows[0]?.code || String(employeeId),
    employeeName: rows[0]?.name || "Employee",
    divisionName: rows[0]?.division_name || "—",
    month, items, taskBreakdown, grandTotal, dates, gridRows,
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
    date: isoDate(r.date), task: r.task, taskType: r.task_type,
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

// GET /api/reports/analytics?from=&to=&divisionId=  (super_admin, admin)
router.get("/analytics", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const { from, to, divisionId } = req.query;
  const dateClause = [];
  const dp = [];
  if (from) { dp.push(from); dateClause.push(`l.log_date >= $${dp.length}`); }
  if (to) { dp.push(to); dateClause.push(`l.log_date <= $${dp.length}`); }
  if (divisionId) { dp.push(divisionId); dateClause.push(`l.division_id = $${dp.length}`); }
  const where = dateClause.length ? `WHERE ${dateClause.join(" AND ")}` : "";

  // For audit/edits trend the date predicate is applied to created_at.
  const editsDateClause = [];
  const edp = [];
  if (from) { edp.push(from); editsDateClause.push(`created_at >= $${edp.length}`); }
  if (to) { edp.push(to); editsDateClause.push(`created_at <= $${edp.length}`); }
  const editsWhere = editsDateClause.length ? `WHERE ${editsDateClause.join(" AND ")}` : "";

  const [
    totals, divTotals, topEarners, trend, flagged, counts,
    divisionTasks, divisionTrend, participationTrend, editsTrend, earnerSeries,
  ] = await Promise.all([
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
    // Per-division, per-task payout (drill-down on a division bar).
    pool.query(
      `SELECT l.division_id AS division_id, t.id AS task_id, t.name AS task_name, t.task_type,
              COUNT(l.id) AS log_count, COALESCE(SUM(l.amount), 0) AS total
       FROM daily_task_logs l
       JOIN tasks t ON t.id = l.task_id
       ${where}
       GROUP BY l.division_id, t.id, t.name, t.task_type
       ORDER BY l.division_id, total DESC`,
      dp
    ),
    // Daily payout per division — drives the multiline trend chart.
    pool.query(
      `SELECT l.log_date AS date, l.division_id AS division_id, COALESCE(SUM(l.amount), 0) AS total
       FROM daily_task_logs l ${where}
       GROUP BY l.log_date, l.division_id ORDER BY l.log_date`,
      dp
    ),
    // Distinct participating employees per day — participation-rate area chart.
    pool.query(
      `SELECT l.log_date AS date, COUNT(DISTINCT p.employee_id) AS participants
       FROM task_participants p
       JOIN daily_task_logs l ON l.id = p.daily_task_log_id
       ${where}
       GROUP BY l.log_date ORDER BY l.log_date`,
      dp
    ),
    // Audit edits by action per day — stacked column chart for ALL edits.
    pool.query(
      `SELECT created_at::date AS date, action,
              COUNT(*)::int AS count
       FROM audit_logs ${editsWhere}
       GROUP BY created_at::date, action
       ORDER BY date`,
      edp
    ),
    // Daily payout series for each top earner (sparklines).
    pool.query(
      `SELECT p.employee_id, l.log_date AS date, SUM(p.share_amount) AS amount
       FROM task_participants p
       JOIN daily_task_logs l ON l.id = p.daily_task_log_id
       ${where}
       GROUP BY p.employee_id, l.log_date ORDER BY p.employee_id, l.log_date`,
      dp
    ),
  ]);

  // Fold earner daily series onto the top-earner list.
  const seriesById = {};
  for (const r of earnerSeries.rows) {
    const id = r.employee_id;
    (seriesById[id] = seriesById[id] || []).push({ date: r.date, amount: Number(r.amount) });
  }

  // Group divisionTasks by division for easy drill-down.
  const divisionTasksMap = {};
  for (const r of divisionTasks.rows) {
    const did = r.division_id;
    (divisionTasksMap[did] = divisionTasksMap[did] || []).push({
      taskId: r.task_id, task: r.task_name, taskType: r.task_type,
      logCount: Number(r.log_count), total: Number(r.total),
    });
  }

  res.json({
    totalLogs: Number(totals.rows[0].log_count),
    totalPayout: Number(totals.rows[0].total_payout),
    totalOutput: Number(totals.rows[0].total_output),
    divisions: divTotals.rows.map((r) => ({ id: r.id, name: r.name, logCount: Number(r.log_count), total: Number(r.total) })),
    divisionTasks: divisionTasksMap,
    topEarners: topEarners.rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, divisionName: r.division_name,
      total: Number(r.total), series: seriesById[r.id] || [],
    })),
    dailyTrend: trend.rows.map((r) => ({ date: r.date, logCount: Number(r.log_count), total: Number(r.total) })),
    divisionTrend: divisionTrend.rows.map((r) => ({ date: r.date, divisionId: r.division_id, total: Number(r.total) })),
    participationTrend: participationTrend.rows.map((r) => ({ date: r.date, participants: Number(r.participants) })),
    editsTrend: editsTrend.rows.map((r) => ({ date: r.date, action: r.action, count: Number(r.count) })),
    flaggedEdits: flagged.rows[0].flagged_count,
    activeEmployees: counts.rows[0].active_employees,
    activeTasks: counts.rows[0].active_tasks,
    divisionCount: counts.rows[0].divisions,
  });
});

module.exports = router;
