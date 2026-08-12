const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../utils/audit");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, code, name, home_division_id, role, active, created_at
     FROM employees ORDER BY id`
  );
  res.json(rows);
});

// POST /api/employees  (HR, Admin, Super Admin)
router.post("/", requireAuth, requireRole("hr", "admin"), async (req, res) => {
  const { code, name, homeDivisionId, role, password } = req.body;
  if (!code || !name || !password) {
    return res.status(400).json({ error: "code, name and password are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await client.query(
      `INSERT INTO employees (code, name, home_division_id, role, password_hash)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, code, name, home_division_id, role, active, created_at`,
      [code, name, homeDivisionId || null, role || "employee", passwordHash]
    );
    const emp = rows[0];
    await writeAudit(client, {
      action: "CREATE", entity: "employees", entityId: emp.id,
      divisionId: emp.home_division_id, actorId: req.user.id,
      oldValues: null, newValues: emp, note: "Employee added via HR module",
    });
    await client.query("COMMIT");
    res.status(201).json(emp);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") return res.status(409).json({ error: "Employee code already exists" });
    console.error(err);
    res.status(500).json({ error: "Failed to create employee" });
  } finally {
    client.release();
  }
});

// PUT /api/employees/:id
router.put("/:id", requireAuth, requireRole("hr", "admin"), async (req, res) => {
  const { id } = req.params;
  const { name, homeDivisionId, role, active } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: existingRows } = await client.query("SELECT * FROM employees WHERE id=$1", [id]);
    if (!existingRows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }
    const before = existingRows[0];

    const { rows } = await client.query(
      `UPDATE employees SET
         name = COALESCE($1, name),
         home_division_id = COALESCE($2, home_division_id),
         role = COALESCE($3, role),
         active = COALESCE($4, active),
         updated_at = now()
       WHERE id = $5
       RETURNING id, code, name, home_division_id, role, active`,
      [name, homeDivisionId, role, active, id]
    );
    const after = rows[0];
    await writeAudit(client, {
      action: "UPDATE", entity: "employees", entityId: after.id,
      divisionId: after.home_division_id, actorId: req.user.id,
      oldValues: before, newValues: after, note: "Employee record updated by HR/Admin",
    });
    await client.query("COMMIT");
    res.json(after);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to update employee" });
  } finally {
    client.release();
  }
});

// DELETE /api/employees/:id
router.delete("/:id", requireAuth, requireRole("hr"), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM employees WHERE id=$1", [id]);
    if (!rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }
    await client.query("DELETE FROM employees WHERE id=$1", [id]);
    await writeAudit(client, {
      action: "DELETE", entity: "employees", entityId: Number(id),
      divisionId: rows[0].home_division_id, actorId: req.user.id,
      oldValues: rows[0], newValues: null, note: "Employee removed via HR module",
    });
    await client.query("COMMIT");
    res.status(204).end();
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to delete employee" });
  } finally {
    client.release();
  }
});

module.exports = router;
