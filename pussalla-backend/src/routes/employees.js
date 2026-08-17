const express = require("express");
const bcrypt = require("bcryptjs");
const { parse } = require("csv-parse");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../utils/audit");
const { parsePagination } = require("../utils/pagination");

const router = express.Router();

const VALID_ROLES = ["employee", "supervisor", "hr", "admin"];

// GET /api/employees?page=1&limit=50&q=&role=&divisionId=&active=
router.get("/", requireAuth, async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const { q, role, divisionId, active } = req.query;

  const clauses = [];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length})`);
  }
  if (role) { params.push(role); clauses.push(`role = $${params.length}`); }
  if (divisionId) { params.push(divisionId); clauses.push(`home_division_id = $${params.length}`); }
  if (active === "true") clauses.push(`active = true`);
  if (active === "false") clauses.push(`active = false`);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT id, code, name, home_division_id, role, active, created_at
       FROM employees ${where}
       ORDER BY id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM employees ${where}`, params),
  ]);
  res.json({ rows, page, limit, total: countRows[0].total });
});

// POST /api/employees  (HR, Admin, Super Admin)
router.post("/", requireAuth, requireRole("hr", "admin", "super_admin"), async (req, res) => {
  const { code, name, homeDivisionId, role, password } = req.body;
  if (!code || !name || !password) {
    return res.status(400).json({ error: "code, name and password are required" });
  }
  if (role && !VALID_ROLES.includes(role) && role !== "super_admin") {
    return res.status(400).json({ error: `invalid role '${role}'` });
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
      oldValues: null, newValues: emp, note: "Employee added via HR/Admin module",
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

// PUT /api/employees/:id  (HR, Admin, Super Admin)
// Accepts an optional `password` field: when provided (non-empty), the
// employee's password is reset. Only super_admin may change another user's
// password; hr/admin may edit profile fields but not set passwords here.
router.put("/:id", requireAuth, requireRole("hr", "admin", "super_admin"), async (req, res) => {
  const { id } = req.params;
  const { name, homeDivisionId, role, active, password } = req.body;
  if (role && !VALID_ROLES.includes(role) && role !== "super_admin") {
    return res.status(400).json({ error: `invalid role '${role}'` });
  }
  if (password !== undefined && password !== "" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Only super admin can reset passwords" });
  }
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

    // Reset password when a new one was supplied (super admin only).
    if (password !== undefined && password !== "") {
      const passwordHash = await bcrypt.hash(password, 10);
      await client.query("UPDATE employees SET password_hash = $1, updated_at = now() WHERE id = $2", [passwordHash, id]);
    }

    await writeAudit(client, {
      action: "UPDATE", entity: "employees", entityId: after.id,
      divisionId: after.home_division_id, actorId: req.user.id,
      oldValues: before, newValues: { ...after, passwordReset: !!(password) },
      note: password ? "Employee record + password updated by HR/Admin/Super Admin" : "Employee record updated by HR/Admin/Super Admin",
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

// PATCH /api/employees/:id/password  (Super Admin only) — reset a user's password.
router.patch("/:id/password", requireAuth, requireRole("super_admin"), async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "password is required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: existingRows } = await client.query("SELECT id, code, name FROM employees WHERE id=$1", [id]);
    if (!existingRows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }
    const passwordHash = await bcrypt.hash(password, 10);
    await client.query("UPDATE employees SET password_hash = $1, updated_at = now() WHERE id = $2", [passwordHash, id]);
    await writeAudit(client, {
      action: "UPDATE", entity: "employees", entityId: Number(id),
      divisionId: null, actorId: req.user.id,
      oldValues: null, newValues: { passwordReset: true },
      note: `Password reset for ${existingRows[0].code} by super admin`,
    });
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to reset password" });
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

// POST /api/employees/bulk  (HR, Admin) — CSV upload
// Accepts a CSV body (text/csv) or multipart file field "file".
// Columns (header row required): code,name,role,divisionId,password
// Returns { created, skipped, errors[] }.
router.post("/bulk", requireAuth, requireRole("hr", "admin"), async (req, res) => {
  let csvText = "";
  if (typeof req.body === "string") {
    csvText = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    csvText = req.body.toString("utf8");
  } else if (req.body && req.body.csv) {
    csvText = String(req.body.csv);
  } else {
    return res.status(400).json({ error: "Send a CSV body (text/csv) or { csv: \"...\" }" });
  }

  if (!csvText.trim()) return res.status(400).json({ error: "CSV body is empty" });

  // Resolve division codes/ids for validation + FK.
  const { rows: divRows } = await pool.query("SELECT id, code FROM divisions");
  const divByCode = new Map(divRows.map((d) => [String(d.code).toUpperCase(), d.id]));
  const divById = new Map(divRows.map((d) => [String(d.id), d.id]));

  const records = [];
  const errors = [];
  await new Promise((resolve, reject) => {
    parse(csvText, { columns: true, trim: true, skip_empty_lines: true })
      .on("data", (rec) => records.push(rec))
      .on("error", reject)
      .on("end", resolve);
  }).catch((err) => {
    errors.push({ row: 0, error: `CSV parse error: ${err.message}` });
  });

  const client = await pool.connect();
  const created = [];
  const skipped = [];
  try {
    await client.query("BEGIN");

    // Pre-fetch existing codes to skip duplicates without round-trips.
    const { rows: existing } = await client.query("SELECT code FROM employees");
    const existingCodes = new Set(existing.map((e) => e.code));

    let lineNo = 1; // header consumed; first data row is line 2 conceptually
    for (const rec of records) {
      lineNo += 1;
      const code = (rec.code || "").trim();
      const name = (rec.name || "").trim();
      const role = (rec.role || "employee").trim().toLowerCase();
      const divisionIdRaw = (rec.divisionId || rec.division_id || rec.division || "").trim();
      const password = (rec.password || "").trim();

      if (!code || !name || !password) {
        errors.push({ row: lineNo, code, error: "code, name and password are required" });
        continue;
      }
      if (!VALID_ROLES.includes(role)) {
        errors.push({ row: lineNo, code, error: `invalid role '${role}'` });
        continue;
      }
      const divisionId = divByCode.get(String(divisionIdRaw).toUpperCase()) || divById.get(String(divisionIdRaw)) || null;
      if (divisionIdRaw && !divisionId) {
        errors.push({ row: lineNo, code, error: `unknown division '${divisionIdRaw}'` });
        continue;
      }
      if (existingCodes.has(code)) {
        skipped.push({ row: lineNo, code, reason: "code already exists" });
        continue;
      }

      try {
        const passwordHash = await bcrypt.hash(password, 10);
        const { rows } = await client.query(
          `INSERT INTO employees (code, name, home_division_id, role, password_hash)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING id, code, name, home_division_id, role, active`,
          [code, name, divisionId, role, passwordHash]
        );
        existingCodes.add(code);
        created.push(rows[0]);
      } catch (err) {
        if (err.code === "23505") {
          skipped.push({ row: lineNo, code, reason: "code already exists" });
        } else {
          errors.push({ row: lineNo, code, error: err.message });
        }
      }
    }

    if (created.length) {
      await writeAudit(client, {
        action: "CREATE", entity: "employees", entityId: null,
        divisionId: null, actorId: req.user.id, oldValues: null,
        newValues: { count: created.length, codes: created.map((e) => e.code) },
        note: `Bulk import: ${created.length} created, ${skipped.length} skipped, ${errors.length} errors`,
      });
    }

    await client.query("COMMIT");
    res.status(201).json({ created: created.length, skipped, errors, createdEmployees: created });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to bulk import employees" });
  } finally {
    client.release();
  }
});

module.exports = router;