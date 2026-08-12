const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/login  { code, password }
router.post("/login", async (req, res) => {
  const { code, password } = req.body;
  if (!code || !password) return res.status(400).json({ error: "code and password are required" });

  const { rows } = await pool.query(
    `SELECT id, code, name, role, home_division_id, password_hash, active
     FROM employees WHERE code = $1`,
    [code]
  );
  const user = rows[0];
  if (!user || !user.active) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const payload = {
    id: user.id,
    code: user.code,
    name: user.name,
    role: user.role,
    homeDivisionId: user.home_division_id,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });

  res.json({ token, user: payload });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
