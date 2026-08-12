const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/audit-logs?divisionId=1&flagged=true
router.get("/", requireAuth, requireRole("super_admin"), async (req, res) => {
  const { divisionId, flagged } = req.query;
  const clauses = [];
  const params = [];
  if (divisionId) { params.push(divisionId); clauses.push(`a.division_id = $${params.length}`); }
  if (flagged === "true") { clauses.push(`a.flagged = true`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT a.*, e.name AS actor_name, e.code AS actor_code
     FROM audit_logs a
     LEFT JOIN employees e ON e.id = a.actor_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT 500`,
    params
  );
  res.json(rows);
});

module.exports = router;
