const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../utils/audit");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const { date, effectiveOn, toDivisionId } = req.query;
  const clauses = [];
  const params = [];
  if (date) { params.push(date); clauses.push(`assignment_date = $${params.length}`); }
  // effectiveOn: a cross-assignment is active "as of" this date — i.e. the
  // assignment_date is on or before it. Lets the daily-log modal ask "who is
  // rostered into division X as of today?" without an exact-date match.
  if (effectiveOn) { params.push(effectiveOn); clauses.push(`assignment_date <= $${params.length}`); }
  if (toDivisionId) { params.push(toDivisionId); clauses.push(`to_division_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM cross_assignments ${where} ORDER BY assignment_date DESC, id DESC`, params
  );
  res.json(rows);
});

router.post("/", requireAuth, requireRole("hr"), async (req, res) => {
  const { employeeId, toDivisionId, assignmentDate, shift, note } = req.body;
  if (!employeeId || !toDivisionId || !assignmentDate || !shift) {
    return res.status(400).json({ error: "employeeId, toDivisionId, assignmentDate and shift are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: empRows } = await client.query("SELECT home_division_id FROM employees WHERE id=$1", [employeeId]);
    if (!empRows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Employee not found" }); }

    const { rows } = await client.query(
      `INSERT INTO cross_assignments (employee_id, from_division_id, to_division_id, assignment_date, shift, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [employeeId, empRows[0].home_division_id, toDivisionId, assignmentDate, shift, note || null, req.user.id]
    );
    const rec = rows[0];
    await writeAudit(client, {
      action: "CREATE", entity: "cross_assignments", entityId: rec.id, divisionId: rec.to_division_id,
      actorId: req.user.id, oldValues: null, newValues: rec, note: "Temporary reassignment created by HR",
    });
    await client.query("COMMIT");
    res.status(201).json(rec);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to create cross-assignment" });
  } finally {
    client.release();
  }
});

module.exports = router;
