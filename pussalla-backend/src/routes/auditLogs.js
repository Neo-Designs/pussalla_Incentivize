const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { parsePagination } = require("../utils/pagination");

const router = express.Router();

// GET /api/audit-logs?divisionId=1&flagged=true&page=1&limit=50
router.get("/", requireAuth, requireRole("super_admin"), async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const { divisionId, flagged } = req.query;
  const clauses = [];
  const params = [];
  if (divisionId) { params.push(divisionId); clauses.push(`a.division_id = $${params.length}`); }
  if (flagged === "true") { clauses.push(`a.flagged = true`); }
  if (flagged === "false") { clauses.push(`a.flagged = false`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT a.*, e.name AS actor_name, e.code AS actor_code
       FROM audit_logs a
       LEFT JOIN employees e ON e.id = a.actor_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs a ${where}`, params),
  ]);
  res.json({ rows, page, limit, total: countRows[0].total });
});

module.exports = router;
