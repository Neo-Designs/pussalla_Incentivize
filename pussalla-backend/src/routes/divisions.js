const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../utils/audit");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM divisions ORDER BY id");
  res.json(rows);
});

// POST /api/divisions (admin and super_admin only)
router.post("/", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  let { code, name, description } = req.body;
  if (!name) return res.status(400).json({ error: "Division name is required" });

  if (!code) {
    const clean = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4);
    code = clean || "DIV";
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let finalCode = code;
    let counter = 1;
    while (true) {
      const { rows: existing } = await client.query("SELECT id FROM divisions WHERE code = $1", [finalCode]);
      if (!existing.length) break;
      finalCode = `${code.slice(0, 7)}${counter}`;
      counter++;
    }

    const { rows } = await client.query(
      `INSERT INTO divisions (code, name, description) VALUES ($1, $2, $3) RETURNING *`,
      [finalCode, name, description || null]
    );
    const div = rows[0];

    await writeAudit(client, {
      action: "CREATE", entity: "divisions", entityId: div.id, divisionId: div.id,
      actorId: req.user.id, oldValues: null, newValues: div, note: "New division created",
    });

    await client.query("COMMIT");
    res.status(201).json(div);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating division:", err);
    res.status(500).json({ error: "Failed to create division" });
  } finally {
    client.release();
  }
});

module.exports = router;
