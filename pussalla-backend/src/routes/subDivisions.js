const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../utils/audit");

const router = express.Router();

// GET /api/sub-divisions?divisionId=1
router.get("/", requireAuth, async (req, res) => {
  const { divisionId } = req.query;
  const clauses = [];
  const params = [];
  if (divisionId) { params.push(divisionId); clauses.push(`division_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM sub_divisions ${where} ORDER BY name`, params);
  res.json(rows);
});

// POST /api/sub-divisions  (HR, Admin, Super Admin)
router.post("/", requireAuth, requireRole("hr", "admin", "super_admin"), async (req, res) => {
  const { divisionId, code, name } = req.body;
  if (!divisionId || !code || !name) {
    return res.status(400).json({ error: "divisionId, code and name are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO sub_divisions (division_id, code, name) VALUES ($1,$2,$3) RETURNING *`,
      [divisionId, code, name]
    );
    const sub = rows[0];
    await writeAudit(client, {
      action: "CREATE", entity: "sub_divisions", entityId: sub.id, divisionId: sub.division_id,
      actorId: req.user.id, oldValues: null, newValues: sub, note: "Sub-division added",
    });
    await client.query("COMMIT");
    res.status(201).json(sub);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") return res.status(409).json({ error: "A sub-division with this code already exists in that division" });
    console.error(err);
    res.status(500).json({ error: "Failed to create sub-division" });
  } finally {
    client.release();
  }
});

// PUT /api/sub-divisions/:id  (HR, Admin, Super Admin)
router.put("/:id", requireAuth, requireRole("hr", "admin", "super_admin"), async (req, res) => {
  const { id } = req.params;
  const { name, code } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: before } = await client.query("SELECT * FROM sub_divisions WHERE id=$1", [id]);
    if (!before[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }
    const { rows } = await client.query(
      `UPDATE sub_divisions SET name = COALESCE($1, name), code = COALESCE($2, code) WHERE id = $3 RETURNING *`,
      [name, code, id]
    );
    const after = rows[0];
    await writeAudit(client, {
      action: "UPDATE", entity: "sub_divisions", entityId: after.id, divisionId: after.division_id,
      actorId: req.user.id, oldValues: before[0], newValues: after, note: "Sub-division updated",
    });
    await client.query("COMMIT");
    res.json(after);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") return res.status(409).json({ error: "A sub-division with this code already exists in that division" });
    console.error(err);
    res.status(500).json({ error: "Failed to update sub-division" });
  } finally {
    client.release();
  }
});

// DELETE /api/sub-divisions/:id  (HR, Admin, Super Admin)
// Employees/tasks/logs referencing it fall back to no sub-division (ON DELETE SET NULL).
router.delete("/:id", requireAuth, requireRole("hr", "admin", "super_admin"), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM sub_divisions WHERE id=$1", [id]);
    if (!rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }
    await client.query("DELETE FROM sub_divisions WHERE id=$1", [id]);
    await writeAudit(client, {
      action: "DELETE", entity: "sub_divisions", entityId: Number(id), divisionId: rows[0].division_id,
      actorId: req.user.id, oldValues: rows[0], newValues: null, note: "Sub-division removed",
    });
    await client.query("COMMIT");
    res.status(204).end();
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to delete sub-division" });
  } finally {
    client.release();
  }
});

module.exports = router;
