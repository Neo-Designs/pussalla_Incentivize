const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../utils/audit");
const { parsePagination } = require("../utils/pagination");

const router = express.Router();

// GET /api/tasks?divisionId=1&page=1&limit=50&active=true
router.get("/", requireAuth, async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const { divisionId, active } = req.query;
  const clauses = [];
  const params = [];
  if (divisionId) { params.push(divisionId); clauses.push(`division_id = $${params.length}`); }
  if (active === "true" || active === undefined) clauses.push(`active = true`);
  if (active === "false") clauses.push(`active = false`);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT * FROM tasks ${where} ORDER BY id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM tasks ${where}`, params),
  ]);
  res.json({ rows, page, limit, total: countRows[0].total });
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const { divisionId, name, taskType, rate, baseLimit, unit } = req.body;
  if (!divisionId || !name || !taskType || rate == null || !unit) {
    return res.status(400).json({ error: "divisionId, name, taskType, rate and unit are required" });
  }
  if (Number(taskType) === 3 && baseLimit == null) {
    return res.status(400).json({ error: "baseLimit is required for Type 3 tasks" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO tasks (division_id, name, task_type, rate, base_limit, unit)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [divisionId, name, taskType, rate, taskType == 3 ? baseLimit : null, unit]
    );
    const task = rows[0];
    await writeAudit(client, {
      action: "CREATE", entity: "tasks", entityId: task.id, divisionId: task.division_id,
      actorId: req.user.id, oldValues: null, newValues: task, note: "New task created by Admin",
    });
    await client.query("COMMIT");
    res.status(201).json(task);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to create task" });
  } finally {
    client.release();
  }
});

router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { name, taskType, rate, baseLimit, unit } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: before } = await client.query("SELECT * FROM tasks WHERE id=$1", [id]);
    if (!before[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }

    const { rows } = await client.query(
      `UPDATE tasks SET
         name = COALESCE($1, name),
         task_type = COALESCE($2, task_type),
         rate = COALESCE($3, rate),
         base_limit = $4,
         unit = COALESCE($5, unit),
         updated_at = now()
       WHERE id = $6 RETURNING *`,
      [name, taskType, rate, baseLimit ?? before[0].base_limit, unit, id]
    );
    const after = rows[0];
    await writeAudit(client, {
      action: "UPDATE", entity: "tasks", entityId: after.id, divisionId: after.division_id,
      actorId: req.user.id, oldValues: before[0], newValues: after,
      note: "Task rate/definition adjusted by Admin",
    });
    await client.query("COMMIT");
    res.json(after);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to update task" });
  } finally {
    client.release();
  }
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM tasks WHERE id=$1", [id]);
    if (!rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }
    await client.query("UPDATE tasks SET active=false WHERE id=$1", [id]);
    await writeAudit(client, {
      action: "DELETE", entity: "tasks", entityId: Number(id), divisionId: rows[0].division_id,
      actorId: req.user.id, oldValues: rows[0], newValues: null, note: "Task deactivated by Admin",
    });
    await client.query("COMMIT");
    res.status(204).end();
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to delete task" });
  } finally {
    client.release();
  }
});

module.exports = router;
