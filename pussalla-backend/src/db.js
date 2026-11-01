const fs = require("fs");
const path = require("path");
const { Pool, types } = require("pg");

// Return DATE columns as plain "YYYY-MM-DD" strings. Without this, node-pg
// builds a JS Date at *local* midnight, so on a server/PC in Sri Lanka time
// (UTC+5:30) a 1 Sep log serialises as 31 Aug and lands on the wrong day.
types.setTypeParser(1082, (v) => v);
require("dotenv").config();

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
      }
);

pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
});

async function ensureSchema() {
  try {
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS code VARCHAR(50) UNIQUE;`);
    // Sub-divisions + Type 4 tasks (idempotent; see migrations/002_subdivisions_fixed_rate.sql)
    const migration002 = fs.readFileSync(path.join(__dirname, "migrations", "002_subdivisions_fixed_rate.sql"), "utf8");
    await pool.query(migration002);
    const { rows: nullTasks } = await pool.query(
      `SELECT id FROM tasks WHERE code IS NULL OR code = '' ORDER BY id`
    );
    for (const t of nullTasks) {
      const taskCode = `TSK-${String(t.id).padStart(3, "0")}`;
      await pool.query(`UPDATE tasks SET code = $1 WHERE id = $2`, [taskCode, t.id]);
    }
  } catch (err) {
    console.error("Schema initialization check error:", err.message);
  }
}

ensureSchema();

module.exports = { pool, ensureSchema };
