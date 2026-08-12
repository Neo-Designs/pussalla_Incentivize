const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/reports/daily?date=2026-08-06
router.get("/daily", requireAuth, requireRole("admin", "super_admin", "hr"), async (req, res) => {
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

// GET /api/reports/monthly?month=2026-08
router.get("/monthly", requireAuth, requireRole("admin", "super_admin", "hr"), async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: "month query param is required (YYYY-MM)" });

  const { rows } = await pool.query(
    `SELECT e.id AS employee_id, e.code, e.name, d.name AS division_name,
            l.log_date, t.name AS task_name, p.share_amount
     FROM task_participants p
     JOIN daily_task_logs l ON l.id = p.daily_task_log_id
     JOIN tasks t ON t.id = l.task_id
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN divisions d ON d.id = e.home_division_id
     WHERE to_char(l.log_date, 'YYYY-MM') = $1
     ORDER BY e.id, l.log_date`,
    [month]
  );

  const byEmployee = {};
  for (const r of rows) {
    if (!byEmployee[r.employee_id]) {
      byEmployee[r.employee_id] = {
        employeeId: r.employee_id, code: r.code, name: r.name,
        divisionName: r.division_name, items: [], total: 0,
      };
    }
    byEmployee[r.employee_id].items.push({ date: r.log_date, task: r.task_name, amount: Number(r.share_amount) });
    byEmployee[r.employee_id].total += Number(r.share_amount);
  }
  const result = Object.values(byEmployee).sort((a, b) => b.total - a.total);
  res.json({ month, employees: result, grandTotal: result.reduce((s, e) => s + e.total, 0) });
});

module.exports = router;
